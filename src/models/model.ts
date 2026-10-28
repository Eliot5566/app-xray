import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ZipFile } from "../android/zip.js";
import { XRAY_SCHEMA, type Endpoint, type ModelFile, type XrayReport } from "../core/schema.js";
import { collectUrls } from "../core/urls.js";
import { FILE_TYPES, readGguf, type GgufValue } from "./gguf.js";
import { classifyImport, scanPickle } from "./pickle.js";
import { FileCursor } from "./reader.js";

// Model weights: GGUF, safetensors, and pickle-based PyTorch/NumPy/scikit-learn files. Headers are
// read; weights are not. Pickles are walked opcode by opcode, never unpickled.

const PICKLE_EXT = /\.(?:pt|pth|bin|ckpt|pkl|pickle|joblib)$/i;
const MODEL_EXT = /\.(?:gguf|safetensors|pt|pth|bin|ckpt|pkl|pickle|joblib)$/i;
const MAX_PICKLE = 64 * 1024 * 1024;

export function isModelFile(file: string): boolean {
  return MODEL_EXT.test(file);
}

/** Model files directly inside a folder (a Hugging Face snapshot, say). */
export async function modelFilesIn(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  if (names.includes("package.json") || names.some((n) => n.endsWith(".asar"))) return [];
  return names.filter((n) => isModelFile(n)).sort().map((n) => path.join(dir, n));
}

export async function analyzeModels(input: string, files: string[], opts: { toolVersion: string; now?: Date }): Promise<XrayReport> {
  const results: ModelFile[] = [];
  const endpoints = new Map<string, Endpoint>();
  const base = (await stat(input)).isDirectory() ? input : path.dirname(input);
  for (const file of files) {
    const rel = path.relative(base, file) || path.basename(file);
    const model = await readModel(file, rel);
    if (model.chatTemplate) collectUrls(model.chatTemplate, endpoints, "chat-template", rel);
    results.push(model);
  }

  const main = results.find((m) => m.format === "gguf" || m.format === "safetensors") ?? results[0];
  return {
    schema: XRAY_SCHEMA,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    target: {
      inputPath: input,
      format: files.length === 1 ? (main?.format ?? "model") : "model-folder",
      sha256: null,
      name: path.basename(input).replace(MODEL_EXT, ""),
      version: null,
    },
    engine: { name: "app-xray", version: opts.toolVersion, operation: "inspect_model", evidenceId: null },
    frameworks: [],
    modules: [],
    endpoints: [...endpoints.values()],
    browserWindows: [],
    preloads: [],
    remotePages: [],
    ipcChannels: [],
    ipc: { mainHandlers: 0, senderValidations: 0, dynamicChannelOperations: 0 },
    storage: [],
    nativeAddonBindings: 0,
    model: { files: results },
    fuses: null,
    findings: [],
    limitations: [
      "Only file headers were read and pickles were walked without being loaded; the model was not run, so its behavior and outputs are not assessed.",
      ...(results.some((m) => m.format === "pytorch" || m.format === "pickle")
        ? ["Pickle imports are listed as the file declares them. A pickle can also hide behavior in custom classes from the listed modules, which this report cannot see."]
        : []),
    ],
  };
}

async function readModel(file: string, rel: string): Promise<ModelFile> {
  const { size } = await stat(file);
  const model: ModelFile = {
    path: rel,
    format: "unknown",
    bytes: size,
    parameters: null,
    tensors: null,
    architecture: null,
    quantization: null,
    contextLength: null,
    license: null,
    chatTemplate: null,
    imports: [],
    error: null,
  };
  const magic = Buffer.alloc(8);
  const handle = await open(file, "r");
  try {
    await handle.read(magic, 0, 8, 0);
  } finally {
    await handle.close();
  }
  try {
    if (magic.toString("latin1", 0, 4) === "GGUF") await readGgufModel(file, model);
    else if (magic.toString("latin1", 0, 2) === "PK") await readTorchZip(file, model);
    else if (/\.safetensors$/i.test(file)) await readSafetensors(file, model);
    else if (PICKLE_EXT.test(file) || magic[0] === 0x80) await readRawPickle(file, model);
  } catch (err) {
    model.error = err instanceof Error ? err.message : String(err);
  }
  return model;
}

async function readGgufModel(file: string, model: ModelFile): Promise<void> {
  model.format = "gguf";
  const info = await readGguf(file);
  const meta = info.metadata;
  const s = (v: GgufValue | undefined) => (typeof v === "string" && v ? v : null);
  const n = (v: GgufValue | undefined) => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null);
  model.architecture = s(meta["general.architecture"]);
  model.tensors = info.tensors;
  model.parameters = info.parameters;
  const ft = n(meta["general.file_type"]);
  model.quantization = ft === null ? null : (FILE_TYPES[ft] ?? `type ${ft}`);
  model.contextLength = model.architecture ? n(meta[`${model.architecture}.context_length`]) : null;
  model.license = s(meta["general.license"]);
  model.chatTemplate = s(meta["tokenizer.chat_template"]);
  const name = s(meta["general.name"]);
  if (name) model.path = `${model.path} (${name})`;
}

async function readSafetensors(file: string, model: ModelFile): Promise<void> {
  model.format = "safetensors";
  const c = await FileCursor.open(file);
  try {
    const len = await c.u64();
    if (len > 100 * 1024 * 1024) throw new Error(`safetensors header claims ${len} bytes`);
    const header = JSON.parse((await c.bytes(len)).toString("utf8")) as Record<string, { dtype?: string; shape?: number[] } | Record<string, string>>;
    const meta = (header["__metadata__"] ?? {}) as Record<string, string>;
    let params = 0;
    let tensors = 0;
    const dtypes = new Set<string>();
    for (const [key, t] of Object.entries(header)) {
      if (key === "__metadata__") continue;
      const tensor = t as { dtype?: string; shape?: number[] };
      tensors++;
      if (tensor.dtype) dtypes.add(tensor.dtype);
      params += (tensor.shape ?? []).reduce((a, b) => a * b, 1);
    }
    model.tensors = tensors;
    model.parameters = params;
    model.quantization = [...dtypes].sort().join(", ") || null;
    model.license = meta["license"] ?? null;
  } finally {
    await c.close();
  }
}

async function readTorchZip(file: string, model: ModelFile): Promise<void> {
  model.format = "pytorch";
  const zip = await ZipFile.open(file);
  try {
    const pickles = zip.entries.filter((e) => e.name.endsWith(".pkl"));
    if (pickles.length === 0) throw new Error("zip archive without a .pkl entry");
    for (const entry of pickles) {
      if (entry.size > MAX_PICKLE) throw new Error(`${entry.name} is larger than ${MAX_PICKLE} bytes`);
      addScan(model, scanPickle(await zip.read(entry)), entry.name);
    }
  } finally {
    await zip.close();
  }
}

async function readRawPickle(file: string, model: ModelFile): Promise<void> {
  model.format = "pickle";
  const c = await FileCursor.open(file, MAX_PICKLE);
  try {
    // Legacy torch files are a few small pickles followed by raw tensor bytes.
    const buf = await c.bytes(Math.min(c.size, MAX_PICKLE));
    addScan(model, scanPickle(buf), null);
  } finally {
    await c.close();
  }
}

function addScan(model: ModelFile, scan: ReturnType<typeof scanPickle>, where: string | null): void {
  for (const name of scan.imports) {
    if (!model.imports.some((i) => i.name === name)) model.imports.push({ name, risk: classifyImport(name) });
  }
  if (scan.error && scan.pickles <= 1) model.error = `${where ? `${where}: ` : ""}${scan.error}`;
}

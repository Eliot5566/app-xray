import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { runRea } from "../core/rea.js";
import { XRAY_SCHEMA, type Dependency, type Endpoint, type Framework, type XrayReport } from "../core/schema.js";
import { collectUrls } from "../core/urls.js";

// Native executables: Go binaries carry their module list and build settings, and Rust binaries
// built with cargo-auditable carry their crate list. REA reads both; app-xray adds the literal
// URLs from the binary's bytes.

export type BinaryFormat = "elf" | "pe" | "macho";

const MAX_BYTES = 256 * 1024 * 1024;

/** Recognizes ELF, PE and thin Mach-O executables by their magic bytes. */
export async function binaryFormat(file: string): Promise<BinaryFormat | null> {
  const handle = await open(file, "r");
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    if (bytesRead < 4) return null;
    if (head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return "elf";
    if (head[0] === 0x4d && head[1] === 0x5a) return "pe";
    const magic = head.readUInt32BE(0);
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) return "macho";
    return null;
  } finally {
    await handle.close();
  }
}

interface GoEvidence {
  evidence_id?: string;
  limitations?: string[];
  normalized_result?: {
    format?: string;
    architecture?: string;
    build_info?: {
      go_version?: string;
      module?: {
        path?: string;
        main?: { path?: string; version?: string };
        dependencies?: Array<{ path?: string; version?: string; replacement?: { path?: string; version?: string } | null }>;
        settings?: Array<{ key?: string; value?: string }>;
      };
    } | null;
  };
}

interface RustEvidence {
  evidence_id?: string;
  limitations?: string[];
  normalized_result?: {
    format?: string;
    architecture?: string;
    auditable_metadata?: {
      packages?: Array<{ name?: string; version?: string; source?: string; kind?: string | null; root?: boolean }>;
    } | null;
  };
}

export interface BinaryInput {
  file: string;
  sha256: string;
  reaVersion: string;
  go: unknown;
  rust: unknown;
  endpoints: Endpoint[];
  now?: Date;
}

/** Builds a report from REA's Go and Rust evidence; pure, so tests can feed saved evidence. */
export function binaryReport(input: BinaryInput): XrayReport {
  const go = input.go as GoEvidence | null;
  const rust = input.rust as RustEvidence | null;
  const buildInfo = go?.normalized_result?.build_info ?? null;
  const crates = rust?.normalized_result?.auditable_metadata?.packages ?? null;
  const language = buildInfo ? "go" : crates ? "rust" : null;
  const used = language === "go" ? go : language === "rust" ? rust : (go ?? rust);

  const frameworks: Framework[] = [];
  const dependencies: Dependency[] = [];
  const buildSettings: Record<string, string> = {};
  let name: string | null = null;
  let version: string | null = null;

  if (buildInfo) {
    const mod = buildInfo.module;
    frameworks.push({
      kind: "go",
      version: buildInfo.go_version?.replace(/^go/, "") ?? null,
      versionSource: buildInfo.go_version ? "Go build info" : null,
    });
    name = mod?.path ? goCommandName(mod.path) : null;
    version = mod?.main?.version && mod.main.version !== "(devel)" ? mod.main.version : null;
    for (const dep of mod?.dependencies ?? []) {
      if (!dep.path) continue;
      const r = dep.replacement;
      dependencies.push({
        ecosystem: "go",
        name: dep.path,
        version: r?.version || dep.version || null,
        replacedBy: r?.path ? `${r.path}${r.version ? `@${r.version}` : ""}` : null,
      });
    }
    for (const s of mod?.settings ?? []) if (s.key) buildSettings[s.key] = s.value ?? "";
  } else if (crates) {
    frameworks.push({ kind: "rust", version: null, versionSource: null });
    const root = crates.find((c) => c.root);
    name = root?.name ?? null;
    version = root?.version ?? null;
    for (const c of crates) {
      if (c.root || !c.name || c.kind === "build") continue;
      dependencies.push({ ecosystem: "cargo", name: c.name, version: c.version ?? null, replacedBy: null });
    }
  }
  dependencies.sort((a, b) => a.name.localeCompare(b.name));

  const nr = used?.normalized_result;
  return {
    schema: XRAY_SCHEMA,
    generatedAt: (input.now ?? new Date()).toISOString(),
    target: {
      inputPath: input.file,
      format: nr?.format ?? "binary",
      sha256: input.sha256,
      name: name ?? path.basename(input.file),
      version,
    },
    engine: {
      name: "rea-agents",
      version: input.reaVersion,
      operation: language === "rust" ? "inspect_rust_binary" : "inspect_go_binary",
      evidenceId: used?.evidence_id ?? null,
    },
    frameworks,
    modules: [],
    endpoints: input.endpoints,
    browserWindows: [],
    preloads: [],
    remotePages: [],
    ipcChannels: [],
    ipc: { mainHandlers: 0, senderValidations: 0, dynamicChannelOperations: 0 },
    storage: [],
    nativeAddonBindings: 0,
    native: { format: nr?.format ?? "unknown", architecture: nr?.architecture ?? null, language, buildSettings },
    dependencies,
    fuses: null,
    findings: [],
    limitations: [
      ...(language === null
        ? [
            "No Go build information or cargo-auditable dependency list was found, so the libraries inside this binary are unknown. Only literal addresses were read.",
          ]
        : []),
      "Addresses are literal strings in the binary's bytes; code was not disassembled, so how (or whether) they are used is not shown.",
      ...new Set(used?.limitations ?? []),
    ],
  };
}

/** github.com/cli/cli/v2/cmd/gh → gh; example.com/tool/v3 → tool */
function goCommandName(modulePath: string): string {
  const parts = modulePath.split("/").filter((p) => !/^v\d+$/.test(p));
  return parts.at(-1) ?? modulePath;
}

export async function analyzeBinary(file: string, reaVersion: string): Promise<XrayReport> {
  const bytes = await readFile(file);
  if (bytes.length > MAX_BYTES) throw new Error(`${file} is larger than ${MAX_BYTES} bytes`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const endpoints = new Map<string, Endpoint>();
  collectUrls(bytes.toString("latin1"), endpoints, "binary-string", path.basename(file));

  const go = await runRea(["inspect-go-binary", file]);
  const hasGo = Boolean((go as GoEvidence).normalized_result?.build_info);
  const rust = hasGo ? null : await runRea(["inspect-rust-binary", file]).catch(() => null);
  return binaryReport({
    file,
    sha256,
    reaVersion,
    go,
    rust,
    endpoints: [...endpoints.values()].sort((a, b) => a.url.localeCompare(b.url)),
  });
}

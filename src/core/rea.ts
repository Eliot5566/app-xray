import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { listSourceFiles, mergeEvidence, planBatches, runLimited } from "./batches.js";
import type { FuseState } from "./schema.js";

const require = createRequire(import.meta.url);

/** The REA version this release of app-xray is tested against. */
export const PINNED_REA_VERSION = "6.7.0";

function reaEntrypoint(): string {
  const pkgPath = require.resolve("rea-agents/package.json");
  return path.join(path.dirname(pkgPath), "scripts", "rea.mjs");
}

export async function installedReaVersion(): Promise<string> {
  const pkgPath = require.resolve("rea-agents/package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export class ReaError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
  }
}

/**
 * Runs one REA CLI command with --json and returns the parsed Evidence record.
 * REA writes progress lines to stderr and the result to stdout.
 */
export async function runRea(args: string[], onProgress?: (message: string) => void): Promise<unknown> {
  const child = spawn(process.execPath, [reaEntrypoint(), ...args, "--json"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout: Buffer[] = [];
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stderr += text;
    if (onProgress) {
      for (const line of text.split("\n")) {
        const message = progressMessage(line);
        if (message) onProgress(message);
      }
    }
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new ReaError(failureMessage(args[0]!, exitCode, Buffer.concat(stdout).toString("utf8")), exitCode, stderr);
  }
  try {
    return JSON.parse(Buffer.concat(stdout).toString("utf8"));
  } catch {
    throw new ReaError(`rea ${args[0]} did not return JSON`, exitCode, stderr);
  }
}

// On failure REA still prints one JSON object on stdout, with a message and usually a remediation.
export function failureMessage(command: string, exitCode: number | null, stdout: string): string {
  try {
    const err = JSON.parse(stdout) as {
      message?: string;
      remediation?: { action?: string };
      details?: { issues?: Array<{ message?: string }> };
    };
    const detail = err.details?.issues?.map((i) => i.message).filter(Boolean).join("; ");
    const parts = [...new Set([detail || err.message, err.remediation?.action].filter(Boolean))];
    if (parts.length) return `rea ${command} failed: ${parts.join(" ")}`;
  } catch {
    // Not JSON: fall through to the exit code.
  }
  return `rea ${command} exited with code ${exitCode}`;
}

function progressMessage(line: string): string | null {
  if (!line.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(line) as { rea_progress?: { message?: string } };
    return parsed.rea_progress?.message ?? null;
  } catch {
    return null;
  }
}

// app-xray reads REA's application graph, not its per-function semantic graph. Left at REA's
// defaults, the semantic graph can use up the result budget and push application facts out
// (Joplin desktop: 1 endpoint instead of 11, 63 s instead of 45 s), so keep it minimal.
// REA rejects 0 for these limits.
const APPLICATION_GRAPH_ONLY = [
  "--max-semantic-nodes", "1",
  "--max-semantic-unknowns", "1",
];

export async function analyzeJavaScriptApplication(appPath: string, onProgress?: (message: string) => void) {
  const root = path.resolve(appPath);
  const isDir = await stat(root).then((s) => s.isDirectory(), () => false);
  const batches = isDir ? planBatches(await listSourceFiles(root)) : [];
  if (batches.length <= 1) {
    return runRea(["analyze-javascript-application", root, ...APPLICATION_GRAPH_ONLY], onProgress);
  }
  onProgress?.(`analyzing ${batches.reduce((n, b) => n + b.length, 0)} files in ${batches.length} parallel batches`);
  let done = 0;
  const parts = await runLimited(
    batches.map((batch) => async () => {
      // package.json in every batch: it names the app and declares its Electron entry points.
      const selection = existsSync(path.join(root, "package.json")) ? ["package.json", ...batch] : batch;
      const args = selection.flatMap((f) => ["--source-path", f]);
      const ev = await runRea(["analyze-javascript-application", root, ...APPLICATION_GRAPH_ONLY, ...args]);
      onProgress?.(`batch ${++done}/${batches.length} done`);
      return ev;
    }),
    os.availableParallelism(),
  );
  return mergeEvidence(parts);
}

interface FuseEvidence {
  normalized_result?: {
    slices?: Array<{ sentinels?: Array<{ fuses?: Array<{ name?: string; state?: string }> }> }>;
  };
}

/** Reads the fuse wire of one Electron executable. Universal binaries report per slice; the first wins. */
export async function inspectElectronFuses(executable: string): Promise<FuseState[] | null> {
  const ev = (await runRea(["inspect-electron-fuses", path.resolve(executable)])) as FuseEvidence;
  const fuses = ev.normalized_result?.slices?.[0]?.sentinels?.[0]?.fuses;
  if (!fuses) return null;
  return fuses.flatMap((f) => (f.name && f.state ? [{ name: f.name, state: f.state }] : []));
}

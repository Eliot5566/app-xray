import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
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
    throw new ReaError(`rea ${args[0]} exited with code ${exitCode}`, exitCode, stderr);
  }
  try {
    return JSON.parse(Buffer.concat(stdout).toString("utf8"));
  } catch {
    throw new ReaError(`rea ${args[0]} did not return JSON`, exitCode, stderr);
  }
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

export function analyzeJavaScriptApplication(appPath: string, onProgress?: (message: string) => void) {
  return runRea(["analyze-javascript-application", path.resolve(appPath), ...APPLICATION_GRAPH_ONLY], onProgress);
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

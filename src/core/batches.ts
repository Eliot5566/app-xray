import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Large apps are analyzed as several REA runs over disjoint file sets, in parallel. Most facts
// app-xray reads are per file (addresses, modules, windows, IPC calls, storage), so the union is
// the same picture, faster. One run over Signal Desktop's 2,129 files also hit REA's result budget
// and kept 187 unique addresses; four batches kept 418, in 80 s instead of 144 s.

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|[cm]ts|html?)$/i;
export const BATCH_MIN_FILES = 400;
// Windows caps a command line at 32,767 characters; leave room for REA's own arguments. Elsewhere
// the limit is megabytes. Batches past the cap run in further waves, which costs time.
const MAX_ARG_CHARS = process.platform === "win32" ? 24_000 : 1_000_000;

export async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && SOURCE_FILE.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

/** Splits files round-robin so each batch gets a mix of large and small directories. */
export function planBatches(
  files: string[],
  parallelism = os.availableParallelism(),
  maxArgChars = MAX_ARG_CHARS,
): string[][] {
  if (files.length < BATCH_MIN_FILES) return [files];
  // Each REA run inventories the whole tree again, so more batches than cores only adds that
  // overhead (Signal: 4 batches 80 s, 8 batches 100 s on 4 cores).
  let count = Math.max(2, parallelism);
  for (;;) {
    const batches = Array.from({ length: count }, () => [] as string[]);
    files.forEach((f, i) => batches[i % count]!.push(f));
    const longest = Math.max(...batches.map((b) => b.reduce((n, f) => n + f.length + 16, 0)));
    if (longest <= maxArgChars || count >= files.length) return batches;
    count *= 2;
  }
}

/** Runs tasks with at most `limit` in flight, keeping result order. */
export async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

interface Evidence {
  evidence_id?: string;
  limitations?: string[];
  normalized_result?: {
    graph?: { nodes?: Array<{ node_id?: string }> };
    summary?: Record<string, unknown>;
    limitations?: string[];
  };
}

/** Combines batch results into one Evidence-shaped record that normalize() can read. */
export function mergeEvidence(parts: unknown[]): unknown {
  const evs = parts as Evidence[];
  const [first] = evs;
  if (!first || evs.length === 1) return first;
  const nodes = new Map<string, unknown>();
  for (const ev of evs) {
    for (const node of ev.normalized_result?.graph?.nodes ?? []) {
      const id = node.node_id ?? `anon-${nodes.size}`;
      if (!nodes.has(id)) nodes.set(id, node);
    }
  }
  return {
    ...first,
    evidence_id: first.evidence_id,
    batch_evidence_ids: evs.map((e) => e.evidence_id ?? null),
    limitations: [...new Set(evs.flatMap((e) => e.limitations ?? []))],
    normalized_result: {
      ...first.normalized_result,
      graph: { ...first.normalized_result?.graph, nodes: [...nodes.values()] },
      summary: sumSummaries(evs.map((e) => e.normalized_result?.summary ?? {})),
      limitations: [
        `Analyzed in ${evs.length} parallel batches of files. Relationships that cross batches, such as pairing an IPC send with its handler, may be incomplete.`,
        ...new Set(evs.flatMap((e) => e.normalized_result?.limitations ?? [])),
      ],
    },
  };
}

function sumSummaries(summaries: Array<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of summaries) {
    for (const [key, value] of Object.entries(s)) {
      if (typeof value === "number") out[key] = ((out[key] as number) ?? 0) + value;
      else if (value && typeof value === "object") {
        out[key] = sumSummaries([(out[key] as Record<string, unknown>) ?? {}, value as Record<string, unknown>]);
      }
    }
  }
  return out;
}

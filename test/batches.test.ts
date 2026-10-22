import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BATCH_MIN_FILES, listSourceFiles, mergeEvidence, planBatches, runLimited } from "../src/core/batches.js";

const files = (n: number) => Array.from({ length: n }, (_, i) => `src/dir${i % 7}/file${i}.ts`);

describe("planBatches", () => {
  it("keeps small apps in one run", () => {
    expect(planBatches(files(BATCH_MIN_FILES - 1), 8)).toHaveLength(1);
  });

  it("splits one batch per core, at least two, covering every file once", () => {
    const input = files(1000);
    const batches = planBatches(input, 4);
    expect(batches).toHaveLength(4);
    expect(batches.flat().sort()).toEqual([...input].sort());
    expect(planBatches(input, 1)).toHaveLength(2);
  });

  it("adds batches when a command line would be too long", () => {
    const batches = planBatches(files(1000), 4, 5_000);
    expect(batches.length).toBeGreaterThan(4);
    for (const b of batches) expect(b.reduce((n, f) => n + f.length + 16, 0)).toBeLessThanOrEqual(5_000);
  });
});

describe("runLimited", () => {
  it("keeps order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const tasks = [30, 5, 20, 1, 10].map((ms, i) => async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return i;
    });
    expect(await runLimited(tasks, 2)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });
});

describe("listSourceFiles", () => {
  it("lists script and HTML files with forward slashes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xray-batches-"));
    try {
      await mkdir(path.join(root, "src", "ui"), { recursive: true });
      await writeFile(path.join(root, "src", "main.ts"), "");
      await writeFile(path.join(root, "src", "ui", "index.html"), "");
      await writeFile(path.join(root, "src", "ui", "App.tsx"), "");
      await writeFile(path.join(root, "src", "logo.png"), "");
      expect(await listSourceFiles(root)).toEqual(["src/main.ts", "src/ui/App.tsx", "src/ui/index.html"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("mergeEvidence", () => {
  const part = (id: string, nodes: string[], handlers: number) => ({
    evidence_id: id,
    limitations: ["shared"],
    normalized_result: {
      graph: { nodes: nodes.map((node_id) => ({ node_id })) },
      summary: { ipc: { main_handlers: handlers }, label: "x" },
      limitations: ["budget"],
    },
  });

  it("returns a single part unchanged", () => {
    const one = part("a", ["n1"], 1);
    expect(mergeEvidence([one])).toBe(one);
  });

  it("dedupes nodes, sums counts and records every batch", () => {
    const merged = mergeEvidence([part("a", ["pkg", "n1"], 2), part("b", ["pkg", "n2"], 3)]) as ReturnType<typeof part> & {
      batch_evidence_ids: string[];
    };
    expect(merged.normalized_result.graph.nodes.map((n) => n.node_id)).toEqual(["pkg", "n1", "n2"]);
    expect(merged.normalized_result.summary.ipc.main_handlers).toBe(5);
    expect(merged.batch_evidence_ids).toEqual(["a", "b"]);
    expect(merged.limitations).toEqual(["shared"]);
    expect(merged.normalized_result.limitations[0]).toMatch(/2 parallel batches/);
    expect(merged.normalized_result.limitations).toHaveLength(2);
  });
});

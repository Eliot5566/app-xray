import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalize } from "../src/core/normalize.js";
import type { XrayReport } from "../src/core/schema.js";
import { reaGaps, renderBoard } from "../src/bench/board.js";
import { gradeRun, parseList, scoreAnswer } from "../src/bench/grade.js";
import { buildTasks, readCorpus, TEMPLATES, type CorpusApp } from "../src/bench/tasks.js";
import { applyRules } from "../src/rules/index.js";

let report: XrayReport;
let apps: CorpusApp[];

beforeAll(async () => {
  const evidence = JSON.parse(await readFile(new URL("./fixtures/demo-app.rea.json", import.meta.url), "utf8"));
  report = applyRules(
    normalize({ evidence, reaVersion: "6.7.0", electron: { version: "28.1.0", source: "package.json" }, inputPath: "/w/demo" }),
  );
  apps = ["alpha", "beta", "gamma"].map((name) => ({ name, repo: `acme/${name}`, path: ".", commit: "abc1234", report }));
});

describe("buildTasks", () => {
  it("answers each template from the report and keeps answers out of the task set", () => {
    const { set, answers } = buildTasks(apps, { seed: "2026-10-28" });
    expect(set.schema).toBe("rea-bench/tasks@0");
    expect(set.tasks.length).toBe(answers.length);
    expect(JSON.stringify(set)).not.toContain('"expected"');
    const version = answers.find((a) => a.id === "electron-version/alpha");
    expect(version?.expected).toBe("28.1.0");
    const task = set.tasks.find((t) => t.id === "electron-version/alpha")!;
    expect(task).toMatchObject({ repo: "acme/alpha", commit: "abc1234", format: "text" });
    expect(task.question).toContain("alpha");
    const support = set.tasks.find((t) => t.id === "electron-supported/alpha")!;
    expect(support.question).toMatch(/on \d{4}-\d{2}-\d{2}\?/);
  });

  it("caps questions per template and depends on the seed", () => {
    const a = buildTasks(apps, { seed: "one", perTemplate: 1 }).set.tasks;
    expect(a.filter((t) => t.template === "electron-version")).toHaveLength(1);
    const picks = new Set(
      ["s1", "s2", "s3", "s4", "s5", "s6"].map((seed) => buildTasks(apps, { seed, perTemplate: 1 }).set.tasks[0].app),
    );
    expect(picks.size).toBeGreaterThan(1);
    expect(buildTasks(apps, { seed: "one", perTemplate: 1 }).set).toEqual(buildTasks(apps, { seed: "one", perTemplate: 1 }).set);
  });

  it("skips templates the report cannot answer", () => {
    const empty = { ...report, browserWindows: [], ipcChannels: [], preloads: [], findings: [], frameworks: [] };
    for (const t of TEMPLATES) expect(t.answer(empty)).toBeNull();
    const unknownVersion = { ...report, findings: [{ ruleId: "electron-support", severity: "info" as const, title: "Electron version unknown", detail: "", locations: [] }] };
    expect(TEMPLATES.find((t) => t.id === "electron-supported")!.answer(unknownVersion)).toBeNull();
  });
});

describe("readCorpus", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "rea-bench-"));
    await mkdir(path.join(dir, "demo"));
    await writeFile(path.join(dir, "demo", "xray.json"), JSON.stringify(report));
    await writeFile(
      path.join(dir, "summary.json"),
      JSON.stringify([
        { name: "demo", repo: "acme/demo", path: "app", commit: "abc", ok: true },
        { name: "failed", repo: "acme/failed", path: ".", ok: false },
      ]),
    );
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("keeps only successful scans with a commit", async () => {
    const corpus = await readCorpus(dir);
    expect(corpus.map((c) => c.name)).toEqual(["demo"]);
    expect(corpus[0].report.frameworks.length).toBeGreaterThan(0);
  });
});

describe("scoreAnswer", () => {
  it("normalizes versions and yes/no", () => {
    expect(scoreAnswer({ format: "text" }, "28.1.0", " v28.1.0. ")).toBe(1);
    expect(scoreAnswer({ format: "text" }, "28.1.0", "28.1")).toBe(0);
    expect(scoreAnswer({ format: "yes-no" }, "no", "No, it does not.")).toBe(1);
    expect(scoreAnswer({ format: "yes-no" }, "yes", "no")).toBe(0);
    expect(scoreAnswer({ format: "number" }, 3, "There are 3 call sites")).toBe(1);
    expect(scoreAnswer({ format: "number" }, 3, "")).toBe(0);
  });

  it("gives partial credit on lists", () => {
    expect(parseList("- ./preload.js\n2) other.js, preload.js")).toEqual(["preload.js", "other.js"]);
    expect(scoreAnswer({ format: "list" }, ["a", "b"], "a\nb")).toBe(1);
    expect(scoreAnswer({ format: "list" }, ["a", "b"], ["a"])).toBe(0.667);
    expect(scoreAnswer({ format: "list" }, ["a", "b"], "a, b, c, d")).toBe(0.667);
    expect(scoreAnswer({ format: "list" }, ["a"], "z")).toBe(0);
  });
});

describe("gradeRun and the board", () => {
  it("grades a run and renders a ranked board with the REA gap", () => {
    const { set, answers } = buildTasks(apps, { seed: "x" });
    const perfect = Object.fromEntries(
      answers.map((a) => [a.id, Array.isArray(a.expected) ? a.expected.join("\n") : String(a.expected)]),
    );
    const meta = { agent: "test-agent", model: "model-<a>", date: "2026-10-28" };
    const withRea = gradeRun(set, answers, perfect, { ...meta, withRea: true });
    const without = gradeRun(set, answers, { [answers[0].id]: perfect[answers[0].id] }, { ...meta, withRea: false });
    expect(withRea.score).toBe(1);
    expect(withRea.answered).toBe(set.tasks.length);
    expect(without.answered).toBe(1);
    expect(without.score).toBeCloseTo(1 / set.tasks.length, 2);
    expect(Object.values(withRea.byTemplate).every((s) => s === 1)).toBe(true);

    expect(reaGaps([withRea, without])).toEqual([
      { agent: "test-agent", model: "model-<a>", withRea: 1, withoutRea: without.score },
    ]);
    const html = renderBoard([without, withRea]);
    expect(html).toContain("model-&lt;a&gt;");
    expect(html.indexOf("with REA</span>")).toBeLessThan(html.indexOf("no REA</span>"));
    expect(html).toContain("What REA adds");
    expect(renderBoard([])).toContain("No graded runs yet");
  });
});

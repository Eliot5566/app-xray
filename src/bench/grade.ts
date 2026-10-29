import type { Answer, Task, TaskSet } from "./tasks.js";

// Scores free-text answers against the reference: exact match for versions and yes/no, ±0 for
// numbers, and F1 over items for lists, so a partial list earns partial credit.

export interface TaskScore {
  id: string;
  template: string;
  score: number;
}

export interface RunMeta {
  agent: string;
  model: string;
  /** Whether the agent had REA's tools. The point of the benchmark is the difference. */
  withRea: boolean;
  date: string;
  notes?: string;
}

export interface RunResult extends RunMeta {
  schema: "rea-bench/result@0";
  seed: string;
  score: number;
  answered: number;
  total: number;
  byTemplate: Record<string, number>;
  tasks: TaskScore[];
}

export function normalizeText(s: string): string {
  return s
    .trim()
    .replace(/^["'`]+|["'`.]+$/g, "")
    .replace(/^v(?=\d)/i, "")
    .toLowerCase();
}

export function parseList(answer: string | string[]): string[] {
  const items = Array.isArray(answer) ? answer : answer.split(/\r?\n|,/);
  return [
    ...new Set(
      items
        .map((i) => normalizeText(i.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")))
        .map((i) => i.replace(/^\.\//, ""))
        .filter(Boolean),
    ),
  ];
}

export function scoreAnswer(task: Pick<Task, "format">, expected: Answer["expected"], given: unknown): number {
  if (given === undefined || given === null || given === "") return 0;
  switch (task.format) {
    case "list": {
      const want = new Set(parseList(expected as string[]));
      const got = parseList(Array.isArray(given) ? given.map(String) : String(given));
      if (want.size === 0 || got.length === 0) return 0;
      const hits = got.filter((g) => want.has(g)).length;
      if (hits === 0) return 0;
      const precision = hits / got.length;
      const recall = hits / want.size;
      return round((2 * precision * recall) / (precision + recall));
    }
    case "number": {
      const n = Number(String(given).trim().match(/-?\d+(?:\.\d+)?/)?.[0]);
      return n === Number(expected) ? 1 : 0;
    }
    case "yes-no": {
      const g = normalizeText(String(given));
      const yn = g.startsWith("yes") ? "yes" : g.startsWith("no") ? "no" : g;
      return yn === expected ? 1 : 0;
    }
    default:
      return normalizeText(String(given)) === normalizeText(String(expected)) ? 1 : 0;
  }
}

export function gradeRun(set: TaskSet, answers: Answer[], responses: Record<string, unknown>, meta: RunMeta): RunResult {
  const expected = new Map(answers.map((a) => [a.id, a.expected]));
  const tasks: TaskScore[] = set.tasks.map((t) => ({
    id: t.id,
    template: t.template,
    score: expected.has(t.id) ? scoreAnswer(t, expected.get(t.id)!, responses[t.id]) : 0,
  }));
  const byTemplate: Record<string, number> = {};
  for (const template of new Set(tasks.map((t) => t.template))) {
    const ts = tasks.filter((t) => t.template === template);
    byTemplate[template] = round(ts.reduce((s, t) => s + t.score, 0) / ts.length);
  }
  return {
    schema: "rea-bench/result@0",
    ...meta,
    seed: set.seed,
    score: round(tasks.reduce((s, t) => s + t.score, 0) / Math.max(tasks.length, 1)),
    answered: set.tasks.filter((t) => responses[t.id] !== undefined && responses[t.id] !== "").length,
    total: tasks.length,
    byTemplate,
    tasks,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

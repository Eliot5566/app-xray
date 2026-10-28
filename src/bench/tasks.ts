import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { XrayReport } from "../core/schema.js";

// REA-Bench questions about real open-source Electron apps. Each question has a reference answer
// taken from an App X-Ray report of the same commit, so the set can be rebuilt every week as the
// apps change, and nobody has to write answers by hand.

export type AnswerFormat = "text" | "number" | "yes-no" | "list";

export interface Task {
  id: string;
  template: string;
  app: string;
  /** GitHub repository and commit the question is about. */
  repo: string;
  commit: string;
  /** Folder inside the repository that holds the app. */
  path: string;
  question: string;
  format: AnswerFormat;
}

export interface Answer {
  id: string;
  expected: string | number | string[];
}

export interface TaskSet {
  schema: "rea-bench/tasks@0";
  /** Changes the selection; the gallery's weekly rescan uses the scan date. */
  seed: string;
  tasks: Task[];
}

interface Template {
  id: string;
  format: AnswerFormat;
  question(app: string, report: XrayReport): string;
  /** null when the report cannot answer the question reliably for this app. */
  answer(report: XrayReport): Answer["expected"] | null;
}

const MAX_LIST = 40;

export const TEMPLATES: Template[] = [
  {
    id: "electron-version",
    format: "text",
    question: (app) => `Which exact Electron version does ${app} depend on at this commit? Answer with the version number only, e.g. 33.2.1.`,
    answer: (r) => r.frameworks.find((f) => f.kind === "electron")?.version ?? null,
  },
  {
    id: "electron-supported",
    format: "yes-no",
    question: (app, r) =>
      `Was the Electron version ${app} uses at this commit still inside Electron's supported window (the latest three major releases) on ${supportSnapshot(r)}? Answer yes or no.`,
    answer: (r) => {
      const f = r.findings.find((x) => x.ruleId === "electron-support");
      if (!f || !supportSnapshot(r)) return null;
      return f.severity === "info" ? "yes" : "no";
    },
  },
  {
    id: "node-integration",
    format: "yes-no",
    question: (app) => `Does any BrowserWindow that ${app} creates set webPreferences.nodeIntegration to true? Answer yes or no.`,
    answer: (r) =>
      r.browserWindows.length === 0
        ? null
        : r.browserWindows.some((w) => w.webPreferences.some((p) => p.name === "nodeIntegration" && p.value === true))
          ? "yes"
          : "no",
  },
  {
    id: "window-count",
    format: "number",
    question: (app) =>
      `How many places in ${app}'s own source code construct a BrowserWindow (count each \`new BrowserWindow(...)\` call site once)? Answer with a number.`,
    answer: (r) => (r.browserWindows.length > 0 ? r.browserWindows.length : null),
  },
  {
    id: "ipc-main-channels",
    format: "list",
    question: (app) =>
      `List every IPC channel name that ${app}'s main process listens on or handles with a literal channel name (ipcMain.on, ipcMain.handle and similar). One channel per line.`,
    answer: (r) => {
      const channels = [...new Set(r.ipcChannels.filter((c) => c.side === "main").map((c) => c.channel))].sort();
      return channels.length > 0 && channels.length <= MAX_LIST ? channels : null;
    },
  },
  {
    id: "preload-scripts",
    format: "list",
    question: (app) => `List the preload scripts ${app} passes to its windows, as file paths relative to the app folder. One path per line.`,
    answer: (r) => (r.preloads.length > 0 && r.preloads.length <= MAX_LIST ? [...r.preloads].sort() : null),
  },
];

/** The date of the Electron release data the support finding was made with ("as of 2026-10-22"). */
function supportSnapshot(r: XrayReport): string | null {
  const f = r.findings.find((x) => x.ruleId === "electron-support");
  return f?.detail.match(/as of (\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

export interface CorpusApp {
  name: string;
  title?: string;
  repo: string;
  path: string;
  commit: string;
  report: XrayReport;
}

/** Reads a corpus run (bench-out/: summary.json plus <name>/xray.json). */
export async function readCorpus(dir: string): Promise<CorpusApp[]> {
  const summary = JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8")) as Array<{
    name: string;
    title?: string;
    repo: string;
    path: string;
    commit?: string;
    ok?: boolean;
  }>;
  const names = new Set(await readdir(dir));
  const apps: CorpusApp[] = [];
  for (const s of summary) {
    if (!s.ok || !s.commit || !names.has(s.name)) continue;
    const report = JSON.parse(await readFile(path.join(dir, s.name, "xray.json"), "utf8")) as XrayReport;
    apps.push({ name: s.name, title: s.title, repo: s.repo, path: s.path, commit: s.commit, report });
  }
  return apps;
}

/** Up to `perTemplate` questions per template, spread across apps in a seed-dependent order. */
export function buildTasks(apps: CorpusApp[], opts: { seed: string; perTemplate?: number }): { set: TaskSet; answers: Answer[] } {
  const perTemplate = opts.perTemplate ?? 9;
  const tasks: Task[] = [];
  const answers: Answer[] = [];
  for (const t of TEMPLATES) {
    const order = [...apps].sort((a, b) => rank(opts.seed, t.id, a.name).localeCompare(rank(opts.seed, t.id, b.name)));
    let taken = 0;
    for (const app of order) {
      if (taken >= perTemplate) break;
      const expected = t.answer(app.report);
      if (expected === null) continue;
      const id = `${t.id}/${app.name}`;
      tasks.push({
        id,
        template: t.id,
        app: app.title ?? app.name,
        repo: app.repo,
        commit: app.commit,
        path: app.path,
        question: t.question(app.title ?? app.name, app.report),
        format: t.format,
      });
      answers.push({ id, expected });
      taken++;
    }
  }
  return { set: { schema: "rea-bench/tasks@0", seed: opts.seed, tasks }, answers };
}

function rank(seed: string, template: string, app: string): string {
  return createHash("sha256").update(`${seed}\0${template}\0${app}`).digest("hex");
}

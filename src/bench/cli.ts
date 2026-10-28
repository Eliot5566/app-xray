#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { readResults, renderBoard } from "./board.js";
import { gradeRun } from "./grade.js";
import { buildTasks, readCorpus, type Answer, type TaskSet } from "./tasks.js";

const USAGE = `Usage: rea-bench build <corpus-dir> [--out <dir>] [--seed <text>] [--per-template <n>]
       rea-bench grade <task-dir> <responses.json> --agent <name> --model <name> [--with-rea] [--out <dir>] [--notes <text>]
       rea-bench board <results-dir> [--out <dir>]

build   Write tasks.json (give this to agents) and answers.json (keep it away from them)
        from an App X-Ray corpus run, e.g. bench-out/ from npm run bench.
grade   Score a responses file ({"<task id>": "<answer>", ...}) and write a result JSON.
board   Render index.html from a folder of result JSON files.`;

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      seed: { type: "string" },
      "per-template": { type: "string" },
      agent: { type: "string" },
      model: { type: "string" },
      "with-rea": { type: "boolean", default: false },
      notes: { type: "string" },
      date: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, target] = positionals;
  if (values.help || !["build", "grade", "board"].includes(command ?? "") || !target) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  const today = values.date ?? new Date().toISOString().slice(0, 10);

  if (command === "build") {
    const apps = await readCorpus(target);
    if (apps.length === 0) throw new UsageError(`No usable reports in ${target}: expected summary.json and <name>/xray.json.`);
    const perTemplate = values["per-template"] ? Number(values["per-template"]) : undefined;
    if (perTemplate !== undefined && !(perTemplate > 0)) throw new UsageError("--per-template must be a positive number");
    const { set, answers } = buildTasks(apps, { seed: values.seed ?? today, perTemplate });
    const out = path.resolve(values.out ?? "rea-bench");
    await mkdir(out, { recursive: true });
    await writeJson(path.join(out, "tasks.json"), set);
    await writeJson(path.join(out, "answers.json"), answers);
    process.stderr.write(`rea-bench: ${set.tasks.length} tasks from ${apps.length} apps, wrote ${out}\n`);
    return 0;
  }

  if (command === "grade") {
    const responsesPath = positionals[2];
    if (!responsesPath) throw new UsageError("rea-bench grade needs <task-dir> and <responses.json>");
    if (!values.agent || !values.model) throw new UsageError("rea-bench grade needs --agent and --model");
    const set = (await readJson(path.join(target, "tasks.json"))) as TaskSet;
    const answers = (await readJson(path.join(target, "answers.json"))) as Answer[];
    const responses = (await readJson(responsesPath)) as Record<string, unknown>;
    if (typeof responses !== "object" || responses === null || Array.isArray(responses)) {
      throw new UsageError(`${responsesPath} must be a JSON object of task id to answer`);
    }
    const result = gradeRun(set, answers, responses, {
      agent: values.agent,
      model: values.model,
      withRea: values["with-rea"],
      date: today,
      ...(values.notes ? { notes: values.notes } : {}),
    });
    const out = path.resolve(values.out ?? "results");
    await mkdir(out, { recursive: true });
    const file = path.join(out, `${today}-${slug(values.agent)}-${slug(values.model)}-${values["with-rea"] ? "rea" : "norea"}.json`);
    await writeJson(file, result);
    process.stdout.write(`${Math.round(result.score * 100)}% (${result.answered}/${result.total} answered), wrote ${file}\n`);
    return 0;
  }

  const runs = await readResults(target);
  const out = path.resolve(values.out ?? "site/bench");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "index.html"), renderBoard(runs));
  process.stderr.write(`rea-bench: ${runs.length} runs, wrote ${path.join(out, "index.html")}\n`);
  return 0;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new UsageError(`Could not read ${file}: ${(e as Error).message}`);
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`rea-bench: ${e instanceof UsageError ? e.message : (e as Error).stack}\n`);
    process.exit(e instanceof UsageError ? 2 : 1);
  },
);

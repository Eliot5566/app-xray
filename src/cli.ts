#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { candidateExecutables, detectElectronVersion } from "./core/electronVersion.js";
import { normalize } from "./core/normalize.js";
import { prepareScope } from "./core/sourceScope.js";
import {
  analyzeJavaScriptApplication,
  inspectElectronFuses,
  installedReaVersion,
  PINNED_REA_VERSION,
  ReaError,
} from "./core/rea.js";
import type { FuseState } from "./core/schema.js";
import { renderHtml } from "./report/html.js";
import { applyRules } from "./rules/index.js";

const USAGE = `Usage: xray scan <app-path> [--out <dir>] [--rea-json <file>] [--all-files] [--quiet]

  <app-path>         An unpacked app directory, app.asar or .app bundle resources folder
  --out <dir>        Where to write xray.json and report.html (default: ./xray-out)
  --rea-json <file>  Reuse a saved "rea analyze-javascript-application --json" result
  --all-files        In a source checkout, also analyze tests, stories and build tooling
  --quiet            No progress output`;

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", default: "xray-out" },
      "rea-json": { type: "string" },
      "all-files": { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const [command, target] = positionals;
  if (values.help || command !== "scan" || !target) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  const log = (msg: string) => {
    if (!values.quiet) process.stderr.write(`${msg}\n`);
  };

  const reaVersion = await installedReaVersion();
  if (reaVersion !== PINNED_REA_VERSION) {
    log(`warning: app-xray is tested with rea-agents ${PINNED_REA_VERSION}, found ${reaVersion}`);
  }

  const scope = values["rea-json"] ? null : await prepareScope(target, { allFiles: values["all-files"] });
  if (scope?.filtered) log(`source checkout: leaving out ${scope.excludedFiles} test, story, tooling and generated files`);
  let evidence: unknown;
  try {
    evidence = values["rea-json"]
      ? JSON.parse(await readFile(values["rea-json"], "utf8"))
      : await analyzeJavaScriptApplication(scope!.analyzedPath, (m) => log(`  rea: ${m}`));
  } finally {
    await scope?.cleanup();
  }

  const electron = await detectElectronVersion(target);
  const fuses = await readFuses(target, log);
  const report = applyRules(
    normalize({ evidence, reaVersion, electron, inputPath: path.resolve(target), excludedFiles: scope?.excludedFiles ?? 0, fuses }),
  );

  const outDir = path.resolve(values.out);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "xray.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outDir, "report.html"), renderHtml(report));

  const high = report.findings.filter((f) => f.severity === "high").length;
  log(`${report.target.name ?? target}: ${report.findings.length} findings (${high} high)`);
  log(`wrote ${path.join(outDir, "report.html")}`);
  return 0;
}

async function readFuses(target: string, log: (msg: string) => void): Promise<FuseState[] | null> {
  const [executable] = await candidateExecutables(path.resolve(target));
  if (!executable) return null;
  try {
    return await inspectElectronFuses(executable);
  } catch (err) {
    log(`warning: could not read Electron fuses from ${executable}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof ReaError) {
      console.error(`${err.message}\n${err.stderr.split("\n").slice(-5).join("\n")}`);
    } else {
      console.error(err instanceof Error ? err.message : err);
    }
    process.exit(1);
  },
);

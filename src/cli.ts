#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeApk, isApk, toolVersion } from "./android/apk.js";
import { analyzeBinary, binaryFormat } from "./native/binary.js";
import { queryOsv } from "./native/osv.js";
import { listSourceFiles } from "./core/batches.js";
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
import type { FuseState, XrayReport } from "./core/schema.js";
import { buildGallery } from "./gallery.js";
import { renderBadge } from "./report/badge.js";
import { renderCard } from "./report/card.js";
import { renderHtml } from "./report/html.js";
import { renderPng } from "./report/png.js";
import { applyRules } from "./rules/index.js";

const USAGE = `Usage: xray scan <app-path> [--out <dir>] [--rea-json <file>] [--all-files] [--osv] [--quiet]
       xray gallery <reports-dir> [--out <dir>] [--base-url <url>]

scan
  <app-path>         An installed app folder or .app bundle, an app.asar, an Android .apk,
                     a Go or Rust executable, or a source checkout
  --out <dir>        Where to write the report files (default: ./xray-out)
  --rea-json <file>  Reuse a saved "rea analyze-javascript-application --json" result
  --all-files        In a source checkout, also analyze tests, stories and build tooling
  --osv              Go/Rust executables: look up their libraries in the OSV vulnerability
                     database (sends package names and versions to api.osv.dev)
  --quiet            No progress output

gallery
  <reports-dir>      Folder of scan outputs (<name>/xray.json), e.g. from npm run bench
  --out <dir>        Where to write the static site (default: ./site)
  --base-url <url>   Public URL of the site, for link previews and README badges`;

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      "base-url": { type: "string" },
      "rea-json": { type: "string" },
      "all-files": { type: "boolean", default: false },
      osv: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const [command, target] = positionals;
  if (values.help || (command !== "scan" && command !== "gallery") || !target) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  if (command === "gallery") {
    const outDir = path.resolve(values.out ?? "site");
    const apps = await buildGallery(target, outDir, { baseUrl: values["base-url"] });
    if (apps.length === 0) throw new UsageError(`No reports found in ${target}: expected <name>/xray.json folders.`);
    if (!values.quiet) process.stderr.write(`gallery: ${apps.length} apps, wrote ${path.join(outDir, "index.html")}\n`);
    return 0;
  }

  const log = (msg: string) => {
    if (!values.quiet) process.stderr.write(`${msg}\n`);
  };

  const targetStat = await stat(target).catch(() => null);
  if (!targetStat) throw new UsageError(`No such file or directory: ${target}`);

  if (isApk(target) && targetStat.isFile()) {
    // APKs are read natively; REA's Android path needs Java and a JADX server.
    const report = applyRules(
      await analyzeApk(path.resolve(target), { toolVersion: toolVersion() }).catch((err: unknown) => {
        throw new UsageError(`${target} could not be read as an APK: ${err instanceof Error ? err.message : err}`);
      }),
    );
    await writeOutputs(report, path.resolve(values.out ?? "xray-out"), log);
    return 0;
  }

  const reaVersion = await installedReaVersion();
  if (reaVersion !== PINNED_REA_VERSION) {
    log(`warning: app-xray is tested with rea-agents ${PINNED_REA_VERSION}, found ${reaVersion}`);
  }

  if (targetStat.isFile() && (await binaryFormat(target))) {
    let report = await analyzeBinary(path.resolve(target), reaVersion);
    if (values.osv) report = await withOsv(report, log);
    else if (report.dependencies?.length) log("note: pass --osv to check these libraries against the OSV vulnerability database");
    await writeOutputs(applyRules(report), path.resolve(values.out ?? "xray-out"), log);
    return 0;
  }

  const scope = values["rea-json"] ? null : await prepareScope(target, { allFiles: values["all-files"] });
  if (scope?.payload) log(`packaged app: analyzing ${scope.payload}`);
  if (scope && !scope.analyzedPath.endsWith(".asar")) {
    if (!targetStat.isDirectory()) {
      throw new UsageError(`${target} is not a folder, an .asar, an .apk or an executable. Point xray at an installed app folder, an app.asar, an APK, a Go or Rust executable, or a source checkout.`);
    }
    if ((await listSourceFiles(scope.analyzedPath)).length === 0) {
      await scope.cleanup();
      throw new UsageError(`No JavaScript or HTML files found in ${target}. Point xray at an installed app folder, an app.asar, or a source checkout.`);
    }
  }
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

  await writeOutputs(report, path.resolve(values.out ?? "xray-out"), log);
  return 0;
}

class UsageError extends Error {}

async function withOsv(report: XrayReport, log: (msg: string) => void): Promise<XrayReport> {
  const deps = report.dependencies ?? [];
  const go = report.frameworks.find((f) => f.kind === "go")?.version ?? null;
  log(`checking ${deps.length + (go ? 1 : 0)} libraries against OSV`);
  try {
    return { ...report, vulnerabilities: await queryOsv(deps, go) };
  } catch (err) {
    log(`warning: OSV lookup failed, so known vulnerabilities are not listed: ${err instanceof Error ? err.message : err}`);
    return { ...report, limitations: [...report.limitations, "The OSV vulnerability lookup failed, so known vulnerabilities are not listed."] };
  }
}

async function writeOutputs(report: XrayReport, outDir: string, log: (msg: string) => void): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "xray.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outDir, "report.html"), renderHtml(report));
  const card = renderCard(report);
  await writeFile(path.join(outDir, "card.svg"), card);
  const png = await renderPng(card);
  if (png) await writeFile(path.join(outDir, "card.png"), png);
  else log("note: card.png skipped (the optional @resvg/resvg-js renderer is not installed)");
  await writeFile(path.join(outDir, "badge.svg"), renderBadge(report));

  const high = report.findings.filter((f) => f.severity === "high").length;
  log(`${report.target.name ?? report.target.inputPath}: ${report.findings.length} findings (${high} high)`);
  log(`wrote ${path.join(outDir, "report.html")}`);
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
      // Progress lines are JSON; anything else on stderr is worth showing.
      const extra = err.stderr.split("\n").filter((l) => l.trim() && !l.trim().startsWith("{")).slice(-5);
      console.error([err.message, ...extra].join("\n"));
    } else {
      console.error(err instanceof Error ? err.message : err);
    }
    process.exit(err instanceof UsageError ? 2 : 1);
  },
);

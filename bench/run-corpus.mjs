#!/usr/bin/env node
// Clones each corpus app (depth 1), scans it with the built CLI and writes bench-out/summary.{json,md}.
// Usage: npm run build && node bench/run-corpus.mjs [--work <dir>] [--only name1,name2]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    work: { type: "string", default: path.join(os.tmpdir(), "app-xray-corpus") },
    only: { type: "string" },
    out: { type: "string", default: "bench-out" },
  },
});

const root = path.resolve(import.meta.dirname, "..");
const corpus = JSON.parse(readFileSync(path.join(root, "bench/corpus.json"), "utf8"));
const only = values.only ? new Set(values.only.split(",")) : null;
const outDir = path.resolve(values.out);
mkdirSync(outDir, { recursive: true });
mkdirSync(values.work, { recursive: true });

const results = [];
for (const app of corpus.apps.filter((a) => !only || only.has(a.name))) {
  const clone = path.join(values.work, app.name);
  const result = { name: app.name, repo: app.repo, path: app.path };
  try {
    if (!existsSync(clone)) {
      execFileSync("git", ["clone", "--quiet", "--depth", "1", `https://github.com/${app.repo}.git`, clone], {
        stdio: "ignore",
      });
    }
    result.commit = execFileSync("git", ["-C", clone, "rev-parse", "--short", "HEAD"]).toString().trim();
    const started = Date.now();
    const run = spawnSync(
      process.execPath,
      [path.join(root, "dist/cli.js"), "scan", path.join(clone, app.path), "--out", path.join(outDir, app.name), "--quiet"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    result.seconds = Math.round((Date.now() - started) / 100) / 10;
    if (run.status !== 0) throw new Error(run.stderr.trim().split("\n").slice(-3).join(" "));
    const report = JSON.parse(readFileSync(path.join(outDir, app.name, "xray.json"), "utf8"));
    result.ok = true;
    result.electron = report.frameworks.find((f) => f.kind === "electron")?.version ?? null;
    result.endpoints = report.endpoints.length;
    result.modules = report.modules.length;
    result.findings = Object.fromEntries(
      ["high", "medium", "low", "info"].map((s) => [s, report.findings.filter((f) => f.severity === s).length]),
    );
    result.titles = report.findings.filter((f) => f.severity !== "info").map((f) => f.title);
  } catch (err) {
    result.ok = false;
    result.error = String(err.message ?? err).slice(0, 300);
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
  results.push(result);
  console.error(`${result.ok ? "ok  " : "FAIL"} ${app.name} ${result.seconds ?? "-"}s ${result.error ?? ""}`);
}

writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(results, null, 2)}\n`);
const rows = results.map((r) =>
  r.ok
    ? `| ${r.name} | ${r.electron ?? "unknown"} | ${r.seconds} | ${r.endpoints} | ${r.findings.high}/${r.findings.medium}/${r.findings.low} | ${r.titles.join("; ") || "—"} |`
    : `| ${r.name} | — | ${r.seconds ?? "—"} | — | — | failed: ${r.error} |`,
);
writeFileSync(
  path.join(outDir, "summary.md"),
  [
    "| App | Electron | Seconds | Addresses | High/Med/Low | Findings |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n"),
);
const failed = results.filter((r) => !r.ok).length;
console.error(`${results.length - failed}/${results.length} scanned`);

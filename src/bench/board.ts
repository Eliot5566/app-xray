import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { esc } from "../report/html.js";
import type { RunResult } from "./grade.js";
import { TEMPLATES } from "./tasks.js";

// The leaderboard: one row per graded run, best first, with a per-template breakdown and the
// with-REA versus without-REA gap for each model that has both kinds of run.

export async function readResults(dir: string): Promise<RunResult[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const runs: RunResult[] = [];
  for (const f of files) {
    const r = JSON.parse(await readFile(path.join(dir, f), "utf8")) as RunResult;
    if (r.schema === "rea-bench/result@0") runs.push(r);
  }
  return runs;
}

export interface ReaGap {
  model: string;
  agent: string;
  withRea: number;
  withoutRea: number;
}

/** Best score per agent and model with REA and without, where both exist. */
export function reaGaps(runs: RunResult[]): ReaGap[] {
  const best = new Map<string, { agent: string; model: string; with?: number; without?: number }>();
  for (const r of runs) {
    const key = `${r.agent}\0${r.model}`;
    const b = best.get(key) ?? { agent: r.agent, model: r.model };
    const k = r.withRea ? "with" : "without";
    b[k] = Math.max(b[k] ?? 0, r.score);
    best.set(key, b);
  }
  return [...best.values()]
    .filter((b) => b.with !== undefined && b.without !== undefined)
    .map((b) => ({ agent: b.agent, model: b.model, withRea: b.with!, withoutRea: b.without! }))
    .sort((a, b) => b.withRea - b.withoutRea - (a.withRea - a.withoutRea));
}

export function renderBoard(runs: RunResult[], opts: { title?: string } = {}): string {
  const title = opts.title ?? "REA-Bench leaderboard";
  const sorted = [...runs].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  const templates = TEMPLATES.map((t) => t.id).filter((id) => runs.some((r) => id in r.byTemplate));
  const pct = (n: number | undefined) => (n === undefined ? "—" : `${Math.round(n * 100)}%`);
  const rows = sorted
    .map(
      (r, i) => `<tr>
<td class="n">${i + 1}</td>
<td>${esc(r.model)}<div class="sub">${esc(r.agent)}${r.notes ? ` · ${esc(r.notes)}` : ""}</div></td>
<td><span class="tag ${r.withRea ? "on" : "off"}">${r.withRea ? "with REA" : "no REA"}</span></td>
<td class="n score">${pct(r.score)}</td>
${templates.map((t) => `<td class="n">${pct(r.byTemplate[t])}</td>`).join("\n")}
<td class="n">${r.answered}/${r.total}</td>
<td class="n">${esc(r.date)}</td>
<td class="n">${esc(r.seed)}</td>
</tr>`,
    )
    .join("\n");
  const gaps = reaGaps(runs);
  const gapRows = gaps
    .map(
      (g) =>
        `<tr><td>${esc(g.model)}<div class="sub">${esc(g.agent)}</div></td><td class="n">${pct(g.withoutRea)}</td><td class="n">${pct(g.withRea)}</td><td class="n score">${g.withRea >= g.withoutRea ? "+" : "−"}${Math.abs(Math.round((g.withRea - g.withoutRea) * 100))} pts</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg:#fff; --fg:#1b1d21; --muted:#5d6470; --line:#e3e6ea; --on:#0b6b3a; --on-bg:#e3f4ea; --off:#5d6470; --off-bg:#eef0f3; }
@media (prefers-color-scheme: dark) { :root { --bg:#14161a; --fg:#e8eaee; --muted:#9aa2ae; --line:#2b3038; --on:#7fd8a4; --on-bg:#173325; --off:#9aa2ae; --off-bg:#23272e; } }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, sans-serif; }
main { max-width:1100px; margin:0 auto; padding:32px 16px; }
h1 { margin:0 0 4px; font-size:26px; } h2 { margin:32px 0 8px; font-size:18px; }
p { color:var(--muted); max-width:70ch; }
.wrap { overflow-x:auto; }
table { border-collapse:collapse; width:100%; font-size:14px; }
th, td { padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; white-space:nowrap; }
th { font-weight:600; color:var(--muted); font-size:12px; }
.n { text-align:right; font-variant-numeric:tabular-nums; }
.score { font-weight:700; }
.sub { color:var(--muted); font-size:12px; }
.tag { font-size:12px; padding:2px 8px; border-radius:99px; }
.tag.on { color:var(--on); background:var(--on-bg); } .tag.off { color:var(--off); background:var(--off-bg); }
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<p>Each task is a question about a real open-source app at a pinned commit. The reference answers come from App X-Ray's static analysis of the same commit, so a score measures agreement with that analysis. Runs marked <b>with REA</b> gave the agent REA's tools; the others used only their usual tools.</p>
${
  runs.length === 0
    ? "<p>No graded runs yet.</p>"
    : `<div class="wrap"><table>
<thead><tr><th class="n">#</th><th>Model</th><th>Tools</th><th class="n">Score</th>${templates.map((t) => `<th class="n">${esc(t)}</th>`).join("")}<th class="n">Answered</th><th class="n">Date</th><th class="n">Task set</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>`
}
${
  gaps.length === 0
    ? ""
    : `<h2>What REA adds</h2>
<p>Best score for each model with and without REA's tools.</p>
<div class="wrap"><table>
<thead><tr><th>Model</th><th class="n">Without REA</th><th class="n">With REA</th><th class="n">Difference</th></tr></thead>
<tbody>
${gapRows}
</tbody></table></div>`
}
</main>
</body>
</html>
`;
}

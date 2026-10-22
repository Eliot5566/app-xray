import type { Finding, SourceLocation, XrayReport } from "../core/schema.js";

export function renderHtml(report: XrayReport): string {
  const title = report.target.name ?? "Unnamed app";
  const counts = countBySeverity(report.findings);
  const electron = report.frameworks.find((f) => f.kind === "electron");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · App X-Ray</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
  <p class="eyebrow">App X-Ray</p>
  <h1>${esc(title)}${report.target.version ? ` <span class="ver">${esc(report.target.version)}</span>` : ""}</h1>
  <p class="meta">${electron ? `Electron ${esc(electron.version ?? "version unknown")} · ` : ""}${report.endpoints.length} addresses · ${report.modules.length} modules · ${report.ipcChannels.length} IPC channels</p>
  <ul class="tally">
    ${(["high", "medium", "low", "info"] as const).map((s) => `<li class="sev-${s}"><b>${counts[s]}</b> ${s}</li>`).join("")}
  </ul>
</header>

<section>
  <h2>Findings</h2>
  ${report.findings.length === 0 ? `<p class="empty">No rule matched.</p>` : report.findings.map(renderFinding).join("\n")}
</section>

<section>
  <h2>Network addresses</h2>
  ${table(
    ["Host", "Address", "How", "Where"],
    report.endpoints.map((e) => [e.host ?? "—", e.url, e.mechanism ?? "—", loc(e.location)]),
    "No literal network addresses found.",
  )}
</section>

<section>
  <h2>Modules</h2>
  ${table(
    ["Module", "Used by"],
    report.modules.map((m) => [m.specifier, m.importedBy.join(", ") || "—"]),
    "No module references found.",
  )}
</section>

<section>
  <h2>Windows and IPC</h2>
  ${table(
    ["Window", "webPreferences"],
    report.browserWindows.map((w) => [
      loc(w.location),
      w.webPreferences.map((p) => `${p.name}=${p.value === null ? "?" : String(p.value)}`).join(", ") || "defaults",
    ]),
    "No BrowserWindow found.",
  )}
  ${table(
    ["Channel", "Side", "Operation", "Where"],
    report.ipcChannels.map((c) => [c.channel, c.side, c.operation, loc(c.location)]),
    "No IPC channels found.",
  )}
</section>

<section>
  <h2>What this report cannot see</h2>
  <ul class="limits">${report.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
</section>

<footer>
  Generated ${esc(report.generatedAt)} by app-xray from ${esc(report.engine.name)} ${esc(report.engine.version)}
  (${esc(report.engine.operation)}${report.engine.evidenceId ? `, evidence ${esc(report.engine.evidenceId.slice(0, 15))}…` : ""}).
  Static analysis only: the app was not run. Findings describe what the code contains, not what it does at runtime.
</footer>
</main>
<script type="application/json" id="xray-data">${jsonForScript(report)}</script>
</body>
</html>
`;
}

function renderFinding(f: Finding): string {
  const where = f.locations.length ? `<p class="where">${f.locations.map((l) => esc(loc(l))).join(" · ")}</p>` : "";
  return `<article class="finding sev-${f.severity}">
  <p class="badge">${f.severity}</p>
  <div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${where}</div>
</article>`;
}

function table(head: string[], rows: string[][], empty: string): string {
  if (rows.length === 0) return `<p class="empty">${esc(empty)}</p>`;
  return `<div class="scroll"><table>
<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("\n")}</tbody>
</table></div>`;
}

function loc(l: SourceLocation | null): string {
  if (!l) return "—";
  return l.line !== undefined ? `${l.path}:${l.line}` : l.path;
}

function countBySeverity(findings: Finding[]) {
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// JSON inside <script> must not be able to close the tag.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1c1a;--muted:#6b675f;--line:#e4e0d8;--card:#fff;--high:#c2410c;--medium:#b45309;--low:#2563eb;--info:#6b675f}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--fg:#ece9e3;--muted:#a19d94;--line:#2e2c28;--card:#1f1e1b;--high:#fb923c;--medium:#fbbf24;--low:#60a5fa;--info:#a19d94}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 64px}
.eyebrow{margin:0;color:var(--muted);font-size:13px;letter-spacing:.08em;text-transform:uppercase}
h1{margin:4px 0 6px;font-size:30px}
.ver{color:var(--muted);font-weight:400;font-size:20px}
.meta{margin:0;color:var(--muted)}
.tally{display:flex;gap:8px;flex-wrap:wrap;list-style:none;padding:0;margin:16px 0 0}
.tally li{border:1px solid var(--line);border-radius:999px;padding:4px 12px;background:var(--card)}
.tally li.sev-high b{color:var(--high)}.tally li.sev-medium b{color:var(--medium)}.tally li.sev-low b{color:var(--low)}
section{margin-top:36px}
h2{font-size:18px;border-bottom:1px solid var(--line);padding-bottom:6px}
.finding{display:flex;gap:14px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--info);border-radius:8px;padding:12px 14px;margin:10px 0}
.finding.sev-high{border-left-color:var(--high)}.finding.sev-medium{border-left-color:var(--medium)}.finding.sev-low{border-left-color:var(--low)}
.finding h3{margin:0 0 4px;font-size:15px}.finding p{margin:0}
.badge{min-width:64px;font-size:12px;text-transform:uppercase;color:var(--muted);margin:2px 0 0!important}
.where{color:var(--muted);font:12px ui-monospace,monospace;margin-top:6px!important}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin:8px 0 16px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
td{font-family:ui-monospace,monospace;font-size:12.5px;word-break:break-all}
th{color:var(--muted);font-weight:600}
.empty,.limits{color:var(--muted)}
footer{margin-top:48px;color:var(--muted);font-size:12.5px}
`;

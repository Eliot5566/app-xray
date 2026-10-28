import type { AndroidFacts, Dependency, Finding, NativeFacts, Vulnerability, SourceLocation, XrayReport } from "../core/schema.js";
import { androidSubtitle, nativeSubtitle } from "./card.js";

export interface PageMeta {
  /** Absolute URL of this page, for link previews. */
  url?: string;
  /** Absolute URL of the 1200×630 summary image, for link previews. */
  image?: string;
  /** Link shown above the title, e.g. back to the gallery. */
  back?: { href: string; label: string };
  /** Source browser URL of the app folder; file locations become links to it. */
  sourceBase?: string;
  /** Markdown that embeds this report's badge in a README. */
  badgeMarkdown?: string;
}

export function renderHtml(report: XrayReport, meta: PageMeta = {}): string {
  const title = report.target.name ?? "Unnamed app";
  const counts = countBySeverity(report.findings);
  const electron = report.frameworks.find((f) => f.kind === "electron");
  const loc = (l: SourceLocation | null): Cell => locCell(l, meta.sourceBase);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · App X-Ray</title>
${previewTags(`${title} · App X-Ray`, summaryLine(report), meta)}<style>${CSS}</style>
</head>
<body>
<main>
<header>
  <p class="eyebrow">${meta.back ? `<a href="${esc(meta.back.href)}">${esc(meta.back.label)}</a> · ` : ""}App X-Ray</p>
  <h1>${esc(title)}${report.target.version ? ` <span class="ver">${esc(report.target.version)}</span>` : ""}</h1>
  <p class="meta">${
    report.native
      ? `${esc(nativeSubtitle(report))} · ${report.dependencies?.length ?? 0} libraries · ${report.endpoints.length} addresses`
      : report.android
      ? `${esc(androidSubtitle(report))} · ${report.android.package ? `${esc(report.android.package)} · ` : ""}${report.endpoints.length} addresses · ${report.android.permissions.length} permissions`
      : `${electron ? `Electron ${esc(electron.version ?? "version unknown")} · ` : ""}${report.endpoints.length} addresses · ${report.modules.length} modules · ${report.ipcChannels.length} IPC channels`
  }</p>
  <ul class="tally">
    ${(["high", "medium", "low", "info"] as const).map((s) => `<li class="sev-${s}"><b>${counts[s]}</b> ${s}</li>`).join("")}
  </ul>
</header>

<section>
  <h2>Findings</h2>
  ${report.findings.length === 0 ? `<p class="empty">No rule matched.</p>` : report.findings.map((f) => renderFinding(f, loc)).join("\n")}
</section>

<section>
  <h2>Network addresses</h2>
  ${table(
    ["Host", "Address", "How", "Where"],
    report.endpoints.map((e) => [e.host ?? "—", e.url, e.mechanism ?? "—", loc(e.location)]),
    "No literal network addresses found.",
  )}
</section>

${report.native ? nativeSections(report.native, report.dependencies ?? [], report.vulnerabilities) : report.android ? androidSections(report.android) : desktopSections(report, loc)}

${
  meta.badgeMarkdown
    ? `<section>
  <h2>README badge</h2>
  <p>Maintainers can show this report in their README:</p>
  <pre class="snippet">${esc(meta.badgeMarkdown)}</pre>
</section>

`
    : ""
}<section>
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

function desktopSections(report: XrayReport, loc: (l: SourceLocation | null) => Cell): string {
  return `<section>
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
  <h2>Remote pages, data and packaging</h2>
  ${table(
    ["Remote page loaded in a window"],
    report.remotePages.map((u) => [u]),
    "No remote pages are loaded into app windows.",
  )}
  ${table(
    ["Storage", "How", "Where"],
    report.storage.map((st) => [st.kind, st.mechanism ?? "—", loc(st.location)]),
    "No on-device storage calls found.",
  )}
  ${
    report.fuses
      ? table(
          ["Electron fuse", "State"],
          report.fuses.map((f) => [f.name, f.state]),
          "No fuses reported.",
        )
      : `<p class="empty">No packaged executable was found, so Electron fuses were not read.</p>`
  }
</section>

`;
}

function nativeSections(n: NativeFacts, deps: Dependency[], vulns: Vulnerability[] | undefined): string {
  const advisories = (d: Dependency) =>
    vulns === undefined ? "not checked" : vulns.filter((v) => v.package === d.name && v.version === d.version).map((v) => v.id).join(", ");
  return `<section>
  <h2>Libraries compiled in</h2>
  ${table(
    ["Library", "Version", "Replaced by", "Known vulnerabilities"],
    deps.map((d) => [d.name, d.version ?? "—", d.replacedBy ?? "", advisories(d)]),
    n.language ? "No libraries listed in the build metadata." : "This binary carries no Go or cargo-auditable library list.",
  )}
</section>

<section>
  <h2>Build</h2>
  ${table(
    ["Setting", "Value"],
    [["Format", n.format], ["Architecture", n.architecture ?? "—"], ...Object.entries(n.buildSettings)],
    "",
  )}
</section>`;
}

function androidSections(a: AndroidFacts): string {
  const c = a.components;
  return `<section>
  <h2>Permissions</h2>
  ${table(
    ["Permission", "Sensitive"],
    a.permissions.map((p) => [p, a.sensitivePermissions.includes(p) ? "yes" : ""]),
    "The app asks for no permissions.",
  )}
</section>

<section>
  <h2>SDKs compiled in</h2>
  ${table(
    ["SDK", "Category", "Classes", "Example class"],
    a.sdks.map((s) => [s.name, s.category, String(s.classes), s.example]),
    "No known analytics, advertising, session-recording or crash-reporting SDK found.",
  )}
</section>

<section>
  <h2>Manifest and packaging</h2>
  ${table(
    ["Fact", "Value"],
    [
      ["Package", a.package ?? "—"],
      ["Version code", a.versionCode === null ? "—" : String(a.versionCode)],
      ["Target / minimum API", `${a.targetSdk ?? "?"} / ${a.minSdk ?? "?"}`],
      ["Components", `${c.activities} activities, ${c.services} services, ${c.receivers} receivers, ${c.providers} providers (${c.exported} open to other apps)`],
      ["Debuggable", a.debuggable ? "yes" : "no"],
      ["Backup allowed", a.allowBackup === null ? "default (yes)" : a.allowBackup ? "yes" : "no"],
      ["Cleartext HTTP", a.usesCleartextTraffic === null ? "default" : a.usesCleartextTraffic ? "allowed" : "blocked"],
      ["Network security config", a.networkSecurityConfig ? "yes" : "no"],
      ["Advertising ID", a.usesAdvertisingId ? "can read it" : "no sign of it"],
      ["DEX classes", String(a.dexClasses)],
      ["Native libraries", a.nativeLibs.join(", ") || "none"],
    ],
    "",
  )}
</section>`;
}

/** One line for link previews: the severity tally and the Electron version. */
export function summaryLine(report: XrayReport): string {
  const counts = countBySeverity(report.findings);
  const electron = report.frameworks.find((f) => f.kind === "electron");
  const tally = (["high", "medium", "low"] as const).map((s) => `${counts[s]} ${s}`).join(", ");
  const platform = report.native ? `${nativeSubtitle(report)}. ` : report.android ? `${androidSubtitle(report)}. ` : electron ? `Electron ${electron.version ?? "version unknown"}. ` : "";
  return `${platform}Findings: ${tally}. Static analysis with ${report.engine.name === "rea-agents" ? "REA" : "app-xray"}.`;
}

/** Open Graph and Twitter tags, so a shared link shows the summary card. */
export function previewTags(title: string, description: string, meta: { url?: string; image?: string }): string {
  const tags = [
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
  ];
  if (meta.url) tags.push(`<meta property="og:url" content="${esc(meta.url)}">`);
  if (meta.image) {
    tags.push(
      `<meta property="og:image" content="${esc(meta.image)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    );
  }
  return `${tags.join("\n")}\n`;
}

function renderFinding(f: Finding, loc: (l: SourceLocation) => Cell): string {
  const where = f.locations.length ? `<p class="where">${f.locations.map((l) => cellHtml(loc(l))).join(" · ")}</p>` : "";
  return `<article class="finding sev-${f.severity}">
  <p class="badge">${f.severity}</p>
  <div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${where}</div>
</article>`;
}

/** A table cell: plain text, or text that links somewhere. */
type Cell = string | { text: string; href: string };

function cellHtml(c: Cell): string {
  return typeof c === "string" ? esc(c) : `<a href="${esc(c.href)}">${esc(c.text)}</a>`;
}

function table(head: string[], rows: Cell[][], empty: string): string {
  if (rows.length === 0) return `<p class="empty">${esc(empty)}</p>`;
  return `<div class="scroll"><table>
<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${cellHtml(c)}</td>`).join("")}</tr>`).join("\n")}</tbody>
</table></div>`;
}

function locCell(l: SourceLocation | null, sourceBase?: string): Cell {
  if (!l) return "—";
  const text = l.line !== undefined ? `${l.path}:${l.line}` : l.path;
  if (!sourceBase) return text;
  const href = `${sourceBase.replace(/\/$/, "")}/${l.path.split("/").map(encodeURIComponent).join("/")}${l.line !== undefined ? `#L${l.line}` : ""}`;
  return { text, href };
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
.eyebrow a{color:inherit}
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
td a,.where a{color:inherit;text-decoration-color:var(--line)}
td{font-family:ui-monospace,monospace;font-size:12.5px;word-break:break-all}
th{color:var(--muted);font-weight:600}
.empty,.limits{color:var(--muted)}
.snippet{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:12.5px ui-monospace,monospace;white-space:pre-wrap;word-break:break-all}
footer{margin-top:48px;color:var(--muted);font-size:12.5px}
`;

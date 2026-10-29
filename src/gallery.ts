import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Severity, XrayReport } from "./core/schema.js";
import { renderBadge } from "./report/badge.js";
import { androidSubtitle, renderCard } from "./report/card.js";
import { esc, previewTags, renderHtml } from "./report/html.js";
import { renderPng } from "./report/png.js";

// Builds the public gallery: a static site with one page per open-source app report and an index
// of all of them. Input is a folder of scan outputs (<name>/xray.json), as bench/run-corpus.mjs
// writes, plus its summary.json for each app's repository and commit.

export interface GalleryOptions {
  /** Absolute URL the site is served from, e.g. https://eliot5566.github.io/app-xray/. */
  baseUrl?: string;
  /** Repository that hosts app-xray, for the "report a mistake" link. */
  repo?: string;
  now?: Date;
}

interface CorpusEntry {
  name: string;
  /** Display name, e.g. "GitHub Desktop" where package.json says "desktop". */
  title?: string;
  repo?: string;
  path?: string;
  commit?: string;
  ok?: boolean;
}

export interface GalleryApp {
  slug: string;
  name: string;
  version: string | null;
  electron: string | null;
  /** Platform line shown under the name, e.g. "Electron 37.2.4" or "Android · targets API 33". */
  platform: string;
  source: string | null;
  counts: Record<Severity, number>;
}

const ORDER: Severity[] = ["high", "medium", "low", "info"];

export async function buildGallery(reportsDir: string, outDir: string, options: GalleryOptions = {}): Promise<GalleryApp[]> {
  const corpus = await readCorpus(reportsDir);
  const base = options.baseUrl ? options.baseUrl.replace(/\/?$/, "/") : undefined;
  const repo = options.repo ?? "Eliot5566/app-xray";
  const apps: GalleryApp[] = [];

  for (const entry of await readdir(reportsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const json = await readFile(path.join(reportsDir, entry.name, "xray.json"), "utf8").catch(() => null);
    if (json === null) continue;
    const slug = slugify(entry.name);
    const info = corpus.get(entry.name);
    const source = info?.repo
      ? `https://github.com/${info.repo}/tree/${info.commit ?? "HEAD"}/${info.path && info.path !== "." ? info.path : ""}`.replace(/\/$/, "")
      : null;
    // The scan machine's local path means nothing to readers; point at the source instead.
    const report = JSON.parse(json) as XrayReport;
    report.target.inputPath = source ?? entry.name;
    // Pages and cards show the app's familiar name; xray.json keeps the package name.
    const shown: XrayReport = info?.title ? { ...report, target: { ...report.target, name: info.title } } : report;

    const appDir = path.join(outDir, "apps", slug);
    await mkdir(appDir, { recursive: true });
    const pageUrl = base && `${base}apps/${slug}/`;
    const card = renderCard(shown);
    const png = await renderPng(card);
    await writeFile(path.join(appDir, "card.svg"), card);
    if (png) await writeFile(path.join(appDir, "card.png"), png);
    await writeFile(path.join(appDir, "badge.svg"), renderBadge(shown));
    await writeFile(path.join(appDir, "xray.json"), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(
      path.join(appDir, "index.html"),
      renderHtml(shown, {
        url: pageUrl,
        image: pageUrl && png ? `${pageUrl}card.png` : undefined,
        back: { href: "../../", label: "Gallery" },
        sourceBase: info?.repo ? `https://github.com/${info.repo}/blob/${info.commit ?? "HEAD"}/${info.path && info.path !== "." ? `${info.path}/` : ""}` : undefined,
        badgeMarkdown: pageUrl ? `[![App X-Ray](${pageUrl}badge.svg)](${pageUrl})` : undefined,
      }),
    );

    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of report.findings) counts[f.severity]++;
    apps.push({
      slug,
      name: shown.target.name ?? entry.name,
      version: report.target.version,
      electron: report.frameworks.find((f) => f.kind === "electron")?.version ?? null,
      platform: report.android
        ? androidSubtitle(report)
        : `Electron ${report.frameworks.find((f) => f.kind === "electron")?.version ?? "unknown"}`,
      source,
      counts,
    });
  }

  apps.sort((a, b) => {
    for (const s of ORDER) if (a.counts[s] !== b.counts[s]) return b.counts[s] - a.counts[s];
    return a.name.localeCompare(b.name);
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "gallery.json"), `${JSON.stringify(apps, null, 2)}\n`);
  await writeFile(path.join(outDir, "index.html"), renderIndex(apps, { base, repo, now: options.now ?? new Date() }));
  // GitHub Pages runs Jekyll unless told not to; nothing here needs it.
  await writeFile(path.join(outDir, ".nojekyll"), "");
  return apps;
}

async function readCorpus(reportsDir: string): Promise<Map<string, CorpusEntry>> {
  const text = await readFile(path.join(reportsDir, "summary.json"), "utf8").catch(() => null);
  const list = text ? (JSON.parse(text) as CorpusEntry[]) : [];
  return new Map(list.map((e) => [e.name, e]));
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
}

function renderIndex(apps: GalleryApp[], ctx: { base?: string; repo: string; now: Date }): string {
  const title = "App X-Ray gallery";
  const description = `Ingredients and privacy labels for ${apps.length} open-source apps: framework versions, trackers and SDKs, network addresses and security settings.`;
  const tiles = apps
    .map(
      (a) => `<li class="tile" data-name="${esc(a.name.toLowerCase())}">
  <a href="apps/${a.slug}/">
    <img src="apps/${a.slug}/card.png" alt="" width="1200" height="630" loading="lazy">
    <span class="name">${esc(a.name)}${a.version ? ` <span class="ver">${esc(a.version)}</span>` : ""}</span>
    <span class="meta">${esc(a.platform)}</span>
    <span class="pills">${ORDER.filter((s) => s !== "info")
      .map((s) => `<span class="pill sev-${s}${a.counts[s] ? " on" : ""}">${a.counts[s]} ${s}</span>`)
      .join("")}</span>
  </a>
</li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${previewTags(title, description, { url: ctx.base })}<style>${CSS}</style>
</head>
<body>
<main>
<header>
  <p class="eyebrow">App X-Ray</p>
  <h1>What's inside the apps you run</h1>
  <p class="lede">${esc(description)} Each report links every fact to the file and line it came from.</p>
  <pre class="snippet">npx github:${esc(ctx.repo)} scan /path/to/app</pre>
  <input id="q" type="search" placeholder="Filter apps" aria-label="Filter apps">
</header>
<ul class="grid" id="grid">
${tiles}
</ul>
<footer>
  <p>Only open-source apps are listed, scanned from their public source at the commit shown in each report.
  Static analysis only: the apps were not run, and a finding means the code contains something, not that it does it at runtime.
  Built with <a href="https://github.com/morluto/rea">REA</a>. Spotted a mistake? <a href="https://github.com/${esc(ctx.repo)}/issues/new">Open an issue</a>.</p>
  <p>Updated ${esc(ctx.now.toISOString().slice(0, 10))} · <a href="https://github.com/${esc(ctx.repo)}">Source</a></p>
</footer>
</main>
<script>
const q = document.getElementById("q");
q.addEventListener("input", () => {
  const term = q.value.trim().toLowerCase();
  for (const li of document.querySelectorAll("#grid .tile")) li.hidden = term !== "" && !li.dataset.name.includes(term);
});
</script>
</body>
</html>
`;
}

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1c1a;--muted:#6b675f;--line:#e4e0d8;--card:#fff;--high:#c2410c;--medium:#b45309;--low:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--fg:#ece9e3;--muted:#a19d94;--line:#2e2c28;--card:#1f1e1b;--high:#fb923c;--medium:#fbbf24;--low:#60a5fa}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1120px;margin:0 auto;padding:40px 16px 64px}
a{color:inherit}
.eyebrow{margin:0;color:var(--muted);font-size:13px;letter-spacing:.08em;text-transform:uppercase}
h1{margin:6px 0 8px;font-size:34px;line-height:1.15}
.lede{margin:0 0 16px;color:var(--muted);max-width:720px}
.snippet{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:13px ui-monospace,monospace;overflow-x:auto;margin:0 0 20px}
#q{width:100%;max-width:360px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit}
.grid{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.tile a{display:flex;flex-direction:column;gap:4px;height:100%;padding:10px 10px 14px;background:var(--card);border:1px solid var(--line);border-radius:12px;text-decoration:none}
.tile a:hover{border-color:var(--muted)}
.tile img{width:100%;height:auto;border-radius:6px;border:1px solid var(--line);margin-bottom:6px}
.name{font-weight:600;padding:0 4px}.ver{color:var(--muted);font-weight:400;font-size:13px}
.meta{color:var(--muted);font-size:13px;padding:0 4px}
.pills{display:flex;gap:6px;flex-wrap:wrap;padding:4px 4px 0}
.pill{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:1px 9px;color:var(--muted)}
.pill.on.sev-high{color:#fff;background:var(--high);border-color:var(--high)}
.pill.on.sev-medium{color:#fff;background:var(--medium);border-color:var(--medium)}
.pill.on.sev-low{color:#fff;background:var(--low);border-color:var(--low)}
footer{margin-top:48px;color:var(--muted);font-size:13px}
`;

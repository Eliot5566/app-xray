import type { Finding, Severity, XrayReport } from "../core/schema.js";
import { esc } from "./html.js";

// A 1200×630 summary image (the Open Graph size) for posting a report on social sites and in
// README badges. Colors are fixed rather than theme-aware, because the image leaves the page.

const W = 1200;
const H = 630;
const COLORS: Record<Severity, string> = { high: "#c2410c", medium: "#b45309", low: "#2563eb", info: "#6b675f" };
const ORDER: Severity[] = ["high", "medium", "low", "info"];

export function renderCard(report: XrayReport): string {
  const name = truncate(report.target.name ?? "Unnamed app", 28);
  const version = report.target.version ? truncate(report.target.version, 18) : "";
  const electron = report.frameworks.find((f) => f.kind === "electron");
  const support = report.findings.find((f) => f.ruleId === "electron-support");
  const android = report.android;
  const native = report.native;
  const subtitle = android
    ? androidSubtitle(report)
    : native
      ? nativeSubtitle(report)
      : electron
      ? `Electron ${electron.version ?? "version unknown"}${support && electron.version ? ` · ${supportNote(support)}` : ""}`
      : "Framework not identified";

  const hosts = new Set(report.endpoints.flatMap((e) => (e.host ? [e.host] : []))).size;
  const services = report.findings.filter((f) => f.ruleId === "known-services" || f.ruleId === "android-sdks").length;
  const stats: Array<[number | string, string]> = [
    // Most endpoints are paths or computed URLs, so the named hosts are counted separately.
    [report.endpoints.length, `endpoints · ${hosts} host${hosts === 1 ? "" : "s"}`],
    [services, services === 1 ? "known tracker or SDK" : "known trackers / SDKs"],
    ...((native
      ? [
          [report.dependencies?.length ?? 0, native.language === "rust" ? "crates" : "modules"],
          report.vulnerabilities
            ? [report.vulnerabilities.length, report.vulnerabilities.length === 1 ? "known vulnerability" : "known vulnerabilities"]
            : ["—", "CVEs not checked"],
        ]
      : android
      ? [
          [android.sensitivePermissions.length, android.sensitivePermissions.length === 1 ? "sensitive permission" : "sensitive permissions"],
          [android.components.exported, android.components.exported === 1 ? "open component" : "open components"],
        ]
      : [
          [report.remotePages.length, report.remotePages.length === 1 ? "remote page shown" : "remote pages shown"],
          [report.ipcChannels.length, report.ipcChannels.length === 1 ? "IPC channel" : "IPC channels"],
        ]) as Array<[number | string, string]>),
  ];

  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of report.findings) counts[f.severity]++;
  const top = report.findings.filter((f) => f.severity !== "info").slice(0, 3);

  const tileW = 255;
  const tiles = stats
    .map(([value, label], i) => {
      const x = 64 + i * (tileW + 16);
      return `<g transform="translate(${x} 214)">
  <rect width="${tileW}" height="128" rx="14" fill="#ffffff" stroke="#e4e0d8"/>
  <text x="22" y="66" font-size="48" font-weight="700" fill="#1d1c1a">${value}</text>
  <text x="22" y="102" font-size="20" fill="#6b675f">${esc(label)}</text>
</g>`;
    })
    .join("\n");

  let pillX = 64;
  const pills = ORDER.map((s) => {
    const label = `${counts[s]} ${s}`;
    const w = 28 + label.length * 12;
    const pill = `<g transform="translate(${pillX} 372)">
  <rect width="${w}" height="40" rx="20" fill="${counts[s] && s !== "info" ? COLORS[s] : "#ffffff"}" stroke="${counts[s] && s !== "info" ? COLORS[s] : "#e4e0d8"}"/>
  <text x="${w / 2}" y="27" font-size="20" font-weight="600" text-anchor="middle" fill="${counts[s] && s !== "info" ? "#ffffff" : "#6b675f"}">${label}</text>
</g>`;
    pillX += w + 10;
    return pill;
  }).join("\n");

  const findings = top.length
    ? top.map((f, i) => findingLine(f, 448 + i * 40)).join("\n")
    : `<text x="64" y="472" font-size="22" fill="#6b675f">No high, medium or low findings.</text>`;

  const date = report.generatedAt.slice(0, 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" role="img" aria-label="${esc(`App X-Ray summary for ${name}`)}">
<rect width="${W}" height="${H}" fill="#fbfaf7"/>
<rect width="${W}" height="8" fill="${COLORS[ORDER.find((s) => s !== "info" && counts[s] > 0) ?? "info"]}"/>
<text x="64" y="76" font-size="20" font-weight="600" letter-spacing="3" fill="#6b675f">APP X-RAY</text>
<text x="64" y="138" font-size="56" font-weight="700" fill="#1d1c1a">${esc(name)}${version ? `<tspan font-size="30" font-weight="400" fill="#6b675f" dx="16">${esc(version)}</tspan>` : ""}</text>
<text x="64" y="184" font-size="24" fill="#6b675f">${esc(subtitle)}</text>
${tiles}
${pills}
${findings}
<text x="64" y="${H - 36}" font-size="17" fill="#8a857c">Static analysis with ${esc(report.engine.name)} ${esc(report.engine.version)} on ${esc(date)}. Shows what the code contains, not what it sends.</text>
</svg>
`;
}

function findingLine(f: Finding, y: number): string {
  return `<g transform="translate(64 ${y})">
  <circle cx="8" cy="16" r="7" fill="${COLORS[f.severity]}"/>
  <text x="28" y="24" font-size="23" fill="#1d1c1a">${esc(truncate(f.title, 78))}</text>
</g>`;
}

const FRAMEWORK_NAMES: Partial<Record<string, string>> = {
  flutter: "Flutter",
  "react-native": "React Native",
  unity: "Unity",
  xamarin: "Xamarin",
  cordova: "Cordova",
  capacitor: "Capacitor",
};

/** "Go 1.26.1 · linux/amd64 · ELF" */
export function nativeSubtitle(report: XrayReport): string {
  const n = report.native!;
  const lang = report.frameworks.find((f) => f.kind === "go" || f.kind === "rust");
  const parts = [lang ? `${lang.kind === "go" ? "Go" : "Rust"}${lang.version ? ` ${lang.version}` : ""}` : "Native executable"];
  const os = n.buildSettings["GOOS"];
  if (os || n.architecture) parts.push([os, n.architecture].filter(Boolean).join("/"));
  parts.push(n.format === "macho" ? "Mach-O" : n.format.toUpperCase());
  return parts.join(" · ");
}

/** "Android · targets API 33 · min API 21 · Flutter" */
export function androidSubtitle(report: XrayReport): string {
  const a = report.android!;
  const parts = ["Android"];
  if (a.targetSdk !== null) parts.push(`targets API ${a.targetSdk}`);
  if (a.minSdk !== null) parts.push(`min API ${a.minSdk}`);
  for (const f of report.frameworks) if (FRAMEWORK_NAMES[f.kind]) parts.push(FRAMEWORK_NAMES[f.kind]!);
  return parts.join(" · ");
}

function supportNote(f: Finding): string {
  if (f.severity === "info") return "supported";
  return f.severity === "high" ? "long out of support" : "out of support";
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

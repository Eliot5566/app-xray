import type { XrayReport } from "./core/schema.js";
import { esc } from "./report/html.js";

// Compares two reports of the same app, e.g. the last release and this pull request, and lists
// what a reviewer should look at: new servers the code talks to, new packages, new tracking
// services, weakened window settings and Electron upgrades or downgrades. Built for PR comments
// and the GitHub Action; also the basis for catching supply-chain surprises between releases.

export interface SetChange {
  added: string[];
  removed: string[];
}

export interface XrayDiff {
  app: string;
  electron: { before: string | null; after: string | null } | null;
  hosts: SetChange;
  urls: SetChange;
  packages: SetChange;
  services: SetChange;
  remotePages: SetChange;
  ipcChannels: SetChange;
  /** Android permissions (APK reports). */
  permissions: SetChange;
  /** Libraries whose version changed (Go/Rust executables), as "name before → after". */
  versions: string[];
  findings: SetChange;
  fuses: Array<{ name: string; before: string | null; after: string | null }>;
  nativeAddonBindings: { before: number; after: number };
  /** Findings at high or medium severity that the new report has and the old one does not. */
  newSerious: string[];
}

export function diffReports(before: XrayReport, after: XrayReport): XrayDiff {
  const electronOf = (r: XrayReport) => r.frameworks.find((f) => f.kind === "electron")?.version ?? null;
  const eb = electronOf(before);
  const ea = electronOf(after);
  const findingKey = (f: XrayReport["findings"][number]) => `[${f.severity}] ${f.title}`;
  const findings = change(before.findings.map(findingKey), after.findings.map(findingKey));
  const fuseNames = [...new Set([...(before.fuses ?? []), ...(after.fuses ?? [])].map((f) => f.name))].sort();
  const fuseState = (r: XrayReport, name: string) => r.fuses?.find((f) => f.name === name)?.state ?? null;

  return {
    app: after.target.name ?? before.target.name ?? "app",
    electron: eb === ea ? null : { before: eb, after: ea },
    hosts: change(hostsOf(before), hostsOf(after)),
    urls: change(urlsOf(before), urlsOf(after)),
    packages: change(packagesOf(before), packagesOf(after)),
    services: change(servicesOf(before), servicesOf(after)),
    remotePages: change(before.remotePages, after.remotePages),
    ipcChannels: change(
      before.ipcChannels.map((c) => c.channel),
      after.ipcChannels.map((c) => c.channel),
    ),
    permissions: change(before.android?.permissions ?? [], after.android?.permissions ?? []),
    versions: versionChanges(before, after),
    findings,
    fuses: fuseNames
      .map((name) => ({ name, before: fuseState(before, name), after: fuseState(after, name) }))
      .filter((f) => f.before !== f.after),
    nativeAddonBindings: { before: before.nativeAddonBindings, after: after.nativeAddonBindings },
    newSerious: after.findings
      .filter((f) => (f.severity === "high" || f.severity === "medium") && findings.added.includes(findingKey(f)))
      .map(findingKey),
  };
}

export function isEmptyDiff(d: XrayDiff): boolean {
  const sets = [d.hosts, d.urls, d.packages, d.services, d.remotePages, d.ipcChannels, d.permissions, d.findings];
  return (
    d.electron === null &&
    d.versions.length === 0 &&
    d.fuses.length === 0 &&
    d.nativeAddonBindings.before === d.nativeAddonBindings.after &&
    sets.every((s) => s.added.length === 0 && s.removed.length === 0)
  );
}

/** Conditions a CI job can fail on, e.g. --fail-on new-host,new-service. */
export const FAIL_CONDITIONS = ["new-host", "new-service", "new-package", "new-permission", "new-serious", "electron-downgrade"] as const;
export type FailCondition = (typeof FAIL_CONDITIONS)[number];

export function failures(d: XrayDiff, on: FailCondition[]): string[] {
  const out: string[] = [];
  if (on.includes("new-host") && d.hosts.added.length) out.push(`new hosts: ${d.hosts.added.join(", ")}`);
  if (on.includes("new-service") && d.services.added.length) out.push(`new services: ${d.services.added.join(", ")}`);
  if (on.includes("new-package") && d.packages.added.length) out.push(`new packages: ${d.packages.added.join(", ")}`);
  if (on.includes("new-permission") && d.permissions.added.length) out.push(`new permissions: ${d.permissions.added.join(", ")}`);
  if (on.includes("new-serious") && d.newSerious.length) out.push(`new findings: ${d.newSerious.join("; ")}`);
  if (on.includes("electron-downgrade") && d.electron && compareVersions(d.electron.after, d.electron.before) < 0) {
    out.push(`Electron downgraded from ${d.electron.before} to ${d.electron.after}`);
  }
  return out;
}

const MARKER = "<!-- app-xray-diff -->";
const LIST_LIMIT = 25;

/** Markdown for a pull request comment. The first line is a marker so a bot can update its comment. */
export function renderMarkdown(d: XrayDiff, opts: { title?: string; reportUrl?: string } = {}): string {
  const lines = [MARKER, `### ${opts.title ?? `App X-Ray: what changed in ${d.app}`}`, ""];
  if (isEmptyDiff(d)) {
    lines.push("No change in servers, packages, services, permissions, window settings or framework version.");
  } else {
    if (d.newSerious.length) {
      lines.push(`**New high or medium findings:** ${d.newSerious.map(md).join("; ")}`, "");
    }
    lines.push("| | Added | Removed |", "| --- | --- | --- |");
    if (d.electron) lines.push(`| Electron | ${md(d.electron.after ?? "unknown")} | ${md(d.electron.before ?? "unknown")} |`);
    const rows: Array<[string, SetChange]> = [
      ["Server hosts", d.hosts],
      ["Known trackers / SDKs", d.services],
      ["Packages", d.packages],
      ["Remote pages in windows", d.remotePages],
      ["IPC channels", d.ipcChannels],
      ["Android permissions", d.permissions],
      ["Findings", d.findings],
    ];
    for (const [label, s] of rows) {
      if (s.added.length || s.removed.length) lines.push(`| ${label} | ${list(s.added)} | ${list(s.removed)} |`);
    }
    if (d.versions.length) lines.push(`| Library versions | ${list(d.versions)} | |`);
    for (const f of d.fuses) lines.push(`| Fuse ${md(f.name)} | ${md(f.after ?? "absent")} | ${md(f.before ?? "absent")} |`);
    if (d.nativeAddonBindings.before !== d.nativeAddonBindings.after) {
      lines.push(`| Native add-on bindings | ${d.nativeAddonBindings.after} | ${d.nativeAddonBindings.before} |`);
    }
    if (d.urls.added.length) {
      lines.push("", `<details><summary>${d.urls.added.length} new address${d.urls.added.length === 1 ? "" : "es"}</summary>`, "");
      for (const u of d.urls.added.slice(0, 100)) lines.push(`- \`${u.replaceAll("`", "")}\``);
      lines.push("", "</details>");
    }
  }
  lines.push(
    "",
    `<sub>Static analysis with [App X-Ray](https://github.com/Eliot5566/app-xray)${opts.reportUrl ? ` · [full report](${opts.reportUrl})` : ""}. Shows what the code contains, not what it sends.</sub>`,
  );
  return `${lines.join("\n")}\n`;
}

function list(items: string[]): string {
  if (items.length === 0) return "—";
  const shown = items.slice(0, LIST_LIMIT).map((i) => `\`${i.replaceAll("`", "").replaceAll("|", "\\|")}\``);
  return items.length > LIST_LIMIT ? `${shown.join(", ")} and ${items.length - LIST_LIMIT} more` : shown.join(", ");
}

// Table cells: no pipes or line breaks, and no HTML from the app's code.
function md(text: string): string {
  return esc(text).replaceAll("|", "\\|").replace(/\s+/g, " ");
}

function change(before: Iterable<string>, after: Iterable<string>): SetChange {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: [...a].filter((x) => !b.has(x)).sort(),
    removed: [...b].filter((x) => !a.has(x)).sort(),
  };
}

function hostsOf(r: XrayReport): string[] {
  return r.endpoints.flatMap((e) => (e.host ? [e.host.toLowerCase()] : []));
}

function urlsOf(r: XrayReport): string[] {
  return r.endpoints.flatMap((e) => (e.host ? [e.url] : []));
}

function servicesOf(r: XrayReport): string[] {
  return r.findings.filter((f) => f.ruleId === "known-services" || f.ruleId === "android-sdks").map((f) => f.title);
}

function versionChanges(before: XrayReport, after: XrayReport): string[] {
  const old = new Map((before.dependencies ?? []).map((d) => [d.name, d.version]));
  return (after.dependencies ?? [])
    .filter((d) => old.has(d.name) && old.get(d.name) !== d.version)
    .map((d) => `${d.name} ${old.get(d.name) ?? "?"} → ${d.version ?? "?"}`);
}

/** The package a module specifier comes from: "lodash/fp" → "lodash", "@a/b/c" → "@a/b". Relative imports are the app's own code. */
export function packageOf(specifier: string): string | null {
  if (/^[./]/.test(specifier) || specifier.includes("${") || /\s/.test(specifier)) return null;
  if (specifier.startsWith("node:")) return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function packagesOf(r: XrayReport): string[] {
  return [
    ...r.modules.flatMap((m) => {
      const p = packageOf(m.specifier);
      return p ? [p] : [];
    }),
    // Go modules and Rust crates compiled into an executable.
    ...(r.dependencies ?? []).map((d) => d.name),
  ];
}

function compareVersions(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

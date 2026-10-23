import type { Severity, XrayReport } from "../core/schema.js";
import { esc } from "./html.js";

// A shields.io-style badge for a README: "app x-ray | 2 high". Fixed metrics for Verdana 11px,
// the same approximation shields.io uses, so it renders the same everywhere.

const COLORS: Record<Severity | "none", string> = {
  high: "#c2410c",
  medium: "#b45309",
  low: "#2563eb",
  info: "#2f855a",
  none: "#2f855a",
};

export function badgeMessage(report: XrayReport): { text: string; severity: Severity | "none" } {
  for (const severity of ["high", "medium", "low"] as const) {
    const n = report.findings.filter((f) => f.severity === severity).length;
    if (n > 0) return { text: `${n} ${severity}`, severity };
  }
  return { text: "no issues found", severity: "none" };
}

export function renderBadge(report: XrayReport): string {
  const label = "app x-ray";
  const { text, severity } = badgeMessage(report);
  const lw = textWidth(label) + 12;
  const mw = textWidth(text) + 12;
  const w = lw + mw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(`${label}: ${text}`)}">
<title>${esc(`${label}: ${text}`)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${mw}" height="20" fill="${COLORS[severity]}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw / 2}" y="14">${esc(label)}</text>
<text x="${lw + mw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(text)}</text><text x="${lw + mw / 2}" y="14">${esc(text)}</text>
</g>
</svg>
`;
}

// Average Verdana 11px advance is about 6.5px for lowercase text and digits.
function textWidth(text: string): number {
  return Math.round(text.length * 6.5);
}

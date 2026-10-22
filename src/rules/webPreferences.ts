import type { Finding, Severity } from "../core/schema.js";
import type { Rule } from "./types.js";

// Literal webPreferences values that weaken Electron's renderer isolation.
const RISKY: Array<{ name: string; value: boolean; severity: Severity; why: string }> = [
  { name: "nodeIntegration", value: true, severity: "high", why: "web content can call Node.js APIs directly" },
  { name: "contextIsolation", value: false, severity: "high", why: "page scripts share a JavaScript world with the preload script" },
  { name: "webSecurity", value: false, severity: "high", why: "the same-origin policy is turned off" },
  { name: "allowRunningInsecureContent", value: true, severity: "high", why: "HTTPS pages may run scripts loaded over HTTP" },
  { name: "sandbox", value: false, severity: "medium", why: "the renderer runs without Chromium's OS sandbox" },
];

export const webPreferencesRule: Rule = {
  id: "electron-web-preferences",
  description: "BrowserWindow settings that weaken Electron's security model.",
  check(report) {
    const findings: Finding[] = [];
    for (const risky of RISKY) {
      const windows = report.browserWindows.filter((w) =>
        w.webPreferences.some((p) => p.name === risky.name && p.value === risky.value),
      );
      if (windows.length === 0) continue;
      findings.push({
        ruleId: this.id,
        severity: risky.severity,
        title: `${risky.name}: ${risky.value}`,
        detail: `${windows.length} window${windows.length === 1 ? "" : "s"} set ${risky.name} to ${risky.value}, so ${risky.why}.`,
        locations: windows.flatMap((w) => (w.location ? [w.location] : [])),
      });
    }
    return findings;
  },
};

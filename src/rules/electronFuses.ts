import type { Finding, Severity } from "../core/schema.js";
import type { Rule } from "./types.js";

// Fuses are flipped at package time; Electron ships them in the permissive state, so these
// findings mean the app kept a default it could have hardened.
const RISKY: Array<{ name: string; state: string; severity: Severity; why: string }> = [
  {
    name: "RunAsNode",
    state: "enabled",
    severity: "medium",
    why: "ELECTRON_RUN_AS_NODE turns the app's signed executable into a plain Node.js runtime, which can be used to run code under the app's identity and permissions",
  },
  {
    name: "EnableNodeOptionsEnvironmentVariable",
    state: "enabled",
    severity: "low",
    why: "NODE_OPTIONS can inject code into the main process at launch",
  },
  {
    name: "EnableNodeCliInspectArguments",
    state: "enabled",
    severity: "low",
    why: "--inspect lets anyone who can launch the app attach a debugger to its main process",
  },
  {
    name: "EnableEmbeddedAsarIntegrityValidation",
    state: "disabled",
    severity: "low",
    why: "app.asar is not checked against its build-time hash, so edits to it go unnoticed",
  },
  {
    name: "OnlyLoadAppFromAsar",
    state: "disabled",
    severity: "low",
    why: "the app also loads code from an unpacked app/ folder, which bypasses ASAR integrity checks",
  },
];

export const electronFusesRule: Rule = {
  id: "electron-fuses",
  description: "Electron fuses left in their permissive default state in the packaged executable.",
  check(report) {
    if (!report.fuses) return [];
    const findings: Finding[] = [];
    for (const risky of RISKY) {
      const fuse = report.fuses.find((f) => f.name === risky.name);
      if (fuse?.state !== risky.state) continue;
      findings.push({
        ruleId: this.id,
        severity: risky.severity,
        title: `Fuse ${risky.name} is ${risky.state}`,
        detail: `${risky.why}.`,
        locations: [],
      });
    }
    return findings;
  },
};

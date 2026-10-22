import type { Finding, Severity, XrayReport } from "../core/schema.js";
import { electronSupportRule } from "./electronSupport.js";
import { plainHttpRule } from "./plainHttp.js";
import { trackersRule } from "./trackers.js";
import type { Rule } from "./types.js";
import { webPreferencesRule } from "./webPreferences.js";

export type { Rule } from "./types.js";

export function defaultRules(): Rule[] {
  return [electronSupportRule(), webPreferencesRule, trackersRule(), plainHttpRule];
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function applyRules(report: XrayReport, rules: Rule[] = defaultRules()): XrayReport {
  const findings: Finding[] = rules.flatMap((rule) => rule.check(report));
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return { ...report, findings };
}

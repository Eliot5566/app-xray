import type { Finding, Severity, XrayReport } from "../core/schema.js";
import { androidManifestRule, androidPermissionsRule, androidSdksRule } from "./android.js";
import { electronFusesRule } from "./electronFuses.js";
import { electronSupportRule } from "./electronSupport.js";
import { localStorageRule, nativeAddonsRule } from "./ingredients.js";
import { dynamicIpcChannelsRule, ipcSenderValidationRule } from "./ipc.js";
import { goBuildRule, goSupportRule, knownVulnerabilitiesRule } from "./native.js";
import { plainHttpRule } from "./plainHttp.js";
import { remoteContentRule } from "./remoteContent.js";
import { trackersRule } from "./trackers.js";
import type { Rule } from "./types.js";
import { webPreferencesRule } from "./webPreferences.js";

export type { Rule } from "./types.js";

export function defaultRules(): Rule[] {
  return [
    electronSupportRule(),
    electronFusesRule,
    webPreferencesRule,
    remoteContentRule,
    ipcSenderValidationRule,
    dynamicIpcChannelsRule,
    trackersRule(),
    plainHttpRule,
    localStorageRule,
    nativeAddonsRule,
    androidSdksRule,
    androidPermissionsRule,
    androidManifestRule,
    goSupportRule(),
    goBuildRule,
    knownVulnerabilitiesRule,
  ];
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function applyRules(report: XrayReport, rules: Rule[] = defaultRules()): XrayReport {
  const findings: Finding[] = rules.flatMap((rule) => rule.check(report));
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return { ...report, findings };
}

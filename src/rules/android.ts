import type { Finding } from "../core/schema.js";
import type { Rule } from "./types.js";

// Rules over the facts read from an APK (report.android). They do nothing for other inputs.

/** Google Play's minimum targetSdk for new apps and updates (API 35 since 31 August 2025). */
export const PLAY_MIN_TARGET_SDK = 35;

export const androidSdksRule: Rule = {
  id: "android-sdks",
  description: "Analytics, advertising, session-recording and crash-reporting SDKs compiled into an APK.",
  check(report) {
    return (report.android?.sdks ?? []).map((sdk) => ({
      ruleId: this.id,
      severity: sdk.category === "advertising" || sdk.category === "session-recording" ? "medium" : "low",
      title: `${sdk.name} (${sdk.category})`,
      detail: `${sdk.classes} class${sdk.classes === 1 ? "" : "es"} of ${sdk.name} are compiled in, e.g. ${sdk.example}. Presence in code does not prove the SDK is active or sends data.`,
      locations: [],
    }));
  },
};

export const androidPermissionsRule: Rule = {
  id: "android-permissions",
  description: "Permissions the user must grant at runtime or in system settings.",
  check(report) {
    const sensitive = report.android?.sensitivePermissions ?? [];
    if (sensitive.length === 0) return [];
    return [
      {
        ruleId: this.id,
        severity: "low",
        title: `Asks for ${sensitive.length} sensitive permission${sensitive.length === 1 ? "" : "s"}`,
        detail: `${sensitive.map((p) => p.replace("android.permission.", "")).join(", ")}. Android asks the user before granting these; the manifest shows what the app may ask for, not what it uses.`,
        locations: [{ path: "AndroidManifest.xml" }],
      },
    ];
  },
};

export const androidManifestRule: Rule = {
  id: "android-manifest",
  description: "Security-relevant flags in an APK's manifest.",
  check(report) {
    const a = report.android;
    if (!a) return [];
    const at = [{ path: "AndroidManifest.xml" }];
    const findings: Finding[] = [];
    if (a.debuggable) {
      findings.push({
        ruleId: this.id,
        severity: "high",
        title: "Built as debuggable",
        detail: "android:debuggable is true: anyone with the phone over USB can attach a debugger and read the app's private data. Release builds should not set it.",
        locations: at,
      });
    }
    if (a.usesCleartextTraffic === true) {
      findings.push({
        ruleId: this.id,
        severity: "low",
        title: "Allows unencrypted HTTP",
        detail: "android:usesCleartextTraffic is true, so the app may send traffic over plain HTTP.",
        locations: at,
      });
    }
    if (a.targetSdk !== null && a.targetSdk < PLAY_MIN_TARGET_SDK) {
      findings.push({
        ruleId: this.id,
        severity: "low",
        title: `Targets Android API ${a.targetSdk}`,
        detail: `Apps targeting an older API keep older, looser platform behavior. Since August 2025 Google Play requires API ${PLAY_MIN_TARGET_SDK} for new apps and updates.`,
        locations: at,
      });
    }
    if (a.usesAdvertisingId) {
      findings.push({
        ruleId: this.id,
        severity: "low",
        title: "Can read the advertising ID",
        detail: "The app declares the AD_ID permission or includes Google's advertising ID client, which gives a device-wide ID used for ad tracking.",
        locations: at,
      });
    }
    if (a.allowBackup !== false) {
      findings.push({
        ruleId: this.id,
        severity: "info",
        title: "App data can be backed up",
        detail: `android:allowBackup is ${a.allowBackup === null ? "not set (defaults to true)" : "true"}, so app data may be included in cloud or device-to-device backups.`,
        locations: at,
      });
    }
    if (a.components.exported > 0) {
      findings.push({
        ruleId: this.id,
        severity: "info",
        title: `${a.components.exported} component${a.components.exported === 1 ? "" : "s"} open to other apps`,
        detail: "Activities, services, receivers or providers that other apps can start without a permission. The launcher activity is one of them in most apps.",
        locations: at,
      });
    }
    return findings;
  },
};

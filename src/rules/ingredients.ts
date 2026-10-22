import type { Rule } from "./types.js";

// Informational "ingredients": not problems, but part of what the label should say.

export const localStorageRule: Rule = {
  id: "local-data",
  description: "Where the app keeps data on the device.",
  check(report) {
    if (report.storage.length === 0) return [];
    const kinds = new Map<string, number>();
    for (const s of report.storage) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    const list = [...kinds].map(([kind, n]) => `${kind} (${n} use${n === 1 ? "" : "s"})`).join(", ");
    return [
      {
        ruleId: this.id,
        severity: "info",
        title: "Stores data on this device",
        detail: `Uses ${list}.`,
        locations: report.storage.flatMap((s) => (s.location ? [s.location] : [])),
      },
    ];
  },
};

export const nativeAddonsRule: Rule = {
  id: "native-addons",
  description: "Native Node.js add-ons the app loads.",
  check(report) {
    const n = report.nativeAddonBindings;
    if (n === 0) return [];
    return [
      {
        ruleId: this.id,
        severity: "info",
        title: "Loads native code",
        detail: `${n} native add-on binding${n === 1 ? "" : "s"}. Native add-ons run outside JavaScript's memory safety and are a common place for vulnerabilities.`,
        locations: [],
      },
    ];
  },
};

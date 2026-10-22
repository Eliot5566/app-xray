import type { Finding } from "../core/schema.js";
import { loadData } from "./data.js";
import type { Rule } from "./types.js";

interface ElectronReleases {
  snapshotDate: string;
  supportedMajors: number;
  majors: Record<string, string>;
}

export function electronSupportRule(releases = loadData<ElectronReleases>("electron-releases.json")): Rule {
  const latest = Math.max(...Object.keys(releases.majors).map(Number));
  const oldestSupported = latest - releases.supportedMajors + 1;

  return {
    id: "electron-support",
    description: "Whether the bundled Electron (and its Chromium) still receives security fixes.",
    check(report) {
      const findings: Finding[] = [];
      for (const fw of report.frameworks.filter((f) => f.kind === "electron")) {
        if (!fw.version) {
          findings.push({
            ruleId: this.id,
            severity: "info",
            title: "Electron version unknown",
            detail: "The app uses Electron, but its version could not be read from package.json, a version file or the macOS framework.",
            locations: [],
          });
          continue;
        }
        const major = Number(fw.version.split(".")[0]);
        const chromium = report.frameworks.find((f) => f.kind === "chromium")?.version;
        const bundled = chromium ? `Its bundled Chromium ${chromium} misses every fix since.` : "Its bundled Chromium misses every fix since.";
        const behind = oldestSupported - major;
        const asOf = `as of ${releases.snapshotDate}, Electron ${oldestSupported}–${latest} are supported`;
        if (behind <= 0) {
          findings.push({
            ruleId: this.id,
            severity: "info",
            title: `Electron ${fw.version} is supported`,
            detail: `${asOf}.`,
            locations: [],
          });
        } else {
          findings.push({
            ruleId: this.id,
            severity: behind >= 6 ? "high" : "medium",
            title: `Electron ${fw.version} no longer receives security fixes`,
            detail: `${behind} major version${behind === 1 ? "" : "s"} behind the oldest supported line (${asOf}). ${bundled}`,
            locations: [],
          });
        }
      }
      return findings;
    },
  };
}

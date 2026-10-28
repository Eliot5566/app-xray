import type { Finding, Severity, Vulnerability } from "../core/schema.js";
import { loadData } from "./data.js";
import type { Rule } from "./types.js";

// Rules over native executables: Go toolchain support, build settings and known-vulnerable
// libraries (when the scan looked them up in OSV).

interface GoReleases {
  asOf: string;
  releases: Array<{ version: string; date: string }>;
}

/** The Go team supports the two newest major releases. */
export function goSupportRule(data = loadData<GoReleases>("go-releases.json")): Rule {
  return {
    id: "go-support",
    description: "Go toolchain version, and whether that release still gets security fixes.",
    check(report) {
      const go = report.frameworks.find((f) => f.kind === "go");
      const major = go?.version ? /^(\d+\.\d+)/.exec(go.version)?.[1] : null;
      if (!go?.version || !major) return [];
      const index = data.releases.findIndex((r) => r.version === major);
      const at = [{ path: report.target.inputPath.split(/[\\/]/).at(-1) ?? "binary" }];
      if (index === -1 && compare(major, data.releases[0]!.version) > 0) {
        return [{ ruleId: this.id, severity: "info", title: `Built with Go ${go.version}`, detail: `Newer than the release list (as of ${data.asOf}).`, locations: at }];
      }
      if (index >= 0 && index < 2) {
        return [{ ruleId: this.id, severity: "info", title: `Built with Go ${go.version} (supported)`, detail: `Go ${major} still receives security fixes (as of ${data.asOf}).`, locations: at }];
      }
      const behind = index === -1 ? data.releases.length : index;
      return [
        {
          ruleId: this.id,
          severity: behind >= 4 ? "high" : "medium",
          title: `Built with Go ${go.version}, which no longer gets security fixes`,
          detail: `Go supports only its two newest releases (${data.releases[0]!.version} and ${data.releases[1]!.version} as of ${data.asOf}). Fixes to the standard library, such as net/http and crypto/tls, reach this binary only when it is rebuilt with a newer Go.`,
          locations: at,
        },
      ];
    },
  };
}

function compare(a: string, b: string): number {
  const [am, an] = a.split(".").map(Number);
  const [bm, bn] = b.split(".").map(Number);
  return am! - bm! || an! - bn!;
}

export const goBuildRule: Rule = {
  id: "go-build",
  description: "Notable Go build settings: uncommitted source changes and cgo.",
  check(report) {
    const s = report.native?.buildSettings ?? {};
    const findings: Finding[] = [];
    if (s["vcs.modified"] === "true") {
      findings.push({
        ruleId: this.id,
        severity: "info",
        title: "Built from uncommitted changes",
        detail: `vcs.modified=true: the source tree had local edits at build time${s["vcs.revision"] ? ` (on top of ${s["vcs.revision"].slice(0, 12)})` : ""}, so the published source may not match this binary.`,
        locations: [],
      });
    }
    if (s["CGO_ENABLED"] === "1") {
      findings.push({
        ruleId: this.id,
        severity: "info",
        title: "Uses cgo",
        detail: "CGO_ENABLED=1: the binary links C code, whose libraries are not listed in Go's module data.",
        locations: [],
      });
    }
    const replaced = (report.dependencies ?? []).filter((d) => d.replacedBy);
    if (replaced.length) {
      findings.push({
        ruleId: this.id,
        severity: "info",
        title: `${replaced.length} replaced module${replaced.length === 1 ? "" : "s"}`,
        detail: `${replaced.map((d) => `${d.name} → ${d.replacedBy}`).join(", ")}. Replaced modules are forks or local copies, so advisories for the original may not apply, and fixes may not either.`,
        locations: [],
      });
    }
    return findings;
  },
};

const RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, MEDIUM: 2, LOW: 1 };

export const knownVulnerabilitiesRule: Rule = {
  id: "known-vulnerabilities",
  description: "Libraries whose exact version has a published advisory in OSV (scan with --osv).",
  check(report) {
    const byPackage = new Map<string, Vulnerability[]>();
    for (const v of report.vulnerabilities ?? []) {
      const key = `${v.package}@${v.version}`;
      byPackage.set(key, [...(byPackage.get(key) ?? []), v]);
    }
    return [...byPackage].map(([key, vulns]) => {
      const worst = Math.max(...vulns.map((v) => RANK[v.severity ?? ""] ?? 0));
      const severity: Severity = worst >= 3 ? "high" : worst === 1 ? "low" : "medium";
      const name = vulns[0]!.package === "stdlib" ? `Go standard library ${vulns[0]!.version}` : key;
      return {
        ruleId: this.id,
        severity,
        title: `${name}: ${vulns.length} known vulnerabilit${vulns.length === 1 ? "y" : "ies"}`,
        detail: vulns
          .map((v) => `${v.id}${v.aliases.find((a) => a.startsWith("CVE-")) ? ` (${v.aliases.find((a) => a.startsWith("CVE-"))})` : ""}${v.summary ? `: ${v.summary}` : ""}`)
          .join("; ") + ". Matched by version only; the vulnerable code may not be reachable in this app.",
        locations: [],
      };
    });
  },
};

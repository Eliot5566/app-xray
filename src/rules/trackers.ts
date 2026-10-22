import type { Finding } from "../core/schema.js";
import { loadData } from "./data.js";
import type { Rule } from "./types.js";

interface TrackerData {
  services: Array<{ name: string; category: string; hosts: string[] }>;
}

export function matchesHost(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function trackersRule(data = loadData<TrackerData>("trackers.json")): Rule {
  return {
    id: "known-services",
    description: "Addresses of known analytics, advertising and crash-reporting services found in the app.",
    check(report) {
      const findings: Finding[] = [];
      for (const service of data.services) {
        const hits = report.endpoints.filter(
          (e) => e.host !== null && service.hosts.some((suffix) => matchesHost(e.host!, suffix)),
        );
        if (hits.length === 0) continue;
        findings.push({
          ruleId: this.id,
          severity: service.category === "advertising" || service.category === "session-recording" ? "medium" : "low",
          title: `${service.name} (${service.category})`,
          detail: `Contains ${hits.length} address${hits.length === 1 ? "" : "es"} of ${service.name}: ${[...new Set(hits.map((h) => h.host))].join(", ")}. Presence in code does not prove data is sent.`,
          locations: hits.flatMap((h) => (h.location ? [h.location] : [])),
        });
      }
      return findings;
    },
  };
}

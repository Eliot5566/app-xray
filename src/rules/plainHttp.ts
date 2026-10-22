import type { Rule } from "./types.js";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

export const plainHttpRule: Rule = {
  id: "plain-http",
  description: "Remote addresses reached over unencrypted HTTP.",
  check(report) {
    const hits = report.endpoints.filter((e) => e.url.startsWith("http://") && e.host !== null && !LOCAL.has(e.host));
    if (hits.length === 0) return [];
    return [
      {
        ruleId: this.id,
        severity: "low",
        title: "Unencrypted HTTP addresses",
        detail: `${hits.length} remote address${hits.length === 1 ? "" : "es"} use http://: ${hits.map((h) => h.url).join(", ")}.`,
        locations: hits.flatMap((h) => (h.location ? [h.location] : [])),
      },
    ];
  },
};

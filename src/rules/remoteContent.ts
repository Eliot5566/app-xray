import type { Rule } from "./types.js";

const WEAKENED = (name: string, value: unknown) =>
  (name === "nodeIntegration" && value === true) || (name === "contextIsolation" && value === false);

export const remoteContentRule: Rule = {
  id: "remote-content",
  description: "Remote web pages loaded into app windows, and whether any window has weakened isolation.",
  check(report) {
    if (report.remotePages.length === 0) return [];
    const weakened = report.browserWindows.filter((w) => w.webPreferences.some((p) => WEAKENED(p.name, p.value)));
    const pages = report.remotePages.join(", ");
    if (weakened.length === 0) {
      return [
        {
          ruleId: this.id,
          severity: "info",
          title: "Loads remote pages into app windows",
          detail: `App windows open ${pages}. No window was found with weakened isolation.`,
          locations: [],
        },
      ];
    }
    return [
      {
        ruleId: this.id,
        severity: "high",
        title: "Remote pages and windows with weakened isolation",
        detail: `App windows open ${pages}, and ${weakened.length} window${weakened.length === 1 ? "" : "s"} turn on nodeIntegration or turn off contextIsolation. If a remote page lands in one of those windows, it can reach Node.js. Static analysis cannot tell which window loads which page; check them.`,
        locations: weakened.flatMap((w) => (w.location ? [w.location] : [])),
      },
    ];
  },
};

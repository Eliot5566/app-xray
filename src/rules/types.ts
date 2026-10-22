import type { Finding, XrayReport } from "../core/schema.js";

export interface Rule {
  id: string;
  description: string;
  check(report: XrayReport): Finding[];
}

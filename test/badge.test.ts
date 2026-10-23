import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalize } from "../src/core/normalize.js";
import type { Finding } from "../src/core/schema.js";
import { badgeMessage, renderBadge } from "../src/report/badge.js";
import { renderCard } from "../src/report/card.js";
import { renderPng } from "../src/report/png.js";
import { applyRules } from "../src/rules/index.js";

describe("badge and PNG card", async () => {
  const evidence = JSON.parse(await readFile(new URL("./fixtures/demo-app.rea.json", import.meta.url), "utf8"));
  const report = applyRules(
    normalize({ evidence, reaVersion: "6.7.0", electron: { version: "28.1.0", source: "package.json" }, now: new Date("2026-10-23T00:00:00Z") }),
  );
  const finding = (severity: Finding["severity"]): Finding => ({ ruleId: "x", severity, title: "t", detail: "d", locations: [] });

  it("names the most severe level that has findings", () => {
    expect(badgeMessage(report)).toEqual({ text: "1 high", severity: "high" });
    expect(badgeMessage({ ...report, findings: [finding("low"), finding("low"), finding("info")] }).text).toBe("2 low");
    expect(badgeMessage({ ...report, findings: [finding("info")] })).toEqual({ text: "no issues found", severity: "none" });
  });

  it("renders a 20px-high badge", () => {
    expect(renderBadge(report)).toMatch(/^<svg [^>]*height="20"[^>]*aria-label="app x-ray: 1 high"/);
  });

  it("renders the card as a 1200×630 PNG", async () => {
    const png = await renderPng(renderCard(report));
    expect(png).not.toBeNull();
    const buf = Buffer.from(png!);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});

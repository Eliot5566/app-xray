import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalize } from "../src/core/normalize.js";
import { renderCard } from "../src/report/card.js";
import { applyRules } from "../src/rules/index.js";

describe("renderCard", async () => {
  const evidence = JSON.parse(await readFile(new URL("./fixtures/demo-app.rea.json", import.meta.url), "utf8"));
  const report = applyRules(
    normalize({ evidence, reaVersion: "6.7.0", electron: { version: "28.0.0", source: "package.json" }, now: new Date("2026-10-22T00:00:00Z") }),
  );

  it("is a 1200×630 SVG with the app's counts", () => {
    const svg = renderCard(report);
    expect(svg).toMatch(/^<svg [^>]*width="1200" height="630"/);
    expect(svg).toContain("Electron 28.0.0");
    expect(svg).toContain("2026-10-22");
  });

  it("escapes text from the app", () => {
    const svg = renderCard({ ...report, target: { ...report.target, name: `<script>&"` } });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&amp;&quot;");
  });
});

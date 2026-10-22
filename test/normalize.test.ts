import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectElectronVersion } from "../src/core/electronVersion.js";
import { normalize } from "../src/core/normalize.js";
import { renderHtml } from "../src/report/html.js";
import { applyRules } from "../src/rules/index.js";

const fixtureDir = new URL("./fixtures/demo-app/", import.meta.url).pathname;
const evidence = JSON.parse(readFileSync(new URL("./fixtures/demo-app.rea.json", import.meta.url), "utf8"));
const now = new Date("2026-10-22T00:00:00Z");

describe("normalize", () => {
  const report = normalize({
    evidence,
    reaVersion: "6.7.0",
    electron: { version: "28.1.0", source: "package.json devDependencies" },
    now,
  });

  it("reads the package identity", () => {
    expect(report.target).toMatchObject({ name: "demo-app", version: "1.2.3", format: "directory" });
    expect(report.engine.evidenceId).toMatch(/^ev_/);
  });

  it("collects every literal network address with its source line", () => {
    expect(report.endpoints.map((e) => e.url)).toEqual([
      "https://api.mixpanel.com/track",
      "https://app.example.com/home",
      "https://o123.ingest.sentry.io/api/1/envelope/",
    ]);
    const sentry = report.endpoints.find((e) => e.host === "o123.ingest.sentry.io");
    expect(sentry).toMatchObject({ mechanism: "call:fetch", location: { path: "main.js", line: 8 } });
  });

  it("lists external modules once with their importers", () => {
    expect(report.modules).toEqual([
      { specifier: "axios", importedBy: ["main.js"] },
      { specifier: "electron", importedBy: ["main.js", "preload.js"] },
    ]);
  });

  it("keeps Electron structure", () => {
    expect(report.preloads).toEqual(["preload.js"]);
    expect(report.browserWindows[0]?.webPreferences).toContainEqual({ name: "contextIsolation", value: true });
    expect(report.ipcChannels.map((c) => c.channel)).toContain("track");
    expect(report.limitations.length).toBeGreaterThan(0);
  });
});

describe("rules", () => {
  const base = normalize({
    evidence,
    reaVersion: "6.7.0",
    electron: { version: "28.1.0", source: "package.json devDependencies" },
    now,
  });

  it("flags an unsupported Electron and known services", () => {
    const { findings } = applyRules(base);
    const titles = findings.map((f) => f.title);
    expect(titles).toContain("Electron 28.1.0 no longer receives security fixes");
    expect(titles).toContain("Mixpanel (analytics)");
    expect(titles).toContain("Sentry (crash-reporting)");
    expect(findings[0]?.severity).toBe("high");
  });

  it("does not flag a supported Electron", () => {
    const report = { ...base, frameworks: [{ kind: "electron" as const, version: "44.2.0", versionSource: "test" }] };
    const electron = applyRules(report).findings.filter((f) => f.ruleId === "electron-support");
    expect(electron).toEqual([expect.objectContaining({ severity: "info", title: "Electron 44.2.0 is supported" })]);
  });

  it("flags risky webPreferences", () => {
    const report = {
      ...base,
      browserWindows: [{ location: null, webPreferences: [{ name: "nodeIntegration", value: true }] }],
    };
    expect(applyRules(report).findings.map((f) => f.title)).toContain("nodeIntegration: true");
  });

  it("does not treat a lookalike host as a tracker", () => {
    const report = {
      ...base,
      endpoints: [{ url: "https://notmixpanel.com/x", host: "notmixpanel.com", mechanism: null, location: null }],
    };
    expect(applyRules(report).findings.some((f) => f.title.startsWith("Mixpanel"))).toBe(false);
  });
});

describe("electron version detection", () => {
  it("reads package.json devDependencies", async () => {
    expect(await detectElectronVersion(fixtureDir)).toEqual({
      version: "28.1.0",
      source: "package.json devDependencies",
    });
  });
});

describe("html report", () => {
  it("escapes app-controlled text", () => {
    const report = applyRules(
      normalize({ evidence, reaVersion: "6.7.0", electron: null, now }),
    );
    report.target.name = "<script>alert(1)</script>";
    report.endpoints.push({ url: "https://x/</script><b>", host: "x", mechanism: null, location: null });
    const html = renderHtml(report);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});

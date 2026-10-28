import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalize } from "../src/core/normalize.js";
import type { XrayReport } from "../src/core/schema.js";
import { diffReports, failures, isEmptyDiff, packageOf, renderMarkdown } from "../src/diff.js";
import { applyRules } from "../src/rules/index.js";

describe("diffReports", async () => {
  const evidence = JSON.parse(await readFile(new URL("./fixtures/demo-app.rea.json", import.meta.url), "utf8"));
  const before = applyRules(normalize({ evidence, reaVersion: "6.7.0", electron: { version: "28.1.0", source: "package.json" } }));

  // The same app after a release that adds a tracker, a package and a weaker window, and downgrades Electron.
  const after: XrayReport = applyRules({
    ...structuredClone(before),
    frameworks: [{ kind: "electron", version: "27.0.0", versionSource: "package.json" }],
    endpoints: [
      ...before.endpoints,
      { url: "https://api.segment.io/v1/track", host: "api.segment.io", mechanism: "call:fetch", location: { path: "main.js", line: 9 } },
    ],
    modules: [...before.modules, { specifier: "@sentry/electron/main", importedBy: ["main.js"] }, { specifier: "./local", importedBy: ["main.js"] }],
    browserWindows: [{ location: { path: "main.js", line: 3 }, webPreferences: [{ name: "nodeIntegration", value: true }] }],
    findings: [],
  });

  it("reports nothing for identical reports", () => {
    const d = diffReports(before, structuredClone(before));
    expect(isEmptyDiff(d)).toBe(true);
    expect(renderMarkdown(d)).toContain("No change");
  });

  it("lists new hosts, services, packages and findings", () => {
    const d = diffReports(before, after);
    expect(d.electron).toEqual({ before: "28.1.0", after: "27.0.0" });
    expect(d.hosts.added).toEqual(["api.segment.io"]);
    expect(d.packages.added).toEqual(["@sentry/electron"]);
    expect(d.services.added).toEqual(["Segment (analytics)"]);
    expect(d.newSerious).toContain("[high] nodeIntegration: true");
  });

  it("fails only on the conditions asked for", () => {
    const d = diffReports(before, after);
    expect(failures(d, [])).toEqual([]);
    expect(failures(d, ["new-host", "electron-downgrade"])).toEqual([
      "new hosts: api.segment.io",
      "Electron downgraded from 28.1.0 to 27.0.0",
    ]);
  });

  it("renders a marked comment that escapes text from the app", () => {
    const evil = structuredClone(after);
    evil.endpoints.push({ url: "https://x.example/|<img>", host: "x.example", mechanism: null, location: null });
    const md = renderMarkdown(diffReports(before, evil));
    expect(md.startsWith("<!-- app-xray-diff -->")).toBe(true);
    expect(md).toContain("`api.segment.io`");
    // Inside a code span GitHub shows HTML as text; table cells also escape the pipe.
    expect(md).toContain("- `https://x.example/|<img>`");
    expect(md).toContain("`x.example`");
    expect(md.replace(/`[^`]*`/g, "")).not.toContain("<img>");
  });
});

describe("packageOf", () => {
  it("maps specifiers to packages and skips the app's own files", () => {
    expect(packageOf("lodash/fp")).toBe("lodash");
    expect(packageOf("@sentry/electron/main")).toBe("@sentry/electron");
    expect(packageOf("node:fs")).toBe("node:fs");
    expect(packageOf("./util")).toBeNull();
    expect(packageOf("`${dir}/x`")).toBeNull();
  });
});

describe("diffReports for APKs and executables", async () => {
  const { binaryReport } = await import("../src/native/binary.js");
  const go = JSON.parse(await readFile(new URL("./fixtures/go-gh.rea.json", import.meta.url), "utf8"));
  const base = binaryReport({ file: "/bin/gh", sha256: "", reaVersion: "6.7.0", go, rust: null, endpoints: [] });

  it("lists library version changes and new modules", () => {
    const deps = base.dependencies!;
    const next: XrayReport = {
      ...structuredClone(base),
      dependencies: [
        ...deps.map((d) => (d.name === "golang.org/x/net" ? { ...d, version: "v0.99.0" } : d)),
        { ecosystem: "go", name: "github.com/new/dep", version: "v1.0.0", replacedBy: null },
      ],
    };
    const d = diffReports(base, next);
    const old = deps.find((x) => x.name === "golang.org/x/net")!.version;
    expect(d.versions).toEqual([`golang.org/x/net ${old} → v0.99.0`]);
    expect(d.packages.added).toEqual(["github.com/new/dep"]);
    expect(renderMarkdown(d)).toContain("Library versions");
  });

  it("lists new Android permissions and fails on them when asked", () => {
    const android = (permissions: string[]) => ({
      package: "a.b",
      versionCode: 1,
      minSdk: 24,
      targetSdk: 35,
      permissions,
      sensitivePermissions: [],
      components: { activities: 1, services: 0, receivers: 0, providers: 0, exported: 1 },
      debuggable: false,
      allowBackup: false,
      usesCleartextTraffic: null,
      networkSecurityConfig: false,
      usesAdvertisingId: false,
      sdks: [],
      nativeLibs: [],
      dexClasses: 1,
    });
    const before: XrayReport = { ...structuredClone(base), android: android(["android.permission.INTERNET"]) };
    const after: XrayReport = { ...structuredClone(base), android: android(["android.permission.CAMERA", "android.permission.INTERNET"]) };
    const d = diffReports(before, after);
    expect(d.permissions.added).toEqual(["android.permission.CAMERA"]);
    expect(failures(d, ["new-permission"])).toEqual(["new permissions: android.permission.CAMERA"]);
    expect(failures(d, ["new-host"])).toEqual([]);
  });
});

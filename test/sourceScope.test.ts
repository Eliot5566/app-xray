import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findPayload, isExcluded, looksGenerated, prepareScope } from "../src/core/sourceScope.js";

describe("exclusion patterns", () => {
  it("drops tests, stories and tooling", () => {
    expect(isExcluded("ts/test-node", true)).toBe(true);
    expect(isExcluded("src/__tests__", true)).toBe(true);
    expect(isExcluded("bin", true)).toBe(true);
    expect(isExcluded("src/a.test.ts", false)).toBe(true);
    expect(isExcluded("src/Button.stories.tsx", false)).toBe(true);
    expect(isExcluded("types/index.d.ts", false)).toBe(true);
  });

  it("keeps application code", () => {
    expect(isExcluded("src", true)).toBe(false);
    expect(isExcluded("src/testing-utils.ts", false)).toBe(false);
    expect(isExcluded("src/main.ts", false)).toBe(false);
  });

  it("recognizes minified or generated bundles", () => {
    expect(looksGenerated("x".repeat(70_000))).toBe(true);
    expect(looksGenerated("const a = 1;\n".repeat(10_000))).toBe(false);
    expect(looksGenerated("x".repeat(1_000))).toBe(false);
  });
});

describe("prepareScope", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(path.join(os.tmpdir(), "xray-scope-"));
    await mkdir(path.join(repo, ".git"));
    await mkdir(path.join(repo, "src"));
    await mkdir(path.join(repo, "test"));
    await writeFile(path.join(repo, "package.json"), "{}");
    await writeFile(path.join(repo, "src", "main.js"), "require('electron');\n");
    await writeFile(path.join(repo, "src", "main.test.js"), "test();\n");
    await writeFile(path.join(repo, "src", "vendor.js"), "x".repeat(70_000));
    await writeFile(path.join(repo, "test", "a.js"), "");
    await writeFile(path.join(repo, "test", "b.js"), "");
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("copies a checkout without tests, tooling or generated files", async () => {
    const scope = await prepareScope(repo);
    try {
      expect(scope.filtered).toBe(true);
      expect(scope.excludedFiles).toBe(4);
      const files = await readdir(scope.analyzedPath, { recursive: true });
      expect(files.sort()).toEqual(["package.json", "src", path.join("src", "main.js")]);
    } finally {
      await scope.cleanup();
    }
  });

  it("leaves an installed app alone", async () => {
    const scope = await prepareScope(path.join(repo, "src"), { allFiles: true });
    expect(scope).toMatchObject({ filtered: false, analyzedPath: path.join(repo, "src"), excludedFiles: 0 });
  });
});

describe("packaged apps", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "xray-payload-"));
    // Linux/Windows: the app beside Electron's own default_app.asar.
    await mkdir(path.join(root, "linux", "resources", "app"), { recursive: true });
    await writeFile(path.join(root, "linux", "resources", "default_app.asar"), "");
    // macOS: Demo.app/Contents/Resources/app.asar.
    await mkdir(path.join(root, "Demo.app", "Contents", "Resources"), { recursive: true });
    await writeFile(path.join(root, "Demo.app", "Contents", "Resources", "app.asar"), "");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds the app payload from the install folder, the bundle or resources", async () => {
    expect(await findPayload(path.join(root, "linux"))).toBe(path.join(root, "linux", "resources", "app"));
    expect(await findPayload(path.join(root, "Demo.app"))).toBe(path.join(root, "Demo.app", "Contents", "Resources", "app.asar"));
    expect(await findPayload(path.join(root, "Demo.app", "Contents"))).toBe(path.join(root, "Demo.app", "Contents", "Resources", "app.asar"));
    expect(await findPayload(path.join(root, "Demo.app", "Contents", "Resources"))).toBe(path.join(root, "Demo.app", "Contents", "Resources", "app.asar"));
    expect(await findPayload(path.join(root, "linux", "resources", "app"))).toBeNull();
  });

  it("analyzes only the payload, not Electron's default app", async () => {
    const scope = await prepareScope(path.join(root, "linux"));
    expect(scope).toMatchObject({ analyzedPath: path.join(root, "linux", "resources", "app"), payload: "resources/app" });
  });

  it("passes an .asar file through", async () => {
    const asar = path.join(root, "Demo.app", "Contents", "Resources", "app.asar");
    expect(await prepareScope(asar)).toMatchObject({ analyzedPath: asar, payload: null, filtered: false });
  });
});

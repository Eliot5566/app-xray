import { mkdtemp, mkdir, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIN_EXECUTABLE_BYTES, candidateExecutables, detectElectronVersion } from "../src/core/electronVersion.js";

// A packaged Linux/Windows layout: <install>/<exe> + <install>/resources/app/.
// The executable is a sparse file with the user-agent literal near its end, as in a real build.
let install: string;

beforeAll(async () => {
  install = await mkdtemp(path.join(os.tmpdir(), "xray-exe-"));
  await mkdir(path.join(install, "resources", "app"), { recursive: true });
  await writeFile(path.join(install, "resources", "app", "package.json"), '{"name":"packaged","main":"main.js"}');
  const exe = await open(path.join(install, "Packaged App.exe"), "w");
  await exe.write(Buffer.from("\0Chrome/156.0.8078.48 Electron/45.0.0\0", "latin1"), 0, undefined, MIN_EXECUTABLE_BYTES + 3);
  await exe.close();
  await writeFile(path.join(install, "resources.pak"), "Chrome/1.2.3.4 Electron/1.0.0");
});

afterAll(async () => {
  await rm(install, { recursive: true, force: true });
});

describe("electron version from a packaged executable", () => {
  it("reads Electron and Chromium from the app directory", async () => {
    expect(await detectElectronVersion(path.join(install, "resources", "app"))).toEqual({
      version: "45.0.0",
      chromium: "156.0.8078.48",
      source: "Packaged App.exe user-agent string",
    });
  });

  it("reads them from the install directory too", async () => {
    expect((await detectElectronVersion(install))?.version).toBe("45.0.0");
  });

  it("returns null when there is no install layout", async () => {
    expect(await detectElectronVersion(os.tmpdir())).toBeNull();
  });
});

describe("electron version in a monorepo", () => {
  it("reads it from a parent workspace package.json", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "xray-mono-"));
    try {
      await mkdir(path.join(repo, "apps", "desktop"), { recursive: true });
      await writeFile(path.join(repo, "package.json"), '{"devDependencies":{"electron":"^44.1.0"}}');
      await writeFile(path.join(repo, "apps", "desktop", "package.json"), '{"name":"desktop"}');
      expect(await detectElectronVersion(path.join(repo, "apps", "desktop"))).toEqual({
        version: "44.1.0",
        source: "../../package.json devDependencies",
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe("macOS bundles", () => {
  let bundle: string;
  const framework = () => path.join(bundle, "Contents", "Frameworks", "Electron Framework.framework", "Electron Framework");

  beforeAll(async () => {
    bundle = path.join(await mkdtemp(path.join(os.tmpdir(), "xray-mac-")), "Demo.app");
    await mkdir(path.dirname(framework()), { recursive: true });
    await mkdir(path.join(bundle, "Contents", "Resources"), { recursive: true });
    await writeFile(path.join(bundle, "Contents", "Resources", "app.asar"), "");
    const bin = await open(framework(), "w");
    await bin.write(Buffer.from("\0Chrome/156.0.8078.48 Electron/45.0.0\0", "latin1"), 0, undefined, MIN_EXECUTABLE_BYTES + 3);
    await bin.close();
  });

  afterAll(async () => {
    await rm(path.dirname(bundle), { recursive: true, force: true });
  });

  it("reads fuses and versions from Electron Framework", async () => {
    expect(await candidateExecutables(path.join(bundle, "Contents", "Resources", "app.asar"))).toEqual([framework()]);
    expect(await detectElectronVersion(bundle)).toEqual({
      version: "45.0.0",
      chromium: "156.0.8078.48",
      source: "Electron Framework user-agent string",
    });
  });
});

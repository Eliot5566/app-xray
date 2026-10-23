import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalize } from "../src/core/normalize.js";
import { buildGallery, slugify } from "../src/gallery.js";
import { applyRules } from "../src/rules/index.js";

describe("buildGallery", () => {
  let dir: string;
  let site: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "xray-gallery-"));
    site = path.join(dir, "site");
    const evidence = JSON.parse(await readFile(new URL("./fixtures/demo-app.rea.json", import.meta.url), "utf8"));
    const report = applyRules(
      normalize({ evidence, reaVersion: "6.7.0", electron: { version: "28.1.0", source: "package.json" }, inputPath: "/home/ci/work/demo" }),
    );
    await mkdir(path.join(dir, "reports", "demo-app"), { recursive: true });
    await writeFile(path.join(dir, "reports", "demo-app", "xray.json"), JSON.stringify(report));
    await writeFile(
      path.join(dir, "reports", "summary.json"),
      JSON.stringify([{ name: "demo-app", title: "Demo <App>", repo: "acme/demo", path: "packages/desktop", commit: "abc1234" }]),
    );
    await buildGallery(path.join(dir, "reports"), site, { baseUrl: "https://example.org/xray", now: new Date("2026-10-23T00:00:00Z") });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes an index and one page per app", async () => {
    const index = await readFile(path.join(site, "index.html"), "utf8");
    expect(index).toContain('href="apps/demo-app/"');
    expect(index).toContain("Demo &lt;App&gt;");
    expect(index).toContain("1 high");
    expect((await stat(path.join(site, ".nojekyll"))).isFile()).toBe(true);
    for (const f of ["index.html", "card.png", "card.svg", "badge.svg", "xray.json"]) {
      expect((await stat(path.join(site, "apps", "demo-app", f))).size).toBeGreaterThan(0);
    }
  });

  it("replaces the scan machine's path with the source repository", async () => {
    const report = JSON.parse(await readFile(path.join(site, "apps", "demo-app", "xray.json"), "utf8"));
    expect(report.target.inputPath).toBe("https://github.com/acme/demo/tree/abc1234/packages/desktop");
    expect(report.target.name).toBe("demo-app");
  });

  it("adds link previews, source links and a badge snippet", async () => {
    const page = await readFile(path.join(site, "apps", "demo-app", "index.html"), "utf8");
    expect(page).toContain('<meta property="og:image" content="https://example.org/xray/apps/demo-app/card.png">');
    expect(page).toMatch(/href="https:\/\/github\.com\/acme\/demo\/blob\/abc1234\/packages\/desktop\/[^"]+#L\d+"/);
    expect(page).toContain("[![App X-Ray](https://example.org/xray/apps/demo-app/badge.svg)](https://example.org/xray/apps/demo-app/)");
    expect(page).not.toContain("/home/ci/work");
  });

  it("makes URL-safe slugs", () => {
    expect(slugify("@joplin/App Desktop")).toBe("joplin-app-desktop");
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeApk, detectSdks } from "../src/android/apk.js";
import { resolveStrings } from "../src/android/arsc.js";
import { parseAxml } from "../src/android/axml.js";
import { readDex } from "../src/android/dex.js";
import { renderCard } from "../src/report/card.js";
import { renderHtml } from "../src/report/html.js";
import { applyRules } from "../src/rules/index.js";
import { buildArsc, buildAxml, buildDex, buildZip, type XmlNode } from "./apkBuilder.js";

const manifest: XmlNode = {
  name: "manifest",
  attrs: { package: "com.example.demo", versionCode: 42, versionName: "1.2.3" },
  children: [
    { name: "uses-sdk", attrs: { minSdkVersion: 24, targetSdkVersion: 30 } },
    { name: "uses-permission", attrs: { name: "android.permission.INTERNET" } },
    { name: "uses-permission", attrs: { name: "android.permission.CAMERA" } },
    { name: "uses-permission", attrs: { name: "android.permission.ACCESS_FINE_LOCATION" } },
    { name: "uses-permission", attrs: { name: "com.google.android.gms.permission.AD_ID" } },
    {
      name: "application",
      attrs: { label: "@0x7f010001", debuggable: true, usesCleartextTraffic: true },
      children: [
        { name: "activity", attrs: { name: ".Main" }, children: [{ name: "intent-filter" }] },
        { name: "activity", attrs: { name: ".Settings", exported: false } },
        { name: "service", attrs: { name: ".Sync", exported: true, permission: "com.example.BIND" } },
        { name: "receiver", attrs: { name: ".Boot", exported: true } },
        { name: "provider", attrs: { name: ".Files", exported: false } },
      ],
    },
  ],
};

const classes = [
  "com.example.demo.Main",
  "com.google.firebase.analytics.FirebaseAnalytics",
  "com.google.android.gms.ads.AdView",
  "com.google.android.gms.ads.identifier.AdvertisingIdClient",
  "io.sentry.Sentry",
  "io.sentry.Hub",
];
const literals = [
  "https://api.example.com/v1/items",
  "see http://plain.example.org/x, then",
  "http://schemas.android.com/apk/res/android",
  "not a url",
];

let dir: string;
let apk: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "xray-apk-"));
  apk = path.join(dir, "demo.apk");
  await writeFile(
    apk,
    buildZip({
      "AndroidManifest.xml": buildAxml(manifest),
      "classes.dex": buildDex(classes, literals),
      "classes2.dex": buildDex(["com.example.demo.Extra"], ["https://cdn.example.net/a.png"]),
      "resources.arsc": buildArsc(["Other", "Demo App"]),
      "lib/arm64-v8a/libflutter.so": Buffer.from("elf"),
      "lib/arm64-v8a/libapp.so": Buffer.from("elf"),
    }),
  );
});

afterAll(() => rm(dir, { recursive: true, force: true }));

describe("binary pieces", () => {
  it("decodes binary XML", () => {
    const root = parseAxml(buildAxml(manifest));
    expect(root.name).toBe("manifest");
    expect(root.attrs).toMatchObject({ package: "com.example.demo", versionCode: 42 });
    const app = root.children.find((c) => c.name === "application")!;
    expect(app.attrs).toMatchObject({ label: "@0x7f010001", debuggable: true });
    expect(app.children).toHaveLength(5);
  });

  it("reads DEX class and string tables", () => {
    const dex = readDex(buildDex(["a.b.C"], ["hello"]));
    expect(dex.classes).toEqual(["a.b.C"]);
    expect(dex.strings).toContain("hello");
  });

  it("resolves string resources", () => {
    const table = buildArsc(["Other", "Demo App"]);
    expect(resolveStrings(table, [0x7f010001, 0x7f010000, 0x7f020000])).toEqual(
      new Map([
        [0x7f010001, "Demo App"],
        [0x7f010000, "Other"],
      ]),
    );
  });

  it("matches SDKs by prefix and honors excludes", () => {
    const sdks = detectSdks(classes);
    const names = sdks.map((s) => s.name);
    expect(names).toContain("Google Firebase Analytics");
    expect(names).toContain("Sentry");
    expect(sdks.find((s) => s.name === "Sentry")?.classes).toBe(2);
    const admob = sdks.find((s) => s.name.includes("AdMob"));
    expect(admob?.classes).toBe(1);
    expect(admob?.example).toBe("com.google.android.gms.ads.AdView");
  });
});

describe("analyzeApk", () => {
  it("reads manifest facts, SDKs, addresses and frameworks", async () => {
    const report = await analyzeApk(apk, { toolVersion: "0.0.0", now: new Date("2026-10-28T00:00:00Z") });
    expect(report.target).toMatchObject({ format: "apk", name: "Demo App", version: "1.2.3" });
    expect(report.target.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.engine.name).toBe("app-xray");
    expect(report.frameworks.map((f) => f.kind)).toEqual(["android", "flutter"]);
    const a = report.android!;
    expect(a).toMatchObject({ package: "com.example.demo", versionCode: 42, minSdk: 24, targetSdk: 30, debuggable: true });
    expect(a.sensitivePermissions).toEqual(["android.permission.ACCESS_FINE_LOCATION", "android.permission.CAMERA"]);
    expect(a.usesAdvertisingId).toBe(true);
    expect(a.allowBackup).toBeNull();
    // .Main (implicit, intent filter) and .Boot; .Sync is guarded by a permission.
    expect(a.components).toEqual({ activities: 2, services: 1, receivers: 1, providers: 1, exported: 2 });
    expect(a.nativeLibs).toEqual(["libapp.so", "libflutter.so"]);
    expect(a.dexClasses).toBe(7);
    expect(report.endpoints.map((e) => e.url)).toEqual([
      "http://plain.example.org/x",
      "https://api.example.com/v1/items",
      "https://cdn.example.net/a.png",
    ]);
    expect(report.endpoints[2]?.location).toEqual({ path: "classes2.dex" });
  });

  it("produces Android findings and renders", async () => {
    const report = applyRules(await analyzeApk(apk, { toolVersion: "0.0.0" }));
    const titles = report.findings.map((f) => `${f.severity} ${f.title}`);
    expect(titles[0]).toBe("high Built as debuggable");
    expect(titles).toContain("medium Google AdMob (advertising)");
    expect(titles).toContain("low Sentry (crash-reporting)");
    expect(titles).toContain("low Asks for 2 sensitive permissions");
    expect(titles).toContain("low Targets Android API 30");
    expect(titles).toContain("low Allows unencrypted HTTP");
    expect(titles).toContain("info App data can be backed up");
    expect(report.findings.some((f) => f.ruleId === "plain-http")).toBe(false);

    const card = renderCard(report);
    expect(card).toContain("Android · targets API 30 · min API 24 · Flutter");
    expect(card).toContain("sensitive permissions");
    const html = renderHtml(report);
    expect(html).toContain("<h2>Permissions</h2>");
    expect(html).toContain("<h2>SDKs compiled in</h2>");
    expect(html).not.toContain("<h2>Windows and IPC</h2>");
  });

  it("rejects files that are not APKs", async () => {
    const bogus = path.join(dir, "bogus.apk");
    await writeFile(bogus, "not a zip");
    await expect(analyzeApk(bogus, { toolVersion: "0" })).rejects.toThrow(/zip/);
    const noManifest = path.join(dir, "empty.apk");
    await writeFile(noManifest, buildZip({ "a.txt": Buffer.from("x") }));
    await expect(analyzeApk(noManifest, { toolVersion: "0" })).rejects.toThrow(/AndroidManifest/);
  });
});

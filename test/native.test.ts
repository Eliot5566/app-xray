import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Endpoint } from "../src/core/schema.js";
import { collectUrls } from "../src/core/urls.js";
import { binaryFormat, binaryReport } from "../src/native/binary.js";
import { queryOsv } from "../src/native/osv.js";
import { renderCard } from "../src/report/card.js";
import { renderHtml } from "../src/report/html.js";
import { applyRules } from "../src/rules/index.js";

const fixture = async (name: string) => JSON.parse(await readFile(path.join("test/fixtures", name), "utf8")) as unknown;
const now = new Date("2026-10-28T00:00:00Z");

describe("binaryFormat", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "xray-bin-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it.each([
    ["elf", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]), "elf"],
    ["pe", Buffer.from("MZ\x90\x00"), "pe"],
    ["macho", Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 7, 0]), "macho"],
    ["asar", Buffer.from([4, 0, 0, 0, 1, 2]), null],
    ["tiny", Buffer.from("x"), null],
  ])("%s", async (name, bytes, expected) => {
    const file = path.join(dir, name);
    await writeFile(file, bytes);
    expect(await binaryFormat(file)).toBe(expected);
  });
});

describe("collectUrls", () => {
  it("keeps real addresses and drops namespaces", () => {
    const out = new Map<string, Endpoint>();
    collectUrls("\0\0https://api.example.com/v1/x\0http://www.w3.org/2000/svg\0see https://a.example.org/b.\0", out, "binary-string", "app");
    expect([...out.keys()]).toEqual(["https://api.example.com/v1/x", "https://a.example.org/b"]);
    expect(out.get("https://a.example.org/b")?.location).toEqual({ path: "app" });
  });
});

describe("binaryReport", () => {
  it("reads a Go binary's modules and build settings", async () => {
    const report = applyRules(
      binaryReport({ file: "/usr/local/bin/gh", sha256: "0".repeat(64), reaVersion: "6.7.0", go: await fixture("go-gh.rea.json"), rust: null, endpoints: [], now }),
    );
    expect(report.target).toMatchObject({ name: "gh", version: "v2.89.0", format: "elf" });
    expect(report.frameworks).toEqual([{ kind: "go", version: "1.26.1", versionSource: "Go build info" }]);
    expect(report.native).toMatchObject({ language: "go", architecture: "amd64" });
    expect(report.native?.buildSettings["CGO_ENABLED"]).toBe("0");
    expect(report.dependencies?.map((d) => d.name)).toContain("golang.org/x/net");
    const forked = report.dependencies?.find((d) => d.name === "example.com/forked");
    expect(forked?.replacedBy).toBe("../forked");
    const titles = report.findings.map((f) => `${f.severity} ${f.title}`);
    expect(titles).toContain("info Built with Go 1.26.1 (supported)");
    expect(titles).toContain("info 1 replaced module");
    expect(renderCard(report)).toContain("Go 1.26.1 · linux/amd64 · ELF");
    const html = renderHtml(report);
    expect(html).toContain("<h2>Libraries compiled in</h2>");
    expect(html).toContain("not checked");
  });

  it("flags an unsupported Go release", async () => {
    const report = applyRules(
      binaryReport({ file: "/tmp/hello", sha256: "", reaVersion: "6.7.0", go: await fixture("go-hello.rea.json"), rust: null, endpoints: [], now }),
    );
    expect(report.target.name).toBe("hello");
    expect(report.findings[0]).toMatchObject({ ruleId: "go-support", severity: "medium" });
    expect(report.findings[0]?.title).toContain("1.24.7");
  });

  it("reads a cargo-auditable Rust binary", async () => {
    const report = binaryReport({
      file: "/tmp/rustapp",
      sha256: "0".repeat(64),
      reaVersion: "6.7.0",
      go: { normalized_result: { build_info: null } },
      rust: await fixture("rust-demo.rea.json"),
      endpoints: [],
      now,
    });
    expect(report.target).toMatchObject({ name: "demo", version: "0.1.0" });
    expect(report.engine.operation).toBe("inspect_rust_binary");
    expect(report.dependencies).toEqual([
      { ecosystem: "cargo", name: "openssl", version: "0.10.40", replacedBy: null },
      { ecosystem: "cargo", name: "serde", version: "1.0.200", replacedBy: null },
    ]);
  });

  it("says so when a binary has no library list", () => {
    const report = binaryReport({ file: "/tmp/x", sha256: "", reaVersion: "6.7.0", go: { normalized_result: { format: "elf", build_info: null } }, rust: { normalized_result: { auditable_metadata: null } }, endpoints: [], now });
    expect(report.native?.language).toBeNull();
    expect(report.target.name).toBe("x");
    expect(report.limitations[0]).toMatch(/No Go build information/);
  });
});

describe("OSV", () => {
  it("batches queries, fetches details and rates findings", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = url.endsWith("/querybatch")
        ? { results: [{ vulns: [{ id: "GO-2024-0001" }] }, {}, { vulns: [{ id: "GO-2025-0002" }, { id: "GHSA-xxxx" }] }] }
        : url.endsWith("GHSA-xxxx")
          ? { id: "GHSA-xxxx", summary: "Bad thing", aliases: ["CVE-2025-1"], database_specific: { severity: "HIGH" } }
          : { id: url.split("/").at(-1), details: "Something\nmore" };
      return new Response(JSON.stringify(json), { status: 200 });
    }) as typeof fetch;

    const vulns = await queryOsv(
      [
        { ecosystem: "go", name: "golang.org/x/net", version: "v0.10.0", replacedBy: null },
        { ecosystem: "cargo", name: "serde", version: "1.0.200", replacedBy: null },
        { ecosystem: "go", name: "local", version: "(devel)", replacedBy: null },
      ],
      "1.22.0",
      fake,
    );
    const batch = calls[0]!.body as { queries: Array<{ package: { ecosystem: string; name: string }; version: string }> };
    expect(batch.queries).toEqual([
      { package: { ecosystem: "Go", name: "golang.org/x/net" }, version: "0.10.0" },
      { package: { ecosystem: "crates.io", name: "serde" }, version: "1.0.200" },
      { package: { ecosystem: "Go", name: "stdlib" }, version: "1.22.0" },
    ]);
    expect(vulns.map((v) => `${v.package} ${v.id} ${v.severity}`)).toEqual([
      "golang.org/x/net GO-2024-0001 null",
      "stdlib GO-2025-0002 null",
      "stdlib GHSA-xxxx HIGH",
    ]);

    const report = applyRules(
      binaryReport({ file: "/tmp/hello", sha256: "", reaVersion: "6.7.0", go: await fixture("go-hello.rea.json"), rust: null, endpoints: [], now }),
    );
    const findings = applyRules({ ...report, vulnerabilities: vulns }).findings.filter((f) => f.ruleId === "known-vulnerabilities");
    expect(findings.map((f) => `${f.severity} ${f.title}`)).toEqual([
      "high Go standard library 1.22.0: 2 known vulnerabilities",
      "medium golang.org/x/net@v0.10.0: 1 known vulnerability",
    ]);
    expect(findings[0]?.detail).toContain("GHSA-xxxx (CVE-2025-1): Bad thing");
  });

  it("fails loudly when OSV is unreachable", async () => {
    const fake = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(queryOsv([{ ecosystem: "go", name: "a", version: "v1.0.0", replacedBy: null }], null, fake)).rejects.toThrow(/503/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize } from "../src/core/normalize.js";
import type { XrayReport } from "../src/core/schema.js";
import { applyRules, defaultRules } from "../src/rules/index.js";

const evidence = JSON.parse(readFileSync(new URL("./fixtures/demo-app.rea.json", import.meta.url), "utf8"));
const base = normalize({ evidence, reaVersion: "6.7.0", electron: null, now: new Date("2026-10-22T00:00:00Z") });

function ruleFindings(id: string, patch: Partial<XrayReport>) {
  return applyRules({ ...base, ...patch }).findings.filter((f) => f.ruleId === id);
}

describe("rule set", () => {
  it("has thirteen rules with unique ids", () => {
    const ids = defaultRules().map((r) => r.id);
    expect(ids).toHaveLength(13);
    expect(new Set(ids).size).toBe(13);
  });
});

describe("normalize: new facts from the fixture", () => {
  it("collects remote pages and IPC stats", () => {
    expect(base.remotePages).toEqual(["https://app.example.com/home"]);
    expect(base.ipc).toEqual({ mainHandlers: 1, senderValidations: 0, dynamicChannelOperations: 0 });
    expect(base.fuses).toBeNull();
  });
});

describe("electron-fuses", () => {
  it("flags permissive fuses and ignores hardened ones", () => {
    const findings = ruleFindings("electron-fuses", {
      fuses: [
        { name: "RunAsNode", state: "enabled" },
        { name: "EnableNodeCliInspectArguments", state: "disabled" },
        { name: "OnlyLoadAppFromAsar", state: "disabled" },
      ],
    });
    expect(findings.map((f) => [f.title, f.severity])).toEqual([
      ["Fuse RunAsNode is enabled", "medium"],
      ["Fuse OnlyLoadAppFromAsar is disabled", "low"],
    ]);
  });

  it("says nothing without an executable", () => {
    expect(ruleFindings("electron-fuses", { fuses: null })).toEqual([]);
  });
});

describe("remote-content", () => {
  it("is informational when windows keep isolation", () => {
    expect(ruleFindings("remote-content", {})).toEqual([expect.objectContaining({ severity: "info" })]);
  });

  it("is high when a window weakens isolation", () => {
    const findings = ruleFindings("remote-content", {
      browserWindows: [{ location: { path: "main.js", line: 4 }, webPreferences: [{ name: "contextIsolation", value: false }] }],
    });
    expect(findings).toEqual([expect.objectContaining({ severity: "high", locations: [{ path: "main.js", line: 4 }] })]);
  });
});

describe("ipc rules", () => {
  it("flags handlers without sender checks", () => {
    expect(ruleFindings("ipc-sender-validation", {})).toHaveLength(1);
    expect(ruleFindings("ipc-sender-validation", { ipc: { ...base.ipc, senderValidations: 2 } })).toEqual([]);
  });

  it("flags runtime-chosen channels", () => {
    expect(ruleFindings("dynamic-ipc-channels", {})).toEqual([]);
    expect(ruleFindings("dynamic-ipc-channels", { ipc: { ...base.ipc, dynamicChannelOperations: 3 } })).toHaveLength(1);
  });
});

describe("ingredient rules", () => {
  it("summarizes storage kinds", () => {
    const [finding] = ruleFindings("local-data", {
      storage: [
        { kind: "local-storage", mechanism: "call:localStorage.setItem", location: null },
        { kind: "local-storage", mechanism: "call:localStorage.getItem", location: null },
      ],
    });
    expect(finding?.detail).toBe("Uses local-storage (2 uses).");
  });

  it("reports native add-ons", () => {
    expect(ruleFindings("native-addons", { nativeAddonBindings: 2 })).toHaveLength(1);
    expect(ruleFindings("native-addons", {})).toEqual([]);
  });
});

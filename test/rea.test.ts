import { describe, expect, it } from "vitest";
import { failureMessage } from "../src/core/rea.js";

describe("failureMessage", () => {
  it("uses REA's own explanation and remediation", () => {
    const stdout = JSON.stringify({
      message: "Unsupported target",
      remediation: { action: "Select an .asar file." },
    });
    expect(failureMessage("analyze-javascript-application", 1, stdout)).toBe(
      "rea analyze-javascript-application failed: Unsupported target Select an .asar file.",
    );
  });

  it("prefers per-argument issues and drops a repeated remediation", () => {
    const stdout = JSON.stringify({
      message: "Analysis input is invalid.",
      remediation: { action: "No file exists." },
      details: { issues: [{ message: "No file exists." }] },
    });
    expect(failureMessage("x", 1, stdout)).toBe("rea x failed: No file exists.");
  });

  it("falls back to the exit code", () => {
    expect(failureMessage("x", 3, "not json")).toBe("rea x exited with code 3");
  });
});

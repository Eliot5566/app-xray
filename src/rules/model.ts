import type { Finding } from "../core/schema.js";
import type { Rule } from "./types.js";

// Rules over model files: code that runs when a pickle is loaded, chat templates that reach into
// the runtime, and files that could not be read.

export const modelPickleRule: Rule = {
  id: "model-pickle",
  description: "Pickle-based model files and the callables they import when loaded.",
  check(report) {
    const findings: Finding[] = [];
    for (const m of report.model?.files ?? []) {
      if (m.format !== "pytorch" && m.format !== "pickle") continue;
      const at = [{ path: m.path }];
      const dangerous = m.imports.filter((i) => i.risk === "dangerous").map((i) => i.name);
      const unexpected = m.imports.filter((i) => i.risk === "unexpected").map((i) => i.name);
      if (dangerous.length) {
        findings.push({
          ruleId: this.id,
          severity: "high",
          title: `${m.path} runs code when loaded`,
          detail: `Loading this pickle calls ${dangerous.join(", ")}, which can run commands, load code or reach files and the network. Do not load it with torch.load(weights_only=False), pickle or joblib.`,
          locations: at,
        });
      }
      if (unexpected.length) {
        findings.push({
          ruleId: this.id,
          severity: "medium",
          title: `${m.path} imports ${unexpected.length} non-standard callable${unexpected.length === 1 ? "" : "s"}`,
          detail: `${unexpected.slice(0, 12).join(", ")}${unexpected.length > 12 ? ", …" : ""}. These are not what ordinary PyTorch or NumPy checkpoints use; check them before loading the file.`,
          locations: at,
        });
      }
      if (!dangerous.length && !unexpected.length) {
        findings.push({
          ruleId: this.id,
          severity: "info",
          title: `${m.path} is a pickle`,
          detail: "It imports only standard PyTorch/NumPy callables, but pickle files can run code when loaded. Prefer safetensors, or torch.load(weights_only=True).",
          locations: at,
        });
      }
    }
    return findings;
  },
};

// Jinja escapes that reach Python internals (CVE-2024-34359 and similar template injections).
const TEMPLATE_ESCAPES = /__(?:class|mro|subclasses|globals|builtins|import|init|base|bases|getattribute|dict|code|func)__|\b(?:os|subprocess)\.(?:system|popen|run|call)\b|\.popen\(/;

export const modelTemplateRule: Rule = {
  id: "model-chat-template",
  description: "GGUF chat templates that reach into the runtime, or carry addresses or hidden text.",
  check(report) {
    const findings: Finding[] = [];
    for (const m of report.model?.files ?? []) {
      const t = m.chatTemplate;
      if (!t) continue;
      const at = [{ path: m.path }];
      const escape = TEMPLATE_ESCAPES.exec(t);
      if (escape) {
        findings.push({
          ruleId: this.id,
          severity: "high",
          title: `Chat template in ${m.path} reaches into the runtime`,
          detail: `The Jinja chat template contains "${escape[0]}", a pattern used to escape the template sandbox and run code in runtimes that render it unsafely.`,
          locations: at,
        });
      }
      const urls = report.endpoints.filter((e) => e.mechanism === "chat-template" && e.location?.path === m.path);
      if (urls.length) {
        findings.push({
          ruleId: this.id,
          severity: "medium",
          title: `Chat template in ${m.path} contains ${urls.length === 1 ? "an address" : `${urls.length} addresses`}`,
          detail: `${urls.map((u) => u.url).join(", ")}. The template is added to every prompt, so text in it can steer the model, for example toward these addresses.`,
          locations: at,
        });
      }
      if (/[​-‏‪-‮⁠-⁤﻿]|[\u{e0000}-\u{e007f}]/u.test(t)) {
        findings.push({
          ruleId: this.id,
          severity: "medium",
          title: `Chat template in ${m.path} has invisible characters`,
          detail: "Zero-width, bidirectional-override or tag characters can hide instructions that are added to every prompt.",
          locations: at,
        });
      }
    }
    return findings;
  },
};

export const modelFormatRule: Rule = {
  id: "model-format",
  description: "Model files that could not be fully read.",
  check(report) {
    return (report.model?.files ?? [])
      .filter((m) => m.error)
      .map((m) => ({
        ruleId: this.id,
        severity: "medium" as const,
        title: `${m.path} could not be fully read`,
        detail: `${m.error}. A malformed header can be an attempt to hide content from scanners; treat the file with care.`,
        locations: [{ path: m.path }],
      }));
  },
};

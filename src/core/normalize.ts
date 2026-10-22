import type { VersionHit } from "./electronVersion.js";
import {
  XRAY_SCHEMA,
  type BrowserWindowFacts,
  type Endpoint,
  type IpcChannel,
  type ModuleRef,
  type SourceLocation,
  type XrayReport,
} from "./schema.js";

// Only the parts of REA's Evidence record app-xray reads. REA's own contract is much larger;
// see docs/mcp-contracts.md in morluto/rea.
interface ReaEvidence {
  evidence_id?: string;
  operation?: string;
  limitations?: string[];
  normalized_result?: {
    input_path?: string;
    format?: string;
    root_artifact_sha256?: string;
    graph?: { nodes?: ReaNode[] };
    limitations?: string[];
  };
}

interface ReaNode {
  kind: string;
  observations?: Array<{
    label?: string;
    properties?: Record<string, unknown>;
    evidence?: { location?: ReaLocation };
  }>;
}

interface ReaLocation {
  available?: boolean;
  value?: {
    kind?: string;
    source?: string;
    path?: string;
    start?: { line?: number; column?: number };
  };
}

export interface NormalizeInput {
  evidence: unknown;
  reaVersion: string;
  electron: VersionHit | null;
  now?: Date;
}

/** Turns one REA analyze-javascript-application Evidence record into an xray report (findings empty). */
export function normalize({ evidence, reaVersion, electron, now = new Date() }: NormalizeInput): XrayReport {
  const ev = evidence as ReaEvidence;
  const result = ev.normalized_result ?? {};
  const nodes = result.graph?.nodes ?? [];

  const pkg = first(nodes, "package");
  const modules = new Map<string, Set<string>>();
  const endpoints: Endpoint[] = [];
  const browserWindows: BrowserWindowFacts[] = [];
  const preloads = new Set<string>();
  const ipcChannels: IpcChannel[] = [];

  for (const node of nodes) {
    const obs = node.observations?.[0];
    const props = obs?.properties ?? {};
    const location = toLocation(obs?.evidence?.location);

    switch (node.kind) {
      case "javascript-module": {
        // Only references to other modules ("require"/"import"), not the source files themselves.
        if (props["semantic_role"] === "source-module") break;
        const specifier = str(props["specifier"]) ?? str(props["declared_specifier"]);
        if (!specifier) break;
        const importers = modules.get(specifier) ?? new Set<string>();
        if (location?.path) importers.add(location.path);
        modules.set(specifier, importers);
        break;
      }
      case "endpoint": {
        const url = str(props["value"]);
        if (!url) break;
        endpoints.push({ url, host: hostOf(url), mechanism: str(props["mechanism"]), location });
        break;
      }
      case "browser-window": {
        const prefs = Array.isArray(props["web_preferences"]) ? props["web_preferences"] : [];
        browserWindows.push({
          location,
          webPreferences: prefs.map((p: { name?: string; value?: { status?: string; value?: unknown } }) => ({
            name: String(p.name),
            value: p.value?.status === "literal" ? literal(p.value.value) : null,
          })),
        });
        break;
      }
      case "electron-preload": {
        const resolved = str(props["resolved_path"]) ?? str(props["declared_path"]);
        if (resolved) preloads.add(resolved);
        break;
      }
      case "ipc-channel": {
        const channel = str(props["channel"]);
        if (!channel) break;
        ipcChannels.push({
          channel,
          side: str(props["side"]) ?? "unknown",
          operation: str(props["operation"]) ?? "unknown",
          location,
        });
        break;
      }
    }
  }

  const pkgProps = pkg?.observations?.[0]?.properties ?? {};
  const isElectron = electron !== null || nodes.some((n) => n.kind === "electron-main");

  return {
    schema: XRAY_SCHEMA,
    generatedAt: now.toISOString(),
    target: {
      inputPath: result.input_path ?? "",
      format: result.format ?? "unknown",
      sha256: result.root_artifact_sha256 ?? null,
      name: str(pkgProps["name"]),
      version: str(pkgProps["version"]),
    },
    engine: {
      name: "rea-agents",
      version: reaVersion,
      operation: ev.operation ?? "analyze_javascript_application",
      evidenceId: ev.evidence_id ?? null,
    },
    frameworks: isElectron
      ? [
          { kind: "electron", version: electron?.version ?? null, versionSource: electron?.source ?? null },
          ...(electron?.chromium ? [{ kind: "chromium" as const, version: electron.chromium, versionSource: electron.source }] : []),
        ]
      : [],
    modules: [...modules]
      .map(([specifier, importers]) => ({ specifier, importedBy: [...importers].sort() }))
      .sort((a, b) => a.specifier.localeCompare(b.specifier)),
    endpoints: dedupeEndpoints(endpoints),
    browserWindows,
    preloads: [...preloads].sort(),
    ipcChannels: dedupeIpc(ipcChannels),
    findings: [],
    limitations: [...new Set([...(result.limitations ?? []), ...(ev.limitations ?? [])])],
  };
}

function first(nodes: ReaNode[], kind: string): ReaNode | undefined {
  return nodes.find((n) => n.kind === kind);
}

function toLocation(loc: ReaLocation | undefined): SourceLocation | null {
  if (!loc?.available || !loc.value) return null;
  const file = loc.value.source ?? loc.value.path;
  if (!file) return null;
  const start = loc.value.start;
  return {
    path: file,
    ...(start?.line !== undefined ? { line: start.line } : {}),
    ...(start?.column !== undefined ? { column: start.column } : {}),
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function literal(value: unknown): string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function dedupeEndpoints(list: Endpoint[]): Endpoint[] {
  const seen = new Map<string, Endpoint>();
  for (const e of list) {
    const key = `${e.url}\u0000${e.mechanism ?? ""}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function dedupeIpc(list: IpcChannel[]): IpcChannel[] {
  const seen = new Map<string, IpcChannel>();
  for (const c of list) {
    const key = `${c.channel}\u0000${c.side}\u0000${c.operation}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()].sort((a, b) => a.channel.localeCompare(b.channel));
}

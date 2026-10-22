// xray.json schema v0. Every fact keeps a pointer back to the REA evidence it came from,
// so a report can always show *why* it says something.

export const XRAY_SCHEMA = "app-xray/report@0";

export interface SourceLocation {
  /** File inside the analyzed app, relative to its root. */
  path: string;
  line?: number;
  column?: number;
}

export interface Engine {
  name: "rea-agents";
  version: string;
  operation: string;
  evidenceId: string | null;
}

export type FrameworkKind = "electron";

export interface Framework {
  kind: FrameworkKind;
  /** Exact version, or null when it could not be established. */
  version: string | null;
  /** How the version was found, e.g. "package.json devDependencies". */
  versionSource: string | null;
}

export interface ModuleRef {
  specifier: string;
  /** Files that import or require it. */
  importedBy: string[];
}

export interface Endpoint {
  url: string;
  host: string | null;
  /** How the app reaches it, as REA reports it, e.g. "call:fetch". */
  mechanism: string | null;
  location: SourceLocation | null;
}

export interface WebPreference {
  name: string;
  /** Literal value when REA could read one; null when it is computed or absent. */
  value: string | number | boolean | null;
}

export interface BrowserWindowFacts {
  location: SourceLocation | null;
  webPreferences: WebPreference[];
}

export interface IpcChannel {
  channel: string;
  side: string;
  operation: string;
  location: SourceLocation | null;
}

export type Severity = "info" | "low" | "medium" | "high";

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Where in the app this came from, when it maps to a file. */
  locations: SourceLocation[];
}

export interface XrayReport {
  schema: typeof XRAY_SCHEMA;
  generatedAt: string;
  target: {
    inputPath: string;
    format: string;
    sha256: string | null;
    name: string | null;
    version: string | null;
  };
  engine: Engine;
  frameworks: Framework[];
  modules: ModuleRef[];
  endpoints: Endpoint[];
  browserWindows: BrowserWindowFacts[];
  preloads: string[];
  ipcChannels: IpcChannel[];
  findings: Finding[];
  /** What the engine could not see; shown in the report instead of being hidden. */
  limitations: string[];
}

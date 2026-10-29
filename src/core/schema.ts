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
  /** "rea-agents", or "app-xray" for inputs it reads itself (APKs). */
  name: "rea-agents" | "app-xray";
  version: string;
  operation: string;
  evidenceId: string | null;
}

export type FrameworkKind =
  | "electron"
  | "chromium"
  | "android"
  | "flutter"
  | "react-native"
  | "unity"
  | "xamarin"
  | "cordova"
  | "capacitor"
  | "go"
  | "rust";

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

export interface FuseState {
  name: string;
  /** "enabled" | "disabled" | "removed" | other states REA reports. */
  state: string;
}

export interface IpcStats {
  mainHandlers: number;
  /** Places where a handler checks which page sent the message. */
  senderValidations: number;
  /** IPC calls whose channel name is computed at runtime. */
  dynamicChannelOperations: number;
}

export interface StorageUse {
  kind: string;
  mechanism: string | null;
  location: SourceLocation | null;
}

export interface AndroidSdk {
  name: string;
  category: string;
  /** Classes of this SDK found in the app's DEX files. */
  classes: number;
  /** One matching class, as evidence. */
  example: string;
}

/** Facts from an APK's manifest and DEX string tables. */
export interface AndroidFacts {
  package: string | null;
  versionCode: number | null;
  minSdk: number | null;
  targetSdk: number | null;
  permissions: string[];
  /** Permissions Android treats as dangerous (runtime-granted) or special. */
  sensitivePermissions: string[];
  components: { activities: number; services: number; receivers: number; providers: number; exported: number };
  debuggable: boolean;
  allowBackup: boolean | null;
  usesCleartextTraffic: boolean | null;
  networkSecurityConfig: boolean;
  usesAdvertisingId: boolean;
  sdks: AndroidSdk[];
  nativeLibs: string[];
  dexClasses: number;
}

/** A library compiled into a native binary, from its embedded build metadata. */
export interface Dependency {
  ecosystem: "go" | "cargo";
  name: string;
  version: string | null;
  /** Go replace directive target, when the module was swapped for another path or version. */
  replacedBy: string | null;
}

/** Facts about a native executable (Go or Rust). */
export interface NativeFacts {
  format: string;
  architecture: string | null;
  language: "go" | "rust" | null;
  /** Go build settings (CGO_ENABLED, vcs.revision, -ldflags…). */
  buildSettings: Record<string, string>;
}

/** A published advisory that matches a dependency version (from OSV, with --osv). */
export interface Vulnerability {
  id: string;
  aliases: string[];
  ecosystem: Dependency["ecosystem"];
  package: string;
  version: string;
  summary: string | null;
  /** The advisory's own rating when it has one, e.g. "HIGH" or "MODERATE". */
  severity: string | null;
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
  /** Remote http(s) pages loaded into app windows. */
  remotePages: string[];
  ipcChannels: IpcChannel[];
  ipc: IpcStats;
  storage: StorageUse[];
  nativeAddonBindings: number;
  /** Present for Android apps (APK input). */
  android?: AndroidFacts;
  /** Present for native executables. */
  native?: NativeFacts;
  /** Libraries compiled into a native executable. */
  dependencies?: Dependency[];
  /** Advisories matching those libraries; absent unless the scan asked OSV. */
  vulnerabilities?: Vulnerability[];
  /** Electron fuses of the packaged executable; null when there is no executable to read. */
  fuses: FuseState[] | null;
  findings: Finding[];
  /** What the engine could not see; shown in the report instead of being hidden. */
  limitations: string[];
}

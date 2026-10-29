import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { hostOf } from "../core/normalize.js";
import {
  XRAY_SCHEMA,
  type AndroidFacts,
  type AndroidSdk,
  type Endpoint,
  type Framework,
  type XrayReport,
} from "../core/schema.js";
import { loadData } from "../rules/data.js";
import { resolveStrings } from "./arsc.js";
import { parseAxml, type XmlElement } from "./axml.js";
import { readDex } from "./dex.js";
import { ZipFile } from "./zip.js";

// Scans an APK without Java or a decompiler: the manifest gives permissions, components and
// security flags; the DEX string tables give the classes compiled in (SDKs) and literal addresses.

interface SdkData {
  sdks: Array<{ name: string; category: string; prefixes: string[]; exclude?: string[] }>;
}

// Runtime ("dangerous") permissions and special-access permissions the user has to grant.
const SENSITIVE_PERMISSIONS = new Set([
  "ACCESS_FINE_LOCATION",
  "ACCESS_COARSE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION",
  "ACCESS_MEDIA_LOCATION",
  "CAMERA",
  "RECORD_AUDIO",
  "READ_CONTACTS",
  "WRITE_CONTACTS",
  "GET_ACCOUNTS",
  "READ_CALENDAR",
  "WRITE_CALENDAR",
  "READ_CALL_LOG",
  "WRITE_CALL_LOG",
  "PROCESS_OUTGOING_CALLS",
  "READ_PHONE_STATE",
  "READ_PHONE_NUMBERS",
  "CALL_PHONE",
  "ANSWER_PHONE_CALLS",
  "ADD_VOICEMAIL",
  "USE_SIP",
  "SEND_SMS",
  "RECEIVE_SMS",
  "READ_SMS",
  "RECEIVE_WAP_PUSH",
  "RECEIVE_MMS",
  "BODY_SENSORS",
  "BODY_SENSORS_BACKGROUND",
  "ACTIVITY_RECOGNITION",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
  "READ_MEDIA_IMAGES",
  "READ_MEDIA_VIDEO",
  "READ_MEDIA_AUDIO",
  "MANAGE_EXTERNAL_STORAGE",
  "BLUETOOTH_SCAN",
  "BLUETOOTH_CONNECT",
  "NEARBY_WIFI_DEVICES",
  "UWB_RANGING",
  "SYSTEM_ALERT_WINDOW",
  "REQUEST_INSTALL_PACKAGES",
  "QUERY_ALL_PACKAGES",
  "PACKAGE_USAGE_STATS",
  "BIND_ACCESSIBILITY_SERVICE",
  "BIND_NOTIFICATION_LISTENER_SERVICE",
  "BIND_DEVICE_ADMIN",
  "READ_PRIVILEGED_PHONE_STATE",
]);

// XML namespaces and schema URLs that every APK carries; they are identifiers, not addresses.
const NAMESPACE_HOSTS = new Set([
  "schemas.android.com",
  "www.w3.org",
  "ns.adobe.com",
  "xml.org",
  "xmlpull.org",
  "apache.org",
  "www.apache.org",
  "java.sun.com",
  "xml.apache.org",
  "purl.org",
  "schemas.microsoft.com",
  "schemas.xmlsoap.org",
  "ns.google.com",
  "dashif.org",
  "aomedia.org",
  "javax.xml.xmlconstants",
  "default.url",
]);

const URL_RE = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>\\{}|^`]*)?/g;

// Cross-platform frameworks, recognized by the files they ship.
const FRAMEWORK_MARKERS: Array<{ kind: Framework["kind"]; test: (name: string) => boolean; source: string }> = [
  { kind: "flutter", test: (n) => /^lib\/[^/]+\/libflutter\.so$/.test(n) || n.startsWith("assets/flutter_assets/"), source: "libflutter.so" },
  {
    kind: "react-native",
    test: (n) => /^lib\/[^/]+\/libreactnativejni\.so$/.test(n) || n === "assets/index.android.bundle",
    source: "React Native runtime",
  },
  { kind: "unity", test: (n) => /^lib\/[^/]+\/libunity\.so$/.test(n), source: "libunity.so" },
  { kind: "xamarin", test: (n) => /^lib\/[^/]+\/libmonodroid\.so$/.test(n) || n.startsWith("assemblies/"), source: "Mono runtime" },
  { kind: "capacitor", test: (n) => n === "assets/capacitor.config.json", source: "capacitor.config.json" },
  { kind: "cordova", test: (n) => n === "assets/www/cordova.js", source: "cordova.js" },
];

export interface ApkOptions {
  toolVersion: string;
  now?: Date;
}

export async function analyzeApk(file: string, opts: ApkOptions): Promise<XrayReport> {
  const zip = await ZipFile.open(file);
  try {
    const manifestEntry = zip.find("AndroidManifest.xml");
    if (!manifestEntry) throw new Error(`${file} has no AndroidManifest.xml; is it an APK?`);
    const manifest = parseAxml(await zip.read(manifestEntry));

    const dexEntries = zip.entries
      .filter((e) => /^classes\d*\.dex$/.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
    const classes = new Set<string>();
    const endpoints = new Map<string, Endpoint>();
    for (const entry of dexEntries) {
      const dex = readDex(await zip.read(entry));
      for (const c of dex.classes) classes.add(c);
      for (const s of dex.strings) {
        if (!s.includes("http")) continue;
        for (const [match] of s.matchAll(URL_RE)) {
          const url = match.replace(/[.,;:)\]]+$/, "");
          const host = hostOf(url);
          if (!host || !host.includes(".") || NAMESPACE_HOSTS.has(host) || endpoints.has(url)) continue;
          endpoints.set(url, { url, host, mechanism: "dex-string", location: { path: entry.name } });
        }
      }
    }

    const names = zip.entries.map((e) => e.name);
    const android = manifestFacts(manifest, classes);
    android.sdks = detectSdks(classes);
    android.nativeLibs = [...new Set(names.flatMap((n) => /^lib\/[^/]+\/([^/]+\.so)$/.exec(n)?.[1] ?? []))].sort();
    android.dexClasses = classes.size;

    const frameworks: Framework[] = [
      {
        kind: "android",
        version: android.targetSdk !== null ? `API ${android.targetSdk}` : null,
        versionSource: android.targetSdk !== null ? "AndroidManifest.xml targetSdkVersion" : null,
      },
      ...FRAMEWORK_MARKERS.filter((m) => names.some(m.test)).map((m) => ({ kind: m.kind, version: null, versionSource: m.source })),
    ];

    const label = await appLabel(zip, manifest.children.find((c) => c.name === "application")?.attrs["label"]);
    return {
      schema: XRAY_SCHEMA,
      generatedAt: (opts.now ?? new Date()).toISOString(),
      target: {
        inputPath: file,
        format: "apk",
        sha256: await sha256(file),
        name: label ?? android.package,
        version: str(manifest.attrs["versionName"]),
      },
      engine: { name: "app-xray", version: opts.toolVersion, operation: "inspect_apk", evidenceId: null },
      frameworks,
      modules: [],
      endpoints: [...endpoints.values()].sort((a, b) => a.url.localeCompare(b.url)),
      browserWindows: [],
      preloads: [],
      remotePages: [],
      ipcChannels: [],
      ipc: { mainHandlers: 0, senderValidations: 0, dynamicChannelOperations: 0 },
      storage: [],
      nativeAddonBindings: 0,
      android,
      fuses: null,
      findings: [],
      limitations: [
        "APK read natively from its manifest and DEX string tables; the code was not decompiled, so addresses built at runtime and what the code does with them are not seen.",
        "SDKs are recognized by class names. Apps shrunk with R8/ProGuard may rename them, which hides an SDK from this report.",
        ...(dexEntries.length === 0 ? ["No classes*.dex files found: the code may be in a split APK or loaded at runtime."] : []),
        ...(frameworks.some((f) => f.kind === "flutter" || f.kind === "react-native" || f.kind === "unity" || f.kind === "xamarin")
          ? ["Part of this app runs outside DEX (Flutter, React Native, Unity or Xamarin code); that code was not analyzed."]
          : []),
      ],
    };
  } finally {
    await zip.close();
  }
}

function manifestFacts(manifest: XmlElement, classes: Set<string>): AndroidFacts {
  const usesSdk = manifest.children.find((c) => c.name === "uses-sdk");
  const app = manifest.children.find((c) => c.name === "application");
  const permissions = [
    ...new Set(
      manifest.children
        .filter((c) => c.name === "uses-permission" || c.name === "uses-permission-sdk-23")
        .flatMap((c) => str(c.attrs["name"]) ?? []),
    ),
  ].sort();
  const sensitivePermissions = permissions.filter(
    (p) => p.startsWith("android.permission.") && SENSITIVE_PERMISSIONS.has(p.slice("android.permission.".length)),
  );

  const components = { activities: 0, services: 0, receivers: 0, providers: 0, exported: 0 };
  for (const c of app?.children ?? []) {
    const kind = (
      { activity: "activities", "activity-alias": "activities", service: "services", receiver: "receivers", provider: "providers" } as const
    )[c.name as "activity"];
    if (!kind) continue;
    components[kind]++;
    // Without an explicit value, a component with an intent filter is reachable by other apps.
    const exported = c.attrs["exported"] ?? c.children.some((x) => x.name === "intent-filter");
    if (exported === true && c.attrs["permission"] === undefined) components.exported++;
  }

  return {
    package: str(manifest.attrs["package"]),
    versionCode: num(manifest.attrs["versionCode"]),
    minSdk: num(usesSdk?.attrs["minSdkVersion"]),
    targetSdk: num(usesSdk?.attrs["targetSdkVersion"]),
    permissions,
    sensitivePermissions,
    components,
    debuggable: app?.attrs["debuggable"] === true,
    // Android defaults allowBackup to true when the manifest does not say.
    allowBackup: typeof app?.attrs["allowBackup"] === "boolean" ? app.attrs["allowBackup"] : null,
    usesCleartextTraffic: typeof app?.attrs["usesCleartextTraffic"] === "boolean" ? app.attrs["usesCleartextTraffic"] : null,
    networkSecurityConfig: app?.attrs["networkSecurityConfig"] !== undefined,
    usesAdvertisingId:
      permissions.includes("com.google.android.gms.permission.AD_ID") ||
      classes.has("com.google.android.gms.ads.identifier.AdvertisingIdClient"),
    sdks: [],
    nativeLibs: [],
    dexClasses: 0,
  };
}

/** The application label, looked up in resources.arsc when the manifest points at a resource. */
async function appLabel(zip: ZipFile, label: unknown): Promise<string | null> {
  if (typeof label !== "string" || !label) return null;
  const ref = /^@0x([0-9a-f]{8})$/.exec(label);
  if (!ref) return label;
  const table = zip.find("resources.arsc");
  if (!table) return null;
  const id = Number.parseInt(ref[1]!, 16);
  return resolveStrings(await zip.read(table), [id]).get(id)?.trim() || null;
}

let sdkData: SdkData | null = null;

export function detectSdks(classes: Iterable<string>, data: SdkData = (sdkData ??= loadData<SdkData>("android-sdks.json"))): AndroidSdk[] {
  const found = new Map<string, AndroidSdk>();
  for (const cls of classes) {
    for (const sdk of data.sdks) {
      if (!sdk.prefixes.some((p) => cls.startsWith(p))) continue;
      if (sdk.exclude?.some((p) => cls.startsWith(p))) continue;
      const hit = found.get(sdk.name);
      if (hit) hit.classes++;
      else found.set(sdk.name, { name: sdk.name, category: sdk.category, classes: 1, example: cls });
    }
  }
  return [...found.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function isApk(file: string): boolean {
  return /\.apk$/i.test(file);
}

export function toolVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

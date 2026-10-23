import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface VersionHit {
  version: string;
  source: string;
  /** Bundled Chromium version, when the source records it. */
  chromium?: string;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Finds the Electron version an app ships with, from the cheapest reliable source:
 *  1. package.json dependencies (unpacked source trees)
 *  2. the user-agent string compiled into the app's executable (Windows/Linux packages) or
 *     Electron Framework (macOS), which also names the bundled Chromium
 *  3. macOS: Electron Framework's Info.plist
 *  4. the `version` file Electron distributions carry beside the executable
 * Returns null when none of these is present; the caller reports that as unknown.
 */
export async function detectElectronVersion(appPath: string): Promise<VersionHit | null> {
  const root = path.resolve(appPath);
  return (
    (await fromPackageJson(root)) ??
    (await fromExecutable(root)) ??
    (await fromMacFramework(root)) ??
    (await fromVersionFile(root))
  );
}

// Monorepos (GitHub Desktop, Bitwarden) declare electron in a parent workspace's package.json.
const PACKAGE_JSON_LEVELS = 3;

async function fromPackageJson(root: string): Promise<VersionHit | null> {
  let dir = root;
  for (let level = 0; level <= PACKAGE_JSON_LEVELS; level++) {
    const hit = await electronDependency(dir);
    if (hit) return { version: hit.version, source: `${"../".repeat(level)}package.json ${hit.field}` };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function electronDependency(dir: string): Promise<{ version: string; field: string } | null> {
  const pkg = await readJson(path.join(dir, "package.json"));
  if (!pkg) return null;
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const deps = pkg[field] as Record<string, unknown> | undefined;
    const raw = deps?.["electron"];
    if (typeof raw !== "string") continue;
    const version = raw.replace(/^[\^~=v]+/, "");
    if (SEMVER.test(version)) return { version, field };
  }
  return null;
}

async function fromVersionFile(root: string): Promise<VersionHit | null> {
  // <install>/version beside <install>/resources/app(.asar)
  for (const dir of [root, path.dirname(root), path.dirname(path.dirname(root))]) {
    const text = await readText(path.join(dir, "version"));
    const version = text?.trim().replace(/^v/, "");
    if (version && SEMVER.test(version)) return { version, source: `${path.basename(dir)}/version file` };
  }
  return null;
}

async function fromMacFramework(root: string): Promise<VersionHit | null> {
  const contents = macContentsDir(root);
  if (!contents) return null;
  const plist = await readText(
    path.join(contents, "Frameworks", "Electron Framework.framework", "Resources", "Info.plist"),
  );
  const match = plist?.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
  const version = match?.[1]?.trim();
  if (version && SEMVER.test(version)) return { version, source: "Electron Framework Info.plist" };
  return null;
}

// Every Electron build carries its user-agent suffix as a literal, e.g. "Chrome/156.0.8078.48 Electron/45.0.0".
const USER_AGENT = /Chrome\/(\d+\.\d+\.\d+\.\d+) Electron\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/;
const NOT_EXECUTABLE = /\.(?:pak|dat|bin|asar|so(?:\.\d+)*|dll|html|json|txt)$/i;
export const MIN_EXECUTABLE_BYTES = 20 * 1024 * 1024;

async function fromExecutable(root: string, minBytes = MIN_EXECUTABLE_BYTES): Promise<VersionHit | null> {
  for (const file of await candidateExecutables(root, minBytes)) {
    const match = await scanFile(file, USER_AGENT);
    const [, chromium, version] = match ?? [];
    if (version && chromium) return { version, chromium, source: `${path.basename(file)} user-agent string` };
  }
  return null;
}

/**
 * The install directory is the one holding `resources/`; the app may be given as that directory,
 * as resources/, or as resources/app(.asar). Largest files first: the Electron executable dominates.
 * Inside a macOS .app bundle the candidate is the Electron Framework binary.
 */
export async function candidateExecutables(root: string, minBytes = MIN_EXECUTABLE_BYTES): Promise<string[]> {
  // macOS: the fuse wire and the user-agent string live in the framework, not in Contents/MacOS.
  const contents = macContentsDir(root);
  if (contents) {
    const framework = path.join(contents, "Frameworks", "Electron Framework.framework", "Electron Framework");
    const size = await stat(framework).then((s) => s.size, () => 0);
    return size >= minBytes ? [framework] : [];
  }
  const dirs = [root, path.dirname(root), path.dirname(path.dirname(root))];
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (!entries.some((e) => e.isDirectory() && e.name === "resources")) continue;
    const sized: Array<{ file: string; size: number }> = [];
    for (const e of entries) {
      if (!e.isFile() || NOT_EXECUTABLE.test(e.name)) continue;
      const file = path.join(dir, e.name);
      const { size } = await stat(file);
      if (size >= minBytes) sized.push({ file, size });
    }
    return sized.sort((a, b) => b.size - a.size).slice(0, 2).map((s) => s.file);
  }
  return [];
}

/** Streams a file looking for a short ASCII pattern; keeps an overlap so matches across chunks are found. */
export async function scanFile(file: string, pattern: RegExp): Promise<RegExpExecArray | null> {
  const overlap = 256;
  let carry = "";
  for await (const chunk of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) {
    const text = carry + (chunk as Buffer).toString("latin1");
    const match = pattern.exec(text);
    if (match) return match;
    carry = text.slice(-overlap);
  }
  return null;
}

function macContentsDir(root: string): string | null {
  const parts = root.split(path.sep);
  const appIndex = parts.findIndex((p) => p.endsWith(".app"));
  if (appIndex === -1) return null;
  return path.join(parts.slice(0, appIndex + 1).join(path.sep) || path.sep, "Contents");
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  const text = await readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readText(file: string): Promise<string | null> {
  try {
    if (!(await stat(file)).isFile()) return null;
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

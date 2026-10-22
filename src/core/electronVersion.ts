import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface VersionHit {
  version: string;
  source: string;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Finds the Electron version an app ships with, from the cheapest reliable source:
 *  1. package.json dependencies (unpacked source trees)
 *  2. the `version` file Electron distributions carry beside the executable
 *  3. macOS: Electron Framework's Info.plist
 * Returns null when none of these is present; the caller reports that as unknown.
 */
export async function detectElectronVersion(appPath: string): Promise<VersionHit | null> {
  const root = path.resolve(appPath);
  return (
    (await fromPackageJson(root)) ??
    (await fromVersionFile(root)) ??
    (await fromMacFramework(root))
  );
}

async function fromPackageJson(root: string): Promise<VersionHit | null> {
  const pkg = await readJson(path.join(root, "package.json"));
  if (!pkg) return null;
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const deps = pkg[field] as Record<string, unknown> | undefined;
    const raw = deps?.["electron"];
    if (typeof raw !== "string") continue;
    const version = raw.replace(/^[\^~=v]+/, "");
    if (SEMVER.test(version)) return { version, source: `package.json ${field}` };
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

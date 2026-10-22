import { cp, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Source checkouts carry tests, stories and build tooling that never ship in the app. Scanning
// them is slow (Signal Desktop: 835 of 3,060 script files are tests) and adds addresses the app
// never contacts, so for checkouts we analyze a filtered copy instead. Checked-in minified or
// generated bundles go too: Signal's 265 KB emscripten wrapper alone took REA 60 s.

const EXCLUDED_DIRS = new Set([
  ".git",
  "test",
  "tests",
  "__tests__",
  "__mocks__",
  "e2e",
  "fixtures",
  "stories",
  ".storybook",
  "docs",
  "website",
  "codemods",
  "scripts",
  "bin",
]);
const EXCLUDED_DIR_PREFIXES = ["test-", "tests-"];
const EXCLUDED_FILES = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const GENERATED_MIN_BYTES = 64 * 1024;
const GENERATED_MIN_AVG_LINE = 500;
const LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock"];
const SEARCH_LEVELS = 3;

export interface Scope {
  /** Path handed to REA: the original, or a filtered copy. */
  analyzedPath: string;
  filtered: boolean;
  excludedFiles: number;
  cleanup(): Promise<void>;
}

/** A directory inside a git checkout or package workspace, as opposed to an installed app. */
export async function isSourceCheckout(appPath: string): Promise<boolean> {
  let dir = path.resolve(appPath);
  if (!(await isDirectory(dir))) return false;
  for (let level = 0; level <= SEARCH_LEVELS; level++) {
    const names = await readdir(dir).catch(() => [] as string[]);
    if (names.includes(".git") || LOCKFILES.some((l) => names.includes(l))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/** Large script files whose lines average hundreds of characters are minified or generated. */
export function looksGenerated(text: string): boolean {
  if (text.length < GENERATED_MIN_BYTES) return false;
  const lines = text.split("\n").length;
  return text.length / lines > GENERATED_MIN_AVG_LINE;
}

export function isExcluded(relativePath: string, isDir: boolean): boolean {
  const name = path.basename(relativePath);
  if (isDir) return EXCLUDED_DIRS.has(name) || EXCLUDED_DIR_PREFIXES.some((p) => name.startsWith(p));
  return EXCLUDED_FILES.test(name);
}

export async function prepareScope(appPath: string, { allFiles = false } = {}): Promise<Scope> {
  const source = path.resolve(appPath);
  if (allFiles || !(await isSourceCheckout(source))) {
    return { analyzedPath: source, filtered: false, excludedFiles: 0, cleanup: async () => {} };
  }

  const staging = await mkdtemp(path.join(os.tmpdir(), "app-xray-scope-"));
  const target = path.join(staging, path.basename(source));
  let excludedFiles = 0;
  await cp(source, target, {
    recursive: true,
    // Symlinks stay links; REA inventories them as such.
    verbatimSymlinks: true,
    filter: async (from) => {
      if (from === source) return true;
      const rel = path.relative(source, from);
      const isDir = await isDirectory(from);
      if (!isExcluded(rel, isDir) && !(await isGeneratedScript(from, isDir))) return true;
      excludedFiles += isDir ? await countFiles(from) : 1;
      return false;
    },
  });
  return {
    analyzedPath: target,
    filtered: true,
    excludedFiles,
    cleanup: () => rm(staging, { recursive: true, force: true }),
  };
}

async function isGeneratedScript(file: string, isDir: boolean): Promise<boolean> {
  if (isDir || !SCRIPT_FILE.test(file)) return false;
  if ((await stat(file)).size < GENERATED_MIN_BYTES) return false;
  return looksGenerated(await readFile(file, "utf8"));
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function countFiles(dir: string): Promise<number> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isFile()).length;
}

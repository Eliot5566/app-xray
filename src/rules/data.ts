import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// data/ sits at the package root, two levels above both src/rules and dist/rules.
export function loadData<T>(name: string): T {
  const file = fileURLToPath(new URL(`../../data/${name}`, import.meta.url));
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

import type { Dependency, Vulnerability } from "../core/schema.js";

// Looks up dependency versions in OSV (https://osv.dev), the open vulnerability database that
// covers the Go and crates.io ecosystems. Only package names and versions are sent.

const API = "https://api.osv.dev/v1";
const ECOSYSTEM: Record<Dependency["ecosystem"], string> = { go: "Go", cargo: "crates.io" };

type Fetch = typeof fetch;

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  database_specific?: { severity?: string };
}

/** Queries OSV for each dependency (and the Go standard library, given its version). */
export async function queryOsv(deps: Dependency[], goVersion: string | null, fetchImpl: Fetch = fetch): Promise<Vulnerability[]> {
  const targets = deps
    .filter((d) => d.version && !d.version.startsWith("("))
    .map((d) => ({ ecosystem: d.ecosystem, name: d.name, version: d.version! }));
  if (goVersion) targets.push({ ecosystem: "go", name: "stdlib", version: goVersion });
  if (targets.length === 0) return [];

  const ids: Array<{ target: (typeof targets)[number]; ids: string[] }> = [];
  for (let i = 0; i < targets.length; i += 1000) {
    const batch = targets.slice(i, i + 1000);
    const body = {
      queries: batch.map((t) => ({
        package: { ecosystem: ECOSYSTEM[t.ecosystem], name: t.name },
        // OSV's Go entries use versions without the leading "v".
        version: t.ecosystem === "go" ? t.version.replace(/^v/, "") : t.version,
      })),
    };
    const res = await fetchImpl(`${API}/querybatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OSV query failed: HTTP ${res.status}`);
    const json = (await res.json()) as { results?: Array<{ vulns?: Array<{ id: string }> }> };
    batch.forEach((target, j) => {
      const found = json.results?.[j]?.vulns?.map((v) => v.id) ?? [];
      if (found.length) ids.push({ target, ids: found });
    });
  }

  const details = new Map<string, OsvVuln>();
  const unique = [...new Set(ids.flatMap((x) => x.ids))];
  for (let i = 0; i < unique.length; i += 8) {
    await Promise.all(
      unique.slice(i, i + 8).map(async (id) => {
        const res = await fetchImpl(`${API}/vulns/${encodeURIComponent(id)}`);
        if (res.ok) details.set(id, (await res.json()) as OsvVuln);
      }),
    );
  }

  return ids.flatMap(({ target, ids }) =>
    ids.map((id) => {
      const v = details.get(id);
      return {
        id,
        aliases: v?.aliases ?? [],
        ecosystem: target.ecosystem,
        package: target.name,
        version: target.version,
        summary: v?.summary ?? v?.details?.split("\n")[0]?.slice(0, 200) ?? null,
        severity: v?.database_specific?.severity?.toUpperCase() ?? null,
      };
    }),
  );
}

import { hostOf } from "./normalize.js";
import type { Endpoint } from "./schema.js";

// Literal URLs pulled from string tables (DEX, native binaries). These tables are full of XML
// namespaces and spec identifiers that look like URLs but are never fetched; those are dropped.

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
  "schemas.openxmlformats.org",
  "ns.google.com",
  "dashif.org",
  "aomedia.org",
  "javax.xml.xmlconstants",
  "default.url",
]);

const URL_RE = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>\\{}|^`\x00-\x1f\x7f-\xff]*)?/g;

/** Adds every literal URL in `text` to `into`, keyed by URL; the first location seen wins. */
export function collectUrls(text: string, into: Map<string, Endpoint>, mechanism: string, location: string): void {
  if (!text.includes("http")) return;
  for (const [match] of text.matchAll(URL_RE)) {
    const url = match.replace(/[.,;:)\]]+$/, "");
    if (into.has(url)) continue;
    const host = hostOf(url);
    if (!host || !host.includes(".") || NAMESPACE_HOSTS.has(host)) continue;
    into.set(url, { url, host, mechanism, location: { path: location } });
  }
}

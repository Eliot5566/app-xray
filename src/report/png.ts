import { fileURLToPath } from "node:url";

// PNG copy of the summary card. X, Facebook, LinkedIn and Slack show PNG link previews but not
// SVG. The renderer is an optional dependency with prebuilt native binaries; on a platform it
// does not cover, the scan still writes card.svg and skips the PNG.

interface Resvg {
  render(): { asPng(): Uint8Array };
}
type ResvgModule = {
  Resvg: new (svg: string, options?: Record<string, unknown>) => Resvg;
};

export async function renderPng(svg: string): Promise<Uint8Array | null> {
  let mod: ResvgModule;
  try {
    mod = (await import("@resvg/resvg-js")) as unknown as ResvgModule;
  } catch {
    return null;
  }
  // Bundled Inter (data/fonts, OFL) so the image looks the same on every machine and text never
  // falls back to a serif face where the card's system fonts are missing.
  const fontFiles = ["Inter-Regular.otf", "Inter-SemiBold.otf", "Inter-Bold.otf"].map((f) =>
    fileURLToPath(new URL(`../../data/fonts/${f}`, import.meta.url)),
  );
  const resvg = new mod.Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles, defaultFontFamily: "Inter", sansSerifFamily: "Inter" },
  });
  return resvg.render().asPng();
}

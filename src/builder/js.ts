/**
 * Client-side JS/TSX bundling via `Deno.bundle` (unstable).
 *
 * Each entrypoint under `src/client/` is compiled to a same-named
 * `.js` (with linked sourcemap) under `src/bundled/`.
 */

const HTML_ENTRIES = [
  "index.html",
  "hydration.html",
] as const;

const JS_ENTRIES = [
  "counter.tsx",
  "frame.tsx",
];
export async function buildJs(
  { minify = false, write = true }: { minify?: boolean; write?: boolean } = {},
) {
  async function bundle(entrypoints: string[]) {
    await Deno.bundle({
      entrypoints,
      outputDir: new URL("../../dist", import.meta.url).pathname,
      platform: "browser",
      sourcemap: "linked",
      minify,
      write,
    });
  }

  await bundle(HTML_ENTRIES.map((p) => import.meta.resolve(`../../dist/${p}`)));
  await bundle(JS_ENTRIES.map((p) => import.meta.resolve(`../client/${p}`)));
}

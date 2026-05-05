/**
 * Copies static asset files from `src/assets/` subdirectories that need
 * to be served at runtime (e.g. character sprite sheets) into `dist/`.
 * Only directories listed in `ASSET_DIRS` are copied; `style.css` is
 * handled by the Tailwind build.
 */

const ASSET_DIRS = ["characters"] as const;

const SRC_ROOT = new URL("../assets/", import.meta.url);
const DIST_ROOT = new URL("../../dist/", import.meta.url);

export async function copyAssets() {
  for (const dir of ASSET_DIRS) {
    const src = new URL(`${dir}/`, SRC_ROOT).pathname;
    const dst = new URL(`${dir}/`, DIST_ROOT).pathname;
    try {
      await Deno.stat(src);
    } catch {
      continue;
    }
    await Deno.mkdir(dst, { recursive: true });
    for await (const entry of Deno.readDir(src)) {
      if (!entry.isFile) continue;
      await Deno.copyFile(`${src}${entry.name}`, `${dst}${entry.name}`);
    }
  }
}

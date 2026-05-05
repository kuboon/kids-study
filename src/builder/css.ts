/**
 * Tailwind CSS build via `@kuboon/tailwindcss-deno`.
 *
 * Compiles `src/assets/style.css` (which `@import`s `tailwindcss/index.css`)
 * into `src/bundled/style.css`, scanning the `src/server` and `src/client`
 * trees for class candidates.
 */

import { compile, optimize } from "@kuboon/tailwindcss-deno";
import { Scanner } from "@tailwindcss/oxide";

const SRC_ROOT = new URL("..", import.meta.url).pathname;
const INPUT = new URL("../assets/style.css", import.meta.url).pathname;
const OUTPUT = new URL("../../dist/style.css", import.meta.url).pathname;

export async function buildCss(
  { minify = false }: { minify?: boolean } = {},
) {
  const scanner = new Scanner({
    sources: [
      { base: `${SRC_ROOT}client`, pattern: "**/*", negated: false },
      { base: `${SRC_ROOT}ssg`, pattern: "**/*", negated: false },
    ],
  });
  const candidates = scanner.scan();

  const input = await Deno.readTextFile(INPUT);
  const compiler = await compile(input, {
    base: SRC_ROOT,
    from: INPUT,
    onDependency: () => {},
    customCssResolver: (id) => {
      if (id === "tailwindcss/index.css") {
        const pathname = new URL(import.meta.resolve(id)).pathname;
        console.log(`[css] resolved ${id} to ${pathname}`);
        return Promise.resolve(pathname);
      }
      return Promise.resolve(undefined);
    },
  });

  const built = compiler.build(candidates);
  const { code } = optimize(built, { minify, file: OUTPUT });

  await Deno.mkdir(new URL("../bundled", import.meta.url), { recursive: true });
  await Deno.writeTextFile(OUTPUT, code);
  return { output: OUTPUT, bytes: code.length };
}

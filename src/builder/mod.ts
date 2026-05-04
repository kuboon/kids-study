/**
 * kids-study build entrypoint.
 *
 * Runs the JS bundle (Deno.bundle) and the Tailwind CSS build in
 * parallel, both writing into `src/bundled/`.
 */

import { buildSsg } from "./ssg.ts";
import { buildCss } from "./css.ts";
import { buildJs } from "./js.ts";

export { buildCss, buildJs };

if (import.meta.main) {
  await buildSsg();
  console.log(`[bundler] ssg complete`);
  await Promise.all([
    buildJs().then((js) => console.log("[bundler] js complete:", js)),
    buildCss().then((css) => console.log("[bundler] css complete:", css)),
  ]);
}

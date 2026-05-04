import { renderToString } from "@remix-run/ui/server";
import { pages } from "../ssg/mod.ts";

const distRoot = new URL("../../dist/", import.meta.url);

export async function buildSsg() {
  for (const { path, page } of pages) {
    const html = await renderToString(page);
    const output = new URL(path, distRoot).pathname;
    await Deno.writeTextFile(output, `<!DOCTYPE html>${html}`);
    console.log(`[ssg] built ${output} (${html.length} bytes)`);
  }
}

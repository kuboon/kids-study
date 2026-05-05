import { renderToString } from "@remix-run/ui/server";
import { pages } from "../ssg/mod.ts";

const distRoot = new URL("../../dist/", import.meta.url);

export async function buildSsg() {
  for (const { path, url } of pages) {
    // Read via a string variable so TypeScript treats the import as
    // dynamic and skips traversing the page module's type chain
    // (which would otherwise drag DOM types into the server-side build).
    const moduleUrl: string = url;
    const mod = await import(moduleUrl);
    const html = await renderToString(mod.default);
    const output = new URL(path, distRoot).pathname;
    await Deno.writeTextFile(output, `<!DOCTYPE html>${html}`);
    console.log(`[ssg] built ${output} (${html.length} bytes)`);
  }
}

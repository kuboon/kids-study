import { type ResolveFrameOptions, run } from "@remix-run/ui";

const app = run({
  loadModule: (url: string, name: string) => import(url).then((m) => m[name]),
  async resolveFrame(src: string, options?: ResolveFrameOptions) {
    const headers = new Headers({ accept: "text/html" });
    const response = await fetch(src, { headers, signal: options?.signal });
    return response.body ?? (await response.text());
  },
});

await app.ready();

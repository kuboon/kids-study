import { run } from "@remix-run/ui";

const app = run({
  loadModule: (url: string, name: string) => import(url).then((m) => m[name]),
  async resolveFrame(src: string, signal?: AbortSignal) {
    const headers = new Headers({ accept: "text/html" });
    const response = await fetch(src, { headers, signal });
    return response.body ?? (await response.text());
  },
});

await app.ready();

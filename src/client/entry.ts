import { run } from "@remix-run/ui";

const app = run({
  loadModule: (url: string, name: string) => import(url).then(m => m[name])
});

await app.ready();

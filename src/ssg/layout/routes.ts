import { route } from "@remix-run/fetch-router/routes";

// At build time `BASE_URL` may be a full URL like
// `https://kuboon.github.io/kids-study/` (or with a PR-preview suffix). We
// take its pathname so SSG-rendered links resolve under the correct base.
function basePathFromEnv(): string {
  const baseUrl = Deno.env.get("BASE_URL");
  if (!baseUrl) return "/";
  const pathname = new URL(baseUrl).pathname.replace(/\/+/g, "/");
  return pathname.endsWith("/") ? pathname : pathname + "/";
}

export const routes = route(basePathFromEnv(), {
  home: "/",
});

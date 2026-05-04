import { route } from "@remix-run/fetch-router/routes";

export const routes = route({
  home: "/",
  hydration: "/hydration.html",
});

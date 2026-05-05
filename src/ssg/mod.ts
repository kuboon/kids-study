// Page list for the SSG builder. We expose URLs (not JSX values) so the
// builder's type-checker does not transitively pull DOM-dependent client
// code into its (no-dom) compilation context.
export const pages = [
  { path: "index.html", url: import.meta.resolve("./index.tsx") },
];

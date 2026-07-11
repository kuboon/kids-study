import { assertAlmostEquals, assertEquals } from "@std/assert";
import { pathEndpoints, strokeDirs, svgStrokes } from "./gen_kanji_strokes.ts";

Deno.test("pathEndpoints: absolute line", () => {
  const { start, end } = pathEndpoints("M0,0 L10,0");
  assertEquals(start, { x: 0, y: 0 });
  assertEquals(end, { x: 10, y: 0 });
});

Deno.test("pathEndpoints: relative moveto+lineto accumulate", () => {
  const { start, end } = pathEndpoints("m5,5 l10,0 l0,10");
  assertEquals(start, { x: 5, y: 5 }); // first m is absolute
  assertEquals(end, { x: 15, y: 15 });
});

Deno.test("pathEndpoints: H/V update one axis", () => {
  const { end } = pathEndpoints("M0,0 H10 V10");
  assertEquals(end, { x: 10, y: 10 });
});

Deno.test("pathEndpoints: relative cubic uses only the endpoint pair", () => {
  // Two chained relative cubics; endpoint is the running sum of the last pair
  // of each command, control points ignored.
  const { start, end } = pathEndpoints(
    "M11,54.25c3.19,0.62,6.25,0.75,9.73,0.5c20.64-1.5,50.39-5.12,68.58-5.24",
  );
  assertEquals(start, { x: 11, y: 54.25 });
  assertAlmostEquals(end.x, 11 + 9.73 + 68.58, 1e-9); // 89.31
  assertAlmostEquals(end.y, 54.25 + 0.5 - 5.24, 1e-9); // 49.51
});

Deno.test("strokeDirs: straight stroke is a single direction", () => {
  assertEquals(strokeDirs("M50,10 L50,90", "㇑"), [2]); // down (S)
  assertEquals(strokeDirs("M10,50 L90,50", "㇐"), [0]); // right (E)
});

Deno.test("strokeDirs: a sharp corner (┓ 横折) splits into two directions", () => {
  // right along the top, then down the right side.
  assertEquals(strokeDirs("M20,20 L80,20 L80,80", "㇕"), [0, 2]); // →↓
});

Deno.test("strokeDirs: a short end hook does not add a direction", () => {
  // long vertical with a tiny up-left hook at the very end.
  assertEquals(strokeDirs("M50,15 L50,85 L44,80", "㇚"), [2]); // still just S
});

Deno.test("svgStrokes: extracts paths in order, ignores StrokeNumbers", () => {
  const svg = `<svg><g id="kvg:StrokePaths_x">
    <path id="kvg:x-s1" kvg:type="㇑" d="M50,10 L50,90"/>
    <path id="kvg:x-s2" kvg:type="㇕" d="M20,20 L80,20 L80,80"/>
  </g><g id="kvg:StrokeNumbers_x"><text>1</text><text>2</text></g></svg>`;
  const strokes = svgStrokes(svg);
  assertEquals(strokes.map((s) => s.dirs), [[2], [0, 2]]);
  assertEquals(strokes[0].d, "M50,10 L50,90");
});

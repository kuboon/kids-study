import { assertEquals } from "@std/assert";
import { svgPaths } from "./gen_kanji_strokes.ts";

Deno.test("svgPaths: extracts stroke paths in order, ignores StrokeNumbers", () => {
  const svg = `<svg><g id="kvg:StrokePaths_x">
    <path id="kvg:x-s1" kvg:type="㇑" d="M50,10 L50,90"/>
    <path id="kvg:x-s2" kvg:type="㇕" d="M20,20 L80,20 L80,80"/>
  </g><g id="kvg:StrokeNumbers_x"><text>1</text><text>2</text></g></svg>`;
  assertEquals(svgPaths(svg), ["M50,10 L50,90", "M20,20 L80,20 L80,80"]);
});

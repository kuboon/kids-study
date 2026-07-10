import { assertEquals } from "@std/assert";
import { DIR_ARROWS, DIRS, quantize8 } from "./dir.ts";

// screen-y-down: +x=right(E), +y=down(S).
Deno.test("quantize8 cardinal directions", () => {
  assertEquals(quantize8(1, 0), 0); // E
  assertEquals(quantize8(1, 1), 1); // SE
  assertEquals(quantize8(0, 1), 2); // S (down)
  assertEquals(quantize8(-1, 1), 3); // SW
  assertEquals(quantize8(-1, 0), 4); // W
  assertEquals(quantize8(-1, -1), 5); // NW
  assertEquals(quantize8(0, -1), 6); // N (up)
  assertEquals(quantize8(1, -1), 7); // NE
});

Deno.test("quantize8 snaps near-boundary angles", () => {
  // Just past due-east toward SE still rounds to E until ~22.5°.
  assertEquals(quantize8(10, 3), 0); // ~16.7° → E
  assertEquals(quantize8(10, 6), 1); // ~31° → SE
  // Magnitude does not matter, only direction.
  assertEquals(quantize8(100, 0), quantize8(2, 0));
});

Deno.test("quantize8 output is always a valid index", () => {
  for (let a = 0; a < 360; a += 7) {
    const r = a * Math.PI / 180;
    const idx = quantize8(Math.cos(r), Math.sin(r));
    if (idx < 0 || idx >= DIRS || !Number.isInteger(idx)) {
      throw new Error(`bad idx ${idx} at ${a}deg`);
    }
  }
  assertEquals(DIR_ARROWS.length, DIRS);
});

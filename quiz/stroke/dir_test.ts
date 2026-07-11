import { assertEquals } from "@std/assert";
import { DIR_ARROWS, DIRS, gestureDirs, quantize8 } from "./dir.ts";

// helper: build a straight run of points from (x0,y0) toward (x1,y1)
const line = (x0: number, y0: number, x1: number, y1: number, n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + (x1 - x0) * i / n,
    y: y0 + (y1 - y0) * i / n,
  }));

Deno.test("gestureDirs: straight drag is one direction", () => {
  assertEquals(gestureDirs(line(0, 0, 120, 0)), [0]); // →
  assertEquals(gestureDirs(line(0, 0, 0, 120)), [2]); // ↓
});

Deno.test("gestureDirs: an L-shaped drag (┓) is two directions", () => {
  // right, then down, one continuous path (no lift).
  const pts = [...line(0, 0, 120, 0), ...line(120, 0, 120, 120)];
  assertEquals(gestureDirs(pts), [0, 2]); // →↓
});

Deno.test("gestureDirs: slight wobble stays one direction", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 40, y: 4 },
    { x: 80, y: -3 },
    { x: 120, y: 2 },
  ];
  assertEquals(gestureDirs(pts), [0]); // still →
});

Deno.test("gestureDirs: a tiny drag yields nothing", () => {
  assertEquals(gestureDirs(line(0, 0, 5, 0)), []);
});

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

import { assertAlmostEquals, assertEquals } from "@std/assert";
import {
  centroid,
  meanDistance,
  polylineLength,
  resample,
  shapeAccuracy,
  strokeDistance,
} from "./match.ts";

const line = (x0: number, y0: number, x1: number, y1: number, n = 10) =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + (x1 - x0) * i / n,
    y: y0 + (y1 - y0) * i / n,
  }));

Deno.test("resample: evenly spaces a straight line", () => {
  const r = resample([{ x: 0, y: 0 }, { x: 100, y: 0 }], 5);
  assertEquals(r.length, 5);
  assertEquals(r.map((p) => Math.round(p.x)), [0, 25, 50, 75, 100]);
});

Deno.test("resample: a single point repeats", () => {
  const r = resample([{ x: 7, y: 3 }], 4);
  assertEquals(r, [{ x: 7, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 3 }, {
    x: 7,
    y: 3,
  }]);
});

Deno.test("strokeDistance: identical strokes are ~0", () => {
  const a = line(10, 10, 90, 40);
  assertAlmostEquals(strokeDistance(a, a), 0, 1e-6);
});

Deno.test("strokeDistance: a parallel-shifted stroke is ~the shift", () => {
  const a = line(10, 10, 90, 10);
  const b = line(10, 30, 90, 30); // shifted down by 20
  assertAlmostEquals(strokeDistance(a, b), 20, 1e-6);
});

Deno.test("strokeDistance: a reversed stroke is far", () => {
  const a = line(10, 10, 90, 10);
  const b = line(90, 10, 10, 10); // same shape, drawn backwards
  // endpoints are 80 apart, midpoint matches → mean well above any threshold.
  const d = strokeDistance(a, b);
  if (d < 30) throw new Error(`reversed should be far, got ${d}`);
});

Deno.test("polylineLength and centroid", () => {
  assertAlmostEquals(polylineLength(line(0, 0, 3, 4)), 5, 1e-9);
  assertEquals(centroid([{ x: 0, y: 0 }, { x: 2, y: 4 }]), { x: 1, y: 2 });
});

Deno.test("meanDistance: empty is Infinity", () => {
  assertEquals(meanDistance([], []), Infinity);
});

Deno.test("shapeAccuracy: identical shape scores ~1", () => {
  const a = line(10, 10, 90, 40);
  assertAlmostEquals(shapeAccuracy(a, a), 1, 1e-6);
});

Deno.test("shapeAccuracy: same shape, different position still ~1", () => {
  const a = line(10, 10, 70, 10);
  const b = line(40, 60, 100, 60); // translated, same angle & length
  assertAlmostEquals(shapeAccuracy(a, b), 1, 1e-6);
});

Deno.test("shapeAccuracy: wrong angle scores low", () => {
  const a = line(0, 0, 80, 0); // horizontal
  const b = line(0, 0, 0, 80); // vertical, same length
  const acc = shapeAccuracy(a, b);
  if (acc > 0.2) throw new Error(`perpendicular should score low, got ${acc}`);
});

Deno.test("shapeAccuracy: much shorter length scores lower than exact", () => {
  const a = line(0, 0, 80, 0);
  const short = line(0, 0, 30, 0); // same angle, ~⅜ the length
  const accShort = shapeAccuracy(a, short);
  const accExact = shapeAccuracy(a, a);
  if (!(accShort < accExact)) throw new Error("length should matter");
});

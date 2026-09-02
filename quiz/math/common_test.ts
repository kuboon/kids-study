import { assertEquals } from "@std/assert";
import { decimal, fraction, gcd, lcm, maxOf } from "./common.ts";

Deno.test("maxOf: 桁数から最大値", () => {
  assertEquals(maxOf(1), 9);
  assertEquals(maxOf(3), 999);
});

Deno.test("decimal: 整数で計算した値を小数表記にする", () => {
  // 0.1 + 0.2 を二進小数で足すと 0.30000000000000004 になる。整数で計算して
  // ここで表記に直すことでその誤差を避ける。
  assertEquals(decimal(1 + 2, 1), "0.3");
  assertEquals(decimal(123, 2), "1.23");
  assertEquals(decimal(120, 2), "1.2"); // 余計な0は付けない
  assertEquals(decimal(100, 2), "1");
  assertEquals(decimal(-25, 1), "-2.5");
  assertEquals(decimal(7, 0), "7");
});

Deno.test("gcd / lcm", () => {
  assertEquals(gcd(12, 18), 6);
  assertEquals(gcd(7, 13), 1);
  assertEquals(lcm(4, 6), 12);
});

Deno.test("fraction: 約分し、分母1は整数にする", () => {
  assertEquals(fraction(1, 2), "1/2");
  assertEquals(fraction(2, 4), "1/2");
  assertEquals(fraction(4, 4), "1");
  assertEquals(fraction(8, 4), "2");
  assertEquals(fraction(7, 5), "7/5");
});

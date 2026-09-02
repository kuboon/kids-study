/**
 * 算数クイズの共通部品。
 *
 * 4択は「正解と紛らわしい誤答」が要なので、誤答は問題ごとに近い値を作る。
 * また小数と分数は文字列で答えるため、表示の正規化をここに集約する。
 * 分数だけは MathML（`mathml.ts`）で組む。ゲーム側はこの markup を読める
 * （`plainMath` / `mathTokens`）ので、答えをプレーン文字列に限る必要はない。
 */

import type { PRNG } from "../prng.ts";
import { frac } from "./mathml.ts";

/** 整数の桁数から最大値（2 → 99）。 */
export const maxOf = (digits: number): number => 10 ** digits - 1;

/**
 * 小数を「余計な0を付けない」文字列にする。0.1+0.2 のような二進小数の誤差を
 * 出さないため、呼び出し側は整数で計算してから桁数を渡すこと。
 */
export const decimal = (scaled: number, places: number): string => {
  if (places <= 0) return String(scaled);
  const unit = 10 ** places;
  const sign = scaled < 0 ? "-" : "";
  const n = Math.abs(scaled);
  const frac = String(n % unit).padStart(places, "0").replace(/0+$/, "");
  return `${sign}${Math.floor(n / unit)}${frac ? "." + frac : ""}`;
};

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

export const lcm = (a: number, b: number): number => a / gcd(a, b) * b;

/**
 * 約分した分数。分母が1なら整数として表す（4/4 → 1、8/4 → 2）。
 * 約分してから組むので、同じ値なら必ず同じ markup になる（誤答の重複判定が
 * 文字列比較のままで済む）。
 */
export const fraction = (num: number, den: number): string => {
  const g = gcd(num, den) || 1;
  const n = num / g;
  const d = den / g;
  return d === 1 ? String(n) : frac(n, d);
};

/**
 * 正解の周りに散らす誤答。`step` 刻みでずらし、正解と同じ値は返さない。
 * 誤答が正解から離れすぎると一目で消去できてしまうので、既定は近傍に寄せる。
 */
export const nearMiss = (
  prng: PRNG,
  answer: number,
  opts: { step?: number; spread?: number; min?: number } = {},
): number => {
  const { step = 1, spread = 5, min } = opts;
  for (let i = 0; i < 20; i++) {
    const d = prng.uniformInt(-spread, spread);
    const v = answer + d * step;
    if (v !== answer && (min === undefined || v >= min)) return v;
  }
  return answer + step;
};

/** 同じ値を二度返さない誤答生成のラッパ。 */
export const distinct = (
  make: () => string,
  answer: string,
  tries = 20,
): string => {
  for (let i = 0; i < tries; i++) {
    const v = make();
    if (v !== answer) return v;
  }
  return `${answer}?`;
};

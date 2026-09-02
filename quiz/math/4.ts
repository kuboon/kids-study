/**
 * 4年生の算数。学習指導要領（平成29年告示）第4学年の配当に従う。
 *   A(2) 概数と四捨五入
 *   A(3) 整数の除法 — 除数が1〜2位数、被除数が2〜3位数、余り
 *   A(4) 小数の仕組みとその計算 — 小数の加減、乗数や除数が整数の乗除
 *   A(5) 同分母の分数の加法・減法
 *   A(6) 数量の関係を表す式 — 四則を混合した式や( )を用いた式
 *   B(4) 平面図形の面積 — 正方形、長方形
 *
 * 小数は二進小数の誤差を避けるため整数で計算して `decimal()` で表記に直す。
 * 分数は約分が5年の内容なので、約分の要らない値だけを出す。
 */

import { PRNG } from "../prng.ts";
import type { Quiz, QuizGenerator } from "../types.ts";
import { decimal, distinct, gcd, nearMiss } from "./common.ts";
import { frac, mathRow, mfrac, mo } from "./mathml.ts";

/** わり算。`withRemainder` なら「3あまり2」の形で答えさせる。 */
const divQuiz = (withRemainder: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const divisor = prng.uniformInt(2, 12);
  const quotient = prng.uniformInt(2, 99);
  const remainder = withRemainder ? prng.uniformInt(1, divisor - 1) : 0;
  const dividend = divisor * quotient + remainder;
  const a = withRemainder ? `${quotient} あまり ${remainder}` : `${quotient}`;
  return {
    q: `${dividend} ÷ ${divisor}`,
    a,
    wrong: () =>
      distinct(() => {
        const qq = nearMiss(prng, quotient, { spread: 3, min: 0 });
        if (!withRemainder) return `${qq}`;
        const rr = prng.uniformInt(0, divisor - 1);
        return `${qq} あまり ${rr}`;
      }, a),
  };
};

/** 四捨五入して上から `keep` 桁の概数にする。 */
const roundQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const digits = prng.uniformInt(4, 5);
  const keep = prng.uniformInt(1, 2);
  const n = prng.uniformInt(10 ** (digits - 1), 10 ** digits - 1);
  const unit = 10 ** (digits - keep);
  const a = String(Math.round(n / unit) * unit);
  return {
    q: `${n} を 上から ${keep}けたの がい数に`,
    a,
    wrong: () =>
      distinct(
        () =>
          String(
            nearMiss(prng, Number(a), { step: unit, spread: 3, min: unit }),
          ),
        a,
      ),
  };
};

/** 小数の加減。位を揃えるのが要点なので、桁数の違う数どうしを出す。 */
const decimalAddSubQuiz = (sub: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const places = 1;
  const x = prng.uniformInt(11, 199); // 1.1〜19.9
  const y = sub ? prng.uniformInt(1, x - 1) : prng.uniformInt(1, 199);
  const scaled = sub ? x - y : x + y;
  const a = decimal(scaled, places);
  return {
    q: `${decimal(x, places)} ${sub ? "-" : "+"} ${decimal(y, places)}`,
    a,
    wrong: () =>
      distinct(
        () => decimal(nearMiss(prng, scaled, { spread: 9, min: 0 }), places),
        a,
      ),
  };
};

/** 小数×整数 / 小数÷整数（割り切れるものだけ）。 */
const decimalIntQuiz = (div: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const places = 1;
  const n = prng.uniformInt(2, 9);
  const scaled = prng.uniformInt(11, 99); // 1.1〜9.9
  const [shown, result] = div
    ? [scaled * n, scaled] // 割り切れるように積から作る
    : [scaled, scaled * n];
  const a = decimal(result, places);
  return {
    q: `${decimal(shown, places)} ${div ? "÷" : "×"} ${n}`,
    a,
    wrong: () =>
      distinct(
        () => decimal(nearMiss(prng, result, { spread: 9, min: 1 }), places),
        a,
      ),
  };
};

/** 同分母の分数の加減。約分（5年）が要らない値だけを出す。 */
const sameDenomFractionQuiz = (sub: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  for (let i = 0; i < 50; i++) {
    const den = prng.uniformInt(3, 9);
    const x = prng.uniformInt(1, den - 1);
    const y = prng.uniformInt(1, den - 1);
    const num = sub ? x - y : x + y;
    if (num <= 0) continue;
    if (gcd(num, den) !== 1) continue; // 約分が必要になる組は避ける
    const a = frac(num, den);
    return {
      q: mathRow(mfrac(x, den), mo(sub ? "-" : "+"), mfrac(y, den)),
      a,
      wrong: () =>
        distinct(() => {
          const w = nearMiss(prng, num, { spread: 3, min: 1 });
          return frac(w, den);
        }, a),
    };
  }
  // 上のループは den=5,x=1,y=2 などで必ず成立するが、型のために既定を返す
  return {
    q: mathRow(mfrac(1, 5), mo("+"), mfrac(2, 5)),
    a: frac(3, 5),
    wrong: () => frac(4, 5),
  };
};

/**
 * 四則を混合した式・( ) を用いた式。計算の順序が要点。
 * 負の数は中学校の内容なので、引く側が必ず小さくなるように値を選ぶ。
 */
const mixedOpQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const y = prng.uniformInt(2, 9);
  const z = prng.uniformInt(2, 9);
  const paren = prng.uniformInt(0, 1) === 1;
  const plus = prng.uniformInt(0, 1) === 1;
  // ( ) 付きなら x > y、( ) なしの引き算なら x >= y×z にして負にしない。
  const x = plus
    ? prng.uniformInt(2, 9)
    : paren
    ? prng.uniformInt(y + 1, y + 9)
    : y * z + prng.uniformInt(0, 20);
  const q = paren
    ? `(${x} ${plus ? "+" : "-"} ${y}) × ${z}`
    : `${x} ${plus ? "+" : "-"} ${y} × ${z}`;
  const inner = plus ? x + y : x - y;
  const result = paren ? inner * z : (plus ? x + y * z : x - y * z);
  const a = String(result);
  return {
    q,
    a,
    wrong: () =>
      distinct(() => {
        // ありがちな誤り（順序の取り違え）も混ぜる
        const alt = paren ? (plus ? x + y * z : x - y * z) : inner * z;
        return prng.uniformInt(0, 2) === 0 && alt >= 0
          ? String(alt)
          : String(nearMiss(prng, result, { spread: 6, min: 0 }));
      }, a),
  };
};

/** 長方形・正方形の面積。 */
const areaQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const square = prng.uniformInt(0, 1) === 1;
  const w = prng.uniformInt(2, 20);
  const h = square ? w : prng.uniformInt(2, 20);
  const a = `${w * h}`;
  return {
    q: square
      ? `1ぺんが ${w}cm の 正方形の 面積は なんcm²？`
      : `たて ${h}cm よこ ${w}cm の 長方形の 面積は なんcm²？`,
    a,
    wrong: () =>
      distinct(() => {
        // 周りの長さと取り違える誤答を混ぜる
        return prng.uniformInt(0, 2) === 0
          ? String((w + h) * 2)
          : String(nearMiss(prng, w * h, { spread: 8, min: 1 }));
      }, a),
  };
};

export default [
  { title: "わり算", grade: 4, fn: divQuiz(false) },
  { title: "わり算（あまりあり）", grade: 4, fn: divQuiz(true) },
  { title: "がい数（四捨五入）", grade: 4, fn: roundQuiz },
  { title: "小数の たし算", grade: 4, fn: decimalAddSubQuiz(false) },
  { title: "小数の ひき算", grade: 4, fn: decimalAddSubQuiz(true) },
  { title: "小数の かけ算", grade: 4, fn: decimalIntQuiz(false) },
  { title: "小数の わり算", grade: 4, fn: decimalIntQuiz(true) },
  { title: "分数の たし算", grade: 4, fn: sameDenomFractionQuiz(false) },
  { title: "分数の ひき算", grade: 4, fn: sameDenomFractionQuiz(true) },
  { title: "計算の じゅんじょ", grade: 4, fn: mixedOpQuiz },
  { title: "長方形・正方形の 面積", grade: 4, fn: areaQuiz },
] satisfies QuizGenerator[];

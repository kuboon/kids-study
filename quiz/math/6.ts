/**
 * 6年生の算数。学習指導要領（平成29年告示）第6学年の配当に従う。
 *   A(1) 分数の乗法・除法
 *   A(2) 文字を用いた式
 *   B(3) 円の面積
 *   B(4) 角柱及び円柱の体積
 *   C(1) 比例
 *   C(2) 比
 *   D(1) データの考察 — 代表値（平均値・中央値・最頻値）
 *
 * 円周率は3.14を用いる（学習指導要領の内容の取扱い）。小数の答えは
 * 二進小数の誤差を避けるため整数で計算して `decimal()` で表記に直す。
 */

import { PRNG } from "../prng.ts";
import type { Quiz, QuizGenerator } from "../types.ts";
import { decimal, distinct, fraction, gcd, nearMiss } from "./common.ts";
import { mathRow, mfrac, mo } from "./mathml.ts";

/** 分数×分数 / 分数÷分数。答えは約分して返す。 */
const fractionMulDivQuiz = (div: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const n1 = prng.uniformInt(1, 8);
  const d1 = prng.uniformInt(n1 + 1, 9);
  const n2 = prng.uniformInt(1, 8);
  const d2 = prng.uniformInt(n2 + 1, 9);
  // ÷ は逆数をかける
  const num = div ? n1 * d2 : n1 * n2;
  const den = div ? d1 * n2 : d1 * d2;
  const a = fraction(num, den);
  return {
    q: mathRow(mfrac(n1, d1), mo(div ? "÷" : "×"), mfrac(n2, d2)),
    a,
    wrong: () =>
      distinct(() => {
        // 逆数にし忘れる／分母どうし分子どうしを取り違える誤りを混ぜる
        if (prng.uniformInt(0, 2) === 0) {
          return div ? fraction(n1 * n2, d1 * d2) : fraction(n1 * d2, d1 * n2);
        }
        return fraction(nearMiss(prng, num, { spread: 4, min: 1 }), den);
      }, a),
  };
};

/** 文字を用いた式。x に値をあてはめて式の値を求める。 */
const letterQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const coef = prng.uniformInt(2, 9);
  const konst = prng.uniformInt(1, 20);
  const x = prng.uniformInt(1, 12);
  const plus = prng.uniformInt(0, 1) === 1;
  const value = plus ? coef * x + konst : coef * x - konst;
  if (!plus && value < 0) {
    // 負の数は中学校の内容なので足し算にして避ける
    const v = coef * x + konst;
    return {
      q: `x × ${coef} + ${konst} の x に ${x} を あてはめると？`,
      a: String(v),
      wrong: () =>
        distinct(
          () => String(nearMiss(prng, v, { spread: 8, min: 0 })),
          String(v),
        ),
    };
  }
  const a = String(value);
  return {
    q: `x × ${coef} ${
      plus ? "+" : "-"
    } ${konst} の x に ${x} を あてはめると？`,
    a,
    wrong: () =>
      distinct(() => {
        // 順序を取り違える誤り（(x±定数)×係数）を混ぜる
        const alt = plus ? (x + konst) * coef : (x - konst) * coef;
        if (prng.uniformInt(0, 2) === 0 && alt >= 0) return String(alt);
        return String(nearMiss(prng, value, { spread: 8, min: 0 }));
      }, a),
  };
};

/** 比を簡単にする。 */
const ratioQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const base1 = prng.uniformInt(1, 9);
  const base2 = prng.uniformInt(1, 9);
  const k = prng.uniformInt(2, 9);
  const x = base1 * k;
  const y = base2 * k;
  const g = gcd(x, y);
  const a = `${x / g}:${y / g}`;
  return {
    q: `${x}:${y} を かんたんに すると？`,
    a,
    wrong: () =>
      distinct(() => {
        // 片方だけ割る／割り切り方を間違える誤りを混ぜる
        const pick = prng.uniformInt(0, 2);
        if (pick === 0) return `${x / g}:${y}`;
        if (pick === 1) return `${x}:${y / g}`;
        const w = prng.uniformInt(2, 9);
        return `${Math.max(1, Math.round(x / w))}:${
          Math.max(1, Math.round(y / w))
        }`;
      }, a),
  };
};

/** 円の面積。円周率は3.14。半径×半径×3.14 を整数演算で出す。 */
const circleAreaQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const r = prng.uniformInt(1, 12);
  // 3.14 を 314/100 として整数で計算し、1/100 の位で表記する
  const scaled = r * r * 314;
  const a = decimal(scaled, 2);
  return {
    q: `半径 ${r}cm の 円の 面積は なんcm²？（円周率 3.14）`,
    a,
    wrong: () =>
      distinct(() => {
        // 直径で計算する／円周と取り違える誤りを混ぜる
        const pick = prng.uniformInt(0, 2);
        if (pick === 0) return decimal(2 * r * 314, 2); // 円周
        if (pick === 1) return decimal(4 * r * r * 314, 2); // 直径で二乗
        return decimal(
          nearMiss(prng, scaled, { step: 100, spread: 9, min: 1 }),
          2,
        );
      }, a),
  };
};

/** 角柱・円柱の体積 = 底面積 × 高さ。 */
const prismVolumeQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const baseArea = prng.uniformInt(2, 40);
  const height = prng.uniformInt(2, 15);
  const a = String(baseArea * height);
  return {
    q: `底面積 ${baseArea}cm² 高さ ${height}cm の 角柱の 体積は なんcm³？`,
    a,
    wrong: () =>
      distinct(() => {
        // ÷3（角すい）と取り違える誤りを混ぜる
        if (prng.uniformInt(0, 2) === 0) {
          return String(Math.round(baseArea * height / 3));
        }
        return String(
          nearMiss(prng, baseArea * height, { spread: 10, min: 1 }),
        );
      }, a),
  };
};

/** 比例。x が k 倍になれば y も k 倍。 */
const proportionQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const rate = prng.uniformInt(2, 12); // y = rate × x
  const x1 = prng.uniformInt(1, 8);
  const x2 = prng.uniformInt(1, 12);
  const y1 = rate * x1;
  const a = String(rate * x2);
  return {
    q: `y は x に 比例し、x が ${x1} の とき y は ${y1}。x が ${x2} の とき y は？`,
    a,
    wrong: () =>
      distinct(() => {
        // 差で考える誤りを混ぜる
        const alt = y1 + (x2 - x1);
        if (prng.uniformInt(0, 2) === 0 && alt >= 0) return String(alt);
        return String(nearMiss(prng, rate * x2, { spread: 8, min: 0 }));
      }, a),
  };
};

/** 代表値（中央値・最頻値）。 */
const representativeQuiz = (median: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  if (median) {
    // 中央値が定まるよう奇数個にする
    const count = prng.uniformInt(2, 4) * 2 + 1;
    const values = Array.from(
      { length: count },
      () => prng.uniformInt(1, 40),
    );
    const sorted = [...values].sort((p, q) => p - q);
    const a = String(sorted[(count - 1) / 2]);
    return {
      q: `${values.join(", ")} の 中央値は？`,
      a,
      wrong: () =>
        distinct(() => {
          const pick = prng.uniformInt(0, 2);
          if (pick === 0) return String(sorted[0]); // 最小値
          if (pick === 1) return String(sorted[count - 1]); // 最大値
          return String(nearMiss(prng, Number(a), { spread: 6, min: 1 }));
        }, a),
    };
  }
  // 最頻値。1つの値だけを多く含める
  const mode = prng.uniformInt(1, 20);
  const others: number[] = [];
  for (let i = 0; i < 4; i++) {
    let v = prng.uniformInt(1, 20);
    while (v === mode || others.includes(v)) v = v % 20 + 1;
    others.push(v);
  }
  const values = [mode, mode, mode, ...others];
  // 決定的に混ぜる（PRNG のみを使う）
  for (let i = values.length - 1; i > 0; i--) {
    const j = prng.uniformInt(0, i);
    [values[i], values[j]] = [values[j], values[i]];
  }
  const a = String(mode);
  return {
    q: `${values.join(", ")} の 最頻値は？`,
    a,
    wrong: () =>
      distinct(
        () => String(others[prng.uniformInt(0, others.length - 1)]),
        a,
      ),
  };
};

export default [
  { title: "分数の かけ算", grade: 6, fn: fractionMulDivQuiz(false) },
  { title: "分数の わり算", grade: 6, fn: fractionMulDivQuiz(true) },
  { title: "文字を つかった式", grade: 6, fn: letterQuiz },
  { title: "比", grade: 6, fn: ratioQuiz },
  { title: "円の 面積", grade: 6, fn: circleAreaQuiz },
  { title: "角柱の 体積", grade: 6, fn: prismVolumeQuiz },
  { title: "比例", grade: 6, fn: proportionQuiz },
  { title: "中央値", grade: 6, fn: representativeQuiz(true) },
  { title: "最頻値", grade: 6, fn: representativeQuiz(false) },
] satisfies QuizGenerator[];

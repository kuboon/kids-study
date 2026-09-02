/**
 * 5年生の算数。学習指導要領（平成29年告示）第5学年の配当に従う。
 *   A(1) 整数の性質 — 偶数・奇数、約数・倍数
 *   A(3) 小数の乗法・除法
 *   A(5) 異分母の分数の加法・減法（通分）
 *   B(3) 平面図形の面積 — 三角形、平行四辺形、台形
 *   B(4) 立体図形の体積 — 立方体・直方体
 *   C(2) 異種の二つの量の割合 — 速さ
 *   C(3) 割合・百分率
 *   D(2) 測定値の平均
 *
 * 5年から約分・通分を扱うので、分数の答えは約分した形で出す。
 */

import { PRNG } from "../prng.ts";
import type { Quiz, QuizGenerator } from "../types.ts";
import { decimal, distinct, fraction, gcd, lcm, nearMiss } from "./common.ts";
import { mathRow, mfrac, mo } from "./mathml.ts";

/** 偶数・奇数。答えは数値でなく語なので誤答も語で返す。 */
const evenOddQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const n = prng.uniformInt(2, 999);
  const a = n % 2 === 0 ? "ぐう数" : "き数";
  return {
    q: `${n} は ぐう数？ き数？`,
    a,
    wrong: () => (a === "ぐう数" ? "き数" : "ぐう数"),
  };
};

/** 最大公約数・最小公倍数。 */
const gcdLcmQuiz = (useLcm: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const x = prng.uniformInt(2, 36);
  const y = prng.uniformInt(2, 36);
  const value = useLcm ? lcm(x, y) : gcd(x, y);
  const a = String(value);
  return {
    q: useLcm
      ? `${x} と ${y} の 最小公倍数は？`
      : `${x} と ${y} の 最大公約数は？`,
    a,
    wrong: () =>
      distinct(() => {
        // 取り違えやすい値（もう一方の答え、片方の数そのもの）を混ぜる
        const alt = useLcm ? gcd(x, y) : lcm(x, y);
        const pick = prng.uniformInt(0, 3);
        if (pick === 0) return String(alt);
        if (pick === 1) return String(x);
        if (pick === 2) return String(y);
        return String(nearMiss(prng, value, { spread: 4, min: 1 }));
      }, a),
  };
};

/** 小数×小数 / 小数÷小数（割り切れるものだけ）。 */
const decimalQuiz = (div: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const x = prng.uniformInt(11, 99); // 1.1〜9.9
  const y = prng.uniformInt(11, 99);
  if (div) {
    // 積から作れば必ず割り切れる。x(1桁小数) × y(1桁小数) は2桁小数。
    const productScaled = x * y; // 1/100 の位
    const q = `${decimal(productScaled, 2)} ÷ ${decimal(y, 1)}`;
    const a = decimal(x, 1);
    return {
      q,
      a,
      wrong: () =>
        distinct(
          () => decimal(nearMiss(prng, x, { spread: 9, min: 1 }), 1),
          a,
        ),
    };
  }
  const scaled = x * y; // 1/100 の位
  const a = decimal(scaled, 2);
  return {
    q: `${decimal(x, 1)} × ${decimal(y, 1)}`,
    a,
    wrong: () =>
      distinct(
        () => decimal(nearMiss(prng, scaled, { spread: 40, min: 1 }), 2),
        a,
      ),
  };
};

/** 異分母の分数の加減。通分が要点。答えは約分して返す。 */
const diffDenomFractionQuiz = (sub: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  for (let i = 0; i < 60; i++) {
    const d1 = prng.uniformInt(2, 9);
    const d2 = prng.uniformInt(2, 9);
    if (d1 === d2) continue; // 同分母は4年の内容
    const n1 = prng.uniformInt(1, d1 - 1);
    const n2 = prng.uniformInt(1, d2 - 1);
    const den = lcm(d1, d2);
    const num = sub
      ? n1 * (den / d1) - n2 * (den / d2)
      : n1 * (den / d1) + n2 * (den / d2);
    if (num <= 0) continue;
    const a = fraction(num, den);
    return {
      q: mathRow(mfrac(n1, d1), mo(sub ? "-" : "+"), mfrac(n2, d2)),
      a,
      wrong: () =>
        distinct(() => {
          // 分母どうし・分子どうしを足す誤りを混ぜる
          if (prng.uniformInt(0, 2) === 0) {
            return sub
              ? fraction(Math.abs(n1 - n2), Math.abs(d1 - d2) || d1)
              : fraction(n1 + n2, d1 + d2);
          }
          return fraction(nearMiss(prng, num, { spread: 4, min: 1 }), den);
        }, a),
    };
  }
  return {
    q: mathRow(mfrac(1, 2), mo("+"), mfrac(1, 3)),
    a: fraction(5, 6),
    wrong: () => fraction(2, 5),
  };
};

/**
 * 割合（百分率）。もとにする量と割合から比べる量を求める。
 * 答えが割り切れるよう、もとにする量は20の倍数、百分率は5の倍数にする
 * （20k × 5m は必ず100で割り切れる）。四捨五入した答えは「正しくない答え」
 * になってしまう。
 */
const percentQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const percent = prng.uniformInt(1, 20) * 5; // 5〜100%
  const base = prng.uniformInt(1, 10) * 20; // 20〜200
  const value = base * percent / 100;
  const a = String(value);
  return {
    q: `${base} の ${percent}% は いくつ？`,
    a,
    wrong: () =>
      distinct(() => {
        // 100で割り忘れる誤りを混ぜる
        if (prng.uniformInt(0, 2) === 0) return String(base * percent);
        return String(nearMiss(prng, value, { spread: 6, min: 1 }));
      }, a),
  };
};

/** 平均。割り切れる組だけを出す。 */
const averageQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const count = prng.uniformInt(3, 5);
  const mean = prng.uniformInt(2, 60);
  // 平均が mean になるよう、合計が mean×count になる値を作る
  const values: number[] = [];
  let rest = mean * count;
  for (let i = 0; i < count - 1; i++) {
    const lo = Math.max(1, rest - (mean * 2) * (count - 1 - i));
    const hi = Math.min(mean * 2, rest - (count - 1 - i));
    const v = prng.uniformInt(Math.min(lo, hi), Math.max(lo, hi));
    values.push(v);
    rest -= v;
  }
  values.push(rest);
  const a = String(mean);
  return {
    q: `${values.join(", ")} の 平均は？`,
    a,
    wrong: () =>
      distinct(() => {
        const pick = prng.uniformInt(0, 2);
        if (pick === 0) return String(mean * count); // 合計と取り違える
        return String(nearMiss(prng, mean, { spread: 5, min: 1 }));
      }, a),
  };
};

/** 速さ（単位量当たりの大きさ）。 */
const speedQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const speed = prng.uniformInt(2, 90);
  const hours = prng.uniformInt(2, 9);
  const distance = speed * hours;
  const a = String(speed);
  return {
    q: `${distance}km を ${hours}時間で 進む 速さは 時速なんkm？`,
    a,
    wrong: () =>
      distinct(() => {
        const pick = prng.uniformInt(0, 2);
        if (pick === 0) return String(distance * hours); // かけ算と取り違える
        return String(nearMiss(prng, speed, { spread: 6, min: 1 }));
      }, a),
  };
};

/** 三角形・平行四辺形の面積。 */
const area5Quiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const triangle = prng.uniformInt(0, 1) === 1;
  const base = prng.uniformInt(2, 20);
  // 三角形は「÷2」で割り切れるよう高さを偶数にする
  const height = triangle ? prng.uniformInt(1, 10) * 2 : prng.uniformInt(2, 20);
  const value = triangle ? base * height / 2 : base * height;
  const a = String(value);
  return {
    q: triangle
      ? `底辺 ${base}cm 高さ ${height}cm の 三角形の 面積は なんcm²？`
      : `底辺 ${base}cm 高さ ${height}cm の 平行四辺形の 面積は なんcm²？`,
    a,
    wrong: () =>
      distinct(() => {
        // 三角形で ÷2 を忘れる／平行四辺形で余計に割る誤りを混ぜる
        if (prng.uniformInt(0, 2) === 0) {
          return String(triangle ? base * height : base * height / 2);
        }
        return String(nearMiss(prng, value, { spread: 8, min: 1 }));
      }, a),
  };
};

/** 立方体・直方体の体積。 */
const volumeQuiz = (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const cube = prng.uniformInt(0, 1) === 1;
  const x = prng.uniformInt(2, 10);
  const y = cube ? x : prng.uniformInt(2, 10);
  const z = cube ? x : prng.uniformInt(2, 10);
  const a = String(x * y * z);
  return {
    q: cube
      ? `1ぺんが ${x}cm の 立方体の 体積は なんcm³？`
      : `たて ${x}cm よこ ${y}cm 高さ ${z}cm の 直方体の 体積は なんcm³？`,
    a,
    wrong: () =>
      distinct(() => {
        // 面積と取り違える誤りを混ぜる
        if (prng.uniformInt(0, 2) === 0) return String(x * y);
        return String(nearMiss(prng, x * y * z, { spread: 12, min: 1 }));
      }, a),
  };
};

export default [
  { title: "ぐう数と き数", grade: 5, fn: evenOddQuiz },
  { title: "最大公約数", grade: 5, fn: gcdLcmQuiz(false) },
  { title: "最小公倍数", grade: 5, fn: gcdLcmQuiz(true) },
  { title: "小数の かけ算", grade: 5, fn: decimalQuiz(false) },
  { title: "小数の わり算", grade: 5, fn: decimalQuiz(true) },
  {
    title: "分数の たし算（通分）",
    grade: 5,
    fn: diffDenomFractionQuiz(false),
  },
  { title: "分数の ひき算（通分）", grade: 5, fn: diffDenomFractionQuiz(true) },
  { title: "割合（百分率）", grade: 5, fn: percentQuiz },
  { title: "平均", grade: 5, fn: averageQuiz },
  { title: "速さ", grade: 5, fn: speedQuiz },
  { title: "三角形・平行四辺形の 面積", grade: 5, fn: area5Quiz },
  { title: "立方体・直方体の 体積", grade: 5, fn: volumeQuiz },
] satisfies QuizGenerator[];

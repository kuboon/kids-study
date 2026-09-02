/**
 * 算数の全ジェネレータを多数の seed で回し、次を機械的に確かめる。
 *
 * - 答えが本当に正しい（問題文を**独立に**パースして評価し、答えと突き合わせる）
 * - 誤答が正解と一致しない（4択が壊れる）
 * - 二進小数の誤差が表に出ていない（0.30000000000000004 のような答え）
 * - 同じ seed なら同じ問題（ゲーム側が seed で再出題するため）
 *
 * 答えを別経路で検算するのが要点。生成側の式をそのままテストに書き写すと、
 * 同じ勘違いを二度書くだけでバグは見つからない。
 */

import { assert, assertEquals } from "@std/assert";
import { ADVANCED } from "../types.ts";
import math from "./mod.ts";

// ---- 式の評価（生成側とは独立した再帰下降パーサ） -------------------------

/**
 * "12 + 3", "(3 + 4) × 5", "1/5 + 2/5", "3/4 ÷ 7/9" などを数値にする。
 * 扱えなければ null。
 *
 * 出題では `/` は分数、`×`/`÷` は演算にしか使わない。そこで `a/b` は1つの
 * 項（分数）として先に読む。`/` を除算として左結合で読むと "3/4 ÷ 7/9" が
 * ((3/4)/7)/9 になってしまう。
 */
export const evalExpr = (src: string): number | null => {
  if (!/^[\d\s.+\-×÷/()]+$/.test(src)) return null;
  const s = src.replace(/\s/g, "");
  let i = 0;
  const peek = () => s[i];
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (peek() === "×" || peek() === "÷") {
      const op = s[i++];
      const r = factor();
      v = op === "×" ? v * r : v / r;
    }
    return v;
  };
  /** 数、分数 a/b、または ( ... )。 */
  const factor = (): number => {
    if (peek() === "(") {
      i++;
      const v = expr();
      i++; // ')'
      return v;
    }
    if (peek() === "-") {
      i++;
      return -factor();
    }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`数値が読めない: ${src} @${i}`);
    i += m[0].length;
    const n = Number(m[0]);
    if (peek() !== "/") return n;
    i++; // 分数の区切り
    const d = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!d) throw new Error(`分母が読めない: ${src} @${i}`);
    i += d[0].length;
    return n / Number(d[0]);
  };
  const v = expr();
  return i === s.length ? v : null;
};

Deno.test("evalExpr: 演算の優先順位と分数表記", () => {
  assertEquals(evalExpr("3 + 4 × 5"), 23);
  assertEquals(evalExpr("(3 + 4) × 5"), 35);
  assertEquals(evalExpr("72 ÷ 6"), 12);
  // 二進小数で誤差が出るので許容差で比べる
  assert(Math.abs(evalExpr("1/5 + 2/5")! - 0.6) < 1e-9);
  assert(Math.abs(evalExpr("1.5 + 2.3")! - 3.8) < 1e-9);
  // 分数は1つの項として読む（÷ と / を取り違えない）
  assert(Math.abs(evalExpr("3/4 ÷ 7/9")! - 27 / 28) < 1e-9);
  assert(Math.abs(evalExpr("3/4 × 2/5")! - 6 / 20) < 1e-9);
  assertEquals(evalExpr("なんcm²？"), null);
});

// ---- 全ジェネレータに共通の性質 --------------------------------------------

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);

Deno.test("答えが空でなく、壊れた数値を含まない", () => {
  for (const gen of math) {
    for (const seed of SEEDS) {
      const q = gen.fn(seed);
      assert(q.a.length > 0, `${gen.title}: 答えが空`);
      assert(
        !/NaN|Infinity|undefined|null/.test(q.a + q.q),
        `${gen.title}: 壊れた値 q=${q.q} a=${q.a}`,
      );
      // 二進小数の誤差がそのまま出ていないか（0.30000000000000004 など）
      assert(
        !/\d\.\d{5,}/.test(q.a + q.q),
        `${gen.title}: 小数の桁が異常 q=${q.q} a=${q.a}`,
      );
    }
  }
});

Deno.test("誤答が正解と一致しない", () => {
  for (const gen of math) {
    for (const seed of SEEDS) {
      const q = gen.fn(seed);
      for (let i = 0; i < 8; i++) {
        assertEquals(
          q.wrong() === q.a,
          false,
          `${gen.title}: 誤答が正解と同じ (${q.q} → ${q.a})`,
        );
      }
    }
  }
});

Deno.test("同じ seed なら同じ問題", () => {
  for (const gen of math) {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = gen.fn(seed);
      const b = gen.fn(seed);
      assertEquals(
        [a.q, a.a],
        [b.q, b.a],
        `${gen.title}: seed ${seed} で不一致`,
      );
    }
  }
});

// ---- 答えの検算 -------------------------------------------------------------

Deno.test("式で出す問題は、独立に評価した値と答えが一致する", () => {
  let checked = 0;
  for (const gen of math) {
    for (const seed of SEEDS) {
      const q = gen.fn(seed);
      const expected = evalExpr(q.q);
      if (expected === null) continue; // 文章題はここでは検算しない
      if (q.a.includes("あまり")) continue; // 専用のテストで検算する
      const actual = evalExpr(q.a);
      assert(actual !== null, `${gen.title}: 答えが式として読めない (${q.a})`);
      assert(
        Math.abs(actual - expected) < 1e-9,
        `${gen.title}: ${q.q} の答えは ${expected} のはずが ${q.a}`,
      );
      checked++;
    }
  }
  assert(checked > 1000, `検算できた問題が少なすぎる (${checked})`);
});

Deno.test("小学校の学年では答えも問題も負の数にならない", () => {
  // 負の数は中学校第1学年の内容。ADVANCED 以外に混ざってはいけない。
  for (const gen of math) {
    if (gen.grade === ADVANCED) continue;
    for (const seed of SEEDS) {
      const q = gen.fn(seed);
      assert(
        !q.a.startsWith("-") && !q.q.includes("-("),
        `${gen.title}: 負の数が出ている (${q.q} → ${q.a})`,
      );
      for (let i = 0; i < 8; i++) {
        assert(
          !q.wrong().startsWith("-"),
          `${gen.title}: 誤答が負の数 (${q.q})`,
        );
      }
    }
  }
});

Deno.test("あまりのあるわり算: 商×除数+あまり が被除数に戻る", () => {
  const gen = math.find((g) => g.title.includes("あまり"));
  assert(gen, "あまりのあるわり算が見つからない");
  let checked = 0;
  for (const seed of SEEDS) {
    const q = gen.fn(seed);
    const [, dividend, divisor] = /^(\d+) ÷ (\d+)$/.exec(q.q)!;
    const [, quot, rem] = /^(\d+) あまり (\d+)$/.exec(q.a)!;
    assertEquals(
      Number(quot) * Number(divisor) + Number(rem),
      Number(dividend),
      `${q.q} → ${q.a} が合わない`,
    );
    assert(Number(rem) < Number(divisor), `あまりが除数以上: ${q.a}`);
    checked++;
  }
  assertEquals(checked, SEEDS.length);
});

Deno.test("文章題の検算（式パーサでは確かめられない分）", () => {
  // 生成側とは別に、問題文から答えを計算し直す。
  const gcd2 = (a: number, b: number): number => b ? gcd2(b, a % b) : a;
  const checks: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^(\d+) は ぐう数？ き数？$/, (m) => +m[1] % 2 === 0 ? "ぐう数" : "き数"],
    [/^(\d+) と (\d+) の 最大公約数は？$/, (m) => String(gcd2(+m[1], +m[2]))],
    [
      /^(\d+) と (\d+) の 最小公倍数は？$/,
      (m) => String(+m[1] / gcd2(+m[1], +m[2]) * +m[2]),
    ],
    [/^(\d+) の (\d+)% は いくつ？$/, (m) => String(+m[1] * +m[2] / 100)],
    [
      /^([\d, ]+) の 平均は？$/,
      (m) => {
        const v = m[1].split(",").map(Number);
        return String(v.reduce((s, x) => s + x, 0) / v.length);
      },
    ],
    [
      /^(\d+)km を (\d+)時間で 進む 速さは 時速なんkm？$/,
      (m) => String(+m[1] / +m[2]),
    ],
    [
      /^1ぺんが (\d+)cm の 正方形の 面積は なんcm²？$/,
      (m) => String(Number(m[1]) ** 2),
    ],
    [
      /^たて (\d+)cm よこ (\d+)cm の 長方形の 面積は なんcm²？$/,
      (m) => String(+m[1] * +m[2]),
    ],
    [
      /^底辺 (\d+)cm 高さ (\d+)cm の 三角形の 面積は なんcm²？$/,
      (m) => String(+m[1] * +m[2] / 2),
    ],
    [
      /^底辺 (\d+)cm 高さ (\d+)cm の 平行四辺形の 面積は なんcm²？$/,
      (m) => String(+m[1] * +m[2]),
    ],
    [
      /^1ぺんが (\d+)cm の 立方体の 体積は なんcm³？$/,
      (m) => String(Number(m[1]) ** 3),
    ],
    [
      /^たて (\d+)cm よこ (\d+)cm 高さ (\d+)cm の 直方体の 体積は なんcm³？$/,
      (m) => String(+m[1] * +m[2] * +m[3]),
    ],
    [
      /^半径 (\d+)cm の 円の 面積は なんcm²？（円周率 3.14）$/,
      (m) => String(Number(m[1]) ** 2 * 314 / 100),
    ],
    [
      /^底面積 (\d+)cm² 高さ (\d+)cm の 角柱の 体積は なんcm³？$/,
      (m) => String(+m[1] * +m[2]),
    ],
    [
      /^x × (\d+) ([+\-]) (\d+) の x に (\d+) を あてはめると？$/,
      (m) =>
        String(m[2] === "+" ? +m[4] * +m[1] + +m[3] : +m[4] * +m[1] - +m[3]),
    ],
    [
      /^(\d+):(\d+) を かんたんに すると？$/,
      (m) => {
        const g = gcd2(+m[1], +m[2]);
        return `${+m[1] / g}:${+m[2] / g}`;
      },
    ],
    [
      /^y は x に 比例し、x が (\d+) の とき y は (\d+)。x が (\d+) の とき y は？$/,
      (m) => String(+m[2] / +m[1] * +m[3]),
    ],
    [
      /^([\d, ]+) の 中央値は？$/,
      (m) => {
        const v = m[1].split(",").map(Number).sort((a, b) => a - b);
        return String(v[(v.length - 1) / 2]);
      },
    ],
    [
      /^([\d, ]+) の 最頻値は？$/,
      (m) => {
        const v = m[1].split(",").map(Number);
        const count = new Map<number, number>();
        for (const x of v) count.set(x, (count.get(x) ?? 0) + 1);
        return String([...count.entries()].sort((a, b) => b[1] - a[1])[0][0]);
      },
    ],
  ];
  const hit = new Set<number>();
  let checked = 0;
  for (const gen of math) {
    for (const seed of SEEDS) {
      const q = gen.fn(seed);
      for (const [re, calc] of checks) {
        const m = re.exec(q.q);
        if (!m) continue;
        assertEquals(q.a, calc(m), `${gen.title}: ${q.q} の答えが違う`);
        hit.add(checks.findIndex(([r]) => r === re));
        checked++;
      }
    }
  }
  // 文章題の型をすべて通っていること（正規表現の書き間違いで素通りするのを防ぐ）
  assertEquals(hit.size, checks.length, "検算できていない文章題の型がある");
  assert(checked > 1000, `検算できた文章題が少なすぎる (${checked})`);
});

Deno.test("がい数: 四捨五入の結果になっている", () => {
  const gen = math.find((g) => g.title.includes("がい数"));
  assert(gen, "がい数が見つからない");
  for (const seed of SEEDS) {
    const q = gen.fn(seed);
    const [, n, keep] = /^(\d+) を 上から (\d)けたの がい数に$/.exec(q.q)!;
    const unit = 10 ** (n.length - Number(keep));
    assertEquals(
      q.a,
      String(Math.round(Number(n) / unit) * unit),
      `${q.q} → ${q.a}`,
    );
  }
});

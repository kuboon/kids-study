import { assert, assertEquals } from "@std/assert";
import quizzes from "../mod.ts";
import {
  frac,
  mathRow,
  mathTokens,
  mfrac,
  mn,
  mo,
  plainMath,
} from "./mathml.ts";

Deno.test("frac: 単独の分数", () => {
  assertEquals(frac(1, 2), "<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>");
  assertEquals(plainMath(frac(1, 2)), "1/2");
});

Deno.test("mathRow: 式は1つの <math> にまとまる", () => {
  const html = mathRow(mfrac(1, 2), mo("+"), mfrac(1, 3));
  // 分数ごとに <math> を分けると演算子の高さが揃わない
  assertEquals(html.match(/<math>/g)?.length, 1);
  assertEquals(plainMath(html), "1/2 + 1/3");
});

Deno.test("plainMath: 数値と演算子だけの式", () => {
  assertEquals(plainMath(mathRow(mn(12), mo("×"), mn(3))), "12 × 3");
});

Deno.test("plainMath: markup でない文字列はそのまま", () => {
  assertEquals(plainMath("3 あまり 2"), "3 あまり 2");
  assertEquals(plainMath("48.75"), "48.75");
});

Deno.test("plainMath: <math> 以外のタグは剥がす（従来の stripHtml 相当）", () => {
  assertEquals(plainMath("<b>てん</b>[き]"), "てん[き]");
});

Deno.test("mathTokens: 分数と地の文が混ざった式", () => {
  assertEquals(mathTokens(`${frac(3, 4)} の たいせき`), [
    { kind: "frac", num: "3", den: "4" },
    { kind: "text", text: " の たいせき" },
  ]);
});

Deno.test("mathTokens: 演算子は前後に空白を持つ text になる", () => {
  assertEquals(mathTokens(mathRow(mfrac(1, 2), mo("+"), mfrac(1, 3))), [
    { kind: "frac", num: "1", den: "2" },
    { kind: "text", text: " + " },
    { kind: "frac", num: "1", den: "3" },
  ]);
});

Deno.test("plainMath: markup を含まない出題は1文字も変えない", () => {
  // ゲームはすべての答えをこれに通す（従来の stripHtml の置き換え）。漢字など
  // 算数以外の出題を巻き込んで壊していないことを、全教科ぶん確かめる。
  let checked = 0;
  for (const gen of quizzes) {
    for (let s = 0; s < 40; s++) {
      const q = gen.fn(s * 977 + 3);
      for (const v of [q.q, q.a, q.wrong()]) {
        if (v.includes("<")) continue;
        assertEquals(plainMath(v), v, `${gen.title}: ${JSON.stringify(v)}`);
        checked++;
      }
    }
  }
  assert(checked > 3000, `検査できた出題が少なすぎる (${checked})`);
});

Deno.test("mathTokens: 連続する text はまとまる", () => {
  assertEquals(mathTokens(mathRow(mn(1), mo("+"), mn(2))), [
    { kind: "text", text: "1 + 2" },
  ]);
});

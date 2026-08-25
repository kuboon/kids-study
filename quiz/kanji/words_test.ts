/**
 * 語データ（quiz/kanji/words/*.ts）の検証。
 *
 * このテストが、手で書いたデータの品質を機械的に保証する部分。旧実装は辞書から
 * プロンプトを自動生成していたため「読みだけでは漢字が定まらない」出題が全体の
 * 1/3 を占めていた。データを人が書くようにした以上、その手書きを守る網が要る。
 *
 * 検証しないこと: 「小学校で習う読みか」。常用漢字表の音訓データが手に入らない
 * ため機械判定できない。ここは日常語を選ぶという編集判断に委ねる（一意性の要求が
 * 熟語や送り仮名を強制するので、結果として日常語になりやすい）。
 */

import { assert, assertEquals } from "@std/assert";
import { displayWrite, type KanjiWord } from "./types.ts";
import { GRADE_WORDS } from "./words/mod.ts";
import { GRADE_KANJI, KANJI_READINGS } from "../../tools/kanji_readings.ts";

const HIRAGANA = /^[ぁ-んー]+$/;

const flat: { w: KanjiWord; grade: number }[] = GRADE_WORDS.flatMap((ws, i) =>
  ws.map((w) => ({ w, grade: i + 1 }))
);

// ---- 読みの妥当性 -----------------------------------------------------------

const VOICED: Record<string, string> = {
  か: "が",
  き: "ぎ",
  く: "ぐ",
  け: "げ",
  こ: "ご",
  さ: "ざ",
  し: "じ",
  す: "ず",
  せ: "ぜ",
  そ: "ぞ",
  た: "だ",
  ち: "ぢ",
  つ: "づ",
  て: "で",
  と: "ど",
  は: "ば",
  ひ: "び",
  ふ: "ぶ",
  へ: "べ",
  ほ: "ぼ",
};
const PLOSIVE: Record<string, string> = {
  は: "ぱ",
  ひ: "ぴ",
  ふ: "ぷ",
  へ: "ぺ",
  ほ: "ぽ",
};

/**
 * 語中で起きる音変化を許容するための異形。連濁（手紙→てがみ）、半濁（一本→
 * いっぽん）、促音（学校→がっこう）を辞書の読みから作る。読みの取り違えを
 * 捕まえるのが目的なので、厳密な音韻規則ではなく緩めに広げる。
 */
export const readingVariants = (r: string): string[] => {
  const out = new Set<string>();
  const heads = [r];
  const v = VOICED[r[0]];
  if (v) heads.push(v + r.slice(1));
  const p = PLOSIVE[r[0]];
  if (p) heads.push(p + r.slice(1));
  for (const h of heads) {
    out.add(h);
    if (/[くつちう]$/.test(h)) out.add(h.slice(0, -1) + "っ");
  }
  return [...out];
};

/** 辞書上の読み（送り仮名を除いた部分）すべて。 */
const readingBases = (kanji: string): string[] => {
  const e = KANJI_READINGS[kanji];
  if (!e) return [];
  const kun = e.kun.map((k) => {
    const dot = k.indexOf(".");
    return dot >= 0 ? k.slice(0, dot) : k;
  });
  return [...kun, ...e.on];
};

// ---- テスト ----------------------------------------------------------------

Deno.test("語の形式: target は配当漢字1字、読みと文脈はひらがな", () => {
  const all = GRADE_KANJI.join("");
  for (const { w, grade } of flat) {
    const where = `${grade}年 ${displayWrite(w)}`;
    assertEquals([...w.target].length, 1, `${where}: target は1字`);
    assert(all.includes(w.target), `${where}: ${w.target} は配当表外`);
    assert(HIRAGANA.test(w.read), `${where}: read はひらがな`);
    for (const part of [w.pre, w.post]) {
      if (part !== undefined) {
        assert(part.length > 0, `${where}: 空文字の pre/post は省略する`);
        assert(HIRAGANA.test(part), `${where}: 文脈はひらがなのみ (${part})`);
      }
    }
  }
});

Deno.test("語は対象漢字の学年のファイルに置く", () => {
  for (const { w, grade } of flat) {
    const actual = GRADE_KANJI.findIndex((g) => g.includes(w.target)) + 1;
    assertEquals(
      actual,
      grade,
      `${
        displayWrite(w)
      }: ${w.target} は${actual}年の配当（${grade}年に置かれている）`,
    );
  }
});

Deno.test("読みが辞書に存在する（誤記・取り違えの検出）", () => {
  const bad: string[] = [];
  for (const { w, grade } of flat) {
    const ok = readingBases(w.target).some((b) =>
      readingVariants(b).includes(w.read)
    );
    if (!ok) bad.push(`${grade}年 ${w.target}: ${displayWrite(w)}`);
  }
  assertEquals(bad, [], `辞書にない読み:\n${bad.join("\n")}`);
});

Deno.test("書き取りの出題が一意に漢字を定める", () => {
  const byPrompt = new Map<string, Set<string>>();
  for (const { w } of flat) {
    const p = displayWrite(w);
    let set = byPrompt.get(p);
    if (!set) byPrompt.set(p, set = new Set());
    set.add(w.target);
  }
  const ambiguous = [...byPrompt.entries()]
    .filter(([, ks]) => ks.size > 1)
    .map(([p, ks]) => `${p} → ${[...ks].join("/")}`);
  assertEquals(ambiguous, [], `答えが定まらない出題:\n${ambiguous.join("\n")}`);
});

Deno.test("同じ出題文が重複しない", () => {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const { w } of flat) {
    const p = displayWrite(w);
    if (seen.has(p)) dup.push(p);
    seen.add(p);
  }
  assertEquals(dup, [], `重複した出題:\n${dup.join("\n")}`);
});

Deno.test("配当表の全漢字が出題される", () => {
  for (let g = 0; g < GRADE_KANJI.length; g++) {
    const covered = new Set(GRADE_WORDS[g].map((w) => w.target));
    const missing = [...GRADE_KANJI[g]].filter((ch) => !covered.has(ch));
    assertEquals(missing, [], `${g + 1}年で未出題: ${missing.join("")}`);
  }
});

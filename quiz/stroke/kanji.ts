/**
 * Kanji implementation of the stroke-quiz abstraction. Reuses the existing
 * grade word lists (`quiz/kanji/{1..6}.ts`) purely as a source of *which*
 * kanji each grade covers, and pairs each with its generated stroke-direction
 * data. One `StrokeQuizGenerator` per grade.
 */

import { PRNG } from "../prng.ts";
import type { StrokeQuizGenerator } from "./types.ts";
import { KANJI_STROKES } from "./kanji_strokes.ts";
import { KanjiList as L1 } from "../kanji/1.ts";
import { KanjiList as L2 } from "../kanji/2.ts";
import { KanjiList as L3 } from "../kanji/3.ts";
import { KanjiList as L4 } from "../kanji/4.ts";
import { KanjiList as L5 } from "../kanji/5.ts";
import { KanjiList as L6 } from "../kanji/6.ts";

// Unique kanji of a grade, in list order, keeping only those we have stroke
// data for (a missing char — e.g. a 404 during generation — is simply absent).
const gradeChars = (list: readonly { q: string }[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of list) {
    if (!seen.has(e.q) && e.q in KANJI_STROKES) {
      seen.add(e.q);
      out.push(e.q);
    }
  }
  return out;
};

const makeGen =
  (chars: readonly string[]): StrokeQuizGenerator["fn"] => (seed) => {
    const prng = new PRNG(seed);
    const ch = chars[prng.uniformInt(0, chars.length - 1)];
    return { label: ch, strokes: KANJI_STROKES[ch] };
  };

const GRADES: { title: string; list: readonly { q: string }[] }[] = [
  { title: "1年生の漢字（かきとり）", list: L1 },
  { title: "2年生の漢字（かきとり）", list: L2 },
  { title: "3年生の漢字（かきとり）", list: L3 },
  { title: "4年生の漢字（かきとり）", list: L4 },
  { title: "5年生の漢字（かきとり）", list: L5 },
  { title: "6年生の漢字（かきとり）", list: L6 },
];

export default GRADES.map(({ title, list }) => ({
  title,
  fn: makeGen(gradeChars(list)),
})) satisfies StrokeQuizGenerator[];

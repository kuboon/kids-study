/**
 * Kanji implementation of the stroke-quiz abstraction. Reuses the existing
 * grade word lists (`quiz/kanji/{1..6}.ts`): each entry gives a reading
 * (`a` + okurigana `qPost`) used as the *prompt*, and its kanji (`q`) is what
 * the player writes — paired with the generated stroke directions and the
 * KanjiVG render paths.
 */

import { PRNG } from "../prng.ts";
import type { KanjiEntry } from "../kanji/common.ts";
import type { StrokeQuizGenerator } from "./types.ts";
import { KANJI_STROKES } from "./kanji_strokes.ts";
import { KANJI_PATHS } from "./kanji_paths.ts";
import { KanjiList as L1 } from "../kanji/1.ts";
import { KanjiList as L2 } from "../kanji/2.ts";
import { KanjiList as L3 } from "../kanji/3.ts";
import { KanjiList as L4 } from "../kanji/4.ts";
import { KanjiList as L5 } from "../kanji/5.ts";
import { KanjiList as L6 } from "../kanji/6.ts";

// The reading word for the prompt, e.g. 大(a="おお", qPost="きい") → "おおきい".
const readingWord = (e: KanjiEntry): string =>
  `${e.qPre ?? ""}${e.a}${e.qPost}`;

// Entries of a grade we have stroke data for (a 404 during generation drops it).
const gradeEntries = (list: readonly KanjiEntry[]): KanjiEntry[] =>
  list.filter((e) => e.q in KANJI_STROKES);

const makeGen = (
  entries: readonly KanjiEntry[],
): StrokeQuizGenerator["fn"] =>
(seed) => {
  const prng = new PRNG(seed);
  const e = entries[prng.uniformInt(0, entries.length - 1)];
  return {
    label: e.q,
    prompt: readingWord(e),
    strokes: KANJI_STROKES[e.q],
    paths: KANJI_PATHS[e.q],
  };
};

const GRADES: { title: string; list: readonly KanjiEntry[] }[] = [
  { title: "1年生の漢字（かきとり）", list: L1 },
  { title: "2年生の漢字（かきとり）", list: L2 },
  { title: "3年生の漢字（かきとり）", list: L3 },
  { title: "4年生の漢字（かきとり）", list: L4 },
  { title: "5年生の漢字（かきとり）", list: L5 },
  { title: "6年生の漢字（かきとり）", list: L6 },
];

export default GRADES.map(({ title, list }) => ({
  title,
  fn: makeGen(gradeEntries(list)),
})) satisfies StrokeQuizGenerator[];

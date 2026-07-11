/**
 * Kanji-writing generators, one per grade, built from the independent
 * `words.ts` list (NOT the 4-choice `quiz/kanji/*` data). Each prompt is a
 * reading with the kanji's part bracketed; the player writes that kanji,
 * matched against its KanjiVG paths.
 */

import { PRNG } from "../prng.ts";
import type { StrokeQuizGenerator } from "./types.ts";
import { KANJI_PATHS } from "./kanji_paths.ts";
import { displayWord, GRADE_WORDS, type WriteWord } from "./words.ts";

// Keep only words whose kanji we have stroke paths for.
const playable = (words: readonly WriteWord[]): WriteWord[] =>
  words.filter((w) => w.kanji in KANJI_PATHS);

const makeGen =
  (words: readonly WriteWord[]): StrokeQuizGenerator["fn"] => (seed) => {
    const prng = new PRNG(seed);
    const w = words[prng.uniformInt(0, words.length - 1)];
    return {
      label: w.kanji,
      prompt: displayWord(w),
      paths: KANJI_PATHS[w.kanji],
    };
  };

export default GRADE_WORDS.map((words, i) => ({
  title: `${i + 1}年生の漢字（かきとり）`,
  fn: makeGen(playable(words)),
})) satisfies StrokeQuizGenerator[];

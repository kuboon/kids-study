/**
 * 書き取りの StrokeQuizGenerator（学年別）。読み4択と同じ語データ
 * （quiz/kanji/words/*.ts）から出題し、KanjiVG のストロークで採点する。
 *
 * 以前は書き取り専用の語リストを別に持っていたため、同じ漢字を二重に手入れ
 * する必要があり、片方だけ品質が落ちた。出題文が一意に漢字を定めることは
 * quiz/kanji/words_test.ts が保証する。
 */

import { PRNG } from "../prng.ts";
import { displayWrite, type KanjiWord } from "../kanji/types.ts";
import { GRADE_WORDS } from "../kanji/words/mod.ts";
import type { StrokeQuizGenerator } from "./types.ts";
import { KANJI_PATHS } from "./kanji_paths.ts";

// ストロークデータのある漢字だけ出題する。
const playable = (words: readonly KanjiWord[]): KanjiWord[] =>
  words.filter((w) => w.target in KANJI_PATHS);

const makeGen =
  (words: readonly KanjiWord[]): StrokeQuizGenerator["fn"] => (seed) => {
    const prng = new PRNG(seed);
    const w = words[prng.uniformInt(0, words.length - 1)];
    return {
      label: w.target,
      prompt: displayWrite(w),
      paths: KANJI_PATHS[w.target],
    };
  };

export default GRADE_WORDS.map((words, i) => ({
  title: `${i + 1}年生の漢字（かきとり）`,
  fn: makeGen(playable(words)),
})) satisfies StrokeQuizGenerator[];

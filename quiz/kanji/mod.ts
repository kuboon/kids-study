/**
 * 読み4択の QuizGenerator（学年別）。出題は quiz/kanji/words/*.ts の語データ
 * から作る（書き取りゲームと同じデータ）。
 */

import type { QuizGenerator } from "../types.ts";
import { makeKanjiQuiz } from "./common.ts";
import { GRADE_WORDS } from "./words/mod.ts";

export default GRADE_WORDS.map((words, i) => ({
  title: `${i + 1}年生の漢字`,
  fn: makeKanjiQuiz(words),
})) satisfies QuizGenerator[];

/**
 * 読み4択の QuizGenerator（学年別）。出題は quiz/kanji/words/*.ts の語データ
 * から作る（書き取りゲームと同じデータ）。
 */

import type { Grade, QuizGenerator } from "../types.ts";
import { makeKanjiQuiz } from "./common.ts";
import { GRADE_WORDS } from "./words/mod.ts";

// 学年は学年別漢字配当表そのもの。一覧を学年ごとに束ねるので、タイトルには
// 学年を入れない（1年生はまだ「漢字」を読めないのでかな書き）。
export default GRADE_WORDS.map((words, i) => ({
  title: i === 0 ? "かんじの よみ" : "漢字の読み",
  grade: (i + 1) as Grade,
  fn: makeKanjiQuiz(words),
})) satisfies QuizGenerator[];

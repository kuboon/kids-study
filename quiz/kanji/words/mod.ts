/**
 * 学年別の出題語を集約する。添字0が1年生。
 *
 * 各ファイルが漢字出題の「唯一の真実」で、読み4択（quiz/kanji/mod.ts）も
 * 書き取り（quiz/stroke/kanji.ts）もここから出題を作る。妥当性は
 * quiz/kanji/words_test.ts が保証する。
 */

import type { KanjiWord } from "../types.ts";
import grade1 from "./1.ts";
import grade2 from "./2.ts";
import grade3 from "./3.ts";
import grade4 from "./4.ts";
import grade5 from "./5.ts";
import grade6 from "./6.ts";

export const GRADE_WORDS: readonly (readonly KanjiWord[])[] = [
  grade1,
  grade2,
  grade3,
  grade4,
  grade5,
  grade6,
];

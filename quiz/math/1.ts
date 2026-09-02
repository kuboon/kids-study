/**
 * 1年生の算数。
 * 学習指導要領（平成29年告示）算数 第1学年 A(2)ア(ウ)
 * 「1位数と1位数との加法及びその逆の減法の計算が確実にできること」。
 *
 * 一覧は学年ごとに束ねて表示するのでタイトルに学年は入れない。1年生はまだ
 * 漢字を習っていないのでかな書きにする。
 */

import type { QuizGenerator } from "../types.ts";
import { addQuiz, subQuiz } from "./arith.ts";

export default [
  { title: "1けたの たしざん", grade: 1, fn: addQuiz(1, false) },
  { title: "1けたの ひきざん", grade: 1, fn: subQuiz(1, false) },
] satisfies QuizGenerator[];

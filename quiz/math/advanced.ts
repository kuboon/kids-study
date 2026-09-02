/**
 * 小学校の配当を超える発展的な内容。負の数は中学校数学 第1学年
 * 「正の数と負の数」（算数編解説の中学校内容構成図で確認）。
 */

import { ADVANCED, type QuizGenerator } from "../types.ts";
import { addQuiz, multQuiz, subQuiz } from "./arith.ts";

export default [
  { title: "たし算（マイナスあり）", grade: ADVANCED, fn: addQuiz(1, true) },
  { title: "ひき算（マイナスあり）", grade: ADVANCED, fn: subQuiz(2, true) },
  { title: "かけ算（マイナスあり）", grade: ADVANCED, fn: multQuiz(1, true) },
] satisfies QuizGenerator[];

/**
 * 2年生の算数。
 * 学習指導要領 第2学年 A(2)ア(ア)「2位数の加法及びその逆の減法…筆算」、
 * A(3)ア(エ)「乗法九九について知り、1位数と1位数との乗法」。
 */

import type { QuizGenerator } from "../types.ts";
import { addQuiz, multQuiz, subQuiz } from "./arith.ts";

export default [
  { title: "2けたの たし算", grade: 2, fn: addQuiz(2, false) },
  { title: "2けたの ひき算", grade: 2, fn: subQuiz(2, false) },
  { title: "かけ算 九九", grade: 2, fn: multQuiz(1, false) },
] satisfies QuizGenerator[];

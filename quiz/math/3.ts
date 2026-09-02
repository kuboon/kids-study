/**
 * 3年生の算数。
 * 学習指導要領 第3学年 A(2)ア(ア)「3位数や4位数の加法及び減法」、
 * A(3)ア(ア)「2位数や3位数に1位数や2位数をかける乗法」。
 */

import type { QuizGenerator } from "../types.ts";
import { addQuiz, multQuiz, subQuiz } from "./arith.ts";

export default [
  { title: "3けたの たし算", grade: 3, fn: addQuiz(3, false) },
  { title: "3けたの ひき算", grade: 3, fn: subQuiz(3, false) },
  { title: "2けたの かけ算", grade: 3, fn: multQuiz(2, false) },
] satisfies QuizGenerator[];

/**
 * 算数の QuizGenerator を学年順に集約する。学年を足すときはファイルを増やして
 * ここに並べる。
 */

import type { QuizGenerator } from "../types.ts";
import grade1 from "./1.ts";
import grade2 from "./2.ts";
import grade3 from "./3.ts";
import advanced from "./advanced.ts";

export default [
  ...grade1,
  ...grade2,
  ...grade3,
  ...advanced,
] satisfies QuizGenerator[];

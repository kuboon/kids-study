/**
 * 算数の QuizGenerator を学年順に集約する。学年を足すときはファイルを増やして
 * ここに並べる。
 */

import type { QuizGenerator } from "../types.ts";
import grade1 from "./1.ts";
import grade2 from "./2.ts";
import grade3 from "./3.ts";
import grade4 from "./4.ts";
import grade5 from "./5.ts";
import grade6 from "./6.ts";
import advanced from "./advanced.ts";

export default [
  ...grade1,
  ...grade2,
  ...grade3,
  ...grade4,
  ...grade5,
  ...grade6,
  ...advanced,
] satisfies QuizGenerator[];

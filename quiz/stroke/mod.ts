/**
 * Flat aggregate of all stroke-order quiz generators — the launcher's source
 * list for stroke-writing games. Add new subjects (kana, digits, …) by
 * concatenating their generators here.
 */

import kanji from "./kanji.ts";
import type { StrokeQuizGenerator } from "./types.ts";

export default [
  ...kanji,
] satisfies StrokeQuizGenerator[];

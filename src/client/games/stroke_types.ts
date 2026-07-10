/**
 * Mount contract for stroke-writing games. Parallel to `types.ts` (the
 * `GameMount` for 4-choice `Quiz` games) but consumes a `StrokeQuizGenerator`.
 * Keeping it separate means the existing five games and their `GameMount`
 * stay untouched. `GameResult` is shared.
 */

import type { StrokeQuizGenerator } from "../../../quiz/stroke/types.ts";
import type { GameResult } from "./types.ts";

export type StrokeGameMount = (
  container: HTMLElement,
  opts: {
    quiz: StrokeQuizGenerator;
    onComplete?: (result: GameResult) => void;
  },
) => () => void;

export type StrokeGameModule = {
  title: string;
  mount: StrokeGameMount;
};

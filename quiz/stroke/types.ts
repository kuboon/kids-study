/**
 * Stroke-order quiz abstraction — parallel to `quiz/types.ts` (the 4-choice
 * `Quiz`). A `StrokeQuiz` answers with an *ordered list of stroke directions*
 * (8-way codes, see `dir.ts`) instead of picking one of several options.
 * Kanji is one implementation (`kanji.ts`); katakana / digits can follow the
 * same shape later.
 */

export type StrokeQuiz = {
  /** Character shown large as the prompt (e.g. "大", later "ア" / "3"). */
  label: string;
  /** 8-direction codes in writing order. See `quantize8` / `DIR_ARROWS`. */
  strokes: readonly number[];
  /** Optional per-stroke hint (e.g. KanjiVG kvg:type). Not required to play. */
  hintTypes?: readonly string[];
};

export type StrokeQuizGenerator = {
  title: string;
  /** Deterministic: same seed → same StrokeQuiz. */
  fn: (seed: number) => StrokeQuiz;
};

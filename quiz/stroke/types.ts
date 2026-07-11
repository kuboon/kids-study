/**
 * Stroke-order quiz abstraction — parallel to `quiz/types.ts` (the 4-choice
 * `Quiz`). A `StrokeQuiz` answers with an *ordered list of stroke directions*
 * (8-way codes, see `dir.ts`) instead of picking one of several options.
 * Kanji is one implementation (`kanji.ts`); katakana / digits can follow the
 * same shape later.
 */

export type StrokeQuiz = {
  /** The character to write, shown large in the center (e.g. "大"). */
  label: string;
  /**
   * Optional question text identifying the character *without* being the
   * character itself — e.g. its reading "おおきい". Shown as the prompt so the
   * player recalls which kanji to write.
   */
  prompt?: string;
  /**
   * Strokes in writing order. Each stroke is one or more 8-direction codes
   * (see `quantize8` / `DIR_ARROWS`) — a bent stroke like ┓ is `[0, 2]` (→↓),
   * swiped as two flicks. Used to match the player's swipes.
   */
  strokes: readonly (readonly number[])[];
  /**
   * Optional per-stroke render paths (SVG "d", 109x109 viewBox), aligned with
   * `strokes`. Lets the game draw the character one stroke at a time.
   */
  paths?: readonly string[];
};

export type StrokeQuizGenerator = {
  title: string;
  /** Deterministic: same seed → same StrokeQuiz. */
  fn: (seed: number) => StrokeQuiz;
};

/**
 * Kanji-writing quiz. (Formerly a subject-agnostic "stroke direction" quiz;
 * now kanji-specific — a stroke is matched by the *shape* of its KanjiVG path,
 * not a reduced direction code, so curves, bends and hooks are handled without
 * simplification.)
 */

export type StrokeQuiz = {
  /** The kanji to write, drawn from `paths` (also the answer). */
  label: string;
  /** Reading shown as the prompt, e.g. "おおきい" — recall which kanji to write. */
  prompt?: string;
  /** KanjiVG stroke paths (SVG "d", 109x109 viewBox) in writing order. */
  paths: readonly string[];
};

export type StrokeQuizGenerator = {
  title: string;
  /** Deterministic: same seed → same StrokeQuiz. */
  fn: (seed: number) => StrokeQuiz;
};

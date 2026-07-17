/**
 * Prompt shape for the kanji-writing game — INDEPENDENT of the 4-choice
 * `quiz/kanji/*` data. Each word shows a kanji's reading in brackets so the
 * player recalls which kanji to write, e.g. `[およ]ぐ` (泳ぐ) or `お[か]いもの`
 * (お買い物). `displayWord(w)` renders `${pre}[${read}]${post}`; the kanji
 * written is `kanji`.
 *
 * The concrete word list (`words.ts`, one array per grade) is auto-generated
 * from a kanji dataset by `tools/gen_kanji_words.ts`; these definitions are the
 * stable part that both the generated data and the game import.
 */

export type WriteWord = {
  /** The single kanji the player writes. */
  kanji: string;
  /** Kana before the bracketed reading (optional). */
  pre?: string;
  /** The kanji's reading, shown bracketed. */
  read: string;
  /** Kana after the bracketed reading (optional). */
  post?: string;
};

export const displayWord = (w: WriteWord): string =>
  `${w.pre ?? ""}[${w.read}]${w.post ?? ""}`;

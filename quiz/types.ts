export type HtmlString = string;
export type Quiz = {
  q: HtmlString;
  a: HtmlString;
  wrong(): HtmlString;
};

/**
 * 出題の配当学年。1〜6 は小学校の学年で、学習指導要領（平成29年告示）の
 * 内容配当に合わせる。`ADVANCED` は小学校の範囲を超えるもの（負の数など）。
 *
 * ランチャはこれで一覧を学年ごとに束ねるので、新しいクイズを足すときは
 * 「何年生で習う内容か」を必ず決める。
 */
export type Grade = 1 | 2 | 3 | 4 | 5 | 6 | typeof ADVANCED;

/** 小学校の配当を超える発展的な内容（負の数は中学校第1学年）。 */
export const ADVANCED = 7;

export type QuizGenerator = {
  title: string;
  grade: Grade;
  fn: (seed: number) => Quiz;
};

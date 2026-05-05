export type HtmlString = string;
export type Quiz = {
  q: HtmlString;
  a: HtmlString;
  wrong(): HtmlString;
};
export type QuizGenerator = {
  title: string;
  fn: (seed: number) => Quiz;
};

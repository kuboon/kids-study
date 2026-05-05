import { PRNG } from "../prng.ts";
import type { HtmlString, Quiz, QuizGenerator } from "../types.ts";

// addQuiz(2) は 2桁の足し算のクイズを生成する
const addQuiz = (ln: number, minus: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const max = 10 ** ln - 1;
  const min = minus ? -max : 0;
  const x = prng.uniformInt(min, max);
  const y = prng.uniformInt(min, max);
  const yStr = minus && y < 0 ? `(${y})` : y.toString();
  const q = `${x} + ${yStr}`;
  const a = x + y;
  function wrong(): HtmlString {
    const w = prng.uniformInt(min, max * 2);
    if (w === a) {
      return wrong();
    }
    return w.toString();
  }
  return {
    q,
    a: a.toString(),
    wrong,
  };
};

const subQuiz = (ln: number, minus: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const max = 10 ** ln - 1;
  const min = minus ? -max : 0;
  const x = prng.uniformInt(min, max);
  const yMin = minus ? -max : x;
  const y = prng.uniformInt(yMin, x);
  const yStr = minus && y < 0 ? `(${y})` : y.toString();
  const q = `${x} - ${yStr}`;
  const a = x - y;
  function wrong(): HtmlString {
    const w = prng.uniformInt(min, max * 2);
    if (w === a) {
      return wrong();
    }
    return w.toString();
  }
  return {
    q,
    a: a.toString(),
    wrong,
  };
};

const multQuiz = (ln: number, minus: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const max = 10 ** ln - 1;
  const min = minus ? -max : 0;
  const x = prng.uniformInt(min, max);
  const y = prng.uniformInt(min, max);
  const yStr = minus && y < 0 ? `(${y})` : y.toString();
  const q = `${x} × ${yStr}`;
  const a = x * y;
  function wrong(): HtmlString {
    const dx = prng.uniformInt(-1, 1);
    const dy = prng.uniformInt(-1, 1);
    const w = (x + dx) * (y + dy);
    if (w === a) {
      return wrong();
    }
    return w.toString();
  }
  return {
    q,
    a: a.toString(),
    wrong,
  };
};

export default [
  {
    title: "1桁の足し算",
    fn: addQuiz(1, false),
  },
  {
    title: "2桁の足し算",
    fn: addQuiz(2, false),
  },
  {
    title: "3桁の足し算",
    fn: addQuiz(3, false),
  },
  {
    title: "1桁の足し算 (マイナスあり)",
    fn: addQuiz(1, true),
  },
  {
    title: "1桁の引き算",
    fn: subQuiz(1, false),
  },
  {
    title: "2桁の引き算",
    fn: subQuiz(2, false),
  },
  {
    title: "3桁の引き算",
    fn: subQuiz(3, false),
  },
  {
    title: "2桁の引き算 (マイナスあり)",
    fn: subQuiz(2, true),
  },
  {
    title: "1桁の掛け算",
    fn: multQuiz(1, false),
  },
  {
    title: "2桁の掛け算",
    fn: multQuiz(2, false),
  },
  {
    title: "1桁の掛け算 (マイナスあり)",
    fn: multQuiz(1, true),
  },
] satisfies QuizGenerator[];

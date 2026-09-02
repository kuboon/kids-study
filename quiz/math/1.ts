import { PRNG } from "../prng.ts";
import {
  ADVANCED,
  type HtmlString,
  type Quiz,
  type QuizGenerator,
} from "../types.ts";

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
  const min = minus ? -max : 1;
  const x = prng.uniformInt(min, max);
  const y = prng.uniformInt(min, minus ? max : x);
  const yStr = minus && y < 0 ? `(${y})` : y.toString();
  const q = `${x} - ${yStr}`;
  const a = x - y;
  function wrong(): HtmlString {
    const w = prng.uniformInt(min, max);
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

/**
 * 学年は小学校学習指導要領（平成29年告示）算数「A 数と計算」の配当そのもの。
 *   第1学年 (2)ア(ウ) 1位数と1位数との加法及びその逆の減法
 *   第2学年 (2)ア(ア) 2位数の加法及びその逆の減法（筆算を含む）
 *   第2学年 (3)ア(エ) 乗法九九、1位数と1位数との乗法
 *   第3学年 (2)ア(ア) 3位数や4位数の加法及び減法
 *   第3学年 (3)ア(ア) 2位数や3位数に1位数や2位数をかける乗法
 * 負の数は中学校数学 第1学年「正の数と負の数」なので ADVANCED に置く。
 *
 * 一覧は学年ごとに束ねて表示するため、タイトルに学年は入れない。1年生向けは
 * まだ漢字を習っていないのでかな書きにする。
 */
export default [
  {
    title: "1けたの たしざん",
    grade: 1,
    fn: addQuiz(1, false),
  },
  {
    title: "1けたの ひきざん",
    grade: 1,
    fn: subQuiz(1, false),
  },
  {
    title: "2けたの たし算",
    grade: 2,
    fn: addQuiz(2, false),
  },
  {
    title: "2けたの ひき算",
    grade: 2,
    fn: subQuiz(2, false),
  },
  {
    title: "かけ算 九九",
    grade: 2,
    fn: multQuiz(1, false),
  },
  {
    title: "3けたの たし算",
    grade: 3,
    fn: addQuiz(3, false),
  },
  {
    title: "3けたの ひき算",
    grade: 3,
    fn: subQuiz(3, false),
  },
  {
    title: "2けたの かけ算",
    grade: 3,
    fn: multQuiz(2, false),
  },
  {
    title: "たし算（マイナスあり）",
    grade: ADVANCED,
    fn: addQuiz(1, true),
  },
  {
    title: "ひき算（マイナスあり）",
    grade: ADVANCED,
    fn: subQuiz(2, true),
  },
  {
    title: "かけ算（マイナスあり）",
    grade: ADVANCED,
    fn: multQuiz(1, true),
  },
] satisfies QuizGenerator[];

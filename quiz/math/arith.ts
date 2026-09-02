/**
 * 整数の四則（たし算・ひき算・かけ算）の問題ジェネレータ。桁数と負の数の
 * 有無をパラメータに取り、1〜3年生と発展（負の数）で使い回す。
 */

import { PRNG } from "../prng.ts";
import type { HtmlString, Quiz } from "../types.ts";
import { maxOf } from "./common.ts";

export const addQuiz = (ln: number, minus: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const max = maxOf(ln);
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

export const subQuiz = (ln: number, minus: boolean) => (seed: number): Quiz => {
  const prng = new PRNG(seed);
  const max = maxOf(ln);
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

export const multQuiz =
  (ln: number, minus: boolean) => (seed: number): Quiz => {
    const prng = new PRNG(seed);
    const max = maxOf(ln);
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

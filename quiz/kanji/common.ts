import { PRNG } from "../prng.ts";
import type { HtmlString, Quiz } from "../types.ts";

export type KanjiEntry = {
  qPre?: string;
  q: string;
  qPost: string;
  a: string;
  wrongs: string[];
};

export function makeKanjiQuiz(list: readonly KanjiEntry[]) {
  return (seed: number): Quiz => {
    const prng = new PRNG(seed);
    const idx = prng.uniformInt(0, list.length - 1);
    const { qPre = "", q, qPost, a, wrongs } = list[idx];
    function wrong(): HtmlString {
      const w = prng.uniformInt(0, wrongs.length - 1);
      if (wrongs[w] === a) {
        return wrong();
      }
      return `${wrongs[w]}${qPost}`;
    }
    return {
      q: `${qPre}[${q}]${qPost}`,
      a: `${a}${qPost}`,
      wrong,
    };
  };
}

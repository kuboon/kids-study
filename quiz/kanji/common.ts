import { PRNG } from "../prng.ts";
import type { HtmlString, Quiz } from "../types.ts";
import { answerRead, displayRead, type KanjiWord } from "./types.ts";

/**
 * 読み4択を語データから作る。誤答は同じ学年の他の語の答えから引く。以前は
 * 誤答も手書きだったが、正解と紛れない選択肢を1つずつ書き続けるのは保守が
 * 重く、間違いも混ざりやすい。読みの集合から引けば「実在する読みだが、この
 * 語の読みではない」誤答が自動で揃う。
 */
export function makeKanjiQuiz(words: readonly KanjiWord[]) {
  const answers = [...new Set(words.map(answerRead))];

  return (seed: number): Quiz => {
    const prng = new PRNG(seed);
    const w = words[prng.uniformInt(0, words.length - 1)];
    const a = answerRead(w);
    // 字数の近いものを誤答に選ぶ。長さがまちまちだと「1文字だけ極端に短い」
    // 選択肢が正解でないと一目で分かってしまい、4択の意味が薄れる。
    const near = answers.filter((c) =>
      c !== a && Math.abs(c.length - a.length) <= 1
    );
    const pool = near.length >= 3 ? near : answers.filter((c) => c !== a);

    const wrong = (): HtmlString =>
      pool.length ? pool[prng.uniformInt(0, pool.length - 1)] : `${a}？`;

    return { q: displayRead(w), a, wrong };
  };
}

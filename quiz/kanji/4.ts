import { PRNG } from "../prng.ts";
import type { HtmlString, Quiz, QuizGenerator } from "../types.ts";

const KanjiList = [
  { kanji: "覚める", yomi: "さめる", wrong: ["きめる", "つめる", "とめる"] },
  {
    kanji: "試みる",
    yomi: "こころみる",
    wrong: ["ためみる", "とめみる", "とどめる"],
  },
  { kanji: "頼る", yomi: "たよる", wrong: ["よりる", "とよる", "とよれる"] },
  { kanji: "頼む", yomi: "たのむ", wrong: ["よりむ", "とよむ", "とよめる"] },
  {
    kanji: "頼もしい",
    yomi: "たのもしい",
    wrong: ["よりもしい", "とよもしい", "とよもれる"],
  },
];
function kanjiQuiz(seed: number): Quiz {
  const prng = new PRNG(seed);
  const idx = prng.uniformInt(0, KanjiList.length);
  const { kanji, yomi, wrong: wrongList } = KanjiList[idx];
  function wrong(): HtmlString {
    const w = prng.uniformInt(0, wrongList.length);
    return wrongList[w];
  }
  return {
    q: kanji,
    a: yomi,
    wrong,
  };
}

export default [
  {
    title: "4年生の漢字",
    fn: kanjiQuiz,
  },
] satisfies QuizGenerator[];

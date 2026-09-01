import { PRNG } from "./prng.ts";
import { Quiz, QuizGenerator } from "./types.ts";

const katakana =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン"
    .split("");
const hiragana =
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"
    .split("");
function katanakaQuiz(seed: number): Quiz {
  const prng = new PRNG(seed);
  const idx = prng.uniformInt(0, katakana.length - 1);
  const toHiragana = prng.uniformInt(0, 1) === 0;
  const [from, to] = toHiragana ? [katakana, hiragana] : [hiragana, katakana];
  const q = from[idx];
  const a = to[idx];
  function wrong() {
    const w = prng.uniformInt(0, to.length - 1);
    if (w === idx) {
      return wrong();
    }
    return to[w];
  }
  return { q, a, wrong };
}

// 片仮名を読み書きするのは学習指導要領（国語）の第1学年の指導事項。
export default [
  {
    title: "カタカナ",
    grade: 1,
    fn: katanakaQuiz,
  },
] satisfies QuizGenerator[];

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

export default [
  {
    title: "カタカナ",
    fn: katanakaQuiz,
  },
] satisfies QuizGenerator[];

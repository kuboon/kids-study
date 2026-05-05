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
  const q = katakana[idx];
  const a = hiragana[idx];
  function wrong() {
    const w = prng.uniformInt(0, hiragana.length - 1);
    if (w === idx) {
      return wrong();
    }
    return hiragana[w];
  }
  return { q, a, wrong };
}

export default [
  {
    title: "カタカナ",
    fn: katanakaQuiz,
  },
] satisfies QuizGenerator[];

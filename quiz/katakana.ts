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

// 片仮名は学習指導要領（国語）〔知識及び技能〕(1)ウ の指導事項で、学年は
// 「第1学年及び第2学年」の括り。学年の指定はないが、解説が「平仮名は第1学年で
// その全部の読み書きができるようにする」としており、この問題は平仮名と片仮名の
// 対応づけなので、括りの最初の学年である1年に置く。
export default [
  {
    title: "カタカナ",
    grade: 1,
    fn: katanakaQuiz,
  },
] satisfies QuizGenerator[];

import type { Quiz, QuizGenerator } from "./types.ts";

/**
 * 出題セッション。`next()` で次の問題を取り出し、間違えたら `markWrong()`
 * を呼ぶ。間違えた問題は **次の次** の `next()` で同じ seed のまま再出題する。
 */
export type QuizSession = {
  next(): Quiz;
  markWrong(): void;
};

export const createSession = (
  gen: QuizGenerator,
  startSeed: number,
): QuizSession => {
  let seed = startSeed;
  // upcoming[i] = i 回後の next() で使う seed（undefined なら新規 seed）
  const upcoming: (number | undefined)[] = [];
  let lastSeed = 0;

  return {
    next() {
      const reuse = upcoming.shift();
      const useSeed = reuse ?? seed++;
      lastSeed = useSeed;
      return gen.fn(useSeed);
    },
    markWrong() {
      // 「次の次」= 配列インデックス 1 の位置に予約する
      while (upcoming.length < 2) upcoming.push(undefined);
      upcoming[1] = lastSeed;
    },
  };
};

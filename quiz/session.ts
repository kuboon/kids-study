import type { Quiz } from "./types.ts";

/**
 * 出題セッション。`next()` で次の問題を取り出し、間違えたら `markWrong()`
 * を呼ぶ。間違えた問題は **次の次** の `next()` で同じ seed のまま再出題する。
 *
 * `Quiz`（4択）と `StrokeQuiz`（書き取り）のどちらでも使えるよう、問題型 `Q`
 * でジェネリック化してある。ロジックは seed の払い出しと再キューだけで、`Q`
 * の中身には一切触れない。
 */
export type Session<Q> = {
  next(): Q;
  markWrong(): void;
};

export const createSession = <Q>(
  gen: { fn: (seed: number) => Q },
  startSeed: number,
): Session<Q> => {
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

/** 既存ゲーム向けの後方互換 alias（`createSession(quiz, seed)` は Q=Quiz 推論）。 */
export type QuizSession = Session<Quiz>;

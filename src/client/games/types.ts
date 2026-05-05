import type { QuizGenerator } from "../../../quiz/types.ts";

export type GameResult = { score: number; cleared: boolean };

// The game owns the visual stack: it appends its own <canvas> and any HUD
// elements into the given container. Returns a teardown that removes them.
export type GameMount = (
  container: HTMLElement,
  opts: {
    quiz: QuizGenerator;
    onComplete?: (result: GameResult) => void;
  },
) => () => void;

export type GameModule = {
  title: string;
  mount: GameMount;
};

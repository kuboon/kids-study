/**
 * Menu — landing page launcher. Pick a game type from a dropdown, pick a
 * quiz from the list, and the game mounts in place. Going back unmounts.
 */

import {
  clientEntry,
  type Handle,
  on,
  ref,
  type SerializableValue,
} from "@remix-run/ui";
import quizzes from "../../quiz/mod.ts";
import strokeQuizzes from "../../quiz/stroke/mod.ts";
import type { GameModule } from "./games/types.ts";

// Two domains of game: 4-choice `Quiz` games vs stroke-writing `StrokeQuiz`
// games. Each domain draws from its own quiz list, so a stroke game can never
// be handed an arithmetic/katakana quiz.
type QuizKind =
  | "simple"
  | "gate-runner"
  | "minecart"
  | "boss-battle"
  | "target-shooter"
  | "cannon-blast";
type StrokeKind = "kanji-writer";
type GameKind = QuizKind | StrokeKind;

const STROKE_KINDS: readonly GameKind[] = ["kanji-writer"];
const isStroke = (k: GameKind): k is StrokeKind => STROKE_KINDS.includes(k);

// The quiz list to show for a given game (both have `title`).
const listFor = (k: GameKind): readonly { title: string }[] =>
  isStroke(k) ? strokeQuizzes : quizzes;

const loadGame = async (kind: QuizKind): Promise<GameModule> => {
  const mod = kind === "simple"
    ? await import("./games/simple/mod.ts")
    : kind === "minecart"
    ? await import("./games/minecart/mod.ts")
    : kind === "boss-battle"
    ? await import("./games/boss-battle/mod.ts")
    : kind === "target-shooter"
    ? await import("./games/target-shooter/mod.ts")
    : kind === "cannon-blast"
    ? await import("./games/cannon-blast/mod.ts")
    : await import("./games/gate-runner/mod.ts");
  return mod.default;
};

export interface MenuProps {
  [key: string]: SerializableValue;
}

export const Menu = clientEntry(
  "./menu.js#Menu",
  function Menu(handle: Handle<MenuProps>) {
    let game: GameKind = "gate-runner";
    let activeQuiz: number | null = null;

    const back = () => {
      activeQuiz = null;
      handle.update();
    };

    const start = (i: number) => {
      activeQuiz = i;
      handle.update();
    };

    return () => {
      if (activeQuiz !== null) {
        const idx = activeQuiz;
        return (
          <div class="absolute inset-0">
            <button
              type="button"
              class="absolute top-3 left-3 z-20 btn btn-circle btn-sm"
              aria-label="メニューに戻る"
              mix={[on("click", back)]}
            >
              ←
            </button>
            <div
              class="block w-full h-full bg-base-300"
              mix={[
                ref((el, signal) => {
                  const host = el as HTMLElement;
                  if (isStroke(game)) {
                    import("./games/kanji-writer/mod.ts").then((m) => {
                      if (signal.aborted) return;
                      const teardown = m.default.mount(host, {
                        quiz: strokeQuizzes[idx],
                      });
                      signal.addEventListener("abort", () => teardown());
                    });
                  } else {
                    loadGame(game).then((g) => {
                      if (signal.aborted) return;
                      const teardown = g.mount(host, { quiz: quizzes[idx] });
                      signal.addEventListener("abort", () => teardown());
                    });
                  }
                }),
              ]}
            />
          </div>
        );
      }

      return (
        <div class="absolute inset-0 overflow-auto">
          <div class="mx-auto w-full max-w-2xl p-6 space-y-6">
            <fieldset class="fieldset">
              <legend class="fieldset-legend text-base">ゲーム</legend>
              <select
                class="select select-bordered w-full"
                mix={[
                  on("change", (e) => {
                    const t = e.currentTarget as HTMLSelectElement;
                    game = t.value as GameKind;
                    handle.update();
                  }),
                ]}
              >
                <option value="simple" selected={game === "simple"}>
                  シンプル選択式
                </option>
                <option
                  value="gate-runner"
                  selected={game === "gate-runner"}
                >
                  ゲートランナー
                </option>
                <option value="minecart" selected={game === "minecart"}>
                  トロッコでダイヤ
                </option>
                <option
                  value="boss-battle"
                  selected={game === "boss-battle"}
                >
                  ボスバトル
                </option>
                <option
                  value="target-shooter"
                  selected={game === "target-shooter"}
                >
                  まとあて
                </option>
                <option
                  value="cannon-blast"
                  selected={game === "cannon-blast"}
                >
                  たいほうドカン
                </option>
                <option
                  value="kanji-writer"
                  selected={game === "kanji-writer"}
                >
                  漢字かきとり
                </option>
              </select>
            </fieldset>

            <ul class="menu bg-base-200 rounded-box w-full text-base">
              {listFor(game).map((q, i) => (
                <li>
                  <button
                    type="button"
                    class="text-left"
                    mix={[on("click", () => start(i))]}
                  >
                    {q.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    };
  },
);

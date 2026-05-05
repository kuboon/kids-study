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
import type { GameModule } from "./games/types.ts";

type GameKind = "simple" | "gate-runner";

const loadGame = async (kind: GameKind): Promise<GameModule> => {
  const mod = kind === "simple"
    ? await import("./games/simple/mod.ts")
    : await import("./games/gate-runner/mod.ts");
  return mod.default;
};

export interface MenuProps {
  [key: string]: SerializableValue;
}

export const Menu = clientEntry(
  "/menu.js#Menu",
  function Menu(handle: Handle<MenuProps>) {
    let game: GameKind = "simple";
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
                  loadGame(game).then((g) => {
                    if (signal.aborted) return;
                    const teardown = g.mount(el as HTMLElement, {
                      quiz: quizzes[idx],
                    });
                    signal.addEventListener("abort", () => teardown());
                  });
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
              </select>
            </fieldset>

            <ul class="menu bg-base-200 rounded-box w-full text-base">
              {quizzes.map((q, i) => (
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

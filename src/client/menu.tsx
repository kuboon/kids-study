/**
 * Menu — landing page launcher. ゲームの種類をプルダウンで選び、学年ごとに
 * 並んだ問題の一覧から1つ選ぶとその場でゲームが始まる。戻ると unmount する。
 *
 * 一覧は4択の問題（quiz/mod.ts）と書き取りの問題（quiz/stroke/mod.ts）を
 * 学年で束ねて1つに混ぜる。書き取りは入力方法が根本的に違う（なぞって書く）
 * ため他のゲームでは遊べない。そこでプルダウンには載せず、書き取りの問題が
 * 選ばれたときに自動で「漢字かきとり」を使う。
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
import { ADVANCED, type Grade } from "../../quiz/types.ts";
import type { GameModule } from "./games/types.ts";

// プルダウンに出るゲーム（4択の問題で遊ぶもの）。
type QuizKind =
  | "simple"
  | "gate-runner"
  | "minecart"
  | "boss-battle"
  | "target-shooter"
  | "cannon-blast";

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

const GAME_OPTIONS: readonly { value: QuizKind; label: string }[] = [
  { value: "simple", label: "シンプル選択式" },
  { value: "gate-runner", label: "ゲートランナー" },
  { value: "minecart", label: "トロッコでダイヤ" },
  { value: "boss-battle", label: "ボスバトル" },
  { value: "target-shooter", label: "まとあて" },
  { value: "cannon-blast", label: "たいほうドカン" },
];

/** 一覧の1項目。どちらの問題集の何番目かを持つ。 */
type Entry = { kind: "quiz" | "stroke"; index: number; title: string };

const GRADES: readonly Grade[] = [1, 2, 3, 4, 5, 6, ADVANCED];

// 1年生はまだ「年生」を読めないのでかな書きにする。
const gradeLabel = (g: Grade): string =>
  g === 1 ? "1ねんせい" : g === ADVANCED ? "はってん（中学校〜）" : `${g}年生`;

/** 学年ごとに、4択の問題と書き取りの問題をまとめた一覧を作る。 */
const entriesByGrade = (): readonly { grade: Grade; entries: Entry[] }[] =>
  GRADES.map((grade) => ({
    grade,
    entries: [
      ...quizzes.flatMap((q, index) =>
        q.grade === grade
          ? [{ kind: "quiz" as const, index, title: q.title }]
          : []
      ),
      ...strokeQuizzes.flatMap((q, index) =>
        q.grade === grade
          ? [{ kind: "stroke" as const, index, title: q.title }]
          : []
      ),
    ],
  })).filter((g) => g.entries.length > 0);

export interface MenuProps {
  [key: string]: SerializableValue;
}

export const Menu = clientEntry(
  "./menu.js#Menu",
  function Menu(handle: Handle<MenuProps>) {
    let game: QuizKind = "gate-runner";
    let active: Entry | null = null;

    const back = () => {
      active = null;
      handle.update();
    };

    const start = (entry: Entry) => {
      active = entry;
      handle.update();
    };

    return () => {
      if (active !== null) {
        const started = active;
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
                  if (started.kind === "stroke") {
                    // 書き取りは専用ゲームでしか遊べないので自動で選ぶ。
                    import("./games/kanji-writer/mod.ts").then((m) => {
                      if (signal.aborted) return;
                      const teardown = m.default.mount(host, {
                        quiz: strokeQuizzes[started.index],
                      });
                      signal.addEventListener("abort", () => teardown());
                    });
                  } else {
                    loadGame(game).then((g) => {
                      if (signal.aborted) return;
                      const teardown = g.mount(host, {
                        quiz: quizzes[started.index],
                      });
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
                    game = t.value as QuizKind;
                    handle.update();
                  }),
                ]}
              >
                {GAME_OPTIONS.map((o) => (
                  <option value={o.value} selected={game === o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </fieldset>

            {entriesByGrade().map(({ grade, entries }) => (
              <section>
                <h2 class="text-lg font-bold px-1 pb-1">{gradeLabel(grade)}</h2>
                <ul class="menu bg-base-200 rounded-box w-full text-base">
                  {entries.map((entry) => (
                    <li>
                      <button
                        type="button"
                        class="text-left"
                        mix={[on("click", () => start(entry))]}
                      >
                        {entry.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      );
    };
  },
);

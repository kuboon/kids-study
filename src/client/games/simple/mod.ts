/**
 * Simple — plain DOM 4-choice quiz. No 3D / no Babylon. Picks a question
 * from the QuizGenerator, lays out 4 buttons (1 correct + 3 wrong), shows
 * green/red feedback, advances after a beat.
 */

import { createSession, type QuizSession } from "../../../../quiz/session.ts";
import type { GameModule, GameMount } from "../types.ts";

const STAGES = 5;
const FEEDBACK_MS = 700;

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");

const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const mount: GameMount = (container, { quiz, onComplete }) => {
  let stage = 0;
  let score = 0;
  let session: QuizSession = createSession(
    quiz,
    (Math.random() * 0x7fffffff) | 0,
  );
  let timer: ReturnType<typeof setTimeout> | null = null;

  container.style.position = container.style.position || "relative";
  const root = document.createElement("div");
  root.className =
    "absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 bg-base-100";
  container.appendChild(root);

  const renderEnd = (cleared: boolean) => {
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col items-center gap-6";
    wrap.innerHTML = `
      <h2 class="text-4xl font-bold">${cleared ? "クリア！" : "おしまい"}</h2>
      <p class="text-2xl">スコア ${score} / ${STAGES}</p>
    `;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-lg";
    again.textContent = "もう一度";
    again.addEventListener("click", () => {
      stage = 0;
      score = 0;
      session = createSession(quiz, (Math.random() * 0x7fffffff) | 0);
      renderRound();
    });
    wrap.appendChild(again);
    root.appendChild(wrap);
    onComplete?.({ score, cleared });
  };

  const renderRound = () => {
    if (stage >= STAGES) {
      renderEnd(true);
      return;
    }

    const q = session.next();
    const correct = stripHtml(q.a);
    const opts: string[] = [correct];
    let safety = 16;
    while (opts.length < 4 && safety-- > 0) {
      const w = stripHtml(q.wrong());
      if (!opts.includes(w)) opts.push(w);
    }
    while (opts.length < 4) opts.push(`?${opts.length}`);

    root.innerHTML = "";
    const card = document.createElement("div");
    card.className =
      "card bg-base-200 shadow-md w-full max-w-xl p-6 flex flex-col items-center gap-6";
    card.innerHTML = `
      <div class="text-sm opacity-70">${stage + 1} / ${STAGES}</div>
      <div class="text-5xl font-bold tabular-nums">${q.q} = ?</div>
    `;
    const grid = document.createElement("div");
    grid.className = "grid grid-cols-2 gap-3 w-full";
    card.appendChild(grid);
    root.appendChild(card);

    const choose = (btn: HTMLButtonElement, value: string) => {
      grid.querySelectorAll("button").forEach((b) => {
        (b as HTMLButtonElement).disabled = true;
      });
      const isCorrect = value === correct;
      btn.classList.remove("btn-outline");
      btn.classList.add(isCorrect ? "btn-success" : "btn-error");
      if (!isCorrect) {
        // Also highlight the correct one
        grid.querySelectorAll("button").forEach((b) => {
          if ((b as HTMLButtonElement).dataset.v === correct) {
            b.classList.remove("btn-outline");
            b.classList.add("btn-success");
          }
        });
        session.markWrong();
      } else {
        score++;
      }
      timer = setTimeout(() => {
        stage++;
        renderRound();
      }, FEEDBACK_MS);
    };

    for (const v of shuffle(opts)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-lg btn-outline tabular-nums text-2xl";
      btn.dataset.v = v;
      btn.textContent = v;
      btn.addEventListener("click", () => choose(btn, v));
      grid.appendChild(btn);
    }
  };

  renderRound();

  return () => {
    if (timer !== null) clearTimeout(timer);
    root.remove();
  };
};

const simple: GameModule = { title: "シンプル選択式", mount };
export default simple;

/**
 * Kanji Writer — write a kanji by swiping each stroke's direction in order,
 * fighting-game-command style, instead of tracing. Each stroke is simplified
 * to one of 8 directions (see quiz/stroke/dir.ts); swipe them in writing
 * order to complete the character. Three hint modes let a child dial the
 * difficulty from "show me" to "test me".
 *
 * Stroke data derived from KanjiVG (CC BY-SA 3.0); see /NOTICE.
 * Consumes the StrokeQuizGenerator abstraction (subject-agnostic — kana or
 * digits could be dropped in unchanged).
 */

import { createSession, type Session } from "../../../../quiz/session.ts";
import { DIR_ARROWS, quantize8 } from "../../../../quiz/stroke/dir.ts";
import type { StrokeQuiz } from "../../../../quiz/stroke/types.ts";
import type { StrokeGameModule, StrokeGameMount } from "../stroke_types.ts";

const ROUNDS_TO_CLEAR = 5;
const MAX_HEARTS = 3;
const MIN_SWIPE = 24; // px; shorter drags are treated as taps and ignored
const DEMO_STEP_MS = 480; // per-stroke cadence of the お手本 animation

type Mode = "demo" | "always" | "correct";
const MODES: { id: Mode; label: string }[] = [
  { id: "demo", label: "おてほん" },
  { id: "always", label: "ヒント" },
  { id: "correct", label: "ちょうせん" },
];

// ---- sound: tiny WebAudio blips, no audio files (target-shooter pattern) ---

const createSfx = () => {
  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext => {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const tone = (
    freq: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      at?: number;
      gain?: number;
      slideTo?: number;
    } = {},
  ) => {
    const c = ensure();
    const t0 = c.currentTime + (opts.at ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, opts.slideTo),
        t0 + dur,
      );
    }
    g.gain.setValueAtTime(opts.gain ?? 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  };
  return {
    // Pitch climbs with the stroke number so a run up a character is audible.
    stroke(i: number) {
      tone(440 * 2 ** (Math.min(i, 12) / 12), 0.1, { type: "triangle" });
    },
    done() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.16, { at: i * 0.08 }));
    },
    wrong() {
      tone(280, 0.3, { type: "sawtooth", slideTo: 70, gain: 0.06 });
    },
    fanfare() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { at: i * 0.12 }));
      tone(1046, 0.6, { at: 0.55, gain: 0.05 });
    },
    dispose() {
      ctx?.close();
      ctx = null;
    },
  };
};

// ---- styles ----------------------------------------------------------------

const CSS = `
@keyframes kw-arrow-in{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
.kw-arrow-in{animation:kw-arrow-in .25s ease-out}
@keyframes kw-pip-done{0%{transform:scale(1)}50%{transform:scale(1.4)}100%{transform:scale(1)}}
.kw-pip-done{animation:kw-pip-done .3s}
@keyframes kw-shake{10%,90%{transform:translateX(-5px)}30%,70%{transform:translateX(5px)}50%{transform:translateX(-3px)}}
.kw-shake{animation:kw-shake .3s}
@keyframes kw-good{0%{transform:scale(.6);opacity:0}40%{transform:scale(1.3);opacity:1}100%{transform:scale(1.6) translateY(-30px);opacity:0}}
.kw-good{animation:kw-good .6s ease-out forwards}
@keyframes kw-trail{to{opacity:0}}
.kw-trail{animation:kw-trail .4s ease-out forwards}
`;

const SKELETON = `
  <style>${CSS}</style>
  <div data-kw="root" class="absolute inset-0 flex flex-col bg-base-100 overflow-hidden select-none">
    <div class="flex items-center gap-2 px-3 pt-2 pl-12">
      <span data-kw="hearts" class="text-2xl whitespace-nowrap"></span>
      <div class="flex-1 text-center">
        <span data-kw="label" class="text-3xl font-bold"></span>
      </div>
      <div class="flex flex-col items-end leading-tight">
        <span data-kw="round" class="text-sm opacity-70 whitespace-nowrap"></span>
        <span data-kw="streak" class="text-lg font-black text-warning"></span>
      </div>
    </div>
    <div data-kw="modes" class="flex justify-center gap-1 px-3 pt-1"></div>
    <div data-kw="stage" class="relative flex-1 min-h-0 flex items-center justify-center bg-base-200 m-3 rounded-box overflow-hidden" style="touch-action:none">
      <span data-kw="arrow" class="relative text-[7rem] leading-none pointer-events-none"></span>
      <span data-kw="stroke-no" class="absolute top-2 right-3 text-xl font-bold opacity-60 pointer-events-none"></span>
      <div data-kw="fx" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
    </div>
    <div class="flex flex-col items-center gap-1 pb-3">
      <div data-kw="pips" class="flex flex-wrap justify-center gap-1 px-3"></div>
      <div data-kw="progress" class="text-sm opacity-70"></div>
      <div data-kw="tip" class="text-xs opacity-50">ゆびで ほうこうに スワイプ！</div>
    </div>
  </div>
`;

// ---- game ------------------------------------------------------------------

export const mount: StrokeGameMount = (container, { quiz, onComplete }) => {
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = "relative";

  const host = document.createElement("div");
  host.className = "absolute inset-0";
  container.appendChild(host);

  const el = <T extends HTMLElement = HTMLElement>(k: string): T =>
    host.querySelector(`[data-kw="${k}"]`) as T;

  const sfx = createSfx();

  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  };

  let session: Session<StrokeQuiz> = createSession(
    quiz,
    (Math.random() * 0x7fffffff) | 0,
  );
  let strokes: readonly number[] = [];
  let strokeIndex = 0;
  let hearts = MAX_HEARTS;
  let round = 0;
  let streak = 0;
  let mode: Mode = "always";
  let kanjiHadMistake = false;
  let inputLocked = false;
  let resolved = false;

  let stageEl!: HTMLDivElement;
  let dragStart: { x: number; y: number } | null = null;

  // ---- rendering helpers ----

  const renderHud = () => {
    el("hearts").textContent = "❤️".repeat(hearts) +
      "🖤".repeat(MAX_HEARTS - hearts);
    el("round").textContent = `${round} / ${ROUNDS_TO_CLEAR}`;
    const s = el("streak");
    s.textContent = streak >= 2 ? `🔥×${streak}` : "";
  };

  const renderModes = () => {
    const wrap = el("modes");
    wrap.innerHTML = "";
    for (const m of MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-xs " +
        (m.id === mode ? "btn-primary" : "btn-ghost");
      b.textContent = m.label;
      b.addEventListener("click", () => setMode(m.id));
      wrap.appendChild(b);
    }
  };

  const renderPips = () => {
    const wrap = el("pips");
    wrap.innerHTML = "";
    strokes.forEach((_, i) => {
      const p = document.createElement("span");
      const done = i < strokeIndex;
      const current = i === strokeIndex;
      p.className =
        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold " +
        (done
          ? "bg-success text-success-content kw-pip-done"
          : current
          ? "bg-primary text-primary-content"
          : "bg-base-300 opacity-60");
      p.textContent = done ? "✓" : `${i + 1}`;
      wrap.appendChild(p);
    });
    el("progress").textContent = `${strokes.length}画中 ${
      Math.min(strokeIndex + 1, strokes.length)
    }画目`;
  };

  const showArrow = (dir: number, danger = false) => {
    const a = el("arrow");
    a.textContent = DIR_ARROWS[dir];
    a.classList.toggle("text-error", danger);
    a.classList.toggle("text-primary", !danger);
    a.classList.remove("kw-arrow-in");
    void a.offsetWidth;
    a.classList.add("kw-arrow-in");
  };

  const clearArrow = () => {
    el("arrow").textContent = "";
    el("stroke-no").textContent = "";
  };

  // Hint shown for the current stroke, per mode. demo/correct hide it.
  const showCurrentHint = () => {
    if (mode === "always" && strokeIndex < strokes.length) {
      showArrow(strokes[strokeIndex]);
    } else {
      clearArrow();
    }
  };

  const playDemo = () => {
    inputLocked = true;
    clearArrow();
    strokes.forEach((dir, k) => {
      schedule(() => {
        showArrow(dir);
        el("stroke-no").textContent = `${k + 1}`;
        sfx.stroke(k);
      }, k * DEMO_STEP_MS);
    });
    schedule(() => {
      clearArrow();
      inputLocked = false;
      showCurrentHint();
    }, strokes.length * DEMO_STEP_MS + 300);
  };

  const presentHint = () => {
    if (mode === "demo") playDemo();
    else {
      inputLocked = false;
      showCurrentHint();
    }
  };

  const setMode = (m: Mode) => {
    mode = m;
    renderModes();
    if (!inputLocked) showCurrentHint();
  };

  // ---- swipe feedback ----

  const popGood = () => {
    const g = document.createElement("div");
    g.textContent = "よし!";
    g.className =
      "kw-good absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-black text-success";
    el("fx").appendChild(g);
    schedule(() => g.remove(), 600);
  };

  const shakeStage = () => {
    stageEl.classList.remove("kw-shake");
    void stageEl.offsetWidth;
    stageEl.classList.add("kw-shake");
  };

  // ---- flow ----

  const onStrokeOk = () => {
    sfx.stroke(strokeIndex);
    popGood();
    strokeIndex++;
    renderPips();
    if (strokeIndex >= strokes.length) onKanjiDone();
    else showCurrentHint();
  };

  const onStrokeWrong = () => {
    sfx.wrong();
    shakeStage();
    kanjiHadMistake = true;
    hearts--;
    renderHud();
    if (hearts <= 0) {
      resolved = true;
      schedule(() => renderEnd(false), 700);
      return;
    }
    // Show the correct direction (in always mode it is already shown).
    showArrow(strokes[strokeIndex], true);
    schedule(() => {
      if (!disposed && !resolved) showCurrentHint();
    }, 650);
  };

  const onKanjiDone = () => {
    resolved = true;
    sfx.done();
    if (kanjiHadMistake) session.markWrong();
    else streak++;
    round++;
    renderHud();
    schedule(() => {
      if (round >= ROUNDS_TO_CLEAR) renderEnd(true);
      else nextKanji();
    }, 800);
  };

  const nextKanji = () => {
    resolved = false;
    const q = session.next();
    strokes = q.strokes ?? [];
    strokeIndex = 0;
    kanjiHadMistake = false;
    el("label").textContent = q.label;
    renderPips();
    presentHint();
  };

  // ---- pointer ----

  const onPointerDown = (e: PointerEvent) => {
    if (inputLocked || resolved) return;
    dragStart = { x: e.clientX, y: e.clientY };
    stageEl.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    dragStart = null;
    if (inputLocked || resolved) return;
    if (Math.hypot(dx, dy) < MIN_SWIPE) return; // tap, not a swipe
    const dir = quantize8(dx, dy);
    if (strokeIndex < strokes.length && dir === strokes[strokeIndex]) {
      onStrokeOk();
    } else {
      onStrokeWrong();
    }
  };

  // ---- lifecycle ----

  const renderEnd = (cleared: boolean) => {
    if (cleared) sfx.fanfare();
    const score = round;
    host.innerHTML = `
      <style>${CSS}</style>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-base-100 p-6 text-center">
        <div class="text-7xl">${cleared ? "🎉" : "💤"}</div>
        <h2 class="text-4xl font-bold">${
      cleared ? "ぜんぶ かけた！" : "おしまい"
    }</h2>
        <p class="text-2xl">かけた漢字 ${score} / ${ROUNDS_TO_CLEAR}</p>
        <p class="text-xs opacity-60">漢字データ: <a class="link" href="https://kanjivg.tagaini.net" target="_blank" rel="noopener">KanjiVG</a> (CC BY-SA 3.0)</p>
      </div>
    `;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-lg";
    again.textContent = "もう一度";
    again.addEventListener("click", restart);
    host.lastElementChild!.appendChild(again);
    onComplete?.({ score, cleared });
  };

  const restart = () => {
    session = createSession(quiz, (Math.random() * 0x7fffffff) | 0);
    round = 0;
    hearts = MAX_HEARTS;
    streak = 0;
    startGame();
  };

  const startGame = () => {
    host.innerHTML = SKELETON;
    stageEl = el<HTMLDivElement>("stage");
    stageEl.addEventListener("pointerdown", onPointerDown);
    stageEl.addEventListener("pointerup", onPointerUp);
    stageEl.addEventListener("pointercancel", () => {
      dragStart = null;
    });
    renderModes();
    renderHud();
    nextKanji();
  };

  startGame();

  return () => {
    disposed = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    sfx.dispose();
    host.remove();
    if (!prevPosition) container.style.position = prevPosition;
  };
};

const kanjiWriter: StrokeGameModule = { title: "漢字かきとり", mount };
export default kanjiWriter;

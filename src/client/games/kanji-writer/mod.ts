/**
 * Kanji Writer — write a kanji by swiping each stroke's direction in order,
 * fighting-game-command style. The kanji is drawn from KanjiVG paths one
 * stroke at a time as you get each stroke right; a bent stroke (e.g. ┓) is
 * one continuous L-shaped drag (→ then ↓ without lifting the finger), its
 * corner recognized by `gestureDirs`. The prompt is the reading, so you
 * recall which kanji to write. Three modes dial the help from "show me" to
 * "test me".
 *
 * Stroke data derived from KanjiVG (CC BY-SA 3.0); see /NOTICE.
 */

import { createSession, type Session } from "../../../../quiz/session.ts";
import {
  DIR_ARROWS,
  gestureDirs,
  type Pt,
  quantize8,
} from "../../../../quiz/stroke/dir.ts";
import type { StrokeQuiz } from "../../../../quiz/stroke/types.ts";
import type { StrokeGameModule, StrokeGameMount } from "../stroke_types.ts";

const ROUNDS_TO_CLEAR = 5;
const MAX_HEARTS = 3;
const MIN_SWIPE = 24; // px; shorter drags are taps and ignored
const HINT_IDLE_MS = 1000; // ヒント: reveal the next arrow after this idle time

type Mode = "demo" | "hint" | "challenge";
const MODES: { id: Mode; label: string }[] = [
  { id: "demo", label: "おてほん" },
  { id: "hint", label: "ヒント" },
  { id: "challenge", label: "ちょうせん" },
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
.kw-stroke{fill:none;stroke-width:6.5;stroke-linecap:round;stroke-linejoin:round;transition:opacity .2s ease-out}
@keyframes kw-pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
.kw-pop{animation:kw-pop .25s ease-out}
@keyframes kw-shake{10%,90%{transform:translateX(-5px)}30%,70%{transform:translateX(5px)}50%{transform:translateX(-3px)}}
.kw-shake{animation:kw-shake .3s}
@keyframes kw-good{0%{transform:scale(.6);opacity:0}40%{transform:scale(1.3);opacity:1}100%{transform:scale(1.6) translateY(-24px);opacity:0}}
.kw-good{animation:kw-good .55s ease-out forwards}
`;

const SKELETON = `
  <style>${CSS}</style>
  <div class="absolute inset-0 flex flex-col bg-base-100 overflow-hidden select-none">
    <div class="flex items-center gap-2 px-3 pt-2 pl-12">
      <span data-kw="hearts" class="text-2xl whitespace-nowrap"></span>
      <div class="flex-1 text-center leading-tight">
        <div class="text-xs opacity-50">この よみの かんじ</div>
        <div data-kw="prompt" class="text-2xl font-bold"></div>
      </div>
      <div class="flex flex-col items-end leading-tight">
        <span data-kw="round" class="text-sm opacity-70 whitespace-nowrap"></span>
        <span data-kw="streak" class="text-lg font-black text-warning"></span>
      </div>
    </div>
    <div data-kw="modes" class="flex justify-center gap-1 pt-1"></div>
    <div data-kw="stage" class="relative flex-1 min-h-0 flex items-center justify-center m-2 rounded-box bg-base-200 text-base-content" style="touch-action:none">
      <div data-kw="fx" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
    </div>
    <div class="flex flex-col items-center gap-0.5 pb-2 min-h-[4.5rem] justify-center">
      <div data-kw="arrow" class="text-6xl leading-none h-[3.5rem] text-primary"></div>
      <div data-kw="progress" class="text-xs opacity-60"></div>
      <div class="text-xs opacity-40">ゆびで ほうこうに スワイプ！</div>
    </div>
  </div>
`;

const SVG_NS = "http://www.w3.org/2000/svg";

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
  const unschedule = (id: ReturnType<typeof setTimeout>) => {
    clearTimeout(id);
    timers.delete(id);
  };

  let session: Session<StrokeQuiz> = createSession(
    quiz,
    (Math.random() * 0x7fffffff) | 0,
  );
  let strokes: readonly (readonly number[])[] = [];
  let paths: readonly string[] = [];
  let strokeIndex = 0;
  let hearts = MAX_HEARTS;
  let round = 0;
  let streak = 0;
  let mode: Mode = "demo";
  let kanjiHadMistake = false;
  let resolved = false;

  let stageEl!: HTMLDivElement;
  let pathEls: SVGPathElement[] = [];
  let dragStart: Pt | null = null;
  let points: Pt[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hintRevealed = false;

  // ---- HUD ----

  const renderHud = () => {
    el("hearts").textContent = "❤️".repeat(hearts) +
      "🖤".repeat(MAX_HEARTS - hearts);
    el("round").textContent = `${round} / ${ROUNDS_TO_CLEAR}`;
    el("streak").textContent = streak >= 2 ? `🔥×${streak}` : "";
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

  // ---- center kanji (KanjiVG strokes) ----

  const buildSvg = () => {
    const fx = el("fx");
    stageEl.innerHTML = "";
    stageEl.appendChild(fx);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 109 109");
    svg.setAttribute("class", "w-full h-full pointer-events-none");
    pathEls = paths.map((d) => {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", "kw-stroke stroke-primary");
      p.style.opacity = "0";
      svg.appendChild(p);
      return p;
    });
    stageEl.insertBefore(svg, fx);
  };

  // done strokes solid; in おてほん the rest is faint; otherwise hidden.
  const renderStrokeStates = () => {
    pathEls.forEach((p, i) => {
      p.style.opacity = i < strokeIndex ? "1" : mode === "demo" ? "0.14" : "0";
    });
  };

  const popStrokeDone = () => {
    const p = pathEls[strokeIndex];
    if (!p) return;
    p.classList.remove("kw-pop");
    void p.getBoundingClientRect();
    p.classList.add("kw-pop");
  };

  // ---- bottom arrow ----

  const arrowVisible = () =>
    mode === "demo" || (mode === "hint" && hintRevealed);

  const currentStroke = (): readonly number[] | null =>
    strokes[strokeIndex] ?? null;

  // A whole stroke's arrows, e.g. a bent ┓ shows "→↓".
  const strokeArrows = (s: readonly number[]): string =>
    s.map((d) => DIR_ARROWS[d]).join("");

  const renderArrow = (danger = false) => {
    const a = el("arrow");
    const s = currentStroke();
    const show = danger || (arrowVisible() && !resolved);
    a.textContent = show && s ? strokeArrows(s) : "";
    a.classList.toggle("text-error", danger);
    a.classList.toggle("text-primary", !danger);
    if (a.textContent) {
      a.classList.remove("kw-pop");
      void a.offsetWidth;
      a.classList.add("kw-pop");
    }
  };

  const renderProgress = () => {
    el("progress").textContent = `${strokes.length}画中 ${
      Math.min(strokeIndex + 1, strokes.length)
    }画目`;
  };

  // ---- idle hint timer (ヒント) ----

  const clearIdle = () => {
    if (idleTimer !== null) {
      unschedule(idleTimer);
      idleTimer = null;
    }
  };

  const startIdle = () => {
    clearIdle();
    if (mode !== "hint" || resolved) return;
    idleTimer = schedule(() => {
      idleTimer = null;
      hintRevealed = true;
      renderArrow();
    }, HINT_IDLE_MS);
  };

  const setMode = (m: Mode) => {
    mode = m;
    hintRevealed = false;
    clearIdle();
    renderModes();
    renderStrokeStates();
    renderArrow();
    startIdle();
  };

  // ---- feedback ----

  const popGood = () => {
    const g = document.createElement("div");
    g.textContent = "よし!";
    g.className =
      "kw-good absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-black text-success";
    el("fx").appendChild(g);
    schedule(() => g.remove(), 550);
  };

  const shakeStage = () => {
    stageEl.classList.remove("kw-shake");
    void stageEl.offsetWidth;
    stageEl.classList.add("kw-shake");
  };

  // ---- flow ----

  // Whether a finished drag's directions satisfy the expected stroke. Single
  // strokes are judged by net direction (wobble-tolerant); a bent stroke needs
  // its corner, so its segmented sequence must match exactly.
  const strokeMatches = (
    g: readonly number[],
    net: number,
    e: readonly number[],
  ): boolean => {
    if (e.length === 1) {
      return net === e[0] || (g.length === 1 && g[0] === e[0]);
    }
    return g.length === e.length && e.every((d, i) => g[i] === d);
  };

  const onStrokeCorrect = () => {
    hintRevealed = false;
    sfx.stroke(strokeIndex);
    popGood();
    popStrokeDone(); // color the just-finished stroke
    strokeIndex++;
    renderStrokeStates();
    renderProgress();
    if (strokeIndex >= strokes.length) {
      onKanjiDone();
      return;
    }
    renderArrow();
    startIdle();
  };

  const onStrokeWrong = () => {
    kanjiHadMistake = true;
    sfx.wrong();
    shakeStage();
    hearts--;
    renderHud();
    if (hearts <= 0) {
      resolved = true;
      clearIdle();
      schedule(() => renderEnd(false), 700);
      return;
    }
    renderArrow(true); // flash the correct direction in red
    schedule(() => {
      if (!disposed && !resolved) {
        hintRevealed = false;
        renderArrow();
        startIdle();
      }
    }, 700);
  };

  const onKanjiDone = () => {
    resolved = true;
    clearIdle();
    el("arrow").textContent = "";
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
    hintRevealed = false;
    const q = session.next();
    strokes = q.strokes ?? [];
    paths = q.paths ?? [];
    strokeIndex = 0;
    kanjiHadMistake = false;
    el("prompt").textContent = q.prompt ?? q.label;
    buildSvg();
    renderStrokeStates();
    renderProgress();
    renderArrow();
    startIdle();
  };

  // ---- pointer ----

  const onPointerDown = (e: PointerEvent) => {
    if (resolved) return;
    dragStart = { x: e.clientX, y: e.clientY };
    points = [dragStart];
    stageEl.setPointerCapture(e.pointerId);
    // Interacting resets the idle hint (but keep an already-revealed arrow).
    clearIdle();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    const last = points[points.length - 1];
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) >= 3) {
      points.push({ x: e.clientX, y: e.clientY });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragStart) return;
    const start = dragStart;
    dragStart = null;
    if (resolved) return;
    points.push({ x: e.clientX, y: e.clientY });
    const netX = e.clientX - start.x, netY = e.clientY - start.y;
    const g = gestureDirs(points);
    if (Math.hypot(netX, netY) < MIN_SWIPE && g.length === 0) {
      startIdle(); // a tap — resume the idle countdown
      return;
    }
    const expected = currentStroke();
    if (expected && strokeMatches(g, quantize8(netX, netY), expected)) {
      onStrokeCorrect();
    } else {
      onStrokeWrong();
    }
  };

  // ---- lifecycle ----

  const renderEnd = (cleared: boolean) => {
    if (cleared) sfx.fanfare();
    clearIdle();
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
    stageEl.addEventListener("pointermove", onPointerMove);
    stageEl.addEventListener("pointerup", onPointerUp);
    stageEl.addEventListener("pointercancel", () => {
      dragStart = null;
      startIdle();
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

/**
 * Kanji Writer — write a kanji stroke by stroke. Each stroke you draw is
 * fuzzy-matched against the real KanjiVG stroke shape (not a reduced
 * direction), so curves, bends (┓) and hooks are handled naturally and the
 * judgement is forgiving. The kanji is drawn in as you get each stroke right;
 * the prompt is the reading, so you recall which kanji to write. Three modes
 * dial the help from "show me the shape" to "test me". Each kanji has a time
 * limit of (stroke count + 3) seconds.
 *
 * Kanji-specific (no longer a generic stroke engine). Stroke data from
 * KanjiVG (CC BY-SA 3.0); see /NOTICE.
 */

import { createSession, type Session } from "../../../../quiz/session.ts";
import {
  centroid,
  meanDistance,
  type P,
  pointDistance,
  resample,
} from "../../../../quiz/stroke/match.ts";
import type { StrokeQuiz } from "../../../../quiz/stroke/types.ts";
import type { StrokeGameModule, StrokeGameMount } from "../stroke_types.ts";

const ROUNDS_TO_CLEAR = 5;
const TIME_BONUS_SEC = 3; // per-kanji time = stroke count + this
const TIME_DANGER_SEC = 3; // the bar blinks red for the final stretch
const MIN_SWIPE = 20; // px; shorter drags are taps and ignored (non-dot)

const HINT_IDLE_MS = 1000; // ヒント: reveal the next stroke after this idle time

// Matching (all in the 109-unit KanjiVG canvas space):
const SAMPLE_N = 16; // points each stroke is resampled to
const MATCH_THRESH = 20; // mean point distance below which a stroke matches
const DOT_LEN = 14; // strokes shorter than this are dots (点)
const DOT_TOL = 22; // a dot matches if drawn within this of its centre

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
.kw-wrong{stroke:#ef4444!important}
.kw-ink{fill:none;stroke:#22c55e;stroke-width:6.5;stroke-linecap:round;stroke-linejoin:round;opacity:.9;pointer-events:none}
@keyframes kw-pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
.kw-pop{animation:kw-pop .25s ease-out}
@keyframes kw-shake{10%,90%{transform:translateX(-5px)}30%,70%{transform:translateX(5px)}50%{transform:translateX(-3px)}}
.kw-shake{animation:kw-shake .3s}
@keyframes kw-good{0%{transform:scale(.6);opacity:0}40%{transform:scale(1.3);opacity:1}100%{transform:scale(1.6) translateY(-24px);opacity:0}}
.kw-good{animation:kw-good .55s ease-out forwards}
@keyframes kw-fade{to{opacity:0}}
.kw-fade{animation:kw-fade .4s ease-out forwards}
@keyframes kw-blink{50%{opacity:.4}}
.kw-timer-danger{background:#ef4444!important;animation:kw-blink .4s linear infinite}
`;

const SKELETON = `
  <style>${CSS}</style>
  <div class="absolute inset-0 flex flex-col bg-base-100 overflow-hidden select-none">
    <div class="flex items-center gap-2 px-3 pt-2 pl-12">
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
    <div class="px-3 pt-1">
      <div class="h-2 bg-base-300 rounded-full overflow-hidden">
        <div data-kw="timer" class="h-full bg-info" style="width:100%"></div>
      </div>
    </div>
    <div data-kw="stage" class="relative flex-1 min-h-0 flex items-center justify-center m-2 rounded-box bg-base-200 text-base-content" style="touch-action:none">
      <div data-kw="fx" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
    </div>
    <div class="flex flex-col items-center gap-0.5 pb-2">
      <div data-kw="progress" class="text-sm opacity-70"></div>
      <div class="text-xs opacity-40">なぞって かこう！</div>
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
  let paths: readonly string[] = [];
  let strokeIndex = 0;
  let round = 0;
  let streak = 0;
  let mode: Mode = "demo";
  let kanjiHadMistake = false;
  let resolved = false;

  let stageEl!: HTMLDivElement;
  let svgEl: SVGSVGElement | null = null;
  let pathEls: SVGPathElement[] = [];
  let dragStart: P | null = null;
  let points: P[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let timerIds: ReturnType<typeof setTimeout>[] = [];
  let hintRevealed = false;

  // ---- HUD ----

  const renderHud = () => {
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

  const renderProgress = () => {
    el("progress").textContent = `${paths.length}画中 ${
      Math.min(strokeIndex + 1, paths.length)
    }画目`;
  };

  // ---- per-kanji countdown (画数 + TIME_BONUS_SEC seconds) ----

  const stopTimer = () => {
    for (const id of timerIds) unschedule(id);
    timerIds = [];
    const bar = el("timer");
    bar.style.transition = "none";
    bar.style.width = getComputedStyle(bar).width; // freeze where it is
  };

  const startTimer = () => {
    const secs = paths.length + TIME_BONUS_SEC;
    const bar = el("timer");
    bar.classList.remove("kw-timer-danger");
    bar.style.transition = "none";
    bar.style.width = "100%";
    void bar.offsetWidth;
    bar.style.transition = `width ${secs}s linear`;
    bar.style.width = "0%";
    timerIds = [
      schedule(
        () => bar.classList.add("kw-timer-danger"),
        Math.max(0, secs - TIME_DANGER_SEC) * 1000,
      ),
      schedule(onTimeout, secs * 1000),
    ];
  };

  const onTimeout = () => {
    if (resolved) return;
    resolved = true;
    clearIdle();
    sfx.wrong();
    schedule(() => renderEnd(false), 600);
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
    svgEl = svg;
  };

  // done strokes solid; the current/future depend on mode + hint.
  const renderStrokeStates = () => {
    pathEls.forEach((p, i) => {
      p.classList.remove("kw-wrong");
      let op: string;
      if (i < strokeIndex) op = "1";
      else if (i === strokeIndex) {
        op = mode === "demo" || (mode === "hint" && hintRevealed) ? "0.3" : "0";
      } else op = mode === "demo" ? "0.13" : "0";
      p.style.opacity = op;
    });
  };

  const popStrokeDone = () => {
    const p = pathEls[strokeIndex];
    if (!p) return;
    p.classList.remove("kw-pop");
    void p.getBoundingClientRect();
    p.classList.add("kw-pop");
  };

  // ---- coordinate mapping & stroke sampling ----

  // screen (client) point → SVG user units (0..109), via the SVG's CTM.
  const toUser = (sx: number, sy: number): P => {
    const ctm = svgEl?.getScreenCTM();
    if (!ctm) return { x: sx, y: sy };
    const pt = new DOMPoint(sx, sy).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const sampleTarget = (pathEl: SVGPathElement, n: number): P[] => {
    const len = pathEl.getTotalLength();
    return Array.from({ length: n }, (_, i) => {
      const pt = pathEl.getPointAtLength((len * i) / (n - 1));
      return { x: pt.x, y: pt.y };
    });
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
      renderStrokeStates();
    }, HINT_IDLE_MS);
  };

  const setMode = (m: Mode) => {
    mode = m;
    hintRevealed = false;
    clearIdle();
    renderModes();
    renderStrokeStates();
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

  // Draw the player's raw ink briefly, so a swipe is visible.
  const showInk = () => {
    if (!svgEl || points.length < 2) return;
    const d = points.map((p, i) => {
      const u = toUser(p.x, p.y);
      return `${i === 0 ? "M" : "L"}${u.x.toFixed(1)},${u.y.toFixed(1)}`;
    }).join(" ");
    const ink = document.createElementNS(SVG_NS, "path");
    ink.setAttribute("d", d);
    ink.setAttribute("class", "kw-ink kw-fade");
    svgEl.appendChild(ink);
    schedule(() => ink.remove(), 400);
  };

  // ---- flow ----

  const onStrokeCorrect = () => {
    hintRevealed = false;
    sfx.stroke(strokeIndex);
    popGood();
    popStrokeDone();
    strokeIndex++;
    renderStrokeStates();
    renderProgress();
    if (strokeIndex >= paths.length) {
      onKanjiDone();
      return;
    }
    startIdle();
  };

  // A wrong stroke no longer ends the game — it just costs time. Flash the
  // correct stroke shape in red as a nudge.
  const onStrokeWrong = () => {
    kanjiHadMistake = true;
    sfx.wrong();
    shakeStage();
    const p = pathEls[strokeIndex];
    if (p) {
      p.classList.add("kw-wrong");
      p.style.opacity = "0.6";
    }
    schedule(() => {
      if (!disposed && !resolved) {
        hintRevealed = false;
        renderStrokeStates();
        startIdle();
      }
    }, 700);
  };

  const onKanjiDone = () => {
    resolved = true;
    stopTimer();
    clearIdle();
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
    paths = q.paths ?? [];
    strokeIndex = 0;
    kanjiHadMistake = false;
    el("prompt").textContent = q.prompt ?? q.label;
    buildSvg();
    renderStrokeStates();
    renderProgress();
    startTimer();
    startIdle();
  };

  // ---- matching ----

  // Does the drawn gesture match the current expected stroke's shape?
  const gestureMatches = (): boolean => {
    const targetEl = pathEls[strokeIndex];
    if (!targetEl) return false;
    const drawnUser = points.map((p) => toUser(p.x, p.y));
    const tLen = targetEl.getTotalLength();
    if (tLen < DOT_LEN) {
      // Dot (点): accept a tap/short mark near its centre.
      const mid = sampleTarget(targetEl, 3)[1];
      const near =
        pointDistance(drawnUser[drawnUser.length - 1], mid) < DOT_TOL ||
        pointDistance(centroid(drawnUser), mid) < DOT_TOL;
      return near;
    }
    const target = sampleTarget(targetEl, SAMPLE_N);
    const drawn = resample(drawnUser, SAMPLE_N);
    return meanDistance(drawn, target) < MATCH_THRESH;
  };

  // ---- pointer ----

  const onPointerDown = (e: PointerEvent) => {
    if (resolved) return;
    dragStart = { x: e.clientX, y: e.clientY };
    points = [dragStart];
    stageEl.setPointerCapture(e.pointerId);
    clearIdle();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    const last = points[points.length - 1];
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) >= 2) {
      points.push({ x: e.clientX, y: e.clientY });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragStart) return;
    const start = dragStart;
    dragStart = null;
    if (resolved) return;
    points.push({ x: e.clientX, y: e.clientY });
    const net = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const targetEl = pathEls[strokeIndex];
    const isDot = targetEl && targetEl.getTotalLength() < DOT_LEN;
    if (net < MIN_SWIPE && !isDot) {
      startIdle(); // a tap on a normal stroke — resume the idle countdown
      return;
    }
    showInk();
    if (gestureMatches()) onStrokeCorrect();
    else onStrokeWrong();
  };

  // ---- lifecycle ----

  const renderEnd = (cleared: boolean) => {
    if (cleared) sfx.fanfare();
    stopTimer();
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

/**
 * Kanji Writer — write a kanji stroke by stroke. Each stroke you draw is
 * scored 0–5 by how well its *shape* (angle & length, not absolute position)
 * matches the real KanjiVG stroke. The prompt is the reading, so you recall
 * which kanji to write. If you draw a stroke before the hint appears (1s idle)
 * it's worth up to 5; after the hint, up to 2. A run of perfect (+5) strokes
 * builds a combo that carries across characters.
 *
 * Kanji-specific. Stroke data from KanjiVG (CC BY-SA 3.0); see /NOTICE.
 */

import { createSession, type Session } from "../../../../quiz/session.ts";
import {
  centroid,
  type P,
  pointDistance,
  shapeAccuracy,
} from "../../../../quiz/stroke/match.ts";
import type { StrokeQuiz } from "../../../../quiz/stroke/types.ts";
import type { StrokeGameModule, StrokeGameMount } from "../stroke_types.ts";

const ROUNDS_TO_CLEAR = 5;
const MIN_SWIPE = 20; // px; shorter drags are taps and ignored (non-dot)
const HINT_IDLE_MS = 1000; // reveal the next stroke after this idle time

// Scoring (canvas space is 109 units):
const SAMPLE_N = 16; // points each stroke is resampled to for matching
const MAX_PTS_PRE_HINT = 5; // best score for a stroke drawn before the hint
const MAX_PTS_POST_HINT = 2; // best score once the hint is showing
const PERFECT = MAX_PTS_PRE_HINT; // a +5 stroke keeps a combo alive
const DOT_LEN = 14; // strokes shorter than this are dots (点)
const DOT_TOL = 22; // a dot's accuracy falls to 0 this far from its centre

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
    // Higher score → higher, brighter blip. Combo bumps the pitch further.
    score(pts: number, combo: number) {
      if (pts <= 0) {
        tone(220, 0.2, { type: "sawtooth", slideTo: 90, gain: 0.05 });
        return;
      }
      const base = 440 * 2 ** ((pts + Math.min(combo, 8)) / 12);
      tone(base, 0.12, { type: "triangle" });
      if (pts >= PERFECT) tone(base * 1.5, 0.1, { at: 0.06 });
    },
    done() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.16, { at: i * 0.08 }));
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
.kw-ink{fill:none;stroke:#22c55e;stroke-width:6.5;stroke-linecap:round;stroke-linejoin:round;opacity:.9;pointer-events:none}
@keyframes kw-pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
.kw-pop{animation:kw-pop .25s ease-out}
@keyframes kw-score{0%{transform:translate(-50%,-50%) scale(.5);opacity:0}30%{transform:translate(-50%,-50%) scale(1.25);opacity:1}100%{transform:translate(-50%,-150%) scale(1);opacity:0}}
.kw-score{animation:kw-score .7s ease-out forwards}
@keyframes kw-combo{0%{transform:scale(1)}50%{transform:scale(1.35)}100%{transform:scale(1)}}
.kw-combo{animation:kw-combo .3s}
@keyframes kw-fade{to{opacity:0}}
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
        <span data-kw="score" class="text-lg font-black text-primary whitespace-nowrap"></span>
        <span data-kw="combo" class="text-sm font-black text-warning whitespace-nowrap"></span>
      </div>
    </div>
    <div data-kw="stage" class="relative flex-1 min-h-0 flex items-center justify-center m-2 rounded-box bg-base-200 text-base-content" style="touch-action:none">
      <div data-kw="fx" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
    </div>
    <div class="flex flex-col items-center gap-0.5 pb-2">
      <div data-kw="progress" class="text-sm opacity-70"></div>
      <div class="text-xs opacity-40">おぼえて かこう！はやいほど たかとくてん</div>
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
  let score = 0;
  let combo = 0;
  let resolved = false;

  let stageEl!: HTMLDivElement;
  let svgEl: SVGSVGElement | null = null;
  let pathEls: SVGPathElement[] = [];
  let dragStart: P | null = null;
  let points: P[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hintRevealed = false;

  // ---- HUD ----

  const renderHud = () => {
    el("round").textContent = `${round} / ${ROUNDS_TO_CLEAR}`;
    el("score").textContent = `スコア ${score}`;
    const c = el("combo");
    c.textContent = combo >= 2 ? `🔥コンボ ${combo}` : "";
    if (combo >= 2) {
      c.classList.remove("kw-combo");
      void c.offsetWidth;
      c.classList.add("kw-combo");
    }
  };

  const renderProgress = () => {
    el("progress").textContent = `${paths.length}画中 ${
      Math.min(strokeIndex + 1, paths.length)
    }画目`;
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

  // Done strokes solid; the current shows only once the hint is revealed.
  const renderStrokeStates = () => {
    pathEls.forEach((p, i) => {
      p.style.opacity = i < strokeIndex
        ? "1"
        : i === strokeIndex && hintRevealed
        ? "0.3"
        : "0";
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

  // ---- idle hint timer ----

  const clearIdle = () => {
    if (idleTimer !== null) {
      unschedule(idleTimer);
      idleTimer = null;
    }
  };

  const startIdle = () => {
    clearIdle();
    if (resolved) return;
    idleTimer = schedule(() => {
      idleTimer = null;
      hintRevealed = true;
      renderStrokeStates();
    }, HINT_IDLE_MS);
  };

  // ---- feedback ----

  const showScore = (pts: number, comboNow: number) => {
    const g = document.createElement("div");
    const comboLine = pts >= PERFECT && comboNow >= 2
      ? `<div class="text-xl font-black text-warning">コンボ ${comboNow}!</div>`
      : "";
    g.className =
      `kw-score absolute left-1/2 top-1/2 text-center whitespace-nowrap ${
        pts >= PERFECT
          ? "text-success"
          : pts >= 3
          ? "text-info"
          : pts >= 1
          ? "text-base-content opacity-70"
          : "text-error"
      }`;
    g.innerHTML = `<div class="text-4xl font-black">+${pts}</div>${comboLine}`;
    el("fx").appendChild(g);
    schedule(() => g.remove(), 700);
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
    ink.style.animation = "kw-fade .4s ease-out .2s forwards";
    svgEl.appendChild(ink);
    schedule(() => ink.remove(), 650);
  };

  // ---- scoring ----

  // Accuracy [0,1] of the drawn stroke against the current target's shape.
  const strokeAccuracy = (): number => {
    const targetEl = pathEls[strokeIndex];
    if (!targetEl) return 0;
    const drawnUser = points.map((p) => toUser(p.x, p.y));
    const tLen = targetEl.getTotalLength();
    if (tLen < DOT_LEN) {
      const mid = sampleTarget(targetEl, 3)[1];
      const d = Math.min(
        pointDistance(drawnUser[drawnUser.length - 1], mid),
        pointDistance(centroid(drawnUser), mid),
      );
      return Math.max(0, 1 - d / DOT_TOL);
    }
    return shapeAccuracy(drawnUser, sampleTarget(targetEl, SAMPLE_N), SAMPLE_N);
  };

  const onStrokeDrawn = () => {
    const acc = strokeAccuracy();
    const maxPts = hintRevealed ? MAX_PTS_POST_HINT : MAX_PTS_PRE_HINT;
    const pts = Math.round(acc * maxPts);

    score += pts;
    combo = pts >= PERFECT ? combo + 1 : 0;
    sfx.score(pts, combo);
    showScore(pts, combo);
    renderHud();

    hintRevealed = false;
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

  const onKanjiDone = () => {
    resolved = true;
    clearIdle();
    sfx.done();
    round++;
    renderHud();
    schedule(() => {
      if (round >= ROUNDS_TO_CLEAR) renderEnd();
      else nextKanji();
    }, 800);
  };

  const nextKanji = () => {
    resolved = false;
    hintRevealed = false;
    const q = session.next();
    paths = q.paths ?? [];
    strokeIndex = 0;
    el("prompt").textContent = q.prompt ?? q.label;
    buildSvg();
    renderStrokeStates();
    renderProgress();
    startIdle();
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
    onStrokeDrawn();
  };

  // ---- lifecycle ----

  const renderEnd = () => {
    resolved = true;
    clearIdle();
    sfx.fanfare();
    const finalScore = score;
    host.innerHTML = `
      <style>${CSS}</style>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base-100 p-6 text-center">
        <div class="text-7xl">🎉</div>
        <h2 class="text-4xl font-bold">スコア ${finalScore}</h2>
        <p class="text-lg opacity-70">${ROUNDS_TO_CLEAR}もじ かけたね！</p>
        <p class="text-xs opacity-60">漢字データ: <a class="link" href="https://kanjivg.tagaini.net" target="_blank" rel="noopener">KanjiVG</a> (CC BY-SA 3.0)</p>
      </div>
    `;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-lg";
    again.textContent = "もう一度";
    again.addEventListener("click", restart);
    host.lastElementChild!.appendChild(again);
    onComplete?.({ score: finalScore, cleared: true });
  };

  const restart = () => {
    session = createSession(quiz, (Math.random() * 0x7fffffff) | 0);
    round = 0;
    score = 0;
    combo = 0;
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

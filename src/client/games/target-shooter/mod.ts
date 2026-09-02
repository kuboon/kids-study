/**
 * Target Shooter — pull-and-release aiming game. Four answer targets
 * drift and bounce around the field; the player pulls the bird back like
 * a slingshot and releases it to fly toward a target, then it flies back
 * once it lands a hit or leaves the field. Only landing on a target
 * resolves the answer — tapping a target directly does nothing, so
 * picking the answer takes real aim. Subject-agnostic: consumes any
 * QuizGenerator.
 */

import { createSession, type QuizSession } from "../../../../quiz/session.ts";
import { plainMath } from "../../../../quiz/math/mathml.ts";
import type { GameModule, GameMount } from "../types.ts";

const ROUNDS_TO_CLEAR = 8;
const MAX_HEARTS = 3;

const TARGET_SIZE = 76; // px, square bounding box
const TARGET_RADIUS = TARGET_SIZE / 2;
const TARGET_SPEED_BASE = 70; // px/s
const TARGET_SPEED_PER_ROUND = 6;
const TARGET_SPEED_MAX = 150;
const TARGET_JITTER_CHANCE = 0.02; // per frame, nudges heading a bit

const CHICK_HIT_RADIUS = 24;
const CHICK_SPEED_MIN = 650; // px/s, weak pull
const CHICK_SPEED_MAX = 1150; // px/s, full pull
const CHICK_SPIN_DEG_PER_SEC = 640; // tumble while flying out
const CHICK_RETURN_MS = 320; // CSS transition back to the anchor
const CHICK_OUT_OF_BOUNDS_PAD = 50;

const MIN_PULL = 16; // px, below this a release cancels the shot
const MAX_PULL = 110; // px, clamps the elastic and caps flight speed

const TOP_MARGIN = 78; // keep targets clear of the HUD
const BOTTOM_MARGIN = 16;
const SIDE_MARGIN = 12;
const TARGET_MIN_SPACING = TARGET_SIZE * 1.15; // also used to clear the shooter itself

const RESOLVE_DELAY_MS = 650;

const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---- sound: tiny WebAudio blips, no audio files ---------------------------

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
    shoot() {
      tone(200, 0.08, { type: "triangle", slideTo: 500, gain: 0.04 });
    },
    hit(streak: number) {
      // Pitch climbs a semitone per streak so a run of hits is audible.
      const f = 440 * 2 ** (Math.min(streak, 12) / 12);
      tone(f, 0.14);
      tone(f * 1.5, 0.1, { at: 0.07 });
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
@keyframes ts-pop-good{0%{transform:scale(1);opacity:1}40%{transform:scale(1.4);opacity:1}100%{transform:scale(1.7) translateY(-30px);opacity:0}}
.ts-pop-good{animation:ts-pop-good .55s ease-out forwards}
@keyframes ts-pop-bad{0%{transform:scale(1) rotate(0)}30%{transform:scale(1.1) rotate(-10deg)}60%{transform:scale(1.1) rotate(10deg)}100%{transform:scale(.7) rotate(0);opacity:0}}
.ts-pop-bad{animation:ts-pop-bad .55s ease-in forwards;background:#fca5a5!important;border-color:#ef4444!important}
@keyframes ts-fade{to{opacity:0;transform:scale(.7)}}
.ts-fade{animation:ts-fade .4s ease-out forwards}
@keyframes ts-feedback{0%{transform:translate(-50%,-50%) scale(.6);opacity:0}20%{opacity:1;transform:translate(-50%,-50%) scale(1.3)}100%{transform:translate(-50%,-140%) scale(1);opacity:0}}
.ts-feedback{animation:ts-feedback .7s ease-out forwards}
@keyframes ts-streak-bounce{0%{transform:scale(1)}50%{transform:scale(1.4)}100%{transform:scale(1)}}
.ts-streak-bounce{animation:ts-streak-bounce .3s}
@keyframes ts-shake{10%,90%{transform:translateX(-4px)}30%,70%{transform:translateX(4px)}50%{transform:translateX(-3px)}}
.ts-shake{animation:ts-shake .3s}
.ts-return{transition:transform ${CHICK_RETURN_MS}ms ease-out}
`;

const SKELETON = `
  <style>${CSS}</style>
  <div data-ts="field" class="absolute inset-0 overflow-hidden bg-base-200" style="touch-action:none">
    <div class="absolute top-2 left-12 right-3 flex items-center gap-3 z-10">
      <span data-ts="hearts" class="text-2xl whitespace-nowrap"></span>
      <div data-ts="question" class="flex-1 text-center text-2xl font-bold truncate"></div>
      <div class="flex flex-col items-end">
        <span data-ts="round" class="text-sm opacity-70 whitespace-nowrap"></span>
        <span data-ts="streak" class="text-xl font-black text-warning"></span>
      </div>
    </div>
    <div data-ts="targets" class="absolute inset-0"></div>
    <div
      data-ts="band"
      class="absolute bg-warning/70 rounded-full hidden pointer-events-none"
      style="height:4px;width:0;transform-origin:left center"
    ></div>
    <span
      data-ts="shooter"
      class="absolute text-6xl select-none pointer-events-none"
      style="line-height:1"
    >🐤</span>
    <div data-ts="fx" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
  </div>
`;

// ---- game ------------------------------------------------------------------

type Vec = { x: number; y: number };

type Target = {
  wrap: HTMLDivElement;
  node: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  correct: boolean;
};

type Flight = "idle" | "out" | "back";

export const mount: GameMount = (container, { quiz, onComplete }) => {
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = "relative";

  const root = document.createElement("div");
  root.className = "absolute inset-0 bg-base-100 overflow-hidden select-none";
  container.appendChild(root);

  const el = <T extends HTMLElement = HTMLElement>(k: string): T =>
    root.querySelector(`[data-ts="${k}"]`) as T;

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

  let session: QuizSession = createSession(
    quiz,
    (Math.random() * 0x7fffffff) | 0,
  );
  let round = 0;
  let hearts = MAX_HEARTS;
  let streak = 0;
  let resolved = false; // true while a round's outcome is animating out
  let rafId = 0;
  let lastT = 0;

  let fieldEl!: HTMLDivElement;
  let shooterEl!: HTMLSpanElement;
  let targets: Target[] = [];
  let anchor: Vec = { x: 0, y: 0 };
  let dragging = false;
  let pull: Vec = { x: 0, y: 0 };

  let flight: Flight = "idle";
  let chick: Vec = { x: 0, y: 0 };
  let chickVel: Vec = { x: 0, y: 0 };
  let chickSpin = 0;

  // ---- geometry helpers ----

  const fieldSize = () => ({ w: fieldEl.clientWidth, h: fieldEl.clientHeight });

  const toLocal = (e: PointerEvent): Vec => {
    const rect = fieldEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const placeShooter = () => {
    const { w, h } = fieldSize();
    // Centered so a pull has equal room in every direction, not just up.
    anchor = { x: w / 2, y: h / 2 };
    const s = el<HTMLSpanElement>("shooter");
    s.style.left = `${anchor.x - 30}px`;
    s.style.top = `${anchor.y - 30}px`;
  };

  // ---- aiming ----

  const clampPull = () => {
    const len = Math.hypot(pull.x, pull.y);
    if (len > MAX_PULL) {
      pull.x = (pull.x / len) * MAX_PULL;
      pull.y = (pull.y / len) * MAX_PULL;
    }
  };

  const updateBand = () => {
    const band = el<HTMLDivElement>("band");
    const len = Math.hypot(pull.x, pull.y);
    const ang = Math.atan2(pull.y, pull.x) * (180 / Math.PI);
    band.style.width = `${len}px`;
    band.style.transform =
      `translate(${anchor.x}px, ${anchor.y}px) rotate(${ang}deg)`;
    band.classList.toggle("hidden", len < 2);
    el<HTMLSpanElement>("shooter").style.transform = `translate(${
      pull.x * 0.5
    }px, ${pull.y * 0.5}px)`;
  };

  const returnChick = () => {
    flight = "back";
    chickSpin = 0;
    shooterEl.classList.add("ts-return");
    shooterEl.style.transform = "translate(0,0)";
    schedule(() => {
      shooterEl.classList.remove("ts-return");
      flight = "idle";
    }, CHICK_RETURN_MS);
  };

  const fire = (pullLen: number) => {
    sfx.shoot();
    const speed = CHICK_SPEED_MIN +
      (pullLen / MAX_PULL) * (CHICK_SPEED_MAX - CHICK_SPEED_MIN);
    const dirX = -pull.x / pullLen;
    const dirY = -pull.y / pullLen;
    flight = "out";
    chickSpin = 0;
    chick = { x: anchor.x, y: anchor.y };
    chickVel = { x: dirX * speed, y: dirY * speed };
    shooterEl.classList.remove("ts-return");
  };

  const onPointerDown = (e: PointerEvent) => {
    if (resolved || flight !== "idle") return;
    dragging = true;
    fieldEl.setPointerCapture(e.pointerId);
    const p = toLocal(e);
    pull = { x: p.x - anchor.x, y: p.y - anchor.y };
    clampPull();
    updateBand();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const p = toLocal(e);
    pull = { x: p.x - anchor.x, y: p.y - anchor.y };
    clampPull();
    updateBand();
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    const len = Math.hypot(pull.x, pull.y);
    if (len >= MIN_PULL && flight === "idle" && !resolved) {
      fire(len);
    }
    pull = { x: 0, y: 0 };
    updateBand();
  };

  const bindField = () => {
    fieldEl = el<HTMLDivElement>("field");
    shooterEl = el<HTMLSpanElement>("shooter");
    fieldEl.addEventListener("pointerdown", onPointerDown);
    fieldEl.addEventListener("pointermove", onPointerMove);
    fieldEl.addEventListener("pointerup", onPointerUp);
    fieldEl.addEventListener("pointercancel", onPointerUp);
  };

  // ---- targets / round ----

  const clearField = () => {
    for (const t of targets) t.wrap.remove();
    targets = [];
  };

  const spawnTargets = (correct: string, wrongs: string[]) => {
    const { w, h } = fieldSize();
    const values = shuffle([
      { v: correct, c: true },
      ...wrongs.map((v) => ({ v, c: false })),
    ]);
    const speed = Math.min(
      TARGET_SPEED_MAX,
      TARGET_SPEED_BASE + round * TARGET_SPEED_PER_ROUND,
    );
    // Seed with the shooter's own spot so targets don't spawn right on it.
    const placed: Vec[] = [
      { x: anchor.x - TARGET_SIZE / 2, y: anchor.y - TARGET_SIZE / 2 },
    ];
    const layer = el("targets");
    for (const { v, c } of values) {
      let x = 0, y = 0, tries = 20;
      do {
        x = SIDE_MARGIN +
          Math.random() * Math.max(1, w - SIDE_MARGIN * 2 - TARGET_SIZE);
        y = TOP_MARGIN +
          Math.random() *
            Math.max(1, h - TOP_MARGIN - BOTTOM_MARGIN - TARGET_SIZE);
        tries--;
      } while (
        tries > 0 &&
        placed.some((p) => Math.hypot(p.x - x, p.y - y) < TARGET_MIN_SPACING)
      );
      placed.push({ x, y });

      const wrap = document.createElement("div");
      wrap.className = "absolute";
      wrap.style.width = `${TARGET_SIZE}px`;
      wrap.style.height = `${TARGET_SIZE}px`;
      wrap.style.willChange = "transform";
      const node = document.createElement("div");
      node.className =
        "w-full h-full flex items-center justify-center rounded-full bg-base-100 border-4 border-primary shadow-lg font-bold text-center px-1 text-lg";
      node.innerHTML = v;
      wrap.appendChild(node);
      layer.appendChild(wrap);

      const angle = Math.random() * Math.PI * 2;
      targets.push({
        wrap,
        node,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        correct: c,
      });
    }
  };

  const ask = () => {
    const q = session.next();
    // Targets show the display markup (fractions are MathML) but are deduped
    // on the plain form, so the same value never appears on two targets.
    const correct = q.a;
    const seen = new Set([plainMath(correct)]);
    const wrongs: string[] = [];
    let safety = 16;
    while (wrongs.length < 3 && safety-- > 0) {
      const w = q.wrong();
      if (seen.has(plainMath(w))) continue;
      seen.add(plainMath(w));
      wrongs.push(w);
    }
    while (wrongs.length < 3) wrongs.push(`?${wrongs.length}`);
    el("question").innerHTML = q.q;
    spawnTargets(correct, wrongs);
  };

  // ---- feedback ----

  const popFeedback = (x: number, y: number, text: string, good: boolean) => {
    const f = document.createElement("div");
    f.textContent = text;
    f.className = `ts-feedback absolute font-black text-3xl whitespace-nowrap ${
      good ? "text-success" : "text-error"
    }`;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    el("fx").appendChild(f);
    schedule(() => f.remove(), 700);
  };

  const shakeHearts = () => {
    const h = el("hearts");
    h.classList.remove("ts-shake");
    void h.offsetWidth;
    h.classList.add("ts-shake");
  };

  const renderStreak = () => {
    const s = el("streak");
    if (streak >= 2) {
      s.textContent = `🔥×${streak}`;
      s.classList.remove("ts-streak-bounce");
      void s.offsetWidth;
      s.classList.add("ts-streak-bounce");
    } else {
      s.textContent = "";
    }
  };

  const renderHud = () => {
    el("hearts").textContent = "❤️".repeat(hearts) +
      "🖤".repeat(MAX_HEARTS - hearts);
    el("round").textContent = `${round} / ${ROUNDS_TO_CLEAR}`;
    renderStreak();
  };

  const popTarget = (hitTarget: Target, correct: boolean) => {
    for (const tg of targets) {
      tg.node.classList.add(
        tg === hitTarget ? (correct ? "ts-pop-good" : "ts-pop-bad") : "ts-fade",
      );
    }
    const wraps = targets.map((t) => t.wrap);
    targets = [];
    schedule(() => wraps.forEach((w) => w.remove()), 600);
  };

  const onHit = (tg: Target) => {
    resolved = true;
    returnChick();
    const cx = tg.x + TARGET_RADIUS;
    const cy = tg.y + TARGET_RADIUS;
    if (tg.correct) {
      streak++;
      round++;
      sfx.hit(streak);
      popFeedback(cx, cy, "めいちゅう!", true);
      popTarget(tg, true);
      renderHud();
      schedule(() => {
        if (round >= ROUNDS_TO_CLEAR) renderEnd(true);
        else nextRound();
      }, RESOLVE_DELAY_MS);
    } else {
      streak = 0;
      session.markWrong();
      sfx.wrong();
      popFeedback(cx, cy, "ちがう!", false);
      popTarget(tg, false);
      hearts--;
      shakeHearts();
      renderHud();
      schedule(() => {
        if (hearts <= 0) renderEnd(false);
        else nextRound();
      }, RESOLVE_DELAY_MS);
    }
  };

  const nextRound = () => {
    resolved = false;
    ask();
  };

  // ---- animation loop ----

  const tick = (t: number) => {
    if (disposed) return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    const { w, h } = fieldSize();

    for (const tg of targets) {
      if (Math.random() < TARGET_JITTER_CHANCE) {
        const jitter = (Math.random() - 0.5) * 1.2;
        const speed = Math.hypot(tg.vx, tg.vy);
        const ang = Math.atan2(tg.vy, tg.vx) + jitter;
        tg.vx = Math.cos(ang) * speed;
        tg.vy = Math.sin(ang) * speed;
      }
      tg.x += tg.vx * dt;
      tg.y += tg.vy * dt;
      const minX = SIDE_MARGIN, maxX = w - SIDE_MARGIN - TARGET_SIZE;
      const minY = TOP_MARGIN, maxY = h - BOTTOM_MARGIN - TARGET_SIZE;
      if (tg.x < minX) {
        tg.x = minX;
        tg.vx = Math.abs(tg.vx);
      } else if (tg.x > maxX) {
        tg.x = maxX;
        tg.vx = -Math.abs(tg.vx);
      }
      if (tg.y < minY) {
        tg.y = minY;
        tg.vy = Math.abs(tg.vy);
      } else if (tg.y > maxY) {
        tg.y = maxY;
        tg.vy = -Math.abs(tg.vy);
      }
      tg.wrap.style.transform = `translate(${tg.x}px, ${tg.y}px)`;
    }

    if (flight === "out") {
      chick.x += chickVel.x * dt;
      chick.y += chickVel.y * dt;
      chickSpin += CHICK_SPIN_DEG_PER_SEC * dt;
      shooterEl.style.transform = `translate(${chick.x - anchor.x}px, ${
        chick.y - anchor.y
      }px) rotate(${chickSpin}deg)`;

      let hit = false;
      if (!resolved) {
        for (const tg of targets) {
          const cx = tg.x + TARGET_RADIUS, cy = tg.y + TARGET_RADIUS;
          if (
            Math.hypot(cx - chick.x, cy - chick.y) <
              TARGET_RADIUS + CHICK_HIT_RADIUS
          ) {
            onHit(tg);
            hit = true;
            break;
          }
        }
      }
      if (
        !hit && (
          chick.x < -CHICK_OUT_OF_BOUNDS_PAD ||
          chick.x > w + CHICK_OUT_OF_BOUNDS_PAD ||
          chick.y < -CHICK_OUT_OF_BOUNDS_PAD ||
          chick.y > h + CHICK_OUT_OF_BOUNDS_PAD
        )
      ) {
        returnChick();
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    lastT = 0;
    rafId = requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };

  // ---- lifecycle ----

  const renderEnd = (cleared: boolean) => {
    stopLoop();
    if (cleared) sfx.fanfare();
    clearField();
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-base-100">
        <div class="text-7xl">${cleared ? "🎯" : "💤"}</div>
        <h2 class="text-4xl font-bold">${cleared ? "クリア！" : "おしまい"}</h2>
        <p class="text-2xl">めいちゅう ${round} / ${ROUNDS_TO_CLEAR}</p>
      </div>
    `;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-lg";
    again.textContent = "もう一度";
    again.addEventListener("click", restart);
    root.lastElementChild!.appendChild(again);
    onComplete?.({ score: round, cleared });
  };

  const startGame = () => {
    root.innerHTML = SKELETON;
    targets = [];
    resolved = false;
    dragging = false;
    pull = { x: 0, y: 0 };
    flight = "idle";
    chickSpin = 0;
    bindField();
    placeShooter();
    renderHud();
    nextRound();
    startLoop();
  };

  const restart = () => {
    session = createSession(quiz, (Math.random() * 0x7fffffff) | 0);
    round = 0;
    hearts = MAX_HEARTS;
    streak = 0;
    startGame();
  };

  startGame();

  return () => {
    disposed = true;
    stopLoop();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    sfx.dispose();
    root.remove();
    if (!prevPosition) container.style.position = prevPosition;
  };
};

const targetShooter: GameModule = { title: "まとあて", mount };
export default targetShooter;

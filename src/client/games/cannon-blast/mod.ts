/**
 * たいほうドカン — cannon vs. block castle. A castle of physics blocks stands
 * on a table; four of its blocks carry the answer choices. Aim the cannon by
 * pull-and-release: hitting the correct block sets off a blast that topples
 * the castle (points per fallen block, bonus for the gem on top / full clear),
 * while wrong blocks are secretly solid iron — the ball clangs off and the
 * block is revealed. Consecutive correct hits grow the cannonball stone →
 * iron → gold with a bigger blast. Subject-agnostic: consumes any
 * QuizGenerator. Physics by matter-js, rendering on a 2D canvas.
 */

// @ts-types="@types/matter-js"
import Matter from "matter-js";
import { createSession, type QuizSession } from "../../../../quiz/session.ts";
import type { GameModule, GameMount } from "../types.ts";

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

const ROUNDS_TO_CLEAR = 8;
const MAX_HEARTS = 3;

const GROUND_H = 46;
const PLAT_RAISE = 74; // table top sits this far above the ground: low, so a flat shot reaches the tower
const PLAT_H = 16;
const BLOCK_W = 72; // brick width — wide enough that a tall tower isn't top-heavy
const BLOCK_H = 36;
const BODY_W = BLOCK_W - 2;
const BODY_H = BLOCK_H - 2;
const GEM_R = 12;
const HUD_CLEARANCE = 96; // keep the tower's top clear of the HUD bar

// A tall two-column tower: twice the debris for a meatier collapse, while the
// answer bricks all sit in the LEFT column so they stay easy to read and to
// pick a target from — the right column is plain wood that comes down with it.
const TOWER_COLS = 2;
const ANSWER_COL = 0;
const TOWER_ROWS_MIN = 7;
const TOWER_ROWS_MAX = 13;

const DENSITY_WOOD = 0.002;
const DENSITY_IRON = 0.008; // wrong answers: heavy enough to clang, light enough not to crush

const MAX_PULL = 150;
const MIN_PULL = 18;
const POWER_MIN = 10; // ball speed in px per physics step
const POWER_MAX = 26;
const PHYS_STEP = 1000 / 60;
// Matter applies gravity as force*dt^2 each step; this matches its default.
const G_STEP = 1 * 0.001 * (PHYS_STEP * PHYS_STEP);

const BALL_TTL_MS = 2200;
const SETTLE_MS = 2200; // a tall tower takes a while to finish coming down
const FALL_Y_MARGIN = 30; // below the table top = toppled (the table is low, so keep this short)
const TOPPLE_DIST = 30; // px moved from its settled spot before a block counts as demolished

const WRONG_MIN_SPEED = 2.5; // gentle rolls onto a wrong block don't count
const CORRECT_MIN_SPEED = 1.5;

const POINTS_BLOCK = 10;
const POINTS_GEM = 50;
const POINTS_ALL_CLEAR = 100;

// Ball tiers by streak: stone → iron → gold.
type BallTier = {
  r: number;
  density: number;
  blast: number;
  kick: number;
  fill: string;
};
// Reach and kick are generous: the tower is tall and perfectly stacked, so a
// timid blast just drops it straight down onto the table still standing, which
// is neither satisfying nor worth any points.
const BALL_TIERS: readonly BallTier[] = [
  { r: 11, density: 0.03, blast: 180, kick: 21, fill: "#8d8d99" },
  { r: 15, density: 0.04, blast: 230, kick: 25, fill: "#4b5563" },
  { r: 20, density: 0.05, blast: 300, kick: 30, fill: "#f5c518" },
];
const tierForStreak = (s: number) => (s >= 4 ? 2 : s >= 2 ? 1 : 0);

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");

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
      tone(160, 0.18, { type: "triangle", slideTo: 60, gain: 0.06 });
      tone(700, 0.05, { type: "square", slideTo: 300, gain: 0.03 });
    },
    boom() {
      tone(120, 0.5, { type: "sawtooth", slideTo: 30, gain: 0.09 });
      tone(60, 0.6, { type: "square", slideTo: 25, gain: 0.07, at: 0.02 });
    },
    clang() {
      tone(1250, 0.25, { type: "square", gain: 0.05, slideTo: 900 });
      tone(1867, 0.18, { type: "square", gain: 0.03, slideTo: 1400, at: 0.01 });
      tone(180, 0.25, { type: "sawtooth", slideTo: 80, gain: 0.04 });
    },
    topple(i: number) {
      // Ascending blip per fallen block so a big collapse plays a run.
      const f = 520 * 2 ** (Math.min(i, 16) / 12);
      tone(f, 0.09, { type: "triangle", gain: 0.035 });
    },
    gem() {
      [1046, 1318, 1568, 2093].forEach((f, i) =>
        tone(f, 0.18, { at: i * 0.06, type: "triangle", gain: 0.04 })
      );
    },
    fanfare() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { at: i * 0.12 }));
      tone(1046, 0.6, { at: 0.55, gain: 0.05 });
    },
    wrongEnd() {
      tone(280, 0.4, { type: "sawtooth", slideTo: 70, gain: 0.06 });
    },
    dispose() {
      ctx?.close();
      ctx = null;
    },
  };
};

// ---- styles ----------------------------------------------------------------

const CSS = `
@keyframes cb-feedback{0%{transform:translate(-50%,-50%) scale(.6);opacity:0}20%{opacity:1;transform:translate(-50%,-50%) scale(1.25)}100%{transform:translate(-50%,-150%) scale(1);opacity:0}}
.cb-feedback{animation:cb-feedback .8s ease-out forwards}
@keyframes cb-shake{10%,90%{transform:translateX(-4px)}30%,70%{transform:translateX(4px)}50%{transform:translateX(-3px)}}
.cb-shake{animation:cb-shake .3s}
@keyframes cb-streak-bounce{0%{transform:scale(1)}50%{transform:scale(1.4)}100%{transform:scale(1)}}
.cb-streak-bounce{animation:cb-streak-bounce .3s}
@keyframes cb-banner{0%{transform:translate(-50%,-50%) scale(.5);opacity:0}15%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}80%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-60%) scale(1)}}
.cb-banner{animation:cb-banner 1.2s ease-out forwards}
`;

const SKELETON = `
  <style>${CSS}</style>
  <div data-cb="field" class="absolute inset-0 overflow-hidden" style="touch-action:none">
    <canvas data-cb="canvas" class="absolute inset-0 w-full h-full"></canvas>
    <div class="absolute top-2 left-12 right-3 flex items-center gap-3 z-10 pointer-events-none">
      <span data-cb="hearts" class="text-2xl whitespace-nowrap"></span>
      <div data-cb="question" class="flex-1 text-center text-2xl font-bold truncate bg-base-100/80 rounded-box px-3 py-1"></div>
      <div class="flex flex-col items-end bg-base-100/80 rounded-box px-2 py-1">
        <span data-cb="round" class="text-sm opacity-70 whitespace-nowrap"></span>
        <span data-cb="score" class="text-lg font-black text-primary whitespace-nowrap"></span>
        <span data-cb="streak" class="text-xl font-black text-warning"></span>
      </div>
    </div>
    <div data-cb="fx" class="absolute inset-0 pointer-events-none overflow-hidden z-10"></div>
  </div>
`;

// ---- game ------------------------------------------------------------------

type Vec = { x: number; y: number };

type BlockRole = "wood" | "answer" | "gem";

type BlockInfo = {
  body: Matter.Body;
  role: BlockRole;
  w: number;
  h: number;
  label?: string; // answer text
  correct?: boolean;
  revealed?: boolean; // wrong answer hit once → shown as iron
  counted?: boolean; // already scored as toppled
  removed?: boolean;
  x0?: number; // resting spot once the tower has settled, for topple detection
  y0?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  max: number;
  size: number;
  color: string;
};

export const mount: GameMount = (container, { quiz, onComplete }) => {
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = "relative";

  const root = document.createElement("div");
  root.className = "absolute inset-0 bg-base-100 overflow-hidden select-none";
  container.appendChild(root);

  const el = <T extends HTMLElement = HTMLElement>(k: string): T =>
    root.querySelector(`[data-cb="${k}"]`) as T;

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
  let score = 0;
  let resolvedAnswer = false; // correct block already hit this round
  let ending = false;
  let rafId = 0;
  let lastT = 0;
  let physAcc = 0;

  let fieldEl!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let ctx2d!: CanvasRenderingContext2D;
  let W = 0;
  let H = 0;

  // A tall one-block-wide tower is a demanding stack: the default solver lets
  // solver noise accumulate until it leans over on its own. More iterations
  // keep it upright long enough to fall asleep, after which it is rock steady.
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 14,
    velocityIterations: 10,
  });

  let blocks = new Map<number, BlockInfo>();
  let ball: Matter.Body | null = null;
  let ballTier = BALL_TIERS[0];
  let ballAnswerTouched = false;
  let ballTimer: ReturnType<typeof setTimeout> | null = null;
  const particles: Particle[] = [];
  let shakeT = 0;
  let toppleRun = 0; // consecutive topple blips for the ascending run
  let toppleRunTimer: ReturnType<typeof setTimeout> | null = null;

  // cannon
  let cannonPivot: Vec = { x: 0, y: 0 };
  let barrelAngle = -Math.PI * 0.22;
  let recoil = 0;
  let dragging = false;
  let dragStart: Vec = { x: 0, y: 0 };
  let pull: Vec = { x: 0, y: 0 };

  // world geometry
  let groundTop = 0;
  let platTop = 0;
  let platLeft = 0;
  let platRight = 0;

  // ---- geometry / world setup ----

  const toLocal = (e: PointerEvent): Vec => {
    const rect = fieldEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const setupWorld = () => {
    W = fieldEl.clientWidth;
    H = fieldEl.clientHeight;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx2d = canvas.getContext("2d")!;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

    groundTop = H - GROUND_H;
    platTop = groundTop - PLAT_RAISE;
    // A pedestal just wider than the tower, set back from the cannon so a shot
    // has room to arc, but not hard against the right edge.
    const platW = Math.min(
      (TOWER_COLS - 1) * BLOCK_W + BODY_W + 44,
      W * 0.62,
    );
    const platCenter = Math.min(W * 0.7, W - platW / 2 - 14);
    platLeft = platCenter - platW / 2;
    platRight = platCenter + platW / 2;
    cannonPivot = { x: Math.max(46, W * 0.1), y: groundTop - 20 };

    Composite.clear(engine.world, false);
    Composite.add(engine.world, [
      // ground: generous width so debris can pile up on either side
      Bodies.rectangle(W / 2, groundTop + GROUND_H / 2, W * 3, GROUND_H, {
        isStatic: true,
        friction: 0.8,
        label: "ground",
      }),
      // the table the castle stands on
      Bodies.rectangle(
        (platLeft + platRight) / 2,
        platTop + PLAT_H / 2,
        platRight - platLeft,
        PLAT_H,
        { isStatic: true, friction: 0.9, label: "platform" },
      ),
      // Invisible side walls: debris (and the answer blocks) stay on screen
      // instead of sailing off where the player can no longer aim at them.
      Bodies.rectangle(-30, H / 2, 60, H * 3, {
        isStatic: true,
        friction: 0.4,
        label: "wall",
      }),
      Bodies.rectangle(W + 30, H / 2, 60, H * 3, {
        isStatic: true,
        friction: 0.4,
        label: "wall",
      }),
    ]);
  };

  // ---- castle ----

  const castleSizeForRound = () => {
    // One column, growing taller each round — but never so tall that its top
    // would run under the HUD on a short screen.
    const fitsHeight = Math.max(
      4,
      Math.floor((platTop - HUD_CLEARANCE) / BODY_H),
    );
    return {
      cols: TOWER_COLS,
      rows: Math.min(TOWER_ROWS_MIN + round, TOWER_ROWS_MAX, fitsHeight),
    };
  };

  const buildCastle = (correct: string, wrongs: string[]) => {
    blocks = new Map();
    const { cols, rows } = castleSizeForRound();
    const originX = (platLeft + platRight) / 2 - ((cols - 1) * BLOCK_W) / 2;

    // Filled bottom-up, so every block rests on the one below (or the table).
    // Punching holes at random instead would leave floating blocks that drop
    // the moment physics starts and collapse the tower before the first shot.
    const heights = Array.from({ length: cols }, () => rows);
    const cells: { c: number; r: number }[] = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < heights[c]; r++) cells.push({ c, r });
    }

    // All four answers live in the left column, spread one per quarter of the
    // tower's height: the player picks an elevation rather than hosing one
    // spot, and the labels stay in a single readable line.
    const answerColumn = cells.filter((cell) => cell.c === ANSWER_COL);
    const answerCells: { c: number; r: number }[] = [];
    for (let band = 0; band < 4; band++) {
      const lo = Math.floor((rows * band) / 4);
      const hi = Math.max(lo, Math.floor((rows * (band + 1)) / 4) - 1);
      const choices = answerColumn.filter(
        (cell) => cell.r >= lo && cell.r <= hi && !answerCells.includes(cell),
      );
      if (choices.length) {
        answerCells.push(choices[Math.floor(Math.random() * choices.length)]);
      }
    }
    // Short towers may not fill four bands; top up from the same column.
    for (const cell of shuffle(answerColumn)) {
      if (answerCells.length >= 4) break;
      if (answerCells.includes(cell)) continue;
      answerCells.push(cell);
    }

    const labels = shuffle([
      { v: correct, correct: true },
      ...wrongs.map((v) => ({ v, correct: false })),
    ]);

    for (const { c, r } of cells) {
      const x = originX + c * BLOCK_W;
      // Stack on the body height so blocks start exactly touching: spawning
      // with gaps makes the whole castle drop and jostle on the first frame.
      const y = platTop - BODY_H / 2 - r * BODY_H;
      const ai = answerCells.findIndex((a) => a.c === c && a.r === r);
      const isAnswer = ai >= 0 && ai < labels.length;
      const info: BlockInfo = {
        body: Bodies.rectangle(x, y, BODY_W, BODY_H, {
          friction: 0.9,
          frictionStatic: 4, // grips its neighbours so the tower doesn't creep sideways
          restitution: 0,
          // Wrong answers are secretly iron — heavier, so the ball clangs off.
          // Only mildly so: the blast moves blocks by setting velocity (which
          // ignores mass), and a huge mass here would instead crush the wood
          // underneath and topple the castle on its own.
          density: isAnswer && !labels[ai].correct
            ? DENSITY_IRON
            : DENSITY_WOOD,
          label: isAnswer ? "answer" : "wood",
        }),
        role: isAnswer ? "answer" : "wood",
        w: BODY_W,
        h: BODY_H,
        ...(isAnswer
          ? { label: labels[ai].v, correct: labels[ai].correct }
          : {}),
      };
      blocks.set(info.body.id, info);
    }

    // The gem crowns the tallest column. Its body is a flat-bottomed box, not a
    // ball: a circle on a flat top sits in unstable equilibrium and rolls off
    // (and nudges the tower) the instant the solver jitters.
    const topRows = Math.max(...heights);
    const gem: BlockInfo = {
      body: Bodies.rectangle(
        // Straddles the columns, resting on both their flat tops.
        originX + ((cols - 1) * BLOCK_W) / 2,
        platTop - topRows * BODY_H - GEM_R,
        GEM_R * 2,
        GEM_R * 2,
        {
          friction: 0.9,
          frictionStatic: 4,
          restitution: 0,
          density: DENSITY_WOOD,
          label: "gem",
        },
      ),
      role: "gem",
      w: GEM_R * 2,
      h: GEM_R * 2,
    };
    blocks.set(gem.body.id, gem);

    Composite.add(engine.world, [...blocks.values()].map((b) => b.body));

    // Settle the tower off-camera and, crucially, keep stepping until every
    // block has fallen asleep — a sleeping stack is frozen and cannot drift.
    // Matter needs ~60 still frames before it sleeps a body, so a short fixed
    // settle would hand the player a tower that is still quietly leaning.
    for (let i = 0; i < 400; i++) {
      Engine.update(engine, PHYS_STEP);
      if (i > 70 && [...blocks.values()].every((b) => b.body.isSleeping)) break;
    }
    // Remember where each block came to rest: scoring compares against this.
    for (const info of blocks.values()) {
      info.x0 = info.body.position.x;
      info.y0 = info.body.position.y;
    }
  };

  const clearCastle = () => {
    for (const info of blocks.values()) {
      if (!info.removed) Composite.remove(engine.world, info.body);
    }
    blocks = new Map();
    removeBall();
  };

  // ---- questions ----

  const ask = () => {
    const q = session.next();
    const correct = stripHtml(q.a);
    const wrongs: string[] = [];
    let safety = 16;
    while (wrongs.length < 3 && safety-- > 0) {
      const w = stripHtml(q.wrong());
      if (w !== correct && !wrongs.includes(w)) wrongs.push(w);
    }
    while (wrongs.length < 3) wrongs.push(`?${wrongs.length}`);
    el("question").innerHTML = q.q;
    buildCastle(correct, wrongs);
  };

  // ---- shooting ----

  const removeBall = () => {
    if (ballTimer) {
      clearTimeout(ballTimer);
      timers.delete(ballTimer);
      ballTimer = null;
    }
    if (ball) {
      Composite.remove(engine.world, ball);
      ball = null;
    }
  };

  const muzzle = (angle: number): Vec => ({
    x: cannonPivot.x + Math.cos(angle) * 46,
    y: cannonPivot.y + Math.sin(angle) * 46,
  });

  const fireWithVelocity = (v: Vec) => {
    if (ball || resolvedAnswer || ending) return;
    sfx.shoot();
    ballTier = BALL_TIERS[tierForStreak(streak)];
    barrelAngle = Math.atan2(v.y, v.x);
    recoil = 1;
    const m = muzzle(barrelAngle);
    ball = Bodies.circle(m.x, m.y, ballTier.r, {
      density: ballTier.density,
      restitution: 0.35,
      friction: 0.05,
      label: "ball",
    });
    ballAnswerTouched = false;
    Body.setVelocity(ball, v);
    Composite.add(engine.world, ball);
    for (let i = 0; i < 8; i++) {
      spawnParticle(m.x, m.y, barrelAngle, "#ffb54d");
    }
    ballTimer = schedule(() => {
      ballTimer = null;
      removeBall();
    }, BALL_TTL_MS);
  };

  const pullToVelocity = (p: Vec): Vec | null => {
    const len = Math.hypot(p.x, p.y);
    if (len < MIN_PULL) return null;
    const clamped = Math.min(len, MAX_PULL);
    const power = POWER_MIN +
      ((clamped - MIN_PULL) / (MAX_PULL - MIN_PULL)) * (POWER_MAX - POWER_MIN);
    return { x: (-p.x / len) * power, y: (-p.y / len) * power };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (ending) return;
    dragging = true;
    fieldEl.setPointerCapture(e.pointerId);
    dragStart = toLocal(e);
    pull = { x: 0, y: 0 };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const p = toLocal(e);
    pull = { x: p.x - dragStart.x, y: p.y - dragStart.y };
    const v = pullToVelocity(pull);
    if (v) barrelAngle = Math.atan2(v.y, v.x);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    const v = pullToVelocity(pull);
    pull = { x: 0, y: 0 };
    if (v) fireWithVelocity(v);
  };

  // ---- collisions ----

  const explode = (info: BlockInfo) => {
    resolvedAnswer = true;
    streak++;
    sfx.boom();
    shakeT = 0.5;
    const cx = info.body.position.x;
    const cy = info.body.position.y;
    info.removed = true;
    info.counted = true; // the exploded block itself counts as toppled
    Composite.remove(engine.world, info.body);
    removeBall();

    const R = ballTier.blast;
    for (const other of blocks.values()) {
      if (other.removed) continue;
      const b = other.body;
      // Wrong answers shed their iron so the whole castle can come down.
      if (other.role === "answer" && !other.correct) {
        Body.setDensity(b, DENSITY_WOOD);
      }
      // Wake every block, not just the ones in blast range: the engine skips
      // integration for sleeping bodies, so a settled tower would otherwise
      // hang in mid-air above the hole the blast just punched in it.
      Sleeping.set(b, false);
      const dx = b.position.x - cx;
      const dy = b.position.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const boost = (1 - d / R) * ballTier.kick;
      Body.setVelocity(b, {
        x: b.velocity.x + (dx / d) * boost,
        y: b.velocity.y + (dy / d) * boost - 3,
      });
    }
    for (let i = 0; i < 26; i++) {
      spawnParticle(cx, cy, Math.random() * Math.PI * 2, "#ff8c42");
    }
    popFeedback(cx, cy, "ドカーン!", "text-warning");
    renderHud();
    schedule(finishRound, SETTLE_MS);
  };

  const clangWrong = (info: BlockInfo) => {
    info.revealed = true;
    streak = 0;
    hearts--;
    session.markWrong();
    sfx.clang();
    // Wake the stack so the whole tower visibly shudders from the impact.
    for (const other of blocks.values()) {
      if (!other.removed) Sleeping.set(other.body, false);
    }
    shakeT = 0.25;
    const p = info.body.position;
    for (let i = 0; i < 10; i++) {
      spawnParticle(p.x, p.y, Math.random() * Math.PI * 2, "#c9ced6");
    }
    popFeedback(p.x, p.y, "ちがう!", "text-error");
    shakeHearts();
    renderHud();
    if (hearts <= 0) {
      ending = true;
      schedule(() => renderEnd(false), 900);
    }
  };

  const onCollision = (e: Matter.IEventCollision<Matter.Engine>) => {
    if (disposed || ending) return;
    for (const pair of e.pairs) {
      const { bodyA, bodyB } = pair;
      const other = bodyA.label === "ball"
        ? bodyB
        : bodyB.label === "ball"
        ? bodyA
        : null;
      if (!other || !ball) continue;
      const info = blocks.get(other.id);
      if (!info || info.role !== "answer" || info.removed) continue;
      if (ballAnswerTouched || resolvedAnswer) continue;
      const speed = Math.hypot(
        ball.velocity.x - other.velocity.x,
        ball.velocity.y - other.velocity.y,
      );
      if (info.correct) {
        if (speed < CORRECT_MIN_SPEED) continue;
        ballAnswerTouched = true;
        explode(info);
      } else {
        if (speed < WRONG_MIN_SPEED) continue;
        ballAnswerTouched = true;
        clangWrong(info);
      }
      break;
    }
  };

  // ---- scoring / round flow ----

  // A block scores once it has been demolished — shoved well off its resting
  // spot, tipped over, or knocked off the table. Position alone isn't enough:
  // the table is deliberately low, so most of a toppled tower lands on top of
  // it rather than below it, and "fell off the edge" would score almost none
  // of the collapse the player just caused.
  const isToppled = (info: BlockInfo): boolean => {
    const p = info.body.position;
    if (p.y > platTop + FALL_Y_MARGIN) return true;
    if (Math.abs(info.body.angle) > 0.5) return true;
    const dx = p.x - (info.x0 ?? p.x);
    const dy = p.y - (info.y0 ?? p.y);
    return Math.hypot(dx, dy) > TOPPLE_DIST;
  };

  const countFallen = () => {
    for (const info of blocks.values()) {
      if (info.removed || info.counted) continue;
      if (isToppled(info)) {
        info.counted = true;
        const p = info.body.position;
        if (info.role === "gem") {
          score += POINTS_GEM;
          sfx.gem();
          popFeedback(p.x, p.y, `おたから!+${POINTS_GEM}`, "text-info");
        } else {
          score += POINTS_BLOCK;
          sfx.topple(toppleRun++);
          if (toppleRunTimer) {
            clearTimeout(toppleRunTimer);
            timers.delete(toppleRunTimer);
          }
          toppleRunTimer = schedule(() => {
            toppleRun = 0;
            toppleRunTimer = null;
          }, 700);
          popFeedback(p.x, p.y, `+${POINTS_BLOCK}`, "text-success");
        }
        renderHud();
      }
    }
  };

  const finishRound = () => {
    countFallen();
    const all = [...blocks.values()];
    const allDown = all.every((b) => b.counted || b.removed);
    if (allDown) {
      score += POINTS_ALL_CLEAR;
      banner(`ぜんかい! +${POINTS_ALL_CLEAR}`);
      sfx.fanfare();
    }
    const toppled = all.filter((b) => b.counted).length;
    if (!allDown && toppled >= 2) banner(`${toppled}こ くずした!`);
    round++;
    renderHud();
    schedule(() => {
      clearCastle();
      resolvedAnswer = false;
      if (round >= ROUNDS_TO_CLEAR) renderEnd(true);
      else ask();
    }, allDown || toppled >= 2 ? 900 : 250);
  };

  // ---- feedback ----

  const popFeedback = (x: number, y: number, text: string, cls: string) => {
    const f = document.createElement("div");
    f.textContent = text;
    f.className =
      `cb-feedback absolute font-black text-2xl whitespace-nowrap ${cls}`;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    el("fx").appendChild(f);
    schedule(() => f.remove(), 850);
  };

  const banner = (text: string) => {
    const b = document.createElement("div");
    b.textContent = text;
    b.className =
      "cb-banner absolute left-1/2 top-1/3 font-black text-4xl text-warning whitespace-nowrap drop-shadow-lg";
    el("fx").appendChild(b);
    schedule(() => b.remove(), 1250);
  };

  const shakeHearts = () => {
    const h = el("hearts");
    h.classList.remove("cb-shake");
    void h.offsetWidth;
    h.classList.add("cb-shake");
  };

  const renderHud = () => {
    el("hearts").textContent = "❤️".repeat(Math.max(0, hearts)) +
      "🖤".repeat(MAX_HEARTS - Math.max(0, hearts));
    el("round").textContent = `${
      Math.min(round + 1, ROUNDS_TO_CLEAR)
    } / ${ROUNDS_TO_CLEAR}`;
    el("score").textContent = `スコア ${score}`;
    const s = el("streak");
    if (streak >= 2) {
      s.textContent = `🔥×${streak}`;
      s.classList.remove("cb-streak-bounce");
      void s.offsetWidth;
      s.classList.add("cb-streak-bounce");
    } else {
      s.textContent = "";
    }
  };

  const spawnParticle = (
    x: number,
    y: number,
    angle: number,
    color: string,
  ) => {
    const sp = 2 + Math.random() * 5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * sp + (Math.random() - 0.5) * 2,
      vy: Math.sin(angle) * sp - Math.random() * 2,
      life: 0.5 + Math.random() * 0.35,
      max: 0.85,
      size: 2 + Math.random() * 4,
      color,
    });
  };

  // ---- rendering ----

  const drawScene = (dt: number) => {
    const c = ctx2d;
    c.clearRect(0, 0, W, H);
    c.save();
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const m = shakeT * 14;
      c.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    // sky, ground, table
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#bfe3ff");
    sky.addColorStop(1, "#eef8ff");
    c.fillStyle = sky;
    c.fillRect(-20, -20, W + 40, H + 40);
    c.fillStyle = "#ffe9a8";
    c.beginPath();
    c.arc(W - 60, 70, 26, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8bc34a";
    c.fillRect(-20, groundTop, W + 40, GROUND_H + 20);
    c.fillStyle = "#795548";
    c.fillRect(platLeft, platTop, platRight - platLeft, PLAT_H);
    c.fillRect(platLeft + 10, platTop, 10, PLAT_RAISE);
    c.fillRect(platRight - 20, platTop, 10, PLAT_RAISE);

    // castle blocks
    for (const info of blocks.values()) {
      if (info.removed) continue;
      const b = info.body;
      c.save();
      c.translate(b.position.x, b.position.y);
      c.rotate(b.angle);
      if (info.role === "gem") {
        c.font = "24px system-ui, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("💎", 0, 2);
      } else {
        const iron = info.role === "answer" && info.revealed;
        c.fillStyle = iron ? "#9aa2ad" : "#e6b877";
        c.strokeStyle = iron ? "#6b7280" : "#a97d3f";
        c.lineWidth = 2;
        const w = info.w;
        const h = info.h;
        c.beginPath();
        c.roundRect(-w / 2, -h / 2, w, h, 5);
        c.fill();
        c.stroke();
        if (info.role === "answer") {
          if (!iron) {
            c.fillStyle = "#fff7e0";
            c.beginPath();
            c.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 3);
            c.fill();
          }
          const label = info.label ?? "";
          let size = 17;
          c.font = `bold ${size}px system-ui, sans-serif`;
          while (size > 9 && c.measureText(label).width > w - 10) {
            size--;
            c.font = `bold ${size}px system-ui, sans-serif`;
          }
          c.fillStyle = iron ? "#3f4753" : "#4a3520";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(label, 0, 1);
        } else {
          c.strokeStyle = "#c49a5e";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(-info.w / 2 + 6, 0);
          c.lineTo(info.w / 2 - 6, 0);
          c.stroke();
        }
      }
      c.restore();
    }

    // ball
    if (ball) {
      c.save();
      c.translate(ball.position.x, ball.position.y);
      c.rotate(ball.angle);
      c.fillStyle = ballTier.fill;
      c.beginPath();
      c.arc(0, 0, ballTier.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(255,255,255,.35)";
      c.beginPath();
      c.arc(
        -ballTier.r * 0.3,
        -ballTier.r * 0.3,
        ballTier.r * 0.35,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.restore();
    }

    // trajectory preview while aiming
    if (dragging) {
      const v = pullToVelocity(pull);
      if (v) {
        const m = muzzle(Math.atan2(v.y, v.x));
        let px = m.x;
        let py = m.y;
        const vx = v.x;
        let vy = v.y;
        c.fillStyle = "rgba(60,60,80,.45)";
        for (let i = 0; i < 30; i++) {
          px += vx;
          py += vy;
          vy += G_STEP;
          if (i % 3 === 0) {
            c.beginPath();
            c.arc(px, py, 3.5 - i * 0.06, 0, Math.PI * 2);
            c.fill();
          }
          if (py > groundTop) break;
        }
      }
    }

    // cannon (drawn last so it overlaps debris)
    recoil = Math.max(0, recoil - dt * 4);
    c.save();
    c.translate(cannonPivot.x, cannonPivot.y);
    c.save();
    c.rotate(barrelAngle);
    c.translate(-recoil * 8, 0);
    c.fillStyle = "#37474f";
    c.beginPath();
    c.roundRect(-12, -11, 54, 22, 8);
    c.fill();
    c.fillStyle = "#263238";
    c.fillRect(46, -8, 6, 16);
    c.restore();
    c.fillStyle = "#546e7a";
    c.beginPath();
    c.arc(0, 8, 15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8d6e63";
    c.beginPath();
    c.arc(0, 14, 9, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      c.globalAlpha = 1;
    }

    c.restore();
  };

  // ---- main loop ----

  const tick = (t: number) => {
    if (disposed) return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;

    physAcc += dt * 1000;
    let steps = 0;
    while (physAcc >= PHYS_STEP && steps < 3) {
      Engine.update(engine, PHYS_STEP);
      physAcc -= PHYS_STEP;
      steps++;
    }
    if (steps === 3) physAcc = 0;

    if (
      ball &&
      (ball.position.x < -80 || ball.position.x > W + 80 ||
        ball.position.y > H + 120)
    ) {
      removeBall();
    }
    countFallen();
    drawScene(dt);
    rafId = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    lastT = 0;
    physAcc = 0;
    rafId = requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };

  // ---- lifecycle ----

  const renderEnd = (cleared: boolean) => {
    ending = true;
    stopLoop();
    if (cleared) sfx.fanfare();
    else sfx.wrongEnd();
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-base-100">
        <div class="text-7xl">${cleared ? "🏰" : "💤"}</div>
        <h2 class="text-4xl font-bold">${cleared ? "クリア！" : "おしまい"}</h2>
        <p class="text-2xl">スコア ${score}</p>
      </div>
    `;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-lg";
    again.textContent = "もう一度";
    again.addEventListener("click", restart);
    root.lastElementChild!.appendChild(again);
    onComplete?.({ score, cleared });
  };

  const bindField = () => {
    fieldEl = el<HTMLDivElement>("field");
    canvas = el<HTMLCanvasElement>("canvas");
    fieldEl.addEventListener("pointerdown", onPointerDown);
    fieldEl.addEventListener("pointermove", onPointerMove);
    fieldEl.addEventListener("pointerup", onPointerUp);
    fieldEl.addEventListener("pointercancel", onPointerUp);
    // Test hooks: expose answer-block positions and a deterministic shot that
    // lands on a given point (same discrete ballistics as the preview).
    Object.assign(canvas, {
      __answers: () =>
        [...blocks.values()]
          .filter((b) => b.role === "answer" && !b.removed)
          .map((b) => ({
            x: b.body.position.x,
            y: b.body.position.y,
            label: b.label,
            correct: !!b.correct,
          })),
      __ballPos: () =>
        ball
          ? {
            x: ball.position.x,
            y: ball.position.y,
            vx: ball.velocity.x,
            vy: ball.velocity.y,
          }
          : null,
      // Aim-assisted test shot: spawns the ball right on the target so the
      // collision resolution (explode / clang / scoring) can be exercised
      // without ballistic marksmanship. Player shots go through fire().
      __shootAt: (tx: number, ty: number) => {
        if (ball || resolvedAnswer || ending) return;
        ballTier = BALL_TIERS[tierForStreak(streak)];
        ball = Bodies.circle(tx, ty - 4, ballTier.r, {
          density: ballTier.density,
          restitution: 0.35,
          friction: 0.05,
          label: "ball",
        });
        ballAnswerTouched = false;
        Body.setVelocity(ball, { x: 0, y: 8 });
        Composite.add(engine.world, ball);
        ballTimer = schedule(() => {
          ballTimer = null;
          removeBall();
        }, BALL_TTL_MS);
      },
    });
  };

  const startGame = () => {
    root.innerHTML = SKELETON;
    ending = false;
    resolvedAnswer = false;
    dragging = false;
    particles.length = 0;
    bindField();
    setupWorld();
    renderHud();
    ask();
    startLoop();
  };

  const restart = () => {
    session = createSession(quiz, (Math.random() * 0x7fffffff) | 0);
    round = 0;
    hearts = MAX_HEARTS;
    streak = 0;
    score = 0;
    blocks = new Map();
    ball = null;
    startGame();
  };

  Events.on(engine, "collisionStart", onCollision);
  startGame();

  return () => {
    disposed = true;
    stopLoop();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    Events.off(engine, "collisionStart", onCollision);
    Engine.clear(engine);
    sfx.dispose();
    root.remove();
    if (!prevPosition) container.style.position = prevPosition;
  };
};

const cannonBlast: GameModule = { title: "たいほうドカン", mount };
export default cannonBlast;

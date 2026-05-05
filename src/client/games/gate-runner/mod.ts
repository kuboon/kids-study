/**
 * Gate Runner — pick the correct answer between two gates while the
 * crowd runs forward. Subject-agnostic: consumes any QuizGenerator from
 * the `quiz/` workspace.
 */

import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager.js";
import { Sprite } from "@babylonjs/core/Sprites/sprite.js";

import type { GameModule, GameMount } from "../types.ts";
import type { Quiz } from "../../../../quiz/types.ts";

const STREAK_TO_CLEAR = 10;
const INITIAL_CROWD = 8;
const CROWD_PER_CORRECT = 2;
// Wrong answer halves the crowd (rounded down). Halving stays dramatic
// even at small counts: 8→4→2→1.
// Approach: goal arch spawns far ahead → glides toward player → tape breaks → cleared.
const FINALE_APPROACH_SPEED = 5;
const FINALE_BREAK_DURATION = 1.4;
const FINALE_BREAK_Z = 1.4;
const GOAL_ARCH_HEIGHT = 3.4;
const GOAL_TAPE_Y = 1.05;
const LANE_X = 1.6;
const GATE_SPAWN_Z = 30;
// Forward speed grows steadily while playing and snaps slower on a wrong
// answer. Min keeps the minimum reasonable; max keeps it playable.
const SCROLL_SPEED_INITIAL = 7;
const SCROLL_SPEED_MIN = 4;
const SCROLL_SPEED_MAX = 16;
const SCROLL_SPEED_ACCEL = 0.35; // units/sec, applied per second
const SCROLL_SPEED_PENALTY = 0.5; // multiplier on wrong answer
const BOOST_MULTIPLIER = 1.7; // ArrowUp / swipe-up speed boost
const BOOST_SWIPE_DURATION = 0.7; // seconds a single swipe-up lasts
const SWIPE_UP_PIXELS = 40; // distance threshold to register a swipe-up
const ROAD_WIDTH = 5;
const ROAD_LENGTH = 200;
// Visible cap is comfortable headroom over 8 + STREAK_TO_CLEAR * 2 = 28.
const CROWD_VISIBLE_MAX = 32;

type Lane = -1 | 1;

type GateSide = { value: string; correct: boolean; mesh: Mesh };

type Gate = {
  z: number;
  left: GateSide;
  right: GateSide;
  resolved: boolean;
};

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");

export const mount: GameMount = (container, { quiz, onComplete }) => {
  // ---- DOM scaffolding -----------------------------------------------------
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none;";
  canvas.tabIndex = 0;
  container.appendChild(canvas);

  const overlay = document.createElement("div");
  overlay.className = "absolute inset-0 pointer-events-none select-none";
  overlay.innerHTML = `
    <div class="absolute top-3 left-1/2 -translate-x-1/2 px-5 py-2 rounded-box bg-base-200/90 shadow-md text-2xl font-bold text-center">
      <span data-q></span>
    </div>
    <div class="absolute top-3 right-3 flex gap-2 pointer-events-auto">
      <button data-restart class="btn btn-circle btn-sm" aria-label="やり直し">↻</button>
      <a href="/" class="btn btn-circle btn-sm" aria-label="ホーム">🏠</a>
    </div>
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-1 rounded-full bg-primary text-primary-content text-2xl font-bold shadow-md">
      <span data-crowd>0</span>
    </div>
    <div data-end class="hidden absolute inset-0 flex-col items-center justify-center bg-base-100/90 pointer-events-auto">
      <h2 class="text-3xl font-bold mb-4" data-end-title></h2>
      <button data-restart-end class="btn btn-primary btn-lg">もう一度</button>
    </div>
  `;
  container.appendChild(overlay);

  const $q = overlay.querySelector("[data-q]") as HTMLElement;
  const $crowd = overlay.querySelector("[data-crowd]") as HTMLElement;
  const $end = overlay.querySelector("[data-end]") as HTMLElement;
  const $endTitle = overlay.querySelector("[data-end-title]") as HTMLElement;
  const $restart = overlay.querySelector("[data-restart]") as HTMLButtonElement;
  const $restartEnd = overlay.querySelector(
    "[data-restart-end]",
  ) as HTMLButtonElement;

  // ---- Babylon scene -------------------------------------------------------
  const engine = new Engine(canvas, true, {
    stencil: false,
    antialias: true,
  });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.78, 0.95, 1); // sky

  const camera = new UniversalCamera("cam", new Vector3(0, 4.2, -7), scene);
  camera.setTarget(new Vector3(0, 1.6, 4));
  camera.inputs.clear();

  const light = new HemisphericLight("hemi", new Vector3(0, 1, 0.3), scene);
  light.intensity = 1.05;

  // Road: a long ground with a striped dynamic texture. We scroll the
  // texture's vOffset to fake forward motion (cheaper than moving meshes).
  const road = MeshBuilder.CreateGround(
    "road",
    { width: ROAD_WIDTH, height: ROAD_LENGTH },
    scene,
  );
  road.position.z = ROAD_LENGTH / 2 - 10; // extend mostly forward
  const roadMat = new StandardMaterial("roadMat", scene);
  const stripeTex = new DynamicTexture(
    "stripe",
    { width: 64, height: 1024 },
    scene,
    false,
  );
  const stripeCtx = stripeTex
    .getContext() as unknown as CanvasRenderingContext2D;
  const STRIPES = 32;
  const stripeH = 1024 / STRIPES;
  for (let i = 0; i < STRIPES; i++) {
    stripeCtx.fillStyle = i % 2 === 0 ? "#ffffff" : "#dde6ee";
    stripeCtx.fillRect(0, i * stripeH, 64, stripeH);
  }
  stripeTex.update(false);
  stripeTex.uScale = 1;
  stripeTex.vScale = ROAD_LENGTH / 6;
  roadMat.diffuseTexture = stripeTex;
  roadMat.specularColor = new Color3(0, 0, 0);
  road.material = roadMat;

  // Crowd — Piyomi sprites (4-frame back-view walk cycle, 256×256 per frame).
  // SpriteManager handles GPU instancing of all chicks from one atlas.
  const piyomiManager = new SpriteManager(
    "piyomi",
    "./characters/piyomi.png",
    CROWD_VISIBLE_MAX,
    { width: 256, height: 256 },
    scene,
  );
  piyomiManager.isPickable = false;
  const PIYOMI_SIZE = 1.4; // world units (sprite is square; tune to taste)
  const PIYOMI_Y = 0.55; // sprite center; chick feet land near y≈0
  const WALK_FPS = 7;

  const crowdSprites: Sprite[] = [];
  // Stagger walk-cycle phase per sprite so the herd doesn't march in lockstep.
  const walkPhase: number[] = [];
  for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
    const s = new Sprite(`p${i}`, piyomiManager);
    s.size = PIYOMI_SIZE;
    s.isVisible = false;
    crowdSprites.push(s);
    walkPhase.push(Math.random() * 4);
  }
  let walkClock = 0;

  // Goal arch + breakable tape — used only in the finale.
  const goalRoot = new TransformNode("goalRoot", scene);
  goalRoot.setEnabled(false);

  const postMat = new StandardMaterial("postMat", scene);
  postMat.diffuseColor = new Color3(1.0, 0.85, 0.22);
  postMat.specularColor = new Color3(0.05, 0.05, 0.05);

  const postL = MeshBuilder.CreateCylinder(
    "postL",
    { diameter: 0.3, height: GOAL_ARCH_HEIGHT, tessellation: 14 },
    scene,
  );
  postL.material = postMat;
  postL.position.set(-2.6, GOAL_ARCH_HEIGHT / 2, 0);
  postL.parent = goalRoot;

  const postR = MeshBuilder.CreateCylinder(
    "postR",
    { diameter: 0.3, height: GOAL_ARCH_HEIGHT, tessellation: 14 },
    scene,
  );
  postR.material = postMat;
  postR.position.set(2.6, GOAL_ARCH_HEIGHT / 2, 0);
  postR.parent = goalRoot;

  const bannerMat = new StandardMaterial("bannerMat", scene);
  const bannerTex = new DynamicTexture(
    "bannerTex",
    { width: 1024, height: 256 },
    scene,
    false,
  );
  const bctx = bannerTex.getContext() as unknown as CanvasRenderingContext2D;
  bctx.fillStyle = "#e23a4f";
  bctx.fillRect(0, 0, 1024, 256);
  bctx.strokeStyle = "rgba(255,255,255,0.18)";
  bctx.lineWidth = 14;
  for (let x = -200; x < 1300; x += 60) {
    bctx.beginPath();
    bctx.moveTo(x, -10);
    bctx.lineTo(x + 300, 270);
    bctx.stroke();
  }
  bctx.fillStyle = "#ffffff";
  bctx.font = "bold 180px sans-serif";
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText("ゴール", 512, 138);
  bannerTex.update(false);
  bannerTex.vScale = -1;
  bannerTex.vOffset = 1;
  bannerMat.diffuseTexture = bannerTex;
  bannerMat.emissiveColor = new Color3(0.4, 0.1, 0.15);
  bannerMat.specularColor = new Color3(0, 0, 0);

  const banner = MeshBuilder.CreateBox(
    "banner",
    { width: 5.4, height: 0.8, depth: 0.18 },
    scene,
  );
  banner.material = bannerMat;
  banner.position.set(0, GOAL_ARCH_HEIGHT - 0.45, 0);
  banner.parent = goalRoot;

  // Tape: two halves meeting at center. On break they slide outward and fade.
  const tapeMat = new StandardMaterial("tapeMat", scene);
  tapeMat.diffuseColor = new Color3(0.95, 0.3, 0.42);
  tapeMat.emissiveColor = new Color3(0.45, 0.1, 0.15);
  tapeMat.specularColor = new Color3(0, 0, 0);

  const tapeL = MeshBuilder.CreateBox(
    "tapeL",
    { width: 2.6, height: 0.1, depth: 0.05 },
    scene,
  );
  tapeL.material = tapeMat;
  tapeL.position.set(-1.3, GOAL_TAPE_Y, 0);
  tapeL.parent = goalRoot;

  const tapeR = MeshBuilder.CreateBox(
    "tapeR",
    { width: 2.6, height: 0.1, depth: 0.05 },
    scene,
  );
  tapeR.material = tapeMat;
  tapeR.position.set(1.3, GOAL_TAPE_Y, 0);
  tapeR.parent = goalRoot;

  // Chicken (鳥コス) standing past the arch, welcoming the chicks. Sprite
  // is billboarded so we just match goalRoot's z each frame.
  const chickenManager = new SpriteManager(
    "chicken",
    "./characters/chicken_welcome.png",
    1,
    { width: 256, height: 256 },
    scene,
  );
  chickenManager.isPickable = false;
  const chickenSprite = new Sprite("chicken", chickenManager);
  chickenSprite.size = 2.0;
  chickenSprite.isVisible = false;
  let welcomeClock = 0;

  // Gate prototype reused per round (recreated each round to swap text).
  const makeGate = (
    text: string,
    correct: boolean,
    laneX: number,
    z: number,
  ): { value: string; correct: boolean; mesh: Mesh } => {
    const mesh = MeshBuilder.CreateBox(
      `gate_${laneX}_${Date.now()}`,
      { width: LANE_X * 1.5, height: 2.2, depth: 0.18 },
      scene,
    );
    mesh.position.set(laneX, 1.1, z);
    const mat = new StandardMaterial(`gMat_${laneX}_${Date.now()}`, scene);
    const tex = new DynamicTexture(
      "gTex",
      { width: 512, height: 256 },
      scene,
      false,
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = correct ? "#7be0ec" : "#7be0ec";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "rgba(40, 60, 120, 0.15)";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#0e1a3a";
    ctx.font = "bold 130px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 130);
    tex.update(false);
    // Box's -Z face samples V inverted relative to canvas Y; flip so the
    // text reads upright when viewed from the camera.
    tex.vScale = -1;
    tex.vOffset = 1;
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.4, 0.7, 0.78);
    mat.specularColor = new Color3(0, 0, 0);
    mesh.material = mat;
    return { value: text, correct, mesh };
  };

  // ---- Game state ----------------------------------------------------------
  type FxKind = "none" | "correct" | "wrong";
  type Phase = "playing" | "finale-approach" | "finale-break";
  type Goal = {
    z: number;
    breakT: number;
    broken: boolean;
  };
  type State = {
    score: number;
    streak: number;
    crowd: number;
    lane: Lane;
    targetX: number;
    crowdX: number;
    speed: number;
    keyBoosting: boolean;
    swipeBoostT: number;
    gate: Gate | null;
    currentQuiz: Quiz | null;
    seed: number;
    ended: boolean;
    phase: Phase;
    goal: Goal | null;
    fx: { kind: FxKind; t: number; duration: number };
  };

  const state: State = {
    score: 0,
    streak: 0,
    crowd: INITIAL_CROWD,
    lane: -1,
    targetX: -LANE_X,
    crowdX: -LANE_X,
    speed: SCROLL_SPEED_INITIAL,
    keyBoosting: false,
    swipeBoostT: 0,
    gate: null,
    currentQuiz: null,
    seed: 1,
    ended: false,
    phase: "playing",
    goal: null,
    fx: { kind: "none", t: 0, duration: 0 },
  };

  // Per-instance scatter velocities for the "wrong" jitter — decays each frame.
  const scatter: { x: number; y: number; z: number }[] = Array.from(
    { length: CROWD_VISIBLE_MAX },
    () => ({ x: 0, y: 0, z: 0 }),
  );

  const camHome = camera.position.clone();

  const setLane = (lane: Lane) => {
    state.lane = lane;
    state.targetX = lane * LANE_X;
  };

  const renderHud = () => {
    if (state.currentQuiz && state.phase === "playing") {
      $q.innerHTML = `${state.currentQuiz.q} = ?`;
    }
    $crowd.textContent = String(Math.max(0, state.crowd));
  };

  const layoutCrowd = (dt: number) => {
    const visible = Math.min(state.crowd, CROWD_VISIBLE_MAX);

    // Decay scatter offsets back to 0
    const decay = Math.max(0, 1 - dt * 5);
    for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
      scatter[i].x *= decay;
      scatter[i].y *= decay;
      scatter[i].z *= decay;
    }

    // Vertical bounce on a "correct" pulse
    let bounce = 0;
    if (state.fx.kind === "correct") {
      const k = 1 - state.fx.t / state.fx.duration;
      bounce = Math.sin(state.fx.t * 18) * 0.35 * Math.max(0, k);
    }

    // Advance shared walk clock (frames per second).
    walkClock += dt * WALK_FPS;

    for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
      const s = crowdSprites[i];
      if (i >= visible) {
        s.isVisible = false;
        continue;
      }
      s.isVisible = true;
      const ang = (i / Math.max(1, visible)) * Math.PI * 2;
      const r = 0.4 + Math.sqrt(i / visible) * 0.9;
      s.position.set(
        state.crowdX + Math.cos(ang) * r + scatter[i].x,
        PIYOMI_Y + bounce + Math.abs(scatter[i].y),
        Math.sin(ang) * r * 0.6 + scatter[i].z,
      );
      // Per-sprite phase keeps the herd from animating in sync.
      s.cellIndex = Math.floor(walkClock + walkPhase[i]) % 4;
    }
  };

  const disposeGateSide = (s: GateSide) => {
    const mat = s.mesh.material as StandardMaterial | null;
    const tex = mat?.diffuseTexture;
    s.mesh.dispose();
    mat?.dispose();
    tex?.dispose();
  };
  const disposeGate = (g: Gate | null) => {
    if (!g) return;
    disposeGateSide(g.left);
    disposeGateSide(g.right);
  };

  const spawnGate = () => {
    disposeGate(state.gate);
    const q = quiz.fn(state.seed++);
    state.currentQuiz = q;
    const correctText = stripHtml(q.a);
    let wrongText = stripHtml(q.wrong());
    // Avoid degenerate identical pair
    let safety = 8;
    while (wrongText === correctText && safety-- > 0) {
      wrongText = stripHtml(q.wrong());
    }
    const correctOnLeft = Math.random() < 0.5;
    const left = makeGate(
      correctOnLeft ? correctText : wrongText,
      correctOnLeft,
      -LANE_X,
      GATE_SPAWN_Z,
    );
    const right = makeGate(
      correctOnLeft ? wrongText : correctText,
      !correctOnLeft,
      LANE_X,
      GATE_SPAWN_Z,
    );
    state.gate = { z: GATE_SPAWN_Z, left, right, resolved: false };
    renderHud();
  };

  const endGame = (cleared: boolean) => {
    if (state.ended) return;
    state.ended = true;
    $endTitle.textContent = cleared ? "クリア！" : "ざんねん…";
    $end.classList.remove("hidden");
    $end.classList.add("flex");
    onComplete?.({ score: state.score, cleared });
  };

  const triggerFx = (kind: "correct" | "wrong", deltaText: string) => {
    state.fx.kind = kind;
    state.fx.t = 0;
    state.fx.duration = kind === "correct" ? 0.7 : 0.6;

    if (kind === "wrong") {
      // Kick instances outward briefly
      for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
        scatter[i].x = (Math.random() - 0.5) * 1.6;
        scatter[i].y = Math.random() * 0.8;
        scatter[i].z = (Math.random() - 0.5) * 1.0;
      }
    }

    // Floating delta number above the crowd HUD
    const float = document.createElement("div");
    float.textContent = deltaText;
    const fg = kind === "correct" ? "#16a34a" : "#dc2626";
    float.style.cssText =
      `position:absolute;left:50%;bottom:5rem;transform:translate(-50%,0);` +
      `color:${fg};font-size:3rem;font-weight:900;` +
      `text-shadow:0 3px 10px rgba(0,0,0,0.35);pointer-events:none;z-index:10;` +
      `font-feature-settings:"tnum";`;
    overlay.appendChild(float);
    float.animate([
      { opacity: 0, transform: "translate(-50%, 0.5rem) scale(0.4)" },
      {
        opacity: 1,
        transform: "translate(-50%, -1.5rem) scale(1.5)",
        offset: 0.3,
      },
      { opacity: 0, transform: "translate(-50%, -6rem) scale(1)" },
    ], { duration: 900, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }).finished
      .then(() => float.remove(), () => float.remove());

    // HUD pulse on the crowd badge and score chip
    const hudPulse = (el: HTMLElement, color: string) => {
      el.animate([
        { transform: "scale(1)", color: "" },
        { transform: "scale(1.55)", color, offset: 0.35 },
        { transform: "scale(1)", color: "" },
      ], { duration: 500, easing: "ease-out" });
    };
    hudPulse($crowd, fg);
  };

  const spawnConfetti = () => {
    const colors = [
      "#f87171",
      "#fbbf24",
      "#34d399",
      "#60a5fa",
      "#a78bfa",
      "#fb7185",
      "#facc15",
    ];
    const N = 70;
    for (let i = 0; i < N; i++) {
      const piece = document.createElement("div");
      const color = colors[i % colors.length];
      const w = 6 + Math.random() * 8;
      const h = w * (0.3 + Math.random() * 0.4);
      piece.style.cssText =
        `position:absolute;left:50%;top:30%;width:${w}px;height:${h}px;` +
        `background:${color};border-radius:1px;pointer-events:none;z-index:5;`;
      overlay.appendChild(piece);
      const dx = (Math.random() - 0.5) * 700;
      const dy = 200 + Math.random() * 400;
      const rot = (Math.random() - 0.5) * 900;
      const dur = 1400 + Math.random() * 900;
      piece.animate([
        { transform: "translate(-50%, 0) rotate(0deg)", opacity: 1 },
        {
          transform:
            `translate(calc(-50% + ${dx}px), ${dy}px) rotate(${rot}deg)`,
          opacity: 0,
        },
      ], { duration: dur, easing: "cubic-bezier(0.2, 0.6, 0.4, 1)" }).finished
        .then(() => piece.remove(), () => piece.remove());
    }
  };

  const startFinale = () => {
    $q.innerHTML = "ラスト！";
    disposeGate(state.gate);
    state.gate = null;
    state.phase = "finale-approach";
    state.goal = { z: 22, breakT: 0, broken: false };
    // Reset goal visuals from any prior run.
    tapeL.position.set(-1.3, GOAL_TAPE_Y, 0);
    tapeR.position.set(1.3, GOAL_TAPE_Y, 0);
    tapeL.rotation.z = 0;
    tapeR.rotation.z = 0;
    tapeMat.alpha = 1;
    goalRoot.position.z = state.goal.z;
    goalRoot.setEnabled(true);
    chickenSprite.isVisible = true;
    welcomeClock = 0;
  };

  const resolveGate = () => {
    if (!state.gate || state.gate.resolved) return;
    state.gate.resolved = true;
    const picked = state.lane === -1 ? state.gate.left : state.gate.right;
    if (picked.correct) {
      state.score++;
      state.streak++;
      state.crowd = Math.min(999, state.crowd + CROWD_PER_CORRECT);
      triggerFx("correct", `+${CROWD_PER_CORRECT}`);
    } else {
      state.streak = 0;
      state.speed = Math.max(
        SCROLL_SPEED_MIN,
        state.speed * SCROLL_SPEED_PENALTY,
      );
      const before = state.crowd;
      state.crowd = Math.floor(state.crowd / 2);
      triggerFx("wrong", `-${before - state.crowd}`);
    }
    renderHud();

    if (state.crowd <= 0) {
      endGame(false);
      return;
    }
    if (state.streak >= STREAK_TO_CLEAR) {
      startFinale();
      return;
    }
    spawnGate();
  };

  const reset = () => {
    state.score = 0;
    state.streak = 0;
    state.crowd = INITIAL_CROWD;
    state.seed = (Math.random() * 0x7fffffff) | 0;
    state.lane = -1;
    state.targetX = -LANE_X;
    state.crowdX = -LANE_X;
    state.speed = SCROLL_SPEED_INITIAL;
    state.keyBoosting = false;
    state.swipeBoostT = 0;
    state.ended = false;
    state.phase = "playing";
    state.goal = null;
    state.fx.kind = "none";
    state.fx.t = 0;
    for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
      scatter[i].x = scatter[i].y = scatter[i].z = 0;
    }
    camera.position.copyFrom(camHome);
    goalRoot.setEnabled(false);
    tapeMat.alpha = 1;
    chickenSprite.isVisible = false;
    walkClock = 0;
    welcomeClock = 0;
    $end.classList.add("hidden");
    $end.classList.remove("flex");
    spawnGate();
  };

  // ---- Input ---------------------------------------------------------------
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "a") setLane(-1);
    else if (e.key === "ArrowRight" || e.key === "d") setLane(1);
    else if (e.key === "ArrowUp" || e.key === "w") state.keyBoosting = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "w") state.keyBoosting = false;
  };

  // Pointer: pointerdown switches lane (snappy). While the gesture is held,
  // an upward drag past the threshold triggers a one-shot speed boost.
  let pointerStart: { x: number; y: number } | null = null;
  let boostedThisGesture = false;
  const onPointerDown = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setLane(x < rect.width / 2 ? -1 : 1);
    pointerStart = { x: e.clientX, y: e.clientY };
    boostedThisGesture = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointerStart || boostedThisGesture) return;
    if (e.clientY - pointerStart.y < -SWIPE_UP_PIXELS) {
      state.swipeBoostT = BOOST_SWIPE_DURATION;
      boostedThisGesture = true;
    }
  };
  const onPointerEnd = () => {
    pointerStart = null;
    boostedThisGesture = false;
  };

  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  $restart.addEventListener("click", reset);
  $restartEnd.addEventListener("click", reset);

  // ---- Loop ----------------------------------------------------------------
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;

    if (!state.ended) {
      // Decay swipe boost
      if (state.swipeBoostT > 0) state.swipeBoostT -= dt;
      const boosting = state.keyBoosting || state.swipeBoostT > 0;

      if (state.phase === "playing" && state.gate) {
        // Gradual speed-up while playing.
        state.speed = Math.min(
          SCROLL_SPEED_MAX,
          state.speed + SCROLL_SPEED_ACCEL * dt,
        );
        const eff = state.speed * (boosting ? BOOST_MULTIPLIER : 1);
        const advance = eff * dt;
        state.gate.z -= advance;
        stripeTex.vOffset = (stripeTex.vOffset - dt * eff / 6) % 1;
        state.gate.left.mesh.position.z = state.gate.z;
        state.gate.right.mesh.position.z = state.gate.z;
        if (state.gate.z <= 0) resolveGate();
      } else if (state.phase === "finale-approach" && state.goal) {
        // Keep the road scrolling so the world feels alive as the goal
        // arch glides in from the distance.
        stripeTex.vOffset = (stripeTex.vOffset - dt * state.speed / 6) % 1;
        state.goal.z -= FINALE_APPROACH_SPEED * dt;
        goalRoot.position.z = state.goal.z;
        if (state.goal.z <= FINALE_BREAK_Z) {
          state.goal.z = FINALE_BREAK_Z;
          goalRoot.position.z = FINALE_BREAK_Z;
          state.phase = "finale-break";
          state.goal.breakT = 0;
          $q.innerHTML = "ゴール！";
          spawnConfetti();
          // Celebrate with the same green pulse used for correct answers.
          state.fx.kind = "correct";
          state.fx.t = 0;
          state.fx.duration = 0.8;
        }
      } else if (state.phase === "finale-break" && state.goal) {
        state.goal.breakT += dt;
        const k = Math.min(1, state.goal.breakT / FINALE_BREAK_DURATION);
        // Tape halves slide outward and rotate as they're torn apart.
        const slide = k * 1.6;
        tapeL.position.x = -1.3 - slide;
        tapeR.position.x = 1.3 + slide;
        tapeL.rotation.z = -k * 0.6;
        tapeR.rotation.z = k * 0.6;
        tapeMat.alpha = 1 - k;
        // Brief forward zoom for emphasis (no shake — it's a happy moment).
        const zoom = Math.sin(Math.PI * k) * 0.6;
        camera.position.z = camHome.z + zoom;
        if (state.goal.breakT >= FINALE_BREAK_DURATION) {
          camera.position.copyFrom(camHome);
          $q.innerHTML = "🎉";
          endGame(true);
        }
      }
    }

    // Advance fx clock — sprites are not tinted, FX comes from bounce/scatter
    // (correct), camera shake (wrong), and floating delta numbers (both).
    if (state.fx.kind !== "none") {
      state.fx.t += dt;
      const k = Math.max(0, 1 - state.fx.t / state.fx.duration);
      if (state.fx.kind === "wrong") {
        const intensity = k * 0.18;
        camera.position.x = camHome.x + (Math.random() - 0.5) * intensity * 2;
        camera.position.y = camHome.y + (Math.random() - 0.5) * intensity * 2;
      }
      if (state.fx.t >= state.fx.duration) {
        state.fx.kind = "none";
        state.fx.t = 0;
        camera.position.copyFrom(camHome);
      }
    }

    // Chicken welcome bounce — visible for the whole finale, slower cycle.
    if (chickenSprite.isVisible) {
      welcomeClock += dt * 5;
      chickenSprite.cellIndex = Math.floor(welcomeClock) % 4;
      // Track the goal arch as it slides in, sit just past the tape.
      chickenSprite.position.set(
        0,
        chickenSprite.size / 2,
        goalRoot.position.z + 0.6,
      );
    }

    // During finale lock the player crowd to center under the goal arch.
    if (state.phase !== "playing") state.targetX = 0;
    state.crowdX += (state.targetX - state.crowdX) * Math.min(1, dt * 8);
    layoutCrowd(dt);

    scene.render();
  });

  const onResize = () => engine.resize();
  globalThis.addEventListener("resize", onResize);

  // Kick off
  reset();

  // ---- Teardown ------------------------------------------------------------
  return () => {
    globalThis.removeEventListener("keydown", onKeyDown);
    globalThis.removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerEnd);
    canvas.removeEventListener("pointercancel", onPointerEnd);
    globalThis.removeEventListener("resize", onResize);
    engine.stopRenderLoop();
    disposeGate(state.gate);
    scene.dispose();
    engine.dispose();
    overlay.remove();
    canvas.remove();
    if (!prevPosition) container.style.position = "";
  };
};

const gateRunner: GameModule = {
  title: "ゲートランナー",
  mount,
};
export default gateRunner;

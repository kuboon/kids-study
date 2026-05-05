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
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";

import type { GameModule, GameMount } from "../types.ts";
import type { Quiz } from "../../../../quiz/types.ts";

const STAGES_TO_CLEAR = 5;
const INITIAL_CROWD = 30;
const LANE_X = 1.6;
const GATE_SPAWN_Z = 30;
const SCROLL_SPEED = 8;
const ROAD_WIDTH = 5;
const ROAD_LENGTH = 200;
const CROWD_VISIBLE_MAX = 80;

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
    <div class="absolute top-3 left-3 px-3 py-1 rounded-box bg-base-200/90 text-sm font-semibold">
      Score: <span data-score>0</span> / ${STAGES_TO_CLEAR}
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
  const $score = overlay.querySelector("[data-score]") as HTMLElement;
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

  // Crowd — instanced capsules. We cap the visible count for perf but the
  // real number lives in `state.crowd`.
  const crowdProto = MeshBuilder.CreateCapsule(
    "crowd",
    { radius: 0.18, height: 0.6, tessellation: 8, subdivisions: 1 },
    scene,
  );
  crowdProto.isVisible = false;
  const CROWD_BASE_COLOR = new Color3(0.12, 0.45, 0.95);
  const crowdMat = new StandardMaterial("crowdMat", scene);
  crowdMat.diffuseColor = CROWD_BASE_COLOR;
  crowdMat.specularColor = new Color3(0.2, 0.2, 0.2);
  crowdProto.material = crowdMat;

  const crowdInstances: InstancedMesh[] = [];
  for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
    const inst = crowdProto.createInstance(`c${i}`);
    inst.isVisible = false;
    crowdInstances.push(inst);
  }

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
  type State = {
    score: number;
    crowd: number;
    lane: Lane;
    targetX: number;
    crowdX: number;
    gate: Gate | null;
    currentQuiz: Quiz | null;
    seed: number;
    ended: boolean;
    fx: { kind: FxKind; t: number; duration: number };
  };

  const state: State = {
    score: 0,
    crowd: INITIAL_CROWD,
    lane: -1,
    targetX: -LANE_X,
    crowdX: -LANE_X,
    gate: null,
    currentQuiz: null,
    seed: 1,
    ended: false,
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
    if (state.currentQuiz) $q.innerHTML = `${state.currentQuiz.q} = ?`;
    $score.textContent = String(state.score);
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

    for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
      const inst = crowdInstances[i];
      if (i >= visible) {
        inst.isVisible = false;
        continue;
      }
      inst.isVisible = true;
      const ang = (i / Math.max(1, visible)) * Math.PI * 2;
      const r = 0.4 + Math.sqrt(i / visible) * 0.9;
      inst.position.set(
        state.crowdX + Math.cos(ang) * r + scatter[i].x,
        0.3 + bounce + Math.abs(scatter[i].y),
        Math.sin(ang) * r * 0.6 + scatter[i].z,
      );
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
    $endTitle.textContent = cleared
      ? `クリア！スコア ${state.score}`
      : `ざんねん…スコア ${state.score}`;
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
    if (kind === "correct") hudPulse($score, fg);
  };

  const resolveGate = () => {
    if (!state.gate || state.gate.resolved) return;
    state.gate.resolved = true;
    const picked = state.lane === -1 ? state.gate.left : state.gate.right;
    if (picked.correct) {
      state.score++;
      state.crowd = Math.min(999, state.crowd + 5);
      triggerFx("correct", "+5");
    } else {
      const before = state.crowd;
      state.crowd = Math.floor(state.crowd / 2);
      triggerFx("wrong", `-${before - state.crowd}`);
    }
    renderHud();

    if (state.crowd <= 0) {
      endGame(false);
      return;
    }
    if (state.score >= STAGES_TO_CLEAR) {
      endGame(true);
      return;
    }
    spawnGate();
  };

  const reset = () => {
    state.score = 0;
    state.crowd = INITIAL_CROWD;
    state.seed = (Math.random() * 0x7fffffff) | 0;
    state.lane = -1;
    state.targetX = -LANE_X;
    state.crowdX = -LANE_X;
    state.ended = false;
    state.fx.kind = "none";
    state.fx.t = 0;
    for (let i = 0; i < CROWD_VISIBLE_MAX; i++) {
      scatter[i].x = scatter[i].y = scatter[i].z = 0;
    }
    crowdMat.emissiveColor.set(0, 0, 0);
    crowdMat.diffuseColor.copyFrom(CROWD_BASE_COLOR);
    camera.position.copyFrom(camHome);
    $end.classList.add("hidden");
    $end.classList.remove("flex");
    spawnGate();
  };

  // ---- Input ---------------------------------------------------------------
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "a") setLane(-1);
    else if (e.key === "ArrowRight" || e.key === "d") setLane(1);
  };
  const onPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setLane(x < rect.width / 2 ? -1 : 1);
  };
  globalThis.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointer);
  $restart.addEventListener("click", reset);
  $restartEnd.addEventListener("click", reset);

  // ---- Loop ----------------------------------------------------------------
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;

    if (!state.ended && state.gate) {
      const advance = SCROLL_SPEED * dt;
      state.gate.z -= advance;
      stripeTex.vOffset = (stripeTex.vOffset - dt * SCROLL_SPEED / 6) % 1;

      state.gate.left.mesh.position.z = state.gate.z;
      state.gate.right.mesh.position.z = state.gate.z;

      if (state.gate.z <= 0) resolveGate();
    }

    // Advance fx clock
    if (state.fx.kind !== "none") {
      state.fx.t += dt;
      const k = Math.max(0, 1 - state.fx.t / state.fx.duration);
      if (state.fx.kind === "correct") {
        crowdMat.emissiveColor.set(0.0, 0.55 * k, 0.15 * k);
        crowdMat.diffuseColor.set(
          CROWD_BASE_COLOR.r * (1 - k * 0.6) + 0.35 * k,
          CROWD_BASE_COLOR.g * (1 - k * 0.4) + 0.7 * k,
          CROWD_BASE_COLOR.b * (1 - k * 0.6),
        );
      } else {
        crowdMat.emissiveColor.set(0.6 * k, 0.0, 0.0);
        crowdMat.diffuseColor.set(
          CROWD_BASE_COLOR.r * (1 - k * 0.4) + 0.6 * k,
          CROWD_BASE_COLOR.g * (1 - k * 0.6),
          CROWD_BASE_COLOR.b * (1 - k * 0.6),
        );
      }
      // Camera shake on wrong
      if (state.fx.kind === "wrong") {
        const intensity = k * 0.18;
        camera.position.x = camHome.x + (Math.random() - 0.5) * intensity * 2;
        camera.position.y = camHome.y + (Math.random() - 0.5) * intensity * 2;
      }
      if (state.fx.t >= state.fx.duration) {
        state.fx.kind = "none";
        state.fx.t = 0;
        crowdMat.emissiveColor.set(0, 0, 0);
        crowdMat.diffuseColor.copyFrom(CROWD_BASE_COLOR);
        camera.position.copyFrom(camHome);
      }
    }

    // Smooth lane transition
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
    globalThis.removeEventListener("keydown", onKey);
    canvas.removeEventListener("pointerdown", onPointer);
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

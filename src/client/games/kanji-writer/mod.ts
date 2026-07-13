/**
 * Kanji Writer — write a kanji stroke by stroke, in 3D. The kanji floats on a
 * plane and you draw each stroke either by swiping (pointer ray → plane) on a
 * flat screen or, in an immersive-vr session, by holding a controller trigger
 * and writing in the air. Both feed the SAME pipeline: the drawn points land
 * in the kanji's 109-unit space and are scored by shape (angle & length,
 * position-independent — `shapeAccuracy`). Before the hint appears a stroke is
 * worth up to 5, after it up to 2; a run of +5 builds a combo across kanji.
 *
 * One Babylon scene for both modes (Babylon is already bundled for the other
 * games). Stroke data from KanjiVG (CC BY-SA 3.0); see /NOTICE.
 */

import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import "@babylonjs/core/Culling/ray.js"; // Ray.intersectsPlane for pointer picking
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import type { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource.js";

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
const HINT_IDLE_MS = 1200;
const MIN_SWIPE = 18; // px; shorter flat drags are taps (non-dot)
const SAMPLE_N = 16;
const MAX_PTS_PRE_HINT = 5;
const MAX_PTS_POST_HINT = 2;
const PERFECT = MAX_PTS_PRE_HINT;
const DOT_LEN = 14;
const DOT_TOL = 22;
const TARGET_POINTS = 40; // per-stroke sampling for smooth 3D tubes

// The kanji floats on this plane; good for a standing XR user and framed by
// the flat camera below.
const BOARD_SIZE = 1.4; // metres, width & height
const BOARD_POS = new Vector3(0, 1.4, -1.2);
const BOARD_NORMAL = new Vector3(0, 0, 1);
const STROKE_RADIUS = 0.012;
const INK_RADIUS = 0.014;
const Z_LIFT = 0.02; // strokes sit just in front of the board

// ---- sound: tiny WebAudio blips ---------------------------------------------

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

// ---- off-screen SVG sampler (reuse the browser's path math) ----------------

const SVG_NS = "http://www.w3.org/2000/svg";
const makeSampler = () => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 109 109");
  svg.setAttribute(
    "style",
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none",
  );
  document.body.appendChild(svg);
  return {
    sample(d: string, n: number): { pts: P[]; len: number } {
      const pe = document.createElementNS(SVG_NS, "path");
      pe.setAttribute("d", d);
      svg.appendChild(pe);
      const len = pe.getTotalLength();
      const pts = Array.from({ length: n }, (_, i) => {
        const q = pe.getPointAtLength((len * i) / (n - 1));
        return { x: q.x, y: q.y };
      });
      svg.removeChild(pe);
      return { pts, len };
    },
    dispose() {
      svg.remove();
    },
  };
};

// ---- HUD (flat-screen overlay; invisible in immersive XR) ------------------

const HUD = `
  <div data-kw="hud" class="absolute inset-0 pointer-events-none flex flex-col">
    <div class="flex items-start gap-2 px-3 pt-2 pl-12 bg-base-100/95">
      <div class="flex-1 text-center leading-tight">
        <div class="text-xs opacity-60">この よみの かんじ</div>
        <div data-kw="prompt" class="text-2xl font-bold"></div>
      </div>
      <div class="text-right leading-tight">
        <div data-kw="round" class="text-sm opacity-70 whitespace-nowrap"></div>
        <div data-kw="score" class="text-lg font-black text-primary whitespace-nowrap"></div>
        <div data-kw="combo" class="text-sm font-black text-warning whitespace-nowrap"></div>
      </div>
    </div>
    <div data-kw="fx" class="relative flex-1 min-h-0 overflow-hidden"></div>
    <div class="text-center pt-1 pb-2 bg-base-100/95">
      <div data-kw="progress" class="text-sm opacity-70"></div>
      <div class="text-xs opacity-40">なぞって かこう！はやいほど たかとくてん</div>
    </div>
  </div>
`;

const CSS = `
@keyframes kw-score{0%{transform:translate(-50%,-50%) scale(.5);opacity:0}30%{transform:translate(-50%,-50%) scale(1.25);opacity:1}100%{transform:translate(-50%,-160%) scale(1);opacity:0}}
.kw-score{animation:kw-score .7s ease-out forwards}
@keyframes kw-combo{0%{transform:scale(1)}50%{transform:scale(1.35)}100%{transform:scale(1)}}
.kw-combo{animation:kw-combo .3s}
`;

// ---- game ------------------------------------------------------------------

export const mount: StrokeGameMount = (container, { quiz, onComplete }) => {
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = "relative";

  const host = document.createElement("div");
  host.className = "absolute inset-0 bg-base-100 overflow-hidden select-none";
  host.innerHTML =
    `<style>${CSS}</style><canvas data-kw="canvas" class="absolute inset-0 w-full h-full block" style="touch-action:none;outline:none"></canvas>${HUD}`;
  container.appendChild(host);

  const el = <T extends HTMLElement = HTMLElement>(k: string): T =>
    host.querySelector(`[data-kw="${k}"]`) as T;
  const canvas = el<HTMLCanvasElement>("canvas");

  const sfx = createSfx();
  const sampler = makeSampler();

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

  // ---- Babylon scene ----
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.07, 0.11, 1);
  const camera = new UniversalCamera("cam", new Vector3(0, 1.4, 1.9), scene);
  camera.setTarget(BOARD_POS);
  camera.fov = 0.55; // pulled back + narrower → flatter, head-on framing
  camera.inputs.clear();
  const hemi = new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  hemi.intensity = 1;

  const board = new TransformNode("board", scene);
  board.position.copyFrom(BOARD_POS);
  const boardPlane = Plane.FromPositionAndNormal(BOARD_POS, BOARD_NORMAL);

  const frame = MeshBuilder.CreatePlane("frame", { size: BOARD_SIZE }, scene);
  frame.parent = board;
  const frameMat = new StandardMaterial("frameMat", scene);
  frameMat.diffuseColor = new Color3(0.12, 0.14, 0.2);
  frameMat.emissiveColor = new Color3(0.05, 0.06, 0.1);
  frameMat.backFaceCulling = false;
  frame.material = frameMat;

  const strokeMat = new StandardMaterial("s", scene);
  strokeMat.emissiveColor = new Color3(0.5, 0.75, 1);
  strokeMat.disableLighting = true;
  const doneMat = new StandardMaterial("d", scene);
  doneMat.emissiveColor = new Color3(0.13, 0.83, 0.42);
  doneMat.disableLighting = true;
  const inkMat = new StandardMaterial("i", scene);
  inkMat.emissiveColor = new Color3(1, 0.85, 0.2);
  inkMat.disableLighting = true;

  // ---- coordinate mapping ----
  // The camera views the board from its +z side (looking −z), and Babylon is
  // left-handed, so world +x lands on screen-left — negate x so the kanji
  // isn't mirrored. y-down (SVG) → y-up (world). Input uses the inverse, so
  // drawing stays aligned with what's shown.
  const toWorld = (p: P): Vector3 =>
    Vector3.TransformCoordinates(
      new Vector3(
        (0.5 - p.x / 109) * BOARD_SIZE,
        (0.5 - p.y / 109) * BOARD_SIZE,
        Z_LIFT,
      ),
      board.getWorldMatrix(),
    );
  const toKanji = (world: Vector3): P => {
    const l = Vector3.TransformCoordinates(
      world,
      Matrix.Invert(board.getWorldMatrix()),
    );
    return {
      x: (0.5 - l.x / BOARD_SIZE) * 109,
      y: (0.5 - l.y / BOARD_SIZE) * 109,
    };
  };

  // Debug/test hook: map a kanji 109-space point to client (screen) pixels —
  // handy for checking flat/XR alignment and to drive automated tests.
  (canvas as unknown as { __project?: (p: P) => { x: number; y: number } })
    .__project = (p) => {
      const v = Vector3.Project(
        toWorld(p),
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(
          engine.getRenderWidth(),
          engine.getRenderHeight(),
        ),
      );
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (v.x / engine.getRenderWidth()) * rect.width,
        y: rect.top + (v.y / engine.getRenderHeight()) * rect.height,
      };
    };
  // Debug/test hook: the current kanji's target strokes (109-space points).
  (canvas as unknown as { __targets?: () => P[][] }).__targets = () => targets;

  // ---- 3D prompt/score panel (for XR; the DOM HUD covers flat mode) ----
  const panel = MeshBuilder.CreatePlane("panel", {
    width: BOARD_SIZE,
    height: 0.32,
  }, scene);
  panel.parent = board;
  panel.position.y = BOARD_SIZE / 2 + 0.24;
  const panelTex = new DynamicTexture(
    "pt",
    { width: 1024, height: 256 },
    scene,
  );
  const panelMat = new StandardMaterial("pm", scene);
  panelMat.diffuseTexture = panelTex;
  panelMat.emissiveColor = new Color3(1, 1, 1);
  panelMat.disableLighting = true;
  panel.material = panelMat;
  const drawPanel = (a: string, b: string) => {
    const ctx = panelTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8eefc";
    ctx.font = "bold 92px sans-serif";
    ctx.fillText(a, 512, 108);
    ctx.font = "48px sans-serif";
    ctx.fillStyle = "#9fb3d8";
    ctx.fillText(b, 512, 188);
    panelTex.update();
  };

  // ---- game state ----
  const session: Session<StrokeQuiz> = createSession(
    quiz,
    (Math.random() * 0x7fffffff) | 0,
  );
  let round = 0;
  let score = 0;
  let combo = 0;
  let strokeIndex = 0;
  let targets: P[][] = [];
  let targetLens: number[] = [];
  let strokeMeshes: Mesh[] = [];
  let hintRevealed = false;
  let resolved = false;
  let idleId: ReturnType<typeof setTimeout> | null = null;

  const clearIdle = () => {
    if (idleId !== null) unschedule(idleId);
    idleId = null;
  };
  const startIdle = () => {
    clearIdle();
    if (resolved) return;
    idleId = schedule(() => {
      idleId = null;
      hintRevealed = true;
      renderStrokes();
    }, HINT_IDLE_MS);
  };

  // ---- HUD / panel rendering ----
  const renderHud = () => {
    el("score").textContent = `スコア ${score}`;
    el("round").textContent = `${round} / ${ROUNDS_TO_CLEAR}`;
    const c = el("combo");
    c.textContent = combo >= 2 ? `🔥コンボ ${combo}` : "";
    if (combo >= 2) {
      c.classList.remove("kw-combo");
      void c.offsetWidth;
      c.classList.add("kw-combo");
    }
    el("progress").textContent = `${targets.length}画中 ${
      Math.min(strokeIndex + 1, targets.length)
    }画目`;
    drawPanel(el("prompt").textContent || "", `スコア ${score}`);
  };

  const showScore = (pts: number, comboNow: number) => {
    const g = document.createElement("div");
    const comboLine = pts >= PERFECT && comboNow >= 2
      ? `<div class="text-xl font-black text-amber-300">コンボ ${comboNow}!</div>`
      : "";
    // Fixed (non-theme) colours: the writing area is always dark, so the popup
    // must stay bright in both light and dark themes.
    g.className =
      `kw-score absolute left-1/2 top-1/2 text-center whitespace-nowrap ${
        pts >= PERFECT
          ? "text-emerald-400"
          : pts >= 3
          ? "text-sky-300"
          : pts >= 1
          ? "text-amber-300"
          : "text-rose-400"
      }`;
    g.innerHTML = `<div class="text-4xl font-black">+${pts}</div>${comboLine}`;
    el("fx").appendChild(g);
    schedule(() => g.remove(), 700);
    drawPanel(
      comboNow >= 2 && pts >= PERFECT ? `+${pts} 🔥${comboNow}` : `+${pts}`,
      `スコア ${score}`,
    );
  };

  const disposeStrokes = () => {
    for (const m of strokeMeshes) m.dispose();
    strokeMeshes = [];
  };
  const renderStrokes = () => {
    strokeMeshes.forEach((m, i) => {
      const on = i < strokeIndex || (i === strokeIndex && hintRevealed);
      m.setEnabled(on);
      m.material = i < strokeIndex ? doneMat : strokeMat;
      m.visibility = i < strokeIndex ? 1 : 0.4;
    });
  };

  const loadKanji = () => {
    disposeStrokes();
    const q = session.next();
    const paths = q.paths ?? [];
    targets = [];
    targetLens = [];
    strokeMeshes = paths.map((d) => {
      const smooth = sampler.sample(d, TARGET_POINTS);
      targets.push(sampler.sample(d, SAMPLE_N).pts);
      targetLens.push(smooth.len);
      const tube = MeshBuilder.CreateTube("t", {
        path: smooth.pts.map(toWorld),
        radius: STROKE_RADIUS,
        tessellation: 6,
        cap: 2,
      }, scene);
      tube.material = strokeMat;
      return tube;
    });
    strokeIndex = 0;
    hintRevealed = false;
    resolved = false;
    el("prompt").textContent = q.prompt ?? q.label;
    renderHud();
    renderStrokes();
    startIdle();
  };

  // ---- drawing pipeline (shared by pointer & XR) ----
  let drawing = false;
  let raw: P[] = [];
  let inkWorld: Vector3[] = [];
  let inkMesh: Mesh | null = null;

  const clearInk = () => {
    inkMesh?.dispose();
    inkMesh = null;
    inkWorld = [];
    raw = [];
  };
  const beginStroke = () => {
    if (resolved || drawing) return;
    drawing = true;
    clearIdle();
    raw = [];
    inkWorld = [];
  };
  const addPoint = (world: Vector3) => {
    if (!drawing) return;
    raw.push(toKanji(world));
    inkWorld.push(world.clone());
    if (inkWorld.length >= 2) {
      inkMesh?.dispose();
      inkMesh = MeshBuilder.CreateTube("ink", {
        path: inkWorld,
        radius: INK_RADIUS,
        tessellation: 6,
        cap: 2,
      }, scene);
      inkMesh.material = inkMat;
    }
  };
  const endStroke = () => {
    if (!drawing) return;
    drawing = false;
    if (resolved || raw.length < 2) {
      clearInk();
      startIdle();
      return;
    }
    scoreStroke();
    clearInk();
  };

  const scoreStroke = () => {
    const target = targets[strokeIndex];
    let acc: number;
    if (targetLens[strokeIndex] < DOT_LEN) {
      const mid = target[Math.floor(target.length / 2)];
      const d = Math.min(
        pointDistance(raw[raw.length - 1], mid),
        pointDistance(centroid(raw), mid),
      );
      acc = Math.max(0, 1 - d / DOT_TOL);
    } else {
      acc = shapeAccuracy(raw, target, SAMPLE_N);
    }
    const pts = Math.round(
      acc * (hintRevealed ? MAX_PTS_POST_HINT : MAX_PTS_PRE_HINT),
    );
    score += pts;
    combo = pts >= PERFECT ? combo + 1 : 0;
    sfx.score(pts, combo);
    hintRevealed = false;
    strokeIndex++;
    renderStrokes();
    renderHud();
    showScore(pts, combo);
    if (strokeIndex >= targets.length) onKanjiDone();
    else startIdle();
  };

  const onKanjiDone = () => {
    resolved = true;
    clearIdle();
    sfx.done();
    round++;
    renderHud();
    schedule(() => {
      if (round >= ROUNDS_TO_CLEAR) finish();
      else loadKanji();
    }, 800);
  };

  const finish = () => {
    resolved = true;
    clearIdle();
    disposeStrokes();
    clearInk();
    sfx.fanfare();
    drawPanel(`スコア ${score}`, `${ROUNDS_TO_CLEAR}もじ かけたね！`);
    const overlay = document.createElement("div");
    overlay.className =
      "absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-base-100/95 text-center p-6";
    overlay.innerHTML =
      `<div class="text-7xl">🎉</div><h2 class="text-4xl font-bold">スコア ${score}</h2><p class="text-lg opacity-70">${ROUNDS_TO_CLEAR}もじ かけたね！</p>`;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-lg";
    again.textContent = "もう一度";
    again.addEventListener("click", () => {
      overlay.remove();
      restart();
    });
    overlay.appendChild(again);
    host.appendChild(overlay);
    onComplete?.({ score, cleared: true });
  };

  const restart = () => {
    round = 0;
    score = 0;
    combo = 0;
    loadKanji();
  };

  // ---- flat-screen input: pointer ray → board plane ----
  let xrActive = false;
  let flatDown: { x: number; y: number } | null = null;

  const pickBoard = (offsetX: number, offsetY: number): Vector3 | null => {
    const ray = scene.createPickingRay(
      offsetX,
      offsetY,
      Matrix.Identity(),
      camera,
    );
    const d = ray.intersectsPlane(boardPlane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d));
  };

  const onPointerDown = (e: PointerEvent) => {
    if (xrActive || resolved) return;
    flatDown = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    const w = pickBoard(e.offsetX, e.offsetY);
    if (w) {
      beginStroke();
      addPoint(w);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (xrActive || !drawing) return;
    const w = pickBoard(e.offsetX, e.offsetY);
    if (w) addPoint(w);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (xrActive || !flatDown) return;
    const net = Math.hypot(e.clientX - flatDown.x, e.clientY - flatDown.y);
    flatDown = null;
    const isDot = targetLens[strokeIndex] !== undefined &&
      targetLens[strokeIndex] < DOT_LEN;
    if (net < MIN_SWIPE && !isDot && drawing) {
      // a tap on a normal stroke — cancel, resume the hint countdown
      drawing = false;
      clearInk();
      startIdle();
      return;
    }
    endStroke();
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // ---- XR input: controller trigger + position ----
  let xrDrawer: WebXRInputSource | null = null;
  const initXR = async () => {
    const nav = navigator as { xr?: XRSystem };
    if (!nav.xr?.isSessionSupported) return;
    let supported = false;
    try {
      supported = await nav.xr.isSessionSupported("immersive-vr");
    } catch { /* ignore */ }
    if (!supported || disposed) return;

    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
      disableTeleportation: true,
    });
    if (disposed) return;
    xr.baseExperience.onStateChangedObservable.add((s) => {
      xrActive = s === 2; // WebXRState.IN_XR
    });
    const bind = (src: WebXRInputSource) => {
      src.onMotionControllerInitObservable.add((mc) => {
        const trig = mc.getComponentOfType("trigger") ??
          mc.getComponent("xr-standard-trigger");
        trig?.onButtonStateChangedObservable.add(() => {
          if (!trig.changes.pressed) return;
          if (trig.pressed) {
            xrDrawer = src;
            beginStroke();
          } else if (xrDrawer === src) {
            xrDrawer = null;
            endStroke();
          }
        });
      });
    };
    xr.input.controllers.forEach(bind);
    xr.input.onControllerAddedObservable.add(bind);
  };

  scene.onBeforeRenderObservable.add(() => {
    if (xrDrawer && drawing) addPoint(xrDrawer.pointer.position);
  });

  // ---- boot ----
  engine.runRenderLoop(() => scene.render());
  const onResize = () => engine.resize();
  globalThis.addEventListener("resize", onResize);
  loadKanji();
  initXR();

  return () => {
    disposed = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    globalThis.removeEventListener("resize", onResize);
    scene.dispose();
    engine.dispose();
    sfx.dispose();
    sampler.dispose();
    host.remove();
    if (!prevPosition) container.style.position = prevPosition;
  };
};

const kanjiWriter: StrokeGameModule = { title: "漢字かきとり", mount };
export default kanjiWriter;

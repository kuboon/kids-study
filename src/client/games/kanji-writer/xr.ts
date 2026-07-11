/**
 * WebXR air-writing for the kanji-writer. In an immersive-vr session the kanji
 * floats in front of you; you hold the controller trigger and draw each stroke
 * in the air. The controller position is projected onto the kanji's plane and
 * scored with the SAME shape metric as the 2D game (`shapeAccuracy` — angle &
 * length, position-invariant), so writing big in the air Just Works.
 *
 * Loaded lazily (Babylon is heavy) only when the player taps "VRで書く".
 * Rendering uses Babylon (already a dependency); scoring/data are shared.
 */

import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
// Register the specific mesh builders on MeshBuilder.
import "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import type { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource.js";

import { createSession, type Session } from "../../../../quiz/session.ts";
import {
  centroid,
  type P,
  pointDistance,
  shapeAccuracy,
} from "../../../../quiz/stroke/match.ts";
import type { StrokeQuizGenerator } from "../../../../quiz/stroke/types.ts";
import type { StrokeQuiz } from "../../../../quiz/stroke/types.ts";

const ROUNDS_TO_CLEAR = 5;
const HINT_IDLE_MS = 1500;
const SAMPLE_N = 16;
const MAX_PTS_PRE_HINT = 5;
const MAX_PTS_POST_HINT = 2;
const PERFECT = MAX_PTS_PRE_HINT;
const DOT_LEN = 14;
const DOT_TOL = 22;
const TARGET_POINTS = 48; // per-stroke sampling for smooth 3D tubes

// The kanji floats on this plane in front of the player (metres).
const BOARD_SIZE = 1.4; // width & height of the writing area
const BOARD_POS = new Vector3(0, 1.5, -1.2);
const STROKE_RADIUS = 0.012;
const INK_RADIUS = 0.014;

// ---- support check ---------------------------------------------------------

export const isXRSupported = async (): Promise<boolean> => {
  const xr = (navigator as { xr?: XRSystem }).xr;
  if (!xr?.isSessionSupported) return false;
  try {
    return await xr.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
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
    /** Sample a stroke path to `n` points in 109 space, plus its length. */
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

// ---- game ------------------------------------------------------------------

export type XrHandle = { stop: () => void };

export const startXR = async (
  host: HTMLElement,
  quiz: StrokeQuizGenerator,
  onExit: (result: { score: number }) => void,
): Promise<XrHandle> => {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  host.appendChild(canvas);

  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.05, 0.09, 1);

  const camera = new UniversalCamera("cam", new Vector3(0, 1.5, 0), scene);
  camera.setTarget(BOARD_POS);
  const hemi = new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  hemi.intensity = 1;

  // Board frame (subtle) + coordinate root the kanji lives on.
  const board = new TransformNode("board", scene);
  board.position.copyFrom(BOARD_POS);
  const frame = MeshBuilder.CreatePlane("frame", { size: BOARD_SIZE }, scene);
  frame.parent = board;
  const frameMat = new StandardMaterial("frameMat", scene);
  frameMat.diffuseColor = new Color3(0.12, 0.14, 0.2);
  frameMat.emissiveColor = new Color3(0.06, 0.07, 0.11);
  frameMat.alpha = 0.55;
  frame.material = frameMat;

  const sampler = makeSampler();

  // 109-space (y-down) → board-local metres (y-up).
  const toLocal = (p: P): Vector3 =>
    new Vector3(
      (p.x / 109 - 0.5) * BOARD_SIZE,
      (0.5 - p.y / 109) * BOARD_SIZE,
      0.02,
    );
  // controller world position → 109 space on the board plane (ignore depth).
  const toKanji = (world: Vector3): P => {
    const local = Vector3.TransformCoordinates(
      world,
      Matrix.Invert(board.getWorldMatrix()),
    );
    return {
      x: (local.x / BOARD_SIZE + 0.5) * 109,
      y: (0.5 - local.y / BOARD_SIZE) * 109,
    };
  };

  const strokeMat = new StandardMaterial("sMat", scene);
  strokeMat.emissiveColor = new Color3(0.55, 0.8, 1);
  strokeMat.disableLighting = true;
  const doneMat = new StandardMaterial("dMat", scene);
  doneMat.emissiveColor = new Color3(0.13, 0.83, 0.42);
  doneMat.disableLighting = true;
  const inkMat = new StandardMaterial("iMat", scene);
  inkMat.emissiveColor = new Color3(1, 0.85, 0.2);
  inkMat.disableLighting = true;

  // ---- text panel (prompt + score) ----
  const panel = MeshBuilder.CreatePlane("panel", {
    width: BOARD_SIZE,
    height: 0.3,
  }, scene);
  panel.parent = board;
  panel.position.y = BOARD_SIZE / 2 + 0.22;
  const panelTex = new DynamicTexture(
    "panelTex",
    { width: 1024, height: 256 },
    scene,
  );
  const panelMat = new StandardMaterial("panelMat", scene);
  panelMat.diffuseTexture = panelTex;
  panelMat.emissiveColor = new Color3(1, 1, 1);
  panelMat.disableLighting = true;
  panel.material = panelMat;
  const drawPanel = (prompt: string, sub: string) => {
    const ctx = panelTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = "#e8eefc";
    ctx.textAlign = "center";
    ctx.font = "bold 96px sans-serif";
    ctx.fillText(prompt, 512, 110);
    ctx.font = "48px sans-serif";
    ctx.fillStyle = "#9fb3d8";
    ctx.fillText(sub, 512, 190);
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
  let idleId: ReturnType<typeof setTimeout> | null = null;
  let resolved = false;

  const clearIdle = () => {
    if (idleId !== null) clearTimeout(idleId);
    idleId = null;
  };
  const startIdle = () => {
    clearIdle();
    if (resolved) return;
    idleId = setTimeout(() => {
      hintRevealed = true;
      renderStrokes();
    }, HINT_IDLE_MS);
  };

  const disposeStrokeMeshes = () => {
    for (const m of strokeMeshes) m.dispose();
    strokeMeshes = [];
  };

  const renderStrokes = () => {
    strokeMeshes.forEach((m, i) => {
      const visible = i < strokeIndex || (i === strokeIndex && hintRevealed);
      m.setEnabled(visible);
      m.material = i < strokeIndex ? doneMat : strokeMat;
      m.visibility = i < strokeIndex ? 1 : 0.45;
    });
  };

  const loadKanji = () => {
    disposeStrokeMeshes();
    const q = session.next();
    const paths = q.paths ?? [];
    targets = [];
    targetLens = [];
    strokeMeshes = paths.map((d) => {
      const { pts, len } = sampler.sample(d, TARGET_POINTS);
      targets.push(sampler.sample(d, SAMPLE_N).pts);
      targetLens.push(len);
      const tube = MeshBuilder.CreateTube("t", {
        path: pts.map(toLocal),
        radius: STROKE_RADIUS,
        tessellation: 6,
        cap: 2,
      }, scene);
      tube.parent = board;
      tube.material = strokeMat;
      return tube;
    });
    strokeIndex = 0;
    hintRevealed = false;
    resolved = false;
    drawPanel(q.prompt ?? q.label, `スコア ${score}`);
    renderStrokes();
    startIdle();
  };

  // ---- drawing ----
  let drawing: WebXRInputSource | null = null;
  let inkPts: Vector3[] = [];
  let raw: P[] = [];
  let inkMesh: Mesh | null = null;

  const clearInk = () => {
    inkMesh?.dispose();
    inkMesh = null;
    inkPts = [];
    raw = [];
  };

  const beginStroke = (src: WebXRInputSource) => {
    if (resolved || drawing) return;
    drawing = src;
    clearIdle();
    inkPts = [];
    raw = [];
  };

  const endStroke = () => {
    if (!drawing) return;
    drawing = null;
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
    hintRevealed = false;
    strokeIndex++;
    renderStrokes();
    if (strokeIndex >= targets.length) {
      round++;
      drawPanel(
        combo >= 2 ? `+${pts}  🔥コンボ${combo}` : `+${pts}`,
        `スコア ${score}`,
      );
      resolved = true;
      setTimeout(() => {
        if (round >= ROUNDS_TO_CLEAR) finish();
        else loadKanji();
      }, 900);
    } else {
      drawPanel(
        combo >= 2 ? `+${pts}  🔥コンボ${combo}` : `+${pts}`,
        `スコア ${score}`,
      );
      startIdle();
    }
  };

  // grow the ink trail while drawing (in the render loop)
  const updateInk = () => {
    if (!drawing) return;
    const world = drawing.pointer.position;
    inkPts.push(world.clone());
    raw.push(toKanji(world));
    if (inkPts.length >= 2) {
      inkMesh?.dispose();
      inkMesh = MeshBuilder.CreateTube("ink", {
        path: inkPts,
        radius: INK_RADIUS,
        tessellation: 6,
        updatable: false,
        cap: 2,
      }, scene);
      inkMesh.material = inkMat;
    }
  };

  const finish = () => {
    resolved = true;
    disposeStrokeMeshes();
    clearInk();
    drawPanel(`スコア ${score}`, `${ROUNDS_TO_CLEAR}もじ かけたね！`);
  };

  // ---- XR session ----
  const xr = await WebXRDefaultExperience.CreateAsync(scene, {
    disableTeleportation: true,
    disableDefaultUI: false,
  });

  const bindController = (src: WebXRInputSource) => {
    src.onMotionControllerInitObservable.add((mc) => {
      const trigger = mc.getComponentOfType("trigger") ??
        mc.getComponent("xr-standard-trigger");
      trigger?.onButtonStateChangedObservable.add(() => {
        if (!trigger.changes.pressed) return;
        if (trigger.pressed) beginStroke(src);
        else endStroke();
      });
    });
  };
  xr.input.controllers.forEach(bindController);
  xr.input.onControllerAddedObservable.add(bindController);

  scene.onBeforeRenderObservable.add(updateInk);

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearIdle();
    scene.onBeforeRenderObservable.clear();
    sampler.dispose();
    scene.dispose();
    engine.dispose();
    canvas.remove();
    onExit({ score });
  };

  xr.baseExperience.onStateChangedObservable.add((state) => {
    // 3 === WebXRState.NOT_IN_XR (avoids importing the enum module)
    if (state === 3) cleanup();
  });

  engine.runRenderLoop(() => scene.render());
  const onResize = () => engine.resize();
  globalThis.addEventListener("resize", onResize);

  loadKanji();

  // Entry is handled by Babylon's built-in "ENTER VR" button (default UI),
  // which requests the session inside its own click handler — this keeps the
  // user-activation the headset requires, which a manual enterXRAsync after
  // our async setup would lose.

  return {
    stop: () => {
      globalThis.removeEventListener("resize", onResize);
      if (xr.baseExperience.state !== 3) xr.baseExperience.exitXRAsync();
      else cleanup();
    },
  };
};

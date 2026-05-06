/**
 * Minecart — Minecraft-flavored reskin of the gate-runner loop. Piyomi
 * rides a minecart down a rail; two stone blocks (one with the correct
 * answer, one wrong) approach. Pick a side, the pickaxe mines that
 * stone — correct yields a diamond, wrong dents the cart's loot.
 */

import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager.js";
import { Sprite } from "@babylonjs/core/Sprites/sprite.js";

import type { GameModule, GameMount } from "../types.ts";
import type { Quiz } from "../../../../quiz/types.ts";

const STREAK_TO_CLEAR = 10;
const INITIAL_DIAMONDS = 8;
const DIAMONDS_PER_CORRECT = 2;
const DIAMOND_VISIBLE_MAX = 24;

const LANE_X = 1.6;
const STONE_SPAWN_Z = 30;
const STONE_RESOLVE_Z = 3.2; // when the chosen stone reaches this, mine it
const STONE_HEIGHT = 2.0;
const STONE_Y = STONE_HEIGHT / 2;

const SCROLL_SPEED_INITIAL = 7;
const SCROLL_SPEED_MIN = 4;
const SCROLL_SPEED_MAX = 16;
const SCROLL_SPEED_ACCEL = 0.3;
const SCROLL_SPEED_PENALTY = 0.5;
const BOOST_MULTIPLIER = 1.7;
const BOOST_SWIPE_DURATION = 0.7;
const SWIPE_UP_PIXELS = 40;

const MINING_HITS = 3;
const MINING_INTERVAL = 0.12; // seconds between hits in a mining burst
const SWING_DURATION = MINING_HITS * MINING_INTERVAL + 0.05;

const ROAD_WIDTH = 6;
const ROAD_LENGTH = 200;

type Lane = -1 | 1;

type StoneSide = { value: string; correct: boolean; mesh: Mesh };

type StonePair = {
  z: number;
  left: StoneSide;
  right: StoneSide;
  resolved: boolean;
};

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");

// Tiny seeded LCG so the pixel-noise textures are stable per build but not
// dependent on Math.random's run-to-run ordering.
const rng = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 1000) / 1000;
  };
};

export const mount: GameMount = (container, { quiz, onComplete }) => {
  // ---- DOM scaffolding -----------------------------------------------------
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none;image-rendering:pixelated;";
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
    </div>
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-1 rounded-full bg-info text-info-content text-2xl font-bold shadow-md flex items-center gap-2">
      <span aria-hidden="true">💎</span>
      <span data-diamonds>0</span>
    </div>
    <div data-end class="hidden absolute inset-0 flex-col items-center justify-center bg-base-100/90 pointer-events-auto">
      <h2 class="text-3xl font-bold mb-4" data-end-title></h2>
      <button data-restart-end class="btn btn-primary btn-lg">もう一度</button>
    </div>
  `;
  container.appendChild(overlay);

  const $q = overlay.querySelector("[data-q]") as HTMLElement;
  const $diamonds = overlay.querySelector("[data-diamonds]") as HTMLElement;
  const $end = overlay.querySelector("[data-end]") as HTMLElement;
  const $endTitle = overlay.querySelector("[data-end-title]") as HTMLElement;
  const $restart = overlay.querySelector("[data-restart]") as HTMLButtonElement;
  const $restartEnd = overlay.querySelector(
    "[data-restart-end]",
  ) as HTMLButtonElement;

  // ---- Babylon scene -------------------------------------------------------
  const engine = new Engine(canvas, true, {
    stencil: false,
    antialias: false, // pixel-art look prefers nearest sampling
  });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.78, 0.95, 1); // sky

  const camera = new UniversalCamera("cam", new Vector3(0, 4.0, -7.5), scene);
  camera.setTarget(new Vector3(0, 1.4, 4));
  camera.inputs.clear();

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0.3), scene);
  hemi.intensity = 0.85;
  hemi.groundColor = new Color3(0.5, 0.5, 0.55);
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene);
  sun.intensity = 0.55;

  // ---- Procedural pixel textures ------------------------------------------
  // All voxel-style surfaces share NEAREST sampling for crisp pixels.
  const finishPixelTex = (tex: DynamicTexture) => {
    tex.update(false);
    tex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
  };
  const newPixelTex = (
    name: string,
    size: number,
    draw: (
      ctx: CanvasRenderingContext2D,
      rand: () => number,
      size: number,
    ) => void,
    seed: number,
  ): DynamicTexture => {
    const tex = new DynamicTexture(
      name,
      { width: size, height: size },
      scene,
      false,
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    draw(ctx, rng(seed), size);
    finishPixelTex(tex);
    return tex;
  };

  const speckle = (
    ctx: CanvasRenderingContext2D,
    rand: () => number,
    size: number,
    base: string,
    variants: string[],
    density: number,
  ) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (rand() < density) {
          ctx.fillStyle = variants[Math.floor(rand() * variants.length)];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  };

  // Long ground: grass with a centered pair of rails baked in. Texture is
  // tall (32×128) so a single tile contains many ties along Z; the texture
  // scrolls with vOffset to fake forward motion.
  const groundTex = (() => {
    const W = 32, H = 128;
    const tex = new DynamicTexture(
      "ground",
      { width: W, height: H },
      scene,
      false,
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const r = rng(11);
    // Grass base
    ctx.fillStyle = "#5fa84a";
    ctx.fillRect(0, 0, W, H);
    const grassVariants = ["#4f9540", "#6dba56", "#3d7a32", "#71c25d"];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (r() < 0.32) {
          ctx.fillStyle = grassVariants[Math.floor(r() * grassVariants.length)];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    // Dirt path under the rails
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(10, 0, 12, H);
    for (let y = 0; y < H; y++) {
      for (let x = 10; x < 22; x++) {
        if (r() < 0.35) {
          ctx.fillStyle = ["#6a4626", "#8a6038", "#5d3d20"][
            Math.floor(r() * 3)
          ];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    // Wood ties (horizontal) every 8 rows
    for (let y = 0; y < H; y += 8) {
      ctx.fillStyle = "#6b4622";
      ctx.fillRect(8, y, 16, 3);
      ctx.fillStyle = "#54371b";
      ctx.fillRect(8, y + 2, 16, 1);
      ctx.fillStyle = "#7d5429";
      ctx.fillRect(8, y, 16, 1);
    }
    // Iron rails (vertical bars over the ties)
    ctx.fillStyle = "#8d8d92";
    ctx.fillRect(12, 0, 2, H);
    ctx.fillRect(18, 0, 2, H);
    ctx.fillStyle = "#b6b6bb";
    ctx.fillRect(12, 0, 1, H);
    ctx.fillRect(18, 0, 1, H);
    finishPixelTex(tex);
    return tex;
  })();

  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: ROAD_WIDTH, height: ROAD_LENGTH },
    scene,
  );
  ground.position.z = ROAD_LENGTH / 2 - 10;
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseTexture = groundTex;
  groundMat.specularColor = new Color3(0, 0, 0);
  ground.material = groundMat;
  // Tile densely: ~1 tile per 2 world units along Z so ties feel block-sized.
  groundTex.uScale = 1;
  groundTex.vScale = ROAD_LENGTH / 4;

  // Far meadow on either side of the rail strip — keeps the world from
  // ending visually past the cart.
  const meadowTex = newPixelTex("meadow", 16, (ctx, r, s) => {
    speckle(
      ctx,
      r,
      s,
      "#5fa84a",
      ["#4f9540", "#6dba56", "#3d7a32", "#71c25d"],
      0.4,
    );
  }, 7);
  const makeMeadow = (xOffset: number) => {
    const m = MeshBuilder.CreateGround(
      "meadow",
      { width: 60, height: ROAD_LENGTH },
      scene,
    );
    m.position.set(xOffset, -0.01, ROAD_LENGTH / 2 - 10);
    const mat = new StandardMaterial("meadowMat", scene);
    mat.diffuseTexture = meadowTex;
    mat.specularColor = new Color3(0, 0, 0);
    m.material = mat;
    meadowTex.uScale = 8;
    meadowTex.vScale = ROAD_LENGTH / 4;
    return m;
  };
  makeMeadow(-32);
  makeMeadow(32);

  // Decorative voxel hills/blocks placed off the rails. Static — no per-frame
  // cost since they're outside the gameplay loop.
  const dirtTex = newPixelTex("dirt", 16, (ctx, r, s) => {
    speckle(ctx, r, s, "#7a5230", ["#6a4626", "#8a6038", "#5d3d20"], 0.4);
  }, 21);
  const grassBlockTex = newPixelTex("grassBlock", 16, (ctx, r, s) => {
    // top half: grass, bottom: dirt — sides will look like a grass-topped
    // block when applied to a cube face.
    ctx.fillStyle = "#5fa84a";
    ctx.fillRect(0, 0, s, 4);
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(0, 4, s, s - 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (r() < 0.3) {
          const inGrass = y < 4;
          const palette = inGrass
            ? ["#4f9540", "#6dba56", "#3d7a32"]
            : ["#6a4626", "#8a6038", "#5d3d20"];
          ctx.fillStyle = palette[Math.floor(r() * palette.length)];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.fillStyle = "#3d7a32";
    ctx.fillRect(0, 3, s, 1);
  }, 33);
  const leafTex = newPixelTex("leaf", 16, (ctx, r, s) => {
    speckle(ctx, r, s, "#2e7d32", ["#1b5e20", "#43a047", "#0e3d12"], 0.45);
  }, 44);
  const logTex = newPixelTex("log", 16, (ctx, r, s) => {
    ctx.fillStyle = "#6b4622";
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (r() < 0.25) {
          ctx.fillStyle = ["#54371b", "#7d5429", "#3e2812"][
            Math.floor(r() * 3)
          ];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }, 55);

  const grassBlockMat = new StandardMaterial("grassBlockMat", scene);
  grassBlockMat.diffuseTexture = grassBlockTex;
  grassBlockMat.specularColor = new Color3(0, 0, 0);
  const dirtMat = new StandardMaterial("dirtMat", scene);
  dirtMat.diffuseTexture = dirtTex;
  dirtMat.specularColor = new Color3(0, 0, 0);
  const leafMat = new StandardMaterial("leafMat", scene);
  leafMat.diffuseTexture = leafTex;
  leafMat.specularColor = new Color3(0, 0, 0);
  const logMat = new StandardMaterial("logMat", scene);
  logMat.diffuseTexture = logTex;
  logMat.specularColor = new Color3(0, 0, 0);

  // Sprinkle simple "trees" (log + leaves) and grass-block hills along both
  // sides of the track. Deterministic placement keeps the world stable.
  const decoR = rng(101);
  for (let i = 0; i < 28; i++) {
    const z = -8 + i * 7 + decoR() * 3;
    const sideSign = decoR() < 0.5 ? -1 : 1;
    const x = sideSign * (5 + decoR() * 14);
    if (decoR() < 0.55) {
      // tree
      const trunk = MeshBuilder.CreateBox(
        `trunk${i}`,
        { width: 0.7, height: 2.2, depth: 0.7 },
        scene,
      );
      trunk.position.set(x, 1.1, z);
      trunk.material = logMat;
      const leaves = MeshBuilder.CreateBox(
        `leaves${i}`,
        { width: 2.4, height: 1.6, depth: 2.4 },
        scene,
      );
      leaves.position.set(x, 2.8, z);
      leaves.material = leafMat;
    } else {
      // hill chunk
      const w = 1 + Math.floor(decoR() * 2);
      const h = 1 + Math.floor(decoR() * 2);
      for (let bx = 0; bx < w; bx++) {
        for (let by = 0; by < h; by++) {
          const isTop = by === h - 1;
          const block = MeshBuilder.CreateBox(
            `hb${i}_${bx}_${by}`,
            { size: 1 },
            scene,
          );
          block.position.set(x + bx, 0.5 + by, z);
          block.material = isTop ? grassBlockMat : dirtMat;
        }
      }
    }
  }

  // ---- Minecart ------------------------------------------------------------
  // A small group of brown plank sides + iron rim, sitting at world origin.
  // Piyomi sits inside as a sprite. The cart itself doesn't move forward —
  // the world scrolls past — but it bobs on the rails.
  const plankTex = newPixelTex("plank", 16, (ctx, r, s) => {
    ctx.fillStyle = "#9b6a37";
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      ctx.fillStyle = "#6b4622";
      ctx.fillRect(0, y + 3, s, 1);
    }
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (r() < 0.18) {
          ctx.fillStyle = ["#7d5429", "#b07c44", "#54371b"][
            Math.floor(r() * 3)
          ];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }, 66);
  const ironTex = newPixelTex("iron", 16, (ctx, r, s) => {
    speckle(ctx, r, s, "#9da0a6", ["#7c7f86", "#bcbfc6", "#5d6066"], 0.35);
  }, 77);

  const plankMat = new StandardMaterial("plankMat", scene);
  plankMat.diffuseTexture = plankTex;
  plankMat.specularColor = new Color3(0, 0, 0);
  const ironMat = new StandardMaterial("ironMat", scene);
  ironMat.diffuseTexture = ironTex;
  ironMat.specularColor = new Color3(0.1, 0.1, 0.1);

  const cartRoot = new TransformNode("cartRoot", scene);
  cartRoot.position.set(0, 0.55, 0);

  const cartFloor = MeshBuilder.CreateBox(
    "cartFloor",
    { width: 1.6, height: 0.18, depth: 1.6 },
    scene,
  );
  cartFloor.position.y = -0.15;
  cartFloor.material = plankMat;
  cartFloor.parent = cartRoot;

  const wallSpec = [
    { x: -0.85, z: 0, w: 0.18, d: 1.6 }, // left wall
    { x: 0.85, z: 0, w: 0.18, d: 1.6 }, // right wall
    { x: 0, z: -0.85, w: 1.6, d: 0.18 }, // back wall
    { x: 0, z: 0.85, w: 1.6, d: 0.18 }, // front wall (lower)
  ];
  for (let i = 0; i < wallSpec.length; i++) {
    const w = wallSpec[i];
    const isFront = i === 3;
    const h = isFront ? 0.45 : 0.7;
    const wall = MeshBuilder.CreateBox(
      `cartWall${i}`,
      { width: w.w, height: h, depth: w.d },
      scene,
    );
    wall.position.set(w.x, h / 2 - 0.05, w.z);
    wall.material = plankMat;
    wall.parent = cartRoot;
  }
  // Iron rims along the top of the back+side walls
  const rimSpec = [
    { x: -0.85, z: 0, w: 0.22, d: 1.7 },
    { x: 0.85, z: 0, w: 0.22, d: 1.7 },
    { x: 0, z: -0.85, w: 1.7, d: 0.22 },
  ];
  for (let i = 0; i < rimSpec.length; i++) {
    const r = rimSpec[i];
    const rim = MeshBuilder.CreateBox(
      `cartRim${i}`,
      { width: r.w, height: 0.12, depth: r.d },
      scene,
    );
    rim.position.set(r.x, 0.62, r.z);
    rim.material = ironMat;
    rim.parent = cartRoot;
  }
  // Wheels
  for (
    const [wx, wz] of [
      [-0.7, -0.6],
      [0.7, -0.6],
      [-0.7, 0.6],
      [0.7, 0.6],
    ]
  ) {
    const wheel = MeshBuilder.CreateCylinder(
      "wheel",
      { diameter: 0.45, height: 0.12, tessellation: 14 },
      scene,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, -0.32, wz);
    wheel.material = ironMat;
    wheel.parent = cartRoot;
  }

  // Piyomi sprite — sits centered on the cart floor. Reuse the existing
  // back-view sheet; cellIndex 0 reads as a still pose.
  const piyomiManager = new SpriteManager(
    "piyomi",
    "./characters/piyomi.png",
    1,
    { width: 256, height: 256 },
    scene,
  );
  piyomiManager.isPickable = false;
  const piyomi = new Sprite("piyomi", piyomiManager);
  piyomi.size = 1.4;
  piyomi.cellIndex = 0;
  piyomi.position.set(0, 0.95, -0.05);

  // Pickaxe — a simple plank handle + iron head, parented to a swing pivot
  // that we tilt toward the chosen lane and rock during the mining swing.
  const pickaxePivot = new TransformNode("pickaxePivot", scene);
  pickaxePivot.parent = cartRoot;
  pickaxePivot.position.set(0, 1.05, 0.5);

  const pickHandle = MeshBuilder.CreateBox(
    "pickHandle",
    { width: 0.08, height: 0.9, depth: 0.08 },
    scene,
  );
  pickHandle.material = plankMat;
  pickHandle.position.y = 0.45;
  pickHandle.parent = pickaxePivot;

  const pickHead = MeshBuilder.CreateBox(
    "pickHead",
    { width: 0.55, height: 0.18, depth: 0.18 },
    scene,
  );
  pickHead.material = ironMat;
  pickHead.position.set(0.18, 0.85, 0);
  pickHead.parent = pickaxePivot;

  // ---- Stone pair ---------------------------------------------------------
  const stoneTexCache = {
    base: newPixelTex("stoneBase", 16, (ctx, r, s) => {
      speckle(ctx, r, s, "#8a8a90", ["#6e6e74", "#a4a4aa", "#5b5b61"], 0.45);
    }, 88),
  };
  const makeStoneTex = (text: string): DynamicTexture => {
    const W = 256, H = 256;
    const tex = new DynamicTexture(
      "stoneTex",
      { width: W, height: H },
      scene,
      false,
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    // Replicate the 16-pixel stone pattern across the face for a chunky look.
    const r = rng(text.length * 13 + text.charCodeAt(0));
    const pal = ["#6e6e74", "#a4a4aa", "#5b5b61"];
    ctx.fillStyle = "#8a8a90";
    ctx.fillRect(0, 0, W, H);
    const TILE = 16;
    for (let y = 0; y < H; y += TILE) {
      for (let x = 0; x < W; x += TILE) {
        for (let py = 0; py < TILE; py++) {
          for (let px = 0; px < TILE; px++) {
            if (r() < 0.45) {
              ctx.fillStyle = pal[Math.floor(r() * pal.length)];
              ctx.fillRect(x + px, y + py, 1, 1);
            }
          }
        }
      }
    }
    // Inset darker rectangle behind the text for legibility, with a chiselled
    // border so it still reads as carved stone.
    ctx.fillStyle = "rgba(20,20,28,0.45)";
    ctx.fillRect(28, 80, W - 56, 96);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 80, W - 56, 96);

    ctx.fillStyle = "#fefefe";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const MAX_TEXT_WIDTH = 200;
    const BASE_FONT = 110;
    ctx.font = `bold ${BASE_FONT}px sans-serif`;
    const measured = ctx.measureText(text).width;
    const fontSize = measured > MAX_TEXT_WIDTH
      ? Math.floor(BASE_FONT * MAX_TEXT_WIDTH / measured)
      : BASE_FONT;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, W / 2, 130);
    ctx.shadowBlur = 0;

    finishPixelTex(tex);
    // Box's -Z face samples V inverted relative to canvas Y; flip so the
    // text reads upright when viewed from the camera.
    tex.vScale = -1;
    tex.vOffset = 1;
    return tex;
  };
  // Quiet a "set but never read" warning on stoneTexCache so Deno keeps the
  // shared base texture alive for any future reuse.
  void stoneTexCache;

  const makeStone = (
    text: string,
    correct: boolean,
    laneX: number,
    z: number,
  ): StoneSide => {
    const mesh = MeshBuilder.CreateBox(
      `stone_${laneX}_${Date.now()}`,
      { width: STONE_HEIGHT, height: STONE_HEIGHT, depth: STONE_HEIGHT },
      scene,
    );
    mesh.position.set(laneX, STONE_Y, z);
    const mat = new StandardMaterial(`stoneMat_${laneX}_${Date.now()}`, scene);
    const tex = makeStoneTex(text);
    mat.diffuseTexture = tex;
    mat.specularColor = new Color3(0, 0, 0);
    mesh.material = mat;
    return { value: text, correct, mesh };
  };

  // ---- Diamond mesh (template + clones for spawn-on-correct) --------------
  const diamondMat = new StandardMaterial("diamondMat", scene);
  diamondMat.diffuseColor = new Color3(0.55, 0.95, 1.0);
  diamondMat.emissiveColor = new Color3(0.35, 0.78, 0.95);
  diamondMat.specularColor = new Color3(0.4, 0.6, 0.7);

  const diamondProto = MeshBuilder.CreatePolyhedron(
    "diamondProto",
    { type: 1, size: 0.35 },
    scene,
  );
  diamondProto.material = diamondMat;
  diamondProto.isVisible = false;

  // Floating diamonds spawned on a correct mine. We pool a small pile so we
  // don't churn meshes per round.
  type FloatDiamond = {
    mesh: Mesh;
    t: number;
    dur: number;
    from: Vector3;
    to: Vector3;
    spin: number;
    active: boolean;
  };
  const floatDiamonds: FloatDiamond[] = [];
  const acquireDiamond = (): FloatDiamond => {
    for (const d of floatDiamonds) if (!d.active) return d;
    const mesh = diamondProto.clone(`diamond_${floatDiamonds.length}`);
    mesh.isVisible = false;
    const fd: FloatDiamond = {
      mesh,
      t: 0,
      dur: 1,
      from: new Vector3(),
      to: new Vector3(),
      spin: 0,
      active: false,
    };
    floatDiamonds.push(fd);
    return fd;
  };

  // ---- Stone-break debris (small textured cubes that scatter and fade) ----
  const debrisMat = new StandardMaterial("debrisMat", scene);
  debrisMat.diffuseTexture = stoneTexCache.base;
  debrisMat.specularColor = new Color3(0, 0, 0);
  type Debris = {
    mesh: Mesh;
    vel: Vector3;
    spinX: number;
    spinY: number;
    t: number;
    dur: number;
    active: boolean;
  };
  const debrisPool: Debris[] = [];
  const acquireDebris = (): Debris => {
    for (const d of debrisPool) if (!d.active) return d;
    const mesh = MeshBuilder.CreateBox(
      `debris_${debrisPool.length}`,
      { size: 0.22 },
      scene,
    );
    mesh.material = debrisMat;
    mesh.isVisible = false;
    const d: Debris = {
      mesh,
      vel: new Vector3(),
      spinX: 0,
      spinY: 0,
      t: 0,
      dur: 0.8,
      active: false,
    };
    debrisPool.push(d);
    return d;
  };

  const spawnDebris = (origin: Vector3) => {
    for (let i = 0; i < 8; i++) {
      const d = acquireDebris();
      d.mesh.position.copyFrom(origin);
      d.mesh.position.y += 0.2;
      d.vel.set(
        (Math.random() - 0.5) * 4,
        2 + Math.random() * 2,
        (Math.random() - 0.5) * 3,
      );
      d.spinX = (Math.random() - 0.5) * 12;
      d.spinY = (Math.random() - 0.5) * 12;
      d.t = 0;
      d.dur = 0.7 + Math.random() * 0.3;
      d.active = true;
      d.mesh.isVisible = true;
    }
  };

  // ---- Game state ----------------------------------------------------------
  type FxKind = "none" | "correct" | "wrong";
  type State = {
    score: number;
    streak: number;
    diamonds: number;
    lane: Lane;
    targetX: number;
    speed: number;
    keyBoosting: boolean;
    swipeBoostT: number;
    pair: StonePair | null;
    currentQuiz: Quiz | null;
    seed: number;
    ended: boolean;
    miningT: number; // -1 = not mining; >=0 = elapsed in swing
    miningHitsLeft: number; // hits remaining for current swing
    miningNextHit: number; // time of next tick within swing
    fx: { kind: FxKind; t: number; duration: number };
  };

  const state: State = {
    score: 0,
    streak: 0,
    diamonds: INITIAL_DIAMONDS,
    lane: -1,
    targetX: -LANE_X,
    speed: SCROLL_SPEED_INITIAL,
    keyBoosting: false,
    swipeBoostT: 0,
    pair: null,
    currentQuiz: null,
    seed: 1,
    ended: false,
    miningT: -1,
    miningHitsLeft: 0,
    miningNextHit: 0,
    fx: { kind: "none", t: 0, duration: 0 },
  };

  // ---- SFX -----------------------------------------------------------------
  let audioCtx: AudioContext | null = null;
  const ensureAudio = (): AudioContext | null => {
    if (audioCtx) return audioCtx;
    const Ctx = (globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioCtx = new Ctx();
      return audioCtx;
    } catch {
      return null;
    }
  };

  type SfxNote = { f: number; t: number; d: number; type?: OscillatorType };
  const playNotes = (notes: SfxNote[], volume = 0.18) => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const base = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type ?? "sine";
      osc.frequency.setValueAtTime(n.f, base + n.t);
      g.gain.setValueAtTime(0, base + n.t);
      g.gain.linearRampToValueAtTime(volume, base + n.t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, base + n.t + n.d);
      osc.connect(g).connect(ctx.destination);
      osc.start(base + n.t);
      osc.stop(base + n.t + n.d + 0.02);
    }
  };
  const playSweep = (
    fStart: number,
    fEnd: number,
    duration: number,
    type: OscillatorType = "sawtooth",
    volume = 0.16,
  ) => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, t0);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, fEnd),
      t0 + duration,
    );
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  };

  // Short noise burst — used for the pickaxe "tink" and stone shatter.
  let noiseBuffer: AudioBuffer | null = null;
  const getNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
    if (noiseBuffer) return noiseBuffer;
    const length = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
    return buf;
  };
  const playNoise = (
    duration: number,
    volume: number,
    filterFreq: number,
    type: BiquadFilterType = "bandpass",
  ) => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = type === "bandpass" ? 4 : 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  };

  const sfx = {
    lane: () => playNotes([{ f: 660, t: 0, d: 0.06, type: "triangle" }], 0.10),
    // Pickaxe tink: noise burst + a high "tink" sine for the metallic ping.
    pickTick: () => {
      playNoise(0.10, 0.20, 1200, "highpass");
      playNotes(
        [{ f: 1568, t: 0, d: 0.07, type: "triangle" }], // G6
        0.08,
      );
    },
    stoneBreak: () => {
      playNoise(0.35, 0.30, 600, "bandpass");
      playNoise(0.35, 0.18, 200, "lowpass");
    },
    // Diamond chime: bright triangle arpeggio, a celebratory "ding".
    diamond: () =>
      playNotes([
        { f: 1318.5, t: 0.00, d: 0.16, type: "triangle" }, // E6
        { f: 1760.0, t: 0.06, d: 0.16, type: "triangle" }, // A6
        { f: 2093.0, t: 0.12, d: 0.32, type: "triangle" }, // C7
      ], 0.18),
    wrong: () => {
      playNoise(0.18, 0.25, 250, "lowpass");
      playSweep(220, 80, 0.4, "sawtooth", 0.14);
    },
    boost: () => playSweep(280, 880, 0.22, "square", 0.10),
    win: () =>
      playNotes([
        { f: 523.25, t: 0.00, d: 0.18, type: "triangle" },
        { f: 659.25, t: 0.10, d: 0.18, type: "triangle" },
        { f: 783.99, t: 0.20, d: 0.18, type: "triangle" },
        { f: 1046.5, t: 0.30, d: 0.45, type: "triangle" },
      ], 0.20),
    gameover: () =>
      playNotes([
        { f: 392.00, t: 0.00, d: 0.30, type: "sine" },
        { f: 329.63, t: 0.20, d: 0.30, type: "sine" },
        { f: 246.94, t: 0.40, d: 0.55, type: "sine" },
      ], 0.18),
  };

  const camHome = camera.position.clone();

  const setLane = (lane: Lane) => {
    if (state.lane !== lane) sfx.lane();
    state.lane = lane;
    state.targetX = lane * LANE_X;
  };

  const renderHud = () => {
    if (state.currentQuiz) $q.innerHTML = state.currentQuiz.q;
    $diamonds.textContent = String(Math.max(0, state.diamonds));
  };

  const disposeStoneSide = (s: StoneSide) => {
    const mat = s.mesh.material as StandardMaterial | null;
    const tex = mat?.diffuseTexture;
    s.mesh.dispose();
    mat?.dispose();
    tex?.dispose();
  };
  const disposePair = (p: StonePair | null) => {
    if (!p) return;
    disposeStoneSide(p.left);
    disposeStoneSide(p.right);
  };

  const spawnPair = () => {
    disposePair(state.pair);
    const q = quiz.fn(state.seed++);
    state.currentQuiz = q;
    const correctText = stripHtml(q.a);
    let wrongText = stripHtml(q.wrong());
    let safety = 8;
    while (wrongText === correctText && safety-- > 0) {
      wrongText = stripHtml(q.wrong());
    }
    const correctOnLeft = Math.random() < 0.5;
    const left = makeStone(
      correctOnLeft ? correctText : wrongText,
      correctOnLeft,
      -LANE_X,
      STONE_SPAWN_Z,
    );
    const right = makeStone(
      correctOnLeft ? wrongText : correctText,
      !correctOnLeft,
      LANE_X,
      STONE_SPAWN_Z,
    );
    state.pair = { z: STONE_SPAWN_Z, left, right, resolved: false };
    renderHud();
  };

  let endRevealTimer: number | null = null;
  const endGame = (cleared: boolean) => {
    if (state.ended) return;
    state.ended = true;
    onComplete?.({ score: state.score, cleared });

    if (cleared) {
      $endTitle.textContent = "";
      endRevealTimer = globalThis.setTimeout(() => {
        endRevealTimer = null;
        $end.classList.remove("hidden");
        $end.classList.add("flex");
        $end.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 1200, easing: "ease-out", fill: "both" },
        );
      }, 2000);
    } else {
      $endTitle.textContent = "ざんねん…";
      $end.classList.remove("hidden");
      $end.classList.add("flex");
    }
  };

  const triggerFx = (kind: "correct" | "wrong", deltaText: string) => {
    state.fx.kind = kind;
    state.fx.t = 0;
    state.fx.duration = kind === "correct" ? 0.7 : 0.6;

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

    const hudPulse = (el: HTMLElement, color: string) => {
      el.animate([
        { transform: "scale(1)", color: "" },
        { transform: "scale(1.55)", color, offset: 0.35 },
        { transform: "scale(1)", color: "" },
      ], { duration: 500, easing: "ease-out" });
    };
    hudPulse($diamonds, fg);
  };

  const spawnConfetti = () => {
    const colors = [
      "#7be0ec",
      "#a6f0ff",
      "#fbbf24",
      "#34d399",
      "#60a5fa",
      "#a78bfa",
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

  const spawnDiamondPop = (from: Vector3, count: number) => {
    for (let i = 0; i < Math.min(count, DIAMOND_VISIBLE_MAX); i++) {
      const d = acquireDiamond();
      d.mesh.isVisible = true;
      d.from.copyFrom(from);
      d.from.x += (Math.random() - 0.5) * 0.4;
      d.from.y += 0.4 + Math.random() * 0.3;
      d.to.set(
        (Math.random() - 0.5) * 0.4,
        1.2,
        -0.6, // converge into the cart bed
      );
      d.spin = 4 + Math.random() * 6;
      d.t = 0;
      d.dur = 0.9 + Math.random() * 0.3;
      d.active = true;
      d.mesh.position.copyFrom(d.from);
    }
  };

  const beginMining = () => {
    state.miningT = 0;
    state.miningHitsLeft = MINING_HITS;
    state.miningNextHit = 0;
  };

  const finishMining = () => {
    if (!state.pair || state.pair.resolved) return;
    state.pair.resolved = true;
    const picked = state.lane === -1 ? state.pair.left : state.pair.right;
    const stoneWorldPos = picked.mesh.getAbsolutePosition().clone();
    spawnDebris(stoneWorldPos);
    sfx.stoneBreak();
    // Hide the picked stone immediately; its texture/mat dispose happens when
    // we replace the pair next round.
    picked.mesh.isVisible = false;

    if (picked.correct) {
      state.score++;
      state.streak++;
      state.diamonds = Math.min(999, state.diamonds + DIAMONDS_PER_CORRECT);
      triggerFx("correct", `+${DIAMONDS_PER_CORRECT}`);
      sfx.diamond();
      spawnDiamondPop(stoneWorldPos, 5);
    } else {
      state.streak = 0;
      state.speed = Math.max(
        SCROLL_SPEED_MIN,
        state.speed * SCROLL_SPEED_PENALTY,
      );
      const before = state.diamonds;
      state.diamonds = Math.floor(state.diamonds / 2);
      triggerFx("wrong", `-${before - state.diamonds}`);
      sfx.wrong();
    }
    renderHud();

    if (state.diamonds <= 0) {
      sfx.gameover();
      endGame(false);
      return;
    }
    if (state.streak >= STREAK_TO_CLEAR) {
      $q.innerHTML = "🎉";
      sfx.win();
      spawnConfetti();
      // Big diamond burst from the cart for emphasis.
      spawnDiamondPop(new Vector3(0, 1.2, 0), 12);
      endGame(true);
      return;
    }
    spawnPair();
  };

  const reset = () => {
    state.score = 0;
    state.streak = 0;
    state.diamonds = INITIAL_DIAMONDS;
    state.seed = (Math.random() * 0x7fffffff) | 0;
    state.lane = -1;
    state.targetX = -LANE_X;
    state.speed = SCROLL_SPEED_INITIAL;
    state.keyBoosting = false;
    state.swipeBoostT = 0;
    state.ended = false;
    state.miningT = -1;
    state.miningHitsLeft = 0;
    state.fx.kind = "none";
    state.fx.t = 0;
    cartRoot.position.x = -LANE_X;
    camera.position.copyFrom(camHome);
    if (endRevealTimer !== null) {
      globalThis.clearTimeout(endRevealTimer);
      endRevealTimer = null;
    }
    $end.classList.add("hidden");
    $end.classList.remove("flex");
    $end.style.opacity = "";
    // Clear lingering pop diamonds / debris
    for (const d of floatDiamonds) {
      d.active = false;
      d.mesh.isVisible = false;
    }
    for (const d of debrisPool) {
      d.active = false;
      d.mesh.isVisible = false;
    }
    spawnPair();
  };

  // ---- Input ---------------------------------------------------------------
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "a") setLane(-1);
    else if (e.key === "ArrowRight" || e.key === "d") setLane(1);
    else if (e.key === "ArrowUp" || e.key === "w") {
      if (!state.keyBoosting) sfx.boost();
      state.keyBoosting = true;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "w") state.keyBoosting = false;
  };

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
      sfx.boost();
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

  // ---- Render loop ---------------------------------------------------------
  let cartBob = 0;
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;

    if (!state.ended) {
      if (state.swipeBoostT > 0) state.swipeBoostT -= dt;
      const boosting = state.keyBoosting || state.swipeBoostT > 0;

      if (state.pair && !state.pair.resolved) {
        // Speed up gradually; pickaxe + scrolling share the same effective rate.
        state.speed = Math.min(
          SCROLL_SPEED_MAX,
          state.speed + SCROLL_SPEED_ACCEL * dt,
        );
        const eff = state.speed * (boosting ? BOOST_MULTIPLIER : 1);
        const advance = eff * dt;

        // While mining, freeze stone advance so the pickaxe can connect cleanly.
        if (state.miningT < 0) state.pair.z -= advance;

        groundTex.vOffset = (groundTex.vOffset - dt * eff / 4) % 1;
        state.pair.left.mesh.position.z = state.pair.z;
        state.pair.right.mesh.position.z = state.pair.z;

        // Trigger mining once the chosen stone is in range. We commit to the
        // current lane choice at this moment.
        if (state.miningT < 0 && state.pair.z <= STONE_RESOLVE_Z) {
          beginMining();
        }
      }

      // Mining swing — drive pickaxe rotation and dispatch tick sounds.
      if (state.miningT >= 0) {
        state.miningT += dt;
        // Tick sounds: schedule based on miningT crossing each interval.
        const expectedHit = MINING_HITS - state.miningHitsLeft;
        if (
          state.miningHitsLeft > 0 &&
          state.miningT >= expectedHit * MINING_INTERVAL
        ) {
          sfx.pickTick();
          state.miningHitsLeft--;
        }
        if (state.miningT >= SWING_DURATION) {
          state.miningT = -1;
          finishMining();
        }
      }
    }

    // Pickaxe pose: lean toward the chosen lane, swing on each tick.
    {
      const sideTarget = state.lane * 0.55;
      pickaxePivot.position.x += (sideTarget - pickaxePivot.position.x) *
        Math.min(1, dt * 12);
      // Swing animation: 3 quick chops within SWING_DURATION. The arc grows
      // toward the chosen stone — left lane swings -Z, right lane swings +Z.
      let swingAngle = -0.35; // resting upright tilt
      if (state.miningT >= 0) {
        const phase = (state.miningT % MINING_INTERVAL) / MINING_INTERVAL;
        const arc = Math.sin(phase * Math.PI) * 1.4;
        swingAngle = -0.35 + arc * state.lane;
      }
      pickaxePivot.rotation.z = swingAngle;
    }

    // Cart lateral motion + bob
    cartRoot.position.x += (state.targetX - cartRoot.position.x) *
      Math.min(1, dt * 8);
    cartBob += dt * state.speed * 1.2;
    cartRoot.position.y = 0.55 + Math.sin(cartBob) * 0.04;
    cartRoot.rotation.z = Math.sin(cartBob * 1.3) * 0.02;
    piyomi.position.x = cartRoot.position.x;
    piyomi.position.y = cartRoot.position.y + 0.4 +
      Math.sin(cartBob * 1.1) * 0.03;

    // Floating diamonds animation
    for (const d of floatDiamonds) {
      if (!d.active) continue;
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      // Quadratic bezier-ish arc: peak above midpoint
      const arcY = 1.2;
      const xy = (a: number, b: number) => a + (b - a) * k;
      d.mesh.position.x = xy(d.from.x, d.to.x);
      d.mesh.position.z = xy(d.from.z, d.to.z);
      d.mesh.position.y = xy(d.from.y, d.to.y) +
        Math.sin(k * Math.PI) * arcY;
      d.mesh.rotation.y += d.spin * dt;
      d.mesh.rotation.x += d.spin * 0.6 * dt;
      if (k >= 1) {
        d.active = false;
        d.mesh.isVisible = false;
      }
    }

    // Debris animation
    for (const d of debrisPool) {
      if (!d.active) continue;
      d.t += dt;
      d.vel.y -= 9.8 * dt;
      d.mesh.position.x += d.vel.x * dt;
      d.mesh.position.y += d.vel.y * dt;
      d.mesh.position.z += d.vel.z * dt;
      d.mesh.rotation.x += d.spinX * dt;
      d.mesh.rotation.y += d.spinY * dt;
      if (d.mesh.position.y < 0) {
        d.mesh.position.y = 0;
        d.vel.y *= -0.3;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
      }
      if (d.t >= d.dur) {
        d.active = false;
        d.mesh.isVisible = false;
      }
    }

    // Wrong-answer camera shake
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

    scene.render();
  });

  const onResize = () => engine.resize();
  globalThis.addEventListener("resize", onResize);

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
    if (endRevealTimer !== null) globalThis.clearTimeout(endRevealTimer);
    engine.stopRenderLoop();
    disposePair(state.pair);
    scene.dispose();
    engine.dispose();
    overlay.remove();
    canvas.remove();
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    if (!prevPosition) container.style.position = "";
  };
};

const minecart: GameModule = {
  title: "トロッコでダイヤ",
  mount,
};
export default minecart;

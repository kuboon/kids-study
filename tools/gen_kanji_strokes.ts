/**
 * One-off generator: derive per-kanji stroke-direction data from KanjiVG and
 * write `quiz/stroke/kanji_strokes.ts`. Run locally (needs network); the
 * generated file is committed so CI never fetches.
 *
 *   deno task gen:strokes              # all grade kanji → write the .ts
 *   deno run -A tools/gen_kanji_strokes.ts --dry 大 一 小   # print only
 *
 * Data source: KanjiVG (https://kanjivg.tagaini.net), (C) Ulrich Apel,
 * licensed CC BY-SA 3.0. The derived direction data is likewise CC BY-SA 3.0.
 */

import { DIR_ARROWS, quantize8 } from "../quiz/stroke/dir.ts";
import g1 from "../quiz/kanji/1.ts";
import { KanjiList as L1 } from "../quiz/kanji/1.ts";
import { KanjiList as L2 } from "../quiz/kanji/2.ts";
import { KanjiList as L3 } from "../quiz/kanji/3.ts";
import { KanjiList as L4 } from "../quiz/kanji/4.ts";
import { KanjiList as L5 } from "../quiz/kanji/5.ts";
import { KanjiList as L6 } from "../quiz/kanji/6.ts";

// Silence "unused" — g1 default import only here to assert the module shape.
void g1;

const GRADE_LISTS = [L1, L2, L3, L4, L5, L6];

const CACHE_DIR = new URL("./.cache/kanjivg/", import.meta.url);
const OUT_STROKES = new URL("../quiz/stroke/kanji_strokes.ts", import.meta.url);
const OUT_PATHS = new URL("../quiz/stroke/kanji_paths.ts", import.meta.url);
const RAW_BASE =
  "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/";
const UA = "kids-study stroke generator (github.com/kuboon/kids-study)";

// Tiny strokes (dots / stubs) have no reliable start→end vector; fall back to a
// primary direction keyed off KanjiVG's kvg:type. Screen-y-down indices.
const TINY_LEN = 8; // in the 109-unit KanjiVG canvas
const TYPE_FALLBACK: Record<string, number> = {
  "㇐": 0, // héng   横 → E
  "㇑": 2, // shù    縦 → S
  "㇒": 3, // piě    左払い → SW
  "㇏": 1, // nà     右払い → SE
  "㇔": 1, // diǎn   点 → SE
  "㇀": 7, // tí     はね上げ → NE
};
const DEFAULT_FALLBACK = 1; // SE

// A stroke with a sharp corner (折れ, e.g. ┓ 横折) can't be one direction, so
// we split it into a short sequence of directions. These thresholds decide
// when a bend is real vs. a gentle curve or an end hook (はね).
const CORNER_DIST = 16; // min perpendicular deviation from the start→end line
const MIN_SEG = 22; // each half of a bent stroke must be at least this long

// ---- SVG path walker -------------------------------------------------------

type Pt = { x: number; y: number };

const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g;

/** Walk a path `d`, returning every on-curve point (each command's endpoint). */
export const pathVertices = (d: string): Pt[] => {
  const tk = d.match(TOKEN_RE) ?? [];
  let i = 0;
  const num = () => parseFloat(tk[i++]);
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let started = false;
  let cmd = "";
  const pts: Pt[] = [];
  const isCmd = (t: string) => /^[MmLlHhVvCcSsQqTtAaZz]$/.test(t);

  while (i < tk.length) {
    if (isCmd(tk[i])) cmd = tk[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        let x = num(), y = num();
        if (rel && started) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        sx = cx;
        sy = cy;
        started = true;
        pts.push({ x: cx, y: cy });
        cmd = rel ? "l" : "L"; // extra pairs after M are implicit lineto
        break;
      }
      case "L":
      case "T": {
        let x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        pts.push({ x: cx, y: cy });
        break;
      }
      case "H": {
        let x = num();
        if (rel) x += cx;
        cx = x;
        pts.push({ x: cx, y: cy });
        break;
      }
      case "V": {
        let y = num();
        if (rel) y += cy;
        cy = y;
        pts.push({ x: cx, y: cy });
        break;
      }
      case "C": {
        num(), num(), num(), num(); // 2 control points
        let x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        pts.push({ x: cx, y: cy });
        break;
      }
      case "S":
      case "Q": {
        num(), num(); // 1 control point
        let x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        pts.push({ x: cx, y: cy });
        break;
      }
      case "A": {
        num(), num(), num(), num(), num(); // rx ry rot large sweep
        let x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        pts.push({ x: cx, y: cy });
        break;
      }
      case "Z": {
        cx = sx;
        cy = sy;
        pts.push({ x: cx, y: cy });
        break;
      }
      default:
        i++; // safety: never loop forever on junk
    }
  }
  return pts.length ? pts : [{ x: cx, y: cy }];
};

export const pathEndpoints = (d: string): { start: Pt; end: Pt } => {
  const pts = pathVertices(d);
  return { start: pts[0], end: pts[pts.length - 1] };
};

// ---- direction extraction --------------------------------------------------

const firstType = (type: string | undefined): number | null => {
  if (!type) return null;
  const ch = [...type][0];
  return ch in TYPE_FALLBACK ? TYPE_FALLBACK[ch] : DEFAULT_FALLBACK;
};

const perpDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
};

/**
 * One or two 8-direction codes for a stroke. A sharp corner (the vertex that
 * deviates most from the straight start→end line) splits the stroke into two
 * directions; an end hook (short tail) or a gentle curve stays single.
 */
export const strokeDirs = (d: string, type: string | undefined): number[] => {
  const pts = pathVertices(d);
  const start = pts[0], end = pts[pts.length - 1];
  const dx = end.x - start.x, dy = end.y - start.y;
  if (Math.hypot(dx, dy) < TINY_LEN) {
    return [firstType(type) ?? DEFAULT_FALLBACK];
  }

  let corner = -1, best = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const dist = perpDist(pts[k], start, end);
    if (dist > best) {
      best = dist;
      corner = k;
    }
  }
  if (corner >= 0 && best >= CORNER_DIST) {
    const c = pts[corner];
    const l1 = Math.hypot(c.x - start.x, c.y - start.y);
    const l2 = Math.hypot(end.x - c.x, end.y - c.y);
    if (l1 >= MIN_SEG && l2 >= MIN_SEG) {
      const d1 = quantize8(c.x - start.x, c.y - start.y);
      const d2 = quantize8(end.x - c.x, end.y - c.y);
      if (d1 !== d2) return [d1, d2];
    }
  }
  return [quantize8(dx, dy)];
};

export type Stroke = { d: string; dirs: number[] };

/** Extract ordered strokes (rendered path + swipe directions) from one SVG. */
export const svgStrokes = (svg: string): Stroke[] => {
  const tags = svg.match(/<path\b[^>]*>/g) ?? [];
  const out: Stroke[] = [];
  for (const tag of tags) {
    const d = tag.match(/\bd="([^"]+)"/)?.[1];
    if (!d) continue;
    const type = tag.match(/kvg:type="([^"]+)"/)?.[1];
    out.push({ d, dirs: strokeDirs(d, type) });
  }
  return out;
};

// ---- fetch with cache ------------------------------------------------------

const codeToFile = (ch: string) =>
  ch.codePointAt(0)!.toString(16).padStart(5, "0") + ".svg";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Returns SVG text, or null if KanjiVG has no such file (404). */
const fetchSvg = async (ch: string): Promise<string | null> => {
  const file = codeToFile(ch);
  const cached = new URL(file, CACHE_DIR);
  try {
    return await Deno.readTextFile(cached);
  } catch { /* not cached yet */ }

  let delay = 500;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(RAW_BASE + file, {
        headers: { "user-agent": UA },
      });
      if (res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await Deno.mkdir(CACHE_DIR, { recursive: true });
      await Deno.writeTextFile(cached, text);
      await sleep(100); // be polite to raw.githubusercontent
      return text;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(delay);
      delay *= 2;
    }
  }
  return null;
};

// ---- collect target chars --------------------------------------------------

const collectChars = (): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of GRADE_LISTS) {
    for (const entry of list) {
      const ch = entry.q;
      if (ch.length >= 1 && !seen.has(ch)) {
        seen.add(ch);
        out.push(ch);
      }
    }
  }
  return out;
};

// ---- main ------------------------------------------------------------------

const main = async () => {
  const args = Deno.args.filter((a) => a !== "--dry");
  const dry = Deno.args.includes("--dry");
  const chars = args.length > 0 ? args : collectChars();

  const dirData: Record<string, number[][]> = {};
  const pathData: Record<string, string[]> = {};
  const missing: string[] = [];
  for (const ch of chars) {
    const svg = await fetchSvg(ch);
    if (!svg) {
      missing.push(ch);
      continue;
    }
    const strokes = svgStrokes(svg);
    if (strokes.length === 0) {
      missing.push(ch);
      continue;
    }
    dirData[ch] = strokes.map((s) => s.dirs);
    pathData[ch] = strokes.map((s) => s.d);
    const arrows = strokes
      .map((s) => s.dirs.map((i) => DIR_ARROWS[i]).join(""))
      .join(" ");
    console.log(`${ch} ${codeToFile(ch)}: ${arrows}`);
  }
  if (missing.length) {
    console.warn(
      `\n%c${missing.length} skipped (no KanjiVG / no strokes): ${
        missing.join("")
      }`,
      "color:orange",
    );
  }

  if (dry) {
    console.log(
      `\n(dry run, ${Object.keys(dirData).length} chars, not written)`,
    );
    return;
  }

  const keys = Object.keys(dirData).sort((a, b) =>
    a.codePointAt(0)! - b.codePointAt(0)!
  );
  const attribution =
    `// Derived from KanjiVG (https://kanjivg.tagaini.net), (C) Ulrich Apel,
// licensed CC BY-SA 3.0. This derived data is likewise CC BY-SA 3.0.
// See /NOTICE.`;

  const dirLines = keys.map((ch) => {
    const strokes = dirData[ch];
    const arrows = strokes
      .map((s) => s.map((i) => DIR_ARROWS[i]).join(""))
      .join(" ");
    const body = strokes.map((s) => `[${s.join(", ")}]`).join(", ");
    return `  ${JSON.stringify(ch)}: [${body}], // ${arrows}`;
  });
  await Deno.writeTextFile(
    OUT_STROKES,
    `// AUTO-GENERATED by tools/gen_kanji_strokes.ts. DO NOT EDIT.
${attribution}
//
// Each value is a list of strokes in writing order. Each stroke is a list of
// one or more 8-direction codes (see quiz/stroke/dir.ts): 0=E 1=SE 2=S 3=SW
// 4=W 5=NW 6=N 7=NE. A bent stroke (e.g. ┓) has two codes ([0, 2] = →↓).

export const KANJI_STROKES: Record<string, readonly (readonly number[])[]> = {
${dirLines.join("\n")}
};
`,
  );

  const pathLines = keys.map((ch) => {
    const ds = pathData[ch].map((d) => JSON.stringify(d)).join(", ");
    return `  ${JSON.stringify(ch)}: [${ds}],`;
  });
  await Deno.writeTextFile(
    OUT_PATHS,
    `// AUTO-GENERATED by tools/gen_kanji_strokes.ts. DO NOT EDIT.
${attribution}
//
// Each value is the list of KanjiVG stroke paths (SVG path "d", 109x109
// viewBox) in writing order, used to draw the kanji one stroke at a time.

export const KANJI_PATHS: Record<string, readonly string[]> = {
${pathLines.join("\n")}
};
`,
  );
  console.log(
    `\nwrote ${keys.length} chars → kanji_strokes.ts + kanji_paths.ts`,
  );
};

if (import.meta.main) await main();

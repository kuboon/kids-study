/**
 * 8-direction quantization, shared by the data generator and the game so the
 * two never drift. Everything here is **screen-y-down** (the coordinate system
 * of both SVG and pointer events): +x = right, +y = down. No sign flipping.
 *
 *   index: 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE
 *
 * Only the arrow glyphs are written in human ("up is up") terms, since those
 * are for display.
 */

export const DIRS = 8;

/** Quantize a screen-y-down vector to one of 8 direction indices. */
export const quantize8 = (dx: number, dy: number): number => {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI; // 0=E, +90=S(down), 180=W, -90=N(up)
  return ((Math.round(deg / 45) % DIRS) + DIRS) % DIRS;
};

/** Arrow glyph per direction index (screen-y-down index → human arrow). */
export const DIR_ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"] as const;

export type Pt = { x: number; y: number };

const perpDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
};

// Ramer–Douglas–Peucker: keep only vertices that bend the polyline by > eps.
const rdp = (pts: Pt[], eps: number): Pt[] => {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  let idx = -1, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max > eps && idx > 0) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
};

/**
 * Reduce a freehand drag (screen points) to its dominant 8-direction sequence.
 * A straight flick yields one direction; a single L-shaped gesture (drawn
 * without lifting the finger, e.g. ┓) yields two — the corner is detected by
 * simplifying the path and reading the direction of each surviving segment.
 * `eps` is the corner sensitivity and `minSeg` drops segments too short to
 * count, both in the same (pixel) units as the points.
 */
export const gestureDirs = (
  pts: readonly Pt[],
  eps = 26,
  minSeg = 18,
): number[] => {
  if (pts.length < 2) return [];
  const simp = rdp(pts.slice(), eps);
  const dirs: number[] = [];
  for (let i = 1; i < simp.length; i++) {
    const dx = simp[i].x - simp[i - 1].x, dy = simp[i].y - simp[i - 1].y;
    if (Math.hypot(dx, dy) < minSeg) continue;
    const d = quantize8(dx, dy);
    if (dirs.length === 0 || dirs[dirs.length - 1] !== d) dirs.push(d);
  }
  return dirs;
};

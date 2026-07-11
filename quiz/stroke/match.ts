/**
 * Fuzzy stroke matching. Instead of reducing a stroke to a coarse direction,
 * we compare the *shape* of what the player drew against the real KanjiVG
 * stroke: resample both to the same number of arc-length-even points (in the
 * shared 109x109 canvas space) and take the mean point-to-point distance. A
 * small distance means "close enough". Orientation matters — a stroke drawn
 * backwards lands far from the target — which is what we want for writing
 * order. Pure and DOM-free so it can be unit-tested; the game feeds it points
 * sampled from the SVG (getPointAtLength) and the pointer (mapped via the
 * SVG's screen CTM).
 */

export type P = { x: number; y: number };

const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Resample a polyline to exactly `n` points evenly spaced by arc length. */
export const resample = (pts: readonly P[], n: number): P[] => {
  if (n < 2) throw new Error("n must be >= 2");
  if (pts.length === 0) return [];
  if (pts.length === 1) {
    return Array.from({ length: n }, () => ({ ...pts[0] }));
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));

  const step = total / (n - 1);
  const out: P[] = [{ ...pts[0] }];
  for (let j = 1; j < n - 1; j++) {
    const target = j * step;
    let k = 1;
    while (k < pts.length - 1 && cum[k] < target) k++;
    const segLen = cum[k] - cum[k - 1] || 1;
    const t = (target - cum[k - 1]) / segLen;
    out.push({
      x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t,
      y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t,
    });
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
};

/** Mean point-to-point distance between two equal-length point lists. */
export const meanDistance = (a: readonly P[], b: readonly P[]): number => {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let s = 0;
  for (let i = 0; i < n; i++) s += dist(a[i], b[i]);
  return s / n;
};

/**
 * Shape distance between a drawn stroke and a target stroke, both in the same
 * (109-unit) canvas space. Lower = more similar; compare against a threshold.
 */
export const strokeDistance = (
  drawn: readonly P[],
  target: readonly P[],
  n = 16,
): number => meanDistance(resample(drawn, n), resample(target, n));

/** Straight-line length of a polyline (for detecting dot-like strokes). */
export const polylineLength = (pts: readonly P[]): number => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
};

export const centroid = (pts: readonly P[]): P => {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
};

export const pointDistance = dist;

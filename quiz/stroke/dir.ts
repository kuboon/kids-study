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

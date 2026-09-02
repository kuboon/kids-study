/**
 * 答えや問題文を canvas に描くための数式描画。
 *
 * HTML に流し込むゲームは MathML をそのまま `innerHTML` に渡せばよいが、
 * canvas（`fillText`）には MathML が無い。そこで `mathTokens` で分数を取り出し、
 * 分子・横棒・分母を自前で組む。見た目は MathML 版に寄せてある。
 *
 * 3つのゲーム（cannon-blast / gate-runner / minecart）が同じ「文字列を1行で
 * 中央に描き、はみ出すならフォントを縮める」処理を持っていたので、その縮小も
 * ここにまとめた。
 */

import { type MathToken, mathTokens } from "../../../quiz/math/mathml.ts";

/** 分数の横棒の太さ（フォントサイズに対する比）。 */
const RULE_RATIO = 0.07;
/**
 * 分子・分母の文字を本文よりどれだけ小さくするか。CSS 側で
 * `math-style: normal`（教科書と同じ大きさの分数）にしてあるので、
 * canvas もほぼ縮めずに揃える。
 */
const PART_RATIO = 0.88;
/** 分数の左右の余白（フォントサイズに対する比）。 */
const PAD_RATIO = 0.16;
/** 分数の高さ（フォントサイズに対する比）。分子・横棒・分母の合計。 */
const FRAC_HEIGHT_RATIO = PART_RATIO * 2.4;

const font = (size: number, family: string) => `bold ${size}px ${family}`;

const partWidth = (
  ctx: CanvasRenderingContext2D,
  t: MathToken,
  size: number,
  family: string,
): number => {
  if (t.kind === "text") {
    ctx.font = font(size, family);
    return ctx.measureText(t.text).width;
  }
  ctx.font = font(size * PART_RATIO, family);
  const w = Math.max(
    ctx.measureText(t.num).width,
    ctx.measureText(t.den).width,
  );
  return w + size * PAD_RATIO * 2;
};

/** 1行に並べたときの全体の幅。 */
export const measureMath = (
  ctx: CanvasRenderingContext2D,
  tokens: MathToken[],
  size: number,
  family: string,
): number => tokens.reduce((w, t) => w + partWidth(ctx, t, size, family), 0);

/**
 * `maxWidth`（と指定があれば `maxHeight`）に収まる最大のフォントサイズ。
 * 分数は横に狭く縦に高いので、幅だけで決めると枠から縦にはみ出す。
 */
export const fitMathSize = (
  ctx: CanvasRenderingContext2D,
  tokens: MathToken[],
  opts: {
    base: number;
    min: number;
    maxWidth: number;
    maxHeight?: number;
    family: string;
  },
): number => {
  const { base, min, maxWidth, maxHeight, family } = opts;
  let size = base;
  const w = measureMath(ctx, tokens, size, family);
  if (w > maxWidth) size = base * maxWidth / w;
  if (maxHeight !== undefined && tokens.some((t) => t.kind === "frac")) {
    size = Math.min(size, maxHeight / FRAC_HEIGHT_RATIO);
  }
  return Math.max(min, Math.floor(size));
};

/**
 * `x` を中心、`y` を上下の中心として1行に描く。
 * `textAlign` / `textBaseline` は内部で設定するので呼び出し側は気にしなくてよい。
 */
export const fillMath = (
  ctx: CanvasRenderingContext2D,
  tokens: MathToken[],
  x: number,
  y: number,
  size: number,
  family: string,
): void => {
  const total = measureMath(ctx, tokens, size, family);
  let at = x - total / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const t of tokens) {
    const w = partWidth(ctx, t, size, family);
    if (t.kind === "text") {
      ctx.font = font(size, family);
      ctx.fillText(t.text, at, y);
    } else {
      const inner = size * PART_RATIO;
      const rule = Math.max(1, size * RULE_RATIO);
      const cx = at + w / 2;
      ctx.font = font(inner, family);
      ctx.fillText(
        t.num,
        cx - ctx.measureText(t.num).width / 2,
        y - inner * 0.62,
      );
      ctx.fillText(
        t.den,
        cx - ctx.measureText(t.den).width / 2,
        y + inner * 0.62,
      );
      ctx.fillRect(
        at + size * PAD_RATIO * 0.5,
        y - rule / 2,
        w - size * PAD_RATIO,
        rule,
      );
    }
    at += w;
  }
};

/**
 * markup を1行で中央に描く。フォントの縮小まで含めた一括版で、
 * canvas を使う3ゲームはこれだけ呼べばよい。
 */
export const drawMathLine = (
  ctx: CanvasRenderingContext2D,
  html: string,
  opts: {
    x: number;
    y: number;
    base: number;
    min?: number;
    maxWidth: number;
    maxHeight?: number;
    family?: string;
  },
): void => {
  const family = opts.family ?? "sans-serif";
  const tokens = mathTokens(html);
  const size = fitMathSize(ctx, tokens, {
    base: opts.base,
    min: opts.min ?? Math.min(9, opts.base),
    maxWidth: opts.maxWidth,
    maxHeight: opts.maxHeight,
    family,
  });
  fillMath(ctx, tokens, opts.x, opts.y, size, family);
};

/**
 * 分数の表示。「1/2」というスラッシュ表記は子どもが読みにくいので、横棒つきの
 * 本来の分数として見せる。組版は MathML（`<mfrac>`）に任せる。
 *
 * ゲームは答えを2通りに描く。HTML に流し込むもの（`innerHTML`）と canvas に
 * 描くもの（`fillText`）があり、後者では MathML が使えない。そこで
 *   - markup を組む関数（`frac` / `mathRow`）
 *   - それを読み戻す関数（`mathTokens` / `plainMath`）
 * を対にしてここに置き、canvas 側は token を見て横棒を自前で引く。
 *
 * パーサは DOM を使わず文字列処理で完結させる。DOMParser の無い Deno の
 * テストから同じ関数を呼べるようにするためで、対象は自分で組んだ markup
 * だけなので汎用の MathML を読む必要はない。
 */

/** 描画のための最小単位。`frac` 以外はすべて `text` に潰す。 */
export type MathToken =
  | { kind: "text"; text: string }
  | { kind: "frac"; num: string; den: string };

/** 分数1つ分の markup（`<math>` は含まない。式に混ぜるため）。 */
export const mfrac = (num: number | string, den: number | string): string =>
  `<mfrac><mn>${num}</mn><mn>${den}</mn></mfrac>`;

/** 数値1つ分の markup。 */
export const mn = (v: number | string): string => `<mn>${v}</mn>`;

/** 演算子1つ分の markup。プレーン表記では前後に空白が入る。 */
export const mo = (v: string): string => `<mo>${v}</mo>`;

/**
 * 式全体を1つの `<math>` にまとめる。分数どうしの足し算で演算子の高さを
 * 揃えるには、分数ごとに `<math>` を分けず1つの式にする必要がある。
 */
export const mathRow = (...parts: string[]): string =>
  `<math>${parts.join("")}</math>`;

/** 単独の分数。約分は呼び出し側の責任（`common.ts` の `fraction`）。 */
export const frac = (num: number | string, den: number | string): string =>
  mathRow(mfrac(num, den));

/** `<math>` ブロックとそれ以外を分けるための切り出し。 */
const MATH_BLOCK = /<math>([\s\S]*?)<\/math>/g;

/** `<math>` の中身。分数を先に見て、それ以外の要素は中身だけ取る。 */
const MATH_ITEM =
  /<mfrac><mn>([^<]*)<\/mn><mn>([^<]*)<\/mn><\/mfrac>|<(mn|mi)>([^<]*)<\/\3>|<mo>([^<]*)<\/mo>/g;

const TAG = /<[^>]*>/g;

const pushText = (out: MathToken[], text: string): void => {
  if (!text) return;
  const last = out[out.length - 1];
  // 連続する text は1つにまとめる。canvas 側の測定が素直になる。
  if (last?.kind === "text") last.text += text;
  else out.push({ kind: "text", text });
};

/**
 * 表示用の markup を描画単位に分解する。`<math>` の外側や未知のタグは
 * これまでの `stripHtml` と同じくタグを剥がした文字列として扱う。
 */
export const mathTokens = (html: string): MathToken[] => {
  const out: MathToken[] = [];
  let at = 0;
  MATH_BLOCK.lastIndex = 0;
  for (let b = MATH_BLOCK.exec(html); b; b = MATH_BLOCK.exec(html)) {
    pushText(out, html.slice(at, b.index).replace(TAG, ""));
    at = b.index + b[0].length;
    MATH_ITEM.lastIndex = 0;
    for (let m = MATH_ITEM.exec(b[1]); m; m = MATH_ITEM.exec(b[1])) {
      if (m[1] !== undefined) out.push({ kind: "frac", num: m[1], den: m[2] });
      else if (m[4] !== undefined) pushText(out, m[4]);
      else pushText(out, ` ${m[5]} `);
    }
  }
  pushText(out, html.slice(at).replace(TAG, ""));
  return out;
};

/**
 * markup をプレーンな文字列に落とす（分数は `1/2`）。答えの同一判定や
 * canvas に描けない場面のフォールバックに使う。
 */
export const plainMath = (html: string): string =>
  mathTokens(html)
    .map((t) => (t.kind === "frac" ? `${t.num}/${t.den}` : t.text))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

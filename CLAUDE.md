# kids-study

こども向けの学習ゲーム集。Remix v3 + Deno をベースに、GitHub Pages
向けの静的サイトとしてビルドする。`deno-remix-reference` の構成を踏襲している。

## 構造

- `src/ssg/` — SSG ページ定義
  - `index.tsx` — ホーム頁（ゲーム選択ランチャ）
  - `mod.ts` — ビルダー向けの page リスト（path + module URL）
  - `layout/document.tsx` — ナビ付きシェル
  - `layout/routes.ts` — ルート定義
- `src/client/` — クライアント側コード
  - `entry.ts` — `@remix-run/ui` の `run()` ブートストラップ（HTML
    から読まれる）
  - `menu.tsx` — ランチャの `clientEntry`（ゲーム種別ドロップダウン +
    クイズ一覧）
  - `games/<name>/mod.ts` — 各ゲーム本体（`GameModule` を default export）
  - `games/types.ts` — `GameModule` / `GameMount` IF
- `src/builder/` — `Deno.bundle` で JS、`@kuboon/tailwindcss-deno` で Tailwind
  CSS をビルドし `dist/` に出力
  - `ssg.ts` は page module を **動的 import** で読む。これは builder 側の TS
    Program に DOM 依存のクライアントコードを引き込まないため。SSG 関連を
    リファクタするときも、この境界（builder ↔ ssg/client）は維持する
- `quiz/` — 教科ごとの問題ジェネレータ（後述）
- `src/assets/style.css` — Tailwind + daisyUI エントリ

## 開発

```bash
deno task dev      # bundle 後に deno serve で開発サーバー起動
deno task build    # dist/ に静的サイトを書き出す
deno task test     # ルーターのテスト
deno task check    # check + lint + fmt
```

`mise run build` は GitHub Pages デプロイワークフローから呼ばれる。

## クイズ

教科非依存の問題ソース。ゲームはどんな教科の `QuizGenerator` でも遊べる
ように作る。

- `quiz/types.ts`
  - `Quiz` — `{ q: HtmlString, a: HtmlString, wrong(): HtmlString }`
  - `QuizGenerator` — `{ title: string, grade: Grade, fn(seed: number): Quiz }`
  - `Grade` — 配当学年 1〜6（学習指導要領の内容配当に合わせる）と、小学校の
    範囲を超えるものを表す `ADVANCED`（負の数は中学1年）
- `quiz/prng.ts` — シード可能な PRNG（pure-rand ベース）。`fn(seed)` は同じ seed
  なら同じ問題を返すように決定的に実装する
- `quiz/<topic>.ts` または `quiz/<topic>/<n>.ts` — 教科別ファイル。
  `QuizGenerator[]` を default export（タイトル違いの複数バリエーションを
  並べてよい）
- `quiz/mod.ts` — 全教科の `QuizGenerator` を flat に集約。ランチャはこの
  配列を見る

クイズ追加: 新規ファイルで `QuizGenerator[]` を default export し、
`quiz/mod.ts` の配列に `...newTopic` で足す。`grade` は「何年生で習う内容か」を
学習指導要領で確かめて決める。ランチャは一覧を `grade`
ごとに束ねて表示するので、 タイトルに学年は入れない（1年生向けは
まだ漢字を習っていないのでかな書き）。

## 漢字の出題データ

読み4択と書き取りは**同じ語データ**から出題する。漢字ごとの読み一覧
（辞書）から機械的に問題を作ると、「読みだけでは漢字が定まらない」 （[き] →
木/汽/期/季…）「小学校で習わない読みが混ざる」（奈 → いかん）が
構造的に避けられないため、**語を単位に人が書き、コードは検証に徹する**。

- `quiz/kanji/types.ts` — `KanjiWord`（`target` ＋ 読み `read` ＋ 前後の文脈
  `pre`/`post`。文脈はかなのみ）と表示関数
  - 書き取り: `pre + [read] + post` を見せて `target` を書かせる（てん[き]）
  - 読み4択: `pre + [target] + post` を見せて読みを選ばせる（てん[気]）
- `quiz/kanji/words/<n>.ts` — 学年別の語データ。**唯一の真実**。手で編集する
- `quiz/kanji/words_test.ts` — 検証。一意性（同じ出題文が別の漢字を指さない）、
  読みが辞書に存在すること、文脈がかなのみ、配当表の全漢字を網羅、を保証する
- `tools/kanji_readings.ts` — **自動生成**（`deno task gen:readings`）。検証用の
  参照表で、クライアントには含まれない

語を足す・直すときは `quiz/kanji/words/<n>.ts` を編集して `deno task test`。
「小学校で習う読みか」だけは機械判定できない（常用漢字表の音訓データが
入手できない）ので、日常語を選ぶ編集判断で担保する。

## ストローク（書き取り）クイズ

`Quiz`（4択）とは別系統の抽象。「順序付きストローク列＝方向コード列で答える
問題」を表し、漢字かきとりゲームが使う。

- `quiz/stroke/types.ts` — `StrokeQuiz`（`label` ＋ 8方向コード列 `strokes`）と
  `StrokeQuizGenerator`
- `quiz/stroke/dir.ts` — `quantize8()` と
  `DIR_ARROWS`（生成スクリプトとゲームで共有）
- `quiz/stroke/kanji_strokes.ts` —
  **自動生成**（`tools/gen_kanji_strokes.ts`）。 KanjiVG
  由来のストロークデータで、CC BY-SA 3.0（`/NOTICE` 参照）。編集しない
- `quiz/stroke/kanji.ts` — 書き取りの generator。出題語は読み4択と共通の
  `quiz/kanji/words/*.ts`（前述）から引く
- `quiz/stroke/mod.ts` — stroke 系 `StrokeQuizGenerator` を flat 集約
- データ再生成（ローカルで1回・要ネット、成果物をコミット）:
  - `deno task gen:readings` — 検証用の読み参照表 `tools/kanji_readings.ts`
  - `deno task gen:strokes` — 語データの全漢字について KanjiVG から
    `kanji_paths.ts` を生成

ストローク系ゲームは `src/client/games/stroke_types.ts` の `StrokeGameMount` を
実装する。書き取りは入力方法が根本的に違うため他のゲームでは遊べない。そこで
`menu.tsx` のゲーム種別プルダウンには載せず、一覧で書き取りの問題が選ばれたら
自動で「漢字かきとり」を mount する（4択の問題は選択中のゲームで遊ぶ）。

## ゲーム追加手順

1. `src/client/games/<name>/mod.ts` を作る。
   ```ts
   import type { GameModule, GameMount } from "../types.ts";

   export const mount: GameMount = (container, { quiz, onComplete }) => {
     // container に canvas / HTML を append。teardown 関数を返す
     return () => {/* dispose */};
   };

   const game: GameModule = { title: "...", mount };
   export default game;
   ```
   - 任意の `QuizGenerator` を受け取って `quiz.fn(seed)` で問題を引く
   - container は `position: relative` 確保済みの空の HTMLElement
   - canvas が必要ならゲーム内で作って append、HUD も同様。すべて teardown で
     後始末
2. `src/client/menu.tsx` に取り込む:
   - `QuizKind` 型に `"<name>"` を追加
   - `loadGame` の分岐に `import("./games/<name>/mod.ts")` を追加
   - `GAME_OPTIONS` に `{ value: "<name>", label: "表示名" }` を追加
3. これだけ。SSG ページ・ナビ・ルート・`JS_ENTRIES` は触らない（ゲームは
   `menu.js` 内に dynamic import 経由で取り込まれる）。

`<Frame>` は SSG 環境では機能しないので使わない。インタラクティブな UI は すべて
`clientEntry` 経由でハイドレートする。

## コーディング規約

- Deno ファースト (Web API 優先)
- TypeScript strict mode
- テストは `Deno.test()` + `@std/assert`
- ファイル名はスネークケース

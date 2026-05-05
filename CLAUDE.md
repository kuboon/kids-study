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
  - `entry.ts` — `@remix-run/ui` の `run()` ブートストラップ（HTML から読まれる）
  - `menu.tsx` — ランチャの `clientEntry`（ゲーム種別ドロップダウン + クイズ一覧）
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
  - `QuizGenerator` — `{ title: string, fn(seed: number): Quiz }`
- `quiz/prng.ts` — シード可能な PRNG（pure-rand ベース）。`fn(seed)` は同じ
  seed なら同じ問題を返すように決定的に実装する
- `quiz/<topic>.ts` または `quiz/<topic>/<n>.ts` — 教科別ファイル。
  `QuizGenerator[]` を default export（タイトル違いの複数バリエーションを
  並べてよい）
- `quiz/mod.ts` — 全教科の `QuizGenerator` を flat に集約。ランチャはこの
  配列を見る

クイズ追加: 新規ファイルで `QuizGenerator[]` を default export し、
`quiz/mod.ts` の配列に `...newTopic` で足す。

## ゲーム追加手順

1. `src/client/games/<name>/mod.ts` を作る。
   ```ts
   import type { GameModule, GameMount } from "../types.ts";

   export const mount: GameMount = (container, { quiz, onComplete }) => {
     // container に canvas / HTML を append。teardown 関数を返す
     return () => { /* dispose */ };
   };

   const game: GameModule = { title: "...", mount };
   export default game;
   ```
   - 任意の `QuizGenerator` を受け取って `quiz.fn(seed)` で問題を引く
   - container は `position: relative` 確保済みの空の HTMLElement
   - canvas が必要ならゲーム内で作って append、HUD も同様。すべて teardown で
     後始末
2. `src/client/menu.tsx` に取り込む:
   - `GameKind` 型に `"<name>"` を追加
   - `loadGame` の分岐に `import("./games/<name>/mod.ts")` を追加
   - ドロップダウンの `<option value="<name>">表示名</option>` を追加
3. これだけ。SSG ページ・ナビ・ルート・`JS_ENTRIES` は触らない（ゲームは
   `menu.js` 内に dynamic import 経由で取り込まれる）。

`<Frame>` は SSG 環境では機能しないので使わない。インタラクティブな UI は
すべて `clientEntry` 経由でハイドレートする。

## コーディング規約

- Deno ファースト (Web API 優先)
- TypeScript strict mode
- テストは `Deno.test()` + `@std/assert`
- ファイル名はスネークケース

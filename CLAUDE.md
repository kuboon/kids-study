# kids-study

こども向けの学習ゲーム集。Remix v3 + Deno をベースに、GitHub Pages
向けの静的サイトとしてビルドする。`deno-remix-reference` の構成を踏襲している。

## 構造

- `src/server/` — Remix v3 fetch-router によるサーバー定義
  - `router.ts` — ミドルウェアとルーティング
  - `routes.ts` — ルート定義
  - `controllers/` — ページごとのアクション
  - `ui/document.tsx` — ナビ + `<Frame name="content">` のシェル
  - `utils/render.tsx` — シェル/フラグメントのレンダリングヘルパ
  - `build.ts` — `dist/` への SSG ビルド
- `src/client/` — クライアント側エントリ (`@remix-run/ui` の `clientEntry`)
  - `mod.ts` → `hydration.ts` → `Counter` などをハイドレート
- `src/bundler/` — `Deno.bundle` で JS、`@kuboon/tailwindcss-deno` で Tailwind
  CSS をビルドし `src/bundled/` に出力
- `src/assets/style.css` — Tailwind + daisyUI エントリ

## 開発

```bash
deno task dev      # bundle 後に deno serve で開発サーバー起動
deno task build    # dist/ に静的サイトを書き出す
deno task test     # ルーターのテスト
deno task check    # check + lint + fmt
```

`mise run build` は GitHub Pages デプロイワークフローから呼ばれる。

## コーディング規約

- Deno ファースト (Web API 優先)
- TypeScript strict mode
- テストは `Deno.test()` + `@std/assert`
- ファイル名はスネークケース

# もじれんしゅう (Kids Writing Practice)

iPad + Apple Pencil 向けの、ひらがな・カタカナ・アルファベット・漢字・英単語の
書き取りれんしゅうアプリ。毎日やるとスタンプ帳に絵文字スタンプが貯まります。

- **1年生モード**: ひらがな46 / カタカナ46 / アルファベット A–Z（大小）。バツなし、いつも褒める。
- **4年生モード**: 文部科学省「学年別漢字配当表」4年 202字 + 基礎英単語約50語。
- **完全オフライン**: すべての進捗は localStorage のみ（サーバなし）。
- **GitHub Pages 対応**: SPA 静的配信。ホーム画面に追加してオフラインでも遊べます。

## 技術スタック

- **Runtime/tasks**: Deno 2
- **Bundler**: Vite 5
- **UI**: Preact 10 + TypeScript（JSX runtime）
- **Routing**: 自前のハッシュルータ（`src/lib/router.ts`）

> 当初 Remix v3 (alpha) を検討しましたが、`@remix-run/dom` の README に
> "DO NOT USE UNDER CONSTRUCTION" と明記されており stable 版までは実用リスクが
> 高いため、Remix v3 がレンダリング基盤に採用する Preact を直接使う構成にしました。
> 将来 Remix v3 が stable 化した際は、`src/App.tsx` のルーティングのみ置き換えれば
> 移行できる粒度でコンポーネント分割しています。

## 開発

```bash
# Deno 前提
deno task install
deno task dev      # http://localhost:5173
deno task build    # build/ に静的ファイル出力
deno task preview
```

npm でも動きます:

```bash
npm install
npm run dev
npm run build
```

## 構成

```
src/
├── App.tsx                 # ルート分岐
├── main.tsx
├── components/
│   └── WritingCanvas.tsx   # SVG + Pointer Events で書き取り UI
├── pages/
│   ├── HomePage.tsx        # アカウント選択
│   ├── AccountNewPage.tsx  # 新規登録
│   ├── GradeHomePage.tsx   # 学年ホーム（デッキ一覧）
│   ├── PlayPage.tsx        # 書き取り画面
│   └── StampsPage.tsx      # スタンプ帳
├── lib/
│   ├── storage.ts          # localStorage ラッパ
│   ├── progress.ts         # デッキ進捗・レベルアップ・連続日数
│   ├── stamps.ts           # 絵文字プール
│   ├── praise.ts           # 褒め言葉プール
│   └── router.ts           # useHashRoute + matchRoute
└── data/
    ├── hiragana.ts, katakana.ts, alphabet.ts
    ├── kanji-grade4.ts
    ├── english-basic.ts
    └── decks.ts            # カテゴリ束ね
```

## デプロイ

main ブランチに push すると `.github/workflows/deploy.yml` が動き、
GitHub Pages に自動デプロイされます。リポジトリ名と同じサブパス（例
`/kids-study/`）にホストされる前提で `BASE_PATH` が設定されます。

1. リポジトリ Settings → Pages → Build and deployment: "GitHub Actions"
2. main に push

## iPad で使うときのコツ

- Safari で開いて「ホーム画面に追加」→ フルスクリーンで動作します。
- Apple Pencil の筆圧が線の太さに反映されます。
- 指でも書けます（推奨は Pencil）。

## データ

- 漢字は「学年別漢字配当表（平成29年告示）」4年 202字に準拠。
- 英単語は色・数・動物・食べ物・自然・身の回り のテーマ別50語程度。

## ライセンス

MIT（`LICENSE` 参照）。

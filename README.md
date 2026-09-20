# AI News

国内外のテック・経済・金融ニュースを毎日集め、Gemini で日本語見出し・重要度の点数・カテゴリー・要約を付けて、スマホで読めるページとして公開する。

## 仕組み

```
毎日 16:43（GitHub Actions。AI の無料枠が空いている米国の深夜）
  → 19の取得元から記事候補を収集（pipeline/sources.js。本文を最後まで取得できる媒体のみ）
  → Gemini 1回で全候補を順位付け・採点・日本語見出し・カテゴリー・重複判定（pipeline/editorial.js の基準）
  → カテゴリーの偏りを抑えて30件を選び、本文を取得して要約（Gemini が混雑したら Groq の GPT-OSS で予備要約）
  → public/data/news.json に保存 → GitHub Pages で公開
```

| 変えたいこと | 編集するファイル |
|---|---|
| 採点基準・要約の書き方・カテゴリー・掲載件数・使用モデル | `pipeline/editorial.js` |
| 取得元サイト | `pipeline/sources.js` |
| 実行時刻 | `.github/workflows/daily-news.yml` の `cron`（UTC表記。16:43 JST = `43 7 * * *`） |

## 初回セットアップ

1. Gemini API キーを発行する（https://aistudio.google.com/apikey 、無料枠あり）
2. GitHub で **公開（Public）** リポジトリを作り、このフォルダを push する
3. リポジトリの Settings → Secrets and variables → Actions → New repository secret で、名前 `GEMINI_API_KEY`、値に API キーを登録する
4. Settings → Pages → Source を **GitHub Actions** にする
5. Actions タブ →「毎朝のニュース更新」→ Run workflow で1回手動実行する
6. （任意）予備の要約AIとして、https://console.groq.com/keys で発行したキーを `GROQ_API_KEY` として同様に登録する
7. 表示された URL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）をスマホで開き、ホーム画面に追加する

## 読み方

- スマホ・Mac とも https://paris75015-png.github.io/ai-news-app/ を開く（`AIニュース起動.command` をダブルクリックしても同じページが開く）
- 中身はクラウド側で毎日更新されるので、Mac の電源が入っていなくても更新される

## 手元で試す

```bash
npm run news -- --dry-run   # AIを呼ばずに収集〜保存の流れだけ確認（見出し・点数は仮）
npm run news                # 本番と同じ処理（.env に GEMINI_API_KEY が必要）
npm run dev                 # http://localhost:5173 で表示（`開発用サーバー起動.command` でも可）
```

## 注意

- Gemini の無料枠では、送った内容（公開ニュース記事）が Google の製品改善に使われる。
- 公開リポジトリなので、コードと生成された要約は誰でも見られる（検索エンジンには載らないよう noindex を指定済み）。
- 生成データは `public/data/archive/` に日付ごとに残る。一度掲載した記事は14日間再掲しない（`data/seen.json`）。

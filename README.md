# ニュース3系統

国内・国際・AI の3つの紙面を毎日（平日）作り、スマホで読める1つのページとして公開する。

全体の網羅は日本経済新聞が担当する前提で、**この3系統は日経を読んだうえでなお足りないものを分担して補う**。

| 系統 | 役割 | 生成 | 時刻(JST) | 費用 |
|---|---|---|---|---|
| **国内深掘り** | 政治・経済・金融。媒体横断の視点 | クラウドの定期実行（Claude Sonnet 5） | 07:00 | 定額内 |
| **国際深掘り** | 日本で報道が薄い論点。戦争・大災害の速報は書かない | クラウドの定期実行（Claude Sonnet 5） | 07:30 | 定額内 |
| **AI日報** | AI・IT・科学技術を広く30件 | GitHub Actions（Gemini / Groq） | 16:43 | 0円（無料枠） |

編集方針はすべて [`editorial/`](editorial/) にある。**中身を変えたいときは、まずそこを読む。**

## 重複の防ぎ方

守備範囲で物理的に分けたうえで、**後から走る系統が先に出た当日分を読んで除外する**。別の台帳は作らない。

```
07:00 国内深掘り  → public/data/domestic.json
07:30 国際深掘り  → public/data/intl.json    （domestic.json を読む）
16:43 AI日報      → public/data/ai.json      （両方を読む）
```

## 仕組み

```
AI日報（GitHub Actions）
  → 12の取得元から記事候補を収集（pipeline/sources.js。本文を最後まで取得できる媒体のみ）
  → 深掘り2系統が当日扱った話題を除外
  → Gemini 1回で全候補を順位付け・採点・日本語見出し・カテゴリー・重複判定（pipeline/editorial.js）
  → カテゴリーの偏りを抑えて30件を選び、本文を取得して要約（混雑時は Groq の GPT-OSS が予備）
  → public/data/ai.json に保存 → GitHub Pages で公開

深掘り2系統（クラウドの定期実行）
  → editorial/ の方針に従って収集・検証・採点・執筆
  → public/data/{domestic,intl}.json に保存して commit & push
```

| 変えたいこと | 編集するファイル |
|---|---|
| 深掘り2系統の編集方針 | `editorial/国内深掘り.md` / `editorial/国際深掘り.md` / `editorial/共通.md` |
| AI日報の採点基準・カテゴリー・掲載件数・使用モデル | `pipeline/editorial.js` |
| AI日報の取得元サイト | `pipeline/sources.js` |
| AI日報の実行時刻 | `.github/workflows/daily-news.yml` の `cron`（UTC表記。平日16:43 JST = `43 7 * * 1-5`） |
| 深掘りの実行時刻 | claude.ai の定期実行の設定（https://claude.ai/code/routines） |
| データの形 | `src/article.js` |

## データの形

3系統とも同じ `Article` 型で書く。詳細は [`src/article.js`](src/article.js)。

- `depth` … `deep`（深掘り 600〜800字）／`brief`（短信 150〜250字）。画面の切り替えはこれ1つで済む
- `sources` … 出典を複数持ち、媒体ごとに `body`（本文確認）／`excerpt`（抜粋確認）／`headline`（見出しのみ）を記録する
- `score` … **系統ごとに独立した尺度**。教科ごとの偏差値と同じで、系統をまたいで比べない
- `productionNote` … 制作記録。品質の点検用に持つが、読む画面には出さない

## 読み方

- スマホ・Mac とも https://paris75015-png.github.io/ai-news-app/ を開く（`AIニュース起動.command` をダブルクリックしても同じページが開く）
- 中身はクラウド側で更新されるので、Mac の電源が入っていなくても更新される
- 画面上部のタブで系統を切り替える。その下で「深掘り／短信」を切り替えられる

## 手元で試す

```bash
npm run news -- --dry-run   # AIを呼ばずに収集〜保存の流れだけ確認（見出し・点数は仮）
npm run news                # 本番と同じ処理（.env に GEMINI_API_KEY が必要）
npm run dev                 # http://localhost:5173 で表示（`開発用サーバー起動.command` でも可）
```

## 注意

- Gemini の無料枠では、送った内容（公開ニュース記事）が Google の製品改善に使われる。
- 公開リポジトリなので、コードと生成された記事は誰でも見られる（検索エンジンには載らないよう noindex を指定済み）。
- 生成データは `public/data/archive/` に日付ごとに残る。AI日報は一度掲載した記事を14日間再掲しない（`data/seen.json`）。

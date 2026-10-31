# ニュース3系統

世界の注目度・国際深掘り・AI日報の3つを毎日（平日）作り、スマホで読める1つのページとして公開する。

全体の網羅は日本経済新聞が担当する前提で、**この3系統は日経を読んだうえでなお足りないものを分担して補う**。
国内の系統（国内深掘り）は 2026-10-01 に廃止した。過去の紙面は画面のタブから読める。

| 系統 | 役割 | 書く AI |
|---|---|---|
| **世界の注目度** | 海外18媒体＋日本6媒体の見出しから、何が注目されているかを点数にする。国際深掘りの資料も作る | Claude Haiku 5.5 |
| **国際深掘り** | 数日続いた話題を、複数媒体の本文を比べて読み解く | Claude Sonnet 5.5 |
| **AI日報** | AI・IT・科学技術を広く30件 | Claude Haiku 5.5 |

3系統とも、平日 02:07（日本時間）に始まる1本のワークフロー [`.github/workflows/daily.yml`](.github/workflows/daily.yml) が、上から順に作って公開する。
AI は Claude の定額プランの枠で動く（API の課金はない）。2026-10-31 までは Gemini・Groq の無料枠と claude.ai の定期実行を時刻でつないでいたが、
混雑と時刻のずれで欠号が続いたため、1本にまとめた。

役割分担・実行順・編集方針はすべて [`editorial/`](editorial/README.md) にある。**中身を変えたいときは、まずそこを読む。**

## 重複の防ぎ方

守備範囲で分けたうえで、**後から走る系統が先に出た当日分を読んで除外する**。別の台帳は作らない。
AI日報は国際深掘りの当日分（`public/data/intl.json`）を読み、そこに出た話題を落とす。

## 変えたいときに編集するファイル

| 変えたいこと | 編集するファイル |
|---|---|
| 国際深掘りの編集方針 | `editorial/国際深掘り.md` / `editorial/共通.md` |
| 世界の注目度の媒体・採点・資料づくり | `pipeline/attention/` |
| AI日報の採点基準・カテゴリー・掲載件数・使用モデル | `pipeline/editorial.js` |
| AI日報の取得元サイト | `pipeline/sources.js` |
| 実行時刻 | `.github/workflows/daily.yml` の `cron`（UTC表記。平日 02:07 JST = `7 17 * * 0-4`） |
| 国際深掘りへの指示 | `pipeline/intl-prompt.md` |
| データの形 | `src/article.js` |

## データの形

3系統とも同じ `Article` 型で書く。詳細は [`src/article.js`](src/article.js)。

- `depth` … `deep`（深掘り）／`brief`（短信）。画面の切り替えはこれ1つで済む。字数は系統ごとの方針による
- `sources` … 出典を複数持ち、媒体ごとに `body`（本文確認）／`excerpt`（抜粋確認）／`headline`（見出しのみ）を記録する
- `score` … **系統ごとに独立した尺度**。教科ごとの偏差値と同じで、系統をまたいで比べない
- `productionNote` … 制作記録。品質の点検用に持ち、紙面には出さず「制作記録」から開く

## 読み方

- スマホ・Mac とも https://paris75015-png.github.io/ai-news-app/ を開く（`AIニュース起動.command` をダブルクリックしても同じページが開く）
- 中身はクラウド側で更新されるので、Mac の電源が入っていなくても更新される
- 画面上部のタブで系統を切り替える。その下で「深掘り／短信」を切り替えられる

## 手元で試す

```bash
npm run news -- --dry-run   # AIを呼ばずに収集〜保存の流れだけ確認（見出し・点数は仮）
LLM_PROVIDER=claude npm run news   # 本番と同じ処理（Claude Code にログイン済みの Mac で。.env に GEMINI_API_KEY を置けば Gemini でも動く）
npm run dev                 # http://localhost:5173 で表示（`開発用サーバー起動.command` でも可）
```

## 注意

- 本番が止まったときは、GitHub から失敗の通知メールが届く。Actions 画面の「毎朝のニュース」から手動でやり直せる。
- Claude のトークン（Secrets の `CLAUDE_CODE_OAUTH_TOKEN`）が切れたら、`claude setup-token` で作り直して登録し直す。
- 公開リポジトリなので、コードと生成された記事は誰でも見られる（検索エンジンには載らないよう noindex を指定済み）。
- 生成データは `public/data/archive/` に日付ごとに残る。AI日報は一度掲載した記事を14日間再掲しない（`data/seen.json`）。

# 編集方針

3つの系統の編集方針を、ここ1か所にまとめている。

| 系統 | 方針 | 生成するのは | 出力先 |
|---|---|---|---|
| 世界の注目度 | `pipeline/attention/` | GitHub Actions（Gemini・無料枠） | `public/data/attention/latest.json` |
| 国際深掘り | [国際深掘り.md](国際深掘り.md) | クラウドの定期実行（Claude Sonnet 5） | `public/data/intl.json` |
| AI日報 | [AI日報.md](AI日報.md) と `pipeline/editorial.js` | GitHub Actions（Gemini / Groq・無料枠） | `public/data/ai.json` |
| 国内深掘り | （2026-10-01 に廃止。過去の紙面は残す） | — | `public/data/archive/*-domestic.json` |

3系統に共通する規則は [共通.md](共通.md) にある。**各方針を読む前に必ず共通.md を読むこと。**

## 役割分担

読者は日本経済新聞の電子版を購読しており、**日本国内の網羅は日経が担当する**。国内の系統は設けない。
海外については、日経の枠の外から世界を見るために、次の3つを置く。

```
世界の注目度  海外18媒体＋日本5媒体の見出しの並び順から、何が注目されているかを点数にする。機械処理
国際深掘り    数日続いた話題を、複数媒体の本文を比べて読み解く。初日の速報は扱わず、2〜3日目を狙う
AI日報        AI・IT・科学技術。広く浅く、当日の動きを一覧で
```

## 実行順

```
06:20 JST  世界の注目度  → public/data/attention/（順位表）、data/dossiers/（深掘りの資料）   Actions・平日
07:30 JST  国際深掘り    → public/data/intl.json                                          資料を読んで書く
16:43 JST  AI日報        → public/data/ai.json
```

国際深掘りは**資料だけを材料にする**（クラウドの実行環境は本文の取得を遮断されるため）。
本文の取得は Actions が行い、その結果を資料としてリポジトリに置く。

## 変更したとき

編集方針を変えたら、各方針の冒頭にある `editorialVersion` を1つ上げる。
生成された JSON に記録されるので、後から「いつの方針で作った紙面か」を追える。

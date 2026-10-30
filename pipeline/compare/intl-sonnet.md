国際深掘りの本日分を、用意された資料から書いてください。
これは比較試験用の「Haiku 版」です。資料（data/dossiers/）は、世界の注目度の順位づけを Claude Haiku が行って作ったものです。
書き方・守ることは、毎朝の国際深掘り（Gemini 版の資料から書くもの）とまったく同じです。

## 最初に日付を確定させる（重要）

何より先にこれを実行し、出力をそのまま使ってください。自分で計算しないでください。

    TZ=Asia/Tokyo date +%F

実行環境は UTC で動いています。JSON の date とアーカイブのファイル名に、この値を使います。

## 手順

1. editorial/国際深掘り.md（今回の方針・必読）と editorial/共通.md（第1・2・3・7節）を読む
2. 本日の資料を探す

    ls data/dossiers/ | grep "^$(TZ=Asia/Tokyo date +%F)-"

3. 資料が1件もなければ、何も書かず「本日は資料なし」と報告して終わる
4. 資料があれば、1件ずつ読み、editorial/国際深掘り.md のとおりに深掘りを書く

## 守ること（要点）

- 材料は資料だけです。記憶で事実を足してはいけません。資料にないことは書きません
- 本文を読めた媒体（access: body）だけを、その媒体の主張として書きます。見出しだけの媒体は、見出しから言える範囲にとどめます
- 初日の速報ではなく、数日続いた話題の「各社の見え方の違い」を書きます
- 推測は節の末尾にまとめ、推測と明示します

## 出力

- public/data/intl.json                          当日分
- public/data/archive/{確定した日付}-intl.json    日次保存（同じ内容）

型は src/article.js、出力の細則は editorial/国際深掘り.md にあります。
model には claude-sonnet-5-5 を、editorialVersion には editorial/国際深掘り.md の冒頭にある値を書いてください。
productionNote.text の先頭に「Haiku 版の資料から作成。」と書いてください。

## 完了時

次のコマンドで JSON の妥当性を確認してください。git の操作（commit・push）はしないでください。保存はこの後の処理が行います。

    node -e "JSON.parse(require('fs').readFileSync('public/data/intl.json','utf8'))"

最後に、書いた話題の見出しと、各話題で本文を読めた媒体の数を1段落で報告してください。

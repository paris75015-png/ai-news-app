#!/usr/bin/env bash
# 比較試験（2026-11-02〜06）：Gemini が担う処理を Claude Haiku で同時刻に行い、haiku-compare ブランチに記録する。
#
#   bash pipeline/compare/haiku.sh attention   世界の注目度（Haiku）→ 資料 → 国際深掘り（Sonnet が Haiku 版の資料で書く）
#   bash pipeline/compare/haiku.sh ai          AI日報（Haiku）
#   bash pipeline/compare/haiku.sh longread    読み物の資料（Haiku）
#
# 紙面（main ブランチ・公開ページ）には書き込まない。
# Haiku 版の台帳・既出記録などは haiku-compare ブランチの state/ に持ち、毎回それを重ねてから動かす。
# 初回は main の状態から始まる（Gemini 版と同じ出発点）。
# 必要な環境変数：CLAUDE_CODE_OAUTH_TOKEN（claude setup-token で作ったもの）
set -uo pipefail

STREAM="$1"
LAST_DAY="2026-11-06"   # 比較の最終日（JST）。これより後は何もしない
DATE="$(TZ=Asia/Tokyo date +%F)"
BRANCH="haiku-compare"
LOG="haiku-${STREAM}.log"

if [[ "$DATE" > "$LAST_DAY" ]]; then
  echo "比較期間（〜${LAST_DAY}）を過ぎたので何もしない"
  exit 0
fi

export LLM_PROVIDER=claude
export CLAUDE_MODEL="${CLAUDE_MODEL:-claude-haiku-5-5}"
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
export GEMINI_API_KEY="unused-in-haiku-version"   # 各処理の起動時の確認を通すだけ。Gemini は呼ばれない

[ -n "${CI:-}" ] && npm install -g @anthropic-ai/claude-code >/dev/null 2>&1
claude --version </dev/null

git config --global user.name "github-actions[bot]"
git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"

# --- Haiku 版の状態を重ねる ---
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then
  git fetch -q origin "$BRANCH"
  git worktree add -q -B "$BRANCH" _haiku FETCH_HEAD
else
  git worktree add -q --detach _haiku
  (cd _haiku && git checkout -q --orphan "$BRANCH" && git rm -rq --cached . && git clean -fdq)
fi
[ -d _haiku/state ] && cp -R _haiku/state/. ./
# 同じ日の Gemini 版の出力が混ざらないよう、当日分は消してから作る
rm -f data/dossiers/"$DATE"-*.json

# --- 記録を haiku-compare ブランチに保存する（失敗しても、途中までの記録と記録ログは残す） ---
save() {
  git status --porcelain --untracked-files=all -- data public/data | while IFS= read -r line; do
    [[ "${line:0:2}" == *D* ]] && continue
    path="${line:3}"
    mkdir -p "_haiku/state/$(dirname "$path")"
    cp "$path" "_haiku/state/$path"
  done
  mkdir -p "_haiku/logs/$DATE"
  cp haiku-*.log haiku-*.json "_haiku/logs/$DATE/" 2>/dev/null
  cd _haiku || return
  git add -A
  if git diff --cached --quiet; then return; fi
  git commit -qm "Haiku版 ${STREAM} ${DATE}"
  for _ in 1 2 3 4 5; do
    git push -q origin "HEAD:$BRANCH" && return
    git pull -q --rebase origin "$BRANCH"
  done
}
trap save EXIT

run() { echo "\$ $*" | tee -a "$LOG"; "$@" 2>&1 | tee -a "$LOG"; }

case "$STREAM" in
  attention)
    run node pipeline/attention/fetch.mjs || exit 1
    run node pipeline/attention/rank.mjs || exit 1
    run node pipeline/attention/dossier.mjs || exit 1
    run node pipeline/attention/briefs.mjs
    # 国際深掘り（Haiku 版の資料を Sonnet が読んで書く。Gemini 版の定期実行と同じ方針・同じモデル）
    if ls data/dossiers/"$DATE"-*.json >/dev/null 2>&1; then
      echo "\$ claude -p --model claude-sonnet-5-5（国際深掘り）" | tee -a "$LOG"
      LLM_PROVIDER= claude -p --model claude-sonnet-5-5 \
        --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(ls:*)" "Bash(node:*)" "Bash(date:*)" "Bash(TZ=Asia/Tokyo date:*)" \
        --disallowedTools "WebFetch" "WebSearch" \
        --output-format json --no-session-persistence \
        < pipeline/compare/intl-sonnet.md > haiku-intl-result.json
      python3 -c "import json;d=json.load(open('haiku-intl-result.json'));print('[sonnet]', 'エラー' if d.get('is_error') else '完了', json.dumps(d.get('usage',{}).get('output_tokens')), str(d.get('result'))[:600])" | tee -a "$LOG"
    else
      echo "[sonnet] 本日の資料なし（Haiku 版）" | tee -a "$LOG"
    fi
    ;;
  ai)
    run npm run news || exit 1
    ;;
  longread)
    run node pipeline/longread/collect.mjs || exit 1
    ;;
  *)
    echo "不明な系統: $STREAM"; exit 2
    ;;
esac

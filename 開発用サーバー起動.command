#!/bin/bash
# 開発用：手元のコードで動かして確認するときに使います（普段は不要）。
# 最新のニュースデータを取り込んでから、http://localhost:5173 で開きます。
# このウィンドウを閉じる（または Ctrl+C）と停止します。

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Node.js が見つかりません。https://nodejs.org からインストールしてください。"
  read -r -p "Enterキーで閉じます"; exit 1
fi

git pull --quiet || echo "⚠️ 最新データの取り込みに失敗しました（オフラインの可能性）"
[ -d node_modules ] || npm install

( for _ in $(seq 1 40); do curl -s -o /dev/null "http://localhost:5173" && break; sleep 0.5; done; open "http://localhost:5173" ) &
npx vite --port 5173 --strictPort

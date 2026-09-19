#!/bin/bash
# ダブルクリックで AI News アプリを起動し、ブラウザで開きます。
# このウィンドウを閉じる（または Ctrl+C）とアプリは停止します。

cd "$(dirname "$0")" || exit 1
PORT=5173

# Finder から起動した場合でも node / npm を見つけられるようにする
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Node.js が見つかりません。https://nodejs.org からインストールしてください。"
  read -r -p "Enterキーで閉じます"; exit 1
fi

# すでに起動中ならブラウザで開くだけ
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✅ すでに起動中です。ブラウザで開きます。"
  open "http://localhost:$PORT"
  exit 0
fi

# 初回や node_modules が無い場合だけインストール
[ -d node_modules ] || npm install

MACNAME=$(scutil --get LocalHostName 2>/dev/null)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo ""
echo "=============================================="
echo "  📰 AI News を起動しています…"
echo "  Mac:     http://localhost:$PORT"
[ -n "$MACNAME" ] && echo "  スマホ:  http://$MACNAME.local:$PORT"
[ -n "$IP" ]      && echo "  (予備)   http://$IP:$PORT"
echo "  ※スマホは Mac と同じ Wi-Fi に接続してください"
echo "  停止するにはこのウィンドウを閉じてください"
echo "=============================================="
echo ""

# サーバーの準備ができたらブラウザを開く
(
  for _ in $(seq 1 40); do
    curl -s -o /dev/null "http://localhost:$PORT" && break
    sleep 0.5
  done
  open "http://localhost:$PORT"
) &

npx vite --port $PORT --strictPort

#!/bin/bash
# 대시보드 원클릭 실행 (macOS) — Finder에서 이 파일을 더블클릭하세요.
# 서버를 띄우고 브라우저를 자동으로 엽니다. 창을 닫으면 서버도 종료됩니다.

cd "$(dirname "$0")" || exit 1

# Node.js 설치 확인
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Node.js가 필요합니다. https://nodejs.org 에서 설치 후 다시 실행하세요."
  read -r -p "엔터를 누르면 닫힙니다..."
  exit 1
fi

# 최초 실행 시 패키지 설치
if [ ! -d node_modules ]; then
  echo "📦 최초 실행 — 패키지 설치 중... (몇 분 걸릴 수 있어요)"
  npm install || { echo "❌ 설치 실패"; read -r -p "엔터..."; exit 1; }
fi

echo "🚀 대시보드를 시작합니다. 브라우저가 자동으로 열립니다."
echo "   (종료하려면 이 창에서 Ctrl+C 를 누르거나 창을 닫으세요)"
npm run start

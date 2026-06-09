#!/usr/bin/env bash
# 一键拉起(macOS / Linux):双击或 `./start.sh`。
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[onboarding] 未找到 Node.js。请到 https://nodejs.org/ 安装 Node 20+ 后重试。"
  exit 1
fi

exec node "$(dirname "$0")/start.mjs" "$@"

@echo off
rem 一键拉起(Windows):双击此文件即可。
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [onboarding] 未找到 Node.js。请到 https://nodejs.org/ 安装 Node 20+ 后重试。
  pause
  exit /b 1
)

node "%~dp0start.mjs" %*
if errorlevel 1 (
  echo.
  echo [onboarding] 启动遇到问题,日志见上方。按任意键退出。
  pause >nul
)

@echo off
rem PolyMechanism Studio dev launcher.
rem
rem Why this exists: literature plugins (dsh-kb-rag) spawn the engine daemon with
rem the bare `python` resolved from the Host PATH. On machines whose default
rem python is broken for the ML stack (e.g. an anaconda base env with an
rem incompatible numpy), the daemon dies on `import sentence_transformers`.
rem This launcher puts the repo-managed science venv FIRST on PATH so the
rem kb-rag daemon (and agent shells) resolve a known-good interpreter, then
rem starts the desktop exactly like `yarn start` does.
rem
rem Mirrors the startup chain from docs/polymechanism/acceptance/2026-11-20:
rem   corepack yarn install --immutable (run once, not here)
rem   prepare:runtime payload already materialized under .desktop-build
setlocal
set "PM_ROOT=%~dp0.."
if not exist "%PM_ROOT%\science\.venv\Scripts\python.exe" (
  echo [start-polymechanism] science venv missing; run: uv venv science/.venv ^&^& uv pip install -r science/requirements.txt
  exit /b 1
)
set "PATH=%PM_ROOT%\science\.venv\Scripts;%PATH%"
set "HF_ENDPOINT=%HF_ENDPOINT%"
if "%HF_ENDPOINT%"=="" set "HF_ENDPOINT=https://hf-mirror.com"
rem Proxy-aware: PM_PROXY wins; otherwise use a listening local Clash/V2Ray
rem port if present. litsearch still falls back to direct egress per request.
if not "%PM_PROXY%"=="" set "HTTPS_PROXY=%PM_PROXY%"
if not "%PM_PROXY%"=="" set "HTTP_PROXY=%PM_PROXY%"
if not defined HTTPS_PROXY (
  netstat -ano | findstr /R /C:"127.0.0.1:7890 .*LISTENING" >nul 2>&1
  if not errorlevel 1 (
    set "HTTPS_PROXY=http://127.0.0.1:7890"
    set "HTTP_PROXY=http://127.0.0.1:7890"
  )
)
if defined HTTPS_PROXY echo [start-polymechanism] proxy: %HTTPS_PROXY%
cd /d "%PM_ROOT%\dsh-plugin-desktop"
corepack yarn workspace dsh-plugin-desktop start %*
endlocal

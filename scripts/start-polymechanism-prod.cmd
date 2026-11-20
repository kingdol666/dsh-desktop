@echo off
rem PolyMechanism Studio production launcher.
rem
rem The packaged app resolves the kb-rag engine through the Host PATH. On this
rem machine the first `python` is an anaconda base env whose numpy ABI breaks
rem sentence-transformers, so vector retrieval silently falls back to keyword
rem search. Prepending the repo-managed science venv keeps KB hybrid retrieval
rem (and the embedding/reranker models) working without touching global PATH.
setlocal
set "PM_ROOT=%~dp0.."
if exist "%PM_ROOT%\science\.venv\Scripts\python.exe" (
  set "PATH=%PM_ROOT%\science\.venv\Scripts;%PATH%"
) else (
  echo [start-polymechanism-prod] science\.venv missing; KB vector search will degrade to keyword mode.
)
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
if defined HTTPS_PROXY echo [start-polymechanism-prod] proxy: %HTTPS_PROXY%
start "" "%PM_ROOT%\dsh-plugin-desktop\dist\win-unpacked\PolyMechanism Studio.exe" %*
endlocal

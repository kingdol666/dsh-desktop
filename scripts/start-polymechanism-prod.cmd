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
start "" "%PM_ROOT%\dsh-plugin-desktop\dist\win-unpacked\PolyMechanism Studio.exe" %*
endlocal

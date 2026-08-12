@echo off
REM Arise needs a real HTTP origin — service workers and PWA install do not work from file://
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=8123

REM Change directory rather than passing --directory. "%~dp0" always ends in a
REM backslash, and inside quotes that backslash escapes the closing quote, so
REM python receives a path with a stray " on the end. It starts up perfectly and
REM then 404s every request, which reads as a missing index.html rather than a
REM broken argument. Serving the working directory has no such trap.
cd /d "%~dp0"

if not exist "index.html" (
  echo.
  echo   ERROR: index.html is not in %CD%
  echo   Run serve.cmd from the arise folder.
  echo.
  exit /b 1
)

echo.
echo   Arise is starting at http://localhost:%PORT%
echo   Press Ctrl+C to stop.
echo.
start "" http://localhost:%PORT%
REM tools/serve.py, not http.server: the latter sends no cache headers, so the
REM browser is free to cache sw.js and never notice a new build.
python tools\serve.py %PORT%

@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\export-visual-assets.ps1" %*
if errorlevel 1 (
  echo.
  echo Visual asset exporter failed to start.
  pause
  exit /b 1
)
endlocal

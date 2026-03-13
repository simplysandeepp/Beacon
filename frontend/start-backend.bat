@echo off
echo Starting BRD Generation API Backend...
echo.
cd /d "%~dp0..\backend"
powershell -ExecutionPolicy Bypass -File ".\start-https.ps1"
pause

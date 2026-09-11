@echo off
chcp 65001 >nul
title SMP AFK Client
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [HATA] Node.js bulunamadi! https://nodejs.org adresinden LTS surumunu kur.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Ilk kurulum: gerekli kutuphane indiriliyor...
  call npm install
)

if "%1"=="--tekrar" (
  node --max-old-space-size=256 --optimize-for-size afk.js --tekrar
) else (
  node --max-old-space-size=256 --optimize-for-size afk.js
)
pause

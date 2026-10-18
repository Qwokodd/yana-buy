@echo off
title YanaBuy v3 - launcher
cd /d "%~dp0"
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Open Docker Desktop, wait until it says "Engine running", then run this again.
  pause
  exit /b 1
)
echo Starting the database...
call npm run db:up
:waitdb
docker compose exec -T postgres pg_isready -U yanabuy -d yanabuy >nul 2>&1
if errorlevel 1 ( timeout /t 2 >nul & goto waitdb )
echo Database ready. Opening the four apps in their own windows...
start "YanaBuy API (4000)" cmd /k npm run dev:server
timeout /t 8 >nul
start "YanaBuy Website (3000)" cmd /k npm run dev:web
start "YanaBuy Admin (3001)" cmd /k npm run dev:admin
start "YanaBuy Phone app (Expo)" cmd /k npm run dev:mobile
echo Waiting for the website and admin to warm up...
timeout /t 25 >nul
start "" http://localhost:3000
start "" http://localhost:3001
echo.
echo All started. Scan the QR code in the "Phone app" window with Expo Go.
echo To stop: close the four windows (the database keeps running in Docker).
pause

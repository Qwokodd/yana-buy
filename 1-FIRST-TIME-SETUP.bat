@echo off
title YanaBuy v3 - first time setup
cd /d "%~dp0"
echo.
echo === YanaBuy v3 - first time setup on this computer ===
echo.
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Open Docker Desktop, wait until it says "Engine running", then run this again.
  pause
  exit /b 1
)
echo [1/4] Installing packages (a few minutes the first time)...
call npm install --ignore-scripts
if errorlevel 1 ( echo npm install failed - see the message above. & pause & exit /b 1 )
echo.
echo [2/4] Starting the database...
call npm run db:up
echo.
echo [3/4] Waiting for the database to be ready...
:waitdb
docker compose exec -T postgres pg_isready -U yanabuy -d yanabuy >nul 2>&1
if errorlevel 1 ( timeout /t 2 >nul & goto waitdb )
echo Database is ready.
echo.
echo [4/4] Creating the admin account (phone 0770000001)...
call npm run create-admin -- --phone 0770000001 --password "adminpass123" --name "YanaBuy Admin"
echo.
echo === Setup done. Now double-click 2-START-YANABUY.bat ===
pause

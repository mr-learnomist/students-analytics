@echo off
title SMS Launcher

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed!
    echo  Please download and install from: https://nodejs.org
    pause
    exit
)

:: Install dependencies if node_modules missing
if not exist "node_modules\" (
    echo  First time setup - installing dependencies...
    npm install
)

:: Check if server already running on port 3001
netstat -ano | findstr ":3001" >nul 2>&1
if %errorlevel% equ 0 (
    :: Already running — just open browser
    start "" http://localhost:3001
    exit
)

:: Start server silently in background (no black window)
start /B /MIN "" node server.js > server.log 2>&1

:: Wait a moment for server to start
timeout /t 2 /nobreak >nul

:: Open browser
start "" http://localhost:3001

:: Close this launcher window
exit

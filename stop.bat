@echo off
title SMS Stopper

:: Find and kill node process running on port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001"') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Server stopped.
timeout /t 2 /nobreak >nul
exit

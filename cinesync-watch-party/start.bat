@echo off
cd /d "%~dp0"
echo ===================================
echo   CineSync - Watch Party Demo
echo ===================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18+ from https://nodejs.org, then reopen this file.
  pause
  exit /b 1
)
if not exist node_modules\ (
  echo Installing project packages for the first run...
  call npm install
  if errorlevel 1 (
    echo.
    echo Package installation failed. Check your internet connection and try: npm install
    pause
    exit /b 1
  )
)
echo Starting CineSync at http://localhost:3000
echo Keep this window open while you demo the site.
echo Press Ctrl+C to stop the server.
echo.
call npm start
pause

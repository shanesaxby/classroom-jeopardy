@echo off
setlocal
cd /d "%~dp0"
title Classroom Jeopardy V2 Server

echo Starting Classroom Jeopardy Version 2...
echo.

where powershell.exe >nul 2>&1
if %errorlevel%==0 (
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8000
    goto :end
)

echo Windows PowerShell was not found.
echo.
echo Trying Python instead...

py -3 -c "import sys" >nul 2>&1
if %errorlevel%==0 (
    start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process 'http://127.0.0.1:8000/'"
    py -3 -m http.server 8000 --bind 127.0.0.1
    goto :end
)

python -c "import sys" >nul 2>&1
if %errorlevel%==0 (
    start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process 'http://127.0.0.1:8000/'"
    python -m http.server 8000 --bind 127.0.0.1
    goto :end
)

echo.
echo The local server could not be started.
echo Contact your school IT support if Windows PowerShell is disabled.
echo.
pause

:end
endlocal

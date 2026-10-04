@echo off
cd /d "%~dp0"
title VPS Control Center - Agent Service
cls

echo ===============================================================
echo       [+] VPS CONTROL CENTER - AGENT TREO TOOL 24/7
echo ===============================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Da tim thay Node.js tren may.
    echo [*] Dang khoi chay agent.js...
    echo.
    node agent.js
    echo.
    echo [*] Agent da dung lai.
    pause
    exit /b
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Da tim thay Python tren may.
    echo [*] Dang khoi chay agent.py...
    echo.
    python agent.py
    echo.
    echo [*] Agent da dung lai.
    pause
    exit /b
)

echo [!] CHUA TIM THAY NODE.JS HOAC PYTHON TREN MAY!
echo Vui long cai dat Node.js tai https://nodejs.org
echo.
pause

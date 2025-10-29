@echo off
REM Historical Map Geocoder - Windows Startup Script

echo =====================================
echo Historical Map Geocoder
echo =====================================
echo.

REM Check if uv is installed
where uv >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo uv is not installed. Installing uv...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    echo Please restart your command prompt and run this script again.
    pause
    exit /b 1
)

REM Sync dependencies (uv will create venv automatically)
echo Installing dependencies with uv...
uv sync

REM Create necessary directories
if not exist "data\" mkdir data
if not exist "static\maps\" mkdir static\maps

echo.
echo =====================================
echo Starting server...
echo =====================================
echo.
echo Place your map images in: static\maps\
echo Open browser to: http://localhost:5000
echo.
echo Press Ctrl+C to stop the server
echo =====================================
echo.

REM Run the application with uv
uv run python app.py

#!/bin/bash

# Historical Map Geocoder - Startup Script

echo "====================================="
echo "Historical Map Geocoder"
echo "====================================="
echo ""

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "uv is not installed. Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    echo "Please restart your shell and run this script again."
    exit 1
fi

# Sync dependencies (uv will create venv automatically)
echo "Installing dependencies with uv..."
uv sync

# Create necessary directories
mkdir -p data static/maps

echo ""
echo "====================================="
echo "Starting server..."
echo "====================================="
echo ""
echo "Place your map images in: static/maps/"
echo "Open browser to: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "====================================="
echo ""

# Run the application with uv
uv run python app.py

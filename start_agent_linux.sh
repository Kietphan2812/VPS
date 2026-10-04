#!/bin/bash
# VPS Control Center - Linux Startup Script
echo "==============================================================="
echo "      ⚡ VPS CONTROL CENTER - AGENT TREO TOOL 24/7 ⚡"
echo "==============================================================="
echo ""

if command -v node >/dev/null 2>&1; then
    echo "[OK] Đã tìm thấy Node.js. Đang khởi chạy agent.js..."
    node agent.js
elif command -v python3 >/dev/null 2>&1; then
    echo "[OK] Đã tìm thấy Python 3. Đang khởi chạy agent.py..."
    python3 agent.py
elif command -v python >/dev/null 2>&1; then
    echo "[OK] Đã tìm thấy Python. Đang khởi chạy agent.py..."
    python agent.py
else
    echo "[!] Chưa cài Node.js hoặc Python 3!"
    echo "Hãy cài bằng lệnh: sudo apt install nodejs hoặc sudo apt install python3"
    exit 1
fi

@echo off
cd /d "%~dp0\backend"
echo [*] Starting AgentGuard FastAPI Gateway on http://127.0.0.1:8000 ...
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

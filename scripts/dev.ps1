# AgentGuard Localhost Development Runner
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   AgentGuard: AI Agent Safety & Interception Gateway  " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$backendUrl = "http://127.0.0.1:8000"
$frontendUrl = "http://127.0.0.1:5174"

# Check if Backend is already running
$backendRunning = $false
try {
    $res = Invoke-RestMethod -Uri "$backendUrl/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($res.status -eq "ok") {
        $backendRunning = $true
    }
} catch {}

if ($backendRunning) {
    Write-Host "[OK] Backend Gateway is running on: $backendUrl" -ForegroundColor Green
} else {
    Write-Host "[*] Launching Backend Gateway on $backendUrl..." -ForegroundColor Yellow
    Start-Process -FilePath "py" -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload" -WorkingDirectory "$PSScriptRoot\..\agentguard\backend"
}

# Check if Frontend is running
$frontendRunning = $false
try {
    $res = Invoke-WebRequest -Uri "$frontendUrl" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($res.StatusCode -eq 200) {
        $frontendRunning = $true
    }
} catch {
    try {
        $res2 = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($res2.StatusCode -eq 200) {
            $frontendUrl = "http://127.0.0.1:5173"
            $frontendRunning = $true
        }
    } catch {}
}

if ($frontendRunning) {
    Write-Host "[OK] Frontend Dashboard is running on: $frontendUrl" -ForegroundColor Green
} else {
    Write-Host "[*] Launching Frontend Dashboard on $frontendUrl..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "$PSScriptRoot\..\agentguard\dashboard"
}

Write-Host ""
Write-Host "--------------------------------------------------------" -ForegroundColor Gray
Write-Host ">> DASHBOARD URL:  $frontendUrl" -ForegroundColor Green
Write-Host ">> BACKEND API:    $backendUrl" -ForegroundColor Cyan
Write-Host "--------------------------------------------------------" -ForegroundColor Gray

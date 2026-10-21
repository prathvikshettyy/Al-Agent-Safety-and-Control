param(
    [string]$scenario = "all"
)

$validScenarios = @("normal", "injection", "refund", "burst", "all")
if ($validScenarios -notcontains $scenario.ToLower()) {
    Write-Host "[!] Unknown scenario '$scenario'. Valid options: normal, injection, refund, burst, all" -ForegroundColor Red
    exit 1
}

$scriptPath = "$PSScriptRoot\agentguard\agents\scenarios.py"
Write-Host "[*] Executing AgentGuard Scenario: $scenario" -ForegroundColor Cyan
py $scriptPath $scenario

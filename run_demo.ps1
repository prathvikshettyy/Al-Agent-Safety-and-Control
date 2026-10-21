param(
    [string]$scenario = "all"
)

$validScenarios = @("normal", "injection", "refund", "burst", "tamper", "all")
if ($validScenarios -notcontains $scenario.ToLower()) {
    Write-Host "[!] Unknown scenario '$scenario'. Valid options: normal, injection, refund, burst, tamper, all" -ForegroundColor Red
    exit 1
}

Write-Host "[*] Executing AgentGuard Scenario: $scenario" -ForegroundColor Cyan
node "$PSScriptRoot\agents\scenarios.js" $scenario

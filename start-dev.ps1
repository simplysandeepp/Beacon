$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'

if (!(Test-Path (Join-Path $backendDir 'start-https.ps1'))) {
    throw "Could not find backend startup script at: $backendDir\start-https.ps1"
}

# Open backend in a new terminal window
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', "Set-Location '$backendDir'; .\start-https.ps1"
)

# Open frontend in a new terminal window
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', "Set-Location '$frontendDir'; npm run dev"
)

Write-Host 'Started backend and frontend in separate terminal windows.' -ForegroundColor Green

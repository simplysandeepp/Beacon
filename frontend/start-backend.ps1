Write-Host "Starting BRD Generation API Backend..." -ForegroundColor Green
Write-Host ""
$backendRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend'
Set-Location $backendRoot
& .\start-https.ps1

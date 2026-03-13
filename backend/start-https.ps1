$ErrorActionPreference = 'Stop'

Write-Host "Starting Beacon backend over HTTPS..." -ForegroundColor Green
Set-Location $PSScriptRoot

$repoRoot = Split-Path $PSScriptRoot -Parent
$venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'
$pythonExe = if (Test-Path $venvPython) { $venvPython } else { 'python' }
$certDir = Join-Path $PSScriptRoot '.certs'
$certPath = Join-Path $certDir 'localhost.pem'
$keyPath = Join-Path $certDir 'localhost-key.pem'

Write-Host "Using Python: $pythonExe"
if (!(Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir | Out-Null
}

$mkcertCommand = Get-Command mkcert -ErrorAction SilentlyContinue
$mkcertPath = if ($mkcertCommand) { $mkcertCommand.Source } else { $null }
if (-not $mkcertPath) {
    $mkcertPath = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter mkcert.exe -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $mkcertPath) {
    throw "mkcert is required for trusted localhost HTTPS. Install it via: winget install --id FiloSottile.mkcert"
}

if ((-not (Test-Path $certPath)) -or (-not (Test-Path $keyPath))) {
    Write-Host "Generating trusted localhost cert with mkcert..." -ForegroundColor Yellow
    & $mkcertPath -install
    & $mkcertPath -key-file $keyPath -cert-file $certPath localhost 127.0.0.1 ::1
}

& $pythonExe -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --ssl-certfile $certPath --ssl-keyfile $keyPath
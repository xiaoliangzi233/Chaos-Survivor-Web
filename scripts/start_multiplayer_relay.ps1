param(
  [int]$Port = 5001,
  [string]$Bind = "0.0.0.0"
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$serverScript = Join-Path $projectRoot "scripts/multiplayer_relay_server.py"

python -c "import websockets" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Python package 'websockets' is required. Install it with: python -m pip install websockets"
}

Write-Host "Survivor WebSocket relay"
Write-Host "Listening : ws://${Bind}:$Port/ws"
Write-Host "Frontend query example: ?transport=relay&relay=ws%3A%2F%2FHOST%3A${Port}%2Fws"
python $serverScript $Port --bind $Bind

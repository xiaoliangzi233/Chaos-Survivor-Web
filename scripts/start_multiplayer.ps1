param(
  [int]$FrontendPort = 5000,
  [int]$RelayPort = 5001,
  [string]$AdvertiseHost = "",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Find-RadminIpv4 {
  return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.InterfaceAlias -match "Radmin" } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

function Assert-PortAvailable([int]$Port) {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use. Choose another port."
  }
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($AdvertiseHost)) { $AdvertiseHost = Find-RadminIpv4 }
if ([string]::IsNullOrWhiteSpace($AdvertiseHost)) {
  throw "Radmin VPN IPv4 was not detected. Pass -AdvertiseHost <your-Radmin-IP>."
}

python -c "import websockets" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Python package 'websockets' is required. Install it with: python -m pip install websockets"
}

Assert-PortAvailable $FrontendPort
Assert-PortAvailable $RelayPort

$relayScript = Join-Path $projectRoot "scripts/multiplayer_relay_server.py"
$frontendScript = Join-Path $projectRoot "scripts/no_cache_server.py"
$relayUrl = "ws://${AdvertiseHost}:${RelayPort}/ws"
$encodedRelay = [Uri]::EscapeDataString($relayUrl)
$gameUrl = "http://${AdvertiseHost}:${FrontendPort}/?transport=relay&relay=${encodedRelay}"

Write-Host "Frontend : http://${AdvertiseHost}:${FrontendPort}/"
Write-Host "Relay    : $relayUrl"
Write-Host "Game URL : $gameUrl"
Write-Host "P1 and P2 should both open the generated invitation URL."

$relayProcess = Start-Process -FilePath python -ArgumentList @($relayScript, "$RelayPort", "--bind", "0.0.0.0") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
try {
  Start-Sleep -Milliseconds 500
  if ($relayProcess.HasExited) { throw "The multiplayer relay failed to start." }
  if (-not $NoBrowser) { Start-Process $gameUrl | Out-Null }
  python $frontendScript $FrontendPort --bind 0.0.0.0 --advertise-host $AdvertiseHost
} finally {
  if ($relayProcess -and -not $relayProcess.HasExited) { Stop-Process -Id $relayProcess.Id }
}

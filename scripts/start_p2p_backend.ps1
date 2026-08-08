param(
  [int]$Port = 5001,
  [string]$AdvertiseHost = "",
  [string[]]$AllowedOrigin = @()
)

$ErrorActionPreference = "Stop"

function Get-PythonLauncher {
  if (Get-Command python -ErrorAction SilentlyContinue) { return @{ Command = "python"; Args = @() } }
  if (Get-Command py -ErrorAction SilentlyContinue) { return @{ Command = "py"; Args = @("-3") } }
  throw "Python 3 not found. Install Python and ensure either 'python' or 'py' is available in PATH."
}

function Find-RadminIpv4 {
  return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.InterfaceAlias -match "Radmin" } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot
if ([string]::IsNullOrWhiteSpace($AdvertiseHost)) { $AdvertiseHost = Find-RadminIpv4 }
if ([string]::IsNullOrWhiteSpace($AdvertiseHost)) {
  throw "Radmin VPN IPv4 was not detected. Start with -AdvertiseHost <your-LAN-or-Radmin-IP>."
}

$launcher = Get-PythonLauncher
$arguments = @($launcher.Args) + @("scripts/p2p_signal_server.py", "$Port", "--advertise-host", $AdvertiseHost)
foreach ($origin in $AllowedOrigin) { $arguments += @("--allow-origin", $origin) }

Write-Host "P2P backend : http://${AdvertiseHost}:$Port/api/p2p/"
Write-Host "Rooms       : in-memory only; battle data remains browser-to-browser"
& $launcher.Command @arguments

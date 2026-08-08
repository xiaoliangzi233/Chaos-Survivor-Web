param(
  [int]$Port = 5000,
  [string]$Path = "/",
  [switch]$NoBrowser,
  [switch]$Lan,
  [string]$AdvertiseHost = ""
)

$ErrorActionPreference = "Stop"

function Get-PythonLauncher {
  if (Get-Command python -ErrorAction SilentlyContinue) {
    return @{ Command = "python"; Args = @() }
  }
  if (Get-Command py -ErrorAction SilentlyContinue) {
    return @{ Command = "py"; Args = @("-3") }
  }
  throw "Python 3 not found. Install Python and ensure either 'python' or 'py' is available in PATH."
}

function Find-AvailablePort([int]$preferredPort) {
  for ($candidate = $preferredPort; $candidate -lt ($preferredPort + 30); $candidate++) {
    $inUse = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
    if (-not $inUse) {
      return $candidate
    }
  }
  throw "Ports $preferredPort to $($preferredPort + 29) are all in use. Specify another port manually."
}

function Find-RadminIpv4 {
  $candidate = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and $_.InterfaceAlias -match "Radmin"
    } |
    Select-Object -First 1 -ExpandProperty IPAddress
  return $candidate
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$launcher = Get-PythonLauncher
$finalPort = Find-AvailablePort -preferredPort $Port
$normalizedPath = if ($Path.StartsWith("/")) { $Path } else { "/$Path" }
$bindAddress = "127.0.0.1"
$launchHost = "127.0.0.1"
if ($Lan) {
  $bindAddress = "0.0.0.0"
  if ([string]::IsNullOrWhiteSpace($AdvertiseHost)) {
    $AdvertiseHost = Find-RadminIpv4
  }
  if ([string]::IsNullOrWhiteSpace($AdvertiseHost)) {
    throw "Radmin VPN IPv4 was not detected. Start with -Lan -AdvertiseHost <your-Radmin-IP>."
  }
  $launchHost = $AdvertiseHost
}
$url = "http://${launchHost}:$finalPort$normalizedPath"

Write-Host "Project Root : $projectRoot"
Write-Host "Python       : $($launcher.Command) $($launcher.Args -join ' ')"
Write-Host "Serving URL  : $url"
Write-Host "Storage      : browser localStorage"
Write-Host "Cache        : disabled for local development"
if ($Lan) {
  Write-Host "LAN mode     : enabled; temporary P2P room signaling is available on this host"
  Write-Host "Invite base  : http://${AdvertiseHost}:$finalPort/"
}

if ($finalPort -ne $Port) {
  Write-Host "Note: Port $Port is in use, switched automatically to $finalPort."
}

$arguments = @()
$arguments += $launcher.Args
$noCacheServer = Join-Path $projectRoot "scripts/no_cache_server.py"
if (Test-Path $noCacheServer) {
  $arguments += @($noCacheServer, "$finalPort", "--bind", $bindAddress)
  if ($Lan) {
    $arguments += @("--advertise-host", $AdvertiseHost)
  }
} else {
  $arguments += @("-m", "http.server", "$finalPort", "--bind", $bindAddress)
}

if (-not $NoBrowser) {
  Start-Process $url | Out-Null
}

& $launcher.Command @arguments

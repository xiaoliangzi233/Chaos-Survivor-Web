param(
  [int]$Port = 5000,
  [string]$Path = "/",
  [switch]$NoBrowser
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

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$launcher = Get-PythonLauncher
$finalPort = Find-AvailablePort -preferredPort $Port
$normalizedPath = if ($Path.StartsWith("/")) { $Path } else { "/$Path" }
$url = "http://127.0.0.1:$finalPort$normalizedPath"

Write-Host "Project Root : $projectRoot"
Write-Host "Python       : $($launcher.Command) $($launcher.Args -join ' ')"
Write-Host "Serving URL  : $url"
Write-Host "Cache        : disabled for local development"

if ($finalPort -ne $Port) {
  Write-Host "Note: Port $Port is in use, switched automatically to $finalPort."
}

if (-not $NoBrowser) {
  Start-Process $url | Out-Null
}

$args = @()
$args += $launcher.Args
$noCacheServer = Join-Path $projectRoot "scripts/no_cache_server.py"
if (Test-Path $noCacheServer) {
  $args += @($noCacheServer, "$finalPort", "--bind", "127.0.0.1")
} else {
  $args += @("-m", "http.server", "$finalPort", "--bind", "127.0.0.1")
}

& $launcher.Command @args

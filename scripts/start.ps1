param(
  [int]$Port = 5000,
  [int]$BackendPort = 8000,
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
$apiBase = "http://127.0.0.1:$BackendPort"
$backendJob = $null

Write-Host "Project Root : $projectRoot"
Write-Host "Python       : $($launcher.Command) $($launcher.Args -join ' ')"
Write-Host "Serving URL  : $url"
Write-Host "Data API     : $apiBase/api"
Write-Host "Cache        : disabled for local development"

if ($finalPort -ne $Port) {
  Write-Host "Note: Port $Port is in use, switched automatically to $finalPort."
}

$backendInUse = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
if (-not $backendInUse) {
  $backendArgs = @()
  $backendArgs += $launcher.Args
  $backendArgs += @(
    (Join-Path $projectRoot "backend/server.py"),
    "--host", "127.0.0.1",
    "--port", "$BackendPort"
  )
  $backendJob = Start-Job -ScriptBlock {
    param($command, $arguments, $workingDirectory)
    Set-Location $workingDirectory
    & $command @arguments
  } -ArgumentList $launcher.Command, $backendArgs, $projectRoot.Path
  Start-Sleep -Milliseconds 500
  if ($backendJob.State -ne "Running") {
    Receive-Job -Job $backendJob -Keep
    throw "Survivor data service failed to start. Run backend/server.py directly to inspect the error."
  }
  Write-Host "Backend      : started (job $($backendJob.Id))"
} else {
  Write-Host "Backend      : using existing listener on port $BackendPort"
}

$args = @()
$args += $launcher.Args
$noCacheServer = Join-Path $projectRoot "scripts/no_cache_server.py"
if (Test-Path $noCacheServer) {
  $args += @($noCacheServer, "$finalPort", "--bind", "127.0.0.1", "--api-base", $apiBase)
} else {
  $args += @("-m", "http.server", "$finalPort", "--bind", "127.0.0.1")
}

if (-not $NoBrowser) {
  Start-Process $url | Out-Null
}

try {
  & $launcher.Command @args
} finally {
  if ($backendJob) {
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
    Write-Host "Survivor data backend stopped."
  }
}

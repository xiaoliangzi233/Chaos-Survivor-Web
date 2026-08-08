param(
  [int]$FrontendPort = 5000,
  [int]$BackendPort = 5010,
  [string]$BackendHost = "127.0.0.1",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Get-PythonLauncher {
  if (Get-Command python -ErrorAction SilentlyContinue) { return @{ Command = "python"; Args = @() } }
  if (Get-Command py -ErrorAction SilentlyContinue) { return @{ Command = "py"; Args = @("-3") } }
  throw "Python 3 not found. Install Python and ensure either 'python' or 'py' is available in PATH."
}

function Find-AvailablePort([int]$preferredPort) {
  for ($candidate = $preferredPort; $candidate -lt ($preferredPort + 30); $candidate++) {
    $inUse = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
    if (-not $inUse) { return $candidate }
  }
  throw "Ports $preferredPort to $($preferredPort + 29) are all in use. Specify another port manually."
}

function UrlEncode([string]$value) {
  return [System.Uri]::EscapeDataString($value)
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$launcher = Get-PythonLauncher
$finalFrontendPort = Find-AvailablePort -preferredPort $FrontendPort
$finalBackendPort = Find-AvailablePort -preferredPort $BackendPort
$backendUrl = "http://${BackendHost}:$finalBackendPort"
$frontendPath = "/?api=$(UrlEncode $backendUrl)"
$backendLog = Join-Path $projectRoot ".backend-server.log"
$backendErr = Join-Path $projectRoot ".backend-server.err.log"
$backendArgs = @($launcher.Args) + @("-m", "backend.run", "--host", $BackendHost, "--port", "$finalBackendPort")

Write-Host "Starting Survivor backend..."
Write-Host "Backend URL     : $backendUrl"
Write-Host "Admin console   : $backendUrl/admin"
Write-Host "Backend logs    : $backendLog"
$job = Start-Job -Name "Survivor Backend" -ScriptBlock {
  param($Root, $PythonCommand, $PythonArgs, $StdoutPath, $StderrPath)
  Set-Location $Root
  & $PythonCommand @PythonArgs > $StdoutPath 2> $StderrPath
} -ArgumentList $projectRoot, $launcher.Command, $backendArgs, $backendLog, $backendErr

Start-Sleep -Milliseconds 1200

if ($job.State -eq "Failed") {
  Receive-Job $job
  throw "Backend failed to start. See $backendErr"
}

try {
  Invoke-RestMethod -Uri "$backendUrl/api/health" -TimeoutSec 3 | Out-Null
} catch {
  Write-Warning "Backend health check did not respond yet. See $backendErr if leaderboard remains unavailable."
}

Write-Host "Starting Survivor frontend..."
Write-Host "Frontend URL    : http://127.0.0.1:$finalFrontendPort$frontendPath"
Write-Host "One-click mode  : backend in background, frontend in this window"

$frontendScript = Join-Path $PSScriptRoot "start.ps1"
if ($NoBrowser) {
  & $frontendScript -Port $finalFrontendPort -Path $frontendPath -NoBrowser
} else {
  & $frontendScript -Port $finalFrontendPort -Path $frontendPath
}

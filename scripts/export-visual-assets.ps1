param(
  [int]$Port = 5011,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $PSScriptRoot "visual_export_server.py"
$exportUrl = "http://127.0.0.1:$Port/tools/visual-exporter.html"
$statusUrl = "http://127.0.0.1:$Port/__visual_export/status"

try {
  $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 1
  if (-not $status.ok) {
    throw "Port $Port is already in use by another service."
  }
  Write-Host "Visual export server is already running: $exportUrl"
} catch {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) {
    throw "Python was not found. Install Python 3 and add python to PATH."
  }

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $python.Source
  $startInfo.Arguments = "`"$serverScript`" --bind 127.0.0.1 --port $Port"
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.UseShellExecute = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $serverProcess = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $serverProcess) {
    throw "Visual export server process could not be created."
  }

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 150
    try {
      $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 1
      if ($status.ok) {
        $ready = $true
        break
      }
    } catch {}
  }
  if (-not $ready) {
    throw "Visual export server failed to start. Run scripts\\visual_export_server.py in a terminal for details."
  }
  Write-Host "Visual export server started: $exportUrl"
}

Write-Host "PNG output: $(Join-Path $projectRoot 'assets\exported')"
if (-not $NoBrowser) {
  Start-Process $exportUrl
} else {
  Write-Host "Open this URL in a browser: $exportUrl"
}

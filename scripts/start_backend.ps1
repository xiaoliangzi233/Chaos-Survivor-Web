param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5010,
  [string]$Database = ""
)

$ErrorActionPreference = "Stop"

function Get-PythonLauncher {
  if (Get-Command python -ErrorAction SilentlyContinue) { return @{ Command = "python"; Args = @() } }
  if (Get-Command py -ErrorAction SilentlyContinue) { return @{ Command = "py"; Args = @("-3") } }
  throw "Python 3 not found. Install Python and ensure either 'python' or 'py' is available in PATH."
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot
$launcher = Get-PythonLauncher
$arguments = @($launcher.Args) + @("-m", "backend.run", "--host", $HostName, "--port", "$Port")
if (-not [string]::IsNullOrWhiteSpace($Database)) {
  $arguments += @("--db", $Database)
}

Write-Host "Survivor backend : http://${HostName}:$Port"
Write-Host "Admin console    : http://${HostName}:$Port/admin"
Write-Host "SQLite database  : backend/survivor.sqlite3"
& $launcher.Command @arguments

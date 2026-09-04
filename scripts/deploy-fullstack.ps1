param(
  [string]$Server = "1.14.93.50",
  [string]$User = "root",
  [int]$SshPort = 22,
  [string]$RemoteDir = "/opt/survivor",
  [string]$PublicBaseUrl = "http://139.155.133.14:8081/survivor",
  [string]$AdminToken = "",
  [string]$AuthProxyPass = "http://host.docker.internal:8080",
  [switch]$NoBrowser,
  [switch]$PackageOnly
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found in PATH. Install OpenSSH client or run this script from a shell that provides $Name."
  }
}

function Assert-SafeRemoteDir([string]$Path) {
  $normalized = $Path.TrimEnd("/")
  $blocked = @("", "/", "/var", "/var/www", "/usr", "/usr/share", "/usr/share/nginx", "/tmp", "/root", "/opt")
  if (-not $Path.StartsWith("/")) {
    throw "RemoteDir must be an absolute Linux path."
  }
  if ($blocked -contains $normalized) {
    throw "RemoteDir is too broad for deployment: $Path"
  }
  if ($normalized.Length -lt 10) {
    throw "RemoteDir looks too short for safe deployment: $Path"
  }
}

function Quote-Bash([string]$Value) {
  return "'" + $Value.Replace("'", "'\''") + "'"
}

function Remove-StagePath([string]$Path, [string]$StageRoot) {
  if (-not (Test-Path $Path)) {
    return
  }
  $resolvedPath = (Resolve-Path $Path).Path
  $resolvedStage = (Resolve-Path $StageRoot).Path
  if (-not $resolvedPath.StartsWith($resolvedStage)) {
    throw "Refusing to remove unexpected path: $resolvedPath"
  }
  Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

if (-not $PackageOnly) {
  Require-Command "ssh"
  Require-Command "scp"
}
Assert-SafeRemoteDir $RemoteDir

$generatedAdminToken = "change-me-" + [Guid]::NewGuid().ToString("N")

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$deployRoot = Join-Path $projectRoot ".deploy"
$stageRoot = Join-Path $deployRoot "fullstack-stage"
$archivePath = Join-Path $deployRoot "survivor-fullstack.zip"
$remoteScriptPath = Join-Path $deployRoot "deploy-fullstack-remote.sh"

if (Test-Path $stageRoot) {
  Remove-StagePath $stageRoot $deployRoot
}

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

$publishItems = @(
  "Dockerfile",
  ".dockerignore",
  "docker-compose.yml",
  "index.html",
  "styles.css",
  "favicon.ico",
  "assets",
  "src",
  "styles",
  "vendor",
  "backend",
  "deploy"
)

foreach ($item in $publishItems) {
  $source = Join-Path $projectRoot $item
  if (-not (Test-Path $source)) {
    Write-Host "Skip missing item: $item"
    continue
  }
  Copy-Item -LiteralPath $source -Destination $stageRoot -Recurse -Force
}

Remove-StagePath (Join-Path $stageRoot "backend\__pycache__") $stageRoot
Remove-StagePath (Join-Path $stageRoot "backend\survivor.sqlite3") $stageRoot
Get-ChildItem -Path $stageRoot -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-StagePath $_.FullName $stageRoot }
Get-ChildItem -Path $stageRoot -Recurse -File -Include "*.pyc","*.pyo","*.log","*.sqlite3","*.sqlite3-*" -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-StagePath $_.FullName $stageRoot }

if (Test-Path $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

Compress-Archive -Force -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath

if ($PackageOnly) {
  Write-Host "Package created: $archivePath"
  return
}

$remoteDirQuoted = Quote-Bash $RemoteDir
$publicBaseUrl = $PublicBaseUrl.TrimEnd("/")
$publicBaseUrlQuoted = Quote-Bash $publicBaseUrl
$adminTokenQuoted = Quote-Bash $AdminToken
$generatedAdminTokenQuoted = Quote-Bash $generatedAdminToken
$authProxyPassQuoted = Quote-Bash $AuthProxyPass

$remoteScript = @"
set -euo pipefail

REMOTE_DIR=$remoteDirQuoted
PUBLIC_BASE_URL=$publicBaseUrlQuoted
ADMIN_TOKEN_VALUE=$adminTokenQuoted
GENERATED_ADMIN_TOKEN=$generatedAdminTokenQuoted
AUTH_PROXY_PASS_VALUE=$authProxyPassQuoted
ARCHIVE=/tmp/survivor-fullstack.zip

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "`$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "`$@"
  else
    echo "Docker Compose is required." >&2
    exit 1
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required on the server." >&2
  exit 1
fi
if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required on the server." >&2
  exit 1
fi

mkdir -p "`$REMOTE_DIR"
if [ -n "`$(find "`$REMOTE_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  BACKUP_DIR="`$REMOTE_DIR.bak.`$(date +%Y%m%d%H%M%S)"
  cp -a "`$REMOTE_DIR" "`$BACKUP_DIR"
  echo "Backed up previous release to `$BACKUP_DIR"
fi

if [ -z "`$ADMIN_TOKEN_VALUE" ] && [ -f "`$REMOTE_DIR/.env" ]; then
  EXISTING_ADMIN_TOKEN="`$(grep -E '^ADMIN_TOKEN=' "`$REMOTE_DIR/.env" | tail -n 1 | cut -d= -f2- || true)"
  ADMIN_TOKEN_VALUE="`$EXISTING_ADMIN_TOKEN"
fi
if [ -z "`$ADMIN_TOKEN_VALUE" ]; then
  ADMIN_TOKEN_VALUE="`$GENERATED_ADMIN_TOKEN"
fi

find "`$REMOTE_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
unzip -oq "`$ARCHIVE" -d "`$REMOTE_DIR"

cat > "`$REMOTE_DIR/.env" <<ENV
ADMIN_TOKEN=`$ADMIN_TOKEN_VALUE
AUTH_PROXY_PASS=`$AUTH_PROXY_PASS_VALUE
ENV

cd "`$REMOTE_DIR"
compose_cmd up -d --build --remove-orphans
compose_cmd ps

check_url() {
  URL="`$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 10 "`$URL" >/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q --timeout=10 --spider "`$URL"
  else
    echo "Skip HTTP check because curl/wget is not available: `$URL"
    return 0
  fi
}

check_url "http://127.0.0.1:8081/survivor/"
check_url "http://127.0.0.1:8081/survivor/api/health"

echo "Docker deployment complete."
echo "Frontend: `$PUBLIC_BASE_URL/"
echo "Backend health: `$PUBLIC_BASE_URL/api/health"
echo "Admin: `$PUBLIC_BASE_URL/admin"
echo "Admin token: `$ADMIN_TOKEN_VALUE"
echo "Auth proxy: /sszl/ -> `$AUTH_PROXY_PASS_VALUE"
"@

New-Item -ItemType Directory -Force -Path $deployRoot | Out-Null
Set-Content -LiteralPath $remoteScriptPath -Value $remoteScript -Encoding UTF8

$target = "${User}@${Server}"
Write-Host "Project Root : $projectRoot"
Write-Host "Archive      : $archivePath"
Write-Host "Target       : $target"
Write-Host "Remote Dir   : $RemoteDir"
Write-Host "Public URL   : $publicBaseUrl/"
Write-Host "Admin Token  : $AdminToken"
Write-Host "Auth Proxy   : /sszl/ -> $AuthProxyPass"

& scp -P $SshPort $archivePath "${target}:/tmp/survivor-fullstack.zip"
& scp -P $SshPort $remoteScriptPath "${target}:/tmp/survivor-deploy-fullstack.sh"
& ssh -p $SshPort $target "bash /tmp/survivor-deploy-fullstack.sh"

if (-not $NoBrowser) {
  Start-Process "$publicBaseUrl/" | Out-Null
}

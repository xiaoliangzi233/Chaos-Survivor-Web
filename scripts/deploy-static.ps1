param(
  [string]$Server = "1.14.93.50",
  [string]$User = "root",
  [int]$SshPort = 22,
  [string]$RemoteDir = "/var/www/survivor",
  [switch]$ConfigureNginx,
  [switch]$PackageOnly,
  [string]$ServerName = ""
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found in PATH. Install OpenSSH client or run this script from a shell that provides $Name."
  }
}

function Assert-SafeRemoteDir([string]$Path) {
  $normalized = $Path.TrimEnd("/")
  $blocked = @("", "/", "/var", "/var/www", "/usr", "/usr/share", "/usr/share/nginx", "/tmp", "/root")
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

if (-not $PackageOnly) {
  Require-Command "ssh"
  Require-Command "scp"
}
Assert-SafeRemoteDir $RemoteDir

if ([string]::IsNullOrWhiteSpace($ServerName)) {
  $ServerName = $Server
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$deployRoot = Join-Path $projectRoot ".deploy"
$stageRoot = Join-Path $deployRoot "stage"
$archivePath = Join-Path $deployRoot "survivor-web.zip"
$remoteScriptPath = Join-Path $deployRoot "deploy-remote.sh"

if (Test-Path $stageRoot) {
  $resolvedStage = (Resolve-Path $stageRoot).Path
  $resolvedDeploy = if (Test-Path $deployRoot) { (Resolve-Path $deployRoot).Path } else { "" }
  if (-not $resolvedDeploy -or -not $resolvedStage.StartsWith($resolvedDeploy)) {
    throw "Refusing to remove unexpected staging path: $resolvedStage"
  }
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

$publishItems = @(
  "index.html",
  "styles.css",
  "favicon.ico",
  "assets",
  "src",
  "styles",
  "vendor"
)

foreach ($item in $publishItems) {
  $source = Join-Path $projectRoot $item
  if (-not (Test-Path $source)) {
    Write-Host "Skip missing item: $item"
    continue
  }
  Copy-Item -LiteralPath $source -Destination $stageRoot -Recurse -Force
}

if (Test-Path $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

Compress-Archive -Force -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath

if ($PackageOnly) {
  Write-Host "Package created: $archivePath"
  return
}

$remoteDirQuoted = Quote-Bash $RemoteDir
$serverNameQuoted = Quote-Bash $ServerName
$configureNginxValue = if ($ConfigureNginx) { "1" } else { "0" }

$remoteScript = @"
set -euo pipefail

REMOTE_DIR=$remoteDirQuoted
SERVER_NAME=$serverNameQuoted
CONFIGURE_NGINX=$configureNginxValue
ARCHIVE=/tmp/survivor-web.zip

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required. Install it first." >&2
  exit 1
fi

mkdir -p "`$REMOTE_DIR"

if [ -n "`$(find "`$REMOTE_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  BACKUP_DIR="`$REMOTE_DIR.bak.`$(date +%Y%m%d%H%M%S)"
  cp -a "`$REMOTE_DIR" "`$BACKUP_DIR"
  echo "Backed up previous release to `$BACKUP_DIR"
fi

find "`$REMOTE_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
unzip -oq "`$ARCHIVE" -d "`$REMOTE_DIR"
find "`$REMOTE_DIR" -type d -exec chmod 0755 {} +
find "`$REMOTE_DIR" -type f -exec chmod 0644 {} +

if [ "`$CONFIGURE_NGINX" = "1" ]; then
  if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx is required when -ConfigureNginx is used." >&2
    exit 1
  fi

  cat > /etc/nginx/conf.d/survivor.conf <<NGINX
server {
    listen 80;
    server_name `$SERVER_NAME;

    root `$REMOTE_DIR;
    index index.html;

    if_modified_since off;
    etag off;

    location ~ ^/(deploy|scripts|tests|docs|backend|worker)/ {
        return 404;
    }

    location / {
        try_files \`$uri \`$uri/ /index.html;
        expires off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location ~* \.(js|mjs|css|png|jpg|jpeg|gif|ico|svg|webp|mp3|wav|ogg|json)\$ {
        expires off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        try_files \`$uri =404;
    }
}
NGINX

  nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx
  else
    nginx -s reload
  fi
fi

echo "Deployment complete: `$REMOTE_DIR"
"@

New-Item -ItemType Directory -Force -Path $deployRoot | Out-Null
Set-Content -LiteralPath $remoteScriptPath -Value $remoteScript -Encoding UTF8

$target = "${User}@${Server}"
Write-Host "Project Root : $projectRoot"
Write-Host "Archive      : $archivePath"
Write-Host "Target       : $target"
Write-Host "Remote Dir   : $RemoteDir"
Write-Host "Nginx Config : $ConfigureNginx"

& scp -P $SshPort $archivePath "${target}:/tmp/survivor-web.zip"
& scp -P $SshPort $remoteScriptPath "${target}:/tmp/survivor-deploy-static.sh"
& ssh -p $SshPort $target "bash /tmp/survivor-deploy-static.sh"

Write-Host "Open: http://$ServerName/"

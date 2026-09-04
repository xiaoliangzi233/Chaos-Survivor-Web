param(
  [string]$Server = "1.14.93.50",
  [string]$User = "root",
  [int]$SshPort = 22,
  [string]$RemoteDir = "/opt/survivor",
  [string]$PublicBaseUrl = "http://139.155.133.14:18080/survivor",
  [int]$FrontendHostPort = 18080,
  [string]$AdminToken = "",
  [string]$AuthProxyPass = "http://127.0.0.1:8080",
  [int]$BackendHostPort = 18081,
  [switch]$RebuildBackend,
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

function New-PortableZipArchive([string]$SourceDir, [string]$DestinationPath) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $resolvedSource = (Resolve-Path $SourceDir).Path.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $archiveDirectory = Split-Path -Parent $DestinationPath
  if ($archiveDirectory) {
    New-Item -ItemType Directory -Force -Path $archiveDirectory | Out-Null
  }

  $zip = [System.IO.Compression.ZipFile]::Open($DestinationPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    Get-ChildItem -LiteralPath $resolvedSource -Recurse -File | ForEach-Object {
      $relativePath = $_.FullName.Substring($resolvedSource.Length).TrimStart('\', '/')
      $entryName = $relativePath.Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally {
    $zip.Dispose()
  }
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
  ".dockerignore",
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

New-PortableZipArchive $stageRoot $archivePath

$remoteDirQuoted = Quote-Bash $RemoteDir
$publicBaseUrl = $PublicBaseUrl.TrimEnd("/")
$publicHost = ([Uri]$publicBaseUrl).Host
$serverNames = "$publicHost $Server localhost 127.0.0.1 _"
$publicBaseUrlQuoted = Quote-Bash $publicBaseUrl
$serverNamesQuoted = Quote-Bash $serverNames
$frontendHostPortValue = $FrontendHostPort
$adminTokenQuoted = Quote-Bash $AdminToken
$generatedAdminTokenQuoted = Quote-Bash $generatedAdminToken
$authProxyPassQuoted = Quote-Bash $AuthProxyPass.TrimEnd("/")
$backendHostPortValue = $BackendHostPort
$rebuildBackendValue = if ($RebuildBackend) { "1" } else { "0" }
$adminTokenSuppliedValue = if ($AdminToken) { "1" } else { "0" }

$remoteScript = @"
set -euo pipefail

REMOTE_DIR=$remoteDirQuoted
PUBLIC_BASE_URL=$publicBaseUrlQuoted
SERVER_NAMES=$serverNamesQuoted
FRONTEND_HOST_PORT=$frontendHostPortValue
ADMIN_TOKEN_VALUE=$adminTokenQuoted
ADMIN_TOKEN_SUPPLIED=$adminTokenSuppliedValue
GENERATED_ADMIN_TOKEN=$generatedAdminTokenQuoted
AUTH_PROXY_PASS_VALUE=$authProxyPassQuoted
BACKEND_HOST_PORT=$backendHostPortValue
REBUILD_BACKEND=$rebuildBackendValue
ARCHIVE=/tmp/survivor-fullstack.zip
PUBLIC_DIR="`$REMOTE_DIR"
PUBLIC_PARENT_DIR="`$(dirname "`$REMOTE_DIR")"
NGINX_CONF=/etc/nginx/conf.d/survivor.conf
NGINX_MAIN_SITE_CONF=/etc/nginx/conf.d/kcj.conf
NGINX_SNIPPET=/etc/nginx/snippets/survivor-locations.conf
BACKEND_IMAGE=survivor-backend:latest
BACKEND_CONTAINER=survivor-backend
BACKEND_CONTAINER_PORT=5010

require_command() {
  if ! command -v "`$1" >/dev/null 2>&1; then
    echo "`$1 is required on the server." >&2
    exit 1
  fi
}

require_command docker
require_command unzip
require_command nginx

remove_legacy_frontend_container() {
  if docker inspect survivor-frontend >/dev/null 2>&1; then
    echo "Removing legacy frontend container: survivor-frontend"
    docker stop survivor-frontend >/dev/null 2>&1 || true
    docker rm survivor-frontend >/dev/null 2>&1 || true
  fi
}

assert_frontend_port_available_for_nginx() {
  if ! command -v ss >/dev/null 2>&1; then
    return
  fi
  LISTENERS="`$(ss -ltnp "( sport = :`$FRONTEND_HOST_PORT )" 2>/dev/null || true)"
  if ! printf '%s\n' "`$LISTENERS" | grep -q ":`$FRONTEND_HOST_PORT"; then
    return
  fi
  if printf '%s\n' "`$LISTENERS" | grep -qi 'nginx'; then
    return
  fi
  echo "Frontend port `$FRONTEND_HOST_PORT is already used by a non-Nginx service." >&2
  echo "Nginx cannot serve `$PUBLIC_BASE_URL until that port is released or you deploy with -FrontendHostPort." >&2
  printf '%s\n' "`$LISTENERS" >&2
  exit 1
}

remove_legacy_frontend_container
assert_frontend_port_available_for_nginx

mkdir -p "`$REMOTE_DIR"
if [ -n "`$(find "`$REMOTE_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  BACKUP_DIR="`$REMOTE_DIR.bak.`$(date +%Y%m%d%H%M%S)"
  cp -a "`$REMOTE_DIR" "`$BACKUP_DIR"
  echo "Backed up previous release to `$BACKUP_DIR"
fi

if [ -z "`$ADMIN_TOKEN_VALUE" ] && [ -f "`$REMOTE_DIR/.env" ]; then
  ADMIN_TOKEN_VALUE="`$(grep -E '^ADMIN_TOKEN=' "`$REMOTE_DIR/.env" | tail -n 1 | cut -d= -f2- || true)"
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

docker volume create survivor-data >/dev/null

assert_backend_port_available() {
  if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :`$BACKEND_HOST_PORT )" | grep -q ":`$BACKEND_HOST_PORT"; then
    echo "Port `$BACKEND_HOST_PORT is already in use. Choose another port with -BackendHostPort, or stop the process below after confirming it is safe:" >&2
    ss -ltnp "( sport = :`$BACKEND_HOST_PORT )" >&2 || true
    exit 1
  fi
}

IMAGE_EXISTS=0
if docker image inspect "`$BACKEND_IMAGE" >/dev/null 2>&1; then
  IMAGE_EXISTS=1
fi

BUILT_BACKEND=0
if [ "`$IMAGE_EXISTS" = "0" ] || [ "`$REBUILD_BACKEND" = "1" ]; then
  echo "Building backend image: `$BACKEND_IMAGE"
  cd "`$REMOTE_DIR"
  docker build -f backend/Dockerfile -t "`$BACKEND_IMAGE" .
  BUILT_BACKEND=1
else
  echo "Backend image exists; skip build. Use -RebuildBackend when backend dependencies or code changed."
fi

CONTAINER_EXISTS=0
if docker inspect "`$BACKEND_CONTAINER" >/dev/null 2>&1; then
  CONTAINER_EXISTS=1
fi

BACKEND_PORT_MATCHES=0
if [ "`$CONTAINER_EXISTS" = "1" ] && docker port "`$BACKEND_CONTAINER" "`$BACKEND_CONTAINER_PORT/tcp" 2>/dev/null | grep -q "127.0.0.1:`$BACKEND_HOST_PORT"; then
  BACKEND_PORT_MATCHES=1
fi

create_backend_container() {
  docker create \
    --name "`$BACKEND_CONTAINER" \
    --restart unless-stopped \
    --add-host host.docker.internal:host-gateway \
    -e ADMIN_TOKEN="`$ADMIN_TOKEN_VALUE" \
    -e AUTH_USER_URL="http://host.docker.internal:`$FRONTEND_HOST_PORT/sszl/user/simple-info" \
    -e SURVIVOR_DB="/data/survivor.sqlite3" \
    -e ALLOWED_ORIGINS="*" \
    -v survivor-data:/data \
    -p 127.0.0.1:`$BACKEND_HOST_PORT:`$BACKEND_CONTAINER_PORT \
    "`$BACKEND_IMAGE" >/dev/null
}

if [ "`$CONTAINER_EXISTS" = "0" ]; then
  assert_backend_port_available
  create_backend_container
  docker start "`$BACKEND_CONTAINER" >/dev/null
elif [ "`$BUILT_BACKEND" = "1" ] || [ "`$ADMIN_TOKEN_SUPPLIED" = "1" ] || [ "`$BACKEND_PORT_MATCHES" = "0" ]; then
  docker stop "`$BACKEND_CONTAINER" >/dev/null 2>&1 || true
  docker rm "`$BACKEND_CONTAINER" >/dev/null
  assert_backend_port_available
  create_backend_container
  docker start "`$BACKEND_CONTAINER" >/dev/null
else
  docker restart "`$BACKEND_CONTAINER" >/dev/null
fi

mkdir -p /etc/nginx/snippets
cat > "`$NGINX_SNIPPET" <<NGINX
    location = /survivor {
        return 301 /survivor/;
    }

    location ^~ /sszl/ {
        proxy_pass `$AUTH_PROXY_PASS_VALUE;
        proxy_http_version 1.1;
        proxy_set_header Host \`$host;
        proxy_set_header X-Real-IP \`$remote_addr;
        proxy_set_header X-Forwarded-For \`$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \`$scheme;
    }

    location ^~ /survivor/api/ {
        proxy_pass http://127.0.0.1:`$BACKEND_HOST_PORT/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \`$host;
        proxy_set_header X-Real-IP \`$remote_addr;
        proxy_set_header X-Forwarded-For \`$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \`$scheme;
    }

    location = /survivor/admin {
        proxy_pass http://127.0.0.1:`$BACKEND_HOST_PORT/admin;
        proxy_set_header Host \`$host;
        proxy_set_header X-Real-IP \`$remote_addr;
        proxy_set_header X-Forwarded-For \`$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \`$scheme;
    }

    location ~ ^/survivor/(deploy|scripts|tests|docs|backend|worker)/ {
        return 404;
    }

    location ^~ /survivor/ {
        root `$PUBLIC_PARENT_DIR;
        try_files \`$uri \`$uri/ /survivor/index.html;
        expires off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }
NGINX

if [ "`$FRONTEND_HOST_PORT" = "80" ] && [ -f "`$NGINX_MAIN_SITE_CONF" ]; then
  if ! grep -Fq "include `$NGINX_SNIPPET;" "`$NGINX_MAIN_SITE_CONF"; then
    MAIN_SITE_BACKUP="`$NGINX_MAIN_SITE_CONF.bak.`$(date +%Y%m%d%H%M%S)"
    cp "`$NGINX_MAIN_SITE_CONF" "`$MAIN_SITE_BACKUP"
    awk -v include_line="    include `$NGINX_SNIPPET;" '
      !inserted && /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{/ {
        print include_line
        print ""
        inserted=1
      }
      { print }
      END {
        if (!inserted) {
          print "Could not find location / block for survivor include." > "/dev/stderr"
          exit 1
        }
      }
    ' "`$NGINX_MAIN_SITE_CONF" > "`$NGINX_MAIN_SITE_CONF.tmp"
    mv "`$NGINX_MAIN_SITE_CONF.tmp" "`$NGINX_MAIN_SITE_CONF"
    echo "Injected survivor locations into `$NGINX_MAIN_SITE_CONF"
    echo "Backed up previous main site config to `$MAIN_SITE_BACKUP"
  fi
  rm -f "`$NGINX_CONF"
else
  if [ -f "`$NGINX_MAIN_SITE_CONF" ] && grep -Fq "include `$NGINX_SNIPPET;" "`$NGINX_MAIN_SITE_CONF"; then
    MAIN_SITE_BACKUP="`$NGINX_MAIN_SITE_CONF.bak.`$(date +%Y%m%d%H%M%S)"
    cp "`$NGINX_MAIN_SITE_CONF" "`$MAIN_SITE_BACKUP"
    grep -Fv "include `$NGINX_SNIPPET;" "`$NGINX_MAIN_SITE_CONF" > "`$NGINX_MAIN_SITE_CONF.tmp"
    mv "`$NGINX_MAIN_SITE_CONF.tmp" "`$NGINX_MAIN_SITE_CONF"
    echo "Removed survivor include from `$NGINX_MAIN_SITE_CONF for port-based deployment."
    echo "Backed up previous main site config to `$MAIN_SITE_BACKUP"
  fi
  cat > "`$NGINX_CONF" <<NGINX_SERVER
server {
    listen `$FRONTEND_HOST_PORT;
    server_name `$SERVER_NAMES;

    include `$NGINX_SNIPPET;

    location / {
        return 404;
    }
}
NGINX_SERVER
  echo "Wrote standalone survivor Nginx config to `$NGINX_CONF:"
  sed -n '1,120p' "`$NGINX_CONF"
fi

nginx -t
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload nginx
else
  nginx -s reload
fi

if command -v ss >/dev/null 2>&1; then
  if ! ss -ltn "( sport = :`$FRONTEND_HOST_PORT )" | grep -q ":`$FRONTEND_HOST_PORT"; then
    echo "Nginx reload completed, but port `$FRONTEND_HOST_PORT is not listening." >&2
    echo "Effective survivor config:" >&2
    sed -n '1,160p' "`$NGINX_CONF" >&2 || true
    exit 1
  fi
fi

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

wait_url() {
  URL="`$1"
  LABEL="`$2"
  ATTEMPTS=30
  SLEEP_SECONDS=1
  i=1
  while [ "`$i" -le "`$ATTEMPTS" ]; do
    if check_url "`$URL"; then
      return 0
    fi
    if [ "`$i" = "1" ]; then
      echo "Waiting for `$LABEL: `$URL"
    fi
    sleep "`$SLEEP_SECONDS"
    i=`$((i + 1))
  done
  return 1
}

if ! wait_url "http://127.0.0.1:`$FRONTEND_HOST_PORT/survivor/" "frontend"; then
  echo "Frontend health check failed after waiting." >&2
  echo "Nginx survivor config:" >&2
  sed -n '1,160p' "`$NGINX_CONF" >&2 || true
  exit 1
fi
if ! wait_url "http://127.0.0.1:`$BACKEND_HOST_PORT/api/health" "backend container"; then
  echo "Backend container health check failed after waiting." >&2
  docker ps -a --filter "name=`$BACKEND_CONTAINER" >&2 || true
  docker logs --tail 120 "`$BACKEND_CONTAINER" >&2 || true
  exit 1
fi
if ! wait_url "http://127.0.0.1:`$FRONTEND_HOST_PORT/survivor/api/health" "backend nginx proxy"; then
  echo "Backend Nginx proxy health check failed after waiting." >&2
  echo "Nginx survivor config:" >&2
  sed -n '1,160p' "`$NGINX_CONF" >&2 || true
  docker ps -a --filter "name=`$BACKEND_CONTAINER" >&2 || true
  docker logs --tail 120 "`$BACKEND_CONTAINER" >&2 || true
  exit 1
fi

docker ps --filter "name=`$BACKEND_CONTAINER"

echo "Deployment complete."
echo "Frontend: `$PUBLIC_BASE_URL/"
echo "Backend health: `$PUBLIC_BASE_URL/api/health"
echo "Admin: `$PUBLIC_BASE_URL/admin"
echo "Admin token: `$ADMIN_TOKEN_VALUE"
echo "Auth proxy: /sszl/ -> `$AUTH_PROXY_PASS_VALUE"
"@

New-Item -ItemType Directory -Force -Path $deployRoot | Out-Null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($remoteScriptPath, $remoteScript, $utf8NoBom)

if ($PackageOnly) {
  Write-Host "Package created: $archivePath"
  Write-Host "Remote script created: $remoteScriptPath"
  return
}

$target = "${User}@${Server}"
Write-Host "Project Root : $projectRoot"
Write-Host "Archive      : $archivePath"
Write-Host "Target       : $target"
Write-Host "Remote Dir   : $RemoteDir"
Write-Host "Public URL   : $publicBaseUrl/"
Write-Host "Server Names : $serverNames"
Write-Host "Frontend Port: $FrontendHostPort"
Write-Host "Admin Token  : $AdminToken"
Write-Host "Auth Proxy   : /sszl/ -> $AuthProxyPass"
Write-Host "Backend Port : 127.0.0.1:$BackendHostPort -> container 5010"
if ($RebuildBackend) {
  Write-Host "Backend Build: force rebuild"
} else {
  Write-Host "Backend Build: first deploy only"
}

& scp -P $SshPort $archivePath "${target}:/tmp/survivor-fullstack.zip"
& scp -P $SshPort $remoteScriptPath "${target}:/tmp/survivor-deploy-fullstack.sh"
& ssh -p $SshPort $target "bash /tmp/survivor-deploy-fullstack.sh"

if (-not $NoBrowser) {
  Start-Process "$publicBaseUrl/" | Out-Null
}

# 混乱幸存者部署手册

本文对应当前项目的生产部署方式：

- 游戏前端：Docker + Nginx 静态容器，监听服务器 `5000` 端口。
- 排行榜：宿主机 Python 3 服务，由 systemd 常驻运行，监听 Docker 网桥地址的 `8000` 端口。
- 数据库：宿主机 `/opt/survivor-data/leaderboard.db` 单文件 SQLite 数据库。
- 对外入口：已有的 `sszl-nginx` 容器监听 `80` 端口，将 `/survivor/` 和 `/survivor/api/` 代理到游戏与排行榜服务。

生产环境不建议把排行榜 SQLite 放在当前服务器的 Docker 卷中。该服务器曾出现 SQLite `disk I/O error`，而宿主机目录中的 SQLite 已验证可以正常写入。

## 1. 部署后的访问结构

```text
浏览器
  └─ http://服务器IP/survivor/
       └─ sszl-nginx:80
            ├─ /survivor/      -> 宿主机 172.17.0.1:5000 -> survivor 前端容器:80
            └─ /survivor/api/  -> 宿主机 172.17.0.1:8000 -> Python 排行榜服务
                                                        └─ /opt/survivor-data/leaderboard.db
```

前端会从 URL 的 `token` 参数或浏览器 `localStorage.token` 读取登录凭证，并以 `Authorization` 请求排行榜服务。没有 token 或 token 校验失败时，会跳转到：

```text
http://8.130.41.52/login
```

## 2. 项目目录说明

| 目录 / 文件 | 用途 |
| --- | --- |
| `assets/` | 游戏音乐、图标和图片等静态资源；`survivor-app-icon.png` 是应用图标。 |
| `backend/` | 排行榜 Python 服务、SQLite 建表脚本、接口协议和后端测试。 |
| `backend/server.py` | HTTP API、用户 token 转发校验、CORS 与错误日志。 |
| `backend/leaderboard_store.py` | SQLite 初始化、战绩同步、排行榜查询。 |
| `backend/schema.sql` | `survivor_player_stats`、`survivor_run_record` 表及索引定义。 |
| `data/` | 本地开发默认 SQLite 数据目录；生产环境改用 `/opt/survivor-data/`。 |
| `deploy/` | 镜像内 Nginx 配置等部署资源。 |
| `deploy/nginx/docker.conf` | `survivor` 前端容器内部的 Nginx 配置；包含 `/survivor/` 静态路径与 API 转发规则。 |
| `scripts/` | 本地启动工具；`no_cache_server.py` 会关闭缓存并把本地 `/api/` 转发给排行榜服务。 |
| `src/` | 原生 ES Module 游戏源码：主循环、UI、战斗、配置、排行榜前端逻辑等。 |
| `tests/` | 前端或通用验证脚本。 |
| `tools/` | 独立开发工具，例如敌人配置编辑器。 |
| `.agents/`、`.cocoindex_code/`、`.VSCodeCounter/` | 本地开发工具生成的辅助目录，不参与游戏运行和生产部署。 |
| `Dockerfile` | 前端镜像构建文件：基于 Nginx 并复制游戏静态资源。 |
| `docker-compose.yml` | 本地/演示用 Compose 样例；生产环境请使用本文的前端单服务 Compose。 |
| `DEPLOY.md` | 本部署手册。 |

## 3. 部署前检查

### 3.1 本地环境

Windows 本地需要：

- Docker Desktop（可执行 `docker build`、`docker save`）。
- OpenSSH 客户端（可执行 `ssh`、`scp`）。
- 用于构建的项目根目录，例如 `C:\Projects\CISDI\survivor`。

可先做基础校验：

```powershell
cd C:\Projects\CISDI\survivor
node --check .\src\services\userProfile.js
python -m py_compile .\backend\server.py .\backend\leaderboard_store.py
git diff --check
```

### 3.2 服务器环境

服务器需要：

- Docker 与 Docker Compose v2（`docker compose version`）。
- Python 3.6 或更高版本（本项目生产后端已兼容 Python 3.6）。
- 已运行的 `sszl-nginx` 容器，并且它对外映射 `80:80`。
- `root` 权限或等效 sudo 权限。

检查：

```bash
docker --version
docker compose version
python3 --version
docker ps
```

## 4. 首次部署：构建并传输前端镜像

在本地 PowerShell 中执行。每次前端代码、CSS、图标或配置修改后，都需要重新执行本节。

```powershell
cd C:\Projects\CISDI\survivor

docker build --no-cache -t survivor:latest .
docker save -o survivor-frontend.tar survivor:latest

scp -i C:\Users\xiaol\.ssh\survivor_deploy_tmp `
  .\survivor-frontend.tar root@8.130.41.52:/root/
```

如果使用密码登录，去掉 `-i` 与私钥路径即可：

```powershell
scp .\survivor-frontend.tar root@8.130.41.52:/root/
```

镜像 tar 文件只用于传输；服务器上 `docker load` 完成后可以保留，便于回滚，也可以在确认稳定后手工删除。

## 5. 首次部署：准备 Python 排行榜服务

### 5.1 上传后端文件

本地执行：

```powershell
cd C:\Projects\CISDI\survivor

scp -i C:\Users\xiaol\.ssh\survivor_deploy_tmp `
  .\backend\server.py `
  .\backend\leaderboard_store.py `
  .\backend\schema.sql `
  root@8.130.41.52:/opt/survivor-backend/
```

若服务器还没有目录，先连接服务器执行：

```bash
mkdir -p /opt/survivor-backend /opt/survivor-data
```

然后重新执行上传命令。

### 5.2 初始化 SQLite 数据库

排行榜服务首次启动时会自动创建数据库、两张数据表和索引，无需手工执行 SQL。

先确认宿主机目录可写：

```bash
mkdir -p /opt/survivor-data

python3 - <<'PY'
import sqlite3
connection = sqlite3.connect('/opt/survivor-data/host_test.db')
connection.execute('CREATE TABLE IF NOT EXISTS t(id INTEGER)')
connection.commit()
connection.close()
print('host sqlite ok')
PY
```

可删除这份无业务数据的测试文件：

```bash
rm -f /opt/survivor-data/host_test.db
```

实际数据库文件为：

```text
/opt/survivor-data/leaderboard.db
```

如果要手动检查表结构：

```bash
sqlite3 /opt/survivor-data/leaderboard.db '.schema'
```

### 5.3 创建 systemd 服务

创建 `/etc/systemd/system/survivor-leaderboard.service`：

```bash
cat > /etc/systemd/system/survivor-leaderboard.service <<'EOF'
[Unit]
Description=Survivor Leaderboard API
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/opt/survivor-backend
Environment=SURVIVOR_API_HOST=172.17.0.1
Environment=SURVIVOR_API_PORT=8000
Environment=SURVIVOR_DB_PATH=/opt/survivor-data/leaderboard.db
Environment=SURVIVOR_USER_INFO_URL=http://127.0.0.1/sszl/user/simple-info
ExecStart=/usr/bin/python3 /opt/survivor-backend/server.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

说明：

- `172.17.0.1` 是当前 Docker 默认网桥在宿主机侧的地址，`sszl-nginx` 容器可通过它访问 Python 服务。
- 如服务器的 Docker 网桥地址不同，执行 `ip -4 addr show docker0`，将 service 和 Nginx 中的地址统一改为实际地址。
- `SURVIVOR_USER_INFO_URL` 指向同一台服务器已有的赛数助理用户信息接口。开发/测试环境可通过此环境变量替换为对应环境地址。

启用并启动：

```bash
python3 -m py_compile /opt/survivor-backend/server.py /opt/survivor-backend/leaderboard_store.py
systemctl daemon-reload
systemctl enable survivor-leaderboard
systemctl restart survivor-leaderboard
systemctl status survivor-leaderboard --no-pager
```

直接健康检查：

```bash
curl http://172.17.0.1:8000/api/health
```

预期：

```json
{"status":"ok"}
```

## 6. 首次部署：启动前端容器

服务器上创建生产用 `/root/docker-compose.yml`。该文件只管理前端容器；排行榜已由 systemd 管理。

```bash
cat > /root/docker-compose.yml <<'EOF'
services:
  survivor:
    image: survivor:latest
    container_name: survivor
    ports:
      - "5000:80"
    restart: unless-stopped
EOF
```

加载从本地传来的镜像并启动：

```bash
cd /root
docker load -i survivor-frontend.tar
docker compose -f /root/docker-compose.yml up -d --no-build --force-recreate survivor
docker ps --filter name=survivor
```

前端容器应显示类似：

```text
0.0.0.0:5000->80/tcp
```

> `5000` 不能只绑定到 `127.0.0.1`，因为外层 `sszl-nginx` 容器需要通过 Docker 网桥访问宿主机的 5000 端口。

## 7. 配置外层 sszl-nginx 路由

当前 `sszl-nginx` 的 Nginx 配置目录挂载自宿主机：

```text
/opt/sszl-app/nginx/conf/conf.d -> /etc/nginx/conf.d
```

因此应编辑宿主机文件，而不是容器内部只读文件：

```bash
CONF=/opt/sszl-app/nginx/conf/conf.d/default.conf
cp "$CONF" "$CONF.bak.$(date +%Y%m%d%H%M%S)"
vi "$CONF"
```

在 `server { ... }` 内加入以下配置（若已经存在则核对内容，不要重复添加）：

```nginx
location = /survivor {
    return 301 /survivor/?$args;
}

location ^~ /survivor/api/ {
    proxy_pass http://172.17.0.1:8000/api/;
    proxy_http_version 1.1;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;
    add_header Cache-Control "no-store" always;
}

location ^~ /survivor/ {
    proxy_pass http://172.17.0.1:5000/survivor/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;
    add_header Cache-Control "no-store" always;
}
```

配置检查并热加载：

```bash
docker exec sszl-nginx nginx -t
docker exec sszl-nginx nginx -s reload
```

验证外层转发：

```bash
curl -I http://127.0.0.1/survivor/
curl http://127.0.0.1/survivor/api/health
```

预期分别为 `HTTP/1.1 200 OK` 与：

```json
{"status":"ok"}
```

## 8. 日常更新流程

### 8.1 仅更新前端

适用于 `src/`、`assets/`、`styles.css`、`index.html`、前端配置或图标变更。

本地：

```powershell
cd C:\Projects\CISDI\survivor
docker build --no-cache -t survivor:latest .
docker save -o survivor-frontend.tar survivor:latest
scp -i C:\Users\xiaol\.ssh\survivor_deploy_tmp .\survivor-frontend.tar root@8.130.41.52:/root/
```

服务器：

```bash
cd /root
docker load -i survivor-frontend.tar
docker compose -f /root/docker-compose.yml up -d --no-build --force-recreate survivor
docker exec sszl-nginx nginx -t
docker exec sszl-nginx nginx -s reload
```

检查当前镜像是否包含最新代码，例如 token 跳转逻辑：

```bash
docker exec survivor grep -n "8.130.41.52/login" /usr/share/nginx/html/src/services/userProfile.js
```

### 8.2 仅更新排行榜后端

先备份数据库：

```bash
cp -a /opt/survivor-data/leaderboard.db \
  /opt/survivor-data/leaderboard.db.bak.$(date +%Y%m%d%H%M%S)
```

本地上传后端文件：

```powershell
scp -i C:\Users\xiaol\.ssh\survivor_deploy_tmp `
  .\backend\server.py `
  .\backend\leaderboard_store.py `
  .\backend\schema.sql `
  root@8.130.41.52:/opt/survivor-backend/
```

服务器验证并重启：

```bash
python3 -m py_compile /opt/survivor-backend/server.py /opt/survivor-backend/leaderboard_store.py
systemctl restart survivor-leaderboard
systemctl status survivor-leaderboard --no-pager
curl http://172.17.0.1:8000/api/health
```

数据库建表脚本使用 `CREATE TABLE IF NOT EXISTS`，普通后端更新不会清空已有排行榜数据。表结构升级时必须先备份数据库并单独编写迁移 SQL；不要删除 `leaderboard.db` 作为更新手段。

### 8.3 同时更新前后端

先完成后端更新与健康检查，再更新前端镜像。最后执行：

```bash
curl http://127.0.0.1/survivor/api/health
curl -I http://127.0.0.1/survivor/
```

## 9. 验收与接口检查

### 9.1 服务状态

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
systemctl status survivor-leaderboard --no-pager
```

应看到：

- `survivor` 为 `Up`，并映射 `5000->80`。
- `survivor-leaderboard.service` 为 `active (running)`。
- `sszl-nginx` 为 `Up`，并映射 `80->80`。

### 9.2 用户身份接口

将示例 token 换成真实 token：

```bash
TOKEN='真实token'
curl -i -H "Authorization: $TOKEN" \
  http://127.0.0.1/survivor/api/v1/survivor/session
```

成功时应返回用户 `id`、`username` 与 `employeeId`。用户信息接口上游不可用或 token 无效时应返回 `401`。

### 9.3 战绩同步接口

```bash
TOKEN='真实token'
curl -i -X POST \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "runId":"manual-check-20260722-001",
    "difficultyId":"ember",
    "playedSeconds":28,
    "kills":8,
    "bossKills":0,
    "status":"ABANDONED",
    "startedAt":"2026-07-22T08:00:00.000Z",
    "clientUpdatedAt":"2026-07-22T08:00:28.000Z"
  }' \
  http://127.0.0.1/survivor/api/v1/survivor/runs/sync
```

成功时返回 `200`、`runId`、`status`、`acceptedAt`。同一个 `runId` 可重复提交相同或递增统计，避免使用相同 runId 测试不同战局。

### 9.4 浏览器验收

1. 从赛数助理外部应用入口进入，确认 URL 带有 `token` 参数。
2. 游戏加载完成后，确认显示已识别用户信息和排行榜入口。
3. 清理 `localStorage.token` 与 `sessionStorage.pixel-survivor-user-token` 后访问 `/survivor/`，应跳转 `/login`。
4. 开始并结束一局游戏，打开排行榜，确认总时长、总击杀等数据已写入。

## 10. 常见问题排查

### 10.1 `/survivor/` 返回 502

先检查前端容器：

```bash
docker ps --filter name=survivor
docker logs survivor --tail 100
curl -I http://127.0.0.1:5000/survivor/
```

若 5000 无法连接，重新加载镜像并强制重建容器：

```bash
cd /root
docker load -i survivor-frontend.tar
docker compose -f /root/docker-compose.yml up -d --no-build --force-recreate survivor
```

### 10.2 `/survivor/api/health` 返回 502 或 504

检查 Python 服务与网桥地址：

```bash
systemctl status survivor-leaderboard --no-pager
journalctl -u survivor-leaderboard -n 100 --no-pager
curl http://172.17.0.1:8000/api/health
docker exec sszl-nginx wget -qO- http://172.17.0.1:8000/api/health
```

若宿主机能访问而 Nginx 容器无法访问，核对 `SURVIVOR_API_HOST`、docker0 地址和 Nginx `proxy_pass` 是否一致。

### 10.3 战绩同步返回 500

查看完整 Python 堆栈：

```bash
journalctl -u survivor-leaderboard -n 100 --no-pager
```

当前后端已经避免使用旧 SQLite 不支持的 `ON CONFLICT ... DO UPDATE` 与窗口函数写法。若日志仍出现相关 SQL 语法错误，说明服务器运行的还是旧版 `leaderboard_store.py`；重新上传后端文件并重启 systemd 服务。

### 10.4 SQLite `disk I/O error`

不要再将排行榜数据库挂载到有问题的 Docker 卷。确认当前数据库位于宿主机：

```bash
systemctl cat survivor-leaderboard
ls -lah /opt/survivor-data/
python3 - <<'PY'
import sqlite3
connection = sqlite3.connect('/opt/survivor-data/leaderboard.db')
print(connection.execute('PRAGMA integrity_check').fetchone()[0])
connection.close()
PY
```

预期完整性检查输出 `ok`。

### 10.5 页面显示旧版本或浏览器缓存

镜像内 Nginx 与外层 Nginx 均配置了 `no-store`。仍出现旧页面时按顺序检查：

```bash
docker exec survivor cat /usr/share/nginx/html/src/config/game-config.json
docker exec survivor grep -n "8.130.41.52/login" /usr/share/nginx/html/src/services/userProfile.js
curl -I http://127.0.0.1/survivor/
```

然后使用浏览器 Ctrl+F5 强制刷新一次。更新镜像时务必使用：

```bash
docker compose -f /root/docker-compose.yml up -d --no-build --force-recreate survivor
```

### 10.6 Nginx 配置修改后不生效

先确认修改的是宿主机挂载目录，而不是容器内 `/etc/nginx/conf.d`：

```bash
docker inspect sszl-nginx --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} RW={{.RW}}{{println}}{{end}}'
grep -n -C 6 "survivor/api" /opt/sszl-app/nginx/conf/conf.d/default.conf
docker exec sszl-nginx nginx -T | grep -n -C 6 "survivor/api"
```

完成修改后始终执行：

```bash
docker exec sszl-nginx nginx -t
docker exec sszl-nginx nginx -s reload
```

## 11. 本地开发启动

项目不需要前端构建工具。推荐执行：

```powershell
cd C:\Projects\CISDI\survivor
.\start.cmd
```

该脚本会启动无缓存静态服务；如果本机 `8000` 端口没有排行榜服务，也会尝试启动 `backend/server.py`。本地用户信息上游地址可通过环境变量覆盖：

```powershell
$env:SURVIVOR_USER_INFO_URL = 'http://127.0.0.1/sszl/user/simple-info'
.\start.cmd
```

停止命令窗口后，本地静态服务和由脚本启动的排行榜服务都会停止。

### 11.1 本地跳过 token 校验

`src/config/game-config.json` 中的配置默认已开启：

```json
"skipTokenValidationOnLocalhost": true
```

该开关只在浏览器地址为 `localhost`、`127.0.0.1` 或 `::1` 时有效。本地启动游戏时不读取、不请求也不校验 token，可直接进入游戏；排行榜和战绩同步会保持禁用。

生产服务器域名/IP 不会受这个开关影响，仍必须具备有效 token，缺少 token 或接口返回 `401` 时会跳转登录页。若希望本地也模拟生产身份校验，将此值改为 `false` 后刷新页面即可。

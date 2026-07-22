# 部署说明（Nginx 与 Docker）

## 1. 使用 Nginx 直接部署

### 1.1 上传项目
把当前项目目录上传到服务器，例如：

```bash
sudo mkdir -p /var/www/survivor
sudo rsync -av --delete ./ /var/www/survivor/
```

### 1.2 配置 Nginx
项目已提供配置文件：`deploy/nginx/survivor.conf`。

在服务器执行：

```bash
sudo cp /var/www/survivor/deploy/nginx/survivor.conf /etc/nginx/conf.d/survivor.conf
```

按实际情况修改：
- `server_name your-domain.com;` 改成你的域名或服务器 IP
- `root /var/www/survivor;` 改成你的项目实际路径（如果不同）

### 1.3 检查并重载

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 1.4 访问

默认端口是 `5000`：

```text
http://your-domain.com:5000/
```

---

## 2. 使用 Docker 部署

项目已提供：
- `Dockerfile`
- `docker-compose.yml`
- `nginx/default.conf`

### 2.1 构建并启动

```bash
docker compose up -d --build
```

### 2.2 查看状态与日志

```bash
docker compose ps
docker compose logs -f
```

### 2.3 访问

`docker-compose.yml` 已映射端口 `5000:80`，访问：

```text
http://your-server-ip:5000/
```

### 2.4 停止与重启

```bash
docker compose down
docker compose up -d
```

---

## 3. 排行榜服务

排行榜由 `backend/server.py` 提供，数据保存在单个 SQLite 文件中。

- 直接使用 Nginx 部署时，先运行 `python backend/server.py --host 127.0.0.1 --port 8000`，再使用 `deploy/nginx/survivor.conf`。Nginx 会把同源 `/api/` 请求代理到该服务。
- 使用 Docker Compose 部署时，`leaderboard` 服务会自动启动，数据库位于 `leaderboard-data` 命名卷；更新或重建容器不会删除排行榜数据。
- 排行榜服务需要能够访问文档约定的现有用户信息接口，以便在服务端校验客户端提交的原始 `Authorization` token。

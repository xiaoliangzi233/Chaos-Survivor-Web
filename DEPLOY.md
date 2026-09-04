# Survivor Docker 部署

本项目部署到赛数助理测试服务器 `1.14.93.50`，只使用 Docker Compose 启动。前端由 Nginx 容器提供，后端由 FastAPI 容器提供。

```text
服务器：1.14.93.50
用户：root
远程目录：/opt/survivor
前端容器：survivor-frontend
后端容器：survivor-backend
访问地址：http://139.155.133.14:8081/survivor/
```

## 首次部署

在本机项目根目录执行：

```powershell
.\deploy-fullstack.cmd
```

脚本会自动完成：

1. 打包当前项目的 Docker 部署文件
2. 上传到 `root@1.14.93.50:/tmp/survivor-fullstack.zip`
3. 在服务器解压到 `/opt/survivor`
4. 生成 `.env`
5. 执行 `docker compose up -d --build --remove-orphans`
6. 自动检查 `http://127.0.0.1:8081/survivor/` 和 `http://127.0.0.1:8081/survivor/api/health`

服务器已有 Docker，因此部署脚本不会安装 Docker，也不会在 `survivor` 下再创建 `docker` 子目录。

首次连接服务器时，命令行可能要求确认主机指纹，输入 `yes`。如果没有配置 SSH 密钥，会提示输入 `root` 密码。

如果登录服务不是宿主机的 `8080` 端口，需要指定真实地址：

```powershell
.\deploy-fullstack.cmd -AuthProxyPass "http://真实登录服务地址"
```

如果要指定管理后台 token：

```powershell
.\deploy-fullstack.cmd -AdminToken "your-strong-admin-token"
```

部署完成后访问：

```text
http://139.155.133.14:8081/survivor/
http://139.155.133.14:8081/survivor/api/health
http://139.155.133.14:8081/survivor/admin
```

正常情况下不需要再登录服务器手动启动。脚本结束时，前端 Nginx 容器和后端 FastAPI 容器都已经启动。

部署成功后，本机会自动打开浏览器访问 `http://139.155.133.14:8081/survivor/`。如果不想自动打开浏览器：

```powershell
.\deploy-fullstack.cmd -NoBrowser
```

## 后续部署

代码修改后，仍然执行同一个命令：

```powershell
.\deploy-fullstack.cmd
```

脚本会重新上传代码，并在服务器执行：

```bash
cd /opt/survivor
docker compose up -d --build
```

如果要和部署脚本保持一致：

```bash
docker compose up -d --build --remove-orphans
```

Docker 会重建镜像并滚动替换容器。后端 SQLite 数据保存在 Docker volume `survivor-data`，后续部署不会清空玩家数据。

## 服务器常用命令

登录服务器：

```powershell
ssh root@1.14.93.50
```

进入部署目录：

```bash
cd /opt/survivor
```

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

重启服务：

```bash
docker compose restart
```

停止服务：

```bash
docker compose down
```

重新构建并启动：

```bash
docker compose up -d --build
```

## 部署结构

Docker Compose 配置：

```text
docker-compose.yml
```

前端 Nginx：

```text
Dockerfile
deploy/nginx/docker-fullstack.conf.template
```

后端服务：

```text
backend/Dockerfile
backend/requirements.txt
```

Nginx 容器内路由：

```text
/survivor/       -> 前端页面
/survivor/api/   -> survivor-backend:5010
/survivor/admin  -> survivor-backend:5010/admin
/sszl/           -> 登录服务，由 AUTH_PROXY_PASS 指定
```

前端发布时会自动使用同源后端：

```json
{
  "apiBaseUrl": ".",
  "requireLogin": true,
  "defaultNickname": "游客"
}
```

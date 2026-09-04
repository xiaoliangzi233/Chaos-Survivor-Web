# Survivor 部署说明

本项目部署到服务器 `1.14.93.50`，浏览器访问地址为：

```text
http://139.155.133.14:18080/survivor/
```

当前只保留一套部署方式：

- 前端静态文件由服务器宿主机 Nginx 发布。
- 对外访问端口默认是独立端口 `18080`，也就是 `http://139.155.133.14:18080/survivor/`，避免影响服务器上已有测试环境或医疗系统主站。
- `/survivor/api/` 和 `/survivor/admin` 由 Nginx 反向代理到后端容器。
- 后端 FastAPI 使用 Docker 镜像和容器运行。
- 后端容器内部监听 `5010`，宿主机默认映射到 `127.0.0.1:18081`，不会占用服务器已有的 `5010`。
- 后续部署默认不重建后端镜像，避免重复安装 Python 依赖。

服务器需要已经安装：

- `docker`
- `nginx`
- `unzip`

脚本不会安装这些服务。

## 首次部署

在本机项目根目录执行：

```powershell
.\deploy-fullstack.cmd
```

脚本会自动完成：

1. 打包当前项目。
2. 上传到 `root@1.14.93.50:/tmp/survivor-fullstack.zip`。
3. 解压到服务器 `/opt/survivor`。
4. 首次构建后端 Docker 镜像 `survivor-backend:latest`。
5. 首次创建并启动后端容器 `survivor-backend`。
6. 写入 Nginx 路由片段 `/etc/nginx/snippets/survivor-locations.conf`。
7. 默认写入独立端口配置 `/etc/nginx/conf.d/survivor.conf`，监听 `18080`。
8. 执行 `nginx -t` 并重载 Nginx。
9. 检查页面和后端健康接口。

首次连接服务器时，命令行可能要求确认主机指纹，输入 `yes`。如果没有配置 SSH 密钥，会提示输入 `root` 密码。

部署完成后访问：

```text
http://139.155.133.14:18080/survivor/
http://139.155.133.14:18080/survivor/api/health
http://139.155.133.14:18080/survivor/admin
```

## 后续部署

如果只改了前端、配置、图片、样式，仍然执行：

```powershell
.\deploy-fullstack.cmd
```

后续部署会：

- 覆盖 `/opt/survivor` 中的项目文件。
- 更新 Nginx 静态文件。
- 执行 `docker restart survivor-backend`。
- 重载 Nginx。

后续部署默认不会重新构建后端镜像，因此不会重复安装 Python 依赖。

如果修改了后端代码、`backend/requirements.txt` 或 `backend/Dockerfile`，执行：

```powershell
.\deploy-fullstack.cmd -RebuildBackend
```

这会重新构建 `survivor-backend:latest`，然后删除旧后端容器并用新镜像重新创建。后端数据保存在 Docker volume `survivor-data`，重建容器不会清空数据。

如果服务器的 `18081` 也被其他服务占用，可以换一个宿主机端口：

```powershell
.\deploy-fullstack.cmd -BackendHostPort 18082
```

如果服务器的 `18080` 已经被非 Nginx 服务占用，Nginx 无法接管 `http://139.155.133.14:18080/survivor/`。先在服务器上查看：

```bash
ss -ltnp '( sport = :18080 )'
```

如果占用者是 Nginx，脚本会写入独立的 `/etc/nginx/conf.d/survivor.conf`；如果占用者是其他业务，脚本只会报错，不会自动停止。

如果需要换其他公网端口，可以这样部署：

```powershell
.\deploy-fullstack.cmd -FrontendHostPort 18082 -PublicBaseUrl "http://139.155.133.14:18082/survivor"
```

## 清空后重新部署

如果服务器之前部署失败，可以先登录服务器：

```powershell
ssh root@1.14.93.50
```

然后执行：

```bash
docker stop survivor-backend 2>/dev/null || true
docker rm survivor-backend 2>/dev/null || true
docker stop survivor-frontend 2>/dev/null || true
docker rm survivor-frontend 2>/dev/null || true
docker rmi survivor-backend:latest 2>/dev/null || true
rm -rf /opt/survivor
rm -f /etc/nginx/conf.d/survivor.conf
rm -f /etc/nginx/snippets/survivor-locations.conf
nginx -t && systemctl reload nginx
```

如果提示 `18081` 被占用，继续查看占用进程：

```bash
ss -ltnp '( sport = :18081 )'
```

如果这是其他业务服务，不要停止它，部署时改用 `-BackendHostPort` 指定其他端口。

如果要连玩家数据一起清空，再额外执行：

```bash
docker volume rm survivor-data 2>/dev/null || true
```

然后回到本机项目根目录重新部署：

```powershell
.\deploy-fullstack.cmd
```

## 登录服务

当前 Nginx 会把：

```text
/sszl/
```

代理到：

```text
http://127.0.0.1:8080
```

也就是服务器本机的登录服务。游戏中的用户信息接口最终会走：

```text
http://139.155.133.14:18080/sszl/user/simple-info
```

如果登录服务端口不同，部署时指定：

```powershell
.\deploy-fullstack.cmd -AuthProxyPass "http://127.0.0.1:你的端口"
```

## 常用命令

登录服务器：

```powershell
ssh root@1.14.93.50
```

查看后端容器：

```bash
docker ps --filter name=survivor-backend
```

查看后端日志：

```bash
docker logs -f survivor-backend
```

重启后端：

```bash
docker restart survivor-backend
```

重载 Nginx：

```bash
nginx -t && systemctl reload nginx
```

## 路由结构

```text
/survivor/       -> 前端页面
/survivor/api/   -> 后端宿主机端口 127.0.0.1:18081/api/
/survivor/admin  -> 后端宿主机端口 127.0.0.1:18081/admin
/sszl/           -> 登录服务 127.0.0.1:8080
```

服务器当前已经有 `/etc/nginx/conf.d/kcj.conf` 作为 80 端口默认主站。默认部署会避开这个主站，改用独立端口 `18080` 的 `/etc/nginx/conf.d/survivor.conf`。只有显式指定 `-FrontendHostPort 80` 时，脚本才会把 `/survivor` 路由 include 到现有 80 主站。

前端发布配置保持同源访问：

```json
{
  "apiBaseUrl": ".",
  "requireLogin": true,
  "defaultNickname": "游客",
  "authFailureMode": "redirect",
  "loginRedirectUrl": "http://139.155.133.14:8081/login"
}
```

登录成功检测逻辑：

- 游戏会先请求 `/survivor/api/auth/simple-info`。
- 后端会继续请求服务器本机登录接口 `/sszl/user/simple-info`。
- 如果同源后端校验失败，前端会直接请求 `/sszl/user/simple-info`，浏览器会自动携带 Cookie。
- 返回结果能解析出 `id` 和 `username` 时，认为登录成功。
- 登录失败后由 `authFailureMode` 控制：`redirect` 跳转到 `loginRedirectUrl`，`guest` 以游客身份进入游戏。

# Survivor 前端部署

本项目是纯静态 HTML/CSS/JavaScript 游戏，不需要数据库、Python API、用户认证服务或其他后端进程。玩家进度、图鉴和最佳生存时间保存在当前浏览器的 `localStorage` 中。

## 本地启动

```powershell
.\start.cmd
```

默认访问：

```text
http://127.0.0.1:5000/
```

`start.cmd` 只启动 `scripts/no_cache_server.py` 静态文件服务，不会监听或代理 API 端口。

## Docker 部署

```powershell
docker compose up -d --build
```

容器只运行 Nginx：

```text
http://127.0.0.1:5000/
```

停止服务：

```powershell
docker compose down
```

## 直接部署到 Nginx

将以下前端文件和目录复制到站点根目录：

- `index.html`
- `styles.css`
- `favicon.ico`
- `assets/`
- `src/`

可参考：

- `deploy/nginx/survivor.conf`：独立端口部署。
- `deploy/nginx/docker.conf`：Docker 镜像配置。

部署后检查：

```text
/index.html
/styles.css
/src/core/game.js
/src/config/game-config.json
```

这些请求应返回 `200`，且响应应禁用缓存以方便版本更新。

## 数据说明

- 不上传玩家身份或战局数据。
- 不提供排行榜和反馈接口。
- 清除浏览器站点数据会同时清除本地难度进度、图鉴和最佳纪录。

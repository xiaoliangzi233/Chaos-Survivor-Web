# Survivor 打包与部署

本项目是原生 HTML/CSS/JavaScript 游戏，前端不需要构建工具。默认推荐先部署静态前端：Nginx 负责托管页面和静态资源，登录接口使用同主机相对路径 `/sszl/user/simple-info`。

服务器信息：

```text
服务器：123.60.184.90
用户：root
默认站点目录：/var/www/survivor
```

## 上线前配置

登录开关在：

```text
src/config/backend-config.json
```

需要部署后默认登录时设置：

```json
{
  "apiBaseUrl": "",
  "requireLogin": true,
  "defaultNickname": "Anonymous"
}
```

`apiBaseUrl` 留空时，前端会直接请求当前服务器下的 `/sszl/user/simple-info`，不再写死服务器 IP。

## 一键部署

在 Windows 本机项目根目录执行：

```powershell
.\deploy-static.cmd
```

等价 PowerShell 命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-static.ps1
```

脚本会自动完成：

1. 从当前项目复制前端发布文件到 `.deploy/stage`
2. 压缩为 `.deploy/survivor-web.zip`
3. 通过 `scp` 上传到 `root@123.60.184.90:/tmp/survivor-web.zip`
4. 通过 `ssh` 登录服务器
5. 备份旧 `/var/www/survivor` 为 `/var/www/survivor.bak.<时间戳>`
6. 清空并解压新前端文件到 `/var/www/survivor`

第一次连接服务器时，`ssh/scp` 可能会要求确认主机指纹，输入 `yes` 即可。服务器使用密码登录时会提示输入 root 密码；使用密钥登录时会自动走本机 SSH 配置。

## 同时写入 Nginx 配置

如果服务器还没有配置 Nginx，可以用：

```powershell
.\deploy-static.cmd -ConfigureNginx
```

它会在服务器写入：

```text
/etc/nginx/conf.d/survivor.conf
```

并执行：

```bash
nginx -t
systemctl reload nginx
```

默认监听 80 端口，访问地址：

```text
http://123.60.184.90/
```

如果要换站点目录：

```powershell
.\deploy-static.cmd -RemoteDir /var/www/survivor-test
```

如果 SSH 端口不是 22：

```powershell
.\deploy-static.cmd -SshPort 2222
```

如果只想验证打包、不上传服务器：

```powershell
.\deploy-static.cmd -PackageOnly
```

## 手动打包

如果只想手动打包，可以在项目根目录运行：

```powershell
Compress-Archive -Force `
  -Path index.html,styles.css,favicon.ico,assets,src,styles,vendor `
  -DestinationPath survivor-web.zip
```

发布包需要包含：

```text
index.html
styles.css
favicon.ico
assets/
src/
styles/
vendor/
```

不要上传这些开发或服务端目录到静态站点：

```text
.git/
tests/
scripts/
deploy/
docs/
backend/
worker/
```

## 手动上传与部署

上传：

```powershell
scp .\survivor-web.zip root@123.60.184.90:/tmp/survivor-web.zip
```

登录服务器：

```powershell
ssh root@123.60.184.90
```

服务器上执行：

```bash
mkdir -p /var/www/survivor
cp -a /var/www/survivor /var/www/survivor.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
find /var/www/survivor -mindepth 1 -maxdepth 1 -exec rm -rf {} +
unzip -oq /tmp/survivor-web.zip -d /var/www/survivor
```

Nginx 配置参考：

```nginx
server {
    listen 80;
    server_name 123.60.184.90;

    root /var/www/survivor;
    index index.html;

    if_modified_since off;
    etag off;

    location ~ ^/(deploy|scripts|tests|docs|backend|worker)/ {
        return 404;
    }

    location / {
        try_files $uri $uri/ /index.html;
        expires off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location ~* \.(js|mjs|css|png|jpg|jpeg|gif|ico|svg|webp|mp3|wav|ogg|json)$ {
        expires off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        try_files $uri =404;
    }
}
```

检查并重载：

```bash
nginx -t
systemctl reload nginx
```

## 服务器准备

服务器需要有 `nginx` 和 `unzip`。

Ubuntu/Debian：

```bash
apt update
apt install -y nginx unzip
```

CentOS/Rocky/Alma：

```bash
yum install -y nginx unzip
systemctl enable --now nginx
```

如果云服务器安全组或系统防火墙未放行 80 端口，需要放行后才能通过浏览器访问。

## 可选后端

`backend/` 是可选 FastAPI + SQLite 服务，用于服务端存档、排行榜、反馈和管理配置。只部署游戏前端和登录校验时，不需要上传 `backend/`。

如果后续要启用后端，建议使用独立部署方案：

```text
Nginx 静态站点：/
Python 后端：127.0.0.1:5010
Nginx 代理：/api/ -> 127.0.0.1:5010
```

届时再把 `src/config/backend-config.json` 中的 `apiBaseUrl` 设为同源 API，例如空字符串配合 Nginx 代理，或显式设置为后端地址。

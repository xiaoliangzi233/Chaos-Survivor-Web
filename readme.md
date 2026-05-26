### 二、部署方式
#### 2.1 Nginx
1. 上传项目文件：将项目文件放置到服务器目录，例如：/path/game/survivor
2. 添加 Nginx 配置：在 Nginx 配置文件（如 nginx.conf 或 /etc/nginx/conf.d/survivor.conf）中添加以下内容：
```conf
server {
    listen 5000;
    server_name your-domain.com;

    root /path/game/survivor;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
3. 重载 Nginx 服务
```bash
sudo nginx -t          # 测试配置是否正确
sudo systemctl reload nginx   # 重载配置
```

4. 访问项目: 浏览器打开：http://your-domain.com:5000
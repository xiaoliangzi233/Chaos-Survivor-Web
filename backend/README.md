# 混乱幸存者数据服务

这是一个只使用 Python 标准库的轻量服务，为游戏提供排行榜、战绩同步、账户进度和用户反馈 CRUD。数据保存在单个 SQLite 文件中，不需要安装第三方依赖。

## 启动

```powershell
python .\backend\server.py --host 127.0.0.1 --port 8000
```

数据库默认创建在：

```text
backend/data/leaderboard.db
```

也可以通过环境变量配置：

```powershell
$env:SURVIVOR_API_HOST = "127.0.0.1"
$env:SURVIVOR_API_PORT = "8000"
$env:SURVIVOR_DB_PATH = "D:\survivor-data\leaderboard.db"
$env:SURVIVOR_USER_INFO_URL = "http://113.249.91.32/sszl/user/simple-info"
$env:SURVIVOR_ALLOWED_ORIGINS = "http://127.0.0.1:5000,https://game.example.com"
python .\backend\server.py
```

生产环境推荐让服务只监听 `127.0.0.1:8000`，由 Nginx 将 `/api/` 反向代理到该端口。不要把 SQLite 文件放进网站静态目录。

## 健康检查

```text
GET /api/health
```

## 备份

停止写入后复制 `leaderboard.db` 即可。运行期间备份建议使用 SQLite 自带的 `.backup` 命令，避免只复制主文件而遗漏 WAL 中尚未合并的数据。

完整协议见 [接口协议.md](./接口协议.md)，表结构见 [schema.sql](./schema.sql)。

## 测试

```powershell
python -m unittest discover -s backend/tests -v
```

从项目根目录执行 `start.cmd` 时，会自动启动本服务，并由无缓存静态服务器把同源 `/api/` 请求转发到 `127.0.0.1:8000`。

项目根目录的 `docker compose up -d --build` 会同时启动 Nginx 前端和本服务，SQLite 文件保存在 `leaderboard-data` 命名卷中，重建容器不会丢失排行榜、玩家进度或反馈数据。服务启动时会自动执行 `schema.sql`，已有数据库会增量创建缺少的数据表，无需手工清空或重建数据库。

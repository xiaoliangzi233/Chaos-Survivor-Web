import argparse
import json
import os
import traceback
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from typing import Dict
from urllib.parse import parse_qs, urlparse

from leaderboard_store import LeaderboardStore, StoreError


DEFAULT_USER_INFO_URL = "http://127.0.0.1/sszl/user/simple-info"


class LeaderboardHandler(BaseHTTPRequestHandler):
    server_version = "SurvivorData/1.1"

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/v1/survivor/session":
            return self.handle_session()
        if parsed.path == "/api/v1/survivor/leaderboard":
            return self.handle_leaderboard(parse_qs(parsed.query))
        if parsed.path == "/api/v1/survivor/feedback":
            return self.handle_feedback_list(parse_qs(parsed.query))
        if parsed.path == "/api/v1/survivor/progress":
            return self.handle_player_progress()
        if parsed.path == "/api/health":
            return self.write_json(HTTPStatus.OK, {"status": "ok"})
        self.write_error(HTTPStatus.NOT_FOUND, "NOT_FOUND", "接口不存在")

    def handle_session(self):
        try:
            self.write_json(HTTPStatus.OK, self.require_user())
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("session request failed: %s", error)
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "用户身份服务异常")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/v1/survivor/runs/sync":
            return self.handle_run_sync()
        if parsed.path == "/api/v1/survivor/feedback":
            return self.handle_feedback_create()
        self.write_error(HTTPStatus.NOT_FOUND, "NOT_FOUND", "接口不存在")

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/v1/survivor/progress":
            return self.handle_player_progress_sync()
        try:
            feedback_id = parse_feedback_id(parsed.path)
        except StoreError as error:
            return self.write_error(error.status, error.code, error.message)
        if feedback_id is not None:
            return self.handle_feedback_update(feedback_id)
        self.write_error(HTTPStatus.NOT_FOUND, "NOT_FOUND", "接口不存在")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        try:
            feedback_id = parse_feedback_id(parsed.path)
        except StoreError as error:
            return self.write_error(error.status, error.code, error.message)
        if feedback_id is not None:
            return self.handle_feedback_delete(feedback_id)
        self.write_error(HTTPStatus.NOT_FOUND, "NOT_FOUND", "接口不存在")

    def handle_leaderboard(self, query):
        try:
            user = self.require_user()
            metric = query.get("metric", ["TOTAL_PLAY_SECONDS"])[0]
            page = parse_integer(query.get("page", ["1"])[0], 1, 1_000_000, "page")
            page_size = parse_integer(query.get("pageSize", ["100"])[0], 1, 100, "pageSize")
            payload = self.server.store.leaderboard(metric, user["id"], page, page_size)
            self.write_json(HTTPStatus.OK, payload)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("leaderboard request failed: %s", error)
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "排行榜服务异常")

    def handle_run_sync(self):
        try:
            user = self.require_user()
            payload = self.read_json()
            response = self.server.store.sync_run(user, payload)
            self.write_json(HTTPStatus.OK, response)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("run sync failed: %s\n%s", error, traceback.format_exc())
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "战绩同步异常")

    def handle_feedback_list(self, query):
        try:
            user = self.require_user()
            scope = query.get("scope", ["ALL"])[0]
            page = parse_integer(query.get("page", ["1"])[0], 1, 1_000_000, "page")
            page_size = parse_integer(query.get("pageSize", ["5"])[0], 1, 20, "pageSize")
            payload = self.server.store.list_feedback(scope, user["id"], page, page_size)
            self.write_json(HTTPStatus.OK, payload)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("feedback list failed: %s\n%s", error, traceback.format_exc())
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "反馈列表加载异常")

    def handle_feedback_create(self):
        try:
            user = self.require_user()
            payload = self.server.store.create_feedback(user, self.read_json())
            self.write_json(HTTPStatus.CREATED, payload)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("feedback create failed: %s\n%s", error, traceback.format_exc())
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "反馈提交异常")

    def handle_feedback_update(self, feedback_id):
        try:
            user = self.require_user()
            payload = self.server.store.update_feedback(user, feedback_id, self.read_json())
            self.write_json(HTTPStatus.OK, payload)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("feedback update failed: %s\n%s", error, traceback.format_exc())
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "反馈修改异常")

    def handle_feedback_delete(self, feedback_id):
        try:
            user = self.require_user()
            payload = self.server.store.delete_feedback(user, feedback_id)
            self.write_json(HTTPStatus.OK, payload)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("feedback delete failed: %s\n%s", error, traceback.format_exc())
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "反馈删除异常")

    def handle_player_progress(self):
        try:
            user = self.require_user()
            payload = self.server.store.get_player_progress(user)
            self.write_json(HTTPStatus.OK, payload)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("player progress load failed: %s\n%s", error, traceback.format_exc())
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "玩家进度加载异常")

    def handle_player_progress_sync(self):
        try:
            user = self.require_user()
            payload = self.server.store.sync_player_progress(user, self.read_json())
            self.write_json(HTTPStatus.OK, payload)
        except StoreError as error:
            self.write_error(error.status, error.code, error.message)
        except Exception as error:
            self.log_error("player progress sync failed: %s\n%s", error, traceback.format_exc())
            self.write_error(HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "玩家进度同步异常")

    def require_user(self) -> Dict[str, str]:
        token = self.headers.get("Authorization", "").strip()
        if not token:
            raise StoreError(401, "UNAUTHORIZED", "缺少 Authorization token")
        request = urllib.request.Request(
            self.server.user_info_url,
            method="GET",
            headers={"Authorization": token, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise StoreError(401, "UNAUTHORIZED", "token 无效或用户信息服务不可用") from error
        user_info = body.get("data") if isinstance(body.get("data"), dict) else body
        user_id = str(user_info.get("id", "")).strip()
        username = str(user_info.get("username", "") or user_info.get("name", "") or user_info.get("nickname", "")).strip()
        if not user_id or not username:
            raise StoreError(401, "UNAUTHORIZED", "用户信息接口返回无效数据")
        employee_id = str(user_info.get("employeeId", "") or user_info.get("employee_id", "")).strip()
        return {"id": user_id, "username": username, "employeeId": employee_id}

    def read_json(self) -> Dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise StoreError(400, "INVALID_LENGTH", "Content-Length 不正确") from error
        if length <= 0 or length > 64 * 1024:
            raise StoreError(400, "INVALID_LENGTH", "JSON 请求体不能为空且不得超过 64KB")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise StoreError(400, "INVALID_JSON", "请求体不是合法 JSON") from error

    def write_json(self, status: int, payload: Dict):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def write_error(self, status: int, code: str, message: str):
        self.write_json(status, {"status": int(status), "code": code, "message": message, "path": self.path})

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin and origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        super().end_headers()


class LeaderboardServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

    def __init__(self, address, store, user_info_url, allowed_origins):
        super().__init__(address, LeaderboardHandler)
        self.store = store
        self.user_info_url = user_info_url
        self.allowed_origins = set(allowed_origins)


def parse_integer(value: str, minimum: int, maximum: int, field: str) -> int:
    try:
        number = int(value)
    except ValueError as error:
        raise StoreError(400, "INVALID_QUERY", f"{field} 必须是整数") from error
    if not minimum <= number <= maximum:
        raise StoreError(400, "INVALID_QUERY", f"{field} 超出允许范围")
    return number


def parse_feedback_id(path: str):
    prefix = "/api/v1/survivor/feedback/"
    if not path.startswith(prefix):
        return None
    raw_id = path[len(prefix):]
    if not raw_id.isdigit() or int(raw_id) <= 0:
        raise StoreError(400, "INVALID_FEEDBACK_ID", "反馈 ID 必须是正整数")
    return int(raw_id)


def main():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="混乱幸存者轻量数据服务")
    parser.add_argument("--host", default=os.getenv("SURVIVOR_API_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("SURVIVOR_API_PORT", "8000")))
    parser.add_argument("--database", default=os.getenv("SURVIVOR_DB_PATH", str(root / "data" / "leaderboard.db")))
    parser.add_argument("--user-info-url", default=resolve_user_info_url())
    args = parser.parse_args()

    allowed_origins = [item.strip() for item in os.getenv(
        "SURVIVOR_ALLOWED_ORIGINS", "http://127.0.0.1:5000,http://localhost:5000"
    ).split(",") if item.strip()]
    store = LeaderboardStore(args.database)
    server = LeaderboardServer((args.host, args.port), store, args.user_info_url, allowed_origins)
    print(f"Survivor data API listening on http://{args.host}:{args.port}/api")
    print(f"User info URL: {args.user_info_url}")
    print(f"SQLite database: {Path(args.database).resolve()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down leaderboard API.")
    finally:
        server.server_close()


def resolve_user_info_url():
    configured_url = os.getenv("SURVIVOR_USER_INFO_URL", "").strip()
    if configured_url:
        return configured_url
    return DEFAULT_USER_INFO_URL


if __name__ == "__main__":
    main()

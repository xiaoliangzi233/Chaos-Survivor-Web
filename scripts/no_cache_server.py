from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import json
from urllib import error, request


class NoCacheRequestHandler(SimpleHTTPRequestHandler):
    api_base = "http://127.0.0.1:8000"

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.proxy_api_request()
            return
        self.disable_conditional_cache()
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.proxy_api_request()
            return
        self.send_error(404)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.proxy_api_request()
            return
        self.send_error(404)

    def do_HEAD(self):
        self.disable_conditional_cache()
        super().do_HEAD()

    def disable_conditional_cache(self):
        if "If-Modified-Since" in self.headers:
            self.headers.replace_header("If-Modified-Since", "Thu, 01 Jan 1970 00:00:00 GMT")
        if "If-None-Match" in self.headers:
            self.headers.replace_header("If-None-Match", "")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def proxy_api_request(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length else None
        target_url = f"{self.api_base.rstrip('/')}{self.path}"
        headers = {
            key: self.headers[key]
            for key in ("Authorization", "Content-Type", "Accept")
            if self.headers.get(key)
        }
        proxy_request = request.Request(
            target_url,
            data=body,
            headers=headers,
            method=self.command,
        )

        try:
            with request.urlopen(proxy_request, timeout=15) as response:
                self.write_proxy_response(response.status, response.headers, response.read())
        except error.HTTPError as exc:
            self.write_proxy_response(exc.code, exc.headers, exc.read())
        except (error.URLError, TimeoutError) as exc:
            payload = json.dumps(
                {"code": "LEADERBOARD_UNAVAILABLE", "message": "排行榜服务暂时不可用"},
                ensure_ascii=False,
            ).encode("utf-8")
            self.log_error("Leaderboard proxy failed: %s", exc)
            self.write_proxy_response(502, {"Content-Type": "application/json; charset=utf-8"}, payload)

    def write_proxy_response(self, status, headers, body):
        self.send_response(status)
        self.send_header("Content-Type", headers.get("Content-Type", "application/json; charset=utf-8"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Serve static files with cache disabled.")
    parser.add_argument("port", type=int, nargs="?", default=5000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--api-base", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    NoCacheRequestHandler.api_base = args.api_base
    server = ThreadingHTTPServer((args.bind, args.port), NoCacheRequestHandler)
    print(f"Serving HTTP on {args.bind} port {args.port} (no-cache, API -> {args.api_base}) ...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

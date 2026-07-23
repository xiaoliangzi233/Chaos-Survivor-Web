from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse


class NoCacheRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.disable_conditional_cache()
        super().do_GET()

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


def main():
    parser = argparse.ArgumentParser(description="Serve static files with cache disabled.")
    parser.add_argument("port", type=int, nargs="?", default=5000)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), NoCacheRequestHandler)
    print(f"Serving HTTP on {args.bind} port {args.port} (no-cache) ...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

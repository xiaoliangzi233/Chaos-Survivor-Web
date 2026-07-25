#!/usr/bin/env python3
"""Serve the game and accept PNG files from the visual export page."""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import subprocess
import tempfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse


MAX_PNG_BYTES = 32 * 1024 * 1024
MAX_MANIFEST_BYTES = 8 * 1024 * 1024
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9._-]+$")
SAFE_UI_ID = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")


class VisualExportHandler(SimpleHTTPRequestHandler):
    server_version = "SurvivorVisualExporter/1.0"
    protocol_version = "HTTP/1.1"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/__visual_export/status":
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "outputRoot": "assets/exported",
                    "maxPngBytes": MAX_PNG_BYTES,
                },
            )
            return
        if urlparse(self.path).path == "/__visual_export/catalog":
            self._send_catalog()
            return
        super().do_GET()

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        if route == "/__visual_export/png":
            self._write_png()
            return
        if route == "/__visual_export/manifest":
            self._write_manifest()
            return
        if route == "/__visual_export/ui-render":
            self._render_ui()
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "unknown endpoint"})

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[visual-export] {self.address_string()} - {fmt % args}", flush=True)

    def _write_png(self) -> None:
        try:
            relative_path = self.headers.get("X-Export-Path", "")
            target = self._resolve_output(relative_path, ".png")
            body = self._read_body(MAX_PNG_BYTES)
            if len(body) < 8 or body[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError("request body is not a PNG file")
            self._atomic_write(target, body)
            self._send_json(
                HTTPStatus.OK,
                {"ok": True, "path": target.relative_to(self.server.project_root).as_posix(), "bytes": len(body)},
            )
        except (ValueError, OSError) as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def _write_manifest(self) -> None:
        try:
            body = self._read_body(MAX_MANIFEST_BYTES)
            parsed = json.loads(body.decode("utf-8"))
            normalized = json.dumps(parsed, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
            target = self.server.output_root / "manifest.json"
            self._atomic_write(target, normalized)
            self._send_json(
                HTTPStatus.OK,
                {"ok": True, "path": target.relative_to(self.server.project_root).as_posix(), "bytes": len(normalized)},
            )
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError, OSError) as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def _render_ui(self) -> None:
        try:
            element_id = self.headers.get("X-Ui-Element", "")
            if not SAFE_UI_ID.fullmatch(element_id):
                raise ValueError("invalid UI element id")
            browser = self._find_headless_browser()
            host, port = self.server.server_address[:2]
            capture_url = f"http://{host}:{port}/tools/visual-ui-capture.html?id={element_id}"
            with tempfile.TemporaryDirectory(prefix="survivor-ui-export-") as temp_dir:
                screenshot = Path(temp_dir) / "ui.png"
                profile = Path(temp_dir) / "profile"
                command = [
                    str(browser),
                    "--headless=new",
                    "--no-sandbox",
                    "--disable-gpu-sandbox",
                    "--use-gl=swiftshader",
                    "--use-angle=swiftshader",
                    "--disable-gpu-shader-disk-cache",
                    "--hide-scrollbars",
                    "--no-first-run",
                    "--disable-features=UseDawn,SkiaGraphite,msEdgeWelcomePage",
                    "--force-device-scale-factor=1",
                    "--window-size=1920,1080",
                    "--run-all-compositor-stages-before-draw",
                    "--virtual-time-budget=3500",
                    f"--user-data-dir={profile}",
                    f"--screenshot={screenshot}",
                    capture_url,
                ]
                flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
                result = subprocess.run(
                    command,
                    capture_output=True,
                    check=False,
                    timeout=30,
                    creationflags=flags,
                )
                if not screenshot.exists():
                    details = result.stderr.decode("utf-8", errors="replace").strip()
                    raise ValueError(f"headless browser UI render failed: {details[-500:]}")
                body = screenshot.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ValueError, OSError, subprocess.SubprocessError) as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def _send_catalog(self) -> None:
        files: dict[str, dict[str, int]] = {}
        if self.server.output_root.is_dir():
            for path in self.server.output_root.rglob("*.png"):
                try:
                    with path.open("rb") as stream:
                        header = stream.read(24)
                    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
                        continue
                    width = int.from_bytes(header[16:20], "big")
                    height = int.from_bytes(header[20:24], "big")
                    relative = path.relative_to(self.server.output_root).as_posix()
                    files[relative] = {"width": width, "height": height, "bytes": path.stat().st_size}
                except OSError:
                    continue
        self._send_json(HTTPStatus.OK, {"ok": True, "files": files})

    @staticmethod
    def _find_headless_browser() -> Path:
        candidates = [
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
            Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
            Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        ]
        for candidate in candidates:
            if candidate.is_file():
                return candidate
        raise ValueError("Microsoft Edge or Google Chrome is required to export DOM UI")

    def _resolve_output(self, raw_path: str, suffix: str) -> Path:
        normalized = posixpath.normpath(raw_path.replace("\\", "/")).lstrip("/")
        pure = PurePosixPath(normalized)
        if not normalized or normalized in {".", ".."} or ".." in pure.parts:
            raise ValueError("invalid export path")
        if pure.suffix.lower() != suffix:
            raise ValueError(f"export path must end with {suffix}")
        if len(pure.parts) > 12 or any(not SAFE_SEGMENT.fullmatch(part) for part in pure.parts):
            raise ValueError("export path contains unsupported characters")
        target = (self.server.output_root / Path(*pure.parts)).resolve()
        try:
            target.relative_to(self.server.output_root)
        except ValueError as exc:
            raise ValueError("export path escapes assets/exported") from exc
        return target

    def _read_body(self, limit: int) -> bytes:
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise ValueError("missing Content-Length")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise ValueError("invalid Content-Length") from exc
        if length <= 0 or length > limit:
            raise ValueError(f"request body must be between 1 and {limit} bytes")
        return self.rfile.read(length)

    @staticmethod
    def _atomic_write(target: Path, body: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        handle, temp_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
        try:
            with os.fdopen(handle, "wb") as stream:
                stream.write(body)
                stream.flush()
            os.replace(temp_name, target)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def _send_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class VisualExportServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], handler: type[VisualExportHandler], project_root: Path):
        super().__init__(address, handler)
        self.project_root = project_root.resolve()
        self.output_root = (self.project_root / "assets" / "exported").resolve()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start the Survivor visual PNG exporter.")
    parser.add_argument("--port", type=int, default=5011)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--open", action="store_true", help="Open the exporter page in the default browser.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    os.chdir(project_root)
    handler = lambda *handler_args, **handler_kwargs: VisualExportHandler(  # noqa: E731
        *handler_args,
        directory=str(project_root),
        **handler_kwargs,
    )
    server = VisualExportServer((args.bind, args.port), handler, project_root)
    url = f"http://{args.bind}:{args.port}/tools/visual-exporter.html"
    print(f"Visual exporter: {url}", flush=True)
    print(f"PNG output: {server.output_root}", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

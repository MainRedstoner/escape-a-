#!/usr/bin/env python3
"""Escape A÷ · server.py —— 可选的本机存档服务（仅 Python 标准库）

一个「一条 key -> 一段不透明字节」的本机储物柜，顺带托管静态文件，
可以替代 `python -m http.server` 来跑游戏。契约见 SAVE_API.md。

设计要点：
  * 后端不解析存档内容 —— 前端改存档格式、加新功能都不需要动这里；
  * 原子写（临时文件 + fsync + os.replace），断电不会留下半截存档；
  * key 白名单 + 静态路径拒隐藏目录，路径穿越在内核层面就不可能；
  * 默认只绑 127.0.0.1，无鉴权 —— 它只服务本机单人。

用法：
    python server.py                              # http://127.0.0.1:8765/
    python server.py --port 9000 --data-dir saves
    python server.py --port 0                     # 让系统分配端口（测试用）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
from urllib.parse import unquote, urlsplit
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
API_VERSION = 1
DEFAULT_MAX_BYTES = 16 * 1024 * 1024
KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def etag_of(st: os.stat_result) -> str:
    """文件版本标识：大小 + 纳秒 mtime。够用来发现「别的窗口改过」。"""
    return '"%d-%d"' % (st.st_size, st.st_mtime_ns)


class BlobStore:
    """数据目录里的一条 key 一个文件；文件内容对后端完全透明。"""

    def __init__(self, directory: str, max_bytes: int):
        self.dir = os.path.abspath(directory)
        self.max_bytes = int(max_bytes)
        os.makedirs(self.dir, exist_ok=True)
        self._lock = threading.Lock()

    def path(self, key: str) -> str:
        return os.path.join(self.dir, key)

    def stat(self, key: str):
        try:
            return os.stat(self.path(key))
        except FileNotFoundError:
            return None

    def list(self):
        items = []
        try:
            entries = os.scandir(self.dir)
        except FileNotFoundError:
            return items
        with entries:
            for entry in entries:
                if not entry.is_file() or not KEY_RE.match(entry.name):
                    continue
                st = entry.stat()
                items.append({
                    "key": entry.name,
                    "size": st.st_size,
                    "mtime": st.st_mtime_ns // 1_000_000,
                    "etag": etag_of(st),
                })
        items.sort(key=lambda it: it["key"])
        return items

    def write(self, key: str, data: bytes):
        target = self.path(key)
        tmp = os.path.join(self.dir, ".%s.tmp.%d.%d" % (key, os.getpid(), threading.get_ident()))
        with self._lock:
            with open(tmp, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, target)
            return os.stat(target)

    def delete(self, key: str) -> bool:
        with self._lock:
            try:
                os.remove(self.path(key))
                return True
            except FileNotFoundError:
                return False


class BlobHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "EscapeADivSave/1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---------------- 入口分发 ----------------

    def do_GET(self):
        self._dispatch("GET")

    def do_HEAD(self):
        self._dispatch("HEAD")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def do_POST(self):
        # 路由层统一回 405；不定义的话框架会先回 501，契约就对不上了
        self._dispatch("POST")

    def do_PATCH(self):
        self._dispatch("PATCH")

    def do_OPTIONS(self):
        self._dispatch("OPTIONS")

    def _dispatch(self, method: str):
        path = urlsplit(self.path).path
        if path == "/api" or path.startswith("/api/"):
            return self._handle_api(method, unquote(path))
        if method not in ("GET", "HEAD"):
            return self._error(405, "method_not_allowed", "静态文件只接受 GET / HEAD")
        if not self._static_allowed(path):
            return self._error(404, "not_found", "路径不存在")
        if method == "GET":
            return super().do_GET()
        return super().do_HEAD()

    def _static_allowed(self, raw_path: str) -> bool:
        """挡掉隐藏路径（.git / .tmp / ...）和存档数据目录，避免静态托管把它们漏出去。"""
        parts = [p for p in unquote(raw_path).split("/") if p]
        if any(p.startswith(".") for p in parts):
            return False
        try:
            rel = os.path.relpath(self.server.store.dir, ROOT)
        except ValueError:  # 不同盘符
            return True
        if rel in (".", "") or rel.startswith(".."):
            return True
        top = rel.split(os.sep)[0]
        return not (parts and parts[0] == top)

    # ---------------- API 路由 ----------------

    def _handle_api(self, method: str, path: str):
        segs = [s for s in path.split("/") if s]
        if len(segs) == 2 and segs[1] == "ping":
            if method not in ("GET", "HEAD"):
                return self._error(405, "method_not_allowed", "ping 只接受 GET")
            return self._json(200, {
                "api": API_VERSION,
                "maxBytes": self.server.store.max_bytes,
                "app": "escape-a-div-save",
            })
        if len(segs) >= 2 and segs[1] == "blobs":
            if len(segs) == 2:
                if method not in ("GET", "HEAD"):
                    return self._error(405, "method_not_allowed", "列表只接受 GET")
                return self._json(200, {"items": self.server.store.list()})
            if len(segs) == 3:
                return self._handle_blob(method, segs[2])
            return self._error(404, "not_found", "多余的路径段")
        return self._error(404, "not_found", "没有这个接口")

    def _handle_blob(self, method: str, key: str):
        if not KEY_RE.match(key):
            return self._error(400, "bad_key", "key 只能是 1~64 位字母/数字/. _ -，且以字母或数字开头")
        if method in ("GET", "HEAD"):
            return self._read_blob(method, key)
        if method == "PUT":
            return self._write_blob(key)
        if method == "DELETE":
            self.server.store.delete(key)
            self.send_response(204)
            self.end_headers()
            return
        return self._error(405, "method_not_allowed", "blob 只接受 GET / HEAD / PUT / DELETE")

    def _read_blob(self, method: str, key: str):
        try:
            with open(self.server.store.path(key), "rb") as f:
                data = f.read()
                st = os.fstat(f.fileno())
        except FileNotFoundError:
            return self._error(404, "not_found", "该 key 不存在")
        etag = etag_of(st)
        if_none_match = (self.headers.get("If-None-Match") or "").strip()
        if method == "GET" and if_none_match == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if method == "GET":
            self.wfile.write(data)

    def _write_blob(self, key: str):
        store = self.server.store
        length = self._content_length()
        if length is None:
            return
        if length > store.max_bytes:
            return self._error(413, "too_large",
                               "请求体超过 %d 字节上限" % store.max_bytes, close=True)
        data = self.rfile.read(length)
        if len(data) != length:
            return self._error(400, "incomplete_body", "请求体不完整", close=True)
        current = store.stat(key)
        current_etag = etag_of(current) if current else None
        if_match = (self.headers.get("If-Match") or "").strip()
        if if_match and if_match != "*" and if_match != current_etag:
            return self._json(409, {
                "error": "etag_mismatch",
                "message": "该 key 已被其它窗口改动，请先重新读取",
                "etag": current_etag,
            })
        st = store.write(key, data)
        created = current_etag is None
        return self._json(201 if created else 200, {
            "key": key,
            "size": st.st_size,
            "etag": etag_of(st),
            "created": created,
        })

    def _content_length(self):
        raw = self.headers.get("Content-Length")
        if raw is None:
            self._error(411, "length_required", "PUT 必须带 Content-Length", close=True)
            return None
        try:
            length = int(raw)
        except (TypeError, ValueError):
            length = -1
        if length < 0:
            self._error(400, "bad_length", "Content-Length 非法", close=True)
            return None
        return length

    # ---------------- 响应辅助 ----------------

    def _json(self, status: int, obj, close: bool = False):
        body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", close)

    def _error(self, status: int, code: str, message: str, close: bool = False):
        # 带请求体的方法在错误分支里可能还没读完 body：
        # HTTP/1.1 复用连接会把残留字节当成下一个请求，所以一律断开。
        if self.command in ("PUT", "POST", "PATCH"):
            close = True
        self._json(status, {"error": code, "message": message}, close=close)

    def _send(self, status: int, body: bytes, content_type=None, close: bool = False):
        if close:
            self.close_connection = True
        self.send_response(status)
        if content_type:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if close:
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD" and body:
            try:
                self.wfile.write(body)
            except OSError:
                self.close_connection = True

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        # 静态文件一律回源校验：本地改完脚本刷新就能生效，不会被浏览器缓存坑到
        if not urlsplit(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def build_server(host: str, port: int, data_dir: str, max_bytes: int) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer((host, port), BlobHandler)
    httpd.daemon_threads = True
    httpd.store = BlobStore(data_dir, max_bytes)
    return httpd


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Escape A÷ 本机存档服务（仅标准库，只应绑定本机地址）")
    parser.add_argument("--port", type=int, default=8765, help="端口，0 = 系统分配（默认 8765）")
    parser.add_argument("--bind", default="127.0.0.1", help="监听地址，默认 127.0.0.1")
    parser.add_argument("--data-dir", default=os.path.join(ROOT, "saves"),
                        help="存档目录，默认 ./saves")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES,
                        help="单条存档上限（字节），默认 16 MiB")
    args = parser.parse_args(argv)

    httpd = build_server(args.bind, args.port, args.data_dir, args.max_bytes)
    port = httpd.server_address[1]
    # 测试脚本靠这一行拿实际端口，别改格式
    print("LISTENING %d" % port, flush=True)
    print("Escape A÷ 存档服务: http://%s:%d/" % (args.bind, port), flush=True)
    print("数据目录: %s（单条上限 %d 字节）" % (os.path.abspath(args.data_dir), args.max_bytes),
          flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。", file=sys.stderr)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

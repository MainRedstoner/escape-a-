#!/usr/bin/env python3
"""Escape A÷ · tools/test_save_server.py —— server.py 的冒烟测试（仅标准库）

用法：
    python tools/test_save_server.py

退出码 0 = 全绿。覆盖五条路由、ETag 协商、原样落盘、错误码、
路径穿越、体积上限、静态托管与隐藏路径拦截、重启后存档仍在。

改动 server.py 或 SAVE_API.md 后必须跑这个。
"""

from __future__ import annotations

import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, "server.py")
MAX_BYTES = 4096

FAILS = []


# ---------------- 基础设施 ----------------

class Server:
    """起一个 server.py 子进程，端口交给系统分配。"""

    def __init__(self, data_dir: str):
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        self.proc = subprocess.Popen(
            [sys.executable, SERVER, "--port", "0",
             "--data-dir", data_dir, "--max-bytes", str(MAX_BYTES)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", errors="replace", env=env,
        )
        line = self.proc.stdout.readline()
        if not line.startswith("LISTENING "):
            self.stop()
            raise RuntimeError("服务没有启动起来：%r" % line)
        self.port = int(line.split()[1])

    def url(self, path: str) -> str:
        return "http://127.0.0.1:%d%s" % (self.port, path)

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        for pipe in (self.proc.stdout, self.proc.stderr):
            try:
                pipe.close()
            except Exception:
                pass


def call(url, method="GET", body=None, headers=None, timeout=10):
    """返回 (status, headers, body)；连接层错误回 status=0。"""
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()
    except (urllib.error.URLError, OSError):
        return 0, {}, b""


def check(name, fn):
    try:
        fn()
    except AssertionError as exc:
        FAILS.append(name)
        print("FAIL  %s  ——  %s" % (name, exc))
    except Exception as exc:  # noqa: BLE001 - 测试脚本要把任何异常都记成失败
        FAILS.append(name)
        print("ERROR %s  ——  %r" % (name, exc))
    else:
        print("PASS  %s" % name)


# ---------------- 用例 ----------------

def t_ping(srv):
    st, headers, body = call(srv.url("/api/ping"))
    assert st == 200, "状态码 %s" % st
    assert headers.get("Content-Type", "").startswith("application/json"), headers
    data = json.loads(body)
    assert data["api"] == 1, data
    assert data["maxBytes"] == MAX_BYTES, data


def t_list_empty(srv):
    st, _, body = call(srv.url("/api/blobs"))
    assert st == 200, st
    assert json.loads(body)["items"] == [], body


def t_put_get(srv, ctx):
    payload = b'{"format":"escape-a-save","version":1,"payload":{}}'
    st, _, body = call(srv.url("/api/blobs/save-1"), "PUT", payload)
    assert st == 201, (st, body)
    meta = json.loads(body)
    assert meta["created"] is True and meta["size"] == len(payload), meta
    ctx["etag"] = meta["etag"]
    st, headers, got = call(srv.url("/api/blobs/save-1"))
    assert st == 200 and got == payload, (st, got)
    assert headers.get("ETag") == ctx["etag"], (headers.get("ETag"), ctx["etag"])


def t_list_after(srv, ctx):
    st, _, body = call(srv.url("/api/blobs"))
    items = json.loads(body)["items"]
    assert len(items) == 1, items
    item = items[0]
    assert item["key"] == "save-1", item
    assert item["etag"] == ctx["etag"], item
    assert isinstance(item["mtime"], int) and item["mtime"] > 0, item


def t_304(srv, ctx):
    st, _, body = call(srv.url("/api/blobs/save-1"),
                       headers={"If-None-Match": ctx["etag"]})
    assert st == 304, st
    assert body == b"", body


def t_conflict(srv):
    st, _, body = call(srv.url("/api/blobs/save-1"), "PUT", b"x",
                       headers={"If-Match": '"0-0"'})
    assert st == 409, (st, body)
    assert json.loads(body)["error"] == "etag_mismatch", body


def t_overwrite(srv, ctx):
    payload = b'{"format":"escape-a-save","version":1,"payload":{"v":2}}'
    st, _, body = call(srv.url("/api/blobs/save-1"), "PUT", payload,
                       headers={"If-Match": ctx["etag"]})
    assert st == 200, (st, body)
    meta = json.loads(body)
    assert meta["created"] is False, meta
    ctx["etag"] = meta["etag"]
    st, _, got = call(srv.url("/api/blobs/save-1"))
    assert got == payload, got


def t_binary_passthrough(srv):
    """后端不解析内容：非 UTF-8、非 JSON 的字节也必须原样往返。"""
    payload = b"\x00\x01\xffraw-bytes\x00"
    st, _, body = call(srv.url("/api/blobs/binary"), "PUT", payload)
    assert st == 201, (st, body)
    st, _, got = call(srv.url("/api/blobs/binary"))
    assert got == payload, got
    call(srv.url("/api/blobs/binary"), "DELETE")


def t_bad_key(srv):
    for bad in ("bad*key", ".hidden", "a" * 65):
        st, _, body = call(srv.url("/api/blobs/" + bad), "PUT", b"x")
        assert st == 400, (bad, st, body)
        assert json.loads(body)["error"] == "bad_key", body


def t_traversal(srv, data_dir):
    parent = os.path.dirname(data_dir)
    before = set(os.listdir(parent))
    for raw in ("%2e%2e%2fevil", "..%5cevil"):
        st, _, body = call(srv.url("/api/blobs/" + raw), "PUT", b"x")
        assert st in (400, 404), (raw, st, body)
    after = set(os.listdir(parent))
    assert before == after, (before, after)


def t_missing_key(srv):
    st, _, body = call(srv.url("/api/blobs/nope"))
    assert st == 404, st
    assert json.loads(body)["error"] == "not_found", body


def t_too_large(srv):
    st, _, body = call(srv.url("/api/blobs/big"), "PUT", b"x" * (MAX_BYTES + 1))
    assert st == 413, (st, body)
    st2, _, _ = call(srv.url("/api/ping"))
    assert st2 == 200, "413 之后服务挂了"


def t_no_content_length(srv):
    conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=10)
    try:
        conn.putrequest("PUT", "/api/blobs/nolength", skip_accept_encoding=True)
        conn.endheaders()
        resp = conn.getresponse()
        body = resp.read()
        status = resp.status
    finally:
        conn.close()
    assert status == 411, (status, body)
    assert json.loads(body)["error"] == "length_required", body


def t_delete_idempotent(srv):
    st, _, _ = call(srv.url("/api/blobs/gone"), "PUT", b"bye")
    assert st == 201, st
    st, _, body = call(srv.url("/api/blobs/gone"), "DELETE")
    assert st == 204 and body == b"", (st, body)
    st, _, _ = call(srv.url("/api/blobs/gone"))
    assert st == 404, st
    st, _, _ = call(srv.url("/api/blobs/gone"), "DELETE")
    assert st == 204, st


def t_static(srv):
    st, _, body = call(srv.url("/index.html"))
    assert st == 200 and b"Escape" in body, (st, len(body))
    st, _, _ = call(srv.url("/.git/config"))
    assert st == 404, st


def t_method_not_allowed(srv):
    st, _, body = call(srv.url("/api/ping"), "POST", b"{}")
    assert st == 405, (st, body)


def t_unknown_api(srv):
    st, _, body = call(srv.url("/api/nope"))
    assert st == 404, st
    assert json.loads(body)["error"] == "not_found", body


def t_no_tmp_left(srv, data_dir):
    leftovers = [n for n in os.listdir(data_dir) if n.startswith(".")]
    assert not leftovers, leftovers


# ---------------- 主流程 ----------------

def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:  # 老 Python / 非标准流：算了
            pass
    tmp = tempfile.mkdtemp(prefix="ea-save-test-")
    data_dir = os.path.join(tmp, "saves")
    srv = None
    try:
        srv = Server(data_dir)
        ctx = {}

        check("ping 握手", lambda: t_ping(srv))
        check("空列表", lambda: t_list_empty(srv))
        check("PUT 新建 + GET 原样读回", lambda: t_put_get(srv, ctx))
        check("列表元信息", lambda: t_list_after(srv, ctx))
        check("If-None-Match → 304", lambda: t_304(srv, ctx))
        check("If-Match 不符 → 409", lambda: t_conflict(srv))
        check("带正确 If-Match 覆盖 → 200", lambda: t_overwrite(srv, ctx))
        check("非 JSON 字节原样往返", lambda: t_binary_passthrough(srv))
        check("非法 key → 400", lambda: t_bad_key(srv))
        check("路径穿越不落盘", lambda: t_traversal(srv, data_dir))
        check("不存在的 key → 404", lambda: t_missing_key(srv))
        check("超出上限 → 413 且服务存活", lambda: t_too_large(srv))
        check("缺 Content-Length → 411", lambda: t_no_content_length(srv))
        check("DELETE 幂等", lambda: t_delete_idempotent(srv))
        check("静态托管 + 隐藏路径拦截", lambda: t_static(srv))
        check("不支持的方法 → 405", lambda: t_method_not_allowed(srv))
        check("未知接口 → 404", lambda: t_unknown_api(srv))
        check("没有临时文件残留", lambda: t_no_tmp_left(srv, data_dir))

        srv.stop()
        srv = Server(data_dir)
        check("重启后存档仍在", lambda: t_persists(srv))
    finally:
        if srv is not None:
            srv.stop()
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    if FAILS:
        print("%d 项失败：%s" % (len(FAILS), "、".join(FAILS)))
        return 1
    print("全部通过。")
    return 0


def t_persists(srv):
    st, _, body = call(srv.url("/api/blobs/save-1"))
    assert st == 200, st
    assert b'"v":2' in body, body[:120]


if __name__ == "__main__":
    raise SystemExit(main())

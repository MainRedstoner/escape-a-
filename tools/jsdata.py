#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escape A÷ · tools/jsdata.py —— 把剧本 / 元数据 / 素材清单读进 Python

仓库里的 `src/script.js` 与 `src/systems.js` 是**给浏览器直接加载的纯数据文件**，
但它们终究是 JS：用了一小组速写函数（`N()`、`CHOICE()`、`opt()` …）把节点写短。
这里实现一个**只认识数据子集**的 JS 解析器，把同样的文件读成 Python 对象，
这样校验与模拟都可以只用 Python 标准库，不再依赖 Node。

支持（够用即可，超出就报错，不会静默算错）：
  · 字面量：字符串 / 数字 / true / false / null / 数组 / 对象（含 key 简写、尾逗号）
  · 箭头函数：`x => expr`、`(a, b) => expr`（只用于 script.js 顶部的速写助手）
  · 调用：`NAME(args)`、`Object.assign(target, ...sources)`
  · 成员访问：`a.b`
  · 逻辑或 `||`（助手里的 `extra || {}`）
  · 顶层 `const NAME = expr;` 与 `Object.assign(SCRIPT.scenes, {...});`

不支持也不需要的：赋值语句、控制流、模板字符串、展开运算符、二元算术、对象方法简写。
`systems.js` 里的函数（newState 等）**不执行**，只把里面用到的字面量取出来。
"""

from __future__ import annotations

import json
import os
import re


# ---------------------------------------------------------------- 解析器

class JsError(Exception):
    pass


class _Undef:
    """JS 的 undefined（与 null 区分；这里只在取值时当"没有"用）。"""

    def __repr__(self):
        return "undefined"


UNDEF = _Undef()


class _Function:
    def __init__(self, params, body, env):
        self.params = params
        self.body = body
        self.env = env

    def __call__(self, *args):
        local = dict(self.env)
        for i, p in enumerate(self.params):
            local[p] = args[i] if i < len(args) else UNDEF
        return evaluate(self.body, local)


class _ObjectRef:
    """内置 `Object`：只实现 assign / keys。"""

    @staticmethod
    def assign(target, *sources):
        for src in sources:
            if isinstance(src, dict):
                target.update(src)
        return target

    @staticmethod
    def keys(obj):
        return list(obj.keys()) if isinstance(obj, dict) else []


BUILTINS = {"Object": _ObjectRef, "undefined": UNDEF, "NaN": float("nan")}


def _tokenize(src, name="<js>"):
    """把源码切成 token：(kind, value, line)。"""
    toks = []
    i, n, line = 0, len(src), 1
    while i < n:
        c = src[i]
        if c in " \t\r":
            i += 1
            continue
        if c == "\n":
            line += 1
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise JsError(f"{name}:{line}: 块注释没有闭合")
            line += src.count("\n", i, j)
            i = j + 2
            continue
        if c in "\"'":
            quote, j, buf = c, i + 1, []
            while j < n:
                ch = src[j]
                if ch == "\\":
                    j += 1
                    if j >= n:
                        break
                    esc = src[j]
                    if esc == "n":
                        buf.append("\n")
                    elif esc == "t":
                        buf.append("\t")
                    elif esc == "r":
                        buf.append("\r")
                    elif esc == "b":
                        buf.append("\b")
                    elif esc == "f":
                        buf.append("\f")
                    elif esc == "u":
                        code = src[j + 1:j + 5]
                        buf.append(chr(int(code, 16)))
                        j += 4
                    elif esc == "\n":
                        line += 1
                    else:
                        buf.append(esc)
                    j += 1
                    continue
                if ch == quote:
                    break
                if ch == "\n":
                    line += 1
                buf.append(ch)
                j += 1
            if j >= n:
                raise JsError(f"{name}:{line}: 字符串没有闭合")
            toks.append(("str", "".join(buf), line))
            i = j + 1
            continue
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            j = i
            while j < n and (src[j].isdigit() or src[j] == "."):
                j += 1
            if j < n and src[j] in "eE":
                j += 1
                if j < n and src[j] in "+-":
                    j += 1
                while j < n and src[j].isdigit():
                    j += 1
            text = src[i:j]
            toks.append(("num", float(text) if ("." in text or "e" in text.lower()) else int(text), line))
            i = j
            continue
        if c.isalpha() or c in "_$":
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            toks.append(("id", src[i:j], line))
            i = j
            continue
        for op in ("=>", "||", "&&", "==", "!=", "<=", ">="):
            if src.startswith(op, i):
                toks.append(("op", op, line))
                i += len(op)
                break
        else:
            if c in "{}[](),:;.":
                toks.append(("punc", c, line))
                i += 1
            elif c in "+-*/%&|!<>=":
                toks.append(("op", c, line))
                i += 1
            else:
                raise JsError(f"{name}:{line}: 不认识的字符 {c!r}")
    toks.append(("eof", "", line))
    return toks


class _Parser:
    """递归下降：只解析值表达式。"""

    def __init__(self, src, name="<js>"):
        self.name = name
        self.toks = _tokenize(src, name)
        self.i = 0

    # -- 工具 --
    def peek(self, k=0):
        return self.toks[self.i + k]

    def at(self, kind, value=None):
        t = self.peek()
        return t[0] == kind and (value is None or t[1] == value)

    def take(self, kind=None, value=None):
        t = self.peek()
        if kind is not None and t[0] != kind:
            raise JsError(f"{self.name}:{t[2]}: 期望 {kind}，得到 {t[0]}({t[1]!r})")
        if value is not None and t[1] != value:
            raise JsError(f"{self.name}:{t[2]}: 期望 {value!r}，得到 {t[1]!r}")
        self.i += 1
        return t

    def maybe(self, kind, value=None):
        if self.at(kind, value):
            return self.take()
        return None

    # -- 表达式 --
    def parse_expr(self):
        return self.parse_or()

    def parse_or(self):
        node = self.parse_and()
        while self.at("op", "||"):
            self.take()
            node = ("or", node, self.parse_and())
        return node

    def parse_and(self):
        node = self.parse_unary()
        while self.at("op", "&&"):
            self.take()
            node = ("and", node, self.parse_unary())
        return node

    def parse_unary(self):
        if self.at("op", "!"):
            self.take()
            return ("not", self.parse_unary())
        if self.at("op", "-"):
            self.take()
            return ("neg", self.parse_unary())
        if self.at("op", "+"):
            self.take()
            return self.parse_unary()
        return self.parse_call()

    def parse_call(self):
        node = self.parse_primary()
        while True:
            if self.at("punc", "."):
                self.take()
                prop = self.take("id")[1]
                node = ("member", node, prop)
            elif self.at("punc", "("):
                # 仅当左值是标识符 / 成员时当调用
                args = self.parse_args()
                node = ("call", node, args)
            else:
                break
        return node

    def parse_args(self):
        self.take("punc", "(")
        args = []
        while not self.at("punc", ")"):
            args.append(self.parse_expr())
            if not self.maybe("punc", ","):
                break
        self.take("punc", ")")
        return args

    def parse_primary(self):
        t = self.peek()
        if t[0] == "num":
            self.take()
            return ("lit", t[1])
        if t[0] == "str":
            self.take()
            return ("lit", t[1])
        if t[0] == "id":
            if t[1] == "true":
                self.take()
                return ("lit", True)
            if t[1] == "false":
                self.take()
                return ("lit", False)
            if t[1] == "null":
                self.take()
                return ("lit", None)
            # 箭头函数：id => expr
            if self.peek(1)[0] == "op" and self.peek(1)[1] == "=>":
                name = t[1]
                self.take()
                self.take("op", "=>")
                return ("arrow", [name], self.parse_expr())
            self.take()
            return ("var", t[1])
        if t[0] == "punc" and t[1] == "(":
            # 可能是括号表达式，也可能是 (a, b) => ...
            save = self.i
            params = []
            self.take("punc", "(")
            ok = True
            while not self.at("punc", ")"):
                if self.at("id"):
                    params.append(self.take("id")[1])
                else:
                    ok = False
                    break
                if not self.maybe("punc", ","):
                    break
            if ok and self.at("punc", ")"):
                self.take("punc", ")")
                if self.at("op", "=>"):
                    self.take("op", "=>")
                    return ("arrow", params, self.parse_expr())
            # 不是箭头函数：回退成括号表达式
            self.i = save
            self.take("punc", "(")
            node = self.parse_expr()
            self.take("punc", ")")
            return node
        if t[0] == "punc" and t[1] == "[":
            self.take("punc", "[")
            items = []
            while not self.at("punc", "]"):
                items.append(self.parse_expr())
                if not self.maybe("punc", ","):
                    break
            self.take("punc", "]")
            return ("array", items)
        if t[0] == "punc" and t[1] == "{":
            self.take("punc", "{")
            pairs = []
            while not self.at("punc", "}"):
                if self.at("id"):
                    key_tok = self.take("id")
                    key = key_tok[1]
                elif self.at("str"):
                    key = self.take("str")[1]
                elif self.at("num"):
                    key = str(self.take("num")[1])
                elif self.at("punc", "["):
                    raise JsError(f"{self.name}:{self.peek()[2]}: 不支持计算属性名")
                else:
                    raise JsError(f"{self.name}:{self.peek()[2]}: 对象字面量里看不懂的 key")
                if self.at("punc", ":"):
                    self.take("punc", ":")
                    value = self.parse_expr()
                else:
                    # 简写 { text }
                    value = ("var", key)
                pairs.append((key, value))
                if not self.maybe("punc", ","):
                    break
            self.take("punc", "}")
            return ("object", pairs)
        raise JsError(f"{self.name}:{t[2]}: 不能解析的表达式（从 {t[1]!r} 开始）")


def _truthy(v):
    if v is None or v is UNDEF or v is False:
        return False
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v != 0
    if isinstance(v, str):
        return v != ""
    return True


def evaluate(node, env, lenient=False):
    kind = node[0]
    if kind == "lit":
        return node[1]
    if kind == "var":
        return env.get(node[1], UNDEF)
    if kind == "array":
        return [evaluate(x, env, lenient) for x in node[1]]
    if kind == "object":
        out = {}
        for k, v in node[1]:
            out[k] = evaluate(v, env, lenient)
        return out
    if kind == "member":
        base = evaluate(node[1], env, lenient)
        prop = node[2]
        if isinstance(base, dict):
            return base.get(prop, UNDEF)
        if base is _ObjectRef or base is BUILTINS["Object"]:
            return getattr(_ObjectRef, prop, UNDEF)
        if base is UNDEF or base is None:
            return UNDEF
        raise JsError(f"无法读取成员 {prop!r}（基类型 {type(base).__name__}）")
    if kind == "call":
        callee_node, arg_nodes = node[1], node[2]
        callee = evaluate(callee_node, env, lenient)
        args = [evaluate(a, env, lenient) for a in arg_nodes]
        if isinstance(callee, _Function):
            return callee(*args)
        if callable(callee) and not isinstance(callee, type):
            return callee(*args)
        if lenient:
            return UNDEF
        raise JsError(f"调用了非函数 {callee!r}")
    if kind == "arrow":
        return _Function(node[1], node[2], dict(env))
    if kind == "or":
        left = evaluate(node[1], env, lenient)
        return left if _truthy(left) else evaluate(node[2], env, lenient)
    if kind == "and":
        left = evaluate(node[1], env, lenient)
        return evaluate(node[2], env, lenient) if _truthy(left) else left
    if kind == "not":
        return not _truthy(evaluate(node[1], env, lenient))
    if kind == "neg":
        v = evaluate(node[1], env, lenient)
        return -v if isinstance(v, (int, float)) else v
    raise JsError(f"未知语法节点 {kind}")


def parse_expression(src, name="<expr>"):
    p = _Parser(src, name)
    node = p.parse_expr()
    return node


# ---------------------------------------------------------------- 读文件

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _read(rel):
    path = os.path.join(ROOT, rel)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _strip_comments_for_statement_scan(src):
    """去掉注释但保留换行（行号不跑偏）。"""
    out = []
    i, n = 0, len(src)
    while i < n:
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise JsError("块注释没有闭合")
            out.append("\n" * src.count("\n", i, j))
            i = j + 2
        else:
            out.append(src[i])
            i += 1
    return "".join(out)


def _clean(v):
    """把 JS 的 undefined 统一成 None（深度转换），并返回新的容器。"""
    if isinstance(v, _Undef):
        return None
    if isinstance(v, list):
        return [_clean(x) for x in v]
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    return v


# 剧本分卷：顺序必须与 index.html 里的 <script> 一致（见 AGENTS.md 第三节）。
SCRIPT_FILES = ("src/script.js", "src/script_ch2.js")


def load_script(files=None):
    """解析一卷或多卷剧本（共用同一个作用域），返回 {场景id: [节点]}。

    第一卷声明 `SCRIPT` 与速写助手；后续卷直接使用同一套助手追加场景。
    """
    if files is None:
        files = SCRIPT_FILES
    elif isinstance(files, str):
        files = (files,)
    env = dict(BUILTINS)
    env["SCRIPT"] = {"scenes": {}}
    for rel in files:
        _parse_toplevel(_Parser(_read(rel), rel), env, rel)

    scenes = env["SCRIPT"]["scenes"]
    if not scenes:
        raise JsError(f"{files[0]}: 没有解析到任何场景")
    return _clean(scenes)


def _parse_toplevel(p, env, rel):
    """把一卷剧本的顶层语句读进 env：const 声明 / Object.assign(SCRIPT.scenes, …)。"""
    while True:
        while p.at("punc", ";"):
            p.take()
        if p.at("eof"):
            break
        # 顶层的模块导出守卫 `if (typeof module ...)`：跳过整块
        if p.at("id", "if"):
            depth = 0
            while True:
                t = p.take()
                if t[0] == "punc" and t[1] == "{":
                    depth += 1
                elif t[0] == "punc" and t[1] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                elif t[0] == "eof":
                    raise JsError(f"{rel}: 跳过顶层 if 块时到达文件结尾")
            continue
        if p.at("id", "const") or p.at("id", "let"):
            p.take()
            name = p.take("id")[1]
            p.take("op", "=")
            node = p.parse_expr()
            p.maybe("punc", ";")
            env[name] = evaluate(node, env)
            continue
        if p.at("id", "Object"):
            node = p.parse_expr()
            p.maybe("punc", ";")
            evaluate(node, env)
            continue
        # "use strict"; 这类字符串表达式语句：解析后丢弃
        if p.at("str"):
            p.parse_expr()
            p.maybe("punc", ";")
            continue
        t = p.peek()
        raise JsError(f"{rel}:{t[2]}: 顶层语句看不懂（{t[1]!r}）")


def _extract_block(src, start_match, open_ch="{", close_ch="}"):
    """从 start_match（正则 match）之后找配对的 {} 块，返回块内文本与起止位置。"""
    i = start_match.end()
    if i > 0 and src[i - 1] == open_ch:      # 正则已经把开括号吃掉了
        i -= 1
    n = len(src)
    while i < n and src[i] not in "{":
        i += 1
    if i >= n:
        raise JsError("找不到 {")
    depth, j, in_str, quote = 0, i, False, ""
    while j < n:
        c = src[j]
        if in_str:
            if c == "\\":
                j += 2
                continue
            if c == quote:
                in_str = False
            j += 1
            continue
        if c in "\"'":
            in_str, quote = True, c
            j += 1
            continue
        if src.startswith("//", j):
            k = src.find("\n", j)
            j = n if k < 0 else k
            continue
        if src.startswith("/*", j):
            k = src.find("*/", j + 2)
            j = n if k < 0 else k + 2
            continue
        if c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return src[i:j + 1], i, j
        j += 1
    raise JsError("块没有闭合")


def _literal_const(src, name, rel):
    m = re.search(r"\bconst\s+" + re.escape(name) + r"\s*=", src)
    if not m:
        raise JsError(f"{rel}: 找不到 const {name}")
    block, _, _ = _extract_block(src, m)
    return evaluate(parse_expression(block, f"{rel}:{name}"), dict(BUILTINS))


def load_systems(rel="src/systems.js"):
    """取 systems.js 里工具需要的字面量（不执行文件里的函数）。"""
    src = _read(rel)
    data = {}
    for name in ("ARG_META", "FRAGMENTS", "EGG_META", "ENDING_META", "HINTS"):
        data[name] = _literal_const(src, name, rel)

    # newState() 里 return {...} 的初始值（工具只用到 trust / wanted / pet.mood）
    m = re.search(r"function\s+newState\s*\(\s*\)\s*\{", src)
    if not m:
        raise JsError(f"{rel}: 找不到 newState()")
    fn_block, _, _ = _extract_block(src, m)
    rm = re.search(r"\breturn\s*\{", fn_block)
    if not rm:
        raise JsError(f"{rel}: newState 里找不到 return 的对象字面量")
    ret_block, _, _ = _extract_block(fn_block, rm)
    init = evaluate(parse_expression(ret_block, f"{rel}:newState"), dict(BUILTINS))
    data["INIT"] = {
        "trust": init.get("trust", 0),
        "wanted": init.get("wanted", 0),
        "mood": (init.get("pet") or {}).get("mood", 5),
    }
    return data


def load_manifest(rel="assets/manifest.js"):
    """manifest.js 由 make_manifest.py 生成：`window.EA_ASSETS = {...json...};`"""
    src = _read(rel)
    m = re.search(r"window\.EA_ASSETS\s*=\s*", src)
    if not m:
        raise JsError(f"{rel}: 找不到 window.EA_ASSETS =")
    body = src[m.end():].strip()
    if body.endswith(";"):
        body = body[:-1]
    # 去掉末尾可能残留的注释
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S).strip()
    try:
        return json.loads(body)
    except json.JSONDecodeError as e:
        raise JsError(f"{rel}: 素材清单不是合法 JSON（{e}）")


def load_story():
    """工具的统一入口：剧本 + 元数据 + 素材清单。"""
    return {
        "scenes": load_script(),
        "sys": load_systems(),
        "assets": load_manifest(),
    }

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escape A÷ · tools/check_js.py —— 运行时 JS 的轻量结构检查（纯 Python）

用法：python tools/check_js.py

为什么需要它：仓库不再依赖 Node，`node --check` 也就没了。Python 标准库没有
JS 解析器，而 `tools/jsdata.py` 只认剧本用到的数据子集、不管引擎代码。
所以这里做一个**保守的结构检查**，专抓手工改代码最容易犯的错：

  1. 括号不配对（`{ }` / `( )` / `[ ]`，含模板字符串 `${...}` 里的表达式）
  2. 字符串没闭合（'…' / "…" / `…`）
  3. 注释没闭合（/* … */）

它**不是**完整的 JS 语法检查：`const x = ;`、少逗号、非法运算符这些它看不出来。
真正的语法判定交给浏览器（加载脚本时 `Uncaught SyntaxError` 会带文件名与行号）。
这里的定位是"提交前 0.1 秒就知道自己少了个括号"，而不是替代浏览器实测。

检查范围：`index.html` 里用 `<script src>` 引到的本地 JS（引擎 + 剧本 + 素材清单）。
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPEN = {"(": ")", "[": "]", "{": "}"}


class Problem:
    def __init__(self, path, line, col, msg):
        self.path, self.line, self.col, self.msg = path, line, col, msg

    def __str__(self):
        return f"{self.path}:{self.line}:{self.col}: {self.msg}"


def check_file(path, rel):
    """返回 (问题列表, 行数)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            src = f.read()
    except OSError as e:
        return [Problem(rel, 0, 0, f"读不到文件：{e}")], 0

    problems = []
    lines = src.count("\n") + 1

    # mode 栈：normal 用 bracket 栈；template 里遇到 ${ 进 expr，再遇到 } 回 template
    brackets = []            # [(char, line, col)]
    tmpl_expr = []           # expr 模式下的 { } 深度
    mode = ["normal"]        # normal | template | expr
    i, n, line, col = 0, len(src), 1, 1

    def advance(k=1):
        nonlocal i, line, col
        for _ in range(k):
            if i < n and src[i] == "\n":
                line += 1
                col = 1
            else:
                col += 1
            i += 1

    while i < n:
        c = src[i]

        if mode[-1] == "template":
            if c == "\\":
                advance(2)
                continue
            if c == "`":
                mode.pop()
                advance()
                continue
            if c == "$" and i + 1 < n and src[i + 1] == "{":
                mode.append("expr")
                tmpl_expr.append(0)
                advance(2)
                continue
            advance()
            continue

        # normal / expr 里都要处理注释与字符串
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            while i < n and src[i] != "\n":
                advance()
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            start_line, start_col = line, col
            advance(2)
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                advance()
            if i >= n:
                problems.append(Problem(rel, start_line, start_col, "块注释没有闭合"))
                break
            advance(2)
            continue
        if c in ("'", '"'):
            quote, start_line, start_col = c, line, col
            advance()
            while i < n and src[i] != quote and src[i] != "\n":
                if src[i] == "\\":
                    advance(2)
                else:
                    advance()
            if i >= n or src[i] != quote:
                problems.append(Problem(rel, start_line, start_col, "字符串没有闭合"))
                break
            advance()
            continue
        if c == "`":
            mode.append("template")
            advance()
            continue

        if c in "([{":
            if mode[-1] == "expr" and c == "{":
                tmpl_expr[-1] += 1
            else:
                brackets.append((c, line, col))
            advance()
            continue
        if c in ")]}":
            if mode[-1] == "expr":
                if c == "}":
                    if tmpl_expr[-1] == 0:
                        tmpl_expr.pop()
                        mode.pop()          # 回到 template
                        advance()
                        continue
                    tmpl_expr[-1] -= 1
                    advance()
                    continue
                # expr 里出现 ) 或 ]：交给通用括号栈
            if not brackets:
                problems.append(Problem(rel, line, col, f"多余的 {c}"))
                advance()
                continue
            op, oline, ocol = brackets.pop()
            if OPEN[op] != c:
                problems.append(Problem(rel, line, col, f"{op} 与 {c} 不匹配（{op} 在 {oline}:{ocol}）"))
            advance()
            continue

        advance()

    if mode[-1] == "template":
        problems.append(Problem(rel, line, col, "模板字符串没有闭合"))
    for op, oline, ocol in brackets:
        problems.append(Problem(rel, oline, ocol, f"{op} 没有闭合"))
    if tmpl_expr:
        problems.append(Problem(rel, line, col, "模板字符串里的 ${...} 没有闭合"))

    problems.sort(key=lambda p: (p.line, p.col))
    return problems, lines


def local_scripts(html_rel="index.html"):
    """从某个 HTML 里取 <script src="..."> 的本地文件（保持加载顺序，路径按 HTML 所在目录解析）。"""
    html_path = os.path.join(ROOT, html_rel)
    if not os.path.exists(html_path):
        return []
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    base = os.path.dirname(html_rel).replace("\\", "/")
    out = []
    for m in re.finditer(r'<script[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', html, re.I):
        src = m.group(1)
        if re.match(r"^[a-z]+://", src) or src.startswith("//"):
            continue
        src = src.split("?")[0]
        if src.startswith("/"):
            src = src[1:]
        elif base:
            src = base + "/" + src
        out.append(src)
    return out


def main():
    # 主线 index.html + 小游戏 game/index.html，两边引到的脚本都查
    scripts = local_scripts("index.html") + local_scripts(os.path.join("game", "index.html"))
    if not scripts:
        print("× index.html 里没有找到本地 <script src>")
        return 1

    total = 0
    all_problems = []
    missing = []
    for rel in scripts:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            missing.append(rel)
            continue
        problems, lines = check_file(path, rel)
        total += lines
        all_problems.extend(problems)

    if missing:
        for rel in missing:
            print(f"  × {rel}：index.html 引了这个脚本，但文件不存在")
        all_problems.append(Problem("index.html", 0, 0, f"缺文件 {len(missing)} 个"))

    print(f"检查 {len(scripts) - len(missing)} 个脚本 · 共 {total} 行")
    for rel in scripts:
        print(f"  · {rel}")

    if all_problems:
        print(f"\n结构问题 {len(all_problems)} 处：")
        for p in all_problems:
            print("  × " + str(p))
        print("\n提醒：这里只查括号/字符串/注释的结构，完整语法以浏览器加载结果为准。")
        return 1

    print("\n结构检查通过：括号、字符串、注释都已闭合。"
          "\n（完整 JS 语法仍由浏览器在加载时判定，改引擎后务必实测。）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

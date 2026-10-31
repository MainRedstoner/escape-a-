#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escape A÷ · tools/validate_game.py —— 小游戏关卡的静态校验（纯 Python）

用法：python tools/validate_game.py [关卡文件]

读 game/src/levels.js 里的 ASCII 地图与关卡字段，检查那些「写完不跑就发现不了」的错：

  1. 图例字符是否认识（表里同步一份 game/src/tiles.js 的字符集）
  2. rows / rowsB 的行数与行宽是否等于 h / w（差一个字符整张图就错位）
  3. 起点 @ / commit 点 o / PR 门 P 是否齐备且唯一
  4. 虫子坐标是否越界、是否生在墙里、kind 是否存在
  5. 祖传虫 + 祖传本体的数量是否 ≤ 测试配额（含事件发出来的 giveTests）
     —— 多出来的祖传虫删不掉，关卡直接不可通关
  6. 事件里引用的 act 是否是 world.js 认识的动作、该带 at 的有没有带
  7. 可达性：从 @ 出发，能不能走到 P、每一个 commit 点、每一只虫的位置
     （俯视按四方向；横版按 ±2 格的跳/落近似，忽略陷阱，只验几何）

它不模拟虫子和事件，所以「几何可达」只是必要条件；真正的通关验证在
.tmp/game_bot.js（node 里驱动 game/src/world.js 跑 bot），那是开发期自测，不入库。
"""

from __future__ import annotations

import os
import re
import sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT = os.path.join("game", "src", "levels.js")

# 与 game/src/tiles.js 的 DEFS 同步
TILE_CHARS = set(" .#_+~\"&tsdbj|wm gC!oPxXl") - {"X", " "}
LEGAL = set(" .#_+~\"&tsdbj|wmgC!oxPld") | {"@"}
BUG_KINDS = {"docile", "walk", "chase", "legacy", "breeder", "egg", "jumper",
             "heisen", "crawler", "timer", "boss"}
ACTS = {"msg", "spawn", "blackout", "fog", "rebase", "collapse", "pit", "wallGrow",
        "layerSwap", "flipGravity", "flipMode", "scramble", "unscramble", "ci", "leak",
        "ghost", "giveTests", "giveBlame", "fakePr", "stash", "cherryPick", "bugRush",
        "revealAll", "openDoor", "kill", "sound", "win"}
NEEDS_AT = {"pit", "fakePr", "openDoor", "ci", "leak"}   # spawn 可以不给 at（随机黑暗格）
NEEDS_R = {"flipGravity"}
RECUR_KINDS = {"legacy", "boss"}   # 没测试罩就删会复发的虫


class Prob:
    def __init__(self, level, msg):
        self.level, self.msg = level, msg

    def __str__(self):
        return f"[{self.level}] {self.msg}" if self.level else self.msg


def split_top(inner):
    """按顶层逗号切开数组内容（嵌套 {}[] 里的逗号不算）。"""
    out, buf, depth = [], "", 0
    for ch in inner:
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
        if ch == "," and depth == 0:
            if buf.strip():
                out.append(buf.strip())
            buf = ""
        else:
            buf += ch
    if buf.strip():
        out.append(buf.strip())
    return out


INLINE_ARRAY = re.compile(r"^(\s*)(bugs|events|mutate)\s*:\s*\[(.*)\]\s*,?\s*$")


def expand(text_lines):
    """把一行写完的 bugs / events / mutate 数组摊成多行，好让下面的状态机统一处理。"""
    out = []
    for line in text_lines:
        m = INLINE_ARRAY.match(line)
        inner = m.group(3) if m else ""
        if not m or not inner or inner.lstrip().startswith("["):
            out.append(line)          # 多行块开头，或空数组
            continue
        indent, field = m.group(1), m.group(2)
        out.append(f"{indent}{field}: [")
        for item in split_top(inner):
            out.append(f"{indent}  {item},")
        out.append(f"{indent}],")
    return out


def read_levels(path):
    """把 levels.js 拆成一份份关卡：按顶层数组字段分块，只做词法级的粗解析。"""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    levels = []
    cur = None
    block = None          # 当前正在收集的行块字段名（rows / rowsB / bugs / events / mutate）
    for lineno, line in enumerate(expand(text.splitlines()), 1):
        m = re.search(r'\bid:\s*"([^"]+)"', line)
        if m:
            cur = {"id": m.group(1), "lines": [], "rows": [], "rowsB": [],
                   "bugs": [], "acts": [], "mutate": [], "giveTests": 0, "lineno": lineno}
            levels.append(cur)
            block = None
        if cur is None:
            continue
        cur["lines"].append(line)

        opened = re.match(r'\s*(\w+)\s*:\s*\[\s*$', line)
        if opened and opened.group(1) in ("rows", "rowsB", "bugs", "events", "mutate"):
            block = opened.group(1)
            continue
        if block and re.match(r"\s*\],?\s*$", line):
            block = None
            continue

        fm = re.search(r'\bmode:\s*"(top|side)"', line)
        if fm:
            cur["mode"] = fm.group(1)
        jm = re.search(r'\bjump:\s*"?(\w+)"?', line)
        if jm:
            cur["jump"] = jm.group(1)
        if re.match(r"\s*w:\s*(\d+)\s*,?\s*$", line):
            cur["w"] = int(re.match(r"\s*w:\s*(\d+)", line).group(1))
        elif re.match(r"\s*h:\s*(\d+)\s*,?\s*$", line):
            cur["h"] = int(re.match(r"\s*h:\s*(\d+)", line).group(1))

        if re.match(r"\s*tools\s*:", line):
            t = re.search(r"test:\s*(\d+)", line)
            cur["test"] = int(t.group(1)) if t else 0
            b = re.search(r"blame:\s*(\d+)", line)
            cur["blame"] = int(b.group(1)) if b else 0
        if re.match(r"\s*(requireTut|ghostTrail)\s*:", line):
            cur["requireTut"] = True
        if re.match(r"\s*pads\s*:", line):
            cur["pads"] = [int(v) for v in re.findall(r"\d+", line)]

        if block in ("rows", "rowsB"):
            sm = re.match(r'\s*"([^"]*)",?\s*$', line)
            if sm:
                cur[block].append(sm.group(1))
            continue
        if block == "bugs":
            bm = re.search(r'\{\s*at:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*kind:\s*"([a-z]+)"', line)
            if bm:
                cur["bugs"].append((int(bm.group(1)), int(bm.group(2)), bm.group(3)))
            continue
        if block in ("events", "mutate"):
            for am in re.finditer(r'act:\s*"([A-Za-z]+)"', line):
                cur["acts"].append((am.group(1), line.strip()))
            gm = re.search(r'act:\s*"giveTests"[^}]*n:\s*(\d+)', line)
            if gm:
                cur["giveTests"] += int(gm.group(1))
            if block == "mutate":
                for mm in re.finditer(r'\{\s*at:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*kind:\s*"([a-z]+)"', line):
                    cur["mutate"].append((int(mm.group(1)), int(mm.group(2)), mm.group(3)))
    return levels


def grid_of(lv):
    return lv["rows"]


def reach(rows, w, h, mode, start):
    """静态可达：忽略虫与陷阱，只验几何。"""
    def at(x, y):
        if x < 0 or y < 0 or y >= h or x >= w:
            return "#"
        row = rows[y]
        return row[x] if x < len(row) else "#"

    def solid(ch):
        return ch in "#|w"

    def pit(ch):
        return ch in "~&x"

    seen = set()
    q = deque([start])
    seen.add(start)
    while q:
        x, y = q.popleft()
        if mode == "top":
            steps = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        else:
            # 横版近似：跳最多 2 格高 / 2 格远，落不计成本（会掉到底）
            steps = []
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    if dx == 0 and dy == 0:
                        continue
                    steps.append((dx, dy))
        for dx, dy in steps:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            if (nx, ny) in seen:
                continue
            ch = at(nx, ny)
            if solid(ch):
                continue
            if mode == "side" and (abs(dx) == 2 or abs(dy) == 2):
                # 跨两格要求中间那条通道是空的
                mx, my = x + (dx // 2 if abs(dx) == 2 else dx), y + (dy // 2 if abs(dy) == 2 else dy)
                if solid(at(mx, my)):
                    continue
            seen.add((nx, ny))
            q.append((nx, ny))
    return seen


def dup_at(line):
    """同一层花括号里出现两次 at: —— 后者会静默覆盖前者，触发时间就丢了。

    事件外层写秒数 at:、acts 里的动作写坐标 at:[x,y] 是合法的，深度不同。"""
    depths = set()
    depth = 0
    i = 0
    while i < len(line):
        c = line[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif line.startswith("at:", i):
            if depth in depths:
                return True
            depths.add(depth)
            i += 2
        i += 1
    return False


def check(lv):
    ps = []
    rid = lv["id"]
    rows = lv["rows"]
    if not rows:
        return [Prob(rid, "没有 rows 地图")]
    w = lv.get("w") or max(len(r) for r in rows)
    h = lv.get("h") or len(rows)
    if len(rows) != h:
        ps.append(Prob(rid, f"rows 有 {len(rows)} 行，但 h={h}"))
    mode = lv.get("mode", "top")
    start = None
    commits, prs = [], []
    for y, r in enumerate(rows):
        if len(r) != w:
            ps.append(Prob(rid, f"第 {y} 行宽 {len(r)}，应为 {w}：{r!r}"))
        bad = sorted({c for c in r if c not in LEGAL})
        if bad:
            ps.append(Prob(rid, f"第 {y} 行有未知字符 {bad}"))
        for x, c in enumerate(r):
            if c == "@":
                if start:
                    ps.append(Prob(rid, f"多个起点：({start[0]},{start[1]}) 与 ({x},{y})"))
                start = (x, y)
            elif c == "o":
                commits.append((x, y))
            elif c == "P":
                prs.append((x, y))
            elif c == "!":
                ps.append(Prob(rid, f"第 {y} 行手写了假 PR 门 !，应该用事件 fakePr 生成"))
    if not start:
        ps.append(Prob(rid, "没有起点 @"))
    if not commits:
        ps.append(Prob(rid, "没有 commit 点 o —— 玩家无法存档"))
    if len(prs) != 1:
        ps.append(Prob(rid, f"PR 门 P 应为 1 个，实际 {len(prs)}"))

    # rowsB 与 rows 必须同尺寸
    if lv["rowsB"]:
        if len(lv["rowsB"]) != len(rows):
            ps.append(Prob(rid, f"rowsB 有 {len(lv['rowsB'])} 行，rows 有 {len(rows)} 行"))
        for y, r in enumerate(lv["rowsB"]):
            if len(r) != w:
                ps.append(Prob(rid, f"rowsB 第 {y} 行宽 {len(r)}，应为 {w}"))

    # 虫子
    recurl = 0
    for (bx, by, kind) in lv["bugs"]:
        if kind not in BUG_KINDS:
            ps.append(Prob(rid, f"未知虫子 kind={kind} @({bx},{by})"))
        if not (0 <= bx < w and 0 <= by < h):
            ps.append(Prob(rid, f"虫越界：({bx},{by}) 图是 {w}x{h}"))
        elif by < len(rows) and bx < len(rows[by]):
            ch = rows[by][bx]
            if ch in "#w|":
                ps.append(Prob(rid, f"虫生在墙里：{kind} @({bx},{by}) 是 {ch!r}"))
        if kind in RECUR_KINDS:
            recurl += 1

    budget = lv.get("test", 0) + lv.get("giveTests", 0)
    if recurl > budget:
        ps.append(Prob(rid, f"祖传虫/本体 {recurl} 只，但测试配额只有 {budget} 份 —— 删不干净，无法解锁 PR"))

    # 依赖地砖顺序
    depcount = sum(r.count("d") for r in rows)
    pads = lv.get("pads")
    if pads is not None:
        if sorted(pads) != list(range(depcount)):
            ps.append(Prob(rid, f"pads={pads} 与地图上 {depcount} 块依赖地砖（下标应为 0..{depcount-1} 的排列）不匹配"))
    if depcount and pads is None and depcount > 1:
        ps.append(Prob(rid, f"{depcount} 块依赖地砖但没有 pads，顺序默认按阅读顺序 —— 确认是故意的"))

    # 事件
    for (act, line) in lv["acts"]:
        if act not in ACTS:
            ps.append(Prob(rid, f"world.js 不认识事件动作 {act}：{line[:70]}"))
        if act in NEEDS_AT and "at:" not in line:
            ps.append(Prob(rid, f"动作 {act} 需要 at:[x,y]：{line[:70]}"))
        if act in NEEDS_R and "to:" not in line:
            ps.append(Prob(rid, f"动作 {act} 需要 to:：{line[:70]}"))
        if act == "spawn" and "kind:" not in line:
            ps.append(Prob(rid, f"动作 spawn 需要 kind：{line[:70]}"))
        if dup_at(line):
            ps.append(Prob(rid, f"同一个对象字面量里写了两个 at: —— 后者会覆盖前者，事件触发时间就丢了：{line[:70]}"))

    # 熵增长虫的位置只要求不越界（它们可以在墙里，反正会等地板变出来）
    for (mx, my, kind) in lv["mutate"]:
        if kind not in BUG_KINDS:
            ps.append(Prob(rid, f"mutate 里未知虫子 kind={kind} @({mx},{my})"))
        if not (0 <= mx < w and 0 <= my < h):
            ps.append(Prob(rid, f"mutate 点越界：({mx},{my}) 图是 {w}x{h}"))

    # 可达性（用 rowsB 再验一遍图层 B 的虫位与通路）
    if start:
        for label, grid in (("main", rows), ("hotfix", lv["rowsB"])):
            if not grid:
                continue
            rr = reach(grid, w, h, mode, start)
            if label == "main":
                for x, y in commits + prs:
                    if (x, y) not in rr:
                        ps.append(Prob(rid, f"({x},{y}) 从起点走不到（{label} 图层）"))
                for bx, by, kind in lv["bugs"]:
                    if (bx, by) not in rr and kind != "crawler":
                        ps.append(Prob(rid, f"虫 {kind} @({bx},{by}) 玩家走不到，杀不掉"))
    return ps


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    rel = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    path = rel if os.path.isabs(rel) else os.path.join(ROOT, rel)
    if not os.path.exists(path):
        print(f"× 找不到关卡文件：{rel}")
        return 1
    levels = read_levels(path)
    if not levels:
        print("× 没解析出任何关卡（id: \"…\" 格式变了？）")
        return 1
    probs = []
    print(f"读取 {rel}：{len(levels)} 个关卡")
    for lv in levels:
        w = lv.get("w") or max((len(r) for r in lv["rows"]), default=0)
        ps = check(lv)
        probs.extend(ps)
        mark = "×" if ps else "✓"
        print(f"  {mark} {lv['id']:<4} {lv.get('mode','top'):<4} {w}x{len(lv['rows'])} "
              f"虫 {len(lv['bugs'])} 事件 {len(lv['acts'])} 熵增点 {len(lv['mutate'])} commit {len([1 for r in lv['rows'] for c in r if c == 'o'])}"
              f"{'  图层B' if lv['rowsB'] else ''}")
    if probs:
        print(f"\n问题 {len(probs)} 处：")
        for p in probs:
            print("  × " + str(p))
        return 1
    print("\n关卡校验通过：图例、尺寸、标记、虫位、配额、事件动作、可达性都没问题。")
    print("（几何可达只是必要条件 —— 虫子与事件的实际通关验证请用浏览器跑一遍。）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

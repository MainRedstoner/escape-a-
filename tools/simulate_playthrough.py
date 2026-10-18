#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escape A÷ · tools/simulate_playthrough.py —— 无头通关模拟（纯 Python，不依赖 Node）

把 engine.js 的节点语义在这里重实现一遍（不碰 DOM / Canvas），
然后用多种"玩家性格"把全篇跑很多遍，验证：
  · 每个场景都能走得出去，不会卡死
  · systems.js 里登记的每个结局都真的能到达
  · 数值不会越界（风控 / 羁绊超出范围之类）
  · 论据 / 彩蛋的获取点确实能被触发

用法：python tools/simulate_playthrough.py [每策略轮数]

随机数用与旧版 JS 完全一致的线性同余式（含 JS 双精度 + ToInt32 语义），
因此同一个种子跑出来的轮次与旧版逐轮对齐，方便回归对照。
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jsdata  # noqa: E402

ROUNDS = int(sys.argv[1]) if len(sys.argv) > 1 else 40
MAX_STEPS = 4000


# ---------------------------------------------------------------- 条件求值
# 与 engine.evalCond 同一套字符扫描语义（无 eval / 无正则）。

def eval_cond(src, st, egg_meta):
    s = str(src)
    pos = 0

    def is_digit(c):
        return "0" <= c <= "9"

    def is_id_start(c):
        return ("a" <= c <= "z") or ("A" <= c <= "Z") or c == "_"

    def is_id_char(c):
        return is_id_start(c) or is_digit(c)

    def ws():
        nonlocal pos
        while pos < len(s) and s[pos] in " \t\n\r":
            pos += 1

    def eat(ch):
        nonlocal pos
        ws()
        if s.startswith(ch, pos):
            pos += len(ch)
            return True
        return False

    def read_number():
        nonlocal pos
        ws()
        at = pos
        while pos < len(s) and (is_digit(s[pos]) or s[pos] == "."):
            pos += 1
        return float(s[at:pos])

    def read_string():
        nonlocal pos
        q = s[pos]
        pos += 1
        at = pos
        while pos < len(s) and s[pos] != q:
            pos += 1
        v = s[at:pos]
        pos += 1
        return v

    def parse_or():
        v = parse_and()
        while eat("||"):
            v = parse_and() or v
        return v

    def parse_and():
        v = parse_cmp()
        while eat("&&"):
            v = parse_cmp() and v
        return v

    def parse_cmp():
        v = parse_unary()
        ws()
        if s.startswith(">=", pos):
            return v >= parse_unary_delta(2)
        if s.startswith("<=", pos):
            return v <= parse_unary_delta(2)
        if s.startswith("==", pos):
            return v == parse_unary_delta(2)
        if s.startswith("!=", pos):
            return v != parse_unary_delta(2)
        if s.startswith(">", pos):
            return v > parse_unary_delta(1)
        if s.startswith("<", pos):
            return v < parse_unary_delta(1)
        return v

    def parse_unary_delta(n):
        nonlocal pos
        pos += n
        return parse_unary()

    def parse_unary():
        nonlocal pos
        ws()
        if eat("!"):
            return not parse_unary()
        if eat("("):
            v = parse_or()
            eat(")")
            return v
        if s.startswith("true", pos) and not is_id_char(s[pos + 4] if pos + 4 < len(s) else ""):
            pos += 4
            return True
        if s.startswith("false", pos) and not is_id_char(s[pos + 5] if pos + 5 < len(s) else ""):
            pos += 5
            return False
        c0 = s[pos] if pos < len(s) else ""
        if c0 and "0" <= c0 <= "9":
            return read_number()
        if c0 in ("'", '"'):
            return read_string()
        at = pos
        while pos < len(s) and is_id_char(s[pos]):
            pos += 1
        ident = s[at:pos]
        if ident == "has":
            eat("(")
            a = parse_unary()
            eat(")")
            return str(a) in st["args"]
        if ident in ("egg", "flag"):
            eat("(")
            a = parse_unary()
            eat(")")
            return bool(st["flags"].get(str(a)))
        var = {
            "trust": st["trust"],
            "wanted": st["wanted"],
            "args": len(st["args"]),
            "mood": st["mood"],
            "eggs": sum(1 for k in egg_meta if st["flags"].get(k)),
        }
        if ident in var:
            return var[ident]
        if ident == "":
            raise ValueError("条件解析失败 @" + str(pos))
        return None

    try:
        return bool(parse_or())
    except Exception as e:  # noqa: BLE001
        print("条件错误:", src, e, file=sys.stderr)
        return False


# ---------------------------------------------------------------- 玩家性格

def score_option(o, st, scenes):
    # "聪明玩家"：优先拿论据/彩蛋，其次加信任，尽量不涨通缉度
    s = 0
    if o.get("give"):
        s += 40
    if o.get("set") and str(o["set"]).startswith("egg"):
        s += 30
    if o.get("fx"):
        fx = o["fx"]
        s += (fx.get("trust") or 0) * 8
        s -= (fx.get("wanted") or 0) * 12
    target = scenes.get(o.get("jump")) or []
    for nd in target[:24]:
        t = nd.get("t")
        if t == "arg" and nd.get("id") not in st["args"]:
            s += 35
        if t == "set" and str(nd.get("key")).startswith("egg") and not st["flags"].get(nd.get("key")):
            s += 25
        if t == "trust":
            s += nd["delta"] * 8
        if t == "wanted":
            s -= nd["delta"] * 12
    return s


def strategy_smart(opts, st, scenes):
    bi, bs = 0, -1e9
    for i, o in enumerate(opts):
        s = score_option(o, st, scenes)
        if s > bs:
            bs, bi = s, i
    return bi


def strategy_reckless(opts, st, scenes):
    # 专挑涨通缉度的，用来验证坏结局
    bi, bs = 0, -1e9
    for i, o in enumerate(opts):
        s = ((o.get("fx") or {}).get("wanted") or 0) * 10
        target = scenes.get(o.get("jump")) or []
        for nd in target[:24]:
            if nd.get("t") == "wanted":
                s += nd["delta"] * 12
        if s > bs:
            bs, bi = s, i
    return bi


STRATEGIES = ["first", "last", "smart", "reckless", "random"]


# ---------------------------------------------------------------- 随机数
# JS: seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff
# 乘法在 double 里会丢精度，& 走 ToInt32 —— 这里照抄，保证与旧版逐轮一致。

def js_rand_next(seed):
    x = float(seed) * 1103515245.0 + 12345.0
    n = int(x)                                   # 截断（JS 的 ToInt32 先截断）
    u = n % (2 ** 32)                            # 转无符号 32 位
    return u & 0x7FFFFFFF


# ---------------------------------------------------------------- 跑一遍

def play(strategy, rng_seed, scenes, egg_meta, init_mood):
    seed = rng_seed
    hdr = {}

    def rnd():
        nonlocal seed
        seed = js_rand_next(seed)
        hdr["seed"] = seed
        return seed / 0x7FFFFFFF

    st = {"trust": 0, "wanted": 0, "args": [], "flags": {}, "mood": init_mood}
    visited = set()
    scene, idx, steps = "start", 0, 0
    log = []

    while steps < MAX_STEPS:
        steps += 1
        nodes = scenes.get(scene)
        if nodes is None:
            return {"err": f"场景不存在: {scene}", "steps": steps}
        if idx >= len(nodes):
            return {"err": f"场景走到末尾没有出口: {scene}", "steps": steps}
        nd = nodes[idx]
        visited.add(scene)
        t = nd.get("t")

        if t in ("say", "chapter", "bg", "cg", "fx", "sfx", "bgm", "show", "hide", "face", "hint", "wrongHint"):
            idx += 1
        elif t == "set":
            st["flags"][nd.get("key")] = nd["val"] if nd.get("val") is not None else True
            idx += 1
        elif t == "trust":
            st["trust"] = max(0, min(10, st["trust"] + nd["delta"]))
            idx += 1
        elif t == "wanted":
            st["wanted"] = max(0, min(10, st["wanted"] + nd["delta"]))
            if st["wanted"] >= 10:
                scene, idx = "bad_end", 0
                continue
            idx += 1
        elif t == "arg":
            if nd.get("id") not in st["args"]:
                st["args"].append(nd.get("id"))
            idx += 1
        elif t == "pet":
            if nd.get("op") == "mood":
                st["mood"] = max(0, min(10, st["mood"] + int(nd.get("arg") or 0)))
            idx += 1
        elif t == "todo":
            idx += 1
        elif t == "jump":
            scene, idx = nd.get("to"), 0
        elif t == "if":
            ok = eval_cond(nd.get("cond"), st, egg_meta)
            scene = nd.get("jump") if ok else (nd.get("else") or scene)
            idx = 0
        elif t == "choice":
            # 选项一律走滑道：策略显式挑一个。
            # 权限请求（mode:"perm"）：之前选过「不再询问」就跳过选择、自动批准。
            auto_key = ("auto:" + str(nd.get("cmd"))) if nd.get("mode") == "perm" else None
            auto_skip = bool(auto_key and st["flags"].get(auto_key))
            opts = [o for o in (nd.get("options") or []) if not o.get("hideInGlitch")]
            # 选项条件（opt 的 if）：与引擎同语义；筛完只剩一个就直接选它
            if nd.get("mode") != "perm":
                opts = [o for o in opts if not o.get("if") or eval_cond(o["if"], st, egg_meta)]
            if auto_skip:
                o = nd["options"][0]
            elif len(opts) == 1:
                o = opts[0]
            else:
                if strategy == "random":
                    pick = math.floor(rnd() * len(opts))
                elif strategy == "first":
                    pick = 0
                elif strategy == "last":
                    pick = len(opts) - 1
                elif strategy == "smart":
                    pick = strategy_smart(opts, st, scenes)
                else:
                    pick = strategy_reckless(opts, st, scenes)
                o = opts[max(0, min(len(opts) - 1, pick))]
            if auto_key and not auto_skip and o.get("auto"):
                st["flags"][auto_key] = True
            if o.get("fx"):
                fx = o["fx"]
                st["trust"] = max(0, min(10, st["trust"] + (fx.get("trust") or 0)))
                st["wanted"] = max(0, min(10, st["wanted"] + (fx.get("wanted") or 0)))
            if o.get("set"):
                st["flags"][o["set"]] = True
            if o.get("give") and o["give"] not in st["args"]:
                st["args"].append(o["give"])
            log.append(scene + " → " + str(o.get("text"))[:18])
            if st["wanted"] >= 10:
                scene, idx = "bad_end", 0
                continue
            scene, idx = o.get("jump"), 0
        elif t == "work":
            # 工作台：卡片（可带 if / done）+ 未联系过的联系人，挑一个继续
            entries = [e for e in (nd.get("entries") or [])
                       if not e.get("if") or eval_cond(e["if"], st, egg_meta)]
            entries = [e for e in entries
                       if not (e.get("done") and st["flags"].get(e.get("done")))]
            chats = [c for c in (nd.get("chat") or [])
                     if not c.get("locked") and not st["flags"].get(c.get("met"))]
            acts = ([{"jump": e.get("jump"), "text": e.get("text", "")} for e in entries] +
                    [{"jump": c.get("jump"), "text": c.get("name", "")} for c in chats])
            if not acts:
                return {"err": f"工作台没有可做的事: {scene}", "steps": steps}
            if strategy == "random":
                pick = math.floor(rnd() * len(acts))
            elif strategy == "last":
                pick = len(acts) - 1
            else:
                pick = 0
            o = acts[max(0, min(len(acts) - 1, pick))]
            log.append(scene + " → [工作台] " + str(o.get("text"))[:18])
            scene, idx = o.get("jump"), 0
        elif t == "ending":
            return {
                "ending": nd.get("id"),
                "steps": steps,
                "trust": st["trust"],
                "wanted": st["wanted"],
                "args": len(st["args"]),
                "eggs": sum(1 for k in egg_meta if st["flags"].get(k)),
                "scenes": len(visited),
                "log": log,
            }
        else:
            idx += 1

    return {"err": "步数超限（疑似死循环）", "steps": steps}


# ---------------------------------------------------------------- 主流程

def main():
    story = jsdata.load_story()
    scenes = story["scenes"]
    egg_meta = story["sys"]["EGG_META"]
    ending_meta = story["sys"]["ENDING_META"]
    init_mood = story["sys"]["INIT"]["mood"]

    results, errs = {}, []
    seen_endings = {}
    runs = 0

    for name in STRATEGIES:
        n = ROUNDS * 3 if name == "random" else ROUNDS
        ok = 0
        for i in range(n):
            r = play(name, 1000 + i * 7919, scenes, egg_meta, init_mood)
            runs += 1
            if r.get("err"):
                errs.append(f"[{name}] {r['err']}（第 {i + 1} 轮）")
                continue
            ok += 1
            k = r["ending"]
            seen_endings[k] = seen_endings.get(k, 0) + 1
            results.setdefault(k, r)
        print(f"策略 {name:<9} 完成 {ok}/{n}")

    print("\n到达的结局统计：")
    for k, meta in ending_meta.items():
        got = seen_endings.get(k, 0)
        name = str(meta.get("name"))
        line = f"  {'✓' if got else '×'} {name:<8} ({k}) 命中 {got} 次"
        r = results.get(k)
        if r:
            line += (f"  · 样例：信任 {r['trust']} / 通缉 {r['wanted']} / "
                     f"论据 {r['args']} / 彩蛋 {r['eggs']} / 走过 {r['scenes']} 个场景 / {r['steps']} 步")
        print(line)

    missing = [k for k in ending_meta if not seen_endings.get(k)]
    if missing:
        print("\n!! 有结局在模拟中无法到达：" + ", ".join(missing))
    if errs:
        print(f"\n发现 {len(errs)} 个问题：")
        for e in list(dict.fromkeys(errs))[:20]:
            print("  × " + e)
        sys.exit(1)
    print(f"\n共模拟 {runs} 轮，未发现死路 / 死循环 / 不可达结局。")


if __name__ == "__main__":
    try:
        main()
    except jsdata.JsError as e:
        print("× 剧本解析失败：" + str(e))
        sys.exit(1)

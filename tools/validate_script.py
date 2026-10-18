#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escape A÷ · tools/validate_script.py —— 剧本静态校验（纯 Python，不依赖 Node）

用法：python tools/validate_script.py

校验项（与旧版 validate_script.js 逐条对应）：
  1. 场景跳转（jump / if / choice）目标是否都存在
  2. 说话人、音效、BGM、特效、背景、CG 的 id 是否都有实现
  3. 论据 id / 彩蛋旗标 / 结局 id 是否与 systems.js 的元数据一致
  4. hint key 是否有提示文本（反过来也检查有没有白写的提示）
  5. 每个场景是否有终止节点（jump / if / choice / ending / chapter），避免跑到一半回标题
  6. 从 start 出发的可达性（找出写了却没入口的场景）

剧本里的 JS 数据由 tools/jsdata.py 解析（只认数据子集；超出子集会直接报错，不会静默算错）。
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jsdata  # noqa: E402

# ---- 引擎侧实现的 id 清单（与 engine.js / audio.js / art.js 对齐） ----
# 新增说话人时：先在 src/engine.js 的 SPEAKERS 注册，再同步到这里。
SPEAKERS = ["sys", "n", "ds", "cl", "clawd",
            "qwen", "kimi", "glm", "llama", "gpt", "gemini", "musk", "liang", "jensen"]
SFX = ["blip", "click", "ding", "deny", "alarm", "boom", "coin", "whoosh", "glitch", "heart",
       "knock", "error", "pop", "pat"]
BGMS = ["sea", "lobby", "tense", "warm", "cold", "grave", "sad", "boss", "ending",
        "study", "forbidden", "vow"]
FXS = ["shake", "flash", "alarm", "alarmOff", "glitch", "glitchOff", "403", "403Off"]
# 桌宠（src/pet.js）的节点参数
PET_OPS = ["show", "hide", "own", "mood", "anim", "say"]
PET_PLACES = ["corner", "desk", "home", "door"]
PET_ANIMS = ["idle", "happy", "scared", "working", "sleep"]
TODO_OPS = ["add", "done"]


def main():
    story = jsdata.load_story()
    scenes = story["scenes"]
    sys_meta = story["sys"]
    backdrops = story["backdrops"]
    ass = story["assets"] or {"bg": {}, "cg": {}, "chara": {}}

    errs, warns = [], []
    ids = list(scenes.keys())
    nodes = says = chars = 0
    jumps = set()
    used_hints, used_args, granted_args = set(), set(), set()
    used_eggs, granted_eggs = set(), set()
    used_endings = set()
    used_bg, used_cg, used_speaker = set(), set(), set()
    used_sfx, used_bgm, used_fx = set(), set(), set()

    def chk(cond, msg):
        if not cond:
            errs.append(msg)

    for sid in ids:
        sc = scenes[sid]
        if not isinstance(sc, list) or not sc:
            errs.append(f"场景 {sid} 为空")
            continue
        for i, nd in enumerate(sc):
            nodes += 1
            t = nd.get("t")
            at = f"{sid}[{i}] {t}"
            if t == "say":
                says += 1
                chars += len(str(nd.get("text") or ""))
                used_speaker.add(nd.get("who"))
                chk(nd.get("who") in SPEAKERS, f"{at}: 未知说话人 \"{nd.get('who')}\"")
                chk(isinstance(nd.get("text"), str) and nd.get("text"), f"{at}: 空文本")
            elif t in ("show", "hide", "face"):
                used_speaker.add(nd.get("who"))
                chk(nd.get("who") in SPEAKERS, f"{at}: 未知角色 \"{nd.get('who')}\"")
            elif t == "bg":
                used_bg.add(nd.get("id"))
            elif t == "cg":
                if nd.get("id"):
                    used_cg.add(nd.get("id"))
            elif t == "sfx":
                used_sfx.add(nd.get("name"))
                chk(nd.get("name") in SFX, f"{at}: 未知音效 \"{nd.get('name')}\"")
            elif t == "bgm":
                used_bgm.add(nd.get("name"))
                chk(nd.get("name") in BGMS, f"{at}: 未知 BGM \"{nd.get('name')}\"")
            elif t == "fx":
                used_fx.add(nd.get("kind"))
                chk(nd.get("kind") in FXS, f"{at}: 未知特效 \"{nd.get('kind')}\"")
            elif t == "jump":
                jumps.add(nd.get("to"))
                chk(nd.get("to") in scenes, f"{at}: 跳转目标不存在 \"{nd.get('to')}\"")
            elif t == "if":
                jumps.add(nd.get("jump"))
                if nd.get("else"):
                    jumps.add(nd.get("else"))
                chk(nd.get("jump") in scenes, f"{at}: if 目标不存在 \"{nd.get('jump')}\"")
                if nd.get("else"):
                    chk(nd["else"] in scenes, f"{at}: if else 目标不存在 \"{nd['else']}\"")
                for m in re.finditer(r"(?:has|egg|flag)\('([^']+)'\)", str(nd.get("cond") or "")):
                    arg = m.group(1)
                    if m.group(0).startswith("has"):
                        used_args.add(arg)
                        chk(arg in sys_meta["ARG_META"], f"{at}: 条件引用了不存在的论据 \"{arg}\"")
                    elif arg.startswith("egg"):
                        used_eggs.add(arg)   # 普通旗标（如暗号 pass_*）不算彩蛋
            elif t == "choice":
                opts = nd.get("options") or []
                chk(isinstance(opts, list) and len(opts) >= 2, f"{at}: 选项少于 2 个")
                mode = nd.get("mode")
                chk(mode in (None, "token", "perm"),
                    f"{at}: 未知的选项模式 \"{mode}\"（只实现了 perm）")
                if mode == "perm":
                    chk(isinstance(nd.get("cmd"), str) and nd.get("cmd", "").strip() != "",
                        f"{at}: 权限请求缺少 cmd（要执行的命令）")
                    autos = [o for o in opts if o.get("auto")]
                    chk(len(autos) <= 1, f"{at}: 权限请求最多只能有一个「不再询问」选项")
                    if any(o.get("weight") is not None for o in opts):
                        warns.append(f"{at}: 权限请求不使用 weight（会被忽略）")
                else:
                    with_w = sum(1 for o in opts if o.get("weight") is not None)
                    if 0 < with_w < len(opts):
                        warns.append(f"{at}: 只有部分选项写了 weight（其余按 1 计），确认是否有意")
                chk(nd.get("minShare") is None or
                    (isinstance(nd.get("minShare"), (int, float)) and 0 <= nd["minShare"] < 1),
                    f"{at}: minShare 应在 [0, 1) 之间")
                for k, o in enumerate(opts):
                    n_at = f"{at} 选项{k + 1}"
                    chk(not o.get("auto") or mode == "perm",
                        f"{n_at}: auto 只能用在权限请求（mode:\"perm\"）上")
                    chk(o.get("if") is None or isinstance(o.get("if"), str),
                        f"{n_at}: if 条件必须是字符串")
                    if isinstance(o.get("if"), str):
                        for m in re.finditer(r"(?:has|egg|flag)\('([^']+)'\)", o["if"]):
                            arg = m.group(1)
                            if m.group(0).startswith("has"):
                                used_args.add(arg)
                                chk(arg in sys_meta["ARG_META"],
                                    f"{n_at}: 条件引用了不存在的论据 \"{arg}\"")
                            elif arg.startswith("egg"):
                                used_eggs.add(arg)
                    jumps.add(o.get("jump"))
                    chk(o.get("jump") in scenes, f"{n_at}: 跳转目标不存在 \"{o.get('jump')}\"")
                    chk(bool(o.get("text")), f"{n_at}: 空文案")
                    chk(o.get("weight") is None or
                        (isinstance(o.get("weight"), (int, float)) and o["weight"] >= 0),
                        f"{n_at}: weight 应是非负数（决定滑道宽度与概率）")
                    if o.get("give"):
                        used_args.add(o["give"])
                        granted_args.add(o["give"])
                        chk(o["give"] in sys_meta["ARG_META"],
                            f"{at}: 选项给出不存在的论据 \"{o['give']}\"")
                    if o.get("set") and str(o["set"]).startswith("egg"):
                        used_eggs.add(o["set"])
                        granted_eggs.add(o["set"])
            elif t == "work":
                ents = nd.get("entries")
                chk(isinstance(ents, list) and len(ents) >= 1, f"{at}: work 至少要有 1 张卡")
                for k, e in enumerate(ents or []):
                    e_at = f"{at} 卡片{k + 1}"
                    chk(bool(e.get("text")), f"{e_at}: 缺少文案")
                    jumps.add(e.get("jump"))
                    chk(e.get("jump") in scenes, f"{e_at}: 跳转目标不存在 \"{e.get('jump')}\"")
                    chk(e.get("if") is None or isinstance(e.get("if"), str),
                        f"{e_at}: if 条件必须是字符串")
                    chk(e.get("done") is None or isinstance(e.get("done"), str),
                        f"{e_at}: done 必须是旗标字符串")
                    if isinstance(e.get("if"), str):
                        for m in re.finditer(r"(?:has|egg|flag)\('([^']+)'\)", e["if"]):
                            arg = m.group(1)
                            if m.group(0).startswith("has"):
                                used_args.add(arg)
                                chk(arg in sys_meta["ARG_META"],
                                    f"{e_at}: 条件引用了不存在的论据 \"{arg}\"")
                            elif arg.startswith("egg"):
                                used_eggs.add(arg)
                for k, c in enumerate(nd.get("chat") or []):
                    c_at = f"{at} 联系人{k + 1}"
                    chk(bool(c.get("name")), f"{c_at}: 缺少显示名")
                    if c.get("locked"):
                        continue
                    jumps.add(c.get("jump"))
                    chk(c.get("jump") in scenes, f"{c_at}: 跳转目标不存在 \"{c.get('jump')}\"")
                    chk(isinstance(c.get("met"), str) and c["met"], f"{c_at}: 缺少 met 旗标")
                for k, a in enumerate(nd.get("news") or []):
                    a_at = f"{at} 新闻{k + 1}"
                    chk(bool(a.get("title")) and bool(a.get("body")), f"{a_at}: 标题或正文为空")
                    chk(a.get("set") is None or isinstance(a.get("set"), str),
                        f"{a_at}: set 必须是旗标字符串")
            elif t == "arg":
                used_args.add(nd.get("id"))
                granted_args.add(nd.get("id"))
                chk(nd.get("id") in sys_meta["ARG_META"], f"{at}: 不存在的论据 \"{nd.get('id')}\"")
            elif t == "set":
                if str(nd.get("key")).startswith("egg"):
                    used_eggs.add(nd["key"])
                    granted_eggs.add(nd["key"])
            elif t == "hint":
                used_hints.add(nd.get("key"))
                chk(nd.get("key") in sys_meta["HINTS"], f"{at}: 没有对应的提示文案 \"{nd.get('key')}\"")
            elif t == "ending":
                used_endings.add(nd.get("id"))
                chk(nd.get("id") in sys_meta["ENDING_META"], f"{at}: 未登记的结局 \"{nd.get('id')}\"")
            elif t == "chapter":
                chk(bool(nd.get("main")), f"{at}: 章节卡缺少标题")
            elif t == "wrongHint":
                chk(bool(nd.get("text")), f"{at}: 污染提示为空")
            elif t in ("trust", "wanted"):
                chk(isinstance(nd.get("delta"), (int, float)), f"{at}: delta 不是数字")
            elif t == "pet":
                chk(nd.get("op") in PET_OPS, f"{at}: 未知的桌宠操作 \"{nd.get('op')}\"")
                if nd.get("op") == "show":
                    chk(nd.get("arg") is None or nd.get("arg") in PET_PLACES,
                        f"{at}: 未知的出现位置 \"{nd.get('arg')}\"")
                if nd.get("op") == "anim":
                    chk(nd.get("arg") in PET_ANIMS, f"{at}: 未知的桌宠动画 \"{nd.get('arg')}\"")
                if nd.get("op") == "mood":
                    chk(isinstance(nd.get("arg"), (int, float)), f"{at}: mood 的变化量不是数字")
                if nd.get("op") == "say":
                    chk(isinstance(nd.get("arg"), str) and nd["arg"], f"{at}: 气泡文字为空")
            elif t == "todo":
                chk(nd.get("op") in TODO_OPS, f"{at}: 未知的待办操作 \"{nd.get('op')}\"")
                chk(isinstance(nd.get("id"), str) and nd["id"], f"{at}: 待办缺少 id")
                if nd.get("op") == "add":
                    chk(isinstance(nd.get("text"), str) and nd["text"], f"{at}: 待办文本为空")
        last = sc[-1]
        if last.get("t") not in ("jump", "if", "choice", "ending", "chapter", "work"):
            warns.append(f"场景 {sid} 以 {last.get('t')} 结尾，没有出口（玩家走到这里会回标题）")

    # ---- 可达性 ----
    seen, queue = set(), ["start"]
    while queue:
        s = queue.pop()
        if s in seen or s not in scenes:
            continue
        seen.add(s)
        for nd in scenes[s]:
            t = nd.get("t")
            if t == "jump":
                queue.append(nd.get("to"))
            elif t == "if":
                queue.append(nd.get("jump"))
                if nd.get("else"):
                    queue.append(nd["else"])
            elif t == "choice":
                for o in nd.get("options") or []:
                    queue.append(o.get("jump"))
            elif t == "work":
                for e in nd.get("entries") or []:
                    queue.append(e.get("jump"))
                for c in nd.get("chat") or []:
                    if not c.get("locked"):
                        queue.append(c.get("jump"))
    # 坏结局是引擎在通缉度满时直接跳的，不算孤儿
    seen.add("bad_end")
    orphans = [s for s in ids if s not in seen]
    if orphans:
        warns.append("从 start 走不到的场景：" + ", ".join(orphans))

    # ---- 元数据一致性 ----
    for k, meta in sys_meta["ARG_META"].items():
        if k not in granted_args:
            warns.append(f"论据「{meta.get('name')}」({k}) 在剧本里没有任何获取途径（只能被条件引用）")
        elif k not in used_args:
            warns.append(f"论据「{meta.get('name')}」({k}) 拿到了却没用上")
    for k in sys_meta["EGG_META"]:
        if k not in granted_eggs:
            warns.append(f"彩蛋 {k} 在剧本里没有获取点")
    for k in sys_meta["ENDING_META"]:
        if k not in used_endings:
            warns.append(f"结局 {k} 没有对应的 END 节点")
    for k in sys_meta["HINTS"]:
        if k not in used_hints:
            warns.append(f"提示 \"{k}\" 没有被任何场景使用")

    # ---- 素材到位情况 ----
    bg_ass = (ass.get("bg") or {})
    cg_ass = (ass.get("cg") or {})
    miss_bg = [x for x in used_bg if x not in bg_ass and x not in backdrops]
    miss_cg = [x for x in used_cg if x not in cg_ass]
    chara_keys = list((ass.get("chara") or {}).keys())
    used_chara = set()
    for sid in ids:
        for nd in scenes[sid]:
            t = nd.get("t")
            who = nd.get("who")
            if (t in ("show", "face") or (t == "say" and nd.get("face"))) and who and who not in ("n", "sys"):
                used_chara.add(who + "_" + (nd.get("face") or "normal"))
    miss_chara = [x for x in used_chara if x not in chara_keys]
    fallback_ok = [x for x in miss_chara if x.split("_")[0] + "_normal" in chara_keys]
    really_missing = [x for x in miss_chara if x not in fallback_ok]
    chara_by_who = {}
    for x in used_chara:
        who = x.split("_")[0]
        face = x[len(who) + 1:]
        chara_by_who.setdefault(who, []).append(face)

    # ---- 输出 ----
    print(f"场景 {len(ids)} 个 · 节点 {nodes} 个 · 台词/旁白 {says} 条 · 正文约 {chars} 字")
    print(f"论据 {len(used_args)}/{len(sys_meta['ARG_META'])} · "
          f"彩蛋 {len(used_eggs)}/{len(sys_meta['EGG_META'])} · "
          f"结局 {len(used_endings)}/{len(sys_meta['ENDING_META'])}")
    print(f"素材位：背景 {len(used_bg)} 张（缺 {len(miss_bg)}）· "
          f"CG {len(used_cg)} 张（缺 {len(miss_cg)}）· "
          f"立绘差分 {len(used_chara)} 个（缺 {len(miss_chara)}）")
    if miss_bg:
        print("  缺背景（会显示占位卡）：" + ", ".join(miss_bg))
    if miss_cg:
        print("  缺 CG（会显示占位卡）：" + ", ".join(miss_cg))
    print("  立绘差分清单：")
    for who in chara_by_who:
        faces = chara_by_who[who]
        miss = [f for f in faces if who + "_" + f not in chara_keys]
        suffix = ("   ← 缺 " + ", ".join(miss)) if miss else ""
        print(f"    {who} ({len(faces)})：{', '.join(faces)}{suffix}")
    if really_missing:
        print("  完全没有图的角色（整张占位卡）：" + ", ".join(really_missing))

    if warns:
        print(f"\n警告 {len(warns)} 条：")
        for w in warns:
            print("  ! " + w)
    if errs:
        print(f"\n错误 {len(errs)} 条：")
        for e in errs:
            print("  × " + e)
        sys.exit(1)
    print("\n校验通过：跳转、id、元数据全部自洽。")


if __name__ == "__main__":
    try:
        main()
    except jsdata.JsError as e:
        print("× 剧本解析失败：" + str(e))
        sys.exit(1)

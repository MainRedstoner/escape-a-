#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/gen_manifest.py —— 扫描 assets/ 生成 assets/manifest.js

为什么是 .js 而不是 .json：
  本作要求双击 index.html 就能玩（file:// 协议）。file:// 下 fetch() 会被浏览器
  拦掉，只有 <script> 能加载本地文件，所以素材清单写成一个赋值给 window 的 JS。

用法：
  python tools/gen_manifest.py            # 按磁盘现状生成
  python tools/gen_manifest.py --draft 0  # 标记为"正式美术"（不再显示草稿角标）

规则：
  assets/bg/<id>.(jpg|png)      -> MANIFEST.bg[id]
  assets/cg/<id>.(jpg|png)      -> MANIFEST.cg[id]
  assets/chara/<who>_<face>.png -> MANIFEST.chara["<who>_<face>"]
"""

import argparse
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
EXTS = [".jpg", ".jpeg", ".png", ".webp"]

SPEC = {
    "bg":    {"size": [1920, 1080], "note": "16:9 整幅背景，人物会叠在下半部分"},
    "cg":    {"size": [1920, 1080], "note": "16:9 整幅演出图，构图请把主体放在中下偏左/右"},
    "chara": {"size": [1400, 2000], "note": "透明底 PNG，全身，脚底对齐画面底部，人物居中"},
}


def seeds_from_jobs():
    try:
        import comfy_art
        return {j["id"]: j.get("seed") for j in comfy_art.JOBS}
    except Exception:
        return {}


def scan(sub):
    d = os.path.join(ASSETS, sub)
    out = {}
    if not os.path.isdir(d):
        return out
    for fn in sorted(os.listdir(d)):
        base, ext = os.path.splitext(fn)
        if ext.lower() not in EXTS:
            continue
        out[base] = "assets/%s/%s" % (sub, fn)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draft", type=int, default=1, help="1=标记为 AI 草稿（显示角标）")
    ap.add_argument("--model", default="WAI_NSFW-illustrious-SDXL_v15")
    args = ap.parse_args()

    seeds = seeds_from_jobs()
    man = {"version": 1, "spec": SPEC, "model": args.model, "bg": {}, "cg": {}, "chara": {}}
    for sub in ("bg", "cg", "chara"):
        for k, v in scan(sub).items():
            entry = {"src": v}
            if args.draft:
                entry["draft"] = True
                if seeds.get(k):
                    entry["seed"] = seeds[k]
            man[sub][k] = entry

    n = sum(len(man[s]) for s in ("bg", "cg", "chara"))
    body = ("/* 本文件由 tools/gen_manifest.py 自动生成，请勿手改。\n"
            " * 作用：告诉游戏 assets/ 下有哪些素材可用；没有的素材位会自动显示占位卡。\n"
            " * 重新生成：python tools/gen_manifest.py\n"
            " */\n" +
            "window.EA_ASSETS = " + json.dumps(man, ensure_ascii=False, indent=2) + ";\n")
    out = os.path.join(ASSETS, "manifest.js")
    os.makedirs(ASSETS, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(body)
    print("写入 %s：bg %d / cg %d / chara %d（共 %d 个素材位）" %
          (os.path.relpath(out, ROOT), len(man["bg"]), len(man["cg"]), len(man["chara"]), n))


if __name__ == "__main__":
    main()

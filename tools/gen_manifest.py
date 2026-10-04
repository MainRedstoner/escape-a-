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


# 各角色正式版所用的管线（按 id 前缀区分，写进清单便于溯源）
FINAL_NOTES = {
    "ds_": "circlestone-labs/Anima (aesthetic v1.1) + SAkizuki/anima-deepseek LoRA",
    "cl_": "circlestone-labs/Anima (base v1.0) + Civitai Claude娘 LoRA「ors scholar」(w=0.8)",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draft", type=int, default=1, help="1=标记为 AI 草稿（显示角标）")
    ap.add_argument("--model", default="WAI_NSFW-illustrious-SDXL_v15")
    ap.add_argument("--final-kind-model", default="circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大",
                    help="--final-kind 指定类别所用的管线标注")
    ap.add_argument("--final-model", default="circlestone-labs/Anima + SAkizuki/anima-deepseek LoRA",
                    help="已完成 HD 化的素材所用的管线（写进清单便于区分来源）")
    ap.add_argument("--final-kind", default="",
                    help="逗号分隔的类别（bg/cg/chara）；整类都算正式版（例：--final-kind bg）")
    ap.add_argument("--final", default="",
                    help="逗号分隔的 id 前缀；这些素材视为正式版，不显示草稿角标（例如 ds_ 表示小鲸已做完 HD 版）")
    args = ap.parse_args()

    final_prefixes = tuple(p for p in args.final.split(",") if p)
    final_kinds = set(x.strip() for x in args.final_kind.split(",") if x.strip())
    seeds = seeds_from_jobs()
    man = {"version": 1, "spec": SPEC, "model": args.model, "bg": {}, "cg": {}, "chara": {}}
    for sub in ("bg", "cg", "chara"):
        for k, v in scan(sub).items():
            entry = {"src": v}
            is_final = (bool(final_prefixes) and k.startswith(final_prefixes)) \
                or (sub in final_kinds)
            if is_final:
                note = None
                for pre, lbl in FINAL_NOTES.items():
                    if k.startswith(pre):
                        note = lbl
                        break
                if note is None:
                    note = (args.final_kind_model if sub in final_kinds else args.final_model)
                entry["pipeline"] = note
            elif args.draft:
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

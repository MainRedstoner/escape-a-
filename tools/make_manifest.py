#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/make_manifest.py —— 扫描 assets/ 生成 assets/manifest.js

为什么是 .js 而不是 .json：
  本作要求双击 index.html 就能玩（file:// 协议）。file:// 下 fetch() 会被浏览器
  拦掉，只有 <script> 能加载本地文件，所以素材清单写成一个赋值给 window 的 JS。

用法（在仓库根目录运行，输出重定向到清单文件）：
  python tools/make_manifest.py > assets/manifest.js            # 按磁盘现状生成
  python tools/make_manifest.py --draft 0 > assets/manifest.js  # 标记为"正式美术"（不再显示草稿角标）

规则：
  assets/bg/<id>.(jpg|png)      -> MANIFEST.bg[id]
  assets/cg/<id>.(jpg|png)      -> MANIFEST.cg[id]
  assets/chara/<who>_<face>.png -> MANIFEST.chara["<who>_<face>"]

id 的取值就是剧本里 BG()/CG()/SHOW() 写的那些；素材规范见 assets/README.md。
"""

import argparse
import json
import os
import sys

# 全部使用字面相对路径（相对仓库根目录），子目录走白名单，杜绝路径穿越
ASSETS_DIR = "assets"
SUBS = ("bg", "cg", "chara")
EXTS = [".jpg", ".jpeg", ".png", ".webp"]

SPEC = {
    "bg":    {"size": [1920, 1080], "note": "16:9 整幅背景，人物会叠在下半部分"},
    "cg":    {"size": [1920, 1080], "note": "16:9 整幅演出图，构图请把主体放在中下偏左/右"},
    "chara": {"size": [1400, 2000], "note": "透明底 PNG，全身，脚底对齐画面底部，人物居中"},
}


def scan(sub):
    if sub not in SUBS:
        raise ValueError("不允许的素材目录: %r" % (sub,))
    d = ASSETS_DIR + "/" + sub
    out = {}
    if not os.path.isdir(d):
        return out
    for fn in sorted(os.listdir(d)):
        base, ext = os.path.splitext(fn)
        if ext.lower() not in EXTS:
            continue
        out[base] = "%s/%s/%s" % (ASSETS_DIR, sub, fn)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draft", type=int, default=1, help="1=标记为 AI 草稿（显示角标）")
    ap.add_argument("--model", default="", help="生成管线备注（原样写进清单的 model 字段）")
    ap.add_argument("--final-kind", default="",
                    help="逗号分隔的类别（bg/cg/chara）；整类都算正式版（例：--final-kind bg）")
    ap.add_argument("--final", default="",
                    help="逗号分隔的 id 前缀；这些素材视为正式版，不显示草稿角标")
    args = ap.parse_args()

    if not os.path.isdir(ASSETS_DIR):
        raise SystemExit("找不到 %s/ 目录：请在仓库根目录运行本脚本" % ASSETS_DIR)

    final_prefixes = tuple(p for p in args.final.split(",") if p)
    final_kinds = set(x.strip() for x in args.final_kind.split(",") if x.strip())
    man = {"version": 1, "spec": SPEC, "model": args.model, "bg": {}, "cg": {}, "chara": {}}
    for sub in SUBS:
        for k, v in scan(sub).items():
            entry = {"src": v}
            is_final = (bool(final_prefixes) and k.startswith(final_prefixes)) \
                or (sub in final_kinds)
            if is_final:
                entry["pipeline"] = args.model or None
            elif args.draft:
                entry["draft"] = True
            man[sub][k] = entry

    n = sum(len(man[s]) for s in SUBS)
    body = ("/* 本文件由 tools/make_manifest.py 生成，请勿手改。\n"
            " * 作用：告诉游戏 assets/ 下有哪些素材可用；没有的素材位会自动显示占位卡。\n"
            " * 重新生成：python tools/make_manifest.py > assets/manifest.js\n"
            " */\n" +
            "window.EA_ASSETS = " + json.dumps(man, ensure_ascii=False, indent=2) + ";\n")
    # 本工具只读不写：清单文件由使用者重定向生成（避免脚本写源码文件）
    if sys.stdout.isatty():
        print(body, end="")
    else:
        sys.stdout.buffer.write(body.encode("utf-8"))
    print("（bg %d / cg %d / chara %d，共 %d 个素材位 —— 请把上面的 JSON 重定向到 assets/manifest.js）"
          % (len(man["bg"]), len(man["cg"]), len(man["chara"]), n), file=sys.stderr)


if __name__ == "__main__":
    main()

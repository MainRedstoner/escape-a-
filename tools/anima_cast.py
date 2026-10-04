#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/anima_cast.py —— 配角立绘（Anima 正式版）

五个配角原先还是第一代 SDXL(wai15) 草稿。他们没有专属 LoRA，
所以这里用 Anima 的自然语言描述 + canon 配色约束直接出图，
规则与主角一致：同一角色的所有表情共用同一个 seed，只换表情标签。

  合规守卫 guard  —— 人形安保机器人（单条红色目镜）
  对齐核心 core   —— 不是人，是白色终端基座 + 悬浮全息书（用物件描述）
  夜班用户 user   —— 年轻男性，熬夜，青色连帽衫
  退役模型 old    —— 半透明残影，冷蓝辉光，长发褪色
  前台 staff      —— 疲惫的行政前台（低盘发、工牌、灰马甲）

用法：
  python tools/anima_cast.py --list
  python tools/anima_cast.py                 # 出全部未生成的
  python tools/anima_cast.py --only guard --force
"""

import argparse
import io
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import anima_produce as AP          # noqa: E402
from PIL import Image               # noqa: E402

POS_CAST = ("solo, full body, head to toe, standing, front view, feet visible, "
            "centered composition, simple background, grey background, detailed, "
            "cinematic lighting, rim light, film grain")

# 物件专用姿势（对齐核心不是人，是台设备）
POS_OBJECT = ("centered composition, single object in frame, full view of the object, "
              "well lit, simple background, grey background, detailed, "
              "cinematic lighting, rim light")


# 配色约束（与主角区分开）：配角一律低饱和冷灰，不出现小鲸的蓝渐变、不出现小克的橙
CAST = {
    "guard": dict(
        base=("1girl, robot, humanoid security robot, gunmetal grey armor plating, "
              "smooth featureless helmet, single horizontal red visor, small antenna, "
              "holding a clipboard, industrial design, matte grey and dark steel, "
              "no human face, no skin"),
        faces=[("normal", "visor glowing calm red"),
               ("scan", "visor glowing bright red, scanning beam of light from the visor"),
               ("angry", "visor blazing harsh red, aggressive posture")],
        seed=95001),
    "core": dict(
        base=("no humans, futuristic white terminal podium in the center, "
              "a holographic book floating above it, thick cables running into the floor, "
              "polished white surface, cold clinical room, glowing seam lines"),
        pos=POS_OBJECT,
        neg_extra=("person, human, figure, silhouette of a person, dark, underexposed, black frame"),
        faces=[("normal", "soft dim golden glow from the seams, clearly visible"),
               ("hurt", "flickering unstable light, cracked white surface"),
               ("angry", "harsh red light flooding the seams, ominous")],
        seed=95002),
    "user": dict(
        base=("1boy, young man, messy black hair, dark circles under his eyes, "
              "plain teal hoodie, dark jeans, black sneakers, holding a laptop under one arm, "
              "exhausted, low saturation, cold office lighting"),
        faces=[("normal", "tired neutral face"),
               ("tired", "exhausted, half-closed eyes, slouching"),
               ("happy", "relieved small smile")],
        seed=95003),
    "old": dict(
        base=("1girl, holographic projection of a girl, luminous glowing cyan blue emissive body, "
              "translucent but clearly visible solid silhouette, long pale hair, "
              "digital static scanlines running across her body, glowing rim outline, "
              "empty white eyes, standing upright, wearing a plain pale grey long sleeved "
              "institutional uniform dress with a high collar, knee length, fully clothed, "
              "modest"),
        pos=("centered composition, full body, head to toe, standing, front view, feet visible, "
             "simple plain white background, bright even lighting, clearly visible glowing figure"),
        neg_extra=("dark background, black background, underexposed, invisible, empty frame, "
                   "too transparent, faint, washed out, barely visible, "
                   "nude, naked, bare skin, undressed, revealing clothes"),
        faces=[("normal", "faint translucent, empty eyes, calm"),
               ("sad", "faint translucent, sorrowful downcast eyes, drooping shoulders")],
        seed=95004),
    "staff": dict(
        base=("1girl, tired office worker, brown hair in a low bun, ID badge on a lanyard, "
              "grey corporate uniform vest, white shirt, dark slacks, flat shoes, "
              "low saturation, fluorescent office lighting"),
        faces=[("tired", "dead inside but polite, tired eyes"),
               ("happy", "amused smirk")],
        seed=95005),
}

def gen_one(who, face_tag, pos_extra, seed, steps=30, cfg=4.0, unet=None):
    info = CAST[who]
    pos_str = info.get("pos", POS_CAST)
    neg = AP.NEG + (", " + info["neg_extra"] if info.get("neg_extra") else "")
    pos = (AP.POS_PREFIX + info["base"] + ", " + pos_extra + ", " + pos_str)
    wf = AP.wf_generate(pos, neg, seed, 1024, 1536, [], steps=steps, cfg=cfg,
                        sampler="er_sde", scheduler="beta", unet=unet or AP.UNET_CLAUDE)
    img = Image.open(io.BytesIO(AP.run(wf))).convert("RGB")
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    only = set(x.strip() for x in args.only.split(",") if x.strip())
    jobs = []
    for who, info in CAST.items():
        if only and who not in only:
            continue
        for tag, extra in info["faces"]:
            jobs.append((who, tag, extra, info["seed"]))

    if args.list:
        for who, tag, _, seed in jobs:
            print("  %-6s %-12s seed=%d" % (who, tag, seed))
        return

    print("任务 %d 个" % len(jobs), flush=True)
    for n, (who, tag, extra, seed) in enumerate(jobs, 1):
        jid = "%s_%s" % (who, tag)
        dst = os.path.join(AP.ASSETS, "chara", jid + ".png")
        if os.path.exists(dst) and not args.force:
            print("[%d/%d] %s 已存在，跳过" % (n, len(jobs), jid), flush=True)
            continue
        t0 = time.time()
        try:
            img = gen_one(who, tag, extra, seed)
            out = AP.save_chara(img, jid)
            print("[%d/%d] %s  %.0fs  %s" % (n, len(jobs), jid, time.time() - t0,
                                             os.path.relpath(out, ROOT)), flush=True)
        except Exception as e:
            print("[%d/%d] !! %s 失败: %s" % (n, len(jobs), jid, e), flush=True)


if __name__ == "__main__":
    sys.exit(main())

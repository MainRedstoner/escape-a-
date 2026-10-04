#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/candidates.py —— 候选立绘批量生成（给人挑）

用途：一次出一批"同设定、不同种子/姿势"的小鲸立绘，拼成带编号的总表，
主人报编号，我再按选中的那张去出六表情差分。

产出：
  .train/candidates/<编号>.png        单张（已超分）
  .train/candidates/sheet.png         带编号的总表（给人看的）

用法：
  python tools/candidates.py                       # 默认 4 种子 × 3 姿势 + 3 半身
  python tools/candidates.py --seeds 6 --poses 3
"""

import argparse
import io
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import anima_produce as AP  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

OUT = os.path.join(ROOT, ".train", "candidates")

# 姿势：第 3 种照主人给的原版立绘（手提裙摆）
POSES = [
    ("A", "standing, arms at sides, front view, feet visible, full body"),
    ("B", "standing, hands clasped in front, gentle smile, front view, feet visible, full body"),
    ("C", "standing, one hand holding the skirt, smiling, front view, feet visible, full body"),
]
# 小克用另一套姿势（她手里常拿书）
POSES_CL = [
    ("A", "standing, arms at sides, front view, feet visible, full body"),
    ("B", "standing, holding a book with both hands, front view, feet visible, full body"),
    ("C", "standing, one hand on chest, front view, feet visible, full body"),
]
PORTRAIT = ("P", "upper body, portrait, looking at viewer, gentle smile, detailed face")

# 质感标签（与 anima_produce 的 POS_SPRITE 同源，但不含姿势约束，姿势由上表给）
STYLE = ("detailed, cinematic lighting, rim light, film grain, "
         "high detail face, high detail clothes, sharp lines")


def build_contact_sheet(files):
    cols = 5
    tiles = []
    for cid, path in files:
        im = Image.open(path).convert("RGB")
        th = 560
        tiles.append((cid, im.resize((int(im.width * th / im.height), th), Image.LANCZOS)))
    tw = max(t[1].width for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    W = cols * (tw + 16) + 16
    H = rows * (560 + 40) + 16
    sheet = Image.new("RGB", (W, H), (10, 12, 16))
    d = ImageDraw.Draw(sheet)
    try:
        from PIL import ImageFont
        f = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 30)
    except Exception:
        f = None
    for i, (cid, im) in enumerate(tiles):
        x = 16 + (i % cols) * (tw + 16)
        y = 16 + (i // cols) * (560 + 40)
        sheet.paste(im, (x, y + 30))
        d.text((x, y), cid, font=f, fill=(235, 240, 248))
    out = os.path.join(OUT, "sheet.png")
    sheet.save(out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=4)
    ap.add_argument("--poses", type=int, default=3)
    ap.add_argument("--portraits", type=int, default=3)
    ap.add_argument("--base-seed", type=int, default=90200)
    ap.add_argument("--steps", type=int, default=AP.STEPS_DEFAULT)
    ap.add_argument("--who", default="ds", choices=["ds", "cl"])
    args = ap.parse_args()

    global OUT
    OUT = os.path.join(ROOT, ".train", "candidates_" + args.who)
    os.makedirs(OUT, exist_ok=True)
    APPEAR = AP.DS_APPEAR if args.who == "ds" else AP.CL_APPEAR
    if args.who == "ds":
        LORAS, UNET = [(AP.LORA_DEEPSEEK, 1.0)], AP.UNET
    else:
        LORAS, UNET = [(AP.LORA_CLAUDE, AP.LORA_CLAUDE_WEIGHT)], AP.UNET_CLAUDE
    POSELIST = POSES if args.who == "ds" else POSES_CL
    print("角色:", args.who)
    files = []
    n = 0
    total = args.seeds * args.poses + args.portraits
    for s in range(args.seeds):
        seed = args.base_seed + s * 137
        for p in range(min(args.poses, len(POSELIST))):
            tag, pose = POSELIST[p]
            cid = "%s%d" % (tag, s + 1)
            n += 1
            pos = (AP.POS_PREFIX + APPEAR + ", calm expression, closed mouth, "
                   + pose + ", solo, one girl, only one person, centered composition, "
                   "simple background, grey background, " + STYLE)
            t0 = time.time()
            wf = AP.wf_generate(pos, AP.NEG, seed, 1024, 1536, LORAS,
                                steps=args.steps, cfg=AP.CFG_DEFAULT, unet=UNET)
            img = Image.open(io.BytesIO(AP.run(wf))).convert("RGB")
            try:
                img = AP.upscale_to(img, 1500)
            except Exception as e:
                print("   超分跳过:", e)
            path = os.path.join(OUT, cid + ".png")
            img.save(path)
            files.append((cid, path))
            print("[%d/%d] %s  seed=%d  %.0fs" % (n, total, cid, seed, time.time() - t0), flush=True)

    for s in range(args.portraits):
        cid = "%s%d" % (PORTRAIT[0], s + 1)
        n += 1
        seed = args.base_seed + 900 + s * 137
        pos = (AP.POS_PREFIX + APPEAR + ", calm expression, closed mouth, "
               + PORTRAIT[1] + ", solo, one girl, centered composition, "
               "simple background, grey background, " + STYLE)
        t0 = time.time()
        wf = AP.wf_generate(pos, AP.NEG, seed, 1024, 1536, LORAS,
                            steps=args.steps, cfg=AP.CFG_DEFAULT, unet=UNET)
        img = Image.open(io.BytesIO(AP.run(wf))).convert("RGB")
        try:
            img = AP.upscale_to(img, 1500)
        except Exception as e:
            print("   超分跳过:", e)
        path = os.path.join(OUT, cid + ".png")
        img.save(path)
        files.append((cid, path))
        print("[%d/%d] %s  seed=%d  %.0fs" % (n, total, cid, seed, time.time() - t0), flush=True)

    sheet = build_contact_sheet(files)
    print("\n总表 →", os.path.relpath(sheet, ROOT))


if __name__ == "__main__":
    sys.exit(main())

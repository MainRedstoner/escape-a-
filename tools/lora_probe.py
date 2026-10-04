#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/lora_probe.py —— LoRA 权重对照

训练完先别急着批量出图：同一个 LoRA，权重 0.6 / 0.75 / 0.9 出来的东西差别很大——
低了不像本人，高了会僵化（姿势、表情都被拉回训练集）。这个脚本把几个权重并排出图，
肉眼选一个再开批量。

用法：
  python tools/lora_probe.py --who ds            # 小鲸：无LoRA / 0.6 / 0.75 / 0.9
  python tools/lora_probe.py --who cl --weights 0.5,0.7,0.85
产出：
  .train/probe/lora_<who>_<weight>.png  +  拼图 .train/probe/lora_<who>_sheet.png
"""

import argparse
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import hd_produce as HD  # noqa: E402

WHO = {
    "ds": dict(base=HD.DS_APPEAR, lora=HD.LORA_DS,
               pose="standing, front view, arms at sides, full body, eye level",
               face="expressionless, calm, half-closed eyes"),
    "cl": dict(base=HD.CL_APPEAR, lora=HD.LORA_CL,
               pose="standing, front view, arms at sides, full body, eye level",
               face="gentle expression, soft eyes"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="ds", choices=["ds", "cl"])
    ap.add_argument("--weights", default="0,0.6,0.75,0.9")
    ap.add_argument("--seed", type=int, default=77001)
    args = ap.parse_args()

    w = WHO[args.who]
    outdir = os.path.join(ROOT, ".train", "probe")
    os.makedirs(outdir, exist_ok=True)
    files = []
    for wt in [float(x) for x in args.weights.split(",")]:
        loras = [] if wt <= 0 else [(w["lora"], wt)]
        pos = "%s, %s, %s, %s" % (w["base"], w["face"], w["pose"], HD.POS_SPRITE)
        wf = HD.wf_generate(pos, HD.NEG, args.seed, 1024, 1536, loras)
        data = HD.run(wf)
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert("RGB")
        p = os.path.join(outdir, "lora_%s_%s.png" % (args.who, wt))
        im.save(p)
        files.append((wt, p))
        print("权重 %-5s → %s" % (wt, os.path.relpath(p, ROOT)), flush=True)

    from PIL import Image, ImageDraw
    tw, th = 420, 630
    sheet = Image.new("RGB", (len(files) * tw, th + 26), (12, 12, 14))
    d = ImageDraw.Draw(sheet)
    for i, (wt, p) in enumerate(files):
        im = Image.open(p).resize((tw, th), Image.LANCZOS)
        sheet.paste(im, (i * tw, 26))
        d.text((i * tw + 8, 6), ("无 LoRA" if wt <= 0 else "LoRA %.2f" % wt), fill=(225, 230, 240))
    out = os.path.join(outdir, "lora_%s_sheet.png" % args.who)
    sheet.save(out)
    print("拼图 →", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    sys.exit(main())

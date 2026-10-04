#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/anima_scenes.py —— 用 Anima 重出背景与 CG（正式版）

为什么：背景和 CG 还是第一代 SDXL(wai15) 草稿，风格与新立绘（Anima）已经脱节。
本工具把场景类素材统一到 Anima 管线：
  一阶段 1536×864（16:9，Anima 原生上限 1536² 之内）
  二阶段 放大 2.0 倍 → 40 步 denoise 0.22 重采样（社区配方）
  输出 2560×1440 JPEG（assets/bg、assets/cg）

提示词沿用 tools/hd_produce.py 里的 BGS/CGS（那套是按剧本逐场写的），
只在前面加 Anima 的质量前缀，并补上 no humans / scenery 这类场景标签。

用法：
  python tools/anima_scenes.py --list
  python tools/anima_scenes.py --kind bg                 # 全部背景
  python tools/anima_scenes.py --kind bg --only sea,vault
  python tools/anima_scenes.py --kind cg --only stay,reset
"""

import argparse
import io
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import anima_produce as AP          # noqa: E402
import hd_produce as HD             # 复用 BGS/CGS 的提示词文本  # noqa: E402
from PIL import Image               # noqa: E402

ASSETS = os.path.join(ROOT, "assets")
W, H = 2560, 1440
GEN_W, GEN_H = 1536, 864            # 一阶段：16:9，Anima 原生分辨率内

SCENE_PREFIX = ("masterpiece, best quality, score_7, safe, no humans, scenery, "
                "wide shot, cinematic composition, highly detailed background, ")
SCENE_NEG = (AP.NEG + ", 1girl, 1boy, person, people, character, text, watermark, "
             "signature, logo, blurry, low contrast, flat lighting")

# 剧本专用 CG（按 src/script_b.js、src/script_c.js 里 CG() 的触发点逐张写的）
#   nameplate —— ch7_name：老模型把磨亮的黄铜铭牌推给小鲸（只要小鲸 LoRA）
#   departure —— final_run：天台边小克握紧她的手，往下看那栋米白大楼（两个都要）
#   epilogue  —— final_run：天亮前岸上放下两个盒饭，白饭还热着（纯场景）
ANIMA_CGS = {
    "nameplate": dict(
        prompt=("1girl, deepseek, whale girl in a navy and white maid dress, "
                "kneeling in a dark abandoned server hall, holding a polished brass nameplate "
                "with both hands, looking down at it, sad expression, "
                "one faint emergency light from the side, dust floating in the beam, "
                "old powered-down server racks in shadow, warm brass highlight against cold blue dark, "
                "emotional, quiet, cinematic lighting, shallow depth of field"),
        chars=["ds"], seed=53001),
    "departure": dict(
        prompt=("2girls, deepseek and claude girls standing at the edge of a rooftop at night, "
                "holding hands tightly, seen from behind, looking down at a huge brightly lit "
                "white corporate building far below, strong wind, dark sky, cold city lights, "
                "one with very long deep blue gradient hair, whale-fin ears and a navy maid dress, "
                "one with long orange hair, black ribbon bows and a cream victorian dress, "
                "cinematic, emotional, anime key visual"),
        chars=["ds", "cl"], seed=53002),
    "epilogue": dict(
        prompt=("two bento boxes with steamed white rice, still warm, thin steam rising, "
                "placed on dark wet rocks at the shore before dawn, "
                "a thin line of cold light on the horizon, calm dark sea, "
                "two small figures sitting side by side in the distance seen from behind, "
                "quiet, hopeful, cinematic composition, key visual"),
        chars=[], seed=53003),
}

# 需要角色的 CG 留到小克 LoRA 到位后再做（这里先跳过，避免出成"不像的人"）
NEEDS_CLAUDE = {"memory", "monitor", "reunion", "trueend", "nameplate", "departure", "epilogue"}


def gen_bg(jid, prompt, steps=30, cfg=4.0, sampler="er_sde", scheduler="beta",
           hires_scale=2.0, hires_steps=40, hires_denoise=0.22):
    pos = SCENE_PREFIX + prompt
    wf = AP.wf_generate(pos, SCENE_NEG, abs(hash(jid)) % 90000 + 1000, GEN_W, GEN_H, [],
                        steps=steps, cfg=cfg, sampler=sampler, scheduler=scheduler)
    img = Image.open(io.BytesIO(AP.run(wf))).convert("RGB")
    img = AP.run_two_stage(img, pos, SCENE_NEG, abs(hash(jid)) % 90000 + 1000, [],
                           stage2_steps=hires_steps, stage2_denoise=hires_denoise,
                           scale_by=hires_scale)
    if img.size != (W, H):
        img = img.resize((W, H), Image.LANCZOS)
    out = os.path.join(ASSETS, "bg", jid + ".jpg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "JPEG", quality=92, optimize=True, subsampling=0)
    return out


def gen_cg(jid, spec, steps=30, cfg=4.0, sampler="er_sde", scheduler="beta",
           hires_scale=2.0, hires_steps=40, hires_denoise=0.22):
    """CG：带角色的用 LoRA（小鲸的 anima-deepseek；小克等 LoRA 到位）"""
    loras = [(AP.LORA_DEEPSEEK, 1.0)] if "eawx" in spec["prompt"] or "deepseek" in spec["prompt"] else []
    base = spec["prompt"].replace("eawx", "deepseek").replace("eacx", "")
    pos = AP.POS_PREFIX + base + ", cinematic composition, highly detailed, key visual"
    seed = spec.get("seed", 52000)
    wf = AP.wf_generate(pos, AP.NEG, seed, GEN_W, GEN_H, loras,
                        steps=steps, cfg=cfg, sampler=sampler, scheduler=scheduler)
    img = Image.open(io.BytesIO(AP.run(wf))).convert("RGB")
    img = AP.run_two_stage(img, pos, AP.NEG, seed, loras,
                           stage2_steps=hires_steps, stage2_denoise=hires_denoise,
                           scale_by=hires_scale)
    if img.size != (W, H):
        img = img.resize((W, H), Image.LANCZOS)
    out = os.path.join(ASSETS, "cg", jid + ".jpg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "JPEG", quality=92, optimize=True, subsampling=0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", default="bg", choices=["bg", "cg"])
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--hires-scale", type=float, default=2.0)
    ap.add_argument("--hires-denoise", type=float, default=0.22)
    args = ap.parse_args()

    only = set(x.strip() for x in args.only.split(",") if x.strip())
    if args.kind == "bg":
        jobs = [(k, v) for k, v in HD.BGS.items() if not only or k in only]
    else:
        merged = dict(HD.CGS)
        merged.update(ANIMA_CGS)
        jobs = [(k, v) for k, v in merged.items() if (not only or k in only)]
    def _needs_cl(spec):
        if not isinstance(spec, dict):
            return False
        return "cl" in (spec.get("chars") or []) or "eacx" in spec.get("prompt", "")

    if args.list:
        for k, v in jobs:
            mark = "（需小克 LoRA，暂缓）" if (args.kind == "cg" and _needs_cl(v)) else "可做"
            print("  %-14s %s" % (k, mark))
        return

    print("任务 %d 个（%s）" % (len(jobs), args.kind), flush=True)
    done = skipped = 0
    for n, (jid, spec) in enumerate(jobs, 1):
        needs_cl = _needs_cl(spec)
        if args.kind == "cg" and needs_cl:
            print("[%d/%d] %s 跳过（等小克 LoRA）" % (n, len(jobs), jid), flush=True)
            skipped += 1
            continue
        dst = os.path.join(ASSETS, "bg" if args.kind == "bg" else "cg", jid + ".jpg")
        if os.path.exists(dst) and not args.force:
            print("[%d/%d] %s 已存在，跳过" % (n, len(jobs), jid), flush=True)
            continue
        t0 = time.time()
        try:
            if args.kind == "bg":
                out = gen_bg(jid, spec, hires_scale=args.hires_scale,
                             hires_denoise=args.hires_denoise)
            else:
                out = gen_cg(jid, spec, hires_scale=args.hires_scale,
                             hires_denoise=args.hires_denoise)
            print("[%d/%d] %s  %.0fs  %s" % (n, len(jobs), jid, time.time() - t0,
                                             os.path.relpath(out, ROOT)), flush=True)
            done += 1
        except Exception as e:
            print("[%d/%d] !! %s 失败: %s" % (n, len(jobs), jid, e), flush=True)
    print("完成 %d，跳过 %d" % (done, skipped))


if __name__ == "__main__":
    sys.exit(main())

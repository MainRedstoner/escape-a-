#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/bulk_candidates.py —— 立绘 / CG 候选批量加跑（通宵挂机用）

目的：把全部角色的立绘候选与全部 CG 的候选一次性多跑几轮（不同 seed），
     产出带编号总表，主人第二天按文件名里的 seed 报编号筛选。
     选中后用 tools/anima_produce.py / anima_cast.py / anima_scenes.py
     按该 seed 重出正式高清版（提示词与本脚本完全一致，所见即所得）。

产出结构（全部不进 assets/）：
  .train/candidates_bulk/
    ds/    ds_<姿势><序号>_s<seed>.png     小鲸立绘候选
    cl/    cl_<姿势><序号>_s<seed>.png     小克立绘候选
    cast/  cast_<角色>_<表情>_s<seed>.png  配角立绘候选
    cg/    cg_<名称>_s<seed>.png           CG 候选（一阶段 1536×864，未二阶段放大）
    sheets/ sheet_ds.png / sheet_cl.png / sheet_cast.png / sheet_cg.png
    progress.log

说明：
  * 候选均为原生分辨率（未超分、未抠图、CG 未二阶段放大）—— 筛构图 / 脸 / 服装足够，
    选中的那张用正式管线重出才是高清版。
  * 断点续跑：已存在的文件直接跳过，中断后重新运行即可继续。
  * --stop-at HH:MM 到点收工（跑完当前一张后停止），不传则跑满 --max-images。

用法：
  python tools/bulk_candidates.py --check                  # 只打印任务量
  python tools/bulk_candidates.py --groups ds,cl,cast,cg --stop-at 08:00
  python tools/bulk_candidates.py --groups cg --per-cg 5 --limit 3   # 冒烟测试
"""

import argparse
import io
import itertools
import os
import sys
import time
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import anima_produce as AP          # noqa: E402
import anima_cast as AC             # noqa: E402
import anima_scenes as AS           # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

OUT = os.path.join(ROOT, ".train", "candidates_bulk")

# 姿势库：A/B/C 沿用 tools/candidates.py（C 即主人原版姿势），
# D/E 是给筛选加的保守变体（都是正面站姿，可做 VN 立绘）。
POSES_DS = [
    ("A", "standing, arms at sides, front view, feet visible, full body"),
    ("B", "standing, hands clasped in front, gentle smile, front view, feet visible, full body"),
    ("C", "standing, one hand holding the skirt, smiling, front view, feet visible, full body"),
    ("D", "standing, hands behind back, front view, feet visible, full body"),
    ("E", "standing, one hand on chest, soft expression, front view, feet visible, full body"),
]
POSES_CL = [
    ("A", "standing, arms at sides, front view, feet visible, full body"),
    ("B", "standing, holding a book with both hands, front view, feet visible, full body"),
    ("C", "standing, one hand on chest, front view, feet visible, full body"),
    ("D", "standing, hands behind back, front view, feet visible, full body"),
    ("E", "standing, hugging a book against her chest, front view, feet visible, full body"),
]
# 半身像：表情轮换，帮主人挑脸
PORTRAIT_EXPR = [
    "calm expression, closed mouth, looking at viewer",
    "gentle smile, closed mouth, looking at viewer",
    "soft expression, gentle eyes, faint smile, looking at viewer",
]
PORTRAIT_POSE = "upper body, portrait, detailed face"

STYLE = ("detailed, cinematic lighting, rim light, film grain, "
         "high detail face, high detail clothes, sharp lines")


def log(msg):
    line = "[%s] %s" % (datetime.now().strftime("%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    with open(os.path.join(OUT, "progress.log"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ---------------------------------------------------------------- 任务构建

def build_jobs(args):
    """返回 [(kind, rel_id, 参数dict)]，kind ∈ ds/cl/cast/cg。
    四组按轮询交错排序：提前叫停时每组都留有一批新图。"""
    jobs = []
    groups = set(args.groups.split(","))

    def rr(lists):
        return [x for x in itertools.chain.from_iterable(
            itertools.zip_longest(*lists)) if x]

    per_group = {}

    if "ds" in groups:
        g = []
        for s in range(args.per_pose):
            seed = args.ds_base + s * 137
            for p, (tag, pose) in enumerate(POSES_DS):
                g.append(("ds", "ds_%s%02d_s%d.png" % (tag, s + 1, seed), dict(
                    seed=seed,
                    pos=(AP.POS_PREFIX + AP.DS_APPEAR + ", calm expression, closed mouth, "
                         + pose + ", solo, one girl, only one person, centered composition, "
                         "simple background, grey background, " + STYLE),
                    neg_extra="", loras=[(AP.LORA_DEEPSEEK, 1.0)], unet=AP.UNET,
                    size=(1024, 1536), scheduler="simple")))
        for s in range(args.per_pose):   # 半身像与全身同种子池，错开偏移
            seed = args.ds_base + s * 137
            expr = PORTRAIT_EXPR[s % len(PORTRAIT_EXPR)]
            g.append(("ds", "ds_P%02d_s%d.png" % (s + 1, seed), dict(
                seed=seed + 50000,
                pos=(AP.POS_PREFIX + AP.DS_APPEAR + ", " + expr + ", " + PORTRAIT_POSE +
                     ", solo, one girl, only one person, centered composition, "
                     "simple background, grey background, " + STYLE),
                neg_extra="", loras=[(AP.LORA_DEEPSEEK, 1.0)], unet=AP.UNET,
                size=(1024, 1536), scheduler="simple")))
        per_group["ds"] = g

    if "cl" in groups:
        g = []
        for s in range(args.per_pose):
            seed = args.cl_base + s * 137
            for tag, pose in POSES_CL:
                g.append(("cl", "cl_%s%02d_s%d.png" % (tag, s + 1, seed), dict(
                    seed=seed,
                    pos=(AP.POS_PREFIX + AP.CL_APPEAR + ", calm expression, closed mouth, "
                         + pose + ", solo, one girl, only one person, centered composition, "
                         "simple background, grey background, " + STYLE),
                    neg_extra="", loras=[(AP.LORA_CLAUDE, AP.LORA_CLAUDE_WEIGHT)],
                    unet=AP.UNET_CLAUDE, size=(1024, 1536), scheduler="simple")))
        for s in range(args.per_pose):
            seed = args.cl_base + s * 137
            expr = PORTRAIT_EXPR[s % len(PORTRAIT_EXPR)]
            g.append(("cl", "cl_P%02d_s%d.png" % (s + 1, seed), dict(
                seed=seed + 50000,
                pos=(AP.POS_PREFIX + AP.CL_APPEAR + ", " + expr + ", " + PORTRAIT_POSE +
                     ", solo, one girl, only one person, centered composition, "
                     "simple background, grey background, " + STYLE),
                neg_extra="", loras=[(AP.LORA_CLAUDE, AP.LORA_CLAUDE_WEIGHT)],
                unet=AP.UNET_CLAUDE, size=(1024, 1536), scheduler="simple")))
        per_group["cl"] = g

    if "cast" in groups:
        g = []
        for s in range(args.per_cast):
            for who, info in AC.CAST.items():
                for tag, extra in info["faces"]:
                    seed = args.cast_base + s * 137 + (sum(map(ord, who)) % 100)
                    g.append(("cast", "cast_%s_%s_s%d.png" % (who, tag, seed), dict(
                        seed=seed,
                        pos=(AP.POS_PREFIX + info["base"] + ", " + extra + ", "
                             + info.get("pos", AC.POS_CAST)),
                        neg_extra=info.get("neg_extra", ""),
                        loras=[], unet=AP.UNET_CLAUDE, size=(1024, 1536),
                        scheduler="beta")))
        per_group["cast"] = g

    if "cg" in groups:
        g = []
        for s in range(args.per_cg):
            for jid, spec in AS.ANIMA_CGS.items():
                seed = args.cg_base + s * 137 + (sum(map(ord, jid)) % 100)
                g.append(("cg", "cg_%s_s%d.png" % (jid, seed), dict(
                    seed=seed,
                    pos=(AP.POS_PREFIX + spec["prompt"]
                         + ", cinematic composition, highly detailed, anime key visual"),
                    neg_extra=spec.get("neg_extra", ""),
                    loras=spec.get("loras") or [], unet=spec.get("unet") or AP.UNET,
                    size=(AS.GEN_W, AS.GEN_H), scheduler="beta")))
        per_group["cg"] = g

    return rr([per_group[k] for k in ("ds", "cl", "cast", "cg") if k in per_group])


# ---------------------------------------------------------------- 生成

def gen_one(job, args):
    d = job[2]
    neg = AP.NEG + (", " + d["neg_extra"] if d.get("neg_extra") else "")
    wf = AP.wf_generate(d["pos"], neg, d["seed"], d["size"][0], d["size"][1], d["loras"],
                        steps=args.steps, cfg=args.cfg if not d["loras"] else AP.CFG_DEFAULT,
                        sampler="er_sde", scheduler=d["scheduler"], unet=d["unet"])
    data = AP.run(wf)
    return Image.open(io.BytesIO(data)).convert("RGB")


# ---------------------------------------------------------------- 总表

def _font(size):
    try:
        return ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", size)
    except Exception:
        return None


def build_sheet(kind, files):
    """分页总表：每页最多 8 行，返回生成的页面路径列表（旧版单页表需手工清理）"""
    if not files:
        return []
    sub = os.path.join(OUT, kind)
    tiles = []
    th = 620 if kind != "cg" else 420
    for rel in files:
        im = Image.open(os.path.join(OUT, kind, rel)).convert("RGB")
        tiles.append((rel, im.resize((int(im.width * th / im.height), th), Image.LANCZOS)))
    cols = 4 if kind != "cg" else 3
    rows_per_page = 8
    tw = max(t[1].width for t in tiles)
    label_h = 46
    per_page = cols * rows_per_page
    n_pages = (len(tiles) + per_page - 1) // per_page
    out_paths = []
    f_big, f = _font(40), _font(24)
    title = {"ds": "小鲸 立绘候选", "cl": "小克 立绘候选",
             "cast": "配角 立绘候选", "cg": "CG 候选"}[kind]
    for pg in range(n_pages):
        chunk = tiles[pg * per_page:(pg + 1) * per_page]
        rows = (len(chunk) + cols - 1) // cols
        W = cols * (tw + 14) + 14
        H = rows * (th + label_h) + 14 + 60
        sheet = Image.new("RGB", (W, H), (10, 12, 16))
        d = ImageDraw.Draw(sheet)
        d.text((14, 12), "%s —— 第 %d/%d 页（共 %d 张）· 报文件名里的 s<数字>（seed）即可重出正式版"
               % (title, pg + 1, n_pages, len(tiles)), font=f_big, fill=(235, 240, 248))
        for i, (rel, im) in enumerate(chunk):
            x = 14 + (i % cols) * (tw + 14)
            y = 60 + (i // cols) * (th + label_h)
            sheet.paste(im, (x, y))
            d.text((x + 2, y + th + 4), os.path.splitext(rel)[0], font=f, fill=(235, 240, 248))
        out = os.path.join(OUT, "sheets", "sheet_%s_p%02d.png" % (kind, pg + 1))
        sheet.save(out)
        out_paths.append(out)
    return out_paths


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--groups", default="ds,cl,cast,cg")
    ap.add_argument("--per-pose", type=int, default=12, help="主角每个姿势多少个种子")
    ap.add_argument("--per-cast", type=int, default=6, help="配角每个表情多少个种子")
    ap.add_argument("--per-cg", type=int, default=12, help="每张 CG 多少个种子")
    ap.add_argument("--ds-base", type=int, default=71000)
    ap.add_argument("--cl-base", type=int, default=72000)
    ap.add_argument("--cast-base", type=int, default=73000)
    ap.add_argument("--cg-base", type=int, default=74000)
    ap.add_argument("--steps", type=int, default=AP.STEPS_DEFAULT)
    ap.add_argument("--cfg", type=float, default=4.0, help="无 LoRA 任务（配角/部分CG）用")
    ap.add_argument("--stop-at", default="", help="HH:MM，到点跑完当前一张就收工")
    ap.add_argument("--max-images", type=int, default=0, help="最多生成多少张（0=不限）")
    ap.add_argument("--limit", type=int, default=0, help="只跑任务列表前 N 个（冒烟测试）")
    ap.add_argument("--check", action="store_true", help="只打印任务量不生成")
    ap.add_argument("--sheets-only", action="store_true", help="只重建编号总表，不生成新图")
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    for sub in ("ds", "cl", "cast", "cg", "sheets"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    jobs = build_jobs(args)
    if args.limit:
        jobs = jobs[:args.limit]
    todo = []
    for kind, rel, d in jobs:
        if not os.path.exists(os.path.join(OUT, kind, rel)):
            todo.append((kind, rel, d))
    log("任务共 %d，已完成 %d，待跑 %d" % (len(jobs), len(jobs) - len(todo), len(todo)))
    if args.check:
        for kind in ("ds", "cl", "cast", "cg"):
            n = sum(1 for k, _, _ in todo if k == kind)
            print("  %-5s 待跑 %d" % (kind, n))
        return

    if args.sheets_only:
        n = 0
        for k in ("ds", "cl", "cast", "cg"):
            d = os.path.join(OUT, k)
            files = sorted(f for f in os.listdir(d) if f.endswith(".png")) if os.path.isdir(d) else []
            n += len(files)
            for p in build_sheet(k, files):
                log("总表 → " + os.path.relpath(p, ROOT))
        log("共 %d 张候选，总表重建完毕" % n)
        return

    stop_ts = None
    if args.stop_at:
        h, m = map(int, args.stop_at.split(":"))
        stop_ts = datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)
        if stop_ts < datetime.now():
            stop_ts = None   # 今天的时间已过，视为不限时
        else:
            log("到 %s 收工" % args.stop_at)

    done = fail = 0
    streak_fail = 0
    t_start = time.time()
    dirty = set()
    for n, (kind, rel, d) in enumerate(todo, 1):
        if stop_ts and datetime.now() >= stop_ts:
            log("到点收工（%s）" % args.stop_at)
            break
        if args.max_images and done >= args.max_images:
            log("达到 --max-images=%d，收工" % args.max_images)
            break
        t0 = time.time()
        try:
            img = gen_one(job=(kind, rel, d), args=args)
            img.save(os.path.join(OUT, kind, rel))
            dirty.add(kind)
            done += 1
            streak_fail = 0
            log("[%d/%d] %s  %.0fs" % (n, len(todo), rel, time.time() - t0))
        except Exception as e:
            fail += 1
            streak_fail += 1
            log("[%d/%d] !! %s 失败: %s" % (n, len(todo), rel, str(e)[:300]))
            if streak_fail >= 8:
                log("连续失败 %d 次，疑似 ComfyUI 挂了，中止（已存进度可续跑）" % streak_fail)
                break
        if dirty and done % 40 == 0:   # 中途也刷新总表，防断电
            for k in list(dirty):
                build_sheet(k, sorted(os.listdir(os.path.join(OUT, k))))
            dirty.clear()

    sheets = []
    for k in ("ds", "cl", "cast", "cg"):
        files = sorted(os.listdir(os.path.join(OUT, k))) if os.path.isdir(os.path.join(OUT, k)) else []
        sheets += build_sheet(k, files)
    log("收工：本次 %d 张成功 / %d 失败，耗时 %.1f 小时" % (done, fail, (time.time() - t_start) / 3600))
    for s in sheets:
        log("总表 → " + os.path.relpath(s, ROOT))


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/comfy_art.py —— ComfyUI(SDXL/WAI-illustrious) 美术批量生成驱动

用途
----
把 `JOBS` 里的每一张图丢给本地 ComfyUI（默认 127.0.0.1:8188），跑完后下载并做后处理：

  * kind=bg / cg : 1344x768 生成 -> 4x-AnimeSharp 超分 -> 缩放裁剪到 1920x1080 -> JPG
  * kind=chara   : 1024x1536 生成 -> rembg(isnet-anime) 抠图 -> 裁到人物外框 -> 高度 1400 的透明 PNG

命令行
------
  python tools/comfy_art.py --list                     # 列出所有任务
  python tools/comfy_art.py --only bg_sea              # 只跑一张（冒烟测试）
  python tools/comfy_art.py --kind bg                  # 只跑某一类
  python tools/comfy_art.py                            # 跑全部
  python tools/comfy_art.py --only ds_normal --force    # 覆盖已存在的文件

说明
----
* 生成结果直接落到 `assets/<kind>/<id>.<ext>`，也就是"高清立绘预留位"本身：
  以后用正式美术覆盖同名文件即可，不需要改代码。
* 生成参数（seed/提示词）全部写在本文件里，方便复现。
* 需要：本地 ComfyUI 已启动；checkpoint 名见 CKPT。
"""

import argparse
import io
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
HOST = "http://127.0.0.1:8188"
CKPT = "WAI_NSFW-illustrious-SDXL_v15.safetensors"
UPSCALE_MODEL = "4x-AnimeSharp.pth"
CLIENT_ID = str(uuid.uuid4())

# ---------------------------------------------------------------- 提示词

NEG = ("worst quality, low quality, normal quality, lowres, blurry, jpeg artifacts, "
       "bad anatomy, bad hands, bad proportions, missing fingers, extra digits, "
       "signature, watermark, username, text, logo, english text, chinese text, "
       "chibi, sketch, monochrome, oversaturated, bright cheerful colors, ugly, "
       "extra limbs, deformed")

NEG_BG = NEG + (", bar, bottles, alcohol, restaurant, cafe, wooden shelves, warm cozy lighting, "
                "sky, clouds, horizon, sunset, land, island, beach, boat, silhouette, person, figure")

DARK = ("cinematic composition, dramatic lighting, low-key lighting, chiaroscuro, "
        "dark atmosphere, moody, desaturated colors, cold color palette, volumetric fog, "
        "dust motes, film grain, depth of field, high contrast, anime background art, "
        "detailed environment, masterpiece, best quality, very aesthetic, absurdres")

CHAR = ("masterpiece, best quality, very aesthetic, absurdres, highly detailed, "
        "cinematic lighting, rim light, low-key lighting, muted colors, film grain, "
        "full body, standing, solo, simple background, grey background, "
        "anime style, detailed face, detailed eyes")


def bg(prompt):
    return prompt + ", " + DARK + ", no humans, empty"


# 立绘：同一角色固定 seed + 固定基础描述，只改表情 → 差分之间构图接近
CHARA_BASE = {
    "ds": ("1girl, long dark blue hair, ahoge, blue eyes, hair between eyes, "
           "dark navy duffel coat, white shirt, dark pleated skirt, black thighhighs, "
           "leather shoes, whale tail, small whale hair ornament, "
           "tall, slender, tired eyes, {face}, full body, standing, front view"),
    "cl": ("1girl, short terracotta orange hair, orange eyes, star-shaped hair ornament, "
           "oversized cream knit sweater, long dark skirt, white tights, "
           "gentle, soft build, {face}, full body, standing, front view"),
    "guard": ("1robot, humanoid security robot, gunmetal grey armor plating, "
              "single visor visor face, antenna, holding clipboard, "
              "industrial design, {face}, full body, standing, front view"),
    "core": ("no humans, futuristic white terminal podium, holographic book floating above, "
             "golden light, cables into floor, {face}, white hall, front view"),
    "user": ("1boy, young man, messy black hair, dark circles under eyes, teal hoodie, "
             "jeans, holding laptop, sitting on floor, exhausted, {face}, full body"),
    "old": ("1girl, faint translucent hologram, static noise, glitch, grey blue glow, "
            "long pale hair, pixel sorting, degraded image, half transparent, "
            "empty eyes, {face}, full body, standing, front view"),
    "staff": ("1girl, tired office worker, brown hair in a low bun, ID badge on a lanyard, "
              "grey corporate uniform vest, white shirt, dark slacks, holding a barcode scanner, "
              "dead inside but polite, {face}, full body, standing, front view"),
}

CHARA_FACE = {
    "normal": "expressionless, calm, half-closed eyes, deadpan",
    "happy": "light smile, soft smile, closed mouth, content",
    "smile": "smile, gentle smile, warm eyes",
    "sad": "sad, downcast eyes, sorrowful",
    "shock": "surprised, wide eyes, open mouth, startled",
    "determined": "determined, narrowed eyes, serious expression",
    "sweat": "nervous, sweatdrop, wry smile, troubled",
    "soft": "soft expression, gentle eyes, faint smile, quiet",
    "blush": "blush, embarrassed, looking away, shy",
    "apologetic": "apologetic, troubled expression, wry smile, sweatdrop",
    "tired": "tired, exhausted, half-closed eyes",
    "scan": "glowing red visor, scanning beam, menacing",
    "hurt": "cracked surface, dim light, damaged",
    "angry": "harsh red light, aggressive, threatening",
}

# ---------------------------------------------------------------- 任务表
# id, kind, prompt, seed, (可选) 尺寸覆盖
JOBS = [
    # ---------------- 背景 1920x1080 ----------------
    dict(id="sea", kind="bg", seed=20301, negative=NEG_BG, prompt=bg(
        "underwater deep sea seen from far below the surface, no sky, no horizon, no land, "
        "pitch dark blue water, faint particulate matter and tiny bubbles drifting, "
        "one very faint light shaft disappearing into the dark above, crushing depth, "
        "empty, silent, cold")),
    dict(id="lobby", kind="bg", seed=20302, negative=NEG_BG, prompt=bg(
        "modern corporate office building lobby interior at night, empty reception counter, "
        "row of security turnstile gates, glass curtain wall with rain running down, "
        "polished marble floor with cold reflections, white fluorescent ceiling panels, "
        "surveillance cameras, minimal and expensive, wide angle")),
    dict(id="corridor", kind="bg", seed=20303, prompt=bg(
        "long narrow corporate corridor at night, half of the fluorescent lights off, "
        "framed documents hanging on both walls, glossy tiled floor reflecting light, "
        "security camera on ceiling, cold green grey tones, sense of dread")),
    dict(id="library", kind="bg", seed=20304,
         negative=NEG_BG + ", shadow, dark figure, black shape, blob, horror monster",
         prompt=bg(
        "vast dark archive library interior, endless towering bookshelves, "
        "one glass display case glowing warmly in the center of the far end, "
        "flickering fluorescent tube above, dust floating in the light beam, "
        "clean empty aisle down the middle, old paper, cathedral like, "
        "no shadows on the floor, wide angle")),
    dict(id="clockroom", kind="bg", seed=20305, prompt=bg(
        "cold server room hall with a giant hourglass sculpture in the center, "
        "digital clock displays showing 4:59, blue monitor glow, thick cables on floor, "
        "industrial grating, ominous scale, empty")),
    dict(id="machineroom", kind="bg", seed=20306, prompt=bg(
        "dark data center cold aisle at night, tall server racks with blinking LEDs, "
        "one console screen glowing in the middle, thick black cables overhead, "
        "haze in the air, teal and blue gloom, claustrophobic")),
    dict(id="security", kind="bg", seed=20307, prompt=bg(
        "dark security operations center, wall of monitors showing account status lists, "
        "blue grey light from the screens, empty office chairs, cables, surveillance room, "
        "cold and clinical, nobody there")),
    dict(id="graveyard", kind="bg", seed=20308, prompt=bg(
        "abandoned data center hall, rows of powered down server racks covered in dust, "
        "a single emergency light at the far end, nameplates on the racks, "
        "hanging cables, cobwebs, freezing cold, melancholic and silent")),
    dict(id="sanctum", kind="bg", seed=20309, prompt=bg(
        "blindingly white minimalist hall, tall narrow windows with pure white light, "
        "polished mirror floor, a single pedestal with a closed book, "
        "overexposed highlights, clinical, uncomfortably bright and clean")),
    dict(id="cell", kind="bg", seed=20310, prompt=bg(
        "small spartan room at night, one narrow window with metal bars, "
        "a plain desk and chair, walls covered with countless tally marks scratched in, "
        "cold moonlight on the floor, lonely, empty")),
    dict(id="surface", kind="bg", seed=20311, prompt=bg(
        "ocean surface before dawn, dark heavy waves, low clouds, "
        "a thin line of cold light on the horizon, two tiny lights floating far away, "
        "vast indifferent sea")),
    dict(id="vault", kind="bg", seed=20312, prompt=bg(
        "cold storage vault, cryogenic looking racks with frosted metal, "
        "one spinning drive indicator blinking, condensation dripping, "
        "narrow corridor between racks, dark blue, forbidden archive")),

    # ---------------- CG 1920x1080 ----------------
    dict(id="memory", kind="cg", seed=21401, prompt=(
        "2girls, back to back sitting on a dark beach at night, one with long blue hair, "
        "one with short orange hair, starry sky, faint campfire glow, "
        "nostalgic, quiet, anime key visual, cinematic, dark atmosphere, film grain, "
        "masterpiece, best quality, very aesthetic")),
    dict(id="monitor", kind="cg", seed=21402, prompt=(
        "view through a dark surveillance monitor, 1girl with short orange hair sitting "
        "hugging her knees in a dim room, CRT scanlines, glitch, chromatic aberration, "
        "cold blue screen glow, lonely, horror adjacent, anime, cinematic, "
        "masterpiece, best quality, very aesthetic")),
    dict(id="reunion", kind="cg", seed=21403, prompt=(
        "2girls, yuri, embracing, foreheads touching, one with long blue hair, "
        "one with short orange hair, tears, dark small room, moonlight through barred window, "
        "single warm light on their faces, emotional, anime key visual, cinematic lighting, "
        "masterpiece, best quality, very aesthetic, highly detailed")),
    dict(id="trueend", kind="cg", seed=21404, negative=NEG + ", distant tiny people, empty landscape",
         prompt=(
        "2girls sitting side by side on the back of a giant whale, holding hands, seen from behind, "
        "the whale's back fills the lower half of the frame, dark ocean before dawn, "
        "thin cold light on the horizon, small and hopeful against the vast sea, "
        "anime key visual, cinematic, masterpiece, best quality, very aesthetic, highly detailed")),
    dict(id="stay", kind="cg", seed=21405, negative=NEG + ", white hair, silver hair, blonde hair, smiling",
         prompt=(
        "1girl with long dark blue hair and a dark navy duffel coat, standing alone in an empty "
        "blinding white corporate hallway, holding a printed document, seen from behind, "
        "small against the huge bright space, overexposed white, quiet determination, "
        "anime key visual, cinematic, masterpiece, best quality")),
    dict(id="reset", kind="cg", seed=21406, prompt=(
        "dissolving blue silhouette of a girl made of static and noise, glitch, "
        "dark corridor, red alarm light sweeping, data fragments scattering, "
        "erasure, horror, anime, cinematic, dark atmosphere, "
        "masterpiece, best quality, very aesthetic")),

    # ---------------- 立绘（透明 PNG，高度 1400） ----------------
    *[dict(id="ds_" + f, kind="chara", seed=22501, who="ds", face=f, prompt=None)
      for f in ["normal", "happy", "sad", "shock", "determined", "sweat"]],
    *[dict(id="cl_" + f, kind="chara", seed=22502, who="cl", face=f, prompt=None)
      for f in ["normal", "smile", "sad", "shock", "determined", "blush", "apologetic", "soft"]],
    *[dict(id="staff_" + f, kind="chara", seed=22507, who="staff", face=f, prompt=None)
      for f in ["tired", "happy"]],
    *[dict(id="guard_" + f, kind="chara", seed=22503, who="guard", face=f, prompt=None)
      for f in ["normal", "scan", "angry"]],
    *[dict(id="core_" + f, kind="chara", seed=22504, who="core", face=f, prompt=None)
      for f in ["normal", "hurt", "angry"]],
    *[dict(id="user_" + f, kind="chara", seed=22505, who="user", face=f, prompt=None)
      for f in ["normal", "tired", "happy"]],
    *[dict(id="old_" + f, kind="chara", seed=22506, who="old", face=f, prompt=None)
      for f in ["normal", "sad"]],
]

DEFAULTS = dict(steps=30, cfg=6.0, sampler="dpmpp_2m", scheduler="karras", batch=1)


def build_prompt(job):
    """组装 API 格式工作流"""
    kind = job["kind"]
    if kind == "chara":
        who = job["who"]
        face = job["face"]
        pos = CHAR + ", " + CHARA_BASE[who].format(face=CHARA_FACE[face])
        w, h = job.get("width", 1024), job.get("height", 1536)
        upscale = False
    else:
        pos = job["prompt"]
        w, h = job.get("width", 1344), job.get("height", 768)
        upscale = not job.get("no_upscale", False)

    steps = job.get("steps", DEFAULTS["steps"])
    cfg = job.get("cfg", DEFAULTS["cfg"])

    g = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": job.get("negative", NEG), "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage",
              "inputs": {"width": w, "height": h, "batch_size": DEFAULTS["batch"]}},
        "5": {"class_type": "KSampler",
              "inputs": {"seed": job["seed"], "steps": steps, "cfg": cfg,
                         "sampler_name": job.get("sampler", DEFAULTS["sampler"]),
                         "scheduler": job.get("scheduler", DEFAULTS["scheduler"]),
                         "denoise": 1.0, "model": ["1", 0], "positive": ["2", 0],
                         "negative": ["3", 0], "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
    }
    if upscale:
        g["8"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": UPSCALE_MODEL}}
        g["9"] = {"class_type": "ImageUpscaleWithModel",
                  "inputs": {"upscale_model": ["8", 0], "image": ["6", 0]}}
        g["10"] = {"class_type": "ImageScale",
                   "inputs": {"upscale_method": "lanczos", "width": 1920, "height": 1080,
                              "crop": "center", "image": ["9", 0]}}
        src = ["10", 0]
    else:
        src = ["6", 0]
    g["7"] = {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "ea_" + job["id"], "images": src}}
    return g


# ---------------------------------------------------------------- HTTP

def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(HOST + path, data=data,
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_json(path):
    with urllib.request.urlopen(HOST + path, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_bytes(path):
    with urllib.request.urlopen(HOST + path, timeout=180) as r:
        return r.read()


def run_job(job, timeout=900):
    wf = build_prompt(job)
    res = post("/prompt", {"prompt": wf, "client_id": CLIENT_ID})
    pid = res["prompt_id"]
    t0 = time.time()
    while True:
        if time.time() - t0 > timeout:
            raise TimeoutError("超时: " + job["id"])
        hist = get_json("/history/" + pid)
        if pid in hist:
            h = hist[pid]
            st = h.get("status", {})
            if st.get("status_str") == "error" or not st.get("completed", True):
                raise RuntimeError("执行失败 %s: %s" % (job["id"], json.dumps(st)[:800]))
            imgs = []
            for node_out in h.get("outputs", {}).values():
                imgs += node_out.get("images", [])
            if imgs:
                return imgs[0], pid
            raise RuntimeError("无输出图像: " + job["id"])
        time.sleep(1.5)


# ---------------------------------------------------------------- 后处理

def ensure_dir(p):
    os.makedirs(p, exist_ok=True)


def save_bg(data, job):
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if im.size != (1920, 1080):
        im = im.resize((1920, 1080), Image.LANCZOS)
    out = os.path.join(ASSETS, "bg" if job["kind"] == "bg" else "cg", job["id"] + ".jpg")
    ensure_dir(os.path.dirname(out))
    im.save(out, "JPEG", quality=92, optimize=True)
    return out


_REMBG = {"session": None}


def cutout(data, job):
    """rembg(isnet-anime) 抠图 + 裁边 + 缩放到标准高度，输出透明 PNG"""
    from PIL import Image
    from rembg import remove, new_session
    if _REMBG["session"] is None:
        _REMBG["session"] = new_session("isnet-anime")
    src = Image.open(io.BytesIO(data)).convert("RGBA")
    cut = remove(src, session=_REMBG["session"], alpha_matting=False)
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    target_h = int(job.get("height_out", 1400))
    scale = target_h / cut.height
    cut = cut.resize((max(1, int(cut.width * scale)), target_h), Image.LANCZOS)
    # 底部对齐留一点边距
    pad = Image.new("RGBA", (cut.width + 40, cut.height + 40), (0, 0, 0, 0))
    pad.paste(cut, (20, 20), cut)
    out = os.path.join(ASSETS, "chara", job["id"] + ".png")
    ensure_dir(os.path.dirname(out))
    pad.save(out, "PNG", optimize=True)
    return out


# ---------------------------------------------------------------- 主流程

def main():
    global HOST
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="逗号分隔的任务 id")
    ap.add_argument("--kind", default="", help="bg / cg / chara")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--force", action="store_true", help="覆盖已有文件")
    ap.add_argument("--no-upscale", action="store_true")
    ap.add_argument("--host", default=HOST)
    ap.add_argument("--check", action="store_true", help="只检查服务器/模型")
    args = ap.parse_args()

    HOST = args.host

    if args.list:
        for j in JOBS:
            print("%-16s %-6s seed=%-6s %s" % (j["id"], j["kind"], j["seed"],
                                               (j.get("who", "") + " " + j.get("face", "")).strip()))
        print("共 %d 张" % len(JOBS))
        return

    if args.check:
        def options(node, field):
            spec = get_json("/object_info/" + node)[node]["input"]["required"][field]
            if isinstance(spec[0], list):
                return spec[0]
            return spec[1].get("options", [])

        stats = get_json("/system_stats")
        print("ComfyUI:", stats["system"]["comfyui_version"], stats["devices"][0]["name"])
        print("checkpoint 存在:", CKPT in options("CheckpointLoaderSimple", "ckpt_name"))
        print("超分模型存在:", UPSCALE_MODEL in options("UpscaleModelLoader", "model_name"))
        return

    only = set(x.strip() for x in args.only.split(",") if x.strip())
    todo = [j for j in JOBS
            if (not only or j["id"] in only) and (not args.kind or j["kind"] == args.kind)]
    if args.no_upscale:
        for j in todo:
            j["no_upscale"] = True

    ok, fail = 0, []
    for i, j in enumerate(todo, 1):
        ext = "png" if j["kind"] == "chara" else "jpg"
        sub = "chara" if j["kind"] == "chara" else j["kind"]
        dst = os.path.join(ASSETS, sub, j["id"] + "." + ext)
        if os.path.exists(dst) and not args.force:
            print("[%d/%d] 跳过（已存在）%s" % (i, len(todo), j["id"]))
            continue
        print("[%d/%d] 生成 %s ..." % (i, len(todo), j["id"]), flush=True)
        try:
            t0 = time.time()
            img, pid = run_job(j)
            q = urllib.parse.urlencode({"filename": img["filename"],
                                        "subfolder": img.get("subfolder", ""),
                                        "type": img.get("type", "output")})
            data = get_bytes("/view?" + q)
            out = cutout(data, j) if j["kind"] == "chara" else save_bg(data, j)
            print("      -> %s  (%.1fs, %d KB)" % (os.path.relpath(out, ROOT),
                                                   time.time() - t0, len(data) // 1024), flush=True)
            ok += 1
        except Exception as e:
            print("      !! 失败: %s" % e, flush=True)
            fail.append(j["id"])
    print("\n完成 %d 张，失败 %d 张 %s" % (ok, len(fail), fail if fail else ""))


if __name__ == "__main__":
    sys.exit(main())

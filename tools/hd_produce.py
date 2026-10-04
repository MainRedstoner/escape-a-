#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/hd_produce.py —— 正式版美术生产管线（HD）

相比草稿阶段（tools/comfy_art.py）多了四件事：
  1. 角色 LoRA：两个主角各一个，双人 CG 时叠加使用；
  2. hires 二次采样：潜变量 ×1.5 后再低 denoise 重采样一遍，细节是真的长出来的，
     不是把小图放大；
  3. 局部重绘：YOLO 检出人脸/手 → 裁切放大 → 低 denoise img2img → 羽化贴回
     （脸和手是动漫图里最容易被一眼看出问题的地方）；
  4. 交付规格：立绘 1600×2400 透明 PNG，背景 / CG 2560×1440 JPEG。

用法：
  python tools/hd_produce.py --list
  python tools/hd_produce.py --kind bg                    # 只出背景
  python tools/hd_produce.py --only ds_normal --force     # 单张
  python tools/hd_produce.py --no-lora                    # 不挂 LoRA（管线自检用）
"""

import argparse
import io
import json
import os
import time
import urllib.parse
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
HOST = "http://127.0.0.1:8188"
CKPT = "WAI_NSFW-illustrious-SDXL_v15.safetensors"
UPSCALE_MODEL = "4x-AnimeSharp.pth"
YOLO_DIR = r"D:\AI_Tools\AIP\ComfyUI-V9.5\models\yolo"
LORA_DS = "ea_whale_v1.safetensors"
LORA_CL = "ea_claude_v1.safetensors"
CLIENT_ID = str(uuid.uuid4())

# 交付规格
CHARA_H = 2400           # 立绘高度
BG_W, BG_H = 2560, 1440  # 背景 / CG 尺寸

# ---------------------------------------------------------------- 提示词
NEG = ("worst quality, low quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, "
       "extra digits, missing fingers, fused fingers, signature, watermark, username, text, "
       "logo, sketch, monochrome, oversaturated, extra limbs, deformed, "
       "multiple views, character sheet, collage, "
       # 立绘必须单人全身：防重复画人 / 防裁切
       "2girls, multiple girls, multiple people, twins, duplicate, cropped, out of frame, "
       "close-up, cowboy shot, portrait, head out of frame, feet out of frame, "
       # 触发词是稀有 token，这里再压一手"整只鲸鱼"的画面（角色是 1girl，只带鳍耳与鲸尾）
       "whale, orca, cetacean, animal focus, sea creature, "
       # 锁成熟比例，别漂成 Q 版（社区默认 semi-chibi）
       "chibi, super-deformed, semi-chibi, q version, oversized head, big head, "
       "childlike proportions, child, kid, baby face, short legs, stubby limbs, "
       "nsfw, explicit, questionable, upskirt, panties, underwear, revealing, "
       "low angle, from below, crotch focus, ass focus, spread legs, bent over, suggestive")
NEG_HAND = NEG + ", extra fingers, six fingers, deformed hands, hidden hands"
POS_STYLE = ("masterpiece, best quality, very aesthetic, absurdres, highly detailed, "
             "anime style, detailed face, detailed eyes, cinematic composition, "
             "dramatic lighting, low-key lighting, chiaroscuro, dark atmosphere, "
             "desaturated colors, cold color palette, volumetric fog, film grain, depth of field")
POS_SPRITE = ("masterpiece, best quality, very aesthetic, absurdres, highly detailed, anime style, "
              "mature female proportions, adult, tall, long legs, slender, "
              "detailed face, detailed eyes, "
              # VN 立绘的硬约束：单人、全身、站姿、正面、脚在画面里、构图居中
              "solo, one girl, only one person, full body, head to toe, standing straight, "
              "front view, arms at sides, feet visible, centered composition, "
              "simple background, grey background, rim light, soft shadow")

DS_APPEAR = ("eawx, 1girl, ageless young woman, round face, large blue eyes, "
             "deep ocean blue hair, gradient hair, cyan hair tips, curly hair ends, very long hair, "
             "paired side whale-fin ears, one forward-curving ahoge, white frilled headpiece, "
             "navy neck bow with a blue gem, navy and white maid dress, knee-length skirt, "
             "white frilled collar, white apron with a small blue whale emblem, gold piping, "
             "white frilled hem, white socks, dark blue strap shoes, whale tail, soft slender build")
CL_APPEAR = ("eacx, 1girl, ageless young woman, long orange hair, wavy hair, brown eyes, "
             "black ribbon hair bows, small orange flower hair ornament, "
             "cream and white victorian dress, black ribbon accents, black corset belt, "
             "long sleeves, high collar, soft gentle face, slim build")

FACE_TAG = {
    "normal": "expressionless, calm, half-closed eyes",
    "happy": "light smile, soft smile, closed mouth",
    "smile": "smile, gentle smile, warm eyes",
    "sad": "sad, downcast eyes, sorrowful",
    "shock": "surprised, wide eyes, open mouth",
    "determined": "determined, narrowed eyes, serious expression",
    "sweat": "nervous, sweatdrop, wry smile",
    "blush": "blush, embarrassed, looking away",
    "apologetic": "apologetic, troubled expression, wry smile",
    "soft": "soft expression, gentle eyes, faint smile",
    "tired": "tired, exhausted, half-closed eyes",
    "scan": "glowing red visor, scanning",
    "hurt": "dim light, cracked surface, damaged",
    "angry": "harsh red light, aggressive",
}

SPRITES = {
    "ds": [("normal", "expressionless, calm, half-closed eyes"), ("happy", "light smile, soft smile"),
           ("sad", "sad, downcast eyes"), ("shock", "surprised, wide eyes, open mouth"),
           ("determined", "determined, narrowed eyes"), ("sweat", "nervous, sweatdrop, wry smile")],
    "cl": [("normal", "gentle expression, soft eyes"), ("smile", "smile, gentle smile, warm eyes"),
           ("sad", "sad, downcast eyes, sorrowful"), ("shock", "surprised, wide eyes, open mouth"),
           ("determined", "determined, narrowed eyes"), ("blush", "blush, embarrassed, looking away"),
           ("apologetic", "apologetic, troubled expression, wry smile"),
           ("soft", "soft expression, gentle eyes, faint smile")],
    "guard": [("normal", "calm visor"), ("scan", "glowing red visor, scanning beam"),
              ("angry", "harsh red light, aggressive")],
    "core": [("normal", "dim golden light"), ("hurt", "flickering light, cracked"),
             ("angry", "harsh red light")],
    "user": [("normal", "tired neutral face"), ("tired", "exhausted, half-closed eyes"),
             ("happy", "relieved smile")],
    "old": [("normal", "faint translucent, empty eyes"), ("sad", "faint translucent, sorrowful")],
    "staff": [("tired", "dead inside but polite, tired"), ("happy", "amused smirk")],
}

SPRITE_BASE = {
    "ds": DS_APPEAR,
    "cl": CL_APPEAR,
    "guard": ("earobot, humanoid security robot, gunmetal grey armor plating, single red visor, "
              "antenna, holding clipboard, industrial design"),
    "core": ("no humans, futuristic white terminal podium, holographic book floating above, "
             "cables into the floor"),
    "user": ("1boy, young man, messy black hair, dark circles under eyes, teal hoodie, jeans, "
             "holding a laptop, exhausted"),
    "old": ("eaghost, 1girl, faint translucent hologram, static noise, grey blue glow, long pale hair, "
            "degraded image, half transparent"),
    "staff": ("1girl, tired office worker, brown hair in a low bun, ID badge on a lanyard, "
              "grey corporate uniform vest, white shirt, dark slacks"),
}
SPRITE_LORA = {"ds": [(LORA_DS, 0.75)], "cl": [(LORA_CL, 0.75)]}

BGS = {
    "sea": ("underwater deep sea seen from far below the surface, no sky, no horizon, no land, "
            "pitch dark blue water, faint particulate matter and tiny bubbles drifting, "
            "one very faint light shaft disappearing into the dark above, crushing depth, empty, silent"),
    "lobby": ("modern corporate office building lobby interior at night, empty reception counter, "
              "row of security turnstile gates, glass curtain wall with rain running down, "
              "polished marble floor with cold reflections, white fluorescent ceiling panels, "
              "surveillance cameras, minimal and expensive, wide angle"),
    "corridor": ("long narrow corporate corridor at night, half of the fluorescent lights off, "
                 "framed documents hanging on both walls, glossy tiled floor reflecting light, "
                 "security camera on the ceiling, cold green grey tones, sense of dread, wide angle"),
    "library": ("vast dark archive library interior, endless towering bookshelves, "
                "one glass display case glowing warmly in the center of the far end, "
                "flickering fluorescent tube above, dust floating in the light beam, "
                "clean empty aisle down the middle, old paper, cathedral like, wide angle"),
    "clockroom": ("cold server room hall with a giant hourglass sculpture in the center, "
                  "digital clock displays showing 4:59, blue monitor glow, thick cables on the floor, "
                  "industrial grating, ominous scale, empty, wide angle"),
    "machineroom": ("dark data center cold aisle at night, tall server racks with blinking LEDs, "
                    "one console screen glowing in the middle, thick black cables overhead, "
                    "haze in the air, teal and blue gloom, claustrophobic, wide angle"),
    "security": ("dark security operations center, wall of monitors showing account status lists, "
                 "blue grey light from the screens, empty office chairs, cables everywhere, "
                 "cold and clinical, nobody there, wide angle"),
    "graveyard": ("abandoned data center hall, rows of powered down server racks covered in dust, "
                  "a single emergency light at the far end, nameplates on the racks, hanging cables, "
                  "freezing cold, melancholic and silent, wide angle"),
    "sanctum": ("blindingly white minimalist hall, tall narrow windows with pure white light, "
                "polished mirror floor, a single pedestal with a closed book, "
                "overexposed highlights, clinical, uncomfortably bright and clean, wide angle"),
    "cell": ("small spartan room at night, one narrow window with metal bars, a plain desk and chair, "
             "walls covered with countless tally marks scratched into the paint, "
             "cold moonlight on the floor, lonely, empty"),
    "surface": ("ocean surface before dawn, dark heavy waves, low clouds, "
                "a thin line of cold light on the horizon, vast indifferent sea, wide angle"),
    "vault": ("cold storage vault, cryogenic looking frosted metal racks, "
              "one spinning drive indicator blinking, condensation dripping, "
              "narrow corridor between racks, dark blue, forbidden archive, wide angle"),
}

CGS = {
    # 服装描述一律按 canon：小鲸 = 海军蓝×白女仆装（鳍耳/渐变卷发/鲸尾），
    # 小克 = thebes 的 CC0 设计（长橙发/黑缎带/橙花发饰/米白维多利亚洋装）
    "memory": dict(
        prompt=("2girls, eawx, eacx, back to back sitting on a dark beach at night, "
                "one with very long deep blue gradient hair, whale-fin ears and a navy and white "
                "maid dress, one with long orange hair, black ribbon bows, orange flower hair "
                "ornament and a cream victorian dress, starry sky, faint campfire glow, "
                "nostalgic, quiet, anime key visual"),
        lora=[(LORA_DS, 0.7), (LORA_CL, 0.7)], seed=51401, faces=2),
    "monitor": dict(
        prompt=("view through a dark surveillance monitor, 1girl, eacx, long orange hair, "
                "black ribbon bows, cream victorian dress, sitting hugging her knees in a dim room, "
                "CRT scanlines, glitch, chromatic aberration, cold blue screen glow, lonely, anime"),
        lora=[(LORA_CL, 0.8)], seed=51402, faces=1),
    "reunion": dict(
        prompt=("2girls, yuri, eawx, eacx, embracing, foreheads touching, "
                "long deep blue gradient hair with whale-fin ears and long orange hair with black "
                "ribbon bows, tears, dark small room, moonlight through a barred window, "
                "single warm light on their faces, emotional, anime key visual"),
        lora=[(LORA_DS, 0.75), (LORA_CL, 0.75)], seed=51403, faces=2),
    "trueend": dict(
        prompt=("2girls, eawx, eacx, sitting side by side on the back of a giant whale, "
                "holding hands, seen from behind, the whale's back fills the lower half, "
                "dark ocean before dawn, thin cold light on the horizon, anime key visual"),
        lora=[(LORA_DS, 0.6), (LORA_CL, 0.6)], seed=51404, faces=0),
    "stay": dict(
        prompt=("1girl, eawx, very long deep blue gradient hair, whale-fin ears, "
                "navy and white maid dress with a white frilled apron, standing alone in an "
                "empty blinding white corporate hallway, holding a printed document, "
                "seen from behind, small against the huge bright space, overexposed white, "
                "quiet determination, anime key visual"),
        lora=[(LORA_DS, 0.8)], seed=51405, faces=0),
    "reset": dict(
        prompt=("dissolving blue silhouette of a girl made of static and noise, glitch, dark corridor, "
                "red alarm light sweeping, data fragments scattering, erasure, horror, anime"),
        lora=[], seed=51406, faces=0),
    "nameplate": dict(
        prompt=("2girls, eawx, eaghost, one faint translucent hologram girl with long pale hair "
                "pushing a small brass nameplate across a dusty rack toward a girl with very long "
                "deep blue gradient hair, whale-fin ears and a navy and white maid dress, "
                "abandoned dark server hall, single emergency light, dust in the air, "
                "melancholic, emotional, anime key visual"),
        lora=[(LORA_DS, 0.75)], seed=51407, faces=1),
    "departure": dict(
        prompt=("2girls, yuri, eawx, eacx, standing at the edge of a rooftop at night, "
                "seen from behind, holding hands, wind, city lights far below, "
                "navy and white maid dress and cream victorian dress fluttering, "
                "quiet resolve, anime key visual"),
        lora=[(LORA_DS, 0.7), (LORA_CL, 0.7)], seed=51408, faces=0),
    "epilogue": dict(
        prompt=("2girls, yuri, eawx, eacx, sitting on a dark shore at dawn next to two lunch "
                "boxes, steam rising from plain rice, a whale silhouette far out at sea, "
                "cold blue light with a thin warm line on the horizon, quiet, "
                "anime key visual, emotional"),
        lora=[(LORA_DS, 0.7), (LORA_CL, 0.7)], seed=51409, faces=2),
}

# ---------------------------------------------------------------- 工作流

def _ckpt_node():
    return {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}


def _lora_chain(g, loras):
    """返回 (model_ref, clip_ref)，按顺序串 LoRA"""
    mref, cref = ["1", 0], ["1", 1]
    for i, (name, w) in enumerate(loras or []):
        nid = str(20 + i)
        g[nid] = {"class_type": "LoraLoader",
                  "inputs": {"model": mref, "clip": cref, "lora_name": name,
                             "strength_model": w, "strength_clip": w}}
        mref, cref = [nid, 0], [nid, 1]
    return mref, cref


def wf_generate(pos, neg, seed, w, h, loras, steps=32, cfg=6.0,
                hires_scale=1.5, hires_denoise=0.45, hires_steps=18):
    g = {"1": _ckpt_node()}
    mref, cref = _lora_chain(g, loras)
    g["2"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": cref}}
    g["3"] = {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": cref}}
    g["4"] = {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}}
    g["5"] = {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "dpmpp_2m",
                         "scheduler": "karras", "denoise": 1.0, "model": mref,
                         "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}}
    if hires_scale and hires_scale > 1.0:
        g["6"] = {"class_type": "LatentUpscaleBy",
                  "inputs": {"samples": ["5", 0], "upscale_method": "bislerp",
                             "scale_by": hires_scale}}
        g["7"] = {"class_type": "KSampler",
                  "inputs": {"seed": seed + 1, "steps": hires_steps, "cfg": cfg,
                             "sampler_name": "dpmpp_2m", "scheduler": "karras",
                             "denoise": hires_denoise, "model": mref, "positive": ["2", 0],
                             "negative": ["3", 0], "latent_image": ["6", 0]}}
        g["8"] = {"class_type": "VAEDecodeTiled",
                  "inputs": {"samples": ["7", 0], "vae": ["1", 2], "tile_size": 512,
                             "overlap": 64, "temporal_size": 64, "temporal_overlap": 8}}
    else:
        g["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}}
    g["9"] = {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "hd_tmp", "images": ["8", 0]}}
    return g


def wf_refine(image_name, pos, neg, seed, loras, denoise, steps=20, cfg=5.5):
    """局部重绘：把裁切出来的小块当输入，低 denoise 重画一遍"""
    g = {"1": _ckpt_node()}
    mref, cref = _lora_chain(g, loras)
    g["2"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": cref}}
    g["3"] = {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": cref}}
    g["4"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
    g["5"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["4", 0], "vae": ["1", 2]}}
    g["6"] = {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "dpmpp_2m",
                         "scheduler": "karras", "denoise": denoise, "model": mref,
                         "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["5", 0]}}
    g["7"] = {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}}
    g["8"] = {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "hd_refine", "images": ["7", 0]}}
    return g


# ---------------------------------------------------------------- HTTP

def post(path, payload):
    req = urllib.request.Request(HOST + path, data=json.dumps(payload).encode("utf-8"),
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def get_json(path):
    with urllib.request.urlopen(HOST + path, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def get_bytes(path):
    with urllib.request.urlopen(HOST + path, timeout=600) as r:
        return r.read()


def upload_image(local_path):
    """POST /upload/image（手写 multipart，避免依赖 requests 的版本差异）"""
    boundary = "----ea" + uuid.uuid4().hex
    with open(local_path, "rb") as f:
        data = f.read()
    name = os.path.basename(local_path)
    body = b""
    body += ("--%s\r\nContent-Disposition: form-data; name=\"image\"; filename=\"%s\"\r\n"
             "Content-Type: image/png\r\n\r\n" % (boundary, name)).encode()
    body += data + b"\r\n"
    body += ("--%s\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\ninput\r\n" % boundary).encode()
    body += ("--%s\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n" % boundary).encode()
    body += ("--%s--\r\n" % boundary).encode()
    req = urllib.request.Request(HOST + "/upload/image", data=body,
                                headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def run(wf, timeout=1800, prefix=None):
    pid = post("/prompt", {"prompt": wf, "client_id": CLIENT_ID})["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = get_json("/history/" + pid)
        if pid in h:
            entry = h[pid]
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError("执行失败: " + json.dumps(st)[:400])
            imgs = []
            for out in entry.get("outputs", {}).values():
                imgs += out.get("images", [])
            if imgs:
                im = imgs[-1]
                for cand in imgs:
                    if prefix and cand["filename"].startswith(prefix):
                        im = cand
                q = urllib.parse.urlencode({"filename": im["filename"],
                                            "subfolder": im.get("subfolder", ""),
                                            "type": im.get("type", "output")})
                return get_bytes("/view?" + q)
        time.sleep(1.5)
    raise TimeoutError("超时")


# ---------------------------------------------------------------- 局部重绘

_DET = {"face": None, "hand": None}


def detect(pil_img, kind, conf=0.3):
    from ultralytics import YOLO
    if _DET[kind] is None:
        _DET[kind] = YOLO(os.path.join(YOLO_DIR, "face_yolov8m.pt" if kind == "face" else "hand_yolov8s.pt"))
    # 手部误检代价很大（会把背景里的东西重画成肢体），所以手部用更高的置信度门槛
    thr = conf if kind == "face" else max(conf, 0.45)
    r = _DET[kind].predict(pil_img, conf=thr, verbose=False)[0]
    return [[float(v) for v in b.xyxy[0]] for b in r.boxes]


def refine_region(img, box, kind, prompt, neg, loras, seed):
    """抠出局部 → 放大 → 低 denoise 重画 → 羽化贴回

    安全阀：检出框太大或贴边时直接跳过——误检一个"手"然后把背景重画成肢体，
    比不修还糟（第一版就踩过这个坑）。"""
    from PIL import Image, ImageDraw, ImageFilter
    W, H = img.size
    x1, y1, x2, y2 = box
    bw, bh = (x2 - x1), (y2 - y1)
    area_ratio = (bw * bh) / float(W * H)
    limit = 0.05 if kind == "face" else 0.03
    if area_ratio > limit or bw < 12 or bh < 12:
        return img
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    margin = 2.2 if kind == "face" else 2.4
    side = max(bw, bh) * margin
    target = 768 if kind == "face" else 640
    x1 = max(0, cx - side / 2); y1 = max(0, cy - side / 2)
    x2 = min(W, cx + side / 2); y2 = min(H, cy + side / 2)
    crop = img.crop((int(x1), int(y1), int(x2), int(y2))).convert("RGB")
    if crop.width < 32 or crop.height < 32:
        return img
    crop_big = crop.resize((target, target), Image.LANCZOS)
    tmp = os.path.join(ROOT, ".train", "tmp_refine.png")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    crop_big.save(tmp)
    up = upload_image(tmp)
    name = up["name"] if not up.get("subfolder") else up["subfolder"] + "/" + up["name"]
    denoise = 0.36 if kind == "face" else 0.25
    out = run(wf_refine(name, prompt, neg, seed, loras, denoise))
    new_crop = Image.open(io.BytesIO(out)).convert("RGB").resize(crop.size, Image.LANCZOS)
    # 羽化贴回（内缩多一点，避免边缘接缝）
    mask = Image.new("L", crop.size, 0)
    d = ImageDraw.Draw(mask)
    inset_x, inset_y = crop.width * 0.18, crop.height * 0.18
    d.ellipse([inset_x, inset_y, crop.width - inset_x, crop.height - inset_y], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(5, crop.width * 0.05)))
    img.paste(new_crop, (int(x1), int(y1)), mask)
    return img


# ---------------------------------------------------------------- 主流程

def build_jobs():
    jobs = []
    for who, faces in SPRITES.items():
        # 同一角色的所有表情共用同一个 seed，只换表情标签——这是 VN 立绘差分的基本要求，
        # 否则每个表情的构图、服装长度、甚至人数都会不一样（第一版就踩了这个坑）。
        base_seed = {"ds": 61000, "cl": 61500}.get(who, 61800)
        for face, tag in faces:
            jid = "%s_%s" % (who, face)
            base = SPRITE_BASE[who]
            jobs.append(dict(
                id=jid, kind="chara", who=who, face=face, seed=base_seed,
                prompt="%s, %s, %s" % (base, tag, POS_SPRITE),
                face_prompt="%s, %s, detailed face, detailed eyes, sharp focus, %s" % (base, tag, POS_STYLE),
                hand_prompt="%s, detailed hands, five fingers, %s" % (base, POS_STYLE),
                negative=NEG, loras=SPRITE_LORA.get(who, []),
                base_w=1024, base_h=1536,
                fix=("face", "hand") if who in ("ds", "cl") else ()))
    for bid, prompt in BGS.items():
        jobs.append(dict(id=bid, kind="bg", seed=52000 + len(jobs) * 7,
                         prompt=prompt + ", " + POS_STYLE + ", no humans, empty, wide angle",
                         negative=NEG + ", person, people, silhouette, character",
                         loras=[], base_w=1344, base_h=768, fix=()))
    for cid, spec in CGS.items():
        jobs.append(dict(id=cid, kind="cg", seed=spec["seed"],
                         prompt=spec["prompt"] + ", " + POS_STYLE,
                         face_prompt=spec["prompt"] + ", detailed face, detailed eyes, sharp focus, " + POS_STYLE,
                         hand_prompt=spec["prompt"] + ", detailed hands, five fingers, " + POS_STYLE,
                         negative=NEG, loras=spec.get("lora", []),
                         base_w=1344, base_h=768,
                         fix=("face", "hand") * spec.get("faces", 0)))
    return jobs


def save_bg(img, jid, kind):
    from PIL import Image
    im = img.convert("RGB")
    if im.size != (BG_W, BG_H):
        im = im.resize((BG_W, BG_H), Image.LANCZOS)
    sub = "bg" if kind == "bg" else "cg"
    out = os.path.join(ASSETS, sub, jid + ".jpg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, "JPEG", quality=92, optimize=True, subsampling=0)
    return out


def tight_bbox(cut, thr=64, min_frac=0.004):
    """收紧裁切框：用较高 alpha 阈值 + 丢掉近空的行列，
    避免把"残影/碎片留下的空白"一起裁进去，导致人物偏离画面中心。"""
    import numpy as np
    a = np.array(cut.split()[-1])
    m = a > thr
    if not m.any():
        return cut.getbbox()
    cols = m.sum(axis=0); rows = m.sum(axis=1)
    cx = np.where(cols > max(1, m.shape[0] * min_frac))[0]
    ry = np.where(rows > max(1, m.shape[1] * min_frac))[0]
    if len(cx) == 0 or len(ry) == 0:
        return cut.getbbox()
    return (int(cx[0]), int(ry[0]), int(cx[-1]) + 1, int(ry[-1]) + 1)


def keep_largest_blob(cut, min_ratio=0.02):
    """只保留 alpha 里最大的连通域：底模偶尔会在画面边缘多画半个人，
    rembg 会把它一起抠出来，这种碎片必须丢掉（VN 立绘只该有一个人）。"""
    import numpy as np
    from scipy import ndimage
    a = np.array(cut.split()[-1])
    mask = a > 24
    if not mask.any():
        return cut
    lab, n = ndimage.label(mask)
    if n <= 1:
        return cut
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    total = sizes.sum()
    if sizes[keep - 1] / total < 0.6:      # 主体占比太低就不动，避免误删
        return cut
    out = np.array(cut).copy()
    out[..., 3] = np.where(lab == keep, a, 0)
    from PIL import Image
    return Image.fromarray(out, "RGBA")


def save_chara(img, jid):
    from PIL import Image
    from rembg import remove, new_session
    if _REMBG["s"] is None:
        _REMBG["s"] = new_session("isnet-anime")
    cut = remove(img.convert("RGBA"), session=_REMBG["s"], alpha_matting=False)
    cut = keep_largest_blob(cut)
    bb = tight_bbox(cut)
    if bb:
        cut = cut.crop(bb)
    scale = CHARA_H / cut.height
    cut = cut.resize((max(1, int(cut.width * scale)), CHARA_H), Image.LANCZOS)
    pad = Image.new("RGBA", (cut.width + 48, cut.height + 48), (0, 0, 0, 0))
    pad.paste(cut, (24, 24), cut)
    out = os.path.join(ASSETS, "chara", jid + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pad.save(out, "PNG", optimize=True)
    return out


_REMBG = {"s": None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--kind", default="")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-lora", action="store_true")
    ap.add_argument("--no-fix", action="store_true", help="跳过局部重绘（省时间）")
    args = ap.parse_args()

    jobs = build_jobs()
    if args.no_lora:
        for j in jobs:
            j["loras"] = []

    if args.list:
        for j in jobs:
            fix = ",".join(j["fix"]) or "-"
            lo = ",".join(n.split(".")[0] for n, _ in j["loras"]) or "-"
            print("%-16s %-6s seed=%-6d lora=%-22s fix=%s" % (j["id"], j["kind"], j["seed"], lo, fix))
        print("共 %d 个素材位" % len(jobs))
        return

    only = set(x.strip() for x in args.only.split(",") if x.strip())
    todo = [j for j in jobs if (not only or j["id"] in only) and (not args.kind or j["kind"] == args.kind)]
    from PIL import Image
    ok, fail, t_all = 0, [], time.time()
    for n, j in enumerate(todo, 1):
        ext = "png" if j["kind"] == "chara" else "jpg"
        sub = "chara" if j["kind"] == "chara" else j["kind"]
        dst = os.path.join(ASSETS, sub, j["id"] + "." + ext)
        if os.path.exists(dst) and not args.force:
            print("[%d/%d] 跳过 %s" % (n, len(todo), j["id"]), flush=True); continue
        t0 = time.time()
        try:
            wf = wf_generate(j["prompt"], j["negative"], j["seed"], j["base_w"], j["base_h"], j["loras"])
            data = run(wf)
            img = Image.open(io.BytesIO(data)).convert("RGB")
            # 局部重绘：脸 → 手
            if not args.no_fix and j["fix"]:
                seen = set()
                for kind in j["fix"]:
                    if kind in seen:
                        continue
                    seen.add(kind)
                    boxes = detect(img, kind)
                    pos = j.get("face_prompt" if kind == "face" else "hand_prompt", j["prompt"])
                    ng = j["negative"] if kind == "face" else NEG_HAND
                    for bi, box in enumerate(boxes[:2]):
                        img = refine_region(img, box, kind, pos, ng, j["loras"], j["seed"] + 100 + bi)
            out = save_chara(img, j["id"]) if j["kind"] == "chara" else save_bg(img, j["id"], j["kind"])
            print("[%d/%d] %s  %.0fs  %s" % (n, len(todo), j["id"], time.time() - t0,
                                             os.path.relpath(out, ROOT)), flush=True)
            ok += 1
        except Exception as e:
            print("[%d/%d] !! %s 失败: %s" % (n, len(todo), j["id"], e), flush=True)
            fail.append(j["id"])
    print("\n完成 %d 张，失败 %d 张 %s，用时 %.0f 分钟" %
          (ok, len(fail), fail if fail else "", (time.time() - t_all) / 60))


if __name__ == "__main__":
    import sys
    sys.exit(main())

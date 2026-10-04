#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/anima_produce.py —— 用社区模型出图（Anima 底模 + DeepSeek-chan LoRA）

为什么要换这条路：
  之前是我自己拿 wai15 训了个 LoRA，结果比例/脸型/服装细节都偏离了原版设定。
  主人给了原版参考图 + 社区模型（circlestone-labs/Anima 底模 + SAkizuki/anima-deepseek LoRA），
  这条路是**直接在原版设定的数据上训练的**，用来严格对齐原版。

工作流取自官方 example.png 内嵌的节点图：
  UNETLoader(anima-*.safetensors) + CLIPLoader(qwen_3_06b_base, type=stable_diffusion)
  + VAELoader(qwen_image_vae) + EmptyLatentImage + KSampler(er_sde/simple) + VAEDecode
生成设置（官方建议）：
  Turbo：CFG 1、8~12 步；Aesthetic：CFG 4~5、30~50 步
  正向前缀 "masterpiece, best quality, score_7, safe, "
  负向 "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia"

用法：
  python tools/anima_produce.py --probe                    # 出对照图（对比原版参考）
  python tools/anima_produce.py --kind chara --only ds_normal --force
  python tools/anima_produce.py --list
"""

import argparse
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid

from PIL import Image   # 模块级导入：多个函数与主流程都要用

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
HOST = "http://127.0.0.1:8188"
CLIENT_ID = str(uuid.uuid4())

# 模型文件（都在 ComfyUI 的 models 目录里）
UNET = "anima-aesthetic-v1.1.safetensors"   # 正式出图用的底模（Turbo 见下）
UNET_FAST = "anima-turbo-v1.1.safetensors"   # 快速迭代用
UNET_QUALITY = "anima-aesthetic-v1.1.safetensors"
CLIP_NAME = "qwen_3_06b_base.safetensors"
VAE_NAME = "qwen_image_vae.safetensors"
LORA_DEEPSEEK = "anima-deepseek-3.safetensors"   # 社区 DeepSeek-chan LoRA（触发词 deepseek）

CHARA_H = 2400
BG_W, BG_H = 2560, 1440

# 官方建议的提示词前后缀
POS_PREFIX = "masterpiece, best quality, score_7, safe, "
NEG = ("worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia, "
       "chibi, super-deformed, oversized head, child, multiple girls, 2girls, cropped, "
       "nsfw, explicit, upskirt, panties, low angle, from below")

# 底模默认值：Aesthetic + 30 步 + CFG 4.5（实测这组最贴原版的深藏青与细节；
# Turbo 12 步/CFG1 更快但颜色偏浅、线条略糙，留作快速迭代用）
STEPS_DEFAULT = 30
CFG_DEFAULT = 4.5

# 触发词 + 外观（按主人给的原版参考图逐项对齐：长裙/马甲金扣/大围裙鲸鱼徽记/
# 腰部蝴蝶结飘带/大鲸尾/尖下垂鳍耳/细高呆毛/白色荷叶头饰+蓝蝴蝶结/白袜玛丽珍鞋）
DS_APPEAR = ("deepseek, 1girl, solo, mature female proportions, "
             "dark navy blue dress, deep navy, high contrast, vivid colors, "
             "blue hair, gradient hair, light blue hair tips, very long wavy hair, "
             "big blue eyes, thick eyelashes, rosy cheeks, small nose, "
             "thin tall ahoge, grey-blue pointed whale-fin ears, "
             "white frilled maid headband, blue bow on head, "
             "navy and white maid dress, white shirt front, navy corset vest with gold buttons, "
             "puffed sleeves, white frilled cuffs, "
             "large white pinafore apron with frills and navy whale emblem, "
             "blue ribbon bows at waist with long ribbon tails, "
             "long layered navy skirt, light blue pleated underskirt, white frilled hem, "
             "gold embroidery on skirt, large navy whale tail, "
             "white socks, dark blue mary jane shoes")

POS_SPRITE = ("solo, one girl, only one person, full body, head to toe, standing, "
              "front view, arms at sides, feet visible, centered composition, "
              "simple background, white background, detailed, "
              "cinematic lighting, rim light, film grain")

# 六个表情：标注按原版（大眼睛 + 丰富的表情幅度）
FACES = {
    "ds_normal": "calm expression, closed mouth, looking at viewer",
    "ds_happy": "big smile, open mouth, happy, looking at viewer",
    "ds_sad": "sad, downcast eyes, closed mouth",
    "ds_shock": "surprised, wide eyes, open mouth, exclamation mark",
    "ds_determined": "determined, serious, furrowed brows, closed mouth",
    "ds_sweat": "nervous, sweatdrop, wry smile",
}


# ---------------------------------------------------------------- 工作流

def _base(unet, loras):
    g = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": unet, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": CLIP_NAME, "type": "stable_diffusion", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE_NAME}},
    }
    mref = ["1", 0]
    for i, (name, w) in enumerate(loras or []):
        nid = str(20 + i)
        g[nid] = {"class_type": "LoraLoaderModelOnly",
                  "inputs": {"model": mref, "lora_name": name, "strength_model": w}}
        mref = [nid, 0]
    return g, mref


def wf_generate(pos, neg, seed, w, h, loras, steps=STEPS_DEFAULT, cfg=CFG_DEFAULT,
                sampler="er_sde", scheduler="simple", unet=UNET):
    g, mref = _base(unet, loras)
    g["4"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["2", 0]}}
    g["5"] = {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["2", 0]}}
    g["6"] = {"class_type": "EmptyLatentImage",
              "inputs": {"width": w, "height": h, "batch_size": 1}}
    g["7"] = {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": sampler,
                         "scheduler": scheduler, "denoise": 1.0, "model": mref,
                         "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0]}}
    g["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}}
    g["9"] = {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "anima_tmp", "images": ["8", 0]}}
    return g


def wf_upscale(image_name, scale_to_h=CHARA_H, model="4x-AnimeSharp.pth"):
    """把生成的图用超分模型放大后再缩到目标高度（Anima 原生上限 1536²，
    直接出 2400 高会糊，所以走 4x 超分再降采样）。"""
    g = {"1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
         "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": model}},
         "3": {"class_type": "ImageUpscaleWithModel",
               "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
         "4": {"class_type": "ImageScaleBy",
               "inputs": {"upscale_method": "lanczos", "scale_by": 1.0, "image": ["3", 0]}},
         "5": {"class_type": "SaveImage",
               "inputs": {"filename_prefix": "anima_up", "images": ["4", 0]}}}
    return g


def upscale_to(img, target_h=CHARA_H, model="4x-AnimeSharp.pth"):
    """在 ComfyUI 里做 4x 超分，回来再按目标高度缩放（保持比例）"""
    from PIL import Image
    tmp = os.path.join(ROOT, ".train", "tmp_up.png")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    img.save(tmp)
    up = upload_image(tmp)
    name = up["name"] if not up.get("subfolder") else up["subfolder"] + "/" + up["name"]
    data = run(wf_upscale(name, target_h, model))
    big = Image.open(io.BytesIO(data)).convert("RGB")
    # 4x 出来的尺寸不一定正好，按"目标高度 / 最终裁切后的高度"反推：这里先放大到足够大
    if big.height < target_h:
        big = big.resize((int(big.width * target_h / big.height), target_h), Image.LANCZOS)
    return big


def wf_refine(image_name, pos, neg, seed, loras, denoise, steps=STEPS_DEFAULT, cfg=CFG_DEFAULT,
              sampler="er_sde", scheduler="simple", unet=UNET):
    g, mref = _base(unet, loras)
    g["4"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["2", 0]}}
    g["5"] = {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["2", 0]}}
    g["6"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
    g["7"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["6", 0], "vae": ["3", 0]}}
    g["8"] = {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": sampler,
                         "scheduler": scheduler, "denoise": denoise, "model": mref,
                         "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["7", 0]}}
    g["9"] = {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}}
    g["10"] = {"class_type": "SaveImage",
               "inputs": {"filename_prefix": "anima_refine", "images": ["9", 0]}}
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
    boundary = "----ea" + uuid.uuid4().hex
    with open(local_path, "rb") as f:
        data = f.read()
    name = os.path.basename(local_path)
    body = ("--%s\r\nContent-Disposition: form-data; name=\"image\"; filename=\"%s\"\r\n"
            "Content-Type: image/png\r\n\r\n" % (boundary, name)).encode() + data + b"\r\n"
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
                raise RuntimeError("执行失败: " + json.dumps(st)[:600])
            imgs = []
            for out in entry.get("outputs", {}).values():
                imgs += out.get("images", [])
            if imgs:
                im = imgs[-1]
                if prefix:
                    for cand in imgs:
                        if cand["filename"].startswith(prefix):
                            im = cand
                q = urllib.parse.urlencode({"filename": im["filename"],
                                            "subfolder": im.get("subfolder", ""),
                                            "type": im.get("type", "output")})
                return get_bytes("/view?" + q)
        time.sleep(1.2)
    raise TimeoutError("超时")


# ---------------------------------------------------------------- 后处理

_REMBG = {"s": None}


def keep_largest_blob(cut):
    import numpy as np
    from scipy import ndimage
    from PIL import Image
    a = np.array(cut.split()[-1])
    mask = a > 24
    if not mask.any():
        return cut
    lab, n = ndimage.label(mask)
    if n <= 1:
        return cut
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    if sizes[keep - 1] / sizes.sum() < 0.6:
        return cut
    out = np.array(cut).copy()
    out[..., 3] = np.where(lab == keep, a, 0)
    return Image.fromarray(out, "RGBA")


def tight_bbox(cut, thr=64, min_frac=0.004):
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


def save_chara(img, jid, h=CHARA_H, do_upscale=True):
    from PIL import Image
    from rembg import remove, new_session
    if do_upscale:
        try:
            img = upscale_to(img, 1600)
        except Exception as e:
            print("   超分失败，直接用原图：%s" % e)
    if _REMBG["s"] is None:
        _REMBG["s"] = new_session("isnet-anime")
    cut = remove(img.convert("RGBA"), session=_REMBG["s"], alpha_matting=False)
    cut = keep_largest_blob(cut)
    bb = tight_bbox(cut)
    if bb:
        cut = cut.crop(bb)
    scale = h / cut.height
    cut = cut.resize((max(1, int(cut.width * scale)), h), Image.LANCZOS)
    pad = Image.new("RGBA", (cut.width + 48, cut.height + 48), (0, 0, 0, 0))
    pad.paste(cut, (24, 24), cut)
    out = os.path.join(ASSETS, "chara", jid + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pad.save(out, "PNG", optimize=True)
    return out


def save_bg(img, jid, sub):
    from PIL import Image
    im = img.convert("RGB")
    if im.size != (BG_W, BG_H):
        im = im.resize((BG_W, BG_H), Image.LANCZOS)
    out = os.path.join(ASSETS, sub, jid + ".jpg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, "JPEG", quality=92, optimize=True, subsampling=0)
    return out


# ---------------------------------------------------------------- 探针

def probe(args):
    """出对照图：同一个提示词不同 LoRA 权重 + 不同底模，供肉眼比对原版参考"""
    from PIL import Image, ImageDraw
    outdir = os.path.join(ROOT, ".train", "probe")
    os.makedirs(outdir, exist_ok=True)
    cases = [
        ("turbo_lora1.0", UNET, [(LORA_DEEPSEEK, 1.0)], 10, 1.0),
        ("turbo_lora0.8", UNET, [(LORA_DEEPSEEK, 0.8)], 10, 1.0),
        ("aesthetic_lora1.0", UNET_QUALITY, [(LORA_DEEPSEEK, 1.0)], 30, 4.0),
    ]
    files = []
    for tag, unet, loras, steps, cfg in cases:
        if not os.path.exists(os.path.join(ROOT, ".cache_ok")) and tag.startswith("aesthetic"):
            p = os.path.join(os.environ.get("COMFY_MODELS", r"D:\AI_Tools\AIP\ComfyUI-V9.5\models"),
                             "diffusion_models", UNET_QUALITY)
            if not os.path.exists(p):
                print("跳过（Aesthetic 底模还没下完）:", tag); continue
        pos = POS_PREFIX + DS_APPEAR + ", " + POS_SPRITE
        wf = wf_generate(pos, NEG, 20261004, 832, 1216, loras, steps=steps, cfg=cfg, unet=unet)
        data = run(wf)
        p = os.path.join(outdir, "anima_%s.png" % tag)
        Image.open(io.BytesIO(data)).convert("RGB").save(p)
        files.append((tag, p))
        print("done", tag, flush=True)
    if not files:
        print("没有可比的样本")
        return
    ref = os.path.join(ROOT, ".train", "refs", "user_canon", "whale_canon.png")
    tiles = []
    if os.path.exists(ref):
        r = Image.open(ref).convert("RGB")
        tiles.append(("USER CANON REF", r))
    for tag, p in files:
        tiles.append((tag, Image.open(p).convert("RGB")))
    th = 700
    tiles = [(t, im.resize((int(im.width * th / im.height), th), Image.LANCZOS)) for t, im in tiles]
    W = sum(im.width for _, im in tiles) + 20 * len(tiles)
    s = Image.new("RGB", (W, th + 30), (12, 12, 14))
    d = ImageDraw.Draw(s)
    x = 10
    for t, im in tiles:
        s.paste(im, (x, 26)); d.text((x, 6), t, fill=(230, 236, 245)); x += im.width + 20
    out = os.path.join(outdir, "anima_probe_sheet.png")
    s.save(out)
    print("拼图 →", os.path.relpath(out, ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="出对照图")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--steps", type=int, default=STEPS_DEFAULT)
    ap.add_argument("--cfg", type=float, default=CFG_DEFAULT)
    ap.add_argument("--unet", default=UNET)
    ap.add_argument("--lora-weight", type=float, default=1.0)
    ap.add_argument("--no-lora", action="store_true")
    args = ap.parse_args()

    if args.probe:
        return probe(args)

    # VN 立绘差分：同角色所有表情共用同一 seed，只换表情标签（否则构图/服装长度都会变）
    jobs = [dict(id=k, kind="chara", seed=88000, face=v) for k, v in FACES.items()]
    if args.list:
        for j in jobs:
            print("%-16s seed=%s" % (j["id"], j["seed"]))
        return
    only = set(x.strip() for x in args.only.split(",") if x.strip())
    todo = [j for j in jobs if not only or j["id"] in only]
    loras = [] if args.no_lora else [(LORA_DEEPSEEK, args.lora_weight)]
    for n, j in enumerate(todo, 1):
        dst = os.path.join(ASSETS, "chara", j["id"] + ".png")
        if os.path.exists(dst) and not args.force:
            print("[%d/%d] 跳过 %s" % (n, len(todo), j["id"])); continue
        pos = POS_PREFIX + DS_APPEAR + ", " + j["face"] + ", " + POS_SPRITE
        t0 = time.time()
        try:
            wf = wf_generate(pos, NEG, j["seed"], 832, 1216, loras, steps=args.steps, cfg=args.cfg, unet=args.unet)
            data = run(wf)
            img = Image.open(io.BytesIO(data)).convert("RGB")
            out = save_chara(img, j["id"])
            print("[%d/%d] %s %.0fs %s" % (n, len(todo), j["id"], time.time() - t0,
                                           os.path.relpath(out, ROOT)), flush=True)
        except Exception as e:
            print("[%d/%d] !! %s 失败: %s" % (n, len(todo), j["id"], e), flush=True)


if __name__ == "__main__":
    sys.exit(main())

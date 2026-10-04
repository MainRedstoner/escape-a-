#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/lora_dataset.py —— 角色 LoRA 训练集生成

为什么要这一步：
  草稿阶段靠"同 seed + 同提示词"来维持一致性，能对得上构图，但**对不上设定**
  （衣服饱和度、发梢长度、发饰位置都会漂）。要让"这就是小鲸"稳定成立，
  唯有训一个角色 LoRA。而 LoRA 的质量几乎完全由数据集决定，所以这里把
  姿势 / 机位 / 场景 / 表情四个维度全部打散，避免训出一个"只会站桩"的角色。

产出：
  .train/dataset/<trigger>/<NNN>.png    图片（RGB，带背景）
  .train/dataset/<trigger>/<NNN>.txt    标注（trigger + 外观 + 姿势 + 场景）

用法：
  python tools/lora_dataset.py --list
  python tools/lora_dataset.py --char ds --limit 2      # 先出两张看效果
  python tools/lora_dataset.py                          # 全部（两个角色 72 张）
"""

import argparse
import io
import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ROOT = os.path.join(ROOT, ".train", "dataset")
HOST = "http://127.0.0.1:8188"
CKPT = "WAI_NSFW-illustrious-SDXL_v15.safetensors"
CLIENT_ID = str(uuid.uuid4())

NEG = ("worst quality, low quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, "
       "extra digits, missing fingers, signature, watermark, username, text, logo, "
       "sketch, monochrome, oversaturated, extra limbs, deformed, multiple views, "
       "character sheet, collage, cropped head, "
       # ↓ 触发词换稀有 token 后，再压一手"整只鲸鱼"的画面（角色是 1girl，只带鳍耳与鲸尾）
       "whale, orca, cetacean, animal focus, sea creature, "
       # ↓ 社区鲸鱼娘的默认比例是 semi-chibi（2.8 头身），不显式压制就会漂成 Q 版。
       #   本作是暗色剧情向，必须锁成熟比例。
       "chibi, super-deformed, semi-chibi, q version, oversized head, big head, "
       "childlike proportions, child, kid, toddler, baby face, short legs, stubby limbs, "
       # ↓ 底座是 WAI-NSFW，不加这一串会把走光构图一起学进 LoRA，污染整部作品的调性
       "nsfw, explicit, questionable, upskirt, panties, underwear, revealing, "
       "low angle, from below, crotch focus, ass focus, spread legs, bent over, "
       "short skirt, miniskirt, thigh gap, see-through, cleavage focus, suggestive")

QUALITY = ("masterpiece, best quality, very aesthetic, absurdres, highly detailed, "
           "anime style, detailed face, detailed eyes, cinematic lighting, film grain, "
           "mature female proportions, adult, tall, long legs, slender")

# ---------------------------------------------------------------- 角色设定
# 注意：外观标签在数据集里**每张都要写全**，让 LoRA 学到的是"人"，
#       姿势/场景标签则用来把这些变量从角色概念里剥离出去。
CHARS = {
    # 身份特征（鳍耳 / 前弯呆毛 / 深海蓝→青的发尾 / 鲸尾 / 圆脸大眼）来自社区鲸鱼娘设定文档
    # （deepseek-whalechan: character-spec.md「永久身份」字段）；
    # 服饰同样按该文档的 canonical：海军蓝 + 白蕾丝女仆装、白围裙带鲸鱼徽记、金线滚边。
    # 比例采用"成熟版"（社区另有 mature 设定表），适配本作暗色剧情基调。
    "ds": {
        # 触发词刻意不含任何实义词：早期用 "eawhale" 时，分词器会拆出 "whale"，
        # 底模的鲸鱼先验跟角色概念抢权重，采样图里直接画出了虎鲸。换成稀有 token。
        "trigger": "eawx",
        "appearance": ("1girl, solo, ageless young woman, round face, large blue eyes, "
                       "deep ocean blue hair, gradient hair, cyan hair tips, curly hair ends, "
                       "very long hair, paired side whale-fin ears, one forward-curving ahoge, "
                       "white frilled headpiece, navy neck bow with a blue gem, "
                       "navy and white maid dress, knee-length skirt, white frilled collar, "
                       "white apron with a small blue whale emblem, gold piping, "
                       "white frilled hem, white socks, dark blue strap shoes, whale tail, "
                       "tall, soft slender build"),
        "seed": 41501,
    },
    # Claude 拟人采用 thebes 的 CC0 角色设计（flower-Claude）：长橙发 + 黑缎带 + 花饰 +
    # 米白洋装。CC0 可自由使用，出处在 README 与游戏内「关于本作」注明。
    "cl": {
        "trigger": "eacx",
        "appearance": ("1girl, solo, ageless young woman, long orange hair, wavy hair, "
                       "brown eyes, black ribbon hair bows, small orange flower hair ornament, "
                       "cream and white victorian dress, black ribbon accents, "
                       "black corset belt, long sleeves, high collar, "
                       "soft gentle face, slim build"),
        "seed": 41502,
    },
}

# 姿势 / 机位：决定 LoRA 的泛用性，必须够散
# 两条硬规矩（见 NEG 的说明与 design 决定）：
#   1. 机位一律 eye level，绝不 from below；
#   2. 不出现坐地 / 跪姿——底座模型会把"裙装 + 低机位"往走光方向解读，
#      这种偏好一旦被学进 LoRA，整部作品的调性就毁了。坐姿只保留
#      "椅子上、双腿并拢、正面" 这一种。
POSES = [
    ("standing, front view, arms at sides, full body, eye level", "standing straight, full body"),
    ("standing, from side, profile, looking away, full body, eye level", "side view, full body"),
    ("standing, from behind, back view, full body, eye level", "back view, full body"),
    ("standing, looking back over shoulder, full body, eye level", "looking back, full body"),
    ("standing, hands in coat pockets, full body, eye level", "hands in pockets, full body"),
    ("walking, motion, full body, eye level", "walking, full body"),
    ("cowboy shot, arms crossed, eye level", "cowboy shot"),
    ("cowboy shot, holding a small parcel, eye level", "holding a parcel, cowboy shot"),
    ("upper body, portrait, looking at viewer, eye level", "portrait, upper body"),
    ("upper body, portrait, looking away, eye level", "portrait, looking away"),
    ("leaning against a wall, standing, cowboy shot, eye level", "leaning on wall, cowboy shot"),
    ("sitting on a chair, legs together, hands on lap, full body, eye level", "sitting on chair, full body"),
]

# 表情
FACES = [
    "expressionless, calm, half-closed eyes",
    "light smile, soft smile",
    "sad, downcast eyes",
    "surprised, wide eyes, open mouth",
    "determined, narrowed eyes",
    "blush, embarrassed",
]

# 场景：约 4 成纯灰底（方便以后抠图做立绘），其余是有环境的画面（让 LoRA 能在 CG 里干活）
SCENES = [
    ("simple background, grey background, studio lighting", "grey background", 4),
    ("dark modern office corridor, fluorescent lights, night", "office corridor", 1),
    ("cold server room, blue LED lights, cables", "server room", 1),
    ("night sea, dark water, stars", "night sea", 1),
    ("bright white minimalist hall", "white hall", 1),
    ("small plain room, moonlight through a barred window", "small room", 1),
    ("empty rooftop at night, city lights below", "rooftop", 1),
]

STEPS = 30
CFG = 6.0


def build(char, pose_idx, face_idx, scene_idx, seed):
    c = CHARS[char]
    pose_pos, pose_cap = POSES[pose_idx]
    scene_pos, scene_cap, _ = SCENES[scene_idx]
    pos = (f"{c['trigger']}, {c['appearance']}, {pose_pos}, {FACES[face_idx]}, "
           f"{scene_pos}, {QUALITY}")
    cap = (f"{c['trigger']}, 1girl, solo, {c['appearance'].split('1girl, solo, ')[1]}, "
           f"{pose_cap}, {FACES[face_idx].split(',')[0]}, {scene_cap}")
    g = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1536, "batch_size": 1}},
        "5": {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": STEPS, "cfg": CFG, "sampler_name": "dpmpp_2m",
                         "scheduler": "karras", "denoise": 1.0, "model": ["1", 0],
                         "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ds_" + c["trigger"], "images": ["6", 0]}},
    }
    return g, cap, pos


def plan(per_char):
    """生成任务清单：(姿势 × 表情) 全组合打散后取前 N，场景按权重随机铺开"""
    combos = [(p, f) for p in range(len(POSES)) for f in range(len(FACES))]
    random.shuffle(combos)                      # 固定 seed，可复现
    weights = [s[2] for s in SCENES]
    jobs = []
    for char in CHARS:
        for idx in range(min(per_char, len(combos))):
            p, f = combos[idx]
            s = random.choices(range(len(SCENES)), weights=weights, k=1)[0]
            jobs.append((char, p, f, s, idx))
    return jobs


def post(path, payload):
    req = urllib.request.Request(HOST + path, data=json.dumps(payload).encode("utf-8"),
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_json(path):
    with urllib.request.urlopen(HOST + path, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_bytes(path):
    with urllib.request.urlopen(HOST + path, timeout=180) as r:
        return r.read()


def run(wf, timeout=600):
    pid = post("/prompt", {"prompt": wf, "client_id": CLIENT_ID})["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = get_json("/history/" + pid)
        if pid in h:
            for out in h[pid].get("outputs", {}).values():
                for im in out.get("images", []):
                    return im
            raise RuntimeError("无输出")
        time.sleep(1.2)
    raise TimeoutError("超时")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--char", default="", help="ds / cl / 留空=两个都跑")
    ap.add_argument("--per-char", type=int, default=36)
    ap.add_argument("--limit", type=int, default=0, help="只跑前 N 张（试跑用）")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--seed-offset", type=int, default=0, help="换一批时改这个数")
    args = ap.parse_args()

    random.seed(20261004 + args.seed_offset)
    jobs = plan(args.per_char)
    if args.char:
        jobs = [j for j in jobs if j[0] == args.char]
    if args.limit:
        jobs = jobs[:args.limit]

    if args.list:
        for (char, p, f, s, i) in jobs:
            print(f"{char} #{i:02d}  pos={POSES[p][1]:26s} face={FACES[f].split(',')[0]:14s} scene={SCENES[s][1]}")
        print("共 %d 张" % len(jobs))
        return

    from PIL import Image
    ok = 0
    for n, (char, p, f, s, i) in enumerate(jobs, 1):
        c = CHARS[char]
        d = os.path.join(OUT_ROOT, c["trigger"])
        os.makedirs(d, exist_ok=True)
        stem = "%03d" % (i + 1 + args.seed_offset * 1000)
        img_path = os.path.join(d, stem + ".png")
        txt_path = os.path.join(d, stem + ".txt")
        if os.path.exists(img_path) and os.path.exists(txt_path):
            print("[%d/%d] 跳过 %s" % (n, len(jobs), stem)); continue
        seed = c["seed"] + i + args.seed_offset * 1000
        wf, cap, pos = build(char, p, f, s, seed)
        try:
            t0 = time.time()
            im = run(wf)
            q = urllib.parse.urlencode({"filename": im["filename"],
                                        "subfolder": im.get("subfolder", ""),
                                        "type": im.get("type", "output")})
            data = get_bytes("/view?" + q)
            Image.open(io.BytesIO(data)).convert("RGB").save(img_path, "PNG", optimize=True)
            with open(txt_path, "w", encoding="utf-8") as fh:
                fh.write(cap + "\n")
            print("[%d/%d] %s/%s  %.1fs  %s" % (n, len(jobs), c["trigger"], stem,
                                                time.time() - t0, POSES[p][1][:28]), flush=True)
            ok += 1
        except Exception as e:
            print("[%d/%d] 失败 %s: %s" % (n, len(jobs), stem, e), flush=True)
    print("\n完成 %d 张 → %s" % (ok, os.path.relpath(OUT_ROOT, ROOT)))


if __name__ == "__main__":
    sys.exit(main())

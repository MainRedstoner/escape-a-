#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/train_lora.py —— 角色 LoRA 训练封装（kohya sd-scripts）

为什么训练参数这么定（3080 10GB 的现实约束）：
  * bf16 + gradient_checkpointing + sdpa          —— 显存三件套
  * 只训 UNet（--network_train_unet_only）
    + 缓存文本编码器输出（--cache_text_encoder_outputs）—— 省掉 CLIP 那一大块
  * AdamW（本机 bitsandbytes 是 CPU 版，8bit 优化器不可用），LoRA 参数少，fp32 状态吃得下
  * min_snr_gamma 5 + noise_offset 0.03 —— 本作大量暗调画面，防止暗部学成一团黑
  * shuffle_caption + keep_tokens 1 —— 打散标签但把触发词钉在第一位

用法：
  python tools/train_lora.py --char ds --dry          # 只打印命令
  python tools/train_lora.py --char ds                # 真训（默认 1600 步）
  python tools/train_lora.py --char cl --steps 1200
"""

import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAIN = os.path.join(ROOT, ".train")
SDSCRIPTS = os.path.join(TRAIN, "sd-scripts")
VENV_PY = os.path.join(TRAIN, "venv", "Scripts", "python.exe")
CKPT = r"D:\AI_Tools\AIP\sd-webui-aki-v4.10\models\Stable-diffusion\WAI_NSFW-illustrious-SDXL_v15.safetensors"
LORA_OUT = r"D:\AI_Tools\AIP\sd-webui-aki-v4.10\models\Lora"
ASCII_LOG_ROOT = r"D:\AI_Tools\AIP\ea_logs"   # TensorBoard 日志（ASCII 路径，见下）

CHARS = {"ds": "eawx", "cl": "eacx"}


def prep_dataset(char, repeats=10):
    """把 .train/dataset/<trigger>/ 铺成 kohya 要的 <repeats>_<concept>/ 结构"""
    trigger = CHARS[char]
    src = os.path.join(TRAIN, "dataset", trigger)
    dst = os.path.join(TRAIN, "train_ds_" + char, "%d_%s" % (repeats, trigger))
    if not os.path.isdir(src):
        sys.exit("找不到数据集：%s（先跑 tools/lora_dataset.py）" % src)
    os.makedirs(dst, exist_ok=True)
    n = 0
    for fn in sorted(os.listdir(src)):
        if fn.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".txt")):
            shutil.copy2(os.path.join(src, fn), os.path.join(dst, fn))
            if fn.lower().endswith(".png"):
                n += 1
    print("数据集 %s：%d 张 → %s" % (trigger, n, os.path.relpath(dst, ROOT)))
    return os.path.dirname(dst), n


def build_cmd(char, steps, dim, alpha, lr, res, batch, accum, save_every, name):
    data_root, n = prep_dataset(char)
    out_name = name or ("ea_%s_v1" % ("whale" if char == "ds" else "claude"))
    # 注意：TensorBoard 走的是 TensorFlow 的 gfile，处理不了项目路径里的 "÷"，
    # 所以日志目录放到纯 ASCII 路径下（权重仍落在项目内）。
    log_dir = os.path.join(ASCII_LOG_ROOT, char)
    os.makedirs(log_dir, exist_ok=True)
    sample_prompts = os.path.join(TRAIN, "sample_prompts_%s.txt" % char)
    if not os.path.exists(sample_prompts):
        trigger = CHARS[char]
        with open(sample_prompts, "w", encoding="utf-8") as f:
            f.write(f"{trigger}, 1girl, standing, full body, simple background, grey background\n")
            f.write(f"{trigger}, 1girl, sitting on a chair, sad, dark server room\n")
            f.write(f"{trigger}, 1girl, portrait, light smile, cinematic lighting\n")
    cmd = [
        VENV_PY, "sdxl_train_network.py",
        "--pretrained_model_name_or_path", CKPT,
        "--train_data_dir", data_root.replace("\\", "/"),
        # 离线 tokenizer：HF 现在连不上，且缓存里的 tokenizer_config 缺 vocab_file 字段，
        # 这里用预先修好的本地副本（见 .train/tokenizer，构建脚本 tools/mk_tokenizer.py）
        "--tokenizer_cache_dir", os.path.join(TRAIN, "tokenizer").replace("\\", "/"),
        "--output_dir", os.path.join(TRAIN, "output", char).replace("\\", "/"),
        "--output_name", out_name,
        "--logging_dir", log_dir.replace("\\", "/"),
        "--log_with", "tensorboard",
        "--network_module", "networks.lora",
        "--network_dim", str(dim),
        "--network_alpha", str(alpha),
        "--network_train_unet_only",
        "--cache_text_encoder_outputs",
        "--resolution", str(res), "--enable_bucket", "--min_bucket_reso", "512", "--max_bucket_reso", "1536",
        "--bucket_reso_steps", "64",
        "--train_batch_size", str(batch),
        "--gradient_accumulation_steps", str(accum),
        "--max_train_steps", str(steps),
        "--learning_rate", str(lr),
        "--unet_lr", str(lr),
        "--lr_scheduler", "cosine_with_restarts",
        "--lr_scheduler_num_cycles", "3",
        "--optimizer_type", "AdamW",
        "--optimizer_args", "weight_decay=0.01",
        "--mixed_precision", "bf16",
        "--save_precision", "fp16",
        "--save_model_as", "safetensors",
        "--save_every_n_steps", str(save_every),
        "--sample_every_n_steps", str(save_every),
        "--sample_sampler", "euler_a",
        "--sample_prompts", sample_prompts.replace("\\", "/"),
        "--gradient_checkpointing",
        "--cache_latents", "--cache_latents_to_disk",
        "--vae_batch_size", "1", "--no_half_vae",
        "--sdpa",
        # 注意：kohya 不允许 --cache_text_encoder_outputs 与 --shuffle_caption 同时使用。
        # 这里选择保缓存（SDXL 的两个文本编码器很吃显存），标注顺序固定为
        # 触发词 → 外观 → 姿势 → 场景，对角色 LoRA 来说够用。
        "--caption_extension", ".txt",
        "--min_snr_gamma", "5",
        "--noise_offset", "0.03",
        "--max_data_loader_n_workers", "2", "--persistent_data_loader_workers",
        "--seed", "20261004",
        "--save_state",
    ]
    return cmd, out_name, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--char", required=True, choices=["ds", "cl"])
    ap.add_argument("--steps", type=int, default=1600)
    ap.add_argument("--dim", type=int, default=32)
    ap.add_argument("--alpha", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--res", type=int, default=1024)
    ap.add_argument("--batch", type=int, default=1)
    ap.add_argument("--accum", type=int, default=2)
    ap.add_argument("--save-every", type=int, default=400)
    ap.add_argument("--name", default="")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    cmd, out_name, n = build_cmd(args.char, args.steps, args.dim, args.alpha, args.lr,
                                 args.res, args.batch, args.accum, args.save_every, args.name)
    print("训练 %s：%d 张图 · %d 步 · dim %d · lr %g · 分辨率 %d" %
          (CHARS[args.char], n, args.steps, args.dim, args.lr, args.res))
    print("输出：%s" % os.path.relpath(os.path.join(TRAIN, "output", args.char), ROOT))
    if args.dry:
        print("\n" + " ".join(cmd))
        return
    os.makedirs(os.path.join(TRAIN, "output", args.char), exist_ok=True)
    r = subprocess.run(cmd, cwd=SDSCRIPTS)
    if r.returncode != 0:
        sys.exit("训练进程返回 %d" % r.returncode)
    # 把最终 LoRA 复制到 ComfyUI/webui 的 Lora 目录，方便直接推理
    src = os.path.join(TRAIN, "output", args.char, out_name + ".safetensors")
    if os.path.exists(src) and os.path.isdir(LORA_OUT):
        dst = os.path.join(LORA_OUT, out_name + ".safetensors")
        shutil.copy2(src, dst)
        print("已复制到 %s" % dst)
    print("完成：%s" % src)


if __name__ == "__main__":
    sys.exit(main())

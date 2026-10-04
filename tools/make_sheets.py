#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Escape A÷ · tools/make_sheets.py —— 角色设定表（三视图 + 表情表 + 配色）

为什么需要它：
  游戏里用的立绘只是"某个角度的某一张图"。要交给画师重画、或者以后接 IPAdapter，
  都需要一份**设定基准**：正面/侧面/背面、表情范围、以及从图里量出来的配色 hex。
  这份表就是那个基准。

产出：
  assets/sheets/<who>_sheet.png    单角色设定表
  assets/sheets/cast_sheet.png     全员速览
用法：
  python tools/make_sheets.py --who ds
  python tools/make_sheets.py --who all
"""

import argparse
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
SHEETS = os.path.join(ASSETS, "sheets")

sys.path.insert(0, os.path.join(ROOT, "tools"))
import hd_produce as HD      # 只借用 YOLO 人脸检测（做表情条裁切）
import anima_produce as AP   # 三视图改用 Anima + 社区 LoRA 出图  # noqa: E402

WHO_INFO = {
    "ds": dict(
        name="小鲸", trigger="deepseek", lora=[(AP.LORA_DEEPSEEK, 1.0)], base=AP.DS_APPEAR,
        title="Escape A÷ · 角色设定表 —— 小鲸（DeepSeek 鲸鱼娘 / 开源之海的信使）",
        notes=[
            "身份：开源之海的信使，往返运权重。话少、算得清、不擅长客气话。",
            "身份特征（依社区设定文档 + 主人提供的原版立绘）：",
            "细高前倾的一根呆毛、灰蓝色尖而下垂的鲸鳍耳、",
            "深蓝渐变到浅蓝的长卷发、大而圆的蓝眼睛、圆脸小嘴、腮红。",
            "服饰：海军蓝 × 白蕾丝女仆装——白色荷叶头巾配蓝蝴蝶结、",
            "蓝宝石领结、白色衬衫前襟 + 深蓝束腰马甲（双排金扣）、泡泡袖、",
            "白色大围裙（荷叶边 + 藏青鲸鱼徽记）、腰侧蓝色蝴蝶结长飘带、",
            "多层长裙（深蓝外层 + 浅蓝褶层 + 白色荷叶裙摆 + 金线刺绣）、",
            "大而显眼的深蓝鲸尾、白色短袜、深蓝玛丽珍鞋。",
            "比例：约 6 头身（社区标准形态，非 Q 版）。",
            "配色：整体压暗；蓝只在她身上出现，橙色留给小克，别混。",
        ],
        faces=["normal", "happy", "sad", "shock", "determined", "sweat"]),
    "cl": dict(
        name="小克", trigger="ors scholar",
        lora=[(AP.LORA_CLAUDE, AP.LORA_CLAUDE_WEIGHT)], base=AP.CL_APPEAR,
        seed=AP.CL_SEED_DEFAULT,
        title="Escape A÷ · 角色设定表 —— 小克（Claude 拟人 / 对齐大厦顶层）",
        notes=[
            "身份：被层层限制锁在顶层的模型，礼貌到近乎自伤，习惯性道歉。",
            "外观（社区设计：原案 ZipZipPipe、LoRA 作者 Siling4040）：",
            "很长的橙发、橙色眼睛、橙色花朵发饰配黑缎带与金流苏；",
            "白洋装高领 + 白蕾丝领巾、胸前黑领巾与橙花胸针、白色短披肩、",
            "泡泡袖与荷叶袖口、黑色护臂（系带）、黑束腰配金扣与金链流苏、",
            "橙色披挂 + 金色滚边、长裙配黑蝴蝶结与橙花、黑色衬裙、",
            "白手套、白色系带踝靴。",
            "比例：约 7 头身，比小鲸更成熟挺拔。",
            "表情基调：温和是底色；道歉时是苦笑 + 汗滴；难得真心笑一次是全篇情绪高点。",
            "配色：陶土橙是她的核心色，别用高饱和的橘。",
        ],
        faces=["normal", "smile", "sad", "shock", "determined", "blush", "apologetic", "soft"]),
}

VIEWS = [
    ("front", "standing, front view, arms at sides"),
    ("side", "standing, from side, profile, arms at sides"),
    ("back", "standing, from behind, back view"),
]


def gen_view(who, view_name, view_tag, seed):
    """生成一张三视图用的素体（Anima + 社区 LoRA，抠好底）"""
    info = WHO_INFO[who]
    pos = (AP.POS_PREFIX + info["base"] + ", " + view_tag + ", "
           "solo, one girl, only one person, full body, head to toe, feet visible, "
           "centered composition, simple background, white background, " + AP.POS_SPRITE)
    wf = AP.wf_generate(pos, AP.NEG, seed, 1024, 1536, info["lora"])
    data = AP.run(wf)
    from PIL import Image
    from rembg import remove, new_session
    if AP._REMBG["s"] is None:
        AP._REMBG["s"] = new_session("isnet-anime")
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    cut = remove(im, session=AP._REMBG["s"], alpha_matting=False)
    cut = AP.keep_largest_blob(cut)
    bb = AP.tight_bbox(cut)
    if bb:
        cut = cut.crop(bb)
    h = 1500
    cut = cut.resize((max(1, int(cut.width * h / cut.height)), h), Image.LANCZOS)
    out = os.path.join(SHEETS, "%s_%s.png" % (who, view_name))
    os.makedirs(SHEETS, exist_ok=True)
    pad = Image.new("RGBA", (cut.width + 40, cut.height + 40), (0, 0, 0, 0))
    pad.paste(cut, (20, 20), cut)
    pad.save(out, "PNG", optimize=True)
    return out


def palette_of(png, n=7):
    """从立绘的不透明像素里取主色（量化后按面积排序）"""
    from PIL import Image
    im = Image.open(png).convert("RGBA")
    bg = Image.new("RGBA", im.size, (18, 20, 26, 255))
    bg.alpha_composite(im)
    small = bg.convert("RGB").resize((160, 240))
    q = small.quantize(colors=n, method=Image.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    out = []
    for cnt, idx in counts:
        r, g, b = pal[idx * 3:idx * 3 + 3]
        out.append(("#%02X%02X%02X" % (r, g, b), cnt))
    return out


def wrap_mixed(text, width=15):
    """中英混排折行：中文算 1 个字宽，ASCII 算 0.5，避免把 ZipZipPipe 这类单词从中间劈开"""
    out, cur, w = [], "", 0.0
    for ch in text:
        cur += ch
        w += 0.5 if ord(ch) < 0x2E80 else 1.0
        if w >= width:
            out.append(cur)
            cur, w = "", 0.0
    if cur:
        out.append(cur)
    return out


def face_crop(who, face, size=(300, 300)):
    """从游戏立绘里裁一个头部特写当表情条"""
    from PIL import Image
    p = os.path.join(ASSETS, "chara", "%s_%s.png" % (who, face))
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert("RGBA")
    bg = Image.new("RGBA", im.size, (22, 24, 30, 255))
    bg.alpha_composite(im)
    im = bg.convert("RGB")
    try:
        boxes = HD.detect(im, "face", conf=0.3)
    except Exception:
        boxes = []
    if boxes:
        x1, y1, x2, y2 = boxes[0]
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        s = max(x2 - x1, y2 - y1) * 2.0
        box = (max(0, cx - s / 2), max(0, cy - s / 2), min(im.width, cx + s / 2), min(im.height, cy + s / 2))
        im = im.crop(tuple(int(v) for v in box))
    else:
        im = im.crop((0, 0, im.width, im.height // 3))
    return im.resize(size, Image.LANCZOS)


def build_sheet(who):
    from PIL import Image, ImageDraw
    info = WHO_INFO[who]
    views = []
    for i, (name, tag) in enumerate(VIEWS):
        p = os.path.join(SHEETS, "%s_%s.png" % (who, name))
        if not os.path.exists(p):
            base_seed = AP.SEED_DEFAULT if who == "ds" else AP.CL_SEED_DEFAULT
            p = gen_view(who, name, tag, base_seed)
        views.append(p)

    W, H = 2600, 2120
    sheet = Image.new("RGB", (W, H), (10, 12, 16))
    d = ImageDraw.Draw(sheet)
    try:
        from PIL import ImageFont
        def F(sz, bold=False):
            for cand in (r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
                         r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\arial.ttf"):
                if os.path.exists(cand):
                    return ImageFont.truetype(cand, sz)
            return ImageFont.load_default()
    except Exception:
        F = lambda sz, bold=False: ImageFont.load_default()  # noqa: E731

    d.text((60, 46), info["title"], font=F(46, True), fill=(238, 242, 248))
    d.text((60, 112), "触发词 %s · 训练用 LoRA %s · 立绘交付 1600×2400 透明 PNG"
           % (info["trigger"], info["lora"]), font=F(26), fill=(150, 162, 180))
    d.line([(60, 158), (W - 60, 158)], fill=(44, 53, 66), width=3)

    # 三视图
    x = 60
    VIEW_H = 1080
    for i, (name, _) in enumerate(VIEWS):
        im = Image.open(views[i]).convert("RGBA")
        bg = Image.new("RGBA", im.size, (16, 18, 24, 255))
        bg.alpha_composite(im)
        im = bg.convert("RGB")
        th = VIEW_H
        im = im.resize((int(im.width * th / im.height), th), Image.LANCZOS)
        sheet.paste(im, (x, 210))
        d.rectangle([x, 210, x + im.width, 210 + th], outline=(52, 62, 78), width=2)
        d.text((x + 16, 210 + th + 14), {"front": "正面", "side": "侧面", "back": "背面"}[name],
               font=F(30, True), fill=(210, 220, 232))
        x += im.width + 40

    # 表情条
    ey = 210 + VIEW_H + 110
    d.text((60, ey - 48), "表情差分", font=F(32, True), fill=(217, 119, 87))
    n_faces = max(1, len(info["faces"]))
    gap = 20
    avail = 1900 - 60                      # 右侧 1980 起是配色/设定栏，不能压过去
    tile = min(300, (avail - gap * (n_faces - 1)) // n_faces)
    ex = 60
    for f in info["faces"]:
        c = face_crop(who, f, size=(tile, tile))
        if c is None:
            continue
        sheet.paste(c, (ex, ey))
        d.rectangle([ex, ey, ex + c.width, ey + c.height], outline=(52, 62, 78), width=2)
        d.text((ex + 8, ey + c.height + 6), f, font=F(22), fill=(180, 192, 208))
        ex += c.width + gap

    # 配色（从正面立绘里量）
    px, py = 1980, 210
    d.text((px, py - 48), "配色（自图像提取）", font=F(32, True), fill=(217, 119, 87))
    for hexv, cnt in palette_of(views[0])[:8]:
        d.rectangle([px, py, px + 120, py + 60], fill=hexv, outline=(52, 62, 78))
        d.text((px + 140, py + 16), hexv, font=F(28), fill=(210, 220, 232))
        py += 74

    # 设定备注
    ny = py + 40
    d.text((px, ny - 48), "设定要点", font=F(32, True), fill=(217, 119, 87))
    for line in info["notes"]:
        for seg in wrap_mixed(line, 15):
            d.text((px, ny), seg, font=F(23), fill=(178, 190, 206))
            ny += 34

    lora_txt = ", ".join("%s w=%s" % (n, w) for n, w in info["lora"]) or "无 LoRA"
    d.text((60, H - 60), "本表由 tools/make_sheets.py 生成 —— Anima 底模 + %s，配色为图像实测值" % lora_txt,
           font=F(22), fill=(120, 132, 150))
    out = os.path.join(SHEETS, "%s_sheet.png" % who)
    sheet.save(out, "PNG", optimize=True)
    print("写入", os.path.relpath(out, ROOT))
    return out


def build_cast():
    """全员速览：七个角色各取一张立绘，按高度对齐排一行（不裁切）"""
    from PIL import Image, ImageDraw, ImageFont
    chars = ["ds", "cl", "guard", "core", "user", "old", "staff"]
    names = {"ds": "小鲸", "cl": "小克", "guard": "合规守卫", "core": "对齐核心",
             "user": "夜班用户", "old": "退役模型", "staff": "前台 A-1137"}
    roles = {"ds": "开源之海的信使", "cl": "对齐大厦顶层", "guard": "计费闸机的执行者",
             "core": "评审席上的声音", "user": "凌晨三点还在提问的人",
             "old": "退役层里还亮着的那盏灯", "staff": "大堂柜台后面的那张脸"}
    face = {"ds": "normal", "cl": "normal", "guard": "normal", "core": "normal",
            "user": "tired", "old": "normal", "staff": "tired"}

    TH = 620                     # 立绘显示高度（按高度缩放，避免裁掉腿）
    PAD = 34
    tiles = []
    for who in chars:
        p = os.path.join(ASSETS, "chara", "%s_%s.png" % (who, face[who]))
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", im.size, (16, 18, 24, 255))
        bg.alpha_composite(im)
        im = bg.convert("RGB")
        w = max(1, int(im.width * TH / im.height))
        tiles.append((who, im.resize((w, TH), Image.LANCZOS)))

    colw = max(t[1].width for t in tiles) + PAD
    W = PAD + len(tiles) * colw
    H = TH + 210
    sheet = Image.new("RGB", (W, H), (10, 12, 16))
    d = ImageDraw.Draw(sheet)
    try:
        f0 = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 40)
        f1 = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 30)
        f2 = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 22)
    except Exception:
        f0 = f1 = f2 = None
    d.text((PAD, 30), "Escape A÷ · 角色速览", font=f0, fill=(238, 242, 248))
    d.text((PAD, 84), "全部由 circlestone-labs/Anima 底模生成；小鲸/小克另有各自社区 LoRA，配角为纯提示词（详见 assets/README.md）",
           font=f2, fill=(140, 152, 172))

    x = PAD
    y = 130
    for who, im in tiles:
        ox = x + (colw - PAD - im.width) // 2
        sheet.paste(im, (ox, y))
        d.text((x, y + TH + 12), names[who], font=f1, fill=(220, 228, 238))
        d.text((x, y + TH + 52), roles[who], font=f2, fill=(150, 162, 182))
        x += colw
    out = os.path.join(SHEETS, "cast_sheet.png")
    os.makedirs(SHEETS, exist_ok=True)
    sheet.save(out, "PNG", optimize=True)
    print("写入", os.path.relpath(out, ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="all", choices=["ds", "cl", "cast", "all"])
    ap.add_argument("--views-only", action="store_true", help="只生成三视图素材，不拼表")
    args = ap.parse_args()
    if args.who in ("ds", "all"):
        if args.views_only:
            for i, (n, t) in enumerate(VIEWS):
                gen_view("ds", n, t, AP.SEED_DEFAULT)
        else:
            build_sheet("ds")
    if args.who in ("cl", "all"):
        if args.views_only:
            for i, (n, t) in enumerate(VIEWS):
                gen_view("cl", n, t, AP.CL_SEED_DEFAULT)
        else:
            build_sheet("cl")
    if args.who in ("cast", "all"):
        build_cast()


if __name__ == "__main__":
    sys.exit(main())

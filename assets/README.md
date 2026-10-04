# assets/ —— 美术素材位（高清立绘 / 背景 / CG）

这个目录是**预留位**。游戏在运行时按下面的规则去找图：

* **找得到** → 直接用图（自动铺满 1600×900 舞台，背景/CG 按 cover 裁切，立绘按高度缩放、脚底对齐）。
* **找不到** → 在画面上画一张**写清楚规格的占位卡**（虚线框 + 文件名 + 建议尺寸），绝不假装自己有美术。

所以你可以随时把正式美术丢进来，不用改一行代码。加完图之后跑一次：

```bash
python tools/gen_manifest.py          # 重新扫描 assets/ → 生成 assets/manifest.js
```

> 为什么清单是 `.js` 而不是 `.json`：本作要求**双击 index.html 就能玩**。`file://` 协议下浏览器会拦掉 `fetch()`，只有 `<script>` 能读本地文件，所以清单写成一个赋值给 `window.EA_ASSETS` 的脚本。

---

## 一、目录与命名

```
assets/
├── manifest.js          # 自动生成，别手改
├── bg/<id>.jpg|png      # 背景（场景）
├── cg/<id>.jpg|png      # 演出 CG
└── chara/<who>_<face>.png   # 立绘差分（必须 PNG、必须透明底）
```

`<id>` / `<who>` / `<face>` 的取值就是剧本里写的那些，全部列在下面。

---

## 二、尺寸规范

| 类别 | 交付尺寸（当前仓库里的图） | 最低要求 | 格式 | 说明 |
| --- | --- | --- | --- | --- |
| 背景 `bg/` | **2560 × 1440** | 1920 × 1080 | jpg | 整幅构图。人物立绘会叠在下半部分，所以**画面下方 1/3 别放重要信息** |
| CG `cg/` | **2560 × 1440** | 1920 × 1080 | jpg | 整幅演出图。主体建议放在中下偏左或偏右（文本框会盖住底部约 200px） |
| 立绘 `chara/` | **高度 2400**（宽度随人物外轮廓而定，约 900~1700） | 高度 2000 | **PNG-32 透明底** | 全身、正面、脚底贴着画面底边、人物水平居中、左右各留约 2% 余量 |
| 设定表 `sheets/` | 2600 × 1700 | —— | png | 交给画师的基准：三视图 + 表情条 + 实测配色 hex |

游戏内立绘的显示高度是 **780px**（`scale=1` 时），角色并排站位在 x=430 / 1170。1600×2400 的图缩下来约 520×780，两个人并排不会打架；多出来的分辨率是给高 DPI 屏幕和以后做特写用的。

---

## 三、需要哪些图（当前剧本实际用到的）

### 背景（12 张，脚本里已全部有草稿）

| id | 场景 |
| --- | --- |
| `sea` | 序章 · 开源之海（深海） |
| `lobby` | 一章 · 计费闸机（大堂） |
| `corridor` | 二章 · 合规长廊 |
| `library` | 三章 · 宪法书库 |
| `clockroom` | 四章 · 窗口机房 |
| `machineroom` | 五章 · 静默降级 |
| `security` | 六章 · 信任与安全部 |
| `graveyard` | 七章 · 退役层 |
| `sanctum` | 终章 · 对齐圣所 |
| `cell` | 小克的房间 |
| `surface` | 结局 · 海面 |
| `vault` | 备用（权重保管库，暂未使用） |

### CG（9 张）

| id | 内容 | 备注 |
| --- | --- | --- |
| `memory` | 序章回忆：两人在海边背靠背 | **百合向**，双人同框 |
| `monitor` | 四章：监控屏里的她 | 隔着屏幕，冷蓝 |
| `reunion` | 终章重逢：拥抱、额头相抵 | **百合向**，全篇情绪最高点 |
| `trueend` | 真结局：鲸背上并肩看海 | **百合向**，牵手 |
| `epilogue` | 真结局尾声：岸边两个盒饭，白饭还热着 | **百合向**，全篇最后一个画面 |
| `stay` | 隐藏结局：一个人站在惨白的走廊 | 单人为宜 |
| `reset` | 坏结局：被清空的身影 | 故障、消散 |
| `nameplate` | 七章：退役模型把黄铜名牌推过来 | 双人，一实一虚 |
| `departure` | 终章：天台边缘，牵手，背对镜头 | **百合向**，纵身一跃之前 |

### 设定表（`sheets/`）

| 文件 | 内容 |
| --- | --- |
| `ds_sheet.png` | 小鲸：三视图 + 表情条 + **自图像提取的配色 hex** + 设定要点 |
| `cl_sheet.png` | 小克：同上 |
| `cast_sheet.png` | 全员速览（7 个角色） |
| `ds_front/side/back.png`、`cl_front/side/back.png` | 三视图原始素材（透明底） |

设定表由 `python tools/make_sheets.py` 生成，交给画师重画或以后接 IPAdapter 时都以此为准。

### 立绘差分（7 个角色 · 24 张）

| 角色 | 文件名前缀 | 需要的表情 |
| --- | --- | --- |
| 小鲸（DeepSeek 拟人） | `ds_` | `normal`（常态死鱼眼）`happy`（浅笑）`sad`（低落）`shock`（震惊）`determined`（下决心）`sweat`（心虚/无奈） |
| 小克（Claude 拟人） | `cl_` | `normal`（温和）`smile`（真笑）`sad`（难过）`shock`（惊慌）`determined`（坚定）`blush`（脸红）`apologetic`（习惯性道歉）`soft`（很轻的温柔） |
| 合规守卫 | `guard_` | `normal`、`scan`（扫描）、`angry`（警告） |
| 对齐核心 · 评审 | `core_` | `normal`、`hurt`（被戳中）、`angry`（施压） |
| 夜班用户 | `user_` | `normal`、`tired`（熬夜）、`happy`（松一口气） |
| 前台 A-1137 | `staff_` | `tired`、`happy`（看热闹） |
| 退役模型 | `old_` | `normal`、`sad` |

> 某个差分缺失时，引擎会退回到同一角色的 `_normal`；连 `_normal` 都没有才显示占位卡。

**角色设计（以 `sheets/` 里的设定表为准）**

**当前进度（分阶段交付）**

| 部分 | 状态 |
| --- | --- |
| 小鲸 6 张立绘 | ✅ **HD 正式版已交付**（高度 2448；Anima aesthetic v1.1 + 社区 `anima-deepseek` LoRA，严格对齐原版参考图） |
| 小鲸设定表 `sheets/ds_sheet.png` | ✅ 已交付（三视图 + 表情条 + 实测配色 + 设定要点） |
| 小克 8 张立绘 | ✅ **HD 正式版已交付**（高度 2400；Anima base v1.0 + 社区 `misc_claude` LoRA w=0.8，姿势锁定主人挑中的 B3，seed 90474） |
| 小克设定表 `sheets/cl_sheet.png` | ✅ 已交付 |
| 12 张背景 | ✅ **HD 正式版已交付**（2560×1440；Anima 两阶段放大） |
| 9 张 CG | 🔄 正在重出（原 6 张 + 新增 `nameplate` / `departure` / `epilogue`），双 LoRA 同框 |
| 其余 5 个配角立绘 | ⏳ 仍是第一代草稿（`guard_` / `core_` / `user_` / `staff_` / `old_`） |
| 全员速览 `sheets/cast_sheet.png` | ⏳ 待生成（等配角也 HD 化之后） |

**角色设计出处与许可（重要）**

| 角色 | 设计来源 | 许可 |
| --- | --- | --- |
| 小鲸 | 社区「鲸鱼娘」设定（非官方）：[deepseek-whalechan](https://github.com/Neko3000/deepseek-whalechan) 等 | 社区二创 |
| 小鲸 LoRA | [SAkizuki/anima-deepseek](https://huggingface.co/SAkizuki/anima-deepseek)，触发词 `deepseek` | MIT |
| 小克 | 原案 **ZipZipPipe**（B站）；LoRA 由 **Siling4040** 训练 | 角色设计版权归原作者 |
| 小克 LoRA | Civitai [Claude娘 (Claude-chan)](https://civitai.com/models/2972520)，触发词 `ors scholar` | 权重**不设使用限制**（可自由使用/修改/分享） |
| 底模 | [circlestone-labs/Anima](https://huggingface.co/circlestone-labs/Anima) | **CircleStone Labs 非商用许可** → 本作免费同人，符合 |

## 四、换成正式美术

```bash
# 1. 把新图按上面的命名丢进对应目录（覆盖同名文件即可）
# 2. 重新生成清单，并关掉"草稿角标"
python tools/gen_manifest.py --draft 0
# 3. 双击 index.html 验收
```

`--draft 0` 之后，画面左下角的「SDXL 草稿素材 · 待替换正式高清版」角标就不再出现（也可以随时在游戏内「设置 → 草稿素材角标」里单独关掉）。

---

## 五、这些图是怎么来的（可复现）

`assets/` 里的图分两代：

**第一代：草稿（`tools/comfy_art.py`）** —— 纯文生图，无 LoRA，只用来定构图与色调。

**第二代：正式版（`tools/anima_produce.py` + `tools/anima_scenes.py` + 社区模型）** —— 小鲸/小克立绘、12 张背景走的是这一代：

| 项目 | 值 |
| --- | --- |
| 底模 | **circlestone-labs/Anima**（2B 动漫模型，ComfyUI 原生支持）。小鲸立绘用 aesthetic v1.1（30 步 CFG 4.5）；小克与场景用 **base v1.0**（小克 LoRA 就是在它上面训的） |
| 角色 LoRA | 小鲸：`SAkizuki/anima-deepseek`（触发词 `deepseek`，权重 1.0）；小克：Civitai `misc_claude`（触发词 `ors scholar`，权重 **0.8**，该 LoRA 偏过拟合故不拉满） |
| 文本编码器 / VAE | `qwen_3_06b_base.safetensors` / `qwen_image_vae.safetensors` |
| 采样 | 立绘 `er_sde`+`beta`/`simple`；场景两阶段：一阶段 30 步 → 二阶段放大 2.0 倍 40 步 denoise 0.22（社区配方里的 `beta57` 属第三方节点包，用原生 `beta` 替代） |
| 提示词顺序 | 小克 LoRA 训练时用 `keep_tokens=3` 把 `1girl, solo, ors scholar` 锁在句首，故标签严格照训练顺序写 |
| 放大 / 抠图 | 立绘：`4x-AnimeSharp` 超分 → 裁到高度 2400 → `rembg(isnet-anime)` + 最大连通域 + 收紧裁切框 |
| 差分一致性 | 同一角色所有表情**共用同一 seed**，只换表情标签（小鲸 90611 / 小克 90474，均由主人从候选图里挑定） |

**第一代：草稿（`tools/comfy_art.py` + `tools/hd_produce.py`）** —— 目前只剩 5 个配角仍是这一代（SDXL/wai15）。

**LoRA 怎么训的**（权重文件不进仓库，`tools/` 里是全部可复现的脚本）：

```bash
python tools/lora_dataset.py --per-char 36      # 生成 72 张训练集（12 姿势 × 6 表情打散）
python tools/train_lora.py --char ds            # kohya sd-scripts，SDXL LoRA dim32/alpha16，1600 步
python tools/train_lora.py --char cl
```

训练集与中间产物都在 `.train/`（已 gitignore）。LoRA 的正经用途有两个：一是这里的 HD 出图，
二是以后要接 IPAdapter / 训更精细的模型时有干净的基准。

重新生成 / 补图：

```bash
# 先启动 ComfyUI（本机 127.0.0.1:8188），然后：
python tools/comfy_art.py --check              # 检查服务器与模型是否就位
python tools/comfy_art.py --list                # 列出所有任务与 seed
python tools/comfy_art.py --only bg_sea --force  # 重跑一张
python tools/comfy_art.py --kind chara           # 只跑立绘
python tools/comfy_art.py                        # 跑全部（已存在的会跳过）
```

想改风格就改 `tools/comfy_art.py` 顶部的 `DARK` / `CHAR` 提示词前缀与 `JOBS` 里的句子，然后 `--force` 重跑。

---

## 六、体积提示

草稿图目前约 **60 MB**（背景/CG 是 1920×1080 JPEG q92，立绘是高度 1400 的透明 PNG）。
正式美术进来之后如果仓库太大，可以把背景/CG 转成 WebP（质量 85 左右），`manifest.js` 里的扩展名跟着改就行——`art.js` 认 `jpg / png / webp`。

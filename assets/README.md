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
| 小鲸 6 张立绘 | ✅ **HD 正式版已交付**（高度 2448，Anima + 社区 DeepSeek-chan LoRA，严格对齐原版参考图；`manifest.js` 里带 `pipeline` 标注、不挂草稿角标） |
| 小鲸设定表 `sheets/ds_sheet.png` | ✅ 已交付（三视图 + 表情条 + 实测配色 + 设定要点） |
| 小克 8 张立绘 | ⏳ 仍是第一代草稿（设计已定稿为 thebes 的 CC0 flower-Claude，待按同一管线重出） |
| 其余 5 个配角立绘 | ⏳ 第一代草稿 |
| 12 张背景 / 6 张 CG | ⏳ 第一代草稿（2560×1440 已达标，但未走 LoRA/hires/局部重绘） |
| 3 张新 CG（`nameplate` / `departure` / `epilogue`） | ⏳ 待生成（剧本里已埋好触发点） |



* **小鲸**（以主人提供的原版立绘为准，逐项对齐）：细高前倾的一根呆毛、灰蓝色尖而下垂的鲸鳍耳、深蓝渐变到浅蓝的长卷发、大而圆的蓝眼睛、圆脸小嘴腮红；白色荷叶头巾配蓝蝴蝶结、蓝宝石领结、白衬衫前襟 + 深蓝束腰马甲（双排金扣）、泡泡袖、白色大围裙（荷叶边 + **藏青鲸鱼徽记**）、腰侧蓝色蝴蝶结长飘带、多层长裙（深蓝外层 + 浅蓝褶层 + 白色荷叶裙摆 + 金线刺绣）、大而显眼的深蓝鲸尾、白色短袜、深蓝玛丽珍鞋。比例约 **6 头身**（社区标准形态，非 Q 版）。
  * 来源：[deepseek-whalechan](https://github.com/Neko3000/deepseek-whalechan)（角色设定文档与参考图库）、[deepseek-whale-girl](https://github.com/TreapGoGo/deepseek-whale-girl)（社区二创资源库）。均为非官方社区项目。
* **小克**：采用 **thebes（[@voooooogel](https://x.com/voooooogel)）以 CC0 发布的 flower-Claude 角色设计**——长橙发微卷、棕色眼睛、黑色缎带发结、橙色小花发饰、米白维多利亚洋装、黑色缎带与束腰、高领长袖。
  * 来源：[claudius-web](https://github.com/NoahBPeterson/claudius-web)（代码 MIT / **角色 CC0 by thebes**）。CC0 允许任何用途，本项目在此署名致谢。
* 基调：**这是暗色剧情向作品，不是福利向作品**。机位一律平视、不出现低角度或走光构图——生成与 LoRA 训练的负向词里已经把这条写死。

---

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

**第二代：正式版（`tools/anima_produce.py` + 社区模型）** —— 小鲸的 6 张立绘走的是这一代：

| 项目 | 值 |
| --- | --- |
| 底模 | **circlestone-labs/Anima**（2B 动漫模型，ComfyUI 原生支持；Aesthetic v1.1，30 步 CFG 4.5） |
| 角色 LoRA | **SAkizuki/anima-deepseek**（社区训练的 DeepSeek-chan LoRA，触发词 `deepseek`，权重 1.0） |
| 文本编码器 / VAE | `qwen_3_06b_base.safetensors` / `qwen_image_vae.safetensors` |
| 采样 | `er_sde` + `simple`；Turbo 变体（12 步 CFG 1）留作快速迭代 |
| 放大 | 生成 1024×1536 → `4x-AnimeSharp` 超分 → 裁切到高度 2400 |
| 抠图 | `rembg(isnet-anime)` + 只保留最大连通域 + 收紧裁切框 |
| 差分一致性 | 同一角色所有表情**共用同一 seed**，只换表情标签 |

> 为什么换管线：第一代正式版是我自己拿 SDXL(wai15) 训的 LoRA，比例/脸型/服装细节都偏离了原版设定。
> 现在这条路是**直接在原版设定的数据上训练的社区模型**，用来严格对齐原版。
> 许可：Anima 底模为 **CircleStone Labs 非商用许可**，LoRA 为 MIT —— 本作是免费同人作品，非商用，符合许可条件。

**第一代：草稿（`tools/comfy_art.py` + `tools/hd_produce.py`）** —— 小克、配角、背景、CG 目前仍是这一代（SDXL/wai15）。

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

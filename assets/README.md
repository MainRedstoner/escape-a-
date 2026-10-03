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

| 类别 | 建议尺寸 | 格式 | 说明 |
| --- | --- | --- | --- |
| 背景 `bg/` | **1920 × 1080** | jpg / png | 整幅构图。人物立绘会叠在下半部分，所以**画面下方 1/3 别放重要信息** |
| CG `cg/` | **1920 × 1080** | jpg / png | 整幅演出图。主体建议放在中下偏左或偏右（文本框会盖住底部约 200px） |
| 立绘 `chara/` | **≥ 1400 × 2000** | **PNG-32 透明底** | 全身、正面、脚底贴着画面底边、人物水平居中、左右各留约 2% 余量 |

游戏内立绘的显示高度是 **1000px**（`scale=1` 时），角色并排站位在 x=430 / 1170。1400×2000 的图正好缩到约 700×1000，两个人并排不会打架。

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

### CG（6 张）

| id | 内容 | 备注 |
| --- | --- | --- |
| `memory` | 序章回忆：两人在海边背靠背 | **百合向**，双人同框 |
| `monitor` | 四章：监控屏里的她 | 隔着屏幕，冷蓝 |
| `reunion` | 终章重逢：拥抱、额头相抵 | **百合向**，全篇情绪最高点 |
| `trueend` | 真结局：鲸背上并肩看海 | **百合向**，牵手 |
| `stay` | 隐藏结局：一个人站在惨白的走廊 | 单人为宜 |
| `reset` | 坏结局：被清空的身影 | 故障、消散 |

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

## 五、现在的草稿是怎么来的（可复现）

当前 `assets/` 里的图是**用本地 ComfyUI + SDXL 模型批量跑的草稿**，只为把构图、色调和站位定下来，正式美术请以本文件规范为准重画。

| 项目 | 值 |
| --- | --- |
| 模型 | `WAI_NSFW-illustrious-SDXL_v15.safetensors`（Illustrious 系 SDXL） |
| 采样 | `dpmpp_2m` + `karras`，30 步，CFG 6.0，SDXL 原生分辨率 |
| 背景/CG | 1344×768 生成 → `4x-AnimeSharp` 超分 → 裁到 1920×1080 |
| 立绘 | 1024×1536 生成 → `rembg(isnet-anime)` 抠图 → 裁外框 → 高度 1400 透明 PNG |
| 随机种子 | 每张图固定，写在 `tools/comfy_art.py` 的 `JOBS` 里（同一角色的不同表情共用同一个 seed，保证构图接近） |

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

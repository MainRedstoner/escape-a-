# 调试与排错手册

> 仓库现在**只用 Python 标准库**：运行时是浏览器里的普通 `<script>`，开发期工具是
> `tools/check_js.py` / `validate_script.py` / `simulate_playthrough.py`。
> 这个文档回答一件事：**出问题了，从哪看、怎么看、怎么复现**。

先记三条最常用的：

| 想干的事 | 怎么做 |
| --- | --- |
| 直接跳到某个场景 | `index.html?scene=<场景id>` |
| 看引擎现在走到哪了 | 控制台 `ENGINE.debug()` |
| 跑一遍提交前检查 | `python tools/check_js.py && python tools/validate_script.py && python tools/simulate_playthrough.py 40` |

---

## 1. 三种打开方式

| 方式 | 命令 | 存档后端 | 用途 |
| --- | --- | --- | --- |
| 双击 `index.html`（`file://`） | 无 | 浏览器本地（localStorage） | **交付形态**，每次改完都要用它过一遍 |
| 静态服务 | `python -m http.server 8765` | 浏览器本地（探测 `/api/ping` 失败后回落） | 只想换个环境看 http 行为时用；控制台可能有一条 `/api/ping` 404，属正常 |
| 存档服务 | `python server.py`（默认 8765） | 本机磁盘 `saves/` | 验证换浏览器读档、ETag / 409、服务断开回落 |

`server.py` 常用参数：`--port 0`（系统分配，启动时会打印 `LISTENING <端口>`）、
`--bind`、`--data-dir`、`--max-bytes`。

> 改完代码记得 **Ctrl+F5 硬刷新**。服务端已给静态文件加了 `no-cache`，但 `file://` 下
> 浏览器仍可能拿缓存，硬刷新最稳。

---

## 2. 控制台速查表

打开 DevTools（F12）→ Console，下面这些都能直接敲：

| 表达式 | 说明 |
| --- | --- |
| `ENGINE.debug()` | `{ scene, idx, pending, typing }`：当前场景、节点下标、正在等的节点类型、是否在打字 |
| `ENGINE.goto("c1_zero", 0)` | 直接跳到任意场景，**保留当前状态**；要干净状态就刷新页面用 `?scene=` |
| `ENGINE.setGlitch(true)` / `(false)` | 开关故障态（可以看滑道最左端的死选项） |
| `ENGINE.toTitle()` | 回标题画面 |
| `ENGINE.toast("测试")` | 弹一条提示，验证 UI 用 |
| `SYS.state` | 整个游戏状态（token 已移除；现在是 `trust / wanted / args / flags / pet / vis / history`） |
| `SYS.state.flags` / `SYS.state.args` | 当前旗标 / 已收集碎片 |
| `SYS.newState()` | 一份全新状态的样例（对照字段用） |
| `SYS.fragCount()` / `SYS.eggCount()` | 碎片 / 彩蛋数量 |
| `SYS.unlockedEndings()` | 跨周目已解锁的结局（存在 localStorage） |
| `SAVE.label` | 当前存档后端：`浏览器本地` / `本机存档服务` |
| `SAVE.backend` | `local` / `server` |
| `SAVE.hasAny()` / `SAVE.latest()` | 有没有档 / 最新的是哪个槽 |
| `SAVE.meta("1")` | 槽位摘要（同步，读的是缓存） |
| `await SAVE.read("1")` | 真正读一个槽位的 payload（异步） |
| `SAVE.describe(err)` | 把存档错误翻译成给人看的话 |
| `A3D.ok` / `A3D.failReason` | 3D 背景（WebGL2）是否可用；不可用时 `failReason` 说明原因 |
| `A3D.debugScene()` | 当前 3D 场景对象：`cam` / `lights` / `batches` / `dyn`，调光调构图时很好用 |
| `AUDIO.ambience("sea")` | 手动切环境音（冒泡 / 鸟叫 / 柴火 / 机柜嗡鸣），试听用 |
| `AUDIO.unlock()` | 手动解锁音频（自动播放被拦时用） |
| `AUDIO.playBGM("study")` / `AUDIO.sfx("ding")` | 试听某首 BGM / 某个音效（白名单见校验器 `BGMS` / `SFX`） |
| `CLAWD.owned` / `CLAWD.mood` / `CLAWD.lookX` | 桌宠是否到手 / 心情 / 当前视线方向 |

游戏用到的 localStorage 键（想手工构造 / 清理时有用）：

| 键 | 内容 |
| --- | --- |
| `ea_blob:save-<槽位>` | 存档信封（`save-1` / `save-2` / `save-3` / `save-auto`） |
| `ea_settings` | 文字速度 / 音量等设置 |
| `ea_endings` | 已解锁结局 |
| `ea_eggs_found` | 已发现的彩蛋 |

清空全部存档：`localStorage.clear()` 然后刷新。

---

## 3. URL 调试参数

```
index.html?scene=c1_perm&trust=6&wanted=2&args=frag_first,frag_pet&flags=pass_loss,pass_token
```

| 参数 | 作用 |
| --- | --- |
| `scene` | 启动后直接进这个场景（**会 `newState()`，进度不保留**） |
| `trust` / `wanted` | 初始数值（0~10） |
| `args` | 预先拿到的碎片 id，逗号分隔（用 `has('id')` 复现分支） |
| `flags` | 预先置真的旗标，逗号分隔（如 `pass_loss`、`pass_token`、`md_seen`） |
| `bg` | 标题画面上直接预览某个 3D 背景（美术调试用，如 `?bg=nvidia`），不开始剧情 |
| `q` | 强制 3D 画质：`?q=low` / `mid` / `high` / `auto`，覆盖设置里的档位 |
| `perf` | 打开左下角的性能面板（存在即生效，如 `?perf=1`），详见 3.5.1 |

注意：**`tokens` 参数已经移除**（Token 数值机制已删）。

常用直达场景：

| 场景 | 看什么 |
| --- | --- |
| `start` | 开场、标题画面之后的第一屏 |
| `p_lesson1` | 采样型滑道（有权重，显示百分比） |
| `p_clawd` | 抉择型滑道（等宽，不显示百分比） |
| `c1_zero` | 拿到 CLAUDE.md，碎片面板从此解锁 |
| `c1_perm` | 权限请求框（数字键 1/2/3） |
| `c1_try1` | 403 段落里的多次选择 |
| `c1_end` | 序章结局画面 |

---

## 3.5 3D 背景怎么调

背景是 `src/art3d/` 里现建的 WebGL2 场景（程序化几何 + 程序化贴图），不是图片。

**最快的看法：双击 `art-preview.html`**（`file://` 可用）。左侧切场景、
`全部场景` 生成缩略图、`游戏后期` 开关对比调色，`光影` 面板（或 `L`）调环境 / 每盏点光 / 后期色调的颜色和亮度，`复制 JSON` 一键复制（`file://` 下剪贴板不可用时回退到文本框）；底部有 FPS 和顶点数；
画面里可以 **拖拽旋转 / Shift 或右键拖拽平移 / 滚轮缩放 / WASD 移动 / QE 升降 / R 重置**，
`H` 纯净模式、`G` 缩略图、`1–9` 直选；滚轮现在只缩放，不再切场景。
`ds_room` 在游戏里是 `post:false`：跳过 2D 调色 / 暗角 / 颗粒（`A3D.postOf` 判断），但保留警报、闪白、故障这些玩法效果；预览页的「游戏后期」按钮在该场景禁用。

**右上角「游戏合成」按钮**是这个页面的第二种模式，也是测帧率该用的那个：

| 模式 | 走哪条路 | 用来干什么 |
| --- | --- | --- |
| 原始 3D（默认） | 固定 1600×900，每帧 `A3D.draw`，不做 3D 层节流 | 调光、调构图、看纯 WebGL 成本 |
| 游戏合成 | 游戏真实的 `ART.paint`：画质档 + 3D 层节流 + 2D 后期 + 立绘占位卡 | 测「游戏里到底多少帧」 |

合成模式下的两个下拉：**画质**（自动 / 低 / 中 / 高，和设置面板同源）、**立绘**
（无 / 单 / 双，占位卡的绘制成本是实打实的）。画布尺寸照抄 `engine.sizeCanvas`
的算法（`CSS 尺寸 / 1600 × dpr`，夹在 `[1, 1.5]`），所以底部读到的
`FPS / 画布 / 合成` 和游戏里 `?perf=1` 的面板的量级一致。

差别也有：合成模式只有画布这一层，没有 DOM 的文本框 / HUD / 桌宠。
所以它的帧率是**游戏的下限更好看**（DOM 那部分没算进去），适合做 A/B 对比和快速迭代；
要绝对数字还是以 `index.html?perf=1` 为准。

排查按这个顺序：

1. **先确认渲染层活着**：控制台 `A3D.ok` 应为 `true`；`false` 看 `A3D.failReason`。
   `ds_room` 的吊灯有真 cubemap 阴影：`A3D.debugScene().__shadow` 有对象才说明 shadow map 建成功；没有就是 FBO/深度贴图构建失败，看控制台 `[A3D] 阴影构建失败`。
   `A3D` 都没定义，通常是 `index.html` 的 `src/art3d/*.js` 没加载（顺序：core → textures → props → worlds → worlds2 → art）。2. **看控制台有没有 shader 报错**：着色器编译失败会打印完整源码和行号，按行号改 `src/art3d/core.js`。
3. **单独预览一个场景**：`index.html?bg=ds_room`（可选 id 见 DESIGN.md 4.6）。
   标题画面会盖在场景上，想看干净的画面可以在控制台
   `document.getElementById('titleScreen').style.display='none'`。
4. **调光**：`const sc = A3D.debugScene(); sc.lights.sunCol = [1,1,1];`（物体偏暗）、
   `sc.lights.fogAmt = 0`（雾太重）、`sc.cam.fov` / `sc.cam.eye`（构图）。
   注意场景的 `update()` 每帧会覆盖相机，临时调构图先把 `sc.update = null`。
5. **子物体跑偏 / 半个面消失**：先怀疑几何构造。`A3D.Builder` 的 `_pushQuad` 要求
   正好 4 个连续顶点，多塞一个顶点就会把别的三角形挤歪。
6. **帧率**见下面「3.5.1 帧率排查」。
7. **`A3D` 的坐标系 / 单位**：右手系、Y 向上、1 单位 = 1 米，相机默认看向 -Z；
   改构图时先看 `sc.cam`，别看屏幕坐标。

### 3.5.1 帧率排查

3D 背景是「1600×900 离屏渲染 → `drawImage` 进 2D 画布 → 再跟立绘 / 后期一起合成」，
所以掉帧要么是 **填充率**（每帧写了多少像素），要么是 **带宽**（搬了多少次整屏）。
几何量通常不是主因——同一份代码在三台机器上能差十倍，十倍差距只会来自填充与带宽。

**先量，别猜。** 拿浏览器打开：

```
index.html?perf=1          ← 左下角出现性能面板
index.html?bg=ds_room&perf=1&q=low
```

面板读法：

| 行 | 含义 |
| --- | --- |
| `帧 120fps / 8.3ms` | 相邻两帧的实际间隔。8.3ms ≈ 120Hz 满帧、16.7ms ≈ 60Hz 满帧；比满帧大一截就是掉帧 |
| `paint 0.5ms` | 本帧 2D 合成 + 3D 提交 + 立绘 + 后期的总 CPU 时间 |
| `3D提交 0.4ms` | 上一次真正渲染 3D 场景的 CPU 时间（GPU 是异步的，不等于 GPU 时间） |
| `档 高 / 缩放 1.00 / 3D 每帧` | 当前档位、内部渲染倍率、3D 层刷新率 |
| `批次 108 / 顶点 74k / 阴影 2048/8` | 这一帧的 draw call 数、顶点数、阴影贴图边长与 PCF 采样数（没有阴影的场景不显示这一段） |

`paint` 很小但 `帧` 明显掉 → 瓶颈在 GPU 或合成器，优先降「3D 画质」；
`paint` 就很大 → 瓶颈在 CPU，先看是不是立绘 / 粒子 / 半透明批次堆太多。

**画质档位**（设置面板里的「3D 画质」，或 URL `?q=`）：

| 档 | 内部渲染分辨率 | 3D 刷新率 | 阴影 cubemap | PCF 采样 | 胶片颗粒 | 文本框 backdrop-filter |
| --- | --- | --- | --- | --- | --- | --- |
| 高 | **原生**（1600×900 × 画布倍率） | 每帧 | 2048 | 8 | 开 | 开 |
| 中 | 1360×765（0.85） | 30Hz | 1024 | 8 | 开 | 开 |
| 低 | 960×540（0.60） | 24Hz | 512 | 4 | 关 | 关 |
| 自动 | 在下面那把梯子上自己走 | | | | | |

「高」不再是死板的 1600×900，而是跟主画布的后备存储对齐：1080p 全屏时主画布是
1920×1080（面板上的 `画布 1.20x`），3D 也画 1920×1080，背景才和文字一样实。
`缩放` 与 `画布` **相等**的时候就 1:1，背景最实；`缩放` 小于 `画布` 就是在省成本。

自动档走的梯子（`src/art.js` 的 `LADDER`），**顺序刻意是先保分辨率、再降分辨率**，
顶端那一级是「原生」（窗口小到画布倍率 = 1 时这一级不存在）：

| 级 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 渲染倍率 | 1.20\* | 1.00 | 1.00 | 0.85 | 0.75 | 0.75 | 0.65 | 0.60 |
| 3D 刷新率 | 每帧 | 每帧 | 30Hz | 30Hz | 30Hz | 24Hz | 24Hz | 24Hz |

\* 等于当前 `画布` 倍率，随窗口 / DPR 变化。

VN 里背景「糊」比背景「跳」更容易被看出来，所以先砍帧率再砍分辨率。
阴影贴图尺寸、颗粒、`backdrop-filter` 这些开关只跟着三档走（重建一次 cubemap 是
100MB 级的操作，不能跟着每次 ±0.05 抖）。

高档就是加档位之前的观感，用来做对照；觉得「低居然还行」说明这台机器本来就不该跑高档。
`?bg=` 预览页一律强制高档，免得自动降档把美术判断带跑。
如果自动档给的画面偏软，直接在设置里锁「高」，把取舍权拿回来。

**已知的几个花钱点**（按收益排序，改之前先想清楚）：

- **天空**只在「这帧还没被几何体写过深度」的像素上着色（`depthRange(1,1)` + `depthFunc(EQUAL)`）。
  所以 `ds_room` 这类封闭场景的天空几乎不花时间；如果看到窗户洞被涂黑，说明该场景需要
  `skyFirst: true` 退回旧顺序。
- **3D 层与 UI 解耦**：WebGL 结果先落在 `art.js` 的离屏 `LAYER` 上，按档位节流重画，
  其余帧只做一次 `drawImage`。改 `paint()` 的背景分支时别绕开 `layer3d()`。
- **动态贴图不生成 mipmap**（显示器 / 终端 / 白板 / 海报）：它们每秒重传好几次，
  `generateMipmap` 是同步的卡顿尖峰。新增动态贴图请走 `A3DTex.dynamic`，别自己调
  `texFromCanvas` 生成 mip。
- **`preserveDrawingBuffer` 必须保持 `false`**：开着等于让浏览器每帧多留一份整屏副本。
  任何「渲染完再从 `A3D.canvas` 读像素」的写法都会踩空，要用就同一次任务里 `drawImage`。
- **场景别名必须注册同一个函数对象**：`__built` 挂在函数对象上，不同闭包会让整个场景
  （连同 100MB 级的 shadow cubemap）各建一份。`ds_room` / `_night` / `_dawn` 就是这么炸的。
- **半透明批次**（`over`）和点精灵走 `depthMask(false)`，填充代价是实打实的；
  大面积加法混合（光柱、灯晕）在弱机上最贵。

`art-preview.html` 底部还有个独立的 FPS 和顶点数，那是**纯 WebGL** 的数字（不含 2D 合成），
用来判断「是 3D 本身慢还是合成慢」很方便。

新增场景的清单：`worlds*.js` 注册 → `tools/validate_script.py` 的 `PROCEDURAL_BG` 登记 →
`DESIGN.md` 背景表加一行 → 浏览器 `?bg=` 预览 → 走一遍正常剧情 → 三档各看一次帧率。

---

## 4. 存档怎么调

1. **确认后端**：控制台 `SAVE.label`。想强制用服务端就 `python server.py` 再打开页面。面板里点槽位会展开操作（读取 / 保存 / 导出 / 导入 / 删除），覆盖已有档与删除都会先弹确认。
2. **服务端在存哪**：默认 `saves/`，文件名是 `save-1`、`save-auto`（就是信封原文，没有 `.json` 后缀）。
   可以直接打开看，或者 `curl -s http://127.0.0.1:8765/api/blobs` 看列表。
3. **造一个坏档**：

   ```js
   localStorage.setItem("ea_blob:save-1", "{坏掉的 json");
   ```

   然后读档，应当提示「存档文件已损坏，无法读取」，且现有存档不受影响。
4. **造一个旧版本档**：把导出的 JSON 里 `"version"` 改成 `0` 再导入，验证迁移 / 拒绝路径。
5. **两个标签页同时写**：会触发 `409`，提示「存档已被其它窗口改动」——这是 ETag 保护，不是 bug。
6. **服务中途挂掉**：游戏会切回 localStorage 并提示；想知道当前用的是哪个后端就看 `SAVE.label`。

存档错误码 → 人话（`SAVE.describe` 会自动翻译）：

| code | 含义 |
| --- | --- |
| `empty` | 槽位是空的 |
| `corrupt` | 文件坏了（JSON / 信封结构不对） |
| `bad_format` | 不是本游戏的存档 |
| `too_new` | 存档来自更新版本，拒绝覆盖 |
| `bad_payload` | 内容与当前剧本对不上 |
| `conflict` | ETag 冲突（别的窗口改过） |
| `too_large` | 超过服务端上限 |
| `quota` | 浏览器本地空间不足 |
| `network` | 连不上本机存档服务（会自动回落本地） |
| `server` | 服务端返回了别的错误 |

服务端接口本身的错误码（`bad_key` / `not_found` / `etag_mismatch` / `length_required` 等）见 `SAVE_API.md`。

---

## 5. 常见故障排查

| 现象 | 先看什么 | 常见原因 |
| --- | --- | --- |
| 白屏 / 连标题都不出现 | Console 第一条红字；`typeof ENGINE`、`typeof SCRIPT` | JS 语法错（浏览器会报 `file:line`）、脚本 404、`index.html` 里 `<script>` 顺序被改坏 |
| 点了没反应 | `ENGINE.debug()` 的 `pending` | 正在放演出 / 打字机；`pending` 为 `null` 时多半是过场 |
| 选项框停在列表不动 | 点一下（或按 Space） | 列表列完后**等你点击**才收拢（不再有 2 秒倒计时）；之后收拢 1s → 停 1s → 加速 → 1.25s 扫描，扫描中点击任意处锁定 |
| 选项框里出现「该选项已被静默移除」 | `SYS.state.vis.glitch` | 故障态的死选项，锁定它会被拒绝并重新扫描，这是设计 |
| 没有声音 | 先点一下画面；`AUDIO.unlock()` | 浏览器自动播放策略；控制台若有 `AudioContext was not allowed to start` 属正常 |
| 背景 / 立绘是占位卡 | 占位卡上写的文件名与规格 | 素材没放：`assets/bg/<id>.jpg` 等；放好后 `python tools/make_manifest.py > assets/manifest.js` |
| 控制台有 `/api/ping` 404 | Network 面板 | 用 `python -m http.server` 时没有存档服务，前端会回落本地，不影响游戏 |
| 读档后碎片按钮不见了 | `SYS.state.args` | 旧档没有 `md_seen` 旗标；只要 `args` 里已有碎片就会解锁，否则回 `c1_zero` 走一遍 |
| 改完剧本没生效 | 硬刷新 Ctrl+F5；`SCRIPT.scenes["你的场景"].length` | 浏览器缓存 / 改的不是当前加载的文件 |

---

## 6. 改完东西的最小验证

| 改动 | 必须做的验证 |
| --- | --- |
| 剧本（`script.js`） | `python tools/check_js.py` → `validate_script.py` → `simulate_playthrough.py 40` → `?scene=` 直达改过的场景走一遍 |
| 引擎 / UI（`engine.js` 等） | `check_js.py` → 浏览器完整走一遍序章 → 改动涉及的操作 → 控制台 0 报错 |
| 存档（`save.js` / 服务端） | `file://` 下存 / 读 / 导出 / 导入；`server.py` 下再存一遍；关掉服务看回落提示 |
| 服务端（`server.py` / `SAVE_API.md`） | `python tools/test_save_server.py`，必须「全部通过」 |
| 素材（`assets/`） | 重新生成 `manifest.js`，检查占位卡是否消失 |
| 工具自身（`tools/*.py`） | 三个命令都要能跑通，输出与改动前一致或按预期变化 |

---

## 7. 工具报错怎么读

**`check_js.py`（结构）**

```
src/engine.js:123:4: { 没有闭合
src/engine.js:200:9: [ 与 ) 不匹配（[ 在 200:3）
```

只查括号 / 字符串 / 注释结构，不代表完整语法；真正的语法判定看浏览器。

**`validate_script.py`（剧本）** —— 输出分「错误」和「警告」两类：

| 报错 | 含义 / 怎么修 |
| --- | --- |
| `跳转目标不存在 "xxx"` | `J("xxx")` / `opt(..., "xxx")` 写错场景 id |
| `未知说话人 "xx"` | `SPEAKERS` 没登记（引擎 + 校验器两处） |
| `没有对应的提示文案` | `HINT("key")` 对应的 `HINTS` 条目不存在 |
| `未登记的结局` | `END("id", ...)` 的 id 不在 `ENDING_META` |
| `从 start 走不到的场景` | 场景写了没入口（或入口被 IF 条件卡死） |
| `场景 x 以 say 结尾，没有出口` | 场景最后缺 `J/IF/CHOICE/END/WORK/WAIT_CHAT` |
| `剧本解析失败` | 写了 `jsdata` 不认识的数据子集（循环 / 模板字符串 / 函数调用以外的逻辑） |

**`simulate_playthrough.py`（流程）**

| 报错 | 含义 |
| --- | --- |
| `场景走到末尾没有出口` | 同上，某条路径跑到了场景末尾 |
| `步数超限（疑似死循环）` | IF 条件永远成立 / 缺 else，跳回自己 |
| `有结局在模拟中无法到达` | `ENDING_META` 登记了但没有任何路径能到 |

---

## 8. 抓现场给别人看

复现问题时，按这三样收集，基本不用来回问：

1. **地址**：带 `?scene=` 参数和关键 `flags` / `args` 的完整 URL；
2. **状态**：`ENGINE.debug()` 的返回值 + `SYS.state`（控制台右键 `Copy object`）；
3. **红字**：Console 里第一条报错的**完整文本**（含 `文件名:行号`）；如果是网络问题，再附 Network 里的失败请求。

Console 可以右键 → **Save as** 导出日志；Network 面板勾上 **Preserve log**，
这样页面刷新后旧的失败请求不会丢。

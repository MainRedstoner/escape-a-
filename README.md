# Escape A÷ —— 视觉小说引擎模板 (以后就不是模板了！)

一个零依赖的**视觉小说引擎**模板：纯原生 JS + Canvas + DOM + WebAudio，双击 `index.html` 即可运行。剧本以纯数据的形式写在 `src/script.js`（可分卷）里，引擎按节点语义执行，两者完全解耦。

> 仓库自带可玩剧情：序章「互相蒸馏 / 403 Forbidden」+ 第二章「联网」（终端工作台 tool call、聊天自动气泡与候选词、新闻界面、贴吧发帖、九个 AI 联系人、自由分支），
> 含桌宠 Clawd、权限请求框、CLAUDE.md 碎片面板与条件选项。
> **写新故事的方法（节点 DSL、引擎契约、校验流程）见 [STORY_GUIDE.md](STORY_GUIDE.md)。**

---

## 运行

**零依赖零构建**，三种方式任选：

1. **双击 `index.html`** 直接在浏览器打开（推荐 Chrome / Edge）；
2. 或本地起服务：`python -m http.server 8765`，然后访问 <http://127.0.0.1:8765/>；
3. 或起本机存档服务：`python server.py`（默认 8765），访问 <http://127.0.0.1:8765/>。

> `server.py` 用标准库同时托管静态文件与存档接口（契约见 [SAVE_API.md](SAVE_API.md)）。
> 前端存档抽象（PLAN.md §3.1）已接入：`http` 下探测到 `/api/ping` 就用服务端槽位，否则回落 localStorage。
> 没有它，游戏照样完整可玩（存档走 localStorage + 导出 / 导入存档文件）。

打开即见标题画面与一段最小示例剧本（`src/script.js`），写自己的故事时整段替换即可。

### 操作

| 按键 | 功能 |
| --- | --- |
| 鼠标点击 / 空格 / 回车 | 推进对话 |
| 空格 / 回车（选项界面） | 列出后继续；扫描中锁定当前项（点击任意处同效，不按则扫到尽头默认选最右） |
| `1` / `2` / `3`（权限请求框） | 允许 / 本次不再询问 / 拒绝 |
| `H` | 问 Clawd（拿到桌宠前是深度思考） |
| `L` | 记录（对话历史） |
| `A` | 自动播放 |
| `T` | Clawd 的待办清单 |
| `?` | 记忆碎片面板（残破的 CLAUDE.md） |
| `Ctrl`（按住） | 快进 |
| `Esc` | 菜单 |

存档：3 个手动槽位 + 章节自动存档，标题画面与游戏内共用一个「存档 / 读档」面板：点槽位展开读取 / 保存 / 导出 / 导入 / 删除，覆盖与删除都会先确认。`file://` 直开时走 localStorage；用 `python server.py` 起服务时写本机磁盘（换浏览器不丢档）。契约见 SAVE_API.md。

设置：游戏内 HUD 的「设置」或标题菜单打开，可调文字速度 / 自动播放间隔 / 音量 / 打字音效 / 素材角标，改动会记在 localStorage。

---

## 目录结构

```
index.html            页面骨架 / 暗色主题 / 覆盖层 / 标题画面
assets/manifest.js    素材清单（自动生成；file:// 下只能用 <script> 加载，所以是 .js）
assets/bg|cg|chara/   素材位（背景 / CG / 立绘差分），缺图自动显示规格占位卡
src/systems.js        状态、数值（羁绊 / 风控）、记忆碎片 / 彩蛋 / 结局元数据、提示库
src/backdrops.js      程序化背景：Canvas 手绘的蒸馏室 / 走廊 / 403 之门（零素材）
src/art.js            绘制层：素材位加载 + 程序化背景 + 占位卡 + 后期（调色 / 暗角 / 颗粒 / 故障 / 403）
src/pet.js / pet.css  桌宠 Clawd：像素绘制、摸摸 / 拖动、问 Clawd、待办清单
src/audio.js          WebAudio 芯片音乐与音效（程序化合成，零音频素材）
src/script.js         剧本：场景注册表 + 速写助手（可拆成 script_a/b/c.js 分卷）
src/engine.js         VN 引擎：节点解释 / 打字机 / 选项调度 / 立绘调度 / 存读档 / 历史 / 深度思考
src/token-choice.js   TokenChoice 组件：Transformer 选词器风格的滑道选项框（所有 choice 都用它）
src/token-choice.css  该组件样式（类名前缀 tc-，配色接引擎主题变量）
tools/                校验与生成工具（见下）
server.py             可选的本机存档服务（仅标准库；接口契约见 SAVE_API.md）
SAVE_API.md           存档服务接口契约（通用 blob 存储，与存档格式解耦）
STORY_GUIDE.md        剧本编写方法（先读这个）
DEBUGGING.md          调试与排错手册（控制台速查 / URL 直达 / 存档排查 / 故障清单）
AGENTS.md             AI 协作者说明（CLAUDE.md 导入它）
PLAN.md               重做路线图
```

## 工具链

> **整仓只用 Python 标准库**：运行游戏不需要任何构建或运行时依赖（浏览器里全是普通 `<script>`，
> `file://` 双击即玩）；开发期的校验 / 模拟 / 素材清单也全是纯 Python，**不再需要 Node / npm**。
> 剧本虽然是 JS 风格的数据文件，但 `tools/jsdata.py` 用一个只认数据子集的小解析器把它读进 Python。

```bash
python tools/check_js.py              # 运行时 JS 结构检查：括号 / 字符串 / 注释有没有闭合（不是完整语法）
python tools/validate_script.py       # 剧本静态校验：跳转、id、元数据、出口、可达性、素材到位情况
python tools/simulate_playthrough.py 40  # 无头通关模拟：多种"玩家性格"跑多轮，验证结局可达、无死路
python tools/make_manifest.py > assets/manifest.js   # 扫描 assets/ 输出素材清单（--draft 0 关闭草稿角标）
python tools/test_save_server.py     # 存档服务冒烟测试（改 server.py / SAVE_API.md 后必跑）
```

> 排错与调试手段（控制台速查、URL 直达场景、存档排查、常见故障清单）见 [DEBUGGING.md](DEBUGGING.md)。

## 调试参数（测试用）

URL 支持直接跳场景：

```
index.html?scene=start&trust=0&wanted=0&args=xxx&flags=egg1
```

可选参数：`scene`（场景 id）、`trust`、`wanted`、`args`（逗号分隔）、`flags`（逗号分隔）。

## 素材

素材规范（尺寸 / 命名 / 占位机制）见 [assets/README.md](assets/README.md)。没有图也能跑：引擎会画出写清楚文件名与规格的占位卡。

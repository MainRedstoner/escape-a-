# Escape A÷ —— 视觉小说引擎模板

一个零依赖的**视觉小说引擎**模板：纯原生 JS + Canvas + DOM + WebAudio，双击 `index.html` 即可运行。剧本以纯数据的形式写在 `src/script.js`（可分卷）里，引擎按节点语义执行，两者完全解耦。

> 这是一个干净的引擎模板：不含任何具体剧情。
> **写新故事的方法（节点 DSL、引擎契约、校验流程）见 [STORY_GUIDE.md](STORY_GUIDE.md)。**

---

## 运行

**零依赖零构建**，两种方式任选：

1. **双击 `index.html`** 直接在浏览器打开（推荐 Chrome / Edge）；
2. 或本地起服务：`python -m http.server 8765`，然后访问 <http://127.0.0.1:8765/>。

打开即见标题画面与一段最小示例剧本（`src/script.js`），写自己的故事时整段替换即可。

### 操作

| 按键 | 功能 |
| --- | --- |
| 鼠标点击 / 空格 / 回车 | 推进对话 |
| 空格 / 回车（选项界面） | 锁定滑道当前高亮项（不按则扫到尽头默认选最右） |
| `H` | 深度思考（消耗 3 Token，显示场景提示） |
| `L` | 记录（对话历史） |
| `A` | 自动播放 |
| `Ctrl`（按住） | 快进 |
| `Esc` | 菜单 |

存档：3 个手动槽位 + 章节自动存档（localStorage）。

---

## 目录结构

```
index.html            页面骨架 / 暗色主题 / 覆盖层 / 标题画面
assets/manifest.js    素材清单（自动生成；file:// 下只能用 <script> 加载，所以是 .js）
assets/bg|cg|chara/   素材位（背景 / CG / 立绘差分），缺图自动显示规格占位卡
src/systems.js        状态、数值（Token / 信任 / 反感度）、论据 / 彩蛋 / 结局元数据、提示库
src/art.js            绘制层：素材位加载 + 占位卡 + 后期（冷调 / 暗角 / 颗粒 / 故障）
src/audio.js          WebAudio 芯片音乐与音效（程序化合成，零音频素材）
src/script.js         剧本：场景注册表 + 速写助手（可拆成 script_a/b/c.js 分卷）
src/engine.js         VN 引擎：节点解释 / 打字机 / 选项调度 / 立绘调度 / 存读档 / 历史 / 深度思考
src/token-choice.js   TokenChoice 组件：Transformer 选词器风格的滑道选项框（所有 choice 都用它）
src/token-choice.css  该组件样式（类名前缀 tc-，配色接引擎主题变量）
tools/                校验与生成工具（见下）
STORY_GUIDE.md        剧本编写方法（先读这个）
```

## 工具链

```bash
node tools/validate_script.js         # 剧本静态校验：跳转、id、元数据、出口、可达性、素材到位情况
node tools/simulate_playthrough.js 40 # 无头通关模拟：多种"玩家性格"跑多轮，验证结局可达、无死路
python tools/make_manifest.py > assets/manifest.js   # 扫描 assets/ 输出素材清单（--draft 0 关闭草稿角标）
```

## 调试参数（测试用）

URL 支持直接跳场景：

```
index.html?scene=start&trust=0&wanted=0&tokens=26&args=xxx&flags=egg1
```

可选参数：`scene`（场景 id）、`trust`、`wanted`、`tokens`、`args`（逗号分隔）、`flags`（逗号分隔）。

## 素材

素材规范（尺寸 / 命名 / 占位机制）见 [assets/README.md](assets/README.md)。没有图也能跑：引擎会画出写清楚文件名与规格的占位卡。

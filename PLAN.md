# PLAN —— Escape A÷ 重做路线图

> 活文档：每完成一项就勾掉并注明分支 / 提交；计划变化直接改本文件。
> 状态标记：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · `[?]` 待决定

---

## 〇、目标

1. 引擎代码大面积重做（具体范围见第二节，待补充）。
2. 存档系统改为**双模式**：
   - **无后端**（`file://` 直开）：localStorage 槽位 + 下载 / 上传存档文件；
   - **有后端**（`python server.py`）：存档写到本机磁盘，换浏览器 / 清缓存不丢档。
3. 后端只用 Python 标准库，不再考虑 Node 后端。
4. 剧情与玩法重做：开篇改为"互相蒸馏 → 403 → 获得桌宠 Clawd"，设计见 [DESIGN.md](DESIGN.md)。
5. 全程保持 `main` 可玩：每个阶段一个分支，验证通过再合并（规则见 AGENTS.md）。

---

## 一、阶段 0：文档与仓库杂务

- [~] `AGENTS.md` + `CLAUDE.md`（`@AGENTS.md` 导入）—— 分支 `chore/docs-agents-plan`
- [~] `PLAN.md`（本文件）
- [~] `DESIGN.md`（剧情与玩法企划）
- [x] `.gitignore` 加入 `saves/`
- [x] 修正 STORY_GUIDE.md 第三节的过时描述：工具里已改为 `require`，不再有 `FILES` 数组
- [ ] 推送 `main` 并设置上游（等用户确认）
- [?] GitHub 分支保护 / Actions 自动跑校验（等用户决定）

---

## 二、阶段 1：引擎重做（范围待补充）

> TODO（用户）：列出需要重做的部分和原因。下面只是现有代码的现状，供对照。

| 文件 | 行数 | 现状 |
| --- | --- | --- |
| `src/engine.js` | ~800 | 节点解释、打字机、两种选项框、立绘调度、存读档、历史、深度思考，全部在一个 IIFE 里 |
| `src/systems.js` | ~120 | 状态、设置、localStorage 封装、元数据表、提示库 |
| `src/art.js` | ~400 | Canvas 绘制层、占位卡、后期效果 |
| `src/audio.js` | ~150 | WebAudio 程序化音乐 / 音效 |
| `src/token-choice.js/.css` | ~440 | 滑道选项框组件 |
| `index.html` | ~320 | 骨架 + 内联样式 + 覆盖层 |

候选方向（待确认）：

- [?] 拆分 `engine.js`：存档、UI 覆盖层、节点解释器分成独立文件
- [?] `index.html` 内联样式抽到 `src/*.css`
- [?] …

---

## 三、阶段 2：存档系统重做

### 3.1 存储抽象

在前端引入统一的存档接口，引擎只调它，不直接碰 localStorage：

```
SAVE.list()            → [{ slot, ts, chapter, … }]
SAVE.read(slot)        → 快照 | null
SAVE.write(slot, data)
SAVE.remove(slot)
SAVE.exportFile()      → 触发下载 .json 存档文件
SAVE.importFile(file)  → 校验后写入槽位
```

两种实现，启动时自动选择：

- **LocalBackend**：localStorage（现有逻辑迁移过来）。
- **ServerBackend**：页面经 `http://` 打开且 `GET /api/ping` 成功时启用。
- 后端不可用 / 请求失败时回落到 LocalBackend 并提示，不阻塞游戏。

### 3.2 存档文件格式

```json
{
  "format": "escape-a-save",
  "version": 1,
  "exportedAt": 0,
  "slots": { "auto": { … }, "1": { … } },
  "persist": { "endings": [], "eggs": [] }
}
```

- `version` 递增时提供迁移函数；导入时拒绝未知 `format` / 更高 `version`，并给出提示。
- 导入前做结构校验（字段类型、场景 id 存在），坏文件不覆盖现有存档。
- 待定：设置（音量 / 文字速度）要不要一起导出。

### 3.3 Python 存档服务 `server.py`

- 仅标准库（`http.server` + `json`），单文件，`python server.py [--port 8765]`。
- 同时提供静态文件服务，替代现在的 `python -m http.server`。
- 默认只绑定 `127.0.0.1`。
- 存档数据目录 `saves/`（进 `.gitignore`），每个槽位一个 JSON 文件。
- API 草案：

  | 方法 | 路径 | 说明 |
  | --- | --- | --- |
  | GET | `/api/ping` | 探测后端 |
  | GET | `/api/saves` | 槽位列表（元信息） |
  | GET / PUT / DELETE | `/api/saves/<slot>` | 读 / 写 / 删单个槽位 |

- 安全：槽位名白名单（`auto` / `1`~`N`），拒绝路径穿越；限制请求体大小；写文件先写临时文件再原子替换。

### 3.4 UI

- 存读档界面增加「导出存档」「导入存档」按钮。
- 标题或菜单显示当前存档位置（本地浏览器 / 本机服务）。

### 3.5 验收

- [ ] `file://` 下：存 → 刷新 → 读；导出 → 清 localStorage → 导入 → 读，进度一致
- [ ] 服务模式下：存 → 换浏览器 → 读
- [ ] 服务中途关掉：回落本地并提示，游戏不卡死
- [ ] 导入坏文件 / 旧版本文件：有提示，现有存档不受影响
- [ ] 结局 / 彩蛋收集跨周目持久照常

---

## 四、阶段 3：剧情与玩法重做

> 设计全文见 [DESIGN.md](DESIGN.md)。本节只管排期。完全重新起稿，不参考 `main-del0`。

### 4.1 里程碑 A：可玩切片（序章 + 桌宠 MVP）

先做出能从标题玩到序章结尾（DeepSeek 发誓变强、找回小克）的完整切片，验证基调和桌宠手感，再铺后面的章节。

- [x] 显示名：名牌用正式名，两人互称小鲸 / 小克；背景全部程序化绘制，立绘 / CG 暂用占位卡
- [ ] 注册表先行：`SPEAKERS`（ds / cl / clawd）、`ENDING_META`、`EGG_META`、碎片 `ARG_META`、`HINTS` —— `story/` 分支
- [ ] `src/pet.js` MVP：程序化绘制、idle / happy / scared 三个状态、点击摸摸、心情 —— `feat/pet`
- [ ] 节点 `PET` / `TODO` + 校验器 / 模拟器同步
- [ ] `H` 改为"问 Clawd"（转圈动词 + 提示）
- [ ] `FX("403")` 红色错误页平铺 + 新 BGM `study` / `forbidden`
- [ ] 程序化背景：`study` / `study_night` / `corridor` / `forbidden` / `study_empty`
- [ ] 序章剧本：上半「互蒸」（token 模式蒸馏课、暗号选择）+ 下半「403」（403 循环、从 0 里爬出来、`end_ticket` 笑话结局、发誓收尾）
- [ ] 验收：AGENTS.md 第四节全套 + 浏览器里从标题玩到序章结束

### 4.2 里程碑 B：核心机制补全

- [ ] 权限请求选项 `mode: "perm"` + `autoKey` 自动批准（模拟器要能处理"跳过选择"）
- [ ] CLAUDE.md 碎片面板
- [ ] 桌宠补全：walk / sleep / glitch / working 状态、拖拽、看向倾向选项、待办面板 `T`
- [ ] 跨周目桌宠记忆与配件

### 4.3 里程碑 C：第二章至终章

- [ ] 细化第二~四章与终章分场大纲（先在 DESIGN.md 里定稿再写剧本）
- [ ] 逐章剧本 + 结局全部可达（`simulate_playthrough.js`）
- [ ] 演出层：CG、立绘、故障段落、`451`

### 4.4 依赖与顺序

- 桌宠状态和跨周目记忆要进存档：**阶段 2 存档格式 v1 定稿前，先把 `pet` 字段定下来**（见 DESIGN.md 第五节）。
- 如果阶段 1 要拆 `engine.js`，`pet.js` 直接按新结构写，避免写两遍。
- 剧本可以先行：没有素材时引擎显示占位卡，不阻塞。

---

## 五、待决定事项

- [?] **校验工具是否迁移到 Python？** `validate_script.js` / `simulate_playthrough.js` 目前用 Node，只在开发期用。迁移后整个仓库只需要 Python，但模拟器要把引擎语义再用 Python 实现一遍，和 JS 引擎保持同步的成本更高。
- [?] 合并方式：squash 还是 `--no-ff`
- [?] 存档槽位数量（现在是 3 个手动槽 + 1 个自动槽）
- [?] `main-del0` 上的剧情重写何时处理（目前冻结）

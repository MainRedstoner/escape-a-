# Issue #19 系统结构重构提案

> 状态：**待确认，尚未改动代码**
> 基线：`main` @ `88ab1b9`（2026-11-01）
> 议题：[#19 REFACTOR:关于程序系统的若干建议](https://github.com/MainRedstoner/escape-a-/issues/19)
> 作者：DaoWen77（COLLABORATOR），无评论
> 约束：`file://` 直开 · 零构建 · 零运行时依赖 · Python 标准库工具链 · 剧本纯数据

**Issue 原文**

> 解释引擎和剧本的解耦非常漂亮，但是项目整体不够系统，可维护性一般。出错难查，功能间相互纠缠可能导致牵一发而动全身，模块化一般，系统层级不够清晰。建议按照职能设计系统架构重构项目结构，坚持解耦和模块化，建立指挥层调度画面表现，音频管理等，画面表现力或许可以通过引入一些工具库有所提升，3D场景建议程序生成后再手工打磨一下。

---


## 〇、先给非技术审阅者的六句话

1. 现在不是「代码写得差」，而是 `engine.js` 同时当导演、演员、舞台、音控、存档员和菜单。
2. 重构目标不是换框架，而是加一个**指挥层**：剧本只下命令，画面/音频/界面各自执行。
3. 结构分五层，外加一个组合根：核心工具 → 内容数据 → 剧情领域 → 指挥层 → 表现/音频/存档适配器；Boot 只负责接线。
4. 仍然双击 `index.html` 就能玩；不引入 npm、打包器、CDN、ES module。
5. 先做结构，再谈 3D 场景手工打磨；两者分开分支，避免一次改太多。
6. 保存格式会升级，但保证旧存档可读；不会让现有玩家丢档。

---

## 一、议题拆解

Issue #19 的诉求可拆成六项：

| # | 诉求 | 本提案对应 |
| --- | --- | --- |
| 1 | 整体不够系统，可维护性一般 | 分层 + 单一组合根 + 依赖方向 |
| 2 | 出错难查 | 命令追踪、错误边界、诊断面板 |
| 3 | 功能相互纠缠，牵一发动全身 | 剧情/表现/音频/存档解耦 |
| 4 | 模块化一般，系统层级不清晰 | 明确 L0–L4 层与模块契约 |
| 5 | 建立指挥层调度画面表现、音频管理 | `Director` + `CommandBus` |
| 6 | 画面表现力可用工具库提升；3D 程序生成后手工打磨 | 先保持零依赖；单独做 SceneRecipe / Scene Lab |

**不在本次范围**：重写剧本 DSL、重写 3D 渲染器、改剧情、换美术风格、引入框架。

---

## 二、现状诊断（有证据，不是感觉）

### 2.1 体量

| 文件 | 行数 | 现状 |
| --- | ---: | --- |
| `src/engine.js` | 2412 | 解释器 + 对话 + 选项 + 工作台 + 聊天 + 新闻 + 贴吧 + 存读档 UI + 设置 + 标题 + 输入 |
| `index.html` | 674 | 全部页面 DOM + 约 360 行内联 CSS + 18 个脚本 |
| `src/art3d/worlds.js` | 1877 | 程序化场景与美术方向混在一起 |
| `src/art.js` | 771 | 绘制层，边界相对清楚 |
| `src/audio.js` | 350 | 音频服务，边界相对清楚 |
| `src/pet.js` | 444 | 桌宠，反向依赖 `ENGINE` / `SYS` / `AUDIO` / `ART` |
| `src/save.js` | 358 | 存档后端，边界较好 |
| `src/token-choice.js` | 562 | 独立选项组件，边界较好 |

### 2.2 `engine.js` 的耦合面

在 `engine.js` 中：

- `SYS.` 引用 **178** 次
- 直接 `$("<id>")` 取 DOM **60** 个不同 id
- `AUDIO.` 引用 **42** 次
- `ART.` 引用 **24** 次
- `SAVE.` 引用 **16** 次
- `CLAWD.` 引用 **10** 次

这不是“引用多”本身有罪，而是**同一个函数同时改状态、开界面、播音频、触发特效、写存档**。

### 2.3 典型现场

`src/engine.js:390–488` 的 `applyNode()`：

```js
case "bg":
  if (SYS.state.vis.bg !== nd.id) ART.clear403();
  if (nd.id !== "chat") { curChat = null; closeChatScreen(); }
  SYS.state.vis.bg = nd.id;
  AUDIO.ambience(nd.id);
  SYS.state.vis.cg = null;
  ui.cgNote.style.display = "none";
  if (nd.fx === "fade") { ART.trigger("flash"); AUDIO.sfx("whoosh"); }
  return false;
```

一个 `bg` 节点同时做了：状态写入、旧特效清理、聊天界面关闭、环境音切换、CG 提示层 DOM、过场音效。

`src/engine.js:496–530` 的 `startSay()`：

- 判断聊天模式
- 操作 `#textbox` / `#nameplate` / `#nextArrow`
- 写历史
- 启动打字机 `setInterval`
- 播放 `blip`
- 处理自动播放

`src/engine.js:1935–1941` 的 `snapshot()`：

```js
const blocking = (pending && pending.t !== "say") || !!chatDraft || chatTyping;
const at = blocking ? { scene: cur.scene, idx: Math.max(0, cur.idx - 1) } : cur;
return JSON.parse(JSON.stringify({ cur: at, hintKey, state: SYS.state }));
```

`cur.idx - 1` 是典型的“状态机语义藏在 UI 里”的补偿代码。只要新增一种阻塞界面，就要重新想一遍。

### 2.4 状态混住

`src/systems.js:36–52` 的 `newState()` 同时包含：

- 剧情数值：`trust` / `wanted` / `args` / `flags`
- 表现快照：`vis.bg` / `vis.sprites` / `vis.cg` / `vis.glitch`
- 内容数据：`chatlog` / `chatResume` / `forumPosts`
- UI 数据：`hint` / `wrongHint` / `history`
- 功能状态：`pet`

这些数据的生命周期、持久化要求和修改者完全不同，却共用一个可变对象。

### 2.5 结论

**问题不在“函数太多”，而在缺少一层“谁可以命令谁”的契约。**
所以本提案的核心不是拆文件，而是先定边界，再按边界拆文件；只拆文件不拆职责，会得到更多互相引用的文件。

---

## 三、目标架构

### 3.1 一句话

**剧本解释器只产出“效果 + 命令”；指挥层负责排队、调度、超时与取消；表现/音频/存档各自是适配器，不反向读剧情。**

### 3.2 分层图

```text
┌──────────────────────────────────────────────────────────────┐
│ Boot（组合根，不计入五层）                                     │
│ 创建对象、注入依赖、启动；只在这里 new / wire                 │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ L4  Adapters（适配器）                                        │
│  Presentation：Stage / Textbox / Choices / HUD / Screens      │
│  Audio：AudioService                                          │
│  Persistence：SaveService / Codec / Backends                  │
│  只执行命令，不反向读剧情                                     │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ L3  Application（指挥层）                                     │
│  Director · CommandRegistry · InputRouter · ScreenHost        │
│  只调度，不知道“剧情为什么这样”                                │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ L2  Domain（剧情领域）                                        │
│  StoryRunner · SessionStore · Rules · SaveSchema              │
│  纯逻辑；禁止 DOM / Canvas / Audio / Save                     │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ L1  Content（纯数据）                                         │
│  story*.js · registries.js · node-types.js · scenes.js        │
│  assets/manifest.js（生成物）                                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ L0  Core / Platform                                           │
│  bus · clock · diagnostics · dom · storage · http · file      │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 依赖规则（硬规则）

| 层 | 可以依赖 | 禁止依赖 |
| --- | --- | --- |
| L0 Core/Platform | 浏览器标准 API | 剧情、表现、音频、存档 UI |
| L1 Content | 无（纯数据） | DOM、函数逻辑、引擎 |
| L2 Domain | L0、L1 | DOM、Canvas、AUDIO、ART、SAVE、localStorage |
| L3 Application | L0–L2、适配器接口 | 具体 DOM 实现、具体音频实现 |
| L4 Presentation | L0、L3 的命令/回调契约 | 直接改 `SessionStore`、直接读 `SCRIPT` |
| L4 Audio | L0、L3 的命令契约 | 剧情、DOM、存档 |
| L4 Persistence | L0、L2 SaveSchema | DOM、剧情 UI、音频 |
| Boot（组合根） | 全部 | 业务规则（只接线，不写规则） |

**反向依赖 = 0**。用 `tools/check_architecture.py` 在 CI 中扫描禁止标识符，而不是靠自觉。

### 3.4 全局命名空间

零构建、`file://` 不能用 ES module，因此：

```js
// 每个文件
window.EA = window.EA || {};
EA.domain = EA.domain || {};
EA.domain.StoryRunner = (() => {
  ...
  return { create };
})();
```

约束：

- 全项目只暴露一个全局 `EA`。
- 迁移期保留 `window.ENGINE` 作为兼容 façade（调试、旧调用方），新代码不直接依赖。
- `index.html` 只负责按顺序加载文件和调用 `EA.boot.start()`。
- 禁止 `window.SYS` / `window.ART` 新增；旧别名逐步收口。

---

## 四、核心运行时

### 4.1 StoryRunner：显式状态机

当前 `pump()` + `pending` + `cur.idx - 1` 的问题是把“阻塞在哪个节点”藏在 UI 变量里。新结构改为：

```text
IDLE ──start──► RUNNING ──step──► WAITING_INPUT   (say / choice)
                    │                 │
                    │                 └──resume(result)──► RUNNING
                    ├──► WAITING_SCREEN (work / waitChat / ending / perm)
                    │                 └──screen:closed────► RUNNING
                    └──► ENDED
```

`StoryRunner` 的公开 API：

```js
/**
 * @typedef {Object} StepResult
 * @property {'running'|'waiting'|'ended'|'error'} status
 * @property {string} [pendingId]   // 当前阻塞节点的唯一 id: scene#idx
 * @property {Command} [command]
 * @property {string} [tag]         // scene#idx，用于追踪
 */

runner.start(sceneId, index);
runner.step();          // 推进到下一个阻塞点
runner.resume(result);  // say 的 advance / choice 的选项 / screen 的返回
runner.snapshot();      // { scene, index, status, pendingId }
runner.restore(snap);
```

规则：

- **阻塞节点**（`say` / `choice` / `work` / `waitChat` / `ending` / `perm`）在 `snapshot` 中保存**当前节点**，不再 `-1`。
- **非阻塞节点**执行完立即推进，游标在节点之后。
- `snapshot` 存 `pendingId`，读档时能精确恢复“正停在哪个节点”。
- 每个节点产出 `tag = scene + "#" + index`，所有命令、日志、异常都带这个 tag。

### 4.2 节点解释：效果与命令分离

`StoryRunner` 不直接调用任何画面/音频/存档。它把节点拆成两部分：

```js
// 伪代码
function executeNode(node, tag) {
  const spec = NodeTypes[node.t];
  const effects = Rules.effectsOf(node, session); // 纯函数，返回要写入的状态
  session.apply(effects);
  const commands = spec.toCommands(node, session); // 纯函数，返回命令数组
  return { commands, blocking: spec.blocking };
}
```

例：`bg` 节点

```js
// NodeTypes.bg.toCommands
[
  { type: "stage.background", payload: { id, transition: nd.fx } },
  { type: "audio.ambience", payload: { sceneId: id } }
]
```

例：`trust` 节点

```js
// effects
{ trust: clamp(trust + delta, 0, 10) }
// commands
[
  { type: "toast", payload: { text: `羁绊 ${delta > 0 ? "+" : ""}${delta}` } },
  { type: "audio.sfx", payload: { name: delta > 0 ? "heart" : "deny" } },
  { type: "hud.refresh" }
]
```

例：`wanted >= 10` 的跳转是**领域规则**，不是 UI 规则：

```js
// StoryRunner 内，不经过任何界面
if (effects.wanted >= 10) return jump("bad_end");
```

### 4.3 命令模型

```js
/**
 * @typedef {Object} Command
 * @property {string} type
 * @property {Object} payload
 * @property {{scene:string,index:number,tag:string}} meta
 */
```

命令类型由 `CommandRegistry` 声明，不把 `blocking` 写在每个调用点：

```js
const COMMANDS = {
  say:          { target: "textbox",  blocking: true  },
  choice:       { target: "choice",   blocking: true  },
  "screen.open":{ target: "screens",  blocking: true  },
  "stage.bg":   { target: "stage",    blocking: false, ordered: true },
  "stage.show": { target: "stage",    blocking: false, ordered: true },
  "stage.cg":   { target: "stage",    blocking: false, ordered: true },
  "stage.fx":   { target: "stage",    blocking: false, ordered: true },
  "audio.bgm":  { target: "audio",    blocking: false, ambient: true },
  "audio.sfx":  { target: "audio",    blocking: false, ambient: true },
  "audio.amb":  { target: "audio",    blocking: false, ordered: true },
  toast:        { target: "hud",      blocking: false, ambient: true },
  "save.auto":  { target: "save",     blocking: false, ambient: true },
  "hud.refresh":{ target: "hud",      blocking: false, ambient: true },
  wait:         { target: "clock",    blocking: true  }
};
```

三种调度语义：

| 语义 | 行为 | 例子 |
| --- | --- | --- |
| `blocking` | 剧情停在当前节点，等结果 | `say` / `choice` / `screen.open` |
| `ordered` | 每个 target 内部按顺序执行，不阻塞剧情 | `bg` → `show` → `fx` |
| `ambient` | 可并发、可合并、失败不阻塞 | `sfx` / `toast` / 自动存档 |

`Director` 的职责：

```js
director.dispatch(cmd);       // 返回 CommandHandle { id, done, cancel }
director.await(cmd);          // 仅 blocking 命令使用
director.cancelScope(scope);  // 离开场景/工作台时清掉定时器与动画
director.whenIdle(scope);     // 测试/截图用
```

### 4.4 输入路由

当前点击逻辑散落在 `onMainClick()`、`#textbox` click、`#stage` click、`#choices` click、键盘监听和 TokenChoice 内部。新结构只有一个入口：

```text
pointer / keydown
      ↓
InputRouter
      ↓ 按优先级询问
1. ScreenHost（模态界面）
2. ChoiceView / PermView
3. TextboxView（advance / finish type）
4. HUD 按钮
5. Stage 空白（advance）
      ↓
产生 Intent，不直接改状态
```

`Intent` 例子：

```js
{ type: "advance" }
{ type: "choose", optionId: "opt_2" }
{ type: "openScreen", id: "save" }
{ type: "cancel" }
```

这样“点背景前进、点 HUD 不前进、覆盖层开着不前进”是路由规则，不是散落在各处的 `if`。

### 4.5 Screen 契约

```js
/**
 * @typedef {Object} Screen
 * @property {string} id
 * @property {boolean} [modal]
 * @property {(host: HTMLElement, props: Object, ctx: ScreenContext) => () => void} mount
 * @property {(event: KeyboardEvent) => boolean} [onKey]
 */

/**
 * @typedef {Object} ScreenContext
 * @property {(result?: any) => void} close
 * @property {(cmd: Command) => void} dispatch
 * @property {(msg: string) => void} toast
 * @property {AudioService} audio
 */
```

`ScreenHost` 统一处理：

- 打开 / 关闭 / 栈顺序
- 焦点捕获与恢复
- ESC 是否允许关闭
- `aria-modal`
- 背景 `inert` / 滚动锁
- 打开/关闭动画
- mount 失败时的降级面板

首批拆出的界面：

| Screen | 当前所在 | 说明 |
| --- | --- | --- |
| `title` | `engine.js:2278–2312` | 标题菜单、继续/新游戏 |
| `save` | `engine.js:1934–2137` | 槽位、导入/导出、删除确认 |
| `settings` | `engine.js:2225–2268` | 音量、速度、画质 |
| `history` | `engine.js:1867–1897` | 对话记录 |
| `gallery` | `engine.js:2170–2224` | 碎片、结局、彩蛋 |
| `ending` | `engine.js:2139–2154` | 结局页 |
| `perm` | `engine.js:682–733` | 权限请求 |
| `workbench` | `engine.js:837–1834` | 工作台 + 聊天 + 新闻 + 贴吧（一个 feature 簇，不强拆四个小文件） |

---

## 五、状态所有权

| 状态 | 所有者 | 可写者 | 进存档 |
| --- | --- | --- | --- |
| 剧情游标 / 阻塞节点 | `StoryRunner` | 仅 Runner | 是 |
| `trust` / `wanted` / `args` / `flags` | `SessionStore` | `Rules` 产生的 effect | 是 |
| `chatlog` / `chatResume` / `forumPosts` | `SessionStore` | 工作台控制器 | 是 |
| `vis.bg` / `vis.cg` / `vis.sprites` / `vis.glitch` | `StageStore` | `StageView` 命令 | 是（表现快照） |
| `hint` / `wrongHint` / `history` | `SessionStore.UI` | Runner / Textbox | 是 |
| 音量 / 速度 / 画质 / 草稿角标 | `SettingsStore` | SettingsScreen | 否（独立 key） |
| 当前 BGM / ambience / 解锁状态 | `AudioService` | AudioDirector | 否（读档后按场景重建） |

关键变化：

- **`vis` 不再是剧情状态**，它是可序列化的表现快照，供读档恢复画面。
- **`settings` 不随存档走**，避免换存档时音量被覆盖。
- **UI 不直接写 `SessionStore`**，只能发命令或提交 intent。

### 5.1 存档格式

```js
{
  schema: 2,
  meta: { savedAt, scene, title, playtime },
  cursor: { scene, index, status, pendingId },
  session: {
    trust, wanted, args, flags,
    chatlog, chatResume, forumPosts,
    hint, wrongHint, history
  },
  stage: { bg, cg, sprites, glitch },
  checksum: "…" // 可选，防手改坏档
}
```

`SaveCodec` 负责：

- `encode(snapshot) -> string`
- `decode(text) -> snapshot`
- `migrate(v1 -> v2)`
- 校验失败返回 `SaveError`，不写坏档
- 旧 `v1` 存档可读，新 `v2` 存档不被旧版本静默覆盖

---

## 六、关键流程

### 6.1 一句台词

```text
StoryRunner.step()
  → node say
  → effects: history.push
  → command: say
  → Director.dispatch
  → TextboxView.show({who,text})
  → 玩家 advance
  → TextboxView 返回 {action:"advance"}
  → StoryRunner.resume()
```

`TextboxView` 只负责：

- 打字机
- 名字牌
- 下一箭头
- 自动播放计时
- `blip` 音效请求（通过 audio 命令）

**不负责**：聊天模式判断、剧情推进、历史写入、结局判断。

### 6.2 选项

```text
StoryRunner
  → command choice
  → ChoiceView（包装现有 TokenChoice）
  → 玩家选中
  → { optionId, auto }
  → StoryRunner.resume
  → 应用 option.fx / give / set / if
  → jump
```

`TokenChoice` 保持现有组件和动画，不改它的内部；只加一层 `ChoiceView` 适配器。

### 6.3 工作台 / 聊天

`work` 节点：

```text
StoryRunner
  → command screen.open { id:"workbench", props:{workId, data} }
  → ScreenHost.open
  → WorkbenchScreen
  → 用户选择
  → close({ choiceId })
  → StoryRunner.resume
```

`waitChat` 同理。工作台内部的聊天、新闻、贴吧可以继续共享一个 feature 控制器，但**不能直接调用 `pump()`**。

### 6.4 存档 / 读档

```text
SaveScreen
  → SaveService.read(slot)
  → Codec.decode + migrate + validate
  → SessionStore.restore
  → StageStore.restore(stage)
  → StoryRunner.restore(cursor)
  → Director.replayStage()   // 恢复 bg/cg/sprites，不重播剧情
  → 如果 pending 是 screen，重新打开对应界面
```

关键：**读档不重新跑剧情来恢复画面**，避免副作用（音效、成就、flags）重复触发。

### 6.5 背景与音频

```text
bg 节点
  → stage.background（StageView 淡入）
  → audio.ambience（AudioDirector 切环境音）

bgm 节点
  → audio.bgm（交叉淡入，失败静音不阻塞）

进入场景 checkpoint
  → save.auto（fire-and-forget）
```

`AudioDirector` 是策略层：

- `bgm` 同曲不重启
- `ambience` 按场景 id 映射
- 对话/工作台打开时 duck
- 浏览器未解锁时排队，首次手势补播
- 音量设置变化只改 bus，不重建音频图

---

## 七、错误与可观测性

Issue 说“出错难查”。结构改了但没诊断，等于没改。

### 7.1 统一 trace

每个命令带：

```js
{ scene: "ch2_work", index: 37, tag: "ch2_work#37", cmd: "stage.bg" }
```

`Diagnostics` 维护最近 300 条环形缓冲：

```js
EA.diag.trace("command", { tag, cmd, ms });
EA.diag.dump(); // 复制给 Issue 的 JSON
```

### 7.2 错误边界

| 位置 | 失败时 |
| --- | --- |
| `StoryRunner.step` | 停在当前节点，弹“剧情暂停”面板，不推进、不写档 |
| `Director.dispatch` | 记录 `command:error`；阻塞命令失败 → 释放等待，避免卡死 |
| `ScreenHost.mount` | 卸载残留 DOM，显示可关闭的降级面板 |
| `AudioService` | 静默降级，不阻塞剧情 |
| `SaveService` | 保留旧档，返回 `SaveError` |
| `StageView.paint` | 保留上一帧，记录一次错误，避免每帧刷屏 |

### 7.3 调试面板

`?debug=1` 显示：

- 当前 `scene#index` / 阻塞节点
- 最近 10 条命令
- 当前 Screen 栈
- BGM / ambience / 音量
- 存档后端
- FPS / paint 耗时 / 3D draw calls

现有 `?perf` 保留，但数据从 `StageView` / `Diagnostics` 读取，不再由 `engine.js` 自己拼。

---

## 八、3D 场景与画面工具链

Issue 建议“程序生成后再手工打磨”。这不该混进剧情重构，建议单独一个 `art/scene-recipes` 分支。

### 8.1 SceneRecipe

当前 `worlds.js` 把“几何生成”和“这场景应该长什么样”混在一起。建议拆成：

```js
// content/scenes/sea.js
{
  id: "sea",
  builder: "seaBase",       // 程序化几何
  seed: 19,                 // 确定性
  camera: { ... },          // 手工相机
  palette: { ... },         // 手工调色
  lighting: { ... },        // 手工灯光
  props: [ ... ],           // 手工摆放
  post: { vignette, grain, bloom },
  overrides: [ ... ]        // 最后的局部修补
}
```

- `render/art3d/` 只提供几何/材质/灯光原语。
- `content/scenes/` 只放配方，不放渲染循环。
- `art-preview.html` 升级为 **Scene Lab**：切场景、切时间、切天气、固定 seed、截图对比。
- 每个场景留一张基线截图，改完能对比“是不是变糊了/变暗了”。

### 8.2 关于引入工具库

**默认不建议引入运行时库。** 原因：

- `AGENTS.md` 硬约束：`file://`、零依赖、零构建。
- 一个 WebGL/动画库会带来版本、体积、CDN/本地 vendor、许可证、调试复杂度。
- 当前瓶颈更像“结构 + 手工调参”，不一定是“缺库”。

可以做的是**开发期工具**：

- 用本地脚本生成纹理/场景预设
- 用浏览器截图做视觉回归
- 用 Scene Lab 手动调
- 不把工具依赖带进 `index.html`

如果确认要放宽约束，建议单独开 Issue，只允许**一个**库、本地 vendor、固定版本、可移除，并做性能/体积对比；不要在本次重构里夹带。

---

## 九、目标目录结构

```text
index.html
src/
  boot.js                       # 唯一组合根

  core/
    bus.js                      # CommandBus / EventBus
    clock.js                    # 可取消计时器 / wait
    diagnostics.js              # trace / dump / 错误边界
    dom.js                      # $ / el / focus / inert

  content/
    story.js                    # 第一卷（纯数据）
    story_ch2.js                # 第二卷（纯数据）
    registries.js               # ARG / EGG / ENDING / HINTS / FRAGMENTS
    node-types.js               # 节点类型 + 命令映射（纯数据）
    scenes.js                   # 场景配方注册
    manifest.js                 # 生成物

  domain/
    session-store.js            # 剧情数值 / 进度 / 日志 / 快照
    rules.js                    # 条件 + 效果，纯函数
    story-runner.js             # 显式状态机
    save-schema.js              # v2 结构与迁移

  app/
    director.js                 # 命令调度 + scope + 超时
    input-router.js             # pointer / key → Intent
    screen-host.js              # 界面栈 / 焦点 / ESC
    audio-policy.js             # 场景 → BGM / ambience 策略

  presentation/
    stage-view.js               # canvas / DPR / render loop
    textbox-view.js             # 打字机 / 名字牌 / 自动
    choice-view.js              # TokenChoice 适配
    hud-view.js                 # 数值 / 按钮 / toast
    pet-view.js                 # Clawd 视图
    screens/
      title.js
      save.js
      settings.js
      history.js
      gallery.js
      ending.js
      perm.js
      workbench.js               # work + chat + news + forum

  audio/
    service.js                  # 现有 audio.js 收口
    synth.js                    # 程序化音色（可选拆分）

  persistence/
    save-service.js             # 编排
    codec.js                    # encode/decode/migrate
    backends.js                 # local / server

  render/
    art.js                      # 现有绘制层
    fx.js                       # 特效（从 art.js 拆出时）
    art3d/                      # 现有 3D 原语

  styles/
    tokens.css
    stage.css
    hud.css
    screens.css
```

**文件拆分原则**：按职责拆，不按函数拆；单文件目标 ≤ 500 行；超过时先看是不是职责混了，而不是继续切碎。

---

## 十、迁移计划（保持 main 可玩）

> 每个阶段一个 `refactor/...` 分支；每阶段结束必须仍能双击 `index.html` 玩。  
> 不做 big-bang 重写，不做“先全删再补”。

### 阶段 0：基线护栏

- 记录当前 `main` 的存档样本、关键流程录屏/截图
- 加 `tools/check_architecture.py`（先只报告，不阻塞）
- 给 `engine.js` 加 `trace`，记录 `scene#idx` 和命令耗时
- 增加 `?debug=1` 诊断面板
- **不改行为**

### 阶段 1：领域层

- 新建 `SessionStore` / `Rules` / `NodeTypes`
- 把 `evalCond`、`newState`、效果结算、节点表搬出 `engine.js`
- 新建 `StoryRunner` 状态机，替换 `pump()` + `pending` 语义
- 旧 `ENGINE` 作为 façade，UI 继续调用它；内部改为 Runner
- **重点验收**：所有节点、所有场景、读档游标

### 阶段 2：指挥层

- 新建 `Director` / `CommandRegistry` / `InputRouter`
- `applyNode` 的 switch 改为 `NodeTypes.toCommands`
- `ART` / `AUDIO` / `SAVE` 调用收口到命令 handler
- `StageStore` 接管 `vis`
- **重点验收**：背景、立绘、特效、BGM、环境音、自动存档

### 阶段 3：界面层

- 新建 `ScreenHost`
- 先拆菜单类：title / save / settings / history / gallery / ending / perm
- 再拆 workbench（工作台 + 聊天 + 新闻 + 贴吧）
- `index.html` 的 DOM 可以保留，但由 Screen 模块接管挂载/事件
- **重点验收**：焦点、ESC、覆盖层叠放、导入/导出、权限框

### 阶段 4：组合根与清理

- 新建 `boot.js`，所有依赖注入集中在这里
- `engine.js` 缩成兼容 façade 或删除
- `systems.js` 拆成 `SessionStore` / `SettingsStore` / `registries`
- `pet.js` 改为 `PetController` + `PetView`
- CSS 从 `index.html` 拆到 `styles/`
- 架构检查转为 CI 阻塞项

### 阶段 5（可独立）：3D 场景打磨

- `art/scene-recipes` 分支
- SceneRecipe / Scene Lab / 截图基线
- 逐个场景手工调，不碰剧情结构
- 评估是否需要工具库；默认不引入

---

## 十一、验收标准

### 行为

- [ ] 双击 `index.html` 可玩，无网络请求
- [ ] 现有全部节点、全部场景可通
- [ ] 选项滑道、权限框、工作台、聊天、新闻、贴吧行为不变
- [ ] 桌宠可见/隐藏/心情/待办/跨周目记忆不变
- [ ] 存档 v1 可读；新档 v2 可写；坏档不覆盖旧档
- [ ] 标题、设置、历史、碎片、结局收集、导入导出正常
- [ ] `Forever` 类演出不需要改代码就能由节点驱动（如果后续接入）

### 工程

- [ ] `python tools/check_js.py`
- [ ] `python tools/validate_script.py`
- [ ] `python tools/simulate_playthrough.py 40`
- [ ] `python tools/check_architecture.py`（新增，0 违规）
- [ ] 无控制台错误；命令失败有 trace
- [ ] 单文件 ≤ 500 行（`art3d` 数据/生成文件除外）
- [ ] `?debug=1` 能看到 scene / pending / command / screen / audio

### 性能

- [ ] 基准场景 FPS 不低于重构前（允许 ±5%）
- [ ] 无新增每帧 DOM 读写；无新增独立 rAF 循环
- [ ] 读档首帧不出现旧背景/旧立绘闪现

---

## 十二、风险与取舍

| 风险 | 处理 |
| --- | --- |
| 一次改太多，行为漂移 | 5 个阶段，每阶段可回滚；先加护栏 |
| 拆界面时 DOM 迁移量大 | 先保留 `index.html` 的 DOM，只把事件/状态搬进 Screen；后续再迁 HTML |
| 存档语义变复杂 | v2 schema + 迁移函数 + 旧档样本回归 |
| 过度拆分 | 按 feature 簇拆，不按函数拆；500 行上限 |
| 零构建脚本顺序出错 | `index.html` 显式 boot manifest + 架构检查 |
| 3D 打磨拖累重构 | 独立分支，不混入阶段 1–4 |
| 引入库导致不可维护 | 默认不引入；如要引入，单独 Issue + 单库 + 本地 vendor + 可移除 |

---

## 十三、需要确认的六个决定

| # | 决定 | 推荐 |
| --- | --- | --- |
| 1 | 是否采用“五层 + Director 命令层”这个总结构？ | 是 |
| 2 | 是否保持零运行时依赖（不引入 React/Phaser/GSAP/Howler 等）？ | 是 |
| 3 | 是否接受 `EA` 单全局命名空间 + `boot.js` 组合根？ | 是 |
| 4 | 存档是否升级 v2，同时保证 v1 可读？ | 是 |
| 5 | 是否先做阶段 0–2（护栏/领域/指挥），界面拆分放后面？ | 是 |
| 6 | 3D 场景手工打磨是否单独开 `art/scene-recipes` 分支？ | 是 |

**确认方式**：回复“按推荐方案执行”即可；如果要改，请指出序号和要改的点。确认后从阶段 0 开分支，不动 `main`。

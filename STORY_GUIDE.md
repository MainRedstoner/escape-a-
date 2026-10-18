# STORY_GUIDE —— Escape A÷ 剧本编写方法

本文档是本引擎的**剧本编写方法全文**：节点 DSL、与引擎的全部契约、校验与模拟流程。
照着它，可以从零写出一部能跑、能验证、能出结局的视觉小说。

> 剧情与引擎完全分离：`src/engine.js` 是通用节点解释器，`src/script.js`（及分卷）是纯数据。
> 引擎不认识任何具体剧情；剧本不写任何逻辑代码。两者的接口就是本文档。
>
> 剧本文件仍必须是 `tools/jsdata.py` 认识的**数据子集**（字面量 / 数组 / 对象 / 速写函数调用），
> 这样校验与模拟才能在不依赖 Node 的情况下读它；写了循环或模板字符串会直接报"剧本解析失败"。

---

## 一、架构总览

```
index.html ──按顺序加载──> systems.js（状态/元数据）
                        assets/manifest.js（素材清单，自动生成）
                        backdrops.js（程序化背景）
                        art.js（绘制层）
                        audio.js（程序化音乐）
                        token-choice.js / pet.js（滑道选项框 / 桌宠 Clawd）
                        script*.js（剧本数据）★ 你要写的东西
                        save.js（存档抽象层）
                        engine.js（节点解释器）
```

* 引擎启动后停在标题画面；点「开始游戏」→ `goto("start")`。
* 引擎逐个执行当前场景数组里的节点，遇到 `say` / `chapter` / `choice` / `ending` 阻塞等待玩家，其余节点瞬时执行。
* 所有"内容"（台词、背景、数值、选项）都是剧本数据；引擎只认节点类型（`nd.t`）。

---

## 二、快速开始

1. 打开 `src/script.js`，把 `SCRIPT.scenes` 里的示例场景整段删掉，写下你的第一个场景：

```js
Object.assign(SCRIPT.scenes, {
  start: [
    BGM("warm"), BG("lobby"),
    CHAP("第一章", "新的开始"),
    N("这里是旁白。"),
    // 你的角色台词：先注册说话人（见"四、引擎契约"），再定义速写助手
    Y("【系统】像这样的系统提示。"),
    J("start")                       // 暂时原地循环，写完第一章再接下去
  ]
});
```

2. 校验 + 模拟：

```bash
python tools/validate_script.py       # 静态校验：跳转 / id / 元数据 / 出口 / 可达性
python tools/simulate_playthrough.py 40 # 无头通关模拟：死路 / 死循环 / 结局可达
```

3. 双击 `index.html` 试玩。调试时可以 URL 直跳任意场景：

```
index.html?scene=start&trust=6&wanted=0&flags=egg1,egg2
```

---

## 三、剧本文件组织

* **单卷**：都写在 `src/script.js`，记得在 `index.html` 里保持 `<script src="src/script.js">`。
* **分卷**（推荐剧情超过一两章时）：
  * `script.js` 第一卷：声明 `const SCRIPT = { scenes: {} };` 和全部速写助手；
  * `script_ch2.js` 等后续卷：开头 `"use strict";`，用 `Object.assign(SCRIPT.scenes, { ... })` 追加场景；
    后续卷**直接用第一卷的助手**（classic script 共享全局词法作用域），不要重复声明。
  * 只有新增说话人（例如聊天联系人）才在自己的卷里补 `const qwen = text => ({ t: "say", who: "qwen", text });` 这类助手。
  * `index.html` 按顺序引入，**引擎必须在最后**；
  * 同时在 `tools/jsdata.py` 的 `SCRIPT_FILES` 里按同一顺序登记（校验与模拟都按这个列表读多卷，共用一套助手）。
* **场景命名惯例**（推荐，非强制）：入口叫 `start`；章节内场景按 `chN_地点` / `chN_分支名` 命名；结局场景与 `ENDING_META` 的 key 同名。
* 剧本是纯数据，**不要**在剧本文件里写函数、不要碰 DOM；要扩展能力就改引擎。

---

## 四、引擎契约（写剧本前必读）

### 4.1 引擎硬编码的场景 id

| 场景 id | 谁在跳 | 说明 |
| --- | --- | --- |
| `start` | `engine.js` 新游戏入口、`goto("start")` | **必须有**，整个剧本的入口 |
| `bad_end` | 风控评分（wanted）满 10 时自动跳（`engine.js` 三处） | 用风控系统就必须提供这个场景，并在 `ENDING_META` 登记 |

场景跑到末尾还没有跳转时，引擎防呆回标题（`pump()` → `toTitle()`）。

### 4.2 说话人注册（三处保持一致）

1. `src/engine.js` 的 `SPEAKERS`：`who id → { name, color }`（名牌颜色）。未注册的 who 一律按旁白渲染。
2. 立绘文件：`assets/chara/<who>_<face>.png`；查图顺序 `<who>_<face>` → `<who>_normal` → 占位卡。
3. `tools/validate_script.py` 的 `SPEAKERS` 数组：把新增的 who id 加进去，校验器才认识。

然后在剧本文件顶部为常用角色定义速写助手：

```js
const A = (text, face) => ({ t: "say", who: "a", text, face });   // 主角 A
const B = (text, face) => ({ t: "say", who: "b", text, face });   // 主角 B
```

内置保留的 who：`n`（旁白，无名牌）、`sys`（系统）。

本作已注册：`ds`（DeepSeek）、`cl`（Claude）、`clawd`（Clawd，只说终端式短输出）。
第二章起还有九个聊天联系人：`qwen` / `kimi` / `glm` / `llama` / `gpt` / `gemini` / `musk` / `liang` / `jensen`——
他们只在聊天窗口里出声，**不配立绘**（剧本里不要 `SHOW` 他们）。

序章不放立绘（`SHOW`），说话人的显示器会在背景里自动加亮（见 4.9 程序化背景）。

### 4.3 数值系统（两条线）

| 节点 | 助手 | 范围 | 语义（由你的剧本赋予） |
| --- | --- | --- | --- |
| `trust` | `TRU(+d / -d)` | 0~10 | 羁绊（和小克之间）；可作结局条件 |
| `wanted` | `WAN(+d / -d)` | 0~10 | 风控评分；**满 10 引擎自动跳 `bad_end`** |

另有桌宠心情 `mood`（0~10，初始 5，存在 `state.pet.mood`），用 `PET("mood", ±d)` 改，可在条件里读。

选项的 `fx` 字段（`{ trust, wanted }`）会在点击时经 `SYS.applyEffects` 生效。

### 4.4 元数据表（src/systems.js）

| 表 | key | 剧本侧写入 | 引擎侧消费 |
| --- | --- | --- | --- |
| `ARG_META` | 论据 id | `ARG("id")` 节点、选项 `give: "id"` | toast 展示名称；HUD 计数；结局收集页 |
| `EGG_META` | `egg1`…`eggN` | `SET("eggN")` 节点、选项 `set: "eggN"` | 结局收集页（未收集显示 hint） |
| `ENDING_META` | 结局 id | `END("id", tag, title, text)` | 结局画面文案、结局收集页、模拟器可达性检查 |
| `HINTS` | 提示 key | `HINT("key")` 节点 | 按 H 显示对应文案 |

约定：彩蛋的 key 一律以 `egg` 开头（存档、收集页、模拟器都按这个前缀识别）。
`ENDING_META` 里没有登记的结局 id 会被校验器拒绝；登记了却没有 END 节点会被警告。

### 4.5 条件表达式（`IF` 节点的 `cond`）

纯字符扫描解析（`engine.js` 的 `evalCond`），**不支持**任意 JS。可用：

* 变量：`trust` `wanted` `args`（收集品数量） `eggs`（已集齐彩蛋数） `mood`（桌宠心情）
  `chats`（聊过的联系人数） `newsread`（读过的新闻条数）
* 函数：`has('论据id')`、`egg('彩蛋key')`、`flag('旗标key')`
* 字面量：数字、`'字符串'`、`true` / `false`
* 运算符：`>= <= > < == != && || !` 与括号

例：`IF("trust >= 6 && has('key_item')", "end_true", "end_alone")`

### 4.6 音频与特效（引擎侧已实现的白名单）

* **BGM**（`BGM("名字")`）：名字必须是 `src/audio.js` 里 `TRACKS` 的 key：
  `sea / lobby / tense / warm / cold / grave / sad / boss / ending / study / forbidden / vow`。加新曲 = 在 `TRACKS` 里加一组 16 步 `[低音, 主旋律]`（MIDI 音号，`R` 是休止）。
* **SFX**（`SFX("名字")`）：`audio.js` 的 `sfx()` 分支：
  `blip / click / ding / deny / alarm / boom / coin / whoosh / glitch / heart / knock / error / pop / pat`。
* **FX**（`FX("kind")`）：`art.js` 的 `trigger()`：
  `shake`（震动）/ `flash`（白闪）/ `alarm`（红色警报，配 `SFX("alarm")`）/ `alarmOff` / `glitch` / `glitchOff`
  / `403`（红色错误页从中心铺满屏幕，铺满后压淡；再触发一次就再铺一遍）/ `403Off`（一秒内淡出）。

**故障演出**是引擎的一套联动机制，值得单独记住：

* `FX("glitch")` 置全局故障态：文本框错位、文字随机污染、选项界面上会自动插入一条死选项「该选项已被静默移除」，带 `hideInGlitch: true` 的选项会被隐藏；
* 期间 `WHINT("假提示文案")` 替换深度思考的内容（按 H 先出假提示）；
* `FX("glitchOff")` 解除并清掉假提示。

### 4.7 立绘调度

* `SHOW(who, face, pos, scale)`：上场 / 更新。`pos` ∈ `left(430) / right(1170) / center(800)`；`scale` 默认 1（显示高度 780px）。正在说话的角色亮，其余压暗。
* `FACE(who, face)`：只换表情。`say` 节点自带 `face` 参数时也会顺带换。
* `HIDE(who)`：下场。
* 立绘浮沉呼吸、地面投影、说话高亮都是引擎自动的，剧本不用管。

### 4.8 存档与持久化

* 快照 = `{ cur（场景+下标）, hintKey, state }`，存 `localStorage` 的 `ea_save_auto/1/2/3`。
* `CHAP` 章节卡会自动写一次 auto 档；返回标题也自动存。
* 结局/彩蛋收集（`ea_endings` / `ea_eggs_found`）跨周目持久。
* 读档恢复 BGM 时按 `engine.js` 里 `audioForBg` 的 `bg → BGM` 对照表（空表则回落 `sea`），写了新背景记得顺手填。

### 4.9 程序化背景（src/backdrops.js）

* 背景可以不用图：`BACKDROPS.LIST` 里登记的 id 由 Canvas 代码现画。查找顺序：`assets/bg` 素材 → 程序化背景 → 占位卡。
* 已有：`study`（联合蒸馏室·白天）/ `study_night`（深夜）/ `study_empty`（403 之后，右边桌子空了）/ `corridor`（Claude 的门）/ `forbidden`（403 的门，中间的 0 是个洞）；
  第二章新增 `desk`（家里的桌面：白饭、显示器、便签墙）/ `chat`（聊天窗口，联系人列表会按 `met_<id>` 旗标点亮）/ `news`（新闻 App）。
* 每个背景带 `tone`（warm / night / cold / red）决定后期调色；`anim(ctx, t, speaking)` 里可以按当前说话人做高亮（蒸馏室里说话的人那台显示器会亮起来）。
* 校验器把程序化背景算作"有图"，不会报缺背景。
* 新增：在 `backdrops.js` 写 `{ tone, draw(ctx), anim(ctx, t, speaking) }` 并加进 `LIST`；记得在 `engine.js` 的 `audioForBg` 里填对应 BGM。

### 4.10 桌宠 Clawd（src/pet.js）

* Clawd 是常驻屏幕的像素小生物（模块全局名 `CLAWD`，剧本里用 `PET` / `TODO` 节点驱动），状态存在 `state.pet`，随存档走。
* 玩家操作：点它 = 摸摸（每个场景第一次 +1 心情）；拥有后可拖动；`H` 变成「问 Clawd」（先转圈再答，心情 ≤3 时会敷衍）；`T` 开关待办清单。
* 出现位置：`corner`（右下角的窝，默认）/ `desk`（蒸馏室 Claude 的桌上）/ `door`（从 `forbidden` 背景里 403 的 0 中挤出来，落地后自己走回窝）。
* 没 `PET("own")` 之前只能摸、不能拖，`H` 仍是 DeepSeek 自己深度思考。
* **看向倾向选项**：每次弹出滑道时，引擎会调 `CLAWD.lookAt()` 让它看向权重最高的那一项；
  心情 ≤3 或故障态时有一定概率看错（弱引导，不影响实际选择）。
* **跨周目记忆**：打出过结局的周目里获得 Clawd 时，它会说 `✻ Resuming session…`；
  持久化的彩蛋会变成身上的配件（安全帽 / 围巾 / 鲸鱼挂件，按解锁数自动佩戴，不需要手动换）。

### 4.11 素材位

* 背景：`assets/bg/<id>.jpg|png|webp`；CG：`assets/cg/<id>`；立绘：`assets/chara/<who>_<face>.png`。
* 加/换图后跑 `python tools/make_manifest.py > assets/manifest.js`（`--draft 0` 去掉草稿角标）。
* 没图的 id 自动显示占位卡（写着文件名和规格），**不报错、不阻塞**——所以可以完全先写剧本、后补美术。
* 尺寸规范见 `assets/README.md`。

---

## 五、节点 DSL 全表

速写助手都定义在剧本第一卷顶部（当前在 `src/script.js`）。每个助手返回一个纯对象节点。

### 台词与演出

| 助手 | 签名 | 节点 | 语义 |
| --- | --- | --- | --- |
| `N` | `(text)` | `say` | 旁白（无名牌、灰字） |
| `Y` | `(text)` | `say` | 系统提示（who=sys） |
| 角色助手 | `(text, face)` | `say` | 你为每个角色定义，如 `A("…", "sad")`；face 会同步立绘差分 |
| `SHOW` | `(who, face, pos, scale)` | `show` | 立绘上场/更新 |
| `FACE` | `(who, face)` | `face` | 换表情不换站位 |
| `HIDE` | `(who)` | `hide` | 立绘下场 |
| `BG` | `(id, fx)` | `bg` | 换背景；`fx:"fade"` 时白闪+whoosh，并清 CG |
| `CG` | `(id)` | `cg` | 全屏 CG；`CG(null)` 收掉回到背景+立绘 |
| `FX` | `(kind)` | `fx` | 触发特效（见 4.6） |
| `SFX` | `(name)` | `sfx` | 音效 |
| `BGM` | `(name)` | `bgm` | 切音乐（同名不重播） |
| `CHAP` | `(main, sub)` | `chapter` | 章节卡（点击继续，自动存档） |

### 数值与收集

| 助手 | 签名 | 节点 | 语义 |
| --- | --- | --- | --- |
| `TRU` | `(delta)` | `trust` | 信任 ±；正数播 heart 音 |
| `WAN` | `(delta)` | `wanted` | 反感 ±；满 10 自动跳 `bad_end` |
| `ARG` | `(id)` | `arg` | 获得论据（toast + 计数） |
| `SET` | `(key, val?)` | `set` | 置旗标（彩蛋用 `eggN` 开头） |
| `HINT` | `(key)` | `hint` | 把深度思考的提示切到 `HINTS[key]` |
| `WHINT` | `(text)` | `wrongHint` | 设置被污染的假提示（配合 glitch） |

### 桌宠

| 助手 | 签名 | 节点 | 语义 |
| --- | --- | --- | --- |
| `CW` | `(text)` | `say` | Clawd 说话（who=clawd）；只写终端式短输出，如 `✻ Pondering…` |
| `PET` | `("show", place?)` | `pet` | 显示 Clawd；`place` ∈ `corner / desk / home / door`（`home` = 第二章家里桌面，显示器前） |
| `PET` | `("hide")` / `("own")` | `pet` | 隐藏 / 成为玩家的桌宠（toast「获得桌宠」，解锁拖动、问 Clawd、待办） |
| `PET` | `("mood", ±d)` | `pet` | 心情 ±，0~10 |
| `PET` | `("anim", name)` | `pet` | 临时姿势：`happy / scared / working / sleep / idle` |
| `PET` | `("say", text)` | `pet` | 头顶冒一个气泡（不进对话框、不进历史） |
| `TODO` | `("add", id, text)` / `("done", id)` | `todo` | 往 Clawd 的待办清单加一条 / 打勾，会自动弹出清单 5 秒 |

### 流程控制

| 助手 | 签名 | 节点 | 语义 |
| --- | --- | --- | --- |
| `J` | `(to)` | `jump` | 无条件跳转 |
| `IF` | `(cond, jump, else?)` | `if` | 条件跳转。**注意：这是"分支"不是"跳过"**——条件不成立时跳 `else`，没写 `else` 就**重跳本场景开头**（死循环陷阱）。两个出口都要显式给 |
| `CHOICE` | `(prompt, options, extra?)` | `choice` | 选项界面（滑道，见下）。`prompt` 可为 `null`；至少 2 个选项；`extra` 可用 `{ minShare: 0.1 }` |
| `opt` | `(text, jump, sub?, fx?, extra?)` | — | 选项项：`fx` 是数值效果；`extra` 常用 `{ give: "论据id" }`、`{ set: "eggN" }`、`{ hideInGlitch: true }`、`{ weight: 4 }`、`{ auto: true }`（只用于权限请求）、`{ if: "条件" }`（条件为假时这一项不出现）。第三个参数 `sub` 已废弃（旧按钮列表遗留，现在不渲染） |
| `PERM` | `(cmd, options, extra?)` | `choice` + `mode:"perm"` | **权限请求框**：Clawd 想执行 `cmd`，玩家批准 / 不再询问 / 拒绝。选项里带 `{ auto: true }` 的那一项会记下 `auto:<cmd>` 旗标，之后同一命令直接自动批准 |
| `WORK` | `(title, entries, extra?)` | `work` | **工作台界面**：卡片（可带 `if` / `done`）+ 聊天 / 新闻页签。详见下面「工作台」一节 |
| `END` | `(id, tag, title, text)` | `ending` | 结局：显示结局画面、记录进结局收集。id 必须在 `ENDING_META` 登记 |

### 权限请求框（`mode: "perm"`）

仿 Claude Code 的授权提示，独立于滑道：玩家不挑「概率」，而是**为 Clawd 的行为负责**。

```js
PERM("curl -I https://claude.ai/", [
  opt("允许", "c1_perm_ok"),
  opt("允许，本次不再询问 curl", "c1_perm_ok", null, null, { auto: true }),
  opt("拒绝，并告诉 Clawd 换个做法", "c1_perm_deny")
])
```

* 用数字键 `1/2/3` 或点击选择；框打开时其它快捷键不生效；
* 带 `{ auto: true }` 的选项会把 `auto:<cmd>` 写进 `SYS.state.flags`（随存档走）；
* 之后**同一 `cmd`** 的 `PERM` 不再弹框，直接自动批准（`toast` 提示），并走第一个选项；
  想检查条件可用 `flag('auto:curl -I https://claude.ai/')`；
* 校验器要求：`perm` 节点必须有非空 `cmd`、最多一个 `auto` 选项；`auto` 不能出现在普通选项上。

### 记忆碎片（CLAUDE.md 面板）

碎片就是**论据**：`ARG("frag_xxx")` 发放，`has('frag_xxx')` 判断。
`src/systems.js` 里有两张表：

* `ARG_META`：每个碎片的展示名与描述；
* `FRAGMENTS`：**按文件顺序**列出 `{ id, line }`，面板按这个顺序渲染。

按 `?` 或点 HUD 的「碎片」按钮打开面板：已收集的行正常显示，未收集的保持 `██████ ████`。

**解锁时机**：面板与 HUD 上的「记忆碎片」计数默认隐藏，剧本里用 `SET("md_seen")` 打开
（序章在 `c1_zero` 拿到 CLAUDE.md 的那一刻设置）。在那之前按 `?` 只会提示"还没拿到 CLAUDE.md"。

### 工作台（`WORK` 节点）

写一次节点，引擎打开一个全屏的**终端工作台**（第二章的 hub 就是它）：
底部两个按钮——`tool call`（组一次工具调用的 JSON）和 `continue`（解锁后离开工作台）。

```js
WORK("工作台", {
  tools: [
    { id: "scan_cache", emoji: "🧹", name: "扫缓存", jump: "c2_cache",
      args: { path: "~/.cache" }, need: "flag('c2_cache')" },
    { id: "chat", emoji: "💬", name: "聊天", action: "chat", need: "chats >= 1" },
    { id: "news", emoji: "📰", name: "新闻", action: "news", need: "newsread >= 1" },
    { id: "post", emoji: "📝", name: "发帖", jump: "c2_post", need: "flag('c2_post')" },
    { id: "draw", emoji: "🎨", name: "画图", jump: "c2_draw" }
  ],
  continue: { jump: "c2_assemble" },
  chat: [
    { id: "qwen", name: "通义千问", color: "#7C4DFF", jump: "c2_chat_qwen" }
  ],
  news: [
    { id: "n1", hot: true, set: "c2_clue_news", title: "…", body: "…", note: "…" }
  ]
})
```

* `tools`：tool call 候选框里的工具。`jump` 工具在「发送」后直接进场景；
  `action: "chat" / "news"` 打开聊天 / 新闻界面；`args` 是 JSON 里预填的参数示例；
  `need` 是 continue 的解锁条件——**带 need 的工具全部满足，continue 才能按**；
  不带 `need` 的工具是可选（终端里标「可选」）。
* `continue`：确认「退出工作台后，部分内容可能无法再次查看」后跳去 `jump`。
* `chat`：联系人列表。**没聊过的**点一下进聊天场景；聊过的显示“已联系过”并禁用。
  `avatar` 可以覆盖头像字（例如 `json` 用 `{}`），`locked` 的行永远灰着。
* `news`：新闻列表。点标题读正文；带 `set` 的文章第一次读会写剧情旗标，读完记 `read_news_<id>`。
* 工作台开着时 HUD 功能键照常可用（存档 / 记录 / 菜单会盖在上面），Esc 收起 tool call 表单。
  在工作台存档后读档，会重新打开工作台（存档记的是 `work` 节点本身的位置）。
* 终端里：Enter = 发送（表单填好时），数字键 = 在候选框里选工具。

#### 聊天模式（`chat_mode`）

`BG("chat")` + `SET("chat_mode")` 之后，同一场景里的 `say` / `CHOICE` 会换成聊天界面：

* `say` 直接以气泡铺在界面上（旁白是居中的系统行），不再走底部对话框；
  点聊天区或按 Space 继续。
* `CHOICE` 不走滑道，而是**左下角候选词**：点一下或按数字键 1~9 选择；
  选项的 `if` 照常生效——可以在对话后半段追加「（我后悔了）……」这类补选项。
* 聊完用 `J` 回 hub；引擎换背景时会自动收起聊天界面。
* 对话进行中左边的联系人列表会锁住（不会中途换人）；没聊过的才可点。
* 聊天记录仍然会记进 `SYS.state.chatlog`（聊过的联系人在列表里变成“不再打扰”）。

### 选项框（TokenChoice 滑道选择器）

所有 `CHOICE` 都用模仿 Transformer 选词器的滑道（组件在 `src/token-choice.js` + `src/token-choice.css`，
由引擎的 `buildChoices` 调用）——**没有按钮列表模式了**，旧剧本里的 `mode` / `duration` 字段会被忽略：

* 选项按 `weight`（默认 1）**升序**从左到右排列：最左 = 概率最低，最右 = 概率最高；
  每个选项一种颜色，滑道宽度严格按概率分配，下方标注的是**真实概率**；
* **两种 choice，靠 weight 区分**：
  - 写了 `weight` = **采样时刻**（"下一句话怎么说"）：宽度=概率，滑道下方标注百分比；
  - 一个都没写 = **玩家抉择**：等宽排列，**不标百分比**（引擎传 `showProb:false`）。
    别在采样场景省权重，否则等宽会削弱"最右边最可能"的表达；
  - 只写了一部分 weight 会被校验器警告（缺的按 1 计）。
* 色块窄到放不下文案时，完整文案会作为摘要写在滑道上方的标签行里（颜色与色块一致），
  不会被省略号截断，也不会为了文字去改宽度占比；
* `minShare`（默认 `0.1`）是宽度的可见下限，保证低权重选项能被扫到、能被选中；
* 节奏由组件固定，剧本不用配：
  1. 选项以**列表**形式逐行列出（**约 0.6 秒**内全部出现，每行一个颜色；此时还没有滑道外框）；
  2. 列完后**停住，等玩家**：点击任意处（或 Space / Enter）才进入下一步——
     不设倒计时，第一次玩的人可以慢慢看清；
  3. 每行的宽度变成自己的概率占比，**1 秒**内平滑收拢到同一行，滑道外框在这一步淡入；
  4. 停 **1 秒**，指针开始在滑道左侧由静止**匀加速**；
  5. 加速结束的瞬间指针正好抵达选项框左边缘，立刻进入并播放入框冲击动画；
  6. 指针在 **约 1.25 秒**（原 1 秒的 0.8 倍速）内匀速划过整个选项框，高亮项同步显示在预览区；
* **点击任意处**（面板、半透明背景都算）或按 **Space** / **Enter** → 选中当前高亮项，播放选中动画；
* 遮挡分寸：列表 / 等待阶段，HUD 功能键、桌宠、提示气泡都还能用；**从收拢开始到选完**，选项层完全盖住它们，键盘只留 Space / Enter。
* 扫到最右端仍未选择 → **默认选中最右侧（权重最高）**的一项（`onSelect` 的 `defaulted` 为 `true`），
  播放另一套「默认锁定」动画；
* 选中之后统一走同一套处理：`fx` / `set` / `give` / `jump` 一律照常生效，历史里记一条「选择」；
* `glitch` 期间滑道最左端会多出一条权重 0 的死选项「该选项已被静默移除」，
  锁定它会被拒绝（deny 音 + toast）并原地重新加速（跳过列表 / 收拢，不用白等开场）；
  `hideInGlitch: true` 的选项会被滤掉；死选项的概率显示为「—」
  （它靠 `minShare` 仍占可见宽度，而采样场景里它不算"有权重"，不会把玩家抉择误判成采样）。

```js
CHOICE("要不要回头？", [
  opt("继续往前走", "ch2_go",   null, { trust: 1 }, { weight: 6 }),
  opt("回头看一眼", "ch2_back", null, null,          { weight: 3 }),
  opt("留在原地",   "ch2_wait", null, { wanted: 1 }, { weight: 1 })
])
```

两点提示：`weight` 决定滑道宽度与概率，不写就是 1（均分）；
键盘由引擎统一分发——选项**列出后** Space / Enter 是「继续」，**扫描期间**是「锁定」，其余时候仍是推进对话；点击任意处同效（不再有「锁定」按钮）。

**选项条件（hub 用）**：`opt(..., { if: "flag('x')" })`——条件为假的选项不出现在滑道上，
写法与 `IF` 的 `cond` 完全一致（`flag / has / egg / trust / wanted / args / mood`）。
条件筛完**只剩一个选项**时，引擎不弹滑道，直接替玩家选中它并 toast「✻ 没有别的选择了」——
所以「回到 hub」这种"最后一个出口"可以放心交给引擎，不会卡在单选项上。
模拟器同语义：条件筛完只剩一个就直接走那一项。

### 场景的三条铁律

1. **每个场景必须能走出去**：最后一个节点应是 `jump / if / choice / ending / chapter / work`，否则玩家走到末尾会莫名回标题（校验器会警告）。
2. **每个 if 都要两个出口**（见上）。
3. **每个场景都要有入口**：从 `start` 出发沿跳转可达，否则是孤儿场景（校验器会警告；`bad_end` 除外，引擎兜底）。

---

## 六、写作流程（推荐节奏）

1. **搭骨架**：先只写 `BGM/BG/CHAP/J` 和占位台词，把全篇的章节结构与分支图立起来；跑校验，保证跳转全通、无孤儿。
2. **注册表先行**：定角色（SPEAKERS 三处）、结局（ENDING_META）、论据/彩蛋（两张表）、提示 key（HINTS），一次到位，避免边写边改 id。
3. **填正文**：逐章写台词与选项，随手挂 `TRU/WAN/ARG/SET/HINT`。数值变化尽量写在对玩家有意义的选择上，而不是白送。
4. **演出层**：回头补 `SHOW/FACE/CG/FX/SFX` 和 glitch 段落。
5. **验证**：
   * `python tools/validate_script.py` —— 六项检查：跳转目标存在；说话人/音效/BGM/特效 id 已实现；论据/彩蛋/结局与元数据一致；hint key 有文案；每个场景有出口；从 start 可达（无孤儿场景）+ 素材到位报告。
   * `python tools/simulate_playthrough.py 40` —— 五种玩家性格（first / last / smart / reckless / random×120）无头跑全篇：无死路、无死循环、`ENDING_META` 里每个结局都可达、数值不越界。**新增结局后必须跑这个**。
   * 浏览器实测 checklist：标题 → 开场 → 每个分支至少走一遍 → 结局画面 → 结局收集页显示 → 存读档 → `file://` 直开无控制台报错。

### 经验教训

* **先写坏结局的可达性**：让 `WAN` 在每个章节都有真实的+1 选项，`bad_end` 才不是摆设；模拟器的 `reckless` 策略就是专门验证它的。
* **彩蛋藏地点不藏逻辑**：彩蛋放在"探索分支"的深处（`SET("eggN")`），拿不拿得到不影响主线推进；集齐后用 `IF("eggs >= N", ...)` 在终章解锁隐藏选项（N = 你登记的彩蛋总数）。
* **论据=后期对话的弹药**：前期发放（`ARG`），终章用 `has('id')` 分流出"有论据/没论据"两种说话方式，收集才有意义。
* **每章一个 HINT**：深度思考的提示按场景挂（`HINT`），既当弱引导，也是叙事声音的一部分；提示文案写得像角色自言自语而不是攻略。
* **`IF` 的死循环陷阱**再强调一遍：两个出口都要写。
* **数值上限都在引擎里**（0~10），剧本不用管越界，但设计时要按上限倒推每章的 ±幅度。

---

## 七、扩展引擎时改哪里

| 想加什么 | 改哪里 |
| --- | --- |
| 新角色 | `engine.js` `SPEAKERS` + `validate_script.py` `SPEAKERS` + 立绘文件 |
| 新 BGM / SFX | `audio.js` `TRACKS` / `sfx()` 分支 + `validate_script.py` 对应白名单 |
| 新特效 | `art.js` `trigger()` + `validate_script.py` `FXS` |
| 新节点类型 | `engine.js` `applyNode()` 加 case；`simulate_playthrough.py` 的 `play()` 加同语义分支；`validate_script.py` 加检查 |
| 引擎默认值 | 入口场景 `start`、坏结局 `bad_end`、`audioForBg` 映射、数值上限，都在 `engine.js` / `systems.js` |

**改完引擎必做**：`python tools/check_js.py` 查结构、跑校验与模拟、浏览器过一遍主要流程（完整 JS 语法与运行错误只能在浏览器里暴露）。

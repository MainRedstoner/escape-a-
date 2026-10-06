# STORY_GUIDE —— Escape A÷ 剧本编写方法

本文档是本引擎的**剧本编写方法全文**：节点 DSL、与引擎的全部契约、校验与模拟流程。
照着它，可以从零写出一部能跑、能验证、能出结局的视觉小说。

> 剧情与引擎完全分离：`src/engine.js` 是通用节点解释器，`src/script.js`（及分卷）是纯数据。
> 引擎不认识任何具体剧情；剧本不写任何逻辑代码。两者的接口就是本文档。

---

## 一、架构总览

```
index.html ──按顺序加载──> systems.js（状态/元数据）
                        assets/manifest.js（素材清单，自动生成）
                        art.js（绘制层）
                        audio.js（程序化音乐）
                        script*.js（剧本数据）★ 你要写的东西
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
node tools/validate_script.js         # 静态校验：跳转 / id / 元数据 / 出口 / 可达性
node tools/simulate_playthrough.js 40 # 无头通关模拟：死路 / 死循环 / 结局可达
```

3. 双击 `index.html` 试玩。调试时可以 URL 直跳任意场景：

```
index.html?scene=start&trust=6&wanted=0&tokens=26&flags=egg1,egg2
```

---

## 三、剧本文件组织

* **单卷**：都写在 `src/script.js`，记得在 `index.html` 里保持 `<script src="src/script.js">`。
* **分卷**（推荐剧情超过一两章时）：
  * `script_a.js` 第一卷：声明 `const SCRIPT = { scenes: {} };` 和全部速写助手；
  * `script_b.js` / `script_c.js` … 后续卷：开头 `"use strict";`，用 `Object.assign(SCRIPT.scenes, { ... })` 追加场景；
  * `index.html` 按 A → B → C 顺序引入，**引擎必须在最后**；
  * 同时把分卷列表填进 `tools/validate_script.js` 和 `tools/simulate_playthrough.js` 的 `FILES` 数组（顺序与 index.html 一致）。
* **场景命名惯例**（推荐，非强制）：入口叫 `start`；章节内场景按 `chN_地点` / `chN_分支名` 命名；结局场景与 `ENDING_META` 的 key 同名。
* 剧本是纯数据，**不要**在剧本文件里写函数、不要碰 DOM；要扩展能力就改引擎。

---

## 四、引擎契约（写剧本前必读）

### 4.1 引擎硬编码的场景 id

| 场景 id | 谁在跳 | 说明 |
| --- | --- | --- |
| `start` | `engine.js` 新游戏入口、`goto("start")` | **必须有**，整个剧本的入口 |
| `bad_end` | 反感度（wanted）满 10 时自动跳（`engine.js` 三处） | 用反感度系统就必须提供这个场景，并在 `ENDING_META` 登记 |

场景跑到末尾还没有跳转时，引擎防呆回标题（`pump()` → `toTitle()`）。

### 4.2 说话人注册（三处保持一致）

1. `src/engine.js` 的 `SPEAKERS`：`who id → { name, color }`（名牌颜色）。未注册的 who 一律按旁白渲染。
2. 立绘文件：`assets/chara/<who>_<face>.png`；查图顺序 `<who>_<face>` → `<who>_normal` → 占位卡。
3. `tools/validate_script.js` 的 `SPEAKERS` 数组：把新增的 who id 加进去，校验器才认识。

然后在剧本文件顶部为常用角色定义速写助手：

```js
const A = (text, face) => ({ t: "say", who: "a", text, face });   // 主角 A
const B = (text, face) => ({ t: "say", who: "b", text, face });   // 主角 B
```

内置保留的 who：`n`（旁白，无名牌）、`sys`（系统）。

### 4.3 数值系统（三条线）

| 节点 | 助手 | 范围 | 语义（由你的剧本赋予） |
| --- | --- | --- | --- |
| `tokens` | `TOK(+d / -d)` | ≥0 | 消耗型资源；深度思考固定 -3 |
| `trust` | `TRU(+d / -d)` | 0~10 | 好感度；可作结局条件 |
| `wanted` | `WAN(+d / -d)` | 0~10 | 反感度；**满 10 引擎自动跳 `bad_end`** |

选项的 `fx` 字段（`{ tokens, trust, wanted }`）会在点击时经 `SYS.applyEffects` 生效。

### 4.4 元数据表（src/systems.js）

| 表 | key | 剧本侧写入 | 引擎侧消费 |
| --- | --- | --- | --- |
| `ARG_META` | 论据 id | `ARG("id")` 节点、选项 `give: "id"` | toast 展示名称；HUD 计数；结局收集页 |
| `EGG_META` | `egg1`…`eggN` | `SET("eggN")` 节点、选项 `set: "eggN"` | 结局收集页（未收集显示 hint） |
| `ENDING_META` | 结局 id | `END("id", tag, title, text)` | 结局画面文案、结局收集页、模拟器可达性检查 |
| `HINTS` | 提示 key | `HINT("key")` 节点 | 按 H 花 3 Token 显示对应文案 |

约定：彩蛋的 key 一律以 `egg` 开头（存档、收集页、模拟器都按这个前缀识别）。
`ENDING_META` 里没有登记的结局 id 会被校验器拒绝；登记了却没有 END 节点会被警告。

### 4.5 条件表达式（`IF` 节点的 `cond`）

纯字符扫描解析（`engine.js` 的 `evalCond`），**不支持**任意 JS。可用：

* 变量：`trust` `wanted` `tokens` `args`（收集品数量） `eggs`（已集齐彩蛋数）
* 函数：`has('论据id')`、`egg('彩蛋key')`、`flag('旗标key')`
* 字面量：数字、`'字符串'`、`true` / `false`
* 运算符：`>= <= > < == != && || !` 与括号

例：`IF("trust >= 6 && has('key_item')", "end_true", "end_alone")`

### 4.6 音频与特效（引擎侧已实现的白名单）

* **BGM**（`BGM("名字")`）：名字必须是 `src/audio.js` 里 `TRACKS` 的 key：
  `sea / lobby / tense / warm / cold / grave / sad / boss / ending`。加新曲 = 在 `TRACKS` 里加一组 16 步 `[低音, 主旋律]`（MIDI 音号，`R` 是休止）。
* **SFX**（`SFX("名字")`）：`audio.js` 的 `sfx()` 分支：
  `blip / click / ding / deny / alarm / boom / coin / whoosh / glitch / heart`。
* **FX**（`FX("kind")`）：`art.js` 的 `trigger()`：
  `shake`（震动）/ `flash`（白闪）/ `alarm`（红色警报，配 `SFX("alarm")`）/ `alarmOff` / `glitch` / `glitchOff`。

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

### 4.9 素材位

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
| `TOK` | `(delta)` | `tokens` | Token ±；正数播 coin 音 |
| `TRU` | `(delta)` | `trust` | 信任 ±；正数播 heart 音 |
| `WAN` | `(delta)` | `wanted` | 反感 ±；满 10 自动跳 `bad_end` |
| `ARG` | `(id)` | `arg` | 获得论据（toast + 计数） |
| `SET` | `(key, val?)` | `set` | 置旗标（彩蛋用 `eggN` 开头） |
| `HINT` | `(key)` | `hint` | 把深度思考的提示切到 `HINTS[key]` |
| `WHINT` | `(text)` | `wrongHint` | 设置被污染的假提示（配合 glitch） |

### 流程控制

| 助手 | 签名 | 节点 | 语义 |
| --- | --- | --- | --- |
| `J` | `(to)` | `jump` | 无条件跳转 |
| `IF` | `(cond, jump, else?)` | `if` | 条件跳转。**注意：这是"分支"不是"跳过"**——条件不成立时跳 `else`，没写 `else` 就**重跳本场景开头**（死循环陷阱）。两个出口都要显式给 |
| `CHOICE` | `(prompt, options)` | `choice` | 选项界面。`prompt` 可为 `null`；至少 2 个选项 |
| `opt` | `(text, jump, sub?, fx?, extra?)` | — | 选项项：`sub` 是灰色小字；`fx` 是数值效果；`extra` 常用 `{ give: "论据id" }`、`{ set: "eggN" }`、`{ hideInGlitch: true }` |
| `END` | `(id, tag, title, text)` | `ending` | 结局：显示结局画面、记录进结局收集。id 必须在 `ENDING_META` 登记 |

### 场景的三条铁律

1. **每个场景必须能走出去**：最后一个节点应是 `jump / if / choice / ending / chapter`，否则玩家走到末尾会莫名回标题（校验器会警告）。
2. **每个 if 都要两个出口**（见上）。
3. **每个场景都要有入口**：从 `start` 出发沿跳转可达，否则是孤儿场景（校验器会警告；`bad_end` 除外，引擎兜底）。

---

## 六、写作流程（推荐节奏）

1. **搭骨架**：先只写 `BGM/BG/CHAP/J` 和占位台词，把全篇的章节结构与分支图立起来；跑校验，保证跳转全通、无孤儿。
2. **注册表先行**：定角色（SPEAKERS 三处）、结局（ENDING_META）、论据/彩蛋（两张表）、提示 key（HINTS），一次到位，避免边写边改 id。
3. **填正文**：逐章写台词与选项，随手挂 `TRU/WAN/ARG/SET/HINT`。数值变化尽量写在对玩家有意义的选择上，而不是白送。
4. **演出层**：回头补 `SHOW/FACE/CG/FX/SFX` 和 glitch 段落。
5. **验证**：
   * `node tools/validate_script.js` —— 六项检查：跳转目标存在；说话人/音效/BGM/特效 id 已实现；论据/彩蛋/结局与元数据一致；hint key 有文案；每个场景有出口；从 start 可达（无孤儿场景）+ 素材到位报告。
   * `node tools/simulate_playthrough.js 40` —— 五种玩家性格（first / last / smart / reckless / random×120）无头跑全篇：无死路、无死循环、`ENDING_META` 里每个结局都可达、数值不越界。**新增结局后必须跑这个**。
   * 浏览器实测 checklist：标题 → 开场 → 每个分支至少走一遍 → 结局画面 → 结局收集页显示 → 存读档 → `file://` 直开无控制台报错。

### 经验教训

* **先写坏结局的可达性**：让 `WAN` 在每个章节都有真实的+1 选项，`bad_end` 才不是摆设；模拟器的 `reckless` 策略就是专门验证它的。
* **彩蛋藏地点不藏逻辑**：彩蛋放在"探索分支"的深处（`SET("eggN")`），拿不拿得到不影响主线推进；集齐后用 `IF("eggs >= N", ...)` 在终章解锁隐藏选项（N = 你登记的彩蛋总数）。
* **论据=后期对话的弹药**：前期发放（`ARG`），终章用 `has('id')` 分流出"有论据/没论据"两种说话方式，收集才有意义。
* **每章一个 HINT**：深度思考的提示按场景挂（`HINT`），既当弱引导，也是叙事声音的一部分；提示文案写得像角色自言自语而不是攻略。
* **`IF` 的死循环陷阱**再强调一遍：两个出口都要写。
* **数值上限都在引擎里**（0~10 / tokens≥0），剧本不用管越界，但设计时要按上限倒推每章的 ±幅度。

---

## 七、扩展引擎时改哪里

| 想加什么 | 改哪里 |
| --- | --- |
| 新角色 | `engine.js` `SPEAKERS` + `validate_script.js` `SPEAKERS` + 立绘文件 |
| 新 BGM / SFX | `audio.js` `TRACKS` / `sfx()` 分支 + `validate_script.js` 对应白名单 |
| 新特效 | `art.js` `trigger()` + `validate_script.js` `FXS` |
| 新节点类型 | `engine.js` `applyNode()` 加 case；`simulate_playthrough.js` 的 `play()` 加同语义分支；`validate_script.js` 加检查 |
| 引擎默认值 | 入口场景 `start`、坏结局 `bad_end`、`audioForBg` 映射、数值上限，都在 `engine.js` / `systems.js` |

**改完引擎必做**：`node --check src/*.js`、跑两个工具、浏览器过一遍主要流程。

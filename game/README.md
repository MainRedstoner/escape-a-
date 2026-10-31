# 修复屎山 —— 仓库里的小游戏

双击 **`game/index.html`** 就能玩。和主线一样：零依赖、零构建、`file://` 直开，
只用原生 Canvas / DOM / WebAudio。它是独立小游戏，但**存档与主线完全隔离**（见下）。

玩法一句话：在一座屎山里挪格子、躲甲虫（bug）、在 `-o-` 上落 commit 当存档，
把虫修干净之后 PR 门才会亮起，踩上去进下一关。

---

## 一、操作

**左手 `WASD` 走路，右手一整个功能块**：动词挤在 `U I O P / H J K L / M` 这一小片上，两只手都不用离开主键盘区。
`方向键` 仍当移动备用键。

| 键 | 动作 |
| --- | --- |
| `WASD` | 走一格（`方向键` 同效）。**回合制**：你动一步，虫和机关才动一步 |
| `空格` / `↑` | 横版里起跳（先原地起跳，再按方向才上得了台阶）；教学提示也要按它确认 |
| `H` | 修虫（fix）。贴着它按住引导 0.4 秒，一动就打断 |
| `K` | 盖测试（配额）。祖传虫必须先盖测试再删，否则当场变两只 |
| `J` | 丢 `console.log` 探针：照亮前方 + 让假墙 / 假地板现形 |
| `L` | 站在 `-o-` 上落一个 commit（`Enter` 同效，菜单里它也是确认键） |
| `U` | 打开回档面板，挑一个 commit 回去 |
| `I` | 切图层（只有带 `rowsB` 的双分支关卡有用） |
| `O` / `Esc` | 图鉴 / 菜单 |
| `P` / `M` | 辅助模式（记忆不过期）/ 音效开关 |

死亡不惩罚你多少时间，只惩罚你**回档**：回档会把地形、虫群、照明记忆一起还原，
但**每两次回档，屎山自己长一层熵**（`mutate` 点长虫）—— 越挣扎越脏。

## 二、上下文机制（黑暗就是难度）

未探索的格子全黑，什么都看不见。以角色为圆心的一个圆内是**实时可见**；
走出光圈后，那块地在 `fog.mem` 秒内是**记忆**（暗一档，随时间继续变暗），过期后归零。
`fog.ghost` 是过期后残留的一丝轮廓。灯（`l`）、commit 点（`o`）、PR 门（`P`）自带光源，永远看得见。

第 1 关 `fog.r = 0` —— 全图常亮，专门用来看清所有东西；从第 2 关开始就没人给你开灯了。

## 三、目录

```
game/index.html       页面骨架 + <script> 顺序（引擎永远最后）
game/src/game.css     全部样式（类名前缀 gf-，配色接主线主题变量）
game/src/util.js      数学 / 哈希 / 输入表（含"键位打乱"给阴间事件用）
game/src/sfx.js       WebAudio 程序化音效与环境音，零音频素材
game/src/tiles.js     地块图例：一个字符 = 一种地形，纯数据
game/src/bugs.js      甲虫种类表 + AI（ai(W,b) 只碰 W 给的窄接口）
game/src/world.js     世界：建关 / 推进 tick / 照明记忆 / commit 快照 / 回档 / 事件脚本
game/src/levels.js    关卡数据（纯 ASCII 地图 + 机关 + 事件），见文件头字段说明
game/src/render.js    只负责画：地块、虫、光、后期（闪白 / 抖屏）
game/src/ui.js        只负责 DOM：HUD、目标、日志、九个弹窗、图鉴
game/src/game.js      主循环 + 状态机 + 按键路由 + 存档接线 + BUGFIX.mount()
```

状态与表现严格分开：`world.js` 是纯逻辑（可整份 `JSON.stringify`），`render.js` / `ui.js` 只读它。
所以 commit 是**全量快照**，回档后重放完全一致（`.tmp` 里的无头机器人会断言这一点）。

## 四、存档隔离

小游戏只写 `localStorage` 的 **`ea_bugfix_progress`** 一个键；
主线用的是 `ea_blob:` / `ea_save_` / `ea_endings`，两边互不影响，也不需要后端。
`game/src/save.js` 里 `MAX_COMMITS = 3`：每关只有**最近三个** commit 会写盘，下次打开游戏从它们中间接着打。
局内的 commit 数不受这个限制，被 `stash` 事件吃掉的那些只是回不去了。

## 五、校验与调试

```bash
python tools/check_js.py            # 会连 game/src/*.js 一起扫
python tools/validate_game.py       # 关卡静态校验：行宽、图例、虫位、配额、几何可达、事件动作
```

URL 参数：`game/index.html?level=3` 直跳某关简报（未解锁会被拽回第 1 关），`?assist=1` 开辅助模式。

控制台句柄：`BUGFIX.state` / `BUGFIX.world`（世界状态）/ `BUGFIX.ctl.*`（切状态），
算法在 `WORLD.*`（如 `WORLD.brightness(BUGFIX.world, x, y)`），进度在 `GSAVE`。

> 几何可达只是**必要**条件。虫与事件的真实可通性要在浏览器里跑一遍 ——
> `file://` 直开、无控制台报错、标题 → 简报 → 改动涉及的关卡 → 死亡回档 → commit → 图鉴 → 过关，
> 每样点一遍。改到 `world.js` / `levels.js` 尤其别只信校验器。

## 六、关卡怎么加

1. 在 `game/src/levels.js` 末尾追加一份对象：`w/h` 必须等于 `rows` 的行列数，图例见 `tiles.js`。
2. 想加新地块就改 `tiles.js`，新虫种就改 `bugs.js` —— 两边都要给 `hint`，图鉴会自动长出来。
3. 阴间脚本写在 `events[]` 里（`when: tick|onEnter|onKillKind|onRevert|onCommit|onBug|onPr`）。
   `when:"tick"` 的 `at` 是**秒数**；动作自带的坐标一律塞进 `acts:[{act:…, at:[x,y]}]`，
   同一行写两个 `at:` 会被后者覆盖 —— 校验器会抓这个。
4. 跑 `python tools/validate_game.py`，必须"关卡校验通过"。

## 七、以后怎么接进视觉小说

`BUGFIX.mount(container)` 会自建 canvas 与输入接线，宿主只要给一个容器 div：

```js
const handle = BUGFIX.mount(document.getElementById("minigame-slot"));
// handle.state / handle.world / handle.ctl.openTitle()
```

还差的活（**尚未做**）：主线剧本里加一个 `minigame` 节点类型 —— 那要同步
`src/engine.js` 的 `applyNode()`、`tools/simulate_playthrough.py`、`tools/validate_script.py`
和 `STORY_GUIDE.md` 的节点表（见仓库根 `AGENTS.md` 第三节）。
另外小游戏目前自己 `requestAnimationFrame` 跑循环，嵌进主线时要考虑与引擎循环的暂停 / 恢复。

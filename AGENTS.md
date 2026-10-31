# AGENTS.md —— 给 AI 协作者的仓库说明

本文件是所有 AI 编码代理（Claude Code / Codex / Cursor 等）的共同入口；`CLAUDE.md` 只是 `@AGENTS.md` 的导入。
项目介绍与运行方式见 [README.md](README.md)，剧本写法见 [STORY_GUIDE.md](STORY_GUIDE.md)，剧情与玩法企划见 [DESIGN.md](DESIGN.md)，当前路线图见 [PLAN.md](PLAN.md)，调试与排错见 [DEBUGGING.md](DEBUGGING.md)。
这里只写**容易做错的事**，不重复上述文档。

---

## 一、项目一句话

零依赖视觉小说引擎：原生 JS + Canvas + DOM + WebAudio，双击 `index.html` 即可玩。
剧本（`src/script*.js`）是纯数据，引擎（`src/engine.js`）是通用节点解释器，两者只通过 STORY_GUIDE.md 描述的契约连接。

> 代码正处于重做期，结构可能与本文描述不一致。以 PLAN.md 的当前阶段为准，发现本文过时请顺手更新。

---

## 二、硬约束（不要破坏）

1. **`file://` 直开必须能玩。** 不能依赖 `fetch()`、ES module（`import`/`export`）、构建步骤或 CDN。新文件用 `<script>` 引入；数据文件写成给 `window` 赋值的 `.js`（参考 `assets/manifest.js`）。
2. **前端零依赖、零构建。** 不引入 npm 包、打包器、框架。
3. **后端可选，且只用 Python 标准库。** 存档服务 `server.py` 只负责存取存档文件，接口契约见 [SAVE_API.md](SAVE_API.md)；**后端不解析存档内容**，格式与迁移都归前端。默认只绑 `127.0.0.1`。没有后端时游戏必须完整可用（存档走 localStorage + 下载 / 上传存档文件）。不要用 Node 写后端。
4. **剧本是纯数据。** 剧本文件里不写函数逻辑、不碰 DOM；要新能力就改引擎并在 STORY_GUIDE.md 登记。
   剧本只能写 `tools/jsdata.py` 认识的**数据子集**：字面量、数组、对象、`N()/CHOICE()/opt()` 这类速写函数调用；
   一旦写了循环、条件、模板字符串之类，校验器会直接报"剧本解析失败"，不会静默算错。
5. **生成文件不手改。** `assets/manifest.js` 由 `python tools/make_manifest.py > assets/manifest.js` 生成。
6. **小游戏 `game/` 同样受 1~4 条约束**，而且**存档必须与主线隔离**：它只写 `localStorage` 的 `ea_bugfix_progress`，
   不碰 `ea_blob:` / `ea_save_` / `ea_endings`。关卡（`game/src/levels.js`）和地块 / 虫种表都是纯数据，
   世界状态要能整份 `JSON.stringify` 快照（commit 回档靠这个），别往里塞函数、DOM 引用。

## 三、改一处要同步多处

| 改动 | 必须同步的位置 |
| --- | --- |
| 新增 / 拆分剧本分卷 | `index.html` 的 `<script>`（引擎永远最后）+ `tools/jsdata.py` 的 `SCRIPT_FILES` 按同一顺序登记，两处一致 |
| 新说话人 | `src/engine.js` `SPEAKERS` + `tools/validate_script.py` `SPEAKERS` + 立绘文件 |
| 新 BGM / SFX / 特效 | `src/audio.js` 或 `src/art.js` + `tools/validate_script.py` 白名单 |
| 新 3D 背景场景 | `src/art3d/worlds*.js` 里 `A3D.register(id, …)` + `tools/validate_script.py` `PROCEDURAL_BG` + `DESIGN.md` 背景表 |
| 新环境音（跟背景绑定） | `src/audio.js` `ambience()` 的 switch（不在剧本里，所以不用进白名单） |
| 桌宠新操作 / 新姿势 | `src/pet.js` + `tools/validate_script.py` 的 `PET_OPS / PET_ANIMS` + STORY_GUIDE.md 桌宠节点表 |
| 新节点类型 | `src/engine.js` `applyNode()` + `tools/simulate_playthrough.py` 同语义分支 + `tools/validate_script.py` 检查 + STORY_GUIDE.md 节点表 |
| 存档快照结构 | 存档格式版本号 + 旧版本迁移（见 PLAN.md 存档章节） |
| 存档契约 / 后端接口 | `SAVE_API.md` + `server.py` + `tools/test_save_server.py`（前端接入后还有 `src/save.js`） |
| 小游戏新关卡 | `game/src/levels.js`（`w/h` 必须等于 `rows` 行列数）+ `python tools/validate_game.py` 必须通过；要新地块 / 新虫种再动 `game/src/tiles.js` / `game/src/bugs.js`，两者都要写 `hint`，图鉴会自动长出来 |
| 小游戏新事件动作 | `game/src/world.js` 的 `act1()` + `tools/validate_game.py` 的动作白名单 + `game/README.md` 的关卡字段表 |
| 小游戏接进主线 | 剧本新节点类型那一行（见上）+ `STORY_GUIDE.md` 节点表 + `game/README.md` 的"怎么接进视觉小说"章节 |

---

## 四、验证

提交前至少跑：

```bash
python tools/check_js.py               # 运行时 JS 的括号 / 字符串 / 注释结构检查（不是完整语法，含 game/src/）
python tools/validate_script.py         # 剧本静态校验（顺带检查剧本数据能不能被解析），必须"校验通过"
python tools/simulate_playthrough.py 40 # 无头通关模拟，必须无死路 / 死循环 / 不可达结局
python tools/validate_game.py           # 小游戏关卡校验，改了 game/ 就必须跑，必须"关卡校验通过"
```

改动 `server.py` 或 `SAVE_API.md` 时，还必须跑：

```bash
python tools/test_save_server.py        # 存档服务冒烟测试，必须"全部通过"
```

> 上面这些脚本（外加存档服务冒烟测试）在 PR 和推送 `main` 时由 GitHub Actions 自动再跑一遍
> （`.github/workflows/validate.yml`），本地先跑是为了别等 CI。PR 还会检查分支名前缀，所以分支名别省前缀。

3D 背景改完后，先在浏览器里用 `index.html?bg=<场景id>` 单独看一遍（光、构图、帧率），
再走一遍正常流程；WebGL2 不可用时会自动回落到占位卡，所以**不要只测一次就假定没问题**。
**动到渲染 / 合成 / 后期**（`src/art3d/`、`src/art.js`、主循环）时再加一步：
用 `index.html?perf=1&q=high` 和 `?q=low` 各看一遍性能面板，确认高档帧率没退、
低档确实降了，「批次 / 顶点 / 缩放 / 3D 刷新率」都读得对。帧率排查与画质档位见
[DEBUGGING.md](DEBUGGING.md) 的 3.5.1。

改到 UI / 引擎 / 素材 / 存档时，还要在浏览器里实测（具体手段见 [DEBUGGING.md](DEBUGGING.md)）：
`file://` 直开无控制台报错 → 标题 → 开场 → 改动涉及的场景（可用 `index.html?scene=<id>` 直跳）→ 存档 / 读档 → 结局画面。
有存档后端后，`file://` 模式和 `python` 服务模式各测一遍。

改到 `game/` 时同理，**校验器只保证几何可达，不保证打得过**：`game/index.html` 直开，
按 `game/README.md` 第五节那条链路（进关 → 死一次 → 回档 → 落 commit → 图鉴 → 过关）点一遍，
再 `?level=<n>` 把动过的那关单独走一遍。

> 整仓只用 Python 标准库：运行时零依赖，开发期的校验 / 模拟 / 素材清单也全是纯 Python（不再需要 Node / npm）。剧本的 JS 数据由 `tools/jsdata.py` 解析。

---

## 五、Git 工作流

- **`main` 必须始终干净可玩。** 不直接在 `main` 上提交；所有开发在分支上进行，**不要合并 `main` !**。
  GitHub 上的 `main` 由 ruleset 护着：禁止强推 / 删除，只能走 PR 且 CI 要绿。本地的 `main` 不受这层约束，规矩一样。
  PR 还要 1 个 approve：协作者提的 PR 得等仓库主人点头；主人自己的 PR 自批不了，用 admin bypass 合（`gh pr merge --admin`）。
- **分支命名**：`feat/…` 新功能、`fix/…` 修复、`refactor/…` 重构、`story/…` 剧情、`art/…` 美术、`docs/…` / `chore/…` 杂务。
- **提交信息**：沿用现有风格 —— Conventional Commits 前缀 + 中文描述，如 `feat(save): 支持导出存档文件`。
- **提交作者用自己的模型名**：AI 提交不要用 `local-test`、`Admin` 之类的占位名。**如果已经配置过 `user.name` 就不要动了。**
  - 例: `Claude Opus 5.5 <noreply@anthropic.com>`
  - **不要为此修改仓库的 git 配置**。
- **修正历史里的作者**（早期提交误用了占位名）：用 `git filter-branch --env-filter` 直接改提交，改完用 `git rev-parse <ref>^{tree}` 确认树没变，再用 `--force-with-lease` 覆盖 `local` 和 `origin` 上的同名分支。同样**不要改 git 配置**；`main` 有 ruleset 挡着强推，重写历史只对功能分支有意义。
- **开工前先 `git fetch --prune`，干活中途也尽量勤 fetch**：fetch 只更新远端跟踪引用，不碰工作区和本地分支，任何时候做都安全，不必等用户批准。别等到推送被拒、或者 rebase 出大冲突才发现自己落后了。
- **发现落后就先同步再继续**：自己分支落后于远端同名分支时，先 `git rebase` 过去再往下改；拿不准该 rebase 还是该让用户决定，就问一声，别抱着旧代码闷头写。
- **GitHub 远端随时可以推，而且尽量勤推**（推分支）：这些小步推送是为了和别人同步进度，不必等用户点头，也不要攒一大堆再一起推。本地 `local` 备份仓照样可以推，两边一起推最好。
- **推到 GitHub 远端（尤其 `main`）必须先经用户测试确认。** 分支自测通过只是前提（见第四节），真要上 GitHub 的 `main` 还得用户实际跑一遍、明确说可以才推。
- **GitHub 上的 `main` 只收 PR。** ruleset 挡掉了直推 / 强推 / 删除，PR 必须过两个检查
  （`剧本与代码校验`、`分支命名`），合并方式只留 merge commit（squash / rebase 已在仓库设置里关掉）。
  所以上 GitHub 的完整流程是：本地分支 → `git push origin <branch>` → `gh pr create` → CI 绿 → 合并。
  本地 `main` 照样可以本地合并再同步，但推不上去——要进 GitHub 只能走 PR。
- **admin bypass 只用来绕过 approve，不用来绕过 CI。** 自己的 PR 自批不了，所以合并时得带 `--admin`；
  但检查该绿还得绿——只有 Actions 本身挂了才允许连检查一起绕过，事后记一笔原因。
- **不要自行改远端或改分支保护**，除非用户明确要求。
- **`main-del0` 分支暂时冻结**，不要合并、变基或删除。
- 不提交本地产物：`.tmp/`、`.mimosa/`、`.zcode/`、`.qoder/`、`saves/`（存档服务数据目录）等，已在 `.gitignore`。

## 六、语言与风格

- 文档、注释、提交信息用**中文**；标识符用英文。
- 代码风格跟随所在文件：`"use strict"`、IIFE 模块、分节注释 `/* ---------------- 标题 ---------------- */`。
- 文件头保留 `Escape A÷ · <路径> —— <用途>` 格式的说明块。

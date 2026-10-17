# AGENTS.md —— 给 AI 协作者的仓库说明

本文件是所有 AI 编码代理（Claude Code / Codex / Cursor 等）的共同入口；`CLAUDE.md` 只是 `@AGENTS.md` 的导入。
项目介绍与运行方式见 [README.md](README.md)，剧本写法见 [STORY_GUIDE.md](STORY_GUIDE.md)，剧情与玩法企划见 [DESIGN.md](DESIGN.md)，当前路线图见 [PLAN.md](PLAN.md)。
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
3. **后端可选，且只用 Python 标准库。** 存档服务（规划中，见 PLAN.md）只负责存取存档文件；没有后端时游戏必须完整可用（存档走 localStorage + 下载 / 上传存档文件）。不要用 Node 写后端。
4. **剧本是纯数据。** 剧本文件里不写函数逻辑、不碰 DOM；要新能力就改引擎并在 STORY_GUIDE.md 登记。
5. **生成文件不手改。** `assets/manifest.js` 由 `python tools/make_manifest.py > assets/manifest.js` 生成。

## 三、改一处要同步多处

| 改动 | 必须同步的位置 |
| --- | --- |
| 新增 / 拆分剧本分卷 | `index.html` 的 `<script>`（引擎永远最后）+ `tools/validate_script.js` 与 `tools/simulate_playthrough.js` 的 `require`，三处顺序一致 |
| 新说话人 | `src/engine.js` `SPEAKERS` + `tools/validate_script.js` `SPEAKERS` + 立绘文件 |
| 新 BGM / SFX / 特效 | `src/audio.js` 或 `src/art.js` + `tools/validate_script.js` 白名单 |
| 新节点类型 | `src/engine.js` `applyNode()` + `tools/simulate_playthrough.js` 同语义分支 + `tools/validate_script.js` 检查 + STORY_GUIDE.md 节点表 |
| 存档快照结构 | 存档格式版本号 + 旧版本迁移（见 PLAN.md 存档章节） |

---

## 四、验证

提交前至少跑：

```bash
node --check src/*.js                   # 语法
node tools/validate_script.js           # 剧本静态校验，必须"校验通过"
node tools/simulate_playthrough.js 40   # 无头通关模拟，必须无死路 / 死循环 / 不可达结局
```

改到 UI / 引擎 / 素材 / 存档时，还要在浏览器里实测：
`file://` 直开无控制台报错 → 标题 → 开场 → 改动涉及的场景（可用 `index.html?scene=<id>` 直跳）→ 存档 / 读档 → 结局画面。
有存档后端后，`file://` 模式和 `python` 服务模式各测一遍。

> 校验工具目前是 Node 脚本（仅开发期使用，不进运行时）。是否迁移到 Python 见 PLAN.md 待定事项。

---

## 五、Git 工作流

- **`main` 必须始终干净可玩。** 不直接在 `main` 上提交；所有开发在分支上进行，只有通过第四节全部验证的分支才合回 `main`。
- **分支命名**：`feat/…` 新功能、`fix/…` 修复、`refactor/…` 重构、`story/…` 剧情、`art/…` 美术、`docs/…` / `chore/…` 杂务。
- **提交信息**：沿用现有风格 —— Conventional Commits 前缀 + 中文描述，如 `feat(save): 支持导出存档文件`。
- **开工前先 `git fetch --prune`，干活中途也尽量勤 fetch**：fetch 只更新远端跟踪引用，不碰工作区和本地分支，任何时候做都安全，不必等用户批准。别等到推送被拒、或者 rebase 出大冲突才发现自己落后了。
- **发现落后就先同步再继续**：自己分支落后于远端同名分支时，先 `git rebase` 过去再往下改；拿不准该 rebase 还是该让用户决定，就问一声，别抱着旧代码闷头写。
- **本地仓库随时可以推，而且尽量勤推**（本地远端 / 备份仓 / 局域网仓等）：这些小步推送是为了和别人同步进度，不必等用户点头，也不要攒一大堆再一起推。
- **推到 GitHub 远端（尤其 `main`）必须先经用户测试确认。** 分支自测通过只是前提（见第四节），真要上 GitHub 的 `main` 还得用户实际跑一遍、明确说可以才推。
- **不要自行改远端或改分支保护**，除非用户明确要求。
- **`main-del0` 分支暂时冻结**，不要合并、变基或删除。
- 不提交本地产物：`.tmp/`、`.mimosa/`、`.zcode/`、`.qoder/`、`saves/`（存档服务数据目录）等，已在 `.gitignore`。

## 六、语言与风格

- 文档、注释、提交信息用**中文**；标识符用英文。
- 代码风格跟随所在文件：`"use strict"`、IIFE 模块、分节注释 `/* ---------------- 标题 ---------------- */`。
- 文件头保留 `Escape A÷ · <路径> —— <用途>` 格式的说明块。

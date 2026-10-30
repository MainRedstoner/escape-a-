## 这个 PR 做了什么

<!-- 一两句话。关联 issue 就写 Closes #… -->

## 自检（勾完再提）

- [ ] `python tools/check_js.py` 通过
- [ ] `python tools/validate_script.py` 输出「校验通过」
- [ ] `python tools/simulate_playthrough.py 40` 无死路 / 死循环 / 不可达结局
- [ ] 动了 `server.py` 或 `SAVE_API.md` → `python tools/test_save_server.py` 全部通过

> 这几步 PR 上也会由 Actions 自动跑一遍，勾选是为了别等 CI。

## 改动涉及面（勾选并补测）

- [ ] 剧本 —— 新说话人 / BGM / 场景已同步 `SPEAKERS`、白名单、`PROCEDURAL_BG`
- [ ] 渲染 / 合成 / 后期 —— 看过 `index.html?perf=1&q=high` 和 `?q=low`，高档帧率没退、低档确实降了
- [ ] UI / 引擎 / 素材 / 存档 —— `file://` 直开实测：标题 → 开场 → 改动涉及的场景 → 存读档 → 结局
- [ ] 3D 背景 —— `index.html?bg=<id>` 单独看过，再走一遍正常流程
- [ ] 只改文档 / 工具脚本，运行时无需实测

## 备注

<!-- 取舍、已知问题、遗留 TODO。要上 GitHub main 的，记得写下用户实测试玩的结论。 -->

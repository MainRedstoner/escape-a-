/* ============================================================
 * Escape A÷ · game/src/ui.js —— 小游戏的 DOM 层（HUD / 弹窗 / 图鉴 / 日志）
 *
 * Canvas 只画世界，其余全是 DOM：文字多、要能选、要能滚，用 DOM 便宜得多。
 * 这里不含游戏规则 —— 一切状态从 W（world.js 的世界对象）读，
 * 一切玩家意图通过控制器 G（game.js）回调出去。
 * ============================================================ */
"use strict";

window.UI = (() => {

  const IDS = ["app", "stage", "canvas", "hud", "lvl", "bugs", "tests", "blames", "commits",
               "reverts", "mode", "layer", "time", "toasts", "objective", "log", "hint",
               "m-title", "m-pick", "m-brief", "m-death", "m-win", "m-end", "m-codex", "m-menu", "m-revert",
               "start", "pick", "wipe", "levels", "pick-back", "pick-commits", "title-commits",
               "brief-name", "brief-text", "brief-new", "brief-go",
               "death-title", "death-why", "death-commits", "death-latest", "death-restart", "death-title-btn",
               "win-stats", "win-note", "win-next", "win-replay", "win-title",
               "end-stats", "end-title", "end-again",
               "codex-bugs", "codex-tiles", "codex-back",
               "menu-resume", "menu-revert", "menu-replay", "menu-assist", "menu-sound", "menu-pick", "menu-title",
               "revert-commits", "revert-back"];
  const el = {};
  let G = null;                 // 控制器：game.js 提供的回调集合
  let lastNote = 0;             // 日志渲染到第几条了

  function node(k) { return document.getElementById("gf-" + k); }

  /* ---------------- 初始化 ---------------- */
  function init(controller) {
    G = controller;
    for (const k of IDS) el[k] = node(k);
    on("start", () => G.firstLevel());
    on("pick", () => G.openPick());
    on("wipe", () => G.wipeProgress());
    on("pick-back", () => G.openTitle());
    on("brief-go", () => G.enterLevel());
    on("death-latest", () => G.revertLatest());
    on("death-restart", () => G.restartLevel());
    on("death-title-btn", () => G.openTitle());
    on("win-next", () => G.nextLevel());
    on("win-replay", () => G.restartLevel());
    on("win-title", () => G.openTitle());
    on("end-title", () => G.openTitle());
    on("end-again", () => G.restartAll());
    on("codex-back", () => G.closeOverlay());
    on("menu-resume", () => G.closeOverlay());
    on("menu-revert", () => G.openRevert());
    on("menu-replay", () => G.restartLevel());
    on("menu-assist", () => G.toggleAssist());
    on("menu-sound", () => G.toggleSound());
    on("menu-pick", () => G.openPick());
    on("menu-title", () => G.openTitle());
    on("revert-back", () => G.closeOverlay());
  }
  function on(key, fn) {
    if (!el[key]) return;
    el[key].addEventListener("click", ev => {
      if (ev && ev.target && ev.target.blur) ev.target.blur();   // 否则下一次 Enter 会又触发这个按钮
      GSFX.play("ui");
      fn();
    });
  }

  /* ---------------- 弹窗 ---------------- */
  const MODALS = ["m-title", "m-pick", "m-brief", "m-death", "m-win", "m-end", "m-codex", "m-menu", "m-revert"];
  function show(which) {
    for (const m of MODALS) {
      if (!el[m]) continue;
      if (m === which) el[m].classList.add("gf-on");
      else el[m].classList.remove("gf-on");
    }
    hint(which === "m-title" ? null : "on");
  }
  function hint(state) {
    if (!el.hint) return;
    if (state === null) { el.hint.textContent = "WASD/方向键 移动 · K 修 · T 测试 · L console.log · G blame · Enter commit · R 回档 · H 图鉴 · Esc 菜单"; return; }
    el.hint.textContent = state === "on" ? "Esc 菜单 · H 图鉴 · M 辅助模式 · V 音效" : "";
  }

  /* ---------------- HUD ---------------- */
  function hud(W) {
    if (!W || !el.lvl) return;
    const left = W.bugs.length;
    el.lvl.textContent = W.name;
    el.bugs.textContent = left;
    el.bugs.className = "gf-val" + (left === 0 ? " gf-good" : "");
    el.tests.textContent = W.tools.test;
    el.blames.textContent = W.tools.blame;
    el.commits.textContent = Math.max(0, W.commitLog.length - 1);
    el.reverts.textContent = W.reverted + " / 熵 " + W.entropy;
    el.mode.textContent = W.mode === "side" ? (W.gravity > 0 ? "横版" : "横版·倒立") : "俯视";
    el.layer.textContent = W.layers.length > 1 ? (W.layer === 0 ? "main" : "hotfix") : "main";
    el.time.textContent = U.mmss(W.tick * WORLD.DT);
  }

  /* ---------------- 目标 / 教学 ---------------- */
  const KEYS = ["WASD", "Enter", "Esc", "空格", "方向键", "console.log"];
  /** 把文本里的按键名包成 .gf-key（手写扫描，不用 lookbehind —— 老 WebView 不支持） */
  function keyNodes(text, into) {
    let buf = "", i = 0;
    const isLetter = c => c >= "A" && c <= "Z";
    while (i < text.length) {
      let hit = 0;
      for (const k of KEYS) if (text.startsWith(k, i)) { hit = k.length; break; }
      if (!hit && isLetter(text[i]) && !isLetter(text[i - 1] || "") && !isLetter(text[i + 1] || "")) hit = 1;
      if (hit) {
        if (buf) { into.appendChild(document.createTextNode(buf)); buf = ""; }
        const s = document.createElement("span");
        s.className = "gf-key";
        s.textContent = text.substr(i, hit);
        into.appendChild(s);
        i += hit;
      } else { buf += text[i]; i++; }
    }
    if (buf) into.appendChild(document.createTextNode(buf));
  }

  function objective(W) {
    const box = el.objective;
    if (!box) return;
    if (!W) { box.style.display = "none"; return; }
    box.style.display = "";
    box.textContent = "";
    const t = WORLD.tutNow(W);
    if (t) {
      const h = document.createElement("span");
      h.className = "gf-title";
      h.textContent = "教学 · 第 " + (W.tutStep + 1) + " / " + W.tut.length + " 步";
      box.appendChild(h);
      const p = document.createElement("div");
      keyNodes(t.text, p);
      if (t.wait) { const b = document.createElement("b"); b.textContent = "（按 空格 继续）"; p.appendChild(b); }
      box.appendChild(p);
      return;
    }
    const h = document.createElement("span");
    h.className = "gf-title";
    h.textContent = "目标";
    box.appendChild(h);
    const lines = [];
    if (W.bugs.length > 0) {
      lines.push("还剩 " + W.bugs.length + " 只甲虫。贴上去按 K 修，祖传虫要先按 T 盖测试。");
    } else {
      lines.push(W.prReady ? "甲虫清零了 —— 去踩亮着的 PR 门过关。" : "继续清虫。");
    }
    if (WORLD.atCommitTile(W) && !isHeadHere(W)) lines.push("脚下就是 -o-：按 Enter 落一个 commit。");
    if (W.layers.length > 1) lines.push("按 B 在 main / hotfix 之间切图层。");
    if (W.player.cast) lines.push("施法中…… 别动，动了就打断。");
    for (const s of lines) { const d = document.createElement("div"); keyNodes(s, d); box.appendChild(d); }
  }
  function isHeadHere(W) {
    const last = W.commitLog[W.commitLog.length - 1];
    return !!last && last.x === W.player.x && last.y === W.player.y && last.tag !== "init";
  }

  /* ---------------- 飘字 ---------------- */
  function toast(text, tone) {
    const box = el.toasts;
    if (!box) return;
    const d = document.createElement("div");
    d.className = "gf-toast gf-" + (tone === "tut" ? "good" : tone || "warn");
    d.textContent = text;
    box.appendChild(d);
    while (box.childNodes.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4200);
  }

  /* ---------------- 日志 ---------------- */
  function log(W) {
    const box = el.log;
    if (!box || !W) return;
    if (W.notes.length === lastNote && box.childNodes.length) return;
    lastNote = W.notes.length;
    box.textContent = "";
    const from = Math.max(0, W.notes.length - 7);
    for (let i = W.notes.length - 1; i >= from; i--) {
      const d = document.createElement("div");
      if (i === W.notes.length - 1) d.className = "gf-new";
      d.textContent = U.mmss(W.notes[i].t) + "  " + W.notes[i].text;
      box.appendChild(d);
    }
  }
  function logReset() { lastNote = 0; if (el.log) el.log.textContent = ""; }

  /* ---------------- 选关 ---------------- */
  function renderLevels(levels, progress, cb) {
    const box = el.levels;
    if (!box) return;
    box.textContent = "";
    levels.forEach((lv, i) => {
      const st = progress.levels[lv.id] || { done: false, bestSec: 0 };
      const b = document.createElement("button");
      b.className = "gf-level" + (st.done ? " gf-cleared" : "");
      b.disabled = i > progress.unlocked;
      const n = document.createElement("span");
      n.className = "gf-n";
      n.textContent = "第 " + (i + 1) + " 关 · " + lv.name.replace(/^第 \d+ 关 · /, "") + (b.disabled ? " 🔒" : "");
      const d = document.createElement("span");
      d.className = "gf-d";
      d.textContent = (lv.mode === "side" ? "横版" : "俯视")
        + (lv.rowsB ? " · 双分支" : "")
        + " · 虫 " + ((lv.bugs || []).length)
        + " · 事件 " + ((lv.events || []).length)
        + (st.done ? " · 最好 " + U.mmss(st.bestSec) : st.deaths ? " · 死了 " + st.deaths + " 次" : "");
      b.appendChild(n); b.appendChild(d);
      b.addEventListener("click", () => { GSFX.play("uiOk"); cb(i); });
      box.appendChild(b);
    });
  }

  /* ---------------- 开场简报 ---------------- */
  function brief(lv, fresh) {
    if (!el["brief-name"]) return;
    el["brief-name"].textContent = lv.name;
    el["brief-text"].textContent = lv.brief || "";
    const box = el["brief-new"];
    box.textContent = "";
    box.style.display = fresh && fresh.length ? "" : "none";
    if (fresh && fresh.length) box.textContent = "第一次见到：\n" + fresh.join("\n");
  }
  function briefLabel(text) { if (el["brief-go"]) el["brief-go"].textContent = text; }

  /* ---------------- commit 列表（死亡 / 菜单回档共用） ---------------- */
  function commitRows(box, W, onPick) {
    if (!box) return;
    box.textContent = "";
    const log = W.commitLog;
    if (!log.length) {
      const d = document.createElement("div");
      d.className = "gf-commit";
      d.textContent = "没有可回的 commit —— 找到 -o- 按 Enter 落一个。";
      box.appendChild(d);
      return;
    }
    for (let i = log.length - 1; i >= 0; i--) {
      const c = log[i];
      const d = document.createElement("div");
      d.className = "gf-commit" + (c.stashed ? " gf-stashed" : "") + (i === log.length - 1 ? " gf-current" : "");
      const h = document.createElement("span"); h.className = "gf-h"; h.textContent = c.hash;
      const m = document.createElement("span"); m.className = "gf-m";
      m.textContent = c.msg + " · 虫 " + c.bugs + " · 已修 " + c.kills;
      const t = document.createElement("span"); t.className = "gf-t"; t.textContent = U.mmss(c.turn * WORLD.DT);
      d.appendChild(h); d.appendChild(m); d.appendChild(t);
      if (!c.stashed) d.addEventListener("click", () => { GSFX.play("uiOk"); onPick(i); });
      box.appendChild(d);
    }
  }

  /* ---------------- 死亡 / 过关 / 全通 ---------------- */
  function death(W, onPick) {
    if (el["death-title"]) {
      el["death-title"].textContent = W.dead_text || "Segmentation fault";
      el["death-why"].textContent = "死因：" + (W.dead_why || "撞上甲虫");
      commitRows(el["death-commits"], W, onPick);
      const last = W.commitLog[W.commitLog.length - 1];
      el["death-latest"].textContent = last ? "回到 " + last.hash + "（R）" : "没有 commit 可回（R）";
      el["death-latest"].disabled = !last || !!last.stashed;
    }
    show("m-death");
  }

  function win(lv, stats, hasNext) {
    if (el["win-stats"]) {
      el["win-stats"].textContent =
        "用时 " + U.mmss(stats.sec) + " · 死亡 " + stats.deaths + " 次 · 回档 " + stats.reverts +
        " 次（熵 " + stats.entropy + "）· 修掉 " + stats.kills + " 只甲虫";
      el["win-note"].textContent = stats.assist
        ? "你开了辅助模式：记忆不过期。玩得开心就好。"
        : (hasNext ? "下一关会更阴 —— 山是有记忆的。" : "");
      el["win-next"].style.display = hasNext ? "" : "none";
      el["win-next"].textContent = hasNext ? "下一关（Enter）" : "已到底";
    }
    show("m-win");
  }

  function end(progress, total) {
    if (el["end-stats"]) {
      el["end-stats"].textContent =
        "六关全部合入 main\n" +
        "总用时 " + U.mmss(total.playSec) + "\n" +
        "总死亡 " + total.deaths + " · 总回档 " + total.reverts + "\n" +
        "修掉的甲虫 " + total.kills + " 只\n" +
        "落过的 commit " + total.commits + " 个\n" +
        "图鉴收录 " + Object.keys(progress.codex || {}).length + " / " + Object.keys(BUGS.KINDS).length + " 种";
    }
    show("m-end");
  }

  /* ---------------- 图鉴 ---------------- */
  function codex(seen, progress) {
    const known = k => !!(seen && seen[k]) || !!(progress.codex && progress.codex[k]);
    if (el["codex-bugs"]) {
      const bx = el["codex-bugs"];
      bx.textContent = "";
      for (const kind in BUGS.KINDS) {
        const k = BUGS.KINDS[kind], ok = known(kind);
        const d = document.createElement("div");
        d.className = "gf-codex-item" + (ok ? "" : " gf-unknown");
        const dot = document.createElement("span");
        dot.className = "gf-dot";
        dot.style.background = ok ? "#7cf3b0" : "#2c3a33";
        d.appendChild(dot);
        const b = document.createElement("b");
        b.textContent = ok ? k.label : "？？？";
        d.appendChild(b);
        d.appendChild(document.createTextNode(" — " + (ok ? k.hint : "还没见过这种虫。")));
        bx.appendChild(d);
      }
    }
    if (el["codex-tiles"]) {
      const tx = el["codex-tiles"];
      tx.textContent = "";
      for (const ch of TILES.CHARS) {
        const d0 = TILES.DEFS[ch];
        if (!d0 || d0.void || ch === " ") continue;
        const d = document.createElement("div");
        d.className = "gf-codex-item";
        const b = document.createElement("b");
        b.textContent = "「" + TILES.lookOf(ch) + "」 " + d0.label;
        d.appendChild(b);
        d.appendChild(document.createTextNode(" — " + (d0.hint || "")));
        tx.appendChild(d);
      }
    }
    show("m-codex");
  }

  /* ---------------- 菜单上的开关文字 ---------------- */
  function toggles(assist, sound) {
    if (el["menu-assist"]) el["menu-assist"].textContent = "辅助模式：" + (assist ? "开（记忆不过期）" : "关");
    if (el["menu-sound"]) el["menu-sound"].textContent = "音效：" + (sound ? "开" : "关");
  }

  /* ---------------- 标题页的进度 ---------------- */
  function progressLine(W0, text) {
    const box = el["title-commits"] || el["pick-commits"];
    if (!box) return;
    box.textContent = text;
  }
  function pickProgress(text) { if (el["pick-commits"]) el["pick-commits"].textContent = text; }

  return { init, show, hud, objective, toast, log, logReset, renderLevels, brief, briefLabel,
           commitRows, death, win, end, codex, toggles, progressLine, pickProgress, hint, el: () => el };
})();

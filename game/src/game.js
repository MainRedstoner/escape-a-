/* ============================================================
 * Escape A÷ · game/src/game.js —— 小游戏的引导层（循环 / 输入 / 状态机 / 存档接线）
 *
 * 逻辑 8 tick/秒（world.js 里写死），画面跟着 rAF 走；
 * 这一层不实现任何规则，只做三件事：喂输入、按节拍调 WORLD.tick、把 W 的变化播报给 UI。
 *
 * 嵌进视觉小说时：把 game/src/*.js 依次 <script> 进根 index.html，
 * 然后 window.BUGFIX.mount(容器元素) 即可；独立双击打开时它自己启动。
 * ============================================================ */
"use strict";

window.BUGFIX = (() => {

  WORLD.bindLevels(window.GAME_LEVELS);

  const STEP = 1 / WORLD.STEP_HZ;
  let W = null;                    // 当前世界
  let li = 0;                      // 准备进入 / 正在打的关卡下标
  let state = "boot";              // title / pick / brief / play / dead / win / end / codex / menu / revert
  let acc = 0, lastT = 0, rafId = 0;
  let assist = false;
  let prevState = null;            // 图鉴/菜单是从哪个画面打开的，关掉时回哪儿
  const MODAL_OF = { title: "m-title", pick: "m-pick", brief: "m-brief",
                     dead: "m-death", win: "m-win", end: "m-end" };
  let mounted = null;
  let playSec = 0;                 // 本关真实游玩秒数（回档会 rewind W.tick，所以不能用它计时）
  let runDeaths = 0;
  const params = (() => {
    const q = {};
    const s = (window.location && window.location.search || "").replace(/^\?/, "");
    for (const p of s.split("&")) if (p) { const kv = p.split("="); q[kv[0]] = kv.length > 1 ? kv[1] : "1"; }
    return q;
  })();

  /* ---------------- 启动 ---------------- */
  function boot() {
    const app = document.getElementById("gf-app");
    if (!app) return;              // 嵌进主线时由 BUGFIX.mount() 触发
    init(app);
  }
  function mount(container) {
    let app = document.getElementById("gf-app");
    if (!app) {
      app = document.createElement("div");
      app.id = "gf-app";
      app.className = "gf-mounted";
      const stage = document.createElement("div");
      stage.id = "gf-stage";
      const cv = document.createElement("canvas");
      cv.id = "gf-canvas";
      cv.textContent = "你的浏览器不支持 canvas，玩不了这个小游戏。";
      stage.appendChild(cv);
      app.appendChild(stage);
    }
    if (container && app.parentNode !== container) container.appendChild(app);
    init(app);
    return api;
  }
  function init(app) {
    mounted = app;
    const st = GSAVE.settings();
    assist = !!st.assist || (params.assist != null && !/^(0|off|no)$/i.test(params.assist));
    if (st.sound === false && GSFX.isOn()) GSFX.toggle();

    UI.init(ctl);
    const cv = document.getElementById("gf-canvas");
    if (cv) RENDER.attach(cv);
    window.addEventListener("keydown", keydown, false);
    window.addEventListener("keyup", U.Input.onKeyUp.bind(U.Input), false);
    GSAVE.load();
    if (document.getElementById("gf-m-title")) ctl.openTitle();
    else { state = "brief"; ctl.enterLevel(); }   // 宿主只给了 canvas：跳过弹窗壳，直接可玩
    if (params.level && /^[1-9]\d*$/.test(params.level)) openBrief(Math.min(LEVELS.length - 1, +params.level - 1));
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  const LEVELS = window.GAME_LEVELS;

  /* ---------------- 主循环 ---------------- */
  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    const dt = lastT ? Math.min(0.25, (ts - lastT) / 1000) : 0;
    lastT = ts;
    if (state === "play" && W) {
      playSec += dt;
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 5) {
        acc -= STEP;
        WORLD.tick(W);
        U.Input.pressed.clear();   // 输入至少被一个 tick 看见，避免 60fps 把按键冲掉
        if (W.player.dead || W.won) break;
      }
      if (acc > STEP * 3) acc = 0;
      UI.hud(W);
      UI.objective(W);
      UI.log(W);
    }
    if (W) RENDER.draw(W, dt);
  }

  /* ---------------- 输入 ---------------- */
  function keydown(e) {
    GSFX.unlock();
    U.Input.onKeyDown(e);
    const name = U.Input.logical(e.code);
    if (!name) return;
    if (state === "play") {
      if (name === "fix" || name === "test" || name === "log" || name === "blame" ||
          name === "commit" || name === "layer") { WORLD.act(W, name); return; }
      if (name === "jump" && W.tutStep < W.tut.length && WORLD.tutNow(W) && WORLD.tutNow(W).wait) { WORLD.tutAck(W); return; }
      if (name === "revert") return ctl.openRevert();
      if (name === "help") return ctl.openCodex();
      if (name === "menu") return ctl.openMenu();
      if (name === "assist") return ctl.toggleAssist();
      if (name === "volume") return ctl.toggleSound();
      return;
    }
    if (state === "dead") {
      if (name === "revert" || name === "commit") ctl.revertLatest();
      else if (name === "menu") ctl.openTitle();
      return;
    }
    if (state === "win") {
      if (name === "commit" || name === "menu") (li + 1 < LEVELS.length ? ctl.nextLevel() : ctl.openTitle());
      else if (name === "revert") ctl.restartLevel();
      return;
    }
    if (state === "end") { if (name === "commit" || name === "menu") ctl.openTitle(); return; }
    if (state === "brief") { if (name === "commit" || name === "jump") ctl.enterLevel(); else if (name === "menu") ctl.openTitle(); return; }
    if (state === "title") {
      if (name === "commit") ctl.firstLevel();
      else if (name === "help") ctl.openCodex();
      else if (name === "layer") ctl.openPick();
      return;
    }
    if (state === "pick") { if (name === "menu" || name === "commit") ctl.openTitle(); return; }
    if (name === "help" && state === "codex") return ctl.closeOverlay();
    if (name === "menu") return ctl.closeOverlay();
  }

  /* ---------------- 关卡进出 ---------------- */
  function freshKinds(lv) {
    const cod = GSAVE.load().codex || {};
    const out = [];
    for (const s of (lv.bugs || [])) {
      if (!cod[s.kind] && BUGS.get(s.kind) && out.indexOf("新甲虫：" + BUGS.get(s.kind).label) < 0) out.push("新甲虫：" + BUGS.get(s.kind).label);
    }
    if ((lv.mode || "top") === "side") out.push("新视角：横版 —— 有重力，↑ / 空格 跳，脚下没东西会掉");
    if (lv.rowsB) out.push("新机制：两条分支 —— 按 V 切图层");
    if (lv.fog && lv.fog.r) out.push("新黑暗：光圈只有 " + lv.fog.r + " 格，记忆只亮 " + (lv.fog.mem || 60) + " 秒");
    if (lv.leak || lv.ci || lv.ghosts) out.push("新对手：CI 红光 / 内存泄漏 / 你自己的 history");
    return out;
  }

  const ctl = {
    firstLevel() { openBrief(0); },
    openTitle() {
      W = null; state = "title"; UI.logReset();
      UI.hint(null);
      try { GSFX.stopHum(); } catch (e) {}
      const p = GSAVE.load(), t = p.total;
      UI.show("m-title");
      UI.progressLine(null, "已解锁 " + (Math.min(p.unlocked, LEVELS.length - 1) + 1) + " / " + LEVELS.length + " 关"
        + " · 累计 commit " + t.commits + " · 死亡 " + t.deaths + " · 回档 " + t.reverts
        + (assist ? " · 辅助模式开着" : ""));
      UI.toggles(assist, GSFX.isOn());
    },
    openPick() {
      state = "pick";
      const p = GSAVE.load();
      UI.renderLevels(LEVELS, p, i => openBrief(i));
      UI.pickProgress(p.total.playSec ? "累计游玩 " + U.mmss(p.total.playSec) + " —— 死亡和回档都是进度。" : "第一次来？第 1 关是教学，别跳。");
      UI.show("m-pick");
    },
    enterLevel() {
      const lv = LEVELS[li];
      const saved = GSAVE.commits(lv.id);
      W = WORLD.create(li, { assist: assist });
      W.onToast = (text, tone) => { UI.toast(text, tone); if (tone === "tut") RENDER.flash("white", 0.1); };
      W.onCommit = entry => { GSAVE.recordCommit(lv.id, entry); RENDER.flash("white", 0.25); RENDER.kick(4); };
      W.onDeath = why => {
        state = "dead"; runDeaths++;
        GSAVE.bumpDeath(lv.id); GSAVE.noteCodex(W.seenKinds);
        RENDER.kick(14); RENDER.flash("red", 0.6); GSFX.play("fall");
        UI.death(W, i => doRevert(i));
      };
      W.onWin = () => {
        GSAVE.noteCodex(W.seenKinds);
        const hasNext = li + 1 < LEVELS.length;
        GSAVE.finishLevel(lv.id, { deaths: runDeaths, reverts: W.reverted, sec: playSec,
                                   kills: W.kills, assist: assist, nextIndex: hasNext ? li + 1 : LEVELS.length });
        RENDER.flash("white", 0.7);
        state = hasNext ? "win" : "end";
        try { GSFX.stopHum(); } catch (e) {}
        if (hasNext) UI.win(lv, { sec: playSec, deaths: runDeaths, reverts: W.reverted, entropy: W.entropy, kills: W.kills, assist: assist }, hasNext);
        else UI.end(GSAVE.load(), GSAVE.load().total);
      };
      playSec = 0; runDeaths = 0; acc = 0;
      UI.logReset();
      if (saved.length) {
        WORLD.restore(W, saved[saved.length - 1].snap);
        UI.toast("从上一个 commit " + saved[saved.length - 1].hash + " 继续", "good");
      }
      state = "play";
      UI.show(null);
      UI.toggles(assist, GSFX.isOn());
      try { GSFX.startHum(); } catch (e) {}
      RENDER.reset();
      UI.objective(W); UI.hud(W);
    },
    restartLevel() {
      GSAVE.levelState(LEVELS[li].id).commits = [];
      GSAVE.save();
      ctl.enterLevel();
    },
    nextLevel() {
      if (li + 1 >= LEVELS.length) return ctl.openTitle();
      openBrief(li + 1);
    },
    restartAll() { GSAVE.load().unlocked = 0; GSAVE.save(); openBrief(0); },
    revertLatest() {
      if (!W) return;
      doRevert(W.commitLog.length - 1);
    },
    openMenu() { if (state !== "play") return; prevState = state; state = "menu"; UI.toggles(assist, GSFX.isOn()); UI.show("m-menu"); },
    openRevert() { if (state !== "play") return; prevState = state; state = "revert"; UI.commitRows(document.getElementById("gf-revert-commits"), W, i => doRevert(i)); UI.show("m-revert"); },
    openCodex() {
      if (state === "codex") return ctl.closeOverlay();
      prevState = state; state = "codex";
      UI.codex(W ? W.seenKinds : {}, GSAVE.load());
    },
    closeOverlay() {
      if (state !== "codex" && state !== "menu" && state !== "revert") return;
      const back = prevState || (W ? "play" : "title");
      state = back;
      UI.show(MODAL_OF[back] || null);
      if (back === "play") { UI.hud(W); UI.objective(W); }
    },
    toggleAssist() {
      assist = !assist;
      GSAVE.setSettings({ assist: assist });
      if (W) W.cfg.assist = assist;
      UI.toast(assist ? "辅助模式：记忆不再过期，光也留得住" : "辅助模式关了 —— 黑暗开始吃你的上下文", assist ? "good" : "warn");
      UI.toggles(assist, GSFX.isOn());
    },
    toggleSound() {
      const on = GSFX.toggle();
      GSAVE.setSettings({ sound: on });
      UI.toggles(assist, on);
      UI.toast(on ? "音效开" : "音效关", "warn");
    },
    wipeProgress() {
      GSAVE.clearAll();
      GSAVE.save();
      ctl.openTitle();
    }
  };

  function openBrief(i) {
    li = U.clamp(i, 0, LEVELS.length - 1);
    const p = GSAVE.load();
    if (li > p.unlocked) li = 0;
    const lv = LEVELS[li];
    state = "brief";
    UI.brief(lv, freshKinds(lv));
    const saved = GSAVE.commits(lv.id);
    UI.briefLabel(saved.length ? "继续（Enter）· 已有 " + saved.length + " 个 commit" : "进入（Enter）");
    UI.show("m-brief");
  }

  function doRevert(n) {
    if (!W) return;
    if (WORLD.revert(W, n)) {
      state = "play";
      UI.show(null);
      UI.logReset();
      UI.objective(W); UI.hud(W);
    }
  }

  const api = { mount, boot, ctl, get state() { return state; }, get world() { return W; },
                LEVELS, start: () => ctl.enterLevel() };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, false);
  else boot();

  return api;
})();

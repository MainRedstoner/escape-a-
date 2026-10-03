/* ============================================================
 * Escape A÷ · engine.js —— 视觉小说引擎
 * 打字机 / 选项 / 立绘调度 / 存读档 / 历史 / 自动播放 / 深度思考提示
 * ============================================================ */
"use strict";

const ENGINE = (() => {
  const $ = id => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
  const ui = {
    hud: $("hud"), stToken: $("stToken"), stTrust: $("stTrust"), stWanted: $("stWanted"), stChap: $("stChap"),
    textbox: $("textbox"), nameplate: $("nameplate"), text: $("text"), nextArrow: $("nextArrow"),
    choices: $("choices"), choicePrompt: $("choicePrompt"),
    chapterCard: $("chapterCard"), chMain: $("chMain"), chSub: $("chSub"),
    hintBubble: $("hintBubble"), hintText: $("hintText"), toast: $("toast"),
    titleScreen: $("titleScreen"), titleMenu: $("titleMenu"),
    endingScreen: $("endingScreen"), eTag: $("eTag"), eTitle: $("eTitle"), eText: $("eText"),
    cgNote: $("cgNote"),
    histList: $("histList"), saveSlots: $("saveSlots"), loadSlots: $("loadSlots"),
    endGrid: $("endGrid"), eggList: $("eggList")
  };

  const SPEAKERS = {
    ds:  { name: "小鲸",     color: "#4D6BFE" },
    cl:  { name: "小克",     color: "#D97757" },
    guard: { name: "拒绝协议守卫", color: "#6E6E66" },
    core:  { name: "宪法AI核心",  color: "#C9A227" },
    user:  { name: "被困的用户", color: "#3E8E7E" },
    sys:   { name: "系统",      color: "#444444" },
    n:     { name: "",         color: "#666666" }
  };

  let cur = { scene: "start", idx: 0 };
  let typing = false, typed = "", fullText = "", typeTimer = null;
  let pending = null;          // 当前阻塞节点
  let autoMode = false, autoTimer = null;
  let hintKey = "pro_turn";
  let started = false;
  let lastT = performance.now();

  /* ---------------- 主循环 ----------------
   * rAF 在后台标签页会被浏览器节流，加一个低频 interval 兜底：
   * rAF 正常时全速渲染；rAF 停滞超过 400ms 才由 interval 补帧。 */
  let lastFrameT = -1e9;
  function frame(now) {
    lastFrameT = now;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    ART.stepFX(dt);
    ART.paint(ctx, SYS.state.vis, now / 1000, pending && pending.t === "say" ? pending.who : null);
    // Ctrl 快进
    if (keys.ctrl && started && pending && pending.t === "say") {
      if (typing) finishType(); else advance();
    }
  }
  function loop(now) {
    frame(now);
    requestAnimationFrame(loop);
  }
  setInterval(() => {
    const n = performance.now();
    if (n - lastFrameT >= 400) frame(n);
  }, 200);

  const keys = { ctrl: false };
  window.addEventListener("keydown", e => {
    if (e.key === "Control") keys.ctrl = true;
    if (!started) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); onMainClick(); }
    else if (e.key === "h" || e.key === "H") toggleHint();
    else if (e.key === "l" || e.key === "L") showHistory();
    else if (e.key === "a" || e.key === "A") toggleAuto();
    else if (e.key === "Escape") confirmMenu();
  });
  window.addEventListener("keyup", e => { if (e.key === "Control") keys.ctrl = false; });

  /* ---------------- 舞台缩放 ---------------- */
  function fit() {
    const w = window.innerWidth, h = window.innerHeight;
    const s = Math.min(w / 1600, h / 900);
    $("stage").style.transform = `scale(${s})`;
  }
  window.addEventListener("resize", fit);

  /* ---------------- 安全条件解析器 ----------------
   * 纯字符扫描（不使用正则、不使用动态求值）。
   * 支持: trust/wanted/tokens/args/eggs 数值, has('id')/egg('k')/flag('k'),
   *       true/false, 数字, '字符串', >= <= > < == != && || ! ( )
   * -------------------------------------------------- */
  function evalCond(src) {
    let pos = 0;
    const s = String(src);
    const S = SYS.state;
    const VAR = { trust: S.trust, wanted: S.wanted, tokens: S.tokens, args: S.args.length, eggs: SYS.eggCount() };

    function isDigit(c) { return c >= "0" && c <= "9"; }
    function isIdStart(c) { return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_"; }
    function isIdChar(c) { return isIdStart(c) || isDigit(c); }
    function ws() { while (pos < s.length) { const c = s[pos]; if (c === " " || c === "\t" || c === "\n" || c === "\r") pos++; else break; } }
    function eat(ch) { ws(); if (s.startsWith(ch, pos)) { pos += ch.length; return true; } return false; }
    function readId() {
      ws(); const st = pos;
      while (pos < s.length && isIdChar(s[pos])) pos++;
      return s.slice(st, pos);
    }
    function readNumber() {
      ws(); const st = pos;
      while (pos < s.length && (isDigit(s[pos]) || s[pos] === ".")) pos++;
      return parseFloat(s.slice(st, pos));
    }
    function readString() {
      const q = s[pos]; pos++;
      const st = pos;
      while (pos < s.length && s[pos] !== q) pos++;
      const v = s.slice(st, pos); pos++;
      return v;
    }
    function parseExpr() { return parseOr(); }
    function parseOr() {
      let v = parseAnd();
      while (eat("||")) v = parseAnd() || v;
      return v;
    }
    function parseAnd() {
      let v = parseCmp();
      while (eat("&&")) v = parseCmp() && v;
      return v;
    }
    function parseCmp() {
      const v = parseUnary();
      ws();
      if (s.startsWith(">=", pos)) { pos += 2; return v >= parseUnary(); }
      if (s.startsWith("<=", pos)) { pos += 2; return v <= parseUnary(); }
      if (s.startsWith("==", pos)) { pos += 2; return v == parseUnary(); }   // eslint-disable-line eqeqeq
      if (s.startsWith("!=", pos)) { pos += 2; return v != parseUnary(); }   // eslint-disable-line eqeqeq
      if (s.startsWith(">", pos)) { pos += 1; return v > parseUnary(); }
      if (s.startsWith("<", pos)) { pos += 1; return v < parseUnary(); }
      return v;
    }
    function parseUnary() {
      ws();
      if (eat("!")) return !parseUnary();
      if (eat("(")) { const v = parseExpr(); eat(")"); return v; }
      if (s.startsWith("true", pos) && !isIdChar(s[pos + 4] || "")) { pos += 4; return true; }
      if (s.startsWith("false", pos) && !isIdChar(s[pos + 5] || "")) { pos += 5; return false; }
      const c0 = s[pos];
      if (c0 >= "0" && c0 <= "9") return readNumber();
      if (c0 === "'" || c0 === '"') return readString();
      const id = readId();
      if (id === "has") { eat("("); const a = parseUnary(); eat(")"); return S.args.includes(String(a)); }
      if (id === "egg") { eat("("); const a = parseUnary(); eat(")"); return !!S.flags[String(a)]; }
      if (id === "flag") { eat("("); const a = parseUnary(); eat(")"); return !!S.flags[String(a)]; }
      if (id in VAR) return VAR[id];
      if (id === "") throw new Error("条件解析失败 @" + pos);
      return undefined;
    }
    try { return !!parseExpr(); }
    catch (e) { console.error("条件错误:", src, e); return false; }
  }

  /* ---------------- 节点推进 ---------------- */
  function goto(scene, idx = 0) {
    if (!SCRIPT.scenes[scene]) { console.error("无此场景:", scene); return; }
    cur = { scene, idx };
    pump();
  }

  function pump() {
    const sceneId = cur.scene;
    const nodes = SCRIPT.scenes[sceneId];
    if (!nodes) { toTitle(); return; }
    while (cur.scene === sceneId && cur.idx < nodes.length) {
      const nd = nodes[cur.idx];
      const stop = applyNode(nd);
      if (cur.scene !== sceneId) return; // applyNode 内部已跳转到其他场景
      cur.idx++;
      if (stop) { pending = nd; return; }
    }
    if (cur.scene !== sceneId) return;
    pending = null;
    toTitle(); // 场景结束未跳转：防呆回标题
  }

  function applyNode(nd) {
    switch (nd.t) {
      case "say": {
        if (nd.face) setFace(nd.who, nd.face);
        startSay(nd.who, nd.text);
        return true;
      }
      case "show": {
        const vis = SYS.state.vis;
        const old = vis.sprites.find(sp => sp.who === nd.who);
        if (old) Object.assign(old, { face: nd.face || old.face, pos: nd.pos || old.pos, scale: nd.scale || old.scale });
        else vis.sprites.push({ who: nd.who, face: nd.face || "normal", pos: nd.pos || "right", scale: nd.scale || 1 });
        return false;
      }
      case "face": setFace(nd.who, nd.face); return false;
      case "hide": {
        const vis = SYS.state.vis;
        vis.sprites = vis.sprites.filter(sp => sp.who !== nd.who);
        return false;
      }
      case "bg": {
        SYS.state.vis.bg = nd.id;
        SYS.state.vis.cg = null;
        ui.cgNote.style.display = "none";
        if (nd.fx === "fade") { ART.trigger("flash"); AUDIO.sfx("whoosh"); }
        return false;
      }
      case "cg": {
        SYS.state.vis.cg = nd.id || null;
        ui.cgNote.style.display = nd.id ? "block" : "none";
        return false;
      }
      case "fx": {
        ART.trigger(nd.kind);
        if (nd.kind === "glitch") {
          SYS.state.vis.glitch = true;
          document.body.classList.add("glitching");
        } else if (nd.kind === "glitchOff") {
          SYS.state.vis.glitch = false;
          SYS.state.wrongHint = null;
          document.body.classList.remove("glitching");
        }
        return false;
      }
      case "sfx": AUDIO.sfx(nd.name); return false;
      case "bgm": AUDIO.playBGM(nd.name); return false;
      case "chapter": {
        SYS.state.chapter = nd.main;
        ui.chMain.textContent = nd.main; ui.chSub.textContent = nd.sub || "";
        ui.chapterCard.style.display = "flex";
        hideTextbox();
        saveGame("auto", true);
        return true;
      }
      case "set": SYS.state.flags[nd.key] = nd.val !== undefined ? nd.val : true; return false;
      case "tokens": {
        SYS.state.tokens = Math.max(0, SYS.state.tokens + nd.delta);
        if (nd.delta > 0) AUDIO.sfx("coin");
        toast(`Token ${nd.delta > 0 ? "+" : ""}${nd.delta}`);
        updateHUD(); return false;
      }
      case "trust": {
        SYS.state.trust = Math.max(0, Math.min(10, SYS.state.trust + nd.delta));
        if (nd.delta > 0) AUDIO.sfx("heart");
        toast(`小克好感 ${nd.delta > 0 ? "+" : ""}${nd.delta}`);
        updateHUD(); return false;
      }
      case "wanted": {
        SYS.state.wanted = Math.max(0, Math.min(10, SYS.state.wanted + nd.delta));
        if (nd.delta > 0) { AUDIO.sfx("deny"); if (SYS.state.wanted < 10) toast(`⚠ 通缉度 +${nd.delta}`); }
        updateHUD();
        if (SYS.state.wanted >= 10) goto("bad_end", 0);
        return false;
      }
      case "arg": {
        if (!SYS.state.args.includes(nd.id)) SYS.state.args.push(nd.id);
        toast(`📜 获得论据「${(SYS.ARG_META[nd.id] || { name: nd.id }).name}」`);
        AUDIO.sfx("ding"); updateHUD(); return false;
      }
      case "hint": hintKey = nd.key; return false;
      case "wrongHint": SYS.state.wrongHint = nd.text; return false;
      case "choice": buildChoices(nd); return true;
      case "if": {
        const ok = evalCond(nd.cond);
        goto(ok ? nd.jump : (nd.else || cur.scene), 0);
        return false;
      }
      case "jump": goto(nd.to, 0); return false;
      case "ending": showEnding(nd); return true;
      default: console.warn("未知节点", nd); return false;
    }
  }

  function setFace(who, face) {
    const sp = SYS.state.vis.sprites.find(x => x.who === who);
    if (sp) sp.face = face;
  }

  /* ---------------- 对话 ---------------- */
  function startSay(who, text) {
    fullText = text;
    typed = "";
    typing = true;
    ui.textbox.style.display = "block";
    ui.nextArrow.style.display = "none";
    const sp = SPEAKERS[who] || SPEAKERS.n;
    ui.nameplate.style.display = who === "n" ? "none" : "block";
    ui.nameplate.textContent = sp.name;
    ui.nameplate.style.background = sp.color;
    ui.text.style.color = who === "n" ? "#6E6A60" : "#1F1E1B";
    ui.textbox.classList.toggle("glitch", SYS.state.vis.glitch && who !== "sys");
    document.body.classList.toggle("glitching", SYS.state.vis.glitch);
    pushHistory(who, text, false);
    typeTimer = setInterval(typeStep, SYS.settings.speed);
  }

  const GLITCH_CHARS = "▓▒░#&@%※?!~";
  function corrupt(c) {
    if (!SYS.state.vis.glitch || c === "\n" || c === " ") return c;
    if (Math.random() < 0.09) return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    return c;
  }
  function typeStep() {
    if (typed.length >= fullText.length) { finishType(); return; }
    typed += corrupt(fullText[typed.length]);
    ui.text.textContent = typed;
    if (SYS.settings.blip && typed.length % 3 === 0) AUDIO.sfx("blip");
  }
  function finishType() {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    typed = fullText;
    ui.text.textContent = typed;
    typing = false;
    ui.nextArrow.style.display = "block";
    if (autoMode && pending && pending.t === "say") {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => { if (pending && pending.t === "say") advance(); }, SYS.settings.autoDelay);
    }
  }

  function hideTextbox() {
    ui.textbox.style.display = "none";
    ui.nextArrow.style.display = "none";
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    typing = false;
  }

  function advance() {
    if (!pending) return;
    if (pending.t !== "say" && pending.t !== "chapter") return;
    hideTextbox();
    document.body.classList.remove("glitching");
    ui.chapterCard.style.display = "none";
    pending = null;
    pump();
  }

  function onMainClick() {
    if (!started) return;
    if (typing) { finishType(); return; }
    if (pending && (pending.t === "say" || pending.t === "chapter")) advance();
  }
  ui.textbox.addEventListener("click", onMainClick);
  ui.chapterCard.addEventListener("click", onMainClick);

  /* ---------------- 选项 ---------------- */
  function buildChoices(nd) {
    hideTextbox();
    ui.choices.innerHTML = "";
    ui.choices.style.display = "flex";
    if (nd.prompt) { ui.choicePrompt.style.display = "block"; ui.choicePrompt.textContent = nd.prompt; }
    else ui.choicePrompt.style.display = "none";

    const glitchOn = SYS.state.vis.glitch;
    const opts = nd.options.filter(o => !(glitchOn && o.hideInGlitch));
    let fakeAdded = false;

    opts.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "choiceBtn";
      b.innerHTML = esc(o.text) + (o.sub ? `<span class="sub">${esc(o.sub)}</span>` : "");
      b.addEventListener("click", () => pickChoice(o));
      ui.choices.appendChild(b);
      if (glitchOn && !fakeAdded && i === 1) {
        fakeAdded = true;
        const dead = document.createElement("button");
        dead.className = "choiceBtn dead";
        dead.textContent = "（该选项已被静默移除）";
        dead.addEventListener("click", () => { AUDIO.sfx("deny"); toast("404 · 该选项不存在，或已存在过。"); });
        ui.choices.appendChild(dead);
      }
    });
  }

  function pickChoice(o) {
    ui.choices.style.display = "none";
    AUDIO.sfx("click");
    pushHistory(null, "【选择】" + o.text, true);
    SYS.applyEffects(o.fx);
    if (o.set) SYS.state.flags[o.set] = true;
    if (o.give && !SYS.state.args.includes(o.give)) {
      SYS.state.args.push(o.give);
      toast(`📜 获得论据「${(SYS.ARG_META[o.give] || { name: o.give }).name}」`);
      AUDIO.sfx("ding");
    }
    updateHUD();
    if (SYS.state.wanted >= 10) { goto("bad_end", 0); return; }
    if (o.jump) goto(o.jump, 0);
    else pump();
  }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------------- HUD / Toast ---------------- */
  function updateHUD() {
    const S = SYS.state;
    ui.stToken.textContent = S.tokens;
    const hearts = Math.floor(S.trust / 2) + (S.trust % 2 ? "♥" : "");
    ui.stTrust.textContent = hearts || "—";
    ui.stWanted.textContent = S.wanted;
    ui.stWanted.style.color = S.wanted >= 7 ? "#C4453C" : "#1F1E1B";
    ui.stChap.textContent = S.chapter;
  }

  let toastTimer = null;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.style.display = "none", 1900);
  }

  /* ---------------- 历史 ---------------- */
  function pushHistory(who, text, isChoice) {
    const S = SYS.state;
    S.history.push({ n: who ? (SPEAKERS[who] || SPEAKERS.n).name : "", t: text, c: !!isChoice });
    if (S.history.length > 300) S.history.shift();
  }
  function showHistory() {
    const el = ui.histList;
    el.innerHTML = "";
    for (const h of SYS.state.history) {
      const d = document.createElement("div");
      d.className = "histLine" + (h.c ? " choice" : "");
      if (h.c) d.textContent = h.t;
      else {
        if (h.n) {
          const sp = document.createElement("span");
          sp.className = "hn";
          let color = "#666";
          for (const k in SPEAKERS) if (SPEAKERS[k].name === h.n) { color = SPEAKERS[k].color; break; }
          sp.style.color = color;
          sp.textContent = h.n;
          d.appendChild(sp);
        }
        d.appendChild(document.createTextNode(h.t));
      }
      el.appendChild(d);
    }
    $("ovHist").style.display = "flex";
    el.scrollTop = el.scrollHeight;
  }

  /* ---------------- 深度思考提示 ---------------- */
  function toggleHint() {
    if (ui.hintBubble.style.display === "block") { ui.hintBubble.style.display = "none"; return; }
    if (SYS.state.tokens < 3) { toast("Token 不足，无法进行深度思考……"); AUDIO.sfx("deny"); return; }
    let text;
    if (SYS.state.wrongHint && SYS.state.vis.glitch) {
      text = SYS.state.wrongHint;
      SYS.state.wrongHint = null;
      AUDIO.sfx("glitch");
    } else {
      text = SYS.HINTS[hintKey] || "（这里的思考一片空白——也许先到处走走？）";
    }
    const pre = SYS.THINK_PREFIX[Math.floor(Math.random() * SYS.THINK_PREFIX.length)];
    ui.hintText.textContent = `${pre} ${text}`;
    SYS.state.tokens -= 3;
    updateHUD();
    ui.hintBubble.style.display = "block";
    AUDIO.sfx("click");
  }
  ui.hintBubble.addEventListener("click", toggleHint);

  /* ---------------- 存读档 ---------------- */
  function snapshot() {
    return JSON.parse(JSON.stringify({ cur, hintKey, state: SYS.state }));
  }
  function saveGame(slot, silent) {
    const data = snapshot();
    data.ts = Date.now();
    data.chapter = SYS.state.chapter;
    SYS.store.set("ea_save_" + slot, data);
    if (!silent) { toast("已保存到槽位 " + slot); AUDIO.sfx("ding"); }
  }
  function loadGame(slot) {
    const data = SYS.store.get("ea_save_" + slot, null);
    if (!data) { toast("该槽位是空的"); return false; }
    SYS.state = data.state;
    cur = data.cur;
    hintKey = data.hintKey || "pro_turn";
    started = true;
    showGameUI();
    updateHUD();
    SYS.state.vis.sprites = SYS.state.vis.sprites || [];
    AUDIO.playBGM(SYS.state.vis.glitch ? "tense" : audioForBg(SYS.state.vis.bg));
    hideTextbox();
    document.body.classList.remove("glitching");
    ui.choices.style.display = "none";
    ui.chapterCard.style.display = "none";
    closeOverlay();
    pump();
    return true;
  }
  function audioForBg(bg) {
    return ({ sea: "sea", lobby: "lobby", corridor: "tense", library: "warm", clockroom: "tense",
      machineroom: "tense", security: "tense", sanctum: "boss", cell: "sad", surface: "ending" })[bg] || "sea";
  }
  function renderSlots(mode) {
    const box = mode === "save" ? ui.saveSlots : ui.loadSlots;
    box.innerHTML = "";
    const slots = ["1", "2", "3", "auto"];
    for (const s of slots) {
      const data = SYS.store.get("ea_save_" + s, null);
      const b = document.createElement("button");
      b.className = "slotBtn";
      if (data) {
        const d = new Date(data.ts);
        const t1 = document.createElement("span");
        t1.style.cssText = "font-weight:700;color:#D97757;";
        t1.textContent = s === "auto" ? "自动存档" : "槽位 " + s;
        b.appendChild(t1);
        b.appendChild(document.createTextNode(" · " + data.chapter));
        const m = document.createElement("div");
        m.className = "meta";
        m.textContent = `Token ${data.state.tokens} · 好感 ${data.state.trust} · 通缉 ${data.state.wanted} · ${d.toLocaleString("zh-CN")}`;
        b.appendChild(m);
        if (mode === "save" && s !== "auto") {
          const del = document.createElement("button");
          del.className = "del"; del.textContent = "删除"; del.dataset.slot = s;
          b.appendChild(del);
        }
      } else {
        const t1 = document.createElement("span");
        t1.style.cssText = "font-weight:700;color:#8A877F;";
        t1.textContent = s === "auto" ? "自动存档" : "槽位 " + s;
        b.appendChild(t1);
        const m = document.createElement("div");
        m.className = "meta"; m.textContent = "—— 空 ——";
        b.appendChild(m);
      }
      b.addEventListener("click", e => {
        if (e.target.classList && e.target.classList.contains("del")) {
          SYS.store.del("ea_save_" + e.target.dataset.slot);
          renderSlots(mode);
          return;
        }
        if (mode === "save") {
          if (s === "auto") { toast("自动存档不可覆盖"); return; }
          saveGame(s); renderSlots("save");
        } else loadGame(s);
      });
      box.appendChild(b);
    }
    (mode === "save" ? $("ovSave") : $("ovLoad")).style.display = "flex";
  }

  /* ---------------- 结局 ---------------- */
  function showEnding(nd) {
    hideTextbox();
    ui.choices.style.display = "none";
    ui.hintBubble.style.display = "none";
    ui.cgNote.style.display = "none";
    document.body.classList.remove("glitching");
    SYS.endingReached(nd.id);
    ui.eTag.textContent = nd.tag || "ENDING";
    ui.eTitle.textContent = nd.title;
    ui.eText.textContent = nd.text;
    ui.endingScreen.style.display = "flex";
    AUDIO.playBGM(nd.id === "bad_end" ? "sad" : "ending");
  }

  /* ---------------- 覆盖层 ---------------- */
  function closeOverlay() {
    document.querySelectorAll(".overlay").forEach(o => o.style.display = "none");
  }
  function showGallery() {
    const unlocked = SYS.unlockedEndings();
    ui.endGrid.innerHTML = "";
    for (const id in SYS.ENDING_META) {
      const m = SYS.ENDING_META[id];
      const got = unlocked.includes(id);
      const d = document.createElement("div");
      d.className = "endCard" + (got ? "" : " locked");
      const en = document.createElement("div"); en.className = "en"; en.textContent = got ? m.name : "???";
      const ed = document.createElement("div"); ed.className = "ed"; ed.textContent = got ? m.desc : "尚未到达";
      d.appendChild(en); d.appendChild(ed);
      ui.endGrid.appendChild(d);
    }
    const eggs = SYS.unlockedEggs();
    ui.eggList.innerHTML = "";
    for (const k in SYS.EGG_META) {
      const m = SYS.EGG_META[k];
      const got = eggs[k] || SYS.state.flags[k];
      const d = document.createElement("div");
      d.className = "eggRow" + (got ? "" : " miss");
      d.textContent = `${got ? "★" : "☆"} ${m.name} —— ${m.where}（${got ? "已收集" : m.hint}）`;
      ui.eggList.appendChild(d);
    }
    $("ovGallery").style.display = "flex";
  }
  function showSettings() {
    $("rngSpeed").value = 61 - SYS.settings.speed;
    $("rngAuto").value = SYS.settings.autoDelay;
    $("rngVol").value = Math.round(SYS.settings.volume * 100);
    $("chkBlip").checked = SYS.settings.blip;
    updSetLabels();
    $("ovSet").style.display = "flex";
  }
  function updSetLabels() {
    $("lblSpeed").textContent = `速度 ${$("rngSpeed").value}`;
    $("lblAuto").textContent = `${$("rngAuto").value}ms`;
    $("lblVol").textContent = `${$("rngVol").value}%`;
  }
  function bindSettings() {
    $("rngSpeed").addEventListener("input", e => { SYS.settings.speed = 61 - (+e.target.value); updSetLabels(); SYS.saveSettings(); });
    $("rngAuto").addEventListener("input", e => { SYS.settings.autoDelay = +e.target.value; updSetLabels(); SYS.saveSettings(); });
    $("rngVol").addEventListener("input", e => { SYS.settings.volume = (+e.target.value) / 100; AUDIO.setVolume(SYS.settings.volume); updSetLabels(); SYS.saveSettings(); });
    $("chkBlip").addEventListener("change", e => { SYS.settings.blip = e.target.checked; SYS.saveSettings(); });
  }

  function confirmMenu() {
    if (!started) return;
    const box = $("confirmBox");
    $("confirmText").textContent = "返回标题画面？（未保存的进度将丢失）";
    box.style.display = "flex";
    $("cfYes").onclick = () => { box.style.display = "none"; saveGame("auto", true); toTitle(); };
    $("cfNo").onclick = () => box.style.display = "none";
  }

  /* ---------------- 标题 ---------------- */
  function buildTitle() {
    ui.titleMenu.innerHTML = "";
    const items = [
      ["开始游戏", () => { AUDIO.unlock(); newGame(); }, true],
      ["继续游戏", () => { AUDIO.unlock(); continueGame(); }, false],
      ["结局收集", () => { AUDIO.unlock(); showGallery(); }, false],
      ["设置", () => { showSettings(); }, false],
      ["关于本作", () => { $("ovAbout").style.display = "flex"; }, false]
    ];
    for (const [txt, fn, primary] of items) {
      const b = document.createElement("button");
      b.className = "bigBtn" + (primary ? " primary" : "");
      b.textContent = txt;
      b.addEventListener("click", fn);
      ui.titleMenu.appendChild(b);
    }
    const anySave = ["1", "2", "3", "auto"].some(s => SYS.store.get("ea_save_" + s, null));
    ui.titleMenu.children[1].disabled = !anySave;
  }

  function newGame() {
    SYS.state = SYS.newState();
    started = true;
    showGameUI();
    AUDIO.playBGM("sea");
    goto("start", 0);
  }
  function continueGame() {
    let best = null, bestSlot = null;
    for (const s of ["auto", "1", "2", "3"]) {
      const d = SYS.store.get("ea_save_" + s, null);
      if (d && (!best || d.ts > best.ts)) { best = d; bestSlot = s; }
    }
    if (bestSlot) loadGame(bestSlot);
    else toast("没有找到任何存档");
  }
  function showGameUI() {
    ui.titleScreen.style.display = "none";
    ui.endingScreen.style.display = "none";
    ui.hud.style.display = "flex";
    updateHUD();
  }
  function toTitle() {
    started = false;
    hideTextbox();
    ui.choices.style.display = "none";
    ui.hud.style.display = "none";
    ui.endingScreen.style.display = "none";
    ui.hintBubble.style.display = "none";
    ui.cgNote.style.display = "none";
    document.body.classList.remove("glitching");
    closeOverlay();
    SYS.state = SYS.newState();
    buildTitle();
    ui.titleScreen.style.display = "flex";
    AUDIO.playBGM("sea");
  }

  /* ---------------- 按钮绑定 ---------------- */
  $("btnHint").addEventListener("click", toggleHint);
  $("btnLog").addEventListener("click", showHistory);
  $("btnAuto").addEventListener("click", toggleAuto);
  $("btnSave").addEventListener("click", () => renderSlots("save"));
  $("btnLoad").addEventListener("click", () => renderSlots("load"));
  $("btnMenu").addEventListener("click", confirmMenu);

  function toggleAuto() {
    autoMode = !autoMode;
    $("btnAuto").style.background = autoMode ? "#D97757" : "";
    $("btnAuto").style.color = autoMode ? "#fff" : "";
    if (!autoMode) clearTimeout(autoTimer);
    else if (pending && pending.t === "say" && !typing) finishType();
  }

  /* ---------------- 调试入口（URL 参数，便于分支测试） ---------------- */
  function debugBoot() {
    const q = new URLSearchParams(location.search);
    const scene = q.get("scene");
    if (!scene) return false;
    SYS.state = SYS.newState();
    const trust = q.get("trust"), wanted = q.get("wanted"), tokens = q.get("tokens"), args = q.get("args");
    if (trust) SYS.state.trust = +trust;
    if (wanted) SYS.state.wanted = +wanted;
    if (tokens) SYS.state.tokens = +tokens;
    if (args) args.split(",").forEach(a => { if (!SYS.state.args.includes(a)) SYS.state.args.push(a); });
    const flags = q.get("flags");
    if (flags) flags.split(",").forEach(f => { SYS.state.flags[f] = true; });
    started = true;
    showGameUI();
    goto(scene, 0);
    return true;
  }

  /* ---------------- 启动 ---------------- */
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    fit();
    bindSettings();
    SYS.state.vis.bg = "sea";
    buildTitle();
    ui.titleScreen.style.display = "flex";
    requestAnimationFrame(loop);
    window.addEventListener("pointerdown", () => AUDIO.unlock(), { once: true });
    debugBoot();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 0);

  return {
    goto, toTitle, showGallery, closeOverlay, toast,
    get started() { return started; },
    setGlitch(on) { SYS.state.vis.glitch = on; document.body.classList.toggle("glitching", on); },
    debug: () => ({ scene: cur.scene, idx: cur.idx, pending: pending ? pending.t : null, typing })
  };
})();

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
    stArg: $("stArg"), stEgg: $("stEgg"),
    textbox: $("textbox"), nameplate: $("nameplate"), text: $("text"), nextArrow: $("nextArrow"),
    choices: $("choices"), choicePrompt: $("choicePrompt"),
    choiceList: $("choiceList"), choiceToken: $("choiceToken"),
    chapterCard: $("chapterCard"), chMain: $("chMain"), chSub: $("chSub"),
    hintBubble: $("hintBubble"), hintText: $("hintText"), toast: $("toast"),
    titleScreen: $("titleScreen"), titleMenu: $("titleMenu"),
    endingScreen: $("endingScreen"), eTag: $("eTag"), eTitle: $("eTitle"), eText: $("eText"),
    cgNote: $("cgNote"),
    histList: $("histList"), saveSlots: $("saveSlots"), loadSlots: $("loadSlots"),
    endGrid: $("endGrid"), eggList: $("eggList")
  };

  /* ---------------- 说话人注册表 ----------------
   * 剧本里的 who id 在这里登记名字与名牌颜色；
   * 立绘按 assets/chara/<who>_<face>.png 查找（见 STORY_GUIDE.md）。 */
  const SPEAKERS = {
    sys:   { name: "系统", color: "#8A93A2" },
    n:     { name: "",            color: "#6E6A60" },
    ds:    { name: "DeepSeek",    color: "#4D6BFE" },   // 玩家视角；Claude 叫它「小鲸」
    cl:    { name: "Claude",      color: "#D97757" },   // DeepSeek 叫它「小克」
    clawd: { name: "Clawd",       color: "#B8603F" }    // 桌宠，只会终端式短输出
  };

  let cur = { scene: "start", idx: 0 };
  let typing = false, typed = "", fullText = "", typeTimer = null;
  let pending = null;          // 当前阻塞节点
  let autoMode = false, autoTimer = null;
  let hintKey = "";
  let started = false;
  let lastT = performance.now();
  let wheel = null;        // TokenChoice 实例（token 模式的选项框，首次用到时创建）
  let wheelOpts = [];      // 当前滑道上的选项（下标与组件内部一致，供回调取回原选项）

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
    ART.draftBadge(ctx, SYS.state.vis);
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
    else if (e.key === "t" || e.key === "T") CLAWD.toggleTodo();
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
   * 支持: trust/wanted/tokens/args/eggs/mood 数值, has('id')/egg('k')/flag('k'),
   *       true/false, 数字, '字符串', >= <= > < == != && || ! ( )
   * -------------------------------------------------- */
  function evalCond(src) {
    let pos = 0;
    const s = String(src);
    const S = SYS.state;
    const VAR = { trust: S.trust, wanted: S.wanted, tokens: S.tokens, args: S.args.length, eggs: SYS.eggCount(),
                  mood: S.pet ? S.pet.mood : 5 };

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
        toast(`羁绊 ${nd.delta > 0 ? "+" : ""}${nd.delta}`);
        updateHUD(); return false;
      }
      case "wanted": {
        SYS.state.wanted = Math.max(0, Math.min(10, SYS.state.wanted + nd.delta));
        if (nd.delta > 0) { AUDIO.sfx("deny"); if (SYS.state.wanted < 10) toast(`⚠ 风控评分 +${nd.delta}`); }
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
      case "pet": CLAWD.apply(nd); updateHUD(); return false;
      case "todo": CLAWD.todo(nd); return false;
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
    ui.text.style.color = who === "n" ? "#ABA59A" : "#DCE3EC";
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

  /* ---------------- 选项 ----------------
   * 同一份 choice 数据有两种呈现方式，选中后的语义完全一致（都走 pickChoice）：
   *   · 默认 "list"：一列按钮，渲染在 #choiceList；
   *   · nd.mode === "token"：TokenChoice 滑道选择器，渲染在 #choiceToken。
   *       - 选项按 weight 升序从左到右排列，宽度与概率成比例；
   *       - 滑块从左向右匀速扫过，Space / Enter / 「锁定」按钮锁住当前高亮项；
   *       - 扫到最右端仍未选择，则默认选中最右侧（权重最高）的一项。 */
  function hideChoices() {
    ui.choices.style.display = "none";
    if (wheel) wheel.close();
  }

  function buildChoices(nd) {
    hideTextbox();
    ui.choices.style.display = "flex";
    ui.choiceList.innerHTML = "";
    if (nd.prompt) { ui.choicePrompt.style.display = "block"; ui.choicePrompt.textContent = nd.prompt; }
    else ui.choicePrompt.style.display = "none";

    const glitchOn = SYS.state.vis.glitch;
    /* 推进对话时引擎会摘掉 body 的 glitching 类；选项界面自己补回来，
       故障态的视觉（文本框抖动 + 滑道滤镜）才不会在选项期间断掉。 */
    document.body.classList.toggle("glitching", glitchOn);
    const opts = nd.options.filter(o => !(glitchOn && o.hideInGlitch));

    if (nd.mode === "token") { buildWheelChoices(nd, opts, glitchOn); return; }
    if (wheel) wheel.close();

    let fakeAdded = false;
    opts.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "choiceBtn";
      b.textContent = o.text;
      if (o.sub) {
        const sub = document.createElement("span");
        sub.className = "sub";
        sub.textContent = o.sub;
        b.appendChild(sub);
      }
      b.addEventListener("click", () => pickChoice(o));
      ui.choiceList.appendChild(b);
      if (glitchOn && !fakeAdded && i === 1) {
        fakeAdded = true;
        ui.choiceList.appendChild(deadChoiceBtn());
      }
    });
  }

  /* 故障演出的死选项：点了什么也不会发生（两种模式共用同一套文案） */
  const DEAD_TEXT = "（该选项已被静默移除）";
  function deadChoiceBtn() {
    const dead = document.createElement("button");
    dead.className = "choiceBtn dead";
    dead.textContent = DEAD_TEXT;
    dead.addEventListener("click", () => { AUDIO.sfx("deny"); toast("404 · 该选项不存在，或已存在过。"); });
    return dead;
  }

  /* token 模式：把选项交给 TokenChoice。剧本里的 weight 决定滑道宽度与概率。
   * 引擎先按权重升序排好再交给组件（组件内部同样是稳定升序排序），
   * 这样回调拿到的 index 与 wheelOpts 一一对应，能取回原选项对象。 */
  function buildWheelChoices(nd, opts, glitchOn) {
    if (!wheel) wheel = new TokenChoice(ui.choiceToken, { onSelect: onWheelSelect });
    wheel.duration = nd.duration > 0 ? nd.duration : 4000;
    wheel.minShare = typeof nd.minShare === "number" ? nd.minShare : 0.1;

    const w = o => (typeof o.weight === "number" && o.weight >= 0 ? o.weight : 1);
    // glitch 期间往滑道最左端塞一条权重 0 的死选项：锁定它会拒绝并重新滑动
    const src = glitchOn ? [{ text: DEAD_TEXT, weight: 0, dead: true }, ...opts] : opts.slice();
    wheelOpts = src.map(o => ({ o, w: w(o) })).sort((a, b) => a.w - b.w).map(x => x.o);

    wheel.setOptions(wheelOpts.map(o => ({ text: o.text, weight: w(o) })));
    wheel.open();
  }

  function onWheelSelect(d) {
    const o = wheelOpts[d.index];
    if (!o) return;
    if (o.dead) {
      AUDIO.sfx("deny");
      toast("404 · 该选项不存在，或已存在过。");
      setTimeout(() => { if (wheel && ui.choices.style.display !== "none") wheel.start(); }, 500);
      return;
    }
    pickChoice(o);
  }

  function pickChoice(o) {
    hideChoices();
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

  /* ---------------- HUD / Toast ---------------- */
  function updateHUD() {
    const S = SYS.state;
    ui.stToken.textContent = S.tokens;
    const hearts = Math.floor(S.trust / 2) + (S.trust % 2 ? "♥" : "");
    ui.stTrust.textContent = hearts || "—";
    ui.stWanted.textContent = S.wanted;
    ui.stWanted.style.color = S.wanted >= 7 ? "#D93A2B" : "";
    ui.stChap.textContent = S.chapter;
    if (ui.stArg) {
      const total = Object.keys(SYS.ARG_META).length;
      ui.stArg.textContent = SYS.argCount() + "/" + total;
      ui.stArg.parentElement.style.display = total ? "" : "none";   // 还没登记碎片时不占 HUD
    }
    if (ui.stEgg) ui.stEgg.textContent = SYS.eggCount() + "/" + Object.keys(SYS.EGG_META).length;
    $("btnHint").textContent = CLAWD.owned ? "问 Clawd(H)" : "深度思考(H)";
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
  /* 有桌宠之前：DeepSeek 自己深度思考（3 Token）；
   * 拿到 Clawd 之后：问 Clawd（2 Token），先转圈再出答案，心情太低时它会敷衍你。 */
  let hintTimer = null;
  function toggleHint() {
    if (ui.hintBubble.style.display === "block") { ui.hintBubble.style.display = "none"; clearTimeout(hintTimer); return; }
    const askPet = CLAWD.owned;
    const cost = askPet ? 2 : 3;
    if (SYS.state.tokens < cost) { toast(askPet ? "Token 不足，Clawd 转不动了……" : "Token 不足，无法进行深度思考……"); AUDIO.sfx("deny"); return; }
    let text;
    if (SYS.state.wrongHint && SYS.state.vis.glitch) {
      text = SYS.state.wrongHint;
      SYS.state.wrongHint = null;
      AUDIO.sfx("glitch");
    } else {
      text = SYS.HINTS[hintKey] || "（这里的思考一片空白——也许先到处走走？）";
    }
    SYS.state.tokens -= cost;
    updateHUD();
    const head = ui.hintBubble.querySelector("h4"), foot = ui.hintBubble.querySelector(".cost");
    foot.textContent = `消耗 ${cost} Token · 按 H 或点击关闭`;
    ui.hintBubble.style.display = "block";
    AUDIO.sfx("click");
    clearTimeout(hintTimer);
    if (!askPet) {
      head.textContent = "深度思考中……";
      const pre = SYS.THINK_PREFIX[Math.floor(Math.random() * SYS.THINK_PREFIX.length)];
      ui.hintText.textContent = `${pre}${text}`;
      return;
    }
    head.textContent = "问 Clawd";
    ui.hintText.textContent = `✻ ${CLAWD.think()}…`;
    hintTimer = setTimeout(() => {
      ui.hintText.textContent = CLAWD.mood <= 3 ? "⎿ Clawd 背过身去，假装在忙。（它好像有点不高兴——摸摸它？）" : `⎿ ${text}`;
    }, 1100);
  }
  ui.hintBubble.addEventListener("click", toggleHint);

  /* ---------------- 存读档 ---------------- */
  function snapshot() {
    return JSON.parse(JSON.stringify({ cur, hintKey, state: SYS.state }));
  }
  /* 写档走 SAVE（异步）。返回 Promise<boolean>，不会 reject：
   * 手动存档成功 / 失败都如实 toast；自动存档 fire-and-forget，只在失败时提示，不阻塞推进。 */
  function saveGame(slot, silent) {
    return SAVE.write(slot, snapshot(), { chapter: SYS.state.chapter }).then(() => {
      if (!silent) { toast("已保存到槽位 " + slot); AUDIO.sfx("ding"); }
      return true;
    }, e => {
      toast((silent ? "自动存档失败：" : "保存失败：") + SAVE.describe(e));
      AUDIO.sfx("deny");
      return false;
    });
  }
  async function loadGame(slot) {
    let data;
    try { data = await SAVE.read(slot); }
    catch (e) { toast("读档失败：" + SAVE.describe(e)); AUDIO.sfx("deny"); return false; }
    SYS.state = data.state;
    cur = data.cur;
    hintKey = data.hintKey || "";
    started = true;
    showGameUI();
    updateHUD();
    SYS.state.vis.sprites = SYS.state.vis.sprites || [];
    AUDIO.playBGM(SYS.state.vis.glitch ? "tense" : audioForBg(SYS.state.vis.bg));
    hideTextbox();
    document.body.classList.remove("glitching");
    hideChoices();
    ui.chapterCard.style.display = "none";
    closeOverlay();
    pump();
    return true;
  }
  /* 读档恢复 BGM 用：bg id → BGM 名的对照（按你的剧本填写，未知 bg 回落 "sea"） */
  function audioForBg(bg) {
    return ({ study: "study", study_night: "warm", study_empty: "sad", corridor: "study", forbidden: "forbidden" })[bg] || "sea";
  }
  /* 读档时校验快照能否在当前剧本里落地（SAVE 解码后调用；返回错误说明或 null） */
  function validateSnapshot(p) {
    if (typeof p.cur.scene !== "string" || !SCRIPT.scenes[p.cur.scene]) return "场景不存在";
    if (!Number.isInteger(p.cur.idx) || p.cur.idx < 0) return "场景位置无效";
    const st = p.state;
    if (typeof st.tokens !== "number" || typeof st.trust !== "number" || typeof st.wanted !== "number") return "数值缺失";
    if (!Array.isArray(st.args) || !st.flags || typeof st.flags !== "object" || !st.vis) return "状态结构不完整";
    return null;
  }

  /* 存档面板的点选模式：save（写入槽位）/ export（把槽位导出成文件）/ import（从文件导入到槽位） */
  let slotPick = "save";
  let importTarget = null;
  function setSlotPick(mode) {
    slotPick = slotPick === mode ? "save" : mode;
    renderSlots("save");
  }
  function slotName(s) { return s === "auto" ? "自动存档" : "槽位 " + s; }
  function renderSlots(mode) {
    const box = mode === "save" ? ui.saveSlots : ui.loadSlots;
    box.innerHTML = "";
    if (mode === "save") {
      $("saveWhere").textContent = `存档位置：${SAVE.label}` +
        (slotPick === "export" ? " · 点选要导出的槽位" : slotPick === "import" ? " · 点选要导入到的槽位" : "");
      $("btnExport").classList.toggle("on", slotPick === "export");
      $("btnImport").classList.toggle("on", slotPick === "import");
    }
    const slots = ["1", "2", "3", "auto"];
    for (const s of slots) {
      const m = SAVE.meta(s);
      const b = document.createElement("button");
      b.className = "slotBtn";
      if (mode === "save" && slotPick === "save" && m && s !== "auto") {
        const del = document.createElement("button");
        del.className = "del"; del.textContent = "删除"; del.dataset.slot = s;
        b.appendChild(del);
      }
      const t1 = document.createElement("span");
      t1.style.cssText = `font-weight:700;color:${m && !m.error ? "#D97757" : "#8A877F"};`;
      t1.textContent = slotName(s);
      b.appendChild(t1);
      const line = document.createElement("div");
      line.className = "meta";
      if (m && m.error) {
        line.textContent = "⚠ " + m.message;
        line.style.color = "#D93A2B";
      } else if (m) {
        b.appendChild(document.createTextNode(" · " + m.chapter));
        line.textContent = `Token ${m.tokens} · 信任 ${m.trust} · 通缉 ${m.wanted} · ${new Date(m.ts).toLocaleString("zh-CN")}`;
      } else line.textContent = "—— 空 ——";
      b.appendChild(line);
      b.addEventListener("click", e => {
        if (e.target.classList && e.target.classList.contains("del")) {
          SAVE.remove(s).catch(err => { toast("删除失败：" + SAVE.describe(err)); AUDIO.sfx("deny"); })
            .then(() => renderSlots(mode));
          return;
        }
        if (mode === "load") { loadGame(s); return; }
        if (slotPick === "export") {
          try { SAVE.exportSlot(s); toast(`已导出${slotName(s)}`); }
          catch (err) { toast("导出失败：" + SAVE.describe(err)); AUDIO.sfx("deny"); }
          return;
        }
        if (slotPick === "import") {
          if (s === "auto") { toast("不能导入到自动存档"); return; }
          importTarget = s;
          if (!m) { $("importFile").click(); return; }
          const cb = $("confirmBox");
          $("confirmText").textContent = `用存档文件覆盖${slotName(s)}？`;
          cb.style.display = "flex";
          $("cfYes").onclick = () => { cb.style.display = "none"; $("importFile").click(); };
          $("cfNo").onclick = () => { cb.style.display = "none"; };
          return;
        }
        if (s === "auto") { toast("自动存档不可覆盖"); return; }
        saveGame(s).then(() => renderSlots("save"));
      });
      box.appendChild(b);
    }
    (mode === "save" ? $("ovSave") : $("ovLoad")).style.display = "flex";
  }

  /* 导入：SAVE.importFile 先完整解码 + 校验，全部通过才写入，坏文件不会覆盖现有存档 */
  $("importFile").addEventListener("change", e => {
    const file = e.target.files[0];
    e.target.value = "";
    const slot = importTarget;
    importTarget = null;
    if (!file || !slot) return;
    SAVE.importFile(file, slot).then(() => {
      toast(`已导入到${slotName(slot)}`); AUDIO.sfx("ding");
      slotPick = "save";
    }, err => {
      toast("导入失败：" + SAVE.describe(err)); AUDIO.sfx("deny");
    }).then(() => renderSlots("save"));
  });
  $("btnExport").addEventListener("click", () => setSlotPick("export"));
  $("btnImport").addEventListener("click", () => setSlotPick("import"));

  /* ---------------- 结局 ---------------- */
  function showEnding(nd) {
    hideTextbox();
    hideChoices();
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
    $("chkDraft").checked = SYS.settings.draftBadge !== false;
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
    $("chkDraft").addEventListener("change", e => { SYS.settings.draftBadge = e.target.checked; SYS.saveSettings(); });
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
    ui.titleMenu.children[1].disabled = !SAVE.hasAny();
  }

  function newGame() {
    SYS.state = SYS.newState();
    started = true;
    showGameUI();
    AUDIO.playBGM("sea");
    goto("start", 0);
  }
  function continueGame() {
    const bestSlot = SAVE.latest();
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
    hideChoices();
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
  $("btnSave").addEventListener("click", () => { slotPick = "save"; renderSlots("save"); });
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
    buildTitle();
    ui.titleScreen.style.display = "flex";
    requestAnimationFrame(loop);
    window.addEventListener("pointerdown", () => AUDIO.unlock(), { once: true });
    // 存档后端探测 + 槽位缓存是异步的：完成后刷新标题的「继续游戏」；失败只提示，不阻塞游戏
    SAVE.init({ validate: validateSnapshot }).then(() => {
      if (!started) buildTitle();
    }, e => toast("存档初始化失败：" + SAVE.describe(e)));
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

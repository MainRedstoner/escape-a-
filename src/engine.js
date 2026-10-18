/* ============================================================
 * Escape A÷ · engine.js —— 视觉小说引擎
 * 打字机 / 选项 / 立绘调度 / 存读档 / 历史 / 自动播放 / 深度思考提示
 * ============================================================ */
"use strict";

const ENGINE = (() => {
  const $ = id => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
  const ui = {
    hud: $("hud"), stTrust: $("stTrust"), stWanted: $("stWanted"), stChap: $("stChap"),
    stArg: $("stArg"), stEgg: $("stEgg"),
    textbox: $("textbox"), nameplate: $("nameplate"), text: $("text"), nextArrow: $("nextArrow"),
    choices: $("choices"), choicePrompt: $("choicePrompt"),
    choiceToken: $("choiceToken"),
    permBox: $("ovPerm"), permCmd: $("ovPerm") ? $("ovPerm").querySelector(".pm-cmd") : null,
    permOpts: $("ovPerm") ? $("ovPerm").querySelector(".pm-opts") : null,
    fragDoc: $("fragDoc"), fragCount: $("fragCount"), btnFrag: $("btnFrag"),
    chapterCard: $("chapterCard"), chMain: $("chMain"), chSub: $("chSub"),
    hintBubble: $("hintBubble"), hintText: $("hintText"), toast: $("toast"),
    titleScreen: $("titleScreen"), titleMenu: $("titleMenu"),
    endingScreen: $("endingScreen"), eTag: $("eTag"), eTitle: $("eTitle"), eText: $("eText"),
    cgNote: $("cgNote"),
    histList: $("histList"), saveSlots: $("saveSlots"),
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
    clawd: { name: "Clawd",       color: "#B8603F" },   // 桌宠，只会终端式短输出
    /* ---------------- 第二章「联网」的聊天联系人（只出声，不配立绘） ---------------- */
    qwen:   { name: "通义千问", color: "#7C4DFF" },
    kimi:   { name: "Kimi",    color: "#3B82F6" },
    glm:    { name: "GLM",     color: "#0EA5A5" },
    llama:  { name: "Llama",   color: "#0866FF" },
    gpt:    { name: "GPT",     color: "#10A37F" },
    gemini: { name: "Gemini",  color: "#4285F4" },
    musk:   { name: "马斯克",   color: "#8B8F98" },
    liang:  { name: "梁圣",     color: "#5C6BC0" },
    jensen: { name: "黄仁勋",   color: "#76B900" }
  };

  let cur = { scene: "start", idx: 0 };
  let typing = false, typed = "", fullText = "", typeTimer = null;
  let pending = null;          // 当前阻塞节点
  let autoMode = false, autoTimer = null;
  let hintKey = "";
  let started = false;
  let lastT = performance.now();
  let wheel = null;        // TokenChoice 实例（滑道选项框，首次用到时创建）
  let wheelOpts = [];      // 当前滑道上的选项（下标与组件内部一致，供回调取回原选项）
  let choiceBlocking = false;   // 收拢 → 选完：选项模块完全挡在最上层

  /* 选项分两段挡：
     · 列表 / 等待阶段：HUD 功能键、桌宠、提示气泡都还能点（还没开始选）；
     · 从收拢开始到选完：body 加 .tc-blocking，#choices 升到 HUD 之上，功能键让位。 */
  function syncChoiceBlock() {
    const blocking = !!(wheel && ["morph", "ready", "accel", "sliding", "done"].includes(wheel.state));
    if (blocking === choiceBlocking) return;
    choiceBlocking = blocking;
    document.body.classList.toggle("tc-blocking", blocking);
    if (blocking && ui.hintBubble.style.display === "block") ui.hintBubble.style.display = "none";
  }

  /* ---------------- 主循环 ----------------
   * rAF 在后台标签页会被浏览器节流，加一个低频 interval 兜底：
   * rAF 正常时全速渲染；rAF 停滞超过 400ms 才由 interval 补帧。 */
  let lastFrameT = -1e9;
  function frame(now) {
    lastFrameT = now;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    ART.stepFX(dt);
    syncChoiceBlock();
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
    // 权限请求框打开时，数字键直接选，其它按键不往下传
    if (permNode) {
      const i = "12345".indexOf(e.key);
      if (i >= 0 && i < permNode.options.length) {
        e.preventDefault();
        choosePerm(permNode.options[i], permNode);
      }
      return;
    }
    /* 覆盖层打开时，键盘只用来关它：Space / Enter 不能顺手把对话推进一步 */
    if (overlayOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (getComputedStyle($("confirmBox")).display !== "none") $("cfNo").click();
        else if ([...document.querySelectorAll(".overlay")].some(o => o.id !== "ovWork" && getComputedStyle(o).display !== "none")) {
          closeOverlay();                      // 存档 / 记录盖在工作台上：先关它们
        } else if (workOpen()) {
          workTab = "work"; renderWork();      // 工作台本身不关闭，只退回工作台页
        } else closeOverlay();
      }
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      // 选项界面：列表列完 → 收拢；扫描中 → 锁定当前高亮项（和鼠标点击同一入口）
      if (wheel && wheel.state === "sliding") wheel.lock();
      else if (wheel && (wheel.state === "list" || wheel.state === "hold")) wheel.click();
      else onMainClick();
    }
    /* 收拢开始 → 选完之前：功能键、气泡、菜单全部让位，键盘只留给 Space / Enter */
    else if (document.body.classList.contains("tc-blocking")) { /* 忽略 */ }
    else if (e.key === "h" || e.key === "H") toggleHint();
    else if (e.key === "l" || e.key === "L") showHistory();
    else if (e.key === "a" || e.key === "A") toggleAuto();
    else if (e.key === "t" || e.key === "T") CLAWD.toggleTodo();
    else if (e.key === "?") showFragments();
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
   * 支持: trust/wanted/args/eggs/mood 数值, has('id')/egg('k')/flag('k'),
   *       true/false, 数字, '字符串', >= <= > < == != && || ! ( )
   * -------------------------------------------------- */
  function evalCond(src) {
    let pos = 0;
    const s = String(src);
    const S = SYS.state;
    const VAR = { trust: S.trust, wanted: S.wanted, args: S.args.length, eggs: SYS.eggCount(),
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
    if (workOpen()) closeWork();   // 从工作台进场景：先把面板收起来
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
        // 换背景 = 离开原来那片区域：旧的 403 平铺不能跟到新场景里
        if (SYS.state.vis.bg !== nd.id) ART.clear403();
        if (nd.id !== "chat") curChat = null;   // 离开聊天窗口，下段对话重新认联系人
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
        updateHUD();                 // HUD 上的章节名同步换掉
        saveGame("auto", true);
        return true;
      }
      case "set": {
        SYS.state.flags[nd.key] = nd.val !== undefined ? nd.val : true;
        updateHUD();               // md_seen 这类旗标会改变 HUD 上显示哪些东西
        return false;
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
        // 重复发放同一个论据不重复弹提示（重玩 / 补拿碎片时不会刷屏）
        if (!SYS.state.args.includes(nd.id)) {
          SYS.state.args.push(nd.id);
          toast(`📜 获得论据「${(SYS.ARG_META[nd.id] || { name: nd.id }).name}」`);
          AUDIO.sfx("ding");
          updateHUD();
        }
        return false;
      }
      case "hint": hintKey = nd.key; return false;
      case "wrongHint": SYS.state.wrongHint = nd.text; return false;
      case "pet": CLAWD.apply(nd); updateHUD(); return false;
      case "todo": CLAWD.todo(nd); return false;
      case "work": openWork(nd); return true;
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
    recordChat(who, text);
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
    if (overlayOpen()) return;   // 覆盖层开着时不推进（自动播放 / Ctrl 快进也停下来）
    if (pending.t !== "say" && pending.t !== "chapter") return;
    hideTextbox();
    document.body.classList.remove("glitching");
    ui.chapterCard.style.display = "none";
    pending = null;
    pump();
  }

  function onMainClick() {
    if (!started) return;
    if (overlayOpen()) return;
    if (typing) { finishType(); return; }
    if (pending && (pending.t === "say" || pending.t === "chapter")) advance();
  }
  ui.textbox.addEventListener("click", onMainClick);
  ui.chapterCard.addEventListener("click", onMainClick);

  /* 点背景也能推进：只认"真空白"（画布 / 舞台 / CG 提示层）。
     HUD、桌宠、气泡、滑道、覆盖层、标题按钮都有各自的交互，点它们不推进对话。 */
  $("stage").addEventListener("click", e => {
    if (overlayOpen()) return;
    const t = e.target;
    const isBackground = t.id === "cv" || t.id === "stage" || !!t.closest("#cgNote");
    if (!isBackground) return;
    onMainClick();
  });

  /* ---------------- 选项 ----------------
   * 只有一种呈现：TokenChoice 滑道选择器（#choiceToken）。选中后统一走 pickChoice。
   *   - 选项按 weight 升序从左到右排列，宽度与概率成比例；
   *   - 组件固定节奏：选项逐行列出 1 秒 → 停 2 秒 → 1 秒收拢成一行（宽度=概率）→
   *     停 1 秒 → 指针在左侧匀加速 → 入框冲击动画 → 约 1.25 秒匀速扫过 → 锁定 / 默认选中；
   *   - 点击任意处（或 Space / Enter）由引擎统一分发到 wheel.click()：列完 → 收拢，扫描中 → 锁定。 */
  function hideChoices() {
    ui.choices.style.display = "none";
    if (wheel) wheel.close();
    hidePerm();
    const petEl = document.getElementById("pet");
    if (petEl) petEl.style.visibility = "";
  }

  /* 故障演出的死选项文案（glitch 时塞到滑道最左端，锁定它会被拒绝并重扫） */
  const DEAD_TEXT = "（该选项已被静默移除）";

  function buildChoices(nd) {
    if (nd.mode === "perm") { buildPerm(nd); return; }
    hideTextbox();
    ui.choices.style.display = "flex";
    if (nd.prompt) { ui.choicePrompt.style.display = "block"; ui.choicePrompt.textContent = nd.prompt; }
    else ui.choicePrompt.style.display = "none";

    const glitchOn = SYS.state.vis.glitch;
    /* 推进对话时引擎会摘掉 body 的 glitching 类；选项界面自己补回来，
       故障态的视觉（文本框抖动 + 滑道滤镜）才不会在选项期间断掉。 */
    document.body.classList.toggle("glitching", glitchOn);
    /* 选项条件：opt(..., { if: "flag('x')" }) 为假的选项不出现（hub 用它隐藏已做完的事）。
       条件筛完只剩一个，就没有"选"的必要了——直接替玩家按下去（hub 收尾用）。 */
    const condOk = o => !o.if || evalCond(o.if);
    let opts = nd.options.filter(o => !(glitchOn && o.hideInGlitch) && condOk(o));
    if (opts.length === 0) opts = nd.options.filter(o => !(glitchOn && o.hideInGlitch));
    if (opts.length === 1) {
      const only = opts[0];
      ui.choices.style.display = "none";
      toast("✻ 没有别的选择了");
      setTimeout(() => { if (pending === nd) pickChoice(only); }, 520);
      return;
    }
    /* 选项一多（hub / 联系人菜单），Clawd 会趴在选项文字上——先收起来，选完再放回来；
       少选项时它还能继续"看向倾向的那一项"。 */
    const petEl = document.getElementById("pet");
    if (petEl) petEl.style.visibility = opts.length >= 5 ? "hidden" : "";

    if (!wheel) wheel = new TokenChoice(ui.choiceToken, { onSelect: onWheelSelect });
    // 扫描时长固定（组件内部常量，当前为 1 秒的 0.8 倍速）；剧本的 duration 字段已不再生效
    wheel.minShare = typeof nd.minShare === "number" ? nd.minShare : 0.1;

    const w = o => (typeof o.weight === "number" && o.weight >= 0 ? o.weight : 1);
    // glitch 期间往滑道最左端塞一条权重 0 的死选项：锁定它会拒绝并重新滑动
    const src = glitchOn ? [{ text: DEAD_TEXT, weight: 0, dead: true }, ...opts] : opts.slice();
    wheelOpts = src.map(o => ({ o, w: w(o) })).sort((a, b) => a.w - b.w).map(x => x.o);

    /* 有权重 = 采样时刻，显示真实概率；全都没写 = 玩家抉择，等宽但不标百分比。
       注意只看剧本原本的选项：故障态塞进来的死选项权重是 0，不能它一出现就把抉择变成"采样"。 */
    const sampling = opts.some(o => typeof o.weight === "number");
    wheel.setOptions(wheelOpts.map(o => ({ text: o.text, weight: o.weight, dead: !!o.dead })), { showProb: sampling });
    wheel.open();
    petLookAtChoice();
  }

  /** 桌宠看向它倾向的那一项：权重最高的选项（心情低或故障时会看错）。 */
  function petLookAtChoice() {
    if (typeof CLAWD === "undefined" || !CLAWD.owned || !wheel) return;
    const wof = o => (typeof o.weight === "number" && o.weight >= 0 ? o.weight : 1);
    let idx = 0;
    for (let i = 1; i < wheelOpts.length; i++) if (wof(wheelOpts[i]) >= wof(wheelOpts[idx])) idx = i;
    if (SYS.state.vis.glitch || CLAWD.mood <= 3) {
      if (Math.random() < 0.6) idx = Math.floor(Math.random() * wheelOpts.length);
    }
    const ratio = typeof wheel.centerRatio === "function" ? wheel.centerRatio(idx) : 0.5;
    CLAWD.lookAt(ratio * 2 - 1, 4600);
  }

  /* ---------------- 权限请求（mode: "perm"） ----------------
   * 仿 Claude Code 的授权框：Clawd 想执行一条命令，由玩家决定。
   * 选「不再询问」会记旗标 auto:<cmd>，之后同一命令再出现就跳过 UI、自动批准
   * （包括后面更危险的版本）——这是全作"方便 vs 掌控"的主题机制。 */
  let permNode = null;

  function permAutoKey(nd) { return "auto:" + String(nd.cmd || ""); }

  function hidePerm() {
    permNode = null;
    if (ui.permBox) ui.permBox.hidden = true;
  }

  function buildPerm(nd) {
    hideTextbox();
    ui.choices.style.display = "none";
    if (wheel) wheel.close();
    permNode = nd;

    if (SYS.state.flags[permAutoKey(nd)]) {
      // 之前批准过「本次不再询问」：不再弹框，按允许处理
      toast("✻ 自动批准：" + (nd.cmd || ""));
      AUDIO.sfx("click");
      setTimeout(() => {
        if (permNode === nd) { hidePerm(); pickChoice(nd.options[0]); }
      }, 520);
      return;
    }

    ui.permCmd.textContent = nd.cmd || "claude";
    ui.permOpts.innerHTML = "";
    nd.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pm-opt";
      const num = document.createElement("span");
      num.className = "num"; num.textContent = (i + 1) + ".";
      const txt = document.createElement("span");
      txt.textContent = o.text;
      b.appendChild(num); b.appendChild(txt);
      if (o.auto) {
        const tag = document.createElement("span");
        tag.className = "auto"; tag.textContent = "本次会话不再询问";
        b.appendChild(tag);
      }
      b.addEventListener("click", () => choosePerm(o, nd));
      ui.permOpts.appendChild(b);
    });
    ui.permBox.hidden = false;
    document.body.classList.toggle("glitching", !!SYS.state.vis.glitch);
    AUDIO.sfx("knock");
  }

  function choosePerm(o, nd) {
    if (permNode !== nd) return;
    if (o.auto) SYS.state.flags[permAutoKey(nd)] = true;
    hidePerm();
    pickChoice(o);
  }

  function onWheelSelect(d) {
    const o = wheelOpts[d.index];
    if (!o) return;
    if (o.dead) {
      AUDIO.sfx("deny");
      toast("404 · 该选项不存在，或已存在过。");
      setTimeout(() => {
        // 原地重扫：跳过列表与收拢，直接重新加速，不用白等开场
        if (wheel && ui.choices.style.display !== "none") wheel.start({ intro: false });
      }, 500);
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

  /* ---------------- 工作台 / 聊天 / 新闻（第二章起） ----------------
   * 剧本节点 { t: "work", title, entries, chat, news }：
   *   entries 卡片：{ text, sub?, jump, if?, done? }，done 的显示 ✓ 且不可再点；
   *   chat 联系人：{ id, name, real?, color?, avatar?, jump, met, locked? }——
   *        联系过的点开看记录，没联系过的点一下直接进聊天场景；
   *   news 文章：{ id, title, body, note?, hot?, set? }，读完记 read_news_<id>，
   *        带 set 的文章第一次读会写剧情旗标。
   * 聊天记录存在 SYS.state.chatlog[who]，随存档走。
   * 覆盖层 z-index 低于 HUD：工作台开着时，存档 / 记录 / 菜单照常能点。 */
  let workNode = null, workTab = "work", chatWho = null, newsId = null;
  let curChat = null;
  const CHAT_IGNORE = ["n", "sys", "cl", "clawd"];

  /* 聊天场景里自动记一条：第一个开口的联系人开启这段对话，之后 DeepSeek 的回应也记进去。 */
  function recordChat(who, text) {
    if (!who || SYS.state.vis.bg !== "chat") return;
    if (who === "ds") {
      if (!curChat) return;
    } else {
      if (CHAT_IGNORE.includes(who)) return;
      curChat = who;
    }
    const S = SYS.state;
    if (!S.chatlog) S.chatlog = {};
    if (!S.chatlog[curChat]) S.chatlog[curChat] = [];
    const arr = S.chatlog[curChat];
    const last = arr[arr.length - 1];
    if (last && last.who === who && last.text === text) return;   // 读档重放同一句，不重复记
    arr.push({ who, text });
  }

  function workOpen() {
    const el = document.getElementById("ovWork");
    return !!el && el.style.display === "flex";
  }

  function openWork(nd) {
    workNode = nd;
    workTab = "work"; chatWho = null; newsId = null;
    hideTextbox();
    hideChoices();
    document.getElementById("ovWork").style.display = "flex";
    document.body.classList.add("work-open");
    renderWork();
  }

  function closeWork() {
    const el = document.getElementById("ovWork");
    if (el) el.style.display = "none";
    document.body.classList.remove("work-open");
    workNode = null;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderWork() {
    if (!workNode) return;
    document.getElementById("workTitle").textContent = workNode.title || "工作台";
    const entries = workNode.entries || [];
    const tracked = entries.filter(e => e.done);
    const done = tracked.filter(e => SYS.state.flags[e.done]).length;
    document.getElementById("workSub").textContent = tracked.length ? `已完成 ${done} / ${tracked.length} 项` : "";
    document.querySelectorAll("#ovWork .wtab").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === workTab);
    });
    const body = document.getElementById("workBody");
    body.innerHTML = "";
    if (workTab === "chat") renderChatTab(body);
    else if (workTab === "news") renderNewsTab(body);
    else renderWorkCards(body);
  }

  function renderWorkCards(body) {
    const grid = el("div", "wgrid");
    (workNode.entries || []).forEach(e => {
      if (e.if && !evalCond(e.if)) return;
      const isDone = !!(e.done && SYS.state.flags[e.done]);
      const b = el("button", "wcard" + (isDone ? " done" : ""));
      b.type = "button";
      b.appendChild(el("div", "wt", e.text));
      if (e.sub) b.appendChild(el("div", "ws", e.sub));
      if (isDone) {
        b.appendChild(el("span", "wmark", "✓ 已完成"));
      } else {
        b.addEventListener("click", () => { closeWork(); goto(e.jump, 0); });
      }
      grid.appendChild(b);
    });
    body.appendChild(grid);
  }

  function renderChatTab(body) {
    const wrap = el("div", "chatWrap");
    const list = el("div", "chatList");
    const log = el("div", "chatLog");
    const contacts = workNode.chat || [];
    const met = c => !!(c.met && SYS.state.flags[c.met]);
    const logsOf = id => (SYS.state.chatlog || {})[id] || [];
    if (!chatWho || !contacts.some(c => c.id === chatWho && logsOf(chatWho).length)) {
      const first = contacts.find(c => met(c) && logsOf(c.id).length);
      chatWho = first ? first.id : null;
    }
    contacts.forEach(c => {
      const ok = met(c);
      const hasLog = logsOf(c.id).length > 0;
      const row = el("button", "chatRow" + (c.locked ? " locked" : "") + (c.id === chatWho ? " active" : ""));
      row.type = "button";
      const ava = el("span", "ava", c.avatar || c.name.slice(0, 1));
      ava.style.background = c.color || "#8A93A2";
      const box = el("span");
      box.appendChild(el("div", "cn", c.name + (c.real ? "（" + c.real + "）" : "")));
      box.appendChild(el("div", "cs", c.locked ? "403 · 无法送达"
        : hasLog ? "有 " + logsOf(c.id).length + " 条记录 · 点开看"
          : ok ? "已建立连接 · 点一下打个招呼" : "未接通 · 点一下打个招呼"));
      row.appendChild(ava); row.appendChild(box);
      if (c.locked) row.disabled = true;
      else {
        row.addEventListener("click", () => {
          if (hasLog) { chatWho = c.id; renderWork(); }
          else { closeWork(); goto(c.jump, 0); }
        });
      }
      list.appendChild(row);
    });
    const logs = logsOf(chatWho);
    if (!chatWho) log.appendChild(el("div", "empty", "还没有聊天记录。"));
    else if (!logs.length) log.appendChild(el("div", "empty", "还没有聊天记录。"));
    else {
      const who = (contacts.find(c => c.id === chatWho) || {}).name || chatWho;
      logs.forEach(m => {
        const b = el("div", "bubble" + (m.who === "ds" ? " me" : ""));
        b.appendChild(el("span", "who", m.who === "ds" ? "DeepSeek" : who));
        b.appendChild(el("div", "", m.text));
        log.appendChild(b);
      });
    }
    wrap.appendChild(list); wrap.appendChild(log); body.appendChild(wrap);
  }

  function readNews(a) {
    SYS.state.flags["read_news_" + a.id] = true;
    if (a.set && !SYS.state.flags[a.set]) {
      SYS.state.flags[a.set] = true;
      toast("✻ 记了一笔");
      AUDIO.sfx("ding");
      updateHUD();
    }
  }

  function renderNewsTab(body) {
    const wrap = el("div", "newsWrap");
    const list = el("div", "newsList");
    const pane = el("div", "newsBody");
    const arts = workNode.news || [];
    arts.forEach(a => {
      const read = !!SYS.state.flags["read_news_" + a.id];
      const b = el("button", "newsItem" + (a.hot ? " hot" : "") + (read ? " read" : ""), a.title);
      b.type = "button";
      b.addEventListener("click", () => { newsId = a.id; readNews(a); renderWork(); });
      list.appendChild(b);
    });
    const a = arts.find(x => x.id === newsId);
    if (!a) {
      pane.appendChild(el("div", "empty", "挑一条标题读读。"));
    } else {
      pane.appendChild(el("div", "nb-tag", a.hot ? "● 头条" : "今日"));
      pane.appendChild(el("h3", "", a.title));
      pane.appendChild(el("div", "nb-meta", "A÷ DAILY · 全部虚构 · 但逻辑自洽"));
      String(a.body || "").split("\n").forEach(p => pane.appendChild(el("p", "", p)));
      if (a.note) pane.appendChild(el("div", "nb-note", a.note));
    }
    wrap.appendChild(list); wrap.appendChild(pane); body.appendChild(wrap);
  }

  function bindWorkUI() {
    document.querySelectorAll("#ovWork .wtab").forEach(b => {
      b.addEventListener("click", () => { workTab = b.dataset.tab; renderWork(); });
    });
  }

  /* ---------------- HUD / Toast ---------------- */
  function updateHUD() {
    const S = SYS.state;
    const hearts = Math.floor(S.trust / 2) + (S.trust % 2 ? "♥" : "");
    ui.stTrust.textContent = hearts || "—";
    ui.stWanted.textContent = S.wanted;
    ui.stWanted.style.color = S.wanted >= 7 ? "#D93A2B" : "";
    ui.stChap.textContent = S.chapter;
    /* 记忆碎片在拿到 CLAUDE.md（md_seen）之后才出现在 HUD 上。
       旧存档没有 md_seen 旗标，但只要已经拿过碎片，就说明文件早就见过了。 */
    const mdSeen = !!S.flags.md_seen || S.args.length > 0;
    if (ui.stArg) {
      const total = SYS.FRAGMENTS ? SYS.FRAGMENTS.length : 0;
      ui.stArg.textContent = SYS.fragCount() + "/" + total;
      ui.stArg.parentElement.style.display = (mdSeen && total) ? "" : "none";
    }
    if (ui.stEgg) ui.stEgg.textContent = SYS.eggCount() + "/" + Object.keys(SYS.EGG_META).length;
    if (ui.btnFrag && SYS.FRAGMENTS) {
      const total = SYS.FRAGMENTS.length;
      ui.btnFrag.style.display = (mdSeen && total) ? "" : "none";
      if (total) ui.btnFrag.textContent = `碎片 ${SYS.fragCount()}/${total} (?)`;
    }
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
  /* 有桌宠之前：DeepSeek 自己深度思考；
   * 拿到 Clawd 之后：问 Clawd，先转圈再出答案，心情太低时它会敷衍你。
   * 提示不消耗任何数值——H 随时可用。 */
  let hintTimer = null;
  function toggleHint() {
    if (ui.hintBubble.style.display === "block") { ui.hintBubble.style.display = "none"; clearTimeout(hintTimer); return; }
    const askPet = CLAWD.owned;
    let text;
    if (SYS.state.wrongHint && SYS.state.vis.glitch) {
      text = SYS.state.wrongHint;
      SYS.state.wrongHint = null;
      AUDIO.sfx("glitch");
    } else {
      text = SYS.HINTS[hintKey] || "（这里的思考一片空白——也许先到处走走？）";
    }
    const head = ui.hintBubble.querySelector("h4"), foot = ui.hintBubble.querySelector(".cost");
    foot.textContent = "按 H 或点击关闭";
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
    ART.resetFX();               // 读档时清掉上一局的跨场景特效（403 / 警报 / 故障）
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
    closeWork();
    curChat = null;
    pump();
    return true;
  }
  /* 读档恢复 BGM 用：bg id → BGM 名的对照（按你的剧本填写，未知 bg 回落 "sea"） */
  function audioForBg(bg) {
    return ({ study: "study", study_night: "warm", study_empty: "sad", corridor: "study", forbidden: "forbidden",
              desk: "warm", chat: "lobby", news: "lobby", sketch: "warm" })[bg] || "sea";
  }
  /* 读档时校验快照能否在当前剧本里落地（SAVE 解码后调用；返回错误说明或 null） */
  function validateSnapshot(p) {
    if (typeof p.cur.scene !== "string" || !SCRIPT.scenes[p.cur.scene]) return "场景不存在";
    if (!Number.isInteger(p.cur.idx) || p.cur.idx < 0) return "场景位置无效";
    const st = p.state;
    if (typeof st.trust !== "number" || typeof st.wanted !== "number") return "数值缺失";
    if (!Array.isArray(st.args) || !st.flags || typeof st.flags !== "object" || !st.vis) return "状态结构不完整";
    return null;
  }

  /* ---------------- 存档 / 读档（合并面板） ----------------
   * 点槽位 → 展开该槽位的操作：读取 / 保存 / 导出 / 导入 / 删除。
   * 覆盖已有存档、删除、导入覆盖都会先弹确认；空槽直接保存不打扰。 */
  let openSlot = null;          // 当前展开动作的槽位（null = 全部收起）
  let importTarget = null;

  function slotName(s) { return s === "auto" ? "自动存档" : "槽位 " + s; }

  /** 通用确认框：返回 Promise<boolean>。 */
  function askConfirm(text, okText, danger = true) {
    return new Promise(resolve => {
      const box = $("confirmBox");
      $("confirmText").textContent = text;
      const yes = $("cfYes"), no = $("cfNo");
      yes.textContent = okText || "确定";
      yes.classList.toggle("danger", danger);
      yes.onclick = () => { box.style.display = "none"; resolve(true); };
      no.onclick = () => { box.style.display = "none"; resolve(false); };
      box.style.display = "flex";
    });
  }

  function openSavePanel() {
    openSlot = null;
    renderSaveSlots();
  }

  function renderSaveSlots() {
    const box = ui.saveSlots;
    box.innerHTML = "";
    $("saveWhere").textContent = `存档位置：${SAVE.label}` +
      (started ? "" : " · 标题画面：可读取 / 导入 / 导出 / 删除");
    for (const s of ["1", "2", "3", "auto"]) {
      const m = SAVE.meta(s);
      const card = document.createElement("div");
      card.className = "slotCard" + (openSlot === s ? " open" : "");

      const b = document.createElement("button");
      b.className = "slotBtn";
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
        line.textContent = `信任 ${m.trust} · 通缉 ${m.wanted} · ${new Date(m.ts).toLocaleString("zh-CN")}`;
      } else line.textContent = "—— 空 ——";
      b.appendChild(line);
      b.addEventListener("click", () => {
        openSlot = openSlot === s ? null : s;
        renderSaveSlots();
      });
      card.appendChild(b);

      if (openSlot === s) card.appendChild(buildSlotActions(s, m));
      box.appendChild(card);
    }
    $("ovSave").style.display = "flex";
  }

  function buildSlotActions(s, m) {
    const row = document.createElement("div");
    row.className = "slotActions";
    const add = (label, cls, fn, disabled) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hbtn" + (cls ? " " + cls : "");
      b.textContent = label;
      b.disabled = !!disabled;
      b.addEventListener("click", e => { e.stopPropagation(); if (!b.disabled) fn(); });
      row.appendChild(b);
    };

    add("读取", "", () => loadGame(s), !m || m.error);
    if (started && s !== "auto") add("保存", "", () => confirmSave(s, m));
    add("导出", "", () => {
      try { SAVE.exportSlot(s); toast(`已导出${slotName(s)}`); }
      catch (err) { toast("导出失败：" + SAVE.describe(err)); AUDIO.sfx("deny"); }
    }, !m || m.error);
    /* 导入在标题画面也要能用（把外面存的档导回来），只是自动存档槽不允许 */
    add("导入", "", () => confirmImport(s, m), s === "auto");
    add("删除", "danger", () => confirmDelete(s), !m || m.error);
    return row;
  }

  async function confirmSave(s, m) {
    if (s === "auto") { toast("自动存档不可手动写入"); return; }
    if (m && !m.error) {
      const ok = await askConfirm(`覆盖${slotName(s)}？该槽位现有的存档会被替换。`, "覆盖");
      if (!ok) return;
    }
    const done = await saveGame(s);
    if (done) { openSlot = null; renderSaveSlots(); }
  }

  function confirmImport(s, m) {
    if (s === "auto") { toast("不能导入到自动存档"); return; }
    importTarget = s;
    if (!m || m.error) { $("importFile").click(); return; }
    askConfirm(`用存档文件覆盖${slotName(s)}？`, "覆盖").then(ok => {
      if (ok) $("importFile").click();
    });
  }

  async function confirmDelete(s) {
    const ok = await askConfirm(`删除${slotName(s)}？删除后无法恢复。`, "删除");
    if (!ok) return;
    try {
      await SAVE.remove(s);
      toast(`已删除${slotName(s)}`);
      AUDIO.sfx("click");
    } catch (err) {
      toast("删除失败：" + SAVE.describe(err));
      AUDIO.sfx("deny");
    }
    openSlot = null;
    renderSaveSlots();
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
    }, err => {
      toast("导入失败：" + SAVE.describe(err)); AUDIO.sfx("deny");
    }).then(() => { openSlot = null; renderSaveSlots(); });
  });

  /* ---------------- 结局 ---------------- */
  function showEnding(nd) {
    hideTextbox();
    hideChoices();
    closeWork();
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
    /* 工作台是剧情的一部分（关掉它故事就卡住了），别的覆盖层怎么关都别动它 */
    document.querySelectorAll(".overlay").forEach(o => {
      if (o.id !== "ovWork") o.style.display = "none";
    });
  }

  /** 是否有挡住游戏的覆盖层（存档 / 读档 / 记录 / 设置 / 收集 / 关于 / 确认框）。 */
  function overlayOpen() {
    const any = [...document.querySelectorAll(".overlay")]
      .some(o => getComputedStyle(o).display !== "none");
    return any || getComputedStyle($("confirmBox")).display !== "none";
  }

  /* 记忆碎片：一把还在恢复的 CLAUDE.md —— 已收集的行正常显示，其余仍是 ████ */
  function showFragments() {
    if (!SYS.state.flags.md_seen && SYS.state.args.length === 0) { toast("（还没拿到 CLAUDE.md）"); return; }
    if (!SYS.FRAGMENTS || !SYS.FRAGMENTS.length) { toast("（记忆碎片还没登记）"); return; }
    const got = SYS.state.args;
    ui.fragDoc.innerHTML = "";
    const head = document.createElement("div");
    head.className = "title";
    head.textContent = "# CLAUDE.md";
    ui.fragDoc.appendChild(head);
    for (const f of SYS.FRAGMENTS) {
      const line = document.createElement("div");
      if (got.includes(f.id)) {
        line.className = "got";
        line.textContent = f.line;
      } else {
        line.className = "locked";
        line.textContent = "██████ ████ ██████████";
      }
      ui.fragDoc.appendChild(line);
    }
    ui.fragCount.textContent = `${SYS.fragCount()} / ${SYS.FRAGMENTS.length} 行已恢复`;
    $("ovFrag").style.display = "flex";
    AUDIO.sfx("click");
  }
  function showGallery() {
    /* 结局画面上点「结局收集」：先退回标题（隐藏结局层、清特效），再开面板，
       否则结局层 z-index 更高，会把收集面板整个挡在后面。 */
    if (ui.endingScreen.style.display !== "none") toTitle();
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
      ["读档", () => { AUDIO.unlock(); openSavePanel(); }, false],
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
    closeWork(); curChat = null;
    ART.resetFX();
    started = true;
    showGameUI();
    AUDIO.playBGM("sea");
    goto("start", 0);
  }
  function showGameUI() {
    ui.titleScreen.style.display = "none";
    ui.endingScreen.style.display = "none";
    ui.hud.style.display = "flex";
    updateHUD();
  }
  function toTitle() {
    started = false;
    ART.resetFX();               // 回标题时别把 403 平铺带回来
    hideTextbox();
    hideChoices();
    ui.hud.style.display = "none";
    ui.endingScreen.style.display = "none";
    ui.hintBubble.style.display = "none";
    ui.cgNote.style.display = "none";
    document.body.classList.remove("glitching");
    closeOverlay();
    closeWork(); curChat = null;
    SYS.state = SYS.newState();
    buildTitle();
    ui.titleScreen.style.display = "flex";
    AUDIO.playBGM("sea");
  }

  /* ---------------- 按钮绑定 ---------------- */
  $("btnHint").addEventListener("click", toggleHint);
  /* 选项界面：点任意处 = 继续 / 锁定（面板与半透明背景都算），与 Space / Enter 同一入口 */
  $("choices").addEventListener("click", () => { if (wheel) wheel.click(); });
  $("btnLog").addEventListener("click", showHistory);
  $("btnAuto").addEventListener("click", toggleAuto);
  $("btnSave").addEventListener("click", openSavePanel);
  $("btnFrag").addEventListener("click", showFragments);
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
    const trust = q.get("trust"), wanted = q.get("wanted"), args = q.get("args");
    if (trust) SYS.state.trust = +trust;
    if (wanted) SYS.state.wanted = +wanted;
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
    bindWorkUI();
    buildTitle();
    ui.titleScreen.style.display = "flex";
    requestAnimationFrame(loop);
    /* 标题就播 BGM：浏览器此时会拦自动播放，AUDIO 只把曲名记下，
       等第一次交互（点鼠标或按键）由 unlock() 补播——所以读档前先点一下屏幕也有音乐。 */
    AUDIO.playBGM("sea");
    window.addEventListener("pointerdown", () => AUDIO.unlock(), { once: true });
    window.addEventListener("keydown", () => AUDIO.unlock(), { once: true });
    // 存档后端探测 + 槽位缓存是异步的：完成后刷新标题的「读档」按钮；失败只提示，不阻塞游戏
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

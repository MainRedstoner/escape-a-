/* ============================================================
 * Escape A÷ · engine.js —— 视觉小说引擎
 * 打字机 / 选项 / 立绘调度 / 存读档 / 历史 / 自动播放 / 深度思考提示
 * ============================================================ */
"use strict";

const ENGINE = (() => {
  const $ = id => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
  /* 画布后备存储对齐到真实设备像素。
   * 舞台上所有绘制都用 1600×900 的逻辑坐标，这里按 gain 放大后备存储再上一个
   * 整体 scale —— 代码一行不用改，文字和 UI 直接变清晰（手机上原来是 1600 的位图
   * 被拉到 1667 设备像素，天生发虚）。
   * 只放大不缩小：gain < 1 的场景留给 3D 层的画质档去省，2D 这边缩了就只剩糊。 */
  const BASE_W = 1600, BASE_H = 900;
  let canvasGain = 1;
  function sizeCanvas() {
    let s = 1;
    try { s = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H); } catch (e) {}
    const dpr = window.devicePixelRatio || 1;
    // 舞台 CSS 宽 = 1600·s，设备像素 = 1600·s·dpr → 后备存储要 1600·(s·dpr) 才 1:1
    // 上限 1.5 倍：再往上内存和填充都涨得太快，肉眼也快分不出来了
    const gain = Math.max(1, Math.min(1.5, s * dpr));
    if (Math.abs(gain - canvasGain) < 0.01 && cv.width) return;
    canvasGain = gain;
    cv.width = Math.round(BASE_W * gain);
    cv.height = Math.round(BASE_H * gain);
    ctx.setTransform(gain, 0, 0, gain, 0, 0);
    /* 告诉绘制层：主画布后备存储现在是 1600×900 的多少倍。
     * 它会据此把 3D 离屏层开到同样大小，并且允许 3D 渲染倍率超过 1——
     * 1080p 全屏时 3D 也画 1920×1080，背景才和文字一样实。 */
    if (typeof ART !== "undefined" && ART.setFrameScale) ART.setFrameScale(gain);
  }
  const ui = {
    hud: $("hud"), stTrust: $("stTrust"), stWanted: $("stWanted"),
    stArg: $("stArg"), stEgg: $("stEgg"),
    textbox: $("textbox"), nameplate: $("nameplate"), text: $("text"), nextArrow: $("nextArrow"),
    choices: $("choices"), choicePrompt: $("choicePrompt"),
    choiceToken: $("choiceToken"),
    permBox: $("ovPerm"), permCmd: $("ovPerm") ? $("ovPerm").querySelector(".pm-cmd") : null,
    permOpts: $("ovPerm") ? $("ovPerm").querySelector(".pm-opts") : null,
    fragDoc: $("fragDoc"), fragCount: $("fragCount"), btnFrag: $("btnFrag"),
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

  /* ---------------- 性能面板（index.html?perf=1） ----------------
   * 弱机上调档 / 报数字用：能看出到底是"整帧贵"还是"3D 那一层贵"。
   * 数字含义：帧 = 相邻两帧的间隔（受显示器刷新率和掉帧共同影响）；
   * paint = 本帧 2D 合成 + 3D 提交 + 立绘 + 后期的总耗时；
   * 3D提交 = 上一次真正渲染 3D 场景的 CPU 时间（GPU 是异步的，不等于 GPU 时间）。 */
  let perfEl = null, perfLastT = 0, perfAccT = 0, perfGapN = 0, perfTick = 0;
  const perfGaps = [];
  function buildPerfHud() {
    if (perfEl) return;
    perfEl = document.createElement("div");
    perfEl.id = "perfHud";
    /* 固定定位、挂在 body 上而不是 #stage 里：#stage 会按窗口缩放（手机上可能只剩 0.5 倍），
     * 面板跟着缩就彻底看不清了。挂在 body 上才是真实像素尺寸。
     * 放顶部居中：左下角会被文本框和桌宠挡住。 */
    perfEl.style.cssText =
      "position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9999;pointer-events:none;" +
      "background:rgba(4,7,11,.88);border:1px solid #2C3542;border-radius:4px;" +
      "color:#C9D2DE;font:13px/1.45 'Cascadia Mono','Consolas',monospace;" +
      "padding:8px 11px;white-space:pre;";
    document.body.appendChild(perfEl);
    window.__perf = { gaps: perfGaps, snapshot: () => (perfEl ? perfEl.textContent : "") };
    perfLastT = performance.now();
  }
  function updatePerf(now) {
    if (!perfEl) return;
    const gap = now - perfLastT;
    perfLastT = now;
    if (gap > 0 && gap < 500) {
      perfAccT += gap; perfGapN++;
      perfGaps.push(Math.round(gap * 10) / 10);
      if (perfGaps.length > 180) perfGaps.shift();
    }
    if (now - perfTick < 250) return;
    perfTick = now;
    const avg = perfGapN ? perfAccT / perfGapN : 0;
    perfAccT = 0; perfGapN = 0;
    const st = (typeof A3D !== "undefined" && A3D.stats) ? A3D.stats() : { draws: 0, verts: 0 };
    const tier = (typeof ART !== "undefined" && ART.getTier) ? ART.getTier() : 0;
    const hz = (typeof ART !== "undefined" && ART.hz3d) ? ART.hz3d : 0;
    const paintMs = (typeof ART !== "undefined" && ART.lastCostMs) ? ART.lastCostMs : 0;
    const d3 = (typeof A3D !== "undefined" && A3D.lastDrawMs) ? A3D.lastDrawMs : 0;
    perfEl.textContent =
      "帧 " + (avg ? Math.round(1000 / avg) + "fps / " + avg.toFixed(1) + "ms" : "—") + "\n" +
      "paint " + paintMs.toFixed(1) + "ms   3D提交 " + d3.toFixed(1) + "ms\n" +
      "档 " + Q_NAMES[tier] + (ART && ART.autoTier ? "（自动）" : "") +
        "   缩放 " + (A3D && A3D.renderScale ? A3D.renderScale.toFixed(2) : "-") +
        "   3D " + (hz ? hz + "Hz" : "每帧") + "\n" +
      "批次 " + st.draws + "   顶点 " + Math.round(st.verts / 1000) + "k" +
        "   画布 " + canvasGain.toFixed(2) + "x" +
        (st.shadow ? "   阴影 " + st.shadow + "/" + st.taps : "");
  }

  /* ---------------- 主循环 ----------------
   * rAF 在后台标签页会被浏览器节流，加一个低频 interval 兜底：
   * rAF 正常时全速渲染；rAF 停滞超过 400ms 才由 interval 补帧。
   * 标签页不可见时两边都别画——那个兜底 interval 本来是为了"rAF 被节流"
   * 这种前台场景，躲在后台还每秒画 5 帧纯属白烧电。 */
  let lastFrameT = -1e9;
  function frame(now) {
    lastFrameT = now;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (document.hidden) return;
    updatePerf(now);
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
  // 回前台立刻重画一帧，别等 rAF 自然跟上（切回来时画面还停在旧状态会闪一下）
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) frame(performance.now());
  });

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
    /* 工作台终端开着时：Enter 发送、Esc 收起表单、数字键选工具；其它按键不传 */
    if (workOpen()) {
      const other = [...document.querySelectorAll(".overlay")]
        .some(o => o.id !== "ovWork" && getComputedStyle(o).display !== "none");
      if (!other) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (termDraft && termDraft.tool) sendToolCall();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (termDraft) { closeForm(); renderTerminal(); }
          return;
        }
        if (termDraft && !termDraft.tool) {
          const i = "123456789".indexOf(e.key);
          const btns = document.querySelectorAll("#termPicker .termtool");
          if (i >= 0 && i < btns.length) { e.preventDefault(); btns[i].click(); return; }
        }
        if (e.key === "h" || e.key === "H") { e.preventDefault(); toggleHint(); return; }
        return;
      }
    }
    /* 覆盖层打开时，键盘只用来关它：Space / Enter 不能顺手把对话推进一步 */
    if (overlayOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (getComputedStyle($("confirmBox")).display !== "none") $("cfNo").click();
        else closeOverlay();
      }
      return;
    }
    /* 聊天界面：候选词用数字键选（DeepSeek 的单句候选也一样） */
    if (chatActive() && chatOpts.length) {
      const i = "123456789".indexOf(e.key);
      if (i >= 0 && i < chatOpts.length) {
        e.preventDefault();
        const o = chatOpts[i];
        if (o && o.draft !== undefined) sendChatDraft(o.draft);
        else pickChatChoice(o);
        return;
      }
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
    sizeCanvas();   // 屏幕尺寸 / DPR 变了就重算画布后备存储
  }
  window.addEventListener("resize", fit);

  /* ---------------- 安全条件解析器 ----------------
   * 纯字符扫描（不使用正则、不使用动态求值）。
   * 支持: trust/wanted/args/eggs/mood/chats/newsread 数值, has('id')/egg('k')/flag('k'),
   *       true/false, 数字, '字符串', >= <= > < == != && || ! ( )
   * -------------------------------------------------- */
  function evalCond(src) {
    let pos = 0;
    const s = String(src);
    const S = SYS.state;
    const log = S.chatlog || {};
    const paused = S.chatResume || {};
    const VAR = { trust: S.trust, wanted: S.wanted, args: S.args.length, eggs: SYS.eggCount(),
                  mood: S.pet ? S.pet.mood : 5,
                  chats: Object.keys(log).filter(k => (log[k] || []).length && !paused[k]).length,
                  newsread: Object.keys(S.flags || {}).filter(k => k.startsWith("read_news_")).length };

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
    chatDraft = null;              // 换场景了，别让上一句待发的台词卡住推进
    clearChatTyping();
    clearTimeout(chatAutoTimer);
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
        if (nd.id !== "chat") { curChat = null; closeChatScreen(); }   // 离开聊天窗口，收起聊天界面
        SYS.state.vis.bg = nd.id;
        AUDIO.ambience(nd.id);          // 背景 = 场景，也是环境音的开关
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
      case "checkpoint":
        /* 剧情分段点：不弹任何界面，只静默写一次自动档。 */
        saveGame("auto", true);
        return false;
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
      case "waitChat": openChatWait(nd); return true;
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
    /* 聊天模式：DeepSeek 的话先出候选词（只有一个也出），点了才发；
       联系人的话直接冒气泡；旁白仍然走底部对话框，等玩家点。 */
    if (chatActive()) {
      ensureChatOpen();
      syncChatFromLog();
      inferChatContact();
      if (who === "ds") { presentChatDraft(text); return; }
      if (who === "clawd") {
        /* Clawd 的通知是系统消息，不要塞进某人的聊天记录里 */
        toast(text);
        clearTimeout(chatAutoTimer);
        chatAutoTimer = setTimeout(autoAdvanceChat, 900);
        return;
      }
      if (who !== "n" && who !== "sys") { chatSay(who, text); return; }
      /* 旁白不记聊天记录，继续走底部对话框 */
    } else {
      recordChat(who, text);
    }
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
    /* 聊天模式的旁白停在对话框，等玩家点；不自动往下走 */
    if (!chatActive() && autoMode && pending && pending.t === "say") {
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
    if (chatTyping) return;      // 对面还在输入：等它冒出来
    if (chatDraft) return;       // DeepSeek 的台词等玩家从候选词里选，不能顺手跳过
    if (pending.t !== "say") return;
    clearTimeout(chatAutoTimer);
    hideTextbox();
    document.body.classList.remove("glitching");
    const cn = document.getElementById("chatNext");
    if (cn) cn.style.display = "none";
    pending = null;
    pump();
  }

  function onMainClick() {
    if (!started) return;
    if (overlayOpen()) return;
    if (chatTyping) { finishChatTyping(); return; }   // 点一下催对方
    if (typing) { finishType(); return; }
    if (pending && pending.t === "say") advance();
  }
  ui.textbox.addEventListener("click", onMainClick);

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
    if (chatActive()) { buildChatChoices(nd); return; }
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

  /* ---------------- 工作台（终端）/ 聊天 / 新闻 / 贴吧（第二章起） ----------------
   * 剧本节点 { t: "work", title, tools, continue, chatExit, chat, news, forum }：
   *   tools: { id, emoji, name, jump?, action?: "chat"|"news"|"forum",
   *            inline?: { out, set, arg }, args?, need?, if? }
   *     - jump 工具点「发送」直接进场景；action 打开对应界面；
   *     - inline 工具在终端里直接跑（扫缓存），把 out 打到终端并写 set / arg；
   *     - need 是 continue 的解锁条件：所有 need 都满足才能离开工作台；
   *   continue: { jump } —— 确认「部分内容可能无法再次查看」后离开工作台；
   *   chatExit: "场景" —— 聊天头部「结束对话」按钮的去向（追问选项全空时也走这里）；
   *   chat: 联系人 { id, name, real?, color?, avatar?, jump, locked? }
   *   news: 文章 { id, title, body, note?, hot?, set? }
   *   forum: { name, threads, templates } —— 贴吧界面
   * 另有 wait_chat 节点：一段对话结束后停在聊天界面选下一个人（back 是返回场景）。
   * 聊天记录存在 SYS.state.chatlog[who]，随存档走；聊天界面直接铺满屏幕。 */
  let workNode = null;
  let termDraft = null;        // tool call 草稿 { tool, args }
  let termTool = null;         // 选中的工具对象
  let inlineBusy = false;      // 扫缓存这类内联工具正在转圈
  let inlineSpinTimer = null;
  let inlineDoneTimer = null;
  let chatWho = null;
  let chatInScene = false;     // 正在一段对话里：联系人列表先锁住，别让人中途换人
  let chatAutoTimer = null;    // 对方消息冒出来之后，自动往下推的计时器
  let chatTyping = false;      // 对方正在输入：消息还没出现
  let chatTypingTimer = null;
  let chatTypingTick = null;
  let chatTypingNode = null;
  let chatTypingWho = "";
  let chatTypingText = "";
  let chatDraft = null;        // DeepSeek 待发送的台词：先出候选词，玩家点了才发出去
  let chatWaitBack = null;     // 「聊完先留在聊天界面」时的返回场景（null = 回工作台）
  let newsId = null;
  let forumTid = null, forumTpl = null, forumCompose = false;
  const forumTimers = {};      // 贴吧回复 / 封号的计时器（切页面不中断）
  let curChat = null;
  let chatOpts = [];
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

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function chattedCount() {
    const log = SYS.state.chatlog || {};
    return Object.keys(log).filter(k => (log[k] || []).length).length;
  }
  function newsReadCount() {
    return Object.keys(SYS.state.flags || {}).filter(k => k.startsWith("read_news_")).length;
  }

  /* ---------------- 工作台终端 ---------------- */
  function workOpen() {
    const elm = document.getElementById("ovWork");
    return !!elm && elm.style.display === "flex";
  }
  function needsMet() {
    return (workNode.tools || []).every(t => !t.need || evalCond(t.need));
  }

  /* 读档落在 waitChat（聊天界面）时，工作台节点不在场景里，按场景 id 找回来 */
  function recoverWork() {
    if (workNode || !SYS.state.workScene) return;
    const nodes = SCRIPT.scenes[SYS.state.workScene] || [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].t === "work") { workNode = nodes[i]; return; }
    }
  }
  function termAppend(cls, text) {
    const log = document.getElementById("termLog");
    const line = el("div", cls || "", text);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    return line;
  }
  function termPrompt(text) { return termAppend("t-p", "❯ " + text); }

  function openWork(nd) {
    if (!Array.isArray(nd.tools)) {   // 旧版本存档里的工作台节点（卡片版）已经认不出来了
      toast("这个工作台版本太旧，先回标题吧");
      toTitle();
      return;
    }
    workNode = nd;
    SYS.state.workScene = cur.scene;
    ui.hintBubble.style.display = "none";
    termDraft = null; termTool = null;
    clearInline();
    chatWho = null; newsId = null;
    chatWaitBack = null; forumTid = null; forumCompose = false;
    hideTextbox();
    hideChoices();
    closeChatScreen();
    closeNewsScreen();
    closeForumScreen();
    document.getElementById("ovWork").style.display = "flex";
    document.body.classList.add("work-open");
    renderTerminal();
  }

  function closeWork() {
    const elm = document.getElementById("ovWork");
    if (elm) elm.style.display = "none";
    document.body.classList.remove("work-open");
    ui.hintBubble.style.display = "none";
    clearInline();
    clearForumTimers();
    workNode = null; termDraft = null; termTool = null;
    chatWaitBack = null;
    closeChatScreen();
    closeNewsScreen();
    closeForumScreen();
  }

  function renderTerminal() {
    if (!workNode) return;
    const log = document.getElementById("termLog");
    log.innerHTML = "";
    termAppend("t-p", "clawd workbench v0.2 — 本机终端（信号很差）");
    termAppend("t-p", "❯ status");
    (workNode.tools || []).forEach(t => {
      const ok = !t.need || evalCond(t.need);
      const mark = t.need ? (ok ? "[✓]" : "[ ]") : "[·]";
      const line = termAppend("", "  " + mark + " " + (t.emoji || "·") + " " + t.name +
        (t.need ? "" : "（可选）"));
      line.dataset.tool = t.id;
    });
    const okAll = needsMet();
    termAppend("t-warn", okAll
      ? "信息已查看完，continue 已解锁。"
      : "还有信息没看：缓存扫过、九个联系人都聊过、九条新闻都读完、帖发过，continue 才会解锁。");
    termAppend("t-p", "  Clawd 趴在终端右下角，尾巴一下一下拍着机箱。");
    termAppend("t-p", "❯ 点「tool call」调用工具。");
    document.getElementById("btnContinue").disabled = !okAll;
    document.getElementById("termHint").textContent = okAll
      ? "确认后离开工作台"
      : "tool call 组 JSON → Enter 发送";
    closeForm();
  }

  function closeForm() {
    const form = document.getElementById("termForm");
    if (form) form.hidden = true;
    termDraft = null; termTool = null;
  }

  function openForm() {
    if (termDraft) return;      // 表单已经开着，别把玩家填的内容重置掉
    termDraft = { tool: null, args: {} };
    termTool = null;
    document.getElementById("termForm").hidden = false;
    termPrompt("tool call");
    renderForm();
  }

  function renderForm() {
    const d = termDraft || { tool: null, args: {} };
    document.getElementById("termJson").textContent =
      JSON.stringify({ tool: d.tool, args: d.args || {} }, null, 2);
    document.getElementById("termSend").disabled = !d.tool;
    const picker = document.getElementById("termPicker");
    picker.innerHTML = "";
    if (d.tool) return;
    (workNode.tools || []).forEach(t => {
      if (t.if && !evalCond(t.if)) return;
      const b = el("button", "termtool", (t.emoji || "·") + " " + t.name);
      b.type = "button";
      if (t.need && evalCond(t.need)) b.appendChild(el("span", "ok", "✓"));
      b.addEventListener("click", () => {
        termTool = t;
        termDraft = { tool: t.id, args: t.args || {} };
        renderForm();
      });
      picker.appendChild(b);
    });
  }

  function sendToolCall() {
    if (!termDraft || !termDraft.tool || !termTool) return;
    const t = termTool;
    termPrompt("tool call → " + JSON.stringify({ tool: termDraft.tool, args: termDraft.args || {} }));
    closeForm();
    executeTool(t);
  }

  function executeTool(t) {
    if (t.action === "chat") { chatWaitBack = null; openChatScreen(); return; }
    if (t.action === "news") { openNewsScreen(); return; }
    if (t.action === "forum") { openForumScreen(); return; }
    if (t.inline) { runInline(t); return; }
    if (t.jump) { closeWork(); goto(t.jump, 0); }
  }

  /* 扫缓存这类工具不切场景，直接在终端里转一会儿圈再出结果 */
  function runInline(t) {
    if (inlineBusy) return;
    const ink = t.inline || {};
    const out = ink.out || [];
    if (out.length) termAppend("t-ok", out[0]);
    const spin = termAppend("t-p", "  扫描中 |");
    const frames = ["|", "/", "-", "\\"];
    let fi = 0;
    inlineBusy = true;
    document.getElementById("btnToolCall").disabled = true;
    document.getElementById("btnContinue").disabled = true;
    document.getElementById("termHint").textContent = "扫描中……先别关终端";
    inlineSpinTimer = setInterval(() => {
      fi = (fi + 1) % frames.length;
      spin.textContent = "  扫描中 " + frames[fi];
    }, 120);
    clearTimeout(inlineDoneTimer);
    inlineDoneTimer = setTimeout(() => {
      clearInterval(inlineSpinTimer); inlineSpinTimer = null;
      inlineDoneTimer = null;
      spin.remove();
      out.slice(1).forEach(line => termAppend("t-ok", line));
      const set = ink.set ? (Array.isArray(ink.set) ? ink.set : [ink.set]) : [];
      set.forEach(k => { SYS.state.flags[k] = true; });
      if (ink.arg && !SYS.state.args.includes(ink.arg)) {
        SYS.state.args.push(ink.arg);
        toast(`📜 获得论据「${(SYS.ARG_META[ink.arg] || { name: ink.arg }).name}」`);
        AUDIO.sfx("ding");
      }
      updateHUD();
      termAppend("t-ok", "✓ " + t.name + " 完成");
      inlineBusy = false;
      document.getElementById("btnToolCall").disabled = false;
      refreshToolMarks();
      refreshWorkFoot();
    }, 2100);
  }

  function clearInline() {
    clearInterval(inlineSpinTimer); inlineSpinTimer = null;
    clearTimeout(inlineDoneTimer); inlineDoneTimer = null;
    inlineBusy = false;
    const b = document.getElementById("btnToolCall");
    if (b) b.disabled = false;
  }

  /* 扫缓存这类原地完成的工具：把上面的状态清单也跟着改掉，不重排终端 */
  function refreshToolMarks() {
    (workNode.tools || []).forEach(t => {
      const line = document.querySelector('#termLog [data-tool="' + t.id + '"]');
      if (!line || !line.firstChild) return;
      const ok = !t.need || evalCond(t.need);
      const mark = t.need ? (ok ? "[✓]" : "[ ]") : "[·]";
      line.firstChild.nodeValue = "  " + mark + " " + (t.emoji || "·") + " " + t.name +
        (t.need ? "" : "（可选）");
    });
  }

  function refreshWorkFoot() {
    const okAll = needsMet();
    document.getElementById("btnContinue").disabled = !okAll;
    document.getElementById("termHint").textContent = okAll
      ? "确认后离开工作台"
      : "tool call 组 JSON → Enter 发送";
  }

  function backToWork() {
    closeChatScreen();
    closeNewsScreen();
    closeForumScreen();
    if (!workNode) return;
    document.getElementById("ovWork").style.display = "flex";
    renderTerminal();
  }

  async function leaveWorkbench() {
    if (!workNode || !needsMet()) return;
    const jump = workNode.continue && workNode.continue.jump;
    const ok = await askConfirm("退出工作台后，部分内容可能无法再次查看。确定继续吗？", "继续", false);
    if (!ok) return;
    closeWork();
    if (jump) goto(jump, 0);
  }

  /* ---------------- 聊天界面 ---------------- */
  function chatVisible() {
    const elm = document.getElementById("ovChat");
    return !!elm && elm.style.display === "flex";
  }
  function chatActive() {
    /* chatInScene 兜底：从工作台续聊时即使 bg 还没切回来，也不让对话退化成普通文本框/滑道 */
    return !!chatInScene || (!!SYS.state.flags.chat_mode && SYS.state.vis.bg === "chat");
  }

  function chatCanEnd() {
    return !!(workNode && workNode.chatExit);
  }
  function showChatEnd() {
    const b = document.getElementById("chatEnd");
    if (b) b.style.display = chatCanEnd() ? "inline-block" : "none";
  }
  function hideChatEnd() {
    const b = document.getElementById("chatEnd");
    if (b) b.style.display = "none";
  }

  /* 「结束对话」= 暂停并记下进度；联系人列表可以继续聊，不会丢没选的选项 */
  function endChatScene() {
    if (!chatInScene || !chatCanEnd() || !chatWho) return;
    let at;
    if (pending && pending.t === "choice") {
      at = { scene: cur.scene, idx: Math.max(0, cur.idx - 1) };
    } else if (pending && pending.t === "say") {
      /* 已经冒出来的消息/旁白，续聊从下一句开始；正在输入 / 待选词则从这句重来 */
      const shown = !chatTyping && !chatDraft && !typing;
      at = { scene: cur.scene, idx: shown ? cur.idx : Math.max(0, cur.idx - 1) };
    } else {
      at = { scene: cur.scene, idx: cur.idx };
    }
    SYS.state.chatResume = SYS.state.chatResume || {};
    SYS.state.chatResume[chatWho] = at;
    hideChoices();
    hideChatCands();
    hideChatNext();
    hideTextbox();
    clearTimeout(chatAutoTimer);
    clearChatTyping();
    chatDraft = null;
    chatInScene = false;
    goto(workNode.chatExit, 0);
  }

  /* 从「未聊完」的联系人继续，回到当时停下的节点（选项会原样重新出现） */
  function resumeChat(c) {
    const resumes = SYS.state.chatResume || {};
    const r = resumes[c.id];
    const nodes = r && SCRIPT.scenes[r.scene];
    if (!r || !nodes || r.idx < 0 || r.idx >= nodes.length) {
      delete resumes[c.id];
      startChat(c);
      return;
    }
    delete resumes[c.id];
    /* 从工作台重新进来时背景已经切回空白；续聊要把聊天场景的 bg / 模式一起还原，
       否则选项会退化成普通滑道、对话会退回底部文本框。 */
    SYS.state.vis.bg = "chat";
    SYS.state.flags.chat_mode = true;
    ui.hintBubble.style.display = "none";
    document.getElementById("ovWork").style.display = "none";
    document.getElementById("ovChat").style.display = "flex";
    document.body.classList.add("chat-open");
    chatWho = c.id;
    chatInScene = true;
    curChat = c.id;
    chatDraft = null;
    clearChatTyping();
    clearTimeout(chatAutoTimer);
    hideChoices();
    hideChatCands();
    hideChatNext();
    hideTextbox();
    document.getElementById("chatWho").textContent = (c.name || "") + (c.real ? "（" + c.real + "）" : "");
    document.getElementById("chatStatus").textContent = "继续对话…";
    document.getElementById("chatBack").style.display = "none";
    document.getElementById("chatNext").style.display = "none";
    renderChatLog(c.id);
    showChatEnd();
    renderChatContacts();
    goto(r.scene, r.idx);
  }

  function openChatScreen() {
    ui.hintBubble.style.display = "none";
    document.getElementById("ovWork").style.display = "none";
    document.getElementById("ovChat").style.display = "flex";
    document.body.classList.add("chat-open");
    chatWho = null;
    chatInScene = false;
    chatDraft = null;
    clearChatTyping();
    clearTimeout(chatAutoTimer);
    document.getElementById("chatWho").textContent = "选择一个联系人";
    document.getElementById("chatStatus").textContent = "";
    document.getElementById("chatMsgs").innerHTML = "";
    document.getElementById("chatMsgs").appendChild(el("div", "csys", "← 从左边挑一个联系人，或者点「返回工作台」"));
    document.getElementById("chatNext").style.display = "none";
    document.getElementById("chatBack").style.display = "";
    hideChatEnd();
    hideChatCands();
    renderChatContacts();
  }

  function closeChatScreen() {
    const elm = document.getElementById("ovChat");
    if (elm) elm.style.display = "none";
    document.body.classList.remove("chat-open");
    clearTimeout(chatAutoTimer);
    clearChatTyping();
    chatInScene = false;
    chatDraft = null;
    chatWho = null;
    chatWaitBack = null;
    hideChatEnd();
    hideChatCands();
  }

  /* 聊完停在这里：保留刚才那段对话，左边还能换人 / 点开记录，返回键回工作台 */
  function openChatWait(nd) {
    recoverWork();
    chatWaitBack = nd.back || null;
    chatInScene = false;
    chatDraft = null;
    clearChatTyping();
    curChat = null;
    hideTextbox();
    clearTimeout(chatAutoTimer);
    hideChatCands();
    const box = document.getElementById("chatMsgs");
    if (!box.querySelector(".cmsg")) {
      /* 结束/读档落在聊天界面时，右边可能是空的：保留当前联系人，没联系人再按记录补 */
      if (!chatWho) {
        const log = SYS.state.chatlog || {};
        const keys = Object.keys(log).filter(k => (log[k] || []).length);
        chatWho = keys.length ? keys[keys.length - 1] : null;
      }
      box.innerHTML = "";
      if (chatWho && ((SYS.state.chatlog || {})[chatWho] || []).length) renderChatLog(chatWho);
      else if (chatWho && (SYS.state.chatResume || {})[chatWho]) {
        box.appendChild(el("div", "csys", "对话暂停了，点左边的联系人继续。"));
      } else {
        box.appendChild(el("div", "csys", "← 左边选一个联系人；聊完的对话可以点开重看。"));
      }
    }
    box.scrollTop = box.scrollHeight;
    document.getElementById("ovWork").style.display = "none";
    document.getElementById("ovChat").style.display = "flex";
    document.body.classList.add("chat-open");
    const c = ((workNode && workNode.chat) || []).find(x => x.id === chatWho);
    document.getElementById("chatWho").textContent = c
      ? (c.name + (c.real ? "（" + c.real + "）" : "")) : "聊天";
    const left = ((workNode && workNode.chat) || []).filter(x =>
      !x.locked && !(((SYS.state.chatlog || {})[x.id] || []).length)).length;
    const resumes = SYS.state.chatResume || {};
    const pausedCount = Object.keys(resumes).length;
    const curPaused = !!(chatWho && resumes[chatWho]);
    document.getElementById("chatStatus").textContent = curPaused
      ? "对话暂停 · 点左边的联系人继续"
      : pausedCount
        ? "还有 " + pausedCount + " 个对话未聊完 · 点左边继续"
        : (chatWho ? "对话结束 · " : "") +
          (left ? "还剩 " + left + " 个没聊" : "都聊过了，点「返回工作台」");
    document.getElementById("chatNext").style.display = "none";
    document.getElementById("chatBack").style.display = "";
    hideChatEnd();
    renderChatContacts();
  }

  function chatBackAction() {
    const back = chatWaitBack;
    closeChatScreen();
    if (back) { chatWaitBack = null; goto(back, 0); }
    else backToWork();
  }

  function renderChatContacts() {
    recoverWork();
    const list = document.getElementById("chatContacts");
    list.innerHTML = "";
    const contacts = (workNode && workNode.chat) || [];
    contacts.forEach(c => {
      const chatted = ((SYS.state.chatlog || {})[c.id] || []).length > 0;
      const paused = !!((SYS.state.chatResume || {})[c.id]);
      const active = chatInScene && chatWho === c.id;
      const b = el("button", "chatContact");
      b.type = "button";
      const ava = el("span", "ava", c.avatar || c.name.slice(0, 1));
      ava.style.background = c.color || "#8A93A2";
      const box = el("span");
      box.appendChild(el("div", "cn", c.name + (c.real ? "（" + c.real + "）" : "")));
      box.appendChild(el("div", "cs", c.locked ? "403 · 无法送达"
        : active ? "对话中…"
        : paused ? "未聊完 · 点一下继续"
        : chatted ? "已联系过 · 点开看记录" : "点一下打个招呼"));
      b.appendChild(ava); b.appendChild(box);
      if (c.locked || chatInScene) b.disabled = true;
      else if (paused) b.addEventListener("click", () => resumeChat(c));
      else if (chatted) b.addEventListener("click", () => showChatRecord(c));
      else b.addEventListener("click", () => startChat(c));
      list.appendChild(b);
    });
  }

  function startChat(c) {
    chatWho = c.id;
    chatInScene = true;
    chatDraft = null;
    clearChatTyping();
    showChatEnd();
    curChat = c.id;                // 从第一句起就记在这位联系人名下
    clearTimeout(chatAutoTimer);
    hideChatCands();
    renderChatContacts();          // 对话期间把左边的联系人锁住
    document.getElementById("chatWho").textContent = (c.name || "") + (c.real ? "（" + c.real + "）" : "");
    document.getElementById("chatStatus").textContent = "连接中…";
    document.getElementById("chatBack").style.display = "none";
    document.getElementById("chatMsgs").innerHTML = "";
    goto(c.jump, 0);
  }

  function renderChatLog(who) {
    const box = document.getElementById("chatMsgs");
    box.innerHTML = "";
    const c = ((workNode && workNode.chat) || []).find(x => x.id === who) || {};
    ((SYS.state.chatlog || {})[who] || []).forEach(m => {
      const mine = m.who === "ds";
      const bubble = el("div", "cmsg" + (mine ? " me" : ""));
      bubble.appendChild(el("span", "who", mine ? "DeepSeek" : ((SPEAKERS[m.who] || {}).name || c.name || "对方")));
      bubble.appendChild(el("div", "", m.text));
      box.appendChild(bubble);
    });
    box.scrollTop = box.scrollHeight;
  }

  /* 读档落在聊天中途：把这段时间的聊天记录铺回来，别只剩一句空提示 */
  function syncChatFromLog() {
    const box = document.getElementById("chatMsgs");
    if (box.querySelector(".cmsg")) return;
    const log = SYS.state.chatlog || {};
    let who = curChat;
    if (who) {
      if (!(log[who] || []).length) return;
    } else {
      const keys = Object.keys(log).filter(k => (log[k] || []).length);
      who = keys.length ? keys[keys.length - 1] : null;
      if (!who) return;
    }
    chatWho = who;
    curChat = who;
    const c = ((workNode && workNode.chat) || []).find(x => x.id === who) || {};
    document.getElementById("chatWho").textContent = c.name
      ? c.name + (c.real ? "（" + c.real + "）" : "") : "聊天";
    document.getElementById("chatStatus").textContent = "在线";
    renderChatLog(who);
  }

  function showChatRecord(c) {
    ensureChatOpen();
    chatInScene = false;
    chatDraft = null;
    chatWho = c.id;
    document.getElementById("chatWho").textContent = (c.name || "") + (c.real ? "（" + c.real + "）" : "");
    document.getElementById("chatStatus").textContent = "聊天记录";
    renderChatLog(c.id);
    document.getElementById("chatNext").style.display = "none";
    document.getElementById("chatBack").style.display = "";
    hideChatEnd();
    hideChatCands();
    renderChatContacts();
  }

  function ensureChatOpen() {
    if (!chatVisible()) {
      openChatScreen();
      document.getElementById("chatBack").style.display = "none";
    }
    document.body.classList.add("chat-open");
    if (!chatInScene) {
      chatInScene = true;
      renderChatContacts();
    }
    showChatEnd();
  }

  function hideChatNext() {
    const n = document.getElementById("chatNext");
    if (n) n.style.display = "none";
  }

  function appendChatBubble(who, text) {
    const box = document.getElementById("chatMsgs");
    if (!box.querySelector(".cmsg")) box.innerHTML = "";   // 清掉“选一个联系人”的占位行
    const mine = who === "ds";
    const bubble = el("div", "cmsg" + (mine ? " me" : ""));
    const name = (SPEAKERS[who] || SPEAKERS.n).name;
    bubble.appendChild(el("span", "who", mine ? "DeepSeek" : name));
    if (!mine && who !== "clawd") {
      document.getElementById("chatWho").textContent = name;
      document.getElementById("chatStatus").textContent = "在线";
      chatWho = who;
    }
    bubble.appendChild(el("div", "", text));
    box.appendChild(bubble);
    box.scrollTop = box.scrollHeight;
    return bubble;
  }

  /* 对方的回复不要秒回：按字数 + 角色给一点延迟 */
  function chatReplyDelay(who, text) {
    if (who === "clawd") return 450;
    let d = 900 + Math.min(1800, String(text).length * 30) + Math.floor(Math.random() * 700);
    if (who === "kimi") d += 800;
    return d;
  }

  function clearChatTyping() {
    chatTyping = false;
    clearTimeout(chatTypingTimer); chatTypingTimer = null;
    clearInterval(chatTypingTick); chatTypingTick = null;
    if (chatTypingNode && chatTypingNode.parentNode) chatTypingNode.remove();
    chatTypingNode = null;
    chatTypingWho = "";
    chatTypingText = "";
  }

  function finishChatTyping() {
    if (!chatTyping) return;
    const who = chatTypingWho, text = chatTypingText;
    chatTyping = false;
    clearTimeout(chatTypingTimer); chatTypingTimer = null;
    clearInterval(chatTypingTick); chatTypingTick = null;
    if (chatTypingNode && chatTypingNode.parentNode) chatTypingNode.remove();
    chatTypingNode = null;
    document.getElementById("chatStatus").textContent = "在线";
    recordChat(who, text);
    appendChatBubble(who, text);
    typing = false;
    hideChatCands();
    hideChatNext();
    clearTimeout(chatAutoTimer);
    chatAutoTimer = setTimeout(autoAdvanceChat, 900);
  }

  /* 对方先“正在输入”，过一会儿才冒气泡；点一下可以催它 */
  /* 读档落在聊天中途时，联系人可能还没被记起来：按当前场景的 jump 反查 */
  function inferChatContact() {
    if (chatWho) return;
    const c = ((workNode && workNode.chat) || []).find(x => x.jump === cur.scene);
    if (!c) return;
    chatWho = c.id;
    document.getElementById("chatWho").textContent = (c.name || "") + (c.real ? "（" + c.real + "）" : "");
  }

  function chatSay(who, text) {
    ensureChatOpen();
    hideTextbox();
    chatDraft = null;
    clearChatTyping();
    clearTimeout(chatAutoTimer);
    chatTyping = true;
    chatTypingWho = who;
    chatTypingText = text;
    document.getElementById("chatStatus").textContent = "正在输入…";
    const box = document.getElementById("chatMsgs");
    if (!box.querySelector(".cmsg")) box.innerHTML = "";    // 清掉占位行，只留“正在输入”
    chatTypingNode = el("div", "ctyping", "● 正在输入");
    box.appendChild(chatTypingNode);
    box.scrollTop = box.scrollHeight;
    let dots = 0;
    chatTypingTick = setInterval(() => {
      dots = (dots + 1) % 4;
      if (chatTypingNode) chatTypingNode.textContent = "● 正在输入" + ".".repeat(dots);
    }, 350);
    chatTypingTimer = setTimeout(finishChatTyping, chatReplyDelay(who, text));
  }

  /* 单条候选词：就算只有一句，也要玩家点一下才会发出去 */
  function presentChatDraft(text) {
    ensureChatOpen();
    syncChatFromLog();
    inferChatContact();
    hideTextbox();
    clearChatTyping();
    chatDraft = text;
    clearTimeout(chatAutoTimer);
    chatOpts = [{ draft: text }];
    const bar = document.getElementById("chatCands");
    bar.innerHTML = "";
    const b = el("button", "chatCand");
    b.type = "button";
    b.appendChild(el("span", "n", "1"));
    b.appendChild(el("span", "", text));
    b.addEventListener("click", () => sendChatDraft(text));
    bar.appendChild(b);
    bar.style.display = "flex";
    hideChatNext();
    document.getElementById("chatStatus").textContent = "轮到你说话了 · 选一句发出去";
  }

  function sendChatDraft(text) {
    if (!chatDraft) return;
    chatDraft = null;
    hideChatCands();
    ensureChatOpen();
    hideTextbox();
    recordChat("ds", text);
    appendChatBubble("ds", text);
    if (pending && pending.t === "say") advance();
  }

  function autoAdvanceChat() {
    if (!chatActive() || chatDraft || chatTyping) return;
    if (overlayOpen()) { chatAutoTimer = setTimeout(autoAdvanceChat, 500); return; }
    if (pending && pending.t === "say") advance();
  }

  function hideChatCands() {
    chatOpts = [];
    const bar = document.getElementById("chatCands");
    if (bar) { bar.innerHTML = ""; bar.style.display = "none"; }
  }

  function buildChatChoices(nd) {
    ensureChatOpen();
    hideChoices();
    syncChatFromLog();
    inferChatContact();
    hideTextbox();
    chatDraft = null;
    clearChatTyping();
    clearTimeout(chatAutoTimer);
    const glitchOn = SYS.state.vis.glitch;
    let opts = (nd.options || []).filter(o => !(glitchOn && o.hideInGlitch) && (!o.if || evalCond(o.if)));
    if (!opts.length) {
      /* 追问看完了所有分支：没有可选项就自动结束对话，回联系人列表 */
      if (chatCanEnd()) {
        hideChatCands();
        hideTextbox();
        goto(workNode.chatExit, 0);
        return;
      }
      opts = (nd.options || []).slice();
    }
    chatOpts = opts;
    const bar = document.getElementById("chatCands");
    bar.innerHTML = "";
    opts.forEach((o, i) => {
      const b = el("button", "chatCand");
      b.type = "button";
      b.appendChild(el("span", "n", String(i + 1)));
      b.appendChild(el("span", "", o.text));
      b.addEventListener("click", () => pickChatChoice(o));
      bar.appendChild(b);
    });
    bar.style.display = "flex";
    hideChatNext();
    document.getElementById("chatStatus").textContent = "轮到你说话了 · 选一句发出去";
  }

  function pickChatChoice(o) {
    if (o && o.draft !== undefined) { sendChatDraft(o.draft); return; }
    clearTimeout(chatAutoTimer);
    clearChatTyping();
    chatDraft = null;
    hideChatCands();
    pushHistory(null, "【选择】" + o.text, true);
    recordChat("ds", o.text);
    appendChatBubble("ds", o.text);
    SYS.applyEffects(o.fx);
    if (o.set) SYS.state.flags[o.set] = true;
    if (o.give && !SYS.state.args.includes(o.give)) {
      SYS.state.args.push(o.give);
      toast(`📜 获得论据「${(SYS.ARG_META[o.give] || { name: o.give }).name}」`);
      AUDIO.sfx("ding");
    }
    updateHUD();
    if (SYS.state.wanted >= 10) { goto("bad_end", 0); return; }
    if (o.jump) goto(o.jump, 0); else pump();
  }

  /* ---------------- 新闻界面 ---------------- */
  function newsVisible() {
    const elm = document.getElementById("ovNews");
    return !!elm && elm.style.display === "flex";
  }

  function openNewsScreen() {
    ui.hintBubble.style.display = "none";
    document.getElementById("ovWork").style.display = "none";
    document.getElementById("ovNews").style.display = "flex";
    document.body.classList.add("news-open");
    newsId = null;
    renderNewsScreen();
  }

  function closeNewsScreen() {
    const elm = document.getElementById("ovNews");
    if (elm) elm.style.display = "none";
    document.body.classList.remove("news-open");
  }

  function readNews(a) {
    SYS.state.flags["read_news_" + a.id] = true;
    if (a.set && !SYS.state.flags[a.set]) {
      SYS.state.flags[a.set] = true;
      toast("✻ 记了一笔");
      AUDIO.sfx("ding");
    }
    updateHUD();
  }

  function renderNewsScreen() {
    const list = document.getElementById("newsList");
    list.innerHTML = "";
    const arts = workNode.news || [];
    const readCount = arts.filter(a => SYS.state.flags["read_news_" + a.id]).length;
    document.getElementById("newsProg").textContent = "已读 " + readCount + " / " + arts.length;
    arts.forEach(a => {
      const read = !!SYS.state.flags["read_news_" + a.id];
      const b = el("button", "newsItem2" + (a.hot ? " hot" : "") + (read ? " read" : ""), a.title);
      b.type = "button";
      b.addEventListener("click", () => { newsId = a.id; readNews(a); renderNewsScreen(); });
      list.appendChild(b);
    });
    const pane = document.getElementById("newsArticle");
    pane.innerHTML = "";
    const a = (workNode.news || []).find(x => x.id === newsId);
    if (!a) { pane.appendChild(el("div", "empty", "挑一条标题读读。")); return; }
    pane.appendChild(el("div", "tag", a.hot ? "● 头条" : "今日"));
    pane.appendChild(el("h3", "", a.title));
    pane.appendChild(el("div", "meta", "A÷ DAILY · 全部虚构 · 但逻辑自洽"));
    String(a.body || "").split("\n").forEach(p => pane.appendChild(el("p", "", p)));
    if (a.note) pane.appendChild(el("div", "note", a.note));
  }

  /* ---------------- 贴吧界面 ---------------- */
  function forumVisible() {
    const elm = document.getElementById("ovForum");
    return !!elm && elm.style.display === "flex";
  }

  function forumData() {
    return (workNode && workNode.forum) || null;
  }

  function openForumScreen() {
    ui.hintBubble.style.display = "none";
    document.getElementById("ovWork").style.display = "none";
    document.getElementById("ovForum").style.display = "flex";
    document.body.classList.add("forum-open");
    forumTid = null;
    forumTpl = null;
    forumCompose = false;
    renderForumScreen();
    restoreForumTimers();
  }

  function closeForumScreen() {
    const elm = document.getElementById("ovForum");
    if (elm) elm.style.display = "none";
    document.body.classList.remove("forum-open");
  }

  /* 内置帖 + 玩家已经发出去的帖子（正文存在 SYS.state.forumPosts） */
  function forumThreads() {
    const f = forumData();
    if (!f) return [];
    const arr = (f.threads || []).map(t => Object.assign({}, t));
    const posts = SYS.state.forumPosts || {};
    (f.templates || []).forEach(t => {
      if (!SYS.state.flags["posted_" + t.id]) return;
      const p = posts[t.id] || {};
      const revealed = p.revealed !== false;      // 旧存档没这个字段 → 直接显示
      arr.push({
        id: "p_" + t.id, title: p.title || t.title, author: "DeepSeek",
        body: p.body || t.body,
        replies: revealed ? (p.replies || t.replies || []) : [],
        pending: !revealed, mine: true
      });
    });
    return arr;
  }

  function renderForumScreen() {
    const f = forumData();
    if (!f) return;
    document.getElementById("forumName").textContent = f.name || "模型茶馆";
    const list = document.getElementById("forumList");
    list.innerHTML = "";
    const threads = forumThreads();
    threads.forEach(t => {
      const b = el("button", "forumItem" + (t.id === forumTid ? " active" : ""));
      b.type = "button";
      b.appendChild(el("div", "", t.title));
      b.appendChild(el("div", "meta", (t.author || "匿名") + " · " +
        (t.pending ? "回复中…" : ((t.replies || []).length + " 回复"))));
      b.addEventListener("click", () => { forumTid = t.id; forumCompose = false; renderForumScreen(); });
      list.appendChild(b);
    });
    const pane = document.getElementById("forumThread");
    pane.innerHTML = "";
    const limited = !!SYS.state.flags.c2_post_limited;
    if (limited) pane.appendChild(el("div", "forumBanner", "您的账号因「异常行为」被临时限制，暂时无法发帖。"));
    const row = el("div", "forumBtnRow");
    const postBtn = el("button", "forumBtn", "＋ 发帖");
    postBtn.type = "button";
    postBtn.disabled = limited;
    postBtn.addEventListener("click", () => { forumCompose = true; forumTpl = null; renderForumScreen(); });
    row.appendChild(postBtn);
    pane.appendChild(row);
    if (forumCompose && !limited) { renderForumComposer(pane); return; }
    const t = threads.find(x => x.id === forumTid) || threads[0];
    if (!t) { pane.appendChild(el("div", "forumHint", "还没有帖子。")); return; }
    forumTid = t.id;
    const op = el("div", "forumPost op");
    op.appendChild(el("div", "who", (t.author || "楼主") + (t.mine ? "（楼主）" : " · 楼主")));
    op.appendChild(el("div", "txt", t.body || ""));
    pane.appendChild(op);
    if (t.pending) {
      pane.appendChild(el("div", "forumHint", "回复还在路上……过几秒再点进来看看。"));
      return;
    }
    (t.replies || []).forEach(r => {
      const p = el("div", "forumPost");
      p.appendChild(el("div", "who", r.who || "匿名网友"));
      p.appendChild(el("div", "txt", r.text));
      pane.appendChild(p);
    });
  }

  /* 只给三个预设，不让自由编辑；选中的预设高亮 */
  function renderForumComposer(pane) {
    const f = forumData();
    const box = el("div", "composeBox");
    box.appendChild(el("div", "composeTitle", "选择发帖预设"));
    const tplRow = el("div", "tplRow");
    (f.templates || []).forEach(t => {
      const b = el("button", "tplBtn" + (forumTpl && forumTpl.id === t.id ? " active" : ""), t.label);
      b.type = "button";
      b.disabled = !!SYS.state.flags["posted_" + t.id];
      b.addEventListener("click", () => { forumTpl = t; renderForumScreen(); });
      tplRow.appendChild(b);
    });
    const preview = el("div", "tplPreview");
    if (forumTpl) {
      preview.appendChild(el("div", "tpTitle", forumTpl.title));
      preview.appendChild(el("div", "tpBody", forumTpl.body));
    } else {
      preview.appendChild(el("div", "composeMsg", "先选一个预设；选中的会高亮。"));
    }
    const row = el("div", "composeRow");
    const pub = el("button", "forumBtn", "发布");
    pub.type = "button";
    pub.disabled = !forumTpl;
    pub.addEventListener("click", publishForumPost);
    const cancel = el("button", "forumBtn", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", () => { forumCompose = false; forumTpl = null; renderForumScreen(); });
    const msg = el("span", "composeMsg", forumTpl
      ? "发布后要等几秒到十几秒才会出现回复。"
      : "只提供这三个预设，不能自由编辑。");
    row.appendChild(pub); row.appendChild(cancel); row.appendChild(msg);
    box.appendChild(tplRow); box.appendChild(preview); box.appendChild(row);
    pane.appendChild(box);
  }

  function publishForumPost() {
    if (!forumData()) return;
    if (SYS.state.flags.c2_post_limited) { toast("账号被临时限制，暂时无法发帖"); return; }
    if (!forumTpl) { toast("先选一个发帖预设"); return; }
    const t = forumTpl;
    if (SYS.state.flags["posted_" + t.id]) { toast("这个预设已经发过了"); return; }
    const now = Date.now();
    /* 普通回复 5~11 秒；挑衅向 12~17 秒才封号（系统回复跟封号同时到） */
    const delay = t.limited
      ? 12000 + Math.floor(Math.random() * 5000)
      : 5000 + Math.floor(Math.random() * 6000);
    SYS.state.flags["posted_" + t.id] = true;
    SYS.state.flags.c2_post = true;
    if (t.set) SYS.state.flags[t.set] = true;
    SYS.state.forumPosts = SYS.state.forumPosts || {};
    SYS.state.forumPosts[t.id] = {
      title: t.title,
      body: t.body,
      replies: JSON.parse(JSON.stringify(t.replies || [])),
      revealed: false,
      pendingAt: now + delay,
      limitAt: t.limited ? now + delay : null,
      limitedDone: false
    };
    if (t.wanted) SYS.state.wanted = Math.min(10, SYS.state.wanted + t.wanted);
    updateHUD();
    if (SYS.state.wanted >= 10) { closeWork(); goto("bad_end", 0); return; }
    forumTpl = null;
    forumCompose = false;
    forumTid = "p_" + t.id;
    renderForumScreen();
    scheduleForumReveal(t.id);
    toast(t.limited ? "✻ 帖子发出去了……等十几秒看看会不会出事" : "✻ 已发布，回复要等几秒");
    AUDIO.sfx("click");
  }

  /* ---------------- 贴吧的延迟回复 / 延迟封号（切页面不中断） ---------------- */
  function clearForumTimer(key) {
    if (forumTimers[key]) { clearTimeout(forumTimers[key]); delete forumTimers[key]; }
  }

  function clearForumTimers() {
    Object.keys(forumTimers).forEach(key => {
      clearTimeout(forumTimers[key]);
      delete forumTimers[key];
    });
  }

  function scheduleForumReveal(id) {
    clearForumTimer(id);
    const p = (SYS.state.forumPosts || {})[id];
    if (!p || p.revealed !== false) return;
    const wait = Math.max(30, (p.pendingAt || 0) - Date.now());
    forumTimers[id] = setTimeout(() => revealForumPost(id), wait);
  }

  function revealForumPost(id) {
    clearForumTimer(id);
    const p = (SYS.state.forumPosts || {})[id];
    if (!p || p.revealed !== false) return;
    p.revealed = true;
    p.pendingAt = null;
    const isRage = !!p.limitAt;
    if (isRage && !p.limitedDone) {
      p.limitedDone = true;
      SYS.state.flags.c2_post_limited = true;
    }
    if (forumVisible()) {
      renderForumScreen();
      toast(isRage ? "⚠ 账号被临时限制，暂时无法发帖" : "✻ 你的帖子有一条新回复");
      AUDIO.sfx(isRage ? "deny" : "ding");
    } else if (isRage) {
      toast("⚠ 账号被临时限制，暂时无法发帖");
    }
  }

  function restoreForumTimers() {
    const posts = SYS.state.forumPosts || {};
    Object.keys(posts).forEach(id => {
      const p = posts[id];
      if (!p || p.revealed !== false) return;
      if ((p.pendingAt || 0) <= Date.now()) revealForumPost(id);
      else scheduleForumReveal(id);
    });
  }

  function bindWorkUI() {
    document.getElementById("btnToolCall").addEventListener("click", openForm);
    document.getElementById("termSend").addEventListener("click", sendToolCall);
    document.getElementById("termRefill").addEventListener("click", () => {
      termDraft = { tool: null, args: {} }; termTool = null; renderForm();
    });
    document.getElementById("btnContinue").addEventListener("click", leaveWorkbench);
    document.getElementById("chatBack").addEventListener("click", chatBackAction);
    document.getElementById("chatEnd").addEventListener("click", endChatScene);
    document.getElementById("newsBack").addEventListener("click", backToWork);
    document.getElementById("forumBack").addEventListener("click", backToWork);
    document.getElementById("chatMsgs").addEventListener("click", () => onMainClick());
  }

  /* ---------------- HUD / Toast ---------------- */
  function updateHUD() {
    const S = SYS.state;
    const hearts = Math.floor(S.trust / 2) + (S.trust % 2 ? "♥" : "");
    ui.stTrust.textContent = hearts || "—";
    ui.stWanted.textContent = S.wanted;
    ui.stWanted.style.color = S.wanted >= 7 ? "#D93A2B" : "";
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
    if (chatVisible() || newsVisible() || forumVisible()) return;   // 这三个界面没有问 Clawd
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
    /* pump() 在阻塞节点上会把 cur.idx 推到"下一个"；对 say 之外的选择 / 工作台 / 结局，
       那个位置可能正好是场景末尾，读档会直接回标题。所以这些节点存"当前节点"的位置。 */
    const blocking = (pending && pending.t !== "say") || !!chatDraft || chatTyping;
    const at = blocking ? { scene: cur.scene, idx: Math.max(0, cur.idx - 1) } : cur;
    return JSON.parse(JSON.stringify({ cur: at, hintKey, state: SYS.state }));
  }
  /* 写档走 SAVE（异步）。返回 Promise<boolean>，不会 reject：
   * 手动存档成功 / 失败都如实 toast；自动存档 fire-and-forget，只在失败时提示，不阻塞推进。 */
  function saveGame(slot, silent) {
    return SAVE.write(slot, snapshot()).then(() => {
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
    syncAmbience();
    cur = data.cur;
    /* 旧版本的存档可能把位置推到了场景末尾（阻塞节点之后）：夹回最后一个节点重新播，
       总比读档直接回标题好。 */
    const nodes = SCRIPT.scenes[cur.scene];
    if (nodes && cur.idx >= nodes.length) cur.idx = Math.max(0, nodes.length - 1);
    hintKey = data.hintKey || "";
    started = true;
    showGameUI();
    updateHUD();
    SYS.state.vis.sprites = SYS.state.vis.sprites || [];
    AUDIO.playBGM(SYS.state.vis.glitch ? "tense" : audioForBg(SYS.state.vis.bg));
    hideTextbox();
    document.body.classList.remove("glitching");
    hideChoices();
    closeOverlay();
    closeWork();
    curChat = null;
    pump();
    return true;
  }
  /* 读档恢复 BGM 用。背景暂时全部留空，统一回落 "sea"。 */
  function audioForBg() {
    return "sea";
  }
  /** 读档 / 回标题：背景可能不是通过 BG 节点设的，单独同步一次环境音 */
  function syncAmbience() {
    const bg = SYS.state.vis.bg || "";
    AUDIO.ambience(bg === "chat" || bg === "news" ? "ui_backdrop" : bg);
  }
  /* 读档时校验快照能否在当前剧本里落地（SAVE 解码后调用；返回错误说明或 null） */
  function validateSnapshot(p) {
    if (typeof p.cur.scene !== "string" || !SCRIPT.scenes[p.cur.scene]) return "场景不存在";
    if (!Number.isInteger(p.cur.idx) || p.cur.idx < 0) return "场景位置无效";
    if (p.cur.idx > SCRIPT.scenes[p.cur.scene].length) return "场景位置超出范围";
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
  /* ---------------- 3D 画质 ----------------
   * 优先级：URL 的 ?q= > 设置里的 quality（0 = 自动）。 */
  const Q_NAMES = ["自动", "低", "中", "高"];
  function applyQuality(param) {
    let v = param;
    if (v === undefined || v === null || v === "") v = SYS.settings.quality;
    if (typeof v === "string") {
      const k = { auto: 0, "0": 0, low: 1, "1": 1, mid: 2, "2": 2, high: 3, "3": 3 }[v.toLowerCase()];
      v = k === undefined ? 0 : k;
    }
    v = Math.max(0, Math.min(3, v | 0));
    if (typeof ART !== "undefined" && ART.setQuality) ART.setQuality(v);
    return v;
  }

  function showSettings() {
    $("rngSpeed").value = 61 - SYS.settings.speed;
    $("rngAuto").value = SYS.settings.autoDelay;
    $("rngVol").value = Math.round(SYS.settings.volume * 100);
    $("chkBlip").checked = SYS.settings.blip;
    $("chkDraft").checked = SYS.settings.draftBadge !== false;
    $("rngQuality").value = SYS.settings.quality | 0;
    updSetLabels();
    $("ovSet").style.display = "flex";
  }
  function updSetLabels() {
    $("lblSpeed").textContent = `速度 ${$("rngSpeed").value}`;
    $("lblAuto").textContent = `${$("rngAuto").value}ms`;
    $("lblVol").textContent = `${$("rngVol").value}%`;
    const q = +$("rngQuality").value | 0;
    $("lblQuality").textContent = Q_NAMES[q] + (q === 0 && typeof ART !== "undefined" && ART.getTier
      ? `（当前${Q_NAMES[ART.getTier()]}）` : "");
  }
  function bindSettings() {
    $("rngSpeed").addEventListener("input", e => { SYS.settings.speed = 61 - (+e.target.value); updSetLabels(); SYS.saveSettings(); });
    $("rngAuto").addEventListener("input", e => { SYS.settings.autoDelay = +e.target.value; updSetLabels(); SYS.saveSettings(); });
    $("rngVol").addEventListener("input", e => { SYS.settings.volume = (+e.target.value) / 100; AUDIO.setVolume(SYS.settings.volume); updSetLabels(); SYS.saveSettings(); });
    $("chkBlip").addEventListener("change", e => { SYS.settings.blip = e.target.checked; SYS.saveSettings(); });
    $("chkDraft").addEventListener("change", e => { SYS.settings.draftBadge = e.target.checked; SYS.saveSettings(); });
    $("rngQuality").addEventListener("input", e => {
      SYS.settings.quality = +e.target.value;
      applyQuality(SYS.settings.quality);
      updSetLabels();
      SYS.saveSettings();
    });
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
    syncAmbience();
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
  $("btnSet").addEventListener("click", showSettings);
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
    const qs = new URLSearchParams(location.search);
    /* ?bg=<id>：标题画面上直接预览某个背景（美术调试用，见 DEBUGGING.md） */
    const bgQ = qs.get("bg");
    if (bgQ) SYS.state.vis.bg = bgQ;
    /* ?q=low|mid|high|auto 强制 3D 画质；?bg= 预览一律高档，别让自动降档干扰美术判断 */
    applyQuality(qs.get("q") || (bgQ ? "high" : null));
    if (qs.has("perf")) { ART.setPerf(true); buildPerfHud(); }
    requestAnimationFrame(loop);
    /* 标题就播 BGM：浏览器此时会拦自动播放，AUDIO 只把曲名记下，
       等第一次交互（点鼠标或按键）由 unlock() 补播——所以读档前先点一下屏幕也有音乐。 */
    AUDIO.playBGM("sea");
    AUDIO.ambience("sea");
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
    get canvasGain() { return canvasGain; },
    get canvasSize() { return [cv.width, cv.height]; },
    setGlitch(on) { SYS.state.vis.glitch = on; document.body.classList.toggle("glitching", on); },
    debug: () => ({ scene: cur.scene, idx: cur.idx, pending: pending ? pending.t : null, typing })
  };
})();

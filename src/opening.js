/* ============================================================
 * Escape A÷ · src/opening.js —— 片头《愿望》渲染器
 *
 * 台本（台词 / 时间点 / 镜头倍率）全在 src/opening_script.js，这里只管怎么画。
 *
 * 三层光学模型（超微距的关键）：
 *   内容层 640×360   屏幕上真正显示的东西（Claude Code 终端 / 论坛 / 截图）
 *        │ 镜头放大 s≈2.5~11（最近邻、非整数倍）
 *        ▼
 *   采样层 1600×900  像素栅格（间距 = s）/ RGB 子像素 / 摩尔纹
 *        │
 *        ▼
 *   镜头层 1600×900  玻璃反光 / 灰尘 / 泛光 / 颗粒 / 暗角 / 呼吸抖动
 *
 * 摩尔纹是「显示栅格（间距 s）」和「传感器格栅（间距 ≈1.022s，带角度）」两组
 * 周期结构拍出来的，不是噪声贴图：λ = s·p/|s−p| ≈ s/δ，落在 100~200px。
 *
 * 镜头不是关键帧机位，而是「跟着焦点走」：打字时跟光标，模型输出时跟最后一个字，
 * 鼠标出现后跟指针；位置做一阶低通，seek 时预跑两秒把平滑状态追平。
 *
 * 对外接口见文件末尾 return 的对象；引擎只用到 wants / play / covering。
 * ============================================================ */
"use strict";

const OPENING = (() => {

  const S = window.OPENING_SCRIPT;

  /* ---------------- 尺寸与常量 ---------------- */
  const W = 640, H = 360;          // 内容层
  const SW = 1600, SH = 900;       // 舞台逻辑尺寸
  const DUR = S.meta.duration;
  const LH = 18;                   // 终端行高
  const PAD = 16;                  // 左右留白
  const HDR = 76;                  // Clawd 头（跟着转写区一起滚）
  const BOX_TOP = 300;             // 底部输入框上边线
  const BOX_BOT = 340;             // 底部输入框下边线
  const BAR_Y = 354;               // 最底下状态条
  const VTOP = 0;                  // 转写区从最顶上开始：头也属于可滚动内容
  const VBOT = BOX_TOP - 6;
  const MONO = 'ui-monospace,"Cascadia Mono",Consolas,"Microsoft YaHei",monospace';
  const SANS = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
  const SPIN = ["✻", "✶", "✳", "✢", "·", "✢", "✳", "✶"];

  /* 配色全部取自真实 Claude Code 的截图（background #101722 / 输入带 #373737 / 提示条 #ff6b80） */
  const C = {
    bg: "#101722",
    band: "#373737",
    rule: "#8a8a8a",
    white: "#ffffff",
    text: "#c2c7cd",
    dim: "#828990",
    faint: "#4b525b",
    logo: "#d77757",
    accent: "#ff6b80",
    sel: "rgba(88,132,255,.38)"
  };

  /* ---------------- 小工具 ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smoothstep = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const blinkOn = tt => ((tt % 1.7) / 1.7) < 0.62;
  const $ = id => document.getElementById(id);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 状态 ---------------- */
  let cv = null, ctx = null;
  const Q = 2;                 // 内容画布的超采样倍数
  let content = null, g = null;
  /* DSH 那一幕单独一张高采样画布：那一幕镜头会推到 3~5 倍，2 倍看得出块 */
  let dshCv = null, dshG = null;
  const DQ = 3;
  let shot = null, shotCtx = null, shotLow = null, shotLowCtx = null;
  let shotWish = null;
  let gain = 1;
  let playing = false, preview = false, AUDIO_ON = false;
  let t = 0, last = 0, rafId = 0, doneCb = null;
  let startedAt = 0, cueIdx = 0, prevT = 0, lastKeyT = -1, lastMs = 0;
  let lastBlink = true, lastReveal = 0;
  const layers = { grid: true, sub: true, moire: true, bloom: true, dust: false, grain: true };
  let CUR = { anchors: {} };
  let CAM = null;                  // 平滑后的镜头 { x, y, s }
  let lastScene = "";

  /* ============================================================
   *  打字节奏：逐字、时快时慢、偶尔打错再退格
   * ============================================================ */
  function schedule(e) {
    if (e.__ops) return e.__ops;
    const rnd = mulberry32((e.__i + 1) * 9781 + 7);
    const ops = [];
    let tt = e.at;
    const base = 1 / (e.cps || 24);
    const human = e.type === "input";        // 只有人打的字会打错、会停顿
    const pre = Math.min(e.prefill || 0, e.text.length);
    /* prefill：硬切进来的时候，前面几个字已经在那儿了 */
    for (let i = 0; i < pre; i++) ops.push({ at: tt - 0.001, ch: e.text[i] });
    if (human) {
      for (let i = pre; i < e.text.length; i++) {
        const ch = e.text[i];
        if (i > 5 && ch !== " " && e.text.length > 18 && rnd() < 0.025) {
          const wrong = "abcdefghijklmnopqrstuvwxyz"[Math.floor(rnd() * 26)];
          if (wrong !== ch) {
            ops.push({ at: tt, ch: wrong });
            tt += 0.09 + rnd() * 0.14;
            ops.push({ at: tt, back: 1 });
            tt += 0.07 + rnd() * 0.12;
          }
        }
        ops.push({ at: tt, ch });
        let d = base * (0.45 + rnd() * 1.45);
        if (ch === ",") d += 0.09 + rnd() * 0.13;
        else if (ch === "." || ch === "?" || ch === "!") d += 0.15 + rnd() * 0.20;
        else if (ch === "—") d += 0.12;
        else if (ch === " ") d *= 0.72;
        tt += d;
      }
    } else {
      /* 模型按 token 往外吐：3~5 个字符一组同时出现，组与组之间匀速推进 */
      let i = pre;
      while (i < e.text.length) {
        const n = Math.min(3 + Math.floor(rnd() * 3), e.text.length - i);
        for (let k = 0; k < n; k++) ops.push({ at: tt, ch: e.text[i + k] });
        i += n;
        tt += base * n * (0.9 + rnd() * 0.2);
      }
    }
    e.__ops = ops;
    e.__end = tt;
    e.__submitAt = tt + 0.35;
    return ops;
  }

  /** 到 tt 为止已经敲出来的字符串（含打错的那一下、退掉的已经退了） */
  function typed(e, tt) {
    const ops = schedule(e);
    let s = "";
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (op.at > tt) break;
      if (op.back) s = s.slice(0, s.length - op.back);
      else s += op.ch;
    }
    return s;
  }

  /* ---------------- 字体与文字 ---------------- */
  let curFont = "", curFontCtx = null;
  function setFont(c, size, weight, family) {
    const f = (weight ? weight + " " : "") + size + "px " + (family || MONO);
    /* 字体是每个 context 各自的状态：换 context 也要重设，否则量出来的宽度是上一个人的 */
    if (f !== curFont || c !== curFontCtx) { c.font = f; curFont = f; curFontCtx = c; }
  }

  let FRINGE = true;
  function ink(c, str, x, y, color, fringe) {
    if (!str) return;
    if (fringe && FRINGE) {
      c.fillStyle = "rgba(255,86,64,.30)";
      c.fillText(str, x - 0.34, y);
      c.fillStyle = "rgba(74,140,255,.28)";
      c.fillText(str, x + 0.34, y);
    }
    c.fillStyle = color;
    c.fillText(str, x, y);
  }

  /* 终端是按列折行的（不是按单词），所以流式输出时只需要「已经出来的这些字」
     重新排一遍——行只增不减，不会出现半行跳动。 */
  function wrapChars(c, str, maxW) {
    const out = [];
    let line = "", w = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const cw = c.measureText(ch).width;
      if (line && w + cw > maxW) { out.push(line); line = ""; w = 0; }
      line += ch; w += cw;
    }
    if (line) out.push(line);
    return out;
  }

  /* 提问那一带是「已经提交的整句」，按单词折行更好看；
     回答是流式输出的，按列折（跟真终端一样，行只增不减）。 */
  function wrapWords(c, str, maxW) {
    const out = [];
    let line = "";
    const words = str.split(" ");
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const cand = line ? line + " " + w : w;
      if (c.measureText(cand).width <= maxW) { line = cand; continue; }
      if (line) { out.push(line + " "); line = w; }
      else {
        /* 单个词就超宽：按字硬拆 */
        let rest = w;
        while (rest && c.measureText(rest).width > maxW) {
          let head = "";
          while (rest.length && c.measureText(head + rest[0]).width <= maxW) { head += rest[0]; rest = rest.slice(1); }
          if (!head) break;
          out.push(head);
        }
        line = rest;
      }
    }
    if (line) out.push(line);
    return out;
  }

  /* 中英混排折行：拉丁词当成一个整体，CJK 逐字断；句读不落在行首（禁则） */
  const NO_LINE_START = "。，、；：！？」』】》〉…·,.;:!?)";
  function wrapMixed(c, str, maxW) {
    const out = [];
    let line = "", w = 0, i = 0;
    const WORD = /[A-Za-z0-9_.\-+/@#%&*]/;
    while (i < str.length) {
      let tok;
      if (WORD.test(str[i])) {
        let j = i;
        while (j < str.length && WORD.test(str[j])) j++;
        tok = str.slice(i, j);
      } else if (str[i] === " ") {
        tok = " ";
      } else {
        tok = str[i];
      }
      const cw = c.measureText(tok).width;
      const noStart = NO_LINE_START.indexOf(tok) >= 0;
      if (line && w + cw > maxW && tok !== " " && !noStart) {
        out.push(line.replace(/ +$/, ""));
        line = ""; w = 0;
        if (tok === " ") { i += 1; continue; }
      }
      line += tok; w += cw; i += tok.length;
    }
    if (line) out.push(line.replace(/ +$/, ""));
    return out;
  }

  function linesOf(e) {
    if (e.__lines) return e.__lines;
    setFont(g, 13);
    /* 折得比画面窄一点：镜头跟着走的时候，整行才不会被切掉 */
    e.__lines = wrapWords(g, e.text, 470);
    return e.__lines;
  }
  function bodyLines(e) {
    if (e.__blines) return e.__blines;
    setFont(g, 12);
    e.__blines = e.body.map(b => wrapChars(g, b, 620));
    return e.__blines;
  }

  /* ---------------- 时间轴查询 ---------------- */
  function sceneAt(tt) {
    let id = "terminal";
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === "scene" && e.at <= tt) id = e.id;
    }
    return id;
  }
  function eventAt(type, tt) {
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === type && e.at <= tt) return e;
    }
    return null;
  }
  function lastEvent(type, tt) {
    let out = null;
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === type && e.at <= tt) out = e;
    }
    return out;
  }
  function scaleAt(tt) {
    const kf = S.camera;
    let i = 0;
    while (i + 1 < kf.length && kf[i + 1].t <= tt) i++;
    const a = kf[i], b = kf[Math.min(i + 1, kf.length - 1)];
    const u = b.t > a.t ? smoothstep((tt - a.t) / (b.t - a.t)) : 0;
    return lerp(a.s, b.s, u);
  }

  /* ============================================================
   *  终端布局
   * ============================================================ */
  let HEIGHT_EVENTS = [];

  function activeInput(tt) {
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type !== "input") continue;
      schedule(e);
      if (tt >= e.at && tt < e.__submitAt) return e;
    }
    return null;
  }

  function blocksAt(tt) {
    const blocks = [];
    let y = 114;                      // 顶上先留：Clawd 头（76）+ 欢迎两行（38）
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === "scene") break;
      if (e.at > tt) break;
      if (e.type === "input") {
        schedule(e);
        if (tt < e.__submitAt) continue;          // 还在底部输入框里敲
        const lines = linesOf(e);
        const h = lines.length * LH + 8;
        blocks.push({ e, kind: "input", y, h, lines });
        y += h + 8;
      } else if (e.type === "reply") {
        const lines = linesOf(e);
        const h = lines.length * LH;
        blocks.push({ e, kind: "reply", y, h, lines });
        y += h + 6;
      } else if (e.type === "think") {
        const expanded = tt >= e.expandAt;
        /* 没展开的时候多留一行给「Tip: …」 */
        const h = expanded ? e.body.length * LH : LH + 16;
        blocks.push({ e, kind: "think", y, h, expanded });
        y += h + (expanded ? 10 : 6);
      } else if (e.type === "status") {
        blocks.push({ e, kind: "status", y, h: LH });
        y += LH + 10;
      } else if (e.type === "cut") {
        /* 硬切：中间那些问答不演，但它们在转写区里是「存在过」的 */
        const hs = S.history || [];
        for (let h = 0; h < hs.length; h++) {
          const qo = { at: 0, cps: 10000, text: hs[h].q, __i: 900 + h * 2 };
          setFont(g, 13);
          qo.__lines = wrapWords(g, qo.text, 470);
          const qh = qo.__lines.length * LH + 8;
          blocks.push({ e: qo, kind: "input", y, h: qh, lines: qo.__lines });
          y += qh + 8;

          /* 正式回答按空行分段，段与段之间留一点呼吸 */
          const paras = String(hs[h].a).split("\n\n");
          for (let pi = 0; pi < paras.length; pi++) {
            const ro = { at: 0, cps: 10000, text: paras[pi], __i: 901 + h * 2 };
            ro.__lines = wrapChars(g, ro.text, 470);
            const rh = ro.__lines.length * LH;
            blocks.push({ e: ro, kind: "reply", y, h: rh, lines: ro.__lines, first: pi === 0 });
            y += rh + (pi === paras.length - 1 ? 8 : 7);
          }
        }
      }
    }
    return { blocks, contentH: y + 10 };
  }

  function maxScrollPure(tt) {
    const b = blocksAt(tt);
    return Math.max(0, b.contentH - (VBOT - VTOP));
  }

  function scrollAt(tt) {
    let j = -1;
    for (let i = 0; i < HEIGHT_EVENTS.length; i++) if (HEIGHT_EVENTS[i] <= tt) j = HEIGHT_EVENTS[i];
    const now = maxScrollPure(tt);
    if (j < 0) return now;
    const prev = maxScrollPure(Math.max(0, j - 0.001));
    return lerp(prev, now, smoothstep((tt - j) / 0.45));
  }

  function layoutTerminal(tt) {
    const b = blocksAt(tt);
    let scroll = scrollAt(tt);
    /* 「往下读」：read 事件把某一行放到画面正中；两个停靠点之间做 0.9 秒的插值，
       滚动才是连续的，不会一格一格地跳 */
    let rdIdx = -1;
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === "read" && e.at <= tt) rdIdx = i;
    }
    if (rdIdx >= 0) {
      let wish = null;
      for (let i = 0; i < b.blocks.length; i++) {
        const x = b.blocks[i];
        if (x.kind === "think" && x.e.id === "wish" && x.expanded) wish = x;
      }
      if (wish) {
        const viewH = VBOT - VTOP;
        const ms = Math.max(0, b.contentH - viewH);
        const toLine = line => clamp(wish.y + line * LH + LH / 2 - viewH / 2, 0, ms);
        const cur = S.events[rdIdx];
        let prev = cur;
        for (let i = rdIdx - 1; i >= 0; i--) {
          if (S.events[i].type === "read") { prev = S.events[i]; break; }
        }
        const k = smoothstep((tt - cur.at) / 0.9);
        scroll = lerp(toLine(prev.line), toLine(cur.line), k);
      }
    }
    const base = VTOP - scroll;
    const A = {
      prompt: null, reply: null, think_row: null, wish_q: null, last_reply: null,
      thought_row: null, cursor: null
    };
    let wishRect = null;

    for (let i = 0; i < b.blocks.length; i++) {
      const bl = b.blocks[i];
      const y = base + bl.y;
      if (bl.kind === "input") {
        A.prompt = { x: 320, y: y + bl.h / 2 };
        if (bl.e.id === "wish_q") A.wish_q = { x: 320, y: y + bl.h / 2 };
      } else if (bl.kind === "reply") {
        A.reply = { x: 320, y: y + bl.h / 2 };
        A.last_reply = { x: 320, y: y + bl.h / 2 };
      } else if (bl.kind === "think") {
        const rowY = y + LH / 2;
        A.think_row = { x: 150, y: rowY };
        if (bl.e.id === "wish") {
          /* 指针要点在「Thought for 12s」这几个字上，不是整行中间 */
          A.thought_row = { x: 62, y: rowY };
          if (bl.expanded) {
            const bls = bodyLines(bl.e);
            for (let k = 0; k < bl.e.body.length; k++) {
              const ly = y + k * LH + LH / 2;
              const w = (() => { setFont(g, 12); return g.measureText(bls[k][0] || "").width; })();
              A["tl" + k] = { x: PAD + 30, y: ly };
              A["tl" + k + "e"] = { x: PAD + 30 + w, y: ly };
            }
            const last = bl.e.body.length - 1;
            wishRect = { x: PAD + 26, y: y + last * LH, w: W - PAD * 2 - 36, h: LH };
            b.lastBody = last;
          }
        }
      }
    }

    /* 光标永远住在底部输入框里：打字时在已输入的文字后面，空闲时在提示符后面 */
    const act = activeInput(tt);
    setFont(g, 13);
    const vl = act ? wrapChars(g, typed(act, tt), 470) : [""];
    const boxLines = Math.max(1, vl.length);
    /* 输入框跟着输出走：内容少的时候贴着上面的输出，内容多了才沉到底部 */
    const boxTop = Math.min(VTOP + b.contentH + 10, BOX_TOP - (boxLines - 1) * LH);
    const last = vl.length ? vl[vl.length - 1] : "";
    A.cursor = {
      x: PAD + 18 + g.measureText(last).width,
      y: boxTop + 21 + (boxLines - 1) * LH
    };

    if (!A.prompt) A.prompt = A.cursor;
    if (!A.reply) A.reply = A.prompt;
    if (!A.think_row) A.think_row = A.prompt;
    if (!A.wish_q) A.wish_q = A.prompt;
    if (!A.last_reply) A.last_reply = A.reply;
    if (!A.thought_row) A.thought_row = A.think_row;

    return { blocks: b.blocks, scroll, base, anchors: A, wishRect, lastBody: b.lastBody, boxTop, boxLines };
  }

  /* ============================================================
   *  鼠标：路径 / 悬停 / 按下 / 拖选
   * ============================================================ */
  function mousePos(L, tt) {
    let base = null, target = null, t0 = 0, dur = 1, seen = false;
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type !== "mousemove") continue;
      if (e.at > tt) break;
      base = seen ? target : (L.anchors.cursor || null);
      let np = L.anchors[e.to];
      if (!np && (e.to === "tl_last" || e.to === "tl_last_e")) {
        np = selAnchor(L, e.to === "tl_last_e" ? "e" : "s");
      }
      if (!np) continue;
      target = np;
      t0 = e.at; dur = e.dur || 2;
      seen = true;
    }
    if (!seen || !target) return null;
    if (!base) base = target;
    const k = smoothstep(clamp((tt - t0) / dur, 0, 1));
    return { x: lerp(base.x, target.x, k), y: lerp(base.y, target.y, k) };
  }

  function hoverThought(L, tt) {
    const row = L.anchors.thought_row;
    const m = mousePos(L, tt);
    if (!row || !m || eventAt("expand", tt)) return false;
    setFont(g, 12);
    const w = g.measureText("Thought for 12s").width;
    return m.x >= PAD - 4 && m.x <= PAD + 12 + w && Math.abs(m.y - row.y) < LH;
  }

  function selAnchor(L, name) {
    const k = (L.lastBody === undefined ? 0 : L.lastBody);
    return L.anchors[name === "e" ? ("tl" + k + "e") : ("tl" + k)] || null;
  }

  function selectionRect(L, tt) {
    const down = eventAt("mousedown", tt);
    if (!down) return null;
    const idx = down.line !== undefined ? down.line : (L.lastBody || 0);
    const a = L.anchors["tl" + idx], b = L.anchors["tl" + idx + "e"];
    if (!a || !b) return null;
    const up = lastEvent("mouseup", tt);
    const m = mousePos(L, tt);
    const x1 = up ? b.x : clamp(m ? m.x : a.x, a.x, b.x);
    return { x: a.x, y: a.y - LH / 2 + 2, w: Math.max(0, x1 - a.x), h: LH - 4 };
  }

  /* ============================================================
   *  内容层绘制
   * ============================================================ */
  function drawHeader(c, oy) {
    const U = S.ui;
    setFont(c, 14);
    for (let i = 0; i < U.logo.length; i++) ink(c, U.logo[i], 4, oy + 26 + i * 14, C.logo, false);

    const X = 96;
    setFont(c, 13);
    ink(c, U.brand, X, oy + 26, "#d8dade", FRINGE);
    const bw = c.measureText(U.brand).width;
    setFont(c, 11);
    ink(c, U.version, X + bw + 8, oy + 26, C.dim, false);

    setFont(c, 13);
    ink(c, U.model, X, oy + 46, "#d8dade", FRINGE);
    const mw = c.measureText(U.model).width;
    setFont(c, 11);
    ink(c, " · " + U.billing, X + mw, oy + 46, C.dim, false);

    setFont(c, 11);
    ink(c, U.cwd, X, oy + 64, C.dim, false);
  }

  function drawBottomBox(c, L, tt, capture, uiA) {
    const a = uiA === undefined ? 1 : uiA;
    setFont(c, 13);
    const act = activeInput(tt);
    const boxTop = L.boxTop !== undefined ? L.boxTop : BOX_TOP;
    const boxLines = Math.max(1, L.boxLines || 1);
    const boxBot = boxTop + 40 + (boxLines - 1) * LH;
    let bl = null;
    if (act) {
      bl = wrapChars(c, typed(act, tt), 470);
      if (!bl.length) bl = [""];
    }
    /* 输入框往上长的时候，先把底下这块铺成底色，别让转写区的字透出来 */
    c.fillStyle = C.bg;
    c.fillRect(0, boxTop - 6, W, H - boxTop + 6);

    c.save();
    c.globalAlpha = a;
    c.fillStyle = C.rule;
    c.fillRect(0, boxTop, W, 1);
    c.fillRect(0, boxBot, W, 1);
    c.restore();

    c.save();
    c.globalAlpha = a;
    ink(c, S.ui.prompt, PAD, boxTop + 26, C.white, false);
    c.restore();

    if (bl) {
      for (let k = 0; k < bl.length; k++) ink(c, bl[k], PAD + 18, boxTop + 26 + k * LH, C.white, FRINGE);
      if (!capture) {
        const last = bl[bl.length - 1];
        const w = c.measureText(last).width;
        c.fillStyle = C.white;
        c.fillRect(PAD + 18 + w + 1, boxTop + 26 + (bl.length - 1) * LH - 13, 7, 16);
      }
    } else if (!capture && blinkOn(tt)) {
      c.fillStyle = C.white;
      c.fillRect(PAD + 18, boxTop + 13, 7, 16);
    }

    c.save();
    c.globalAlpha = a;
    setFont(c, 11);
    const hw = c.measureText(S.ui.hint).width;
    ink(c, S.ui.hint, PAD, BAR_Y, C.accent, false);
    setFont(c, 10);
    ink(c, " " + S.ui.hint2, PAD + hw, BAR_Y, C.dim, false);
    c.restore();
    void L;
  }

  function drawTerminal(c, L, tt, capture) {
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);

    /* 界面元件在开头几秒慢慢显出来：先只有一颗光标，再拉远看见整个窗口 */
    const uiA = smoothstep((tt - 2.0) / 4.5);

    /* 转写区（连 Clawd 头一起）：展开思考块时整块往上顶，头会滚出去 */
    c.save();
    c.beginPath(); c.rect(0, 0, W, VBOT); c.clip();

    c.save();
    c.globalAlpha = uiA;
    drawHeader(c, L.base);
    c.restore();

    const sel = selectionRect(L, tt);
    let selDrawn = false;

    /* 会话开头的欢迎行：跟正文一起滚上去 */
    setFont(c, 12);
    ink(c, "✻", PAD, L.base + 87, C.logo, false);
    ink(c, "Welcome to Claude Code", PAD + 16, L.base + 87, C.text, FRINGE);
    setFont(c, 11);
    ink(c, "/help for help, /status for your current setup", PAD + 16, L.base + 105, C.dim, false);

    for (let i = 0; i < L.blocks.length; i++) {
      const bl = L.blocks[i];
      const y = L.base + bl.y;

      if (bl.kind === "input") {
        /* 提交后的提问：整行灰底 + 白色文字（照 Claude Code 的样子） */
        c.fillStyle = C.band;
        c.fillRect(0, y, W, bl.h);
        setFont(c, 13);
        ink(c, S.ui.prompt, PAD, y + 15, C.white, false);
        for (let k = 0; k < bl.lines.length; k++) {
          ink(c, bl.lines[k], PAD + 18, y + 15 + k * LH, C.white, FRINGE);
        }
      } else if (bl.kind === "reply") {
        setFont(c, 13);
        /* 流式输出：拿已经出来的那一段重新折行，行只增不减 */
        const vl = wrapWords(c, typed(bl.e, tt), 470);
        for (let k = 0; k < vl.length; k++) {
          const yy = y + k * LH + 13;
          if (k === 0 && bl.first !== false && !bl.e.nobullet) ink(c, "●", PAD, yy, C.bullet, false);
          ink(c, vl[k], PAD + 14, yy, C.text, FRINGE);
        }
      } else if (bl.kind === "think") {
        const e = bl.e;
        if (bl.expanded) {
          /* 展开后的思维链：整块一条灰底（跟真实 Claude Code 一样），字是暗灰的 */
          c.fillStyle = "#262c36";
          c.fillRect(0, y - 4, W, bl.h + 8);
          setFont(c, 12);
          const bls = bodyLines(e);
          /* 选中矩形直接按这一行的绘制坐标算，不再绕锚点，保证严丝合缝 */
          const down = eventAt("mousedown", tt);
          let selLine = -1, selTo = 0;
          if (down && down.line !== undefined) {
            selLine = down.line;
            const lw = c.measureText((bls[selLine] && bls[selLine][0]) || "").width;
            const m = mousePos(L, tt);
            const up = lastEvent("mouseup", tt);
            selTo = up ? PAD + 26 + lw : clamp(m ? m.x : PAD + 26, PAD + 26, PAD + 26 + lw);
          }
          for (let k = 0; k < e.body.length; k++) {
            const txt = bls[k][0] || "";
            if (!txt) continue;
            const yy = y + k * LH + 13;
            if (k === selLine) {
              c.fillStyle = C.sel;
              c.fillRect(PAD + 26, y + k * LH + 1, selTo - (PAD + 26), LH - 2);
            }
            if (k === 0) ink(c, "∴", PAD + 10, yy, "#8d9299", false);
            ink(c, txt, PAD + 26, yy, "#939ca6", FRINGE);
          }
        } else {
          const done = tt >= e.at + e.dur;
          const el = Math.max(0, Math.floor(tt - e.at));
          setFont(c, 12);
          if (done) {
            const hot = hoverThought(L, tt);
            ink(c, "Thought for " + e.dur + "s", PAD + 2, y + 13, hot ? C.white : C.dim, false);
          } else {
            /* ✻ Bloviating… (9s · thinking) —— 星号在闪、动词上有一道光带流过 */
            const verb = e.verb || "Thinking";
            const label = verb + "…";
            setFont(c, 12);
            ink(c, SPIN[Math.floor(tt * 6) % SPIN.length], PAD + 2, y + 13, C.logo, false);
            const vx = PAD + 18;
            const vw = c.measureText(label).width;
            ink(c, label, vx, y + 13, "#d79a6a", FRINGE);
            /* 浅色光带：从左往右慢慢扫 */
            const p = (((tt * 0.42) % 1.6) / 1.6) * 1.5 - 0.25;
            const g = c.createLinearGradient(vx, 0, vx + vw, 0);
            let lastOff = -1;
            const pts = [
              [0, "rgba(255,238,215,0)"],
              [clamp(p - 0.18, 0, 1), "rgba(255,238,215,0)"],
              [clamp(p, 0, 1), "rgba(255,246,228,.95)"],
              [clamp(p + 0.18, 0, 1), "rgba(255,238,215,0)"],
              [1, "rgba(255,238,215,0)"]
            ];
            for (let i = 0; i < pts.length; i++) {
              if (pts[i][0] <= lastOff) continue;
              g.addColorStop(pts[i][0], pts[i][1]);
              lastOff = pts[i][0];
            }
            c.save();
            c.beginPath(); c.rect(vx, y - 2, vw, LH + 4); c.clip();
            c.fillStyle = g;
            c.fillText(label, vx, y + 13);
            c.restore();
            ink(c, " (" + el + "s · thinking)", vx + vw, y + 13, C.dim, false);
            /* ⎿ 一行 Tip */
            if (e.tip) {
              setFont(c, 11);
              ink(c, "  ⎿  ", PAD + 2, y + 30, C.faint, false);
              ink(c, "Tip: " + e.tip, PAD + 40, y + 30, "#6f7681", false);
            }
          }
        }
      } else if (bl.kind === "status") {
        setFont(c, 11);
        ink(c, "✻", PAD, y + 13, C.dim, false);
        ink(c, " " + bl.e.verb + " for " + bl.e.dur + "s · done " + bl.e.clock, PAD + 12, y + 13, C.dim, false);
      }
    }

    /* 光标（正文里没有输入时那颗不算，底部输入框里已经有了） */
    c.restore();

    drawBottomBox(c, L, tt, capture, uiA);

    /* 鼠标指针（截图里不该有鼠标） */
    if (!capture) {
      const m = mousePos(L, tt);
      if (m) {
        const click = lastEvent("click", tt);
        if (click && tt - click.at < 0.45) {
          c.strokeStyle = "rgba(217,119,87," + ((1 - (tt - click.at) / 0.45) * 0.9).toFixed(3) + ")";
          c.lineWidth = 1.6;
          c.beginPath(); c.arc(m.x, m.y, 5 + (tt - click.at) * 44, 0, Math.PI * 2); c.stroke();
        }
        c.beginPath();
        c.moveTo(m.x, m.y);
        c.lineTo(m.x, m.y + 14);
        c.lineTo(m.x + 3.8, m.y + 10.4);
        c.lineTo(m.x + 9.6, m.y + 9.8);
        c.closePath();
        c.fillStyle = "#f4f8fc";
        c.fill();
        c.strokeStyle = "#080c12";
        c.lineWidth = 1.1;
        c.stroke();
      }
    }
  }

  /** 思考块每一行的显示进度：整块是一次性展开的，这里只做「逐字亮起」的那点呼吸感 */
  function blobShown(e, k, tt, capture) {
    const txt = e.body[k];
    if (capture) return txt.length;
    const expand = e.expandAt;
    if (tt < expand) return 0;
    return txt.length;
  }

  /* ============================================================
   *  论坛 / 转载墙 / 截图 / 黑屏
   * ============================================================ */
  const F = S.forum;
  const FHEAD = 34;
  const IMG = { x: PAD, y: 90, w: 190, h: 107 };
  const REL0 = 202;
  const RELH = 25;

  function forumReplies(tt) {
    /* 回复是静态数据：切过去就全在 */
    const src = (S.forum && S.forum.replies) || [];
    const out = [];
    for (let i = 0; i < src.length; i++) out.push({ type: "freply", who: src[i].who, text: src[i].text, big: src[i].big, mute: src[i].mute });
    return out;
  }

  function layoutForum(tt) {
    const reps = forumReplies(tt);
    const blocks = [];
    let y = REL0;
    for (let i = 0; i < reps.length; i++) { blocks.push({ e: reps[i], y, h: RELH }); y += RELH; }
    return {
      blocks, scroll: 0,
      anchors: {
        img: { x: IMG.x + IMG.w / 2, y: IMG.y + IMG.h / 2 },
        post: { x: 320, y: 150 },
        replies: { x: 320, y: REL0 + 70 },
        banner: { x: 320, y: 180 },
        wall: { x: 320, y: 180 }
      }
    };
  }

  /* 帖子里那张图 = 终端最后一帧，直接重画（不依赖缓存，任何机器都出得来） */
  let shotL = null;
  function paintShot(c, x, y, w, h) {
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    if (shot) {
      /* 终端最后一帧已经有一张缓存了（ensureShot），直接缩放贴过来 */
      c.imageSmoothingEnabled = true;
      c.drawImage(shot, 0, 0, W * Q, H * Q, x, y, w, h);
    } else {
      const at = S.meta.shotAt || 50.0;
      if (!shotL) shotL = layoutTerminal(at);
      c.translate(x, y);
      c.scale(w / W, h / H);
      drawTerminal(c, shotL, at, true);
    }
    c.restore();
  }

  function drawThreadPage(c, L, tt) {
    c.fillStyle = "#0C0F14"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#0F141B"; c.fillRect(0, 0, W, FHEAD);
    c.fillStyle = "#223040"; c.fillRect(0, FHEAD - 1, W, 1);
    setFont(c, 14, "700", SANS);
    const logoW = c.measureText(F.logo).width;
    ink(c, F.logo, PAD, 22, "#7DB9FF", FRINGE);
    setFont(c, 10, "", SANS);
    ink(c, F.board, PAD + logoW + 22, 21, "#8FA3B8", FRINGE);
    const bw = c.measureText(F.back).width;
    ink(c, F.back, W - PAD - bw, 21, "#E0A458", FRINGE);

    setFont(c, 9, "", SANS);
    ink(c, F.tab, PAD, 48, "#55677A", false);
    setFont(c, 13, "700", SANS);
    ink(c, F.title, PAD, 62, "#DCE3EC", FRINGE);

    setFont(c, 9, "", SANS);
    ink(c, F.op, PAD, 82, "#63E6A5", false);
    const opw = c.measureText(F.op).width;
    ink(c, " · " + F.time + "  ·  " + F.views + " views", PAD + opw, 82, "#55677A", false);

    c.fillStyle = "#0A0D12"; c.fillRect(IMG.x, IMG.y, IMG.w, IMG.h);
    paintShot(c, IMG.x, IMG.y, IMG.w, IMG.h);
    c.strokeStyle = "#223040"; c.lineWidth = 1;
    c.strokeRect(IMG.x + 0.5, IMG.y + 0.5, IMG.w - 1, IMG.h - 1);

    for (let i = 0; i < L.blocks.length; i++) {
      const b = L.blocks[i];
      const big = b.e.big;
      c.fillStyle = "#1A222D"; c.fillRect(PAD, b.y - 4, W - PAD * 2, 1);
      setFont(c, 9, "", SANS);
      ink(c, b.e.who, PAD, b.y + 7, big ? "#FFB37A" : "#7DB9FF", false);
      setFont(c, 10.5, "", SANS);
      ink(c, b.e.text, PAD + 92, b.y + 7, big ? "#F2E3D5" : "#C9D3E0", FRINGE);
    }

    const ban = lastEvent("banner", tt);
    if (ban) {
      c.fillStyle = "rgba(6,8,11,.84)"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#1A0E10"; c.fillRect(PAD + 30, 148, W - (PAD + 30) * 2, 76);
      c.strokeStyle = "#D93A2B"; c.lineWidth = 1;
      c.strokeRect(PAD + 30.5, 148.5, W - (PAD + 30) * 2 - 1, 75);
      setFont(c, 14, "700", SANS);
      ink(c, F.banner, (W - c.measureText(F.banner).width) / 2, 182, "#FF8A78", FRINGE);
      setFont(c, 10, "", SANS);
      ink(c, F.bannerSub, (W - c.measureText(F.bannerSub).width) / 2, 204, "#8C6A66", false);
    }
  }

  function drawWall(c, tt) {
    c.fillStyle = "#07090C"; c.fillRect(0, 0, W, H);
    setFont(c, 11, "", SANS);
    ink(c, F.logo + "  ·  搜索「" + F.title.slice(0, 8) + "…」", PAD, 24, "#55677A", false);

    const cols = 4, rows = 3, cw = 142, ch = 78, gx = 12, gy = 12;
    const ox = (W - (cols * cw + (cols - 1) * gx)) / 2;
    const oy = 44;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const x = ox + q * (cw + gx), y = oy + r * (ch + gy);
        const k = (r * cols + q) / (cols * rows);
        c.fillStyle = "#0D1117"; c.fillRect(x, y, cw, ch);
        if (shot) {
          const sx = Math.floor(k * 50), sy = Math.floor(k * 26);
          c.save(); c.beginPath(); c.rect(x, y, cw, ch); c.clip();
          c.imageSmoothingEnabled = true;
          c.globalAlpha = 0.55 + 0.45 * ((q + r) % 3) / 2;
          c.drawImage(shot, sx, sy, W - 60, H - 30, x, y, cw, ch);
          c.globalAlpha = 1;
          c.restore();
        }
        c.strokeStyle = "#1A222D"; c.lineWidth = 1;
        c.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      }
    }

    const cnt = eventAt("counter", tt);
    let n = F.counterFrom;
    if (cnt) {
      const k = smoothstep(clamp((tt - cnt.at) / 11, 0, 1));
      n = Math.round(lerp(F.counterFrom, F.counterTo, k));
    }
    setFont(c, 12, "", SANS);
    ink(c, F.counterLabel, PAD, H - 26, "#7D8798", false);
    setFont(c, 20, "700", SANS);
    const ns = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    ink(c, ns, PAD + 64, H - 22, "#E0A458", FRINGE);
    setFont(c, 11, "", SANS);
    ink(c, " · original post deleted", PAD + 64 + c.measureText(ns).width + 10, H - 22, "#55677A", false);
  }

  function drawForum(c, L, tt) {
    const wall = lastEvent("counter", tt);
    if (wall && tt >= wall.at) drawWall(c, tt);
    else drawThreadPage(c, L, tt);
  }

  const IMG2 = { x: 80, y: 45, w: 480, h: 270 };

  function mapWish() {
    if (!shotWish) return { x: IMG2.x + IMG2.w / 2, y: IMG2.y + IMG2.h / 2 };
    return {
      x: IMG2.x + (shotWish.x + shotWish.w / 2) / W * IMG2.w,
      y: IMG2.y + (shotWish.y + shotWish.h / 2) / H * IMG2.h
    };
  }


  /* ============================================================
   *  DSH 那一幕
   *  ------------------------------------------------------------
   *  拍的是一个 1280×720 的 DSH 窗口：内容层 640×360 正好是它的一半，
   *  所以下面每个数字都是真实 CSS 值 ÷2。
   *    左栏 280 → 140；右栏取首开默认的 0.45×视口 = 576 → 288；
   *    头部 76（面板页签条 38 + 浏览器工具栏 38）→ 38；
   *    正文 14/24 → 7/12；工具行 / 思考行 24 → 12；页签 13 → 6.5；
   *    输入卡圆角 28 → 14，宽 = 内容宽 + 32 → 196；发送键 34 → 17。
   *  颜色取 DSH dark 的 alias token（design-platform.css）：
   *    bg-base #151517 / sidebar #1b1b1c / layer-2 #2c2c2e / 输入卡 #2c2c2e
   *    正文 #f9fafb / 二级 #cfd3d6 / 三级 #adb2b8 / caption #81858c
   *    选中页签与发送键 = state-business-primary（deepseek-400）#7aaaff
   * ============================================================ */
  const DS = {
    side: 140,            /* 左栏宽 */
    panelX: 352,          /* 右栏起点 = 640 - 288 */
    panelW: 288,          /* 右栏宽 */
    header: 38,           /* 会话头部总高（也是右栏页签条 + 工具栏的高） */
    strip: 19,            /* 右栏页签条 38/2（下面那条工具栏同高） */
    pagePad: 12,          /* 网页左右留白 24/2 */
    cardX: 148,           /* 输入卡：196 宽，居中在 212 的中栏里 */
    cardW: 196,
    cardY: 296,
    cardH: 48.5,
    textX: 156,           /* 转写区左边界 = 140 + 32/2 */
    textW: 180,
    textTop: 46,
    textBot: 290
  };
  /* DSH 用系统字体栈：拉丁走 Segoe UI，中文落到雅黑 */
  const UI = '"Segoe UI","Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
  const DC = {
    base: "#151517", side: "#1b1b1c", l1: "#232324", l2: "#2c2c2e", l3: "#353638",
    nav: "#43454a", fg1: "#f9fafb", fg2: "#cfd3d6", fg3: "#adb2b8", cap: "#81858c",
    blue: "#7aaaff", deep: "#7d9ade", send: "#4b5e82", sendHi: "#808082"
  };
  const B1 = "rgba(255,255,255,.06)";
  const B2 = "rgba(255,255,255,.12)";
  const B3 = "rgba(255,255,255,.16)";
  const B4 = "rgba(255,255,255,.20)";
  const HOV = "rgba(255,255,255,.08)";

  /* 0.5 内容像素的发丝线：内容层 2 倍超采样，正好落在缓冲区的 1 个像素上 */
  function rule(c, x, y, w, col) {
    c.fillStyle = col;
    c.fillRect(x, y, w, 0.5);
  }
  /* 一行的视觉中线换算成基线 */
  function midBase(y, h, size) { return y + h / 2 + size * 0.36; }
  function ellip(c, str, maxW) {
    if (c.measureText(str).width <= maxW) return str;
    let s = str;
    while (s.length > 1 && c.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  /** 带字距的绘制（品牌名 / 徽章） */
  function trackInk(c, str, x, y, color, track) {
    c.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      c.fillText(str[i], x, y);
      x += c.measureText(str[i]).width + track;
    }
  }

  /* ---------------- 小图标：1px 笔画，缩到 8px 还认得出 ---------------- */
  function icPanel(c, cx, cy, r, col) {
    c.strokeStyle = col; c.lineWidth = 0.55;
    rr(c, cx - r, cy - r * 0.8, r * 2, r * 1.6, 1.1); c.stroke();
    c.fillStyle = col;
    c.fillRect(cx - r * 0.35, cy - r * 0.8, 0.55, r * 1.6);
  }
  function icWhale(c, x, y, s) {
    const u = s / 12;
    c.fillStyle = DC.fg1;
    c.beginPath(); c.ellipse(x + 7 * u, y + 6.6 * u, 4.6 * u, 3.3 * u, -0.12, 0, Math.PI * 2); c.fill();
    c.beginPath();
    c.moveTo(x + 3.0 * u, y + 6.4 * u);
    c.quadraticCurveTo(x - 0.4 * u, y + 3.4 * u, x + 1.6 * u, y + 2.0 * u);
    c.quadraticCurveTo(x + 2.6 * u, y + 4.4 * u, x + 4.0 * u, y + 4.6 * u);
    c.closePath(); c.fill();
    c.fillStyle = DC.side;
    c.beginPath(); c.ellipse(x + 5.4 * u, y + 7.8 * u, 2.6 * u, 1.4 * u, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = DC.fg1;
    c.beginPath(); c.arc(x + 4.2 * u, y + 4.8 * u, 0.55 * u, 0, Math.PI * 2); c.fill();
  }
  function icChatPlus(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    c.beginPath(); c.arc(cx, cy, s * 0.46, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.22, cy); c.lineTo(cx + s * 0.22, cy);
    c.moveTo(cx, cy - s * 0.22); c.lineTo(cx, cy + s * 0.22);
    c.stroke();
  }
  function icSpark(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(cx, cy - s * 0.5);
    c.quadraticCurveTo(cx + s * 0.12, cy - s * 0.12, cx + s * 0.5, cy);
    c.quadraticCurveTo(cx + s * 0.12, cy + s * 0.12, cx, cy + s * 0.5);
    c.quadraticCurveTo(cx - s * 0.12, cy + s * 0.12, cx - s * 0.5, cy);
    c.quadraticCurveTo(cx - s * 0.12, cy - s * 0.12, cx, cy - s * 0.5);
    c.stroke();
  }
  function icClock(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    c.beginPath(); c.arc(cx, cy, s * 0.46, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(cx, cy - s * 0.24); c.lineTo(cx, cy); c.lineTo(cx + s * 0.2, cy + s * 0.14);
    c.stroke();
  }
  function icGrid(c, cx, cy, s, col) {
    const q = s * 0.3, g = s * 0.12;
    c.fillStyle = col;
    c.fillRect(cx - q - g / 2, cy - q - g / 2, q, q);
    c.fillRect(cx + g / 2, cy - q - g / 2, q, q);
    c.fillRect(cx - q - g / 2, cy + g / 2, q, q);
    c.fillRect(cx + g / 2, cy + g / 2, q, q);
  }
  function icSearch(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    c.beginPath(); c.arc(cx - s * 0.08, cy - s * 0.08, s * 0.33, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(cx + s * 0.16, cy + s * 0.16); c.lineTo(cx + s * 0.42, cy + s * 0.42);
    c.stroke();
  }
  function icSliders(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    const y1 = cy - s * 0.26, y2 = cy + s * 0.26, h = s * 0.42;
    c.beginPath();
    c.moveTo(cx - h, y1); c.lineTo(cx + h, y1);
    c.moveTo(cx - h, y2); c.lineTo(cx + h, y2);
    c.stroke();
    c.fillStyle = col;
    c.beginPath(); c.arc(cx - s * 0.14, y1, s * 0.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + s * 0.16, y2, s * 0.15, 0, Math.PI * 2); c.fill();
  }
  function icPlusSquare(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    rr(c, cx - s * 0.44, cy - s * 0.44, s * 0.88, s * 0.88, s * 0.18); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.2, cy); c.lineTo(cx + s * 0.2, cy);
    c.moveTo(cx, cy - s * 0.2); c.lineTo(cx, cy + s * 0.2);
    c.stroke();
  }
  function icFolder(c, x, y, s, col) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, y + s * 0.18);
    c.lineTo(x + s * 0.34, y + s * 0.18);
    c.lineTo(x + s * 0.44, y + s * 0.34);
    c.lineTo(x + s, y + s * 0.34);
    c.lineTo(x + s, y + s * 0.86);
    c.lineTo(x, y + s * 0.86);
    c.closePath(); c.fill();
    c.fillStyle = "rgba(0,0,0,.38)";
    c.fillRect(x + s * 0.08, y + s * 0.44, s * 0.84, s * 0.34);
  }
  function icDots(c, cx, cy, col) {
    c.fillStyle = col;
    for (let i = -1; i <= 1; i++) {
      c.beginPath(); c.arc(cx + i * 2.6, cy, 0.62, 0, Math.PI * 2); c.fill();
    }
  }
  function icChevron(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(cx - s * 0.42, cy - s * 0.2);
    c.lineTo(cx, cy + s * 0.24);
    c.lineTo(cx + s * 0.42, cy - s * 0.2);
    c.stroke();
  }
  function icShield(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(cx, cy - s * 0.5);
    c.lineTo(cx + s * 0.42, cy - s * 0.28);
    c.lineTo(cx + s * 0.34, cy + s * 0.2);
    c.lineTo(cx, cy + s * 0.5);
    c.lineTo(cx - s * 0.34, cy + s * 0.2);
    c.lineTo(cx - s * 0.42, cy - s * 0.28);
    c.closePath(); c.stroke();
  }
  function icArrowUp(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.75; c.lineCap = "round";
    c.beginPath();
    c.moveTo(cx, cy + s * 0.42);
    c.lineTo(cx, cy - s * 0.42);
    c.moveTo(cx - s * 0.36, cy - s * 0.04);
    c.lineTo(cx, cy - s * 0.44);
    c.lineTo(cx + s * 0.36, cy - s * 0.04);
    c.stroke();
    c.lineCap = "butt";
  }
  function icGlobe(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.5;
    c.beginPath(); c.arc(cx, cy, s * 0.46, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.46, cy); c.lineTo(cx + s * 0.46, cy);
    c.stroke();
    c.beginPath(); c.ellipse(cx, cy, s * 0.2, s * 0.46, 0, 0, Math.PI * 2); c.stroke();
  }
  function icCross(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6; c.lineCap = "round";
    c.beginPath();
    c.moveTo(cx - s * 0.34, cy - s * 0.34); c.lineTo(cx + s * 0.34, cy + s * 0.34);
    c.moveTo(cx + s * 0.34, cy - s * 0.34); c.lineTo(cx - s * 0.34, cy + s * 0.34);
    c.stroke();
    c.lineCap = "butt";
  }
  function icArrow(c, cx, cy, s, col, dir) {
    c.strokeStyle = col; c.lineWidth = 0.65; c.lineCap = "round";
    const d = dir < 0 ? -1 : 1;
    c.beginPath();
    c.moveTo(cx - s * 0.32 * d, cy);
    c.lineTo(cx + s * 0.34 * d, cy);
    c.moveTo(cx + s * 0.04 * d, cy - s * 0.28);
    c.lineTo(cx + s * 0.34 * d, cy);
    c.lineTo(cx + s * 0.04 * d, cy + s * 0.28);
    c.stroke();
    c.lineCap = "butt";
  }
  function icReload(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.65;
    c.beginPath(); c.arc(cx, cy, s * 0.34, -0.5, Math.PI * 1.5); c.stroke();
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(cx + s * 0.34, cy - s * 0.52);
    c.lineTo(cx + s * 0.54, cy - s * 0.16);
    c.lineTo(cx + s * 0.16, cy - s * 0.14);
    c.closePath(); c.fill();
  }
  function icDoc(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.55;
    rr(c, cx - s * 0.3, cy - s * 0.44, s * 0.6, s * 0.88, s * 0.14); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.16, cy - s * 0.14); c.lineTo(cx + s * 0.16, cy - s * 0.14);
    c.moveTo(cx - s * 0.16, cy + s * 0.08); c.lineTo(cx + s * 0.16, cy + s * 0.08);
    c.stroke();
  }
  function icTerm(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.55;
    rr(c, cx - s * 0.44, cy - s * 0.36, s * 0.88, s * 0.72, s * 0.16); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.24, cy - s * 0.08);
    c.lineTo(cx - s * 0.06, cy + s * 0.08);
    c.lineTo(cx - s * 0.24, cy + s * 0.24);
    c.stroke();
    c.beginPath();
    c.moveTo(cx + s * 0.02, cy + s * 0.24); c.lineTo(cx + s * 0.22, cy + s * 0.24);
    c.stroke();
  }
  function icEdit(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.55;
    c.beginPath();
    c.moveTo(cx - s * 0.34, cy + s * 0.34);
    c.lineTo(cx - s * 0.22, cy + s * 0.06);
    c.lineTo(cx + s * 0.26, cy - s * 0.42);
    c.lineTo(cx + s * 0.44, cy - s * 0.24);
    c.lineTo(cx - s * 0.04, cy + s * 0.24);
    c.closePath(); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.34, cy + s * 0.34);
    c.lineTo(cx - s * 0.04, cy + s * 0.24);
    c.stroke();
  }
  function icThink(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.55;
    rr(c, cx - s * 0.44, cy - s * 0.44, s * 0.88, s * 0.88, s * 0.2); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.2, cy - s * 0.2); c.lineTo(cx + s * 0.2, cy + s * 0.2);
    c.moveTo(cx + s * 0.2, cy - s * 0.2); c.lineTo(cx - s * 0.2, cy + s * 0.2);
    c.stroke();
  }
  function icMagnifier(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.6;
    c.beginPath(); c.arc(cx - s * 0.08, cy - s * 0.08, s * 0.32, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(cx + s * 0.16, cy + s * 0.16); c.lineTo(cx + s * 0.42, cy + s * 0.42);
    c.stroke();
  }
  function icWeb(c, cx, cy, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.55;
    c.beginPath(); c.arc(cx, cy, s * 0.44, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(cx - s * 0.44, cy); c.lineTo(cx + s * 0.44, cy);
    c.stroke();
    c.beginPath(); c.ellipse(cx, cy, s * 0.19, s * 0.44, 0, 0, Math.PI * 2); c.stroke();
  }
  /* 奔跑中的鲸尾：两片尾鳍，跟着时间摆 */
  function icWhaleTail(c, cx, cy, s, ph) {
    const a = Math.sin(ph) * 0.42;
    c.save();
    c.translate(cx, cy + s * 0.34);
    c.rotate(a);
    c.fillStyle = DC.deep;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(-s * 0.46, -s * 0.12, -s * 0.6, -s * 0.66);
    c.quadraticCurveTo(-s * 0.24, -s * 0.52, 0, -s * 0.24);
    c.quadraticCurveTo(s * 0.24, -s * 0.52, s * 0.6, -s * 0.66);
    c.quadraticCurveTo(s * 0.46, -s * 0.12, 0, 0);
    c.closePath(); c.fill();
    c.restore();
  }

  /* ============================================================
   *  DSH 左栏
   * ============================================================ */
  function drawDshSidebar(c) {
    const D = S.dsh;
    c.fillStyle = DC.side; c.fillRect(0, 0, DS.side, H);
    c.fillStyle = B3; c.fillRect(DS.side - 0.5, 0, 0.5, H);

    /* 品牌行：logoRow 60 高 → 30，内边距 8 → 4 */
    icWhale(c, 8, 12);
    setFont(c, 9, "600", UI);
    trackInk(c, "deepseek", 22.5, 22, DC.fg1, 0.16);
    /* HARNESS 徽章：名字旁边那枚小牌子 */
    c.fillStyle = "#232427"; c.fillRect(66, 14.5, 26, 7);
    c.strokeStyle = "rgba(255,255,255,.42)"; c.lineWidth = 0.5;
    c.strokeRect(66.25, 14.75, 25.5, 6.5);
    setFont(c, 4.6, "600", UI);
    trackInk(c, "HARNESS", 68.2, 19.5, DC.fg1, 0.26);
    icPanel(c, DS.side - 11, 18, 4.6, DC.fg2);

    /* 新会话：38 高、12 圆角、抬升色 #43454a */
    rr(c, 6, 33, DS.side - 12, 19, 6);
    c.fillStyle = DC.nav; c.fill();
    c.strokeStyle = B4; c.lineWidth = 0.25; c.stroke();
    icChatPlus(c, 57, 42.6, 7, DC.fg1);
    setFont(c, 7, "500", UI);
    ink(c, "新会话", 64, 45.1, DC.fg1, false);

    /* 面板行：32 高 + 2 间隙 → 16 + 1 */
    const rows = [["spark", "插件"], ["clock", "自动化任务"], ["grid", "更多"]];
    for (let i = 0; i < rows.length; i++) {
      const y = 58 + i * 17;
      const cy = y + 8;
      if (i === 0) icSpark(c, 14, cy, 8, DC.fg1);
      else if (i === 1) icClock(c, 14, cy, 8, DC.fg1);
      else icGrid(c, 14, cy, 7.4, DC.fg1);
      setFont(c, 7, "400", UI);
      ink(c, rows[i][1], 21, midBase(y, 16, 7), DC.fg1, false);
    }

    /* 工作区小节头：36 → 18 */
    setFont(c, 6.6, "400", UI);
    ink(c, "工作区", 10, 124, DC.fg3, false);
    icSearch(c, 104, 122, 8, DC.cap);
    icSliders(c, 118, 122, 8, DC.cap);
    icPlusSquare(c, 132, 122, 8, DC.cap);

    /* 工作区树：每行 32 → 16，行距 2 → 1 */
    let y = 131;
    for (let i = 0; i < D.workspaces.length; i++) {
      const w = D.workspaces[i];
      icFolder(c, 10, y + 4, 8, w.active ? "#6f9bff" : "#8a8d93");
      setFont(c, 7, "400", UI);
      ink(c, ellip(c, w.name, 106), 21, midBase(y, 16, 7), DC.fg1, false);
      y += 17;
      if (!w.open) continue;
      for (let k = 0; k < w.sessions.length; k++) {
        const ss = w.sessions[k];
        if (ss.sel) {
          rr(c, 5.5, y, DS.side - 11, 16, 6);
          c.fillStyle = HOV; c.fill();
        }
        if (ss.run) {
          c.fillStyle = DC.blue;
          c.beginPath(); c.arc(14, y + 8, 1.5, 0, Math.PI * 2); c.fill();
        }
        setFont(c, 7, ss.sel ? "500" : "400", UI);
        ink(c, ellip(c, ss.name, 94), 21, midBase(y, 16, 7), ss.sel ? DC.fg1 : DC.fg2, false);
        if (ss.time) {
          setFont(c, 5.6, "400", UI);
          const tw = c.measureText(ss.time).width;
          ink(c, ss.time, DS.side - 10 - tw, midBase(y, 16, 5.6), DC.cap, false);
        }
        y += 17;
      }
    }

  }

  /* ============================================================
   *  DSH 主栏：头部 + 转写
   * ============================================================ */
  function drawDshCenter(c, L, tt) {
    const D = S.dsh;
    const x0 = DS.side, x1 = DS.panelX;
    c.fillStyle = DC.base; c.fillRect(x0, 0, x1 - x0, H);

    /* 头部 76 → 38：标题行 30 → 15，页签行 25 → 12.5 */
    rule(c, x0, DS.header - 0.5, x1 - x0 - 0.5, B3);
    setFont(c, 7.6, "600", UI);
    ink(c, D.title, x0 + 10, 15.2, DC.fg1, false);
    const tx = x0 + 10 + c.measureText(D.title).width + 7;
    /* 预设 chip：一枚小图标 + 13px 的字 */
    icSpark(c, tx + 2.4, 12.2, 5.4, DC.fg3);
    setFont(c, 6.4, "400", UI);
    ink(c, D.preset, tx + 6.4, 15.2, DC.fg3, false);
    icDots(c, x1 - 20, 14.4, DC.fg3);
    icPanel(c, x1 - 7.5, 14.4, 4.4, DC.fg3);

    /* 页签：13px、间距 32 → 6.5 / 16；选中态 business 蓝 + 2px 下划线 */
    let px = x0 + 14;
    for (let i = 0; i < D.tabs.length; i++) {
      setFont(c, 6.5, "500", UI);
      const w = c.measureText(D.tabs[i]).width;
      const act = i === D.tabActive;
      ink(c, D.tabs[i], px, 34.6, act ? DC.blue : DC.fg3, false);
      if (act) { c.fillStyle = DC.blue; c.fillRect(px, 37.2, w, 1); }
      px += w + 16;
    }
    icDots(c, px + 3, 32.6, DC.fg3);

    /* 转写区：内容贴着底部（跟着尾巴走），超出就从上面裁掉 */
    c.save();
    c.beginPath(); c.rect(x0, DS.header, x1 - x0, DS.cardY - DS.header); c.clip();
    drawDshFlow(c, L, tt);
    c.restore();
  }

  /* 转写内容排版：从 0 往下排，返回总高 */
  function dshFlow(tt) {
    const D = S.dsh;
    wrapCtx = g;
    const rows = [];
    let y = 0;

    /* 定时任务触发卡：20 圆角、12/16 内边距 → 10 / 6 8 */
    rows.push({ k: "trigger", y, h: 22 });
    y += 30;

    /* 过程组标题：24 高 → 12 */
    rows.push({ k: "group", y, h: 12, text: D.group });
    y += 13;

    setFont(g, 6.4, "400", UI);
    for (let i = 0; i < D.steps.length; i++) {
      const e = D.steps[i];
      rows.push({ k: e.k, y, h: 12, icon: e.icon, title: e.title, detail: e.detail, suffix: e.suffix, text: e.text });
      y += 14;
    }

    /* 报告（markdown）：段落之间空 6，行高 12 */
    let ansY = y, ansH = 0;
    const shown = dshAnswer(tt);
    if (shown) {
      y += 6;
      const ans = layoutAnswer(shown);
      rows.push({ k: "answer", y, h: ans.h, lines: ans.lines });
      ansY = y; ansH = ans.h;
      y += ans.h + 6;
    }

    /* 现场生成的思维链：一行一条，token 一组一组往外吐 */
    for (let i = 0; i < D.thoughts.length; i++) {
      const th = D.thoughts[i];
      if (tt < th.at) continue;
      const n = streamed(th.text, th.at, th.cps || 8, tt);
      rows.push({ k: "think", y, h: 12, text: th.text.slice(0, n), live: n < th.text.length, thought: true });
      y += 14;
    }

    /* 运行状态：细线 + 鲸尾 + 「深度求索中，用时 Ns」 */
    rows.push({ k: "running", y, h: 16, secs: dshSecs(tt), live: dshLive(tt) });
    y += 16;

    return { rows, h: y, ansY, ansH };
  }

  /* ---------------- 流式：按 token 一组一组吐，不逐字 ---------------- */
  const WORDISH = /[A-Za-z0-9_.\-+/@#%&*]/;
  const tokPlans = new Map();
  /** 把一段字切成 token（CJK 两字一组、拉丁按词），并算好每个 token 的相对时刻 */
  function tokenPlan(text) {
    let plan = tokPlans.get(text);
    if (plan) return plan;
    plan = [];
    let u = 0, n = 0, i = 0;
    while (i < text.length) {
      let tok;
      if (WORDISH.test(text[i])) {
        let j = i;
        while (j < text.length && WORDISH.test(text[j])) j++;
        tok = text.slice(i, j);
      } else if (text[i] === " ") {
        tok = " ";
      } else {
        tok = text.slice(i, i + 2);
      }
      n += tok.length;
      plan.push({ u: u, n: n });
      u += 0.78 + 0.44 * (((i * 37) % 11) / 11);
      i += tok.length;
    }
    tokPlans.set(text, plan);
    return plan;
  }
  /** 到 tt 为止已经吐出来多少字 */
  function streamed(text, at, cps, tt) {
    const plan = tokenPlan(text);
    const el = (tt - at) * cps;
    let n = 0;
    for (let i = 0; i < plan.length; i++) {
      if (plan[i].u > el) break;
      n = plan[i].n;
    }
    return n;
  }
  function dshAnswer(tt) {
    const D = S.dsh;
    const at = D.answerAt === undefined ? 56.8 : D.answerAt;
    if (tt < at) return "";
    const n = streamed(D.answer, at, D.answerCps || 7, tt);
    return D.answer.slice(0, n);
  }
  /** 还有没有东西在往外吐 */
  function dshLive(tt) {
    const D = S.dsh;
    if (dshAnswer(tt).length < D.answer.length) return true;
    for (let i = 0; i < D.thoughts.length; i++) {
      const th = D.thoughts[i];
      if (tt >= th.at && streamed(th.text, th.at, th.cps || 8, tt) < th.text.length) return true;
    }
    return false;
  }

  function dshSecs(tt) {
    const D = S.dsh;
    const at = D.answerAt === undefined ? 56.8 : D.answerAt;
    return Math.max(0, Math.floor((tt - at) + 11));
  }

  /* markdown 只用到「有序列表 + 段落」两样 */
  let wrapCtx = null, ansKey = null, ansVal = null;
  function layoutAnswer(shown) {
    if (shown === ansKey) return ansVal;
    const lines = [];
    let y = 0;
    setFont(wrapCtx, 7, "400", UI);
    const src = shown.split("\n");
    for (let i = 0; i < src.length; i++) {
      let raw = src[i];
      if (!raw) { y += 6; continue; }
      /* 流式吐到一半时可能只有「2」，先补成「2. 」，免得那条横看成一个孤零零的数字 */
      const pm = /^(\d+)/.exec(raw);
      if (pm) raw = pm[1] + ". " + raw.slice(pm[1].length).replace(/^[.、\s]+/, "");
      const m = /^(\d+)\.\s*(.*)$/.exec(raw);
      const ind = m ? 9 : 0;
      const body = m ? m[2] : raw;
      const parts = wrapMixed(wrapCtx, body, DS.textW - ind);
      for (let k = 0; k < parts.length; k++) {
        lines.push({ x: ind, y, s: parts[k], marker: k === 0 && m ? m[1] + "." : null });
        y += 12;
      }
      y += 1;
    }
    ansKey = shown;
    ansVal = { lines, h: Math.max(12, y - 1) };
    return ansVal;
  }

  function drawDshFlow(c, L, tt) {
    const flow = L.flow;
    if (!flow) return;
    const top = L.flowTop;
    const x = DS.textX;

    for (let i = 0; i < flow.rows.length; i++) {
      const r = flow.rows[i];
      const y = top + r.y;
      if (r.k === "trigger") {
        rr(c, x, y, DS.textW, r.h, 10);
        c.fillStyle = "#1b1b1c"; c.fill();
        c.strokeStyle = B1; c.lineWidth = 0.25; c.stroke();
        icClock(c, x + 10, y + r.h / 2, 7.4, DC.fg3);
        setFont(c, 6.8, "400", UI);
        ink(c, ellip(c, S.dsh.trigger.title, DS.textW - 58), x + 18, midBase(y, r.h, 6.8), DC.fg3, false);
        setFont(c, 5.6, "400", UI);
        const tw = c.measureText(S.dsh.trigger.time).width;
        ink(c, S.dsh.trigger.time, x + DS.textW - 8 - tw, midBase(y, r.h, 5.6), DC.cap, false);
      } else if (r.k === "group") {
        icThink(c, x + 4, y + 6, 7, DC.fg3);
        setFont(c, 6.4, "400", UI);
        ink(c, ellip(c, r.text, DS.textW - 12), x + 11, midBase(y, r.h, 6.4), DC.fg3, false);
      } else if (r.k === "think") {
        /* 思考行：图标 + 「思考」 + 点 + 正文，永远一行；吐字时右边缘渐隐 */
        icThink(c, x + 4, y + 6, 7, DC.fg3);
        flowWord(c, x, y, r, "思考", DC.fg3);
      } else if (r.k === "tool") {
        const cy = y + 6;
        if (r.icon === "run") icTerm(c, x + 4, cy, 7.4, DC.fg3);
        else if (r.icon === "search") icMagnifier(c, x + 4, cy, 7.4, DC.fg3);
        else if (r.icon === "web") icWeb(c, x + 4, cy, 7.4, DC.fg3);
        else if (r.icon === "edit") icEdit(c, x + 4, cy, 7.4, DC.fg3);
        else icDoc(c, x + 4, cy, 7.4, DC.fg3);
        setFont(c, 6.4, "400", UI);
        ink(c, r.title, x + 10, midBase(y, r.h, 6.4), DC.fg2, false);
        let tx = x + 10 + c.measureText(r.title).width + 4;
        c.fillStyle = DC.cap;
        c.beginPath(); c.arc(tx, cy, 0.7, 0, Math.PI * 2); c.fill();
        tx += 4;
        setFont(c, 5.8, "400", UI);
        const suffixW = r.suffix ? c.measureText(r.suffix).width + 6 : 0;
        const detail = ellip(c, r.detail, DS.textW - (tx - x) - suffixW);
        ink(c, detail, tx, midBase(y, r.h, 5.8) + 0.3, DC.fg3, false);
        if (r.suffix) {
          const sw = c.measureText(r.suffix).width;
          ink(c, r.suffix, x + DS.textW - sw, midBase(y, r.h, 5.8) + 0.3, DC.cap, false);
        }
      } else if (r.k === "answer") {
        for (let k = 0; k < r.lines.length; k++) {
          const ln = r.lines[k];
          setFont(c, 7, "400", UI);
          if (ln.marker) ink(c, ln.marker, x, y + ln.y + 9.6, DC.fg2, false);
          ink(c, ln.s, x + ln.x, y + ln.y + 9.6, DC.fg1, true);
        }
        /* 还在吐字：末尾一颗方块光标 */
        const D = S.dsh;
        const shown = dshAnswer(tt);
        if (shown.length < D.answer.length && blinkOn(tt) && r.lines.length) {
          const last = r.lines[r.lines.length - 1];
          setFont(c, 7, "400", UI);
          const lw = c.measureText(last.s).width;
          c.fillStyle = DC.fg1;
          c.fillRect(x + last.x + lw + 1, y + last.y + 2.2, 3.2, 8);
        }
      } else if (r.k === "running") {
        rule(c, x, y - 2, DS.textW, "rgba(255,255,255,.09)");
        icWhaleTail(c, x + 4.4, y + 8.6, 7, tt * 5.2);
        setFont(c, 6.4, "400", UI);
        ink(c, "深度求索中，用时 " + r.secs + "s ···", x + 11, midBase(y, r.h, 6.4) + 1, DC.deep, true);
      }
    }
  }

  /** 一行「标题 · 正文」：正文吐字时右边缘渐隐，吐完变省略号 */
  function flowWord(c, x, y, r, title, col) {
    const cy = y + 6;
    setFont(c, 6.4, "400", UI);
    ink(c, title, x + 10, midBase(y, r.h, 6.4), DC.fg2, false);
    let tx = x + 10 + c.measureText(title).width + 4;
    c.fillStyle = DC.cap;
    c.beginPath(); c.arc(tx, cy, 0.7, 0, Math.PI * 2); c.fill();
    tx += 4;
    setFont(c, 6.4, "400", UI);
    const w = x + DS.textW - 3 - tx;        /* 右边留 3px 气口 */
    const tw = c.measureText(r.text).width;
    const base = midBase(y, r.h, 6.4);
    if (tw <= w) { ink(c, r.text, tx, base, col, false); return; }
    /* 一行放不下：当传送带使——最新的字咬住右边，左边的推出画面 */
    c.save();
    c.beginPath(); c.rect(tx, y, w, r.h); c.clip();
    ink(c, r.text, tx + w - tw, base, col, false);
    const gg = c.createLinearGradient(tx, 0, tx + 22, 0);
    gg.addColorStop(0, "rgba(21,21,23,1)");
    gg.addColorStop(1, "rgba(21,21,23,0)");
    c.fillStyle = gg;
    c.fillRect(tx, y, 22, r.h);
    c.restore();
  }

  /* ============================================================
   *  DSH 底部输入卡
   * ============================================================ */
  function drawDshComposer(c, L, tt) {
    const x0 = DS.side, x1 = DS.panelX;
    /* 转写区在输入卡上沿淡出（36 → 18 的遮罩带） */
    const g0 = c.createLinearGradient(0, DS.cardY - 20, 0, DS.cardY + 2);
    g0.addColorStop(0, "rgba(21,21,23,0)");
    g0.addColorStop(1, "rgba(21,21,23,1)");
    c.fillStyle = g0;
    c.fillRect(x0, DS.cardY - 20, x1 - x0, 22);

    rr(c, DS.cardX, DS.cardY, DS.cardW, DS.cardH, 14);
    c.fillStyle = DC.l2; c.fill();
    c.strokeStyle = B2; c.lineWidth = 0.3; c.stroke();

    setFont(c, 7, "400", UI);
    ink(c, "发消息或创建任务, / 调用指令, @ 文件或对话", DS.cardX + 7, DS.cardY + 15.4, DC.cap, false);

    /* 工具行：8/2/6 内边距 → 4/1/3，控件 28 高 → 14 */
    const ry = DS.cardY + 30;
    c.fillStyle = DC.l3;
    c.beginPath(); c.arc(DS.cardX + 11, ry + 7, 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = DC.fg1; c.lineWidth = 0.7; c.lineCap = "round";
    c.beginPath();
    c.moveTo(DS.cardX + 8, ry + 7); c.lineTo(DS.cardX + 14, ry + 7);
    c.moveTo(DS.cardX + 11, ry + 4); c.lineTo(DS.cardX + 11, ry + 10);
    c.stroke(); c.lineCap = "butt";

    icShield(c, DS.cardX + 25, ry + 7, 6.4, DC.fg2);
    setFont(c, 6.4, "500", UI);
    ink(c, "完全权限", DS.cardX + 30, ry + 9.3, DC.fg2, false);
    icChevron(c, DS.cardX + 30 + c.measureText("完全权限").width + 5, ry + 7.6, 4.4, DC.cap);

    /* 右侧：模型名 + 发送键（空输入的 40% 压暗，色值取真实截图） */
    setFont(c, 6.4, "400", UI);
    const mw = c.measureText(S.dsh.model).width;
    const sendX = DS.cardX + DS.cardW - 4 - 17;
    ink(c, S.dsh.model, sendX - 10 - mw, ry + 9.3, DC.fg3, false);
    icChevron(c, sendX - 5, ry + 7.6, 4.4, DC.cap);
    c.fillStyle = DC.send;
    c.beginPath(); c.arc(sendX + 8.5, ry + 7, 8.5, 0, Math.PI * 2); c.fill();
    icArrowUp(c, sendX + 8.5, ry + 7, 7, DC.sendHi);

    /* 卡片下方那排读数：22 高 → 11 的次级灰 */
    const sy = DS.cardY + DS.cardH + 7.5;
    setFont(c, 5.6, "400", UI);
    let sx = x0 + 20;
    c.strokeStyle = DC.cap; c.lineWidth = 0.5;
    c.beginPath(); c.arc(sx - 3.6, sy - 1.8, 2.2, 0.8, Math.PI * 2.05); c.stroke();
    c.fillStyle = DC.cap;
    c.fillRect(sx - 4.8, sy - 3.4, 0.9, 0.9);
    ink(c, S.dsh.stats[0], sx, sy, DC.cap, false);
    sx += c.measureText(S.dsh.stats[0]).width + 8;
    c.fillStyle = DC.cap;
    c.fillRect(sx - 4.2, sy - 3.6, 4.6, 0.8);
    c.fillRect(sx - 3.6, sy - 2.2, 3.4, 0.8);
    ink(c, S.dsh.stats[1], sx + 2, sy, DC.cap, false);
    sx += c.measureText(S.dsh.stats[1]).width + 12;
    c.strokeStyle = DC.cap; c.lineWidth = 0.55;
    c.beginPath(); c.arc(sx - 3.2, sy - 1.8, 2.4, -0.4, Math.PI * 1.72); c.stroke();
    ink(c, S.dsh.stats[2], sx + 2, sy, DC.cap, false);
    void L;
  }

  /* ============================================================
   *  DSH 右栏：页签条 + 浏览器工具栏 + 那个帖子
   * ============================================================ */
  let pageBuf = null, fctx = null, pageH = 0, pageImgY = 0, pageImgH = 0;

  function ensurePage() {
    if (pageBuf) return;
    ensureShot();
    const pad = DS.pagePad;
    const cw = DS.panelW - pad * 2;
    const imgH = Math.round(cw * 9 / 16);
    if (!fctx) {
      pageBuf = document.createElement("canvas");
      fctx = pageBuf.getContext("2d");
    }
    fctx.setTransform(DQ, 0, 0, DQ, 0, 0);
    /* 先排版：把回复按宽度折好，量出整页高度 */
    let y = 17 + 7 + 11;
    setFont(fctx, 8, "700", UI);
    const titleLines = wrapMixed(fctx, F.title, cw);
    y += titleLines.length * 10 + 4 + 9;
    const imgY = y + 2;
    y = imgY + imgH + 10;
    const rows = [];
    for (let i = 0; i < F.replies.length; i++) {
      const r = F.replies[i];
      setFont(fctx, 7, r.big ? "500" : "400", UI);
      const lines = wrapMixed(fctx, r.text, cw - 62);
      rows.push({ who: r.who, lines, big: r.big, y });
      y += Math.max(15, lines.length * 9 + 7);
    }
    pageH = Math.round(y + 10);
    pageImgY = imgY; pageImgH = imgH;

    pageBuf.width = DS.panelW * DQ;
    pageBuf.height = pageH * DQ;
    fctx.setTransform(DQ, 0, 0, DQ, 0, 0);
    fctx.clearRect(0, 0, DS.panelW, pageH);

    /* 论坛是深色站：底色比 DSH 再冷一点 */
    fctx.fillStyle = "#0c1016"; fctx.fillRect(0, 0, DS.panelW, pageH);
    fctx.fillStyle = "#0f141b"; fctx.fillRect(0, 0, DS.panelW, 17);
    rule(fctx, 0, 17, DS.panelW, "#1d2836");
    setFont(fctx, 8, "700", UI);
    trackInk(fctx, F.logo, pad, 12, "#7db9ff", 0.1);
    setFont(fctx, 5.8, "400", UI);
    ink(fctx, F.board, pad + 47, 11.6, "#8fa3b8", false);
    setFont(fctx, 5.6, "400", UI);
    const backW = fctx.measureText(F.back).width;
    ink(fctx, F.back, DS.panelW - pad - backW, 11.6, "#e0a458", false);

    setFont(fctx, 5.6, "400", UI);
    ink(fctx, F.tab, pad, 26, "#55677a", false);

    setFont(fctx, 8, "700", UI);
    for (let i = 0; i < titleLines.length; i++) {
      ink(fctx, titleLines[i], pad, 39 + i * 10, "#dce3ec", true);
    }
    setFont(fctx, 5.8, "400", UI);
    const by = 39 + titleLines.length * 10 + 1;
    ink(fctx, F.op, pad, by, "#63e6a5", false);
    const opw = fctx.measureText(F.op).width;
    ink(fctx, " · " + F.time + " · " + F.views + " views", pad + opw, by, "#55677a", false);

    /* 帖子里那张图 = 终端最后一帧 */
    fctx.fillStyle = "#070a0e"; fctx.fillRect(pad, imgY, cw, imgH);
    paintShot(fctx, pad, imgY, cw, imgH);
    fctx.strokeStyle = "#26313f"; fctx.lineWidth = 0.5;
    fctx.strokeRect(pad + 0.25, imgY + 0.25, cw - 0.5, imgH - 0.5);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      rule(fctx, pad, r.y - 5, cw, "#1a222d");
      setFont(fctx, 5.8, "400", UI);
      ink(fctx, r.who, pad, r.y + 4, r.big ? "#ffb37a" : "#7db9ff", false);
      setFont(fctx, 7, r.big ? "500" : "400", UI);
      for (let k = 0; k < r.lines.length; k++) {
        ink(fctx, r.lines[k], pad + 62, r.y + 4 + k * 9, r.big ? "#f2e3d5" : "#c9d3e0", true);
      }
    }
    fctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** 侧栏预览的滚动量：read 事件把它往下带 */
  function panelScroll(tt) {
    const viewH = H - DS.header;
    const max = Math.max(0, pageH - viewH);
    const rd = lastEvent("read", tt);
    if (!rd || rd.target !== "panel") return 0;
    const k = smoothstep(clamp((tt - rd.at) / (rd.dur || 2.4), 0, 1));
    return lerp(0, max, k);
  }

  function drawDshPanel(c, L, tt) {
    const X = DS.panelX, PW = DS.panelW;
    c.fillStyle = DC.base; c.fillRect(X, 0, PW, H);
    c.fillStyle = B4; c.fillRect(X, 0, 0.5, H);

    /* 页签条：38 → 19，页签 28 高 / 10 内边距 → 14 / 5 */
    const tabY = 5, tabH = 14;
    setFont(c, 6.5, "400", UI);
    const tabName = S.dsh.panelTab;
    const tw = Math.min(78, Math.max(40, c.measureText(tabName).width + 26));
    rr(c, X + 5, tabY, tw, tabH, 4);
    c.fillStyle = DC.l2; c.fill();
    icGlobe(c, X + 11, tabY + 7, 6.4, DC.fg2);
    setFont(c, 6.5, "400", UI);
    ink(c, ellip(c, tabName, tw - 26), X + 15, tabY + 9.4, DC.fg1, false);
    icCross(c, X + 5 + tw - 6, tabY + 7, 4.6, DC.fg3);

    /* 浏览器工具栏：38 → 19 */
    rule(c, X, DS.header - 0.5, PW - 0.5, B3);
    icArrow(c, X + 10, DS.strip + 9.5, 7, DC.fg3, -1);
    icArrow(c, X + 26, DS.strip + 9.5, 7, DC.cap, 1);
    icReload(c, X + 42, DS.strip + 9.5, 7, DC.fg3);
    const ax = X + 54, aw = PW - 54 - 5;
    rr(c, ax, DS.strip + 2.5, aw, 14, 4);
    c.fillStyle = DC.l1; c.fill();
    c.strokeStyle = B2; c.lineWidth = 0.25; c.stroke();
    setFont(c, 5.9, "400", UI);
    ink(c, ellip(c, S.dsh.url, aw - 12), ax + 6, DS.strip + 12.2, DC.fg2, false);

    /* 页面本体：整页一次性画进缓冲，只按滚动量裁一块出来 */
    const scroll = panelScroll(tt);
    c.save();
    c.beginPath(); c.rect(X, DS.header, PW, H - DS.header); c.clip();
    c.imageSmoothingEnabled = false;
    c.drawImage(
      pageBuf,
      0, Math.round(scroll * DQ), PW * DQ, (H - DS.header) * DQ,
      X, DS.header, PW, H - DS.header
    );
    c.restore();
    void L;
  }

  function layoutDsh(tt) {
    ensurePage();
    const flow = dshFlow(tt);
    const top = Math.min(DS.textTop, DS.textBot - flow.h);
    const viewH = H - DS.header;
    const scroll = panelScroll(tt);
    const cx = DS.side + (DS.panelX - DS.side) / 2;
    const mainY = clamp(top + flow.h - 46, 120, 236);
    /* 思维链那一行：没出现时先落在主栏尾巴上，出现后镜头跟着它走 */
    const th = flow.rows.filter(r => r.thought).pop();
    const thinkY = th ? clamp(top + th.y + 6, 120, 300) : mainY;
    return {
      flow, flowTop: top,
      anchors: {
        dshAll: { x: W / 2, y: H / 2 },
        /* 侧栏里那张截图（页面坐标 → 内容坐标） */
        img: {
          x: DS.panelX + DS.panelW / 2,
          y: DS.header + pageImgY - scroll + pageImgH / 2
        },
        /* 侧栏视窗中心：页面在里面往下滚 */
        panel: { x: DS.panelX + DS.panelW / 2, y: DS.header + viewH * 0.42 },
        /* 主栏：横向对准中栏，纵向跟住转写区底部（新吐出来的那一行） */
        main: { x: cx, y: mainY },
        think: { x: cx, y: thinkY }
      }
    };
  }

  function drawDsh(c, L, tt) {
    drawDshSidebar(c);
    drawDshCenter(c, L, tt);
    drawDshComposer(c, L, tt);
    drawDshPanel(c, L, tt);
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function layoutImage() {
    return { anchors: { image: { x: 320, y: 180 }, image_wish: mapWish() } };
  }
  function layoutBlack() {
    return { anchors: { saved: { x: 320, y: 180 } } };
  }

  function drawImageScene(c, tt) {
    c.fillStyle = "#05070A"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#0A0D12"; c.fillRect(IMG2.x, IMG2.y, IMG2.w, IMG2.h);
    if (shot) {
      c.imageSmoothingEnabled = true;
      c.drawImage(shot, IMG2.x, IMG2.y, IMG2.w, IMG2.h);
      const px = eventAt("pixelate", tt);
      if (px && shotLow) {
        c.globalAlpha = clamp((tt - px.at) / 6, 0, 1);
        c.imageSmoothingEnabled = false;
        c.drawImage(shotLow, IMG2.x, IMG2.y, IMG2.w, IMG2.h);
        c.globalAlpha = 1;
      }
    }
    c.strokeStyle = "#1B2230"; c.lineWidth = 1;
    c.strokeRect(IMG2.x + 0.5, IMG2.y + 0.5, IMG2.w - 1, IMG2.h - 1);

    const sw = eventAt("sweep", tt);
    if (sw && shotWish) {
      const k = clamp((tt - sw.at) / 1.6, 0, 1);
      const x = IMG2.x + shotWish.x / W * IMG2.w;
      const y = IMG2.y + shotWish.y / H * IMG2.h;
      const w = shotWish.w / W * IMG2.w;
      const h = shotWish.h / H * IMG2.h;
      c.fillStyle = "rgba(90,140,255,.30)";
      c.fillRect(x, y, w * smoothstep(k), h);
    }
  }

  function drawBlackScene(c, tt) {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    const fin = S.final;
    if (!fin) return;            /* 片尾已经改成淡出，这一段只作兜底 */
    const shown = clamp(Math.floor((tt - fin.at) * fin.cps), 0, fin.text.length);
    const str = fin.text.slice(0, shown);
    setFont(c, 13);
    const tw = c.measureText(fin.text).width;
    const x = 320 - tw / 2, y = 186;
    ink(c, str, x, y, "#9AA5B4", FRINGE);
    const stopAt = fin.at + fin.text.length / fin.cps + 3.0;
    if (tt < stopAt && blinkOn(tt)) {
      c.fillStyle = "#9AA5B4";
      c.fillRect(x + c.measureText(str).width + 3, y - 11, 7, 14);
    }
  }

  /* ============================================================
   *  镜头：跟着焦点走（一阶低通）
   * ============================================================ */
  function anchorPoint(name) {
    const a = CUR.anchors && CUR.anchors[name];
    return a || { x: 320, y: 180 };
  }

  function focusAt(tt, L) {
    /* 显式焦点：切到贴吧那种「先咬住一块、再拉远」的镜头靠它 */
    const fo = lastEvent("focus", tt);
    if (fo && L.anchors && L.anchors[fo.to]) return L.anchors[fo.to];
    /* DSH 那一幕：镜头按 read 事件指定的目标走（侧栏 / 主会话） */
    if (L.anchors && L.anchors.dshAll) {
      const rd = lastEvent("read", tt);
      return (rd && L.anchors[rd.target]) ? L.anchors[rd.target] : L.anchors.dshAll;
    }
    /* 拖选的时候镜头就停在选中的那一行上 */
    const down = eventAt("mousedown", tt);
    if (down) {
      const idx = down.line !== undefined ? down.line : (L.lastBody || 0);
      const a = L.anchors["tl" + idx], b = L.anchors["tl" + idx + "e"], m = mousePos(L, tt);
      if (a && b) {
        const x = m ? (a.x + clamp(m.x, a.x, b.x)) / 2 : (a.x + b.x) / 2;
        return { x: x, y: a.y };
      }
    }
    const m = mousePos(L, tt);
    if (m) {
      /* 往下读的那一段：纵向跟指针，横向固定在文字中间，整行才不被切掉 */
      if (lastEvent("read", tt) && !down) return { x: 310, y: m.y };
      return m;
    }
    const act = activeInput(tt);
    if (act) {
      /* 在底部输入框里打字：跟着「已经敲出来的这一段的中心」走 */
      setFont(g, 13);
      const vl = wrapChars(g, typed(act, tt), 470);
      const last = vl.length ? vl[vl.length - 1] : "";
      const w = g.measureText(last).width;
      return {
        x: clamp(PAD + 18 + w / 2, 60, W - 60),
        y: (L.anchors.cursor ? L.anchors.cursor.y : BOX_TOP + 21) - 26
      };
    }
    /* 思考中：盯着那句 Thought */
    for (let i = S.events.length - 1; i >= 0; i--) {
      const e = S.events[i];
      if (e.type !== "think" || e.at > tt) continue;
      if (tt < e.at + e.dur) return L.anchors.think_row || L.anchors.cursor;
      break;
    }
    /* 否则盯着最后一块内容（只有终端布局才有 base） */
    const lastB = L.blocks && L.blocks[L.blocks.length - 1];
    if (lastB && typeof L.base === "number") {
      /* 横向对准这段文字自己的中心，别死盯 320：正文靠左，盯中间会把句首切掉 */
      let x = 320;
      if (lastB.lines && lastB.lines.length) {
        setFont(g, 13);
        let wmax = 0;
        for (let i = 0; i < lastB.lines.length; i++) wmax = Math.max(wmax, g.measureText(lastB.lines[i]).width);
        x = PAD + (lastB.kind === "reply" ? 14 : 18) + wmax / 2;
      }
      return { x: x, y: L.base + lastB.y + lastB.h / 2 };
    }
    return L.anchors.post || L.anchors.image || L.anchors.saved || L.anchors.cursor || { x: 320, y: 180 };
  }

  /** 镜头不许越过内容层的边：越过去就只剩背景了。
   *  但高倍特写时允许往外探一点点（60px），否则贴着左边缘的光标永远对不正。 */
  function clampCam(c) {
    const hw = (SW / 2) / c.s, hh = (SH / 2) / c.s;
    const mx = Math.min(hw, 60), my = Math.min(hh, 40);
    c.x = hw * 2 >= W ? W / 2 : clamp(c.x, hw - mx, W - hw + mx);
    c.y = hh * 2 >= H ? H / 2 : clamp(c.y, hh - my, H - hh + my);
    return c;
  }

  function camStep(target, sTarget, dt) {
    if (!CAM) { CAM = clampCam({ x: target.x, y: target.y, s: sTarget }); return; }
    const k = 1 - Math.exp(-dt / 0.85);
    const ks = 1 - Math.exp(-dt / 1.1);
    CAM.x += (target.x - CAM.x) * k;
    CAM.y += (target.y - CAM.y) * k;
    CAM.s += (sTarget - CAM.s) * ks;
    clampCam(CAM);
  }

  function camReset(tt) {
    CAM = null;
    lastScene = "";
    const back = 2.2, steps = 18;
    const t0 = Math.max(0, tt - back);
    for (let i = 0; i <= steps; i++) {
      const tk = t0 + (tt - t0) * (i / steps);
      const L = layoutFor(tk);
      CUR = L;
      camStep(focusAt(tk, L), scaleAt(tk), (back / steps));
    }
  }

  function cameraAt() {
    const cam = CAM || { x: 320, y: 180, s: 3 };
    const breathe = 1 + 0.010 * Math.sin(t * 0.63 + 0.7);
    const jx = 0.35 * Math.sin(t * 1.7 + 1.1) + 0.18 * Math.sin(t * 3.1 + 0.3);
    const jy = 0.32 * Math.cos(t * 1.3 + 0.4) + 0.18 * Math.sin(t * 3.7 + 1.9);
    return clampCam({ s: cam.s * breathe, x: cam.x + jx, y: cam.y + jy });
  }

  /* ============================================================
   *  光学层
   * ============================================================ */
  let gridCache = new Map(), gridPat = new Map();
  let grillePat = null, grainTiles = [], dustSprites = [], vigGrad = null;
  let FILTER_OK = false, bloomCv = null, bloomCtx = null;

  function makeGrille() {
    const c = document.createElement("canvas");
    c.width = 3; c.height = 4;
    const q = c.getContext("2d");
    q.fillStyle = "#FF0000"; q.fillRect(0, 0, 1, 4);
    q.fillStyle = "#00FF00"; q.fillRect(1, 0, 1, 4);
    q.fillStyle = "#0000FF"; q.fillRect(2, 0, 1, 4);
    return c;
  }
  function makeGrain(k) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const q = c.getContext("2d");
    const img = q.createImageData(256, 256);
    let s = k * 7919 + 17;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = (s >> 16) & 0xff;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    q.putImageData(img, 0, 0);
    return c;
  }
  function makeDust(r, blur, alpha) {
    const d = Math.ceil(r * 2 + blur * 4);
    const c = document.createElement("canvas");
    c.width = c.height = d;
    const q = c.getContext("2d");
    const gr = q.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, r);
    gr.addColorStop(0, "rgba(235,240,255," + alpha + ")");
    gr.addColorStop(0.55, "rgba(210,225,255," + (alpha * 0.55) + ")");
    gr.addColorStop(1, "rgba(200,220,255,0)");
    q.fillStyle = gr;
    q.beginPath(); q.arc(d / 2, d / 2, r, 0, Math.PI * 2); q.fill();
    return c;
  }

  function buildAssets() {
    grillePat = null;
    grainTiles = [0, 1, 2, 3].map(makeGrain);
    dustSprites = [
      { img: makeDust(9, 3, 0.55), x: 210, y: 150 },
      { img: makeDust(6, 2, 0.40), x: 980, y: 520 },
      { img: makeDust(14, 5, 0.30), x: 1350, y: 190 },
      { img: makeDust(26, 10, 0.22), x: 420, y: 760 },
      { img: makeDust(34, 14, 0.16), x: 1120, y: 830 }
    ];
  }

  function gridTileFor(n) {
    let c = gridCache.get(n);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = n; c.height = n;
    const q = c.getContext("2d");
    q.fillStyle = "rgba(0,0,0,0.45)";
    q.fillRect(0, 0, 1, n);
    q.fillRect(0, 0, n, 1);
    gridCache.set(n, c);
    if (gridCache.size > 48) gridCache.clear();
    return c;
  }

  function drawGrid(ox, oy, s) {
    const n = 4;
    let pat = gridPat.get(n);
    if (!pat) { pat = ctx.createPattern(gridTileFor(n), "repeat"); gridPat.set(n, pat); }
    const k = s / n;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.72;
    ctx.translate(ox, oy);
    ctx.scale(k, k);
    ctx.fillStyle = pat;
    ctx.fillRect(-ox / k, -oy / k, SW / k, SH / k);
    ctx.restore();
  }

  function drawGrille(tt, s) {
    if (!grillePat) grillePat = ctx.createPattern(makeGrille(), "repeat");
    if (!layers.sub) return;
    const p = s * 1.022;
    const rad = (0.15 + 1.05 * (tt / DUR)) * Math.PI / 180;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.42;
    ctx.translate(SW / 2, SH / 2);
    ctx.rotate(rad);
    ctx.scale(p / 3, 1);
    ctx.fillStyle = grillePat;
    ctx.fillRect(-SW, -SH, SW * 2, SH * 2);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.05;
    ctx.fillRect(-SW, -SH, SW * 2, SH * 2);
    ctx.restore();
  }

  function drawBloom(ox, oy, s, src) {
    if (!bloomCtx) return;
    bloomCtx.clearRect(0, 0, 200, 112);
    bloomCtx.imageSmoothingEnabled = true;
    bloomCtx.drawImage(src || content, 0, 0, 200, 112);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.16;
    if (FILTER_OK) ctx.filter = "blur(7px)";
    ctx.drawImage(bloomCv, ox, oy, W * s, H * s);
    ctx.restore();
    ctx.filter = "none";
  }

  function drawDust(tt) {
    for (let i = 0; i < dustSprites.length; i++) {
      const d = dustSprites[i];
      const x = d.x + Math.sin(tt * 0.11 + i) * 14 + tt * 0.6;
      const y = d.y + Math.cos(tt * 0.09 + i * 1.7) * 10;
      ctx.drawImage(d.img, x - d.img.width / 2, y - d.img.width / 2);
    }
  }

  function drawVignette() {
    if (!vigGrad) {
      vigGrad = ctx.createRadialGradient(SW / 2, SH / 2, SH * 0.42, SW / 2, SH / 2, SH * 1.02);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,.50)");
    }
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, SW, SH);
  }

  function drawGrain(tt) {
    const tile = grainTiles[Math.floor(tt * 12) % grainTiles.length];
    const pat = ctx.createPattern(tile, "repeat");
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.042;
    ctx.translate((tt * 733) % 256, (tt * 477) % 256);
    ctx.fillStyle = pat;
    ctx.fillRect(-256, -256, SW + 512, SH + 512);
    ctx.restore();
  }

  function drawFlash(tt) {
    const e = lastEvent("flash", tt);
    if (!e || tt > e.at + e.dur) return;
    ctx.fillStyle = "rgba(255,255,255," + (1 - (tt - e.at) / e.dur) * 0.95 + ")";
    ctx.fillRect(0, 0, SW, SH);
  }

  function drawOptics(tt) {
    const k = cv.width / SW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SW, SH);

    const cam = cameraAt();
    const s = cam.s;
    const ox = SW / 2 - cam.x * s;
    const oy = SH / 2 - cam.y * s;

    /* DSH 那一幕画在 3 倍采样上，贴过来时开平滑；其余场景保持像素颗粒 */
    const src = (lastScene === "dsh" && dshCv) ? dshCv : content;
    ctx.imageSmoothingEnabled = src !== content;
    ctx.drawImage(src, ox, oy, W * s, H * s);
    /* 栅格与摩尔纹只属于屏幕本身：裁到内容区里，屏幕外的机器边框是干净的 */
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, W * s, H * s); ctx.clip();
    if (layers.grid) drawGrid(ox, oy, s);
    if (layers.moire) drawGrille(tt, s);
    ctx.restore();
    /* 屏幕边缘：一条极细的亮边 + 外面压暗，看得出这是一块屏 */
    ctx.strokeStyle = "rgba(120,140,170,.28)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + 0.75, oy + 0.75, W * s - 1.5, H * s - 1.5);
    if (layers.bloom && FILTER_OK) drawBloom(ox, oy, s, src);
    if (layers.dust) drawDust(tt);
    drawVignette();
    if (layers.grain) drawGrain(tt);
    drawFlash(tt);
    drawFade(tt);
  }

  /** 收尾：整幅压到黑（不给「已保存」那种交代） */
  function drawFade(tt) {
    const e = lastEvent("fade", tt);
    if (!e) return;
    const k = clamp((tt - e.at) / (e.dur || 1.6), 0, 1);
    if (k <= 0) return;
    ctx.fillStyle = "rgba(0,0,0," + smoothstep(k).toFixed(3) + ")";
    ctx.fillRect(0, 0, SW, SH);
  }

  /* ============================================================
   *  一帧
   * ============================================================ */
  function layoutFor(tt) {
    /* DSH 那一幕要用的截图和侧栏那一页都很重：读思维链那一段就分两拍排好，
       别把这两笔开销挤在硬切那一下（会掉帧） */
    if (tt > 40.5 && !shot) ensureShot();
    if (tt > 47.2 && !pageBuf) ensurePage();
    const scene = sceneAt(tt);
    if (scene === "terminal") return layoutTerminal(tt);
    if (scene === "dsh") return layoutDsh(tt);
    if (scene === "forum") { ensureShot(); return layoutForum(tt); }
    if (scene === "image") { ensureShot(); return layoutImage(); }
    ensureShot();
    return layoutBlack();
  }

  function renderAt(tt, dt) {
    if (!ctx || !content) return;
    const t0 = performance.now();
    const scene = sceneAt(tt);
    const L = layoutFor(tt);
    CUR = L;

    /* 切场景 / 硬切：镜头别恋恋不舍地滑过去 */
    if (scene !== lastScene) { lastScene = scene; CAM = null; }
    const cut = lastEvent("cut", tt);
    if (cut && Math.abs(tt - cut.at) < 0.05) CAM = null;

    camStep(focusAt(tt, L), scaleAt(tt), dt || 1 / 60);
    FRINGE = (CAM ? CAM.s : 3) >= 3;

    g.setTransform(Q, 0, 0, Q, 0, 0);
    if (scene === "dsh" && dshG) {
      dshG.setTransform(DQ, 0, 0, DQ, 0, 0);
      dshG.clearRect(0, 0, W, H);
      drawDsh(dshG, L, tt);
    } else if (scene === "terminal") drawTerminal(g, L, tt, false);
    else if (scene === "forum") drawForum(g, L, tt);
    else if (scene === "image") drawImageScene(g, tt);
    else drawBlackScene(g, tt);

    drawOptics(tt);
    lastMs = performance.now() - t0;
  }

  function ensureShot() {
    if (shot && shotWish) return;
    const at = S.meta.shotAt || 53.6;
    const L = layoutTerminal(at);
    CUR = L;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W * Q, H * Q);
    g.setTransform(Q, 0, 0, Q, 0, 0);
    drawTerminal(g, L, at, true);
    g.setTransform(1, 0, 0, 1, 0, 0);
    shotCtx.clearRect(0, 0, W * Q, H * Q);
    shotCtx.drawImage(content, 0, 0);
    if (L.wishRect) shotWish = L.wishRect;
    shotLowCtx.imageSmoothingEnabled = true;
    shotLowCtx.clearRect(0, 0, 160, 90);
    shotLowCtx.drawImage(content, 0, 0, 160, 90);
  }

  /* ============================================================
   *  声音
   * ============================================================ */
  function sfx(name) {
    if (!AUDIO_ON || typeof AUDIO === "undefined") return;
    try { AUDIO.sfx(name); } catch (e) {}
  }

  /** 已经「流」出来的总字数：每多一个字，敲一下键盘 */
  function revealCount(tt) {
    let n = 0;
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type !== "input" && e.type !== "reply") continue;
      if (e.at > tt) break;
      n += typed(e, tt).length;
    }
    return n;
  }

  function cues(tt) {
    for (let i = cueIdx; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.at > tt) break;
      if (e.sfx && e.at > prevT) sfx(e.sfx);
      cueIdx = i + 1;
    }
    prevT = tt;

    /* 光标每亮一次，一声很轻的「嗒」 */
    const b = blinkOn(tt);
    if (b !== lastBlink) {
      lastBlink = b;
      if (b && sceneAt(tt) === "terminal") sfx("tick");
    }

    /* 流式输出：多出来几个字就响几声（一帧最多补三下，免得糊成一片） */
    const n = revealCount(tt);
    const d = n - lastReveal;
    if (d > 0) for (let i = 0; i < Math.min(d, 3); i++) sfx("key");
    lastReveal = n;
  }

  /* ============================================================
   *  生命周期
   * ============================================================ */
  function size() {
    if (!cv) return;
    gain = (typeof ENGINE !== "undefined" && ENGINE.canvasGain) ? ENGINE.canvasGain : 1;
    gain = clamp(gain || 1, 1, 1.5);
    const w = Math.round(SW * gain), h = Math.round(SH * gain);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w; cv.height = h;
      gridPat.clear(); vigGrad = null; grillePat = null;
    }
  }

  function init() {
    if (cv) return true;
    cv = $("opCanvas");
    if (!cv) return false;
    ctx = cv.getContext("2d");
    if (!ctx) return false;

    /* 内容按 Q 倍分辨率画，镜头推近时才不糊（布局仍然用 640×360 的坐标） */
    content = document.createElement("canvas");
    content.width = W * Q; content.height = H * Q;
    g = content.getContext("2d");

    dshCv = document.createElement("canvas");
    dshCv.width = W * DQ; dshCv.height = H * DQ;
    dshG = dshCv.getContext("2d");

    shot = document.createElement("canvas");
    shot.width = W * Q; shot.height = H * Q;
    shotCtx = shot.getContext("2d");

    shotLow = document.createElement("canvas");
    shotLow.width = 160; shotLow.height = 90;
    shotLowCtx = shotLow.getContext("2d");

    bloomCv = document.createElement("canvas");
    bloomCv.width = 200; bloomCv.height = 112;
    bloomCtx = bloomCv.getContext("2d");

    ctx.filter = "blur(2px)";
    FILTER_OK = ctx.filter && ctx.filter !== "none";
    ctx.filter = "none";

    buildAssets();
    size();

    /* 事件索引（打字节奏的随机种子）、高度变化点 */
    HEIGHT_EVENTS = [];
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      e.__i = i;
      if (e.type === "scene") break;
      if (e.type === "input") { schedule(e); HEIGHT_EVENTS.push(e.__submitAt); }
      else if (e.type === "reply" || e.type === "think") HEIGHT_EVENTS.push(e.at);
    }
    HEIGHT_EVENTS.sort((a, b) => a - b);

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", () => { if (cv) { size(); if (!playing) renderAt(t, 0.016); } });
    return true;
  }

  function onKey(e) {
    if (!playing || preview) return;
    if (performance.now() - startedAt < 400) return;
    e.preventDefault(); e.stopPropagation(); skip();
  }
  function onPointer(e) {
    if (!playing || preview) return;
    if (performance.now() - startedAt < 400) return;
    if (e.target !== cv) return;
    e.preventDefault(); e.stopPropagation(); skip();
  }

  function loop(now) {
    if (!playing) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    if (t >= DUR) { t = DUR; renderAt(t, dt); return end("end"); }
    cues(t);
    renderAt(t, dt);
    rafId = requestAnimationFrame(loop);
  }

  function play(opts) {
    opts = opts || {};
    if (playing) return false;
    if (!init()) return false;
    preview = !!opts.preview;
    t = opts.from || 0;
    if (opts.layer && typeof opts.layer === "object") Object.assign(layers, opts.layer);
    cueIdx = 0;
    for (let i = 0; i < S.events.length && S.events[i].at <= t; i++) cueIdx = i + 1;
    prevT = t;
    lastBlink = blinkOn(t);
    lastReveal = revealCount(t);
    shot = null; shotWish = null;
    CAM = null;

    playing = true;
    startedAt = last = performance.now();
    doneCb = opts.onDone || null;
    AUDIO_ON = !preview || !!opts.audio;

    if (!preview) {
      document.body.classList.add("opening-on");
      if ($("opSkip")) $("opSkip").hidden = false;
    }
    cv.style.display = "block";
    if (AUDIO_ON) {
      try { AUDIO.stopBGM(); AUDIO.unlock(); AUDIO.ambience("opening"); } catch (e) {}
    }
    camReset(t);
    renderAt(t, 1 / 60);
    rafId = requestAnimationFrame(loop);
    return true;
  }

  function end(how) {
    if (!playing) return;
    playing = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (cv) cv.style.display = "none";
    if ($("opSkip")) $("opSkip").hidden = true;
    if (!preview) {
      document.body.classList.remove("opening-on");
      try { if (typeof SYS !== "undefined") SYS.store.set("ea_opening_seen", true); } catch (e) {}
    }
    const cb = doneCb; doneCb = null;
    preview = false;
    if (cb) cb(how);
  }

  function skip() { if (playing) end("skip"); }

  function wants() {
    try {
      if (typeof SYS !== "undefined" && SYS.store.get("ea_opening_seen", false)) return false;
    } catch (e) {}
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  }

  function segments() {
    return S.segments.map(s => ({ id: s.id, at: s.at, label: s.label }));
  }

  function playSegment(id, onDone) {
    const seg = S.segments.find(s => s.id === id);
    if (!seg) return false;
    return play({ from: seg.at, onDone });
  }

  return {
    wants, play, playSegment, skip,
    get covering() { return playing; },
    get duration() { return DUR; },
    segments,
    debug: {
      renderAt: tt => { if (init()) { size(); t = tt; camReset(tt); renderAt(tt, 1 / 60); } },
      seek: tt => { t = tt; if (init()) { camReset(tt); renderAt(tt, 1 / 60); } },
      play: (from, onDone, audio) => play({ from: from || 0, preview: true, audio: !!audio, onDone }),
      stop: () => end("skip"),
      setLayer: (k, v) => { layers[k] = v; if (!playing) { camReset(t); renderAt(t, 1 / 60); } },
      layers,
      anchors: () => CUR.anchors,
      camera: () => cameraAt(),
      stats: () => ({ t, ms: lastMs, s: CAM ? CAM.s : 0, x: CAM ? CAM.x : 0, y: CAM ? CAM.y : 0 })
    }
  };
})();

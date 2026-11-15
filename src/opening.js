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
  const HDR = 74;                  // 顶栏（logo + 三行信息）占位
  const BOX_TOP = 300;             // 底部输入框上边线
  const BOX_BOT = 340;             // 底部输入框下边线
  const BAR_Y = 354;               // 最底下状态条
  const VTOP = HDR + 4;            // 正文可视区
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
  let content = null, g = null;
  let shot = null, shotCtx = null, shotLow = null, shotLowCtx = null;
  let shotWish = null;
  let gain = 1;
  let playing = false, preview = false, AUDIO_ON = false;
  let t = 0, last = 0, rafId = 0, doneCb = null;
  let startedAt = 0, cueIdx = 0, prevT = 0, lastKeyT = -1, lastMs = 0;
  let lastBlink = true, lastReveal = 0;
  const layers = { grid: true, sub: true, moire: true, bloom: true, dust: true, grain: true };
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
    for (let i = 0; i < e.text.length; i++) {
      const ch = e.text[i];
      /* 打错：敲一个错字、停一下、退格、再敲对 */
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
  let curFont = "";
  function setFont(c, size, weight, family) {
    const f = (weight ? weight + " " : "") + size + "px " + (family || MONO);
    if (f !== curFont) { c.font = f; curFont = f; }
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

  function wrapText(c, str, maxW) {
    const out = [];
    let line = "";
    const words = str.split(" ");
    for (let i = 0; i < words.length; i++) {
      let w = words[i];
      /* 单个词就超宽（中文没有空格、或者长 URL）：按字硬拆 */
      while (w && c.measureText(w).width > maxW) {
        let head = "";
        while (w.length && c.measureText(head + w[0]).width <= maxW) { head += w[0]; w = w.slice(1); }
        if (!head) break;
        if (line) { out.push(line); line = ""; }
        out.push(head);
      }
      if (!w) continue;
      const cand = line ? line + " " + w : w;
      if (c.measureText(cand).width <= maxW) line = cand;
      /* 换行时把那个空格留在行尾：lines.join("") 必须等于原文，
         否则按「已经打了几个字」做流式截断时，每换一次行就会错位一个字 */
      else { if (line) out.push(line + " "); line = w; }
    }
    if (line) out.push(line);
    return out;
  }

  function linesOf(e) {
    if (e.__lines) return e.__lines;
    setFont(g, 13);
    /* 折得比画面窄一点：镜头跟着走的时候，整行才不会被切掉 */
    e.__lines = wrapText(g, e.text, 470);
    return e.__lines;
  }
  function bodyLines(e) {
    if (e.__blines) return e.__blines;
    setFont(g, 12);
    e.__blines = e.body.map(b => wrapText(g, b, W - PAD * 2 - 40));
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
    let y = 38;                       // 顶部先留出「Welcome to Claude Code」那两行
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
        const h = expanded ? e.body.length * LH : LH;
        blocks.push({ e, kind: "think", y, h, expanded });
        y += h + (expanded ? 10 : 6);
      } else if (e.type === "status") {
        blocks.push({ e, kind: "status", y, h: LH });
        y += LH + 10;
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
    const scroll = scrollAt(tt);
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
            const last = Math.min(bl.e.body.length - 1, 7);
            wishRect = { x: PAD + 30, y: y + last * LH, w: W - PAD * 2 - 40, h: LH };
          }
        }
      }
    }

    /* 光标永远住在底部输入框里（跟真实 Claude Code 一样）：
     * 打字时在已输入的文字后面，空闲时就在提示符后面闪。 */
    const act = activeInput(tt);
    setFont(g, 13);
    const typedW = act ? g.measureText(typed(act, tt)).width : 0;
    A.cursor = { x: PAD + 18 + typedW, y: BOX_TOP + 21 };

    if (!A.prompt) A.prompt = A.cursor;
    if (!A.reply) A.reply = A.prompt;
    if (!A.think_row) A.think_row = A.prompt;
    if (!A.wish_q) A.wish_q = A.prompt;
    if (!A.last_reply) A.last_reply = A.reply;
    if (!A.thought_row) A.thought_row = A.think_row;

    return { blocks: b.blocks, scroll, base, anchors: A, wishRect };
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
      const np = L.anchors[e.to];
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

  function selectionRect(L, tt) {
    const down = eventAt("mousedown", tt);
    if (!down) return null;
    const a = L.anchors.tl7, b = L.anchors.tl7e;
    if (!a || !b) return null;
    const up = lastEvent("mouseup", tt);
    const m = mousePos(L, tt);
    const x1 = up ? b.x : clamp(m ? m.x : a.x, a.x, b.x);
    return { x: a.x, y: a.y - LH / 2 + 2, w: Math.max(0, x1 - a.x), h: LH - 4 };
  }

  /* ============================================================
   *  内容层绘制
   * ============================================================ */
  function drawHeader(c) {
    const U = S.ui;
    setFont(c, 14);
    for (let i = 0; i < U.logo.length; i++) ink(c, U.logo[i], 4, 26 + i * 14, C.logo, false);

    const X = 96;
    setFont(c, 13);
    ink(c, U.brand, X, 26, "#d8dade", FRINGE);
    const bw = c.measureText(U.brand).width;
    setFont(c, 11);
    ink(c, U.version, X + bw + 8, 26, C.dim, false);

    setFont(c, 13);
    ink(c, U.model, X, 46, "#d8dade", FRINGE);
    const mw = c.measureText(U.model).width;
    setFont(c, 11);
    ink(c, " · " + U.billing, X + mw, 46, C.dim, false);

    setFont(c, 11);
    ink(c, U.cwd, X, 64, C.dim, false);
  }

  function drawBottomBox(c, L, tt, capture, uiA) {
    const a = uiA === undefined ? 1 : uiA;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = C.rule;
    c.fillRect(0, BOX_TOP, W, 1);
    c.restore();

    setFont(c, 13);
    const act = activeInput(tt);
    c.save();
    c.globalAlpha = a;
    ink(c, S.ui.prompt, PAD, BOX_TOP + 26, C.white, false);
    c.restore();
    if (act) {
      const str = typed(act, tt);
      ink(c, str, PAD + 18, BOX_TOP + 26, C.white, FRINGE);
      if (!capture) {
        const w = c.measureText(str).width;
        c.fillStyle = C.white;
        c.fillRect(PAD + 18 + w + 1, BOX_TOP + 13, 7, 16);
      }
    } else if (!capture && blinkOn(tt)) {
      c.fillStyle = C.white;
      c.fillRect(PAD + 18, BOX_TOP + 13, 7, 16);
    }

    c.save();
    c.globalAlpha = a;
    c.fillStyle = C.rule;
    c.fillRect(0, BOX_BOT, W, 1);

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
    c.save();
    c.globalAlpha = uiA;
    drawHeader(c);
    c.restore();

    /* 正文 */
    c.save();
    c.beginPath(); c.rect(0, VTOP, W, VBOT - VTOP); c.clip();

    const sel = selectionRect(L, tt);
    let selDrawn = false;

    /* 会话开头的欢迎行：跟正文一起滚上去 */
    setFont(c, 12);
    ink(c, "✻", PAD, L.base + 13, C.logo, false);
    ink(c, "Welcome to Claude Code", PAD + 16, L.base + 13, C.text, FRINGE);
    setFont(c, 11);
    ink(c, "/help for help, /status for your current setup", PAD + 16, L.base + 31, C.dim, false);

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
        const shown = typed(bl.e, tt).length;
        let left = shown;
        for (let k = 0; k < bl.lines.length; k++) {
          const s = bl.lines[k];
          const part = left >= s.length ? s : s.slice(0, left);
          left -= s.length;
          if (!part) continue;
          const yy = y + k * LH + 13;
          if (k === 0) ink(c, "●", PAD, yy, C.bullet, false);
          ink(c, part, PAD + 14, yy, C.text, FRINGE);
        }
      } else if (bl.kind === "think") {
        const e = bl.e;
        if (bl.expanded) {
          setFont(c, 12);
          const bls = bodyLines(e);
          if (sel && !selDrawn) {
            c.fillStyle = C.sel;
            c.fillRect(sel.x, sel.y, sel.w, sel.h);
            selDrawn = true;
          }
          for (let k = 0; k < e.body.length; k++) {
            const txt = bls[k][0] || "";
            const shown = blobShown(e, k, tt, capture);
            const part = txt.slice(0, shown);
            if (!part) continue;
            const yy = y + k * LH + 13;
            if (k === 0) ink(c, "∴", PAD + 12, yy, C.dim, false);
            ink(c, part, PAD + 30, yy, k === 6 ? "#e6e9ee" : C.text, FRINGE);
          }
        } else {
          const done = tt >= e.at + e.dur;
          /* 计时是往上数的：Thinking… (3s) → 4s … 到点变成 Thought for Ns，
             N 就是实际用的秒数，跟前面数的那个数对得上 */
          const el = Math.max(0, Math.floor(tt - e.at));
          const label = done ? ("Thought for " + e.dur + "s") : ("Thinking… (" + el + "s)");
          setFont(c, 12);
          if (done) {
            const hot = hoverThought(L, tt);
            ink(c, label, PAD + 2, y + 13, hot ? C.white : C.dim, false);
          } else {
            ink(c, SPIN[Math.floor(tt * 8) % SPIN.length], PAD + 2, y + 13, C.logo, false);
            ink(c, label, PAD + 18, y + 13, C.dim, false);
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
    const out = [];
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === "freply" && e.at <= tt) out.push(e);
    }
    return out;
  }

  function layoutForum(tt) {
    const reps = forumReplies(tt);
    const blocks = [];
    let y = REL0;
    for (let i = 0; i < reps.length; i++) { blocks.push({ e: reps[i], y, h: RELH }); y += RELH; }
    return {
      blocks, scroll: 0,
      anchors: { post: { x: 320, y: 180 }, replies: { x: 320, y: 180 }, banner: { x: 320, y: 180 }, wall: { x: 320, y: 180 } }
    };
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
    ink(c, " · " + F.time + "  ·  " + F.views + " 浏览", PAD + opw, 82, "#55677A", false);

    c.fillStyle = "#0A0D12"; c.fillRect(IMG.x, IMG.y, IMG.w, IMG.h);
    if (shot) {
      c.imageSmoothingEnabled = true;
      c.drawImage(shot, IMG.x, IMG.y, IMG.w, IMG.h);
    }
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
    ink(c, "次 · 原帖已删除", PAD + 64 + c.measureText(ns).width + 10, H - 22, "#55677A", false);
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
    /* 开场「拉远看全貌」那几秒由台本直接指定，不跟光标 */
    let mode = "auto";
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === "focus" && e.at <= tt) mode = e.mode;
    }
    if (mode === "screen") return { x: 320, y: 186 };
    /* 选了字之后镜头就停在选中的那一行上，别跟着指针跑到行尾去 */
    const down = eventAt("mousedown", tt);
    if (down) {
      const a = L.anchors.tl7, b = L.anchors.tl7e, m = mousePos(L, tt);
      if (a && b) {
        const x = m ? (a.x + clamp(m.x, a.x, b.x)) / 2 : (a.x + b.x) / 2;
        return { x: x, y: a.y };
      }
    }
    const m = mousePos(L, tt);
    if (m) return m;
    const act = activeInput(tt);
    if (act) {
      /* 在底部输入框里打字：跟着「已经敲出来的这一段的中心」走，
       * 不跟光标本身——光标是一个字一个字往右挪的，跟着它镜头会抽。 */
      setFont(g, 13);
      const w = g.measureText(typed(act, tt)).width;
      return { x: clamp(PAD + 18 + w / 2, 60, W - 60), y: BOX_TOP + 21 };
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
    const k = 1 - Math.exp(-dt / 0.55);
    const ks = 1 - Math.exp(-dt / 0.75);
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

  function drawBloom(ox, oy, s) {
    if (!bloomCtx) return;
    bloomCtx.clearRect(0, 0, 200, 112);
    bloomCtx.imageSmoothingEnabled = true;
    bloomCtx.drawImage(content, 0, 0, 200, 112);
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

    ctx.drawImage(content, ox, oy, W * s, H * s);
    if (layers.grid) drawGrid(ox, oy, s);
    if (layers.moire) drawGrille(tt, s);
    if (layers.bloom && FILTER_OK) drawBloom(ox, oy, s);
    if (layers.dust) drawDust(tt);
    drawVignette();
    if (layers.grain) drawGrain(tt);
    drawFlash(tt);
  }

  /* ============================================================
   *  一帧
   * ============================================================ */
  function layoutFor(tt) {
    const scene = sceneAt(tt);
    if (scene === "terminal") return layoutTerminal(tt);
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

    /* 切场景是硬切，镜头别恋恋不舍地滑过去 */
    if (scene !== lastScene) { lastScene = scene; CAM = null; }

    camStep(focusAt(tt, L), scaleAt(tt), dt || 1 / 60);
    FRINGE = (CAM ? CAM.s : 3) >= 3;

    if (scene === "terminal") drawTerminal(g, L, tt, false);
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
    drawTerminal(g, L, at, true);
    shotCtx.clearRect(0, 0, W, H);
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

    content = document.createElement("canvas");
    content.width = W; content.height = H;
    g = content.getContext("2d");

    shot = document.createElement("canvas");
    shot.width = W; shot.height = H;
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
      stats: () => ({ t, ms: lastMs, s: CAM ? CAM.s : 0 })
    }
  };
})();

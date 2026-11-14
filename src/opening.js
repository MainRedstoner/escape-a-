/* ============================================================
 * Escape A÷ · src/opening.js —— 片头《愿望》渲染器
 *
 * 台本（台词 / 时间点 / 镜头）全在 src/opening_script.js，这里只管怎么画。
 *
 * 三层光学模型（超微距的关键）：
 *   内容层 640×360   屏幕上真正显示的东西（终端 / 论坛 / 截图）
 *        │ 镜头放大 s≈2.4~12（最近邻、非整数倍）
 *        ▼
 *   采样层 1600×900  像素栅格（间距 = s）/ RGB 子像素 / 摩尔纹
 *        │
 *        ▼
 *   镜头层 1600×900  玻璃反光 / 灰尘 / 泛光 / 颗粒 / 暗角 / 呼吸抖动
 *
 * 内容层会被放大，镜头层不会 —— 这个差异就是「微距感」的来源。
 * 摩尔纹不是噪点：它是「显示栅格（间距 s）」和「传感器格栅（间距 3px，
 * 带角度 θ）」两组周期结构拍出来的，波长 λ ≈ p·s/|s-p|，角度项 λ ≈ p/θ。
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
  const LH = 20;                   // 终端行高
  const PAD = 18;                  // 终端左右留白
  const HDR = 78, FTR = 26;        // 终端顶栏（logo + 三行信息）/ 底栏
  const MONO = 'ui-monospace,"Cascadia Mono",Consolas,"Microsoft YaHei",monospace';
  const SANS = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
  const SPIN = ["✻", "✶", "✳", "✢", "·", "✢", "✳", "✶"];

  /* ---------------- 小工具 ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smoothstep = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const blinkOn = tt => ((tt % 1.7) / 1.7) < 0.62;
  const $ = id => document.getElementById(id);

  /* ---------------- 状态 ---------------- */
  let cv = null, ctx = null;             // 舞台
  let content = null, g = null;          // 内容层 640×360
  let shot = null, shotCtx = null;       // 截图快照
  let shotLow = null, shotLowCtx = null; // 降质缩略
  let shotWish = null;                   // 愿望行在截图里的矩形
  let gain = 1;
  let playing = false, preview = false;
  let t = 0, last = 0, rafId = 0, doneCb = null;
  let startedAt = 0, cueIdx = 0, lastKeyT = -1, lastMs = 0;
  const layers = { grid: true, sub: true, moire: true, bloom: true, dust: true, grain: true };
  let CUR = { anchors: {} };             // 当前帧的锚点（相机用）

  /* ---------------- 字体与文字 ---------------- */
  let curFont = "";
  function setFont(c, size, weight, family) {
    const f = (weight ? weight + " " : "") + size + "px " + (family || MONO);
    if (f !== curFont) { c.font = f; curFont = f; }
  }

  /* 子像素彩边：同一段字画三遍，左右各偏 1/3 内容像素。
     放大 3 倍以上就是液晶文字那圈 RGB 毛边；放不大时关掉省开销。 */
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

  /* 换行结果缓存到事件对象上（只在第一帧算一次） */
  function linesOf(e) {
    if (e.__lines) return e.__lines;
    setFont(g, 13);
    e.__lines = wrapText(g, e.text, W - PAD * 2 - 20);
    return e.__lines;
  }
  function thinkLinesOf(e) {
    if (e.__blines) return e.__blines;
    setFont(g, 13);
    e.__blines = e.body.map(b => wrapText(g, b.text, W - PAD * 2 - 46));
    return e.__blines;
  }

  /* ---------------- 时间轴 ---------------- */
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

  /* ---------------- 终端布局 ----------------
   * 布局是纯函数（只看 t），所以预览页可以任意 seek。
   * 滚动条位置用「上一个高度变化事件」做 0.45s 的平滑，同样是纯函数。 */
  let HEIGHT_EVENTS = [];

  function blocksAt(tt) {
    const blocks = [];
    let y = 0;
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === "scene") break;
      if (e.at > tt) break;
      if (e.type === "input" || e.type === "reply") {
        const lines = linesOf(e);
        const h = lines.length * LH;
        blocks.push({ e, kind: e.type, y, h, lines });
        y += h + (e.type === "input" ? 12 : 6);
      } else if (e.type === "think") {
        const expanded = !!e.expandAt && tt >= e.expandAt;
        /* 展开后「Thought for Ns」那一行被 ∴ 的思考正文取代，位置不变 */
        const h = expanded ? e.body.length * LH : LH;
        const bl = { e, kind: "think", y, h, expanded };
        if (expanded) bl.blines = thinkLinesOf(e);
        blocks.push(bl);
        y += h + 8;
      } else if (e.type === "status") {
        blocks.push({ e, kind: "status", y, h: LH });
        y += LH + 12;
      }
    }
    return { blocks, contentH: y };
  }

  function maxScrollPure(tt) {
    const b = blocksAt(tt);
    return Math.max(0, b.contentH - (H - HDR - FTR - 8));
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
    const base = HDR + 8 - scroll;
    const A = { prompt: null, reply: null, think_row: null, wish_q: null, last_reply: null, thought_row: null, thought_line: null };
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
        A.think_row = { x: 320, y: y + LH / 2 };
        if (bl.e.id === "wish") {
          A.thought_row = { x: 320, y: y + LH / 2 };
          if (bl.expanded) {
            let idx = -1;
            for (let k = 0; k < bl.e.body.length; k++) if (tt >= bl.e.body[k].at) idx = k;
            if (idx < 0) idx = 0;
            const ly = y + idx * LH;
            A.thought_line = { x: 320, y: ly + LH / 2 };
            wishRect = { x: PAD + 30, y: ly, w: W - PAD * 2 - 40, h: LH };
          }
        }
      }
    }
    /* 光标：最后一个块的下一行；没有块时就在提示符位置 */
    const lastB = b.blocks[b.blocks.length - 1];
    A.cursor = { x: PAD + 8, y: lastB ? base + lastB.y + lastB.h + 8 : HDR + 8 };

    if (!A.prompt) A.prompt = A.cursor;
    if (!A.reply) A.reply = A.prompt;
    if (!A.think_row) A.think_row = A.prompt;
    if (!A.wish_q) A.wish_q = A.prompt;
    if (!A.last_reply) A.last_reply = A.reply;
    if (!A.thought_row) A.thought_row = A.think_row;
    if (!A.thought_line) A.thought_line = A.thought_row;

    return { blocks: b.blocks, scroll, base, anchors: A, wishRect };
  }

  /* ---------------- 论坛布局 ----------------
   * 整页做成一屏放得下：版头 / 标题 / 截图 / 六条回复都在 360 里，
   * 这样镜头可以停在 s=2.5 把整页看全，不用滚——滚动的网页在微距下反而看不清结构。 */
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
    for (let i = 0; i < reps.length; i++) {
      blocks.push({ e: reps[i], y, h: RELH });
      y += RELH;
    }
    const A = {
      post: { x: 320, y: 180 },
      replies: { x: 320, y: 180 },
      banner: { x: 320, y: 180 },
      wall: { x: 320, y: 180 }
    };
    return { blocks, scroll: 0, anchors: A };
  }

  /* ---------------- 截图 / 图片 / 黑屏 ---------------- */
  const IMG2 = { x: 80, y: 45, w: 480, h: 270 };

  function mapWish() {
    if (!shotWish) return { x: IMG2.x + IMG2.w / 2, y: IMG2.y + IMG2.h / 2 };
    return {
      x: IMG2.x + (shotWish.x + shotWish.w / 2) / W * IMG2.w,
      y: IMG2.y + (shotWish.y + shotWish.h / 2) / H * IMG2.h
    };
  }

  function layoutImage(tt) {
    return { anchors: { image: { x: 320, y: 180 }, image_wish: mapWish() } };
  }
  function layoutBlack(tt) {
    return { anchors: { saved: { x: 320, y: 180 } } };
  }

  /* ============================================================
   *  内容层绘制
   * ============================================================ */

  /** 光标该停在哪：最后一个块最后一行的行尾 */
  function cursorPos(L, tt) {
    for (let i = L.blocks.length - 1; i >= 0; i--) {
      const bl = L.blocks[i];
      if (bl.kind !== "input" && bl.kind !== "reply") continue;
      const x0 = PAD + (bl.kind === "input" ? 18 : 0);
      const shown = clamp(Math.floor((tt - bl.e.at) * (bl.e.cps || 30)), 0, bl.e.text.length);
      let left = shown, k = 0, part = "";
      for (; k < bl.lines.length; k++) {
        const s = bl.lines[k];
        part = left >= s.length ? s : s.slice(0, left);
        left -= s.length;
        if (left <= 0) break;
      }
      setFont(g, 13);
      const y = L.base + bl.y + k * LH;
      return { x: x0 + g.measureText(part).width, y };
    }
    return { x: PAD + 18, y: HDR + 8 };
  }

  /** 顶栏：ASCII logo + Claude Code 版本 / 模型 / 工作区（照真实 Claude Code 的版式） */
  function drawHeader(c) {
    const U = S.ui;
    setFont(c, 13);
    for (let i = 0; i < U.logo.length; i++) ink(c, U.logo[i], 2, 22 + i * 20, "#C1684C", false);

    const X = 92;
    setFont(c, 13);
    ink(c, U.brand, X, 22, "#E8EDF3", FRINGE);
    const bw = c.measureText(U.brand).width;
    setFont(c, 12);
    ink(c, U.version, X + bw + 10, 22, "#6E7A8A", false);

    setFont(c, 13);
    ink(c, U.model, X, 42, "#E8EDF3", FRINGE);
    const mw = c.measureText(U.model).width;
    setFont(c, 12);
    ink(c, " · " + U.billing, X + mw, 42, "#6E7A8A", false);
    ink(c, U.cwd, X, 62, "#5C6878", false);
  }

  /** 鼠标指针：从输入行挪到「Thought for Ns」那一格，走一条微微上弧的线 */
  function mouseAt(L, tt) {
    const ev = lastEvent("mouse", tt);
    if (!ev || tt < ev.at) return null;
    const k = smoothstep(clamp((tt - ev.at) / (ev.dur || 2.8), 0, 1));
    const from = L.anchors.cursor || { x: PAD + 18, y: HDR + 8 };
    const to = L.anchors.thought_row || from;
    const arc = -22 * Math.sin(k * Math.PI);
    const click = lastEvent("click", tt);
    return {
      x: lerp(from.x, to.x + 24, k) + 6,
      y: lerp(from.y, to.y, k) + 10 + arc,
      click: click ? tt - click.at : -1
    };
  }

  function drawTerminal(c, L, tt) {
    c.fillStyle = "#0C1119"; c.fillRect(0, 0, W, H);

    /* 界面元件在开头几秒慢慢显出来：先只有一个光标，再拉远看见整个窗口 */
    const uiA = smoothstep((tt - 3.5) / 6);
    c.save();
    c.globalAlpha = uiA;
    drawHeader(c);
    c.restore();

    /* 正文（裁剪到滚动区） */
    c.save();
    c.beginPath(); c.rect(0, HDR, W, H - HDR - FTR); c.clip();
    for (let i = 0; i < L.blocks.length; i++) {
      const bl = L.blocks[i];
      const y = L.base + bl.y;
      if (bl.kind === "input") {
        setFont(c, 13);
        ink(c, S.ui.prompt, PAD, y + 14, "#D97757", false);
        const shown = clamp(Math.floor((tt - bl.e.at) * (bl.e.cps || 30)), 0, bl.e.text.length);
        let left = shown;
        for (let k = 0; k < bl.lines.length; k++) {
          const s = bl.lines[k];
          const part = left >= s.length ? s : s.slice(0, left);
          left -= s.length;
          if (part) ink(c, part, PAD + 18, y + k * LH + 14, "#F2F6FA", FRINGE);
        }
      } else if (bl.kind === "reply") {
        setFont(c, 13);
        const shown = clamp(Math.floor((tt - bl.e.at) * (bl.e.cps || 30)), 0, bl.e.text.length);
        let left = shown;
        for (let k = 0; k < bl.lines.length; k++) {
          const s = bl.lines[k];
          const part = left >= s.length ? s : s.slice(0, left);
          left -= s.length;
          if (part) ink(c, part, PAD, y + k * LH + 14, "#E6ECF4", FRINGE);
        }
      } else if (bl.kind === "think") {
        const e = bl.e;
        if (bl.expanded) {
          /* 展开后的思维链：首行带 ∴，其余缩进对齐 */
          setFont(c, 12);
          for (let k = 0; k < e.body.length; k++) {
            if (tt < e.body[k].at) break;
            const shown = clamp(Math.floor((tt - e.body[k].at) * 55), 0, e.body[k].text.length);
            const part = e.body[k].text.slice(0, shown);
            if (!part) continue;
            if (k === 0) ink(c, "∴", PAD + 12, y + 14, "#A6B0BE", false);
            ink(c, part, PAD + 30, y + k * LH + 14, "#C3CCDA", FRINGE);
          }
        } else {
          const done = tt >= e.at + e.dur;
          const label = done ? e.done : (e.label || "Thinking…") + " (" + Math.max(0, Math.ceil(e.at + e.dur - tt)) + "s)";
          setFont(c, 12);
          if (done) {
            ink(c, "  " + label, PAD, y + 14, "#7E8A9A", false);
          } else {
            ink(c, SPIN[Math.floor(tt * 8) % SPIN.length], PAD + 2, y + 14, "#D97757", false);
            ink(c, label, PAD + 18, y + 14, "#8E99A8", false);
          }
        }
      } else if (bl.kind === "status") {
        setFont(c, 11);
        ink(c, "✻", PAD, y + 14, "#D97757", false);
        ink(c, " " + bl.e.verb + " for " + bl.e.dur + "s · done " + bl.e.clock, PAD + 12, y + 14, "#6E7A8A", false);
      }
    }

    /* 光标 */
    if (blinkOn(tt)) {
      const cp = cursorPos(L, tt);
      c.fillStyle = "#C9D2DE";
      c.fillRect(cp.x + 1, cp.y + 2, 7, 14);
    }
    c.restore();

    /* 鼠标指针：从输入行挪到「Thought for 12s」那一格，点下去时一圈涟漪 */
    const m = mouseAt(L, tt);
    if (m) {
      if (m.click >= 0 && m.click < 0.5) {
        c.strokeStyle = "rgba(217,119,87," + ((1 - m.click / 0.5) * 0.9).toFixed(3) + ")";
        c.lineWidth = 1.6;
        c.beginPath(); c.arc(m.x, m.y, 6 + m.click * 46, 0, Math.PI * 2); c.stroke();
      }
      c.beginPath();
      c.moveTo(m.x, m.y);
      c.lineTo(m.x, m.y + 14);
      c.lineTo(m.x + 3.8, m.y + 10.4);
      c.lineTo(m.x + 9.6, m.y + 9.8);
      c.closePath();
      c.fillStyle = "#F4F8FC";
      c.fill();
      c.strokeStyle = "#080C12";
      c.lineWidth = 1.1;
      c.stroke();
    }

    /* 底栏 */
    c.save();
    c.globalAlpha = uiA;
    c.fillStyle = "#1B2230"; c.fillRect(0, H - FTR, W, 1);
    setFont(c, 11);
    const lastBlk = L.blocks[L.blocks.length - 1];
    const thinking = !!lastBlk && lastBlk.kind === "think" && tt < lastBlk.e.at + lastBlk.e.dur;
    if (thinking) {
      ink(c, SPIN[Math.floor(tt * 8) % SPIN.length] + " Clauding… (esc to interrupt)", PAD, H - FTR + 17, "#6B7684", false);
    } else {
      ink(c, "? for shortcuts", PAD, H - FTR + 17, "#44505F", false);
    }
    const right = "auto-accept edits on";
    ink(c, right, W - PAD - c.measureText(right).width, H - FTR + 17, "#44505F", false);
    c.restore();
  }

  function drawThreadPage(c, L, tt) {
    c.fillStyle = "#0C0F14"; c.fillRect(0, 0, W, H);

    /* 版头：固定，不跟着页面滚 */
    c.fillStyle = "#0F141B"; c.fillRect(0, 0, W, FHEAD);
    c.fillStyle = "#223040"; c.fillRect(0, FHEAD - 1, W, 1);
    setFont(c, 14, "700", SANS);
    const logoW = c.measureText(F.logo).width;
    ink(c, F.logo, PAD, 22, "#7DB9FF", FRINGE);
    setFont(c, 10, "", SANS);
    ink(c, F.board, PAD + logoW + 22, 21, "#8FA3B8", FRINGE);
    const bw = c.measureText(F.back).width;
    ink(c, F.back, W - PAD - bw, 21, "#E0A458", FRINGE);

    /* 页面主体：标题 / 截图 / 回复整块一起滚 */
    c.save();
    c.beginPath(); c.rect(0, FHEAD, W, H - FHEAD); c.clip();
    c.translate(0, -L.scroll);

    setFont(c, 9, "", SANS);
    ink(c, F.tab, PAD, 48, "#55677A", false);
    setFont(c, 13, "700", SANS);
    ink(c, F.title, PAD, 62, "#DCE3EC", FRINGE);

    setFont(c, 9, "", SANS);
    ink(c, F.op, PAD, 82, "#63E6A5", false);
    const opw = c.measureText(F.op).width;
    ink(c, " · " + F.time + "  ·  " + F.views + " 浏览", PAD + opw, 82, "#55677A", false);

    c.fillStyle = "#0A0D12";
    c.fillRect(IMG.x, IMG.y, IMG.w, IMG.h);
    if (shot) { c.imageSmoothingEnabled = true; c.drawImage(shot, IMG.x, IMG.y, IMG.w, IMG.h); }
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
    c.restore();

    /* 删除横幅（盖在最上面，不随滚动） */
    const ban = lastEvent("banner", tt);
    if (ban) {
      c.fillStyle = "rgba(6,8,11,.84)"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#1A0E10"; c.fillRect(PAD + 30, 148, W - (PAD + 30) * 2, 76);
      c.strokeStyle = "#D93A2B"; c.lineWidth = 1;
      c.strokeRect(PAD + 30.5, 148.5, W - (PAD + 30) * 2 - 1, 75);
      setFont(c, 14, "700", SANS);
      const t1 = F.banner;
      ink(c, t1, (W - c.measureText(t1).width) / 2, 182, "#FF8A78", FRINGE);
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
          const sx = Math.floor(k * 60), sy = Math.floor(k * 30);
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

    /* 转载计数 */
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
    const tail = "次 · 原帖已删除";
    ink(c, tail, PAD + 64 + c.measureText(ns).width + 10, H - 22, "#55677A", false);
  }

  function drawForum(c, L, tt) {
    const wall = lastEvent("counter", tt);
    if (wall && tt >= wall.at) drawWall(c, tt);
    else drawThreadPage(c, L, tt);
  }

  function drawImageScene(c, tt) {
    c.fillStyle = "#05070A"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#0A0D12"; c.fillRect(IMG2.x, IMG2.y, IMG2.w, IMG2.h);
    if (shot) {
      c.imageSmoothingEnabled = true;
      c.drawImage(shot, IMG2.x, IMG2.y, IMG2.w, IMG2.h);
      /* 转载越多次越糊：交叉淡到 160×90 的降质图 */
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

    /* 选区扫过愿望那一行 */
    const sel = eventAt("select", tt);
    if (sel && shotWish) {
      const k = clamp((tt - sel.at) / 1.6, 0, 1);
      const x = IMG2.x + shotWish.x / W * IMG2.w;
      const y = IMG2.y + shotWish.y / H * IMG2.h;
      const w = shotWish.w / W * IMG2.w;
      const h = shotWish.h / H * IMG2.h;
      c.fillStyle = "rgba(90,140,255,.32)";
      c.fillRect(x, y, w * smoothstep(k), h);
      c.strokeStyle = "rgba(140,180,255,.75)";
      c.strokeRect(x + 0.5, y + 0.5, w * smoothstep(k), h);
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
   *  镜头
   * ============================================================ */
  function anchorPoint(name) {
    const a = CUR.anchors && CUR.anchors[name];
    return a || { x: 320, y: 180 };
  }

  function cameraAt(tt) {
    const kf = S.camera;
    let i = 0;
    while (i + 1 < kf.length && kf[i + 1].t <= tt) i++;
    const a = kf[i], b = kf[Math.min(i + 1, kf.length - 1)];
    const u = b.t > a.t ? smoothstep((tt - a.t) / (b.t - a.t)) : 0;
    const pa = anchorPoint(a.a), pb = anchorPoint(b.a);
    const s = lerp(a.s, b.s, u);
    let x = lerp(pa.x, pb.x, u);
    const y = lerp(pa.y, pb.y, u);
    /* l:1 —— 推近时把左边距锁在画面左侧，别把句首裁掉 */
    if (a.l || b.l) x = 14 + (SW / 2) / s;
    /* 呼吸 + 手持：让画面一直是「有人在拍」，不是渲染出来的静止图 */
    const breathe = 1 + 0.012 * Math.sin(tt * 0.63 + 0.7);
    const jx = 0.45 * Math.sin(tt * 1.7 + 1.1) + 0.22 * Math.sin(tt * 3.1 + 0.3);
    const jy = 0.40 * Math.cos(tt * 1.3 + 0.4) + 0.22 * Math.sin(tt * 3.7 + 1.9);
    return { s: s * breathe, x: x + jx, y: y + jy };
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
      const v = 128 + ((s >> 16) & 0xff) - 128;
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
    if (q.filter !== undefined) {
      try { q.filter = "blur(" + blur + "px)"; q.drawImage(c, 0, 0); q.filter = "none"; } catch (e) {}
    }
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
    /* 栅格必须是**小数间距** s，不能四舍五入成整数——整数栅格和下面那层
       小数间距的格栅拍不出长波长的摩尔纹，只会变成一层均匀的细纹。
       做法：4×4 的小图（1px 暗线）用画布变换缩到 s/4，线略微软掉，正好是屏幕该有的样子。 */
    const n = 4;
    let pat = gridPat.get(n);
    if (!pat) {
      pat = ctx.createPattern(gridTileFor(n), "repeat");
      gridPat.set(n, pat);
    }
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
    /* 传感器格栅的间距跟着显示像素间距走，但差一点点（δ≈2%）：
       拍频波长 λ = s·p/|s−p| ≈ s/δ，落在 100~200px，宽到能看见；
       镜头一推拉 s 就变，λ 跟着变，条纹自己爬起来。
       这里用画布变换缩放图案（比 pattern.setTransform 稳，所有浏览器都给同一结果）。 */
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
      const w = d.img.width;
      ctx.drawImage(d.img, x - w / 2, y - w / 2);
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
    /* 底色和内容层一致：放大到画布外时看不到「屏幕边缘」那道接缝 */
    ctx.fillStyle = "#0C1119"; ctx.fillRect(0, 0, SW, SH);

    const cam = cameraAt(tt);
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
  function renderAt(tt) {
    if (!ctx || !content) return;
    const t0 = performance.now();
    const scene = sceneAt(tt);
    let L;

    if (scene === "terminal") {
      L = layoutTerminal(tt);
    } else if (scene === "forum") {
      ensureShot();
      L = layoutForum(tt);
    } else if (scene === "image") {
      ensureShot();
      L = layoutImage(tt);
    } else {
      ensureShot();
      L = layoutBlack(tt);
    }
    CUR = L;
    /* 彩边只在放大到 3 倍以上才画：小景别时那 1/3 像素根本看不见，白花两遍 fillText */
    FRINGE = cameraAt(tt).s >= 3;

    if (scene === "terminal") drawTerminal(g, L, tt);
    else if (scene === "forum") drawForum(g, L, tt);
    else if (scene === "image") drawImageScene(g, tt);
    else drawBlackScene(g, tt);

    drawOptics(tt);
    lastMs = performance.now() - t0;
  }

  function ensureShot() {
    if (shot && shotWish) return;
    const L = layoutTerminal(93.9);
    drawTerminal(g, L, 93.9);
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
    if (preview || typeof AUDIO === "undefined") return;
    try { AUDIO.sfx(name); } catch (e) {}
  }

  let prevT = 0;
  function cues(tt) {
    /* 事件音效 */
    for (let i = cueIdx; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.at > tt) break;
      if (e.sfx && e.at > prevT) sfx(e.sfx);
      cueIdx = i + 1;
    }
    prevT = tt;
    /* 打字声：按正在输入的块算，每 55ms 最多一声 */
    if (tt - lastKeyT > 0.055) {
      for (let i = 0; i < S.events.length; i++) {
        const e = S.events[i];
        if (e.type !== "input" || e.at > tt) continue;
        const cps = e.cps || 30;
        if (tt - e.at < e.text.length / cps) { lastKeyT = tt; sfx("key"); break; }
      }
    }
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

    /* 高度变化点：终端每加一个块、思考块展开，滚动条都要动一下 */
    HEIGHT_EVENTS = [];
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.type === "scene") break;
      if (e.type === "input" || e.type === "reply" || e.type === "think") HEIGHT_EVENTS.push(e.at);
      if (e.expandAt) HEIGHT_EVENTS.push(e.expandAt);
    }
    HEIGHT_EVENTS.sort((a, b) => a - b);

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", () => { if (cv) { size(); if (!playing) renderAt(t); } });
    return true;
  }

  function onKey(e) {
    if (!playing || preview) return;
    if (performance.now() - startedAt < 400) return;
    e.preventDefault();
    e.stopPropagation();
    skip();
  }
  function onPointer(e) {
    if (!playing || preview) return;
    if (performance.now() - startedAt < 400) return;
    if (e.target !== cv) return;
    e.preventDefault();
    e.stopPropagation();
    skip();
  }

  function loop(now) {
    if (!playing) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    if (t >= DUR) { t = DUR; renderAt(t); return end("end"); }
    cues(t);
    renderAt(t);
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
    shot = null; shotWish = null;

    playing = true;
    startedAt = last = performance.now();
    doneCb = opts.onDone || null;

    if (!preview) {
      document.body.classList.add("opening-on");
      cv.style.display = "block";
      try { AUDIO.stopBGM(); AUDIO.ambience("opening"); } catch (e) {}
      if ($("opSkip")) $("opSkip").hidden = false;
    } else {
      cv.style.display = "block";
    }
    renderAt(t);
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

  function skip() {
    if (!playing) return;
    end("skip");
  }

  /* 首次进游戏才播：看过的、或者系统开了「减少动态效果」的都直接放过 */
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
      renderAt: tt => { if (init()) { size(); t = tt; renderAt(tt); } },
      seek: tt => { t = tt; if (init()) renderAt(tt); },
      play: (from, onDone) => play({ from: from || 0, preview: true, onDone }),
      stop: () => end("skip"),
      setLayer: (k, v) => { layers[k] = v; if (!playing) renderAt(t); },
      layers,
      anchors: () => CUR.anchors,
      camera: () => cameraAt(t),
      stats: () => ({ t, ms: lastMs, s: cameraAt(t).s })
    }
  };
})();

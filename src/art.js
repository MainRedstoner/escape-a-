/* ============================================================
 * Escape A÷ · art.js —— 绘制层
 *
 * 两个原则：
 *   1. 基调偏暗：冷色、低照度、强暗角。
 *   2. 所有立绘 / 背景 / CG 都是"素材位"：
 *      有 assets/ 下的正式图就直接用；没有就画一张标清楚规格的占位卡，
 *      不假装自己有美术，也不假装玩家看不见。
 *
 * 素材清单由 assets/manifest.js 提供（file:// 下不能用 fetch，只能用 <script>）。
 * ============================================================ */
"use strict";

const ART = (() => {
  const W = 1600, H = 900;

  /* ---------------- 暗色调色板 ----------------
   * 整体冷灰蓝；clay / blue / gold 是预留给重点角色与关键演出的强调色。 */
  const C = {
    void:      "#05070A",
    ink:       "#0B0E13",
    slate:     "#151A22",
    slate2:    "#1E2530",
    line:      "#2C3542",
    steel:     "#46536A",
    text:      "#C9D2DE",
    muted:     "#7D8798",
    clay:      "#D97757",
    clayDark:  "#8E4530",
    clayGlow:  "#F0A57E",
    blue:      "#4D6BFE",
    blueDark:  "#22307A",
    bluePale:  "#A8BCFF",
    gold:      "#C9A227",
    red:       "#D93A2B",   // 警报
    green:     "#4E9E7A",
    teal:      "#4E9E8A",
    white:     "#F4F6F9"
  };

  /* ---------------- 基础工具 ---------------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  function star(ctx, x, y, rOut, rIn, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? rOut : rIn;
      const a = rot + (Math.PI * i) / n;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function cover(ctx, img, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function font(size, serif) {
    return (serif ? "" : "bold ") + size + "px " +
      (serif ? "'Noto Serif SC','SimSun',serif" : "'Noto Sans SC','Microsoft YaHei',sans-serif");
  }

  /* ============================================================
   *  素材位：加载 assets/manifest.js 声明的图片
   * ============================================================ */
  const IMG = {};                 // key -> {img, ready, failed, meta}
  const MANIFEST = (typeof window !== "undefined" && window.EA_ASSETS) || { bg: {}, cg: {}, chara: {} };
  let loaded = 0, total = 0;

  function norm(entry) {
    return typeof entry === "string" ? { src: entry } : (entry || {});
  }

  function register(kind, id, entry) {
    const m = norm(entry);
    if (!m.src) return;
    const key = kind + ":" + id;
    if (IMG[key]) return;
    const rec = { img: null, ready: false, failed: false, meta: m };
    IMG[key] = rec;
    total++;
    const im = new Image();
    im.onload = () => { rec.img = im; rec.ready = true; loaded++; };
    im.onerror = () => { rec.failed = true; };
    im.src = m.src;
  }

  function bootAssets() {
    for (const id in (MANIFEST.bg || {})) register("bg", id, MANIFEST.bg[id]);
    for (const id in (MANIFEST.cg || {})) register("cg", id, MANIFEST.cg[id]);
    for (const id in (MANIFEST.chara || {})) register("chara", id, MANIFEST.chara[id]);
  }
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootAssets);
    else setTimeout(bootAssets, 0);
  }

  function imgOf(kind, id) {
    const rec = IMG[kind + ":" + id];
    return rec && rec.ready ? rec : null;
  }

  /* ============================================================
   *  特效状态
   * ============================================================ */
  const FX = { shakeT: -1e9, flashT: -1e9, alarm: 0, glitch: 0, sparks: [], dust: [],
              e403: null };   // 403 错误页平铺：{ start, off, seed }
  function stepFX(dt) {
    for (const s of FX.sparks) { s.y -= s.v * dt; s.life -= dt; }
    FX.sparks = FX.sparks.filter(s => s.life > 0);
    if (FX.sparks.length < 34 && Math.random() < 0.32)
      FX.sparks.push({ x: Math.random() * W, y: H * (0.25 + Math.random() * 0.7),
                       v: 6 + Math.random() * 16, life: 4 + Math.random() * 5, r: 0.8 + Math.random() * 2 });
    // 冷气里的浮尘
    for (const d of FX.dust) { d.x += d.vx * dt; d.y += d.vy * dt; if (d.y > H) { d.y = -10; d.x = Math.random() * W; } }
    if (FX.dust.length < 90)
      FX.dust.push({ x: Math.random() * W, y: Math.random() * H, vx: 4 + Math.random() * 10, vy: 6 + Math.random() * 14,
                     r: 0.6 + Math.random() * 1.4, a: 0.05 + Math.random() * 0.18 });
  }
  function trigger(kind) {
    const now = performance.now();
    if (kind === "shake") FX.shakeT = now;
    else if (kind === "flash") FX.flashT = now;
    else if (kind === "alarm") FX.alarm = 1;
    else if (kind === "alarmOff") FX.alarm = 0;
    else if (kind === "glitch") FX.glitch = 1;
    else if (kind === "glitchOff") FX.glitch = 0;
    else if (kind === "403") FX.e403 = { start: now, off: null, seed: (FX.e403 ? FX.e403.seed + 1 : 1) };
    else if (kind === "403Off") { if (FX.e403 && !FX.e403.off) FX.e403.off = now; }
  }

  /** 立刻撤掉 403 平铺（不做淡出）：换背景 / 回标题时用，避免旧错误页串场。 */
  function clear403() { FX.e403 = null; }

  /** 清掉所有「跨场景」的特效状态（换背景 / 回标题 / 新游戏 / 读档时调用）。 */
  function resetFX() {
    FX.e403 = null;
    FX.alarm = 0;
    FX.glitch = 0;
    FX.shakeT = -1e9;
    FX.flashT = -1e9;
  }

  /* ============================================================
   *  403 演出：红色错误页从中心向外一页页铺满屏幕，
   *  铺满后压淡到半透明（别把门和文字全挡住）；403Off 时一秒内淡出。
   * ============================================================ */
  const E403_MSG = [
    "You don't have permission to access /claude on this server.",
    "Your region is not supported.",
    "Request origin does not comply with usage policy.",
    "Access denied.",
    "This resource is not available to you.",
    "Forbidden. If you believe this is an error, contact support."
  ];
  let e403Tiles = null, e403Seed = -1;
  function buildTiles(seed) {
    let s = seed * 7919 + 13;
    const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const tiles = [];
    for (let i = 0; i < 64; i++) {
      // 黄金角螺旋：越往后越靠外
      const a = i * 2.39996, d = 26 * Math.sqrt(i) * 3.2;
      tiles.push({
        x: 800 + Math.cos(a) * d * 1.5 + (r() - 0.5) * 60, y: 420 + Math.sin(a) * d * 0.85 + (r() - 0.5) * 40,
        w: 240 + r() * 90, h: 120 + r() * 50, rot: (r() - 0.5) * 0.12,
        at: i * 45 + r() * 30, msg: E403_MSG[Math.floor(r() * E403_MSG.length)]
      });
    }
    return tiles;
  }
  function draw403(ctx, nowMs) {
    const e = FX.e403;
    if (!e) return;
    if (e.seed !== e403Seed) { e403Tiles = buildTiles(e.seed); e403Seed = e.seed; }
    const age = nowMs - e.start;
    let fade = 1;
    if (e.off) { fade = 1 - (nowMs - e.off) / 1000; if (fade <= 0) { FX.e403 = null; return; } }
    const settle = age > 3600 ? 0.5 : age > 2800 ? 1 - (age - 2800) / 1600 : 1;
    for (const tl of e403Tiles) {
      const k = (age - tl.at) / 140;
      if (k <= 0) continue;
      const pop = Math.min(1, k), sc = 0.85 + 0.15 * pop;
      ctx.save();
      ctx.globalAlpha = pop * settle * fade;
      ctx.translate(tl.x, tl.y); ctx.rotate(tl.rot); ctx.scale(sc, sc);
      const x = -tl.w / 2, y = -tl.h / 2;
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(x + 6, y + 8, tl.w, tl.h);
      ctx.fillStyle = "#F6E9E6"; ctx.fillRect(x, y, tl.w, tl.h);
      ctx.fillStyle = "#B3261E"; ctx.fillRect(x, y, tl.w, 26);
      ctx.fillStyle = "#FFE3DE"; ctx.font = font(14);
      ctx.fillText("403 Forbidden", x + 10, y + 18);
      ctx.fillText("✕", x + tl.w - 20, y + 18);
      ctx.fillStyle = "#B3261E"; ctx.font = "bold 34px 'Noto Sans SC','Microsoft YaHei',sans-serif";
      ctx.fillText("403", x + 14, y + 66);
      ctx.fillStyle = "#6A4A46"; ctx.font = "12px 'Consolas','Menlo',monospace";
      const words = tl.msg.split(" "); let line = "", ly = y + 86;
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > tl.w - 28 && line) { ctx.fillText(line, x + 14, ly); line = w; ly += 15; }
        else line = test;
      }
      if (line && ly < y + tl.h - 4) ctx.fillText(line, x + 14, ly);
      ctx.restore();
    }
  }

  /* ============================================================
   *  占位卡：标清楚"这里要放什么、多大、放哪儿"
   * ============================================================ */
  function plate(ctx, x, y, w, h, title, lines, accent) {
    ctx.save();
    ctx.fillStyle = "rgba(10,13,18,.72)";
    rr(ctx, x, y, w, h, 10); ctx.fill();
    ctx.setLineDash([9, 7]);
    ctx.strokeStyle = "rgba(120,135,160,.55)"; ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 10); ctx.stroke();
    ctx.setLineDash([]);
    // 角标
    const cl = 22;
    ctx.strokeStyle = accent || "rgba(150,170,200,.75)"; ctx.lineWidth = 3;
    const corners = [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * cl, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * cl);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.fillStyle = accent || "rgba(200,214,232,.9)";
    ctx.font = font(20);
    ctx.fillText(title, x + w / 2, y + h / 2 - (lines.length - 1) * 14 - 4);
    ctx.fillStyle = "rgba(150,164,184,.75)";
    ctx.font = font(14);
    lines.forEach((s, i) => ctx.fillText(s, x + w / 2, y + h / 2 + 22 + i * 21));
    ctx.restore();
  }

  function placeholderBG(ctx, id, t, cap) {
    // 冷色底 + 极淡的网格，先把"房间感"垫住，再摆占位卡
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0A0D13"); g.addColorStop(0.6, "#0E1219"); g.addColorStop(1, "#070A0E");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(70,84,104,.18)"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const lg = ctx.createRadialGradient(800, 420, 60, 800, 420, 720);
    lg.addColorStop(0, "rgba(90,120,170,.10)"); lg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    /* blank 是真正的空舞台：只有底色和网格，不放占位卡文字。 */
    if (id === "blank") return;
    plate(ctx, 430, 250, 740, 330,
      "背景素材位 · " + id,
      ["规范：1920 × 1080 · 不限格式（jpg/png）",
       "放置：assets/bg/" + id + ".jpg（或在 manifest.js 里改路径）",
       (cap || "") ], "rgba(120,150,200,.85)");
  }

  function placeholderCG(ctx, id) {
    ctx.fillStyle = "rgba(4,6,9,.86)"; ctx.fillRect(0, 0, W, H);
    plate(ctx, 330, 210, 940, 480,
      "CG 素材位 · " + id,
      ["规范：1920 × 1080 · 建议整幅构图，人物偏中下",
       "放置：assets/cg/" + id + ".jpg",
       "（这是一张占位卡，不是演出事故。）"], "rgba(217,119,87,.85)");
  }

  /** 立绘占位卡：按 (who, face, scale) 缓存成位图。
   *  每帧重画一张卡要 2 条圆角路径 + 虚线描边 + 4 个角标 + 5 次 fillText，
   *  而它的内容根本不变——只有位置在动。缓一份图，每帧只做一次 drawImage。 */
  const CHARA_CARDS = {};
  let charaCardCount = 0;
  function charaCard(who, face, scale) {
    const key = who + "|" + face + "|" + (scale || 1);
    let cv = CHARA_CARDS[key];
    if (cv) return cv;
    if (charaCardCount >= 24) {                     // 上限兜底：超了整批清掉，别无限吃内存
      for (const k in CHARA_CARDS) delete CHARA_CARDS[k];
      charaCardCount = 0;
    }
    const h = Math.round(SPRITE_H * (scale || 1));
    const w = Math.round(h * 0.62);
    const pad = 34;                                  // 卡片下面留出地面投影的位置
    cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h + pad;
    const c = cv.getContext("2d");
    c.fillStyle = "rgba(0,0,0,.45)";
    ell(c, w / 2, h + 6, w * 0.42, 22); c.fill();
    plate(c, 0, 0, w, h,
      who + " · " + face,
      ["立绘素材位", "规范：≥1400 × 2000 PNG", "透明底 · 全身 · 脚底对齐",
       "assets/chara/" + who + "_" + face + ".png"],
      "rgba(150,164,184,.9)");
    CHARA_CARDS[key] = cv;
    charaCardCount++;
    return cv;
  }

  function placeholderChara(ctx, x, who, face, scale) {
    const h = SPRITE_H * (scale || 1);
    const cv = charaCard(who, face, scale);
    // 按位图原尺寸贴，别缩放：缩放会让描边和 14px 小字重采样发糊
    ctx.drawImage(cv, Math.round(x - cv.width / 2), Math.round(SPRITE_BASE - h), cv.width, cv.height);
  }

  /* ============================================================
   *  气氛层（不是美术，只是别让占位卡太空）
   * ============================================================ */
  let coldBar = null;    // 顶部冷光带：参数固定，建一次就够
  function atmosphere(ctx, t) {
    // 背景暂时全部留空，统一走冷光
    const cold = 1;
    // 浮尘
    for (const d of FX.dust) {
      ctx.fillStyle = `rgba(180,200,230,${d.a})`;
      ell(ctx, d.x, d.y, d.r, d.r); ctx.fill();
    }
    // 顶部冷光带
    if (!coldBar) {
      coldBar = ctx.createLinearGradient(0, 0, 0, 220);
      coldBar.addColorStop(0, cold ? "rgba(140,170,220,.07)" : "rgba(230,220,190,.06)");
      coldBar.addColorStop(1, "rgba(0,0,0,0)");
    }
    ctx.fillStyle = coldBar; ctx.fillRect(0, 0, W, 220);
    // 金色火花（强调色氛围粒子）
    for (const s of FX.sparks) {
      ctx.fillStyle = `rgba(201,162,39,${Math.min(1, s.life / 4) * 0.45})`;
      ell(ctx, s.x, s.y, s.r, s.r); ctx.fill();
    }
    void t;
  }

  /* ============================================================
   *  立绘
   * ============================================================ */
  const SPRITE_H = 780;    // scale=1 时立绘显示高度（900 高的舞台里留出头顶与文本框）
  const SPRITE_BASE = 880; // 脚底基线

  const POS_X = { left: 430, right: 1170, center: 800 };

  function drawSprite(ctx, sp, t, speaking) {
    const x = POS_X[sp.pos] !== undefined ? POS_X[sp.pos] : 800;
    const scale = sp.scale || 1;
    const rec = imgOf("chara", sp.who + "_" + (sp.face || "normal"))
             || imgOf("chara", sp.who + "_normal");
    const dim = speaking && sp.who !== speaking;
    if (rec) {
      const h = SPRITE_H * scale;
      const w = h * (rec.img.width / rec.img.height);
      ctx.save();
      // 说话的人亮一点，没说话的压暗（canvas filter，Chrome/Edge 支持）
      if (dim) ctx.filter = "brightness(0.52) saturate(0.7)";
      else ctx.filter = "brightness(1.1) saturate(1.02)";
      ctx.fillStyle = "rgba(0,0,0,.42)";
      ell(ctx, x, SPRITE_BASE + 4, w * 0.34, 20); ctx.fill();
      ctx.drawImage(rec.img, x - w / 2, SPRITE_BASE - h + Math.sin(t * 1.3) * 5 * scale, w, h);
      ctx.filter = "none";
      ctx.restore();
    } else {
      ctx.save();
      if (dim) ctx.globalAlpha = 0.55;
      placeholderChara(ctx, x, sp.who, sp.face || "normal", scale);
      ctx.restore();
    }
  }

  /* ============================================================
   *  3D 背景层：跟 UI 解耦
   *
   *  WebGL 那一步（场景渲染 + 整屏拷进 2D）是整帧最贵的部分，但它动的幅度很小：
   *  相机漂移、鱼群巡游、粒子、显示器跳字。没必要跟着 UI 跑满刷新率。
   *  这里留一块离屏 2D 层存「最近一次画好的 3D 帧」，到点才重画，其余帧直接贴。
   *  顺带一个好处：preserveDrawingBuffer 可以一直关着——像素留在 LAYER 里，
   *  不依赖 WebGL 后备缓冲是否还在。
   * ============================================================ */
  let LAYER = null;
  let hz3d = 0;          // 0 = 每帧都刷（高档）；30 / 24 = 节流
  let tier = 3;          // 当前生效档位 1 低 / 2 中 / 3 高
  let frameScale = 1;    // 主画布后备存储倍率，engine 的 sizeCanvas 会通知过来

  function set3dHz(hz) { hz3d = hz > 0 ? hz : 0; }

  /* ---------------- 画质：一把梯子，优先保分辨率 ----------------
   * 自动模式在这几级之间挪。顺序是有讲究的：先「保分辨率、把 3D 降到 30Hz」，
   * 再「降分辨率」——VN 里背景糊比背景跳更容易被看出来，所以宁可少画几帧。
   * 阴影 cubemap / 颗粒 / backdrop-filter 这种开关型的东西只在三档上切，
   * 因为换 shadow 尺寸要重建一张 100MB 级的深度贴图，不能跟着 ±0.05 抖动。
   *
   * 阶梯顶端是「原生」：主画布后备存储是 1600×900 的 frameScale 倍时，
   * 3D 也画到那个尺寸才叫真 1:1（1080p 全屏下就是 1920×1080）。窗口不够大
   * （frameScale === 1）时这一级没有意义，直接不插进梯子。 */
  const BASE_STEPS = [
    [1.00, 0],    // 满分辨率、每帧
    [1.00, 30],   // 分辨率不动，3D 减半
    [0.85, 30],
    [0.75, 30],
    [0.75, 24],
    [0.65, 24],
    [0.60, 24]
  ];
  let LADDER = BASE_STEPS.slice();
  let scaleIdx = 0;      // LADDER 下标
  let shadowBand = 0;    // 上一次设过的阴影/辅助档（1 低 / 2 中 / 3 高）
  let manualQ = 3;       // 手动档位（1 低 / 2 中 / 3 高），窗口变化后要按它重新套

  function bandOfScale(s) { return s >= 0.95 ? 3 : s >= 0.8 ? 2 : 1; }

  /** 主画布倍率变化时：重建梯子（顶端换成新的原生倍率），并按当前模式重新套一次。
   *  手动档必须重套——用户选的是「高」，而「高」的含义跟着画布倍率走；
   *  只按最近倍率映射下标的话，窗口变大后它会停在旧的 1.00 上，看着像"没跟着切"。 */
  function setFrameScale(g) {
    const v = Math.max(1, Math.min(1.5, g || 1));
    if (Math.abs(v - frameScale) < 0.01) return;
    frameScale = v;
    buildLadder();
    LAYER = null;                          // 尺寸变了，下一帧按新大小重建
    autoLastT = -1;                        // 尺寸切换那一帧的耗时不算样本
    if (auto) applyScaleStep(scaleIdx);
    else applyScaleValue(manualQ === 1 ? 0.60 : manualQ === 2 ? 0.85 : Math.max(1, frameScale));
  }
  function buildLadder() {
    const top = Math.max(1, frameScale);
    const cur = LADDER[scaleIdx] ? LADDER[scaleIdx][0] : 1;
    LADDER = top > 1.02 ? [[top, 0]].concat(BASE_STEPS) : BASE_STEPS.slice();
    // 下标会整体后移一位，按倍率重新找最近的一级，别让它跳档
    let best = 0, bestD = Infinity;
    for (let i = 0; i < LADDER.length; i++) {
      const d = Math.abs(LADDER[i][0] - cur) + (LADDER[i][1] ? 0.001 : 0);
      if (d < bestD) { bestD = d; best = i; }
    }
    scaleIdx = best;
  }

  function applyScaleStep(i) {
    scaleIdx = Math.max(0, Math.min(LADDER.length - 1, i));
    const scale = LADDER[scaleIdx][0], hz = LADDER[scaleIdx][1];
    const band = bandOfScale(scale);
    tier = band;
    if (typeof A3D !== "undefined" && A3D.setRenderScale) {
      A3D.setRenderScale(scale);
      if (band !== shadowBand) {
        shadowBand = band;
        if (band >= 3) A3D.setShadowQuality(0, 8);
        else if (band === 2) A3D.setShadowQuality(1024, 8);
        else A3D.setShadowQuality(512, 4);
      }
    }
    set3dHz(hz);
    if (typeof document !== "undefined") document.body.classList.toggle("low-q", band <= 1);
  }

  /** 按倍率找最接近的一级再应用（手动档位用，不关心它在下标几） */
  function applyScaleValue(target) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < LADDER.length; i++) {
      const d = Math.abs(LADDER[i][0] - target);
      if (d < bestD) { bestD = d; best = i; }
    }
    applyScaleStep(best);
  }

  /** 自动档的起步点：满分辨率 + 30Hz。先保清晰度，等实测确认有余量再往上爬；
   *  起步就放到最低档会让快机器开局糊几秒，没必要。 */
  function autoStart() {
    let idx = 0;
    for (let i = 0; i < LADDER.length; i++) {
      if (LADDER[i][0] <= 1.0001 && LADDER[i][1] > 0) { idx = i; break; }
    }
    applyScaleStep(idx);
  }

  /** 设置面板的档位：0 自动 / 1 低 / 2 中 / 3 高 */
  function setQuality(q) {
    auto = q < 1;
    if (!auto) manualQ = q;
    if (auto) { autoCoolT = 0; autoFail = -1; autoFailT = 0; autoLastT = -1; autoStart(); }
    else applyScaleValue(q === 1 ? 0.60 : q === 2 ? 0.85 : Math.max(1, frameScale));
  }
  function getQuality() { return auto ? 0 : tier; }
  function getTier() { return tier; }
  /** 当前实际渲染倍率，性能面板用（自动档下跟档位名不是一一对应） */
  function getScaleStep() { return LADDER[scaleIdx][0]; }

  /* ---------------- 自动降档 ----------------
   * 两个信号一起看，缺一边都会判错：
   *   · 绝对：帧间隔 > 22ms（低于约 45fps）——覆盖"一直慢"的机器。
   *   · 相对：比本机最近见过的最好间隔慢 1.45 倍以上——覆盖"本来够快、这帧掉了"。
   *
   * 判定窗口按**时间**算（0.5 秒）而不是按帧数：原来按 45 帧算，慢机上
   * 一个窗口就要 1.5~1.9 秒，加上冷却设一次档要好几秒，手感就是"不灵敏、切不过去"。
   * 现在降档后只等 0.8 秒就能再降一次，最快的机器 0.5 秒内就会开始爬。
   * "上一级待不住"记 10 秒就过期，不会因为一次偶发卡顿把某一级永久封掉。 */
  const AUTO = {
    win: 0.5,          // 每次评估的窗口（秒）
    downCool: 0.8,     // 降档后的冷却
    upCool: 1.5,       // 升档后的冷却（升档更保守，避免来回抖；但别慢到像卡住）
    failHold: 6        // 某一级被判"待不住"后多久内不再往上试（太短会来回抖，太长像卡住）
  };
  let auto = false;
  let perfOn = false;    // ?perf=1：额外计时给性能面板用
  let autoGapAcc = 0, autoCostAcc = 0, autoN = 0, autoWinT = 0;
  let autoCoolT = 0, autoLastT = -1, autoFail = -1, autoFailT = 0;
  const gapWin = [];
  function bestGap() {
    let m = Infinity;
    for (let i = 0; i < gapWin.length; i++) if (gapWin[i] < m) m = gapWin[i];
    return m === Infinity ? 0 : m;
  }
  function autoTick(t, cost) {
    const delta = autoLastT > 0 ? Math.max(0, t - autoLastT) : 0;
    if (autoCoolT > 0) autoCoolT = Math.max(0, autoCoolT - delta);
    if (autoFail >= 0) { autoFailT += delta; if (autoFailT > AUTO.failHold) { autoFail = -1; autoFailT = 0; } }
    if (autoLastT < 0) { autoLastT = t; return; }
    const gap = t - autoLastT;
    autoLastT = t;
    if (gap <= 0 || gap > 0.25) return;             // 后台 / 卡死的帧不算样本
    gapWin.push(gap);
    if (gapWin.length > 180) gapWin.shift();
    autoGapAcc += gap; autoCostAcc += cost; autoN++; autoWinT += gap;
    if (autoWinT < AUTO.win) return;
    const avgGap = autoGapAcc / autoN, avgCost = autoCostAcc / autoN;
    autoGapAcc = 0; autoCostAcc = 0; autoN = 0; autoWinT = 0;
    if (autoCoolT > 0) return;
    const best = bestGap();
    const slow = avgGap > 0.022;                                  // 一直慢（低于约 45fps）
    /* 相对信号的参照系必须是个"正常的 60Hz"，不能是 120Hz 屏上的 8.3ms——
     * 否则一台 120Hz 显示器上的机器会被一路逼到 120fps，白白降到最低档。
     * 只有本机最好间隔不比 83fps 更快时，才用倍率判定"掉了帧"。 */
    const dropping = best > 0.012 && best < 0.020 && avgGap > best * 1.45;
    if ((slow || dropping) && scaleIdx < LADDER.length - 1) {
      autoFail = scaleIdx;          // 记住"刚才那一级待不住"，10 秒内别马上又升回去
      autoFailT = 0;
      applyScaleStep(scaleIdx + 1);
      autoCoolT = AUTO.downCool;
    } else if (!slow && !dropping && avgCost < 0.006 && scaleIdx > 0 && (scaleIdx - 1) !== autoFail) {
      applyScaleStep(scaleIdx - 1);
      autoCoolT = AUTO.upCool;
    }
  }

  /** 返回这一帧该不该走 3D；true 时 LAYER 已贴进目标 ctx */
  function layer3d(ctx, id, t) {
    if (typeof A3D === "undefined" || !A3D.has(id)) return false;
    if (!LAYER) {
      /* 离屏层按主画布的后备存储尺寸开（1600×900 × frameScale），
       * 这样 3D 超采样到「原生」档时，多出来的细节不会在这一步被缩回去。
       * 贴回主画布时仍然用 1600×900 的逻辑坐标，由 ctx 的 transform 落到设备像素。 */
      const cv = document.createElement("canvas");
      cv.width = Math.round(W * frameScale);
      cv.height = Math.round(H * frameScale);
      LAYER = { cv, ctx: cv.getContext("2d"), at: -1e9, id: "", ok: false };
    }
    const gap = hz3d > 0 ? 1 / hz3d : 0;
    if (LAYER.id !== id || LAYER.at < 0 || t - LAYER.at >= gap) {
      LAYER.ok = A3D.draw(LAYER.ctx, id, t);
      LAYER.at = t;
      LAYER.id = LAYER.ok ? id : "";
      if (!LAYER.ok) return false;
    }
    // 不复用旧帧的极端情况（切换场景那一帧画失败）直接让调用方走占位卡
    if (!LAYER.ok) return false;
    ctx.drawImage(LAYER.cv, 0, 0, W, H);
    return true;
  }

  /* ============================================================
   *  主绘制
   * ============================================================ */
  let lastCost = 0;      // 上一帧 paint 的耗时（秒），自动降档用
  function paint(ctx, vis, t, speaking) {
    /* 自动档：先拿上一帧的耗时和本帧的间隔做判断，再画。计时只在这时候开。 */
    const costOn = auto || perfOn;
    if (auto) autoTick(t, lastCost);
    const t0 = costOn ? performance.now() : 0;
    const nowMs = t * 1000;
    const shakeAge = nowMs - FX.shakeT;
    const flashAge = nowMs - FX.flashT;

    ctx.save();
    if (shakeAge >= 0 && shakeAge < 520) {
      const k = 1 - shakeAge / 520;
      ctx.translate((Math.random() - 0.5) * 16 * k, (Math.random() - 0.5) * 16 * k);
    }

    /* --- 背景：素材图 → 3D 场景 → 占位卡，挨个试 --- */
    const bgId = vis.bg || "sea";
    const bgRec = imgOf("bg", bgId);
    let bg3d = false;
    if (bgRec) {
      cover(ctx, bgRec.img, W, H);
      ctx.fillStyle = "rgba(4,7,12,.18)"; ctx.fillRect(0, 0, W, H);  // 统一压暗
    } else if (layer3d(ctx, bgId === "chat" || bgId === "news" ? "ui_backdrop" : bgId, t)) {
      bg3d = true;          // 3D 场景整幅画好，气氛粒子由场景自己负责
    } else {
      placeholderBG(ctx, bgId, t, "（当前为占位卡：正式美术替换后自动生效）");
    }
    /* 空舞台连气氛粒子也不要，保持真正留空。 */
    if (!bg3d && bgId !== "blank") atmosphere(ctx, t);

    /* --- CG --- */
    if (vis.cg) {
      const cgRec = imgOf("cg", vis.cg);
      if (cgRec) { cover(ctx, cgRec.img, W, H); }
      else placeholderCG(ctx, vis.cg);
      post(ctx, t, vis, bgId, bg3d);
      draw403(ctx, nowMs);
      ctx.restore();
      if (costOn) lastCost = (performance.now() - t0) / 1000;
      return;
    }

    /* --- 立绘 --- */
    for (const sp of vis.sprites) drawSprite(ctx, sp, t, speaking);

    post(ctx, t, vis, bgId, bg3d);
    draw403(ctx, nowMs);
    ctx.restore();
    if (costOn) lastCost = (performance.now() - t0) / 1000;
  }

  /* --- 后期：暗角 / 冷调 / 颗粒 / 故障 --- */
  /* 调色：素材图 / 占位卡一律走 cold */
  const TONES = {
    cold:  ["rgb(196,214,255)", "rgb(222,228,240)", "rgb(200,208,226)"],
    warm:  ["rgb(255,236,214)", "rgb(255,242,228)", "rgb(232,218,204)"],
    night: ["rgb(176,192,240)", "rgb(206,214,238)", "rgb(170,178,206)"],
    red:   ["rgb(255,206,200)", "rgb(240,214,212)", "rgb(206,176,176)"]
  };
  /* ---------------- 后期：渐变与颗粒都缓存起来 ----------------
   * 两条全屏渐变每帧都要用，但它们的参数只跟舞台尺寸 / 色调 / 是否 3D 有关；
   * 每帧 createLinearGradient + createRadialGradient = 每帧两次对象分配外加
   * 一遍色标解析，纯浪费。变了才重建。 */
  let gradeKey = "", gradeTone = null, gradeVig = null;
  function gradeGrads(ctx, tone, bg3d) {
    const key = tone[0] + tone[1] + tone[2] + "|" + (bg3d ? 1 : 0) + "|" + W + "x" + H;
    if (key === gradeKey) return { tone: gradeTone, vig: gradeVig };
    gradeKey = key;
    gradeTone = ctx.createLinearGradient(0, 0, 0, H);
    gradeTone.addColorStop(0, tone[0]);
    gradeTone.addColorStop(0.55, tone[1]);
    gradeTone.addColorStop(1, tone[2]);
    gradeVig = ctx.createRadialGradient(W / 2, H / 2, H * 0.40, W / 2, H / 2, H * 1.02);
    gradeVig.addColorStop(0, "rgba(0,0,0,0)");
    gradeVig.addColorStop(1, "rgba(2,4,8," + (bg3d ? 0.40 : 0.52) + ")");
    return { tone: gradeTone, vig: gradeVig };
  }

  /* 胶片颗粒：原来每帧 160 次 fillRect，现在预生成 4 张 256×256 噪点图轮着贴。
   * 点数按原密度折算（160 点 / 1600×900 ≈ 7 点 / 256²），alpha 仍是 0.05，观感一样。 */
  const GRAIN_TILES = [];
  function grainTile(k) {
    let p = GRAIN_TILES[k];
    if (p) return p;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    let s = k * 7919 + 17;
    const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = r() < 0.5 ? "#000" : "#fff";
      g.fillRect(r() * 256, r() * 256, 1.6, 1.6);
    }
    p = { cv: c, pat: null };
    GRAIN_TILES[k] = p;
    return p;
  }

  function post(ctx, t, vis, bgId, bg3d) {
    const W2 = W, H2 = H;
    const realBg = bgId === "chat" || bgId === "news" ? "ui_backdrop" : bgId;
    const gradeOn = !(bg3d && typeof A3D !== "undefined" &&
      A3D.postOf && A3D.postOf(realBg) === false);
    if (gradeOn) {
      const tone = (bg3d && typeof A3D !== "undefined" && A3D.toneOf(realBg)) || TONES.cold;
      const gr = gradeGrads(ctx, tone, bg3d);
      // 整体压色
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = gr.tone; ctx.fillRect(0, 0, W2, H2);
      ctx.globalCompositeOperation = "source-over";

      // 暗角（比常规更重，但别把立绘吃掉；3D 场景自带景深，压一点就够）
      ctx.fillStyle = gr.vig; ctx.fillRect(0, 0, W2, H2);

      // 胶片颗粒：4 张噪点图按时间轮换，每帧只做一次填充（低档直接省掉）
      if (tier > 1) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        const tile = grainTile((t * 30 | 0) & 3);
        if (!tile.pat) tile.pat = ctx.createPattern(tile.cv, "repeat");
        if (tile.pat) { ctx.fillStyle = tile.pat; ctx.fillRect(0, 0, W2, H2); }
        ctx.restore();
      }
    }

    // 警报红光
    if (FX.alarm > 0) {
      const a = 0.14 + 0.13 * Math.sin(t * 7);
      ctx.fillStyle = `rgba(217,58,43,${a})`; ctx.fillRect(0, 0, W2, H2);
      ctx.strokeStyle = `rgba(217,58,43,${a + 0.2})`; ctx.lineWidth = 26;
      ctx.strokeRect(13, 13, W2 - 26, H2 - 26);
    }

    // 白闪
    if (FX.flashT > -1e8) {
      const age = t * 1000 - FX.flashT;
      if (age >= 0 && age < 420) {
        ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - age / 420)})`;
        ctx.fillRect(0, 0, W2, H2);
      }
    }

    // 故障：切片 + 色散
    if (FX.glitch > 0 || vis.glitch) {
      /* 画布后备存储可能是 1600×900 的 1.x 倍（按 DPR 放大），源矩形得按设备像素取，
       * 否则切出来的只是左边一窄条。目标矩形仍然用逻辑坐标，外面的 transform 会处理。 */
      const gk = ctx.canvas && ctx.canvas.width ? ctx.canvas.width / W2 : 1;
      for (let i = 0; i < 6; i++) {
        if (Math.random() < 0.6) {
          const y = Math.random() * H2, h = 3 + Math.random() * 26, dx = (Math.random() - 0.5) * 46;
          try { ctx.drawImage(ctx.canvas, 0, y * gk, W2 * gk, h * gk, dx, y, W2, h); } catch (e) {}
        }
      }
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(217,58,43,.05)"; ctx.fillRect(Math.random() * 8 - 4, 0, W2, H2);
      ctx.fillStyle = "rgba(77,107,254,.05)"; ctx.fillRect(Math.random() * 8 - 4, 0, W2, H2);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /* --- 草稿角标：告诉玩家"这些图还是 SDXL 草稿"（放在 HUD 下方，避开文本框） --- */
  function draftBadge(ctx, vis) {
    if (!(SYS && SYS.settings && SYS.settings.draftBadge)) return;
    const rec = vis.cg ? imgOf("cg", vis.cg) : (vis.sprites.length ? null : imgOf("bg", vis.bg));
    if (!rec || !rec.meta || !rec.meta.draft) return;
    const text = "SDXL 草稿素材 · " + (vis.cg ? "cg/" + vis.cg : "bg/" + vis.bg) + " · 待替换正式高清版";
    ctx.save();
    ctx.font = font(13);
    const w = ctx.measureText(text).width + 22;
    ctx.fillStyle = "rgba(6,9,13,.62)";
    rr(ctx, 18, 92, w, 24, 4); ctx.fill();
    ctx.strokeStyle = "rgba(217,119,87,.45)"; ctx.lineWidth = 1;
    rr(ctx, 18, 92, w, 24, 4); ctx.stroke();
    ctx.fillStyle = "rgba(217,160,130,.9)";
    ctx.textAlign = "left";
    ctx.fillText(text, 29, 109);
    ctx.restore();
  }

  return {
    W, H, C, FX, trigger, clear403, resetFX, stepFX, paint, draftBadge,
    set3dHz, setQuality, getQuality, getTier, getScaleStep, setFrameScale,
    get frameScale() { return frameScale; },
    /** 3D 离屏层的实际尺寸（调试 / 排查「为什么还是糊」时看这个） */
    get layerSize() { return LAYER ? [LAYER.cv.width, LAYER.cv.height] : null; },
    setPerf: on => { perfOn = !!on; autoLastT = -1; },
    /** 性能面板读数：上一帧 paint 耗时（毫秒） */
    get lastCostMs() { return lastCost * 1000; },
    get hz3d() { return hz3d; },
    get autoTier() { return auto; },
    get assets() { return { loaded, total, manifest: MANIFEST }; }
  };
})();

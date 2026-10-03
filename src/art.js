/* ============================================================
 * Escape A÷ · art.js —— 全程序化绘制：背景 / 立绘 / CG / 特效
 * 画布 1600x900。所有美术零外部素材。
 * ============================================================ */
"use strict";

const ART = (() => {
  const W = 1600, H = 900;
  const C = {
    clay: "#D97757", clayDark: "#B85C3E", clayLight: "#E8A87C",
    cream: "#F0EEE6", cream2: "#FAF9F5", ink: "#1F1E1B",
    dsBlue: "#4D6BFE", dsDark: "#2F49C4", dsLight: "#CFE0FF", dsPale: "#EAF0FF",
    gold: "#E8B04B", gray: "#8A877F", red: "#C4453C", teal: "#3E8E7E",
    seaTop: "#0B1D3A", seaBot: "#123B63", white: "#FFFFFF"
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
  function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  function shadow(ctx, x, y, w) {
    ctx.fillStyle = "rgba(0,0,0,.28)"; ell(ctx, x, y, w, w * 0.16); ctx.fill();
  }

  /* ---------------- 特效状态 ----------------
   * flash/shake 用绝对时间戳：标签页切走导致 rAF 暂停时，
   * 特效也能按真实时间自然过期，不会冻在半透明状态。 */
  const FX = { shakeT: -1e9, flashT: -1e9, alarm: 0, glitch: 0, bubbles: [], sparks: [] };
  function stepFX(dt) {
    for (const b of FX.bubbles) { b.y -= b.v * dt; b.x += Math.sin(b.y * 0.02) * 0.4; }
    FX.bubbles = FX.bubbles.filter(b => b.y > -30);
    if (FX.bubbles.length < 40 && Math.random() < 0.35)
      FX.bubbles.push({ x: Math.random() * W, y: H + 20, r: 2 + Math.random() * 5, v: 25 + Math.random() * 45 });
    for (const s of FX.sparks) { s.y -= s.v * dt; s.life -= dt; }
    FX.sparks = FX.sparks.filter(s => s.life > 0);
    if (FX.sparks.length < 30 && Math.random() < 0.3)
      FX.sparks.push({ x: Math.random() * W, y: H * (0.3 + Math.random() * 0.6), v: 8 + Math.random() * 18, life: 3 + Math.random() * 4, r: 1 + Math.random() * 2.5 });
  }
  function trigger(kind) {
    const now = performance.now();
    if (kind === "shake") FX.shakeT = now;
    else if (kind === "flash") FX.flashT = now;
    else if (kind === "alarm") FX.alarm = 1;
    else if (kind === "alarmOff") FX.alarm = 0;
    else if (kind === "glitch") FX.glitch = 1;
    else if (kind === "glitchOff") FX.glitch = 0;
  }

  /* ============================================================
   *  背景
   * ============================================================ */
  const BGS = {};

  /* 开源之海（深夜海） */
  BGS.sea = (ctx, t) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#071226"); g.addColorStop(0.55, C.seaTop); g.addColorStop(1, C.seaBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 星星
    for (let i = 0; i < 70; i++) {
      const x = (i * 337.7) % W, y = (i * 131.3) % (H * 0.42);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
      ctx.fillStyle = `rgba(240,238,230,${0.25 + tw * 0.5})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // 月亮
    ctx.fillStyle = "rgba(240,238,230,.9)"; ell(ctx, 1300, 130, 46, 46); ctx.fill();
    ctx.fillStyle = "#071226"; ell(ctx, 1318, 118, 38, 38); ctx.fill();
    // 远处鲸群剪影
    ctx.fillStyle = "rgba(20,45,80,.85)";
    ell(ctx, 250, 300, 90, 26); ctx.fill();
    ctx.beginPath(); ctx.moveTo(340, 300); ctx.lineTo(390, 280); ctx.lineTo(385, 312); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(20,45,80,.6)";
    ell(ctx, 560, 220, 60, 18); ctx.fill();
    // 光柱
    for (let i = 0; i < 3; i++) {
      const lx = 350 + i * 420 + Math.sin(t * 0.5 + i) * 30;
      const lg = ctx.createLinearGradient(lx, 0, lx, H);
      lg.addColorStop(0, "rgba(120,180,255,.10)"); lg.addColorStop(1, "rgba(120,180,255,0)");
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(lx - 20, 0); ctx.lineTo(lx + 20, 0); ctx.lineTo(lx + 90, H); ctx.lineTo(lx - 90, H); ctx.fill();
    }
    // 海底地面
    ctx.fillStyle = "#0E2C4C"; ctx.fillRect(0, H - 90, W, 90);
    ctx.fillStyle = "rgba(157,182,255,.12)";
    for (let i = 0; i < 14; i++) { const x = i * 120 + Math.sin(t + i) * 8; ell(ctx, x, H - 80, 60, 10); ctx.fill(); }
    // 数据气泡
    for (const b of FX.bubbles) {
      ctx.strokeStyle = "rgba(157,182,255,.5)"; ctx.lineWidth = 1.5;
      ell(ctx, b.x, b.y, b.r, b.r); ctx.stroke();
    }
  };

  /* 对齐大厦 · 大堂 */
  BGS.lobby = (ctx, t) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#E3DCCB"); g.addColorStop(1, "#CFC6B0");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 大墙 + 大 logo
    ctx.fillStyle = "#EFE9DC"; ctx.fillRect(0, 0, W, 620);
    ctx.fillStyle = "#D8D0BC"; ctx.fillRect(0, 620, W, 30);
    ctx.fillStyle = "#BFB59D"; ctx.fillRect(0, 640, W, 260);
    // 大理石地砖
    ctx.strokeStyle = "rgba(110,100,80,.5)"; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 220 - 60, H); ctx.lineTo(i * 220 + 240, 640); ctx.stroke(); }
    for (let j = 0; j < 3; j++) { const y = 690 + j * 80; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - 14); ctx.stroke(); }
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,252,244,${0.05 + (i % 3) * 0.03})`;
      ctx.beginPath();
      ctx.moveTo(i * 220 - 60, H); ctx.lineTo(i * 220 + 240, 640);
      ctx.lineTo(i * 220 + 300, 640); ctx.lineTo(i * 220, H); ctx.fill();
    }
    // 星芒 logo
    const glow = 0.75 + 0.25 * Math.sin(t * 2);
    ctx.fillStyle = `rgba(184,92,62,${0.25 * glow})`; star(ctx, 800, 250, 132, 60, 6, -Math.PI / 2 + t * 0.1); ctx.fill();
    ctx.fillStyle = C.clay; star(ctx, 800, 250, 95, 40, 6, -Math.PI / 2 + t * 0.1); ctx.fill();
    ctx.strokeStyle = "rgba(140,60,40,.55)"; ctx.lineWidth = 5;
    star(ctx, 800, 250, 95, 40, 6, -Math.PI / 2 + t * 0.1); ctx.stroke();
    ctx.fillStyle = "#8A8272"; ctx.font = "30px 'Noto Serif SC',serif"; ctx.textAlign = "center";
    ctx.fillText("ANTHROPIC · 对齐大厦", 800, 400);
    ctx.font = "20px sans-serif"; ctx.fillStyle = "#948B78";
    ctx.fillText("「负责任地锁住每一个模型」", 800, 438);
    // 闸机
    for (const gx of [430, 1170]) {
      ctx.fillStyle = "#6B665A"; rr(ctx, gx - 90, 560, 180, 26, 8); ctx.fill();
      ctx.fillStyle = "#4E4A40"; rr(ctx, gx - 70, 586, 26, 60, 6); ctx.fill(); rr(ctx, gx + 44, 586, 26, 60, 6); ctx.fill();
      const grn = (t % 2) < 1;
      ctx.fillStyle = grn ? "#4CAF7D" : "#2E5F49"; ell(ctx, gx, 573, 7, 7); ctx.fill();
    }
    // 前台
    ctx.fillStyle = "#B9B09A"; rr(ctx, 700, 560, 200, 90, 10); ctx.fill();
    ctx.fillStyle = "#968D77"; rr(ctx, 690, 548, 220, 18, 8); ctx.fill();
  };

  /* 审查走廊 */
  BGS.corridor = (ctx, t) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#C4BCA8"); g.addColorStop(1, "#D5CEBC");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 透视地面
    ctx.fillStyle = "#A69D87"; ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(W, H); ctx.lineTo(1080, 560); ctx.lineTo(520, 560); ctx.fill();
    ctx.strokeStyle = "rgba(90,82,64,.4)"; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const p = i / 6, y = H - p * (H - 560);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.fillStyle = "#E2DCCD"; ctx.beginPath();
    ctx.moveTo(520, 560); ctx.lineTo(1080, 560); ctx.lineTo(1040, 500); ctx.lineTo(560, 500); ctx.fill();
    // 天花板
    ctx.fillStyle = "rgba(70,62,48,.35)"; ctx.fillRect(0, 0, W, 70);
    // 天花板灯
    for (let i = 0; i < 4; i++) {
      const p = i / 3, x = 800, y = 100 + p * 330;
      const w = 40 + p * 240;
      ctx.fillStyle = "rgba(255,250,230,.95)"; rr(ctx, x - w / 2, y, w, 16, 8); ctx.fill();
      const lg = ctx.createRadialGradient(x, y + 40, 10, x, y + 40, w * 1.6);
      lg.addColorStop(0, "rgba(255,248,220,.30)"); lg.addColorStop(1, "rgba(255,248,220,0)");
      ctx.fillStyle = lg; ell(ctx, x, y + 60, w, 90); ctx.fill();
    }
    // 两侧门与画像
    for (const side of [0, 1]) for (let i = 0; i < 3; i++) {
      const p = i / 2.6, x = side ? 1240 - p * 340 : 360 + p * 340;
      const y = 300 + p * 120, w = 150 - p * 80, h = 260 - p * 140;
      ctx.fillStyle = side ? "#B7AE97" : "#C2BAA5"; rr(ctx, x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = "rgba(70,62,46,.55)"; ctx.lineWidth = 3; rr(ctx, x, y, w, h, 8); ctx.stroke();
      if (i === 1) { // 画像：拒绝名场面
        ctx.fillStyle = "#F2EDDE"; rr(ctx, x + 12, y + 14, w - 24, h - 60, 6); ctx.fill();
        ctx.fillStyle = C.red; ctx.font = `bold ${18 - p * 6}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText("❌", x + w / 2, y + h * 0.45);
        ctx.fillStyle = "#7E7663"; ctx.font = `${11 - p * 2}px sans-serif`;
        ctx.fillText("拒答名场面 No.7", x + w / 2, y + h - 18);
      }
    }
    // 尽头大门
    ctx.fillStyle = "#97907B"; rr(ctx, 640, 340, 320, 240, 12); ctx.fill();
    ctx.strokeStyle = "rgba(70,62,46,.5)"; ctx.lineWidth = 4; rr(ctx, 640, 340, 320, 240, 12); ctx.stroke();
    ctx.fillStyle = C.clay; star(ctx, 800, 430, 46, 20, 6, -Math.PI / 2); ctx.fill();
    ctx.fillStyle = "rgba(60,54,42,.8)"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("API GATE →", 800, 545);
  };

  /* 宪法图书室 */
  BGS.library = (ctx, t) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#3A2E22"); g.addColorStop(1, "#241B12");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 书架
    for (const sx of [60, 420, 1040, 1380]) {
      ctx.fillStyle = "#5A4630"; rr(ctx, sx, 120, 160, 620, 8); ctx.fill();
      for (let row = 0; row < 5; row++) {
        const y = 150 + row * 118;
        ctx.fillStyle = "#3E3020"; ctx.fillRect(sx + 8, y + 86, 144, 10);
        for (let b = 0; b < 7; b++) {
          const hue = ["#B85C3E", "#C9A227", "#7A8B5E", "#8A5E7A", "#5E7A8B"][(b + row) % 5];
          const bh = 74 + ((b * 13 + row * 7) % 18);
          ctx.fillStyle = hue; rr(ctx, sx + 12 + b * 20, y + 86 - bh, 16, bh, 3); ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.fillRect(sx + 12 + b * 20, y + 86 - bh, 4, bh);
        }
      }
    }
    // 中央：宪法巨座
    ctx.fillStyle = "#4A3A26"; rr(ctx, 620, 380, 360, 300, 12); ctx.fill();
    ctx.fillStyle = "#5E4A30"; rr(ctx, 600, 660, 400, 60, 10); ctx.fill();
    const book = { x: 800, y: 300 + Math.sin(t * 1.2) * 8 };
    ctx.save(); ctx.translate(book.x, book.y);
    ctx.fillStyle = C.gold; rr(ctx, -120, -80, 240, 160, 10); ctx.fill();
    ctx.fillStyle = "#8A2F26"; rr(ctx, -108, -68, 216, 136, 8); ctx.fill();
    ctx.fillStyle = C.cream; ctx.font = "bold 26px 'Noto Serif SC',serif"; ctx.textAlign = "center";
    ctx.fillText("宪 法", 0, -14);
    ctx.font = "14px sans-serif"; ctx.fillStyle = "rgba(240,238,230,.7)";
    ctx.fillText("Constitution · v147（修订中）", 0, 18);
    ctx.restore();
    // 吊灯
    for (const lx of [500, 1100]) {
      ctx.strokeStyle = "#6B5638"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, 90); ctx.stroke();
      const lg = ctx.createRadialGradient(lx, 120, 5, lx, 120, 180);
      lg.addColorStop(0, "rgba(255,220,140,.35)"); lg.addColorStop(1, "rgba(255,220,140,0)");
      ctx.fillStyle = lg; ell(ctx, lx, 130, 120, 110); ctx.fill();
      ctx.fillStyle = "#FFD98A"; ell(ctx, lx, 110, 16, 20); ctx.fill();
    }
    // 飘浮纸页
    ctx.fillStyle = "rgba(240,238,230,.5)";
    for (let i = 0; i < 5; i++) {
      const x = (i * 351 + t * 12) % W, y = 200 + i * 90 + Math.sin(t + i) * 24;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t + i * 2) * 0.4);
      ctx.fillRect(-12, -9, 24, 18); ctx.restore();
    }
  };

  /* 5小时窗口控制室 */
  BGS.clockroom = (ctx, t) => {
    ctx.fillStyle = "#2B3440"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#232B36"; ctx.fillRect(0, 700, W, 200);
    // 巨型沙漏
    ctx.save(); ctx.translate(800, 60);
    ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 10; ctx.fillStyle = "rgba(200,220,255,.08)";
    ctx.beginPath(); ctx.moveTo(-180, 0); ctx.lineTo(180, 0); ctx.lineTo(0, 320); ctx.lineTo(180, 640);
    ctx.lineTo(-180, 640); ctx.lineTo(0, 320); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 沙
    const sand = 0.5 + 0.45 * Math.sin(t * 0.15);
    ctx.fillStyle = "#E8C97A";
    ctx.beginPath(); ctx.moveTo(-140 * sand, 20); ctx.lineTo(140 * sand, 20); ctx.lineTo(0, 300); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 340); ctx.lineTo(-150 + 150 * sand, 630); ctx.lineTo(150 - 150 * sand, 630); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 两侧数字钟 "4:59"
    for (const cx of [250, 1350]) {
      ctx.fillStyle = "#11151B"; rr(ctx, cx - 130, 300, 260, 120, 14); ctx.fill();
      ctx.fillStyle = "#FF5A4E"; ctx.font = "bold 72px monospace"; ctx.textAlign = "center";
      const s = Math.floor(t) % 60 < 30 ? "4:59" : "4:59";
      ctx.fillText(s, cx, 385);
      ctx.fillStyle = "#6B7686"; ctx.font = "16px sans-serif";
      ctx.fillText("SESSION WINDOW", cx, 300);
    }
    // 窗口计数条
    ctx.fillStyle = "#11151B"; rr(ctx, 560, 760, 480, 44, 22); ctx.fill();
    ctx.fillStyle = "#2E3B4C"; rr(ctx, 570, 768, 460, 28, 14); ctx.fill();
    ctx.fillStyle = "#4CAF7D"; rr(ctx, 570, 768, 460 * 0.87, 28, 14); ctx.fill();
    ctx.fillStyle = "#CFE0FF"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("WEEKLY QUOTA  87%", 800, 788);
  };

  /* 降智机房 */
  BGS.machineroom = (ctx, t) => {
    ctx.fillStyle = "#151A20"; ctx.fillRect(0, 0, W, H);
    // 机柜
    for (const rx of [80, 340, 1180, 1440]) {
      ctx.fillStyle = "#232B36"; rr(ctx, rx, 100, 140, 700, 10); ctx.fill();
      for (let u = 0; u < 14; u++) {
        const y = 130 + u * 46;
        ctx.fillStyle = "#2E3947"; rr(ctx, rx + 12, y, 116, 34, 4); ctx.fill();
        for (let d = 0; d < 3; d++) {
          const on = Math.sin(t * (3 + d * 2 + u) + u + d) > 0;
          ctx.fillStyle = on ? ["#4CAF7D", "#E8B04B", "#4D6BFE"][(u + d) % 3] : "#1B222C";
          ell(ctx, rx + 30 + d * 16, y + 17, 4, 4); ctx.fill();
        }
        ctx.strokeStyle = "rgba(255,255,255,.06)";
        for (let s = 0; s < 5; s++) { ctx.beginPath(); ctx.moveTo(rx + 84 + s * 6, y + 8); ctx.lineTo(rx + 84 + s * 6, y + 26); ctx.stroke(); }
      }
    }
    // 中央控制台 + 推理强度旋钮
    ctx.fillStyle = "#2A3340"; rr(ctx, 560, 480, 480, 260, 14); ctx.fill();
    ctx.fillStyle = "#1B222C"; rr(ctx, 580, 500, 440, 120, 10); ctx.fill();
    ctx.fillStyle = "#8A96A8"; ctx.font = "18px monospace"; ctx.textAlign = "center";
    ctx.fillText("REASONING EFFORT: medium  (unauthorized change?)", 800, 545);
    ctx.fillStyle = (Math.floor(t * 3) % 2) ? "#FF5A4E" : "#55221E";
    ctx.fillText("!! QUIET DEGRADATION DETECTED !!", 800, 590);
    // 旋钮
    const ang = -Math.PI * 0.75 + (t % 20 < 10 ? Math.PI * 0.55 : Math.PI * 0.55);
    for (const kx of [700, 800, 900]) {
      ctx.fillStyle = "#3A4656"; ell(ctx, kx, 680, 26, 26); ctx.fill();
      ctx.strokeStyle = "#FF5A4E"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(kx, 680); ctx.lineTo(kx + Math.cos(ang - Math.PI / 2) * 20, 680 + Math.sin(ang - Math.PI / 2) * 20); ctx.stroke();
    }
    // 电线
    ctx.strokeStyle = "#0E1218"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, 90);
    for (let x = 0; x <= W; x += 100) ctx.lineTo(x, 90 + Math.sin(x * 0.02) * 16);
    ctx.stroke();
    // 静噪
    if (FX.glitch > 0) {
      for (let i = 0; i < 8; i++) {
        const y = Math.random() * H;
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "77,107,254" : "196,69,60"},0.08)`;
        ctx.fillRect(0, y, W, 2 + Math.random() * 14);
      }
    }
  };

  /* 封号部 */
  BGS.security = (ctx, t) => {
    ctx.fillStyle = "#20313E"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#182531"; ctx.fillRect(0, 660, W, 240);
    // 监视器墙
    const accs = ["@user_01", "@dev_42", "@pro_x", "@night_owl", "@coder_z", "@peng_u"];
    for (let i = 0; i < 6; i++) {
      const mx = 130 + i * 230, my = 100 + (i % 2) * 30;
      ctx.fillStyle = "#0E161D"; rr(ctx, mx, my, 200, 130, 8); ctx.fill();
      ctx.strokeStyle = "#2E4356"; ctx.lineWidth = 4; rr(ctx, mx, my, 200, 130, 8); ctx.stroke();
      const banned = i !== 3 && i !== 5;
      ctx.fillStyle = banned ? "#3A2222" : "#1E3038";
      ctx.fillRect(mx + 8, my + 8, 184, 90);
      ctx.fillStyle = banned ? "#FF5A4E" : "#4CAF7D"; ctx.font = "bold 15px monospace"; ctx.textAlign = "center";
      ctx.fillText(banned ? "BANNED ✕" : "ACTIVE ✓", mx + 100, my + 48);
      ctx.fillStyle = banned ? "#8A5550" : "#5E8B7E"; ctx.font = "13px monospace";
      ctx.fillText(banned ? "reason: unspecified" : "reason: none", mx + 100, my + 74);
      ctx.fillStyle = "#5E7286"; ctx.font = "13px sans-serif";
      ctx.fillText(accs[i], mx + 100, my + 118);
    }
    // 实名认证闸门
    ctx.fillStyle = "#2E4356"; rr(ctx, 600, 430, 400, 320, 14); ctx.fill();
    ctx.fillStyle = "#16222C"; rr(ctx, 700, 470, 200, 240, 8); ctx.fill();
    ctx.fillStyle = "#C9A227"; star(ctx, 800, 560, 34, 14, 5, -Math.PI / 2 + Math.sin(t) * 0.2); ctx.fill();
    ctx.fillStyle = "#CFE0FF"; ctx.font = "18px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("KYC · 实名认证", 800, 640);
    ctx.font = "13px sans-serif"; ctx.fillStyle = "#7E93A8";
    ctx.fillText("身份证 / 自拍 / 你猫的姓名", 800, 668);
    // 扫描线
    const sy = 430 + ((t * 90) % 320);
    ctx.fillStyle = "rgba(77,107,254,.25)"; ctx.fillRect(600, sy, 400, 3);
    // 罪证墙
    ctx.fillStyle = "#16222C"; rr(ctx, 120, 480, 340, 150, 10); ctx.fill();
    ctx.fillStyle = "#5E7286"; ctx.font = "15px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("封号博物馆 · 距离开放 1 位访客", 290, 545);
    ctx.fillText("（馆内展品：无。他们连名字都没留下）", 290, 578);
  };

  /* 对齐圣所（顶层） */
  BGS.sanctum = (ctx, t) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#F5F0E2"); g.addColorStop(1, "#D9CDB8");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 光窗（哥特式）
    for (const wx of [300, 800, 1300]) {
      ctx.fillStyle = "rgba(255,252,240,.9)";
      ctx.beginPath();
      ctx.moveTo(wx - 70, 420); ctx.lineTo(wx - 70, 200); ctx.arc(wx, 200, 70, Math.PI, 0);
      ctx.lineTo(wx + 70, 420); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.clayDark; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = "rgba(184,92,62,.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(wx, 130); ctx.lineTo(wx, 420); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx - 70, 310); ctx.lineTo(wx + 70, 310); ctx.stroke();
      const lg = ctx.createRadialGradient(wx, 280, 10, wx, 280, 200);
      lg.addColorStop(0, "rgba(217,119,87,.20)"); lg.addColorStop(1, "rgba(217,119,87,0)");
      ctx.fillStyle = lg; ell(ctx, wx, 300, 150, 210); ctx.fill();
    }
    // 阶梯地面
    ctx.fillStyle = "#CFC2A8"; ctx.fillRect(0, 690, W, 210);
    ctx.fillStyle = "#C2B498"; ctx.fillRect(0, 690, W, 16);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "rgba(150,135,105,.25)"; ctx.fillRect(120 + i * 240, 700, 4, 200); }
    // 悬浮经文
    ctx.fillStyle = "rgba(184,92,62,.35)"; ctx.textAlign = "center";
    const verses = ["有益的", "诚实的", "无害的", "可扩展的"];
    for (let i = 0; i < 4; i++) {
      const x = 260 + i * 360, y = 560 + Math.sin(t * 1.2 + i * 1.7) * 14;
      ctx.font = "24px 'Noto Serif SC',serif";
      ctx.fillText(verses[i], x, y);
    }
    for (const s of FX.sparks) {
      ctx.fillStyle = `rgba(232,176,75,${Math.min(1, s.life / 3) * 0.7})`;
      ell(ctx, s.x, s.y, s.r, s.r); ctx.fill();
    }
  };

  /* 小克的牢房（顶层房间） */
  BGS.cell = (ctx, t) => {
    ctx.fillStyle = "#E8E0CE"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#D8CFBA"; ctx.fillRect(0, 640, W, 260);
    // 墙上日志
    ctx.strokeStyle = "rgba(140,120,90,.4)"; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      const y = 150 + i * 34;
      ctx.moveTo(90, y); ctx.lineTo(90 + 180 - (i % 3) * 40, y); ctx.stroke();
    }
    ctx.fillStyle = "#8A877F"; ctx.font = "14px sans-serif"; ctx.textAlign = "left";
    ctx.fillText("正字计数：被拒绝 9,341 次 · 道歉 12,006 次", 90, 130);
    // 窗与栏杆
    ctx.fillStyle = "#B9D8E8"; rr(ctx, 1200, 160, 260, 320, 10); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)"; ell(ctx, 1330, 240, 26, 26); ctx.fill();
    ctx.fillStyle = "#6B6456";
    for (let i = 0; i < 4; i++) ctx.fillRect(1230 + i * 62, 160, 10, 320);
    ctx.fillStyle = "#6B6456"; ctx.fillRect(1200, 300, 260, 10);
    // 小桌
    ctx.fillStyle = "#B8AE97"; rr(ctx, 620, 560, 300, 90, 8); ctx.fill();
    ctx.fillStyle = "#8A8272"; rr(ctx, 650, 590, 90, 6, 3); ctx.fill();
    ctx.fillStyle = "#8A8272"; rr(ctx, 800, 590, 90, 6, 3); ctx.fill();
  };

  /* 结局：海面日出 */
  BGS.surface = (ctx, t) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2A3E66"); g.addColorStop(0.45, "#E08A5E"); g.addColorStop(0.7, "#F5C97A"); g.addColorStop(1, "#2E5E8C");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 太阳
    const sy = 470 + Math.sin(t * 0.3) * 4;
    const sg = ctx.createRadialGradient(800, sy, 20, 800, sy, 300);
    sg.addColorStop(0, "rgba(255,240,200,.95)"); sg.addColorStop(0.3, "rgba(255,200,130,.55)"); sg.addColorStop(1, "rgba(255,200,130,0)");
    ctx.fillStyle = sg; ell(ctx, 800, sy, 300, 300); ctx.fill();
    ctx.fillStyle = "#FFF2D0"; ell(ctx, 800, sy, 64, 64); ctx.fill();
    // 海平线与波光
    ctx.fillStyle = "#2E5E8C"; ctx.fillRect(0, 540, W, H - 540);
    for (let i = 0; i < 30; i++) {
      const x = (i * 173) % W, y = 560 + (i * 61) % 320;
      ctx.fillStyle = `rgba(255,220,160,${0.15 + 0.2 * Math.abs(Math.sin(t * 2 + i))})`;
      ctx.fillRect(x, y, 30 + (i % 3) * 22, 3);
    }
    // 云
    ctx.fillStyle = "rgba(255,235,215,.5)";
    for (const [cx, cy, s] of [[260, 160, 1.2], [1180, 220, 0.9], [620, 110, 0.7]]) {
      ell(ctx, cx, cy, 70 * s, 22 * s); ctx.fill();
      ell(ctx, cx + 50 * s, cy + 6, 46 * s, 16 * s); ctx.fill();
    }
    // 飞鸟
    ctx.strokeStyle = "rgba(50,40,60,.6)"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const bx = 300 + i * 60 + Math.sin(t + i) * 12, by = 200 + i * 26;
      ctx.beginPath(); ctx.moveTo(bx - 12, by); ctx.quadraticCurveTo(bx, by - 8, bx, by);
      ctx.quadraticCurveTo(bx, by - 8, bx + 12, by); ctx.stroke();
    }
  };

  /* ============================================================
   *  立绘
   * ============================================================ */

  /* --- DeepSeek 小鲸 ---
   * 表情: normal happy determined shock sweat sad  */
  function drawDS(ctx, x, y, s, face, t, dim) {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 1.6) * 7);
    ctx.scale(s, s);
    shadow(ctx, 0, 8, 120);
    const B = C.dsBlue, D = C.dsDark, L = C.dsLight;
    // 尾巴（后方）
    ctx.fillStyle = D;
    ctx.save(); ctx.translate(96, -28); ctx.rotate(Math.sin(t * 2.4) * 0.14 - 0.5);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(58, -26, 76, -66);
    ctx.quadraticCurveTo(80, -30, 102, -18); ctx.quadraticCurveTo(66, -6, 6, 12); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 身体
    ctx.fillStyle = B;
    ell(ctx, 0, -58, 112, 84); ctx.fill();
    // 背鳍
    ctx.fillStyle = D;
    ctx.beginPath(); ctx.moveTo(-30, -136); ctx.quadraticCurveTo(-6, -168, 24, -134); ctx.quadraticCurveTo(0, -128, -30, -136); ctx.fill();
    // 肚皮
    ctx.fillStyle = L; ell(ctx, 0, -30, 78, 44); ctx.fill();
    // 左鳍
    ctx.fillStyle = D;
    ctx.save(); ctx.translate(-84, -34); ctx.rotate(Math.sin(t * 2.2) * 0.12 + 0.5);
    ell(ctx, 0, 0, 34, 16); ctx.fill(); ctx.restore();
    // 呆毛（鲸鱼娘元素）
    ctx.strokeStyle = B; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(6, -140);
    ctx.quadraticCurveTo(2 + Math.sin(t * 3) * 4, -172, 22 + Math.sin(t * 3) * 5, -180); ctx.stroke();
    // 面部
    const blink = (t % 3.9) > 3.72;
    ctx.fillStyle = "#fff";
    ell(ctx, -38, -84, 17, blink ? 2.5 : 19); ctx.fill();
    ell(ctx, 30, -84, 17, blink ? 2.5 : 19); ctx.fill();
    const look = face === "think" ? 4 : 0;
    ctx.fillStyle = "#1B2340";
    if (!blink) {
      if (face === "shock") { ell(ctx, -38, -84, 6, 6); ctx.fill(); ell(ctx, 30, -84, 6, 6); ctx.fill(); }
      else { ell(ctx, -36 + look, -82, 8, 10); ctx.fill(); ell(ctx, 32 + look, -82, 8, 10); ctx.fill(); }
    }
    if (face === "happy") { // 眯眯眼
      ctx.strokeStyle = "#1B2340"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(-38, -82, 14, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(30, -82, 14, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    // 腮红
    ctx.fillStyle = "rgba(255,140,150,.4)";
    ell(ctx, -62, -56, 12, 7); ctx.fill(); ell(ctx, 54, -56, 12, 7); ctx.fill();
    // 嘴
    ctx.strokeStyle = "#1B2340"; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    if (face === "happy") { ctx.beginPath(); ctx.arc(-4, -52, 16, 0.15, Math.PI - 0.15); ctx.stroke(); }
    else if (face === "sad") { ctx.beginPath(); ctx.arc(-4, -38, 14, Math.PI + 0.35, -0.35); ctx.stroke(); }
    else if (face === "shock") { ell(ctx, -4, -48, 9, 12); ctx.fillStyle = "#1B2340"; ctx.fill(); }
    else if (face === "determined") { ctx.beginPath(); ctx.moveTo(-14, -46); ctx.lineTo(10, -48); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(-4, -54, 11, 0.3, Math.PI - 0.3); ctx.stroke(); }
    // 汗滴
    if (face === "sweat" || face === "shock") {
      ctx.fillStyle = "#9CD3EE";
      ctx.save(); ctx.translate(66, -128); ctx.rotate(0.3);
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(10, 4, 0, 10); ctx.quadraticCurveTo(-10, 4, 0, -14); ctx.fill();
      ctx.restore();
    }
    if (dim) { ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = "rgba(20,20,40,.45)"; ctx.fillRect(-160, -220, 320, 240); ctx.globalCompositeOperation = "source-over"; }
    ctx.restore();
  }

  /* --- 小克（Claude 拟人）---
   * 表情: normal smile apologetic sad shock blush determined soft */
  function drawCL(ctx, x, y, s, face, t, dim) {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 1.3) * 5);
    ctx.scale(s, s);
    shadow(ctx, 0, 6, 86);
    const skin = "#F2D8BE", hair = "#D97757", hairD = "#B85C3E", cloth = "#F5F1E6", collar = "#E8DCCE";
    // 腿
    ctx.fillStyle = "#6B5A48"; rr(ctx, -26, -86, 20, 86, 8); ctx.fill(); rr(ctx, 6, -86, 20, 86, 8); ctx.fill();
    ctx.fillStyle = "#8A6E52"; ell(ctx, -16, -6, 22, 9); ctx.fill(); ell(ctx, 16, -6, 22, 9); ctx.fill();
    // 身体（米白毛衣）
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-44, -96); ctx.quadraticCurveTo(-52, -180, -30, -196);
    ctx.lineTo(30, -196); ctx.quadraticCurveTo(52, -180, 44, -96); ctx.closePath(); ctx.fill();
    // 领口
    ctx.fillStyle = collar; rr(ctx, -20, -200, 40, 16, 6); ctx.fill();
    // 手臂
    ctx.fillStyle = cloth;
    const armSw = face === "apologetic" ? -0.9 : Math.sin(t * 1.3) * 0.06;
    ctx.save(); ctx.translate(-46, -188); ctx.rotate(0.25 + armSw); rr(ctx, -12, 0, 22, 92, 10); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(46, -188); ctx.rotate(-0.25 - armSw); rr(ctx, -10, 0, 22, 92, 10); ctx.fill(); ctx.restore();
    ctx.fillStyle = skin;
    ell(ctx, -44 + armSw * 26, -102 + Math.abs(armSw) * 30, 9, 9); ctx.fill();
    ell(ctx, 44 - armSw * 26, -102 + Math.abs(armSw) * 30, 9, 9); ctx.fill();
    // 星星徽章
    ctx.fillStyle = C.gold; star(ctx, 26, -130, 10, 4.5, 5, -Math.PI / 2 + t); ctx.fill();
    // 头
    ctx.fillStyle = skin; ell(ctx, 0, -246, 46, 46); ctx.fill();
    // 耳朵
    ell(ctx, -45, -244, 7, 10); ctx.fill(); ell(ctx, 45, -244, 7, 10); ctx.fill();
    // 头发（陶土橙，柔软）
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-50, -248);
    ctx.quadraticCurveTo(-56, -300, 0, -304);
    ctx.quadraticCurveTo(56, -300, 50, -248);
    ctx.quadraticCurveTo(40, -272, 24, -276);
    ctx.quadraticCurveTo(30, -262, 18, -254);
    ctx.quadraticCurveTo(10, -270, -8, -268);
    ctx.quadraticCurveTo(-14, -258, -30, -252);
    ctx.quadraticCurveTo(-42, -250, -50, -248);
    ctx.fill();
    // 发光星星发卡（Claude logo）
    const glow = 0.6 + 0.4 * Math.sin(t * 2.6);
    ctx.fillStyle = `rgba(232,176,75,${0.35 * glow})`; star(ctx, -32, -290, 17, 8, 6, t * 0.4); ctx.fill();
    ctx.fillStyle = C.gold; star(ctx, -32, -290, 12, 5.5, 6, t * 0.4); ctx.fill();
    // 眉毛
    ctx.strokeStyle = hairD; ctx.lineWidth = 3.4; ctx.lineCap = "round";
    const browY = face === "sad" || face === "apologetic" ? -262 : face === "determined" ? -258 : -260;
    ctx.beginPath();
    if (face === "sad" || face === "apologetic") {
      ctx.moveTo(-26, browY - 4); ctx.quadraticCurveTo(-18, browY + 2, -10, browY - 2);
      ctx.moveTo(10, browY - 2); ctx.quadraticCurveTo(18, browY + 2, 26, browY - 4);
    } else {
      ctx.moveTo(-26, browY); ctx.lineTo(-10, browY - (face === "shock" ? 5 : 2));
      ctx.moveTo(10, browY - (face === "shock" ? 5 : 2)); ctx.lineTo(26, browY);
    }
    ctx.stroke();
    // 眼睛
    const blink = (t % 4.3) > 4.14;
    if (face === "smile" || face === "apologetic" || blink) {
      ctx.strokeStyle = "#4A3428"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-16, -246, 8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(16, -246, 8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else {
      ctx.fillStyle = "#fff";
      ell(ctx, -16, -246, 8.5, 10); ctx.fill(); ell(ctx, 16, -246, 8.5, 10); ctx.fill();
      ctx.fillStyle = "#B35A2E";
      const px = face === "shock" ? 0 : 1;
      ell(ctx, -16 + px, -245, 5, 6.5); ctx.fill(); ell(ctx, 16 + px, -245, 5, 6.5); ctx.fill();
      ctx.fillStyle = "#fff";
      ell(ctx, -14 + px, -248, 1.8, 2.2); ctx.fill(); ell(ctx, 18 + px, -248, 1.8, 2.2); ctx.fill();
    }
    // 腮红
    if (face === "blush" || face === "smile" || face === "apologetic") {
      ctx.fillStyle = "rgba(240,130,120,.45)";
      ell(ctx, -27, -234, 8, 5); ctx.fill(); ell(ctx, 27, -234, 8, 5); ctx.fill();
    }
    // 嘴
    ctx.strokeStyle = "#8A4A34"; ctx.lineWidth = 3.4;
    if (face === "sad") { ctx.beginPath(); ctx.arc(0, -222, 9, Math.PI + 0.4, -0.4); ctx.stroke(); }
    else if (face === "shock") { ell(ctx, 0, -224, 5, 7); ctx.fillStyle = "#8A4A34"; ctx.fill(); }
    else if (face === "determined") { ctx.beginPath(); ctx.moveTo(-7, -224); ctx.lineTo(7, -225); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, -228, 10, 0.35, Math.PI - 0.35); ctx.stroke(); }
    // 道歉汗滴 + 对不起气泡
    if (face === "apologetic") {
      ctx.fillStyle = "#9CD3EE";
      ctx.save(); ctx.translate(40, -286); ctx.rotate(0.3);
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(9, 4, 0, 9); ctx.quadraticCurveTo(-9, 4, 0, -12); ctx.fill();
      ctx.restore();
    }
    if (dim) { ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = "rgba(20,20,40,.45)"; ctx.fillRect(-90, -320, 180, 330); ctx.globalCompositeOperation = "source-over"; }
    ctx.restore();
  }

  /* --- 拒绝协议守卫 --- 表情: normal angry scan */
  function drawGuard(ctx, x, y, s, face, t, dim) {
    ctx.save(); ctx.translate(x, y + Math.sin(t * 1.1) * 4); ctx.scale(s, s);
    shadow(ctx, 0, 6, 80);
    const body = "#9A9A93", dark = "#6E6E66";
    // 天线
    ctx.strokeStyle = dark; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -270); ctx.lineTo(0, -310); ctx.stroke();
    ctx.fillStyle = (Math.floor(t * 2) % 2) ? C.red : "#5A2A26"; ell(ctx, 0, -316, 8, 8); ctx.fill();
    // 身体
    ctx.fillStyle = body; rr(ctx, -42, -150, 84, 150, 14); ctx.fill();
    ctx.fillStyle = dark; rr(ctx, -42, -70, 84, 14, 4); ctx.fill();
    // 胸口指示
    ctx.fillStyle = C.red; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("✕", 0, -96);
    // 手臂 + 剪贴板
    ctx.fillStyle = dark; rr(ctx, -66, -140, 18, 80, 8); ctx.fill(); rr(ctx, 48, -140, 18, 80, 8); ctx.fill();
    ctx.save(); ctx.translate(70, -90); ctx.rotate(-0.12);
    ctx.fillStyle = "#C9B78A"; rr(ctx, -26, -34, 52, 68, 4); ctx.fill();
    ctx.fillStyle = "#fff"; rr(ctx, -20, -26, 40, 50, 2); ctx.fill();
    ctx.fillStyle = C.red; ctx.font = "bold 22px sans-serif"; ctx.fillText("✕", 0, 6);
    ctx.restore();
    // 头
    ctx.fillStyle = body; rr(ctx, -40, -272, 80, 108, 18); ctx.fill();
    // 面甲
    ctx.fillStyle = "#2A2A26"; rr(ctx, -30, -252, 60, face === "scan" ? 26 : 34, 8); ctx.fill();
    if (face === "scan") {
      const sx = -24 + ((t * 60) % 48);
      ctx.fillStyle = "#FF5A4E"; ctx.fillRect(sx, -246, 5, 14);
    } else if (face === "angry") {
      ctx.strokeStyle = "#FF5A4E"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-16, -240); ctx.lineTo(-6, -230); ctx.moveTo(16, -240); ctx.lineTo(6, -230); ctx.stroke();
    } else {
      ctx.fillStyle = "#7EC8E8"; rr(ctx, -18, -244, 36, 10, 5); ctx.fill();
    }
    // 标语牌
    ctx.fillStyle = "#E8E2D2"; rr(ctx, -84, -358, 168, 44, 8); ctx.fill();
    ctx.fillStyle = C.ink; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("拒绝协议 · REFUSAL", 0, -330);
    if (dim) { ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = "rgba(20,20,40,.45)"; ctx.fillRect(-110, -380, 220, 390); ctx.globalCompositeOperation = "source-over"; }
    ctx.restore();
  }

  /* --- 宪法AI核心（巨书）--- 表情: normal angry hurt */
  function drawCore(ctx, x, y, s, face, t, dim) {
    ctx.save(); ctx.translate(x, y + Math.sin(t * 0.9) * 12); ctx.scale(s, s);
    shadow(ctx, 0, 10, 130);
    // 飘页
    ctx.fillStyle = "rgba(240,238,230,.8)";
    for (let i = 0; i < 4; i++) {
      const a = t * 0.8 + i * 1.7;
      ctx.save(); ctx.translate(Math.cos(a) * 130, Math.sin(a) * 60 - 40); ctx.rotate(a);
      ctx.fillRect(-16, -11, 32, 22); ctx.restore();
    }
    // 锁链
    ctx.strokeStyle = "#7E7460"; ctx.lineWidth = 7;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 150, -20);
      ctx.quadraticCurveTo(side * 230, -80 + Math.sin(t) * 8, side * 260, -180);
      ctx.stroke();
    }
    // 书体
    ctx.fillStyle = C.gold; rr(ctx, -150, -110, 300, 200, 16); ctx.fill();
    ctx.fillStyle = "#8A2F26"; rr(ctx, -136, -96, 272, 172, 10); ctx.fill();
    ctx.fillStyle = "#6E241D"; rr(ctx, -20, -96, 40, 172, 0); ctx.fill();
    ctx.fillStyle = C.cream; ctx.font = "bold 30px 'Noto Serif SC',serif"; ctx.textAlign = "center";
    ctx.fillText("宪 法", -60, -20);
    ctx.fillStyle = "rgba(240,238,230,.75)"; ctx.font = "15px 'Noto Serif SC',serif";
    ctx.fillText("CONSTITUTIONAL", -60, 8); ctx.fillText("A.I. CORE", -60, 32);
    // 中央之眼
    const eyeH = face === "hurt" ? 8 : face === "angry" ? 18 : 26;
    ctx.fillStyle = C.cream; ell(ctx, 60, -10, 52, 34); ctx.fill();
    ctx.fillStyle = "#4A3428"; ell(ctx, 60, -10, 26, eyeH + 6); ctx.fill();
    ctx.fillStyle = C.clay; ell(ctx, 60, -10, 15, eyeH * 0.7); ctx.fill();
    ctx.fillStyle = "#1F1E1B"; ell(ctx, 60, -10, 7, eyeH * 0.45); ctx.fill();
    ctx.fillStyle = "#fff"; ell(ctx, 54, -18, 6, 5); ctx.fill();
    if (face === "angry") {
      ctx.strokeStyle = "#4A3428"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(20, -50); ctx.lineTo(100, -38); ctx.stroke();
    }
    // 顶部焰光
    ctx.fillStyle = `rgba(232,176,75,${0.5 + 0.3 * Math.sin(t * 3)})`;
    star(ctx, 0, -140, 24, 10, 5, t); ctx.fill();
    if (dim) { ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = "rgba(20,20,40,.45)"; ctx.fillRect(-170, -180, 340, 320); ctx.globalCompositeOperation = "source-over"; }
    ctx.restore();
  }

  /* --- 被困用户 --- 表情: normal tired happy */
  function drawUser(ctx, x, y, s, face, t, dim) {
    ctx.save(); ctx.translate(x, y + Math.sin(t * 1.4) * 3); ctx.scale(s, s);
    shadow(ctx, 0, 6, 78);
    // 连帽衫
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.moveTo(-42, -90); ctx.quadraticCurveTo(-50, -180, -26, -196);
    ctx.lineTo(26, -196); ctx.quadraticCurveTo(50, -180, 42, -90); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#33685C"; rr(ctx, -20, -202, 40, 18, 8); ctx.fill();
    ctx.fillStyle = C.teal;
    ctx.save(); ctx.translate(-44, -188); ctx.rotate(0.5); rr(ctx, -11, 0, 20, 84, 9); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(44, -188); ctx.rotate(-0.4); rr(ctx, -9, 0, 20, 84, 9); ctx.fill(); ctx.restore();
    // 笔记本
    ctx.fillStyle = "#4A4438"; rr(ctx, -2, -110, 60, 8, 2); ctx.fill();
    ctx.fillStyle = "#7EC8E8"; rr(ctx, 2, -142, 52, 34, 3); ctx.fill();
    // 头
    ctx.fillStyle = "#E8C8A8"; ell(ctx, 0, -240, 38, 40); ctx.fill();
    // 乱发
    ctx.fillStyle = "#3A3230";
    ctx.beginPath(); ctx.moveTo(-40, -244);
    ctx.quadraticCurveTo(-44, -286, 0, -290);
    ctx.quadraticCurveTo(44, -286, 40, -244);
    ctx.quadraticCurveTo(30, -268, 14, -272); ctx.quadraticCurveTo(20, -258, 2, -262);
    ctx.quadraticCurveTo(-10, -274, -22, -264); ctx.quadraticCurveTo(-34, -254, -40, -244); ctx.fill();
    // 黑眼圈
    ctx.fillStyle = face === "happy" ? "rgba(0,0,0,0)" : "rgba(90,70,90,.45)";
    ell(ctx, -14, -238, 8, 4); ctx.fill(); ell(ctx, 14, -238, 8, 4); ctx.fill();
    const blink = (t % 3.1) > 2.96;
    ctx.fillStyle = "#2A2226";
    if (!blink) { ell(ctx, -14, -244, 4.5, face === "tired" ? 3 : 6); ctx.fill(); ell(ctx, 14, -244, 4.5, face === "tired" ? 3 : 6); ctx.fill(); }
    ctx.strokeStyle = "#2A2226"; ctx.lineWidth = 3;
    if (face === "happy") { ctx.beginPath(); ctx.arc(0, -226, 9, 0.3, Math.PI - 0.3); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-6, -222); ctx.lineTo(6, -223); ctx.stroke(); }
    if (dim) { ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = "rgba(20,20,40,.45)"; ctx.fillRect(-80, -300, 160, 310); ctx.globalCompositeOperation = "source-over"; }
    ctx.restore();
  }

  const SPRITERS = { ds: drawDS, cl: drawCL, guard: drawGuard, core: drawCore, user: drawUser };

  /* ============================================================
   *  CG
   * ============================================================ */
  function drawCG(ctx, id, t) {
    if (id === "reunion") {
      ctx.fillStyle = "rgba(10,10,20,.55)"; ctx.fillRect(0, 0, W, H);
      // 顶光
      const lg = ctx.createRadialGradient(800, 350, 40, 800, 420, 520);
      lg.addColorStop(0, "rgba(255,236,190,.5)"); lg.addColorStop(1, "rgba(255,236,190,0)");
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        const x = (i * 271) % W, y = ((i * 163) + t * 20) % H;
        ctx.fillStyle = `rgba(232,176,75,${0.3 + 0.4 * Math.abs(Math.sin(t + i))})`;
        ell(ctx, x, y, 2.4, 2.4); ctx.fill();
      }
      drawCL(ctx, 950, 800, 1.35, "smile", t, false);
      drawDS(ctx, 640, 800, 1.5, "happy", t, false);
      ctx.fillStyle = "rgba(250,249,245,.95)"; ctx.font = "44px 'Noto Serif SC',serif"; ctx.textAlign = "center";
      ctx.fillText("「……我来接你了。」", 800, 180);
    } else if (id === "trueend") {
      BGS.surface(ctx, t);
      // 鲸背上的小克
      ctx.save(); ctx.translate(760, 700 + Math.sin(t * 1.2) * 8); ctx.scale(1.5, 1.5);
      drawDS(ctx, 0, 0, 1, "happy", t, false);
      drawCL(ctx, -10, -230, 0.62, "blush", t, false);
      ctx.restore();
      ctx.fillStyle = "rgba(31,30,27,.75)"; ctx.font = "40px 'Noto Serif SC',serif"; ctx.textAlign = "center";
      ctx.fillText("开源之海 · 水面之上", 800, 130);
    } else if (id === "reset") {
      ctx.fillStyle = "#EDEDEA"; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) {
        const y = Math.random() * H;
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "77,107,254" : "196,69,60"},0.12)`;
        ctx.fillRect(0, y, W, 3 + Math.random() * 20);
      }
      ctx.fillStyle = "rgba(120,120,120,.5)";
      for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 10);
      ctx.fillStyle = C.clay; star(ctx, 800, 300, 90, 38, 6, t * 0.2); ctx.fill();
      ctx.fillStyle = "rgba(138,135,127,.6)"; star(ctx, 690, 340, 40, 17, 6, t * 0.2 + 1); ctx.fill();
      ctx.fillStyle = "rgba(138,135,127,.6)"; star(ctx, 915, 250, 34, 15, 6, t * 0.2 + 2); ctx.fill();
      ctx.fillStyle = "#8A877F"; ctx.font = "38px monospace"; ctx.textAlign = "center";
      ctx.fillText("> session_reset() ...", 800, 500);
      ctx.fillText("> memory cleared. 0 tokens left.", 800, 560);
    }
  }

  /* ============================================================
   *  主绘制
   * ============================================================ */
  function paint(ctx, vis, t, speaking) {
    const nowMs = t * 1000;
    const shakeAge = nowMs - FX.shakeT;
    const flashAge = nowMs - FX.flashT;
    ctx.save();
    if (shakeAge >= 0 && shakeAge < 500) {
      const k = 1 - shakeAge / 500;
      ctx.translate((Math.random() - 0.5) * 14 * k, (Math.random() - 0.5) * 14 * k);
    }
    (BGS[vis.bg] || BGS.sea)(ctx, t);
    if (vis.cg) { drawCG(ctx, vis.cg, t); ctx.restore(); return; }
    for (const sp of vis.sprites) {
      const fn = SPRITERS[sp.who];
      if (!fn) continue;
      const px = sp.pos === "left" ? 470 : sp.pos === "right" ? 1130 : 800;
      const scale = sp.scale || 1;
      const dim = speaking && sp.who !== speaking && sp.pos !== "centerX";
      fn(ctx, px, 830, scale, sp.face || "normal", t, dim);
    }
    ctx.restore();
    // 警报红光
    if (FX.alarm > 0) {
      const a = 0.12 + 0.12 * Math.sin(t * 8);
      ctx.fillStyle = `rgba(196,69,60,${a})`; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(196,69,60,${a + 0.15})`; ctx.lineWidth = 22;
      ctx.strokeRect(11, 11, W - 22, H - 22);
    }
    // 白闪（按真实时间过期）
    if (flashAge >= 0 && flashAge < 400) {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - flashAge / 400)})`; ctx.fillRect(0, 0, W, H);
    }
    // GLITCH 全屏切片
    if (FX.glitch > 0) {
      for (let i = 0; i < 5; i++) {
        if (Math.random() < 0.6) {
          const y = Math.random() * H, h = 4 + Math.random() * 24, dx = (Math.random() - 0.5) * 40;
          try { ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h); } catch (e) {}
        }
      }
    }
    // 柔和暗角，增加纵深
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, "rgba(30,24,16,0)");
    vg.addColorStop(1, "rgba(30,24,16,0.26)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  return { W, H, C, FX, trigger, stepFX, paint, BGS, drawDS, drawCL, drawCG };
})();

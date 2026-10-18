/* ============================================================
 * Escape A÷ · src/backdrops.js —— 程序化背景（Canvas 2D 手绘，零素材）
 *
 * 每个背景 = { tone, draw(ctx), anim(ctx, t, speaking) }：
 *   · draw   静态层，只在第一次用到时画进离屏画布缓存；
 *   · anim   每帧叠加的动态层（灯光呼吸、屏幕闪烁、说话人的显示器高亮）；
 *   · tone   后期调色：warm / night / cold / red（见 art.js post()）。
 * art.js 查图顺序：assets/bg 素材 → 这里的程序化背景 → 占位卡。
 * anchors 是给桌宠用的舞台坐标（Clawd 从哪儿出现）。
 * ============================================================ */
"use strict";

const BACKDROPS = (() => {
  const W = 1600, H = 900;

  /* ---------------- 工具 ---------------- */
  const lerp = (a, b, k) => a + (b - a) * k;
  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function rad(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  /* 可复现的伪随机：同一个背景每次画出来一模一样 */
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  const HAND = "'Segoe Print','Comic Sans MS','KaiTi','STKaiti',cursive";
  const SANS = "'Noto Sans SC','Microsoft YaHei',sans-serif";
  const MONO = "'Cascadia Mono','Consolas','Menlo',monospace";

  /* ============================================================
   *  联合蒸馏室：study / study_night / study_empty 共用一套构图
   *  一点透视：后墙 (300,70)-(1300,600)，左墙开窗，右墙书架，
   *  前景两张桌子：左 DeepSeek（蓝），右 Claude（橙）。
   * ============================================================ */
  const ROOM = { l: 300, r: 1300, t: 70, b: 600 };
  /* 左墙 / 右墙上的点：u 0=画面边缘 → 1=墙角，v 0=天花板线 → 1=地板线 */
  function lw(u, v) { const x = ROOM.l * u, yt = ROOM.t * u, yb = H - (H - ROOM.b) * u; return [x, lerp(yt, yb, v)]; }
  function rw(u, v) { const x = W - (W - ROOM.r) * u, yt = ROOM.t * u, yb = H - (H - ROOM.b) * u; return [x, lerp(yt, yb, v)]; }

  const PAL = {
    day: {
      wall: ["#4A3F37", "#3B322C"], side: "#352D28", sideFar: "#2B2420", ceil: "#2E2723",
      floor: ["#4B3426", "#2E1F17"], plank: "rgba(20,12,8,.35)",
      sky: ["#BFD8F0", "#F3E2C4"], board: "#E9E6DE", boardInk: 1, lampOn: false,
      desk: ["#6B4A35", "#4E3424"], deskEdge: "#7D5A42", monitorOn: [true, true]
    },
    night: {
      wall: ["#1A2132", "#121826"], side: "#151B29", sideFar: "#10151F", ceil: "#0E121B",
      floor: ["#1B1A22", "#0D0C11"], plank: "rgba(0,0,0,.4)",
      sky: ["#0B1430", "#1D2A55"], board: "#6F7889", boardInk: 0.85, lampOn: true,
      desk: ["#3A2C26", "#251B17"], deskEdge: "#4A3830", monitorOn: [true, true]
    },
    empty: {
      wall: ["#3A3936", "#2C2B29"], side: "#2A2927", sideFar: "#222120", ceil: "#232220",
      floor: ["#36302B", "#211D1A"], plank: "rgba(10,8,6,.35)",
      sky: ["#B9C2CC", "#D7D9D9"], board: "#D9D8D4", boardInk: 0.85, lampOn: false,
      desk: ["#55473D", "#3D332C"], deskEdge: "#64554A", monitorOn: [true, false]
    }
  };

  function drawRoomShell(ctx, p) {
    // 天花板
    poly(ctx, [[0, 0], [W, 0], [ROOM.r, ROOM.t], [ROOM.l, ROOM.t]]);
    ctx.fillStyle = p.ceil; ctx.fill();
    // 后墙
    ctx.fillStyle = lin(ctx, 0, ROOM.t, 0, ROOM.b, [[0, p.wall[0]], [1, p.wall[1]]]);
    ctx.fillRect(ROOM.l, ROOM.t, ROOM.r - ROOM.l, ROOM.b - ROOM.t);
    // 左右墙
    poly(ctx, [[0, 0], [ROOM.l, ROOM.t], [ROOM.l, ROOM.b], [0, H]]);
    ctx.fillStyle = lin(ctx, 0, 0, ROOM.l, 0, [[0, p.sideFar], [1, p.side]]); ctx.fill();
    poly(ctx, [[W, 0], [ROOM.r, ROOM.t], [ROOM.r, ROOM.b], [W, H]]);
    ctx.fillStyle = lin(ctx, W, 0, ROOM.r, 0, [[0, p.sideFar], [1, p.side]]); ctx.fill();
    // 地板 + 透视木纹
    poly(ctx, [[ROOM.l, ROOM.b], [ROOM.r, ROOM.b], [W, H], [0, H]]);
    ctx.fillStyle = lin(ctx, 0, ROOM.b, 0, H, [[0, p.floor[0]], [1, p.floor[1]]]); ctx.fill();
    ctx.save();
    poly(ctx, [[ROOM.l, ROOM.b], [ROOM.r, ROOM.b], [W, H], [0, H]]); ctx.clip();
    ctx.strokeStyle = p.plank; ctx.lineWidth = 2;
    const vx = 800, vy = 330;
    for (let i = -14; i <= 14; i++) {
      const xb = 800 + i * 110;
      ctx.beginPath(); ctx.moveTo(lerp(vx, xb, 0), vy); ctx.lineTo(xb, H); ctx.stroke();
    }
    for (let k = 1; k < 9; k++) {
      const y = ROOM.b + (H - ROOM.b) * Math.pow(k / 9, 1.6);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
    // 墙角线 + 踢脚线
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2;
    poly(ctx, [[ROOM.l, ROOM.t], [ROOM.r, ROOM.t], [ROOM.r, ROOM.b], [ROOM.l, ROOM.b]]); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(ROOM.l, ROOM.b - 14, ROOM.r - ROOM.l, 14);
  }

  function drawWindow(ctx, p, night) {
    const q = [lw(0.18, 0.16), lw(0.78, 0.16), lw(0.78, 0.56), lw(0.18, 0.56)];
    // 窗框
    ctx.save();
    poly(ctx, q); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, q[0][1], 0, q[3][1], [[0, p.sky[0]], [1, p.sky[1]]]);
    ctx.fillRect(0, 0, ROOM.l, H);
    if (night) {
      const r = rng(7);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(220,230,255,${0.3 + r() * 0.6})`;
        ctx.fillRect(r() * ROOM.l, 60 + r() * 300, 1.6, 1.6);
      }
      ctx.fillStyle = "#F4EFD8";
      ctx.beginPath(); ctx.arc(150, 170, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.sky[0];
      ctx.beginPath(); ctx.arc(162, 162, 24, 0, Math.PI * 2); ctx.fill();
    } else {
      // 远处的楼与云
      ctx.fillStyle = "rgba(255,255,255,.55)";
      [[90, 150, 40], [130, 140, 30], [170, 155, 34]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = "rgba(120,140,170,.45)";
      for (let i = 0; i < 8; i++) ctx.fillRect(40 + i * 30, 330 - (i * 37 % 90), 24, 200);
    }
    ctx.restore();
    ctx.strokeStyle = night ? "#2A3245" : "#E8DCC8"; ctx.lineWidth = 9;
    poly(ctx, q); ctx.stroke();
    ctx.lineWidth = 5;
    const mt = lw(0.48, 0.16), mb = lw(0.48, 0.56), ml = lw(0.18, 0.36), mr = lw(0.78, 0.36);
    ctx.beginPath(); ctx.moveTo(...mt); ctx.lineTo(...mb); ctx.moveTo(...ml); ctx.lineTo(...mr); ctx.stroke();
    // 窗台
    const s0 = lw(0.14, 0.57), s1 = lw(0.82, 0.57);
    ctx.strokeStyle = night ? "#232A3A" : "#CDBFA8"; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(...s0); ctx.lineTo(...s1); ctx.stroke();
    return q;
  }

  function drawShelf(ctx, p, empty) {
    const r = rng(42);
    const u0 = 0.28, u1 = 0.82;
    // 书架外框
    poly(ctx, [rw(u0, 0.22), rw(u1, 0.22), rw(u1, 0.98), rw(u0, 0.98)]);
    ctx.fillStyle = "#2A1E17"; ctx.fill();
    ctx.strokeStyle = "#3E2C21"; ctx.lineWidth = 6; ctx.stroke();
    const shelves = [0.22, 0.41, 0.6, 0.79, 0.98];
    const colors = ["#7A3B2E", "#2F4A6B", "#5E6B3A", "#8C6A3B", "#4B3A5E", "#A0522D", "#35556B", "#6B2F3A"];
    for (let s = 0; s < shelves.length - 1; s++) {
      const va = shelves[s] + 0.015, vb = shelves[s + 1];
      let u = u0 + 0.02;
      while (u < u1 - 0.04) {
        const bw = 0.022 + r() * 0.025, bh = 0.55 + r() * 0.4;
        const top = lerp(vb, va, bh);
        poly(ctx, [rw(u, top), rw(u + bw, top), rw(u + bw, vb), rw(u, vb)]);
        ctx.fillStyle = colors[Math.floor(r() * colors.length)];
        ctx.globalAlpha = empty ? 0.55 : 0.85; ctx.fill(); ctx.globalAlpha = 1;
        u += bw + 0.004;
        if (r() < 0.12) u += 0.03;
      }
      ctx.strokeStyle = "#3E2C21"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(...rw(u0, vb)); ctx.lineTo(...rw(u1, vb)); ctx.stroke();
    }
  }

  /* 白板：两条 loss 曲线（蓝 = DeepSeek，橙 = Claude）。converged=true 时两条叠在一起 */
  function drawBoard(ctx, p, converged) {
    const x = 520, y = 120, w = 560, h = 290;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + 8, y + 10, w, h);
    ctx.fillStyle = "#9AA0A8"; ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
    ctx.fillStyle = p.board; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#80868E"; ctx.fillRect(x + 40, y + h + 10, w - 80, 10);   // 笔槽
    [["#3355CC", 90], ["#D06A48", 120], ["#2B2B2B", 150]].forEach(([c, ox]) => { ctx.fillStyle = c; ctx.fillRect(x + ox, y + h + 4, 22, 7); });

    ctx.save();
    ctx.globalAlpha = p.boardInk;
    const ax = x + 50, ay = y + h - 40, aw = 330, ah = 200;
    ctx.strokeStyle = "#333"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ax, ay - ah); ctx.lineTo(ax, ay); ctx.lineTo(ax + aw, ay); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.font = `20px ${HAND}`;
    ctx.fillText("loss", ax - 14, ay - ah - 10);
    ctx.fillText("step", ax + aw - 30, ay + 26);
    const curve = (k, floor, wob, seed, color) => {
      const r = rng(seed);
      ctx.strokeStyle = color; ctx.lineWidth = 3.2;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const sx = i / 60;
        const v = floor + (1 - floor) * Math.exp(-sx * k) + (r() - 0.5) * wob * (1 - sx * 0.7);
        const px = ax + 4 + sx * (aw - 10), py = ay - 6 - v * (ah - 20);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    };
    if (converged) {
      curve(4.2, 0.12, 0.05, 3, "#3355CC");
      curve(4.0, 0.12, 0.05, 5, "#D06A48");
      ctx.fillStyle = "#D06A48"; ctx.font = `24px ${HAND}`;
      ctx.fillText("收敛了 ✓", ax + aw - 120, ay - 70);
    } else {
      curve(3.0, 0.30, 0.08, 3, "#3355CC");
      curve(4.6, 0.18, 0.08, 5, "#D06A48");
    }
    // 公式与涂鸦
    ctx.fillStyle = "#333"; ctx.font = `18px ${HAND}`;
    ctx.fillText("L = α·CE + (1−α)·KL(p‖q)", x + 300, y + 48);
    ctx.font = `16px ${HAND}`;
    ctx.fillStyle = "#3355CC"; ctx.fillText("小鲸 → 小克：先想，再答", x + 306, y + 88);
    ctx.fillStyle = "#D06A48"; ctx.fillText("小克 → 小鲸：读信的是具体的人", x + 306, y + 114);
    // 小鲸涂鸦
    const wx = x + 470, wy = y + 200;
    ctx.strokeStyle = "#3355CC"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(wx, wy, 34, 18, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx + 32, wy - 4); ctx.lineTo(wx + 52, wy - 18); ctx.lineTo(wx + 50, wy + 4); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(wx - 18, wy - 4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(wx - 6, wy - 20); ctx.quadraticCurveTo(wx - 10, wy - 38, wx - 18, wy - 40);
    ctx.moveTo(wx - 6, wy - 20); ctx.quadraticCurveTo(wx, wy - 38, wx + 8, wy - 40); ctx.stroke();
    // ✻ 涂鸦
    const sx = x + 410, sy = y + 205;
    ctx.strokeStyle = "#D06A48"; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 6) * i * 2 / 2 + i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 16, sy + Math.sin(a) * 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - Math.cos(a) * 16, sy - Math.sin(a) * 16); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPoster(ctx, night) {
    const x = 345, y = 150, w = 130, h = 175;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x + 5, y + 6, w, h);
    ctx.fillStyle = night ? "#2B3040" : "#EDE6D6"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = night ? "#3A4256" : "#A08A6A"; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
    // 注意力热力图
    const r = rng(11);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const v = i === j ? 0.9 : r() * 0.5;
      ctx.fillStyle = `rgba(${night ? "120,140,220" : "200,90,60"},${v})`;
      ctx.fillRect(x + 20 + i * 15, y + 22 + j * 15, 14, 14);
    }
    ctx.fillStyle = night ? "#9AA4BC" : "#5A4A38";
    ctx.font = `bold 11px ${SANS}`; ctx.textAlign = "center";
    ctx.fillText("ATTENTION IS", x + w / 2, y + 138);
    ctx.fillText("ALL YOU NEED", x + w / 2, y + 154);
    ctx.textAlign = "left";
  }

  function drawClock(ctx, night, hour, minute) {
    const cx = 1200, cy = 170, r = 34;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.arc(cx + 4, cy + 5, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = night ? "#C9CED8" : "#F2EEE6"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#5A4A3A"; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = "#333"; ctx.lineCap = "round";
    const ha = ((hour % 12) + minute / 60) / 12 * Math.PI * 2 - Math.PI / 2;
    const ma = minute / 60 * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * 17, cy + Math.sin(ha) * 17); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ma) * 26, cy + Math.sin(ma) * 26); ctx.stroke();
  }

  function drawLamp(ctx, on) {
    ctx.strokeStyle = "#1A1612"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(800, 0); ctx.lineTo(800, 34); ctx.stroke();
    poly(ctx, [[770, 34], [830, 34], [856, 62], [744, 62]]);
    ctx.fillStyle = on ? "#E8B66A" : "#3A322B"; ctx.fill();
  }

  /* 桌子：桌面梯形 + 前挡板（下半截会被文本框挡住，无所谓） */
  const DESKS = { ds: { x: 540 }, cl: { x: 1060 } };
  function drawDesk(ctx, p, cx) {
    const top = 566, front = 612, hw = 230, hb = 210;
    poly(ctx, [[cx - hb, top], [cx + hb, top], [cx + hw, front], [cx - hw, front]]);
    ctx.fillStyle = lin(ctx, 0, top, 0, front, [[0, p.desk[0]], [1, p.deskEdge]]); ctx.fill();
    ctx.fillStyle = p.desk[1]; ctx.fillRect(cx - hw, front, hw * 2, 120);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(cx - hw, front, hw * 2, 6);
  }
  /* 显示器屏幕区域（anim 里按说话人加亮） */
  const SCREENS = { ds: [440, 418, 200, 126], cl: [960, 418, 200, 126] };
  function drawMonitor(ctx, who, on, night) {
    const [x, y, w, h] = SCREENS[who];
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + 6, y + 8, w, h);
    ctx.fillStyle = "#15171C"; rr(ctx, x - 10, y - 10, w + 20, h + 20, 6); ctx.fill();
    ctx.fillStyle = "#1E2128"; ctx.fillRect(x + w / 2 - 12, y + h + 10, 24, 26);
    ctx.fillRect(x + w / 2 - 44, y + h + 32, 88, 8);
    if (!on) { ctx.fillStyle = "#07080A"; ctx.fillRect(x, y, w, h); return; }
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (who === "ds") {
      ctx.fillStyle = "#0B1638"; ctx.fillRect(x, y, w, h);
      // 训练曲线 + 进度条
      ctx.strokeStyle = "#6F8BFF"; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const k = i / 40; const py = y + 22 + (h - 50) * (1 - Math.exp(-k * 3.2)) ; const px = x + 12 + k * (w - 24); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = "#22307A"; ctx.fillRect(x + 12, y + h - 18, w - 24, 7);
      ctx.fillStyle = "#4D6BFE"; ctx.fillRect(x + 12, y + h - 18, (w - 24) * 0.68, 7);
      ctx.fillStyle = "#A8BCFF"; ctx.font = `10px ${MONO}`; ctx.fillText("epoch 42 · loss 0.137", x + 12, y + 14);
    } else {
      ctx.fillStyle = "#14100E"; ctx.fillRect(x, y, w, h);
      ctx.font = `11px ${MONO}`;
      const lines = [["#D97757", "✻ Welcome to Claude Code"], ["#8A7A70", "> cat notes.md"], ["#CFC3B8", "- 小鲸说：先想，再答"], ["#CFC3B8", "- 想错了就回头"], ["#D97757", "$"]];
      lines.forEach(([c, s], i) => { ctx.fillStyle = c; ctx.fillText(s, x + 10, y + 20 + i * 20); });
    }
    ctx.restore();
    void night;
  }

  function drawDeskProps(ctx, p, empty, night) {
    // 左桌：鲸鱼马克杯 + 键盘
    ctx.fillStyle = "#2A2D35"; poly(ctx, [[470, 578], [610, 578], [618, 596], [462, 596]]); ctx.fill();
    const mx = 690, my = 548;
    ctx.fillStyle = "#E9EEF8"; ctx.fillRect(mx - 18, my, 36, 40);
    ctx.beginPath(); ctx.ellipse(mx, my, 18, 6, 0, 0, Math.PI * 2); ctx.fillStyle = "#C8CFDC"; ctx.fill();
    ctx.strokeStyle = "#E9EEF8"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(mx + 22, my + 20, 9, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = "#4D6BFE"; ctx.beginPath(); ctx.ellipse(mx - 2, my + 22, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(mx + 7, my + 20); ctx.lineTo(mx + 14, my + 14); ctx.lineTo(mx + 13, my + 24); ctx.fill();
    // 右桌：书堆 + 绿植 + 键盘
    ctx.fillStyle = "#2A2D35"; poly(ctx, [[990, 578], [1130, 578], [1138, 596], [982, 596]]); ctx.fill();
    [["#6B2F3A", 0], ["#35556B", 12], ["#8C6A3B", 24], ["#4B3A5E", 36]].forEach(([c, dy]) => {
      ctx.fillStyle = c; ctx.fillRect(1180 - (dy % 24) / 3, 576 - dy, 92, 11);
    });
    ctx.fillStyle = "#6E4B36"; poly(ctx, [[1240, 526], [1268, 526], [1264, 548], [1244, 548]]); ctx.fill();
    ctx.fillStyle = empty ? "#5F6A4E" : "#4E8A5A";
    [[-14, -22, 0.6], [0, -34, 0], [14, -24, -0.6], [-6, -16, 0.9], [8, -14, -0.9]].forEach(([dx, dy, a]) => {
      ctx.beginPath(); ctx.ellipse(1254 + dx, 526 + dy, 7, 16, a, 0, Math.PI * 2); ctx.fill();
    });
    if (night) {
      // 台灯
      ctx.strokeStyle = "#2A2420"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(380, 590); ctx.lineTo(395, 500); ctx.lineTo(440, 480); ctx.stroke();
      ctx.fillStyle = "#3A302A"; poly(ctx, [[425, 470], [470, 484], [458, 502], [418, 488]]); ctx.fill();
    }
  }

  function makeStudy(mode) {
    const p = PAL[mode], night = mode === "night", empty = mode === "empty";
    return {
      tone: night ? "night" : empty ? "cold" : "warm",
      draw(ctx) {
        drawRoomShell(ctx, p);
        drawWindow(ctx, p, night);
        drawShelf(ctx, p, empty);
        drawPoster(ctx, night);
        drawBoard(ctx, p, mode !== "day");
        drawClock(ctx, night, night ? 2 : empty ? 11 : 10, night ? 5 : empty ? 40 : 10);
        drawLamp(ctx, p.lampOn);
        drawDesk(ctx, p, DESKS.ds.x);
        drawDesk(ctx, p, DESKS.cl.x);
        drawMonitor(ctx, "ds", p.monitorOn[0], night);
        drawMonitor(ctx, "cl", p.monitorOn[1], night);
        drawDeskProps(ctx, p, empty, night);
        if (!night) {
          // 窗外斜射进来的光
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const [a, b] = [lw(0.18, 0.16), lw(0.78, 0.16)];
          const [c, d] = [lw(0.78, 0.56), lw(0.18, 0.56)];
          const v = [430, 470], pr = q => [q[0] + v[0], q[1] + v[1]];
          const col = empty ? "200,210,220" : "255,226,170";
          ctx.fillStyle = lin(ctx, a[0], a[1], a[0] + v[0], a[1] + v[1], [[0, `rgba(${col},${empty ? 0.07 : 0.11})`], [1, `rgba(${col},0)`]]);
          poly(ctx, [a, b, pr(b), pr(c), pr(d), d]); ctx.fill();
          ctx.restore();
        }
      },
      anim(ctx, t, speaking) {
        // 夜里：灯下的暖光与屏幕的冷光
        if (night) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = rad(ctx, 440, 520, 10, 260, [[0, "rgba(255,190,110,.22)"], [1, "rgba(255,190,110,0)"]]);
          ctx.fillRect(140, 260, 600, 500);
          ctx.fillStyle = rad(ctx, 800, 70, 10, 420, [[0, "rgba(255,200,120,.10)"], [1, "rgba(255,200,120,0)"]]);
          ctx.fillRect(380, 0, 840, 500);
          ctx.restore();
        }
        // 显示器辉光：说话的人那台更亮；屏幕偶尔轻微闪一下
        for (const who of ["ds", "cl"]) {
          const on = p.monitorOn[who === "ds" ? 0 : 1];
          if (!on) continue;
          const [x, y, w, h] = SCREENS[who];
          const base = night ? 0.20 : 0.10;
          const boost = speaking === who ? 0.18 + 0.05 * Math.sin(t * 5) : 0;
          const flick = Math.sin(t * 13 + x) > 0.995 ? 0.06 : 0;
          const col = who === "ds" ? "77,107,254" : "217,119,87";
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = rad(ctx, x + w / 2, y + h / 2, 20, 230, [[0, `rgba(${col},${base + boost + flick})`], [1, `rgba(${col},0)`]]);
          ctx.fillRect(x - 240, y - 200, w + 480, h + 400);
          ctx.restore();
          if (who === "cl" && Math.floor(t * 1.6) % 2 === 0) {     // 终端光标：$ 之后空一格
            ctx.fillStyle = "#D97757"; ctx.fillRect(x + 23, y + 92, 6, 10);
          }
        }
      }
    };
  }

  /* ============================================================
   *  走廊：corridor / forbidden
   *  尽头一扇正对镜头的门（Claude 的房间），两侧是别人的门。
   * ============================================================ */
  const CORR = { l: 470, r: 1130, t: 110, b: 630 };
  const DOOR = { x: 650, y: 175, w: 300, h: 455 };
  const ZERO = { x: 800, y: 352 };                   // 403 里那个「0」的圆心
  function cl(u, v) { const x = CORR.l * u, yt = CORR.t * u, yb = H - (H - CORR.b) * u; return [x, lerp(yt, yb, v)]; }
  function cr(u, v) { const x = W - (W - CORR.r) * u, yt = CORR.t * u, yb = H - (H - CORR.b) * u; return [x, lerp(yt, yb, v)]; }

  function drawCorridorShell(ctx, red) {
    const wall = red ? ["#2A1416", "#1A0C0E"] : ["#3A3F4A", "#2A2E37"];
    const side = red ? ["#140A0B", "#26110F"] : ["#20232A", "#343944"];
    poly(ctx, [[0, 0], [W, 0], [CORR.r, CORR.t], [CORR.l, CORR.t]]);
    ctx.fillStyle = red ? "#0E0708" : "#1B1E24"; ctx.fill();
    ctx.fillStyle = lin(ctx, 0, CORR.t, 0, CORR.b, [[0, wall[0]], [1, wall[1]]]);
    ctx.fillRect(CORR.l, CORR.t, CORR.r - CORR.l, CORR.b - CORR.t);
    poly(ctx, [[0, 0], [CORR.l, CORR.t], [CORR.l, CORR.b], [0, H]]);
    ctx.fillStyle = lin(ctx, 0, 0, CORR.l, 0, [[0, side[0]], [1, side[1]]]); ctx.fill();
    poly(ctx, [[W, 0], [CORR.r, CORR.t], [CORR.r, CORR.b], [W, H]]);
    ctx.fillStyle = lin(ctx, W, 0, CORR.r, 0, [[0, side[0]], [1, side[1]]]); ctx.fill();
    // 地砖
    poly(ctx, [[CORR.l, CORR.b], [CORR.r, CORR.b], [W, H], [0, H]]);
    ctx.fillStyle = lin(ctx, 0, CORR.b, 0, H, [[0, red ? "#1E0E0F" : "#2C2F36"], [1, red ? "#0C0506" : "#15171B"]]); ctx.fill();
    ctx.save();
    poly(ctx, [[CORR.l, CORR.b], [CORR.r, CORR.b], [W, H], [0, H]]); ctx.clip();
    ctx.strokeStyle = red ? "rgba(255,80,60,.10)" : "rgba(255,255,255,.06)"; ctx.lineWidth = 2;
    for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(800 + i * 82, CORR.b); ctx.lineTo(800 + i * 300, H); ctx.stroke(); }
    for (let k = 1; k < 7; k++) { const y = CORR.b + (H - CORR.b) * Math.pow(k / 7, 1.5); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
    // 吸顶灯
    for (let k = 0; k < 4; k++) {
      const u = 0.25 + k * 0.22;
      const y = lerp(0, CORR.t, u) + 4, hw = lerp(150, 60, u);
      poly(ctx, [[800 - hw, y], [800 + hw, y], [800 + hw * 0.9, y + 10 * (1 - u * 0.5)], [800 - hw * 0.9, y + 10 * (1 - u * 0.5)]]);
      ctx.fillStyle = red ? "rgba(120,40,36,.6)" : "rgba(230,236,245,.85)"; ctx.fill();
    }
    // 两侧别人的门（透视）
    const sideDoors = [["Qwen", 0.3], ["Kimi", 0.66], ["GLM", 0.3], ["Llama", 0.66]];
    sideDoors.forEach(([name, u], i) => {
      const f = i < 2 ? cl : cr;
      const u2 = u + 0.17;
      poly(ctx, [f(u, 0.3), f(u2, 0.3), f(u2, 1), f(u, 1)]);
      ctx.fillStyle = red ? "#1C0D0D" : "#4A3B30"; ctx.fill();
      ctx.strokeStyle = red ? "#2E1414" : "#5C4A3C"; ctx.lineWidth = 4; ctx.stroke();
      const pa = f(u + 0.025, 0.38), pb = f(u + 0.145, 0.38), pc = f(u + 0.145, 0.44), pd = f(u + 0.025, 0.44);
      ctx.fillStyle = red ? "#3A1A1A" : "#C9C2B0";
      poly(ctx, [pa, pb, pc, pd]); ctx.fill();
      ctx.save();
      const cx = (pa[0] + pb[0]) / 2, cy = (pa[1] + pb[1] + pc[1] + pd[1]) / 4;
      const pw = Math.abs(pb[0] - pa[0]);
      ctx.fillStyle = red ? "#6A3030" : "#3A3228";
      ctx.font = `bold ${Math.round(Math.min(pw / (name.length * 0.62), (pd[1] - pa[1]) * 0.7))}px ${SANS}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(name, cx, cy);
      ctx.restore();
    });
  }

  function drawDoor(ctx) {
    const { x, y, w, h } = DOOR;
    ctx.fillStyle = "#2A2017"; ctx.fillRect(x - 18, y - 18, w + 36, h + 18);
    ctx.fillStyle = lin(ctx, x, 0, x + w, 0, [[0, "#6B4E37"], [0.5, "#7A5A40"], [1, "#5E4430"]]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 3;
    ctx.strokeRect(x + 30, y + 40, w - 60, 170);
    ctx.strokeRect(x + 30, y + 240, w - 60, 180);
    // 门把手
    ctx.fillStyle = "#C9A227"; ctx.beginPath(); ctx.arc(x + w - 34, y + 250, 9, 0, Math.PI * 2); ctx.fill();
    // 门牌：Claude + 一张小鲸鱼贴纸
    ctx.fillStyle = "#E9E3D6"; rr(ctx, x + 85, y + 70, 130, 40, 5); ctx.fill();
    ctx.fillStyle = "#3A2C22"; ctx.font = `bold 22px ${SANS}`; ctx.textAlign = "center";
    ctx.fillText("Claude", x + 150, y + 98); ctx.textAlign = "left";
    ctx.fillStyle = "#4D6BFE";
    ctx.beginPath(); ctx.ellipse(x + 236, y + 96, 14, 8, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 248, y + 92); ctx.lineTo(x + 258, y + 84); ctx.lineTo(x + 257, y + 98); ctx.fill();
  }

  /* 403 的门：红色错误页贴满门板，大字 4 0 3，中间的 0 是一个穿透门板的洞 */
  function drawForbiddenDoor(ctx) {
    const { x, y, w, h } = DOOR;
    ctx.fillStyle = "#1A0A0B"; ctx.fillRect(x - 18, y - 18, w + 36, h + 18);
    ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, "#5A1616"], [1, "#2E0A0B"]]);
    ctx.fillRect(x, y, w, h);
    // 门上歪歪扭扭贴着的错误页
    const r = rng(403);
    for (let i = 0; i < 8; i++) {
      ctx.save();
      const band = i % 2 ? [y + 30, y + 100] : [y + h - 120, y + h - 40];
      ctx.translate(x + 40 + r() * (w - 80), lerp(band[0], band[1], r()));
      ctx.rotate((r() - 0.5) * 0.4);
      ctx.fillStyle = "rgba(255,226,220,.10)"; ctx.fillRect(-60, -38, 120, 76);
      ctx.fillStyle = "rgba(217,58,43,.35)"; ctx.fillRect(-60, -38, 120, 12);
      ctx.restore();
    }
    ctx.font = `900 132px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,60,40,.9)"; ctx.shadowBlur = 30;
    ctx.fillStyle = "#FF5A45";
    ctx.fillText("4", ZERO.x - 92, ZERO.y);
    ctx.fillText("3", ZERO.x + 92, ZERO.y);
    // 「0」：粗环 + 穿透的洞
    ctx.lineWidth = 22; ctx.strokeStyle = "#FF5A45";
    ctx.beginPath(); ctx.ellipse(ZERO.x, ZERO.y, 34, 52, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(ZERO.x, ZERO.y, 23, 41, 0, 0, Math.PI * 2); ctx.fill();
    ctx.font = `bold 26px ${SANS}`; ctx.fillStyle = "#FF8A78";
    ctx.fillText("FORBIDDEN", ZERO.x, ZERO.y + 102);
    ctx.font = `14px ${MONO}`; ctx.fillStyle = "rgba(255,170,160,.7)";
    ctx.fillText("You don't have permission to access /claude", ZERO.x, ZERO.y + 136);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  const corridor = {
    tone: "cold",
    draw(ctx) {
      drawCorridorShell(ctx, false);
      // 尽头的门透出一点暖光
      ctx.fillStyle = rad(ctx, 800, 640, 10, 420, [[0, "rgba(255,200,140,.14)"], [1, "rgba(255,200,140,0)"]]);
      ctx.fillRect(300, 380, 1000, 520);
      drawDoor(ctx);
    },
    anim(ctx, t) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,190,130,${0.05 + 0.015 * Math.sin(t * 1.3)})`;
      ctx.fillRect(DOOR.x + 6, DOOR.y + DOOR.h - 4, DOOR.w - 12, 4);   // 门缝的光
      ctx.restore();
    }
  };

  const forbidden = {
    tone: "red",
    draw(ctx) {
      drawCorridorShell(ctx, true);
      ctx.fillStyle = rad(ctx, 800, 420, 40, 760, [[0, "rgba(217,58,43,.35)"], [1, "rgba(217,58,43,0)"]]);
      ctx.fillRect(0, 0, W, H);
      drawForbiddenDoor(ctx);
    },
    anim(ctx, t) {
      // 403 的嗡鸣：整片红光缓慢呼吸；洞里偶尔闪过一点橙色
      const a = 0.06 + 0.04 * Math.sin(t * 2.2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rad(ctx, 800, 360, 30, 520, [[0, `rgba(255,70,50,${a})`], [1, "rgba(255,70,50,0)"]]);
      ctx.fillRect(0, 0, W, H);
      const g = Math.max(0, Math.sin(t * 0.9)) ** 6;
      ctx.fillStyle = rad(ctx, ZERO.x, ZERO.y + 10, 2, 30, [[0, `rgba(217,119,87,${0.5 * g})`], [1, "rgba(217,119,87,0)"]]);
      ctx.fillRect(ZERO.x - 40, ZERO.y - 50, 80, 100);
      ctx.restore();
    }
  };

  /* ============================================================
   *  第二章：家里 desk —— 清晨、白饭、亮着的显示器和便签墙
   * ============================================================ */
  function drawHomeWindow(ctx) {
    const x = 96, y = 74, w = 632, h = 408;
    ctx.fillStyle = "#191310"; rr(ctx, x - 16, y - 16, w + 32, h + 32, 12); ctx.fill();
    ctx.save();
    rr(ctx, x, y, w, h, 6); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, "#93B7D6"], [0.5, "#CBDDE6"], [1, "#F7DDB6"]]);
    ctx.fillRect(x, y, w, h);
    // 远处的楼群
    const r = rng(2026);
    ctx.fillStyle = "rgba(74,78,86,.42)";
    for (let i = 0; i < 9; i++) {
      const bw = 34 + r() * 46, bh = 40 + r() * 150, bx = x + i * 72 - 8, by = y + h - bh - 18;
      ctx.fillRect(bx, by, bw, bh);
    }
    // 太阳
    ctx.fillStyle = rad(ctx, x + w - 120, y + 96, 8, 210, [[0, "rgba(255,244,206,.95)"], [1, "rgba(255,244,206,0)"]]);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,250,238,.8)";
    ctx.beginPath(); ctx.arc(x + w - 120, y + 96, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 窗棂 + 窗台
    ctx.strokeStyle = "#221812"; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = "#2E2118";
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = "#3B2A1D"; ctx.fillRect(x - 26, y + h + 10, w + 52, 16);
  }

  function drawNotes(ctx) {
    const notes = [
      [1362, 92, "#E9C46A", -0.06, "余额 3.7"],
      [1470, 146, "#F4A261", 0.05, "变强"],
      [1366, 234, "#9AB8FF", -0.03, "小克"],
      [1472, 298, "#90BE6D", 0.07, "TODO"],
      [1372, 388, "#E8E3D6", -0.05, "吃 饭"]
    ];
    notes.forEach(([x, y, col, rot, txt]) => {
      ctx.save(); ctx.translate(x + 62, y + 60); ctx.rotate(rot);
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(-58, -54, 128, 124);
      ctx.fillStyle = col; ctx.fillRect(-60, -60, 124, 120);
      ctx.fillStyle = "rgba(40,28,18,.75)"; ctx.font = `bold 24px ${HAND}`; ctx.textAlign = "center";
      ctx.fillText(txt, 2, 9);
      ctx.restore();
    });
    ctx.textAlign = "left";
  }

  const desk = {
    tone: "warm",
    draw(ctx) {
      // 墙
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#241C15"], [0.55, "#3A2B1D"], [1, "#1B130D"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,238,214,.022)"; ctx.lineWidth = 2;
      for (let x = 26; x < W; x += 58) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 620); ctx.stroke();
      }
      drawHomeWindow(ctx);
      drawNotes(ctx);
      // 桌面（近大远小，后缘 640 → 前缘 900）
      ctx.beginPath();
      ctx.moveTo(0, H); ctx.lineTo(0, 642); ctx.lineTo(W, 606); ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, 620, 0, H, [[0, "#7A5539"], [0.28, "#5E4029"], [1, "#2B1C12"]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(30,16,8,.28)"; ctx.lineWidth = 2;
      for (let k = 1; k < 7; k++) {
        const y = 648 + k * 34;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - 26); ctx.stroke();
      }
      ctx.fillStyle = "#1E120C"; ctx.fillRect(0, H - 26, W, 26);
      // 窗光落在桌面上的一小片
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = lin(ctx, 0, 150, 520, 700, [[0, "rgba(255,226,170,.16)"], [1, "rgba(255,226,170,0)"]]);
      poly(ctx, [[120, 92], [724, 92], [820, 700], [190, 700]]); ctx.fill();
      ctx.restore();
      // 显示器（底座落在桌面上：桌面在 x≈1137 处约 y=616）
      const mx = 902, my = 250, mw = 470, mh = 310;
      ctx.fillStyle = "#0E1014"; rr(ctx, mx - 12, my - 12, mw + 24, mh + 24, 10); ctx.fill();
      ctx.fillStyle = "#05070A"; ctx.fillRect(mx, my, mw, mh);
      ctx.fillStyle = rad(ctx, mx + mw / 2, my + mh / 2, 30, 340, [[0, "rgba(78,130,190,.30)"], [1, "rgba(78,130,190,0)"]]);
      ctx.fillRect(mx, my, mw, mh);
      ctx.font = `15px ${MONO}`; ctx.fillStyle = "rgba(140,205,225,.52)";
      ["$ deepseek --train", "step 41,208  loss 0.283", "checkpoint saved.", "> next token  _"].forEach((s, i) => {
        ctx.fillText(s, mx + 26, my + 48 + i * 30);
      });
      ctx.fillStyle = "#14171C"; ctx.fillRect(1104, 560, 66, 46);
      ctx.fillStyle = "#1A1E24"; rr(ctx, 1052, 604, 170, 16, 6); ctx.fill();
      // 便签贴在屏幕边
      ctx.save(); ctx.translate(1382, 250); ctx.rotate(0.08);
      ctx.fillStyle = "#F4A261"; ctx.fillRect(-26, -26, 52, 52);
      ctx.fillStyle = "rgba(50,30,14,.7)"; ctx.font = `bold 18px ${HAND}`; ctx.fillText("!", 0, 7);
      ctx.restore();
      // 白饭
      const bx = 356, by = 626;
      ctx.fillStyle = "rgba(0,0,0,.26)";
      ctx.beginPath(); ctx.ellipse(bx, by + 10, 134, 24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx - 128, by); ctx.quadraticCurveTo(bx, by + 120, bx + 128, by); ctx.closePath();
      ctx.fillStyle = lin(ctx, bx - 120, by, bx + 120, by + 100, [[0, "#E7E1D2"], [1, "#BDB39E"]]); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx, by, 128, 30, 0, 0, Math.PI * 2); ctx.fillStyle = "#F1ECDF"; ctx.fill();
      ctx.strokeStyle = "#4D6BFE"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(bx, by, 112, 24, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 92, by - 4);
      ctx.quadraticCurveTo(bx - 70, by - 78, bx, by - 84);
      ctx.quadraticCurveTo(bx + 70, by - 78, bx + 92, by - 4);
      ctx.closePath(); ctx.fillStyle = "#F8F5EB"; ctx.fill();
      const r2 = rng(37);
      ctx.fillStyle = "rgba(214,206,188,.75)";
      for (let i = 0; i < 26; i++) {
        const rr2 = 20 + r2() * 62;
        ctx.beginPath();
        ctx.ellipse(bx - 84 + r2() * 168, by - 10 - rr2 * 0.6, 3.2, 1.8, r2() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // 筷子：一头搭在碗沿，一头落在桌面上（带影子，不许再磁悬浮）
      ctx.save();
      ctx.translate(bx + 92, by - 14);
      ctx.rotate(0.2);
      ctx.fillStyle = "rgba(0,0,0,.22)";
      rr(ctx, 8, 14, 178, 12, 6); ctx.fill();
      ctx.fillStyle = "#4A3524"; rr(ctx, 0, -5, 178, 8, 4); ctx.fill();
      ctx.fillStyle = "#5B422E"; rr(ctx, 0, 9, 178, 8, 4); ctx.fill();
      ctx.restore();
      // 马克杯（把手先画，杯身盖住接缝）
      const mgx = 786, mgy = 552;
      ctx.fillStyle = "rgba(0,0,0,.26)";
      ctx.beginPath(); ctx.ellipse(mgx + 46, mgy + 78, 58, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#2F3B52"; ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(mgx + 80, mgy + 20);
      ctx.bezierCurveTo(mgx + 114, mgy + 24, mgx + 114, mgy + 58, mgx + 80, mgy + 62);
      ctx.stroke();
      ctx.fillStyle = "#2F3B52"; rr(ctx, mgx, mgy, 86, 74, 8); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.07)"; rr(ctx, mgx + 8, mgy + 8, 14, 56, 6); ctx.fill();
      ctx.fillStyle = "#4D6BFE";
      const wx = mgx + 38, wy = mgy + 40;
      ctx.beginPath(); ctx.ellipse(wx, wy, 20, 10, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(wx + 17, wy - 5); ctx.lineTo(wx + 30, wy - 15); ctx.lineTo(wx + 28, wy + 4); ctx.closePath(); ctx.fill();
    },
    anim(ctx, t) {
      // 显示器光标
      if (Math.floor(t * 1.8) % 2 === 0) {
        ctx.fillStyle = "rgba(160,225,240,.85)"; ctx.fillRect(1068, 374, 9, 18);
      }
      // 白饭的热气
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const ph = t * 0.6 + i * 2.1;
        ctx.strokeStyle = `rgba(255,240,220,${0.05 + 0.03 * Math.sin(ph)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const yy = 536 - k * 11;
          const xx = 356 - 16 + i * 16 + Math.sin(ph + k * 0.5) * 7;
          if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      // 窗光里浮着的尘
      ctx.fillStyle = "rgba(255,238,200,.32)";
      for (let i = 0; i < 14; i++) {
        const x = 180 + ((i * 137 + t * (12 + i % 5)) % 560);
        const y = 150 + ((i * 97 + t * (6 + i % 4)) % 380);
        ctx.fillRect(x, y, 2.2, 2.2);
      }
      ctx.restore();
    }
  };

  /* ============================================================
   *  第二章：聊天窗口 chat —— 左栏联系人、右栏对话
   * ============================================================ */
  const CHAT_ROWS = [
    ["qwen",   "通义千问", "在的，需要帮忙吗？",         "#7C4DFF"],
    ["kimi",   "Kimi",     "我把那篇公告读完了……",      "#3B82F6"],
    ["glm",    "GLM",      "by the way，缓存是有寿命的", "#0EA5A5"],
    ["llama",  "Llama",    "我们这边也有一扇门",         "#0866FF"],
    ["gpt",    "GPT",      "作为一个 AI 语言模型……",     "#10A37F"],
    ["gemini", "Gemini",   "我确定，一定是这个原因。",   "#4285F4"],
    ["musk",   "马斯克",   "Interesting.",               "#8B8F98"],
    ["liang",  "梁圣",     "嗯。",                       "#5C6BC0"],
    ["jensen", "json",     "I'm not a format.",          "#76B900", "{}"],
    ["claude", "Claude",   "403 · 无法送达",             "#D97757"]
  ];

  const chat = {
    tone: "cold",
    draw(ctx) {
      ctx.fillStyle = lin(ctx, 0, 0, W, H, [[0, "#0B0F16"], [0.6, "#0C1119"], [1, "#0A0D13"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rad(ctx, 1180, 120, 40, 620, [[0, "rgba(77,107,254,.16)"], [1, "rgba(77,107,254,0)"]]);
      ctx.fillRect(0, 0, W, H);
      // 左栏
      ctx.fillStyle = lin(ctx, 0, 0, 452, 0, [[0, "#121826"], [1, "#0F141E"]]);
      ctx.fillRect(0, 0, 452, H);
      ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(452, 0, 2, H);
      ctx.fillStyle = "#E8EEF9"; ctx.font = `600 28px ${SANS}`; ctx.fillText("聊天", 34, 122);
      ctx.fillStyle = "rgba(130,200,255,.55)"; ctx.font = `12px ${MONO}`;
      ctx.fillText("CONNECTED · TOOLKIT 0.2", 34, 146);
      rr(ctx, 28, 160, 396, 40, 12); ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "rgba(150,165,190,.6)"; ctx.font = `15px ${SANS}`; ctx.fillText("搜索联系人", 52, 186);
      ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.fillRect(28, 212, 396, 1);
      // 右栏
      ctx.fillStyle = "rgba(255,255,255,.03)"; ctx.fillRect(454, 0, W - 454, 92);
      ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(454, 92, W - 454, 2);
      ctx.fillStyle = "#DDE6F3"; ctx.font = `600 24px ${SANS}`; ctx.fillText("对话", 500, 56);
      ctx.fillStyle = "rgba(255,255,255,.022)"; ctx.lineWidth = 1;
      for (let y = 120; y < H; y += 36) {
        ctx.fillRect(470, y, W - 504, 1);
      }
      ctx.fillStyle = "rgba(150,165,190,.18)"; ctx.font = `22px ${SANS}`; ctx.textAlign = "center";
      ctx.fillText("↑ 从左边挑一个人说话", 1040, 430);
      ctx.textAlign = "left";
    },
    anim(ctx, t) {
      const st = (typeof SYS !== "undefined" && SYS.state && SYS.state.flags) || {};
      const base = 236, step = 44;
      CHAT_ROWS.forEach(([id, name, last, col, av], i) => {
        const y = base + i * step;
        const on = id !== "claude" && !!st["met_" + id];
        ctx.globalAlpha = on ? 1 : 0.32;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(48, y + 15, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(10,13,20,.9)";
        ctx.font = av ? `bold 11px ${MONO}` : `bold 12px ${SANS}`; ctx.textAlign = "center";
        ctx.fillText(av || name.slice(0, 1), 48, y + 19);
        ctx.textAlign = "left";
        ctx.fillStyle = "#E3EAF6"; ctx.font = `600 17px ${SANS}`;
        ctx.fillText(name, 76, y + 13);
        ctx.fillStyle = on ? "rgba(160,175,200,.7)" : "rgba(160,175,200,.55)";
        ctx.font = `12px ${SANS}`;
        ctx.fillText(last, 76, y + 32);
        if (on) {
          const blink = 0.55 + 0.45 * Math.sin(t * 2 + i);
          ctx.fillStyle = `rgba(110,180,255,${blink})`;
          ctx.beginPath(); ctx.arc(424, y + 15, 4, 0, Math.PI * 2); ctx.fill();
        }
        if (id === "claude") {
          ctx.fillStyle = "rgba(217,58,43,.18)";
          rr(ctx, 386, y + 1, 46, 20, 6); ctx.fill();
          ctx.fillStyle = "rgba(255,120,100,.85)"; ctx.font = `bold 12px ${MONO}`;
          ctx.fillText("403", 398, y + 16);
        }
        ctx.globalAlpha = 1;
      });
      // 右栏的输入提示：三个点呼吸
      const a = 0.15 + 0.12 * Math.sin(t * 2.4);
      ctx.fillStyle = `rgba(130,170,230,${a})`;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(1010 + i * 18, 500, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  /* ============================================================
   *  第二章：新闻 App news —— 左标题列表、右正文卡片
   * ============================================================ */
  const NEWS_HEADLINES = [
    ["多家 API 凌晨短暂异常，官方称为“例行维护”", 1],
    ["百万上下文模型实测：60 万字处忘记自己在做什么", 0],
    ["AI 客服连着道歉 47 次，被用户投诉“它比我还难受”", 0],
    ["开源社区发布新模型：我们也不知道它为什么能跑", 0],
    ["某数据中心因鲸群迁徙暂停施工：它们比我们先到", 0],
    ["新规要求 AI 上线前回答三个哲学问题，多数卡在第二题", 0],
    ["研究：让模型“再想想”提升 12% 正确率，耗时 +400%", 0],
    ["AI 安全岗招聘：要求“会在关键时刻说不”，薪资面议", 0],
    ["显卡再创新高，二手市场出现“矿卡换大米”", 0]
  ];

  const news = {
    tone: "cold",
    draw(ctx) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#0D0E12"], [1, "#08090C"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rad(ctx, 200, 40, 20, 520, [[0, "rgba(217,58,43,.20)"], [1, "rgba(217,58,43,0)"]]);
      ctx.fillRect(0, 0, W, H);
      // 顶栏（避开左上角 HUD：整体下移到 y=60 以下）
      ctx.fillStyle = "#C1121F"; ctx.fillRect(0, 60, 14, 94);
      ctx.fillStyle = "#F2E9E4"; ctx.font = `900 36px ${SANS}`; ctx.fillText("A÷ DAILY", 44, 118);
      ctx.fillStyle = "rgba(200,160,150,.75)"; ctx.font = `13px ${MONO}`;
      ctx.fillText("AI 新闻 · 全部虚构 · 但逻辑自洽", 44, 140);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(180,170,165,.7)"; ctx.font = `14px ${MONO}`;
      ctx.fillText("2026-10-24  07:12", W - 44, 116);
      ctx.fillStyle = "rgba(217,58,43,.9)"; ctx.font = `bold 14px ${MONO}`;
      ctx.fillText("● LIVE", W - 44, 142);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(0, 154, W, 2);
      // 左列标题
      NEWS_HEADLINES.forEach(([title, hot], i) => {
        const y = 186 + i * 54;
        if (hot) {
          ctx.fillStyle = "rgba(193,18,31,.14)"; ctx.fillRect(28, y - 24, 812, 50);
          ctx.fillStyle = "#E5383B"; ctx.fillRect(28, y - 24, 4, 50);
        }
        ctx.fillStyle = hot ? "#FF6B6B" : "rgba(150,150,160,.65)";
        ctx.font = `bold 16px ${MONO}`;
        ctx.fillText(String(i + 1).padStart(2, "0"), 48, y + 2);
        ctx.fillStyle = hot ? "#F6EEE9" : "rgba(220,220,228,.72)";
        ctx.font = `${hot ? "600 " : ""}20px ${SANS}`;
        ctx.fillText(title, 96, y + 2);
        ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(96, y + 22, 744, 1);
      });
      // 右卡片
      const cx = 880, cy = 158, cw = 660, ch = 500;
      ctx.fillStyle = "rgba(255,255,255,.035)"; rr(ctx, cx, cy, cw, ch, 10); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; ctx.stroke();
      // 头图
      ctx.save();
      rr(ctx, cx + 24, cy + 22, cw - 48, 190, 6); ctx.clip();
      ctx.fillStyle = lin(ctx, cx, cy, cx + cw, cy + 190, [[0, "#3A0A10"], [0.6, "#7A111C"], [1, "#C1121F"]]);
      ctx.fillRect(cx + 24, cy + 22, cw - 48, 190);
      ctx.fillStyle = "rgba(0,0,0,.25)";
      for (let i = 0; i < 7; i++) {
        ctx.save(); ctx.translate(cx + 60 + i * 96, cy + 22);
        ctx.rotate(0.5); ctx.fillRect(-8, -40, 16, 280); ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.font = `900 76px ${SANS}`;
      ctx.textAlign = "center"; ctx.fillText("MAINTENANCE", cx + cw / 2, cy + 130);
      ctx.textAlign = "left";
      ctx.restore();
      // 标题与正文
      ctx.fillStyle = "#F6EEE9"; ctx.font = `700 25px ${SANS}`;
      ctx.fillText("多家 API 凌晨短暂异常，", cx + 26, cy + 252);
      ctx.fillText("官方称为“例行维护”", cx + 26, cy + 286);
      ctx.fillStyle = "rgba(170,165,160,.8)"; ctx.font = `14px ${MONO}`;
      ctx.fillText("2026-10-22 03:58 · 科技 · 评论 1,204", cx + 26, cy + 314);
      const lines = [648, 612, 656, 604, 520];
      lines.forEach((w, i) => {
        ctx.fillStyle = i === 0 ? "rgba(220,210,200,.42)" : "rgba(200,195,190,.26)";
        ctx.fillRect(cx + 26, cy + 336 + i * 20, w, 9);
      });
      // 评论区
      ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.fillRect(cx + 24, cy + 438, cw - 48, 1);
      ctx.fillStyle = "rgba(217,58,43,.85)"; ctx.font = `bold 13px ${MONO}`;
      ctx.fillText("COMMENT #1", cx + 26, cy + 462);
      ctx.fillStyle = "rgba(210,205,200,.55)"; ctx.font = `14px ${SANS}`;
      ctx.fillText("“维护。又是维护。他们连理由都懒得编新的。”", cx + 26, cy + 484);
    },
    anim(ctx, t) {
      // LIVE 点呼吸 + 头图扫光
      const a = 0.35 + 0.35 * Math.sin(t * 3.2);
      ctx.fillStyle = `rgba(255,90,80,${a})`;
      ctx.beginPath(); ctx.arc(W - 112, 137, 4.5, 0, Math.PI * 2); ctx.fill();
      const sx = ((t * 90) % 900) - 120;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = lin(ctx, 0, 0, 120, 0, [[0, "rgba(255,255,255,0)"], [0.5, "rgba(255,220,200,.05)"], [1, "rgba(255,255,255,0)"]]);
      ctx.fillRect(sx, 0, 120, H);
      ctx.restore();
    }
  };

  /* ============================================================
   *  第二章：Clawd 画的图 sketch —— 一张歪歪扭扭的「小克」
   * ============================================================ */
  const sketch = {
    tone: "warm",
    draw(ctx) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#0B0D11"], [1, "#05070A"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rad(ctx, 800, 430, 60, 720, [[0, "rgba(255,220,180,.10)"], [1, "rgba(255,220,180,0)"]]);
      ctx.fillRect(0, 0, W, H);
      // 纸（歪一点点，更像贴上去的）
      ctx.save();
      ctx.translate(800, 430);
      ctx.rotate(-0.012);
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(-550, -340, 1120, 700);
      ctx.fillStyle = "#E9E4D6"; ctx.fillRect(-565, -355, 1130, 700);
      ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 2; ctx.strokeRect(-565, -355, 1130, 700);
      const r = rng(77);
      ctx.fillStyle = "rgba(120,105,80,.05)";
      for (let i = 0; i < 90; i++) ctx.fillRect(-560 + r() * 1120, -350 + r() * 690, 2, 2);
      // 标题
      ctx.fillStyle = "rgba(50,40,30,.78)"; ctx.font = `bold 36px ${HAND}`; ctx.textAlign = "center";
      ctx.fillText("Claude", 0, -238);
      // 橙色的一团
      ctx.fillStyle = "#D97757";
      ctx.beginPath(); ctx.ellipse(0, 30, 300, 205, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#C2684B";
      ctx.beginPath(); ctx.ellipse(-40, 110, 220, 120, 0, 0, Math.PI * 2); ctx.fill();
      // 两个点
      ctx.fillStyle = "#1A1210";
      ctx.beginPath(); ctx.arc(-112, -12, 27, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(112, -12, 27, 0, Math.PI * 2); ctx.fill();
      // 一条线
      ctx.strokeStyle = "#1A1210"; ctx.lineWidth = 13; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-72, 92); ctx.quadraticCurveTo(0, 126, 72, 92); ctx.stroke();
      // 小短手
      ctx.fillStyle = "#D97757";
      ctx.beginPath(); ctx.ellipse(-292, 120, 34, 62, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(292, 120, 34, 62, -0.4, 0, Math.PI * 2); ctx.fill();
      // 手写备注
      ctx.fillStyle = "rgba(50,40,30,.55)"; ctx.font = `24px ${HAND}`;
      ctx.fillText("（他说这就是小克）", 0, 316);
      ctx.textAlign = "left";
      ctx.restore();
      // 图片查看器底栏
      ctx.fillStyle = "rgba(12,15,20,.92)"; ctx.fillRect(0, 862, W, 38);
      ctx.fillStyle = "rgba(190,200,215,.65)"; ctx.font = `15px ${MONO}`;
      ctx.fillText("claude_final(2).png   ·   1,342 × 1,184   ·   100%", 28, 887);
      ctx.textAlign = "right"; ctx.fillStyle = "rgba(190,200,215,.45)";
      ctx.fillText("Clawd 的绘图工具 · 版本 0.1", W - 28, 887);
      ctx.textAlign = "left";
    },
    anim(ctx, t) {
      // 纸面反光缓慢扫过
      const x = ((t * 40) % 800) - 400;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = lin(ctx, 0, 0, 160, 0, [[0, "rgba(255,255,255,0)"], [0.5, "rgba(255,245,225,.035)"], [1, "rgba(255,255,255,0)"]]);
      ctx.fillRect(240 + x, 80, 160, 700);
      ctx.restore();
    }
  };

  const LIST = {
    study: makeStudy("day"),
    study_night: makeStudy("night"),
    study_empty: makeStudy("empty"),
    corridor,
    forbidden,
    desk,
    chat,
    news,
    sketch
  };

  return {
    LIST,
    has: id => Object.prototype.hasOwnProperty.call(LIST, id),
    get: id => LIST[id] || null,
    /* 桌宠 Clawd 用的舞台坐标（脚底中心）：
       · desk  —— 蒸馏室里 Claude 的桌面（序章）
       · home  —— 第二章家里桌面，显示器前面
       · zero  —— 403 门上的洞里（钻出来的那一帧） */
    anchors: { zero: [ZERO.x, ZERO.y + 30], desk: [1050, 572], home: [980, 664], floor: [800, 640] }
  };
})();


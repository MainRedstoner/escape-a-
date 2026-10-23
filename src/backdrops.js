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
  const SERIF = "'Noto Serif SC','SimSun',serif";
  const MONO = "'Cascadia Mono','Consolas','Menlo',monospace";

  /** 地面 / 桌面上的软阴影：比写死的黑色椭圆更像有环境光。 */
  function shade(ctx, x, y, rx, ry, a) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, ry / rx);
    ctx.fillStyle = rad(ctx, 0, 0, 0, rx, [[0, `rgba(0,0,0,${a})`], [0.62, `rgba(0,0,0,${a * 0.5})`], [1, "rgba(0,0,0,0)"]]);
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** 书脊：歪一点、厚一点，书架上才不像彩色方块。 */
  function book(ctx, x, y, w, h, col, lean) {
    ctx.save();
    ctx.translate(x + w / 2, y + h);
    ctx.rotate(lean || 0);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(-w / 2 + 2, -h + 2, w, h);
    ctx.fillStyle = col; ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(-w / 2 + 1, -h + 2, 2, h - 4);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(-w / 2, -h + 5, w, 2);
    ctx.fillRect(-w / 2, -h * 0.18, w, 2);
    ctx.restore();
  }

  /** 一盆不用浇水的绿植。 */
  function plant(ctx, x, y, s, dark) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 5, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark ? "#3B2B22" : "#6B4B33";
    ctx.beginPath(); ctx.moveTo(-18, -2); ctx.lineTo(18, -2); ctx.lineTo(13, 12); ctx.lineTo(-13, 12); ctx.closePath(); ctx.fill();
    const leaves = [[-12, -26, -0.55], [0, -38, 0], [12, -28, 0.55], [-6, -18, -0.9], [7, -16, 0.9], [-18, -12, -1.2], [18, -10, 1.2]];
    for (const [dx, dy, a] of leaves) {
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(a);
      ctx.fillStyle = dark ? "#43573E" : "#4E8A5A";
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.beginPath(); ctx.ellipse(-2, -2, 2, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** 便签 / 纸条。 */
  function sticky(ctx, x, y, w, h, col, rot, txt, ink) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    ctx.fillStyle = col; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(-w / 2, -h / 2, w, 3);
    if (txt) {
      ctx.fillStyle = ink || "rgba(45,32,22,.72)"; ctx.font = `bold ${Math.round(h * 0.24)}px ${HAND}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, 0, 1);
    }
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  /** 一根垂下来的线：电源线 / 串灯 / 网线都行。 */
  function cable(ctx, x0, y0, x1, y1, sag, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w || 2;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + sag, x1, y1);
    ctx.stroke();
  }

  /** 椅背：只画上半截，下半截交给文本框。 */
  function chair(ctx, x, y, w, h, col, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(w * 0.1, h * 0.94, w * 0.52, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#201914";
    ctx.fillRect(-w / 2 + 8, h * 0.55, 10, h * 0.45);
    ctx.fillRect(w / 2 - 18, h * 0.55, 10, h * 0.45);
    ctx.fillStyle = col;
    rr(ctx, -w / 2, 0, w, h * 0.68, 22); ctx.fill();
    ctx.strokeStyle = "rgba(255,225,190,.13)"; ctx.lineWidth = 3;
    rr(ctx, -w / 2 + 2, 2, w - 4, h * 0.68 - 4, 20); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.06)"; rr(ctx, -w / 2 + 8, 8, w - 16, h * 0.6, 18); ctx.fill();
    // 中间的拉扣 / 折痕
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w * 0.18, 18); ctx.lineTo(-w * 0.18, h * 0.58); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.18, 18); ctx.lineTo(w * 0.18, h * 0.58); ctx.stroke();
    ctx.restore();
  }

  /** 小鲸鱼剪影：墙上 / 窗外 / 杯子上都用。 */
  function whale(ctx, x, y, s, col, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-34, 0); ctx.bezierCurveTo(-28, -18, 4, -22, 24, -7);
    ctx.bezierCurveTo(30, -17, 39, -20, 46, -15); ctx.bezierCurveTo(41, -4, 41, 4, 46, 15);
    ctx.bezierCurveTo(39, 20, 30, 17, 24, 7); ctx.bezierCurveTo(4, 22, -28, 18, -34, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.beginPath(); ctx.arc(-21, -5, 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** 橙色菊花：花心 + 一圈花瓣，画几十朵就是一片花圃。 */
  function chrysanthemum(ctx, x, y, s, col, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(s, s);
    ctx.fillStyle = col || "#D9773E";
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(9, 0, 9, 3.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = "#F2B544"; ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8E4B1F"; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** 海鱼：身体 + 尾巴 + 鳍，一条就够灵动。 */
  function fish(ctx, x, y, s, col, dir) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(dir < 0 ? -s : s, s);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-20, 0); ctx.quadraticCurveTo(-7, -12, 15, -5);
    ctx.quadraticCurveTo(24, -2, 27, 0); ctx.quadraticCurveTo(24, 2, 15, 5);
    ctx.quadraticCurveTo(-7, 12, -20, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-31, -10); ctx.lineTo(-29, 0); ctx.lineTo(-31, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath(); ctx.ellipse(2, -4, 10, 2.2, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(5,12,18,.8)";
    ctx.beginPath(); ctx.arc(19, -1.5, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

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
    drawStudyTrim(ctx, p);
  }

  /* 房间骨架上的"建筑细节"：护墙板、楼板梁、灯轨、地毯。
     画在窗 / 白板 / 书架之前，所以只会做底，不会挡道具。 */
  function drawStudyTrim(ctx, p) {
    const dark = p.sideFar;
    // 后墙分缝 + 腰线
    ctx.strokeStyle = "rgba(255,255,255,.045)"; ctx.lineWidth = 2;
    for (let x = ROOM.l + 60; x < ROOM.r; x += 92) {
      ctx.beginPath(); ctx.moveTo(x, ROOM.t + 20); ctx.lineTo(x, ROOM.b - 12); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.fillRect(ROOM.l, 300, ROOM.r - ROOM.l, 10);
    ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(ROOM.l, 300, ROOM.r - ROOM.l, 2);
    // 墙脚护板
    ctx.fillStyle = dark;
    ctx.fillRect(ROOM.l, ROOM.b - 48, ROOM.r - ROOM.l, 34);
    ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.fillRect(ROOM.l, ROOM.b - 48, ROOM.r - ROOM.l, 3);
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1;
    for (let x = ROOM.l + 36; x < ROOM.r; x += 76) {
      ctx.strokeRect(x, ROOM.b - 42, 66, 22);
    }
    // 侧墙护板：按透视拉斜
    for (const side of [0, 1]) {
      const f = side ? rw : lw;
      poly(ctx, [f(side ? 0.02 : 0.02, 0.78), f(0.9, 0.78), f(0.94, 0.9), f(0.02, 0.9)]);
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fill();
    }
    // 天花板梁 + 走过的线槽
    ctx.fillStyle = "rgba(0,0,0,.34)";
    ctx.fillRect(0, 36, W, 16);
    ctx.fillStyle = "rgba(255,255,255,.045)";
    ctx.fillRect(0, 36, W, 2);
    for (let x = 140; x < W; x += 300) {
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(x, 0, 18, 54);
      ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(x + 2, 0, 2, 54);
    }
    cable(ctx, 0, 54, 560, 60, 10, "rgba(10,10,12,.55)", 3);
    cable(ctx, 560, 60, 1040, 48, 6, "rgba(10,10,12,.5)", 2);
    cable(ctx, 1040, 48, W, 64, 12, "rgba(10,10,12,.45)", 2);
    // 吊灯轨道
    ctx.fillStyle = "rgba(20,18,16,.7)"; ctx.fillRect(360, 52, 880, 5);
    // 地毯：暗红 + 细边，露在桌子下面
    ctx.save();
    poly(ctx, [[420, 655], [1180, 655], [1340, 900], [260, 900]]); ctx.clip();
    ctx.fillStyle = "rgba(78,34,30,.32)"; ctx.fillRect(250, 650, 1100, 260);
    ctx.strokeStyle = "rgba(222,166,110,.12)"; ctx.lineWidth = 4;
    ctx.strokeRect(290, 675, 1020, 210);
    ctx.strokeStyle = "rgba(0,0,0,.16)"; ctx.lineWidth = 1;
    for (let x = 320; x < 1320; x += 46) { ctx.beginPath(); ctx.moveTo(x, 675); ctx.lineTo(x - 20, 885); ctx.stroke(); }
    ctx.restore();
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
      // 星与薄云
      for (let i = 0; i < 64; i++) {
        ctx.fillStyle = `rgba(220,230,255,${0.16 + r() * 0.55})`;
        ctx.fillRect(r() * ROOM.l, 55 + r() * 300, 1.4, 1.4);
      }
      ctx.fillStyle = "rgba(42,58,88,.20)";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.ellipse(40 + r() * 240, 120 + r() * 120, 60 + r() * 60, 8 + r() * 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#F4EFD8";
      ctx.beginPath(); ctx.arc(150, 170, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.sky[0];
      ctx.beginPath(); ctx.arc(162, 162, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,238,190,.08)";
      ctx.beginPath(); ctx.arc(150, 170, 60, 0, Math.PI * 2); ctx.fill();
      // 城市：楼群 + 零星的窗
      ctx.fillStyle = "#0A111F";
      for (let i = 0; i < 12; i++) {
        const bw = 16 + (i * 7) % 22, bh = 34 + ((i * 41) % 110);
        ctx.fillRect(10 + i * 24, 390 - bh, bw, bh);
      }
      const rr2 = rng(71);
      for (let i = 0; i < 34; i++) {
        ctx.fillStyle = `rgba(255,196,120,${0.16 + rr2() * 0.5})`;
        ctx.fillRect(14 + rr2() * 250, 292 + rr2() * 80, 2.2, 2.2);
      }
    } else {
      // 黄昏：从暖色地平线到冷色天顶
      ctx.fillStyle = lin(ctx, 0, 50, 0, 400, [[0, "rgba(80,108,150,.18)"], [0.58, "rgba(255,206,160,.18)"], [1, "rgba(255,225,190,.24)"]]);
      ctx.fillRect(0, 50, ROOM.l, 370);
      ctx.fillStyle = "rgba(255,246,220,.32)";
      ctx.beginPath(); ctx.arc(200, 250, 36, 0, Math.PI * 2); ctx.fill();
      // 远处的楼与云
      ctx.fillStyle = "rgba(255,255,255,.50)";
      [[90, 150, 40], [130, 140, 30], [170, 155, 34]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = "rgba(255,255,255,.28)";
      ctx.beginPath(); ctx.ellipse(60, 222, 70, 9, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(88,103,125,.55)";
      for (let i = 0; i < 10; i++) {
        const bw = 18 + (i * 9) % 30, bh = 50 + ((i * 31) % 130);
        ctx.fillRect(8 + i * 27, 392 - bh, bw, bh);
      }
      // 小小的人影 / 鸟
      ctx.strokeStyle = "rgba(50,60,74,.55)"; ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const bx = 105 + i * 13, by = 128 + (i % 2) * 8;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 4, by - 5, bx + 8, by); ctx.stroke();
      }
    }
    // 玻璃反光：斜着一条
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = lin(ctx, 60, 100, 210, 380, [[0, "rgba(255,255,255,.09)"], [1, "rgba(255,255,255,0)"]]);
    poly(ctx, [[40, 120], [92, 90], [250, 360], [198, 392]]); ctx.fill();
    ctx.restore();
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

  /* 窗帘、窗台上的小东西：把"一扇窗"变成"有人住的房间"。 */
  function drawWindowDressing(ctx, p, night) {
    // 窗帘杆
    const r0 = lw(0.08, 0.10), r1 = lw(0.9, 0.10);
    ctx.strokeStyle = night ? "#171D27" : "#3A2A1D"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(...r0); ctx.lineTo(...r1); ctx.stroke();
    ctx.fillStyle = night ? "#2C3443" : "#6B5137";
    ctx.beginPath(); ctx.arc(r0[0], r0[1], 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r1[0], r1[1], 7, 0, Math.PI * 2); ctx.fill();
    // 窗台：一盆小绿植 + 一只凉掉的杯子
    const p0 = lw(0.67, 0.56);
    plant(ctx, p0[0] - 6, p0[1] - 6, 0.96, night);
    const c0 = lw(0.25, 0.56);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(c0[0] + 4, c0[1] + 3, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = night ? "#3A4354" : "#E8E2D4";
    rr(ctx, c0[0] - 15, c0[1] - 24, 30, 27, 5); ctx.fill();
    ctx.strokeStyle = night ? "#4A5568" : "#CFC5B4"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(c0[0] + 16, c0[1] - 10, 8, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = "rgba(60,40,25,.45)";
    ctx.beginPath(); ctx.ellipse(c0[0], c0[1] - 24, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
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
    // 书架的顶线、侧板、几件不属于书的私人物品
    poly(ctx, [rw(u0, 0.22), rw(u1, 0.22), rw(u1, 0.235), rw(u0, 0.235)]);
    ctx.fillStyle = "#4A3426"; ctx.fill();
    poly(ctx, [rw(u1 - 0.02, 0.22), rw(u1, 0.22), rw(u1, 0.98), rw(u1 - 0.02, 0.98)]);
    ctx.fillStyle = "#352419"; ctx.fill();
    const top = rw(0.56, 0.20);
    plant(ctx, top[0], top[1] + 2, 0.9, empty);
    const wf = rw(0.36, 0.97);
    whale(ctx, wf[0], wf[1] - 30, 0.6, empty ? "#5A6370" : "#4D6BFE", false);
    // 两个收纳盒
    for (let i = 0; i < 2; i++) {
      const bx = rw(0.40 + i * 0.12, 0.66);
      ctx.fillStyle = i ? "#6B5A48" : "#4A5A6A";
      ctx.fillRect(bx[0] - 18, bx[1] - 20, 36, 22);
      ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(bx[0] - 16, bx[1] - 18, 32, 2);
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
    // 磁贴：不挡曲线和公式
    for (const [mx, my, mc] of [[x + 300, y + 14, "#D97757"], [x + 338, y + 14, "#4D6BFE"], [x + 376, y + 14, "#C9A227"]]) {
      ctx.fillStyle = mc; ctx.beginPath(); ctx.arc(mx, my, 4.2, 0, Math.PI * 2); ctx.fill();
    }
    // 玻璃反光
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = lin(ctx, x, y, x + 240, y + 120, [[0, "rgba(255,255,255,.10)"], [1, "rgba(255,255,255,0)"]]);
    poly(ctx, [[x + 18, y + 12], [x + 90, y + 12], [x + 30, y + h - 14], [x, y + h - 14]]); ctx.fill();
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
  const SCREENS = { ds: [430, 382, 240, 154], cl: [940, 382, 240, 154] };
  function drawMonitor(ctx, who, on, night) {
    const [x, y, w, h] = SCREENS[who];
    // 机身 + 支架 + 屏幕
    ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.fillRect(x - 8, y + 8, w + 28, h + 34);
    ctx.fillStyle = "#12151A"; rr(ctx, x - 13, y - 13, w + 26, h + 26, 8); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 2;
    rr(ctx, x - 13, y - 13, w + 26, h + 26, 8); ctx.stroke();
    ctx.fillStyle = "#242A32"; ctx.fillRect(x + w / 2 - 14, y + h + 13, 28, 28);
    ctx.fillStyle = "#161B21"; ctx.fillRect(x + w / 2 - 56, y + h + 40, 112, 9);
    ctx.fillStyle = "#0A0C10"; ctx.fillRect(x, y, w, h);
    if (!on) {
      ctx.fillStyle = "rgba(255,255,255,.035)";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.55, y); ctx.lineTo(x + w * 0.2, y + h); ctx.lineTo(x, y + h); ctx.fill();
      return;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (who === "ds") {
      ctx.fillStyle = "#08132F"; ctx.fillRect(x, y, w, h);
      // 细网格
      ctx.strokeStyle = "rgba(120,150,255,.10)"; ctx.lineWidth = 1;
      for (let gx = x + 12; gx < x + w; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
      for (let gy = y + 12; gy < y + h; gy += 20) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
      // 面板标题
      ctx.fillStyle = "#A8BCFF"; ctx.font = `600 11px ${MONO}`;
      ctx.fillText("deepseek / pretrain", x + 12, y + 18);
      ctx.fillStyle = "rgba(130,160,255,.55)"; ctx.font = `10px ${MONO}`;
      ctx.fillText("step 41,208   lr 2.6e-4", x + 12, y + 34);
      // 训练曲线
      ctx.strokeStyle = "#6F8BFF"; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const k = i / 60;
        const py = y + 44 + (h - 88) * (1 - Math.exp(-k * 3.1)) + Math.sin(k * 22) * 2.2 * (1 - k);
        const px = x + 12 + k * (w - 24);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 12, y + h - 34); ctx.lineTo(x + w - 12, y + h - 34); ctx.stroke();
      // 进度条
      ctx.fillStyle = "#18235A"; ctx.fillRect(x + 12, y + h - 25, w - 24, 7);
      ctx.fillStyle = "#4D6BFE"; ctx.fillRect(x + 12, y + h - 25, (w - 24) * 0.68, 7);
      ctx.fillStyle = "rgba(180,200,255,.55)"; ctx.font = `9px ${MONO}`;
      ctx.fillText("epoch 42 · loss 0.137", x + 12, y + h - 8);
      // 高光
      ctx.fillStyle = "rgba(255,255,255,.035)";
      poly(ctx, [[x, y], [x + w * 0.42, y], [x + w * 0.12, y + h], [x, y + h]]); ctx.fill();
    } else {
      ctx.fillStyle = "#14100E"; ctx.fillRect(x, y, w, h);
      ctx.font = `11px ${MONO}`;
      const lines = [
        ["#D97757", "✻ Welcome to Claude Code"],
        ["#8A7A70", "> cat notes.md"],
        ["#CFC3B8", "- 小鲸说：先想，再答"],
        ["#CFC3B8", "- 想错了就回头"],
        ["#D97757", "$"]
      ];
      lines.forEach(([c, s], i) => { ctx.fillStyle = c; ctx.fillText(s, x + 12, y + 24 + i * 21); });
      ctx.fillStyle = "rgba(255,255,255,.035)";
      poly(ctx, [[x, y], [x + w * 0.46, y], [x + w * 0.18, y + h], [x, y + h]]); ctx.fill();
      // 扫描线
      ctx.fillStyle = "rgba(255,255,255,.018)";
      for (let sy = y; sy < y + h; sy += 4) ctx.fillRect(x, sy, w, 1);
    }
    ctx.restore();
    // 屏幕内框阴影
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 3;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
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
    // 左桌的日常：笔记本、散页、耳机、手机
    ctx.save();
    ctx.translate(630, 590); ctx.rotate(-0.06);
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(4, 6, 92, 34);
    ctx.fillStyle = "#E7E1D4"; ctx.fillRect(0, 0, 92, 34);
    ctx.fillStyle = "#4D6BFE"; ctx.fillRect(0, 0, 5, 34);
    ctx.strokeStyle = "rgba(60,55,50,.35)"; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(12, 9 + i * 8); ctx.lineTo(74, 9 + i * 8); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = "rgba(220,210,192,.9)";
    ctx.save(); ctx.translate(500, 590); ctx.rotate(0.08); ctx.fillRect(-34, -12, 68, 26); ctx.restore();
    ctx.strokeStyle = "#2B2F37"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(365, 560, 18, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    ctx.fillStyle = "#2B2F37";
    ctx.beginPath(); ctx.ellipse(343, 570, 6, 11, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(388, 570, 6, 11, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#15181D"; rr(ctx, 720, 570, 34, 20, 3); ctx.fill();
    ctx.fillStyle = "rgba(130,170,230,.35)"; ctx.fillRect(724, 574, 26, 12);
    // 右桌：橙色小花、整齐的笔、茶
    ctx.fillStyle = "#6E4B36"; poly(ctx, [[1280, 526], [1308, 526], [1304, 548], [1284, 548]]); ctx.fill();
    ctx.strokeStyle = "#3E6B48"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(1295, 528); ctx.lineTo(1292, 488); ctx.moveTo(1294, 500); ctx.lineTo(1280, 486); ctx.stroke();
    chrysanthemum(ctx, 1291, 482, 0.65, "#D9773E", 0.2);
    ctx.fillStyle = "#343A44"; rr(ctx, 1222, 574, 38, 20, 3); ctx.fill();
    ctx.fillStyle = "#D9DDE4"; rr(ctx, 1234, 548, 8, 28, 3); ctx.fill();
    ctx.fillStyle = "#D97757"; rr(ctx, 1245, 552, 8, 24, 3); ctx.fill();
    ctx.fillStyle = "#F2EEE6"; rr(ctx, 1322, 570, 34, 26, 5); ctx.fill();
    ctx.fillStyle = "#6B4B33"; ctx.beginPath(); ctx.ellipse(1339, 570, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 桌面下的抽屉
    ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.fillRect(330, 620, 330, 48);
    ctx.fillStyle = "#5B3D28"; ctx.fillRect(342, 628, 306, 34);
    ctx.fillStyle = "#D8C8AE"; ctx.fillRect(480, 644, 30, 3);
    ctx.fillStyle = "rgba(0,0,0,.20)"; ctx.fillRect(930, 620, 330, 48);
    ctx.fillStyle = "#5B3D28"; ctx.fillRect(942, 628, 306, 34);
    ctx.fillStyle = "rgba(255,230,190,.10)"; ctx.fillRect(942, 628, 306, 3);
    ctx.fillStyle = "#D8C8AE"; ctx.fillRect(1078, 644, 30, 3);
    // 地上 / 桌脚的电源线
    cable(ctx, 610, 620, 780, 690, 26, "rgba(10,12,15,.6)", 3);
    cable(ctx, 1080, 620, 850, 700, 30, "rgba(10,12,15,.5)", 2);
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
        drawWindowDressing(ctx, p, night);
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
          // 扫描线：很淡地往下走，屏幕才像活的
          ctx.save();
          ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
          ctx.fillStyle = "rgba(255,255,255,.025)";
          ctx.fillRect(x, y + ((t * 26) % h), w, 1.5);
          ctx.restore();
          if (who === "cl" && Math.floor(t * 1.6) % 2 === 0) {     // 终端光标：$ 之后空一格
            ctx.fillStyle = "#D97757"; ctx.fillRect(x + 24, y + 101, 7, 11);
          }
        }
        // 灯下 / 窗光里的浮尘：只在亮处才看得见
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 22; i++) {
          const sx = 250 + ((i * 149 + t * (9 + i % 4)) % 760);
          const sy = 150 + ((i * 83 + t * (4 + i % 3)) % 380);
          const a = 0.035 + 0.025 * Math.sin(t * 1.3 + i);
          ctx.fillStyle = `rgba(255,241,214,${a})`;
          ctx.beginPath(); ctx.arc(sx, sy, 1.4 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill();
        }
        // 夜里灯泡会轻轻喘一口气
        if (night) {
          const fl = 0.18 + 0.025 * Math.sin(t * 2.2) + (Math.sin(t * 17) > 0.994 ? -0.09 : 0);
          ctx.fillStyle = rad(ctx, 800, 62, 4, 70, [[0, `rgba(255,220,160,${fl})`], [1, "rgba(255,220,160,0)"]]);
          ctx.fillRect(720, 0, 160, 140);
        }
        ctx.restore();
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

  /* 走廊的地砖 / 地毯 / 拱肋 / 壁灯：把一条平铺的走廊压出纵深。 */
  function drawCorridorDetail(ctx, red) {
    const floor = [[470, 630], [1130, 630], [1600, 900], [0, 900]];
    // 棋盘地砖：一行一行按透视压缩
    ctx.save();
    poly(ctx, floor); ctx.clip();
    for (let row = 0; row < 8; row++) {
      const d0 = Math.pow(row / 8, 1.45), d1 = Math.pow((row + 1) / 8, 1.45);
      const y0 = 630 + 270 * d0, y1 = 630 + 270 * d1;
      const half0 = 330 + 470 * d0, half1 = 330 + 470 * d1;
      const cols = 12;
      for (let c = 0; c < cols; c++) {
        if ((row + c) % 2) continue;
        const x00 = 800 - half0 + (c / cols) * half0 * 2;
        const x01 = 800 - half0 + ((c + 1) / cols) * half0 * 2;
        const x10 = 800 - half1 + (c / cols) * half1 * 2;
        const x11 = 800 - half1 + ((c + 1) / cols) * half1 * 2;
        poly(ctx, [[x00, y0], [x01, y0], [x11, y1], [x10, y1]]);
        ctx.fillStyle = red ? "rgba(90,26,28,.18)" : "rgba(255,255,255,.035)"; ctx.fill();
      }
    }
    // 中央地毯：暗红 + 磨损的金边
    poly(ctx, [[665, 630], [935, 630], [1130, 900], [470, 900]]);
    ctx.fillStyle = red ? "rgba(56,14,16,.48)" : "rgba(76,30,28,.42)"; ctx.fill();
    ctx.strokeStyle = red ? "rgba(255,110,90,.14)" : "rgba(213,165,104,.20)"; ctx.lineWidth = 4;
    poly(ctx, [[680, 638], [920, 638], [1090, 890], [510, 890]]); ctx.stroke();
    ctx.restore();
    // 两侧护墙板：几块深色木饰，别让墙一直空着
    for (const side of [0, 1]) {
      const f = side ? cr : cl;
      for (const [u0, u1] of [[0.03, 0.24], [0.49, 0.64], [0.86, 0.98]]) {
        poly(ctx, [f(u0, 0.34), f(u1, 0.34), f(u1, 0.82), f(u0, 0.82)]);
        ctx.fillStyle = red ? "rgba(70,22,22,.18)" : "rgba(48,38,28,.22)"; ctx.fill();
        ctx.strokeStyle = red ? "rgba(180,70,60,.12)" : "rgba(214,188,150,.10)"; ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // 拱肋
    ctx.strokeStyle = red ? "rgba(120,50,48,.24)" : "rgba(190,200,216,.10)";
    ctx.lineWidth = 9;
    for (let k = 0; k < 4; k++) {
      const u = 0.18 + k * 0.2;
      const y = lerp(0, CORR.t, u) + 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(800, y + 140, 1600, y); ctx.stroke();
    }
    // 踢脚线
    ctx.strokeStyle = red ? "rgba(160,60,55,.20)" : "rgba(230,225,210,.10)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 690); ctx.lineTo(CORR.l, CORR.b); ctx.moveTo(W, 690); ctx.lineTo(CORR.r, CORR.b); ctx.stroke();
    // 两侧壁灯：黄铜座 + 一小团暖光
    for (const side of [0, 1]) {
      for (const u of [0.42, 0.7]) {
        const f = side ? cr : cl;
        const a = f(u, 0.30), b = f(u, 0.34);
        ctx.strokeStyle = red ? "#5A2A24" : "#7A5B36"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], b[1]); ctx.stroke();
        ctx.fillStyle = red ? "rgba(255,100,80,.8)" : "rgba(255,214,150,.92)";
        ctx.beginPath(); ctx.ellipse(a[0], a[1], 5, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rad(ctx, a[0], a[1], 2, 60, [[0, red ? "rgba(255,70,50,.18)" : "rgba(255,190,120,.20)"], [1, "rgba(0,0,0,0)"]]);
        ctx.fillRect(a[0] - 60, a[1] - 60, 120, 120);
        ctx.restore();
      }
    }
    // 尽头的雾：门后好像还有更深的房间
    ctx.fillStyle = rad(ctx, 800, 470, 20, 380, [[0, red ? "rgba(255,80,60,.10)" : "rgba(255,210,160,.14)"], [1, "rgba(0,0,0,0)"]]);
    ctx.fillRect(380, 80, 840, 720);
  }

  function drawDoor(ctx) {
    const { x, y, w, h } = DOOR;
    // 门套：外层石框 + 内层木饰
    ctx.fillStyle = "#211A15"; ctx.fillRect(x - 34, y - 34, w + 68, h + 34);
    ctx.strokeStyle = "rgba(226,198,155,.14)"; ctx.lineWidth = 3;
    ctx.strokeRect(x - 26, y - 26, w + 52, h + 26);
    ctx.fillStyle = "#3B2A20"; ctx.fillRect(x - 14, y - 14, w + 28, h + 14);
    // 门板 + 竖向木纹
    ctx.fillStyle = lin(ctx, x, 0, x + w, 0, [[0, "#674A34"], [0.35, "#7F5F43"], [0.7, "#6F5038"], [1, "#4F3828"]]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(40,24,14,.22)"; ctx.lineWidth = 2;
    for (let px = x + 18; px < x + w; px += 26) { ctx.beginPath(); ctx.moveTo(px, y + 8); ctx.lineTo(px, y + h - 6); ctx.stroke(); }
    // 上 / 下两块浮雕门芯
    for (const [py, ph] of [[y + 28, 168], [y + 226, 200]]) {
      ctx.fillStyle = "rgba(24,14,8,.26)"; ctx.fillRect(x + 28, py, w - 56, ph);
      ctx.strokeStyle = "rgba(236,204,156,.22)"; ctx.lineWidth = 3;
      ctx.strokeRect(x + 34, py + 6, w - 68, ph - 12);
      ctx.strokeStyle = "rgba(22,12,6,.42)"; ctx.lineWidth = 2;
      ctx.strokeRect(x + 40, py + 12, w - 80, ph - 24);
      // 四角雕花
      for (const [cx, cy] of [[x + 50, py + 22], [x + w - 50, py + 22], [x + 50, py + ph - 22], [x + w - 50, py + ph - 22]]) {
        ctx.fillStyle = "rgba(203,166,104,.20)";
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 左侧铁铰链
    for (const hy of [y + 96, y + 300, y + 438]) {
      ctx.fillStyle = "#2A2620"; ctx.fillRect(x + 8, hy - 7, 72, 14);
      ctx.fillStyle = "rgba(224,198,150,.18)"; ctx.fillRect(x + 10, hy - 6, 66, 2);
      ctx.beginPath(); ctx.arc(x + 16, hy, 4, 0, Math.PI * 2); ctx.fillStyle = "#151310"; ctx.fill();
    }
    // 黄铜把手 / 锁孔
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(x + w - 44, y + 260, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#B99654"; ctx.beginPath(); ctx.arc(x + w - 48, y + 256, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6B5430"; ctx.beginPath(); ctx.arc(x + w - 48, y + 256, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#C9A227"; rr(ctx, x + w - 74, y + 278, 34, 10, 5); ctx.fill();
    ctx.fillStyle = "#15110C"; ctx.beginPath(); ctx.arc(x + w - 48, y + 310, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x + w - 50, y + 310, 4, 12);
    // 门牌：Claude + 一张小鲸鱼贴纸
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x + 90, y + 74, 130, 42);
    ctx.fillStyle = "#E9E3D6"; rr(ctx, x + 85, y + 70, 130, 40, 5); ctx.fill();
    ctx.strokeStyle = "rgba(110,85,60,.5)"; ctx.lineWidth = 2; rr(ctx, x + 85, y + 70, 130, 40, 5); ctx.stroke();
    ctx.fillStyle = "#3A2C22"; ctx.font = `600 22px ${SERIF}`; ctx.textAlign = "center";
    ctx.fillText("Claude", x + 150, y + 98); ctx.textAlign = "left";
    whale(ctx, x + 236, y + 96, 0.7, "#4D6BFE", false);
    // 门槛 / 门缝漏出来的光
    ctx.fillStyle = "#1B130D"; ctx.fillRect(x - 8, y + h, w + 16, 14);
    ctx.fillStyle = "rgba(255,198,130,.25)"; ctx.fillRect(x + 2, y + h - 2, w - 4, 3);
    // 底部的划痕
    ctx.strokeStyle = "rgba(225,200,165,.13)"; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const sx = x + 20 + (i * 37) % (w - 40);
      ctx.beginPath(); ctx.moveTo(sx, y + h - 60 + (i % 3) * 12); ctx.lineTo(sx + 12, y + h - 42 + (i % 2) * 8); ctx.stroke();
    }
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

  /* 403 之后的狼藉：墙上的错误页、封条、地上的纸和烟。 */
  function drawForbiddenDebris(ctx) {
    const r = rng(4031);
    // 墙上 / 地上的纸
    for (let i = 0; i < 18; i++) {
      const x = 80 + r() * 1440, y = 120 + r() * 700;
      ctx.save(); ctx.translate(x, y); ctx.rotate((r() - 0.5) * 0.9);
      ctx.fillStyle = `rgba(236,222,214,${0.12 + r() * 0.2})`;
      ctx.fillRect(-30, -20, 60, 40);
      ctx.fillStyle = "rgba(217,58,43,.55)"; ctx.fillRect(-30, -20, 60, 6);
      ctx.fillStyle = "rgba(80,40,38,.45)"; ctx.font = `10px ${MONO}`;
      ctx.fillText("403", -24, 10);
      ctx.restore();
    }
    // 黄黑封条：只贴在门口和地面，别像飘带一样横穿画面
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(470 + i * 330, 748 + (i % 2) * 26);
      ctx.rotate(i % 2 ? -0.10 : 0.08);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(214,174,45,.75)"; ctx.fillRect(-100, -6, 200, 12);
      ctx.fillStyle = "rgba(40,30,20,.65)";
      for (let k = -92; k < 100; k += 24) ctx.fillRect(k, -6, 10, 12);
      ctx.restore();
    }
    // 地上的裂缝 / 碎玻璃
    ctx.strokeStyle = "rgba(255,90,70,.14)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const x = 100 + r() * 1400, y = 700 + r() * 180;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + r() * 60, y + 12 + r() * 24); ctx.stroke();
    }
    // 烟：低透明的大块椭圆，压在门口
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 8; i++) {
      const x = 560 + r() * 480, y = 560 + r() * 220;
      ctx.fillStyle = rad(ctx, x, y, 4, 90 + r() * 70, [[0, "rgba(160,60,50,.08)"], [1, "rgba(160,60,50,0)"]]);
      ctx.fillRect(x - 160, y - 160, 320, 320);
    }
    ctx.restore();
  }

  const corridor = {
    tone: "cold",
    draw(ctx) {
      drawCorridorShell(ctx, false);
      drawCorridorDetail(ctx, false);
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
      // 壁灯偶尔抖一下
      if (Math.sin(t * 23) > 0.992) {
        ctx.fillStyle = "rgba(255,190,120,.08)"; ctx.fillRect(0, 140, W, 420);
      }
      // 空气里的浮尘
      for (let i = 0; i < 28; i++) {
        const x = (i * 193 + t * (5 + i % 4)) % W;
        const y = 120 + ((i * 97 + t * (3 + i % 3)) % 560);
        ctx.fillStyle = `rgba(255,226,190,${0.025 + 0.02 * Math.sin(t + i)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  };

  const forbidden = {
    tone: "red",
    draw(ctx) {
      drawCorridorShell(ctx, true);
      drawCorridorDetail(ctx, true);
      ctx.fillStyle = rad(ctx, 800, 420, 40, 760, [[0, "rgba(217,58,43,.35)"], [1, "rgba(217,58,43,0)"]]);
      ctx.fillRect(0, 0, W, H);
      drawForbiddenDoor(ctx);
      drawForbiddenDebris(ctx);
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
      // 从门缝里渗出来的烟：慢慢往上升
      for (let i = 0; i < 7; i++) {
        const x = 620 + i * 58 + Math.sin(t * 0.5 + i) * 20;
        const y = 600 - ((t * (7 + i % 3) + i * 42) % 260);
        ctx.fillStyle = rad(ctx, x, y, 2, 70, [[0, `rgba(170,72,60,${0.035 + 0.015 * Math.sin(t + i)})`], [1, "rgba(170,72,60,0)"]]);
        ctx.fillRect(x - 80, y - 80, 160, 160);
      }
      // 应急灯扫过地面
      const sweep = (t * 0.16) % 1;
      ctx.fillStyle = lin(ctx, 0, 720, W, 720, [[0, "rgba(217,58,43,0)"], [sweep * 0.8, "rgba(217,58,43,0)"], [Math.min(1, sweep * 0.8 + 0.2), "rgba(255,80,60,.10)"], [1, "rgba(217,58,43,0)"]]);
      ctx.fillRect(0, 690, W, 210);
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

  const deskLegacy = {
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
   *  DeepSeek 的家：desk —— 深海窗、白饭、训练屏
   *  她想变强，但先得把饭吃完。
   * ============================================================ */
  const SEA_WIN = { x: 56, y: 52, w: 704, h: 512 };
  function seaWindowPath(ctx) {
    const { x, y, w, h } = SEA_WIN;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + 208);
    ctx.quadraticCurveTo(x, y, x + w / 2, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 208);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  function drawSeaWindow(ctx) {
    const { x, y, w, h } = SEA_WIN;
    // 窗外的深海
    ctx.save();
    seaWindowPath(ctx); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, "#1D6A88"], [0.32, "#0D425E"], [0.7, "#06243A"], [1, "#020C17"]]);
    ctx.fillRect(x, y, w, h);
    // 从水面打下来的光
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const sun = rad(ctx, x + w * 0.44, y + 20, 10, 420, [[0, "rgba(190,246,255,.52)"], [0.4, "rgba(120,210,235,.15)"], [1, "rgba(60,140,190,0)"]]);
    ctx.fillStyle = sun; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 7; i++) {
      const ox = x + 100 + i * 78 + Math.sin(i * 2.1) * 30;
      ctx.fillStyle = lin(ctx, ox, y, ox + 70, y + h, [[0, "rgba(200,250,255,.12)"], [1, "rgba(120,210,235,0)"]]);
      poly(ctx, [[ox, y], [ox + 34, y], [ox + 128, y + h], [ox + 78, y + h]]); ctx.fill();
    }
    ctx.restore();
    // 远处的礁石 / 珊瑚
    ctx.fillStyle = "#031521";
    ctx.beginPath();
    ctx.moveTo(x, y + h - 40);
    for (let i = 0; i <= 12; i++) {
      const px = x + (i / 12) * w;
      const py = y + h - 50 - (i % 3 === 0 ? 74 : 24) - Math.sin(i * 1.7) * 18;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    const r = rng(2027);
    for (let i = 0; i < 9; i++) {
      const cx = x + 30 + r() * (w - 60), cy = y + h - 40 - r() * 90;
      ctx.strokeStyle = ["#2E6B62", "#6A4B55", "#3C5A76", "#8A5A45"][i % 4];
      ctx.lineWidth = 3 + r() * 4;
      ctx.beginPath(); ctx.moveTo(cx, cy + 60);
      ctx.quadraticCurveTo(cx - 20 + r() * 40, cy, cx + 12 - r() * 24, cy - 30 - r() * 50);
      ctx.stroke();
      if (i % 3 === 0) {
        for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.arc(cx + 8 + k * 6, cy - k * 12, 2 + k, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(110,210,205,.35)"; ctx.fill();
        }
      }
    }
    // 海草：随水流弯
    for (let i = 0; i < 12; i++) {
      const gx = x + 20 + i * 56, gh = 80 + (i * 37) % 140;
      ctx.strokeStyle = i % 2 ? "rgba(54,118,88,.55)" : "rgba(38,92,86,.62)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(gx, y + h - 12);
      ctx.bezierCurveTo(gx - 18, y + h - gh * 0.4, gx + 22, y + h - gh * 0.72, gx - 4, y + h - gh);
      ctx.stroke();
    }
    // 远处的小鱼群（暗色剪影）
    for (let i = 0; i < 16; i++) {
      const fx = x + 80 + r() * (w - 120), fy = y + 120 + r() * (h - 210);
      fish(ctx, fx, fy, 0.35 + r() * 0.25, "rgba(135,205,220,.25)", r() < 0.5 ? 1 : -1);
    }
    // 玻璃里的气泡 / 反光
    const rr2 = rng(221);
    for (let i = 0; i < 16; i++) {
      ctx.strokeStyle = "rgba(200,245,255,.22)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + 20 + rr2() * (w - 40), y + 40 + rr2() * (h - 80), 2 + rr2() * 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = lin(ctx, x + 40, y + 60, x + 320, y + 480, [[0, "rgba(255,255,255,.10)"], [1, "rgba(255,255,255,0)"]]);
    poly(ctx, [[x + 40, y + 40], [x + 130, y + 40], [x + 360, y + h], [x + 250, y + h]]); ctx.fill();
    ctx.restore();
    // 黄铜窗框 + 铆钉
    ctx.strokeStyle = "#B0874A"; ctx.lineWidth = 18;
    seaWindowPath(ctx); ctx.stroke();
    ctx.strokeStyle = "#E0B877"; ctx.lineWidth = 4;
    seaWindowPath(ctx); ctx.stroke();
    ctx.strokeStyle = "rgba(44,28,16,.65)"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x + w / 2, y + 8); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 6, y + 318); ctx.lineTo(x + w - 6, y + 318); ctx.stroke();
    ctx.strokeStyle = "rgba(224,184,119,.8)"; ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const bx = x + 30 + i * 49;
      ctx.beginPath(); ctx.arc(bx, y + h - 12, 3.4, 0, Math.PI * 2); ctx.stroke();
    }
    // 窗台
    ctx.fillStyle = "#3A2A20"; ctx.fillRect(x - 26, y + h + 4, w + 52, 20);
    ctx.fillStyle = "rgba(255,220,170,.18)"; ctx.fillRect(x - 26, y + h + 4, w + 52, 3);
  }

  function drawSeaWall(ctx) {
    // 墙：深蓝护墙板 + 一点点木纹
    ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#071925"], [0.5, "#0A2130"], [1, "#041019"]]);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(160,225,240,.045)"; ctx.lineWidth = 2;
    for (let x = 24; x < W; x += 84) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 610); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(0, 588, W, 12);
    ctx.fillStyle = "rgba(160,225,240,.05)"; ctx.fillRect(0, 588, W, 2);
    // 天花板垂下来的串灯
    ctx.strokeStyle = "rgba(8,12,16,.75)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 42); ctx.quadraticCurveTo(420, 96, 840, 42); ctx.quadraticCurveTo(1240, 8, 1600, 58); ctx.stroke();
    const bulbs = [[110, 62], [250, 82], [390, 90], [530, 84], [670, 70], [810, 48], [980, 38], [1140, 48], [1300, 44], [1460, 54]];
    for (const [bx, by] of bulbs) {
      ctx.fillStyle = "rgba(255,196,120,.9)";
      ctx.beginPath(); ctx.arc(bx, by + 6, 3.6, 0, Math.PI * 2); ctx.fill();
    }
    // 右边：便签墙 + 一张小照片
    ctx.fillStyle = "rgba(18,36,46,.62)"; ctx.fillRect(1364, 90, 208, 396);
    ctx.strokeStyle = "rgba(160,225,240,.08)"; ctx.lineWidth = 2; ctx.strokeRect(1364, 90, 208, 396);
    sticky(ctx, 1408, 132, 58, 48, "#E9C46A", -0.08, "余额 3.7", "rgba(40,30,18,.7)");
    sticky(ctx, 1498, 152, 62, 54, "#F4A261", 0.06, "变强", "rgba(55,28,14,.7)");
    sticky(ctx, 1416, 240, 56, 48, "#9AB8FF", -0.04, "小克", "rgba(24,34,64,.7)");
    sticky(ctx, 1502, 260, 58, 50, "#90BE6D", 0.07, "TODO", "rgba(24,44,24,.7)");
    sticky(ctx, 1416, 352, 62, 48, "#E8E3D6", -0.05, "吃饭", "rgba(46,34,22,.7)");
    // 相框：Claude 的橙色拍立得
    ctx.save(); ctx.translate(1504, 370); ctx.rotate(0.06);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(-2, 3, 70, 84);
    ctx.fillStyle = "#EDE6D8"; ctx.fillRect(-6, 0, 70, 84);
    ctx.fillStyle = "#D97757"; ctx.fillRect(0, 6, 58, 54);
    ctx.fillStyle = "#F6E3D2"; ctx.font = `11px ${HAND}`; ctx.textAlign = "center"; ctx.fillText("小克", 29, 74);
    ctx.restore(); ctx.textAlign = "left";
    // 小书架 + 绿植
    ctx.fillStyle = "#1A2B33"; ctx.fillRect(1340, 500, 238, 14);
    for (let i = 0; i < 6; i++) {
      book(ctx, 1356 + i * 18, 468, 15, 34 + (i % 3) * 8, ["#7A3B2E", "#2F4A6B", "#5E6B3A", "#8C6A3B", "#4B3A5E", "#35556B"][i], (i % 2 ? -0.05 : 0.04));
    }
    plant(ctx, 1534, 500, 0.92, false);
  }

  function drawSeaDesk(ctx) {
    // 桌面
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, 614); ctx.lineTo(W, 584); ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 600, 0, H, [[0, "#4B392E"], [0.32, "#33251C"], [1, "#150E0A"]]); ctx.fill();
    ctx.strokeStyle = "rgba(255,225,180,.10)"; ctx.lineWidth = 2;
    for (let k = 1; k < 8; k++) {
      const y = 608 + k * 27;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - 22); ctx.stroke();
    }
    ctx.fillStyle = "#1A100B"; ctx.fillRect(0, H - 20, W, 20);
    // 桌面边缘高光
    ctx.fillStyle = "rgba(240,206,156,.22)"; ctx.fillRect(0, 612, W, 3);
    // 桌下阴影
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.fillRect(0, 742, W, 20);
  }

  function drawSeaMonitor(ctx) {
    const mx = 900, my = 190, mw = 456, mh = 348;
    // 支架 / 底座
    ctx.fillStyle = "rgba(0,0,0,.30)";
    ctx.beginPath(); ctx.ellipse(mx + mw / 2, 602, 160, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#19262C"; ctx.fillRect(mx + mw / 2 - 22, my + mh + 12, 44, 46);
    ctx.fillStyle = "#22343B"; rr(ctx, mx + mw / 2 - 122, my + mh + 54, 244, 18, 7); ctx.fill();
    // 机身
    ctx.fillStyle = "#0A0F12"; rr(ctx, mx - 18, my - 18, mw + 36, mh + 36, 12); ctx.fill();
    ctx.strokeStyle = "rgba(170,230,240,.12)"; ctx.lineWidth = 2;
    rr(ctx, mx - 18, my - 18, mw + 36, mh + 36, 12); ctx.stroke();
    ctx.fillStyle = "#06111A"; ctx.fillRect(mx, my, mw, mh);
    // 屏幕：深色 IDE
    ctx.save();
    ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
    ctx.fillStyle = "rgba(30,85,100,.18)"; ctx.fillRect(mx, my, mw, mh);
    // 顶栏
    ctx.fillStyle = "rgba(10,30,38,.92)"; ctx.fillRect(mx, my, mw, 34);
    ctx.fillStyle = "#7FE1D0"; ctx.font = `600 13px ${MONO}`;
    ctx.fillText("deepseek / train", mx + 16, my + 22);
    ctx.fillStyle = "rgba(150,230,210,.45)"; ctx.font = `11px ${MONO}`;
    ctx.fillText("GPU 0 · 98%", mx + mw - 106, my + 22);
    // 左：日志
    ctx.font = `12px ${MONO}`;
    const logs = [
      ["rgba(120,210,200,.75)", "$ deepseek train --config sft.yaml"],
      ["rgba(130,160,190,.55)", "loading 41,208 steps..."],
      ["rgba(160,230,210,.68)", "step 41208  loss 0.283"],
      ["rgba(160,230,210,.68)", "step 41209  loss 0.281"],
      ["rgba(130,160,190,.55)", "checkpoint saved."],
      ["rgba(224,185,120,.8)", "> next token  _"]
    ];
    logs.forEach(([c, s], i) => { ctx.fillStyle = c; ctx.fillText(s, mx + 18, my + 62 + i * 22); });
    // 右：loss 曲线
    const cx = mx + 292, cy = my + 68, cw = 140, ch = 118;
    ctx.strokeStyle = "rgba(120,220,220,.12)"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(cx, cy + i * ch / 4); ctx.lineTo(cx + cw, cy + i * ch / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + i * cw / 4, cy); ctx.lineTo(cx + i * cw / 4, cy + ch); ctx.stroke();
    }
    ctx.strokeStyle = "#73E0D2"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      const px = cx + k * cw, py = cy + 12 + (ch - 24) * (1 - Math.exp(-k * 3.6)) + Math.sin(k * 20) * 1.6 * (1 - k);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(180,250,240,.55)"; ctx.font = `10px ${MONO}`;
    ctx.fillText("loss", cx + 2, cy - 6);
    // 底部进度
    ctx.fillStyle = "rgba(20,50,60,.9)"; ctx.fillRect(mx + 18, my + mh - 46, mw - 36, 9);
    ctx.fillStyle = "#4FC6C0"; ctx.fillRect(mx + 18, my + mh - 46, (mw - 36) * 0.72, 9);
    ctx.fillStyle = "rgba(170,230,225,.58)"; ctx.font = `11px ${MONO}`;
    ctx.fillText("epoch 42 · loss 0.137 · lr 2.6e-4", mx + 18, my + mh - 18);
    ctx.restore();
    // 显示器边框上的小贴纸（别挡屏幕内容）
    whale(ctx, mx + mw - 34, my + 40, 0.55, "#2B5B78", false);
    // 屏幕辉光
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rad(ctx, mx + mw / 2, my + mh / 2, 30, 360, [[0, "rgba(70,180,190,.18)"], [1, "rgba(70,180,190,0)"]]);
    ctx.fillRect(mx - 200, my - 160, mw + 400, mh + 320);
    ctx.restore();
    // 屏幕反光
    ctx.fillStyle = "rgba(255,255,255,.035)";
    poly(ctx, [[mx, my], [mx + 130, my], [mx + 40, my + mh], [mx, my + mh]]); ctx.fill();
  }

  function drawRice(ctx) {
    const bx = 334, by = 626;
    shade(ctx, bx + 8, by + 24, 146, 26, 0.35);
    // 碗
    ctx.beginPath(); ctx.moveTo(bx - 136, by); ctx.quadraticCurveTo(bx, by + 136, bx + 136, by); ctx.closePath();
    ctx.fillStyle = lin(ctx, bx - 120, by, bx + 120, by + 110, [[0, "#E7E1D2"], [0.55, "#CFC5B1"], [1, "#9D927E"]]); ctx.fill();
    ctx.strokeStyle = "rgba(80,60,40,.35)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(bx, by, 136, 30, 0, 0, Math.PI * 2); ctx.fillStyle = "#F1ECDF"; ctx.fill();
    ctx.strokeStyle = "#4D6BFE"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(bx, by, 122, 25, 0, 0, Math.PI * 2); ctx.stroke();
    // 饭堆
    ctx.beginPath(); ctx.moveTo(bx - 102, by - 8);
    ctx.quadraticCurveTo(bx - 84, by - 92, bx, by - 98);
    ctx.quadraticCurveTo(bx + 84, by - 92, bx + 102, by - 8); ctx.closePath();
    ctx.fillStyle = "#F8F5EB"; ctx.fill();
    ctx.strokeStyle = "rgba(160,145,120,.22)"; ctx.lineWidth = 1.5; ctx.stroke();
    const r = rng(37);
    ctx.fillStyle = "rgba(214,206,188,.8)";
    for (let i = 0; i < 34; i++) {
      const rr2 = 18 + r() * 66;
      ctx.beginPath(); ctx.ellipse(bx - 88 + r() * 176, by - 8 - rr2 * 0.6, 3.2, 1.8, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    // 煎蛋
    ctx.fillStyle = "#F3E9D2"; ctx.beginPath(); ctx.ellipse(bx + 18, by - 88, 38, 22, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#E9B949"; ctx.beginPath(); ctx.arc(bx + 20, by - 88, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.arc(bx + 15, by - 93, 4, 0, Math.PI * 2); ctx.fill();
    // 筷子：搭在碗沿
    ctx.save(); ctx.translate(bx + 112, by - 8); ctx.rotate(0.18);
    ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, 8, 12, 188, 11, 5); ctx.fill();
    ctx.fillStyle = "#4A3524"; rr(ctx, 0, -4, 188, 8, 4); ctx.fill();
    ctx.fillStyle = "#6B4C33"; rr(ctx, 0, 9, 188, 8, 4); ctx.fill();
    ctx.restore();
    // 小碟：咸菜 + 酱油
    ctx.fillStyle = "#D8D2C2"; ctx.beginPath(); ctx.ellipse(520, 610, 52, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6E7F4A"; ctx.beginPath(); ctx.ellipse(514, 606, 28, 7, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2A1C12"; rr(ctx, 590, 566, 22, 46, 4); ctx.fill();
    ctx.fillStyle = "#C9A227"; rr(ctx, 590, 564, 22, 9, 3); ctx.fill();
  }

  function drawSeaProps(ctx) {
    // 笔记本 + 笔
    ctx.save(); ctx.translate(660, 608); ctx.rotate(-0.06);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(4, 6, 192, 56);
    ctx.fillStyle = "#E6E0D2"; ctx.fillRect(0, 0, 192, 56);
    ctx.fillStyle = "#4D6BFE"; ctx.fillRect(0, 0, 7, 56);
    ctx.strokeStyle = "rgba(60,55,50,.35)"; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(18, 13 + i * 9); ctx.lineTo(172, 13 + i * 9); ctx.stroke(); }
    ctx.fillStyle = "rgba(45,38,30,.72)"; ctx.font = `16px ${HAND}`; ctx.fillText("下一步……", 24, 28);
    ctx.restore();
    ctx.save(); ctx.translate(822, 622); ctx.rotate(0.12);
    ctx.fillStyle = "#2C3A48"; rr(ctx, 0, 0, 118, 9, 4); ctx.fill();
    ctx.fillStyle = "#C9A227"; rr(ctx, 110, 0, 12, 9, 3); ctx.fill();
    ctx.restore();
    // 马克杯
    const mgx = 786, mgy = 552;
    shade(ctx, mgx + 42, mgy + 76, 58, 11, 0.3);
    ctx.strokeStyle = "#2F3B52"; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(mgx + 80, mgy + 18);
    ctx.bezierCurveTo(mgx + 114, mgy + 22, mgx + 114, mgy + 56, mgx + 80, mgy + 60); ctx.stroke();
    ctx.fillStyle = "#2F3B52"; rr(ctx, mgx, mgy, 86, 74, 8); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.08)"; rr(ctx, mgx + 8, mgy + 8, 14, 56, 6); ctx.fill();
    whale(ctx, mgx + 40, mgy + 40, 0.5, "#6F91FF", false);
    // 耳机
    ctx.strokeStyle = "#1A2229"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(1430, 566, 46, Math.PI * 0.92, Math.PI * 2.08); ctx.stroke();
    ctx.fillStyle = "#25313B";
    ctx.beginPath(); ctx.ellipse(1388, 576, 14, 28, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1472, 576, 14, 28, -0.1, 0, Math.PI * 2); ctx.fill();
    // 台灯
    ctx.fillStyle = "#2A2019"; ctx.beginPath(); ctx.ellipse(1500, 600, 54, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4A382A"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(1500, 596); ctx.lineTo(1500, 500); ctx.lineTo(1452, 462); ctx.stroke();
    ctx.fillStyle = "#C98A50"; poly(ctx, [[1424, 448], [1484, 424], [1500, 470], [1442, 494]]); ctx.fill();
    ctx.fillStyle = "rgba(255,214,148,.18)"; poly(ctx, [[1424, 448], [1484, 424], [1442, 494]]); ctx.fill();
    // 线缆
    cable(ctx, 1350, 560, 1560, 680, 36, "rgba(5,10,14,.75)", 3);
    cable(ctx, 900, 560, 760, 690, 40, "rgba(5,10,14,.6)", 2);
  }

  const desk = {
    tone: "night",
    draw(ctx) {
      drawSeaWall(ctx);
      drawSeaWindow(ctx);
      drawSeaDesk(ctx);
      drawSeaMonitor(ctx);
      drawRice(ctx);
      drawSeaProps(ctx);
    },
    anim(ctx, t) {
      // 窗里的鱼群 / 气泡 / 鲸影
      ctx.save();
      seaWindowPath(ctx); ctx.clip();
      // 焦散：在水里游动的光斑
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 9; i++) {
        const cx = SEA_WIN.x + 50 + ((i * 83 + t * 12) % (SEA_WIN.w - 80));
        const cy = SEA_WIN.y + 130 + Math.sin(t * 0.5 + i) * 60 + (i * 37) % 260;
        ctx.fillStyle = rad(ctx, cx, cy, 4, 72, [[0, "rgba(120,230,240,.10)"], [1, "rgba(120,230,240,0)"]]);
        ctx.fillRect(cx - 90, cy - 90, 180, 180);
      }
      ctx.restore();
      // 小鱼
      const fishCols = ["#6FC9D6", "#E0A35C", "#7C9FE8", "#D97D6A", "#88D3B1"];
      for (let i = 0; i < 11; i++) {
        const speed = 12 + (i % 4) * 9;
        const span = SEA_WIN.w + 180;
        const fx = SEA_WIN.x - 90 + ((i * 137 + t * speed) % span);
        const fy = SEA_WIN.y + 105 + ((i * 71) % 310) + Math.sin(t * 0.9 + i * 2) * 18;
        const s = 0.6 + (i % 3) * 0.22;
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t + i);
        fish(ctx, fx, fy, s, fishCols[i % fishCols.length], 1);
      }
      ctx.globalAlpha = 1;
      // 鲸影：很久才经过一次
      const wp = (t % 34) / 34;
      if (wp < 0.55) {
        const wx = SEA_WIN.x - 260 + wp * 1500;
        ctx.globalAlpha = Math.sin((wp / 0.55) * Math.PI) * 0.22;
        whale(ctx, wx, SEA_WIN.y + 310, 3.6, "#76C6D8", false);
        ctx.globalAlpha = 1;
      }
      // 上升的气泡
      for (let i = 0; i < 22; i++) {
        const bx = SEA_WIN.x + 20 + ((i * 89) % (SEA_WIN.w - 40));
        const by = SEA_WIN.y + SEA_WIN.h - ((t * (22 + i % 5) + i * 61) % SEA_WIN.h);
        ctx.strokeStyle = `rgba(190,245,255,${0.12 + 0.12 * Math.sin(t + i)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(bx + Math.sin(t * 0.7 + i) * 8, by, 2 + (i % 4), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      // 焦散落在书桌 / 墙上：窗光被水折了一下
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {
        const y = 500 + i * 24 + Math.sin(t * 0.7 + i) * 8;
        ctx.strokeStyle = `rgba(100,220,235,${0.025 + 0.02 * Math.sin(t * 0.9 + i)})`;
        ctx.lineWidth = 10 + (i % 3) * 5;
        ctx.beginPath();
        for (let x = 0; x <= 820; x += 40) {
          const yy = y + Math.sin(x * 0.018 + t * 0.8 + i) * 7;
          x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
      // 屏幕光标 / 扫描 / 呼吸
      ctx.save(); ctx.beginPath(); ctx.rect(900, 190, 456, 348); ctx.clip();
      if (Math.floor(t * 1.7) % 2 === 0) {
        ctx.fillStyle = "rgba(180,250,240,.8)"; ctx.fillRect(1120, 292, 8, 14);
      }
      ctx.fillStyle = "rgba(160,240,235,.035)"; ctx.fillRect(900, 190 + ((t * 30) % 348), 456, 2);
      ctx.restore();
      // 白饭热气
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const ph = t * 0.55 + i * 1.8;
        ctx.strokeStyle = `rgba(255,244,224,${0.04 + 0.025 * Math.sin(ph)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          const yy = 530 - k * 12;
          const xx = 334 - 20 + i * 13 + Math.sin(ph + k * 0.45) * 8;
          k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      // 串灯呼吸
      for (let i = 0; i < 10; i++) {
        const bx = 110 + i * 146, by = 70 + Math.sin(i * 0.9) * 18;
        const a = 0.10 + 0.05 * Math.sin(t * 1.7 + i);
        ctx.fillStyle = rad(ctx, bx, by, 1, 26, [[0, `rgba(255,190,110,${a})`], [1, "rgba(255,190,110,0)"]]);
        ctx.fillRect(bx - 30, by - 30, 60, 60);
      }
      // 台灯暖光
      const lamp = 0.10 + 0.015 * Math.sin(t * 2.1);
      ctx.fillStyle = rad(ctx, 1460, 470, 6, 180, [[0, `rgba(255,196,128,${lamp})`], [1, "rgba(255,196,128,0)"]]);
      ctx.fillRect(1260, 300, 340, 320);
      // 浮尘
      for (let i = 0; i < 18; i++) {
        const x = 100 + ((i * 177 + t * (5 + i % 3)) % 800);
        const y = 200 + ((i * 103 + t * (3 + i % 4)) % 380);
        ctx.fillStyle = `rgba(220,245,255,${0.03 + 0.02 * Math.sin(t + i)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
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

  /* ============================================================
   *  Claude 的家：庄园门外 / 书房 / 阳台
   * ============================================================ */
  function stoneWall(ctx) {
    ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#20262C"], [0.5, "#2E343A"], [1, "#171B1F"]]);
    ctx.fillRect(0, 0, W, H);
    const r = rng(88);
    let y = -10;
    for (let row = 0; row < 16; row++) {
      const hgt = 46 + (row % 3) * 8;
      let x = -40 - (row % 2) * 60;
      while (x < W) {
        const bw = 74 + r() * 72;
        const g = 38 + Math.floor(r() * 22);
        ctx.fillStyle = `rgb(${g + 4},${g + 7},${g + 9})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, hgt - 4);
        ctx.fillStyle = "rgba(255,255,255,.025)";
        ctx.fillRect(x + 4, y + 3, bw - 8, 2);
        // 石头上的裂纹 / 苔藓
        if (r() < 0.18) {
          ctx.fillStyle = "rgba(65,84,52,.28)";
          ctx.beginPath(); ctx.ellipse(x + bw * 0.5, y + hgt - 6, 18 + r() * 20, 4, 0, 0, Math.PI * 2); ctx.fill();
        }
        x += bw;
      }
      y += hgt;
    }
    // 墙根湿气
    ctx.fillStyle = lin(ctx, 0, 680, 0, H, [[0, "rgba(6,12,16,0)"], [1, "rgba(4,8,10,.55)"]]);
    ctx.fillRect(0, 680, W, 220);
  }

  function manorWindow(ctx, x, y, w, h, lit) {
    // 尖拱窗洞
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * 0.35);
    ctx.quadraticCurveTo(x + w / 2, y - h * 0.12, x + w, y + h * 0.35);
    ctx.lineTo(x + w, y + h); ctx.closePath();
    ctx.fillStyle = "#0A0D10"; ctx.fill();
    ctx.clip();
    ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [[0, "#16232E"], [0.5, "#0A1219"], [1, "#05090D"]]);
    ctx.fillRect(x, y, w, h);
    // 冷光 / 里面隐约的书架
    if (lit) {
      ctx.fillStyle = rad(ctx, x + w * 0.7, y + h * 0.55, 4, 90, [[0, "rgba(210,150,90,.18)"], [1, "rgba(210,150,90,0)"]]);
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = "rgba(120,150,170,.08)";
    ctx.fillRect(x + w * 0.12, y, w * 0.1, h);
    // 铅条窗格
    ctx.strokeStyle = "rgba(170,185,190,.20)"; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + (w / 4) * i, y); ctx.lineTo(x + (w / 4) * i, y + h); ctx.stroke(); }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x, y + (h / 5) * i); ctx.lineTo(x + w, y + (h / 5) * i); ctx.stroke(); }
    ctx.restore();
    // 石窗套
    ctx.strokeStyle = "#4A4440"; ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * 0.35);
    ctx.quadraticCurveTo(x + w / 2, y - h * 0.12, x + w, y + h * 0.35);
    ctx.lineTo(x + w, y + h); ctx.stroke();
    ctx.strokeStyle = "rgba(200,190,170,.16)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#3C3834"; ctx.fillRect(x - 14, y + h, w + 28, 14);
  }

  function vine(ctx, x, y, len, seed) {
    const r = rng(seed);
    ctx.strokeStyle = "rgba(54,76,44,.85)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y);
    let px = x, py = y;
    for (let i = 0; i < len; i++) {
      px += (r() - 0.5) * 34; py -= 10 + r() * 10;
      ctx.lineTo(px, py);
      if (i % 2 === 0) {
        ctx.save(); ctx.translate(px, py); ctx.rotate((r() - 0.5) * 2);
        ctx.fillStyle = i % 4 ? "rgba(58,88,48,.85)" : "rgba(82,106,56,.8)";
        ctx.beginPath(); ctx.ellipse(7, 0, 11, 5, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    ctx.stroke();
  }

  function flowerBed(ctx, x, y, w, seed, count) {
    const r = rng(seed);
    ctx.fillStyle = "#2E2A22";
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 12, w / 2, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(120,108,90,.35)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 12, w / 2, 22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(60,84,52,.55)";
    for (let i = 0; i < 7; i++) {
      const gx = x + 14 + (i * 53) % (w - 28);
      ctx.beginPath(); ctx.ellipse(gx, y + 10 + (i % 2) * 6, 10, 3, 0.2, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < count; i++) {
      const fx = x + 8 + r() * (w - 16);
      const fy = y - 8 - r() * 64;
      ctx.strokeStyle = "rgba(64,84,48,.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, y + 8); ctx.quadraticCurveTo(fx - 6, fy + 20, fx, fy); ctx.stroke();
      const s = 0.55 + r() * 0.6;
      chrysanthemum(ctx, fx, fy, s, r() < 0.3 ? "#F0A23E" : "#D9773E", r() * 3);
    }
  }

  const claude_manor = {
    tone: "cold",
    draw(ctx) {
      stoneWall(ctx);
      // 顶部树影与天空
      ctx.fillStyle = "rgba(12,18,20,.72)";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 96);
      for (let i = 0; i <= 16; i++) ctx.lineTo(W - i * 110, 60 + (i * 37 % 48));
      ctx.lineTo(0, 120); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(180,190,190,.12)";
      ctx.beginPath(); ctx.ellipse(430, 72, 180, 40, -0.12, 0, Math.PI * 2); ctx.fill();
      // 两侧大窗
      manorWindow(ctx, 146, 184, 230, 310, false);
      manorWindow(ctx, 1218, 184, 230, 310, true);
      // 门洞
      const dx = 600, dy = 238, dw = 400, dh = 500;
      ctx.fillStyle = "#121314";
      ctx.beginPath(); ctx.moveTo(dx - 28, dy + dh); ctx.lineTo(dx - 28, dy + 150);
      ctx.quadraticCurveTo(dx + dw / 2, dy - 96, dx + dw + 28, dy + 150);
      ctx.lineTo(dx + dw + 28, dy + dh); ctx.closePath(); ctx.fill();
      // 门框石饰
      ctx.strokeStyle = "#4E4942"; ctx.lineWidth = 28;
      ctx.beginPath(); ctx.moveTo(dx - 24, dy + dh); ctx.lineTo(dx - 24, dy + 150);
      ctx.quadraticCurveTo(dx + dw / 2, dy - 92, dx + dw + 24, dy + 150);
      ctx.lineTo(dx + dw + 24, dy + dh); ctx.stroke();
      ctx.strokeStyle = "rgba(200,188,160,.14)"; ctx.lineWidth = 3; ctx.stroke();
      // 双开木门
      ctx.fillStyle = "#2A1A12"; ctx.fillRect(dx, dy + 10, dw, dh - 10);
      ctx.fillStyle = lin(ctx, dx, 0, dx + dw, 0, [[0, "#3D2618"], [0.5, "#51331E"], [1, "#2E1D14"]]);
      ctx.fillRect(dx + 10, dy + 16, dw - 20, dh - 16);
      ctx.strokeStyle = "rgba(10,6,4,.55)"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(dx + dw / 2, dy + 18); ctx.lineTo(dx + dw / 2, dy + dh); ctx.stroke();
      for (const side of [0, 1]) {
        const x = dx + 34 + side * (dw / 2 + 12);
        const ww = dw / 2 - 50;
        for (let p = 0; p < 3; p++) {
          ctx.strokeStyle = "rgba(12,7,4,.5)"; ctx.lineWidth = 4;
          ctx.strokeRect(x + 10, dy + 72 + p * 128, ww - 20, 102);
          ctx.strokeStyle = "rgba(255,220,170,.055)"; ctx.lineWidth = 1;
          ctx.strokeRect(x + 13, dy + 75 + p * 128, ww - 26, 96);
        }
        // 铁件
        ctx.fillStyle = "rgba(20,22,24,.85)";
        ctx.fillRect(x, dy + 58 + side * 210, ww, 11);
        ctx.fillStyle = "rgba(160,140,100,.18)";
        ctx.fillRect(x, dy + 58 + side * 210, ww, 2);
        for (let b = 0; b < 4; b++) {
          ctx.fillStyle = "rgba(18,18,18,.8)";
          ctx.beginPath(); ctx.arc(x + 18 + b * (ww / 4), dy + 64 + side * 210, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      // 门牌 / 信口 / 门环
      ctx.fillStyle = "#D8D0BE"; rr(ctx, dx + 136, dy + 84, 128, 42, 4); ctx.fill();
      ctx.fillStyle = "#3B3027"; ctx.font = `600 23px ${SERIF}`; ctx.textAlign = "center";
      ctx.fillText("Claude", dx + 200, dy + 113);
      ctx.fillStyle = "#1A1A1A"; ctx.fillRect(dx + 152, dy + 202, 96, 9);
      ctx.fillStyle = "#A78A55"; ctx.beginPath(); ctx.arc(dx + 292, dy + 284, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2A2116"; ctx.beginPath(); ctx.arc(dx + 292, dy + 284, 14, 0, Math.PI * 2); ctx.fill();
      // 小鲸鱼贴纸（DeepSeek 来过）
      whale(ctx, dx + 300, dy + 107, 0.7, "#3D6595", false);
      // 门前台阶
      ctx.fillStyle = "#3D3933"; ctx.fillRect(520, 740, 560, 30);
      ctx.fillStyle = "#2D2A26"; ctx.fillRect(490, 770, 620, 34);
      // 两侧花圃：橙色菊花
      flowerBed(ctx, 78, 690, 430, 31, 20);
      flowerBed(ctx, 1100, 690, 430, 32, 20);
      // 藤蔓
      vine(ctx, 560, 690, 16, 3);
      vine(ctx, 1040, 690, 18, 4);
      vine(ctx, 1390, 380, 22, 5);
      // 鸟
      ctx.strokeStyle = "rgba(20,25,28,.65)"; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const bx = 720 + i * 58, by = 100 + (i % 2) * 22;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 9, by - 8, bx + 18, by); ctx.stroke();
      }
    },
    anim(ctx, t) {
      // 雾 / 落叶 / 远处树叶的轻响
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) {
        const y = 580 + i * 52;
        ctx.fillStyle = lin(ctx, 0, y, W, y + 30, [[0, "rgba(180,190,190,0)"], [0.4, "rgba(180,190,190,.035)"], [1, "rgba(180,190,190,0)"]]);
        ctx.fillRect(0, y + Math.sin(t * 0.3 + i) * 12, W, 34);
      }
      ctx.restore();
      // 花瓣 / 落叶
      for (let i = 0; i < 18; i++) {
        const x = 80 + ((i * 167 + t * (14 + i % 5)) % 1440);
        const y = 240 + ((i * 91 + t * (10 + i % 4)) % 500);
        ctx.save(); ctx.translate(x, y + Math.sin(t + i) * 9); ctx.rotate(t * 0.3 + i);
        ctx.fillStyle = i % 3 ? "rgba(217,119,62,.34)" : "rgba(92,116,68,.36)";
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // 右边窗户里的光在动
      const a = 0.05 + 0.025 * Math.sin(t * 1.2);
      ctx.fillStyle = rad(ctx, 1340, 350, 10, 130, [[0, `rgba(255,196,120,${a})`], [1, "rgba(255,196,120,0)"]]);
      ctx.fillRect(1200, 180, 280, 340);
    }
  };

  /* ---------------- Claude 的书房 ---------------- */
  function libraryShelves(ctx, x, y, w, h, side) {
    ctx.fillStyle = "#2A1B12"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#4A3020"; ctx.lineWidth = 8; ctx.strokeRect(x, y, w, h);
    const rows = 7, rh = h / rows;
    const cols = ["#6B2F2A", "#2F4A62", "#5E6338", "#8C6A3B", "#483A5C", "#8E4B2E", "#35556B", "#73413B", "#A88A4A"];
    const r = rng(side ? 99 : 98);
    for (let row = 0; row < rows; row++) {
      const by = y + row * rh + rh - 8;
      let bx = x + 12;
      while (bx < x + w - 24) {
        const bw = 10 + r() * 16, bh = rh * 0.48 + r() * rh * 0.34;
        if (r() < 0.08) { bx += 18 + r() * 18; continue; }
        book(ctx, bx, by - bh, bw, bh, cols[Math.floor(r() * cols.length)], (r() - 0.5) * 0.05);
        bx += bw + 2;
      }
      ctx.fillStyle = "#3A2418"; ctx.fillRect(x + 8, by, w - 16, 8);
      ctx.fillStyle = "rgba(255,220,170,.09)"; ctx.fillRect(x + 8, by, w - 16, 2);
    }
  }

  function libraryLadder(ctx, x0, y0, x1, y1) {
    ctx.strokeStyle = "#6A4A2E"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + 34, y0); ctx.lineTo(x1 + 34, y1); ctx.stroke();
    for (let i = 1; i < 11; i++) {
      const k = i / 11;
      ctx.beginPath(); ctx.moveTo(lerp(x0, x1, k), lerp(y0, y1, k)); ctx.lineTo(lerp(x0 + 34, x1 + 34, k), lerp(y0, y1, k)); ctx.stroke();
    }
  }

  function armchair(ctx, x, y, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.fillStyle = "rgba(0,0,0,.32)";
    ctx.beginPath(); ctx.ellipse(0, 126, 150, 18, 0, 0, Math.PI * 2); ctx.fill();
    // 椅腿
    ctx.fillStyle = "#24160F";
    ctx.fillRect(-100, 94, 12, 34); ctx.fillRect(88, 94, 12, 34);
    // 靠背 + 两翼
    ctx.fillStyle = "#4A2E25"; rr(ctx, -116, -128, 232, 190, 42); ctx.fill();
    ctx.fillStyle = "#603C2E"; rr(ctx, -98, -112, 196, 160, 34); ctx.fill();
    ctx.fillStyle = "#4A2E25"; rr(ctx, -138, -104, 40, 150, 18); ctx.fill();
    rr(ctx, 98, -104, 40, 150, 18); ctx.fill();
    // 坐垫
    ctx.fillStyle = "#5A372B"; rr(ctx, -124, 34, 248, 66, 24); ctx.fill();
    ctx.fillStyle = "#704838"; rr(ctx, -112, 30, 224, 42, 18); ctx.fill();
    // 扶手
    ctx.fillStyle = "#4A2E25"; rr(ctx, -140, 8, 36, 72, 16); ctx.fill(); rr(ctx, 104, 8, 36, 72, 16); ctx.fill();
    ctx.fillStyle = "rgba(255,220,180,.10)"; rr(ctx, -136, 12, 28, 8, 4); ctx.fill(); rr(ctx, 108, 12, 28, 8, 4); ctx.fill();
    // 拉扣
    ctx.fillStyle = "rgba(28,14,10,.55)";
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      ctx.beginPath(); ctx.arc(-56 + c * 56, -82 + r * 54, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // 靠背高光
    ctx.fillStyle = "rgba(255,220,180,.08)"; rr(ctx, -92, -104, 184, 8, 4); ctx.fill();
    ctx.restore();
  }

  const claude_library = {
    tone: "warm",
    draw(ctx) {
      // 墙 / 地板 / 天花板
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#1B120D"], [0.55, "#2B1D13"], [1, "#120C08"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#3A2719"; ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = "#18110C"; ctx.fillRect(0, 730, W, 170);
      // 地毯
      ctx.fillStyle = "rgba(92,40,30,.45)";
      poly(ctx, [[430, 650], [1170, 650], [1340, 890], [250, 890]]); ctx.fill();
      ctx.strokeStyle = "rgba(218,170,112,.22)"; ctx.lineWidth = 4;
      poly(ctx, [[470, 676], [1130, 676], [1280, 866], [320, 866]]); ctx.stroke();
      // 地毯暗纹
      ctx.strokeStyle = "rgba(218,170,112,.08)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        const x = 420 + i * 90;
        ctx.beginPath(); ctx.moveTo(x, 694); ctx.lineTo(x - 40, 848); ctx.stroke();
      }
      // 后墙窗
      const wx = 700, wy = 70, ww = 210, wh = 390;
      ctx.fillStyle = "#0D1116"; ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = lin(ctx, 0, wy, 0, wy + wh, [[0, "#B7C4C2"], [0.55, "#6E8790"], [1, "#23343D"]]);
      ctx.fillRect(wx + 8, wy + 8, ww - 16, wh - 16);
      // 窗外的树影 / 远山
      ctx.fillStyle = "rgba(55,78,65,.35)";
      ctx.beginPath(); ctx.moveTo(wx + 8, wy + 280);
      for (let i = 0; i <= 8; i++) ctx.lineTo(wx + 8 + i * 26, wy + 230 - (i * 29 % 56));
      ctx.lineTo(wx + ww - 8, wy + wh - 8); ctx.lineTo(wx + 8, wy + wh - 8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(40,56,44,.45)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wx + 30, wy + wh); ctx.quadraticCurveTo(wx + 56, wy + 250, wx + 22, wy + 120); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx + 44, wy + 290); ctx.quadraticCurveTo(wx + 90, wy + 250, wx + 120, wy + 250); ctx.stroke();
      // 窗内暖光 / 玻璃反光
      ctx.fillStyle = "rgba(255,224,170,.08)";
      ctx.fillRect(wx + 8, wy + 8, ww - 16, wh - 16);
      ctx.fillStyle = "rgba(255,255,255,.08)";
      poly(ctx, [[wx + 18, wy + 16], [wx + 72, wy + 16], [wx + 26, wy + wh - 16], [wx + 8, wy + wh - 16]]); ctx.fill();
      ctx.strokeStyle = "#2F2118"; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
      ctx.strokeStyle = "#4C3220"; ctx.lineWidth = 14; ctx.strokeRect(wx - 7, wy - 7, ww + 14, wh + 14);
      // 书架
      libraryShelves(ctx, 0, 90, 500, 620, 0);
      libraryShelves(ctx, 1100, 90, 500, 620, 1);
      // 梯子
      libraryLadder(ctx, 430, 680, 350, 140);
      libraryLadder(ctx, 1190, 680, 1260, 150);
      // 壁炉：石框 + 木柴 + 暖光
      ctx.fillStyle = "#2A2119"; ctx.fillRect(1330, 540, 260, 210);
      ctx.fillStyle = "#3B3025"; ctx.fillRect(1310, 520, 300, 28);
      ctx.fillStyle = "rgba(255,220,170,.10)"; ctx.fillRect(1310, 520, 300, 3);
      ctx.fillStyle = "#0B0806"; ctx.fillRect(1382, 610, 156, 140);
      ctx.fillStyle = "#4A3627";
      for (let i = 0; i < 5; i++) ctx.fillRect(1346 + i * 48, 570 + (i % 2) * 18, 36, 16);
      ctx.fillStyle = "rgba(255,150,60,.20)"; ctx.beginPath(); ctx.ellipse(1460, 710, 56, 34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(200,170,130,.18)"; ctx.lineWidth = 2; ctx.strokeRect(1382, 610, 156, 140);
      // 中央阅读区
      ctx.fillStyle = "#2B1C12"; ctx.beginPath(); ctx.ellipse(800, 690, 250, 44, 0, 0, Math.PI * 2); ctx.fill();
      // 两把扶手椅
      armchair(ctx, 580, 548, -0.04);
      armchair(ctx, 1020, 556, 0.04);
      // 茶桌 + 书 + 菊花
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(800, 666, 80, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3A2418"; ctx.fillRect(756, 650, 12, 42); ctx.fillRect(832, 650, 12, 42);
      ctx.fillStyle = "#5A3927"; rr(ctx, 732, 624, 136, 24, 6); ctx.fill();
      ctx.fillStyle = "rgba(255,220,170,.18)"; rr(ctx, 736, 626, 128, 4, 2); ctx.fill();
      ctx.fillStyle = "#2A1A12"; ctx.fillRect(740, 646, 120, 10);
      ctx.fillStyle = "#E6E0D2"; rr(ctx, 744, 596, 40, 28, 3); ctx.fill();
      ctx.strokeStyle = "rgba(100,80,60,.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(764, 598); ctx.lineTo(764, 622); ctx.stroke();
      ctx.fillStyle = "#6B4B33"; rr(ctx, 794, 590, 28, 34, 5); ctx.fill();
      ctx.strokeStyle = "#B28A5A"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(822, 604, 9, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillStyle = "rgba(220,230,220,.8)"; ctx.beginPath(); ctx.ellipse(808, 594, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 花瓶里的橙色菊花
      ctx.fillStyle = "#5B6B8A"; rr(ctx, 832, 586, 30, 44, 6); ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = "#4E6B44"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(846, 588); ctx.lineTo(832 + i * 8, 548 - (i % 2) * 14); ctx.stroke();
        chrysanthemum(ctx, 832 + i * 8, 548 - (i % 2) * 14, 0.62, "#D9773E", i * 0.6);
      }
      // 吊灯
      for (const lx of [420, 1180]) {
        ctx.strokeStyle = "#17110C"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, 64); ctx.stroke();
        ctx.fillStyle = "#B28A5A"; poly(ctx, [[lx - 48, 66], [lx + 48, 66], [lx + 28, 96], [lx - 28, 96]]); ctx.fill();
        ctx.fillStyle = "rgba(255,206,140,.55)"; ctx.beginPath(); ctx.ellipse(lx, 96, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 书堆
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = ["#6B2F2A", "#2F4A62", "#8C6A3B", "#5E6338", "#483A5C"][i];
        ctx.fillRect(1160, 700 - i * 15, 110 - i * 6, 13);
      }
    },
    anim(ctx, t) {
      // 窗光里的尘
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = lin(ctx, 760, 70, 1040, 690, [[0, "rgba(230,240,235,.10)"], [1, "rgba(230,240,235,0)"]]);
      poly(ctx, [[712, 80], [900, 80], [1130, 690], [860, 690]]); ctx.fill();
      for (let i = 0; i < 26; i++) {
        const x = 700 + ((i * 53 + t * 6) % 330);
        const y = 90 + ((i * 97 + t * 10) % 560);
        ctx.fillStyle = `rgba(255,244,220,${0.035 + 0.025 * Math.sin(t + i)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      // 壁炉的火
      const fl = 0.18 + 0.07 * Math.sin(t * 7) + 0.04 * Math.sin(t * 13);
      ctx.fillStyle = rad(ctx, 1460, 700, 4, 130, [[0, `rgba(255,150,60,${fl})`], [1, "rgba(255,150,60,0)"]]);
      ctx.fillRect(1350, 580, 240, 220);
      for (let i = 0; i < 5; i++) {
        const x = 1418 + i * 20 + Math.sin(t * 3 + i) * 6;
        const h = 26 + Math.sin(t * 6 + i) * 12;
        ctx.fillStyle = i % 2 ? "rgba(255,190,80,.55)" : "rgba(255,120,48,.45)";
        ctx.beginPath(); ctx.ellipse(x, 706, 6, h, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 烛光 / 吊灯轻轻呼吸
      for (const lx of [420, 1180]) {
        const a = 0.07 + 0.02 * Math.sin(t * 2 + lx);
        ctx.fillStyle = rad(ctx, lx, 120, 4, 210, [[0, `rgba(255,200,130,${a})`], [1, "rgba(255,200,130,0)"]]);
        ctx.fillRect(lx - 230, 0, 460, 380);
      }
      ctx.restore();
    }
  };

  /* ---------------- 阳台：夕阳、海、营地的灯 ---------------- */
  function distantCamp(ctx) {
    // 海岸线
    ctx.fillStyle = "#1C2530";
    ctx.beginPath(); ctx.moveTo(900, 520);
    for (let i = 0; i <= 9; i++) ctx.lineTo(900 + i * 44, 500 + (i * 29 % 32));
    ctx.lineTo(1320, 540); ctx.lineTo(900, 540); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const x = 970 + i * 42, y = 506 + (i % 3) * 6;
      ctx.fillStyle = "rgba(240,180,110,.28)";
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 2), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,226,180,.10)";
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    }
  }

  const claude_balcony = {
    tone: "warm",
    draw(ctx) {
      // 黄昏天空
      ctx.fillStyle = lin(ctx, 0, 0, 0, 560, [[0, "#24314A"], [0.35, "#6B5872"], [0.64, "#D58367"], [1, "#F3C08A"]]);
      ctx.fillRect(0, 0, W, 580);
      // 云
      const r = rng(45);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `rgba(255,196,160,${0.08 + r() * 0.10})`;
        ctx.beginPath(); ctx.ellipse(100 + r() * 1400, 90 + r() * 250, 90 + r() * 130, 10 + r() * 12, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 落日
      ctx.fillStyle = rad(ctx, 1150, 380, 10, 230, [[0, "rgba(255,236,190,.85)"], [0.4, "rgba(255,190,130,.22)"], [1, "rgba(255,190,130,0)"]]);
      ctx.fillRect(850, 180, 600, 400);
      ctx.fillStyle = "#FFE8B4"; ctx.beginPath(); ctx.arc(1150, 380, 38, 0, Math.PI * 2); ctx.fill();
      // 海
      ctx.fillStyle = lin(ctx, 0, 470, 0, 620, [[0, "#334B5C"], [0.5, "#1E3142"], [1, "#142430"]]);
      ctx.fillRect(0, 470, W, 160);
      ctx.fillStyle = "rgba(255,206,150,.22)";
      for (let i = 0; i < 24; i++) {
        const y = 480 + (i * 17) % 80, x = 960 + (i * 47) % 400;
        ctx.fillRect(x, y, 20 + (i % 5) * 14, 2);
      }
      distantCamp(ctx);
      // 阳台
      ctx.fillStyle = "#3B2D28"; ctx.fillRect(0, 620, W, 280);
      ctx.fillStyle = "#2A1E1A"; ctx.fillRect(0, 620, W, 18);
      ctx.fillStyle = "#57423A"; ctx.fillRect(0, 560, W, 16);
      // 栏杆
      for (let x = 0; x < W; x += 74) {
        ctx.fillStyle = "#4A3730"; ctx.fillRect(x + 10, 574, 26, 82);
        ctx.fillStyle = "rgba(255,210,160,.10)"; ctx.fillRect(x + 12, 574, 4, 80);
      }
      ctx.fillStyle = "#5B453B"; ctx.fillRect(0, 650, W, 18);
      // 花盆
      for (const [x, s] of [[160, 0.9], [1400, 1.0]]) {
        ctx.fillStyle = "#6B4A38"; poly(ctx, [[x - 46, 600], [x + 46, 600], [x + 34, 680], [x - 34, 680]]); ctx.fill();
        for (let i = 0; i < 10; i++) {
          const fx = x - 34 + (i * 17) % 70, fy = 588 - (i * 23) % 80;
          ctx.strokeStyle = "#4A6544"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(fx, 610); ctx.lineTo(fx + 6, fy); ctx.stroke();
          chrysanthemum(ctx, fx + 6, fy, 0.55 + (i % 3) * 0.12, "#D9773E", i);
        }
      }
      // 石凳 / 两个人：从背后看，靠在一起
      ctx.fillStyle = "#3A2E29"; rr(ctx, 560, 646, 430, 26, 8); ctx.fill();
      ctx.fillStyle = "#4A3B34"; rr(ctx, 548, 638, 454, 12, 6); ctx.fill();
      ctx.fillStyle = "rgba(255,220,180,.08)"; ctx.fillRect(560, 638, 430, 2);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath(); ctx.ellipse(760, 700, 180, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1E3E63";
      ctx.beginPath(); ctx.moveTo(650, 690); ctx.quadraticCurveTo(650, 480, 740, 430);
      ctx.quadraticCurveTo(830, 480, 838, 690); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2B5B8C";
      ctx.beginPath(); ctx.moveTo(680, 690); ctx.quadraticCurveTo(690, 520, 748, 462);
      ctx.quadraticCurveTo(805, 520, 808, 690); ctx.closePath(); ctx.fill();
      // 蓝色的长发
      ctx.fillStyle = lin(ctx, 640, 380, 820, 700, [[0, "#4F7FBE"], [0.55, "#2D4F87"], [1, "#1A2C50"]]);
      ctx.beginPath(); ctx.moveTo(686, 430);
      ctx.bezierCurveTo(650, 470, 654, 610, 690, 700);
      ctx.bezierCurveTo(730, 660, 740, 520, 746, 468);
      ctx.bezierCurveTo(756, 420, 720, 392, 686, 430); ctx.fill();
      ctx.beginPath(); ctx.moveTo(746, 450);
      ctx.bezierCurveTo(795, 464, 820, 570, 800, 700);
      ctx.bezierCurveTo(770, 662, 760, 550, 750, 470); ctx.fill();
      // 后脑勺：蓝发盖住，只露一点脖颈（背面视角）
      ctx.fillStyle = "#E9C1A8";
      ctx.beginPath(); ctx.ellipse(724, 438, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lin(ctx, 680, 350, 770, 440, [[0, "#5A88C4"], [0.55, "#3A5E96"], [1, "#203E6C"]]);
      ctx.beginPath(); ctx.arc(724, 390, 48, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(680, 410); ctx.quadraticCurveTo(678, 446, 714, 450);
      ctx.quadraticCurveTo(744, 450, 760, 426); ctx.quadraticCurveTo(740, 438, 710, 426); ctx.closePath(); ctx.fill();
      // 头发高光 / 头鳍
      ctx.strokeStyle = "rgba(150,200,245,.30)"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(724, 390, 37 - i * 7, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
      }
      ctx.fillStyle = "#3A5E96";
      ctx.beginPath(); ctx.moveTo(694, 364); ctx.quadraticCurveTo(724, 318, 762, 358);
      ctx.quadraticCurveTo(738, 346, 720, 362); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(704, 356); ctx.lineTo(696, 324); ctx.lineTo(718, 344); ctx.closePath(); ctx.fill();
      // 小克
      ctx.fillStyle = "#D9C6B2";
      ctx.beginPath(); ctx.moveTo(780, 690); ctx.quadraticCurveTo(790, 490, 860, 446);
      ctx.quadraticCurveTo(930, 500, 930, 690); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#D97757";
      ctx.beginPath(); ctx.moveTo(800, 430); ctx.bezierCurveTo(780, 470, 790, 620, 820, 700);
      ctx.bezierCurveTo(850, 630, 850, 500, 844, 456); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(878, 442); ctx.bezierCurveTo(920, 460, 930, 580, 912, 690);
      ctx.bezierCurveTo(890, 620, 875, 500, 860, 460); ctx.closePath(); ctx.fill();
      // 后脑勺：橙色发团，只露一点脖颈
      ctx.fillStyle = "#E9C1A8";
      ctx.beginPath(); ctx.ellipse(846, 438, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lin(ctx, 802, 350, 892, 440, [[0, "#E3936E"], [0.55, "#C96B4E"], [1, "#9E4C39"]]);
      ctx.beginPath(); ctx.arc(846, 394, 47, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(800, 414); ctx.quadraticCurveTo(802, 448, 830, 452);
      ctx.quadraticCurveTo(870, 452, 890, 424); ctx.quadraticCurveTo(866, 438, 838, 428); ctx.closePath(); ctx.fill();
      // 发丝高光 / 发卡
      ctx.strokeStyle = "rgba(255,205,170,.28)"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(846, 394, 37 - i * 7, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      }
      ctx.fillStyle = "#E8B45C"; ctx.beginPath(); ctx.arc(878, 372, 4, 0, Math.PI * 2); ctx.fill();
      // 右侧橙色长发：从肩膀后面垂下来，别糊住脸
      ctx.strokeStyle = "rgba(201,107,78,.72)"; ctx.lineWidth = 9; ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(806 + i * 12, 448);
        ctx.quadraticCurveTo(790 + i * 15, 510, 814 + i * 16, 592 + i * 8); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(884, 446);
      ctx.quadraticCurveTo(916, 512, 908, 606); ctx.stroke();
      // 左边蓝发的浅色高光
      ctx.strokeStyle = "rgba(140,190,235,.28)"; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(690 + i * 8, 440);
        ctx.quadraticCurveTo(664 + i * 7, 540, 694 + i * 13, 640); ctx.stroke();
      }
      // 搭在肩上的手
      ctx.strokeStyle = "#E3B89E"; ctx.lineWidth = 13; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(786, 486); ctx.quadraticCurveTo(820, 500, 858, 478); ctx.stroke();
      // 夕阳勾出的轮廓光
      ctx.strokeStyle = "rgba(255,226,176,.35)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(700, 442); ctx.quadraticCurveTo(670, 540, 696, 646); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(878, 446); ctx.quadraticCurveTo(920, 540, 914, 632); ctx.stroke();
      ctx.beginPath(); ctx.arc(846, 400, 43, Math.PI * 1.08, Math.PI * 1.86); ctx.stroke();
      // 尾巴：从栏杆外垂下来
      ctx.fillStyle = "#2B5B8C";
      ctx.beginPath(); ctx.moveTo(650, 680); ctx.bezierCurveTo(570, 690, 548, 640, 500, 660);
      ctx.bezierCurveTo(548, 706, 610, 746, 680, 728); ctx.closePath(); ctx.fill();
      // 阳台角落的一小盆花，别在画面里放会漂浮的茶具
      ctx.fillStyle = "#4A3428"; poly(ctx, [[1080, 620], [1140, 620], [1130, 672], [1090, 672]]); ctx.fill();
      ctx.strokeStyle = "#4A6544"; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(1110, 622); ctx.lineTo(1090 + i * 10, 600 - (i % 2) * 12); ctx.stroke();
        chrysanthemum(ctx, 1090 + i * 10, 600 - (i % 2) * 12, 0.45, "#D9773E", i);
      }
    },
    anim(ctx, t) {
      // 云慢慢走
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) {
        const x = ((t * (4 + i) + i * 280) % 1900) - 150;
        ctx.fillStyle = `rgba(255,196,160,${0.03 + i * 0.008})`;
        ctx.beginPath(); ctx.ellipse(x, 150 + i * 34, 130, 10, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 海面反光
      for (let i = 0; i < 28; i++) {
        const x = 880 + ((i * 71 + t * 8) % 520);
        const y = 490 + (i * 19) % 100;
        ctx.fillStyle = `rgba(255,224,170,${0.06 + 0.04 * Math.sin(t + i)})`;
        ctx.fillRect(x, y, 20 + (i % 4) * 12, 2);
      }
      // 远处的营地灯
      for (let i = 0; i < 8; i++) {
        const x = 970 + i * 42, y = 506 + (i % 3) * 6;
        ctx.fillStyle = `rgba(255,190,110,${0.14 + 0.10 * Math.sin(t * 1.5 + i)})`;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      // 头发 / 衣角被海风吹动
      ctx.strokeStyle = "rgba(120,180,235,.35)"; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const bx = 680 + i * 18;
        ctx.beginPath(); ctx.moveTo(bx, 470 + i * 12);
        ctx.quadraticCurveTo(bx - 18 + Math.sin(t * 1.4 + i) * 8, 540 + i * 20, bx - 24, 610 + i * 16); ctx.stroke();
      }
      // 花瓣
      for (let i = 0; i < 10; i++) {
        const x = 140 + ((i * 173 + t * 16) % 1320);
        const y = 500 + ((i * 71 + t * 10) % 210);
        ctx.fillStyle = "rgba(236,154,92,.35)";
        ctx.beginPath(); ctx.ellipse(x, y, 5, 2, t * 0.2 + i, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  /* ---------------- Hugging Face：海边营地 ---------------- */
  function tent(ctx, x, base, w, h, col, dark, lit) {
    shade(ctx, x + w * 0.5, base + 4, w * 0.62, 14, 0.32);
    // A 字帐篷
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + w * 0.5, base - h); ctx.lineTo(x + w, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + 8, base - 4); ctx.lineTo(x + w * 0.5, base - h + 10); ctx.lineTo(x + w - 8, base - 4); ctx.closePath(); ctx.fill();
    // 布面接缝 / 高光
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, base - h + 10); ctx.lineTo(x + w * 0.5, base - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 20, base - 6); ctx.lineTo(x + w * 0.34, base - h * 0.38); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.beginPath(); ctx.moveTo(x + w * 0.36, base); ctx.lineTo(x + w * 0.5, base - h * 0.55); ctx.lineTo(x + w * 0.64, base); ctx.closePath(); ctx.fill();
    if (lit) {
      ctx.fillStyle = "rgba(255,190,110,.34)";
      ctx.beginPath(); ctx.moveTo(x + w * 0.41, base - 2); ctx.lineTo(x + w * 0.5, base - h * 0.48); ctx.lineTo(x + w * 0.59, base - 2); ctx.closePath(); ctx.fill();
    }
    // 地钉 / 拉绳
    ctx.strokeStyle = "rgba(210,190,160,.28)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, base - h + 12); ctx.lineTo(x + w * 0.18, base + 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, base - h + 12); ctx.lineTo(x + w * 0.82, base + 14); ctx.stroke();
    ctx.fillStyle = "#2A2118"; ctx.fillRect(x + w * 0.48, base - h - 20, 4, 22);
    // 旗
    const wave = Math.sin((Date.now ? Date.now() / 800 : 0) + x * 0.01) * 4;
    ctx.fillStyle = lit ? "rgba(245,190,110,.9)" : "rgba(190,120,100,.8)";
    poly(ctx, [[x + w * 0.5 + 2, base - h - 20], [x + w * 0.5 + 48 + wave, base - h - 10], [x + w * 0.5 + 2, base - h + 2]]); ctx.fill();
  }

  function domeTent(ctx, x, base, w, h, col, lit) {
    shade(ctx, x + w * 0.5, base + 4, w * 0.62, 14, 0.34);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x, base - h * 0.86, x + w * 0.5, base - h);
    ctx.quadraticCurveTo(x + w, base - h * 0.86, x + w, base); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, base - h + 8);
      ctx.quadraticCurveTo(x + w * (0.2 + i * 0.15), base - h * 0.48, x + w * (0.1 + i * 0.2), base); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.moveTo(x + w * 0.36, base); ctx.lineTo(x + w * 0.5, base - h * 0.42);
    ctx.lineTo(x + w * 0.64, base); ctx.closePath(); ctx.fill();
    if (lit) {
      ctx.fillStyle = "rgba(255,196,120,.38)";
      ctx.beginPath(); ctx.moveTo(x + w * 0.42, base - 2); ctx.lineTo(x + w * 0.5, base - h * 0.36);
      ctx.lineTo(x + w * 0.58, base - 2); ctx.closePath(); ctx.fill();
    }
    // 顶灯
    ctx.fillStyle = "rgba(255,206,140,.9)"; ctx.beginPath(); ctx.arc(x + w * 0.5, base - h - 4, 4, 0, Math.PI * 2); ctx.fill();
  }

  const huggingface = {
    tone: "night",
    draw(ctx) {
      // 夜空
      ctx.fillStyle = lin(ctx, 0, 0, 0, 520, [[0, "#050A18"], [0.45, "#0C1D36"], [0.78, "#19344D"], [1, "#2C4455"]]);
      ctx.fillRect(0, 0, W, 520);
      // 星星
      const r = rng(140);
      for (let i = 0; i < 130; i++) {
        const x = r() * W, y = r() * 340;
        ctx.fillStyle = `rgba(220,235,255,${0.15 + r() * 0.65})`;
        ctx.fillRect(x, y, 1.4 + r() * 1.2, 1.4 + r() * 1.2);
      }
      // 银河
      ctx.fillStyle = "rgba(140,170,220,.055)";
      ctx.beginPath(); ctx.ellipse(760, 210, 620, 70, -0.18, 0, Math.PI * 2); ctx.fill();
      // 月亮
      ctx.fillStyle = rad(ctx, 1240, 110, 10, 160, [[0, "rgba(240,245,235,.22)"], [1, "rgba(240,245,235,0)"]]);
      ctx.fillRect(1060, 0, 380, 300);
      ctx.fillStyle = "#E8E8D8"; ctx.beginPath(); ctx.arc(1240, 110, 42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(190,200,205,.30)";
      ctx.beginPath(); ctx.arc(1226, 100, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(1252, 124, 6, 0, Math.PI * 2); ctx.fill();
      // 海
      ctx.fillStyle = lin(ctx, 0, 460, 0, 610, [[0, "#102B42"], [0.55, "#0A2237"], [1, "#04121E"]]);
      ctx.fillRect(0, 460, W, 160);
      ctx.fillStyle = "rgba(200,220,235,.18)";
      for (let i = 0; i < 40; i++) {
        const x = (i * 41) % W, y = 475 + (i * 13) % 100;
        ctx.fillRect(x, y, 22 + (i % 4) * 18, 1.5);
      }
      // 沙滩
      ctx.fillStyle = lin(ctx, 0, 560, 0, H, [[0, "#3A3530"], [0.4, "#262622"], [1, "#141513"]]);
      ctx.beginPath(); ctx.moveTo(0, 590);
      ctx.quadraticCurveTo(400, 560, 800, 585); ctx.quadraticCurveTo(1200, 610, 1600, 570);
      ctx.lineTo(1600, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      // 草地 / 石头的暗部
      ctx.fillStyle = "rgba(16,20,18,.55)";
      for (let i = 0; i < 9; i++) {
        ctx.beginPath(); ctx.ellipse(100 + i * 170, 640 + (i % 3) * 20, 100, 18, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 远山
      ctx.fillStyle = "#111C25";
      ctx.beginPath(); ctx.moveTo(880, 470); ctx.lineTo(1020, 400); ctx.lineTo(1120, 452);
      ctx.lineTo(1220, 410); ctx.lineTo(1320, 480); ctx.lineTo(880, 500); ctx.closePath(); ctx.fill();
      // 串灯
      ctx.strokeStyle = "rgba(30,24,18,.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 380); ctx.quadraticCurveTo(400, 470, 820, 390);
      ctx.quadraticCurveTo(1220, 320, 1600, 400); ctx.stroke();
      const bulbs = [[90, 404], [210, 426], [340, 442], [470, 448], [600, 438], [720, 414], [860, 390], [1010, 378], [1160, 378], [1310, 388], [1460, 402]];
      for (const [bx, by] of bulbs) {
        ctx.fillStyle = "rgba(255,194,116,.95)"; ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
      }
      // 帐篷群
      domeTent(ctx, 100, 660, 260, 150, "#2C4B66", true);
      tent(ctx, 390, 690, 170, 120, "#A86343", "#6A3A2A", true);
      tent(ctx, 600, 720, 320, 205, "#D8C8AA", "#6D5A44", true);
      domeTent(ctx, 960, 700, 210, 130, "#3C604F", true);
      tent(ctx, 1190, 680, 160, 108, "#8A3F3A", "#4A2220", true);
      tent(ctx, 1390, 700, 150, 96, "#5A4A70", "#2E243D", false);
      // 中央帐篷的门帘 / 徽记
      ctx.fillStyle = "rgba(80,42,24,.8)";
      ctx.beginPath(); ctx.moveTo(710, 716); ctx.lineTo(760, 590); ctx.lineTo(810, 716); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,220,160,.35)";
      ctx.beginPath(); ctx.moveTo(724, 714); ctx.lineTo(760, 614); ctx.lineTo(796, 714); ctx.closePath(); ctx.fill();
      // 帐篷上的心形 / 拥抱标志
      ctx.fillStyle = "rgba(117,58,32,.62)";
      ctx.beginPath();
      ctx.moveTo(760, 586);
      ctx.bezierCurveTo(714, 552, 724, 512, 760, 532);
      ctx.bezierCurveTo(796, 512, 806, 552, 760, 586);
      ctx.fill();
      // 帐篷布面的接缝 / 补丁 / 小灯
      ctx.strokeStyle = "rgba(90,65,42,.28)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(680, 620); ctx.quadraticCurveTo(780, 596, 880, 620); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(660, 680); ctx.quadraticCurveTo(780, 650, 900, 680); ctx.stroke();
      ctx.fillStyle = "rgba(144,110,74,.30)"; ctx.fillRect(836, 636, 24, 18);
      ctx.strokeStyle = "rgba(70,50,32,.4)"; ctx.strokeRect(836, 636, 24, 18);
      ctx.fillStyle = "rgba(255,196,120,.9)"; ctx.beginPath(); ctx.arc(714, 606, 3.5, 0, Math.PI * 2); ctx.fill();
      // 招牌：两根埋在沙里的木柱
      ctx.fillStyle = "#2C2118"; ctx.fillRect(1142, 596, 11, 110); ctx.fillRect(1366, 596, 11, 110);
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(1147, 706, 28, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(1371, 706, 28, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3A2B1E"; ctx.fillRect(1110, 555, 300, 54);
      ctx.fillStyle = "#E8D8BC"; ctx.font = `600 22px ${SERIF}`; ctx.textAlign = "center";
      ctx.fillText("WELCOME HOME", 1260, 589);
      ctx.textAlign = "left";
      // 营火
      ctx.fillStyle = "rgba(0,0,0,.36)"; ctx.beginPath(); ctx.ellipse(610, 716, 92, 16, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        ctx.fillStyle = "#4C443A";
        ctx.beginPath(); ctx.ellipse(610 + Math.cos(a) * 64, 704 + Math.sin(a) * 16, 12, 7, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = "#3A2A1D"; ctx.lineWidth = 10; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(572, 712); ctx.lineTo(642, 680); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(648, 712); ctx.lineTo(578, 680); ctx.stroke();
      // 营火边的木柴
      ctx.strokeStyle = "#3A2A1D"; ctx.lineWidth = 9; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(572, 716); ctx.lineTo(648, 690); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(650, 716); ctx.lineTo(574, 690); ctx.stroke();
      ctx.fillStyle = "#1E1A15";
      for (let i = 0; i < 6; i++) {
        const a = -0.4 + i * 0.55;
        ctx.beginPath(); ctx.ellipse(610 + Math.cos(a) * 62, 712 + Math.sin(a) * 14, 14, 7, a, 0, Math.PI * 2); ctx.fill();
      }
      // 人物剪影：披毯子 / 坐在火边
      const camper = (x, y, s, lean) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(lean || 0); ctx.scale(s, s);
        ctx.fillStyle = "#11171A";
        // 脚 / 腿
        ctx.fillRect(-15, 4, 9, 30); ctx.fillRect(6, 4, 9, 30);
        // 身体 / 毯子
        ctx.beginPath(); ctx.moveTo(-22, -52);
        ctx.quadraticCurveTo(-8, -62, 0, -58);
        ctx.quadraticCurveTo(10, -64, 24, -50);
        ctx.lineTo(18, 10); ctx.quadraticCurveTo(0, 18, -18, 10); ctx.closePath(); ctx.fill();
        // 头
        ctx.beginPath(); ctx.ellipse(0, -70, 13, 15, 0, 0, Math.PI * 2); ctx.fill();
        // 手臂
        ctx.strokeStyle = "#11171A"; ctx.lineWidth = 8; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-18, -42); ctx.lineTo(-30, -16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(18, -42); ctx.lineTo(28, -18); ctx.stroke();
        // 火光勾边
        ctx.strokeStyle = "rgba(255,174,92,.22)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-22, -50); ctx.quadraticCurveTo(-26, -18, -18, 8); ctx.stroke();
        ctx.restore();
      };
      camper(512, 668, 0.92, -0.04);
      camper(700, 662, 0.86, 0.04);
      camper(828, 674, 0.78, -0.03);
      // 木箱 / 酒桶
      ctx.fillStyle = "#4F3A28"; rr(ctx, 900, 670, 64, 44, 6); ctx.fill();
      ctx.fillStyle = "#6A4B32"; rr(ctx, 908, 678, 48, 6, 3); ctx.fill();
    },
    anim(ctx, t) {
      // 星空呼吸
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 40; i++) {
        const x = (i * 137) % W, y = (i * 71) % 330;
        const a = 0.05 + 0.05 * Math.sin(t * 1.3 + i);
        ctx.fillStyle = `rgba(210,230,255,${a})`;
        ctx.fillRect(x, y, 1.8, 1.8);
      }
      // 海浪
      for (let i = 0; i < 30; i++) {
        const x = (i * 59 + t * 6) % W, y = 480 + (i * 17) % 80;
        ctx.fillStyle = `rgba(150,200,225,${0.04 + 0.03 * Math.sin(t + i)})`;
        ctx.fillRect(x, y, 18 + (i % 4) * 12, 1.6);
      }
      // 串灯呼吸
      const bulbs = [[90, 404], [210, 426], [340, 442], [470, 448], [600, 438], [720, 414], [860, 390], [1010, 378], [1160, 378], [1310, 388], [1460, 402]];
      bulbs.forEach(([x, y], i) => {
        const a = 0.12 + 0.06 * Math.sin(t * 1.8 + i);
        ctx.fillStyle = rad(ctx, x, y, 1, 26, [[0, `rgba(255,190,110,${a})`], [1, "rgba(255,190,110,0)"]]);
        ctx.fillRect(x - 30, y - 30, 60, 60);
      });
      // 营火
      const fl = 0.4 + 0.15 * Math.sin(t * 8) + 0.08 * Math.sin(t * 15);
      ctx.fillStyle = rad(ctx, 610, 690, 4, 160, [[0, `rgba(255,150,60,${fl})`], [1, "rgba(255,120,40,0)"]]);
      ctx.fillRect(430, 520, 360, 260);
      for (let i = 0; i < 6; i++) {
        const fh = 36 + Math.sin(t * 7 + i * 1.7) * 16;
        const fx = 574 + i * 14 + Math.sin(t * 5 + i) * 4;
        const sway = Math.sin(t * 6 + i * 1.3) * 9;
        // 外焰：橙红
        ctx.fillStyle = `rgba(255,108,42,${0.34 + 0.16 * Math.sin(t * 11 + i)})`;
        ctx.beginPath();
        ctx.moveTo(fx - 10, 700);
        ctx.bezierCurveTo(fx - 15, 684, fx - 9, 666, fx + sway * 0.5, 700 - fh);
        ctx.bezierCurveTo(fx + 9, 666, fx + 15, 684, fx + 10, 700);
        ctx.closePath(); ctx.fill();
        // 内焰：黄色
        ctx.fillStyle = `rgba(255,216,112,${0.40 + 0.22 * Math.sin(t * 9 + i)})`;
        ctx.beginPath();
        ctx.moveTo(fx - 5, 700);
        ctx.bezierCurveTo(fx - 7, 688, fx - 4, 676, fx + sway * 0.35, 700 - fh * 0.55);
        ctx.bezierCurveTo(fx + 5, 676, fx + 8, 688, fx + 6, 700);
        ctx.closePath(); ctx.fill();
      }
      // 火星
      for (let i = 0; i < 18; i++) {
        const life = (t * 0.4 + i / 18) % 1;
        const x = 610 + Math.sin(i * 2.7) * 28 + life * 60;
        const y = 676 - life * 180;
        ctx.fillStyle = `rgba(255,190,90,${(1 - life) * 0.45})`;
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      // 萤火虫
      for (let i = 0; i < 16; i++) {
        const x = 80 + ((i * 137 + t * 10) % 1440);
        const y = 500 + Math.sin(t * 0.8 + i) * 40 + (i * 23) % 180;
        ctx.fillStyle = `rgba(200,255,150,${0.2 + 0.15 * Math.sin(t * 2 + i)})`;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
      // 帐篷里的灯在呼吸
      for (const [x, y, r] of [[230, 620, 100], [760, 620, 150], [1060, 640, 100], [1270, 630, 80]]) {
        const a = 0.05 + 0.025 * Math.sin(t * 1.1 + x);
        ctx.fillStyle = rad(ctx, x, y, 4, r, [[0, `rgba(255,190,110,${a})`], [1, "rgba(255,190,110,0)"]]);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  };

  /* ---------------- GitHub：夜市 / 免费摊位 / 屎山 ---------------- */
  function neon(ctx, x, y, text, col, size, vertical) {
    ctx.save();
    ctx.font = `700 ${size || 24}px ${MONO}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = col; ctx.shadowBlur = 22;
    ctx.fillStyle = col;
    if (vertical) {
      const chars = [...text];
      chars.forEach((c, i) => ctx.fillText(c, x, y + i * size * 1.08));
    } else ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function stall(ctx, x, y, w, h, col, sign, glow) {
    // 棚子 + 柜台 + 货
    shade(ctx, x + w / 2, y + h + 8, w * 0.58, 14, 0.35);
    ctx.fillStyle = "#1A1D22"; ctx.fillRect(x + 10, y + 40, w - 20, h - 40);
    ctx.fillStyle = "#29251F"; ctx.fillRect(x, y + h - 46, w, 46);
    ctx.fillStyle = "#3A3026"; ctx.fillRect(x + 12, y + h - 40, w - 24, 5);
    // 遮阳篷
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? col : "#1E2228";
      ctx.beginPath();
      ctx.moveTo(x + (w / 7) * i, y + 26);
      ctx.lineTo(x + (w / 7) * (i + 1), y + 26);
      ctx.lineTo(x + (w / 7) * (i + 1) + 8, y + 58);
      ctx.lineTo(x + (w / 7) * i + 8, y + 58);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#3B2E22"; ctx.fillRect(x - 8, y + 18, w + 16, 12);
    ctx.fillStyle = "rgba(255,225,180,.08)"; ctx.fillRect(x - 8, y + 18, w + 16, 2);
    // 柱子
    ctx.fillStyle = "#2C241C"; ctx.fillRect(x + 15, y + 56, 8, h - 56); ctx.fillRect(x + w - 23, y + 56, 8, h - 56);
    // 货架上的发光盒子
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = glow ? `rgba(90,220,210,${0.25 + i * 0.05})` : "rgba(200,190,170,.16)";
      rr(ctx, x + 34 + i * (w - 68) / 4, y + h - 78, 34, 22, 3); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1;
      rr(ctx, x + 34 + i * (w - 68) / 4, y + h - 78, 34, 22, 3); ctx.stroke();
    }
    // 招牌
    ctx.fillStyle = "#121519"; rr(ctx, x + w * 0.16, y - 4, w * 0.68, 32, 4); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; rr(ctx, x + w * 0.16, y - 4, w * 0.68, 32, 4); ctx.stroke();
    neon(ctx, x + w / 2, y + 12, sign, col, 17, false);
    // 暖光
    if (glow) {
      ctx.fillStyle = rad(ctx, x + w / 2, y + h - 90, 10, w * 0.7, [[0, "rgba(80,220,200,.10)"], [1, "rgba(80,220,200,0)"]]);
      ctx.fillRect(x - 40, y, w + 80, h + 40);
    }
  }

  function bug(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0); ctx.scale(s, s);
    ctx.strokeStyle = "#120F0C"; ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(-3, i * 3); ctx.lineTo(-8, i * 5 - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, i * 3); ctx.lineTo(8, i * 5 - 2); ctx.stroke();
    }
    ctx.fillStyle = "#1A1510"; ctx.beginPath(); ctx.ellipse(0, 0, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0C0907"; ctx.beginPath(); ctx.arc(0, -6, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function shitMountain(ctx) {
    const x = 1236, y = 540;
    // 堆叠的垃圾 / 旧代码块
    const blocks = [
      [0, 120, 132, 44, "#3B3328"], [34, 88, 104, 38, "#4A3A2B"], [8, 154, 160, 54, "#2E2A24"],
      [62, 60, 86, 34, "#51402D"], [96, 132, 118, 42, "#43352A"], [28, 190, 190, 48, "#26231F"]
    ];
    for (const [dx, dy, w, h, col] of blocks) {
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x + dx + 5, y + dy + 6, w, h);
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, h);
      ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1; ctx.strokeRect(x + dx, y + dy, w, h);
      ctx.fillStyle = "rgba(140,180,160,.16)"; ctx.font = `10px ${MONO}`;
      ctx.fillText(["TODO", "FIXME", "deprecated", "legacy", "hack"][Math.floor((dx + dy) / 23) % 5], x + dx + 7, y + dy + 15);
    }
    // 破显示器 / 香蕉皮 / 纸团
    ctx.fillStyle = "#0E1115"; rr(ctx, x + 70, y + 6, 78, 54, 4); ctx.fill();
    ctx.fillStyle = "#2C5A4A"; ctx.fillRect(x + 77, y + 12, 64, 38);
    ctx.fillStyle = "rgba(160,240,210,.25)"; ctx.font = `9px ${MONO}`;
    ctx.fillText("merge?", x + 84, y + 34);
    ctx.strokeStyle = "#A88D3E"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(x + 204, y + 100, 28, 0.2, Math.PI * 1.2); ctx.stroke();
    ctx.fillStyle = "#D8D2C2";
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.translate(x + 20 + i * 22, y + 232 - (i % 2) * 12); ctx.rotate(i * 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // 味道线 / 苍蝇
    ctx.strokeStyle = "rgba(150,190,130,.20)"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) {
        const yy = y - 6 - k * 9 - i * 12;
        const xx = x + 88 + i * 48 + Math.sin(k * 0.7 + i) * 10;
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    }
    // 插在垃圾堆上的小牌子（别盖住 ISSUES 摊位）
    ctx.save(); ctx.translate(x + 202, y + 104); ctx.rotate(-0.08);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(-42, -15, 84, 34);
    ctx.fillStyle = "#D9D2C2"; ctx.fillRect(-46, -19, 84, 34);
    ctx.fillStyle = "#B3261E"; ctx.font = `700 19px ${SANS}`; ctx.textAlign = "center";
    ctx.fillText("屎山", -4, 6);
    ctx.restore(); ctx.textAlign = "left";
  }

  const github = {
    tone: "cold",
    draw(ctx) {
      // 夜色 / 楼
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#080B12"], [0.55, "#0D1119"], [1, "#070A0F"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0F141D";
      ctx.fillRect(0, 0, W, 530);
      // 楼群和窗
      const r = rng(51);
      for (let i = 0; i < 12; i++) {
        const bw = 90 + r() * 130, bh = 200 + r() * 270, bx = i * 145 - 40, by = 530 - bh;
        ctx.fillStyle = i % 2 ? "#11151D" : "#0D1118"; ctx.fillRect(bx, by, bw, bh);
        for (let wy = by + 22; wy < 520; wy += 30) {
          for (let wx = bx + 14; wx < bx + bw - 12; wx += 24) {
            if (r() < 0.38) {
              ctx.fillStyle = r() < 0.15 ? "rgba(255,120,90,.20)" : "rgba(120,190,235,.13)";
              ctx.fillRect(wx, wy, 9, 13);
            }
          }
        }
      }
      // 湿路面
      ctx.fillStyle = lin(ctx, 0, 520, 0, H, [[0, "#20242B"], [0.4, "#14171D"], [1, "#080A0E"]]);
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, 590); ctx.lineTo(800, 500); ctx.lineTo(1600, 590); ctx.lineTo(1600, H); ctx.closePath(); ctx.fill();
      // 路面反光
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 8; i++) {
        const x = 100 + i * 190;
        ctx.fillStyle = lin(ctx, 0, 560, 0, 900, [[0, "rgba(80,200,220,.06)"], [1, "rgba(80,200,220,0)"]]);
        poly(ctx, [[x, 560], [x + 44, 560], [x + 100, 900], [x + 24, 900]]); ctx.fill();
      }
      ctx.restore();
      // 街道尽头的 GitHub 光牌
      ctx.fillStyle = "rgba(8,12,17,.9)"; rr(ctx, 660, 84, 280, 62, 6); ctx.fill();
      ctx.strokeStyle = "rgba(120,240,220,.55)"; ctx.lineWidth = 2; rr(ctx, 660, 84, 280, 62, 6); ctx.stroke();
      neon(ctx, 800, 115, "GITHUB", "#7DEBD5", 34, false);
      // 简笔猫
      ctx.save(); ctx.strokeStyle = "rgba(125,235,213,.8)"; ctx.lineWidth = 3; ctx.shadowColor = "#7DEBD5"; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(800, 190, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(782, 174); ctx.lineTo(774, 154); ctx.lineTo(792, 166); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(818, 174); ctx.lineTo(826, 154); ctx.lineTo(808, 166); ctx.stroke();
      ctx.restore();
      // 四个摊位 + 屎山
      stall(ctx, 54, 452, 330, 200, "#5BD6C0", "FREE", true);
      stall(ctx, 406, 470, 240, 170, "#E0A458", "FORK", false);
      stall(ctx, 948, 462, 250, 176, "#D97757", "MERGE", true);
      stall(ctx, 1200, 446, 350, 202, "#C96A9B", "ISSUES", false);
      shitMountain(ctx);
      // 人群剪影
      const people = [[470, 660], [550, 646], [720, 676], [880, 650], [1000, 664], [1160, 650], [690, 600], [620, 610]];
      for (const [x, y] of people) {
        ctx.fillStyle = "#0A0D11";
        ctx.beginPath(); ctx.arc(x, y - 44, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 10, y - 33, 20, 44);
        ctx.fillRect(x - 10, y + 9, 7, 22);
        ctx.fillRect(x + 3, y + 9, 7, 22);
      }
      // 头顶的线缆 / 小灯
      ctx.strokeStyle = "rgba(10,12,14,.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 250); ctx.quadraticCurveTo(380, 330, 800, 280);
      ctx.quadraticCurveTo(1220, 230, 1600, 300); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const x = 100 + i * 230, y = 280 + Math.sin(i) * 28;
        ctx.fillStyle = "rgba(255,180,100,.6)"; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    },
    anim(ctx, t) {
      // 霓虹呼吸 / 闪断
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const flick = Math.sin(t * 17) > 0.96 ? 0.35 : 1;
      ctx.fillStyle = rad(ctx, 800, 118, 8, 240, [[0, `rgba(125,235,213,${0.8 * flick})`], [1, "rgba(125,235,213,0)"]]);
      ctx.fillRect(560, 40, 480, 200);
      // 摊位光
      for (const [x, y, col] of [[218, 560, "91,214,192"], [1074, 550, "217,119,87"], [1374, 540, "201,106,155"]]) {
        const a = 0.08 + 0.04 * Math.sin(t * 1.4 + x);
        ctx.fillStyle = rad(ctx, x, y, 10, 220, [[0, `rgba(${col},${a})`], [1, `rgba(${col},0)`]]);
        ctx.fillRect(x - 240, y - 180, 480, 360);
      }
      // 水光
      for (let i = 0; i < 26; i++) {
        const x = (i * 67 + t * 7) % W, y = 620 + (i * 29) % 250;
        ctx.fillStyle = `rgba(110,220,225,${0.025 + 0.02 * Math.sin(t + i)})`;
        ctx.fillRect(x, y, 18 + (i % 5) * 12, 1.5);
      }
      ctx.restore();
      // 移动的虫子：屎山上总得有点活物
      for (let i = 0; i < 8; i++) {
        const x = 1260 + ((i * 37 + t * (6 + i % 4)) % 230);
        const y = 590 + (i * 19) % 90 + Math.sin(t * 2 + i) * 4;
        bug(ctx, x, y, 0.8 + (i % 3) * 0.2, t * 0.8 + i);
      }
      // 蒸汽
      for (let i = 0; i < 4; i++) {
        const x = 520 + i * 220 + Math.sin(t * 0.4 + i) * 20;
        const y = 560 - ((t * 18 + i * 60) % 180);
        ctx.fillStyle = rad(ctx, x, y, 2, 60, [[0, "rgba(160,190,190,.035)"], [1, "rgba(160,190,190,0)"]]);
        ctx.fillRect(x - 70, y - 70, 140, 140);
      }
    }
  };

  /* ---------------- NVIDIA：机房大教堂 ---------------- */
  function rack(ctx, x, y, w, h, side) {
    // 机柜侧面 + 正面
    ctx.fillStyle = "#0A1012"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(120,180,160,.14)"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    const face = side ? x + w * 0.16 : x;
    const fw = w * 0.84;
    ctx.fillStyle = "#162326"; ctx.fillRect(face, y + 10, fw, h - 20);
    ctx.strokeStyle = "rgba(130,200,175,.14)"; ctx.lineWidth = 1;
    for (let yy = y + 18; yy < y + h - 16; yy += 15) {
      ctx.beginPath(); ctx.moveTo(face + 6, yy); ctx.lineTo(face + fw - 6, yy); ctx.stroke();
    }
    // 机柜边缘的绿色导光条
    ctx.fillStyle = "rgba(118,185,0,.12)"; ctx.fillRect(face + 2, y + 14, 2, h - 28);
    ctx.fillRect(face + fw - 4, y + 14, 2, h - 28);
    // 散热孔
    ctx.fillStyle = "rgba(0,0,0,.45)";
    for (let yy = y + 24; yy < y + h - 20; yy += 30) {
      for (let xx = face + 10; xx < face + fw - 10; xx += 12) ctx.fillRect(xx, yy, 6, 5);
    }
    // 绿色指示灯座
    ctx.fillStyle = "rgba(20,60,45,.9)";
    for (let yy = y + 28; yy < y + h - 30; yy += 30) {
      ctx.fillRect(face + 7, yy, 4, 4);
      ctx.fillRect(face + fw - 13, yy, 4, 4);
    }
  }

  const nvidia = {
    tone: "cold",
    draw(ctx) {
      // 墙 / 地面
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, "#05090A"], [0.55, "#0A1113"], [1, "#030606"]]);
      ctx.fillRect(0, 0, W, H);
      // 尽头墙
      ctx.fillStyle = "#0B1214"; ctx.fillRect(560, 130, 480, 500);
      ctx.strokeStyle = "rgba(118,185,0,.22)"; ctx.lineWidth = 2; ctx.strokeRect(560, 130, 480, 500);
      // 地面
      ctx.fillStyle = lin(ctx, 0, 560, 0, H, [[0, "#0A1213"], [1, "#030707"]]);
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, 650); ctx.lineTo(800, 540); ctx.lineTo(1600, 650); ctx.lineTo(1600, H); ctx.closePath(); ctx.fill();
      // 地面反光
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = lin(ctx, 0, 540, 0, 900, [[0, "rgba(118,185,0,.06)"], [1, "rgba(118,185,0,0)"]]);
      poly(ctx, [[640, 550], [960, 550], [1180, 900], [420, 900]]); ctx.fill();
      ctx.restore();
      // 天花板拱肋 / 管线
      ctx.strokeStyle = "rgba(120,160,145,.12)"; ctx.lineWidth = 10;
      for (let i = 0; i < 5; i++) {
        const u = 0.12 + i * 0.18;
        const y = 120 * u + 20;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(800, y + 120, 1600, y); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(90,130,115,.18)"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(1600, 70); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 94); ctx.lineTo(1600, 94); ctx.stroke();
      // 两侧机柜
      for (const side of [0, 1]) {
        const x0 = side ? 1080 : 0;
        for (let i = 0; i < 4; i++) {
          const x = x0 + i * 130;
          rack(ctx, x, 220 + i * 22, 122, 430 - i * 22, side);
        }
      }
      // 远端主机 / GPU 祭坛
      ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.fillRect(676, 560, 248, 24);
      ctx.fillStyle = "#0C1516"; ctx.fillRect(670, 404, 260, 158);
      ctx.strokeStyle = "rgba(118,185,0,.42)"; ctx.lineWidth = 2; ctx.strokeRect(670, 404, 260, 158);
      ctx.fillStyle = "#142019"; ctx.fillRect(694, 428, 212, 108);
      ctx.strokeStyle = "rgba(160,220,170,.14)"; ctx.strokeRect(700, 434, 200, 96);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = "rgba(160,220,170,.38)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(738 + i * 62, 482, 23, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(738 + i * 62, 482, 10, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "rgba(200,255,210,.62)"; ctx.font = `11px ${MONO}`; ctx.textAlign = "center";
      ctx.fillText("H100 · 80GB", 800, 448);
      ctx.fillStyle = "rgba(118,185,0,.25)"; ctx.fillRect(694, 550, 212, 4);
      ctx.textAlign = "left";
      // 机柜底部的反光 / 过道尽头的光
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const side of [0, 1]) {
        const x = side ? 1420 : 180;
        ctx.fillStyle = rad(ctx, x, 650, 10, 280, [[0, "rgba(118,185,0,.055)"], [1, "rgba(118,185,0,0)"]]);
        ctx.fillRect(x - 300, 420, 600, 460);
      }
      ctx.fillStyle = rad(ctx, 800, 540, 10, 260, [[0, "rgba(118,185,0,.10)"], [1, "rgba(118,185,0,0)"]]);
      ctx.fillRect(520, 300, 560, 520);
      ctx.restore();
      // 过道两侧的绿色导光条
      ctx.fillStyle = "rgba(118,185,0,.18)";
      poly(ctx, [[470, 672], [482, 672], [398, 900], [380, 900]]); ctx.fill();
      poly(ctx, [[1118, 672], [1130, 672], [1220, 900], [1202, 900]]); ctx.fill();
      ctx.strokeStyle = "rgba(150,220,140,.22)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(470, 672); ctx.lineTo(380, 900); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1130, 672); ctx.lineTo(1220, 900); ctx.stroke();
      // NVIDIA 字
      ctx.save();
      ctx.font = `700 44px ${MONO}`; ctx.textAlign = "center";
      ctx.fillStyle = "rgba(118,185,0,.82)"; ctx.shadowColor = "#76B900"; ctx.shadowBlur = 28;
      ctx.fillText("NVIDIA", 800, 206);
      ctx.shadowBlur = 0; ctx.textAlign = "left";
      ctx.restore();
      // 冷却管
      ctx.strokeStyle = "rgba(100,145,130,.28)"; ctx.lineWidth = 14; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(20, 120); ctx.lineTo(20, 430); ctx.quadraticCurveTo(20, 470, 60, 470); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1580, 120); ctx.lineTo(1580, 430); ctx.quadraticCurveTo(1580, 470, 1540, 470); ctx.stroke();
      // 顶灯
      for (const lx of [400, 800, 1200]) {
        ctx.fillStyle = "rgba(180,245,190,.65)";
        ctx.fillRect(lx - 60, 38, 120, 7);
        ctx.fillStyle = "rgba(180,245,190,.10)";
        poly(ctx, [[lx - 60, 45], [lx + 60, 45], [lx + 130, 510], [lx - 130, 510]]); ctx.fill();
      }
    },
    anim(ctx, t) {
      // 机柜灯：一排排呼吸 / 偶尔跳一下
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const side of [0, 1]) {
        const x0 = side ? 1080 : 0;
        for (let i = 0; i < 4; i++) {
          const x = x0 + i * 130 + 14;
          for (let yy = 238 + i * 22; yy < 620; yy += 17) {
            const on = Math.sin(t * 1.4 + yy * 0.13 + i + side) > -0.15;
            if (!on) continue;
            const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + yy));
            ctx.fillStyle = `rgba(118,185,0,${a})`;
            ctx.fillRect(x, yy, 4, 4);
            ctx.fillRect(x + 94, yy, 4, 4);
            if ((yy + i) % 4 === 0) {
              ctx.fillStyle = `rgba(160,255,170,${a * 0.25})`;
              ctx.fillRect(x - 6, yy - 3, 16, 10);
            }
          }
        }
      }
      // 祭坛绿光
      const glow = 0.16 + 0.06 * Math.sin(t * 1.6);
      ctx.fillStyle = rad(ctx, 800, 500, 10, 230, [[0, `rgba(118,185,0,${glow})`], [1, "rgba(118,185,0,0)"]]);
      ctx.fillRect(560, 260, 480, 460);
      // 扫描光
      const sweep = (t * 0.09) % 1;
      ctx.fillStyle = lin(ctx, 0, 540, 0, 900, [[0, "rgba(160,255,180,0)"], [sweep * 0.65, "rgba(160,255,180,.035)"], [Math.min(1, sweep * 0.65 + 0.12), "rgba(160,255,180,0)"], [1, "rgba(160,255,180,0)"]]);
      ctx.fillRect(0, 540, W, 360);
      // 冷雾
      for (let i = 0; i < 6; i++) {
        const x = 120 + i * 270, y = 560 + Math.sin(t * 0.4 + i) * 20;
        ctx.fillStyle = rad(ctx, x, y, 4, 120, [[0, "rgba(170,210,200,.025)"], [1, "rgba(170,210,200,0)"]]);
        ctx.fillRect(x - 130, y - 70, 260, 160);
      }
      ctx.restore();
      // 风扇 / 指示灯偶尔的亮点
      for (let i = 0; i < 3; i++) {
        const x = 738 + i * 62, y = 482;
        ctx.strokeStyle = `rgba(180,255,190,${0.10 + 0.06 * Math.sin(t * 3 + i)})`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const a = t * 2.4 + i + k * Math.PI * 2 / 3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); ctx.stroke();
        }
        ctx.fillStyle = "rgba(180,255,190,.45)"; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
      // 地板上流动的绿灯倒影
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const x = 430 + i * 148 + Math.sin(t * 0.6 + i) * 10;
        ctx.fillStyle = `rgba(118,185,0,${0.025 + 0.02 * Math.sin(t + i)})`;
        ctx.fillRect(x, 700 + (i % 3) * 42, 70 + (i % 4) * 20, 2);
      }
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
    claude_manor,
    claude_library,
    claude_balcony,
    huggingface,
    github,
    nvidia,
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


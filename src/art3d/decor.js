/* ============================================================
 * Escape A÷ · src/art3d/decor.js —— 房间家具与墙饰
 *
 * 给 “DeepSeek 家里” 这类室内场景补充的家具 / 墙饰构造器。
 * 每个函数只往传入的 Builder 里塞几何体：不碰贴图、不碰 DOM，
 * 也不负责发光 —— 灯罩、窗光、灯晕都由场景自己画。
 *
 * 最终颜色 = 贴图 × 顶点色 × pen.tint，所以这里写的是材质的明暗基准
 * （木器偏暖、布料中性、表盘米色），场景可以整体 tint 成蓝调 / 夜色。
 *
 * 坐标：右手系、Y 向上、1 单位 = 1 米；每个函数的 m 原点见注释。
 * 造型参照 props.js：低多边形 + 一点点手绘感，不追求写实。
 * ============================================================ */
"use strict";

const A3DDecor = (() => {
  const M = A3D.M, G = A3D.Builder.prototype;
  const TAU = Math.PI * 2;

  /* ---------------- 顶点色基准 ----------------
   * 木 / 布 / 金属都留出了让贴图和 tint 说话的余量；
   * 需要场景决定材质的（挂钟外圈），直接用接近白的颜色。 */
  const C = {
    wood:       [0.80, 0.64, 0.47],
    woodLit:    [0.94, 0.78, 0.59],
    woodDark:   [0.56, 0.42, 0.29],
    fabric:     [0.68, 0.70, 0.74],
    fabricLit:  [0.82, 0.84, 0.88],
    fabricDark: [0.50, 0.52, 0.57],
    fabricEdge: [0.88, 0.80, 0.63],
    metal:      [0.66, 0.66, 0.68],
    metalLit:   [0.84, 0.84, 0.86],
    metalDark:  [0.36, 0.36, 0.38],
    rim:        [0.96, 0.96, 0.96],
    ink:        [0.10, 0.10, 0.12],
    dark:       [0.16, 0.16, 0.18],
    shade:      [1.10, 1.00, 0.82],
    shadeRim:   [0.62, 0.52, 0.36],
    bulb:       [1.20, 1.08, 0.82],
    face:       [1.04, 0.98, 0.84],
    faceInner:  [0.84, 0.78, 0.64],
    faceRing:   [0.62, 0.56, 0.44],
    pinRed:     [2.60, 0.78, 0.60],
    pinBlue:    [0.80, 1.45, 2.60],
    pinYellow:  [2.60, 1.90, 0.62],
    pinGreen:   [0.90, 2.40, 1.10]
  };

  /** m 之后再叠一层局部变换（参数顺序同 M.trs） */
  const at = (m, x, y, z, rx, ry, rz, sx, sy, sz) =>
    M.mul(m, M.trs(x, y, z, rx, ry, rz, sx, sy, sz));

  /* ---------------- 通用零件 ---------------- */

  /** 圆润的软垫：压扁的椭球，y0..y1 是上下表面，hw / hd 是半宽 / 半深 */
  function plush(b, m, x, y0, y1, z, hw, hd, col, segU, segV) {
    b.sphere.call(b, at(m, x, (y0 + y1) / 2, z, 0, 0, 0, hw, (y1 - y0) / 2, hd),
      1, segU || 16, segV || 9, col);
  }

  /** 四角可各自带色的四边形（p0 左下 → p1 右下 → p2 右上 → p3 左上） */
  function quadVC(b, m, p0, p1, p2, p3, c0, c1, c2, c3, t0, t1, t2, t3) {
    const nm = M.normalMat(m);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const P = [p0, p1, p2, p3], K = [c0, c1, c2, c3], U = [t0, t1, t2, t3];
    for (let i = 0; i < 4; i++) {
      const p = P[i], c = K[i], t = U[i];
      b._v(b.d, m, nm, p[0], p[1], p[2], nx, ny, nz, t[0], t[1], c, 0);
    }
    b._pushQuad(b.count - 4);
  }

  /** 水平圆环带（法线朝上），y 是离 m 原点的高度 */
  function flatRing(b, m, y, r0, r1, seg, col) {
    const mm = M.mul(m, M.trs(0, y, 0));
    const nm = M.normalMat(mm);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const P = [
        [c0 * r1, 0, s0 * r1], [c0 * r0, 0, s0 * r0],
        [c1 * r0, 0, s1 * r0], [c1 * r1, 0, s1 * r1]
      ];
      const u0 = (i / seg) * 4, u1 = ((i + 1) / seg) * 4;
      const U = [[u0, 1], [u0, 0], [u1, 0], [u1, 1]];
      for (let k = 0; k < 4; k++)
        b._v(b.d, mm, nm, P[k][0], P[k][1], P[k][2], 0, 1, 0, U[k][0], U[k][1], col, 0);
      b._pushQuad(b.count - 4);
    }
  }

  /** 朝 +Z 的薄圆环（挂钟的内圈 / 盘沿） */
  function ringZ(b, m, z, r0, r1, seg, col) {
    const mm = M.mul(m, M.trs(0, 0, z));
    const nm = M.normalMat(mm);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const P = [
        [c0 * r0, s0 * r0, 0], [c1 * r0, s1 * r0, 0],
        [c1 * r1, s1 * r1, 0], [c0 * r1, s0 * r1, 0]
      ];
      const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let k = 0; k < 4; k++)
        b._v(b.d, mm, nm, P[k][0], P[k][1], P[k][2], 0, 0, 1, U[k][0], U[k][1], col, 0);
      b._pushQuad(b.count - 4);
    }
  }

  /** 挂钟指针；angle 是从 12 点顺时针算的角度 */
  function hand(b, m, angle, len, wid, dep, z) {
    const mm = at(m, 0, 0, z, 0, 0, -angle);
    // 指针本体：从轴心往外伸，中心留一点余量
    G.box.call(b, at(mm, 0, len / 2 - 0.012, 0), wid, len, dep, C.ink, 1);
    // 另一侧的短尾巴（配重），让指针不像贴在表盘上的纸片
    G.box.call(b, at(mm, 0, -0.03, 0), wid * 0.85, 0.048, dep * 0.85, C.ink, 1);
  }

  /* ============================================================
   *  坐具
   * ============================================================ */

  /** 沙发 / 扶手椅共用骨架：m 原点在落地中心，正面朝 +Z */
  function seating(bWood, bFabric, m, w, d, seats, armW, armTop, seatTop, backTop) {
    const legH = 0.08;

    /* 四条木脚：下粗上细 */
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -1 : 1;
      const sz = i % 2 ? 1 : -1;
      bWood.cyl.call(bWood,
        at(m, sx * (w / 2 - 0.16), 0, sz * (d / 2 - 0.15)),
        0.05, 0.034, legH + 0.004, 8, C.woodDark, true);
    }

    /* 底座横板 + 坐面基板 */
    G.box.call(bFabric, at(m, 0, legH + 0.06, 0), w - 0.10, 0.12, d - 0.08, C.fabricDark, 1.2);
    G.box.call(bFabric, at(m, 0, 0.235, 0.012), w - 0.18, 0.11, d - 0.20, C.fabric, 1.2);

    /* 坐垫：压扁的椭球，坐面高度 = seatTop */
    const innerW = w - armW * 2 - 0.05;
    const gap = 0.028;
    const cw = (innerW - gap * (seats - 1)) / seats;
    const cd = d - 0.30;
    for (let i = 0; i < seats; i++) {
      const cx = -innerW / 2 + cw / 2 + i * (cw + gap);
      plush(bFabric, m, cx, seatTop - 0.15, seatTop, 0.055, cw / 2, cd / 2,
        i % 2 ? C.fabric : C.fabricLit, 16, 9);
    }

    /* 扶手：方板 + 顶上的一根圆棍 */
    const armD = d;
    for (const sx of [-1, 1]) {
      const ax = sx * (w / 2 - armW / 2);
      G.box.call(bFabric, at(m, ax, (armTop + 0.04) / 2, 0),
        armW, armTop - 0.16, armD, C.fabric, 1.3);
      bFabric.cyl.call(bFabric, at(m, ax, armTop - 0.062, -armD / 2, Math.PI / 2, 0, 0),
        0.062, 0.056, armD, 12, C.fabricLit, true);
      // 外侧一道压线
      G.box.call(bFabric, at(m, ax + sx * (armW / 2 + 0.002), armTop - 0.20, 0),
        0.006, Math.max(0.04, armTop - 0.30), armD * 0.82, C.fabricDark, 1.4);
    }

    /* 靠背：厚背板 + 顶上的圆卷 + 软枕。背板后沿和扶手后沿齐平 */
    const backW = w - armW * 2 + 0.02;
    const backZ = -d / 2 + 0.095;
    const rollR = 0.07;
    G.box.call(bFabric, at(m, 0, (0.10 + backTop - rollR) / 2, backZ),
      backW, backTop - rollR - 0.10, 0.19, C.fabric, 1.1);
    bFabric.cyl.call(bFabric, at(m, -backW / 2, backTop - rollR, backZ, 0, 0, -Math.PI / 2),
      rollR, rollR, backW, 14, C.fabricLit, true);
    const bpW = innerW / seats - 0.03;
    for (let i = 0; i < seats; i++) {
      const cx = -innerW / 2 + bpW / 2 + i * (innerW / seats);
      const y0 = seatTop - 0.10;
      const y1 = backTop - 0.09;
      bFabric.sphere.call(bFabric,
        at(m, cx, (y0 + y1) / 2, backZ + 0.155, -0.12, 0, 0, bpW / 2, (y1 - y0) / 2, 0.085),
        1, 14, 8, C.fabricLit);
    }
  }

  /** 双人沙发（默认 1.8 × 0.9 × 0.8m）：m 原点在落地中心，正面朝 +Z */
  function sofa(bWood, bFabric, m, w = 1.8, d = 0.9) {
    seating(bWood, bFabric, m, w, d, 2, 0.16, 0.54, 0.42, 0.80);
  }

  /** 单人扶手椅（约 0.85 × 0.85 × 0.9m）：m 原点在落地中心，正面朝 +Z */
  function armchair(bWood, bFabric, m) {
    seating(bWood, bFabric, m, 0.85, 0.85, 1, 0.15, 0.60, 0.44, 0.90);
  }

  /** 圆脚凳 / 蒲团（r≈0.3m，高≈0.4m）：m 原点在落地中心 */
  function ottoman(bFabric, m) {
    const r = 0.30, top = 0.40;

    /* 贴地的收口 */
    bFabric.cyl.call(bFabric, at(m, 0, 0, 0), r * 0.80, r * 0.88, 0.035, 20, C.fabricDark, true);
    /* 鼓起来的主体 */
    bFabric.cyl.call(bFabric, at(m, 0, 0.035, 0), r * 0.88, r, 0.16, 24, C.fabric, false);
    bFabric.cyl.call(bFabric, at(m, 0, 0.195, 0), r, r * 0.985, 0.075, 24, C.fabric, false);
    /* 顶面软包 */
    plush(bFabric, m, 0, 0.24, top, 0, r, r, C.fabricLit, 22, 9);
    /* 腰线 */
    bFabric.torus.call(bFabric, at(m, 0, 0.245, 0), r * 0.995, 0.012, 24, 6, C.fabricDark);
    /* 顶上的拉扣 */
    const half = (top - 0.24) / 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.5;
      const rr = i === 0 ? 0 : r * 0.44;
      const k = Math.sqrt(Math.max(0, 1 - (rr / r) * (rr / r)));
      const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
      const py = 0.24 + half + half * k - 0.006;
      bFabric.sphere.call(bFabric, at(m, px, py, pz, 0, 0, 0, 1, 0.7, 1), 0.016, 8, 5, C.fabricDark);
    }
  }

  /* ============================================================
   *  桌 / 灯 / 墙架
   * ============================================================ */

  /** 矮茶几（桌面在 y=h）：m 原点在落地中心 */
  function coffeeTable(bWood, m, w = 1.1, d = 0.6, h = 0.42) {
    const topT = 0.055;
    const legH = h - topT;
    const legR = 0.034;

    /* 桌面：上表面正好落在 y = h */
    G.box.call(bWood, at(m, 0, h - topT / 2, 0), w, topT, d, C.woodLit, 1.1);

    /* 桌沿下的围板 */
    const apronY = h - topT - 0.03;
    for (const sz of [-1, 1]) {
      G.box.call(bWood, at(m, 0, apronY, sz * (d / 2 - 0.075)),
        w - 0.18, 0.06, 0.024, C.wood, 1.5);
    }
    for (const sx of [-1, 1]) {
      G.box.call(bWood, at(m, sx * (w / 2 - 0.075), apronY, 0),
        0.024, 0.06, d - 0.18, C.wood, 1.5);
    }

    /* 四条圆腿 */
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -1 : 1;
      const sz = i % 2 ? 1 : -1;
      bWood.cyl.call(bWood, at(m, sx * (w / 2 - 0.10), 0, sz * (d / 2 - 0.10)),
        legR, legR * 0.82, legH, 9, C.wood, true);
    }

    /* 下层搁板 */
    G.box.call(bWood, at(m, 0, Math.min(0.14, h * 0.3), 0), w - 0.24, 0.026, d - 0.24, C.woodDark, 1.6);
  }

  /** 落地灯（底座半径 0.18m）：m 原点在落地中心 */
  function floorLamp(bMetal, bShade, m, h = 1.55) {
    const baseR = 0.18;
    const topY = h - 0.03;
    const shadeZ = 0.26;
    const shadeH = 0.24;

    /* 三颗脚垫 + 配重底盘：真正落地 */
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.35;
      bMetal.cyl.call(bMetal, at(m, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12),
        0.026, 0.026, 0.016, 8, C.dark, true);
    }
    bMetal.cyl.call(bMetal, at(m, 0, 0.016, 0), baseR, baseR * 0.9, 0.03, 22, C.metal, true);
    bMetal.cyl.call(bMetal, at(m, 0, 0.046, 0), 0.06, 0.045, 0.026, 12, C.metalLit, true);

    /* 弯杆：先竖直，再朝房间方向探出去 */
    const pts = [
      [0, 0.05, 0],
      [0, h * 0.26, 0.002],
      [0.004, h * 0.50, 0.012],
      [0.014, h * 0.68, 0.045],
      [0.026, h * 0.82, 0.105],
      [0.024, h * 0.91, 0.175],
      [0.010, h * 0.965, 0.235],
      [0, topY + 0.01, shadeZ - 0.005]
    ];
    bMetal.tube.call(bMetal, m, pts, i => 0.017 - 0.006 * i, 6, C.metal);

    /* 灯罩：只是几何体，不发光（光晕由场景另画） */
    const shadeY = topY - shadeH;
    bShade.cyl.call(bShade, at(m, 0, shadeY, shadeZ), 0.175, 0.085, shadeH, 22, C.shade, false);
    bShade.torus.call(bShade, at(m, 0, shadeY, shadeZ), 0.175, 0.009, 22, 6, C.shadeRim);
    bShade.torus.call(bShade, at(m, 0, topY, shadeZ), 0.086, 0.006, 18, 5, C.shadeRim);
    bShade.sphere.call(bShade, at(m, 0, shadeY + 0.085, shadeZ), 0.032, 10, 6, C.bulb);

    /* 灯罩边垂下来的拉绳 */
    bMetal.tube.call(bMetal, m, [
      [0.13, shadeY + 0.012, shadeZ + 0.10],
      [0.135, shadeY - 0.045, shadeZ + 0.105],
      [0.13, shadeY - 0.085, shadeZ + 0.10]
    ], 0.0035, 4, C.metalLit);
    bMetal.sphere.call(bMetal, at(m, 0.13, shadeY - 0.10, shadeZ + 0.10), 0.011, 8, 5, C.metalLit);
  }

  /** 墙上置物架：m 原点在架子中心贴墙处，向 +Z 伸出 */
  function wallShelf(bWood, m, w = 1.2, h = 0.8, d = 0.22, n = 2) {
    n = Math.max(1, n | 0);
    const t = 0.035;              // 层板厚
    const drop = 0.16;            // 支架向下伸出的高度
    const yTop = h / 2 - t / 2;
    const yBot = -h / 2 + drop + t / 2;
    const ys = [];
    if (n === 1) ys.push(h / 2 - drop - t / 2);
    else for (let i = 0; i < n; i++) ys.push(yBot + (yTop - yBot) * (i / (n - 1)));

    for (let i = 0; i < ys.length; i++) {
      const y = ys[i];

      /* 层板 + 前沿圆角 */
      G.box.call(bWood, at(m, 0, y, d / 2), w, t, d, C.woodLit, 1.3);
      bWood.cyl.call(bWood, at(m, -w / 2, y + t / 2 - 0.011, d - 0.011, 0, 0, -Math.PI / 2),
        0.011, 0.011, w, 6, C.wood, true);

      /* 贴墙的承托木条（在层板下面，露在缝里） */
      G.box.call(bWood, at(m, 0, y - t / 2 - 0.0225, 0.015),
        w - 0.05, 0.045, 0.03, C.woodDark, 1.6);

      /* 两个小斜撑 */
      for (const sx of [-1, 1]) {
        const bx = sx * (w / 2 - 0.12);
        const z0 = 0.018, z1 = d * 0.74;
        const y0 = y - drop, y1 = y - t / 2;
        const len = Math.hypot(z1 - z0, y1 - y0);
        const ang = Math.atan2(z1 - z0, y1 - y0);
        G.box.call(bWood, at(m, bx, (y0 + y1) / 2, (z0 + z1) / 2, ang, 0, 0),
          0.032, len, 0.028, C.wood, 1.8);
      }
    }
  }

  /* ============================================================
   *  墙饰
   * ============================================================ */

  /** 画框：m 原点在画框中心贴墙处，朝 +Z；画芯用 bArt（贴图由场景绑定） */
  function pictureFrame(bFrame, bArt, m, w = 0.5, h = 0.4) {
    const bw = Math.min(0.06, Math.min(w, h) * 0.14);   // 框条宽
    const dep = 0.05;                                   // 框的厚度（凸出墙面）

    /* 背板：贴墙 */
    G.box.call(bFrame, at(m, 0, 0, 0.011), w - 0.012, h - 0.012, 0.022, C.woodDark, 1.4);

    /* 画芯：朝 +Z 的 quad，比洞口略大一圈，塞进框条下面 */
    G.quad.call(bArt, at(m, 0, 0, 0.024),
      w - bw * 2 + 0.028, h - bw * 2 + 0.028, [1, 1, 1], [0, 0, 1, 1]);

    /* 四条厚框条 */
    const zc = dep / 2 + 0.002;
    G.box.call(bFrame, at(m, 0, h / 2 - bw / 2, zc), w, bw, dep, C.wood, 1.3);
    G.box.call(bFrame, at(m, 0, -h / 2 + bw / 2, zc), w, bw, dep, C.wood, 1.3);
    G.box.call(bFrame, at(m, -w / 2 + bw / 2, 0, zc), bw, h - bw * 2, dep, C.wood, 1.3);
    G.box.call(bFrame, at(m, w / 2 - bw / 2, 0, zc), bw, h - bw * 2, dep, C.wood, 1.3);

    /* 内侧一圈浅色斜口，显出框的厚度 */
    const lip = 0.011;
    const innerW = w - bw * 2, innerH = h - bw * 2;
    G.box.call(bFrame, at(m, 0, innerH / 2 - lip / 2, 0.036), innerW, lip, 0.026, C.woodLit, 1.6);
    G.box.call(bFrame, at(m, 0, -innerH / 2 + lip / 2, 0.036), innerW, lip, 0.026, C.woodLit, 1.6);
    G.box.call(bFrame, at(m, -innerW / 2 + lip / 2, 0, 0.036), lip, innerH, 0.026, C.woodLit, 1.6);
    G.box.call(bFrame, at(m, innerW / 2 - lip / 2, 0, 0.036), lip, innerH, 0.026, C.woodLit, 1.6);
  }

  /** 软木板：m 原点在板中心贴墙处，朝 +Z；便签由场景另放 */
  function corkboard(bFrame, bBoard, m, w = 1.1, h = 0.8) {
    const bw = 0.06, dep = 0.05;

    /* 背板（只露出侧边） */
    G.box.call(bFrame, at(m, 0, 0, 0.014), w - 0.02, h - 0.02, 0.028, C.woodDark, 1.2);

    /* 软木板面：朝 +Z 的 quad，四周塞进木框下面 */
    G.quad.call(bBoard, at(m, 0, 0, 0.032),
      w - bw * 2 + 0.06, h - bw * 2 + 0.06, [1, 1, 1], [0, 0, 1, 1]);

    /* 木框 */
    const zc = 0.03;
    G.box.call(bFrame, at(m, 0, h / 2 - bw / 2, zc), w, bw, dep, C.wood, 1.3);
    G.box.call(bFrame, at(m, 0, -h / 2 + bw / 2, zc), w, bw, dep, C.wood, 1.3);
    G.box.call(bFrame, at(m, -w / 2 + bw / 2, 0, zc), bw, h - bw * 2, dep, C.wood, 1.3);
    G.box.call(bFrame, at(m, w / 2 - bw / 2, 0, zc), bw, h - bw * 2, dep, C.wood, 1.3);

    /* 内圈木条，压住软木板边缘 */
    const lip = 0.008;
    const innerW = w - bw * 2, innerH = h - bw * 2;
    G.box.call(bFrame, at(m, 0, innerH / 2 - lip / 2, 0.038), innerW, lip, 0.02, C.woodLit, 1.8);
    G.box.call(bFrame, at(m, 0, -innerH / 2 + lip / 2, 0.038), innerW, lip, 0.02, C.woodLit, 1.8);
    G.box.call(bFrame, at(m, -innerW / 2 + lip / 2, 0, 0.038), lip, innerH, 0.02, C.woodLit, 1.8);
    G.box.call(bFrame, at(m, innerW / 2 - lip / 2, 0, 0.038), lip, innerH, 0.02, C.woodLit, 1.8);

    /* 几颗图钉（钉帽 + 一点点钉尖） */
    const pins = [
      [-0.31, 0.20, C.pinRed],
      [0.22, 0.26, C.pinBlue],
      [0.36, -0.16, C.pinYellow],
      [-0.12, -0.24, C.pinGreen],
      [0.05, 0.04, C.pinRed]
    ];
    for (let i = 0; i < pins.length; i++) {
      const px = pins[i][0] * w, py = pins[i][1] * h, col = pins[i][2];
      bFrame.sphere.call(bFrame, at(m, px, py, 0.041, 0, 0, 0, 1, 1, 0.55), 0.014, 8, 5, col);
      bFrame.cyl.call(bFrame, at(m, px, py, 0.033, Math.PI / 2, 0, 0), 0.004, 0.004, 0.016, 6, col, true);
    }
  }

  /** 挂钟：m 原点在钟面中心贴墙处，朝 +Z；没有秒针 */
  function wallClock(bRim, bFace, m, r = 0.22) {
    const seg = 26;
    const faceZ = 0.0485;      // 表盘后表面

    /* 外壳：从墙面伸出来的厚圆盘，材质交给 bRim 的 pen */
    bRim.cyl.call(bRim, at(m, 0, 0, 0, Math.PI / 2, 0, 0), r, r * 0.97, 0.048, seg, C.rim, true);

    /* 外圈：一圈凸起的木 / 铜边 */
    bRim.torus.call(bRim, at(m, 0, 0, 0.048, Math.PI / 2, 0, 0), r * 0.945, 0.016, 24, 7, C.rim);

    /* 米色表盘 */
    bFace.cyl.call(bFace, at(m, 0, 0, faceZ, Math.PI / 2, 0, 0),
      r * 0.88, r * 0.88, 0.006, seg, C.face, true);

    /* 稍暗的内圈 + 一圈描边 */
    bFace.cyl.call(bFace, at(m, 0, 0, faceZ + 0.0065, Math.PI / 2, 0, 0),
      r * 0.56, r * 0.56, 0.0015, 24, C.faceInner, true);
    ringZ(bFace, m, faceZ + 0.0095, r * 0.56, r * 0.60, 24, C.faceRing);

    /* 12 个刻度：3 / 6 / 9 / 12 更长更粗 */
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const major = i % 3 === 0;
      const rr = r * 0.70;
      const len = major ? r * 0.28 : r * 0.17;
      const wid = major ? r * 0.075 : r * 0.048;
      G.box.call(bRim, at(m, Math.sin(a) * rr, Math.cos(a) * rr, faceZ + 0.0098, 0, 0, -a),
        wid, len, 0.006, C.ink, 1);
    }

    /* 时针 / 分针：10:10 */
    const aH = (10 + 10 / 60) / 12 * TAU;   // 短针指 10
    const aM = (10 / 60) * TAU;             // 长针指 2
    hand(bRim, m, aH, r * 0.50, r * 0.105, 0.006, faceZ + 0.0135);
    hand(bRim, m, aM, r * 0.75, r * 0.075, 0.006, faceZ + 0.0155);

    /* 中心轴盖：圆柱 + 一个小圆顶 */
    bRim.cyl.call(bRim, at(m, 0, 0, faceZ + 0.0183, Math.PI / 2, 0, 0),
      0.024, 0.017, 0.009, 12, C.metal, true);
    bRim.sphere.call(bRim, at(m, 0, 0, faceZ + 0.0273, 0, 0, 0, 1, 1, 0.5),
      0.016, 8, 5, C.metal);
  }

  /* ============================================================
   *  软装
   * ============================================================ */

  /** 圆形猫窝 / 软垫（r≈0.35m，高 0.12m）：m 原点在地面中心 */
  function catBed(bFabric, m) {
    const r = 0.35;

    /* 贴地的底垫 */
    bFabric.cyl.call(bFabric, at(m, 0, 0, 0), r * 0.94, r * 0.97, 0.018, 24, C.fabricDark, true);

    /* 中间的软垫 */
    plush(bFabric, m, 0, 0.012, 0.072, 0, r * 0.83, r * 0.83, C.fabricLit, 20, 8);

    /* 外圈鼓边：一圈环面就是猫窝的抱枕圈，最高 0.12m */
    bFabric.torus.call(bFabric, at(m, 0, 0.062, 0), r * 0.834, 0.058, 26, 8, C.fabric);

    /* 外沿滚边 */
    bFabric.torus.call(bFabric, at(m, 0, 0.02, 0), r * 0.965, 0.007, 26, 5, C.fabricDark);
  }

  /** 窗帘单片：m 原点在窗帘顶部中心贴墙处，向下垂 h；朝 +Z */
  function curtain(bFabric, m, w = 0.45, h = 1.8) {
    const folds = 7;                 // 7 道褶
    const cols = folds * 2 + 1;      // 每道褶两个采样点（凹 / 脊交错）
    const rows = [0, 0.44, 0.90, 0.945, 1];
    const zBase = 0.032;
    const amp0 = 0.030;

    /* 布面：一条条竖褶。x 向下摆收 7.5%，褶皱幅度越往下越大 */
    const xAt = (u, v) => (u - 0.5) * w * (1 - 0.075 * v);
    const zAt = (u, v, ridge) => zBase + (amp0 + 0.014 * v) * ridge;
    const cAt = (u, v, ridge) => {
      const k = (0.70 + 0.34 * ridge) * (1 - 0.10 * v) * (v > 0.93 ? 0.82 : 1);
      return [C.fabric[0] * k, C.fabric[1] * k, C.fabric[2] * k];
    };

    for (let r0 = 0; r0 < rows.length - 1; r0++) {
      const v0 = rows[r0], v1 = rows[r0 + 1];
      for (let i = 0; i < cols - 1; i++) {
        const u0 = i / (cols - 1), u1 = (i + 1) / (cols - 1);
        const k0 = i % 2, k1 = (i + 1) % 2;      // 0 = 凹槽，1 = 脊
        const p0 = [xAt(u0, v1), -h * v1, zAt(u0, v1, k0)];
        const p1 = [xAt(u1, v1), -h * v1, zAt(u1, v1, k1)];
        const p2 = [xAt(u1, v0), -h * v0, zAt(u1, v0, k1)];
        const p3 = [xAt(u0, v0), -h * v0, zAt(u0, v0, k0)];
        const c0 = cAt(u0, v1, k0), c1 = cAt(u1, v1, k1);
        const c2 = cAt(u1, v0, k1), c3 = cAt(u0, v0, k0);
        const t0 = [u0 * 2.4, v1 * 2.2], t1 = [u1 * 2.4, v1 * 2.2];
        const t2 = [u1 * 2.4, v0 * 2.2], t3 = [u0 * 2.4, v0 * 2.2];
        quadVC(bFabric, m, p0, p1, p2, p3, c0, c1, c2, c3, t0, t1, t2, t3);
      }
    }

    /* 顶部的杆和环（和布同一支笔，颜色压暗一点） */
    const rodY = 0.028, rodZ = 0.052;
    bFabric.cyl.call(bFabric, at(m, -(w / 2 + 0.07), rodY, rodZ, 0, 0, -Math.PI / 2),
      0.011, 0.011, w + 0.14, 8, C.metalDark, true);
    const ringN = 6;
    for (let i = 0; i < ringN; i++) {
      const rx = -w / 2 + (i + 0.5) * (w / ringN);
      bFabric.torus.call(bFabric, at(m, rx, rodY, rodZ, 0, 0, Math.PI / 2),
        0.024, 0.0045, 10, 5, C.metal);
    }
  }

  /** 圆形地毯（平放在 y=0，m 原点在地面中心） */
  function roundRug(bFabric, m, r = 1.2) {
    const seg = 30;

    /* 底下一层稍微深一点，做出包边 */
    bFabric.cyl.call(bFabric, at(m, 0, 0, 0), r, r * 0.995, 0.012, seg, C.fabricDark, true);
    /* 主毯面 */
    bFabric.cyl.call(bFabric, at(m, 0, 0.012, 0), r * 0.965, r * 0.965, 0.007, seg, C.fabric, true);
    /* 外圈织边 + 里面一圈细纹 */
    flatRing(bFabric, m, 0.021, r * 0.82, r * 0.955, seg, C.fabricEdge);
    flatRing(bFabric, m, 0.021, r * 0.30, r * 0.36, seg, C.fabricEdge);
    /* 中心小圆 */
    bFabric.cyl.call(bFabric, at(m, 0, 0.021, 0), r * 0.22, r * 0.22, 0.004, 24, C.fabricLit, true);
  }

  return {
    sofa, armchair, ottoman, coffeeTable, floorLamp, wallShelf,
    pictureFrame, corkboard, catBed, curtain, roundRug, wallClock
  };
})();

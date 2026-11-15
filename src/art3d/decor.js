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

  const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  /* 贴面薄片（滚边 / 缝线 / 折口）统一沿母面法线抬离 4mm，
   * 否则零厚度条带与母面共面会 z-fighting、边缘闪烁。 */
  const SURF_LIFT = 0.004;
  const lift = (p, n, L) => [p[0] + n[0] * L, p[1] + n[1] * L, p[2] + n[2] * L];

  const BLANKET_VF = 0.86;   // 被子纵向参数里「顶面段」占比；翻边要靠它换算贴面高度

  /** 被面的蓬松高度：低频拱起 + 沿床长的起伏 + 细褶，u 横跨顶面 0..1，
   *  v 是被子全局纵向 0..1。被头翻边也用这条曲线，才能始终贴在被面上不穿模。 */
  function bedPuff(u, v) {
    const edge = smooth01(u / 0.12) * smooth01((1 - u) / 0.12);
    const dome = 0.024 * Math.sin(Math.PI * u);
    const swell = 0.010 * Math.sin(v * Math.PI * 1.3 + 0.5);
    const wr = 0.009 * Math.sin(u * Math.PI * 2.3 + v * 2.6)
             + 0.006 * Math.sin(v * Math.PI * 3.4 - u * 1.6);
    return 0.032 + dome + swell + wr * (0.35 + 0.65 * edge);
  }

  /** 被子：盖住床垫顶面、两侧和床尾垂下去的一张布（不是椭球）。
   *  s 横跨（左垂边 → 顶面 → 右垂边），v 纵跨（被头 → 床尾垂边）；
   *  顶面有轻微蓬松和褶皱，垂边带竖向折痕，法线用相邻差分平滑。 */
  function blanket(b, m, w, matTop, zHead, zFoot) {
    const hwB = w / 2 - 0.02;            // 顶面半宽，比床垫略宽，搭过边
    const skirtW = 0.05, skirtY = 0.24;  // 侧垂边外扩 / 下摆高度
    const footExt = 0.12, footDrop = 0.16;
    const sL = 0.16, vF = BLANKET_VF;    // 垂边在横 / 纵截面里占的参数比例
    const cols = 22, rows = 18;
    const P = (s, v) => {
      let x, y, k;
      const hemT = s < sL ? s / sL : s > 1 - sL ? (1 - s) / sL : 1;
      const hem = 0.009 * Math.sin(v * Math.PI * 4.2 + s * 5.0) * (1 - hemT);  // 下摆轻微波浪
      if (s < sL) {                      // 左垂边（t: 0 下摆 → 1 顶沿）
        const t = s / sL;
        x = -(hwB + skirtW * Math.sin((1 - t) * Math.PI / 2));
        y = skirtY + (matTop + bedPuff(0, v) - skirtY) * (1 - Math.cos(t * Math.PI / 2));
        k = 0.70 + 0.30 * t;
      } else if (s > 1 - sL) {           // 右垂边
        const t = (1 - s) / sL;
        x = hwB + skirtW * Math.sin((1 - t) * Math.PI / 2);
        y = skirtY + (matTop + bedPuff(1, v) - skirtY) * (1 - Math.cos(t * Math.PI / 2));
        k = 0.70 + 0.30 * t;
      } else {                           // 顶面
        const u = (s - sL) / (1 - 2 * sL);
        x = -hwB + 2 * hwB * u;
        y = matTop + bedPuff(u, v);
        k = 1.0 + 0.035 * Math.sin(u * Math.PI * 2.3 + v * 2.6);
      }
      let z, kk = k;
      if (v <= vF) {
        z = zHead + (zFoot - zHead) * (v / vF);
      } else {                           // 床尾垂边
        const t = (v - vF) / (1 - vF);
        z = zFoot + footExt * Math.sin(t * Math.PI / 2);
        y -= footDrop * (1 - Math.cos(t * Math.PI / 2));
        kk *= 1 - 0.22 * t;
      }
      const crease = (s < sL || s > 1 - sL) ? 0.008 * Math.sin(v * Math.PI * 5.0) : 0;
      return { p: [x + (x < 0 ? -crease : crease), y + hem, z], k: kk };
    };

    const grid = [];
    for (let i = 0; i <= cols; i++) {
      grid[i] = [];
      for (let j = 0; j <= rows; j++) grid[i][j] = P(i / cols, j / rows);
    }
    const N = (i, j) => {
      const a = grid[Math.min(cols, i + 1)][j].p, b0 = grid[Math.max(0, i - 1)][j].p;
      const c = grid[i][Math.min(rows, j + 1)].p, d0 = grid[i][Math.max(0, j - 1)].p;
      const tx = a[0] - b0[0], ty = a[1] - b0[1], tz = a[2] - b0[2];
      const ux = c[0] - d0[0], uy = c[1] - d0[1], uz = c[2] - d0[2];
      let nx = uy * tz - uz * ty, ny = uz * tx - ux * tz, nz = ux * ty - uy * tx;
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    };
    const nm = M.normalMat(m);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
          const g = grid[ii][jj], n = N(ii, jj);
          b._v(b.d, m, nm, g.p[0], g.p[1], g.p[2], n[0], n[1], n[2],
            (ii / cols) * 2.0, (jj / rows) * 2.4, [g.k * 1.35, g.k * 1.35, g.k * 1.42], 0);
        }
        b._pushQuad(b.count - 4);
      }
    }
    /* 下摆滚边：沿左垂边 → 床尾 → 右垂边的一道暗色窄包边。
     *  用模块级的 lift() 沿被面法线抬离，避免与被面共面 z-fighting。 */
    const hemPts = [], hemOff = [];
    const inward = (outer, inner) => [
      (inner[0] - outer[0]) * 0.42, (inner[1] - outer[1]) * 0.42, (inner[2] - outer[2]) * 0.42
    ];
    for (let j = 0; j <= rows; j++) {
      const p = grid[0][j].p;
      hemPts.push(lift(p, N(0, j), SURF_LIFT)); hemOff.push(inward(p, grid[1][j].p));
    }
    for (let i = 1; i <= cols; i++) {
      const p = grid[i][rows].p;
      hemPts.push(lift(p, N(i, rows), SURF_LIFT)); hemOff.push(inward(p, grid[i][rows - 1].p));
    }
    for (let j = rows - 1; j >= 0; j--) {
      const p = grid[cols][j].p;
      hemPts.push(lift(p, N(cols, j), SURF_LIFT)); hemOff.push(inward(p, grid[cols - 1][j].p));
    }
    strip(b, m, hemPts, hemOff, [0.72, 0.78, 0.92], false);
  }

  /** 枕头：方形网格→超椭圆（圆角矩形）映射的蓬松网格，顶面 + 底面共用一圈边环，
   *  没有球极接缝。顶视是圆角矩形而非椭圆；中心蓬松、外圈一道窄缝边、四角收捏，
   *  顶面是低频多方向的自然布纹（不是平行条纹）。
   *  cy 是枕芯（缝边）高度，hw / hd 是半宽 / 半深，hT / hB 是上 / 下蓬松高度。 */
  function pillow(b, m, x, cy, z, hw, hd, hT, hB, col, seg) {
    const n = seg || 16;
    const surf = (a, bb, top) => {
      const ax = Math.abs(a), az = Math.abs(bb);
      const mx = Math.max(ax, az);
      const s = Math.pow(Math.pow(ax, 4) + Math.pow(az, 4), 0.25) || 1e-6;
      const f = mx / s;                       // 方形网格 → 圆角矩形平面
      const px = hw * a * f, pz = hd * bb * f;
      const core = smooth01((0.90 - mx) / 0.10);   // 蓬松芯 → 外圈窄缝边
      const dome = Math.pow(Math.max(0, 1 - mx * mx), 0.42) * core;  // 平顶充气枕，不是半球
      const pinch = 1 - 0.10 * ax * ax * az * az;  // 四角收捏
      const wr = top ? (0.004 * Math.sin(a * 3.1 + bb * 1.7 + 0.5)
                      + 0.003 * Math.sin(a * 1.3 - bb * 4.2 + 1.0)
                      + 0.0025 * Math.sin(a * 5.7 + bb * 2.9)) * core : 0;
      const y = cy + (top ? hT : -hB) * dome * pinch + wr;
      return [x + px, y, z + pz];
    };
    const nm = M.normalMat(m);
    for (const top of [true, false]) {
      const grid = [];
      for (let i = 0; i <= n; i++) {
        grid[i] = [];
        for (let j = 0; j <= n; j++) grid[i][j] = surf(i / n * 2 - 1, j / n * 2 - 1, top);
      }
      const N = (i, j) => {
        const a = grid[Math.min(n, i + 1)][j], b0 = grid[Math.max(0, i - 1)][j];
        const c = grid[i][Math.min(n, j + 1)], d0 = grid[i][Math.max(0, j - 1)];
        const tx = a[0] - b0[0], ty = a[1] - b0[1], tz = a[2] - b0[2];
        const ux = c[0] - d0[0], uy = c[1] - d0[1], uz = c[2] - d0[2];
        let nx = uy * tz - uz * ty, ny = uz * tx - ux * tz, nz = ux * ty - uy * tx;
        if (!top) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1;
        return [nx / l, ny / l, nz / l];
      };
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
          const p = grid[ii][jj], nn = N(ii, jj);
          b._v(b.d, m, nm, p[0], p[1], p[2], nn[0], nn[1], nn[2], ii / n * 1.5, jj / n * 1.5, col, 0);
        }
        b._pushQuad(b.count - 4);
      }
    }
    /* 枕套法兰边：沿枕芯一圈向外 4.5cm 的平布边，带轻微波浪；内缘再压一道细缝线。
     *  两条都沿枕面法线抬离（pillow() 的 N 在 for(top) 循环体内不可见，用 surf() 现求）。 */
    const topN = (a, bb) => {
      const e = 0.006, cl = v => Math.max(-1, Math.min(1, v));
      const A = surf(cl(a + e), bb, true), B = surf(cl(a - e), bb, true);
      const Cc = surf(a, cl(bb + e), true), D = surf(a, cl(bb - e), true);
      const tx = A[0] - B[0], ty = A[1] - B[1], tz = A[2] - B[2];
      const ux = Cc[0] - D[0], uy = Cc[1] - D[1], uz = Cc[2] - D[2];
      let nx = uy * tz - uz * ty, ny = uz * tx - ux * tz, nz = ux * ty - uy * tx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    };
    const edge = [];
    for (let j = 0; j <= n; j++) edge.push([-1, j / n * 2 - 1]);
    for (let i = 1; i <= n; i++) edge.push([i / n * 2 - 1, 1]);
    for (let j = n - 1; j >= 0; j--) edge.push([1, j / n * 2 - 1]);
    for (let i = n - 1; i >= 1; i--) edge.push([i / n * 2 - 1, -1]);
    edge.push([-1, -1]);                       // 闭合
    const rimPts = [], rimOff = [], seamPts = [], seamOff = [];
    for (const [a, bb] of edge) {
      const p = surf(a, bb, true);
      const dx = p[0] - x, dz = p[2] - z;
      const r = Math.hypot(dx, dz) || 1;
      const nv = topN(a, bb);
      const wave = 0.0025 * Math.sin((a + bb) * 8.0);
      rimPts.push(lift(p, nv, SURF_LIFT + wave));
      rimOff.push([dx / r * 0.045, 0, dz / r * 0.045]);
      const pin = [p[0] - dx / r * 0.008, p[1], p[2] - dz / r * 0.008];
      seamPts.push(lift(pin, nv, 0.005));
      seamOff.push([dx / r * 0.008, 0, dz / r * 0.008]);
    }
    strip(b, m, rimPts, rimOff, [0.68, 0.71, 0.79], true);
    strip(b, m, seamPts, seamOff, [0.48, 0.52, 0.62], true);
  }

  /** 被头翻边：白色被里折回来的一道低矮软布带，贴着蓬松被面走。
   *  基高直接取同一条 bedPuff 曲线（+3.8cm 薄层），所以整道始终浮在被面之上、
   *  不会被被面吞掉；z 随 v 递增，法线朝上（和被子一致），翻边才不会被背光压黑；
   *  自由边软扇贝波 + 末端微卷、两端往内收、细布纹、柔和明暗。 */
  function fold(b, m, w, matTop, zHead, zFoot) {
    const hw = w / 2 - 0.03, cols = 48, rows = 18;
    const P = (u, v) => {
      const end = smooth01(u / 0.06) * smooth01((1 - u) / 0.06);   // 中段 1、两端 0
      const droop = 1 - end;
      const x = (-hw + 2 * hw * u) * (1 - 0.04 * droop);           // 两端往内收
      const roll = Math.sin(Math.min(1, v / 0.9) * Math.PI);       // 低卷峰在 v≈0.45
      const crest = 0.018 * roll * (0.88 + 0.12 * Math.sin(u * Math.PI * 2.0 + 0.7));
      const frontDrape = 0.012 * smooth01((0.25 - v) / 0.25);      // 自由边（v=0）轻搭
      const curl = 0.005 * smooth01((0.10 - v) / 0.10);            // 自由边末端微卷
      const scallop = 0.006 * Math.sin(u * Math.PI * 2.5 + 0.3) * smooth01((0.5 - v) / 0.5) * end;
      const wr = (0.0022 * Math.sin(u * 7.0 + v * 3.1)
                + 0.0018 * Math.sin(u * 4.3 - v * 5.2 + 1.0)
                + 0.0013 * Math.sin(u * 11.0 + v * 1.7 + 0.5)) * (0.4 + 0.6 * end);
      const z = zHead + 0.02 + 0.24 * v + 0.006 * Math.sin(u * Math.PI * 1.5) * v;
      const vB = BLANKET_VF * (z - zHead) / (zFoot - zHead);       // 换到被子全局纵向参数
      const y = matTop + bedPuff(u, vB) + 0.038
              + crest - frontDrape - curl + scallop + wr;
      const k = 1.08 + 0.05 * roll - 0.03 * smooth01((0.3 - v) / 0.3)
              + 0.015 * Math.sin(u * 6.0 + v * 2.0);
      return { p: [x, y, z], k };
    };
    const grid = [];
    for (let i = 0; i <= cols; i++) {
      grid[i] = [];
      for (let j = 0; j <= rows; j++) grid[i][j] = P(i / cols, j / rows);
    }
    const N = (i, j) => {
      const a = grid[Math.min(cols, i + 1)][j].p, b0 = grid[Math.max(0, i - 1)][j].p;
      const c = grid[i][Math.min(rows, j + 1)].p, d0 = grid[i][Math.max(0, j - 1)].p;
      const tx = a[0] - b0[0], ty = a[1] - b0[1], tz = a[2] - b0[2];
      const ux = c[0] - d0[0], uy = c[1] - d0[1], uz = c[2] - d0[2];
      let nx = uy * tz - uz * ty, ny = uz * tx - ux * tz, nz = ux * ty - uy * tx;
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    };
    const nm = M.normalMat(m);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
        const g = grid[ii][jj], nn = N(ii, jj);
        b._v(b.d, m, nm, g.p[0], g.p[1], g.p[2], nn[0], nn[1], nn[2],
          ii / cols * 2.4, jj / rows * 1.6, [g.k, g.k, g.k * 1.03], 0);
      }
      b._pushQuad(b.count - 4);
    }
    /* 自由边折口：朝被头探出的小卷边（原来向下 1.8cm 会插进被面）+ 内缘细缝线。
     *  自由边附近坡度大、N() 法线会往下倾，所以两条统一沿 +Y 抬离；
     *  缝线的带宽改沿 fold 表面方向，保证整条与折面平行、恒定间距。 */
    const lipPts = [], lipOff = [], seamP = [], seamO = [];
    for (let i = 0; i <= cols; i++) {
      const q0 = grid[i][0].p, q1 = grid[i][1].p, q2 = grid[i][2].p;
      lipPts.push(lift(q0, [0, 1, 0], SURF_LIFT)); lipOff.push([0, -0.005, -0.012]);
      seamP.push(lift(q1, [0, 1, 0], SURF_LIFT));
      seamO.push([q2[0] - q1[0], q2[1] - q1[1], q2[2] - q1[2]]);
    }
    strip(b, m, lipPts, lipOff, [0.60, 0.64, 0.74], false);
    strip(b, m, seamP, seamO, [0.54, 0.58, 0.68], true);
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

  /** 沿折线生成一条窄带（滚边 / 缝线 / 折口）：pts 是内缘折线，
   *  offs 是每点对应的带宽向量（已含宽度与方向），flip 取反法线。
   *  法线用 (折线切线 × 带宽方向) 的叉积，调用方按条带朝向决定 flip。 */
  function strip(b, m, pts, offs, col, flip) {
    const nm = M.normalMat(m);
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], oA = offs[i], oB = offs[i + 1];
      const P = [A, B,
        [B[0] + oB[0], B[1] + oB[1], B[2] + oB[2]],
        [A[0] + oA[0], A[1] + oA[1], A[2] + oA[2]]];
      const tx = B[0] - A[0], ty = B[1] - A[1], tz = B[2] - A[2];
      let nx = ty * oA[2] - tz * oA[1],
          ny = tz * oA[0] - tx * oA[2],
          nz = tx * oA[1] - ty * oA[0];
      if (flip) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      const U = [[i * 0.4, 0], [(i + 1) * 0.4, 0], [(i + 1) * 0.4, 1], [i * 0.4, 1]];
      for (let k = 0; k < 4; k++)
        b._v(b.d, m, nm, P[k][0], P[k][1], P[k][2], nx / l, ny / l, nz / l,
          U[k][0], U[k][1], col, 0);
      b._pushQuad(b.count - 4);
    }
  }

  /** 竖直软包格：圆角矩形网格，中心朝 +Z 微微鼓起、拉扣处局部凹陷。
   *  (cx,cy,cz) 是格中心，hw/hh 是半宽 / 半高，depth 是鼓起深度。 */
  function paddedPanel(b, m, cx, cy, cz, hw, hh, depth, col) {
    const n = 12;
    const P = (a, bb) => {
      const ax = Math.abs(a), az = Math.abs(bb), mx = Math.max(ax, az);
      const s = Math.pow(Math.pow(ax, 4) + Math.pow(az, 4), 0.25) || 1e-6;
      const f = mx / s;
      const dome = Math.pow(Math.max(0, 1 - mx * mx), 0.6);
      const tuft = Math.exp(-(a * a + bb * bb) / 0.05);   // 拉扣压出的凹点
      return [cx + hw * a * f, cy + hh * bb * f, cz + depth * (dome - 0.5 * tuft)];
    };
    const nm = M.normalMat(m);
    const grid = [];
    for (let i = 0; i <= n; i++) {
      grid[i] = [];
      for (let j = 0; j <= n; j++) grid[i][j] = P(i / n * 2 - 1, j / n * 2 - 1);
    }
    const N = (i, j) => {
      const a = grid[Math.min(n, i + 1)][j], b0 = grid[Math.max(0, i - 1)][j];
      const c = grid[i][Math.min(n, j + 1)], d0 = grid[i][Math.max(0, j - 1)];
      const tx = a[0] - b0[0], ty = a[1] - b0[1], tz = a[2] - b0[2];
      const ux = c[0] - d0[0], uy = c[1] - d0[1], uz = c[2] - d0[2];
      let nx = uy * tz - uz * ty, ny = uz * tx - ux * tz, nz = ux * ty - uy * tx;
      const l = Math.hypot(nx, ny, nz) || 1;
      return [-nx / l, -ny / l, -nz / l];       // 取反，法线朝 +Z（面向床尾）
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
        const p = grid[ii][jj], nn = N(ii, jj);
        b._v(b.d, m, nm, p[0], p[1], p[2], nn[0], nn[1], nn[2], ii / n * 0.5, jj / n * 0.5, col, 0);
      }
      b._pushQuad(b.count - 4);
    }
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
    G.box.call(bFrame, at(m, 0, h / 2 - bw / 2, zc), w, bw, dep, C.fabric, 1.3);
    G.box.call(bFrame, at(m, 0, -h / 2 + bw / 2, zc), w, bw, dep, C.fabric, 1.3);
    G.box.call(bFrame, at(m, -w / 2 + bw / 2, 0, zc), bw, h - bw * 2, dep, C.fabric, 1.3);
    G.box.call(bFrame, at(m, w / 2 - bw / 2, 0, zc), bw, h - bw * 2, dep, C.fabric, 1.3);

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
    G.box.call(bFrame, at(m, 0, 0, 0.014), w - 0.02, h - 0.02, 0.028, C.fabricDark, 1.2);

    /* 软木板面：朝 +Z 的 quad，四周塞进木框下面 */
    G.quad.call(bBoard, at(m, 0, 0, 0.032),
      w - bw * 2 + 0.06, h - bw * 2 + 0.06, [1, 1, 1], [0, 0, 1, 1]);

    /* 木框 */
    const zc = 0.03;
    G.box.call(bFrame, at(m, 0, h / 2 - bw / 2, zc), w, bw, dep, C.fabric, 1.3);
    G.box.call(bFrame, at(m, 0, -h / 2 + bw / 2, zc), w, bw, dep, C.fabric, 1.3);
    G.box.call(bFrame, at(m, -w / 2 + bw / 2, 0, zc), bw, h - bw * 2, dep, C.fabric, 1.3);
    G.box.call(bFrame, at(m, w / 2 - bw / 2, 0, zc), bw, h - bw * 2, dep, C.fabric, 1.3);

    /* 内圈木条，压住软木板边缘 */
    const lip = 0.008;
    const innerW = w - bw * 2, innerH = h - bw * 2;
    G.box.call(bFrame, at(m, 0, innerH / 2 - lip / 2, 0.038), innerW, lip, 0.02, C.fabricLit, 1.8);
    G.box.call(bFrame, at(m, 0, -innerH / 2 + lip / 2, 0.038), innerW, lip, 0.02, C.fabricLit, 1.8);
    G.box.call(bFrame, at(m, -innerW / 2 + lip / 2, 0, 0.038), lip, innerH, 0.02, C.fabricLit, 1.8);
    G.box.call(bFrame, at(m, innerW / 2 - lip / 2, 0, 0.038), lip, innerH, 0.02, C.fabricLit, 1.8);

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

  /** 床：m 原点在落地中心，床头朝 -Z、床尾朝 +Z（默认 1.05 × 2.0m）。
   *  白漆床架 / 床头 + 金属腿 + 亚麻床品；被子从枕头前沿一直铺到床尾、三面垂下，
   *  被头折回一道白色被里当翻边，一个扁枕靠床头。
   *  bWood 走金属（腿 / 柱头），bSheet 走白漆与白色床品，bFabric 走蓝色被褥。 */
  function bed(bWood, bFabric, bSheet, m, w = 1.05, len = 2.0) {
    const legH = 0.14, frameT = 0.08;
    const frameTop = legH + frameT;      // 0.22
    const matTop = frameTop + 0.20;      // 0.42
    const zFoot = len / 2 - 0.06;        // 床垫尾沿，被子从这里垂下去
    const zHead = -len / 2 + 0.45;       // 被头：床头留出 0.45m 给枕头
    const hbZ = -len / 2 - 0.02;         // 床头板所在 z

    /* 四条金属腿 + 脚垫 */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = sx * (w / 2 - 0.09), lz = sz * (len / 2 - 0.12);
      bWood.cyl.call(bWood, at(m, lx, 0, lz), 0.03, 0.024, legH, 8, C.metalDark, true);
      bWood.cyl.call(bWood, at(m, lx, 0, lz), 0.037, 0.037, 0.012, 10, C.metal, true);
    }
    /* 白漆床架 + 低床尾板（被子能搭过去）+ 两侧一道凹槽线 */
    G.box.call(bSheet, at(m, 0, legH + frameT / 2, 0), w, frameT, len, C.fabricLit, 1.4);
    for (const sz of [-1, 1])
      G.box.call(bSheet, at(m, 0, 0.178, sz * (len / 2 + 0.002)),
        w - 0.07, 0.010, 0.004, [0.58, 0.62, 0.70], 1.0);
    G.box.call(bSheet, at(m, 0, 0.24, len / 2), w, 0.18, 0.05, C.fabricLit, 1.5);
    /* 床垫 */
    G.box.call(bSheet, at(m, 0, frameTop + 0.10, 0), w - 0.08, 0.20, len - 0.16, C.fabricLit, 2.2);
    /* 蓝色被子：铺满枕头前沿到床尾，两侧与床尾垂下 */
    blanket(bFabric, m, w, matTop, zHead, zFoot);
    /* 被头翻边：白色被里折回来，贴在被面上 */
    fold(bSheet, m, w, matTop, zHead, zFoot);
    /* 一个枕头：扁而宽的白色软枕，居中靠床头，缝边略微埋进床单、不露深色底圈 */
    pillow(bSheet, m, 0, matTop - 0.005, -len / 2 + 0.29, w * 0.40, 0.17, 0.075, 0.05, C.rim, 20);

    /* 床头软包：三格圆角矩形软包（中心拉扣凹点）+ 底板格缝 + 上缘圆滚边 */
    const padBot = 0.30, padTop = 0.86, padH = padTop - padBot, padMid = (padBot + padTop) / 2;
    G.box.call(bFabric, at(m, 0, padMid, hbZ), w - 0.04, padH, 0.055, [0.78, 0.84, 0.96], 1.6);
    for (let k = -1; k <= 1; k++) {
      const cx = k * w / 3;
      paddedPanel(bFabric, m, cx, padMid, hbZ + 0.030,
        w / 6 - 0.012, padH / 2 - 0.026, 0.018, [1.16, 1.22, 1.36]);
      bSheet.sphere.call(bSheet, at(m, cx, padMid, hbZ + 0.039), 0.009, 8, 5, [0.50, 0.56, 0.68]);
    }
    bFabric.cyl.call(bFabric, at(m, -(w / 2 - 0.01), padTop, hbZ, 0, 0, -Math.PI / 2),
      0.03, 0.03, w - 0.02, 10, [1.22, 1.28, 1.42], true);
    for (const sx of [-1, 1]) {
      const px = sx * (w / 2 + 0.018);
      bSheet.cyl.call(bSheet, at(m, px, 0, hbZ), 0.032, 0.028, 0.98, 8, C.fabricLit, true);
      bSheet.torus.call(bSheet, at(m, px, 0.965, hbZ), 0.034, 0.006, 10, 5, C.metalLit);
      bWood.sphere.call(bWood, at(m, px, 1.0, hbZ), 0.033, 8, 5, C.metalLit);
    }
  }

  /** 书桌：m 原点在落地中心，桌面在 y=h；白漆桌板 + 金属腿 */
  function desk(bTop, bLegs, m, w = 1.6, d = 0.7, h = 0.74) {
    const t = 0.055;
    G.box.call(bTop, at(m, 0, h - t / 2, 0), w, t, d, C.fabricLit, 1.2);
    G.box.call(bTop, at(m, 0, h - t - 0.012, 0), w - 0.06, 0.024, d - 0.06, C.fabric, 1.4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      G.box.call(bLegs, at(m, sx * (w / 2 - 0.08), (h - t) / 2, sz * (d / 2 - 0.08)),
        0.05, h - t, 0.05, C.dark, 1.2);
    }
    G.box.call(bLegs, at(m, 0, 0.15, -d / 2 + 0.08), w - 0.22, 0.035, 0.035, C.metal, 1.2);
    G.box.call(bLegs, at(m, 0, h - t - 0.07, -d / 2 + 0.1), w - 0.3, 0.03, 0.04, C.metalDark, 1.2);
  }

  return {
    sofa, armchair, ottoman, coffeeTable, floorLamp, wallShelf,
    pictureFrame, corkboard, catBed, curtain, roundRug, wallClock, bed, desk
  };
})();

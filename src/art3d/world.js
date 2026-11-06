/* ============================================================
 * Escape A÷ · src/art3d/world.js —— 大世界：一张地图，多个视角
 *
 * 以前 github_street / hf_camp / shit_mountain 是三个互不相干的盒子，
 * 现在它们在同一条海岸线上：
 *
 *        ┌────────────── 海（北，-Z）──────────────┐
 *        │   月                灯塔   对岸城市      │
 *        │                                          │
 *        │   HF 营地 —— GitHub 夜市街 —— 屎山       │
 *        │                                          │
 *        │          南边的山：主标题 / 教堂           │
 *        └──────────────────────────────────────────┘
 *
 * 视角共用同一套几何体（只 build 一次），只是相机 / 天空 / 灯光不同，
 * 所以切视角不会重新上传顶点。
 * 教堂正门（claude_door / claude_door_403）也是这里的视角：剧情里的「Claude 家的门」
 * 就是这座教堂的正门，不再是单独的小盒子场景。分区细节在 world_github.js / world_hf.js /
 * world_shit.js 里，各自用局部坐标建，再由 A3DWorld.penAt 搬到世界坐标。
 *
 * 世界坐标：右手系，Y 向上，1 单位 = 1 米，海在 -Z 方向。
 * ============================================================ */
"use strict";

const A3DWorld = (() => {
  const M = A3D.M, T = A3DTex.T, P = A3DProps;
  const rng = P.rng;
  const TAU = Math.PI * 2;
  const m4 = (x, y, z, rx, ry, rz, sx, sy, sz) => M.trs(x, y, z, rx, ry, rz, sx, sy, sz);
  const clamp = A3D.clamp;
  const smooth = A3D.smooth;

  /* ============================================================
   *  布局 —— 改这里就等于改世界地图，分区文件只认自己的 origin
   * ============================================================ */
  /* 教堂那座台地整体南移的量（世界 +Z = 远离海岸）。
   * 台地、教堂、墓园、甬道、台地松林和主标题机位一起走，崖脚到海岸的平地会变宽。
   * 当前 60m：崖沿落在「8m 版」里甬道尽头山门的位置（约 z=74），海岸/城镇相对后退 52m。
   * 改这个数就等于「把山往后挪」，别单独挪教堂。 */
  const HILL_SHIFT = 60;

  const L = {
    waterY: -0.5,
    shoreZ: -108,          // 地形在这条线沉进水里
    beachZ: -100,          // 沙滩内缘
    plainZ: -100,          // 平地北界
    // 三个分区（origin 是局部原点，rot 是绕 Y 的朝向）
    /* GitHub 街横过来：局部 -Z（往街里走）指向世界 -X，所以街是从东往西走，
     * 街口朝东，正对着近岸城市；屎山接在街尾西侧。 */
    github: { x: 18, z: -70, rot: Math.PI / 2 },
    hf:     { x: -70, z: -102, rot: 0 },   // 局部 +Z = 往岸上，-Z = 往海
    shit:   { x: -22, z: -70, rot: Math.PI / 2 },  // 局部 -Z = 屎山（世界 -X）
    // 南边：一块 30m 高的台地，北面是一道陡崖（教堂就立在崖沿上）
    ridge:  { z0: 2 + HILL_SHIFT, z1: 14 + HILL_SHIFT, h: 30, x0: 8, wide: 96 },
    /* 教堂中心比最初南移 4m：扩建后中殿加长到 24m，北墙要留在台地平段上，
     * 不能骑到崖坡里。前院（石墙 + 铁栅栏）跟着一起往外扩。 */
    church: { x: 18, z: 30 + HILL_SHIFT, rot: 0.15 },
    // 城市就在近岸，对岸留空（海湾直接开到天边）
    // 近岸城市：GitHub 街以东的海岸（z0 = 靠海一侧，z1 = 靠内陆一侧）
    city:   { x0: 30, x1: 250, z0: -100, z1: -62 },
    // 灯塔：GitHub 与 HF 营地之间的岸边，top = 塔身高度（相对基座）
    lighthouse: { x: -33, z: -104.5, top: 22 },
    moon: { x: -78, y: 95, z: -230 },
    // 主标题视角：主人调好的长焦机位（教堂扩建后整套机位后撤、抬高并重对过，
    // 让完整的教堂入画又不挡住海岸）；HILL_SHIFT 再动的话这个机位要重新对
    titleCam: { eye: [5.5, 55.0, 158.0], target: [4.2, 36.2, 60.0], fov: 25.5, far: 900 }
  };
  /** 主标题视角下的四个分区在画面里的大致方向（只给调试/注释用） */
  const HASH = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };

  /* ============================================================
   *  地面细节：连续噪声 / 土路 / 沙地
   *
   *  以前地面的明暗是「每个 5m 格子一个随机值」，远看像棋盘。
   *  现在颜色全部走连续噪声 + 逐顶点插值，土路和沙滩也直接烘进顶点色里，
   *  不需要额外铺一层地面片（就不会有悬空 / z-fighting）。
   * ============================================================ */
  /** 平滑值噪声（双线性 + smoothstep），连续、无格子感 */
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = smooth(xf), v = smooth(zf);
    const a = HASH(xi, zi), b = HASH(xi + 1, zi);
    const c = HASH(xi, zi + 1), d = HASH(xi + 1, zi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  /* 土路中线（世界坐标），w = 半宽。
   * 廊道：街尾牌坊 → 屎山北脚 → HF 营地东入口（营地内部有自己的铺装，
   * 不再把土路画进篝火/串灯杆中间）；灯塔沙滩一条；崖脚 → 街口。 */
  const PATHS = [
    { w: 2.7, pts: [[-12.6, -70.2], [-18.5, -70.6], [-24.0, -73.6], [-29.5, -77.6],
      [-35.5, -81.4], [-43.0, -84.2], [-46.5, -84.8]] },
    { w: 2.5, pts: [[-78.6, -100.6], [-63.0, -101.2], [-48.0, -101.6], [-37.0, -103.0]] },
    { w: 3.2, pts: [[20.5, 1.5 + HILL_SHIFT], [21.5, -10.0], [24.5, -24.0], [27.5, -40.0],
      [28.0, -56.0], [26.4, -68.4]] }
  ];
  /** HF 营地下面这片是沙地，不是草地（营地本来就是沙滩上的） */
  const CAMP_SAND = { x0: -104, z0: -101, x1: -36, z1: -63, feather: 22 };
  const PATH_SEGS = (() => {
    const out = [];
    for (const p of PATHS) {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const a = p.pts[i], b = p.pts[i + 1];
        out.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], w: p.w });
      }
    }
    return out;
  })();
  /** 点到土路中线的最近距离（米） + 这条路的半宽 */
  function pathInfo(x, z) {
    let best = Infinity, w = 0;
    for (let i = 0; i < PATH_SEGS.length; i++) {
      const s = PATH_SEGS[i];
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((x - s.ax) * dx + (z - s.az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
      if (d < best) { best = d; w = s.w; }
    }
    return { d: best, w };
  }
  /** 点到矩形区域的距离（在内部为 0），用来做沙地羽化边 */
  function rectDist(x, z, r) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dz = Math.max(r.z0 - z, 0, z - r.z1);
    return Math.hypot(dx, dz);
  }
  /** 地面是不是土路（给路边的小石子 / 车辙用） */
  function onPath(x, z, pad) {
    const p = pathInfo(x, z);
    return p.d < p.w + (pad || 0);
  }

  /* ============================================================
   *  地形
   * ============================================================ */
  /** 地面高度：海岸平原 = 0，北边沙滩下沉，南边是高台（北面陡坡） */
  function groundH(x, z) {
    let h = 0;
    // 南边高台：z0 以北是平地，z1 以南是 30m 高的台地
    const rise = clamp((z - L.ridge.z0) / (L.ridge.z1 - L.ridge.z0), 0, 1);
    const side = 1 / (1 + Math.pow(Math.abs(x - L.ridge.x0) / L.ridge.wide, 4));
    const wob = 1 + 0.055 * Math.sin(x * 0.06) + 0.035 * Math.sin(x * 0.021 + 1.7);
    h = Math.max(h, L.ridge.h * smooth(rise) * side * wob);
    // 两侧远山，把海湾框起来
    h = Math.max(h, 14 * Math.max(0, 1 - Math.hypot(x + 168, z - 70) / 78));
    h = Math.max(h, 10 * Math.max(0, 1 - Math.hypot(x - 186, z - 86) / 88));
    /* 沙滩：z 从 beachZ 到 shoreZ 从 0 沉到 -1.4。
     * 必须放在高台/远山之后取 min，否则会被 Math.max 抬回 0（沙滩就平了）。 */
    if (z < L.beachZ) {
      const t = clamp((z - L.shoreZ) / (L.beachZ - L.shoreZ), 0, 1);
      h = Math.min(h, -1.4 * (1 - t));
    }
    return h;
  }

  /** 地面颜色：草 / 沙（带过渡）/ 岩（陡坡自动变岩石，悬崖才有“崖”的样子）
   *  逐顶点算：噪声连续，土路和营地沙地直接混进来。 */
  function groundCol(x, z) {
    const h = groundH(x, z);
    const slope = Math.hypot(groundH(x + 1.6, z) - h, groundH(x, z + 1.6) - h) / 1.6;
    const n1 = vnoise(x * 0.07, z * 0.07);
    const n2 = vnoise(x * 0.23 + 13.7, z * 0.23 - 6.1);
    const n3 = vnoise(x * 0.9 - 4.3, z * 0.9 + 9.2);
    /* 陡坡 / 悬崖：岩石，别让 30m 落差的侧面看起来像一块绿布 */
    if (slope > 1.75) {
      const g = 0.58 + n1 * 0.17 + n3 * 0.12;
      return [0.62 * g, 0.63 * g, 0.68 * g];
    }
    /* 草地：低频明暗 + 一点干黄斑，别再逐格跳明暗 */
    const g = 0.82 + n1 * 0.18 + n2 * 0.09;
    const dry = (n2 - 0.3) * 0.12;
    let c = [g * (1.0 + dry), g * (1.03 + dry * 0.35), g * (0.92 - dry * 0.55)];
    /* 沙：水线附近全沙；HF 营地整片羽化成沙地（营地本来就该在沙上） */
    const wob = (n2 - 0.5) * 0.28 + (n3 - 0.5) * 0.08;
    const tBeach = clamp((L.beachZ + 6 - z) / 11.5 + wob, 0, 1);
    const tCamp = clamp(1 - rectDist(x, z, CAMP_SAND) / CAMP_SAND.feather + (n1 - 0.5) * 0.16, 0, 1);
    const tSand = Math.max(tBeach, tCamp * 0.97);
    if (tSand > 0.002) {
      const wet = clamp((-z - 104) / 6, 0, 1) * 0.16;
      const s = (0.9 + n2 * 0.22) * (1 - wet);
      const sand = [2.12 * s, 1.62 * s, 1.04 * s];
      c = [
        c[0] + (sand[0] - c[0]) * tSand,
        c[1] + (sand[1] - c[1]) * tSand,
        c[2] + (sand[2] - c[2]) * tSand
      ];
    }
    /* 土路：中间踩实 + 两条车辙，边缘用噪声羽化 */
    const pi = pathInfo(x, z);
    if (pi.d < pi.w + 3.4) {
      const inPath = clamp(1 - (pi.d - pi.w * 0.45) / (pi.w * 0.55), 0, 1);
      const edge = clamp(1 - (pi.d - pi.w) / 3.4, 0, 1);
      const dirt = [1.5 + n3 * 0.18, 1.16 + n2 * 0.12, 0.8 + n1 * 0.1];
      const k = Math.max(inPath, edge * 0.42) * (0.88 + n2 * 0.1);
      c = [
        c[0] + (dirt[0] - c[0]) * k,
        c[1] + (dirt[1] - c[1]) * k,
        c[2] + (dirt[2] - c[2]) * k
      ];
      const rut = Math.abs(pi.d - pi.w * 0.44);
      if (rut < 0.24) {
        const rk = (1 - rut / 0.24) * 0.34;
        c = [c[0] * (1 - rk), c[1] * (1 - rk * 0.9), c[2] * (1 - rk * 0.76)];
      }
    }
    /* 台地上草更干一点，远看和下面的草地有层次 */
    if (h > 21) {
      const t = clamp((h - 21) / 9, 0, 1) * 0.16;
      c = [c[0] * (1 - t * 0.25) + 0.46 * t, c[1] * (1 - t * 0.12) + 0.44 * t, c[2] * (1 - t * 0.1) + 0.4 * t];
    }
    return c;
  }

  /** 高度场地形：一次算完整张高度/法线/顶点色网格，再展开成三角形。
   *  逐顶点法线 + 逐顶点颜色 → 没有 5m 一格的棋盘和硬折面。 */
  function terrainMesh(pen, x0, x1, z0, z1, nx, nz, uvScale) {
    const I = M.ident(), NM = M.normalMat(I);
    const W = nx + 1, Hn = nz + 1, N = W * Hn;
    const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
    const nX = new Float32Array(N), nY = new Float32Array(N), nZ = new Float32Array(N);
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N);
    for (let j = 0; j < Hn; j++) {
      const z = z0 + (z1 - z0) * j / nz;
      for (let i = 0; i < W; i++) {
        const k = j * W + i, x = x0 + (x1 - x0) * i / nx;
        const y = groundH(x, z);
        px[k] = x; py[k] = y; pz[k] = z;
        const c = groundCol(x, z);
        cr[k] = c[0]; cg[k] = c[1]; cb[k] = c[2];
      }
    }
    const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
    for (let j = 0; j < Hn; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const il = i > 0 ? k - 1 : k, ir = i < nx ? k + 1 : k;
        const jd = j > 0 ? k - W : k, ju = j < nz ? k + W : k;
        const sx = (i > 0 && i < nx) ? 2 * dx : dx;
        const sz = (j > 0 && j < nz) ? 2 * dz : dz;
        const gx = (py[ir] - py[il]) / sx;
        const gz = (py[ju] - py[jd]) / sz;
        const len = Math.hypot(gx, 1, gz) || 1;
        nX[k] = -gx / len; nY[k] = 1 / len; nZ[k] = -gz / len;
      }
    }
    const push = k => pen._v(pen.d, I, NM, px[k], py[k], pz[k],
      nX[k], nY[k], nZ[k], px[k] * uvScale, pz[k] * uvScale,
      [cr[k], cg[k], cb[k]], 0);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const A = j * W + i, B = A + 1, C = A + W + 1, D = A + W;
        /* 绕序沿用原来的 (A,C,B) + (A,D,C)：法线朝上 */
        push(A); push(C); push(B);
        push(A); push(D); push(C);
      }
    }
  }

  /** 海面：一整张格网、逐顶点上色。
   *  以前是 24×20 块各自着色，40m 一块的色阶在掠射角下变成一道道横带（越远越薄的百叶窗）；
   *  现在顶点共享、颜色插值，相邻格之间没有台阶，面数还少一大半。 */
  function seaSurface(pen, x0, x1, z0, z1, nx, nz, uvScale) {
    const I = M.ident(), NM = M.normalMat(I);
    const W = nx + 1, Hn = nz + 1, N = W * Hn;
    const px = new Float32Array(N), pz = new Float32Array(N);
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N);
    for (let j = 0; j < Hn; j++) {
      const z = z0 + (z1 - z0) * j / nz;
      for (let i = 0; i < W; i++) {
        const k = j * W + i, x = x0 + (x1 - x0) * i / nx;
        px[k] = x; pz[k] = z;
        /* 两层低频噪声：大块的深浅 + 一点细碎的涌浪，都跨格连续 */
        const n = vnoise(x * 0.026 + 4.1, z * 0.026 - 7.3) * 0.72
          + vnoise(x * 0.0085 - 2.7, z * 0.0085 + 5.3) * 0.28;
        const kk = 0.945 + n * 0.11;
        cr[k] = kk; cg[k] = kk * 0.995; cb[k] = kk * 1.02;
      }
    }
    const push = k => pen._v(pen.d, I, NM, px[k], L.waterY, pz[k], 0, 1, 0,
      px[k] * uvScale, pz[k] * uvScale, [cr[k], cg[k], cb[k]], 0);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const A = j * W + i, B = A + 1, C = A + W + 1, D = A + W;
        push(A); push(C); push(B);
        push(A); push(D); push(C);
      }
    }
  }

  /* ============================================================
   *  通用小构件
   * ============================================================ */
  function Gbox(b, x, y, z, sx, sy, sz, col, uv) {
    b.box.call(b, m4(x, y, z), sx, sy, sz, col, uv === undefined ? 1.1 : uv);
  }
  /** 人字屋顶：脊线沿 Z，屋脊在中心高一格。带 UV，木瓦 / 石板贴图能看见。
   *  bGable：山墙三角用哪支画笔；传 false 表示不画（让下面的石山墙自己收口）。 */
  function gableRoof(b, m, w, d, h, col, uvScale, bGable) {
    const hw = w / 2, hd = d / 2, us = uvScale || 1;
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
    const E = [0, h, -hd], F = [0, h, hd];
    const UV = [0, 0, d * us, w * 0.55 * us];
    /* 四个角必须按「沿坡面走一圈」的顺序连，不能是 A-F-E-D 交叉序；
       以前那样会把两个三角铺成蝴蝶结，屋面只剩两片三角。 */
    P.quad4(b, m, A, D, F, E, col, UV);
    P.quad4(b, m, B, E, F, C, col, UV);
    if (bGable === false) return;
    const gb = bGable || b;
    gb.tri.call(gb, m, A, E, B, [[0, 0], [w * 0.5 * us, h * us], [w * us, 0]], col);
    gb.tri.call(gb, m, D, C, F, [[w * us, 0], [w * 0.5 * us, h * us], [0, 0]], col);
  }
  const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
  /** 松树：6 层重叠锥 + 露出的树干 + 顶部尖梢，从任何角度看都不是「分开的三段」 */
  function pine(bTrunk, bLeaf, x, z, h, seed, col) {
    const r = rng(seed);
    const y0 = groundH(x, z);
    const lean = (r() - 0.5) * 0.05;
    const trunkH = h * 0.58;
    bTrunk.cyl.call(bTrunk, m4(x, y0, z, lean, r() * TAU, lean * 0.7),
      0.022 * h + 0.03, 0.012 * h + 0.015, trunkH, 6, [1, 1, 1], true);
    // 几根露出来的侧枝，让树干不是一根直棍
    for (let k = 0; k < 3; k++) {
      const a = r() * TAU, yy = y0 + h * (0.18 + k * 0.09);
      bTrunk.cyl.call(bTrunk, m4(x, yy, z, 0.9, a, 0),
        0.022 * h, 0.006 * h, 0.2 * h, 4, [1, 1, 1], false);
    }
    const base = col || [0.55, 0.75, 0.6];
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      const rad = (1.95 - t * 1.6) * h / 8 * (0.88 + r() * 0.24);
      const yy = y0 + h * (0.17 + t * 0.27);
      const hh = h * (0.27 - t * 0.06);
      const kk = 0.78 + t * 0.3 + (r() - 0.5) * 0.08;
      bLeaf.cyl.call(bLeaf, m4(x, yy, z, 0, r() * TAU, 0), rad, Math.max(0.02, rad * 0.1),
        hh, 8, [base[0] * kk, base[1] * kk, base[2] * kk], true);
    }
    bLeaf.cyl.call(bLeaf, m4(x, y0 + h * 0.73, z), h * 0.075, 0.012, h * 0.22, 6,
      [base[0] * 1.05, base[1] * 1.08, base[2] * 1.02], true);
  }
  /** 柏树 / 龙柏：三段重叠的细长锥 + 圆顶，墓园里当配角 */
  function cypressTree(bTrunk, bLeaf, x, z, h, seed, col) {
    const r = rng(seed || 7);
    const y0 = groundH(x, z);
    bTrunk.cyl.call(bTrunk, m4(x, y0, z), 0.035, 0.02, h * 0.35, 5, [1, 1, 1], true);
    const base = col || [0.85, 1.0, 0.82];
    const segs = [[0.0, 0.34, 0.5], [0.28, 0.27, 0.42], [0.55, 0.18, 0.34]];
    for (const s of segs) {
      const kk = 0.82 + r() * 0.3;
      bLeaf.cyl.call(bLeaf, m4(x, y0 + h * s[0], z, 0, r() * TAU, (r() - 0.5) * 0.05),
        h * s[1] * 0.55, Math.max(0.012, h * s[1] * 0.05), h * s[2], 7,
        [base[0] * kk, base[1] * kk, base[2] * kk], true);
    }
    bLeaf.sphere.call(bLeaf, m4(x, y0 + h * 0.86, z, 0, 0, 0, 0.7, 0.9, 0.7),
      h * 0.095, 7, 5, [base[0] * 1.02, base[1] * 1.05, base[2]], false);
  }
  /** 石头矮墙（沿 X 方向） */
  function stoneWall(b, x0, z0, x1, z1, h) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(len / 0.7));
    const ry = Math.atan2(dx, dz);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = x0 + dx * u, z = z0 + dz * u;
      const y = groundH(x, z);
      const g = HASH(i, len);
      b.box.call(b, m4(x, y + h * (0.4 + g * 0.14), z, 0, ry, 0), len / n * 1.02, h * (0.7 + g * 0.25), 0.42,
        [0.72 + g * 0.2, 0.74 + g * 0.2, 0.72 + g * 0.16], 1.4);
    }
  }
  /** 发光小窗：挂在墙上，朝 +Z（or 由 ry 决定朝向） */
  function winGlow(st, key, tex, opts, x, y, z, w, h, ry) {
    const p = st.pen(key, tex || null, Object.assign({ unlit: true }, opts || {}));
    p.quad.call(p, m4(x, y, z, 0, ry || 0, 0), w, h, [1, 1, 1], [0, 0, 1, 1]);
    return p;
  }

  /* ============================================================
   *  大世界专用材质（都在本地用 A3DTex.get 生成，不碰 textures.js）
   * ============================================================ */
  const WTex = (() => {
    let ashlar = null, slate = null, stained = null, rose = null, sea = null, pine = null;
    /** 大块料石：交界清楚、颜色别太跳，教堂才不是「锈铁皮」 */
    function makeAshlar() {
      return A3DTex.get("w.ashlar", 256, 256, (x, w, h) => {
        const r = A3DTex.rnd(311);
        x.fillStyle = "#3a3833"; x.fillRect(0, 0, w, h);
        const rows = 3, cols = 2;
        for (let j = 0; j < rows; j++) {
          const bh = h / rows;
          const off = (j % 2) * (w / cols) * 0.5;
          for (let i = -1; i <= cols; i++) {
            const bx = (i * w / cols + off) % w;
            const t = 0.9 + r() * 0.16;
            const warm = 0.02 + r() * 0.05;
            x.fillStyle = "rgb(" + Math.round(156 * t * (1 + warm)) + "," +
              Math.round(150 * t) + "," + Math.round(136 * t * (1 - warm * 0.4)) + ")";
            x.fillRect(bx + 2.5, j * bh + 2.5, w / cols - 5, bh - 5);
            // 上沿受光、下沿积灰
            x.fillStyle = "rgba(255,246,222,.10)";
            x.fillRect(bx + 2.5, j * bh + 2.5, w / cols - 5, 2);
            x.fillStyle = "rgba(20,18,14,.22)";
            x.fillRect(bx + 2.5, j * bh + bh - 5, w / cols - 5, 2.5);
            // 一点点风化斑
            for (let k = 0; k < 7; k++) {
              x.fillStyle = "rgba(" + (60 + r() * 40) + "," + (56 + r() * 38) + "," + (48 + r() * 30) + "," + (0.04 + r() * 0.09) + ")";
              x.fillRect(bx + 4 + r() * (w / cols - 12), j * bh + 4 + r() * (bh - 12), 1 + r() * 5, 1 + r() * 3);
            }
          }
        }
        A3DTex.grain(x, w, h, { freq: 4, oct: 3, strength: 0.14, seed: 313 });
      });
    }
    /** 石板瓦：一行行叠瓦，屋脊附近有青苔 */
    function makeSlate() {
      return A3DTex.get("w.slate", 256, 256, (x, w, h) => {
        const r = A3DTex.rnd(417);
        x.fillStyle = "#20242a"; x.fillRect(0, 0, w, h);
        const rows = 8, rh = h / rows;
        for (let j = 0; j < rows; j++) {
          const off = (j % 2) * 16;
          for (let i = -1; i <= w / 32 + 1; i++) {
            const bx = i * 32 + off;
            const t = 0.78 + r() * 0.42;
            x.fillStyle = "rgb(" + Math.round(64 * t) + "," + Math.round(72 * t) + "," + Math.round(84 * t) + ")";
            x.fillRect(bx + 1, j * rh + 0.5, 30, rh - 1.5);
            x.fillStyle = "rgba(190,210,230,.13)";
            x.fillRect(bx + 1, j * rh + 0.5, 30, 1.4);
            x.fillStyle = "rgba(0,0,0,.34)";
            x.fillRect(bx + 1, j * rh + rh - 2.2, 30, 2);
          }
        }
        // 青苔：往低处和缝里长
        for (let i = 0; i < 30; i++) {
          const g = x.createRadialGradient(r() * w, r() * h, 1, r() * w, r() * h, 6 + r() * 14);
          g.addColorStop(0, "rgba(70,96,52,.26)"); g.addColorStop(1, "rgba(70,96,52,0)");
          x.fillStyle = g; x.fillRect(0, 0, w, h);
        }
        A3DTex.grain(x, w, h, { freq: 5, oct: 3, strength: 0.18, seed: 419 });
      });
    }
    /** 竖长条彩窗：蓝金为主，铅条分明 */
    function makeStained() {
      return A3DTex.get("w.stained", 128, 256, (x, w, h) => {
        const r = A3DTex.rnd(523);
        x.fillStyle = "#0b1016"; x.fillRect(0, 0, w, h);
        const cols = 4, cw = w / cols;
        const palette = ["#284a78", "#3d6a9a", "#7fa8cc", "#d9a13c", "#a8483c", "#4c7a52", "#c9c2a4"];
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < 8; j++) {
            const c = palette[Math.floor(r() * palette.length)];
            x.fillStyle = c; x.globalAlpha = 0.55 + r() * 0.4;
            x.fillRect(i * cw + 2, j * (h / 8) + 2, cw - 4, h / 8 - 4);
          }
        }
        x.globalAlpha = 1;
        x.strokeStyle = "rgba(8,10,12,.85)"; x.lineWidth = 3;
        for (let i = 1; i < cols; i++) { x.beginPath(); x.moveTo(i * cw, 0); x.lineTo(i * cw, h); x.stroke(); }
        for (let j = 1; j < 8; j++) { x.beginPath(); x.moveTo(0, j * h / 8); x.lineTo(w, j * h / 8); x.stroke(); }
        x.strokeStyle = "rgba(240,220,180,.35)"; x.lineWidth = 1.5;
        x.strokeRect(2, 2, w - 4, h - 4);
        A3DTex.grain(x, w, h, { freq: 6, oct: 2, strength: 0.1, seed: 527 });
      });
    }
    /** 玫瑰窗：放射状彩玻璃 + 中心圆 */
    function makeRose() {
      return A3DTex.get("w.rose", 256, 256, (x, w, h) => {
        const cx = w / 2, cy = h / 2, R = w * 0.48;
        const r = A3DTex.rnd(631);
        const cols = ["#2a4f80", "#4b7cae", "#8fb6d6", "#d8a23f", "#a94b3f", "#4f8058", "#d8cfae"];
        for (let k = 0; k < 12; k++) {
          const a0 = k / 12 * Math.PI * 2, a1 = (k + 1) / 12 * Math.PI * 2;
          x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a0, a1); x.closePath();
          x.fillStyle = cols[k % cols.length]; x.globalAlpha = 0.7 + r() * 0.3; x.fill();
        }
        x.globalAlpha = 1;
        x.strokeStyle = "rgba(10,12,14,.9)"; x.lineWidth = 6;
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * Math.PI * 2;
          x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke();
        }
        x.beginPath(); x.arc(cx, cy, R * 0.42, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.arc(cx, cy, R * 0.72, 0, Math.PI * 2); x.stroke();
        x.fillStyle = "rgba(240,205,120,.85)";
        x.beginPath(); x.arc(cx, cy, R * 0.16, 0, Math.PI * 2); x.fill();
        x.strokeStyle = "rgba(240,220,180,.5)"; x.lineWidth = 3;
        x.beginPath(); x.arc(cx, cy, R - 2, 0, Math.PI * 2); x.stroke();
        A3DTex.grain(x, w, h, { freq: 6, oct: 2, strength: 0.08, seed: 633 });
      });
    }
    /** 针叶 / 树冠：深绿底 + 竖向枝条纹理，让锥体近看不只是一块纯色 */
    function makePine() {
      return A3DTex.get("w.pineTex", 256, 256, (x, w, h) => {
        const r = A3DTex.rnd(811);
        x.fillStyle = "#24382a"; x.fillRect(0, 0, w, h);
        // 竖向的枝条 / 针叶簇
        for (let i = 0; i < 340; i++) {
          const px = r() * w, py = r() * h;
          const len = 8 + r() * 46, sway = (r() - 0.5) * 10;
          const g = 0.55 + r() * 0.55;
          x.strokeStyle = "rgba(" + Math.round(58 * g) + "," + Math.round(96 * g) + "," +
            Math.round(64 * g) + "," + (0.18 + r() * 0.34) + ")";
          x.lineWidth = 0.8 + r() * 2.2;
          x.beginPath();
          x.moveTo(px, py);
          x.quadraticCurveTo(px + sway * 0.5, py + len * 0.5, px + sway, py + len);
          x.stroke();
        }
        // 枝条间的暗缝
        for (let i = 0; i < 46; i++) {
          const px = r() * w;
          x.strokeStyle = "rgba(8,16,10," + (0.12 + r() * 0.18) + ")";
          x.lineWidth = 1 + r() * 3;
          x.beginPath(); x.moveTo(px, r() * h * 0.4); x.lineTo(px + (r() - 0.5) * 6, h); x.stroke();
        }
        A3DTex.grain(x, w, h, { freq: 5, oct: 3, strength: 0.12, seed: 813 });
      });
    }
    /** 海水：低频横向波纹 + 极弱噪点，整张必须能无缝平铺。
     *  平铺的贴图最怕两件事：上下方向的明暗渐变（每一格都是一道横带）、
     *  花纹/亮点头尾不接（每一格重复同一串波纹和同一颗星子 → 点阵感）。
     *  对比度也要压住：掠射角下高对比的 caustic 会出摩尔纹。 */
    function makeSea() {
      return A3DTex.get("w.seaTex", 256, 256, (x, w, h) => {
        const r = A3DTex.rnd(733);
        /* 统一深蓝底，上下不做渐变：渐变一旦平铺就是一道道横带，
           掠射角下整片海看着像百叶窗。 */
        x.fillStyle = "#101d2e"; x.fillRect(0, 0, w, h);
        // 横向长波纹：x 方向整周期（首尾对得上），纵向留在瓦片内，低对比
        for (let k = 0; k < 12; k++) {
          const cyc = 1 + Math.floor(r() * 2);
          const amp = 1.0 + r() * 3.2, ph = r() * TAU;
          const y0 = amp + 4 + r() * (h - 2 * amp - 8);
          x.strokeStyle = "rgba(120,170,220," + (0.018 + r() * 0.028) + ")";
          x.lineWidth = 0.8 + r() * 1.4;
          x.beginPath();
          for (let px = 0; px <= w; px += 4) {
            const py = y0 + Math.sin((px / w) * TAU * cyc + ph) * amp;
            if (px === 0) x.moveTo(px, py); else x.lineTo(px, py);
          }
          x.stroke();
        }
        // 少量亮点（月光碎屑），不许太密
        for (let i = 0; i < 18; i++) {
          const px = r() * w, py = r() * h, rr = 0.9 + r() * 2.2;
          /* 跨边界的亮点按 3×3 复制补齐，否则平铺后每格都挂着同一颗，排成点阵 */
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const cx0 = px + dx * w, cy0 = py + dy * h;
              if (cx0 < -rr || cx0 > w + rr || cy0 < -rr || cy0 > h + rr) continue;
              const g2 = x.createRadialGradient(cx0, cy0, 0, cx0, cy0, rr);
              g2.addColorStop(0, "rgba(190,215,245,.16)");
              g2.addColorStop(1, "rgba(190,215,245,0)");
              x.fillStyle = g2; x.beginPath(); x.arc(cx0, cy0, rr, 0, TAU); x.fill();
            }
          }
        }
        A3DTex.grain(x, w, h, { freq: 2, oct: 3, strength: 0.09, seed: 737 });
      });
    }
    return {
      ashlar() { return ashlar || (ashlar = makeAshlar()); },
      slate() { return slate || (slate = makeSlate()); },
      stained() { return stained || (stained = makeStained()); },
      rose() { return rose || (rose = makeRose()); },
      sea() { return sea || (sea = makeSea()); },
      pine() { return pine || (pine = makePine()); }
    };
  })();

  /* ============================================================
   *  地面 / 沙滩 / 海
   * ============================================================ */
  function buildGround(st) {
    /* 逐顶点色承担草/沙/土路，贴图只出细节（脏点、颗粒），所以 tint 接近中性、
       UV 比原来密一点，2m 网格下不会糊成一片。 */
    /* uvRand：每格随机转 90° / 翻转，相邻两块地皮不再长得一模一样 */
    const ground = st.pen("w.ground", T.dirt(), { tint: [0.92, 1.02, 0.9], spec: 0.08, rim: 0.22, sway: 0, uvRand: true });
    terrainMesh(ground, -250, 250, -110, 176, 240, 137, 0.46);

    /* ---- 水线碎石：贴着真正的水线（groundH = waterY ≈ z -103），不是数学直线 ---- */
    const rock = st.pen("w.rock", T.stone(), { tint: [0.5, 0.53, 0.58], spec: 0.2, rim: 0.16 });
    const r = rng(19);
    for (let i = 0; i < 130; i++) {
      const x = -160 + r() * 330;
      const z = -104.4 + r() * 4.2 + Math.sin(x * 0.09) * 0.9;
      const s = 0.18 + r() * r() * 1.35;
      rock.sphere.call(rock, m4(x, groundH(x, z) - 0.06, z, r() * 0.4, r() * TAU, r() * 0.4,
        s, s * (0.42 + r() * 0.22), s * 0.82), 1, 7, 5, [0.82 + r() * 0.3, 0.84, 0.92]);
    }
    // 沙滩上零星的卵石 / 贝壳，给近处的沙面一点尺度
    const pebble = st.pen("w.pebble", T.stone(), { tint: [0.9, 0.86, 0.8], spec: 0.25, rim: 0.2 });
    for (let i = 0; i < 90; i++) {
      const z = -101.6 + r() * 20;
      const x = -150 + r() * 300;
      const s = 0.04 + r() * 0.14;
      pebble.sphere.call(pebble, m4(x, groundH(x, z) + 0.01, z, r(), r() * TAU, r() * 0.3,
        s, s * 0.36, s * 0.8), 1, 5, 3, [1, 0.92 + r() * 0.12, 0.84]);
    }
    // 冲上岸的浮木 + 海带
    const drift = st.pen("w.drift", T.woodPale(), { tint: [0.86, 0.78, 0.68], spec: 0.05 });
    const kelp = st.pen("w.kelp", T.leaf(), { cutout: true, tint: [0.28, 0.34, 0.22], sway: 1, spec: 0.02 });
    for (let i = 0; i < 14; i++) {
      const x = -120 + r() * 250, z = -101.2 + r() * 1.6;
      drift.cyl.call(drift, m4(x, groundH(x, z) + 0.08, z, Math.PI / 2, r() * TAU, 0.12),
        0.07 + r() * 0.06, 0.05, 1.1 + r() * 1.6, 6, [1, 1, 1], true);
    }
    for (let i = 0; i < 18; i++) {
      const x = -140 + r() * 290, z = -102.4 + r() * 2.2;
      kelp.quad.call(kelp, m4(x, groundH(x, z) + 0.03, z, -Math.PI / 2, r() * TAU, 0),
        0.22 + r() * 0.3, 0.6 + r() * 0.8, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 岸边的芦苇 / 海草（沙地边缘 + 营地外缘，别长到路中间）
    const grass = st.pen("w.shoreGrass", T.leaf(), { cutout: true, tint: [0.62, 0.72, 0.5], sway: 1, spec: 0.05 });
    for (let i = 0; i < 90; i++) {
      const x = -145 + r() * 290;
      const z = -101 + r() * 14;
      if (onPath(x, z, 2.2)) continue;
      P.grass(grass, m4(x, groundH(x, z), z, 0, r() * TAU, 0), 4 + Math.floor(r() * 4), 0.3 + r() * 0.55,
        [0.78, 1.0, 0.72], Math.floor(r() * 99), 0.4);
    }
    // 土路两侧踩出来的碎草 / 石子：让路径和地形咬在一起
    const verge = st.pen("w.verge", T.leaf(), { cutout: true, tint: [0.72, 0.78, 0.5], sway: 1, spec: 0.04 });
    for (let i = 0; i < 220; i++) {
      const p = PATHS[i % PATHS.length];
      const seg = Math.floor(r() * (p.pts.length - 1));
      const a = p.pts[seg], b = p.pts[seg + 1];
      const u = r();
      const x = a[0] + (b[0] - a[0]) * u + (r() - 0.5) * 1.2;
      const z = a[1] + (b[1] - a[1]) * u + (r() - 0.5) * 1.2;
      const pi = pathInfo(x, z);
      const off = p.w + 0.15 + r() * 1.6;
      if (Math.abs(pi.d - off) > 0.5) continue;
      P.grass(verge, m4(x, groundH(x, z), z, 0, r() * TAU, 0), 2 + Math.floor(r() * 3),
        0.16 + r() * 0.22, [0.85, 0.95, 0.62], Math.floor(r() * 99), 0.5);
    }

    // 海面：一块巨大的平板，靠雾接到天边。纹理是低对比度的深海水，掠射角下不会闪成马赛克
    const sea = st.pen("w.sea", WTex.sea(), { tint: [1.05, 1.02, 0.98], spec: 1.35, rim: 0.12, uvAnim: t => [t * 0.006, t * 0.0035] });
    /* 海面明暗逐顶点插值，40m 一格不再有台阶；UV 走世界坐标，贴图跨格子连续。
       0.11 → 一张 256px 的浪纹铺 9m：比原来（4.5m）疏一半，
       掠射角下重复的节奏不那么像梯子，近处仍看得到水纹。 */
    seaSurface(sea, -480, 480, -902, -102, 24, 20, 0.11);

    // 月光在水面上的碎光：从近处一直铺到月亮那个方向
    const moonPath = st.pen("w.moonPath", T.glow(), { unlit: true, blend: "add", tint: [0.62, 0.7, 0.95], opacity: 0.075 });
    const ex = L.titleCam.eye[0], ez = L.titleCam.eye[2];
    const mdx = L.moon.x - ex, mdz = L.moon.z - ez;
    const mlen = Math.hypot(mdx, mdz) || 1;
    const mnx = mdx / mlen, mnz = mdz / mlen;
    const mry = Math.atan2(-mnx, -mnz);
    for (let i = 0; i < 18; i++) {
      const u = i / 17;
      const d = 112 + u * 330;
      const px = ex + mnx * d, pz = ez + mnz * d;
      const w = 2.5 + u * 8, h = 7 + u * 14;
      moonPath.quad.call(moonPath, m4(px, L.waterY + 0.02, pz, -Math.PI / 2, mry, 0), w, h, [1, 1, 1], [0, 0, 1, 3]);
    }
    // 月亮正下方那一小段最亮的光斑
    const moonCore = st.pen("w.moonCore", T.glow(), { unlit: true, blend: "add", tint: [0.9, 0.94, 1.0], opacity: 0.16 });
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const d = 105 + u * 30;
      moonCore.quad.call(moonCore, m4(ex + mnx * d, L.waterY + 0.03, ez + mnz * d, -Math.PI / 2, mry, 0),
        2 + u * 2, 4 + u * 4, [1, 1, 1], [0, 0, 1, 2]);
    }

    /* 岸线浪花：贴着 actual 水线（z≈-103），两条，
       外圈泡沫压在水面上，内圈很淡地漫上湿沙。 */
    const foam = st.pen("w.foam", T.glow(), { unlit: true, blend: "add", tint: [0.75, 0.85, 1.0], opacity: 0.11 });
    for (let i = 0; i < 26; i++) {
      const x = -165 + i * 12.8;
      const z = -103.1 + Math.sin(x * 0.11) * 0.5;
      const k = 0.55 + vnoise(x * 0.05, 2.7) * 0.8;
      foam.quad.call(foam, m4(x, L.waterY + 0.03, z, -Math.PI / 2, 0.05, 0), 13.5 * k, 1.9,
        [1, 1, 1], [0, 0, 5, 1]);
      if (i % 2 === 0) {
        foam.quad.call(foam, m4(x + 3, L.waterY + 0.025, z - 1.6, -Math.PI / 2, 0.05, 0), 5.5 * k, 0.9,
          [1, 1, 1], [0, 0, 3, 1]);
      }
    }
  }

  /* ============================================================
   *  南边的悬崖台地：松树、草、崖沿的碎石
   * ============================================================ */
  /** 主标题镜头 → 教堂正面的视线通道：这一段里不种高树，别挡住主体 */
  function blocksChurchView(x, z) {
    const ax = L.titleCam.eye[0], az = L.titleCam.eye[2];
    const bx = L.church.x, bz = L.church.z + CHURCH.hl;
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    return d < 11 || (Math.abs(x - 2) < 9 && z > 26 + HILL_SHIFT && z < 62 + HILL_SHIFT);
  }
  /** 教堂台基 + 前院：这一片不种树（矩形留空，比圆形贴得住加长后的教堂） */
  function inChurchYard(x, z, pad) {
    return Math.abs(x - L.church.x) < CHURCH.platHW + (pad || 0) &&
      Math.abs(z - L.church.z) < CHURCH.platHL + (pad || 0);
  }
  /** 教堂门前甬道 / 台地小路的走廊，别在路中间种树 */
  function onChurchPath(x, z) {
    if (z < 100 || z > 160) return false;
    const px = 20.2 + Math.sin((z - 100) / 52 * 3.0) * 1.2;
    return Math.abs(x - px) < 7.0;
  }

  function buildHill(st) {
    const trunk = st.pen("w.trunk", T.woodDark(), { tint: [0.42, 0.34, 0.3] });
    const leaf = st.pen("w.pine", WTex.pine(), { tint: [1.55, 1.55, 1.45], spec: 0.05, rim: 0.15, sway: 1 });
    const r = rng(23);
    // 台地上的松树：给教堂、镜头通道、甬道留空
    for (let i = 0; i < 64; i++) {
      const x = L.ridge.x0 + (r() - 0.5) * 2 * L.ridge.wide * 0.95;
      const z = 16 + HILL_SHIFT + r() * 96;
      if (inChurchYard(x, z, 3)) continue;
      if (blocksChurchView(x, z) || onChurchPath(x, z)) continue;
      pine(trunk, leaf, x, z, 5 + r() * 7, Math.floor(r() * 999), [0.9, 1.1, 0.95]);
    }
    // 崖脚的一排树，从上往下看能看出垂直落差
    for (let i = 0; i < 16; i++) {
      const x = -52 + i * 7 + (r() - 0.5) * 3;
      const z = -2 + HILL_SHIFT + (r() - 0.5) * 5;
      pine(trunk, leaf, x, z, 6 + r() * 5, Math.floor(r() * 999), [0.9, 1.05, 0.95]);
    }

    // 草：台地上，sway 让风有存在感
    const grass = st.pen("w.hillGrass", T.leaf(), { cutout: true, tint: [0.52, 0.66, 0.46], sway: 1, spec: 0.04 });
    const gr = rng(31);
    for (let i = 0; i < 320; i++) {
      const x = L.ridge.x0 + (gr() - 0.5) * 2 * L.ridge.wide * 0.9;
      const z = 16 + HILL_SHIFT + gr() * 96;
      if (inChurchYard(x, z, 0)) continue;
      const y = groundH(x, z);
      P.grass(grass, m4(x, y, z, 0, gr() * TAU, 0), 4 + Math.floor(gr() * 4), 0.28 + gr() * 0.34,
        [0.75, 1.0, 0.8], Math.floor(gr() * 999), 0.3);
    }
    // 台地上的灌木 / 小石头
    const shrub = st.pen("w.shrub", T.leaf(), { cutout: true, tint: [0.36, 0.52, 0.32], sway: 1, rim: 0.1 });
    const bush = st.pen("w.bush", null, { tint: [0.2, 0.3, 0.22], spec: 0.04, rim: 0.12 });
    for (let i = 0; i < 46; i++) {
      const x = L.ridge.x0 + (gr() - 0.5) * 2 * L.ridge.wide * 0.85;
      const z = 15 + HILL_SHIFT + gr() * 98;
      if (inChurchYard(x, z, 2)) continue;
      if (blocksChurchView(x, z) || onChurchPath(x, z)) continue;
      const y = groundH(x, z);
      const s = 0.5 + gr() * 0.9;
      bush.sphere.call(bush, m4(x, y + s * 0.35, z, 0, gr() * TAU, 0, 1, 0.7, 1), s, 7, 5,
        [1, 1, 1]);
      for (let k = 0; k < 4; k++) {
        shrub.quad.call(shrub, m4(x + (gr() - 0.5) * s, y + s * 0.5 + gr() * s * 0.4,
          z + (gr() - 0.5) * s, -0.3, gr() * TAU, 0), 0.3, 0.4, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    // 崖沿的碎石：标出悬崖边缘，从上往下看不会像一块平草地突然断掉
    const rimRock = st.pen("w.rimRock", T.stone(), { tint: [0.42, 0.43, 0.46], spec: 0.12 });
    const rr = rng(57);
    for (let i = 0; i < 110; i++) {
      const x = -64 + rr() * 128;
      const z = L.ridge.z1 - 1.2 + rr() * 3.6;
      const s = 0.28 + rr() * 1.35;
      const y = groundH(x, z);
      rimRock.sphere.call(rimRock, m4(x, y + s * 0.1, z, rr(), rr() * TAU, rr(), s, s * 0.5, s * 0.8),
        1, 7, 5, [0.85 + rr() * 0.3, 0.86, 0.9]);
    }
  }

  /* ============================================================
   *  海岸平原：草甸 / 碎石 / 灌木 / 教堂路两侧的木栅栏与电线杆
   * ============================================================ */
  function buildPlain(st) {
    const r = rng(29);
    const grass = st.pen("w.plainGrass", T.leaf(), { cutout: true, tint: [0.5, 0.62, 0.4], sway: 1, spec: 0.04 });
    const shrub = st.pen("w.plainShrub", T.leaf(), { cutout: true, tint: [0.32, 0.46, 0.3], sway: 1 });
    const bush = st.pen("w.plainBush", null, { tint: [0.18, 0.28, 0.2], spec: 0.04, rim: 0.1 });
    const rock = st.pen("w.plainRock", T.stone(), { tint: [0.46, 0.47, 0.5], spec: 0.14 });
    const flower = st.pen("w.plainFlower", T.petal(), { cutout: true, tint: [1.3, 1.0, 0.6], sway: 1 });
    const inCity = (x, z) => x > L.city.x0 - 6 && z > L.city.z0 - 6 && z < L.city.z1 + 8;
    const onStreet = (x, z) => x > -18 && x < 28 && z > -86 && z < -56;
    const nearCamp = (x, z) => rectDist(x, z, { x0: -108, x1: -33, z0: -104, z1: -62 }) < 4;
    const nearLh = (x, z) => Math.hypot(x - L.lighthouse.x, z - L.lighthouse.z) < 12;
    // 平原北界跟着崖脚走：台地退到哪儿，草甸就补到哪儿，别留一条光秃秃的地
    const plainTop = L.ridge.z0 - 2;
    const plainSpan = plainTop + 96;
    const skip = (x, z, pad) => onPath(x, z, pad || 1.6) || inCity(x, z) || onStreet(x, z) ||
      nearCamp(x, z) || nearLh(x, z) || z < -98;

    // 平原草甸：成簇，不要均匀撒点
    for (let i = 0; i < 3600; i++) {
      const x = -185 + r() * 265, z = -96 + r() * plainSpan;
      if (skip(x, z, 1.2)) continue;
      const y = groundH(x, z);
      P.grass(grass, m4(x, y, z, 0, r() * TAU, 0), 3 + Math.floor(r() * 4), 0.2 + r() * 0.3,
        [0.8, 0.98, 0.7], Math.floor(r() * 999), 0.35);
    }
    // 灌木丛 / 石头
    for (let i = 0; i < 300; i++) {
      const x = -185 + r() * 265, z = -96 + r() * plainSpan;
      if (skip(x, z, 2)) continue;
      const y = groundH(x, z);
      const s = 0.45 + r() * 0.8;
      bush.sphere.call(bush, m4(x, y + s * 0.3, z, 0, r() * TAU, 0, 1, 0.62, 1), s, 7, 5, [1, 1, 1]);
      for (let k = 0; k < 3; k++) {
        shrub.quad.call(shrub, m4(x + (r() - 0.5) * s, y + s * 0.45 + r() * s * 0.35,
          z + (r() - 0.5) * s, -0.3, r() * TAU, 0), 0.26, 0.36, [1, 1, 1], [0, 0, 1, 1]);
      }
    }
    for (let i = 0; i < 680; i++) {
      const x = -185 + r() * 265, z = -96 + r() * plainSpan;
      if (skip(x, z, 1)) continue;
      const y = groundH(x, z);
      const s = 0.16 + r() * r() * 0.8;
      rock.sphere.call(rock, m4(x, y + s * 0.12, z, r(), r() * TAU, r(), s, s * 0.5, s * 0.8),
        1, 6, 4, [0.9 + r() * 0.25, 0.92, 1]);
    }
    // 草木花：只长在教堂路与营地入口土路两侧
    for (let i = 0; i < 170; i++) {
      const p = PATHS[i % 2 === 0 ? 2 : 0];
      const seg = Math.floor(r() * (p.pts.length - 1));
      const a = p.pts[seg], b = p.pts[seg + 1];
      const u = r();
      const x = a[0] + (b[0] - a[0]) * u + (r() - 0.5) * 7;
      const z = a[1] + (b[1] - a[1]) * u + (r() - 0.5) * 7;
      const pi = pathInfo(x, z);
      if (Math.abs(pi.d - pi.w) > 1.5) continue;
      const y = groundH(x, z);
      for (let k = 0; k < 2; k++) {
        flower.quad.call(flower, m4(x + (r() - 0.5) * 0.4, y + 0.08 + r() * 0.1,
          z + (r() - 0.5) * 0.4, -0.3, r() * TAU, 0), 0.11, 0.14, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    /* ---- 教堂路两侧的木栅栏：一路从崖脚接到街口 ---- */
    const postP = st.pen("w.fencePost", T.woodDark(), { tint: [0.95, 0.82, 0.64], spec: 0.08, rim: 0.12 });
    const railP = st.pen("w.fenceRail", T.woodPale(), { tint: [0.82, 0.76, 0.64], spec: 0.06 });
    const road = PATHS[2].pts;
    const fenceSide = (sgn) => {
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i], b = road[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(len / 3.2));
        const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n;
          const px = a[0] + (b[0] - a[0]) * u + Math.cos(ry) * sgn * 4.4;
          const pz = a[1] + (b[1] - a[1]) * u - Math.sin(ry) * sgn * 4.4;
          const py = groundH(px, pz);
          postP.box.call(postP, m4(px, py + 0.5, pz, 0, ry, 0), 0.12, 1.0, 0.12, [1, 1, 1], 1.2);
          // 每根柱子之间的两道横杆（按地面起伏倾斜）
          if (k > 0) {
            const qx = a[0] + (b[0] - a[0]) * ((k - 0.5) / n) + Math.cos(ry) * sgn * 4.4;
            const qz = a[1] + (b[1] - a[1]) * ((k - 0.5) / n) - Math.sin(ry) * sgn * 4.4;
            const qy = groundH(qx, qz);
            const seglen = Math.hypot(px - qx, pz - qz);
            for (const hh of [0.38, 0.72]) {
              railP.box.call(railP, m4((px + qx) / 2, (py + qy) / 2 + hh, (pz + qz) / 2,
                0, Math.atan2(px - qx, pz - qz) + Math.PI / 2, Math.atan2(py - qy, seglen) * 0.9),
                seglen, 0.07, 0.05, [1, 1, 1], 1.4);
            }
          }
        }
      }
    };
    fenceSide(-1);
    fenceSide(1);

    /* ---- 沿教堂路的电线杆 + 电线：给平原一条「人住在附近」的线索 ---- */
    const pole = st.pen("w.pole", T.woodDark(), { tint: [0.8, 0.68, 0.54], spec: 0.06 });
    const cable = st.pen("w.cable", null, { tint: [0.06, 0.065, 0.07], spec: 0.2 });
    const poleTops = [];
    for (let i = 0; i < 8; i++) {
      const sp = samplePath(PATHS[2].pts, 0.06 + (i / 7) * 0.88);
      // 路的东侧（城市那侧）立杆；用切线法线算，路变长了也不会歪
      const px = sp.x - Math.cos(sp.ry) * 6.8;
      const pz = sp.z + Math.sin(sp.ry) * 6.8;
      const py = groundH(px, pz);
      pole.cyl.call(pole, m4(px, py, pz), 0.11, 0.08, 7.2, 6, [1, 1, 1], true);
      pole.box.call(pole, m4(px, py + 6.7, pz, 0, 0, 0), 1.5, 0.11, 0.12, [1, 1, 1], 1.2);
      poleTops.push([px, py + 6.72, pz]);
    }
    for (let i = 0; i < poleTops.length - 1; i++) {
      const a = poleTops[i], b = poleTops[i + 1];
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 0.7,
          a[2] + (b[2] - a[2]) * u]);
      }
      cable.tube.call(cable, M.ident(), pts, 0.018, 4, [1, 1, 1]);
    }

    /* ---- 教堂路的路灯：从主标题看是一条从城市爬到崖脚的暖光路 ---- */
    const roadLampPole = st.pen("w.roadLampPole", T.darkMetal(), { tint: [0.34, 0.34, 0.38], spec: 0.3 });
    const roadLampGlow = st.pen("w.roadLampGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.72, 0.4], opacity: 0.34 });
    const roadLampGlass = st.pen("w.roadLampGlass", null, { unlit: true, tint: [1.0, 0.84, 0.55] });
    for (let i = 0; i < 8; i++) {
      const sp = samplePath(PATHS[2].pts, (i + 0.5) / 8);
      const lx = sp.x - 5.4, lz = sp.z;
      const ly = groundH(lx, lz);
      roadLampPole.cyl.call(roadLampPole, m4(lx, ly, lz), 0.07, 0.055, 3.4, 5, [1, 1, 1], true);
      roadLampPole.box.call(roadLampPole, m4(lx, ly + 3.45, lz), 0.34, 0.12, 0.34, [1, 1, 1], 1.2);
      roadLampGlass.quad.call(roadLampGlass, m4(lx, ly + 3.42, lz + 0.18), 0.3, 0.3, [1, 1, 1], [0, 0, 1, 1]);
      roadLampGlow.quad.call(roadLampGlow, m4(lx, ly + 3.4, lz + 0.24), 3.2, 3.2, [1, 1, 1], [0, 0, 1, 1]);
    }
  }

  /* ============================================================
   *  教堂的尺度常量（buildChurch 与门前近景机位共用）
   *  局部坐标：+Z = 南 = 正门方向，原点在教堂中心的地面高度上。
   * ============================================================ */
  const CHURCH = {
    platHW: 9.4, platHL: 14.2,   // 台基半宽 / 半长
    hw: 8.4, hl: 12.0,           // 中殿半宽 / 半长
    baseH: 0.34                  // 台基顶面高出最高地面
  };
  /** 教堂台基：返回 { y0, D, PT, PB }（PT = 台基顶面在局部坐标的 y） */
  function churchBase() {
    const C = L.church, P = CHURCH;
    const y0 = groundH(C.x, C.z);
    const D = m4(C.x, y0, C.z, 0, C.rot, 0);
    let hi = -Infinity, lo = Infinity;
    for (const [lx, lz] of [[-P.platHW, -P.platHL], [P.platHW, -P.platHL], [P.platHW, P.platHL],
      [-P.platHW, P.platHL], [0, -P.platHL], [0, P.platHL], [-P.platHW, 0], [P.platHW, 0]]) {
      const q = M.xf(D, [lx, 0, lz]);
      const h = groundH(q[0], q[2]) - y0;
      if (h > hi) hi = h;
      if (h < lo) lo = h;
    }
    return { y0, D, PT: hi + P.baseH, PB: lo - 0.4 };
  }

  /* ============================================================
   *  教堂 + 前院 + 甬道（主标题的近景，也是 claude_door 的实景）
   *
   *  这一版把体量放大了一圈：中殿 16.8 × 24m、屋脊抬到 10m、钟楼 6.2m 见方，
   *  正面加玫瑰窗和山墙尖饰，外围是「石院墙（内）+ 铁栅栏（外）」两圈。
   *  钟楼尖顶上立 Claude 的星芒标志——从主标题看，那是山脊上唯一的橙色记号。
   * ============================================================ */
  function buildChurch(st) {
    const C = L.church;
    const B0 = churchBase();
    const y0 = B0.y0, D = B0.D;
    const PT = B0.PT, PB = B0.PB;
    const HW = CHURCH.hw, HL = CHURCH.hl;
    const PLW = CHURCH.platHW, PLL = CHURCH.platHL;
    const NT = PT + 4.85;            // 墙顶
    const EAVE = PT + 4.68;          // 檐口
    const RIDGE = PT + 10.1;         // 屋脊

    const stone = st.pen("w.church", WTex.ashlar(), { tint: [0.96, 0.97, 0.95], spec: 0.06, rim: 0.2 });
    const trim = st.pen("w.churchTrim", WTex.ashlar(), { tint: [1.13, 1.13, 1.08], spec: 0.05, rim: 0.2 });
    const dark = st.pen("w.churchDark", T.stone(), { tint: [0.34, 0.34, 0.37], spec: 0.05 });
    const roofP = st.pen("w.churchRoof", WTex.slate(), { tint: [1.02, 1.08, 1.16], spec: 0.24, rim: 0.18 });
    const glass = st.pen("w.churchGlass", WTex.stained(), { unlit: true, tint: [1, 1, 1] });
    const roseP = st.pen("w.churchRose", WTex.rose(), { unlit: true, tint: [1, 1, 1] });
    const glowP = st.pen("w.churchGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.6, 0.24], opacity: 0.22 });
    const doorP = st.pen("w.churchDoor", T.woodDark(), { tint: [0.62, 0.44, 0.3], spec: 0.22, rim: 0.1 });
    const iron = st.pen("w.churchIron", T.darkMetal(), { tint: [0.3, 0.31, 0.34], spec: 0.52 });
    const goldP = st.pen("w.churchGold", T.brass(), { tint: [1.15, 0.98, 0.6], spec: 0.62 });
    const lampGlass = st.pen("w.churchLamp", null, { unlit: true, tint: [1.0, 0.78, 0.42] });
    const hedge = st.pen("w.churchHedge", T.fabric(), { tint: [0.38, 0.56, 0.36], spec: 0.03, rim: 0.1 });
    const flowerP = st.pen("w.churchFlower", T.petal(), { cutout: true, tint: [1.35, 0.9, 0.55], sway: 1 });
    const pave = st.pen("w.churchPave", T.paving(), { tint: [0.74, 0.72, 0.68], spec: 0.1, rim: 0.12 });
    const ironFence = st.pen("w.churchFence", T.darkMetal(), { tint: [0.3, 0.31, 0.34], spec: 0.46 });
    const fenceStone = st.pen("w.churchFenceStone", WTex.ashlar(), { tint: [0.9, 0.88, 0.82], spec: 0.08, rim: 0.16 });
    const markP = st.pen("w.claudeMark", null, { unlit: true, tint: [1.0, 0.52, 0.35] });

    const mul = m => M.mul(D, m);
    const B = (p, x, y, z, sx, sy, sz, col, uv) =>
      p.box.call(p, mul(m4(x, y, z)), sx, sy, sz, col || [1, 1, 1], uv === undefined ? 0.56 : uv);
    const BR = (p, x, y, z, rx, ry, rz, sx, sy, sz, col, uv) =>
      p.box.call(p, mul(m4(x, y, z, rx, ry, rz)), sx, sy, sz, col || [1, 1, 1], uv === undefined ? 0.56 : uv);
    const Q = (p, x, y, z, rx, ry, rz, w, h, col, uv) =>
      p.quad.call(p, mul(m4(x, y, z, rx, ry, rz)), w, h, col || [1, 1, 1], uv || [0, 0, 1, 1]);
    const cyl = (p, x, y, z, r0, r1, hh, seg, col, rx, ry, rz, cap) =>
      p.cyl.call(p, mul(m4(x, y, z, rx || 0, ry || 0, rz || 0)), r0, r1, hh, seg, col || [1, 1, 1],
        cap === undefined ? true : cap);

    /* ---- 台基：按一圈采样点定高度，前后都不会埋进土里 ---- */
    B(stone, 0, (PB + PT) / 2, 0, PLW * 2, PT - PB, PLL * 2, [1, 1, 1]);
    B(trim, 0, PB + 0.24, 0, PLW * 2 + 0.34, 0.4, PLL * 2 + 0.34, [0.9, 0.89, 0.86]);
    B(trim, 0, PT - 0.09, 0, PLW * 2 + 0.4, 0.2, PLL * 2 + 0.4, [1, 1, 1]);
    // 台基侧面的盲拱壁龛：远看是一片平墙，近看有节奏
    for (const s2 of [-1, 1]) {
      for (let k = -3; k <= 3; k++) {
        if (Math.abs(k) < 1) continue;
        B(trim, s2 * (PLW + 0.04), PT - 0.95, k * 3.64, 0.16, 1.5, 0.5, [0.94, 0.93, 0.9]);
      }
    }

    /* ---- 中殿墙 ---- */
    B(stone, 0, (PT + NT) / 2, 0, HW * 2, NT - PT, HL * 2, [1, 1, 1]);
    B(trim, 0, PT + 0.2, 0, HW * 2 + 0.26, 0.24, HL * 2 + 0.26, [1, 1, 1]);      // 勒脚线
    B(trim, 0, PT + 2.66, 0, HW * 2 + 0.16, 0.14, HL * 2 + 0.16, [1, 1, 1]);   // 腰线
    B(trim, 0, NT - 0.2, 0, HW * 2 + 0.26, 0.26, HL * 2 + 0.26, [1, 1, 1]);    // 檐下串线
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // 转角石：一高一低交错，远看能看出砌筑感
        for (let k = 0; k < 8; k++) {
          const yy = PT + 0.46 + k * 0.55;
          const w = k % 2 ? 1.0 : 1.4;
          B(trim, sx * (HW + 0.02), yy, sz * (HL - w / 2), 0.18, 0.52, w, [1, 1, 1]);
          B(trim, sx * (HW - w / 2), yy, sz * (HL + 0.02), w, 0.52, 0.18, [1, 1, 1]);
        }
      }
    }

    /* ---- 屋顶：两坡石板 + 底面 + 屋脊 + 封檐板 ---- */
    const roofHalf = HW + 0.45, roofZ = HL + 0.4;
    const eaveL = [-roofHalf, EAVE, -roofZ], eaveR = [roofHalf, EAVE, -roofZ];
    const eaveLf = [-roofHalf, EAVE, roofZ], eaveRf = [roofHalf, EAVE, roofZ];
    const ridgeB = [0, RIDGE, -roofZ], ridgeF = [0, RIDGE, roofZ];
    gableRoof(roofP, mul(m4(0, EAVE, 0)), roofHalf * 2, roofZ * 2, RIDGE - EAVE,
      [1, 1, 1], 0.42, false);
    // 屋顶底面：从下面仰视时不能看穿（教堂立在崖边，贴近看得到檐下）
    const eaveP = st.pen("w.churchEave", T.stone(), { tint: [0.62, 0.6, 0.56], spec: 0.04 });
    const underY = -0.16;
    const uL = [eaveL[0], eaveL[1] + underY, eaveL[2]], uLF = [eaveLf[0], eaveLf[1] + underY, eaveLf[2]];
    const uRB = [ridgeB[0], ridgeB[1] + underY, ridgeB[2]], uRF = [ridgeF[0], ridgeF[1] + underY, ridgeF[2]];
    const uR = [eaveR[0], eaveR[1] + underY, eaveR[2]], uRF2 = [eaveRf[0], eaveRf[1] + underY, eaveRf[2]];
    P.quad4(eaveP, D, uL, uRB, uRF, uLF, [1, 0.96, 0.9], [0, 0, 1, 1], 0);
    P.quad4(eaveP, D, uRB, uR, uRF2, uRF, [1, 0.96, 0.9], [0, 0, 1, 1], 0);
    // 屋脊：一根压脊 + 几个脊饰
    BR(trim, 0, RIDGE + 0.02, 0, 0, 0, Math.PI / 2, 0.18, 1.05, roofZ * 2 + 0.5, [1, 1, 1], 0.5);
    for (let z = -roofZ + 0.3; z <= roofZ - 0.3; z += 1.45) {
      B(trim, 0, RIDGE + 0.15, z, 0.28, 0.18, 0.28, [1, 1, 1]);
    }
    // 封檐板 / 博风板：深色木头
    const barge = st.pen("w.churchBarge", T.woodDark(), { tint: [1.0, 0.82, 0.62], spec: 0.08, rim: 0.1 });
    const bargeL = Math.hypot(roofHalf, RIDGE - EAVE);
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const ang = Math.atan2(RIDGE - EAVE, roofHalf) * (sx > 0 ? -1 : 1);
        BR(barge, sx * roofHalf / 2, EAVE + (RIDGE - EAVE) / 2, sz * roofZ,
          0, 0, ang, bargeL + 0.16, 0.18, 0.12, [1, 1, 1], 0.8);
      }
    }
    for (let z = -roofZ + 0.1; z <= roofZ - 0.1; z += 0.62) {
      for (const sx of [-1, 1]) {
        B(barge, sx * (roofHalf - 0.12), EAVE + 0.02, z, 0.2, 0.18, 0.1, [0.92, 0.9, 0.84]);
      }
    }
    // 山墙三角（正面 + 背面）
    const gableA = [-(HW + 0.1), NT, HL + 0.02], gableB = [HW + 0.1, NT, HL + 0.02], gableC = [0, RIDGE, HL + 0.02];
    trim.tri.call(trim, D, gableA, gableB, gableC, [[0, 0], [4, 0], [2, 2.2]], [1, 1, 1]);
    const gableA2 = [HW + 0.1, NT, -HL - 0.02], gableB2 = [-(HW + 0.1), NT, -HL - 0.02], gableC2 = [0, RIDGE, -HL - 0.02];
    trim.tri.call(trim, D, gableA2, gableB2, gableC2, [[0, 0], [4, 0], [2, 2.2]], [1, 1, 1]);
    // 山墙正中的小尖塔（每边两座，撑住立面轮廓）
    for (const sx of [-1, 1]) {
      const px = sx * (HW - 0.65), pz = HL + 0.12;
      B(trim, px, NT + 0.7, pz, 0.48, 1.4, 0.48, [1, 1, 1]);
      trim.cyl.call(trim, mul(m4(px, NT + 1.4, pz, 0, Math.PI / 4, 0)), 0.42, 0.03, 1.5, 4, [1, 1, 1], false);
      goldP.sphere.call(goldP, mul(m4(px, NT + 2.92, pz)), 0.09, 7, 5, [1, 1, 1]);
    }

    /* ---- 侧窗（尖拱窗）：每侧四扇，石框 / 窗台 / 竖棂 ---- */
    const winY = PT + 2.62, winH = 2.2, winW = 0.86, winTop = winY + winH / 2;
    for (const sx of [-1, 1]) {
      for (const wz of [-8.0, -2.7, 2.7, 8.0]) {
        const ry = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        const fx = sx * (HW + 0.04);
        Q(dark, fx, winY, wz, 0, ry, 0, winW + 0.2, winH + 0.3, [0.28, 0.28, 0.31]);
        Q(glass, fx + sx * 0.02, winY, wz, 0, ry, 0, winW, winH, [1, 1, 1]);
        const m2 = mul(m4(fx + sx * 0.02, winTop, wz, 0, ry, 0));
        glass.tri.call(glass, m2, [-winW / 2, 0, 0], [winW / 2, 0, 0], [0, 0.48, 0],
          [[0, 0], [1, 0], [0.5, 0.7]], [1, 1, 1]);
        // 外框：两侧壁柱 + 尖拱石框（两段斜的）
        B(trim, sx * (HW + 0.07), winY, wz - winW / 2 - 0.1, 0.18, winH + 0.06, 0.18, [1, 1, 1]);
        B(trim, sx * (HW + 0.07), winY, wz + winW / 2 + 0.1, 0.18, winH + 0.06, 0.18, [1, 1, 1]);
        const archMat = mul(m4(sx * (HW + 0.08), winTop, wz, 0, ry, 0));
        for (const s2 of [-1, 1]) {
          const am = M.mul(archMat, m4(s2 * winW * 0.25, 0.18, 0, 0, 0, s2 * 0.62));
          trim.box.call(trim, am, winW * 0.78, 0.14, 0.2, [1, 1, 1], 0.5);
        }
        // 窗台 + 中棂 + 横档
        B(trim, sx * (HW + 0.1), winY - winH / 2 - 0.1, wz, 0.34, 0.16, winW + 0.5, [1, 1, 1]);
        B(dark, sx * (HW + 0.075), winY, wz, 0.06, winH, 0.05, [0.06, 0.06, 0.07]);
        B(dark, sx * (HW + 0.075), winY + 0.3, wz, 0.06, 0.05, winW, [0.06, 0.06, 0.07]);
        glowP.quad.call(glowP, mul(m4(sx * (HW + 0.09), winY, wz, 0, ry, 0)), 2.8, 3.2, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 扶壁：两级 + 斜压顶
      for (const wz of [-10.8, -5.35, 0, 5.35, 10.8]) {
        B(stone, sx * (HW + 0.4), PT + 1.08, wz, 0.82, 2.16, 1.18, [0.97, 0.95, 0.9]);
        B(stone, sx * (HW + 0.42), PT + 2.6, wz, 0.66, 0.94, 0.98, [0.93, 0.91, 0.86]);
        BR(trim, sx * (HW + 0.42), PT + 3.1, wz, 0, 0, sx * -0.34, 0.82, 0.22, 1.04, [1, 1, 1]);
      }
    }

    /* ---- 正门：尖拱门套 + 双开橡木门 + 铁箍 + 门环 + 门牌 ---- */
    const dz = HL;
    const doorW = 3.2, doorH = 2.95;
    // 门洞：墙是实心盒子，门板必须贴在墙面外面（+Z 侧）才不会被墙吃掉
    B(dark, 0, PT + doorH / 2 + 0.02, dz + 0.015, doorW + 0.34, doorH + 0.18, 0.05, [0.05, 0.045, 0.04]);
    // 门楣：压在门洞顶上，别让那条黑缝看起来像一块黑板
    B(trim, 0, PT + doorH + 0.16, dz + 0.09, doorW + 0.52, 0.28, 0.2, [1, 1, 1]);
    // 两扇木门：竖向木板缝 + 铁箍 + 铆钉 + 合页（门板前面在 dz-0.04，比门洞背板靠前得多）
    const pw = doorW / 2 - 0.02;
    for (const s2 of [-1, 1]) {
      B(doorP, s2 * (doorW / 4), PT + doorH / 2, dz + 0.1, pw, doorH, 0.14, [1, 1, 1], 1.1);
      // 门板上的凹格：让木门在暗处也读得出是两扇门
      B(doorP, s2 * (doorW / 4), PT + 1.72, dz + 0.175, pw * 0.72, 1.0, 0.05, [0.92, 0.74, 0.56], 1.0);
      B(doorP, s2 * (doorW / 4), PT + 0.72, dz + 0.175, pw * 0.72, 0.72, 0.05, [0.92, 0.74, 0.56], 1.0);
      // 竖向木板缝：近景能数出木条
      for (let k = 0; k < 4; k++) {
        const bx = s2 * (doorW / 4) - pw / 2 + (k + 0.5) * (pw / 4);
        B(doorP, bx, PT + doorH / 2, dz + 0.185, 0.012, doorH - 0.1, 0.012, [0.6, 0.48, 0.36]);
      }
      // 铁箍 + 铆钉
      for (const yy of [PT + 0.5, PT + 1.55, PT + 2.6]) {
        B(iron, s2 * (doorW / 4), yy, dz + 0.2, pw * 1.02, 0.1, 0.025, [1, 1, 1]);
        for (let k = 0; k < 4; k++) {
          iron.sphere.call(iron, mul(m4(s2 * (doorW / 4) - pw / 2 + (k + 0.5) * (pw / 4), yy, dz + 0.218, 0, 0, 0, 0.6, 1, 0.55)),
            0.024, 6, 4, [1, 1, 1]);
        }
      }
      // 合页
      for (const yy of [PT + 0.5, PT + 2.6]) {
        B(iron, s2 * (doorW / 2 - 0.12), yy, dz + 0.21, 0.26, 0.1, 0.035, [1, 1, 1]);
      }
    }
    // 门环（狮口咬环）
    iron.sphere.call(iron, mul(m4(0.26, PT + 1.42, dz + 0.235, 0, 0, 0, 1, 0.8, 0.5)), 0.11, 10, 8, [1, 1, 1]);
    iron.torus.call(iron, mul(m4(0.26, PT + 1.26, dz + 0.25, Math.PI / 2, 0, 0)), 0.12, 0.02, 18, 6, [1, 1, 1]);
    // 门缝里的暖光：远看门洞不是一块黑
    lampGlass.quad.call(lampGlass, mul(m4(0, PT + 1.1, dz + 0.19)), 0.04, 1.9, [0.5, 0.38, 0.22], [0, 0, 1, 1]);
    glowP.quad.call(glowP, mul(m4(0, PT + 1.2, dz + 0.4)), 4.6, 4.2, [1, 1, 1], [0, 0, 1, 1]);
    // 门套：两侧石柱 + 尖拱（沿曲线分段）
    for (const s2 of [-1, 1]) {
      B(trim, s2 * (doorW / 2 + 0.24), PT + doorH / 2 + 0.1, dz + 0.08, 0.46, doorH + 0.34, 0.4, [1, 1, 1]);
      // 柱头 / 柱础
      B(trim, s2 * (doorW / 2 + 0.24), PT + doorH + 0.28, dz + 0.1, 0.58, 0.2, 0.5, [1, 1, 1]);
      B(trim, s2 * (doorW / 2 + 0.24), PT + 0.36, dz + 0.1, 0.56, 0.18, 0.48, [1, 1, 1]);
    }
    for (const s2 of [-1, 1]) {
      const arch = [[doorW / 2 + 0.24, doorH + 0.36], [1.42, 3.5], [1.02, 3.72], [0.55, 3.88], [0.0, 3.94]];
      for (let i = 0; i < arch.length - 1; i++) {
        const a0 = arch[i], a1 = arch[i + 1];
        const x0 = s2 * a0[0], x1 = s2 * a1[0];
        const yy0 = PT + a0[1], yy1 = PT + a1[1];
        const len = Math.hypot(x1 - x0, yy1 - yy0);
        const ang = Math.atan2(yy1 - yy0, x1 - x0);
        BR(trim, (x0 + x1) / 2, (yy0 + yy1) / 2, dz + 0.08, 0, 0, ang,
          len + 0.1, 0.3, 0.44, [1, 1, 1], 0.5);
      }
    }
    B(trim, 0, PT + 3.99, dz + 0.08, 0.34, 0.34, 0.5, [1, 1, 1]);   // 拱心石
    // 门楣上的小圆窗
    cyl(glass, 0, PT + 3.55, dz + 0.02, 0.3, 0.3, 0.04, 14, [1, 1, 1], Math.PI / 2, 0, 0, true);
    cyl(trim, 0, PT + 3.55, dz, 0.39, 0.39, 0.08, 14, [1, 1, 1], Math.PI / 2, 0, 0, true);
    // 门牌：Claude 庄园的门牌，旧场景那块搬过来挂在门楣正中
    const plaqueTex = A3DTex.sign({
      text: "CLAUDE", w: 512, h: 160, bg: "#2b241c", fg: "#d9c08a",
      size: 64, border: "#8a6d3f", borderW: 6, glow: "rgba(255,220,150,.35)", glowBlur: 10
    });
    const plaque = st.pen("w.churchPlaque", plaqueTex, { unlit: true, tint: [0.95, 0.92, 0.85] });
    B(dark, 0, PT + 2.56, dz + 0.245, 1.3, 0.4, 0.08, [0.16, 0.14, 0.12]);
    plaque.quad.call(plaque, mul(m4(0, PT + 2.56, dz + 0.315)), 1.16, 0.34, [1, 1, 1], [0, 0, 1, 1]);

    /* ---- 门楣上方的三角山花：把正门收成一个完整的构图 ---- */
    {
      const sy = PT + 4.14, sh = 1.0, sw = 3.3;
      B(trim, 0, sy, dz + 0.24, sw * 2 + 0.7, 0.2, 0.56, [1, 1, 1]);   // 底檐
      const tA = [-sw, sy + 0.1, dz + 0.34], tB = [sw, sy + 0.1, dz + 0.34], tC = [0, sy + sh, dz + 0.34];
      stone.tri.call(stone, D, tA, tB, tC, [[0, 0], [4, 0], [2, 1.1]], [0.94, 0.94, 0.92]);
      for (const s2 of [-1, 1]) {
        const len = Math.hypot(sw, sh - 0.1);
        const ang = Math.atan2(sh - 0.1, sw) * -s2;
        BR(trim, s2 * sw / 2, sy + (sh + 0.1) / 2 + 0.04, dz + 0.38, 0, 0, ang,
          len + 0.2, 0.2, 0.18, [1, 1, 1], 0.8);
      }
      // 圆盘浮雕：简化版星芒
      cyl(trim, 0, sy + 0.44, dz + 0.42, 0.33, 0.33, 0.1, 16, [1, 1, 1], Math.PI / 2, 0, 0, true);
      cyl(dark, 0, sy + 0.44, dz + 0.48, 0.25, 0.25, 0.03, 16, [0.24, 0.23, 0.22], Math.PI / 2, 0, 0, true);
      for (let k = 0; k < 8; k++) {
        BR(goldP, 0, sy + 0.44, dz + 0.51, 0, 0, k * Math.PI / 8, 0.032, 0.4, 0.03, [1, 1, 1], 1);
      }
      cyl(goldP, 0, sy + 0.44, dz + 0.52, 0.055, 0.055, 0.03, 8, [1, 1, 1], Math.PI / 2, 0, 0, true);
    }
    /* ---- 门头壁灯：铁艺托架 + 四棱灯罩，玻璃四面透光 ---- */
    for (const s2 of [-1, 1]) {
      const lx = s2 * 2.55, ly = PT + 3.02;
      const lantern = st.pen("w.churchLantern", T.darkMetal(), { tint: [0.24, 0.22, 0.2], spec: 0.5 });
      // 墙座 + 横臂 + 斜撑
      B(lantern, lx, ly + 0.56, dz + 0.05, 0.26, 0.36, 0.12, [1, 1, 1]);
      B(lantern, lx, ly + 0.56, dz + 0.24, 0.07, 0.07, 0.38, [1, 1, 1]);
      BR(lantern, lx, ly + 0.4, dz + 0.2, 0.75, 0, 0, 0.055, 0.055, 0.42, [1, 1, 1], 1.2);
      BR(lantern, lx, ly + 0.66, dz + 0.08, -0.6, 0, 0, 0.05, 0.05, 0.28, [1, 1, 1], 1.2);
      // 吊杆
      B(lantern, lx, ly + 0.38, dz + 0.42, 0.04, 0.36, 0.04, [1, 1, 1]);
      // 灯体：四角柱 + 底托 + 顶盖
      const gx = lx, gz = dz + 0.42;
      for (const dx of [-0.11, 0.11]) for (const dz2 of [-0.11, 0.11]) {
        B(lantern, gx + dx, ly + 0.02, gz + dz2, 0.028, 0.42, 0.028, [1, 1, 1], 1.0);
      }
      B(lantern, gx, ly - 0.2, gz, 0.3, 0.05, 0.3, [1, 1, 1]);
      lantern.cyl.call(lantern, mul(m4(gx, ly + 0.23, gz, 0, Math.PI / 4, 0)), 0.22, 0.02, 0.14, 4, [1, 1, 1], false);
      // 四面玻璃
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        lampGlass.quad.call(lampGlass, mul(m4(gx + Math.sin(a) * 0.11, ly + 0.01, gz + Math.cos(a) * 0.11, 0, a, 0)),
          0.2, 0.38, [2.2, 1.5, 0.75], [0, 0, 1, 1]);
      }
      glowP.quad.call(glowP, mul(m4(gx, ly + 0.01, gz + 0.19)), 2.6, 2.8, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 门前台阶：按台基与地面的高差自动分 2~7 级
    const pFront = M.xf(D, [0, 0, HL + 4.2]);
    const gFront = Math.max(0, groundH(pFront[0], pFront[2]) - y0);
    const stepN = Math.max(2, Math.min(7, Math.round((PT - gFront) / 0.17)));
    for (let i = 0; i < stepN; i++) {
      const yy = PT - (PT - gFront) * (i + 0.55) / stepN;
      B(trim, 0, yy, HL + 0.55 + i * 0.44, 7.2, 0.18, 0.5, [1, 1, 1]);
      B(pave, 0, yy + 0.095, HL + 0.55 + i * 0.44, 1.7, 0.02, 0.54, [0.5, 0.48, 0.45]);
    }
    // 台阶两侧的石栏杆：望柱 + 扶手，别让台阶像一块光板
    for (const s2 of [-1, 1]) {
      const rx = s2 * 3.76;
      const zTop = HL + 0.55, zBot = HL + 0.55 + stepN * 0.44;
      const yTop = PT, yBot = gFront;
      for (let k = 0; k <= 3; k++) {
        const u = k / 3;
        const pz = zTop + (zBot - zTop) * u, py = yTop + (yBot - yTop) * u;
        B(trim, rx, py + 0.42, pz, 0.24, 0.84, 0.24, [1, 1, 1]);
        B(trim, rx, py + 0.9, pz, 0.32, 0.12, 0.32, [1, 1, 1]);
        if (k < 3) {
          const u2 = (k + 1) / 3;
          const pz2 = zTop + (zBot - zTop) * u2, py2 = yTop + (yBot - yTop) * u2;
          BR(trim, rx, (py + py2) / 2 + 0.62, (pz + pz2) / 2,
            -Math.atan2(py2 - py, pz2 - pz), 0, 0, 0.14, 0.12,
            Math.hypot(pz2 - pz, py2 - py) - 0.16, [1, 1, 1], 0.8);
        }
      }
    }
    // 门前小广场：逐段贴地铺，别做一整块大平板穿进地里
    const plazaZ0 = HL + 0.7 + stepN * 0.44;
    for (let i = 0; i < 5; i++) {
      const pz = plazaZ0 + 0.7 + i * 1.25;
      const w = M.xf(D, [0, 0, pz]);
      const gy = groundH(w[0], w[2]) - y0;
      pave.grid.call(pave, mul(m4(0, gy + 0.035, pz)), 12.6, 1.28, 9, 1,
        [0.92, 0.9, 0.86], 0.55, 0.12, 0);
    }
    // 广场两侧的深色石带：给大片浅色铺装压一条边
    for (const s2 of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const pz = plazaZ0 + 0.7 + i * 1.25;
        const w = M.xf(D, [s2 * 5.6, 0, pz]);
        const gy = groundH(w[0], w[2]) - y0;
        pave.box.call(pave, mul(m4(s2 * 5.6, gy + 0.045, pz)), 0.95, 0.06, 1.3, [0.6, 0.58, 0.55], 1.0);
      }
    }
    // 广场中心的圆盘：两圈石环 + 中心石
    {
      const cz = plazaZ0 + 2.6;
      const w = M.xf(D, [0, 0, cz]);
      const gy = groundH(w[0], w[2]) - y0;
      pave.cyl.call(pave, mul(m4(0, gy + 0.04, cz)), 2.25, 2.25, 0.06, 28, [0.78, 0.76, 0.72], true);
      pave.torus.call(pave, mul(m4(0, gy + 0.08, cz)), 2.28, 0.07, 28, 5, [0.58, 0.56, 0.53]);
      pave.torus.call(pave, mul(m4(0, gy + 0.08, cz)), 1.45, 0.055, 24, 5, [0.66, 0.64, 0.6]);
      pave.cyl.call(pave, mul(m4(0, gy + 0.06, cz)), 0.42, 0.42, 0.07, 16, [0.86, 0.84, 0.8], true);
    }

    /* ---- 前院草坪：教堂前是一整片草地，不然近景会露出深褐色的地形。
     * 用局部坐标铺（教堂局部 +Z = 南），逐格取世界高度贴地。 ---- */
    const lawn = st.pen("w.churchLawn", T.dirt(), { tint: [1.05, 1.3, 0.72], spec: 0.02, rim: 0.08 });
    for (let ix = 0; ix < 27; ix++) {
      for (let iz = 0; iz < 21; iz++) {
        const lx = -26 + ix * 2.0 + 1.0;
        const lz = -15 + iz * 2.0 + 1.0;
        // 台基范围不铺
        if (Math.abs(lx) < 9.9 && Math.abs(lz) < 14.7) continue;
        // 广场和台阶范围不铺
        if (Math.abs(lx) < 7.0 && lz > 13.5 && lz < 21.6) continue;
        const wp = M.xf(D, [lx, 0, lz]);
        const gy = groundH(wp[0], wp[2]) - y0;
        lawn.grid.call(lawn, mul(m4(lx, gy + 0.03, lz)), 2.04, 2.04, 2, 2,
          [1, 1, 1], 1.0, 0, 0);
      }
    }

    // 门前的石砌花坛：旧门场景的橙色菊花，搬两池到教堂门口
    const stemB = st.pen("w.churchStem", null, { tint: [0.28, 0.45, 0.22], sway: 0.35 });
    const petalB = st.pen("w.churchPetal", T.petal(), { cutout: true, tint: [1.2, 0.95, 0.7], rim: 0.25 });
    const leafBed = st.pen("w.churchBedLeaf", T.leaf(), { cutout: true, tint: [0.6, 0.9, 0.5], sway: 0.7 });
    const bedStone = st.pen("w.churchBedStone", T.stone(), { tint: [0.8, 0.8, 0.76] });
    const soil = st.pen("w.churchSoil", T.dirt(), { tint: [0.5, 0.45, 0.4] });
    for (const s2 of [-1, 1]) {
      const bx = s2 * 6.35, bz = HL + 3.0;
      const wp = M.xf(D, [bx, 0, bz]);
      const gy = Math.max(0, groundH(wp[0], wp[2]) - y0);
      const planterTop = gy + 0.92;
      B(bedStone, bx, gy + 0.46, bz, 2.7, 0.92, 1.15, [0.86, 0.86, 0.8]);
      B(bedStone, bx, planterTop + 0.06, bz, 2.86, 0.12, 1.3, [1.0, 1.0, 0.94]);
      pave.box.call(pave, mul(m4(bx, planterTop + 0.13, bz)), 2.5, 0.05, 1.0, [1, 1, 1], 1.2);
      soil.quad.call(soil, mul(m4(bx, planterTop + 0.16, bz, -Math.PI / 2, 0, 0)), 2.4, 0.9, [1, 1, 1], [0, 0, 1, 1]);
      const rr = rng(s2 > 0 ? 61 : 67);
      for (let i = 0; i < 16; i++) {
        const fx = bx + (rr() - 0.5) * 2.2, fz = bz + (rr() - 0.5) * 0.8;
        for (let k = 0; k < 3; k++) {
          P.leafBlade(leafBed, mul(m4(fx + (rr() - 0.5) * 0.2, planterTop + 0.16, fz, 0, rr() * TAU, 1.1, 1, 1, 1)),
            0.18 + rr() * 0.16, 0.05, [0.8, 1, 0.7]);
        }
        P.chrysanthemum(petalB, stemB, mul(m4(fx, planterTop + 0.16, fz)), 0.72 + rr() * 0.35,
          [1.2, 0.9, 0.65], Math.floor(rr() * 99));
      }
    }
    /* 爬山虎：单片 quad 的叶子（leafFlat）整片贴墙。
     * 以前用 leafBlade 的分段面片，近景会裂出横缝（历史 v82/v83 修过一次）。 */
    const ivy = st.pen("w.churchIvy", T.leaf(), { cutout: true, tint: [0.4, 0.62, 0.38], sway: 0.5, rim: 0.15 });
    const vine = st.pen("w.churchVine", null, { tint: [0.2, 0.28, 0.16] });
    const ivyPatch = (cx, cy, w, h, seed, zoff) => {
      const rr = rng(seed);
      const zz = dz + (zoff === undefined ? 0.1 : zoff);
      for (let b = 0; b < 4; b++) {
        const bx = cx + (rr() - 0.5) * w * 0.7;
        const pts = [];
        for (let k = 0; k <= 5; k++) {
          const t = k / 5;
          pts.push([bx + Math.sin(t * 2.2 + b * 1.7) * 0.28, cy + t * h, zz - 0.02]);
        }
        vine.tube.call(vine, D, pts, 0.01, 4, [1, 1, 1]);
      }
      for (let i = 0; i < 170; i++) {
        const px = cx + (rr() - 0.5) * w * (0.86 + rr() * 0.14);
        const py = cy + rr() * h;
        const mm = mul(m4(px, py, zz + rr() * 0.06, -Math.PI / 2, rr() * TAU, 0, 1, 1, 1));
        P.leafFlat(ivy, mm, 0.15 + rr() * 0.07, 0.07 + rr() * 0.035, [0.36 + rr() * 0.3, 0.56 + rr() * 0.22, 0.3]);
      }
    };
    ivyPatch(-6.2, PT + 0.2, 1.2, 2.5, 91, 0.44);
    ivyPatch(6.1, PT + 0.2, 2.4, 2.9, 97);

    /* ---- 正立面的壁龛：石框 + 深色内壁 + 一尊石像（守门人） ---- */
    const statueP = st.pen("w.churchStatue", T.stone(), { tint: [0.9, 0.89, 0.85], spec: 0.05, rim: 0.16 });
    for (const s2 of [-1, 1]) {
      const px = s2 * 3.35;
      const nw = 1.05, nh = 2.15, ny = PT + 0.58;
      // 内壁：比墙面暗，读得出「凹进去」
      B(dark, px, ny + nh / 2, dz + 0.03, nw, nh, 0.05, [0.36, 0.34, 0.3]);
      // 两侧石框 + 柱头
      for (const q of [-1, 1]) {
        B(trim, px + q * (nw / 2 + 0.11), ny + nh / 2, dz + 0.1, 0.22, nh + 0.3, 0.28, [1, 1, 1]);
        B(trim, px + q * (nw / 2 + 0.11), ny + nh + 0.12, dz + 0.12, 0.3, 0.16, 0.34, [1, 1, 1]);
      }
      // 顶拱（两段斜石）
      for (const q of [-1, 1]) {
        const a0 = [px + q * (nw / 2 + 0.11), ny + nh + 0.18];
        const a1 = [px, ny + nh + 0.62];
        const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
        BR(trim, (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, dz + 0.14, 0, 0,
          Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), len + 0.1, 0.2, 0.3, [1, 1, 1], 0.6);
      }
      // 底座
      B(trim, px, ny - 0.1, dz + 0.16, nw + 0.46, 0.2, 0.4, [1, 1, 1]);
      // 石像
      P.figure(statueP, mul(m4(px, ny + 0.02, dz + 0.13, 0, s2 * -0.18, 0)), [1.3, 1.27, 1.2], { h: 1.5 });
      glowP.quad.call(glowP, mul(m4(px, ny + 1.1, dz + 0.1)), 1.5, 2.6, [1, 1, 1], [0, 0, 1, 1]);
      // 壁龛上方的小尖饰
      cyl(trim, px, ny + nh + 0.66, dz + 0.14, 0.16, 0.02, 0.5, 4, [1, 1, 1], 0, Math.PI / 4, 0, false);
    }

    /* ---- 玫瑰窗：圆盘彩窗 + 石环 + 放射窗棂 ---- */
    /* 玫瑰窗整体凸出山墙（z=12.0）：石背板、玻璃、石环各自留够间距，避免共面闪烁 */
    const roseY = PT + 6.75, roseR = 1.45, roseZ = dz + 0.24;
    cyl(trim, 0, roseY, roseZ - 0.2, roseR + 0.2, roseR + 0.2, 0.14, 32, [1, 1, 1], Math.PI / 2, 0, 0, true);
    cyl(roseP, 0, roseY, roseZ, roseR, roseR, 0.06, 32, [1, 1, 1], Math.PI / 2, 0, 0, true);
    const ringM = mul(m4(0, roseY, roseZ + 0.06, Math.PI / 2, 0, 0));
    trim.torus.call(trim, ringM, roseR + 0.04, 0.12, 32, 6, [1, 1, 1]);
    // 12 根放射石棂 + 内圈
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 12;
      BR(trim, 0, roseY, roseZ + 0.1, 0, 0, a, 0.055, roseR * 1.94, 0.07, [1, 1, 1], 0.5);
    }
    trim.torus.call(trim, mul(m4(0, roseY, roseZ + 0.12, Math.PI / 2, 0, 0)), roseR * 0.45, 0.05, 20, 5, [1, 1, 1]);
    BR(trim, 0, roseY, roseZ + 0.14, 0, 0, 0, 0.24, 0.24, 0.09, [1, 1, 1], 0.5);
    glowP.quad.call(glowP, mul(m4(0, roseY, roseZ + 0.2)), 4.2, 4.2, [1, 1, 1], [0, 0, 1, 1]);
    // 玫瑰窗两侧的小圆窗：也一起凸出山墙
    for (const s2 of [-1, 1]) {
      const ox = s2 * 3.5;
      cyl(trim, ox, PT + 6.4, dz + 0.12, 0.52, 0.52, 0.1, 16, [1, 1, 1], Math.PI / 2, 0, 0, true);
      cyl(roseP, ox, PT + 6.4, dz + 0.2, 0.42, 0.42, 0.03, 16, [1, 1, 1], Math.PI / 2, 0, 0, true);
      for (let k = 0; k < 6; k++) {
        BR(trim, ox, PT + 6.4, dz + 0.23, 0, 0, k * Math.PI / 6, 0.04, 0.82, 0.05, [1, 1, 1], 0.5);
      }
      glowP.quad.call(glowP, mul(m4(ox, PT + 6.4, dz + 0.26)), 1.4, 1.4, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ---- 钟楼：塔身 + 钟室 + 石板尖顶 + Claude 星芒 ---- */
    const TX = -6.8, TZ = 9.3;   // 比主墙凸出 0.4m：共面会 z-fighting；左移给门侧壁龛让位
    const TT = PT + 11.2;              // 塔身顶
    const TXW = 3.1;                   // 塔身半宽
    B(stone, TX, (PT + TT) / 2, TZ, TXW * 2, TT - PT, TXW * 2, [1, 1, 1]);
    B(trim, TX, PT + 0.22, TZ, TXW * 2 + 0.26, 0.24, TXW * 2 + 0.26, [1, 1, 1]);
    B(trim, TX, PT + 4.5, TZ, TXW * 2 + 0.16, 0.16, TXW * 2 + 0.16, [1, 1, 1]);
    B(trim, TX, PT + 7.4, TZ, TXW * 2 + 0.16, 0.14, TXW * 2 + 0.14, [1, 1, 1]);
    // 塔身转角石
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let k = 0; k < 18; k++) {
        const yy = PT + 0.44 + k * 0.6;
        if (yy > TT - 0.5) break;
        B(trim, TX + sx * (TXW + 0.02), yy, TZ + sz * (TXW - 0.34), 0.2, 0.56, 0.68, [1, 1, 1]);
        B(trim, TX + sx * (TXW - 0.34), yy, TZ + sz * (TXW + 0.02), 0.68, 0.56, 0.2, [1, 1, 1]);
      }
    }
    // 塔基门（朝西）
    B(dark, TX - TXW - 0.02, PT + 1.12, TZ, 0.18, 2.24, 1.5, [0.08, 0.07, 0.06]);
    B(doorP, TX - TXW, PT + 1.08, TZ, 0.1, 2.02, 1.24, [1, 1, 1], 1.1);
    B(trim, TX - TXW - 0.06, PT + 2.22, TZ, 0.22, 0.18, 1.72, [1, 1, 1]);
    for (const sz of [-1, 1]) B(trim, TX - TXW - 0.05, PT + 1.08, TZ + sz * 0.76, 0.22, 2.16, 0.22, [1, 1, 1]);
    // 西侧小窗
    Q(glass, TX - TXW - 0.015, PT + 5.0, TZ, 0, -Math.PI / 2, 0, 0.62, 1.3, [1, 1, 1]);
    B(trim, TX - TXW - 0.06, PT + 4.28, TZ, 0.22, 0.14, 1.0, [1, 1, 1]);
    glowP.quad.call(glowP, mul(m4(TX - TXW - 0.04, PT + 5.0, TZ, 0, -Math.PI / 2, 0)), 2.2, 2.6, [1, 1, 1], [0, 0, 1, 1]);
    // 南面长窗（正对主标题）
    Q(glass, TX, PT + 5.2, TZ + TXW + 0.015, 0, 0, 0, 0.8, 2.2, [1, 1, 1]);
    B(trim, TX, PT + 4.0, TZ + TXW + 0.05, 0.24, 0.16, 1.16, [1, 1, 1]);
    glowP.quad.call(glowP, mul(m4(TX, PT + 5.2, TZ + TXW + 0.06)), 2.6, 3.2, [1, 1, 1], [0, 0, 1, 1]);

    // 钟室：四面尖拱开口 + 百叶 + 石框
    const bellY = PT + 12.0, bellW = 1.5, bellH = 2.0;
    const faces = [
      [0, TXW, 0], [0, -TXW, Math.PI], [TXW, 0, Math.PI / 2], [-TXW, 0, -Math.PI / 2]
    ];
    for (const [dx, dz2, ry] of faces) {
      const fx = TX + dx, fz = TZ + dz2;
      Q(dark, fx, bellY, fz, 0, ry, 0, bellW, bellH, [0.05, 0.05, 0.06]);
      for (let k = 0; k < 5; k++) {
        const yy = bellY - bellH / 2 + 0.26 + k * 0.36;
        Q(trim, fx + Math.sin(ry) * 0.03, yy, fz + Math.cos(ry) * 0.03, 0, ry, 0,
          bellW * 0.9, 0.09, [0.34, 0.34, 0.34]);
      }
      const fm = mul(m4(fx, bellY + bellH / 2, fz, 0, ry, 0));
      for (const s2 of [-1, 1]) {
        trim.box.call(trim, M.mul(fm, m4(s2 * 0.62, 0.12, 0.05, 0, 0, s2 * 0.62)), 1.1, 0.16, 0.18, [1, 1, 1], 0.5);
        trim.box.call(trim, M.mul(fm, m4(s2 * 0.88, -bellH / 2, 0.05)), 0.2, bellH, 0.18, [1, 1, 1], 0.5);
      }
    }
    // 钟：从开口里能看到一点点铜钟
    cyl(goldP, TX, PT + 10.8, TZ, 0.38, 0.56, 0.6, 12, [1, 1, 1], 0, 0, 0, true);
    // 檐口 + 托石
    B(trim, TX, TT + 0.18, TZ, TXW * 2 + 0.62, 0.36, TXW * 2 + 0.62, [1, 1, 1]);
    for (let k = 0; k < 5; k++) {
      const off = -2.4 + k * 1.2;
      B(trim, TX + off, TT - 0.08, TZ + TXW + 0.2, 0.36, 0.3, 0.36, [1, 1, 1]);
      B(trim, TX + off, TT - 0.08, TZ - TXW - 0.2, 0.36, 0.3, 0.36, [1, 1, 1]);
    }
    // 尖顶（四棱锥，面对齐塔身）
    const spireBase = TT + 0.36;
    roofP.cyl.call(roofP, mul(m4(TX, spireBase, TZ, 0, Math.PI / 4, 0)),
      4.3, 0.04, 5.7, 4, [1, 1, 1], false);
    // 顶角小尖饰
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      trim.cyl.call(trim, mul(m4(TX + sx * 2.98, spireBase + 0.02, TZ + sz * 2.98)), 0.16, 0.02, 1.0, 5, [1, 1, 1], false);
    }
    // 塔尖顶球 + Claude 星芒：教堂顶上唯一的橙色记号
    const markY = spireBase + 5.7 + 0.5;
    goldP.sphere.call(goldP, mul(m4(TX, markY - 0.12, TZ)), 0.16, 10, 7, [1, 1, 1]);
    markP.sphere.call(markP, mul(m4(TX, markY, TZ)), 0.2, 12, 8, [1, 1, 1]);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      BR(markP, TX + Math.sin(a) * 0.56, markY + Math.cos(a) * 0.56, TZ, 0, 0, -a,
        0.15, 0.86, 0.1, [1, 1, 1], 1);
      // 第二组竖平面：从东西方向看也是一颗星，而不是一条线
      markP.box.call(markP, mul(m4(TX, markY + Math.cos(a) * 0.56, TZ + Math.sin(a) * 0.56, a, 0, 0)),
        0.15, 0.86, 0.1, [1, 1, 1], 1);
    }
    // 顶端的十字（保留宗教建筑的身份）
    goldP.box.call(goldP, mul(m4(TX, markY + 1.34, TZ)), 0.1, 0.9, 0.1, [1, 1, 1], 0.8);
    goldP.box.call(goldP, mul(m4(TX, markY + 1.52, TZ)), 0.56, 0.1, 0.1, [1, 1, 1], 0.8);

    // 塔身时钟（朝南，主标题能看见）
    cyl(trim, TX, PT + 8.8, TZ + TXW + 0.02, 0.66, 0.66, 0.1, 20, [1, 1, 1], Math.PI / 2, 0, 0, true);
    cyl(st.pen("w.clockFace", null, { unlit: true, tint: [0.86, 0.82, 0.7] }),
      TX, PT + 8.8, TZ + TXW + 0.075, 0.55, 0.55, 0.025, 20, [1, 1, 1], Math.PI / 2, 0, 0, true);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU;
      BR(iron, TX + Math.cos(a) * 0.45, PT + 8.8 + Math.sin(a) * 0.45, TZ + TXW + 0.105,
        0, 0, a, 0.05, k % 3 ? 0.03 : 0.08, 0.02, [1, 1, 1]);
    }
    BR(iron, TX, PT + 8.96, TZ + TXW + 0.125, 0, 0, 0.12, 0.045, 0.37, 0.02, [1, 1, 1]);
    BR(iron, TX + 0.15, PT + 8.8, TZ + TXW + 0.125, 0, 0, Math.PI / 2, 0.045, 0.32, 0.02, [1, 1, 1]);



    /* ============================================================
     *  前院：石院墙（内圈）+ 铁栅栏（外圈）+ 大门 + 墓园 + 甬道
     *  院墙 / 栅栏都用世界坐标沿半圆排，教堂正门朝 +Z（南）。
     * ============================================================ */
    const wallStone = st.pen("w.churchWall", WTex.ashlar(), { tint: [0.86, 0.84, 0.78], spec: 0.06 });
    const wallCap = st.pen("w.churchWallCap", T.stone(), { tint: [0.78, 0.78, 0.76], spec: 0.12 });
    const gateIron = st.pen("w.churchGate", T.darkMetal(), { tint: [0.26, 0.28, 0.3], spec: 0.45 });
    const RAD = 24.0, RADX = 22.0;      // 内圈石墙（前院半圆）
    const gateA = 0.104;                // 门洞中心角（正对教堂门的中线）
    const gapHalf = 0.075;              // 石墙门洞半角

    /* ---- 内圈：石院墙 ---- */
    const segStep = 0.04;
    for (let a = -1.42; a <= 1.42; a += segStep) {
      if (Math.abs(a - gateA) < gapHalf) continue;
      const wx = C.x + Math.sin(a) * RADX;
      const wz = C.z + Math.cos(a) * RAD;
      const gy = groundH(wx, wz);
      const g = HASH(a * 13.1, 3.7);
      wallStone.box.call(wallStone, m4(wx, gy + 0.42, wz, 0, a, 0), 0.98, 0.84 + g * 0.06, 0.44,
        [0.92 + g * 0.12, 0.9, 0.84], 0.45);
      wallCap.box.call(wallCap, m4(wx, gy + 0.88, wz, 0, a, 0), 1.08, 0.14, 0.54, [1, 1, 1], 1.2);
      // 墙顶的小铁矛：石墙和铁栅栏之间有个过渡
      if (HASH(a * 7.3, 11.1) > 0.45 && Math.abs(a - gateA) > gapHalf * 1.6) {
        gateIron.box.call(gateIron, m4(wx, gy + 1.06, wz), 0.05, 0.3, 0.05, [1, 1, 1], 1.2);
        gateIron.cyl.call(gateIron, m4(wx, gy + 1.2, wz), 0.05, 0.01, 0.12, 4, [1, 1, 1], false);
      }
    }
    // 院墙两端收口柱
    for (const a of [-1.43, 1.43]) {
      const wx = C.x + Math.sin(a) * RADX, wz = C.z + Math.cos(a) * RAD;
      const gy = groundH(wx, wz);
      wallStone.box.call(wallStone, m4(wx, gy + 0.62, wz, 0, a, 0), 0.62, 1.24, 0.62, [1, 1, 1], 0.45);
      wallCap.box.call(wallCap, m4(wx, gy + 1.32, wz, 0, a, 0), 0.78, 0.16, 0.78, [1, 1, 1], 1.2);
      goldP.sphere.call(goldP, m4(wx, gy + 1.48, wz), 0.1, 7, 5, [1, 1, 1]);
    }
    // 内圈门柱 + 木门（保留原来的铁门样式）
    const gateSpots = [gateA - gapHalf * 1.4, gateA + gapHalf * 1.4];
    const gateWorld = gateSpots.map(a => {
      const wx = C.x + Math.sin(a) * RADX, wz = C.z + Math.cos(a) * RAD;
      return [wx, wz, groundH(wx, wz), a];
    });
    for (const g of gateWorld) {
      wallStone.box.call(wallStone, m4(g[0], g[2] + 1.1, g[1], 0, g[3], 0), 0.72, 2.2, 0.72, [1, 1, 1], 0.45);
      wallCap.box.call(wallCap, m4(g[0], g[2] + 2.26, g[1], 0, g[3], 0), 0.88, 0.18, 0.88, [1, 1, 1], 1.2);
      goldP.sphere.call(goldP, m4(g[0], g[2] + 2.42, g[1]), 0.12, 7, 5, [1, 1, 1]);
    }
    for (const s2 of [-1, 1]) {
      const gi = gateWorld[s2 > 0 ? 1 : 0];
      const dir = s2 > 0 ? -1 : 1;
      const w = 0.86;
      for (let k = 0; k < 5; k++) {
        gateIron.box.call(gateIron, m4(gi[0] + dir * w * 0.5, gi[2] + 0.82, gi[1] + dir * 0.3, 0, 0, 0),
          0.05, 1.55, 0.05, [1, 1, 1], 0.8);
      }
      for (const yy of [gi[2] + 0.36, gi[2] + 0.85, gi[2] + 1.32]) {
        gateIron.box.call(gateIron, m4(gi[0] + dir * w * 0.48, yy, gi[1] + dir * 0.3, 0, 0, 0),
          w * 0.98, 0.05, 0.05, [1, 1, 1], 0.8);
      }
    }

    /* ---- 外圈：铁栅栏（完整一圈，北边贴着崖沿）
     *  以前只围南侧前院，背后是空的；现在沿矩形走一圈，南边留大门。 ---- */
    const FZ0 = 74.6, FZ1 = 116.0, FX0 = -8.0, FX1 = 44.0;
    const FG0 = 17.8, FG1 = 22.2;       // 南边大门开口
    const fenceRun = (x0, z0, x1, z1, south) => {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      const ry = Math.atan2(-dz, dx);   // 让 box 的 X 轴对准这截栅栏
      const at = u => [x0 + dx * u, z0 + dz * u];
      const gateGap = px => south && px > FG0 - 0.5 && px < FG1 + 0.5;
      // 石基座
      const nb = Math.max(1, Math.round(len / 0.62));
      for (let i2 = 0; i2 < nb; i2++) {
        const p = at((i2 + 0.5) / nb);
        if (gateGap(p[0])) continue;
        const gy = groundH(p[0], p[1]);
        fenceStone.box.call(fenceStone, m4(p[0], gy + 0.2, p[1], 0, ry, 0), 0.62, 0.4, 0.34,
          [0.9, 0.89, 0.85], 1.1);
      }
      // 竖铁条 + 矛头（间距约 0.26m）
      const ni = Math.max(1, Math.round(len / 0.26));
      for (let i2 = 0; i2 < ni; i2++) {
        const p = at((i2 + 0.5) / ni);
        if (gateGap(p[0])) continue;
        const gy = groundH(p[0], p[1]);
        gateIron.box.call(gateIron, m4(p[0], gy + 1.12, p[1], 0, ry, 0), 0.048, 1.5, 0.048, [1, 1, 1], 1.6);
        gateIron.cyl.call(gateIron, m4(p[0], gy + 1.86, p[1]), 0.062, 0.006, 0.18, 4, [1, 1, 1], false);
      }
      // 横杆两道
      for (const hh of [0.72, 1.36]) {
        const ns = Math.max(1, Math.round(len / 1.5));
        for (let i2 = 0; i2 < ns; i2++) {
          const p = at((i2 + 0.5) / ns);
          if (gateGap(p[0])) continue;
          const gy = groundH(p[0], p[1]);
          gateIron.box.call(gateIron, m4(p[0], gy + hh, p[1], 0, ry, 0), len / ns * 1.02, 0.06, 0.05, [1, 1, 1], 1.4);
        }
      }
      // 石柱 + 压顶 + 金球
      const np = Math.max(1, Math.round(len / 3.6));
      for (let i2 = 0; i2 <= np; i2++) {
        const p = at(i2 / np);
        if (gateGap(p[0])) continue;
        const gy = groundH(p[0], p[1]);
        fenceStone.box.call(fenceStone, m4(p[0], gy + 0.86, p[1], 0, ry, 0), 0.36, 1.72, 0.36, [1, 1, 1], 0.6);
        fenceStone.box.call(fenceStone, m4(p[0], gy + 1.76, p[1], 0, ry, 0), 0.48, 0.12, 0.48, [1, 1, 1], 1.2);
        goldP.sphere.call(goldP, m4(p[0], gy + 1.9, p[1]), 0.1, 7, 5, [1, 1, 1]);
      }
    };
    fenceRun(FX0, FZ0, FX1, FZ0, false);   // 北：贴着崖沿
    fenceRun(FX1, FZ0, FX1, FZ1, false);   // 东
    fenceRun(FX1, FZ1, FX0, FZ1, true);    // 南：留大门
    fenceRun(FX0, FZ1, FX0, FZ0, false);   // 西

    // 四角加粗端柱：矩形的四个角要能读出「这圈是闭合的」
    for (const [cx2, cz2] of [[FX0, FZ0], [FX1, FZ0], [FX1, FZ1], [FX0, FZ1]]) {
      const gy = groundH(cx2, cz2);
      fenceStone.box.call(fenceStone, m4(cx2, gy + 1.1, cz2, 0, 0, 0), 0.62, 2.2, 0.62, [1, 1, 1], 0.55);
      fenceStone.box.call(fenceStone, m4(cx2, gy + 2.28, cz2, 0, 0, 0), 0.8, 0.18, 0.8, [1, 1, 1], 1.2);
      goldP.sphere.call(goldP, m4(cx2, gy + 2.46, cz2), 0.14, 8, 6, [1, 1, 1]);
    }

    // 南边大门：两根门柱 + 两扇半开的铁艺门
    for (const gx of [FG0, FG1]) {
      const gy = groundH(gx, FZ1);
      fenceStone.box.call(fenceStone, m4(gx, gy + 1.3, FZ1), 0.5, 2.6, 0.5, [1, 1, 1], 0.6);
      fenceStone.box.call(fenceStone, m4(gx, gy + 2.66, FZ1), 0.64, 0.16, 0.64, [1, 1, 1], 1.2);
      goldP.sphere.call(goldP, m4(gx, gy + 2.82, FZ1), 0.12, 7, 5, [1, 1, 1]);
    }
    for (const s2 of [-1, 1]) {
      const hx = s2 > 0 ? FG1 : FG0;
      const dir = s2 > 0 ? -1 : 1;
      const gy = groundH(hx, FZ1);
      const dm = m4(hx, gy, FZ1 - 0.12, 0, dir * 0.5, 0);
      for (let k = 1; k <= 7; k++) {
        const ox = dir * (k * 0.25);
        gateIron.box.call(gateIron, M.mul(dm, m4(ox, 0.95, 0)), 0.05, 1.7, 0.05, [1, 1, 1], 1.4);
        gateIron.cyl.call(gateIron, M.mul(dm, m4(ox, 1.8, 0)), 0.065, 0.008, 0.2, 4, [1, 1, 1], false);
      }
      for (const hh of [0.35, 1.1]) {
        gateIron.box.call(gateIron, M.mul(dm, m4(dir * 0.95, hh, 0)), 1.9, 0.06, 0.05, [1, 1, 1], 1.4);
      }
      gateIron.torus.call(gateIron, M.mul(dm, m4(dir * 1.0, 1.45, 0, Math.PI / 2, 0, 0)), 0.2, 0.025, 12, 5, [1, 1, 1]);
    }

    /* ---- 墓碑：几种形状 + 苔痕 + 小土丘；给甬道让路 ---- */
    const tomb = st.pen("w.tomb", T.stone(), { tint: [0.78, 0.78, 0.74], spec: 0.12, rim: 0.14 });
    const tombDark = st.pen("w.tombDark", T.stone(), { tint: [0.42, 0.43, 0.42], spec: 0.05 });
    const tr = rng(47);
    const tombSpots = [];
    /* 墓碑成排摆在教堂两侧和前院两角：正门到台阶这一段一座都不放。
     * 以前是沿弧线随机撒，既密又会撒到门口。 */
    const plots = [
      { x0: -1.5, x1: 7.4, z0: 80, z1: 101 },      // 教堂西侧
      { x0: 28.6, x1: 37.4, z0: 80, z1: 101 },     // 教堂东侧
      { x0: -1.0, x1: 10.2, z0: 105, z1: 112 },    // 前院西角
      { x0: 25.8, x1: 37.2, z0: 105, z1: 112 }     // 前院东角
    ];
    for (const pt of plots) {
      for (let gx = pt.x0; gx <= pt.x1; gx += 2.6) {
        for (let gz = pt.z0; gz <= pt.z1; gz += 3.2) {
          if (tr() < 0.28) continue;
          const gx2 = gx + (tr() - 0.5) * 0.5;
          const gz2 = gz + (tr() - 0.5) * 0.5;
          // 院墙椭圆外不放；家族墓室附近留空
          const dx = (gx2 - C.x) / 21.2, dz2 = (gz2 - C.z) / 23.2;
          if (dx * dx + dz2 * dz2 > 1.0) continue;
          if (Math.hypot(gx2 - (C.x - 13.2), gz2 - (C.z + 7.4)) < 3.4) continue;
          const gy = groundH(gx2, gz2);
          if (gy < 4) continue;
          const h = 0.55 + tr() * 0.85;
          const lean = (tr() - 0.5) * 0.18;
          const kind = tr();
          tombSpots.push([gx2, gz2, gy, h, lean, kind]);
        }
      }
    }
    for (const [gx, gz, gy, h, lean, kind] of tombSpots) {
      const ry = (HASH(gx, gz) - 0.5) * 0.4;
      tombDark.sphere.call(tombDark, m4(gx, gy + 0.02, gz, 0, 0, 0, 1.3, 0.18, 0.8), 0.36, 6, 4,
        [0.7, 0.72, 0.62]);
      if (kind < 0.22) {
        tomb.box.call(tomb, m4(gx, gy + h / 2, gz, lean, ry, lean * 0.5), 0.17, h, 0.17, [1, 1, 1], 1.2);
        tomb.box.call(tomb, m4(gx, gy + h * 0.72, gz, lean, ry, lean * 0.5), 0.64, 0.15, 0.15, [1, 1, 1], 1.2);
        tomb.box.call(tomb, m4(gx, gy + 0.09, gz, 0, ry, 0), 0.56, 0.18, 0.42, [0.9, 0.9, 0.86], 1.2);
      } else if (kind < 0.55) {
        tomb.box.call(tomb, m4(gx, gy + h / 2, gz, lean, ry, lean * 0.4), 0.5, h, 0.15, [1, 1, 1], 1.2);
        tomb.sphere.call(tomb, m4(gx, gy + h, gz, 0, ry, 0, 1, 0.6, 0.32), 0.24, 8, 5, [1, 1, 1]);
        tomb.box.call(tomb, m4(gx, gy + 0.08, gz, 0, ry, 0), 0.64, 0.16, 0.36, [0.92, 0.92, 0.88], 1.2);
      } else {
        tomb.box.call(tomb, m4(gx, gy + h * 0.44, gz, -0.24 + lean, ry, lean * 0.6), 0.54, h * 0.9, 0.13,
          [1, 1, 1], 1.2);
        tombDark.quad.call(tombDark, m4(gx + Math.sin(ry) * 0.08, gy + h * 0.5, gz + Math.cos(ry) * 0.08,
          0, ry, 0), 0.32, 0.04, [1, 1, 1], [0, 0, 1, 1]);
      }
    }
    // 一座小家族墓室：矮方室 + 石顶 + 铁门
    {
      const mx = C.x - 13.2, mz = C.z + 7.4;
      const gy = groundH(mx, mz);
      wallStone.box.call(wallStone, m4(mx, gy + 0.95, mz), 2.6, 1.9, 1.9, [0.94, 0.92, 0.88], 0.45);
      wallCap.box.call(wallCap, m4(mx, gy + 2.04, mz), 2.94, 0.2, 2.2, [1, 1, 1], 1.2);
      gateIron.box.call(gateIron, m4(mx, gy + 0.88, mz + 0.96), 1.0, 1.45, 0.06, [1, 1, 1], 0.8);
      for (let k = 0; k < 4; k++) {
        gateIron.box.call(gateIron, m4(mx - 0.36 + k * 0.24, gy + 0.88, mz + 1.0), 0.04, 1.45, 0.03, [1, 1, 1], 0.8);
      }
    }

    /* ---- 甬道：从教堂台阶到院门，再往南接到山门 ---- */
    const pathPts = [[19.2, 106.0], [19.6, 110.0], [20.3, 114.2], [20.9, 118.4],
      [21.1, 123.4], [20.6, 129.4], [19.8, 136.0], [19.4, 144.0], [19.4, 152.0]];
    const slabW = 1.7, slabD = 0.72;
    for (let i = 0; i < pathPts.length - 1; i++) {
      const a = pathPts[i], b = pathPts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / slabD));
      const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const px = a[0] + (b[0] - a[0]) * u, pz = a[1] + (b[1] - a[1]) * u;
        const py = groundH(px, pz) + 0.035;
        pave.box.call(pave, m4(px, py, pz, 0, ry + (HASH(i, k) - 0.5) * 0.05, 0),
          slabW * 0.92, 0.07, slabD * 0.86, [0.94, 0.92, 0.88], 1.1);
        for (const s of [-1, 1]) {
          const ex = px + Math.cos(ry) * s * (slabW * 0.55), ez = pz - Math.sin(ry) * s * (slabW * 0.55);
          pave.box.call(pave, m4(ex, groundH(ex, ez) + 0.04, ez, 0, ry, 0),
            0.15, 0.1, slabD * 0.96, [0.72, 0.7, 0.66], 1.2);
        }
      }
    }
    // 甬道两旁的低矮黄杨 + 花
    for (let i = 0; i < 34; i++) {
      const u = i / 33;
      const px = 20.6 + Math.sin(u * 2.6) * 1.4;
      const pz = 108.0 + u * 44;
      const py = groundH(px, pz);
      for (const s of [-1, 1]) {
        hedge.box.call(hedge, m4(px + s * 1.62, py + 0.24, pz), 0.6, 0.48, 0.95, [1, 1, 1], 1.2);
      }
      if (i % 3 === 0) {
        for (const s of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            flowerP.quad.call(flowerP, m4(px + s * 1.4 + (HASH(i, k) - 0.5) * 0.24,
              py + 0.42, pz + (k - 1) * 0.16, -0.9, HASH(k, i) * TAU, 0),
              0.1, 0.13, [0.9, 0.82, 0.62], [0, 0, 1, 1]);
          }
        }
      }
    }
    // 石灯：沿甬道（灯室四角有石柱，玻璃不悬在座子上）
    for (const [lx, lz, s] of [[17.4, 113.0, 0.9], [24.6, 123.5, 0.85], [22.9, 136.0, 0.8], [22.2, 148.0, 0.8]]) {
      const gy = groundH(lx, lz);
      wallStone.box.call(wallStone, m4(lx, gy + 0.35, lz), 0.46, 0.7, 0.46, [1, 1, 1], 1.0);
      wallStone.box.call(wallStone, m4(lx, gy + 0.78, lz), 0.52, 0.16, 0.52, [1, 1, 1], 1.0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        wallStone.box.call(wallStone, m4(lx + sx * 0.2, gy + 1.02, lz + sz * 0.2),
          0.08, 0.36, 0.08, [1, 1, 1], 1.0);
      }
      lampGlass.quad.call(lampGlass, m4(lx, gy + 1.02, lz + 0.21), 0.28, 0.32, [1, 1, 1], [0, 0, 1, 1]);
      wallCap.box.call(wallCap, m4(lx, gy + 1.28, lz), 0.58, 0.15, 0.58, [1, 1, 1], 1.1);
      glowP.quad.call(glowP, m4(lx, gy + 1.02, lz + 0.27), 2.1 * s, 2.1 * s, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 长椅三张
    for (const [bx, bz, br] of [[16.6, 117.0, 0.1], [25.0, 129.0, -0.15], [23.4, 143.0, 0.08]]) {
      const gy = groundH(bx, bz);
      for (const s of [-1, 1]) {
        wallStone.box.call(wallStone, m4(bx, gy + 0.2, bz + s * 0.7), 0.52, 0.4, 0.22, [1, 1, 1], 1.0);
      }
      wallStone.box.call(wallStone, m4(bx, gy + 0.44, bz, 0, br, 0), 1.6, 0.14, 0.76, [1, 1, 1], 1.0);
    }
    // 甬道尽头的林地山门（四柱 + 小两坡顶 + 吊钟 + 两扇半开的木门）
    {
      const gx = 19.4, gz = 152.0, gy = groundH(gx, gz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        hedgedPost(gx + sx * 1.55, gz + sz * 0.95, gy, 2.35);
      }
      const gateWood = st.pen("w.churchGateWood", T.woodDark(), { tint: [1.05, 0.84, 0.62], spec: 0.08 });
      for (const sz of [-1, 1]) {
        gateWood.box.call(gateWood, m4(gx, gy + 2.3, gz + sz * 0.95), 3.34, 0.2, 0.2, [1, 1, 1], 1.3);
      }
      for (const sx of [-1, 1]) {
        gateWood.box.call(gateWood, m4(gx + sx * 1.55, gy + 2.3, gz), 0.2, 0.18, 1.9, [1, 1, 1], 1.3);
      }
      gableRoof(roofP, m4(gx, gy + 2.4, gz), 3.7, 2.4, 0.82, [1, 1, 1], 0.55, false);
      gateWood.box.call(gateWood, m4(gx, gy + 3.22, gz), 0.16, 0.12, 2.5, [1, 1, 1], 1.2);
      goldP.cyl.call(goldP, m4(gx, gy + 2.62, gz), 0.11, 0.16, 0.2, 10, [1, 1, 1], true);
      goldP.sphere.call(goldP, m4(gx, gy + 2.6, gz), 0.08, 7, 5, [1, 1, 1]);
      cableTube(st, [[gx, gy + 2.86, gz], [gx, gy + 3.18, gz]]);
      for (const s of [-1, 1]) {
        const hx = gx + s * 1.42;
        const open = s * 1.05;
        const dm = m4(hx - s * 0.42, gy + 0.88, gz + 0.85, 0, open, 0);
        gateWood.box.call(gateWood, dm, 0.84, 1.72, 0.08, [1, 1, 1], 1.2);
        for (const yy of [-0.55, 0.0, 0.55]) {
          iron.box.call(iron, M.mul(dm, m4(0, yy, 0.05, 0, 0, 0)), 0.7, 0.05, 0.03, [1, 1, 1], 1.0);
        }
      }
    }
    function cableTube(stage, pts) {
      const p = stage.pen("w.churchRope", null, { tint: [0.3, 0.26, 0.2], spec: 0.02 });
      p.tube.call(p, M.ident(), pts, 0.012, 4, [1, 1, 1]);
    }
    function hedgedPost(x, z, y, h) {
      const p = st.pen("w.churchPost", T.woodDark(), { tint: [0.9, 0.75, 0.58], spec: 0.12 });
      p.box.call(p, m4(x, y + h / 2, z), 0.24, h, 0.24, [1, 1, 1], 1.4);
      p.box.call(p, m4(x, y + 0.12, z), 0.4, 0.24, 0.4, [0.8, 0.8, 0.76], 1.2);
    }

    /* ---- 墓园里的柏树 / 教堂旁的树 ---- */
    const cypressPen = st.pen("w.cypress", WTex.pine(), { tint: [1.2, 1.3, 1.15], sway: 1, rim: 0.2 });
    const cypressTrunk = st.pen("w.cypressTrunk", T.woodDark(), { tint: [0.4, 0.32, 0.28] });
    for (const [dx, dz2, hh] of [[13.6, 1.8, 7.0], [-13.4, 2.4, 6.2], [12.8, -7.0, 6.6],
      [-12.6, -7.6, 6.2], [15.8, -1.6, 5.8], [-15.6, -1.0, 5.6]]) {
      const x = C.x + dx, z = C.z + dz2;
      cypressTree(cypressTrunk, cypressPen, x, z, hh, Math.round(x * 7 + z), [0.9, 1.02, 0.88]);
    }
  }

  /* ============================================================
   *  近岸城市 + 灯塔 + 港口
   *  城市就在这边岸边（x 30..250，z -100..-62），对岸不再有城市，海湾直接开到天边。
   * ============================================================ */
  function buildCity(st) {
    const C = L.city;
    const r = rng(83);
    const bld = st.pen("w.cityBld", null, { tint: [0.16, 0.18, 0.24], spec: 0.06, rim: 0.35 });
    const winW = st.pen("w.cityWinW", null, { unlit: true, tint: [1.0, 0.72, 0.4] });
    const winC = st.pen("w.cityWinC", null, { unlit: true, tint: [0.52, 0.68, 1.0] });
    const podium = st.pen("w.cityPodium", T.stone(), { tint: [0.26, 0.27, 0.31], spec: 0.04 });
    const metal = st.pen("w.cityMetal", T.darkMetal(), { tint: [0.3, 0.31, 0.34], spec: 0.28 });
    const tank = st.pen("w.cityTank", T.metal(), { tint: [0.55, 0.55, 0.58], spec: 0.2 });
    const pave = st.pen("w.cityPave", T.paving(), { tint: [0.42, 0.44, 0.5], spec: 0.12 });
    const quay = st.pen("w.cityQuay", T.stone(), { tint: [0.36, 0.37, 0.4], spec: 0.06 });
    const lampPost = st.pen("w.cityLamp", T.darkMetal(), { tint: [0.3, 0.3, 0.33], spec: 0.2 });
    const lampGlow = st.pen("w.cityLampGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.7, 0.36], opacity: 0.24 });
    const wood = st.pen("w.cityWood", T.woodDark(), { tint: [1.0, 0.8, 0.58], spec: 0.08 });
    const stone = st.pen("w.cityStone", T.stone(), { tint: [0.52, 0.53, 0.57], spec: 0.1, rim: 0.12 });
    const crown = st.pen("w.cityCrown", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.72, 0.42], opacity: 0.2 });
    const hull = st.pen("w.cityBoat", T.darkMetal(), { tint: [0.15, 0.17, 0.2], spec: 0.25 });
    const boatLamp = st.pen("w.cityBoatLamp", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.8, 0.45], opacity: 0.5 });

    // 铺装：滨海步道 + 城区地面 + 靠镜头这侧的林荫道（主标题看得到的是这一面）
    const xm = (C.x0 + C.x1) / 2, wcity = C.x1 - C.x0;
    pave.quad.call(pave, m4(xm, 0.05, C.z0 + 3.2, -Math.PI / 2, 0, 0), wcity + 10, 7.6, [1, 1, 1], [0, 0, wcity / 6, 1.4]);
    pave.quad.call(pave, m4(xm, 0.04, (C.z0 + C.z1) / 2 - 1, -Math.PI / 2, 0, 0), wcity + 10, C.z1 - C.z0 - 9,
      [0.9, 0.92, 1.0], [0, 0, wcity / 6, (C.z1 - C.z0) / 6]);
    pave.quad.call(pave, m4(xm, 0.05, C.z1 - 2.4, -Math.PI / 2, 0, 0), wcity + 10, 9, [0.96, 0.96, 0.98],
      [0, 0, wcity / 6, 1.6]);

    // 广告牌：立在这侧林荫道上，正对主标题镜头
    const bbFrame = st.pen("w.cityBillFrame", T.darkMetal(), { tint: [0.18, 0.19, 0.22], spec: 0.3 });
    const billboard = (key, text, x, z, w, h, y, fg, border, glowCol) => {
      const tex = A3DTex.sign({
        text, w: 640, h: 200, bg: "#0a0f16", fg, size: 92,
        border, borderW: 5, glow: glowCol, glowBlur: 18
      });
      const pen = st.pen(key, tex, { unlit: true, tint: [1, 1, 1] });
      pen.quad.call(pen, m4(x, y, z + 0.22), w, h, [1, 1, 1], [0, 0, 1, 1]);
      bbFrame.box.call(bbFrame, m4(x, y, z), w + 0.7, h + 0.7, 0.3, [1, 1, 1], 2);
      const legTop = y - h * 0.5, legH = legTop;
      for (const sx of [-0.32, 0.32]) {
        bbFrame.box.call(bbFrame, m4(x + w * sx, legH / 2, z), 0.28, legH, 0.28, [1, 1, 1], 1.6);
      }
    };
    billboard("w.cityBb1", "NORTH BAY", 52, C.z1 - 2.6, 10.5, 3.3, 6.8, "#9ee9ff", "#2c5f78", "rgba(130,225,255,.5)");
    billboard("w.cityBb2", "24H · 港湾", 94, C.z1 - 2.6, 8.4, 2.6, 6.1, "#ffd28a", "#5a3a1e", "rgba(255,190,110,.45)");

    // 窗：只铺朝镜头（+Z）的那一面
    const winFace = (x0, y0, zf, w, h) => {
      const cols = Math.max(1, Math.round(w / 1.7));
      const rows = Math.max(1, Math.round(h / 2.3));
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          if (r() < 0.4) continue;
          const wx = x0 - w / 2 + (cx + 0.5) * (w / cols);
          const wy = y0 + 1.1 + cy * (h / rows);
          const ww = w / cols * 0.44, wh = Math.min(0.85, h / rows * 0.4);
          const wp = r() < 0.55 ? winW : winC;
          wp.quad.call(wp, m4(wx, wy, zf), ww, wh, [1, 1, 1], [0, 0, 1, 1]);
        }
      }
    };

    // 地标占位：这些位置不放随机楼
    const landmarks = [[96, -76, 11], [166, -80, 12], [138, -68, 10]];
    const roofLights = [];

    // 主城区：裙楼 + 檐口 + 一层店面 + 立面竖肋 + 退台 + 楼顶水箱 / 空调 / 天线
    const n = 62;
    for (let i = 0; i < n; i++) {
      const x = C.x0 + 6 + r() * (C.x1 - C.x0 - 12);
      const z = C.z1 - 6 - r() * (C.z1 - C.z0 - 14);
      if (landmarks.some(l => Math.hypot(x - l[0], z - l[1]) < l[2])) continue;
      const w = 5 + r() * 9, d = 5 + r() * 8;
      /* 给 GitHub 街口和西侧广场让出一块空地：
       * 楼体能随机长到 x≈29，以前会压住街口 / 广场，甚至和街上的牌坊碰头。 */
      if (x - w / 2 < 38.5 && z + d / 2 > -85 && z - d / 2 < -60) continue;
      const h = 6 + r() * r() * 34;
      const tone = 0.75 + r() * 0.5;
      const pod = r() < 0.55 ? 1.1 : 0;
      if (pod) podium.box.call(podium, m4(x, pod / 2, z), w + 1.8, pod, d + 1.8, [1, 1, 1], 1.5);
      const stepped = h > 16 && r() < 0.42;
      const h1 = stepped ? h * 0.72 : h;
      const h2 = h - h1, w2 = stepped ? w * 0.66 : w, d2 = stepped ? d * 0.66 : d;
      bld.box.call(bld, m4(x, pod + h1 / 2, z), w, h1, d, [tone, tone, tone * 1.02], 1.1);
      winFace(x, pod, z + d / 2 + 0.03, w, h1);
      if (stepped) {
        bld.box.call(bld, m4(x, pod + h1 + h2 / 2, z), w2, h2, d2, [tone * 1.06, tone * 1.06, tone * 1.1], 1.2);
        winFace(x, pod + h1, z + d2 / 2 + 0.03, w2, h2);
        crown.quad.call(crown, m4(x, pod + h1 + h2 - 0.9, z + d2 / 2 + 0.06), w2 * 0.8, 0.5, [1, 1, 1], [0, 0, 1, 1]);
      }
      const topY = pod + h;
      // 一层店面：一条亮着的橱窗带
      if (r() < 0.55) {
        const sw = w * (0.5 + r() * 0.4);
        const sp = r() < 0.62 ? winW : winC;
        sp.quad.call(sp, m4(x, pod + 0.95, z + d / 2 + 0.06), sw, 1.15, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 檐口：比楼身略宽的一圈，压住轮廓
      bld.box.call(bld, m4(x, topY - 0.3, z), w2 + 0.9, 0.55, d2 + 0.9, [tone * 1.15, tone * 1.15, tone * 1.2], 1.3);
      // 立面竖肋：给近处的楼一点纵向线条
      if (h1 > 12 && r() < 0.45) {
        for (let k = -1; k <= 1; k++) {
          bld.box.call(bld, m4(x + k * w * 0.3, pod + h1 * 0.45, z + d / 2 + 0.1), 0.42, h1 * 0.8, 0.35, [tone * 1.1, tone * 1.1, tone * 1.15], 1.4);
        }
      }
      if (h < 26 && r() < 0.55) {
        const rx = x + (r() - 0.5) * w2 * 0.45, rz = z + (r() - 0.5) * d2 * 0.4;
        metal.cyl.call(metal, m4(rx, topY, rz), 0.14, 0.12, 1.0, 4, [1, 1, 1], true);
        tank.cyl.call(tank, m4(rx, topY + 1.0, rz), 1.0 + r() * 0.35, 0.95, 1.9, 8, [1, 1, 1], true);
      } else if (r() < 0.5) {
        for (let k = 0; k < 2; k++) {
          metal.box.call(metal, m4(x + (r() - 0.5) * w2 * 0.6, topY + 0.42, z + (r() - 0.5) * d2 * 0.5), 1.2, 0.85, 1.0, [1, 1, 1], 1.6);
        }
      }
      if (h > 24) roofLights.push([x, topY + 0.8, z + d2 / 2]);
      if (h > 28 && r() < 0.6) {
        metal.cyl.call(metal, m4(x + w2 * 0.18, topY, z), 0.07, 0.05, 6.0, 4, [1, 1, 1], true);
        roofLights.push([x + w2 * 0.18, topY + 6.2, z]);
      }
    }

    // 地标 1：针塔（细高，顶上一盏红灯）
    {
      const lx = 96, lz = -76;
      for (let k = 0; k < 5; k++) {
        const ww = 7.4 - k * 1.05;
        bld.box.call(bld, m4(lx, k * 10 + 5, lz), ww, 10, ww, [0.85, 0.88, 0.98], 1.1);
        winFace(lx, k * 10, lz + ww / 2 + 0.03, ww, 10);
      }
      metal.cyl.call(metal, m4(lx, 50, lz), 2.0, 0.1, 12, 8, [1, 1, 1], false);
      crown.quad.call(crown, m4(lx, 47.5, lz + 3.0), 4.6, 1.4, [1, 1, 1], [0, 0, 1, 1]);
      roofLights.push([lx, 62.6, lz], [lx, 50.2, lz]);
    }
    // 地标 2：退台式装饰塔（立面上有竖向线条）
    {
      const lx = 166, lz = -80;
      bld.box.call(bld, m4(lx, 12, lz), 16, 24, 12, [0.9, 0.92, 1.0], 1.1);
      winFace(lx, 0, lz + 6.03, 16, 24);
      for (let k = 0; k < 5; k++) bld.box.call(bld, m4(lx - 8 + k * 4, 12, lz + 6.15), 0.6, 24, 0.4, [1.05, 1.05, 1.1], 1.2);
      bld.box.call(bld, m4(lx, 28, lz), 11, 8, 8, [0.95, 0.97, 1.05], 1.1);
      winFace(lx, 24, lz + 4.03, 11, 8);
      bld.box.call(bld, m4(lx, 36, lz), 7, 8, 6, [1, 1, 1.1], 1.1);
      crown.quad.call(crown, m4(lx, 22.8, lz + 6.1), 13, 1.2, [1, 1, 1], [0, 0, 1, 1]);
      crown.quad.call(crown, m4(lx, 39.6, lz + 3.06), 5.5, 1.0, [1, 1, 1], [0, 0, 1, 1]);
      roofLights.push([lx, 40.6, lz]);
    }
    // 地标 3：圆塔（玻璃幕墙感）
    {
      const lx = 138, lz = -68;
      bld.cyl.call(bld, m4(lx, 0, lz), 6.2, 4.4, 26, 14, [0.8, 0.84, 0.95], false);
      for (let k = 0; k < 6; k++) {
        const rr = 6.2 - (k / 5) * 1.8;
        crown.quad.call(crown, m4(lx, 4 + k * 3.8, lz + rr + 0.05), 2.4, 0.5, [1, 1, 1], [0, 0, 1, 1]);
      }
      crown.quad.call(crown, m4(lx, 24.6, lz + 4.5), 6.0, 1.2, [1, 1, 1], [0, 0, 1, 1]);
      roofLights.push([lx, 27.5, lz]);
    }

    // 滨海长堤：挡土墙 + 系缆桩 + 水侧步道灯（从海上看才有，主标题被楼挡住）
    const qx0 = C.x0 - 4, qx1 = C.x1 + 4, qz = C.z0 - 0.4;
    quay.box.call(quay, m4((qx0 + qx1) / 2, -0.3, qz), qx1 - qx0, 1.4, 1.4, [1, 1, 1], 2.2);
    for (let x = qx0 + 6; x < qx1; x += 9) {
      metal.cyl.call(metal, m4(x, 0.4, qz + 0.25), 0.2, 0.16, 0.62, 6, [1, 1, 1], true);
    }
    for (let x = qx0 + 10; x < qx1; x += 18) {
      lampPost.cyl.call(lampPost, m4(x, 0.4, C.z0 + 1.6), 0.08, 0.06, 3.3, 5, [1, 1, 1], true);
      lampPost.box.call(lampPost, m4(x, 3.75, C.z0 + 1.6), 0.4, 0.14, 0.4, [1, 1, 1], 1.2);
      lampGlow.quad.call(lampGlow, m4(x, 3.72, C.z0 + 1.78), 2.8, 2.8, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 靠镜头这侧的林荫道：一排伸到画面里的路灯
    for (let x = C.x0 + 6; x < C.x1; x += 18) {
      const lz = C.z1 - 3.2;
      lampPost.cyl.call(lampPost, m4(x, 0, lz), 0.08, 0.06, 3.6, 5, [1, 1, 1], true);
      lampPost.box.call(lampPost, m4(x, 3.55, lz), 0.42, 0.15, 0.42, [1, 1, 1], 1.2);
      lampGlow.quad.call(lampGlow, m4(x, 3.52, lz + 0.18), 3.0, 3.0, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 堤边两条小船
    for (const [bx, bz, s] of [[64, -111, 1], [146, -113, 0.85]]) {
      hull.box.call(hull, m4(bx, L.waterY + 0.35, bz), 3.4 * s, 0.8, 1.5 * s, [1, 1, 1], 1.4);
      hull.box.call(hull, m4(bx - 0.6, L.waterY + 0.9, bz), 1.2 * s, 0.8, 1.1, [1, 1, 1], 1.3);
      boatLamp.quad.call(boatLamp, m4(bx, L.waterY + 1.6, bz + 0.8), 1.0, 1.0, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ---- 街口广场：把 GitHub 街的石板路和城市铺装接上 ----
     *  这里过去是「街道尽头 + 城市边缘」的一条硬缝，现在补一个带
     *  方尖碑、路灯、长椅、行道树的小广场，从主标题和街口都看得到。 */
    const plazaX = 30.5, plazaZ = -71.5;
    pave.grid.call(pave, m4(plazaX, 0.06, plazaZ), 11.5, 15.5, 9, 12,
      [0.9, 0.92, 1.0], 0.5, 0.16, 0);
    // 广场边缘一圈石带
    for (const sz of [-1, 1]) {
      pave.box.call(pave, m4(plazaX, 0.08, plazaZ + sz * 7.75), 11.5, 0.16, 0.42, [0.7, 0.72, 0.78], 0.8);
    }
    // 方尖碑：基座 + 碑身 + 金顶
    const mono = st.pen("w.cityMono", T.stone(), { tint: [0.5, 0.52, 0.58], spec: 0.12 });
    const monoGold = st.pen("w.cityMonoGold", T.brass(), { tint: [1.1, 0.92, 0.58], spec: 0.6 });
    mono.cyl.call(mono, m4(plazaX, 0.1, plazaZ), 1.3, 1.2, 0.42, 8, [1, 1, 1], true);
    mono.cyl.call(mono, m4(plazaX, 0.52, plazaZ), 0.95, 0.82, 0.28, 8, [1, 1, 1], true);
    mono.cyl.call(mono, m4(plazaX, 0.8, plazaZ), 0.62, 0.14, 4.2, 4, [1, 1, 1], true);
    monoGold.cyl.call(monoGold, m4(plazaX, 5.0, plazaZ), 0.15, 0.02, 0.5, 4, [1, 1, 1], true);
    // 纪念碑四周的灯与长椅（广场从街口方向看也看得到，光晕做成交叉双片）
    for (const [dx, dz] of [[-3.2, -2.6], [3.2, -2.6], [-3.2, 2.6], [3.2, 2.6]]) {
      const lx = plazaX + dx, lz = plazaZ + dz;
      lampPost.cyl.call(lampPost, m4(lx, 0.06, lz), 0.07, 0.055, 3.1, 5, [1, 1, 1], true);
      lampPost.box.call(lampPost, m4(lx, 3.15, lz), 0.34, 0.12, 0.34, [1, 1, 1], 1.2);
      lampGlow.quad.call(lampGlow, m4(lx, 3.12, lz + 0.16), 2.6, 2.6, [1, 1, 1], [0, 0, 1, 1]);
      lampGlow.quad.call(lampGlow, m4(lx + 0.16, 3.12, lz, 0, Math.PI / 2, 0), 2.6, 2.6, [1, 1, 1], [0, 0, 1, 1]);
    }
    for (const [dx, dz] of [[-4.4, 0], [4.4, 0]]) {
      const bx = plazaX + dx, bz = plazaZ + dz;
      wood.box.call(wood, m4(bx, 0.48, bz), 2.0, 0.1, 0.5, [0.62, 0.48, 0.34], 1.2);
      for (const s of [-1, 1]) {
        wood.box.call(wood, m4(bx + s * 0.8, 0.24, bz), 0.14, 0.48, 0.44, [0.55, 0.42, 0.3], 1.2);
      }
    }
    // 广场行道树 / 花坛
    const cityLeaf = st.pen("w.cityLeaf", null, { tint: [0.2, 0.34, 0.22], spec: 0.04, rim: 0.1, sway: 0.6 });
    const treeAt = (tx, tz, hh) => {
      const gy2 = 0.06;
      wood.cyl.call(wood, m4(tx, gy2, tz), 0.18, 0.12, hh * 0.42, 6, [0.5, 0.38, 0.28], true);
      for (let k = 0; k < 3; k++) {
        cityLeaf.sphere.call(cityLeaf, m4(tx, gy2 + hh * (0.5 + k * 0.13), tz, 0, k * 0.7, 0,
          1, 0.72, 1), hh * (0.3 - k * 0.06), 8, 6, [1, 1, 1]);
      }
      // 树池
      stone.box.call(stone, m4(tx, gy2 + 0.16, tz), 1.2, 0.3, 1.2, [0.4, 0.4, 0.44], 0.8);
    };
    for (const [tx, tz] of [[plazaX - 6.6, plazaZ - 5.4], [plazaX + 6.6, plazaZ - 5.4],
      [plazaX - 6.6, plazaZ + 5.4], [plazaX + 6.6, plazaZ + 5.4]]) {
      treeAt(tx, tz, 4.6);
    }

    /* ---- 滨海林荫道：一排行道树 + 长椅，把城市南缘从「一排楼」变成一条街 ---- */
    for (let x = C.x0 + 14; x < C.x1 - 6; x += 21) {
      const tz = C.z1 - 5.6;
      const gy2 = 0.05;
      wood.cyl.call(wood, m4(x, gy2, tz), 0.2, 0.13, 2.6, 6, [0.5, 0.38, 0.28], true);
      for (let k = 0; k < 3; k++) {
        cityLeaf.sphere.call(cityLeaf, m4(x, gy2 + 3.1 + k * 0.62, tz, 0, k * 0.8, 0, 1, 0.7, 1),
          1.15 - k * 0.18, 8, 6, [1, 1, 1]);
      }
      stone.box.call(stone, m4(x, 0.14, tz), 1.3, 0.24, 1.3, [0.4, 0.4, 0.44], 0.8);
      if ((x - C.x0) % 42 < 21) {
        // 长椅：座板 + 两条腿，别让座板浮在半空
        const benchZ = tz - 0.4;
        wood.box.call(wood, m4(x + 3.4, 0.46, benchZ), 2.0, 0.1, 0.5, [0.58, 0.45, 0.32], 1.2);
        for (const s of [-0.75, 0.75]) {
          wood.box.call(wood, m4(x + 3.4 + s, 0.21, benchZ, 0, 0, 0), 0.16, 0.42, 0.42,
            [0.5, 0.38, 0.28], 1.2);
        }
      }
    }

    /* ---- 街口斑马线：城市和夜市的交界处，让人一眼看出这里能过街 ---- */
    for (let i = 0; i < 6; i++) {
      pave.quad.call(pave, m4(27.2, 0.075, -76.4 + i * 1.28, -Math.PI / 2, 0, 0),
        3.6, 0.62, [1.25, 1.24, 1.16], [0, 0, 1, 1]);
    }

    // 城市光晕：贴着朝镜头那侧楼群的暖色雾
    const haze = st.pen("w.cityHaze", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.66, 0.32], opacity: 0.11 });
    for (let i = 0; i < 6; i++) {
      haze.quad.call(haze, m4(C.x0 + 24 + i * 34, 8 + i * 1.2, C.z1 - 1), 70, 26, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 水面上的城市倒影：近岸城市北边的海面
    const refl = st.pen("w.cityRefl", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.6, 0.28], opacity: 0.10 });
    for (let i = 0; i < 22; i++) {
      const x = C.x0 + 8 + r() * (C.x1 - C.x0 - 16);
      const z = -112 - r() * 46;
      refl.quad.call(refl, m4(x, L.waterY + 0.03, z, -Math.PI / 2, 0, 0), 1.6 + r() * 2.4, 8 + r() * 16,
        [1, 1, 1], [0, 0, 1, 3]);
    }

    // 港口：起重机和拖船剪影（立在近岸水线上）
    const crane = st.pen("w.crane", T.darkMetal(), { tint: [0.2, 0.22, 0.26], spec: 0.2 });
    for (const [cx, cz, s] of [[56, -101, 1], [118, -102, 0.85], [178, -101, 1.15]]) {
      crane.box.call(crane, m4(cx, 10 * s, cz), 0.7 * s, 20 * s, 0.7 * s, [1, 1, 1], 2);
      crane.box.call(crane, m4(cx + 4.5 * s, 19.6 * s, cz, 0, 0, 0.08), 10 * s, 0.5 * s, 0.5 * s, [1, 1, 1], 2);
      crane.box.call(crane, m4(cx + 9 * s, 17.8 * s, cz), 0.18 * s, 4 * s, 0.18 * s, [1, 1, 1], 2);
    }
    // 塔吊红灯 + 楼顶航空灯 + 城市光点
    const pts = [];
    for (const [cx, cz, s] of [[56, -101, 1], [118, -102, 0.85], [178, -101, 1.15]]) {
      pts.push({ x: cx + 9 * s, y: 20.1 * s, z: cz, r: 1, g: 0.2, b: 0.12, a: 0.9, size: 1.4, kind: 0, phase: 2.1, wob: 0 });
    }
    for (const [lx, ly, lz] of roofLights) {
      pts.push({ x: lx, y: ly, z: lz, r: 1, g: 0.18, b: 0.1, a: 0.85, size: 1.2, kind: 0, phase: 1.3, wob: 0 });
    }
    for (let i = 0; i < 70; i++) {
      pts.push({
        x: C.x0 + 8 + r() * (C.x1 - C.x0 - 16), y: 2 + r() * 34, z: C.z1 - 8 - r() * (C.z1 - C.z0 - 12),
        r: 1, g: 0.75, b: 0.45, a: 0.5 + r() * 0.4, size: 0.5 + r() * 0.7,
        kind: 0, phase: r() * 10, wob: 0
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "add", yMin: 0, yMax: 70, fogNear: 120, fogFar: 620 });
  }

  function buildLighthouse(st) {
    const P0 = L.lighthouse;
    const baseY = groundH(P0.x, P0.z) + 0.3;
    const rock = st.pen("w.lhRock", T.stone(), { tint: [0.4, 0.42, 0.46], spec: 0.12, rim: 0.14 });
    const tower = st.pen("w.lhTower", T.plaster(), { tint: [1.0, 0.98, 0.94], spec: 0.2 });
    const red = st.pen("w.lhRed", T.plasterWarm(), { tint: [1.4, 0.56, 0.44], spec: 0.18 });
    const metal = st.pen("w.lhMetal", T.darkMetal(), { tint: [0.35, 0.36, 0.4], spec: 0.4 });
    const stone = st.pen("w.lhStone", WTex.ashlar(), { tint: [0.66, 0.66, 0.66], spec: 0.1, rim: 0.12 });
    const door = st.pen("w.lhDoor", T.woodDark(), { tint: [0.95, 0.72, 0.52], spec: 0.1 });
    const lampGlass = st.pen("w.lhLamp", null, { unlit: true, tint: [1.0, 0.86, 0.5] });
    const winGlass = st.pen("w.lhWin", null, { unlit: true, tint: [1.0, 0.78, 0.44] });
    const glow = st.pen("w.lhGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.78, 0.42], opacity: 0.26 });
    const r = rng(61);
    const H = baseY + P0.top;
    const SHEDX = P0.x + 4.6, SHEDZ = P0.z + 4.8;

    /* ---- 礁石群：贴水面铺开，湿的一面压暗；别是一圈浮球 ---- */
    for (let i = 0; i < 30; i++) {
      const a = r() * TAU;
      const d = 2.0 + r() * 7.5;
      const s = 0.7 + r() * 2.1;
      const y = baseY - 0.55 + r() * 1.9;
      const rx2 = P0.x + Math.cos(a) * d, rz2 = P0.z + Math.sin(a) * d * 0.82;
      if (Math.hypot(rx2 - SHEDX, rz2 - SHEDZ) < 3.0) continue;
      rock.sphere.call(rock, m4(rx2, y, rz2,
        (r() - 0.5) * 0.4, a, (r() - 0.5) * 0.4, s, s * (0.4 + r() * 0.22), s * 0.86),
        1, 7, 5, [0.72 + r() * 0.36, 0.76, 0.84]);
    }
    // 湿石：水线附近压暗的一圈
    const wet = st.pen("w.lhWet", T.stone(), { tint: [0.18, 0.2, 0.22], spec: 0.5 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + r() * 0.2;
      const d = 3.6 + r() * 3.4;
      wet.sphere.call(wet, m4(P0.x + Math.cos(a) * d, L.waterY + 0.02, P0.z + Math.sin(a) * d * 0.82,
        0, a, 0, 1.3 + r() * 0.6, 0.16, 1.0 + r() * 0.5), 1, 6, 4, [1, 1, 1]);
    }
    // 礁石周围的泡沫
    const foam = st.pen("w.lhFoam", T.glow(), { unlit: true, blend: "add", tint: [0.72, 0.84, 1.0], opacity: 0.16 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2;
      const d = 4.2 + r() * 2.2;
      foam.quad.call(foam, m4(P0.x + Math.cos(a) * d, L.waterY + 0.04, P0.z + Math.sin(a) * d * 0.8,
        -Math.PI / 2, r() * TAU, 0), 2.4 + r() * 2.2, 0.9 + r() * 0.5, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ---- 基座平台 + 登塔台阶（朝岸一侧） ---- */
    stone.cyl.call(stone, m4(P0.x, baseY - 0.2, P0.z), 3.5, 3.2, 0.62, 18, [1, 1, 1], true);
    stone.cyl.call(stone, m4(P0.x, baseY + 0.4, P0.z), 3.12, 2.92, 0.28, 18, [1, 1, 1], true);
    // 台阶：从沙滩（+Z 方向）上到平台
    const shoreZ = 3.3;
    for (let i = 0; i < 4; i++) {
      stone.box.call(stone, m4(P0.x, baseY - 0.08 + i * 0.12, P0.z + shoreZ + 0.6 - i * 0.34),
        1.5, 0.16, 0.42, [1, 1, 1], 0.8);
    }

    /* ---- 塔身：白灰 + 两道红箍（半径必须比塔身大，不然会被埋进去） ---- */
    tower.cyl.call(tower, m4(P0.x, baseY, P0.z), 2.6, 1.66, H - baseY, 16, [1, 1, 1], false);
    // 塔身竖向抹灰分格：几条很淡的竖向凹槽，近看不是一根光筒
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rr0 = 2.6, rr1 = 1.66;
      const p0 = [P0.x + Math.cos(a) * (rr0 + 0.012), baseY, P0.z + Math.sin(a) * (rr0 + 0.012)];
      const p1 = [P0.x + Math.cos(a) * (rr1 + 0.012), H, P0.z + Math.sin(a) * (rr1 + 0.012)];
      // 细长条：用三角形拼一条贴在塔身上的浅色缝
      const w = 0.035;
      const tx = -Math.sin(a) * w, tz = Math.cos(a) * w;
      tower.tri.call(tower, M.ident(),
        [p0[0] + tx, p0[1], p0[2] + tz], [p0[0] - tx, p0[1], p0[2] - tz], p1, null, [0.72, 0.72, 0.72]);
      tower.tri.call(tower, M.ident(),
        [p1[0] - tx, p1[1], p1[2] - tz], [p1[0] + tx, p1[1], p1[2] + tz], p1, null, [0.72, 0.72, 0.72]);
    }
    // 红箍：按塔身半径插值，略胖 0.04~0.06
    const bandAt = (t, hh) => {
      const y = baseY + (H - baseY) * t;
      const rr = 2.6 + (1.66 - 2.6) * t;
      red.cyl.call(red, m4(P0.x, y - hh / 2, P0.z), rr + 0.06, rr + 0.05, hh, 16, [1, 1, 1], false);
      metal.cyl.call(metal, m4(P0.x, y + hh / 2, P0.z), rr + 0.1, rr + 0.06, 0.09, 16, [1, 1, 1], true);
      metal.cyl.call(metal, m4(P0.x, y - hh / 2 - 0.09, P0.z), rr + 0.06, rr + 0.1, 0.09, 16, [1, 1, 1], true);
    };
    bandAt(0.36, 1.9);
    bandAt(0.64, 1.7);

    /* ---- 门：朝岸（+Z），带门套、雨棚、台阶、门灯 ---- */
    const dY = baseY + 0.5;
    const dZ = P0.z + 2.48;
    const dn = st.pen("w.lhDoorDark", null, { tint: [0.05, 0.05, 0.06] });
    dn.quad.call(dn, m4(P0.x, dY + 1.0, dZ + 0.02), 1.1, 1.92, [1, 1, 1], [0, 0, 1, 1]);
    door.quad.call(door, m4(P0.x, dY + 0.94, dZ + 0.05), 0.98, 1.72, [1, 1, 1], [0, 0, 1, 1]);
    for (const yy of [dY + 0.42, dY + 1.36]) {
      metal.box.call(metal, m4(P0.x, yy, dZ + 0.08), 0.9, 0.05, 0.025, [1, 1, 1], 1.0);
    }
    metal.sphere.call(metal, m4(P0.x + 0.34, dY + 0.92, dZ + 0.11), 0.055, 7, 5, [1, 1, 1]);
    // 门套
    for (const sx of [-1, 1]) {
      stone.box.call(stone, m4(P0.x + sx * 0.66, dY + 1.0, dZ + 0.02), 0.24, 2.1, 0.26, [1, 1, 1], 0.8);
    }
    stone.box.call(stone, m4(P0.x, dY + 2.08, dZ + 0.02), 1.52, 0.22, 0.3, [1, 1, 1], 0.8);
    stone.cyl.call(stone, m4(P0.x, dY + 2.2, dZ + 0.02), 0.76, 0.76, 0.22, 12, [1, 1, 1], true);
    // 门灯
    metal.box.call(metal, m4(P0.x, dY + 2.42, dZ + 0.3), 0.16, 0.2, 0.16, [1, 1, 1], 1.0);
    glow.quad.call(glow, m4(P0.x, dY + 2.3, dZ + 0.36), 1.4, 1.4, [1, 1, 1], [0, 0, 1, 1]);

    /* ---- 塔身小窗：螺旋上升，朝不同方向 ---- */
    for (let k = 0; k < 5; k++) {
      const t = 0.16 + k * 0.15;
      const y = baseY + (H - baseY) * t;
      const rr = 2.6 + (1.66 - 2.6) * t + 0.02;
      const a = 0.35 + k * 1.25;
      const wx = P0.x + Math.cos(a) * rr, wz = P0.z + Math.sin(a) * rr;
      const ry = Math.atan2(Math.cos(a), Math.sin(a));
      const lit = k % 2 === 0;
      winGlass.quad.call(winGlass, m4(wx, y, wz, 0, ry, 0), 0.34, 0.54, [1, 1, 1], [0, 0, 1, 1]);
      stone.box.call(stone, m4(wx, y - 0.32, wz, 0, ry, 0), 0.5, 0.08, 0.14, [1, 1, 1], 1.0);
      if (lit) glow.quad.call(glow, m4(wx + Math.sin(ry) * 0.03, y, wz + Math.cos(ry) * 0.03, 0, ry, 0),
        1.1, 1.3, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ---- 观景台 + 栏杆 ---- */
    metal.cyl.call(metal, m4(P0.x, H, P0.z), 2.55, 2.55, 0.22, 18, [1, 1, 1], true);
    metal.cyl.call(metal, m4(P0.x, H + 0.22, P0.z), 2.25, 2.2, 0.12, 18, [1, 1, 1], true);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      metal.box.call(metal, m4(P0.x + Math.cos(a) * 2.36, H + 0.75, P0.z + Math.sin(a) * 2.36, 0, -a, 0),
        0.05, 1.05, 0.05, [1, 1, 1], 1.0);
    }
    for (const yy of [H + 0.72, H + 1.24]) {
      metal.torus.call(metal, m4(P0.x, yy, P0.z), 2.36, 0.035, 24, 4, [1, 1, 1]);
    }

    /* ---- 灯室：玻璃笼 + 竖棂 + 穹顶 + 通风球 + 避雷针 ---- */
    const LY = H + 0.34;
    lampGlass.cyl.call(lampGlass, m4(P0.x, LY, P0.z), 1.5, 1.5, 1.5, 12, [1, 1, 1], false);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      metal.box.call(metal, m4(P0.x + Math.cos(a) * 1.52, LY + 0.75, P0.z + Math.sin(a) * 1.52, 0, -a, 0),
        0.05, 1.54, 0.05, [1, 1, 1], 1.0);
    }
    for (const yy of [LY + 0.15, LY + 0.75, LY + 1.38]) {
      metal.torus.call(metal, m4(P0.x, yy, P0.z), 1.53, 0.03, 20, 4, [1, 1, 1]);
    }
    metal.cyl.call(metal, m4(P0.x, LY + 1.52, P0.z), 1.78, 0.3, 1.35, 12, [1, 1, 1], true);
    metal.cyl.call(metal, m4(P0.x, LY + 2.87, P0.z), 0.3, 0.22, 0.2, 10, [1, 1, 1], true);
    metal.sphere.call(metal, m4(P0.x, LY + 3.16, P0.z), 0.2, 8, 6, [1, 1, 1]);
    metal.cyl.call(metal, m4(P0.x, LY + 3.3, P0.z), 0.02, 0.012, 0.7, 4, [1, 1, 1], true);
    // 灯芯：一颗亮点 + 光柱
    const core = st.pen("w.lhCore", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.92, 0.6], opacity: 0.9 });
    core.sphere.call(core, m4(P0.x, LY + 0.78, P0.z), 0.26, 10, 7, [1, 1, 1]);
    const halo = st.pen("w.lhHalo", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.85, 0.5], opacity: 0.55 });
    halo.quad.call(halo, m4(P0.x, LY + 0.78, P0.z + 1.6), 10, 10, [1, 1, 1], [0, 0, 1, 1]);
    halo.quad.call(halo, m4(P0.x, LY + 0.78, P0.z + 1.6), 34, 34, [1, 1, 1], [0, 0, 1, 1]);

    /* ---- 守塔人小屋：靠岸一侧，木门 + 暖窗 + 烟囱 + 木栅栏 ---- */
    const sx = SHEDX, sz = SHEDZ;
    const gy = groundH(sx, sz);
    const shed = st.pen("w.lhShed", T.plasterPale(), { tint: [0.86, 0.82, 0.74], spec: 0.08 });
    const shedRoof = st.pen("w.lhShedRoof", WTex.slate(), { tint: [1.0, 1.02, 1.06], spec: 0.16 });
    // 先垫一块石台，免得礁石从地板里穿出来
    stone.box.call(stone, m4(sx, gy - 0.06, sz), 3.0, 0.2, 2.7, [1, 1, 1], 0.8);
    shed.box.call(shed, m4(sx, gy + 1.05, sz), 2.4, 2.1, 2.1, [1, 1, 1], 0.5);
    gableRoof(shedRoof, m4(sx, gy + 2.1, sz), 2.9, 2.7, 1.0, [1, 1, 1], 0.55);
    stone.cyl.call(stone, m4(sx + 0.7, gy + 2.5, sz - 0.4), 0.16, 0.13, 1.1, 6, [1, 1, 1], true);
    // 窗
    winGlass.quad.call(winGlass, m4(sx - 0.2, gy + 1.1, sz + 1.07, 0, 0, 0), 0.6, 0.58, [1, 1, 1], [0, 0, 1, 1]);
    metal.box.call(metal, m4(sx - 0.2, gy + 1.1, sz + 1.04), 0.72, 0.68, 0.05, [1, 1, 1], 1.0);
    stone.box.call(stone, m4(sx - 0.2, gy + 0.75, sz + 1.08), 0.78, 0.08, 0.18, [1, 1, 1], 1.0);
    glow.quad.call(glow, m4(sx - 0.2, gy + 1.1, sz + 1.16), 2.0, 2.2, [1, 1, 1], [0, 0, 1, 1]);
    // 门
    door.quad.call(door, m4(sx + 0.85, gy + 0.9, sz + 1.06), 0.62, 1.7, [1, 1, 1], [0, 0, 1, 1]);
    // 招牌
    const signTex = A3DTex.sign({
      text: "BAY LIGHT", w: 384, h: 96, bg: "#241d14", fg: "#ffe2b0", size: 46,
      border: "#7a5c33", borderW: 5, glow: "rgba(255,200,120,.35)", glowBlur: 8
    });
    const signP = st.pen("w.lhSign", signTex, { unlit: true, tint: [1, 1, 1] });
    signP.quad.call(signP, m4(sx, gy + 1.9, sz + 1.09), 1.5, 0.38, [1, 1, 1], [0, 0, 1, 1]);
    // 小屋前的石板 + 木栅栏
    for (let i = 0; i < 6; i++) {
      stone.box.call(stone, m4(sx - 1.6 + i * 0.62, groundH(sx - 1.6 + i * 0.62, sz + 1.6) + 0.03,
        sz + 1.6, 0, 0.1 * i, 0), 0.58, 0.06, 0.5, [1, 1, 1], 0.8);
    }
    const fence = st.pen("w.lhFence", T.woodDark(), { tint: [0.9, 0.76, 0.6], spec: 0.08 });
    for (let i = 0; i < 5; i++) {
      const fx = sx - 2.6 + i * 1.3;
      fence.cyl.call(fence, m4(fx, groundH(fx, sz + 2.6), sz + 2.6), 0.06, 0.045, 0.9, 5, [1, 1, 1], true);
      if (i > 0) {
        const px = fx - 1.3, py = groundH(px, sz + 2.6);
        fence.box.call(fence, m4((fx + px) / 2, (py + groundH(fx, sz + 2.6)) / 2 + 0.55, sz + 2.6,
          0, 0, 0), 1.3, 0.05, 0.05, [1, 1, 1], 1.2);
      }
    }

    /* ---- 旋转光束：水平扇 + 竖直扇交叉 ---- */
    const beam = st.glow("w.lhBeam", T.shaft(), {
      unlit: true, blend: "add", tint: [1.0, 0.88, 0.55], opacity: 0.12,
      matrix: t => m4(P0.x, H + 0.9, P0.z, 0, t * 0.22, 0)
    });
    beam.tri.call(beam, M.ident(), [0, 0, 0], [6, 0, 44], [-6, 0, 44], null, [1, 1, 1]);
    beam.tri.call(beam, M.ident(), [0, 0, 0], [-6, 0, 44], [6, 0, 44], null, [1, 1, 1]);
    beam.tri.call(beam, M.ident(), [0, 0, 0], [0, 3.2, 46], [0, -2.4, 46], null, [1, 1, 1]);
    beam.tri.call(beam, M.ident(), [0, 0, 0], [0, -2.4, 46], [0, 3.2, 46], null, [1, 1, 1]);
  }

  /* ============================================================
   *  湾里的船：给远景一点生气
   * ============================================================ */
  function buildBoats(st) {
    const hull = st.pen("w.boatHull", T.darkMetal(), { tint: [0.16, 0.18, 0.22], spec: 0.3 });
    const cabin = st.pen("w.boatCabin", T.fabric(), { tint: [0.35, 0.38, 0.44], spec: 0.1 });
    const lamp = st.pen("w.boatLamp", null, { unlit: true, blend: "add", tint: [1.0, 0.8, 0.45] });
    const r = rng(97);
    const spots = [[-34, -168], [18, -196], [92, -178], [140, -210], [-70, -152]];
    spots.forEach(([x, z], i) => {
      const s = 0.8 + r() * 0.8;
      hull.box.call(hull, m4(x, L.waterY + 0.5 * s, z, 0, r() * TAU, 0), 3.2 * s, 0.9 * s, 1.4 * s, [1, 1, 1], 1.4);
      cabin.box.call(cabin, m4(x, L.waterY + 1.1 * s, z), 1.3 * s, 0.9 * s, 1.0 * s, [1, 1, 1], 1.2);
      hull.cyl.call(hull, m4(x, L.waterY + 1.5 * s, z), 0.06, 0.05, 2.6 * s, 4, [1, 1, 1], true);
      if (i % 2 === 0) {
        lamp.quad.call(lamp, m4(x, L.waterY + 4.3 * s, z), 1.3, 1.3, [1, 1, 1], [0, 0, 1, 1]);
      }
    });

    // 停在港口外面的一艘货轮：远景里给城市一个尺度参照
    const SX = -6, SZ = -262;
    hull.box.call(hull, m4(SX, L.waterY + 2.2, SZ), 46, 4.6, 9, [1, 1, 1], 2.2);
    hull.box.call(hull, m4(SX - 20, L.waterY + 2.8, SZ), 8, 5.6, 8, [1, 1, 1], 2.2);
    cabin.box.call(cabin, m4(SX - 16.5, L.waterY + 6.4, SZ), 7, 5.2, 7, [1, 1, 1], 2);
    hull.cyl.call(hull, m4(SX + 8, L.waterY + 4.4, SZ), 0.8, 0.6, 8, 6, [1, 1, 1], true);
    for (let i = 0; i < 4; i++) {
      hull.box.call(hull, m4(SX - 4 + i * 9, L.waterY + 5.1, SZ, 0, 0, 0), 6, 1.2, 6.5, [0.7, 0.72, 0.72], 1.8);
    }
    const shipLights = st.pen("w.shipLights", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.78, 0.4], opacity: 0.5 });
    for (let i = 0; i < 7; i++) {
      shipLights.quad.call(shipLights, m4(SX - 18 + i * 6, L.waterY + 8.2, SZ + 1), 0.8, 0.8, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 湾里的航标：一闪一闪的红绿灯
    const buoys = st.pen("w.buoy", T.metal(), { tint: [0.35, 0.36, 0.4], spec: 0.3 });
    for (const [bx, bz] of [[-96, -150], [-40, -205], [58, -230], [150, -196]]) {
      buoys.cyl.call(buoys, m4(bx, L.waterY, bz), 0.5, 0.32, 1.6, 7, [1, 1, 1], true);
      lamp.quad.call(lamp, m4(bx, L.waterY + 2.1, bz), 1.1, 1.1, [1, 1, 1], [0, 0, 1, 1]);
    }
  }

  /* ============================================================
   *  天空 / 月亮 / 星
   * ============================================================ */
  function buildSkyProps(st) {
    const moonB = st.pen("w.moonDisc", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.97, 0.9], opacity: 0.92 });
    moonB.quad.call(moonB, m4(L.moon.x, L.moon.y, L.moon.z), 13, 13, [1, 1, 1], [0, 0, 1, 1]);
    const halo = st.pen("w.moonHalo", T.glow(), { unlit: true, blend: "add", tint: [0.6, 0.72, 0.95], opacity: 0.16 });
    halo.quad.call(halo, m4(L.moon.x, L.moon.y, L.moon.z), 70, 70, [1, 1, 1], [0, 0, 1, 1]);

    /* 夜空不再撒星星：点精灵在 1~3px 时会被钳成小方块，
     * 近看像坏点、远看像脏噪点。夜空只留月亮和城市灯火，
     * 星星要加也应该做成大体量的 glow 面片而不是 point sprite。 */

    // 山间的萤火虫
    const pts = [];
    const r = rng(37);
    for (let i = 0; i < 110; i++) {
      const x = L.ridge.x0 + (r() - 0.5) * 150;
      const z = 2 + HILL_SHIFT + r() * 44;
      const y = groundH(x, z) + 0.6 + r() * 4.5;
      pts.push({
        x, y, z, r: 0.75, g: 1.0, b: 0.45, a: 0.35 + r() * 0.5,
        size: 0.025 + r() * 0.02, kind: 2, speed: 0.06 + r() * 0.1, phase: r() * TAU, wob: 0.6 + r() * 0.8
      });
    }
    // 海面上的点点月光碎屑
    for (let i = 0; i < 70; i++) {
      const x = -120 + r() * 300;
      const z = -120 - r() * 110;
      pts.push({
        x, y: L.waterY + 0.1, z, r: 0.7, g: 0.8, b: 1.0, a: 0.18 + r() * 0.25,
        size: 0.02 + r() * 0.03, kind: 0, phase: r() * 10, wob: 0
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "add", yMin: -2, yMax: 40, fogNear: 40, fogFar: 260 });
  }

  /* ============================================================
   *  分区工具：把局部坐标搬到世界坐标
   *
   *  关键点：不能只包装 pen 的 box/quad 方法——道具库（props.js）里有一批函数
   *  是 `G.box.call(b, m, …)` 直接调 Builder 原型的，会绕过包装。
   *  所以这里覆盖 Builder 的私有落点 `_v`：所有几何方法最后都汇到它，
   *  在里面把「局部世界坐标」再乘一次 D，才是最稳的一层。
   * ============================================================ */
  const IDENT4 = M.ident();
  const IDENT9 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  function localBuilder(raw, D) {
    if (!D) return raw;
    const Dn = M.normalMat(D);
    const out = Object.create(raw);
    /* 道具库里有些函数要直接拿 Builder 原型方法（G.box.call(b, …)），
     * 那些调用会把矩阵原样用，所以分区要能拿到 `.raw` 自己先乘好 D。 */
    out.raw = raw;
    out._v = function (d, m, nm, x, y, z, nx, ny, nz, u, v, col, sway) {
      /* 这里的 (x,y,z) 是**物体局部**坐标，m/nm 是物体自己的模型矩阵。
       * 顺序不能反：先按 m 摆到分区坐标，再乘 D 搬到世界坐标。
       * （之前漏了第一步，所有带位移的物件都塌到分区原点，远看只剩几条线。） */
      const lx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const ly = m[1] * x + m[5] * y + m[9] * z + m[13];
      const lz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const wx = D[0] * lx + D[4] * ly + D[8] * lz + D[12];
      const wy = D[1] * lx + D[5] * ly + D[9] * lz + D[13];
      const wz = D[2] * lx + D[6] * ly + D[10] * lz + D[14];
      let tx = nm[0] * nx + nm[3] * ny + nm[6] * nz;
      let ty = nm[1] * nx + nm[4] * ny + nm[7] * nz;
      let tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
      const tnx = Dn[0] * tx + Dn[3] * ty + Dn[6] * tz;
      const tny = Dn[1] * tx + Dn[4] * ty + Dn[7] * tz;
      const tnz = Dn[2] * tx + Dn[5] * ty + Dn[8] * tz;
      raw._v(d, IDENT4, IDENT9, wx, wy, wz, tnx, tny, tnz, u, v, col, sway);
    };
    return out;
  }
  function penAt(st, D, key, tex, opts) {
    return localBuilder(st.pen(key, tex, opts), D);
  }
  /** 会动的物件：几何体是局部坐标，D 乘进 model 矩阵（道具函数可以直接用返回的 Builder） */
  function dynoAt(st, D, tex, opts, matrixFn) {
    return st.dyno(tex, opts, t => M.mul(D, matrixFn ? matrixFn(t) : M.ident()));
  }
  function glowAt(st, D, key, tex, opts) {
    return localBuilder(st.glow(key, tex, opts), D);
  }
  /** 点精灵：位置也要搬到世界坐标 */
  function addPoints(st, D, list, opts) {
    const out = [];
    for (const p of list) {
      const q = M.xf(D, [p.x || 0, p.y || 0, p.z || 0]);
      out.push(Object.assign({}, p, { x: q[0], y: q[1], z: q[2] }));
    }
    st.points.push(Object.assign({ mesh: A3D.pointMesh(out) }, opts || {}));
  }

  /** 按弧长在折线上取点（路灯 / 路牌 / 栅栏对齐用） */
  function samplePath(pts, u) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a, b, len });
      total += len;
    }
    let d = clamp(u, 0, 1) * total;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (d <= s.len || i === segs.length - 1) {
        const t = s.len > 0 ? clamp(d / s.len, 0, 1) : 0;
        return {
          x: s.a[0] + (s.b[0] - s.a[0]) * t,
          z: s.a[1] + (s.b[1] - s.a[1]) * t,
          ry: Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1])
        };
      }
      d -= s.len;
    }
    return { x: pts[0][0], z: pts[0][1], ry: 0 };
  }

  /** 分区的局部 → 世界矩阵（分区子文件用它来摆局部坐标） */
  function frameOf(part) {
    return m4(part.x, 0, part.z, 0, part.rot || 0, 0);
  }


  /* ============================================================
   *  大世界的招牌：从山上看下去时，街区需要一块能认出来的地标
   * ============================================================ */
  function buildLandmarks(st) {
    const frames = st.pen("w.lmFrame", T.darkMetal(), { tint: [0.22, 0.23, 0.27], spec: 0.3 });
    const glowB = st.pen("w.lmGlow", T.glow(), { unlit: true, blend: "add", tint: [0.4, 0.7, 1.0], opacity: 0.18 });

    // GitHub 街口楼顶的霓虹：正对主标题镜头
    const ghTex = A3DTex.sign({
      text: "GITHUB", w: 768, h: 220, bg: "#0a0d12", fg: "#e6edf3", size: 108,
      border: "#30363d", borderW: 6, glow: "rgba(130,205,255,.45)", glowBlur: 24
    });
    const ghSign = st.pen("w.lmGithub", ghTex, { unlit: true, tint: [0.95, 0.97, 1.0] });
    /* 街横过来以后，街口的楼在局部 (5.2, 2.2) → 世界 (x+2.2, z−5.2)，招牌仍朝 +Z（主标题镜头） */
    const gsx = L.github.x + 2.2, gsz = L.github.z - 5.2;
    ghSign.quad.call(ghSign, m4(gsx, 9.6, gsz + 0.2), 7.6, 2.2, [1, 1, 1], [0, 0, 1, 1]);
    glowB.quad.call(glowB, m4(gsx, 9.6, gsz + 0.6), 11, 4.6, [1, 1, 1], [0, 0, 1, 1]);
    frames.box.call(frames, m4(gsx, 9.6, gsz), 8.0, 2.5, 0.2, [1, 1, 1], 2);

    /* HF 营地入口原来有一块 HUGGING FACE 招牌，已经连拱门一起拆掉了 */

    /* 从山上看下去时，街区里那些灯笼/串灯会糊成一团暖光。
     * 这里补几片很淡的加法光池，让远处能读出「那里有人在过日子」。 */
    const poolWarm = st.pen("w.poolWarm", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.66, 0.3], opacity: 0.10 });
    for (let i = 0; i < 6; i++) {
      poolWarm.quad.call(poolWarm, m4(L.github.x - 4 - i * 6.4, 3.4, L.github.z), 9, 11, [1, 1, 1], [0, 0, 1, 1]);
    }
    for (const [dx, dz, s] of [[14, 6, 12], [4, 16, 10], [22, 20, 9]]) {
      poolWarm.quad.call(poolWarm, m4(L.hf.x + dx, 2.6, L.hf.z + dz), s, s * 0.8, [1, 1, 1], [0, 0, 1, 1]);
    }
    const poolGreen = st.pen("w.poolGreen", T.glow(), { unlit: true, blend: "add", tint: [0.6, 0.9, 0.32], opacity: 0.08 });
    poolGreen.quad.call(poolGreen, m4(L.shit.x - 10, 4.5, L.shit.z), 16, 12, [1, 1, 1], [0, 0, 1, 1]);
  }

  /* ============================================================
   *  组装世界
   * ============================================================ */
  let WORLD = null;
  function buildWorld() {
    const st = P.stage();
    buildGround(st);
    buildHill(st);
    buildPlain(st);
    buildChurch(st);
    buildCity(st);
    buildLighthouse(st);
    buildBoats(st);
    buildSkyProps(st);
    buildLandmarks(st);

    /* 分区：各自单独一支笔，写在自己的文件里；没加载就跳过 */
    const parts = [
      { name: "github", part: L.github, mod: typeof A3DWorldGithub !== "undefined" ? A3DWorldGithub : null, seed: 53 },
      { name: "hf", part: L.hf, mod: typeof A3DWorldHf !== "undefined" ? A3DWorldHf : null, seed: 37 },
      { name: "shit", part: L.shit, mod: typeof A3DWorldShit !== "undefined" ? A3DWorldShit : null, seed: 97 }
    ];
    for (const p of parts) {
      if (!p.mod || !p.mod.build) continue;
      const D = frameOf(p.part);
      try {
        p.mod.build({
          st, D, part: p.part, L,
          W: api,
          r: rng(p.seed),
          frameOf
        });
      } catch (e) {
        console.error("[A3DWorld] 分区构建失败：" + p.name, e);
      }
    }

    st.finish();
    st.finishGlows();
    return {
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows
    };
  }
  function world() {
    if (!WORLD) WORLD = buildWorld();
    return WORLD;
  }

  /* ============================================================
   *  教堂正门前：claude_door / claude_door_403 的实景机位
   *
   *  门场景不再是单独的小盒子，而是站在这座大世界教堂的台阶前，
   *  背后是前院、石墙和铁栅栏，抬头能看到玫瑰窗和钟楼。
   * ============================================================ */
  function churchDoorCam() {
    const B0 = churchBase();
    const e = M.xf(B0.D, [0.35, 0, CHURCH.hl + 9.4]);
    const t = M.xf(B0.D, [0, 0, CHURCH.hl]);
    return {
      eye: [e[0], groundH(e[0], e[2]) + 1.62, e[2]],
      target: [t[0], t[1] + B0.PT + 2.85, t[2]],
      fov: 52, far: 140
    };
  }
  /** 门头两盏提灯 + 门前一点环境光（世界坐标） */
  function churchDoorLights() {
    const B0 = churchBase();
    const at = (lx, ly, lz) => M.xf(B0.D, [lx, ly, lz]);
    return [
      { pos: at(-2.55, B0.PT + 3.02, CHURCH.hl + 0.5), col: [1.0, 0.72, 0.4], range: 7.5, inten: 1.4 },
      { pos: at(2.55, B0.PT + 3.02, CHURCH.hl + 0.5), col: [1.0, 0.72, 0.4], range: 7.5, inten: 1.4 },
      { pos: at(0, B0.PT + 1.7, CHURCH.hl + 2.4), col: [0.66, 0.7, 0.72], range: 13, inten: 0.5 }
    ];
  }
  /* 403 的额外几何：门上的大红字、红光和门缝漏出的红。只在 403 视角拼进场景。 */
  let DOOR403 = null;
  function door403() {
    if (DOOR403) return DOOR403;
    const B0 = churchBase();
    const st = P.stage();
    const r = rng(3);
    const cv = A3DTex.cv(768, 512);
    const x = A3DTex.ctxOf(cv);
    x.clearRect(0, 0, cv.width, cv.height);
    x.font = "bold 300px 'Noto Sans SC','Microsoft YaHei',sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = "#ff4a3d";
    x.shadowColor = "#ff2a1a"; x.shadowBlur = 40;
    x.fillText("4", 190, 260);
    x.fillText("3", 578, 260);
    x.lineWidth = 46;
    x.strokeStyle = "#ff4a3d";
    x.shadowBlur = 60;
    x.beginPath(); x.ellipse(384, 260, 96, 142, 0, 0, TAU); x.stroke();
    x.shadowBlur = 0; x.strokeStyle = "rgba(255,120,100,.35)"; x.lineWidth = 3;
    for (let i = 0; i < 30; i++) {
      const a = r() * TAU, len = 20 + r() * 60;
      x.beginPath();
      x.moveTo(384 + Math.cos(a) * 110, 260 + Math.sin(a) * 155);
      x.lineTo(384 + Math.cos(a) * (110 + len), 260 + Math.sin(a) * (155 + len));
      x.stroke();
    }
    const tex403 = A3D.texFromCanvas(cv, { clamp: true });
    const signB = st.pen("w.door403sign", tex403, { unlit: true, blend: "add", tint: [1, 1, 1], opacity: 0.95 });
    signB.quad.call(signB, M.mul(B0.D, m4(0, B0.PT + 1.9, CHURCH.hl + 0.34)), 3.8, 2.55, [1, 1, 1], [0, 0, 1, 1]);
    const redGlow = st.pen("w.door403glow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.16, 0.12], opacity: 0.32 });
    redGlow.quad.call(redGlow, M.mul(B0.D, m4(0, B0.PT + 1.9, CHURCH.hl + 0.5)), 7.4, 5.6, [1, 1, 1], [0, 0, 1, 1]);
    const seam = st.pen("w.door403seam", null, { unlit: true, blend: "add", tint: [1.0, 0.15, 0.1], opacity: 0.5 });
    seam.box.call(seam, M.mul(B0.D, m4(0, B0.PT + 1.4, CHURCH.hl + 0.06)), 0.04, 2.8, 0.02, [1, 1, 1], 1);
    st.finish();
    st.finishGlows();
    DOOR403 = { batches: st.batches, over: st.over, glows: st.glows };
    return DOOR403;
  }

  /* ============================================================
   *  视角
   * ============================================================ */
  const VIEWS = {

    /* 视角 0：教堂正门前 —— claude_door 的实景（白天阴天） */
    world_church: {
      cam: null,
      sky: {
        mode: 0, top: [0.36, 0.44, 0.5], bot: [0.66, 0.7, 0.66],
        glow: [0.8, 0.78, 0.68], sun: [0.34, 0.8], horizon: 0.6
      },
      lights: {
        sun: A3D.norm3([-0.42, 0.72, 0.55]), sunCol: [0.8, 0.79, 0.74],
        skyCol: [0.4, 0.45, 0.5], groundCol: [0.17, 0.16, 0.14],
        fog: { col: [0.22, 0.25, 0.26], near: 18, far: 130 }, fogAmt: 0.3,
        points: []
      },
      tone: [0.92, 0.96, 0.94],
      swayAmp: 0.5
    },

    /* 视角 0b：同一扇门被 403 封住（门上的大红字由 door403() 单独拼进来） */
    world_church_403: {
      cam: null,
      sky: {
        mode: 0, top: [0.1, 0.03, 0.03], bot: [0.16, 0.05, 0.04],
        glow: [0.5, 0.1, 0.08], sun: [0.35, 0.78], horizon: 0.62
      },
      lights: {
        sun: A3D.norm3([-0.35, 0.75, 0.55]), sunCol: [0.22, 0.12, 0.1],
        skyCol: [0.16, 0.08, 0.08], groundCol: [0.1, 0.1, 0.1],
        fog: { col: [0.09, 0.03, 0.03], near: 8, far: 60 }, fogAmt: 0.5,
        points: []
      },
      tone: [0.95, 0.66, 0.62],
      swayAmp: 0.5
    },

    /* 视角 1：主标题 —— 主人调好的长焦机位和灯光（直接照抄调参面板） */
    world_title: {
      cam: L.titleCam,
      sky: {
        mode: 2, top: [0.006, 0.012, 0.032], bot: [0.06, 0.082, 0.122],
        glow: [0.34, 0.42, 0.58], sun: [0.342, 1.173, 0], horizon: 0.747
      },
      lights: {
        sun: A3D.norm3([-0.28, 0.2, -0.939]), sunCol: [0.11, 0.118, 0.145],
        skyCol: [0.148, 0.172, 0.23], groundCol: [0, 0, 0],
        fog: { col: [0.06, 0.082, 0.122], near: 160, far: 820 }, fogAmt: 0.95,
        points: [
          /* 1 教堂门口 */ { pos: [19.6, 34.6, 103.2], col: [1.0, 0.68, 0.42], inten: 0.5, range: 66 },
          /* 2 城市 */ { pos: [100, 12, -94], col: [1.0, 0.62, 0.32], inten: 0.3, range: 150 },
          /* 3 灯塔 */ { pos: [-33, 21.513, -104.5], col: [1.0, 0.85, 0.55], inten: 3, range: 90 },
          /* 4 GitHub 街口 */ { pos: [-4, 7, -70], col: [1.0, 0.6, 0.3], inten: 3, range: 46 },
          /* 5/6 HF 营地两头 */ { pos: [-96.5, 4, -85], col: [1.0, 0.62, 0.3], inten: 3, range: 34 },
          { pos: [-43.5, 4, -84.6], col: [1.0, 0.62, 0.3], inten: 0.69, range: 34 },
          /* 7 街口广场 */ { pos: [30.5, 4.2, -71.5], col: [1.0, 0.68, 0.38], inten: 3, range: 30 },
          /* 8 教堂东墙补光（原教堂路那盏关着的，借来照亮主标题里的教堂侧墙） */ { pos: [30, 36, 96], col: [1.0, 0.7, 0.42], inten: 0.6, range: 55 },
          /* 9/10 城市南侧新加的补光：让主标题里那片楼不至于黑成剪影 */
          { pos: [55, 18, -56], col: [1.0, 0.66, 0.36], inten: 3, range: 90 },
          { pos: [115, 20, -56], col: [1.0, 0.64, 0.34], inten: 3, range: 90 }
        ]
      },
      tone: [1.02, 1.06, 1.12],
      swayAmp: 0.8
      /* 固定长焦机位：不再做原来自动的 eye 漂移（会覆盖主人给的 cam） */
    },

    /* 视角 2：GitHub 夜市街 —— 从街口往西看，左右两边是摊位，尽头是屎山 */
    world_github: {
      cam: { eye: [L.github.x + 4, 1.68, L.github.z], target: [L.github.x - 40, 1.5, L.github.z], fov: 50, far: 120 },
      sky: {
        mode: 2, top: [0.012, 0.016, 0.03], bot: [0.07, 0.07, 0.1],
        glow: [0.34, 0.26, 0.3], sun: [0.5, 0.88, 0], horizon: 0.55
      },
      lights: {
        sun: A3D.norm3([-0.2, 0.8, 0.5]), sunCol: [0.28, 0.3, 0.44],
        skyCol: [0.22, 0.24, 0.32], groundCol: [0.12, 0.1, 0.1],
        fog: { col: [0.06, 0.07, 0.1], near: 10, far: 42 }, fogAmt: 0.55,
        /* 局部 (lx, lz) → 世界 (x + lz, z − lx) */
        points: [
          { pos: [L.github.x - 2, 1.6, L.github.z + 3.2], col: [1.0, 0.62, 0.32], range: 11, inten: 2.2 },
          { pos: [L.github.x - 9, 1.6, L.github.z - 3.2], col: [0.95, 0.66, 0.42], range: 11, inten: 2.0 },
          { pos: [L.github.x - 17, 1.6, L.github.z + 3.2], col: [1.0, 0.62, 0.32], range: 11, inten: 2.0 },
          { pos: [L.github.x - 25, 1.6, L.github.z - 3.2], col: [0.8, 0.82, 1.0], range: 11, inten: 1.8 },
          { pos: [L.github.x - 6, 3.4, L.github.z], col: [0.4, 0.45, 0.6], range: 16, inten: 0.9 },
          { pos: [L.github.x - 36, 5.2, L.github.z], col: [0.35, 0.65, 1.0], range: 18, inten: 0.9 }
        ]
      },
      tone: [1.0, 0.88, 0.78],
      swayAmp: 0.45,
      update(t, sc) {
        sc.cam.eye = [L.github.x + 4 + Math.cos(t * 0.1) * 0.08, 1.68 + Math.sin(t * 0.21) * 0.014, L.github.z + Math.sin(t * 0.13) * 0.08];
      }
    },

    /* 视角 3：Hugging Face 营地 —— 从海滩斜望向岸边，左边是帐篷和小摊 */
    world_hf: {
      /* 固定机位：主人调好的构图，别再加漂移 */
      cam: { eye: [-38.9, 1.7, -87.9], target: [-136.1, 5.1, -111.0], fov: 40, far: 160 },
      sky: {
        mode: 2, top: [0.012, 0.022, 0.052], bot: [0.06, 0.09, 0.14],
        glow: [0.28, 0.37, 0.5], sun: [0.82, 0.82, 0], horizon: 0.4
      },
      lights: {
        /* 环境光全部压掉，只靠下面这些点光照明（主人调过的数值） */
        sun: [0.302, 0.664, -0.684], sunCol: [0.06, 0.07, 0.096],
        skyCol: [0, 0, 0], groundCol: [0, 0, 0],
        fog: { col: [0.06, 0.09, 0.15], near: 12, far: 70 }, fogAmt: 0.7,
        points: [
          { pos: [-59.8, 0.9, -87.0], col: [1.0, 0.52, 0.2], range: 15, inten: 3 },
          { pos: [-55.2, 0.9, -75.4], col: [1.0, 0.55, 0.24], range: 12, inten: 3 },
          { pos: [-71.6, 0.9, -94.2], col: [1.0, 0.52, 0.22], range: 11, inten: 3 },
          { pos: [-56.0, 2.6, -95.6], col: [1.0, 0.8, 0.5], range: 16, inten: 0.72 },
          { pos: [-78.0, 3.2, -121.4], col: [1.0, 0.85, 0.6], range: 14, inten: 3 },
          { pos: [-50.0, 3.4, -88.0], col: [1.0, 0.82, 0.55], range: 20, inten: 0.86 },
          /* 营地两头各补一盏暖光，不然两端只剩自发光，地面和帐篷背光发黑 */
          { pos: [-96.5, 3.0, -85.0], col: [1.0, 0.62, 0.3], range: 17, inten: 3 },
          { pos: [-43.5, 3.0, -84.6], col: [1.0, 0.62, 0.3], range: 17, inten: 2.62 },
          { pos: [-78.5, 2.6, -94.0], col: [1.0, 0.58, 0.28], range: 14, inten: 3 }
        ]
      },
      tone: [1, 1, 1],
      swayAmp: 0.9
    },

    /* 视角 4：屎山 —— 站在街尾，正对着这座山 */
    world_shit: {
      cam: { eye: [L.shit.x + 8, 3.0, L.shit.z + 2], target: [L.shit.x - 12, 4.2, L.shit.z + 1], fov: 56, far: 130 },
      sky: {
        mode: 2, top: [0.028, 0.036, 0.02], bot: [0.085, 0.095, 0.055],
        glow: [0.32, 0.36, 0.16], sun: [0.5, 0.85, 0], horizon: 0.58
      },
      lights: {
        sun: A3D.norm3([-0.3, 0.7, 0.6]), sunCol: [0.4, 0.42, 0.3],
        skyCol: [0.24, 0.26, 0.16], groundCol: [0.14, 0.12, 0.08],
        fog: { col: [0.1, 0.11, 0.06], near: 12, far: 46 }, fogAmt: 0.5,
        /* 局部 (lx, lz) → 世界 (x + lz, z − lx) */
        points: [
          { pos: [L.shit.x - 4.5, 1.2, L.shit.z + 5.5], col: [1.0, 0.55, 0.2], range: 9, inten: 2.0 },
          { pos: [L.shit.x - 4.5, 1.2, L.shit.z - 6.0], col: [1.0, 0.55, 0.2], range: 9, inten: 2.0 },
          { pos: [L.shit.x - 12, 11, L.shit.z], col: [0.7, 0.9, 0.3], range: 14, inten: 1.4 },
          { pos: [L.shit.x - 4.0, 3.0, L.shit.z + 6.95], col: [1.0, 0.85, 0.5], range: 9, inten: 1.6 },
          { pos: [L.shit.x - 6, 2.0, L.shit.z], col: [0.5, 0.6, 0.3], range: 12, inten: 0.8 }
        ]
      },
      tone: [0.95, 1.0, 0.72],
      swayAmp: 0.35,
      update(t, sc) {
        sc.cam.eye = [L.shit.x + 8 + Math.cos(t * 0.09) * 0.08, 3.0 + Math.sin(t * 0.19) * 0.015, L.shit.z + 2 + Math.sin(t * 0.11) * 0.08];
      }
    }
  };
  function sceneFor(id) {
    const v = VIEWS[id];
    const w = world();
    const e = id === "world_church_403" ? door403() : null;
    const cam = v.cam || churchDoorCam();
    const lights = Object.assign({}, v.lights);
    if (!lights.points || !lights.points.length) lights.points = churchDoorLights();
    return {
      cam: { eye: cam.eye.slice(), target: cam.target.slice(), fov: cam.fov, far: cam.far },
      sky: v.sky,
      lights,
      batches: e ? w.batches.concat(e.batches) : w.batches,
      over: e ? w.over.concat(e.over) : w.over,
      dyn: w.dyn,
      points: w.points,
      glows: e ? w.glows.concat(e.glows) : w.glows,
      tone: v.tone,
      swayAmp: v.swayAmp,
      wind: [0.35, 0.12, 0.2],
      /* 视角可以没有 update（固定机位），有才调 */
      update(t, sc) { if (typeof v.update === "function") v.update(t, sc); }
    };
  }

  /* ============================================================
   *  注册：新 id + 老 id 全部指向大世界
   * ============================================================ */
  /* claude_door 迁到教堂门口：剧情里的门 = 大世界教堂的正门 */
  A3D.register("world_church", () => sceneFor("world_church"));
  A3D.register("claude_door", () => sceneFor("world_church"));
  A3D.register("claude_door_403", () => sceneFor("world_church_403"));
  A3D.register("world_title", () => sceneFor("world_title"));
  A3D.register("world_github", () => sceneFor("world_github"));
  A3D.register("world_hf", () => sceneFor("world_hf"));
  A3D.register("world_shit", () => sceneFor("world_shit"));
  // 老 id 保留：剧本、环境音、存档里可能已经写着它们
  A3D.register("github_street", () => sceneFor("world_github"));
  A3D.register("hf_camp", () => sceneFor("world_hf"));
  A3D.register("shit_mountain", () => sceneFor("world_shit"));

  /* ============================================================
   *  对外 API（分区文件用）
   * ============================================================ */
  const api = {
    L, groundH, groundCol, frameOf, localBuilder, penAt, dynoAt, glowAt, addPoints,
    Gbox, gableRoof, pine, stoneWall, winGlow, m4, T, P, M, TAU, HASH
  };
  return api;
})();

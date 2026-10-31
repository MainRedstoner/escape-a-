/* ============================================================
 * Escape A÷ · src/art3d/world.js —— 大世界：一张地图，四个视角
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
 * 四个视角共用同一套几何体（只 build 一次），只是相机 / 天空 / 灯光不同，
 * 所以切视角不会重新上传顶点。分区细节在 world_github.js / world_hf.js /
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
  const L = {
    waterY: -0.5,
    shoreZ: -108,          // 地形在这条线沉进水里
    beachZ: -100,          // 沙滩内缘
    plainZ: -100,          // 平地北界
    // 三个分区（origin 是局部原点，rot 是绕 Y 的朝向）
    github: { x: -18, z: -44, rot: 0 },    // 局部 -Z = 往街里走
    hf:     { x: -70, z: -102, rot: 0 },   // 局部 +Z = 往岸上，-Z = 往海
    shit:   { x: -18, z: -84, rot: 0 },    // 局部 -Z = 屎山
    // 南边的山：一片北面陡然落下去的高台（主标题就站在台边）
    ridge:  { z0: -12, z1: 28, h: 30, x0: 8, wide: 96 },
    knoll:  { x: 14, z: 4, r: 18, h: 14 },
    church: { x: 14, z: 3, rot: 0.22 },
    // 对岸
    farShoreZ: -300,
    city:   { x0: 20, x1: 250, z0: -304, z1: -360, base: 6 },
    lighthouse: { x: 40, z: -286, top: 26 },
    moon: { x: -78, y: 69, z: -230 },
    // 主标题视角
    titleCam: { eye: [2, 32, 30], target: [-2, 4, -190], fov: 42, far: 900 }
  };
  /* 镜头站在台地边上：眼高按地形算，免得地形起伏把镜头埋进去 */
  L.titleCam.eye[1] = groundH(L.titleCam.eye[0], L.titleCam.eye[2]) + 1.75;

  /** 主标题视角下的四个分区在画面里的大致方向（只给调试/注释用） */
  const HASH = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };

  /* ============================================================
   *  地形
   * ============================================================ */
  /** 地面高度：海岸平原 = 0，北边沙滩下沉，南边是高台（北面陡坡） */
  function groundH(x, z) {
    let h = 0;
    // 沙滩：z 从 beachZ 到 shoreZ 从 0 沉到 -1.4
    if (z < L.beachZ) {
      const t = clamp((z - L.shoreZ) / (L.beachZ - L.shoreZ), 0, 1);
      h = -1.4 * (1 - t);
    }
    // 南边高台：z0 以北是平地，z1 以南是 30m 高的台地
    const rise = clamp((z - L.ridge.z0) / (L.ridge.z1 - L.ridge.z0), 0, 1);
    const side = 1 / (1 + Math.pow(Math.abs(x - L.ridge.x0) / L.ridge.wide, 4));
    const wob = 1 + 0.055 * Math.sin(x * 0.06) + 0.035 * Math.sin(x * 0.021 + 1.7);
    h = Math.max(h, L.ridge.h * smooth(rise) * side * wob);
    // 两侧远山，把海湾框起来
    h = Math.max(h, 14 * Math.max(0, 1 - Math.hypot(x + 168, z - 70) / 78));
    h = Math.max(h, 10 * Math.max(0, 1 - Math.hypot(x - 186, z - 86) / 88));
    // 教堂土丘
    const kd = Math.hypot(x - L.knoll.x, z - L.knoll.z);
    if (kd < L.knoll.r) {
      h = Math.max(h, L.knoll.h * Math.pow(1 - (kd / L.knoll.r) * (kd / L.knoll.r), 1.25));
    }
    return h;
  }

  /** 地面颜色：草 / 沙 / 岩 */
  function groundCol(x, z) {
    const h = groundH(x, z);
    const n = HASH(x * 0.31, z * 0.29);
    if (h > 23) {
      const g = 0.72 + n * 0.2;
      return [0.62 * g, 0.66 * g, 0.7 * g];
    }
    if (h < 0.2 || z < L.beachZ) {
      const g = 0.85 + n * 0.3;
      return [1.55 * g, 1.36 * g, 1.05 * g];
    }
    const g = 0.82 + n * 0.36;
    return [g, g * (1.02 + n * 0.1), g * (0.94 + n * 0.08)];
  }

  /** 用三角形铺一张高度场地形（每个格子两个三角形，法线逐面算） */
  function terrainMesh(b, x0, x1, z0, z1, nx, nz, uvScale) {
    const I = M.ident();
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx;
        const za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz;
        const ya = groundH(xa, za), yb = groundH(xb, za), yc = groundH(xb, zb), yd = groundH(xa, zb);
        const A = [xa, ya, za], B = [xb, yb, za], C = [xb, yc, zb], D = [xa, yd, zb];
        const u = p => [p[0] * uvScale, p[2] * uvScale];
        const c = groundCol((xa + xb) / 2, (za + zb) / 2);
        const c2 = [c[0] * (0.94 + HASH(i, j) * 0.12), c[1] * (0.94 + HASH(i + 7, j) * 0.12), c[2] * 0.96];
        b.tri(I, A, C, B, [u(A), u(C), u(B)], c2);
        b.tri(I, A, D, C, [u(A), u(D), u(C)], c2);
      }
    }
  }

  /* ============================================================
   *  通用小构件
   * ============================================================ */
  function Gbox(b, x, y, z, sx, sy, sz, col, uv) {
    b.box.call(b, m4(x, y, z), sx, sy, sz, col, uv === undefined ? 1.1 : uv);
  }
  /** 人字屋顶：脊线沿 Z，屋脊在中心高一格 */
  function gableRoof(b, m, w, d, h, col, uv) {
    const hw = w / 2, hd = d / 2;
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
    const E = [0, h, -hd], F = [0, h, hd];
    const t = (p, q, r) => b.tri.call(b, m, p, q, r, null, col);
    const u = (p, q, r, s) => {
      t(p, q, r); t(p, r, s);
    };
    void uv;
    // 左坡（法线朝左上）与右坡（朝右上）
    u(A, F, E, D);
    u(E, F, C, B);
    // 前后山墙
    t(A, E, B);
    t(D, C, F);
  }
  /** 松树：一根树干 + 三层锥形 */
  function pine(bTrunk, bLeaf, x, z, h, seed, col) {
    const r = rng(seed);
    const y0 = groundH(x, z);
    bTrunk.cyl.call(bTrunk, m4(x, y0, z), 0.16 * h / 6, 0.1 * h / 6, h * 0.42, 5, [1, 1, 1], true);
    const leafCol = col || [0.55, 0.75, 0.6];
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const rad = (1.5 - t * 0.55) * h / 8 * (0.9 + r() * 0.2);
      const yy = y0 + h * (0.3 + t * 0.25);
      bLeaf.cyl.call(bLeaf, m4(x, yy, z, 0, r() * TAU, 0), rad, 0.04, h * 0.3, 7, leafCol, false);
    }
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
   *  地面 / 沙滩 / 海
   * ============================================================ */
  function buildGround(st) {
    const ground = st.pen("w.ground", T.dirt(), { tint: [0.72, 0.9, 0.8], spec: 0.08, rim: 0.22, sway: 0 });
    terrainMesh(ground, -250, 250, -110, 176, 100, 72, 0.12);

    // 沙滩边缘的碎石与草，别让水线是一条数学直线
    const rock = st.pen("w.rock", T.stone(), { tint: [0.42, 0.45, 0.5], spec: 0.18 });
    const r = rng(19);
    for (let i = 0; i < 90; i++) {
      const x = -150 + r() * 300;
      const z = L.shoreZ - 5 + r() * 10;
      const s = 0.25 + r() * 1.1;
      rock.sphere.call(rock, m4(x, groundH(x, z) - 0.1, z, r(), r() * TAU, r(), s, s * 0.5, s * 0.8),
        1, 6, 4, [0.9, 0.92, 0.95]);
    }
    // 岸边的芦苇 / 海草
    const grass = st.pen("w.shoreGrass", T.leaf(), { cutout: true, tint: [0.45, 0.6, 0.42], sway: 1, spec: 0.05 });
    for (let i = 0; i < 34; i++) {
      const x = -140 + r() * 280;
      const z = L.beachZ - 2 + r() * 7;
      P.grass(grass, m4(x, groundH(x, z), z, 0, 0, 0), 4 + Math.floor(r() * 4), 0.35 + r() * 0.5,
        [0.7, 0.95, 0.7], Math.floor(r() * 99), 0.4);
    }

    // 海面：一块巨大的平板，靠雾接到天边
    const sea = st.pen("w.sea", T.causticSoft(), { tint: [0.34, 0.5, 0.7], spec: 1.35, rim: 0.12, uvAnim: t => [t * 0.006, t * 0.0035] });
    const I = M.ident();
    const seaQuad = (cx, cz, w, d, c) => {
      sea.quad.call(sea, m4(cx, L.waterY, cz, -Math.PI / 2, 0, 0), w, d, c, [0, 0, 26, 16]);
    };
    // 近处一格一格里给一点明暗，远处靠雾接到天边
    const sr = rng(71);
    for (let j = 0; j < 20; j++) {
      for (let i = 0; i < 24; i++) {
        const w = 40, d = 40;
        const cx = -480 + i * w + w / 2;
        const cz = -108 - j * d - d / 2;
        const k = 0.82 + sr() * 0.3;
        seaQuad(cx, cz, w, d, [k, k * (0.98 + sr() * 0.05), k * (1.02 + sr() * 0.05)]);
      }
    }
    void I;

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

    // 岸线浪花
    const foam = st.pen("w.foam", T.glow(), { unlit: true, blend: "add", tint: [0.75, 0.85, 1.0], opacity: 0.10 });
    for (let i = 0; i < 14; i++) {
      const x = -160 + i * 24;
      foam.quad.call(foam, m4(x, L.waterY + 0.03, L.shoreZ + 1.5, -Math.PI / 2, 0.06, 0), 22, 2.6,
        [1, 1, 1], [0, 0, 5, 1]);
    }
  }

  /* ============================================================
   *  南边的山：树、小径、栅栏
   * ============================================================ */
  function buildHill(st) {
    const trunk = st.pen("w.trunk", T.woodDark(), { tint: [0.42, 0.34, 0.3] });
    const leaf = st.pen("w.pine", null, { tint: [0.24, 0.36, 0.3], spec: 0.05, rim: 0.15, sway: 1 });
    const r = rng(23);
    // 台上与坡上的松树：镜头两侧各留一片，正前方别挡远景
    for (let i = 0; i < 56; i++) {
      const x = L.ridge.x0 + (r() - 0.5) * 2 * L.ridge.wide * 0.95;
      const z = 6 + r() * 72;
      if (Math.abs(x - 2) < 11 && z > 16 && z < 52) continue;
      pine(trunk, leaf, x, z, 5 + r() * 7, Math.floor(r() * 999), [0.9, 1.1, 0.95]);
    }
    // 坡侧的一排，给画面左下角一点剪影
    for (const [x, z, h] of [[-26, 18, 11], [-34, 8, 9], [-44, 2, 8], [32, 16, 9], [42, 8, 8], [-16, 0, 6], [24, 2, 7]]) {
      pine(trunk, leaf, x, z, h, Math.floor(HASH(x, z) * 999), [1, 1.05, 0.95]);
    }

    // 草：台边和坡上，sway 让风有存在感
    const grass = st.pen("w.hillGrass", T.leaf(), { cutout: true, tint: [0.52, 0.66, 0.46], sway: 1, spec: 0.04 });
    const gr = rng(31);
    for (let i = 0; i < 150; i++) {
      const x = L.ridge.x0 + (gr() - 0.5) * 2 * L.ridge.wide * 0.9;
      const z = 18 + gr() * 46;
      if (Math.abs(x - 2) < 5 && z > 24) continue;
      const y = groundH(x, z);
      P.grass(grass, m4(x, y, z, 0, gr() * TAU, 0), 4 + Math.floor(gr() * 4), 0.3 + gr() * 0.35,
        [0.75, 1.0, 0.8], Math.floor(gr() * 999), 0.3);
    }

    // 从台边下到教堂的石阶小径
    const path = st.pen("w.path", T.stone(), { tint: [0.5, 0.52, 0.55], spec: 0.2 });
    for (let i = 0; i < 34; i++) {
      const t = i / 33;
      const x = 6 + t * 6.5;
      const z = 28 - t * 31;
      const y = groundH(x, z);
      path.quad.call(path, m4(x, y + 0.04, z, -Math.PI / 2, 0.18, 0), 1.7, 1.4, [1, 1, 1], [0, 0, 1.4, 1]);
    }
    // 台边的木栅栏（镜头左右两侧各一段）
    const fence = st.pen("w.fence", T.woodDark(), { tint: [0.55, 0.44, 0.36] });
    for (const [xa, xb] of [[-30, -6], [14, 30]]) {
      for (let i = 0; i <= 12; i++) {
        const x = xa + (xb - xa) * i / 12;
        const z = 29 + Math.sin(i / 12 * Math.PI) * 0.6;
        const y = groundH(x, z);
        fence.cyl.call(fence, m4(x, y, z), 0.07, 0.06, 1.15, 5, [1, 1, 1], true);
        if (i < 12) {
          const nx = xa + (xb - xa) * (i + 1) / 12;
          const dx = (nx - x) / 2;
          fence.box.call(fence, m4(x + dx, y + 0.75, z, 0, 0, 0), Math.abs(nx - x) * 1.1, 0.09, 0.06, [1, 1, 1], 1.4);
          fence.box.call(fence, m4(x + dx, y + 0.38, z, 0, 0, 0), Math.abs(nx - x) * 1.1, 0.08, 0.05, [1, 1, 1], 1.4);
        }
      }
    }
  }

  /* ============================================================
   *  教堂 + 墓园（主标题的近景）
   * ============================================================ */
  function buildChurch(st) {
    const C = L.church;
    const y0 = groundH(C.x, C.z);
    const D = m4(C.x, y0, C.z, 0, C.rot, 0);
    const stone = st.pen("w.church", T.stone(), { tint: [0.62, 0.6, 0.56], spec: 0.1 });
    const dark = st.pen("w.churchDark", T.stone(), { tint: [0.32, 0.32, 0.33], spec: 0.06 });
    const roof = st.pen("w.churchRoof", T.darkMetal(), { tint: [0.26, 0.24, 0.28], spec: 0.28 });
    const warm = st.pen("w.churchWin", null, { unlit: true, tint: [1.0, 0.72, 0.36] });
    const warmGlow = st.pen("w.churchWinGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.6, 0.24], opacity: 0.20 });
    const B = (x, y, z, sx, sy, sz, col) => stone.box.call(stone, M.mul(D, m4(x, y, z)), sx, sy, sz, col || [1, 1, 1], 1.25);

    // 台基
    B(0, 0.2, 0, 11, 0.5, 16, [0.85, 0.85, 0.8]);
    // 中殿
    B(0, 1.55, 0, 7.4, 2.4, 12, [0.95, 0.95, 0.9]);
    // 山墙 + 屋顶
    gableRoof(roof, M.mul(D, m4(0, 2.75, 0)), 8.6, 12.8, 2.6, [1, 1, 1], 1.4);
    // 侧面的扶壁
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        B(sx * 3.9, 1.3, -4.4 + i * 2.9, 0.5, 2.1, 0.9, [0.9, 0.9, 0.86]);
      }
      // 侧窗：两扇高的拱窗（用发光片近似）
      for (let i = 0; i < 3; i++) {
        /* 注意：这里的 y 是**局部**高度，D 已经把台地高度加过一次了；
         * 之前写成 y0 + 2.3，侧窗被抬到塔顶，远看就是一排浮空的黄板子。 */
        const wy = 2.3;
        warm.quad.call(warm, M.mul(D, m4(sx * 3.72, wy, -3.6 + i * 3.6, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0)),
          0.75, 1.5, [1, 1, 1], [0, 0, 1, 1]);
        warmGlow.quad.call(warmGlow, M.mul(D, m4(sx * 3.8, wy, -3.6 + i * 3.6, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0)),
          3.2, 3.6, [1, 1, 1], [0, 0, 1, 1]);
      }
    }
    // 正面的玫瑰窗与门
    warm.quad.call(warm, M.mul(D, m4(0, 2.5, 6.03)), 1.5, 1.5, [1, 1, 1], [0, 0, 1, 1]);
    warmGlow.quad.call(warmGlow, M.mul(D, m4(0, 2.5, 6.1)), 4.4, 4.4, [1, 1, 1], [0, 0, 1, 1]);
    B(0, 1.0, 6.06, 1.7, 2.0, 0.16, [0.22, 0.16, 0.12]);

    // 钟楼：方塔 + 尖顶
    const TX = -4.9, TZ = 0;
    B(TX, 4.0, TZ, 4.4, 7.4, 4.4, [0.98, 0.96, 0.9]);
    B(TX, 7.85, TZ, 5.0, 0.35, 5.0, [0.85, 0.84, 0.8]);   // 檐口
    // 钟室开口（黑）
    for (const [dx, dz, ry] of [[0, 2.24, 0], [0, -2.24, Math.PI], [2.24, 0, Math.PI / 2], [-2.24, 0, -Math.PI / 2]]) {
      B(TX + dx, 6.5, TZ + dz, Math.abs(dz) > 0 ? 1.5 : 0.12, 2.2, Math.abs(dz) > 0 ? 0.12 : 1.5, [0.05, 0.05, 0.06]);
      void ry;
    }
    // 尖顶
    stone.cyl.call(stone, M.mul(D, m4(TX, 8.0, TZ)), 3.1, 0.05, 6.4, 4, [0.92, 0.9, 0.86], false);
    // 塔尖十字
    stone.box.call(stone, M.mul(D, m4(TX, 14.9, TZ)), 0.12, 1.1, 0.12, [0.9, 0.85, 0.6], 1);
    stone.box.call(stone, M.mul(D, m4(TX, 15.1, TZ)), 0.62, 0.12, 0.12, [0.9, 0.85, 0.6], 1);
    // 塔上小窗
    warm.quad.call(warm, M.mul(D, m4(TX, 4.8, TZ + 2.22)), 0.7, 1.3, [1, 1, 1], [0, 0, 1, 1]);
    warmGlow.quad.call(warmGlow, M.mul(D, m4(TX, 4.8, TZ + 2.32)), 2.8, 3.2, [1, 1, 1], [0, 0, 1, 1]);
    warm.quad.call(warm, M.mul(D, m4(TX - 2.22, 4.8, TZ, 0, -Math.PI / 2, 0)), 0.7, 1.3, [1, 1, 1], [0, 0, 1, 1]);

    // 教堂前的石灯
    stone.cyl.call(stone, M.mul(D, m4(2.6, 0, 8.2)), 0.16, 0.13, 1.9, 6, [0.9, 0.88, 0.84], true);
    stone.box.call(stone, M.mul(D, m4(2.6, 2.1, 8.2)), 0.5, 0.55, 0.5, [0.85, 0.83, 0.78], 1.2);
    warm.quad.call(warm, M.mul(D, m4(2.6, 2.1, 8.48)), 0.32, 0.36, [1, 1, 1], [0, 0, 1, 1]);

    // 墓园：矮墙 + 一排排墓碑 + 一棵歪柏树
    const wallY = (x, z) => groundH(x, z);
    for (let i = 0; i < 16; i++) {
      const a = -1.15 + (i / 15) * 2.3;
      const wx = C.x + Math.sin(a) * 13;
      const wz = C.z + Math.cos(a) * 15;
      const y = wallY(wx, wz);
      dark.box.call(dark, m4(wx, y + 0.45, wz, 0, a, 0), 1.75, 1.0, 0.4, [0.7, 0.72, 0.72], 1.5);
    }
    const gr = rng(47);
    for (let i = 0; i < 22; i++) {
      const a = (gr() - 0.5) * 2.2;
      const d = 7 + gr() * 9;
      const gx = C.x + Math.sin(a) * d;
      const gz = C.z + Math.cos(a) * d;
      const gy = groundH(gx, gz);
      if (gy < 4) continue;
      const h = 0.55 + gr() * 0.7;
      const lean = (gr() - 0.5) * 0.25;
      dark.box.call(dark, m4(gx, gy + h / 2, gz, lean, (gr() - 0.5) * 0.5, lean * 0.5), 0.34 + gr() * 0.2, h, 0.14,
        [0.55 + gr() * 0.2, 0.56 + gr() * 0.2, 0.54 + gr() * 0.16], 1.6);
    }
    // 柏树
    const cypress = st.pen("w.cypress", null, { tint: [0.2, 0.3, 0.22], sway: 1, rim: 0.2 });
    for (const [dx, dz, h] of [[8.4, 4.6, 5.2], [-8.2, 5.2, 4.4], [7.4, -5.2, 4.8]]) {
      const x = C.x + dx, z = C.z + dz;
      cypress.cyl.call(cypress, m4(x, groundH(x, z), z, 0, 0, 0), 1.15, 0.05, h, 6, [1, 1, 1], false);
    }
  }

  /* ============================================================
   *  对岸：城市 + 灯塔 + 港口
   * ============================================================ */
  function buildCity(st) {
    const F = L.farShoreZ;
    const base = st.pen("w.cityBase", T.stone(), { tint: [0.11, 0.13, 0.18], spec: 0.04, rim: 0.25 });
    const bld = st.pen("w.cityBld", null, { tint: [0.16, 0.18, 0.24], spec: 0.06, rim: 0.35 });
    const bldFar = st.pen("w.cityFar", null, { tint: [0.09, 0.11, 0.16], spec: 0.03, rim: 0.2 });
    const winW = st.pen("w.cityWinW", null, { unlit: true, tint: [1.0, 0.72, 0.4] });
    const winC = st.pen("w.cityWinC", null, { unlit: true, tint: [0.52, 0.68, 1.0] });
    const r = rng(83);
    const C = L.city;

    // 对岸陆地：一条黑压压的海岸带（顶面 y=5，城市就建在上面）
    for (let i = 0; i < 16; i++) {
      const x = -40 + i * 22;
      const h = 7;
      base.box.call(base, m4(x, 1.5, F - 10 - HASH(i, 9) * 8, 0, 0, 0), 24, h, 26, [1, 1, 1], 2);
    }

    // 远景剪影层
    for (let i = 0; i < 46; i++) {
      const x = -20 + r() * 260;
      const z = F - 36 - r() * 34;
      const w = 6 + r() * 14, d = 6 + r() * 12, h = 8 + r() * r() * 34;
      bldFar.box.call(bldFar, m4(x, 5 + h / 2, z, 0, 0, 0), w, h, d, [0.8 + r() * 0.4, 0.8 + r() * 0.4, 0.85], 1.2);
    }

    // 近一点的主城区：一栋栋楼 + 朝海一面的窗
    const n = 58;
    for (let i = 0; i < n; i++) {
      const x = C.x0 + r() * (C.x1 - C.x0);
      const z = F - 8 - r() * 28;
      const w = 5 + r() * 9, d = 5 + r() * 8;
      const h = 7 + r() * r() * 30;
      const tone = 0.75 + r() * 0.5;
      bld.box.call(bld, m4(x, 5 + h / 2, z), w, h, d, [tone, tone, tone * 1.02], 1.1);
      // 窗：朝 +Z 的面
      const cols = Math.max(1, Math.round(w / 1.6));
      const rows = Math.max(1, Math.round(h / 2.2));
      const wpen = r() < 0.55 ? winW : winC;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          if (r() < 0.42) continue;
          const wx = x - w / 2 + (cx + 0.5) * (w / cols);
          const wy = 5 + 1.2 + cy * (h / rows);
          const ww = w / cols * 0.46, wh = Math.min(0.9, h / rows * 0.42);
          wpen.quad.call(wpen, m4(wx, wy, z + d / 2 + 0.03), ww, wh, [1, 1, 1], [0, 0, 1, 1]);
        }
      }
      // 楼顶的灯
      if (h > 24) {
        winW.quad.call(winW, m4(x, 5 + h + 0.4, z + d / 2 + 0.03), 0.35, 0.35, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    // 城市光晕：贴着海面的暖色雾
    const haze = st.pen("w.cityHaze", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.66, 0.32], opacity: 0.13 });
    for (let i = 0; i < 6; i++) {
      haze.quad.call(haze, m4(48 + i * 34, 12 + i * 1.5, F + 2), 66, 28, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 水面上的城市倒影：一条条竖着的暖光
    const refl = st.pen("w.cityRefl", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.6, 0.28], opacity: 0.10 });
    for (let i = 0; i < 22; i++) {
      const x = 30 + r() * 190;
      const z = F + 12 + r() * 50;
      refl.quad.call(refl, m4(x, L.waterY + 0.03, z, -Math.PI / 2, 0, 0), 1.6 + r() * 2.4, 8 + r() * 16,
        [1, 1, 1], [0, 0, 1, 3]);
    }

    // 港口：起重机和拖船剪影（在岸线上，不是水里）
    const crane = st.pen("w.crane", T.darkMetal(), { tint: [0.2, 0.22, 0.26], spec: 0.2 });
    for (const [cx, cz, s] of [[24, F - 3, 1], [96, F - 6, 0.8], [142, F - 2, 1.15]]) {
      crane.box.call(crane, m4(cx, 15, cz), 0.7 * s, 20 * s, 0.7 * s, [1, 1, 1], 2);
      crane.box.call(crane, m4(cx + 4.5 * s, 24.4 * s, cz, 0, 0, 0.08), 10 * s, 0.5 * s, 0.5 * s, [1, 1, 1], 2);
      crane.box.call(crane, m4(cx + 9 * s, 22.6 * s, cz), 0.18 * s, 4 * s, 0.18 * s, [1, 1, 1], 2);
    }
    // 塔吊红灯（点精灵）
    const pts = [];
    for (const [cx, cz, s] of [[24, F - 3, 1], [96, F - 6, 0.8], [142, F - 2, 1.15]]) {
      pts.push({ x: cx + 9 * s, y: 24.8 * s, z: cz, r: 1, g: 0.2, b: 0.12, a: 0.9, size: 1.4, kind: 0, phase: 2.1, wob: 0 });
    }
    for (let i = 0; i < 60; i++) {
      pts.push({
        x: 30 + r() * 210, y: 7 + r() * 30, z: F - 4 - r() * 24,
        r: 1, g: 0.75, b: 0.45, a: 0.5 + r() * 0.4, size: 0.5 + r() * 0.7,
        kind: 0, phase: r() * 10, wob: 0
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "add", yMin: 0, yMax: 40, fogNear: 200, fogFar: 700 });
  }

  function buildLighthouse(st) {
    const P0 = L.lighthouse;
    const rock = st.pen("w.lhRock", T.stone(), { tint: [0.3, 0.32, 0.36], spec: 0.1 });
    const tower = st.pen("w.lhTower", T.plaster(), { tint: [1.0, 0.98, 0.94], spec: 0.2 });
    const red = st.pen("w.lhRed", T.plasterWarm(), { tint: [1.35, 0.6, 0.5], spec: 0.2 });
    const metal = st.pen("w.lhMetal", T.darkMetal(), { tint: [0.35, 0.36, 0.4], spec: 0.4 });
    const r = rng(61);
    // 礁石基座
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU;
      const d = r() * 9;
      const s = 1.6 + r() * 3.2;
      rock.sphere.call(rock, m4(P0.x + Math.cos(a) * d, -1.2 + r() * 3.4, P0.z + Math.sin(a) * d * 0.8,
        r(), a, r(), s, s * 0.7, s), 1, 7, 5, [0.8 + r() * 0.35, 0.82, 0.86]);
    }
    const baseY = 5;
    const H = P0.top;
    // 塔身：白 + 两道红箍
    tower.cyl.call(tower, m4(P0.x, baseY, P0.z), 2.6, 1.7, H - baseY, 14, [1, 1, 1], false);
    red.cyl.call(red, m4(P0.x, baseY + (H - baseY) * 0.38, P0.z), 2.25, 2.1, 1.6, 14, [1, 1, 1], false);
    red.cyl.call(red, m4(P0.x, baseY + (H - baseY) * 0.66, P0.z), 1.98, 1.85, 1.5, 14, [1, 1, 1], false);
    // 观景台
    metal.cyl.call(metal, m4(P0.x, H, P0.z), 2.35, 2.35, 0.22, 14, [1, 1, 1], true);
    // 灯室：玻璃（暖）+ 顶
    const lamp = st.pen("w.lhLamp", null, { unlit: true, tint: [1.0, 0.86, 0.5] });
    lamp.cyl.call(lamp, m4(P0.x, H + 0.22, P0.z), 1.45, 1.45, 1.5, 10, [1, 1, 1], false);
    metal.cyl.call(metal, m4(P0.x, H + 1.72, P0.z), 1.9, 0.12, 1.5, 10, [1, 1, 1], true);
    metal.sphere.call(metal, m4(P0.x, H + 3.3, P0.z), 0.22, 6, 4, [1, 1, 1]);
    // 灯晕
    const halo = st.pen("w.lhHalo", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.85, 0.5], opacity: 0.55 });
    halo.quad.call(halo, m4(P0.x, H + 0.95, P0.z + 1.6), 10, 10, [1, 1, 1], [0, 0, 1, 1]);
    halo.quad.call(halo, m4(P0.x, H + 0.95, P0.z + 1.6), 34, 34, [1, 1, 1], [0, 0, 1, 1]);

    // 旋转光束：一块水平扇 + 一块竖直扇交叉，转到哪亮到哪
    const beam = st.glow("w.lhBeam", T.shaft(), {
      unlit: true, blend: "add", tint: [1.0, 0.88, 0.55], opacity: 0.16,
      matrix: t => m4(P0.x, H + 0.9, P0.z, 0, t * 0.22, 0)
    });
    // 水平扇（贴在海面高度）与竖直扇（从灯室往外推）
    beam.tri.call(beam, M.ident(), [0, 0, 0], [7, 0, 58], [-7, 0, 58], null, [1, 1, 1]);
    beam.tri.call(beam, M.ident(), [0, 0, 0], [-7, 0, 58], [7, 0, 58], null, [1, 1, 1]);
    beam.tri.call(beam, M.ident(), [0, 0, 0], [0, 3.2, 62], [0, -2.4, 62], null, [1, 1, 1]);
    beam.tri.call(beam, M.ident(), [0, 0, 0], [0, -2.4, 62], [0, 3.2, 62], null, [1, 1, 1]);
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

    // 防波堤：从对岸伸出来，堤头一盏红灯
    const breakwater = st.pen("w.breakwater", T.stone(), { tint: [0.2, 0.22, 0.26], spec: 0.06 });
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const x = 12 + t * 26, z = L.farShoreZ + 2 + t * 18;
      breakwater.box.call(breakwater, m4(x, L.waterY + 0.9, z), 4.2, 2.6, 4.6, [1, 1, 1], 1.6);
    }
    lamp.quad.call(lamp, m4(38, L.waterY + 2.8, L.farShoreZ + 20), 1.6, 1.6, [1, 1, 1], [0, 0, 1, 1]);

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

    // 山间的萤火虫
    const pts = [];
    const r = rng(37);
    for (let i = 0; i < 110; i++) {
      const x = L.ridge.x0 + (r() - 0.5) * 150;
      const z = 2 + r() * 44;
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

  /** 分区的局部 → 世界矩阵（分区子文件用它来摆局部坐标） */
  function frameOf(part) {
    return m4(part.x, 0, part.z, 0, part.rot || 0, 0);
  }

  /* ============================================================
   *  山脚到街口之间：一条带灯的石板路、几间小屋
   *  主标题视角的下半部分原来是一大片空草地，加这条路把视线引到街区。
   * ============================================================ */
  function buildVale(st) {
    const road = st.pen("w.road", T.paving(), { tint: [0.62, 0.64, 0.66], spec: 0.28 });
    const lampPost = st.pen("w.lampPost", T.darkMetal(), { tint: [0.35, 0.34, 0.36], spec: 0.25 });
    const lampBulb = st.pen("w.lampBulb", null, { unlit: true, tint: [1.0, 0.78, 0.42] });
    const lampGlow = st.pen("w.lampGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.62, 0.26], opacity: 0.22 });

    // 折线路径：从教堂台地西侧绕过山脚，接到 GitHub 街口
    const pts = [
      [20, 8], [13, 0], [5, -8], [-4, -16], [-11, -26], [-15, -36], [-17, -42]
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = 6;
      for (let k = 0; k < seg; k++) {
        const u0 = k / seg, u1 = (k + 1) / seg;
        const x0 = a[0] + (b[0] - a[0]) * u0, z0 = a[1] + (b[1] - a[1]) * u0;
        const x1 = a[0] + (b[0] - a[0]) * u1, z1 = a[1] + (b[1] - a[1]) * u1;
        const y = (groundH(x0, z0) + groundH(x1, z1)) / 2;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ry = Math.atan2(x1 - x0, z1 - z0);
        road.quad.call(road, m4((x0 + x1) / 2, y + 0.06, (z0 + z1) / 2, -Math.PI / 2, ry, 0),
          3.1, len * 1.12, [1, 1, 1], [0, 0, 1, 1.6]);
      }
    }
    // 路上的灯：每 9m 一根，暖黄小球
    const total = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 9));
      for (let k = 0; k < n; k++) total.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
    }
    total.push(pts[pts.length - 1]);
    total.forEach(([x, z], i) => {
      const side = i % 2 ? 1 : -1;
      const y = groundH(x, z);
      const lx = x + side * 2.1, lz = z + 0.4;
      lampPost.cyl.call(lampPost, m4(lx, y, lz), 0.09, 0.07, 3.0, 5, [1, 1, 1], true);
      lampPost.box.call(lampPost, m4(lx, y + 3.05, lz, 0, 0, 0), 0.34, 0.1, 0.34, [1, 1, 1], 1.2);
      lampBulb.sphere.call(lampBulb, m4(lx, y + 3.2, lz), 0.16, 6, 4, [1, 1, 1]);
      lampGlow.quad.call(lampGlow, m4(lx, y + 3.2, lz), 2.4, 2.4, [1, 1, 1], [0, 0, 1, 1]);
    });

    // 路边的小屋：石墙、坡顶、暖窗，把山脚到街区之间填出人味
    const wall = st.pen("w.cottage", T.plaster(), { tint: [0.72, 0.7, 0.66], spec: 0.1 });
    const roofB = st.pen("w.cottageRoof", T.woodDark(), { tint: [0.5, 0.4, 0.34], spec: 0.15 });
    const warm = st.pen("w.cottageWin", null, { unlit: true, tint: [1.0, 0.72, 0.38] });
    const warmGlow = st.pen("w.cottageGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.6, 0.26], opacity: 0.14 });
    const cottages = [[8, -6, 0.5, 5.2, 4.2], [-8, -20, -0.7, 4.6, 3.8], [2, -30, 1.2, 5.8, 4.6], [-20, -32, 2.4, 4.2, 3.4]];
    for (const [cx, cz, ry, w, d] of cottages) {
      const y = groundH(cx, cz);
      const M0 = m4(cx, y, cz, 0, ry, 0);
      wall.box.call(wall, M.mul(M0, m4(0, 1.6, 0)), w, 3.2, d, [1, 1, 1], 1.3);
      gableRoof(roofB, M.mul(M0, m4(0, 3.2, 0)), w + 1.0, d + 0.8, 1.8, [1, 1, 1], 1.2);
      // 门与两扇窗（朝 +Z 那面）
      wall.box.call(wall, M.mul(M0, m4(0, 0.9, d / 2 + 0.03)), 0.9, 1.8, 0.1, [0.28, 0.2, 0.14], 1.4);
      for (const sx of [-1, 1]) {
        warm.quad.call(warm, M.mul(M0, m4(sx * w * 0.26, 1.9, d / 2 + 0.06)), 0.8, 0.95, [1, 1, 1], [0, 0, 1, 1]);
        warmGlow.quad.call(warmGlow, M.mul(M0, m4(sx * w * 0.26, 1.9, d / 2 + 0.14)), 3.0, 3.2, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 烟囱
      wall.box.call(wall, M.mul(M0, m4(w * 0.3, 4.4, -d * 0.2)), 0.5, 1.6, 0.5, [0.6, 0.58, 0.55], 1.3);
    }
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
    ghSign.quad.call(ghSign, m4(L.github.x + 5.2, 9.6, L.github.z + 2.2), 7.6, 2.2, [1, 1, 1], [0, 0, 1, 1]);
    glowB.quad.call(glowB, m4(L.github.x + 5.2, 9.6, L.github.z + 2.6), 11, 4.6, [1, 1, 1], [0, 0, 1, 1]);
    frames.box.call(frames, m4(L.github.x + 5.2, 9.6, L.github.z + 2.0), 8.0, 2.5, 0.2, [1, 1, 1], 2);

    // HF 营地入口上方的暖色小招牌（从山上看是左边那一小团暖光）
    const hfTex = A3DTex.sign({
      text: "HUGGING FACE", w: 768, h: 180, bg: "#1a1208", fg: "#ffd9a0", size: 84,
      border: "#8a6431", borderW: 5, glow: "rgba(255,205,130,.45)", glowBlur: 20
    });
    const hfSign = st.pen("w.lmHf", hfTex, { unlit: true, tint: [0.9, 0.88, 0.84] });
    hfSign.quad.call(hfSign, m4(L.hf.x + 14, 6.4, L.hf.z + 8), 6.4, 1.5, [1, 1, 1], [0, 0, 1, 1]);
    const hfGlow = st.pen("w.lmHfGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.72, 0.36], opacity: 0.2 });
    hfGlow.quad.call(hfGlow, m4(L.hf.x + 14, 6.4, L.hf.z + 8.4), 10, 4, [1, 1, 1], [0, 0, 1, 1]);

    /* 从山上看下去时，街区里那些灯笼/串灯会糊成一团暖光。
     * 这里补几片很淡的加法光池，让远处能读出「那里有人在过日子」。 */
    const poolWarm = st.pen("w.poolWarm", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.66, 0.3], opacity: 0.10 });
    for (let i = 0; i < 6; i++) {
      poolWarm.quad.call(poolWarm, m4(L.github.x, 3.4, L.github.z - 4 - i * 6.4), 11, 9, [1, 1, 1], [0, 0, 1, 1]);
    }
    for (const [dx, dz, s] of [[14, 6, 12], [4, 16, 10], [22, 20, 9]]) {
      poolWarm.quad.call(poolWarm, m4(L.hf.x + dx, 2.6, L.hf.z + dz), s, s * 0.8, [1, 1, 1], [0, 0, 1, 1]);
    }
    const poolGreen = st.pen("w.poolGreen", T.glow(), { unlit: true, blend: "add", tint: [0.6, 0.9, 0.32], opacity: 0.08 });
    poolGreen.quad.call(poolGreen, m4(L.shit.x, 4.5, L.shit.z - 10), 16, 12, [1, 1, 1], [0, 0, 1, 1]);
  }

  /* ============================================================
   *  组装世界
   * ============================================================ */
  let WORLD = null;
  function buildWorld() {
    const st = P.stage();
    buildGround(st);
    buildHill(st);
    buildChurch(st);
    buildVale(st);
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
   *  四个视角
   * ============================================================ */
  const VIEWS = {
    /* 视角 1：主标题 —— 远离海岸的山顶，教堂旁边，面向海岸线 */
    world_title: {
      cam: L.titleCam,
      sky: {
        mode: 2, top: [0.006, 0.012, 0.032], bot: [0.06, 0.082, 0.122],
        glow: [0.34, 0.42, 0.58], sun: [0.274, 0.953, 0], horizon: 0.72
      },
      lights: {
        sun: A3D.norm3([-0.29, 0.14, -0.95]), sunCol: [0.58, 0.64, 0.82],
        skyCol: [0.26, 0.32, 0.46], groundCol: [0.08, 0.09, 0.12],
        fog: { col: [0.06, 0.082, 0.122], near: 140, far: 780 }, fogAmt: 0.95,
        points: [
          { pos: [L.church.x, groundH(L.church.x, L.church.z) + 4, L.church.z + 2], col: [1.0, 0.7, 0.36], range: 30, inten: 1.8 },
          { pos: [L.city.x0 + 60, 14, L.farShoreZ + 6], col: [1.0, 0.62, 0.32], range: 120, inten: 0.22 },
          { pos: [L.lighthouse.x, L.lighthouse.top, L.lighthouse.z], col: [1.0, 0.85, 0.55], range: 90, inten: 0.5 },
          { pos: [L.github.x, 7, L.github.z - 22], col: [1.0, 0.6, 0.3], range: 46, inten: 0.9 }
        ]
      },
      tone: [0.82, 0.9, 1.06],
      swayAmp: 0.8,
      update(t, sc) {
        sc.cam.eye = [2 + Math.sin(t * 0.08) * 0.32, L.titleCam.eye[1] + Math.sin(t * 0.13) * 0.05, 30 + Math.cos(t * 0.06) * 0.26];
      }
    },

    /* 视角 2：GitHub 夜市街 —— 左右两边是摊位，尽头是屎山 */
    world_github: {
      cam: { eye: [L.github.x, 1.68, L.github.z + 4], target: [L.github.x, 1.5, L.github.z - 40], fov: 50, far: 120 },
      sky: {
        mode: 2, top: [0.012, 0.016, 0.03], bot: [0.07, 0.07, 0.1],
        glow: [0.34, 0.26, 0.3], sun: [0.5, 0.88, 0], horizon: 0.55
      },
      lights: {
        sun: A3D.norm3([-0.2, 0.8, 0.5]), sunCol: [0.28, 0.3, 0.44],
        skyCol: [0.22, 0.24, 0.32], groundCol: [0.12, 0.1, 0.1],
        fog: { col: [0.06, 0.07, 0.1], near: 10, far: 42 }, fogAmt: 0.55,
        points: [
          { pos: [L.github.x - 3.2, 1.6, L.github.z - 2], col: [1.0, 0.62, 0.32], range: 11, inten: 2.2 },
          { pos: [L.github.x + 3.2, 1.6, L.github.z - 9], col: [0.95, 0.66, 0.42], range: 11, inten: 2.0 },
          { pos: [L.github.x - 3.2, 1.6, L.github.z - 17], col: [1.0, 0.62, 0.32], range: 11, inten: 2.0 },
          { pos: [L.github.x + 3.2, 1.6, L.github.z - 25], col: [0.8, 0.82, 1.0], range: 11, inten: 1.8 },
          { pos: [L.github.x, 3.4, L.github.z - 6], col: [0.4, 0.45, 0.6], range: 16, inten: 0.9 },
          { pos: [L.github.x, 5.2, L.github.z - 36], col: [0.35, 0.65, 1.0], range: 18, inten: 0.9 }
        ]
      },
      tone: [1.0, 0.88, 0.78],
      swayAmp: 0.45,
      update(t, sc) {
        sc.cam.eye = [L.github.x + Math.sin(t * 0.13) * 0.08, 1.68 + Math.sin(t * 0.21) * 0.014, L.github.z + 4 + Math.cos(t * 0.1) * 0.08];
      }
    },

    /* 视角 3：Hugging Face 营地 —— 从海滩斜望向岸边，左边是帐篷和小摊 */
    world_hf: {
      cam: { eye: [-44, 1.8, -104], target: [-64, 3.0, -86], fov: 54, far: 160 },
      sky: {
        mode: 2, top: [0.012, 0.022, 0.052], bot: [0.06, 0.09, 0.14],
        glow: [0.28, 0.37, 0.5], sun: [0.82, 0.82, 0], horizon: 0.4
      },
      lights: {
        sun: A3D.norm3([0.3, 0.66, -0.68]), sunCol: [0.5, 0.58, 0.8],
        skyCol: [0.26, 0.3, 0.44], groundCol: [0.12, 0.11, 0.14],
        fog: { col: [0.06, 0.09, 0.15], near: 12, far: 70 }, fogAmt: 0.7,
        points: [
          { pos: [-59.8, 0.9, -85.6], col: [1.0, 0.52, 0.2], range: 15, inten: 2.6 },
          { pos: [-55.2, 0.9, -77.0], col: [1.0, 0.55, 0.24], range: 12, inten: 1.8 },
          { pos: [-71.6, 0.9, -94.2], col: [1.0, 0.52, 0.22], range: 11, inten: 1.5 },
          { pos: [-56.0, 2.6, -95.6], col: [1.0, 0.8, 0.5], range: 16, inten: 1.2 },
          { pos: [-78.0, 3.2, -121.4], col: [1.0, 0.85, 0.6], range: 14, inten: 0.9 },
          { pos: [-50.0, 3.4, -88.0], col: [1.0, 0.82, 0.55], range: 20, inten: 1.0 }
        ]
      },
      tone: [0.9, 0.94, 1.02],
      swayAmp: 0.9,
      update(t, sc) {
        sc.cam.eye = [-44 + Math.sin(t * 0.1) * 0.1, 1.8 + Math.sin(t * 0.17) * 0.015, -104 + Math.cos(t * 0.08) * 0.1];
      }
    },

    /* 视角 4：屎山 —— 站在街尾，正对着这座山 */
    world_shit: {
      cam: { eye: [L.shit.x - 2, 3.0, L.shit.z + 8], target: [L.shit.x - 1, 4.2, L.shit.z - 12], fov: 56, far: 130 },
      sky: {
        mode: 2, top: [0.028, 0.036, 0.02], bot: [0.085, 0.095, 0.055],
        glow: [0.32, 0.36, 0.16], sun: [0.5, 0.85, 0], horizon: 0.58
      },
      lights: {
        sun: A3D.norm3([-0.3, 0.7, 0.6]), sunCol: [0.4, 0.42, 0.3],
        skyCol: [0.24, 0.26, 0.16], groundCol: [0.14, 0.12, 0.08],
        fog: { col: [0.1, 0.11, 0.06], near: 12, far: 46 }, fogAmt: 0.5,
        points: [
          { pos: [L.shit.x - 5.5, 1.2, L.shit.z - 4.5], col: [1.0, 0.55, 0.2], range: 9, inten: 2.0 },
          { pos: [L.shit.x + 6.0, 1.2, L.shit.z - 4.5], col: [1.0, 0.55, 0.2], range: 9, inten: 2.0 },
          { pos: [L.shit.x, 11, L.shit.z - 12], col: [0.7, 0.9, 0.3], range: 14, inten: 1.4 },
          { pos: [L.shit.x - 6.95, 3.0, L.shit.z - 4.0], col: [1.0, 0.85, 0.5], range: 9, inten: 1.6 },
          { pos: [L.shit.x, 2.0, L.shit.z - 6], col: [0.5, 0.6, 0.3], range: 12, inten: 0.8 }
        ]
      },
      tone: [0.95, 1.0, 0.72],
      swayAmp: 0.35,
      update(t, sc) {
        sc.cam.eye = [L.shit.x - 2 + Math.sin(t * 0.11) * 0.08, 3.0 + Math.sin(t * 0.19) * 0.015, L.shit.z + 8 + Math.cos(t * 0.09) * 0.08];
      }
    }
  };

  function sceneFor(id) {
    const v = VIEWS[id];
    const w = world();
    return {
      cam: { eye: v.cam.eye.slice(), target: v.cam.target.slice(), fov: v.cam.fov, far: v.cam.far },
      sky: v.sky,
      lights: v.lights,
      batches: w.batches, over: w.over, dyn: w.dyn, points: w.points, glows: w.glows,
      tone: v.tone,
      swayAmp: v.swayAmp,
      wind: [0.35, 0.12, 0.2],
      update(t, sc) { v.update(t, sc); }
    };
  }

  /* ============================================================
   *  注册：新 id + 老 id 全部指向大世界
   * ============================================================ */
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

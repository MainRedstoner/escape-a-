/* ============================================================
 * Escape A÷ · src/art3d/world_hf.js —— 大世界分区：Hugging Face 海边营地
 *
 * 局部坐标（由 world.js 用 D 矩阵摆到世界坐标，rot=0）：
 *   原点 = 世界 (-70, 0, -102) 的沙滩水线附近；
 *   +Z 往岸上（内陆），-Z 往海；世界水线 -108 → 局部 z ≈ -6。
 *   局部 z > 2 是平地 y=0；z ∈ [-6, 2] 是骨架的沙滩斜坡，再往外是海。
 *
 * 营地铺在局部 x ∈ [-2, 32]、z ∈ [4, 34]；木栈桥在 x ≈ -8，往海里伸到 z ≈ -20。
 * world_hf 相机在局部 (18, -4) 往 (-4, 18) 看，所以画面左边 = 局部 x 大的那侧。
 *
 * 布局：入口拱门 (14, 6.4) → 中央广场 / 主篝火 (10.2, 16.4) → 两排帐篷与七个
 * 地摊 → 后场篝火 (14.8, 25.0)。右侧沙滩留遮阳伞、脚印和搁浅小船，栈桥和三条
 * 渔船在 x≈-8 一侧。地面 / 海 / 天空 / 相机 / 灯光全部由 world.js 负责。
 * ============================================================ */
"use strict";

const A3DWorldHf = (() => {
  function build(ctx) {
    const W = ctx.W, st = ctx.st, D = ctx.D;
    const T = W.T, P = W.P, M = W.M, m4 = W.m4, TAU = W.TAU;
    const r = ctx.r;
    const pen = (key, tex, opts) => W.penAt(st, D, "hf." + key, tex, opts);
    const glow = (key, tex, opts) => W.glowAt(st, D, "hf." + key, tex, opts);
    const dyno = (tex, opts, fn) => W.dynoAt(st, D, tex, opts, fn);
    const points = (list, opts) => W.addPoints(st, D, list, opts);

    /* ============================================================
     *  画笔：同一 key = 同一个 draw call
     * ============================================================ */
    const wood = pen("wood", T.wood(), { tint: [1.22, 1.0, 0.78], spec: 0.14, rim: 0.26 });
    const dark = pen("dark", T.woodDark(), { tint: [1.6, 1.28, 0.98], spec: 0.12, rim: 0.22 });
    const plank = pen("plank", T.woodPale(), { tint: [1.2, 1.06, 0.88], spec: 0.1, rim: 0.22 });
    const linen = pen("linen", T.linen(), { tint: [1.3, 1.2, 1.08], spec: 0.04, rim: 0.3 });
    const canvas = pen("canvas", T.canvasTex(), { tint: [1.55, 1.3, 1.04], spec: 0.04, rim: 0.3 });
    const cloth = pen("cloth", T.fabric(), { tint: [1.8, 1.45, 1.1], spec: 0.05, rim: 0.26, sway: 0.7 });
    const carpet = pen("carpet", T.carpet(), { tint: [1.75, 1.45, 1.18], spec: 0.05, rim: 0.2 });
    const stone = pen("stone", T.stone(), { tint: [1.05, 0.95, 0.84], spec: 0.2, rim: 0.26 });
    const metal = pen("metal", T.metal(), { tint: [1.32, 1.14, 0.94], spec: 0.65, rim: 0.35 });
    const brass = pen("brass", T.brass(), { tint: [1.4, 1.18, 0.86], spec: 0.72, rim: 0.4 });
    const clay = pen("clay", T.plasterWarm(), { tint: [2.75, 2.25, 1.7], spec: 0.16, rim: 0.26 });
    const leafP = pen("leaf", T.leaf(), { cutout: true, tint: [1.18, 1.32, 0.92], sway: 1.1, spec: 0.05, rim: 0.3 });
    const paper = pen("paper", T.paper(), { tint: [1.55, 0.98, 0.56], emissive: [0.5, 0.2, 0.05], spec: 0.05, rim: 0.2 });
    const rope = pen("rope", null, { tint: [0.66, 0.53, 0.4], spec: 0.03, rim: 0.1 });
    const bulb = pen("bulb", null, { unlit: true, tint: [1.0, 0.88, 0.62] });
    const sand = pen("sand", T.dirt(), { tint: [1.02, 0.84, 0.67], spec: 0.05, rim: 0.16 });

    const fireGlow = glow("fireGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.44, 0.13], opacity: 0.42 });
    const flame = glow("flame", T.shaft(), { unlit: true, blend: "add", tint: [1.0, 0.52, 0.18], opacity: 0.6 });
    const bulbGlow = glow("bulbGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.76, 0.42], opacity: 0.3 });
    const lampGlow = glow("lampGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.58, 0.24], opacity: 0.34 });
    const stallGlow = glow("stallGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.84, 0.56], opacity: 0.17 });
    const coolGlow = glow("coolGlow", T.glow(), { unlit: true, blend: "add", tint: [0.42, 0.62, 1.0], opacity: 0.15 });
    const beamGlow = glow("beam", T.shaft(), { unlit: true, blend: "add", tint: [1.0, 0.72, 0.36], opacity: 0.1 });
    const smokeGlow = glow("smoke", T.glow(), { unlit: true, blend: "alpha", tint: [0.44, 0.42, 0.38], opacity: 0.12 });

    /* ============================================================
     *  局部坐标小工具
     * ============================================================ */
    /** 局部地面高度（只有局部 z≈2 往海一侧会下沉） */
    const gH = (x, z) => {
      const p = M.xf(D, [x, 0, z]);
      return W.groundH(p[0], p[2]);
    };
    /** 局部 +X / +Z 方向在世界里的单位向量 */
    const dirX = ry => [Math.cos(ry), -Math.sin(ry)];
    const dirZ = ry => [Math.sin(ry), Math.cos(ry)];
    /** 用四个局部点直接摆一片四边形（法线按绕序自动算） */
    function quadP(pn, m, p0, p1, p2, p3, col, uv) {
      const t = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
      pn.tri.call(pn, m, p0, p1, p2, [t[0], t[1], t[2]], col);
      pn.tri.call(pn, m, p0, p2, p3, [t[0], t[2], t[3]], col);
    }
    /** 平贴地面的四边形（地毯 / 脚印 / 垫子） */
    function groundQuad(pn, x, z, w, d, ry, col, uv) {
      pn.quad.call(pn, m4(x, gH(x, z) + 0.02, z, -Math.PI / 2, ry || 0, 0), w, d, col,
        uv || [0, 0, 1, 1]);
    }
    /** 把一串局部点连成管子（绳子 / 电线 / 吊链） */
    function tubeLine(pn, pts, rad, sides, col) {
      pn.tube.call(pn, M.ident(), pts, rad, sides || 3, col || [1, 1, 1]);
    }
    /** 同上，但整串点挂在某个局部矩阵下（帐篷拉绳 / 蒙古包支杆用） */
    function tubeLocal(pn, m, pts, rad, sides, col) {
      pn.tube.call(pn, m, pts, rad, sides || 3, col || [1, 1, 1]);
    }

    /* ============================================================
     *  小道具：纸灯笼 / 木箱 / 酒桶 / 长凳 / 桌子 / 书
     * ============================================================ */
    /** 便宜的纸灯笼：圆柱纸罩 + 顶盖 + 吊绳 + 光晕 */
    function lantern(x, y, z, s, col, hangTo, withGlow) {
      paper.cyl.call(paper, m4(x, y - 0.13 * s, z), 0.105 * s, 0.126 * s, 0.26 * s, 8,
        col || [1, 1, 1], true);
      dark.cyl.call(dark, m4(x, y + 0.13 * s, z), 0.042 * s, 0.032 * s, 0.04 * s, 6,
        [1, 1, 1], true);
      if (hangTo !== null) {
        const top = hangTo === undefined ? y + 0.45 * s : hangTo;
        tubeLine(rope, [[x, y + 0.16 * s, z], [x, top, z]], 0.007, 3, [1, 1, 1]);
      }
      if (withGlow !== false) {
        lampGlow.quad.call(lampGlow, m4(x, y, z + 0.02), 0.9 * s, 0.9 * s, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    function crateAt(x, y, z, s, ry, col) {
      const m = m4(x, y + s * 0.5, z, 0, ry, 0);
      wood.box.call(wood, m, s, s, s, col || [1, 1, 1], 1.5);
      plank.box.call(plank, M.mul(m, m4(0, s * 0.5 + 0.012, 0)), s * 1.03, 0.03, s * 0.98,
        [1, 1, 1], 1.4);
      plank.box.call(plank, M.mul(m, m4(0, 0, s * 0.5 + 0.01)), s * 0.9, s * 0.16, 0.025,
        [1, 1, 1], 1.4);
      plank.box.call(plank, M.mul(m, m4(0, 0, -s * 0.5 - 0.01)), s * 0.9, s * 0.16, 0.025,
        [1, 1, 1], 1.4);
    }

    function barrelAt(x, z, s, ry, y0) {
      const y = y0 === undefined ? gH(x, z) : y0;
      const m = m4(x, y, z, 0, ry || 0, 0);
      const rr = 0.34 * s, hh = 0.86 * s;
      dark.cyl.call(dark, M.mul(m, m4(0, 0, 0)), rr * 0.86, rr, hh * 0.5, 10, [1, 1, 1], false);
      dark.cyl.call(dark, M.mul(m, m4(0, hh * 0.5, 0)), rr, rr * 0.86, hh * 0.5, 10, [1, 1, 1], false);
      for (const t of [0.18, 0.82]) {
        metal.cyl.call(metal, M.mul(m, m4(0, hh * t, 0)), rr * 0.95, rr * 0.95, 0.035, 10,
          [1, 1, 1], false);
      }
      plank.cyl.call(plank, M.mul(m, m4(0, hh - 0.01, 0)), rr * 0.82, rr * 0.82, 0.03, 10,
        [1, 1, 1], true);
    }

    function benchAt(x, z, ry, len, col) {
      wood.box.call(wood, m4(x, 0.46, z, 0, ry, 0), len, 0.09, 0.38, col || [1, 1, 1], 1.5);
      for (const s of [-1, 1]) {
        wood.box.call(wood, m4(x + Math.cos(ry) * s * (len * 0.32), 0.23,
          z - Math.sin(ry) * s * (len * 0.32), 0, ry, 0), 0.12, 0.46, 0.34, [0.9, 0.85, 0.8], 1.5);
      }
    }

    function tableAt(x, z, ry, w, d, h, col) {
      wood.box.call(wood, m4(x, h, z, 0, ry, 0), w, 0.07, d, col || [1, 1, 1], 1.3);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lx = x + Math.cos(ry) * sx * (w / 2 - 0.1) + Math.sin(ry) * sz * (d / 2 - 0.1);
          const lz = z - Math.sin(ry) * sx * (w / 2 - 0.1) + Math.cos(ry) * sz * (d / 2 - 0.1);
          wood.box.call(wood, m4(lx, h * 0.5, lz, 0, ry, 0), 0.07, h, 0.07, [0.9, 0.85, 0.8], 1.4);
        }
      }
    }

    function bookAt(m, lx, ly, lz, w, h, d, ry, col) {
      const bm = M.mul(m, m4(lx, ly + h * 0.5, lz, 0, ry, 0));
      linen.box.call(linen, bm, w, h, d, col, 2.0);
      plank.box.call(plank, M.mul(bm, m4(0, 0, d * 0.5 + 0.002)), w * 0.78, h * 0.88, 0.02,
        [1, 1, 1], 1.5);
    }

    /* ============================================================
     *  招牌：帐篷 / 摊位 / 入口 / 码头 / 路牌
     * ============================================================ */
    const SIGN_BG = ["#2c2118", "#241b16", "#1d222c", "#2a1c1c", "#26221a", "#1c2420"];
    const SIGN_FG = ["#f6dca6", "#ffe1b0", "#d9e8f5", "#ffd2b8", "#f2e2b8", "#cfe9d4"];
    const SIGN_BR = ["#8a6a3c", "#7a5638", "#40546a", "#7a3e34", "#6e6038", "#3e5a48"];
    const SIGN_GL = ["rgba(255,210,140,.35)", "rgba(255,196,120,.3)", "rgba(150,205,255,.3)",
      "rgba(255,170,140,.3)", "rgba(250,225,160,.3)", "rgba(160,240,190,.28)"];

    function addSignBoard(key, cfg, x, y, z, ry, w, h) {
      const tex = A3DTex.sign(cfg);
      const p = pen("sign_" + key, tex, { unlit: true, tint: [1, 1, 1] });
      const nx = Math.sin(ry), nz = Math.cos(ry);
      dark.box.call(dark, m4(x, y, z, 0, ry, 0), w + 0.1, h + 0.1, 0.055, [1, 1, 1], 1.5);
      p.quad.call(p, m4(x + nx * 0.045, y, z + nz * 0.045, 0, ry, 0), w, h,
        [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 帐篷门口的小木牌：两根立柱 + 吊牌 + 门边纸灯笼 + 门前地毯 */
    function tentSign(x, z, ry, name, idx, dist) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      const bx = x + nx * dist, bz = z + nz * dist;
      const cfg = {
        text: name, w: 320, h: 96, bg: SIGN_BG[idx % 6], fg: SIGN_FG[idx % 6],
        size: 44, lineH: 48, border: SIGN_BR[idx % 6], borderW: 5,
        glow: SIGN_GL[idx % 6], glowBlur: 8
      };
      addSignBoard("t" + idx, cfg, bx, 1.74, bz, ry, 1.06, 0.32);
      for (const s of [-1, 1]) {
        const px = bx + ux * 0.5 * s, pz = bz + uz * 0.5 * s;
        wood.cyl.call(wood, m4(px, 0, pz), 0.042, 0.034, 1.92, 5, [1, 1, 1], true);
        tubeLine(rope, [[px, 1.88, pz], [px, 1.79, pz],
          [bx + ux * 0.5 * s, 1.76, bz + uz * 0.5 * s]], 0.008, 3, [1, 1, 1]);
      }
      const lx = bx + ux * 0.74, lz = bz + uz * 0.74;
      dark.box.call(dark, m4(lx, 1.82, lz), 0.06, 0.06, 0.06, [1, 1, 1], 1);
      lantern(lx, 1.58, lz, 0.9, [1, 1, 1], 1.82, true);
      groundQuad(carpet, x + nx * (dist + 0.5), z + nz * (dist + 0.5), 1.7, 1.15, ry,
        [1, 1, 1], [0, 0, 1.3, 0.9]);
    }

    const STALL_NAMES = ["烤串 · SKEWER", "热可可 · COCOA", "周边 · MERCH", "旧显卡 · GPU",
      "旧书 · BOOKS", "乐器 · MUSIC", "毯子 · RUGS"];

    function stallSign(x, z, ry, name, idx) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      const bx = x + nx * 0.15, bz = z + nz * 0.15;
      const cfg = {
        text: name, w: 512, h: 128, bg: "#241a12", fg: "#ffe0aa", size: 44, lineH: 48,
        border: "#8a5f34", borderW: 5, glow: "rgba(255,190,110,.35)", glowBlur: 10
      };
      addSignBoard("s" + idx, cfg, bx, 2.9, bz, ry, 2.25, 0.55);
      for (const s of [-1, 1]) {
        tubeLine(rope, [[bx + ux * 0.92 * s, 3.16, bz + uz * 0.92 * s],
          [x + ux * 0.85 * s, 2.64, z + uz * 0.85 * s]], 0.008, 3, [1, 1, 1]);
      }
    }

    /* ============================================================
     *  帐篷：七种造型
     * ============================================================ */
    const TENT_COL = {
      ochre: [1.18, 0.84, 0.5], cream: [1.16, 1.06, 0.86], teal: [0.5, 0.95, 0.98],
      plum: [0.92, 0.56, 1.0], gold: [1.26, 1.02, 0.55], olive: [0.78, 0.92, 0.52],
      orange: [1.22, 0.62, 0.34], indigo: [0.5, 0.58, 1.12], rust: [1.16, 0.56, 0.36],
      blue: [0.54, 0.74, 1.2], sand: [1.2, 1.02, 0.78]
    };

    function tentA(x, z, ry, col, seed) {
      const rr = P.rng(seed || 1);
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 2.55, d = 3.15, h = 2.0;
      const cd = [col[0] * 0.92, col[1] * 0.92, col[2] * 0.94];
      quadP(linen, m, [-w / 2, 0.05, -d / 2], [-w / 2, 0.05, d / 2], [0, h, d / 2],
        [0, h, -d / 2], col, [[0, 0], [0, 2], [1.5, 2], [1.5, 0]]);
      quadP(linen, m, [w / 2, 0.05, -d / 2], [0, h, -d / 2], [0, h, d / 2],
        [w / 2, 0.05, d / 2], cd, [[0, 0], [1.5, 0], [1.5, 2], [0, 2]]);
      linen.tri.call(linen, m, [-w / 2, 0.05, -d / 2], [0, h, -d / 2], [w / 2, 0.05, -d / 2],
        null, cd);
      // 门洞 + 门帘
      quadP(cloth, m, [-0.48, 0.04, d / 2 - 0.015], [0.48, 0.04, d / 2 - 0.015],
        [0.42, 1.5, d / 2 - 0.02], [-0.42, 1.5, d / 2 - 0.02], [0.16, 0.13, 0.11]);
      quadP(canvas, m, [-0.5, 0.05, d / 2 + 0.03], [-0.5, 1.5, d / 2 + 0.01],
        [-0.05, 1.42, d / 2 + 0.28], [-0.05, 0.1, d / 2 + 0.26], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.82]);
      quadP(canvas, m, [0.5, 0.05, d / 2 + 0.03], [0.05, 0.1, d / 2 + 0.26],
        [0.05, 1.42, d / 2 + 0.28], [0.5, 1.5, d / 2 + 0.01], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.82]);
      // 脊杆
      dark.cyl.call(dark, M.mul(m, m4(0, h + 0.03, -d / 2 - 0.2, Math.PI / 2, 0, 0)),
        0.034, 0.028, d + 0.4, 5, [1, 1, 1], true);
      // 拉绳 + 地钉
      for (const s of [-1, 1]) {
        const ex = s * w * 0.75, ez = -d / 2 - 0.85;
        tubeLocal(rope, m, [[0, h - 0.02, -d / 2 - 0.16], [ex * 0.6, h * 0.5, ez * 0.62],
          [ex, 0.04, ez]], 0.012, 3, [1, 1, 1]);
        wood.cyl.call(wood, M.mul(m, m4(ex, 0, ez)), 0.035, 0.025, 0.42, 4, [1, 1, 1], true);
        tubeLocal(rope, m, [[0, h - 0.02, -d / 2 - 0.16], [ex * 0.6, h * 0.5, -d / 2 + 0.2],
          [ex, 0.04, -d / 2 + 0.35]], 0.012, 3, [1, 1, 1]);
      }
      // 小旗
      linen.tri.call(linen, M.mul(m, m4(0, h + 0.08, -d / 2 + 0.3, 0, Math.PI * 0.5, 0)),
        [0, 0, 0], [0.58, 0.06, 0], [0, -0.26, 0], null,
        [1.25, 0.55, 0.45 + rr() * 0.2]);
      // 门槛
      wood.box.call(wood, M.mul(m, m4(0, 0.08, d / 2 + 0.1)), w * 1.02, 0.12, 0.28, [1, 1, 1], 1.4);
    }

    function tentDome(x, z, ry, col, seed) {
      const rr = P.rng(seed || 2);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.55;
      linen.sphere.call(linen, M.mul(m, m4(0, 0, 0, 0, 0, 0, 1, 0.8, 1)), rad, 12, 7, col);
      canvas.cyl.call(canvas, M.mul(m, m4(0, 0, 0)), rad * 1.01, rad * 1.03, 0.24, 12,
        [col[0] * 0.82, col[1] * 0.84, col[2] * 0.86], false);
      quadP(cloth, m, [-0.48, 0.04, rad * 0.94], [0.48, 0.04, rad * 0.94],
        [0.44, 1.24, rad * 0.86], [-0.44, 1.24, rad * 0.86], [0.16, 0.13, 0.11]);
      quadP(canvas, m, [-0.86, 1.38, rad * 0.85], [0.86, 1.38, rad * 0.85],
        [0.78, 1.06, rad * 1.34], [-0.78, 1.06, rad * 1.34], col, [[0, 0], [2.4, 0], [2.4, 1], [0, 1]]);
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(s * 0.78, 0, rad * 1.3)), 0.038, 0.03, 1.08, 5,
          [1, 1, 1], true);
      }
      // 顶部小旗杆
      dark.cyl.call(dark, M.mul(m, m4(0, rad * 0.72, 0)), 0.028, 0.022, 0.8, 5, [1, 1, 1], true);
      linen.tri.call(linen, M.mul(m, m4(0, rad * 0.72 + 0.6, 0, 0, 0.4, 0)),
        [0, 0, 0], [0.52, 0.08, 0], [0, -0.24, 0], null, [1.2, 0.62, 0.42 + rr() * 0.2]);
      // 侧面的暖光小窗
      for (const s of [-1, 1]) {
        const wp = M.xf(m, [s * rad * 0.7, 0.85, rad * 0.55]);
        stallGlow.quad.call(stallGlow, m4(wp[0], wp[1], wp[2]), 0.5, 0.42, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    function tentYurt(x, z, ry, col, seed) {
      const rr = P.rng(seed || 3);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.7, hw = 1.42;
      const cr = [col[0] * 0.93, col[1] * 0.92, col[2] * 0.96];
      linen.cyl.call(linen, m, rad, rad, hw, 14, col, false);
      linen.cyl.call(linen, M.mul(m, m4(0, hw, 0)), rad * 1.01, 0.16, 0.92, 14, cr, true);
      canvas.cyl.call(canvas, M.mul(m, m4(0, 0.42, 0)), rad * 1.012, rad * 1.006, 0.16, 14,
        [col[0] * 1.12, col[1] * 1.08, col[2] * 1.05], false);
      canvas.cyl.call(canvas, M.mul(m, m4(0, 1.02, 0)), rad * 1.012, rad * 1.006, 0.1, 14,
        [col[0] * 0.78, col[1] * 0.8, col[2] * 0.84], false);
      quadP(cloth, m, [-0.52, 0.04, rad * 1.005], [0.52, 0.04, rad * 1.005],
        [0.46, 1.32, rad * 0.99], [-0.46, 1.32, rad * 0.99], [0.16, 0.13, 0.11]);
      for (const s of [-1, 1]) {
        quadP(canvas, m, [s * 0.52, 0, rad * 1.008], [s * 0.72, 0, rad * 0.998],
          [s * 0.68, 1.46, rad * 0.985], [s * 0.52, 1.46, rad * 1.0],
          [col[0] * 1.08, col[1] * 1.04, col[2] * 1.0]);
      }
      dark.cyl.call(dark, M.mul(m, m4(0, hw + 0.9, 0)), 0.17, 0.17, 0.06, 10, [1, 1, 1], true);
      // 屋顶支杆
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        tubeLocal(dark, m, [[Math.cos(a) * rad * 0.95, hw + 0.02, Math.sin(a) * rad * 0.95],
          [Math.cos(a) * 0.17, hw + 0.9, Math.sin(a) * 0.17]], 0.02, 3, [1, 1, 1]);
      }
      // 门前小旗
      linen.tri.call(linen, M.mul(m, m4(0.7, hw + 0.55, rad * 0.5, 0, 0.8, 0)),
        [0, 0, 0], [0.44, 0.06, 0], [0, -0.22, 0], null, [1.22, 0.68, 0.4 + rr() * 0.2]);
    }

    function tentCircus(x, z, ry, col, seed) {
      const rr = P.rng(seed || 4);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.95, hw = 1.18, apex = hw + 1.9;
      const cream = [1.25, 1.16, 0.98];
      linen.cyl.call(linen, m, rad, rad, hw, 12, col, false);
      for (let i = 0; i < 6; i++) {
        const a = (i + 0.5) / 6 * TAU;
        quadP(canvas, M.mul(m, m4(Math.cos(a) * rad * 1.01, 0, Math.sin(a) * rad * 1.01,
          0, -a + Math.PI / 2, 0)), [-0.26, 0.03, 0], [0.26, 0.03, 0],
          [0.22, hw - 0.05, 0], [-0.22, hw - 0.05, 0], cream);
      }
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
        const cc = i % 2 ? cream : col;
        linen.tri.call(linen, m,
          [Math.cos(a0) * rad * 1.04, hw, Math.sin(a0) * rad * 1.04], [0, apex, 0],
          [Math.cos(a1) * rad * 1.05, hw, Math.sin(a1) * rad * 1.05],
          [[0, 0], [0.5, 1], [1, 0]], cc);
        const am = a0 + Math.PI / 12;
        linen.tri.call(linen, m,
          [Math.cos(a0) * rad * 1.05, hw, Math.sin(a0) * rad * 1.05],
          [Math.cos(am) * rad * 0.97, hw - 0.28, Math.sin(am) * rad * 0.97],
          [Math.cos(a1) * rad * 1.05, hw, Math.sin(a1) * rad * 1.05], null,
          i % 2 ? col : cream);
      }
      // 门 + 门檐
      quadP(cloth, m, [-0.5, 0.04, rad * 0.99], [0.5, 0.04, rad * 0.99],
        [0.46, 1.15, rad * 0.955], [-0.46, 1.15, rad * 0.955], [0.15, 0.12, 0.1]);
      quadP(canvas, m, [-0.92, 1.42, rad * 0.94], [0.92, 1.42, rad * 0.94],
        [0.8, 1.06, rad * 1.32], [-0.8, 1.06, rad * 1.32], cream);
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(s * 0.8, 0, rad * 1.28)), 0.04, 0.03, 1.1, 5,
          [1, 1, 1], true);
      }
      // 尖顶旗
      dark.cyl.call(dark, M.mul(m, m4(0, apex - 0.1, 0)), 0.03, 0.022, 1.0, 5, [1, 1, 1], true);
      linen.tri.call(linen, M.mul(m, m4(0.02, apex + 0.6, 0, 0, 0.5, 0)),
        [0, 0, 0], [0.72, 0.1, 0], [0, -0.3, 0], null,
        [1.25, 0.62, 0.4 + rr() * 0.25]);
    }

    function tentSpike(x, z, ry, col, seed) {
      const rr = P.rng(seed || 5);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.34, hw = 0.55, apex = hw + 2.25;
      const cream = [1.24, 1.14, 0.96];
      linen.cyl.call(linen, m, rad, rad * 0.98, hw, 10, col, false);
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * TAU, a1 = ((i + 1) / 10) * TAU;
        linen.tri.call(linen, m,
          [Math.cos(a0) * rad * 1.02, hw, Math.sin(a0) * rad * 1.02], [0, apex, 0],
          [Math.cos(a1) * rad * 1.02, hw, Math.sin(a1) * rad * 1.02],
          [[0, 0], [0.5, 1], [1, 0]], i % 2 ? cream : col);
      }
      quadP(cloth, m, [-0.42, 0.04, rad * 0.99], [0.42, 0.04, rad * 0.99],
        [0.38, 1.02, rad * 0.97], [-0.38, 1.02, rad * 0.97], [0.15, 0.12, 0.1]);
      dark.cyl.call(dark, M.mul(m, m4(0, apex - 0.05, 0)), 0.028, 0.02, 0.7, 5, [1, 1, 1], true);
      linen.tri.call(linen, M.mul(m, m4(0, apex + 0.35, 0, 0, 0.3, 0)),
        [0, 0, 0], [0.5, 0.08, 0], [0, -0.24, 0], null, [1.2, 0.6, 0.38 + rr() * 0.2]);
    }

    function tentGable(x, z, ry, col, seed) {
      const rr = P.rng(seed || 6);
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 3.0, d = 2.6, ph = 1.5, ridge = 2.42;
      const cd = [col[0] * 0.9, col[1] * 0.9, col[2] * 0.92];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          wood.cyl.call(wood, M.mul(m, m4(sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1))),
            0.05, 0.04, ph, 5, [1, 1, 1], true);
        }
      }
      quadP(linen, m, [-w / 2, ph, -d / 2], [-w / 2, ph, d / 2], [0, ridge, d / 2],
        [0, ridge, -d / 2], col, [[0, 0], [0, 1.8], [1.4, 1.8], [1.4, 0]]);
      quadP(linen, m, [w / 2, ph, -d / 2], [0, ridge, -d / 2], [0, ridge, d / 2],
        [w / 2, ph, d / 2], cd, [[0, 0], [1.4, 0], [1.4, 1.8], [0, 1.8]]);
      linen.tri.call(linen, m, [-w / 2, ph, -d / 2], [0, ridge, -d / 2], [w / 2, ph, -d / 2],
        null, cd);
      linen.tri.call(linen, m, [-w / 2, ph, d / 2 - 0.03], [w / 2, ph, d / 2 - 0.03],
        [0, ridge, d / 2 - 0.03], null, col);
      // 前脸：挂毯当门帘
      quadP(cloth, m, [-0.95, 0.04, d / 2 - 0.02], [0.95, 0.04, d / 2 - 0.02],
        [0.62, ph + 0.75, d / 2 - 0.02], [-0.62, ph + 0.75, d / 2 - 0.02], [0.18, 0.14, 0.12]);
      quadP(carpet, m, [-0.6, 0.3, d / 2 + 0.03], [0.6, 0.3, d / 2 + 0.03],
        [0.5, 1.55, d / 2 + 0.02], [-0.5, 1.55, d / 2 + 0.02], [1.05, 0.95, 0.88]);
      // 脊杆 + 小旗
      dark.cyl.call(dark, M.mul(m, m4(0, ridge + 0.02, -d / 2 - 0.15, Math.PI / 2, 0, 0)),
        0.028, 0.022, d + 0.3, 5, [1, 1, 1], true);
      linen.tri.call(linen, M.mul(m, m4(0, ridge + 0.1, -d / 2 + 0.4, 0, Math.PI * 0.5, 0)),
        [0, 0, 0], [0.5, 0.06, 0], [0, -0.22, 0], null, [1.18, 0.58, 0.38 + rr() * 0.2]);
    }

    function tentCanopy(x, z, ry, col, seed) {
      const rr = P.rng(seed || 7);
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 3.4, d = 3.0, ph = 2.45, peak = ph + 0.5;
      const cd = [col[0] * 0.88, col[1] * 0.9, col[2] * 0.94];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          wood.cyl.call(wood, M.mul(m, m4(sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08))),
            0.055, 0.045, ph, 5, [1, 1, 1], true);
        }
      }
      const cs = [[-w / 2, ph, -d / 2], [w / 2, ph, -d / 2], [w / 2, ph, d / 2],
        [-w / 2, ph, d / 2]];
      for (let i = 0; i < 4; i++) {
        const c0 = cs[i], c1 = cs[(i + 1) % 4];
        linen.tri.call(linen, m, c0, [0, peak, 0], c1, [[0, 0], [0.5, 1], [1, 0]],
          i % 2 ? col : cd);
      }
      // 四周垂边
      for (let i = 0; i < 4; i++) {
        const c0 = cs[i], c1 = cs[(i + 1) % 4];
        quadP(canvas, m, c0, c1, [c1[0], ph - 0.4, c1[2]], [c0[0], ph - 0.4, c0[2]],
          [col[0] * 0.78, col[1] * 0.8, col[2] * 0.84]);
      }
      // 后侧挂毯 + 门口垫子
      quadP(carpet, m, [-w / 2 + 0.2, 0.06, -d / 2 + 0.02], [w / 2 - 0.2, 0.06, -d / 2 + 0.02],
        [w / 2 - 0.3, 1.9, -d / 2 + 0.02], [-w / 2 + 0.3, 1.9, -d / 2 + 0.02], [1.12, 0.96, 0.9]);
      quadP(carpet, m, [-1.3, 0.04, d / 2 - 0.02], [1.3, 0.04, d / 2 - 0.02],
        [1.1, 1.15, d / 2 - 0.02], [-1.1, 1.15, d / 2 - 0.02], [0.92, 0.86, 0.8]);
      groundQuad(carpet, x + Math.sin(ry) * 2.2, z + Math.cos(ry) * 2.2, 2.3, 1.8, ry,
        [1, 1, 1], [0, 0, 1.4, 1.1]);
      // 顶旗
      dark.cyl.call(dark, M.mul(m, m4(0, peak, 0)), 0.03, 0.022, 0.9, 5, [1, 1, 1], true);
      linen.tri.call(linen, M.mul(m, m4(0, peak + 0.62, 0, 0, 0.5, 0)),
        [0, 0, 0], [0.66, 0.09, 0], [0, -0.26, 0], null, [1.22, 0.64, 0.42 + rr() * 0.2]);
    }

    /* ============================================================
     *  摊位：棚子 + 各自货物 + 摊主/客人
     * ============================================================ */
    function booth(x, z, ry, col, idx) {
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 2.9, d = 1.55, ph = 2.12;
      const cd = [col[0] * 0.8, col[1] * 0.82, col[2] * 0.85];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          wood.cyl.call(wood, M.mul(m, m4(sx * w / 2, 0, sz * d / 2)), 0.055, 0.045, ph, 5,
            [1, 1, 1], true);
        }
      }
      wood.box.call(wood, M.mul(m, m4(0, 0.9, 0.1)), w * 0.9, 0.08, d * 0.62, [1, 1, 1], 1.3);
      quadP(canvas, m, [-w / 2, 0.08, d * 0.45], [w / 2, 0.08, d * 0.45],
        [w / 2, 0.84, d * 0.45], [-w / 2, 0.84, d * 0.45], cd,
        [[0, 0], [2.4, 0], [2.4, 1], [0, 1]]);
      quadP(canvas, m, [-w / 2, 0.05, -d / 2], [-w / 2, ph, -d / 2],
        [w / 2, ph, -d / 2], [w / 2, 0.05, -d / 2], cd,
        [[0, 0], [0, 1], [2.2, 1], [2.2, 0]]);
      const half = d / 2 + 0.45, ridge = ph + 0.52;
      quadP(canvas, m, [-w / 2 - 0.16, ph, half], [w / 2 + 0.16, ph, half],
        [w / 2 + 0.16, ridge, 0], [-w / 2 - 0.16, ridge, 0], col,
        [[0, 0], [2.8, 0], [2.8, 1.2], [0, 1.2]]);
      quadP(canvas, m, [-w / 2 - 0.16, ridge, 0], [w / 2 + 0.16, ridge, 0],
        [w / 2 + 0.16, ph, -half], [-w / 2 - 0.16, ph, -half], cd,
        [[0, 0], [2.8, 0], [2.8, 1.2], [0, 1.2]]);
      for (let i = 0; i < 7; i++) {
        const u0 = -w / 2 - 0.16 + (w + 0.32) * i / 7;
        const u1 = -w / 2 - 0.16 + (w + 0.32) * (i + 1) / 7;
        quadP(canvas, m, [u0, ph, half], [u1, ph, half], [u1, ph - 0.24, half + 0.03],
          [u0, ph - 0.24, half + 0.03], i % 2 ? cd : col);
      }
      wood.box.call(wood, M.mul(m, m4(0, 1.32, -0.55)), w * 0.82, 0.05, 0.28, [1, 1, 1], 1.3);
      wood.box.call(wood, M.mul(m, m4(0, 1.74, -0.55)), w * 0.82, 0.05, 0.08, [1, 1, 1], 1.2);
      // 顶灯
      for (const s of [-1, 1]) {
        const wp = M.xf(m, [s * w * 0.28, ph + 0.16, 0.1]);
        lantern(wp[0], wp[1], wp[2], 1.0, [1, 1, 1], wp[1] + 0.36, true);
      }
      for (let i = 0; i < 3; i++) {
        const bp = M.xf(m, [-w * 0.3 + i * w * 0.3, ph - 0.06, half - 0.02]);
        bulb.sphere.call(bulb, m4(bp[0], bp[1], bp[2]), 0.035, 5, 3, [1, 1, 1]);
        bulbGlow.quad.call(bulbGlow, m4(bp[0], bp[1], bp[2] + 0.02), 0.42, 0.42,
          [1, 1, 1], [0, 0, 1, 1]);
      }
      stallSign(x, z, ry, STALL_NAMES[idx], idx);
      return m;
    }

    function goodsGrill(m) {
      metal.box.call(metal, M.mul(m, m4(0, 1.02, 0.08)), 1.6, 0.16, 0.46, [1, 1, 1], 1.4);
      for (let i = 0; i < 12; i++) {
        const px = -0.66 + i * 0.12, pz = (r() - 0.5) * 0.24;
        const wp = M.xf(m, [px, 1.12, pz]);
        fireGlow.quad.call(fireGlow, m4(wp[0], wp[1], wp[2], -Math.PI / 2, 0, 0), 0.24, 0.18,
          [1, 1, 1], [0, 0, 1, 1]);
        metal.box.call(metal, M.mul(m, m4(px, 1.05, pz, 0, r() * TAU, 0)), 0.1, 0.06, 0.09,
          [0.36, 0.26, 0.2], 1);
      }
      for (let i = 0; i < 9; i++) {
        const px = -0.58 + i * 0.145;
        metal.box.call(metal, M.mul(m, m4(px, 1.17, 0.02, 0.06, 0, 0)), 0.026, 0.026, 0.52,
          [1, 1, 1], 1);
        for (let k = 0; k < 3; k++) {
          clay.box.call(clay, M.mul(m, m4(px, 1.15, -0.14 + k * 0.14)), 0.075, 0.06, 0.06,
            [1.05, 0.9, 0.7], 1);
        }
      }
      // 旁边的炭筐
      metal.box.call(metal, M.mul(m, m4(-1.18, 1.0, 0.2)), 0.36, 0.24, 0.28, [0.7, 0.68, 0.64], 1.2);
      clay.box.call(clay, M.mul(m, m4(-1.18, 1.14, 0.2)), 0.28, 0.04, 0.2, [0.25, 0.22, 0.2], 1);
      // 落款：摊主身后的小黑板
      quadP(cloth, m, [-0.55, 1.3, -0.72], [0.55, 1.3, -0.72], [0.55, 1.95, -0.72],
        [-0.55, 1.95, -0.72], [0.16, 0.15, 0.14]);
    }

    function goodsCocoa(m) {
      metal.cyl.call(metal, M.mul(m, m4(-0.35, 0.94, 0.06)), 0.3, 0.34, 0.38, 10,
        [1, 1, 1], true);
      metal.cyl.call(metal, M.mul(m, m4(-0.35, 1.31, 0.06)), 0.33, 0.33, 0.04, 10,
        [1, 1, 1], true);
      metal.box.call(metal, M.mul(m, m4(-0.35, 1.36, 0.06)), 0.5, 0.04, 0.06, [1, 1, 1], 1.2);
      metal.cyl.call(metal, M.mul(m, m4(0.44, 0.95, 0.04)), 0.12, 0.1, 0.3, 8, [1, 1, 1], true);
      metal.box.call(metal, M.mul(m, m4(0.53, 1.12, 0.04, 0, 0, -0.5)), 0.1, 0.2, 0.06,
        [1, 1, 1], 1.2);
      for (let i = 0; i < 5; i++) {
        clay.cyl.call(clay, M.mul(m, m4(0.03 + i * 0.13, 0.98, 0.3)), 0.048, 0.052, 0.11, 6,
          [1.1, 0.98, 0.86], true);
        metal.cyl.call(metal, M.mul(m, m4(0.03 + i * 0.13, 0.98, 0.3)), 0.04, 0.04, 0.008, 6,
          [0.3, 0.18, 0.1], true);
      }
      for (let i = 0; i < 4; i++) {
        const wp = M.xf(m, [-0.3 + i * 0.12, 1.5 + i * 0.16, 0.1]);
        smokeGlow.quad.call(smokeGlow, m4(wp[0], wp[1], wp[2], 0, r() * TAU, 0),
          0.5 + i * 0.12, 0.5 + i * 0.12, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    function goodsMerch(m) {
      const cols = [[1.25, 0.52, 0.46], [0.5, 0.78, 1.2], [1.2, 1.05, 0.5], [0.55, 1.1, 0.8],
        [1.1, 0.6, 1.15], [1.25, 0.85, 0.55]];
      for (let i = 0; i < 12; i++) {
        const px = -0.95 + (i % 6) * 0.34, py = 0.94 + Math.floor(i / 6) * 0.26;
        linen.box.call(linen, M.mul(m, m4(px, py + 0.09, 0.06, 0, r() * 0.6, 0)),
          0.18 + r() * 0.1, 0.18 + r() * 0.12, 0.16 + r() * 0.08,
          cols[i % cols.length], 2);
      }
      for (let i = 0; i < 4; i++) {
        linen.sphere.call(linen, M.mul(m, m4(-0.8 + i * 0.5, 1.08, 0.02, 0, 0, 0, 1, 1.2, 1)),
          0.1, 6, 4, [1.15, 0.85, 0.7]);
      }
      quadP(canvas, m, [-1.2, 1.55, -0.7], [-0.4, 1.55, -0.7], [-0.4, 2.0, -0.7],
        [-1.2, 2.0, -0.7], [1.2, 1.05, 0.9]);
      quadP(canvas, m, [0.4, 1.55, -0.7], [1.2, 1.55, -0.7], [1.2, 2.0, -0.7],
        [0.4, 2.0, -0.7], [0.6, 0.85, 1.15]);
    }

    function goodsGpu(m) {
      for (let i = 0; i < 4; i++) {
        const px = -0.9 + i * 0.55;
        dark.box.call(dark, M.mul(m, m4(px, 1.62, -0.66, 0, 0.1 * (i % 2 ? 1 : -1), 0)),
          0.44, 0.24, 0.05, [1, 1, 1], 1);
        metal.cyl.call(metal, M.mul(m, m4(px - 0.1, 1.62, -0.62, Math.PI / 2, 0, 0)),
          0.1, 0.1, 0.03, 8, [1, 1, 1], true);
        metal.box.call(metal, M.mul(m, m4(px + 0.18, 1.62, -0.63)), 0.06, 0.16, 0.02,
          [0.6, 0.55, 0.5], 1);
      }
      for (let i = 0; i < 4; i++) {
        dark.box.call(dark, M.mul(m, m4(-1.0 + i * 0.5, 1.0, 0.14, 0, -0.15, 0)),
          0.42, 0.05, 0.26, [0.9, 0.9, 0.95], 1);
        metal.cyl.call(metal, M.mul(m, m4(-1.1 + i * 0.5, 1.05, 0.1, Math.PI / 2, 0, 0)),
          0.11, 0.11, 0.02, 8, [1, 1, 1], true);
        brass.box.call(brass, M.mul(m, m4(-0.9 + i * 0.5, 1.09, 0.16)), 0.1, 0.012, 0.06,
          [1, 0.85, 0.4], 1);
      }
      quadP(canvas, m, [-0.8, 1.55, -0.68], [0.8, 1.55, -0.68], [0.8, 2.05, -0.68],
        [-0.8, 2.05, -0.68], [1.15, 0.95, 0.8]);
    }

    function goodsBooks(m) {
      const cols = [[0.62, 0.28, 0.24], [0.26, 0.34, 0.56], [0.4, 0.55, 0.3],
        [0.7, 0.55, 0.26], [0.45, 0.26, 0.45], [0.8, 0.74, 0.6]];
      for (let i = 0; i < 7; i++) {
        bookAt(m, -0.95 + i * 0.2, 0.94, 0.2, 0.05, 0.24, 0.17, 0.15 * (i % 3 - 1),
          cols[i % 6]);
      }
      for (let i = 0; i < 5; i++) {
        bookAt(m, -0.6 + i * 0.22, 1.18, 0.16, 0.26, 0.05, 0.19, 0.2, cols[(i + 2) % 6]);
      }
      for (let i = 0; i < 5; i++) {
        bookAt(m, -0.7 + i * 0.25, 1.23, 0.16, 0.24, 0.05, 0.18, -0.25, cols[(i + 4) % 6]);
      }
      quadP(cloth, m, [-1.0, 1.5, -0.68], [1.0, 1.5, -0.68], [1.0, 2.1, -0.68],
        [-1.0, 2.1, -0.68], [0.2, 0.28, 0.22]);
      // 台面上的小台灯
      clay.cyl.call(clay, M.mul(m, m4(1.05, 0.94, 0.22)), 0.07, 0.055, 0.14, 6, [1, 1, 1], true);
      const lp = M.xf(m, [1.05, 1.2, 0.22]);
      paper.cyl.call(paper, m4(lp[0], lp[1] - 0.09, lp[2]), 0.07, 0.1, 0.18, 8, [1, 1, 1], true);
      lampGlow.quad.call(lampGlow, m4(lp[0], lp[1], lp[2]), 0.65, 0.65, [1, 1, 1], [0, 0, 1, 1]);
    }

    function goodsMusic(m) {
      for (let i = 0; i < 3; i++) {
        const px = -0.85 + i * 0.55;
        clay.cyl.call(clay, M.mul(m, m4(px, 0.98, 0.06)), 0.22 - i * 0.03, 0.24 - i * 0.03,
          0.34, 10, [1.15, 0.9, 0.68], true);
        metal.cyl.call(metal, M.mul(m, m4(px, 1.3, 0.06)), 0.25 - i * 0.03, 0.25 - i * 0.03,
          0.02, 10, [0.85, 0.82, 0.74], true);
      }
      // 靠着的木吉他
      wood.box.call(wood, M.mul(m, m4(0.95, 1.12, -0.15, 0.25, 0.2, 0.15)), 0.34, 0.4, 0.09,
        [1, 0.85, 0.65], 1.4);
      wood.cyl.call(wood, M.mul(m, m4(0.95, 1.3, -0.15, 0.25, 0.2, 0.62)), 0.035, 0.03, 0.62,
        5, [1, 1, 1], true);
      // 檐下铜管风铃
      for (let i = 0; i < 5; i++) {
        const wp = M.xf(m, [-1.1 + i * 0.18, 1.95, 0.3]);
        brass.cyl.call(brass, m4(wp[0], wp[1] - 0.28 - (i % 3) * 0.06, wp[2]), 0.018, 0.018,
          0.28 + (i % 3) * 0.08, 5, [1, 1, 1], false);
        tubeLine(rope, [[wp[0], wp[1] - 0.28 - (i % 3) * 0.06, wp[2]], [wp[0], wp[1], wp[2]]],
          0.006, 3, [1, 1, 1]);
      }
      wood.box.call(wood, M.mul(m, m4(-0.2, 2.2, 0.3)), 1.0, 0.04, 0.04, [1, 1, 1], 1.2);
    }

    function goodsRugs(m) {
      const cols = [[1.15, 0.6, 0.5], [0.62, 0.72, 1.0], [1.1, 0.95, 0.6], [0.6, 1.0, 0.82]];
      for (let i = 0; i < 5; i++) {
        carpet.cyl.call(carpet, M.mul(m, m4(-0.95 + i * 0.32, 1.02, 0.1, 0, 0, Math.PI / 2)),
          0.12, 0.12, 0.62, 8, cols[i % 4], true);
      }
      for (let i = 0; i < 3; i++) {
        quadP(canvas, m, [-1.1 + i * 0.8, 1.55, -0.66], [-0.5 + i * 0.8, 1.55, -0.66],
          [-0.5 + i * 0.8, 2.08, -0.66], [-1.1 + i * 0.8, 2.08, -0.66], cols[i % 4]);
      }
      for (let i = 0; i < 3; i++) {
        clay.cyl.call(clay, M.mul(m, m4(0.7 + i * 0.22, 1.0, 0.18)), 0.11, 0.15, 0.2, 8,
          [1.2, 0.95, 0.65], true);
      }
      const front = M.xf(m, [0, 0, 1.55]);
      groundQuad(carpet, front[0], front[2], 1.9, 1.4, 0, [1, 1, 1], [0, 0, 1.2, 0.9]);
    }

    /* ============================================================
     *  凳子上的坐姿 / 站着的人影
     * ============================================================ */
    function personSit(x, z, ry, h, col, hatCol) {
      const s = h / 1.55;
      const m = m4(x, gH(x, z), z, 0, ry, 0);
      const head = [0.82, 0.62, 0.5];
      cloth.cyl.call(cloth, M.mul(m, m4(0, 0.3 * s, 0)), 0.15 * s, 0.22 * s, 0.5 * s, 6,
        col, true);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 0.82 * s, 0.02 * s)), 0.115 * s, 6, 4, head);
      for (const sg of [-1, 1]) {
        cloth.cyl.call(cloth, M.mul(m, m4(0.22 * s, 0.12 * s, sg * 0.12 * s, 0, 0, 1.2)),
          0.075 * s, 0.06 * s, 0.5 * s, 5, [0.22, 0.2, 0.2], false);
        cloth.cyl.call(cloth, M.mul(m, m4(0.06 * s, 0.52 * s, sg * 0.18 * s, 0.5, 0, 1.0)),
          0.05 * s, 0.045 * s, 0.28 * s, 5, col, false);
      }
      if (hatCol) {
        dark.cyl.call(dark, M.mul(m, m4(0, 0.95 * s, 0.02 * s)), 0.15 * s, 0.13 * s, 0.05 * s,
          6, hatCol, true);
      }
    }

    function personStand(x, z, ry, h, col, opts) {
      opts = opts || {};
      const s = h / 1.45;
      const lean = opts.lean || 0;
      const m = m4(x, gH(x, z), z, 0, ry, lean);
      const head = opts.skin || [0.82, 0.62, 0.5];
      cloth.cyl.call(cloth, M.mul(m, m4(0, 0.62 * s, 0)), 0.17 * s, 0.23 * s, 0.66 * s, 6,
        col, true);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 1.32 * s, 0.01 * s)), 0.115 * s, 6, 4, head);
      for (const sg of [-1, 1]) {
        cloth.cyl.call(cloth, M.mul(m, m4(sg * 0.1 * s, 0, 0)), 0.062 * s, 0.05 * s, 0.62 * s,
          5, [0.2, 0.18, 0.18], false);
        if (!opts.noArms) {
          cloth.cyl.call(cloth, M.mul(m, m4(sg * 0.23 * s, 0.7 * s, 0, 0, 0, sg * 0.16)),
            0.05 * s, 0.042 * s, 0.52 * s, 5, col, false);
        }
      }
      if (opts.hat) {
        dark.cyl.call(dark, M.mul(m, m4(0, 1.44 * s, 0.01 * s)), 0.16 * s, 0.14 * s, 0.05 * s,
          6, opts.hat, true);
      }
      if (opts.mug) {
        clay.cyl.call(clay, M.mul(m, m4(0.3 * s, 0.86 * s, 0.08 * s)), 0.04 * s, 0.045 * s,
          0.1 * s, 5, [1, 0.95, 0.85], true);
      }
    }

    /* ============================================================
     *  篝火
     * ============================================================ */
    const FIRE0 = [10.2, 15.0];
    const FIRE1 = [14.8, 26.6];
    const FIRE2 = [-1.6, 7.8];

    function campfireAt(x, z, sc, withPot) {
      P.campfire(stone, m4(x, 0, z, 0, r() * TAU, 0), 0.55 * sc,
        [0.85, 0.78, 0.68], [0.36, 0.24, 0.16]);
      fireGlow.quad.call(fireGlow, m4(x, 0.05, z, -Math.PI / 2, 0, 0), 3.4 * sc, 3.4 * sc,
        [1, 1, 1], [0, 0, 1, 1]);
      fireGlow.quad.call(fireGlow, m4(x, 0.06, z, -Math.PI / 2, 0.5, 0), 1.9 * sc, 1.9 * sc,
        [1, 1, 1], [0, 0, 1, 1]);
      for (let i = 0; i < 2; i++) {
        fireGlow.quad.call(fireGlow, m4(x, 0.85 * sc, z, 0, i * Math.PI / 2, 0),
          1.9 * sc, 2.3 * sc, [1, 1, 1], [0, 0, 1, 1]);
      }
      for (let i = 0; i < 7; i++) {
        flame.quad.call(flame, m4(x + (r() - 0.5) * 0.55 * sc, 0.42 * sc + r() * 0.16,
          z + (r() - 0.5) * 0.55 * sc, 0, r() * TAU, 0),
          (0.4 + r() * 0.26) * sc, (0.9 + r() * 0.72) * sc, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 围火的半圆木凳
      benchAt(x + 1.6 * sc, z - 0.2, 0.9, 1.5, [1, 1, 1]);
      benchAt(x - 1.2 * sc, z + 1.3 * sc, -0.4, 1.4, [1, 1, 1]);
      // 柴堆
      for (let i = 0; i < 3; i++) {
        wood.cyl.call(wood, m4(x - 1.9 * sc, 0.1 + i * 0.14, z - 0.6 + i * 0.12,
          Math.PI / 2, 0.3 + i * 0.2, 0), 0.09, 0.08, 0.8, 5, [1, 1, 1], true);
      }
      if (withPot) {
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * TAU + 0.5;
          tubeLine(dark, [[x + Math.cos(a) * 0.8, 0, z + Math.sin(a) * 0.8],
            [x, 2.0, z]], 0.035, 4, [1, 1, 1]);
        }
        tubeLine(rope, [[x, 2.0, z], [x, 1.72, z]], 0.008, 3, [1, 1, 1]);
        metal.cyl.call(metal, m4(x, 1.4, z), 0.28, 0.3, 0.3, 10, [1, 1, 1], true);
        metal.box.call(metal, m4(x, 1.73, z), 0.62, 0.03, 0.05, [1, 1, 1], 1.2);
      }
    }

    /* ============================================================
     *  串灯 / 旗串 / 晾衣绳 / 风铃 / 木桩
     * ============================================================ */
    function poleAt(x, z, h, flagCol) {
      const y = gH(x, z);
      wood.cyl.call(wood, m4(x, y, z), 0.065, 0.042, h, 5, [1, 1, 1], true);
      dark.cyl.call(dark, m4(x, y + h - 0.05, z), 0.05, 0.045, 0.1, 5, [1, 1, 1], true);
      if (flagCol) {
        linen.tri.call(linen, m4(x + 0.03, y + h - 0.08, z, 0, 0.3, 0),
          [0, 0, 0], [0.62, 0.08, 0], [0, -0.3, 0], null, flagCol);
      }
    }

    function stringLights(a, b, sag) {
      const n = 12, pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const x = a[0] + (b[0] - a[0]) * u;
        const z = a[1] + (b[1] - a[1]) * u;
        const y = a[2] + (b[2] - a[2]) * u - Math.sin(u * Math.PI) * sag;
        pts.push([x, y, z]);
        if (i > 0 && i < n) {
          const warm = r() < 0.84;
          bulb.sphere.call(bulb, m4(x, y - 0.07, z), 0.052, 5, 3,
            warm ? [1, 1, 1] : [0.72, 0.88, 1.25]);
          bulbGlow.quad.call(bulbGlow, m4(x, y - 0.07, z + 0.02), 0.64, 0.64,
            [1, 1, 1], [0, 0, 1, 1]);
        }
      }
      tubeLine(rope, pts, 0.011, 3, [0.55, 0.5, 0.44]);
    }

    function bunting(a, b, sag, n, s) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        pts.push([a[0] + (b[0] - a[0]) * u,
          a[2] + (b[2] - a[2]) * u - Math.sin(u * Math.PI) * sag,
          a[1] + (b[1] - a[1]) * u]);
      }
      tubeLine(rope, pts, 0.011, 3, [0.75, 0.66, 0.56]);
      const cols = [[1.25, 0.52, 0.44], [1.2, 0.86, 0.42], [0.52, 0.8, 1.15],
        [0.58, 1.05, 0.78], [1.12, 0.62, 0.98]];
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * u;
        const z = a[1] + (b[1] - a[1]) * u;
        const y = a[2] + (b[2] - a[2]) * u - Math.sin(u * Math.PI) * sag;
        const kk = s || 1;
        cloth.tri.call(cloth, m4(x, y, z, 0, Math.PI + (r() - 0.5) * 0.6, 0),
          [-0.11 * kk, 0, 0], [0.11 * kk, 0, 0], [0, -0.3 * kk, 0], null,
          cols[k % cols.length]);
      }
    }

    function laundryLine(x0, z0, x1, z1, h, n) {
      const y0 = gH(x0, z0), y1 = gH(x1, z1);
      for (const p of [[x0, z0], [x1, z1]]) {
        wood.cyl.call(wood, m4(p[0], gH(p[0], p[1]), p[1]), 0.045, 0.035, h, 5,
          [1, 1, 1], true);
      }
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        pts.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + h - 0.06 -
          Math.sin(u * Math.PI) * 0.28, z0 + (z1 - z0) * u]);
      }
      tubeLine(rope, pts, 0.009, 3, [1, 1, 1]);
      const cols = [[1.15, 0.6, 0.5], [0.62, 0.78, 1.1], [1.15, 1.0, 0.7], [0.7, 1.0, 0.8]];
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * u;
        const z = z0 + (z1 - z0) * u;
        const y = y0 + (y1 - y0) * u + h - 0.06 - Math.sin(u * Math.PI) * 0.28;
        const ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
        cloth.quad.call(cloth, m4(x, y - 0.34, z, 0, ry, 0), 0.46, 0.6,
          cols[i % cols.length], [0, 0, 1, 1]);
        cloth.quad.call(cloth, m4(x + Math.sin(ry) * 0.22, y - 0.28, z + Math.cos(ry) * 0.22,
          0, ry, 0), 0.2, 0.45, cols[(i + 2) % cols.length], [0, 0, 1, 1]);
      }
    }

    function chime(x, y, z, s) {
      const k = s || 1;
      dark.cyl.call(dark, m4(x, y, z), 0.22 * k, 0.25 * k, 0.03, 8, [1, 1, 1], true);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const px = x + Math.cos(a) * 0.14 * k, pz = z + Math.sin(a) * 0.14 * k;
        const len = 0.26 + (i % 3) * 0.09;
        brass.cyl.call(brass, m4(px, y - len - 0.06, pz), 0.017 * k, 0.017 * k, len * k, 5,
          [1, 1, 1], false);
        tubeLine(rope, [[px, y - len - 0.06, pz], [x + Math.cos(a) * 0.05, y, z + Math.sin(a) * 0.05]],
          0.006, 3, [1, 1, 1]);
      }
      tubeLine(rope, [[x, y, z], [x, y + 0.5, z]], 0.006, 3, [1, 1, 1]);
    }

    /* ============================================================
     *  沙滩小物：脚印 / 贝壳 / 野草 / 浮木 / 遮阳伞
     * ============================================================ */
    function footprints(x0, z0, x1, z1, n) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const x = x0 + (x1 - x0) * u + (i % 2 ? 0.16 : -0.16);
        const z = z0 + (z1 - z0) * u;
        groundQuad(sand, x, z, 0.12, 0.3, 0.2 + (i % 2 ? 0.1 : -0.1), [1, 1, 1]);
      }
    }

    function grassClump(x, z, n, h, col) {
      const y = gH(x, z);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU;
        const m = m4(x + (r() - 0.5) * 0.34, y, z + (r() - 0.5) * 0.34,
          (r() - 0.5) * 0.35, a, (r() - 0.5) * 0.5);
        leafP.quad.call(leafP, m, 0.05 + r() * 0.05, h * (0.6 + r() * 0.7), col,
          [0, 0, 1, 1]);
      }
    }

    function umbrella(x, z, ry, colA, colB) {
      const y = gH(x, z);
      wood.cyl.call(wood, m4(x, y, z, 0.06, ry, 0.08), 0.055, 0.045, 2.25, 5, [1, 1, 1], true);
      canvas.cyl.call(canvas, m4(x + 0.12, y + 2.1, z - 0.08, 0, 0, 0), 1.36, 0.05, 0.48, 12,
        colA, true);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        canvas.tri.call(canvas, m4(x + 0.12, y + 2.1, z - 0.08, 0, 0, 0),
          [Math.cos(a) * 1.35, -0.48, Math.sin(a) * 1.35],
          [Math.cos(a + 0.3) * 1.35, -0.48, Math.sin(a + 0.3) * 1.35],
          [Math.cos(a + 0.15) * 1.22, -0.76, Math.sin(a + 0.15) * 1.22], null,
          i % 2 ? colB : colA);
      }
      stone.sphere.call(stone, m4(x, y + 0.03, z, 0, 0, 0, 1.7, 0.5, 1.7), 0.22, 6, 4,
        [0.85, 0.8, 0.72]);
      groundQuad(carpet, x + Math.sin(ry) * 0.7, z + Math.cos(ry) * 0.7, 2.0, 1.5, ry,
        [1, 1, 1], [0, 0, 1.2, 0.9]);
    }

    function rowboatStatic(x, z, ry) {
      const y = gH(x, z) + 0.16;
      const m = m4(x, y, z, 0.08, ry, 0.04);
      dark.box.call(dark, M.mul(m, m4(0, 0.2, 0)), 1.3, 0.34, 2.2, [1, 1, 1], 1.3);
      quadP(dark, m, [-0.65, 0.2, 1.1], [-0.1, 0.06, 1.85], [0.1, 0.06, 1.85],
        [0.65, 0.2, 1.1], [1, 1, 1]);
      wood.box.call(wood, M.mul(m, m4(0, 0.36, -0.1)), 1.15, 0.06, 0.36, [1, 1, 1], 1.4);
      wood.box.call(wood, M.mul(m, m4(0, 0.38, 0.5)), 1.0, 0.05, 0.28, [1, 1, 1], 1.4);
      for (const s of [-1, 1]) {
        wood.box.call(wood, M.mul(m, m4(s * 0.4, 0.42, -0.25, 0.05, s * 0.12, 1.2)),
          0.06, 0.05, 2.1, [1, 1, 1], 1.3);
      }
      tubeLine(rope, [[x + Math.sin(ry) * 1.6, y + 0.1, z + Math.cos(ry) * 1.6],
        [x + 2.2, gH(x + 2.2, z) + 0.05, z + 1.4]], 0.02, 3, [1, 1, 1]);
    }

    /* ============================================================
     *  营地主布局：帐篷和地摊混着沿沙滩排开，中间留一条弯过道。
     *  - 临水一排：5 个地摊 + 2 顶帐篷，地摊背朝海、面朝营地
     *  - 靠内陆：14 顶帐篷沿一条起伏的线，面朝海
     *  - 过道里再塞 2 个地摊（还是背朝海），免得两排排得太齐
     * ============================================================ */
    const TENTS = [
      // 混在临水摊位那一排的两顶帐篷
      [-30.5, 12.9, "a", "ochre", "QWEN", 2.45],
      [14.5, 12.3, "dome", "gold", "STARCODER", 2.45],
      // 后排 14 顶：z 随 x 起伏，不是一条直线
      [-28.0, 20.5, "yurt", "cream", "MISTRAL", 2.65],
      [-23.6, 21.2, "circus", "plum", "GEMMA", 2.75],
      [-19.2, 21.6, "spike", "gold", "GLM", 2.25],
      [-14.8, 21.9, "a", "olive", "KIMI", 2.45],
      [-10.4, 21.9, "dome", "orange", "PHI", 2.45],
      [-6.0, 21.6, "yurt", "indigo", "YI", 2.65],
      [-1.6, 21.1, "circus", "teal", "DEEPSEEK", 2.75],
      [2.8, 20.4, "gable", "rust", "MINIMAX", 2.6],
      [7.2, 19.7, "canopy", "blue", "BLOOM", 2.9],
      [11.6, 19.1, "a", "sand", "FALCON", 2.45],
      [16.0, 18.6, "dome", "indigo", "RWKV", 2.45],
      [20.4, 18.4, "yurt", "rust", "BAICHUAN", 2.65],
      [24.8, 18.4, "a", "blue", "COMMAND R", 2.45],
      [29.2, 18.6, "dome", "teal", "LLAMA", 2.45]
    ];

    TENTS.forEach((t, i) => {
      const tx = t[0], tz = t[1], kind = t[2], toneName = t[3], name = t[4], dist = t[5];
      const ry = Math.PI + (r() - 0.5) * 0.14;
      const col = TENT_COL[toneName] || [1, 1, 1];
      const seed = 11 + i * 7;
      if (kind === "a") tentA(tx, tz, ry, col, seed);
      else if (kind === "dome") tentDome(tx, tz, ry, col, seed);
      else if (kind === "yurt") tentYurt(tx, tz, ry, col, seed);
      else if (kind === "circus") tentCircus(tx, tz, ry, col, seed);
      else if (kind === "spike") tentSpike(tx, tz, ry, col, seed);
      else if (kind === "gable") tentGable(tx, tz, ry, col, seed);
      else tentCanopy(tx, tz, ry, col, seed);
      tentSign(tx, tz, ry, name, i, dist);
      // 帐篷侧边的箱子 / 酒桶
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      const px = tx + ux * 1.95, pz = tz + uz * 1.95;
      if (i % 3 === 0) crateAt(px, gH(px, pz), pz, 0.46, r() * TAU, [0.95, 0.86, 0.72]);
      else if (i % 3 === 1) barrelAt(px, pz, 0.9, r() * TAU);
      else {
        crateAt(px, gH(px, pz), pz, 0.4, r() * TAU, [0.9, 0.8, 0.68]);
        barrelAt(tx + ux * 1.5 + Math.sin(ry) * 0.9, tz + uz * 1.5 + Math.cos(ry) * 0.9, 0.8, 0);
      }
      // 帐篷脚下的野草与酒瓶
      if (i % 2 === 0) {
        grassClump(tx - ux * 1.3, tz - uz * 1.3, 4, 0.34, [0.9, 1.0, 0.7]);
      }
    });

    /* ============================================================
     *  七个地摊 + 摊主与客人
     * ============================================================ */
    const STALLS = [
      // 临水一排：背朝海、面朝营地（ry≈0 时正面朝 +Z 内陆）
      [-23.0, 11.8, [1.2, 0.52, 0.42]],
      [-15.5, 12.9, [1.15, 0.86, 0.5]],
      [-8.0, 11.4, [0.55, 0.78, 1.1]],
      [-0.5, 12.7, [0.5, 0.9, 0.85]],
      [7.0, 11.6, [1.05, 0.62, 0.85]],
      // 混进帐篷排前面：两个摊，还是背朝海
      [-10.5, 15.9, [0.95, 0.8, 0.52]],
      [18.5, 15.3, [1.1, 0.6, 0.48]]
    ];
    const VENDOR_COL = [[0.36, 0.4, 0.52], [0.5, 0.32, 0.34], [0.34, 0.46, 0.38],
      [0.55, 0.46, 0.34], [0.3, 0.32, 0.44], [0.5, 0.42, 0.5], [0.42, 0.34, 0.3]];
    const CROWD_COL = [[0.42, 0.5, 0.62], [0.62, 0.42, 0.4], [0.42, 0.55, 0.44],
      [0.6, 0.52, 0.4], [0.36, 0.36, 0.5], [0.55, 0.45, 0.55],
      [0.32, 0.38, 0.36], [0.58, 0.5, 0.36]];

    STALLS.forEach((s, i) => {
      const sx = s[0], sz = s[1];
      const ry = (i % 3 - 1) * 0.11;   // 正面朝内陆（+Z），背朝海
      booth(sx, sz, ry, s[2], i);
      const m = m4(sx, 0, sz, 0, ry, 0);
      if (i === 0) goodsGrill(m);
      else if (i === 1) goodsCocoa(m);
      else if (i === 2) goodsMerch(m);
      else if (i === 3) goodsGpu(m);
      else if (i === 4) goodsBooks(m);
      else if (i === 5) goodsMusic(m);
      else goodsRugs(m);
      // 摊主站在台后（腿被台面挡住，头肩露出来），客人站在台前
      const back = M.xf(m, [0.12 * (i % 2 ? 1 : -1), 0, -0.05]);
      personStand(back[0], back[2], ry, 1.68 + (i % 2) * 0.06,
        VENDOR_COL[i % VENDOR_COL.length], { hat: i % 3 === 0 ? [0.7, 0.55, 0.3] : null });
      const front = M.xf(m, [0.55 - (i % 2) * 1.1, 0, 1.45]);
      personStand(front[0], front[2], ry + Math.PI + 0.3, 1.64,
        CROWD_COL[i % CROWD_COL.length], { mug: i === 1 });
    });

    /* ============================================================
     *  篝火与人影
     * ============================================================ */
    campfireAt(FIRE0[0], FIRE0[1], 1.0, true);
    campfireAt(FIRE1[0], FIRE1[1], 0.82, false);
    campfireAt(FIRE2[0], FIRE2[1], 0.7, false);

    const FIRE_RING0 = [0.2, 0.95, 1.75, 2.55, 3.35, 4.2, 5.05];
    FIRE_RING0.forEach((a, i) => {
      const rad = 1.55 + (i % 3) * 0.24;
      const px = FIRE0[0] + Math.cos(a) * rad;
      const pz = FIRE0[1] + Math.sin(a) * rad;
      personSit(px, pz, Math.atan2(-Math.cos(a), -Math.sin(a)) + 0.15, 1.6 + (i % 2) * 0.08,
        CROWD_COL[i % CROWD_COL.length], i % 4 === 0 ? [0.72, 0.58, 0.32] : null);
    });
    for (let i = 0; i < 3; i++) {
      const a = 0.7 + i * 1.9;
      const px = FIRE1[0] + Math.cos(a) * 1.7, pz = FIRE1[1] + Math.sin(a) * 1.7;
      personSit(px, pz, Math.atan2(-Math.cos(a), -Math.sin(a)), 1.62,
        CROWD_COL[(i + 2) % CROWD_COL.length], null);
    }
    for (let i = 0; i < 2; i++) {
      const a = 2.2 + i * 2.4;
      const px = FIRE2[0] + Math.cos(a) * 1.6, pz = FIRE2[1] + Math.sin(a) * 1.6;
      personSit(px, pz, Math.atan2(-Math.cos(a), -Math.sin(a)), 1.55,
        CROWD_COL[(i + 4) % CROWD_COL.length], null);
    }
    // 火边弹琴的、端酒的、叉腰看热闹的
    personStand(12.0, 15.1, 1.9, 1.7, CROWD_COL[1], { lean: 0.06 });
    personStand(8.9, 18.3, -1.2, 1.64, CROWD_COL[5], { hat: [0.6, 0.5, 0.32] });
    personStand(13.0, 17.6, 2.4, 1.6, CROWD_COL[3], { mug: true });
    personStand(15.9, 24.6, 1.2, 1.67, CROWD_COL[6], {});
    personStand(2.2, 30.2, 0.4, 1.62, CROWD_COL[7], {});
    personStand(-2.0, 10.4, -0.7, 1.72, CROWD_COL[2], {});
    personStand(17.1, 11.4, 2.8, 1.6, CROWD_COL[0], {});
    personStand(6.3, 23.6, 1.6, 1.58, CROWD_COL[4], {});
    personStand(10.9, 8.4, 3.0, 1.66, CROWD_COL[1], {});
    personStand(11.4, 12.1, 1.1, 1.55, CROWD_COL[5], {});
    personStand(4.0, 6.9, 0.2, 1.63, CROWD_COL[3], {});
    personStand(19.3, 7.4, 2.1, 1.7, CROWD_COL[2], { hat: [0.5, 0.42, 0.3] });

    /* ============================================================
     *  串灯 / 木杆 / 旗串 / 晾衣绳 / 风铃
     * ============================================================ */
    // 木杆沿帐篷前面排成一列，串灯就穿在杆与杆之间
    const POLES = [
      [18.2, 5.6, 3.4], [11.4, 6.8, 3.5], [16.8, 11.8, 3.6], [10.4, 12.0, 3.2],
      [-30.0, 16.8, 3.4], [-22.5, 16.8, 3.3], [-15.0, 16.8, 3.5], [-7.5, 16.8, 3.2],
      [0.0, 16.8, 3.4], [7.5, 16.8, 3.3], [15.0, 16.8, 3.5], [22.5, 16.8, 3.2],
      [30.0, 16.8, 3.4]
    ];
    const POLE_FLAG = [[1.2, 0.55, 0.45], [0.6, 0.8, 1.1], [1.2, 0.95, 0.55], null,
      null, [1.1, 0.6, 0.9], null, null, null, null, null, null, null];
    POLES.forEach((p, i) => {
      poleAt(p[0], p[1], p[2], POLE_FLAG[i]);
    });
    // 前场两条 + 帐篷排前面一整串
    stringLights([18.2, 5.6, 3.2], [11.4, 6.8, 3.3], 0.55);
    stringLights([11.4, 6.8, 3.3], [10.4, 12.0, 3.0], 0.5);
    stringLights([10.4, 12.0, 3.0], [7.5, 16.8, 3.1], 0.45);
    for (let i = 4; i < POLES.length - 1; i++) {
      const a = POLES[i], b = POLES[i + 1];
      stringLights([a[0], a[1], a[2] - 0.2], [b[0], b[1], b[2] - 0.2], 0.55);
    }

    bunting([11.7, 6.8, 3.35], [17.4, 9.0, 2.6], 0.45, 10, 1);
    bunting([16.3, 6.6, 3.35], [16.8, 11.8, 2.9], 0.5, 10, 1);
    bunting([-15.0, 18.2, 3.1], [15.0, 16.0, 3.1], 0.9, 16, 1);

    laundryLine(2.0, 23.4, 8.0, 23.4, 2.1, 4);
    laundryLine(-16.0, 23.4, -9.0, 23.4, 2.0, 3);

    chime(12.3, 3.0, 6.2, 1.0);
    chime(16.1, 2.55, 13.7, 0.85);
    chime(16.2, 3.0, 6.35, 0.9);

    /* ============================================================
     *  营地入口：拱门 + 大招牌 + 路牌 + 拴马桩
     * ============================================================ */
    function buildEntrance() {
      const ex = 14, ez = 6.4;
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, m4(ex + s * 2.7, 0, ez), 0.14, 0.1, 3.5, 8, [1, 1, 1], true);
        wood.cyl.call(wood, m4(ex + s * 2.7, 0, ez), 0.2, 0.17, 0.22, 8, [1, 1, 1], true);
        // 斜撑
        tubeLine(wood, [[ex + s * 2.7, 2.2, ez], [ex + s * 3.3, 0.15, ez - 0.7]], 0.045, 4,
          [1, 1, 1]);
        // 柱顶小旗
        linen.tri.call(linen, m4(ex + s * 2.7 + 0.04, 3.6, ez, 0, 0.4, 0),
          [0, 0, 0], [0.66, 0.09, 0], [0, -0.28, 0], null,
          s > 0 ? [1.25, 0.55, 0.44] : [0.55, 0.78, 1.15]);
      }
      wood.box.call(wood, m4(ex, 3.52, ez), 6.2, 0.2, 0.24, [1, 1, 1], 1.3);
      wood.box.call(wood, m4(ex, 3.28, ez), 6.0, 0.14, 0.16, [0.95, 0.9, 0.85], 1.3);
      // 小顶棚
      quadP(canvas, m4(ex, 0, ez), [-3.35, 3.62, -0.7], [3.35, 3.62, -0.7],
        [2.8, 3.95, 0.1], [-2.8, 3.95, 0.1], [1.32, 1.1, 0.88]);
      for (let i = 0; i < 9; i++) {
        const u0 = -3.35 + 6.7 * i / 9, u1 = -3.35 + 6.7 * (i + 1) / 9;
        quadP(canvas, m4(ex, 0, ez), [u0, 3.62, -0.7], [u1, 3.62, -0.7],
          [u1, 3.3, -0.94], [u0, 3.3, -0.94], i % 2 ? [1.25, 0.55, 0.45] : [1.3, 1.16, 0.95]);
      }
      // 大招牌
      const cfg = {
        text: "HUGGING FACE\n营地 · 许多模型的第二个家", w: 896, h: 384, bg: "#2b2016",
        fg: "#ffdaa0", size: 56, lineH: 88, border: "#8a6236", borderW: 8,
        glow: "rgba(255,200,120,.4)", glowBlur: 18
      };
      addSignBoard("entrance", cfg, ex, 2.5, ez, Math.PI, 4.6, 1.34);
      for (const s of [-1, 1]) {
        tubeLine(rope, [[ex + s * 2.0, 3.18, ez - 0.02], [ex + s * 2.0, 3.44, ez - 0.02]],
          0.009, 3, [1, 1, 1]);
      }
      stallGlow.quad.call(stallGlow, m4(ex, 2.5, ez + 0.15), 7.0, 2.6, [1, 1, 1], [0, 0, 1, 1]);
      // 门两边挂灯笼
      for (const s of [-1, 1]) {
        const lx = ex + s * 2.2, lz = ez - 0.15;
        dark.box.call(dark, m4(lx, 3.12, lz), 0.06, 0.05, 0.35, [1, 1, 1], 1);
        lantern(lx, 2.78, lz - 0.3, 1.1, [1, 1, 1], 3.1, true);
      }
      // 路牌（放在入口左柱外侧，正好卡在画面左缘）
      const dirCfg = {
        text: "篝火 ↑\n食堂 →\n码头 ←", w: 448, h: 512, bg: "#261d15", fg: "#f2d49a",
        size: 46, lineH: 96, border: "#7a5a34", borderW: 6,
        glow: "rgba(255,205,130,.3)", glowBlur: 10
      };
      const px = 16.4, pz = 4.6;
      wood.cyl.call(wood, m4(px, 0, pz), 0.07, 0.05, 2.35, 6, [1, 1, 1], true);
      addSignBoard("directions", dirCfg, px, 1.78, pz - 0.07, Math.PI, 1.06, 1.16);
      // 拴马桩 + 绳子
      for (let i = 0; i < 4; i++) {
        const hx = 8.2 + i * 1.05, hz = 3.0 + (i % 2) * 0.4;
        wood.cyl.call(wood, m4(hx, gH(hx, hz), hz), 0.06, 0.045, 1.0 + (i % 2) * 0.15, 4,
          [1, 1, 1], true);
        if (i > 0) {
          tubeLine(rope, [[hx - 1.05, gH(hx - 1.05, hz - (i % 2) * 0.4) + 0.9, hz - (i % 2) * 0.4],
            [hx, gH(hx, hz) + 0.95 + (i % 2) * 0.15, hz]], 0.012, 3, [1, 1, 1]);
        }
      }
    }
    buildEntrance();

    /* ============================================================
     *  沙滩：遮阳伞、搁浅小船、贝壳、浮木、草
     * ============================================================ */
    umbrella(9.0, 0.6, 0.4, [1.18, 0.55, 0.45], [1.2, 1.08, 0.9]);
    umbrella(4.2, -1.8, -0.3, [0.58, 0.78, 1.1], [1.15, 0.95, 0.75]);
    rowboatStatic(-3.4, 1.3, 1.15);

    // 沙滩上的毯子与坐垫
    groundQuad(cloth, 10.4, 0.9, 1.5, 1.0, 0.5, [1.2, 0.7, 0.55], [0, 0, 1, 1]);
    groundQuad(cloth, 3.0, -0.8, 1.6, 1.1, -0.4, [0.6, 0.8, 1.15], [0, 0, 1, 1]);
    groundQuad(cloth, 8.6, 2.6, 1.3, 0.9, 0.2, [1.15, 1.0, 0.65], [0, 0, 1, 1]);
    for (let i = 0; i < 3; i++) {
      const bx = 9.2 + i * 0.55, bz = 0.2 + i * 0.22;
      cloth.box.call(cloth, m4(bx, gH(bx, bz) + 0.12, bz, 0, 0.4 + i * 0.3, 0), 0.42, 0.16,
        0.32, [1.15, 0.8, 0.6], 1.4);
    }

    footprints(12.0, -3.2, 13.9, 6.0, 14);
    footprints(6.2, -2.0, 11.5, 8.0, 12);
    for (let i = 0; i < 10; i++) {
      const x = -1 + r() * 15, z = -4.5 + r() * 7;
      stone.sphere.call(stone, m4(x, gH(x, z) + 0.03, z, 0, r() * TAU, 0.2,
        1 + r() * 0.8, 0.35 + r() * 0.25, 1 + r() * 0.7), 0.2, 5, 4,
        [0.9, 0.86, 0.78]);
    }
    for (let i = 0; i < 12; i++) {
      const x = -2 + r() * 18, z = -5 + r() * 9;
      clay.sphere.call(clay, m4(x, gH(x, z) + 0.02, z, 0, r() * TAU, 0,
        1.4, 0.4, 1.1), 0.07, 5, 3, [1.15, 0.95, 0.9]);
    }
    for (let i = 0; i < 6; i++) {
      const x = -9 + r() * 26, z = 2.4 + r() * 3;
      wood.cyl.call(wood, m4(x, gH(x, z) + 0.08, z, Math.PI / 2, r() * TAU, 0.15),
        0.08 + r() * 0.07, 0.06, 1.1 + r() * 1.2, 5, [1, 1, 1], true);
    }
    for (let i = 0; i < 26; i++) {
      const x = -6 + r() * 36, z = 3.2 + r() * 31;
      grassClump(x, z, 3 + Math.floor(r() * 3), 0.3 + r() * 0.3,
        [0.85, 0.95, 0.68]);
    }
    for (let i = 0; i < 14; i++) {
      const x = -11 + r() * 5, z = -1 + r() * 9;
      grassClump(x, z, 4, 0.38 + r() * 0.3, [0.95, 1.0, 0.72]);
    }

    /* ============================================================
     *  木栈桥 + 三条会晃的渔船
     * ============================================================ */
    function buildDock() {
      const X = -8, Z0 = 2.4, Z1 = -20.0, W = 2.6, Y = 0.66;
      const n = 34;
      for (let i = 0; i < n; i++) {
        const z = Z0 + (Z1 - Z0) * (i + 0.5) / n;
        plank.box.call(plank, m4(X, Y, z, 0, (r() - 0.5) * 0.02, 0), W, 0.08,
          Math.abs(Z1 - Z0) / n * 0.9, [1, 1, 1], 1.4);
      }
      for (const s of [-1, 1]) {
        dark.box.call(dark, m4(X + s * (W / 2 - 0.06), Y - 0.13, (Z0 + Z1) / 2),
          0.12, 0.16, Math.abs(Z1 - Z0) + 0.5, [1, 1, 1], 1.5);
      }
      for (let i = 0; i <= 10; i++) {
        const z = Z0 + (Z1 - Z0) * i / 10;
        for (const s of [-1, 1]) {
          const px = X + s * (W / 2 + 0.16);
          dark.cyl.call(dark, m4(px, -1.9, z), 0.11, 0.1, Y + 1.9, 6, [1, 1, 1], true);
          tubeLine(dark, [[px, Y - 0.1, z], [px + s * 0.5, -1.2, z + 0.5]], 0.045, 4, [1, 1, 1]);
        }
      }
      for (const s of [-1, 1]) {
        const px = X + s * (W / 2 - 0.12);
        for (let i = 0; i <= 8; i++) {
          const z = Z0 - 0.5 + (Z1 - Z0 + 1.0) * i / 8;
          dark.cyl.call(dark, m4(px, Y, z), 0.055, 0.05, 1.0, 5, [1, 1, 1], true);
        }
        dark.box.call(dark, m4(px, Y + 0.98, (Z0 + Z1) / 2), 0.09, 0.09,
          Math.abs(Z1 - Z0) + 0.5, [1, 1, 1], 1.5);
        dark.box.call(dark, m4(px, Y + 0.55, (Z0 + Z1) / 2), 0.07, 0.07,
          Math.abs(Z1 - Z0) + 0.5, [1, 1, 1], 1.5);
      }
      // 系船柱
      for (const b of [[X - 1.0, 1.2], [X + 1.0, -4.4], [X - 1.0, -11.0],
        [X + 1.0, -17.4], [X, -19.4]]) {
        dark.cyl.call(dark, m4(b[0], Y, b[1]), 0.14, 0.12, 0.5, 6, [1, 1, 1], true);
        dark.sphere.call(dark, m4(b[0], Y + 0.52, b[1], 0, 0, 0, 1, 0.7, 1), 0.15, 6, 4,
          [1, 1, 1]);
      }
      // 码头尽头灯
      const ez = Z1 + 0.55;
      dark.cyl.call(dark, m4(X, Y, ez), 0.06, 0.05, 2.7, 5, [1, 1, 1], true);
      lantern(X, Y + 2.55, ez, 1.15, [1, 1, 1], Y + 2.7, true);
      beamGlow.quad.call(beamGlow, m4(X, Y + 2.35, ez + 0.3), 3.4, 4.6, [1, 1, 1],
        [0, 0, 1, 1]);
      // 台阶（从栈桥内陆端下到沙滩）
      for (let i = 0; i < 4; i++) {
        plank.box.call(plank, m4(X, Y - 0.16 * (i + 1), Z0 + 0.18 + i * 0.32), W * 0.86,
          0.07, 0.32, [1, 1, 1], 1.2);
      }
      // 码头上的杂物和灯架
      crateAt(X + 0.8, Y + 0.02, -0.5, 0.4, 0.3, [0.9, 0.85, 0.75]);
      barrelAt(X - 0.7, -8.2, 0.8, 0.4, Y);
      dark.cyl.call(dark, m4(X + 0.9, Y, -12.5), 0.045, 0.038, 1.75, 5, [1, 1, 1], true);
      lantern(X + 0.9, Y + 1.62, -12.5, 0.9, [1, 1, 1], Y + 1.78, true);
      // 码头牌
      const dc = {
        text: "码头 · DOCK", w: 384, h: 96, bg: "#241a12", fg: "#ffe0aa", size: 40,
        lineH: 44, border: "#87602f", borderW: 5, glow: "rgba(255,200,120,.35)", glowBlur: 8
      };
      addSignBoard("dock", dc, X, 1.95, 2.0, Math.PI, 1.5, 0.38);
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, m4(X + s * 0.82, Y, 2.0), 0.04, 0.032, 1.6, 4, [1, 1, 1], true);
      }
      // 码头尽头往水里的系缆
      tubeLine(rope, [[X + 1.0, Y + 0.3, -17.4], [X + 2.4, -0.2, -15.6]], 0.018, 3, [1, 1, 1]);

      // 三条渔船（会晃）
      const boats = [
        [-10.4, -5.6, Math.PI + 0.16, 0.3], [-10.9, -12.4, Math.PI - 0.12, 2.2],
        [-11.5, -18.6, Math.PI + 0.2, 4.1]
      ];
      boats.forEach((b, i) => {
        const bx = b[0], bz = b[1], bry = b[2], ph = b[3];
        const body = dyno(T.woodDark(), { tint: [1.55, 1.22, 0.95], spec: 0.3, rim: 0.3 },
          t => m4(bx + Math.sin(t * 0.4 + ph) * 0.05, -0.75 + Math.sin(t * 0.8 + ph) * 0.06,
            bz, Math.sin(t * 0.7 + ph) * 0.02, bry + Math.sin(t * 0.5 + ph) * 0.025,
            Math.sin(t * 0.9 + ph) * 0.018));
        body.box.call(body, m4(0, 0.35, 0), 1.1, 0.5, 2.9, [1, 1, 1], 1.3);
        quadP(body, M.ident(), [-0.55, 0.6, 1.45], [-0.1, 0.55, 2.2], [0.1, 0.55, 2.2],
          [0.55, 0.6, 1.45], [1, 1, 1]);
        quadP(body, M.ident(), [-0.55, 0.1, 1.45], [-0.1, 0.05, 2.2], [0.1, 0.05, 2.2],
          [0.55, 0.1, 1.45], [0.85, 0.82, 0.78]);
        body.box.call(body, m4(0, 0.62, -0.2), 1.24, 0.1, 2.3, [0.9, 0.82, 0.72], 1.2);
        body.box.call(body, m4(0, 0.74, -0.9), 0.86, 0.42, 0.9, [1.05, 0.95, 0.82], 1.2);
        body.cyl.call(body, m4(0.06, 0.66, 0.4), 0.05, 0.04, 3.1, 5, [1, 1, 1], true);
        body.box.call(body, m4(0.06, 2.5, 0.4), 1.5, 0.06, 0.06, [1, 1, 1], 1.2);
        body.box.call(body, m4(0.06, 2.15, 0.4), 1.25, 0.2, 0.14, [1.6, 1.45, 1.2], 1.2);
        // 桅顶、船头灯
        const bdx = Math.cos(bry) * 0.06 + Math.sin(bry) * 0.4;
        const bdz = -Math.sin(bry) * 0.06 + Math.cos(bry) * 0.4;
        bulb.sphere.call(bulb, m4(bx + bdx, 3.02, bz + bdz), 0.055, 5, 3, [1, 1, 1]);
        lampGlow.quad.call(lampGlow, m4(bx + bdx, 3.02, bz + bdz), 1.0, 1.0, [1, 1, 1],
          [0, 0, 1, 1]);
        if (i === 0) coolGlow.quad.call(coolGlow, m4(bx - 0.1, -0.45, bz + 1.9), 0.7, 0.5,
          [1, 1, 1], [0, 0, 1, 1]);
        // 舷灯：左红右绿
        for (const sg of [-1, 1]) {
          const lx = bx + Math.cos(bry) * sg * 0.55 + Math.sin(bry) * 1.15;
          const lz = bz - Math.sin(bry) * sg * 0.55 + Math.cos(bry) * 1.15;
          bulb.sphere.call(bulb, m4(lx, -0.12, lz), 0.04, 4, 3,
            sg > 0 ? [1.6, 0.25, 0.2] : [0.25, 1.5, 0.35]);
        }
      });
      // 系船绳
      tubeLine(rope, [[X + 1.0, Y + 0.4, -4.4], [-9.9, 0.1, -5.2]], 0.02, 3, [1, 1, 1]);
      tubeLine(rope, [[X - 1.0, Y + 0.4, -11.0], [-10.4, 0.1, -11.9]], 0.02, 3, [1, 1, 1]);
    }
    buildDock();

    /* ============================================================
     *  点精灵：火星 / 烟 / 萤火尘埃
     * ============================================================ */
    const ptsFire = [];
    for (const f of [FIRE0, FIRE1, FIRE2]) {
      for (let i = 0; i < 34; i++) {
        ptsFire.push({
          x: f[0] + (r() - 0.5) * 0.8, y: 0.25 + r() * 0.6, z: f[1] + (r() - 0.5) * 0.8,
          r: 1, g: 0.42 + r() * 0.34, b: 0.1 + r() * 0.08, a: 0.45 + r() * 0.45,
          size: 0.018 + r() * 0.035, kind: 1, speed: 0.3 + r() * 0.6,
          phase: r() * TAU, wob: 0.12 + r() * 0.28
        });
      }
    }
    for (let i = 0; i < 60; i++) {
      ptsFire.push({
        x: 3 + r() * 26, y: 0.4 + r() * 3.4, z: 4 + r() * 28,
        r: 1, g: 0.78 + r() * 0.16, b: 0.4 + r() * 0.2, a: 0.16 + r() * 0.3,
        size: 0.012 + r() * 0.02, kind: 2, speed: 0.06 + r() * 0.14,
        phase: r() * TAU, wob: 0.3 + r() * 0.5
      });
    }
    points(ptsFire, { blend: "add", yMin: 0.05, yMax: 4.2, fogNear: 9, fogFar: 48 });

    const ptsSmoke = [];
    for (const f of [FIRE0, [13.6, 10.2], [9.4, 8.6], [14.8, 25.0]]) {
      for (let i = 0; i < 16; i++) {
        ptsSmoke.push({
          x: f[0] + (r() - 0.5) * 0.5, y: 1.0 + r() * 1.4, z: f[1] + (r() - 0.5) * 0.5,
          r: 0.55, g: 0.52, b: 0.48, a: 0.07 + r() * 0.1,
          size: 0.06 + r() * 0.1, kind: 2, speed: 0.12 + r() * 0.2,
          phase: r() * TAU, wob: 0.2 + r() * 0.3
        });
      }
    }
    points(ptsSmoke, { blend: "alpha", yMin: 0.4, yMax: 4.6, fogNear: 10, fogFar: 40 });
  }
  return { build };
})();

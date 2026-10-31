/* ============================================================
 * Escape A÷ · src/art3d/world_github.js —— 大世界分区：GitHub 夜市街
 *
 * 局部坐标（由 world.js 用 D 矩阵摆到世界坐标）：
 *   原点 = 街口，世界 (-18, 0, -44)；局部 +X = 世界 +X，局部 -Z = 往街里走。
 *   街道 x ∈ [-7, 7]，z 从 +4（镜头）到 -32（街尾），路面 y = 0。
 *   街两边是 6+6 栋夜市楼房，楼下店面、楼上住人；
 *   街里 9 个风格各不相同的摊位，头顶 5 条串灯和一排纸灯笼；
 *   街尾 z≈-30.7 一座 GITHUB 牌坊，牌坊后面只留一小段垃圾/木箱/电缆，
 *   更远的过渡垃圾由 world_shit.js 的屎山负责，这里不建山。
 *
 * 本文件只往 st 里塞几何体，不碰相机 / 灯光 / 天空 / 注册。
 * ============================================================ */
"use strict";

const A3DWorldGithub = (() => {
  function build(ctx) {
    const W = ctx.W, st = ctx.st, D = ctx.D;
    const T = W.T, P = W.P, M = W.M, m4 = W.m4, TAU = W.TAU;
    const r = ctx.r;                       // 带种子的随机数，构图每次一样
    const pen = (key, tex, opts) => W.penAt(st, D, "gh." + key, tex, opts);
    const glow = (key, tex, opts) => W.glowAt(st, D, "gh." + key, tex, opts);
    const dyno = (tex, opts, fn) => W.dynoAt(st, D, tex, opts, fn);
    const points = (list, opts) => W.addPoints(st, D, list, opts);

    /* ============================================================
     *  小工具
     * ============================================================ */
    const PI = Math.PI, HPI = Math.PI / 2;
    /** 道具库直接用 Builder 的底层方法，要传 .raw 画笔、矩阵先乘好 D */
    const md = m => M.mul(D, m);
    const dm = (x, y, z, rx, ry, rz) => M.mul(D, m4(x, y, z, rx || 0, ry || 0, rz || 0));

    const Gbox = (p, x, y, z, sx, sy, sz, col, uv) =>
      p.box.call(p, m4(x, y, z), sx, sy, sz, col, uv === undefined ? 1.2 : uv);
    const GboxM = (p, m, sx, sy, sz, col, uv, sway) =>
      p.box.call(p, m, sx, sy, sz, col, uv === undefined ? 1.2 : uv, sway);
    const quadAt = (p, m, w, h, col, uv, sway) =>
      p.quad.call(p, m, w, h, col, uv || [0, 0, 1, 1], sway);
    const floorQ = (p, x, y, z, ry, w, d, col, uv) =>
      p.quad.call(p, m4(x, y, z, -HPI, ry, 0), w, d, col, uv || [0, 0, 1, 1]);
    const faceRy = side => side < 0 ? HPI : -HPI;
    /** 贴在临街立面上的盒子 / 面片。dist 是离街心的距离，越小越靠街。 */
    const wallBox = (p, side, dist, y, z, tx, sy, sz, col, uv, sway) =>
      p.box.call(p, m4(side * dist, y, z), tx, sy, sz, col, uv === undefined ? 1.2 : uv, sway);
    const wallQ = (p, side, dist, y, z, w, h, col, uv, sway) =>
      p.quad.call(p, m4(side * dist, y, z, 0, faceRy(side), 0), w, h,
        col, uv || [0, 0, 1, 1], sway);
    const cylAt = (p, x, y, z, r0, r1, h, seg, col, cap, rx, ry, rz) =>
      p.cyl.call(p, m4(x, y, z, rx || 0, ry || 0, rz || 0), r0, r1, h, seg, col, cap);
    const sphAt = (p, x, y, z, rad, su, sv, col, rx, ry, rz, sx, sy, sz) =>
      p.sphere.call(p, m4(x, y, z, rx || 0, ry || 0, rz || 0, sx, sy, sz), rad, su, sv, col);
    const tubeAt = (p, pts, rad, sides, col, sway) =>
      p.tube.call(p, M.ident(), pts, rad, sides, col, sway);

    /* ============================================================
     *  画笔：同 key 同贴图同参数 = 一个 draw call
     * ============================================================ */
    const bldA = pen("bldA", T.plasterWarm(), { tint: [1.05, 0.92, 0.82], spec: 0.12, rim: 0.22 });
    const bldB = pen("bldB", T.plaster(), { tint: [0.86, 0.95, 1.08], spec: 0.15, rim: 0.2 });
    const bldC = pen("bldC", T.plasterPale(), { tint: [1.0, 0.95, 0.87], spec: 0.1, rim: 0.18 });
    const bldD = pen("bldD", T.stone(), { tint: [0.64, 0.66, 0.7], spec: 0.18, rim: 0.22 });
    const wood = pen("wood", T.wood(), { tint: [1.02, 0.84, 0.64], spec: 0.16, rim: 0.16 });
    const woodDark = pen("woodDark", T.woodDark(), { tint: [1.0, 0.84, 0.66], spec: 0.14, rim: 0.16 });
    const metal = pen("metal", T.metal(), { tint: [0.82, 0.87, 0.95], spec: 0.5, rim: 0.22 });
    const darkMetal = pen("darkMetal", T.darkMetal(), { tint: [0.7, 0.74, 0.82], spec: 0.35, rim: 0.2 });
    const brass = pen("brass", T.brass(), { tint: [1.05, 0.88, 0.55], spec: 0.55, rim: 0.2 });
    const cloth = pen("cloth", T.fabric(), { tint: [1.02, 0.9, 0.88], spec: 0.05, rim: 0.1 });
    const canvasP = pen("canvas", T.canvasTex(), { tint: [1.0, 0.93, 0.82], spec: 0.04, rim: 0.08 });
    const paper = pen("paper", T.paper(), { tint: [1.02, 0.95, 0.8], spec: 0.04 });
    const leafB = pen("leaf", T.leaf(), { cutout: true, tint: [0.55, 0.76, 0.5], sway: 1, spec: 0.02, rim: 0.12 });
    const cable = pen("cable", null, { tint: [0.055, 0.06, 0.07], spec: 0.25 });
    const winWarm = pen("winWarm", null, { unlit: true, blend: "add", tint: [1.0, 0.7, 0.36], opacity: 0.88 });
    const winCool = pen("winCool", null, { unlit: true, blend: "add", tint: [0.48, 0.68, 1.0], opacity: 0.82 });
    const winDark = pen("winDark", null, { unlit: true, tint: [0.045, 0.055, 0.08] });
    const lanternPaper = pen("lanternPaper", T.canvasTex(), { tint: [1.45, 0.76, 0.42], emissive: [0.32, 0.13, 0.04] });
    const lanternMetal = pen("lanternMetal", T.darkMetal(), { tint: [0.3, 0.26, 0.22], spec: 0.3 });
    const bulb = pen("bulb", null, { unlit: true, blend: "add", tint: [1.0, 0.78, 0.46], opacity: 0.95 });
    const road = pen("road", T.paving(), { tint: [0.8, 0.85, 0.94], spec: 0.62, rim: 0.08 });
    const gutter = pen("gutter", T.darkMetal(), { tint: [0.5, 0.55, 0.64], spec: 0.75, rim: 0.1 });
    const vendor = pen("vendor", T.fabric(), { tint: [0.95, 0.95, 0.98], spec: 0.02 });
    const junk = pen("junk", T.darkMetal(), { tint: [0.6, 0.58, 0.52], spec: 0.25, rim: 0.2 });
    const bag = pen("bag", T.fabric(), { tint: [0.4, 0.46, 0.36], spec: 0.04 });

    /* 发光片：加法混合，靠 glowAt 摆到世界坐标 */
    const gLamp = glow("lamp", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.58, 0.26], opacity: 0.2 });
    const gWall = glow("wall", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.54, 0.24], opacity: 0.11 });
    const gNeon = glow("neon", T.glow(), { unlit: true, blend: "add", tint: [0.35, 0.7, 1.0], opacity: 0.2 });
    const gSteam = glow("steam", T.glow(), { unlit: true, blend: "alpha", tint: [0.66, 0.7, 0.78], opacity: 0.1 });
    const gPuddleW = glow("puddleW", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.6, 0.28], opacity: 0.14 });
    const gPuddleC = glow("puddleC", T.glow(), { unlit: true, blend: "add", tint: [0.38, 0.6, 1.0], opacity: 0.12 });
    const gGreen = glow("green", T.glow(), { unlit: true, blend: "add", tint: [0.55, 0.88, 0.38], opacity: 0.12 });

    /* ============================================================
     *  招牌贴图：每个 repo 一块，颜色 / 边框 / 辉光都不同
     * ============================================================ */
    const sign = (key, text, bg, fg, border, glowCol, size) => pen(key, A3DTex.sign({
      text, w: 512, h: 128, bg, fg, size: size || 54, border, borderW: 4,
      glow: glowCol, glowBlur: 14
    }), { unlit: true, tint: [1, 1, 1] });
    const sgHello = sign("sgnHello", "hello-world", "#0b1a14", "#8ef0c4", "#1e4a3a", "rgba(120,255,190,.4)");
    const sgDots = sign("sgnDots", "dotfiles", "#141014", "#ffd27a", "#4a3820", "rgba(255,190,90,.4)");
    const sgPad = sign("sgnPad", "left-pad", "#1a1014", "#ffb4a2", "#4a2a24", "rgba(255,150,120,.35)");
    const sgTiny = sign("sgnTiny", "tiny-gpt", "#140f1c", "#c9a6ff", "#3a2a54", "rgba(170,130,255,.45)", 52);
    const sgAwe = sign("sgnAwe", "awesome-llm", "#0b1522", "#7fd4ff", "#22465e", "rgba(100,200,255,.5)", 50);
    const sgVllm = sign("sgnVllm", "vllm", "#0d140d", "#a8f06a", "#2f4a20", "rgba(150,240,100,.45)", 58);
    const sgLlama = sign("sgnLlama", "llama.cpp", "#171008", "#f0d8a0", "#4a3a22", "rgba(240,200,130,.4)", 52);
    const sgRust = sign("sgnRust", "rust-lang", "#1a0e08", "#ffb07a", "#52281a", "rgba(255,140,80,.45)", 52);

    const sgVert = pen("sgnVert", A3DTex.sign({
      text: "G\nI\nT\nH\nU\nB", w: 192, h: 768, bg: "#050a12", fg: "#9ff2ff",
      size: 92, lineH: 112, border: "#1b5670", borderW: 8,
      glow: "rgba(120,235,255,.75)", glowBlur: 26
    }), { unlit: true, tint: [1, 1, 1] });

    const sgGate = pen("sgnGate", A3DTex.sign({
      text: "GITHUB", w: 1024, h: 256, bg: "#08111b", fg: "#eafcff",
      size: 152, border: "#2b6d8c", borderW: 8,
      glow: "rgba(110,215,255,.55)", glowBlur: 30
    }), { unlit: true, tint: [1, 1, 1] });

    /* ============================================================
     *  街道地面：湿石板 + 排水沟 + 井盖 + 水洼
     * ============================================================ */
    function buildStreet() {
      // 石板路比骨架地形高 3cm，避免 z-fighting；只在街区范围内铺
      road.grid.call(road, m4(0, 0.03, -12.9), 14.6, 39.6, 12, 34,
        [0.7, 0.72, 0.78], 0.62, 0.17, 0);

      for (const sx of [-1, 1]) {
        // 排水沟：一条暗槽 + 盖板
        Gbox(gutter, sx * 6.34, 0.045, -12.9, 0.5, 0.055, 39.4, [0.68, 0.74, 0.84], 1.4);
        Gbox(gutter, sx * 6.12, 0.062, -12.9, 0.06, 0.04, 39.4, [0.26, 0.29, 0.36], 1.4);
        for (let i = 0; i < 8; i++) {
          const z = 2.4 - i * 4.1;
          Gbox(gutter, sx * 6.34, 0.076, z, 0.44, 0.022, 0.46, [0.92, 0.97, 1.05], 1.2);
          for (let k = 0; k < 2; k++) {
            Gbox(gutter, sx * 6.34, 0.09, z - 0.12 + k * 0.16, 0.4, 0.018, 0.045, [0.52, 0.56, 0.64], 1);
          }
        }
      }

      // 井盖
      for (const mh of [[-1.4, -5.2], [2.3, -16.6], [-2.7, -25.0]]) {
        cylAt(darkMetal, mh[0], 0.04, mh[1], 0.42, 0.42, 0.024, 16, [0.52, 0.56, 0.64], true);
        cylAt(darkMetal, mh[0], 0.064, mh[1], 0.35, 0.35, 0.012, 16, [0.38, 0.42, 0.5], true);
      }

      // 水洼：暖色反光为主，靠街口 / 霓虹底下掺几摊冷色
      const warmPuddles = [
        [-2.5, -2.2, 0.23], [1.8, -5.8, -0.4], [-1.1, -9.4, 0.5], [2.7, -12.6, 0.2],
        [-2.8, -15.9, -0.3], [1.4, -19.2, 0.4], [-0.9, -22.6, 0.1], [2.5, -26.4, -0.2],
        [0.4, -29.4, 0.3], [-4.2, -7.0, 0.2], [4.1, -14.0, -0.5], [-3.8, -24.8, 0.35]
      ];
      warmPuddles.forEach((q, i) => {
        gPuddleW.quad.call(gPuddleW, m4(q[0], 0.056 + i * 0.0012, q[1], -HPI, q[2], 0),
          1.1 + (i % 3) * 0.7, 0.8 + (i % 4) * 0.5, [1, 1, 1], [0, 0, 2, 2]);
      });
      const coolPuddles = [
        [-4.9, -3.9, 0.15], [4.7, -7.8, -0.3], [-4.4, -17.1, 0.4], [3.7, -24.1, 0.1],
        [-4.8, -28.4, -0.2], [4.5, -30.0, 0.25]
      ];
      coolPuddles.forEach((q, i) => {
        gPuddleC.quad.call(gPuddleC, m4(q[0], 0.058 + i * 0.0011, q[1], -HPI, q[2], 0),
          0.9 + (i % 3) * 0.6, 0.7 + (i % 2) * 0.5, [1, 1, 1], [0, 0, 2, 2]);
      });
    }
    buildStreet();

    /* ============================================================
     *  楼房
     * ============================================================ */
    const rowsL = [
      { z0: 3.2, z1: -3.0, h: 8.8, d: 6.4, fx: 6.55, mat: bldA, tone: [1.06, 0.93, 0.82], shop: 0, awn: [1.15, 0.52, 0.4], balcony: false, roof: 9 },
      { z0: -3.0, z1: -9.0, h: 5.4, d: 5.6, fx: 6.72, mat: bldC, tone: [1.0, 0.96, 0.88], shop: 2, awn: [0.8, 0.6, 0.4], balcony: false, roof: 6 },
      { z0: -9.0, z1: -15.4, h: 11.6, d: 6.8, fx: 6.5, mat: bldB, tone: [0.86, 0.95, 1.07], shop: 1, awn: [0.5, 0.72, 1.0], balcony: true, roof: 3 },
      { z0: -15.4, z1: -21.6, h: 6.4, d: 5.8, fx: 6.68, mat: bldA, tone: [1.02, 0.88, 0.78], shop: 2, awn: [0.85, 0.5, 0.42], balcony: true, roof: 6 },
      { z0: -21.6, z1: -27.2, h: 10.6, d: 6.2, fx: 6.58, mat: bldD, tone: [0.72, 0.73, 0.76], shop: 0, awn: [1.05, 0.62, 0.38], balcony: false, roof: 9 },
      { z0: -27.2, z1: -31.8, h: 7.4, d: 5.2, fx: 6.74, mat: bldC, tone: [0.96, 0.93, 0.86], shop: 1, awn: [0.55, 0.7, 0.95], balcony: false, roof: 6 }
    ];
    const rowsR = [
      { z0: 3.6, z1: -2.2, h: 7.2, d: 6.0, fx: 6.6, mat: bldB, tone: [0.9, 0.98, 1.06], shop: 1, awn: [0.52, 0.7, 1.0], balcony: false, roof: 6 },
      { z0: -2.2, z1: -8.6, h: 9.4, d: 6.6, fx: 6.52, mat: bldA, tone: [1.08, 0.9, 0.78], shop: 2, awn: [0.9, 0.55, 0.4], balcony: true, roof: 9 },
      { z0: -8.6, z1: -14.9, h: 5.8, d: 5.4, fx: 6.76, mat: bldC, tone: [1.02, 0.97, 0.9], shop: 0, awn: [1.1, 0.6, 0.36], balcony: false, roof: 10 },
      { z0: -14.9, z1: -21.2, h: 10.4, d: 6.4, fx: 6.54, mat: bldD, tone: [0.74, 0.75, 0.78], shop: 1, awn: [0.5, 0.72, 1.0], balcony: false, roof: 3 },
      { z0: -21.2, z1: -27.0, h: 8.2, d: 5.8, fx: 6.66, mat: bldB, tone: [0.88, 0.96, 1.05], shop: 2, awn: [0.8, 0.55, 0.45], balcony: true, roof: 6 },
      { z0: -27.0, z1: -31.8, h: 6.0, d: 5.0, fx: 6.78, mat: bldA, tone: [1.04, 0.9, 0.8], shop: 0, awn: [1.05, 0.55, 0.4], balcony: false, roof: 6 }
    ];

    /** 楼顶水箱 */
    function addWaterTank(side, fx, cz, fw, H, zOff) {
      const tx = side * (fx + 1.9);
      const tz = cz + fw * zOff;
      const base = H + 0.62;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        cylAt(darkMetal, tx + sx * 0.55, H, tz + sz * 0.55, 0.06, 0.05, 0.66, 4, [0.5, 0.5, 0.56], true);
      }
      cylAt(metal, tx, base, tz, 0.76, 0.76, 1.42, 14, [0.72, 0.78, 0.88], true);
      cylAt(metal, tx, base + 1.42, tz, 0.8, 0.26, 0.22, 14, [0.78, 0.84, 0.92], true);
      for (const yy of [0.7]) {
        metal.torus.call(metal, m4(tx, base + yy, tz), 0.785, 0.028, 14, 4, [0.7, 0.74, 0.8]);
      }
      for (const sx of [-1, 1]) {
        cylAt(darkMetal, tx + sx * 0.45, H, tz - 0.95, 0.018, 0.018, 2.1, 3, [0.45, 0.46, 0.5], false);
      }
      for (let k = 0; k < 4; k++) {
        Gbox(darkMetal, tx, H + 0.35 + k * 0.4, tz - 0.95, 0.9, 0.03, 0.03, [0.45, 0.46, 0.5], 1);
      }
      cylAt(darkMetal, tx + 0.3, base + 1.6, tz, 0.06, 0.05, 0.5, 4, [0.5, 0.5, 0.55], true);
      // 水箱脚边一圈水渍
      gWall.quad.call(gWall, m4(tx, H + 0.04, tz, -HPI, 0, 0), 2.4, 2.0, [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 楼顶空调外机 */
    function addRoofAC(side, fx, cz, fw, H, k) {
      const ax = side * (fx + 1.1 + (k % 2) * 1.2);
      const az = cz + (k % 2 ? 0.75 : -0.6) * fw * 0.3;
      Gbox(metal, ax, H + 0.4, az, 0.88, 0.62, 0.56, [0.62, 0.66, 0.74], 1.3);
      for (let i = 0; i < 3; i++) {
        Gbox(darkMetal, ax, H + 0.22 + i * 0.12, az, 0.92, 0.03, 0.6, [0.45, 0.47, 0.52], 1.2);
      }
      metal.torus.call(metal, m4(ax - side * 0.46, H + 0.4, az, 0, HPI, 0),
        0.19, 0.02, 10, 4, [0.55, 0.57, 0.6]);
    }

    /** 楼顶天线 */
    function addAntenna(side, fx, cz, fw, H, seed) {
      const ax = side * (fx + 2.0);
      const az = cz + (seed % 2 ? 1 : -1) * fw * 0.28;
      const hh = 2.2 + (seed % 3) * 0.5;
      cylAt(darkMetal, ax, H, az, 0.03, 0.02, hh, 4, [0.4, 0.41, 0.45], true);
      for (let k = 0; k < 3; k++) {
        Gbox(darkMetal, ax, H + hh * (0.55 + k * 0.18), az, 1.0 - k * 0.2, 0.025, 0.025, [0.4, 0.41, 0.45], 1);
      }
      sphAt(bulb, ax, H + hh + 0.06, az, 0.05, 5, 4, [1, 0.25, 0.15]);
      gLamp.quad.call(gLamp, m4(ax, H + hh + 0.06, az + 0.02), 0.6, 0.6, [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 楼顶小棚子 */
    function addRoofShed(side, fx, cz, fw, H, zOff) {
      const sx0 = side * (fx + 2.7);
      const sz0 = cz + fw * zOff;
      Gbox(woodDark, sx0, H + 0.75, sz0, 2.0, 1.4, 1.6, [0.5, 0.38, 0.3], 1.3);
      GboxM(metal, m4(sx0, H + 1.55, sz0, 0.12, 0, 0.06), 2.25, 0.06, 1.95, [0.4, 0.42, 0.46], 1.3);
      quadAt(winWarm, m4(sx0 - side * 1.02, H + 0.8, sz0, 0, faceRy(side), 0), 0.55, 0.7, [1, 1, 1], [0, 0, 1, 1]);
      gWall.quad.call(gWall, m4(sx0 - side * 1.1, H + 0.8, sz0, 0, faceRy(side), 0), 1.4, 1.4, [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 二层小阳台 + 晾晒 */
    function addBalcony(side, fx, cz, fw, seed) {
      const by = 4.35 + (seed % 2) * 0.25;
      const bz = cz + (seed % 2 ? 1 : -1) * fw * 0.2;
      Gbox(woodDark, side * (fx - 0.48), by, bz, 0.95, 0.12, 1.9, [0.62, 0.48, 0.36], 1.3);
      for (let k = 0; k < 5; k++) {
        cylAt(darkMetal, side * (fx - 0.92), by + 0.02, bz - 0.8 + k * 0.4, 0.02, 0.018, 0.56, 4, [0.5, 0.5, 0.55], true);
      }
      for (const yy of [0.3, 0.56]) {
        Gbox(darkMetal, side * (fx - 0.92), by + yy, bz, 0.04, 0.04, 1.86, [0.48, 0.5, 0.55], 1.1);
      }
      for (let k = 0; k < 2; k++) {
        const zz = bz - 0.35 + k * 0.7;
        quadAt(cloth, m4(side * (fx - 0.95), by - 0.05, zz, 0, faceRy(side), 0), 0.34, 0.44,
          [0.7 + r() * 0.4, 0.5 + r() * 0.35, 0.45 + r() * 0.3], [0, 0, 1, 1], 0.4);
      }
    }

    /** 临街立面上的壁挂空调 + 冷媒管 */
    function addWallAC(side, fx, y, z) {
      wallBox(metal, side, fx - 0.28, y, z, 0.5, 0.48, 0.56, [0.66, 0.7, 0.78], 1.3);
      wallBox(darkMetal, side, fx - 0.54, y, z, 0.04, 0.4, 0.46, [0.72, 0.74, 0.8], 1.2);
      cylAt(darkMetal, side * (fx - 0.56), y, z, 0.16, 0.16, 0.02, 10, [0.32, 0.34, 0.38], true, 0, 0, HPI);
      cylAt(cable, side * (fx - 0.3), 0.03, z + 0.2, 0.018, 0.016, y - 0.3, 3, [0.2, 0.2, 0.22], false);
    }

    /** 一楼店面：0 暖光开张，1 冷光开张，2 卷帘门 */
    function buildShop(side, b, fx, cz, sw) {
      const lit = b.shop === 1 ? winCool : winWarm;
      if (b.shop === 2) {
        // 卷帘门 + 卷帘盒 + 门柱
        wallBox(metal, side, fx - 0.04, 1.25, cz, 0.07, 2.4, sw, [0.55, 0.6, 0.68], 1.5);
        for (let k = 0; k < 7; k++) {
          wallBox(metal, side, fx - 0.09, 0.34 + k * 0.33, cz, 0.035, 0.032, sw * 0.98, [1.0, 1.04, 1.1], 1.3);
        }
        wallBox(darkMetal, side, fx - 0.03, 2.62, cz, 0.26, 0.3, sw + 0.28, [0.6, 0.63, 0.7], 1.3);
        for (const zz of [cz - sw / 2 - 0.12, cz + sw / 2 + 0.12]) {
          wallBox(woodDark, side, fx - 0.08, 1.3, zz, 0.16, 2.7, 0.2, [0.62, 0.5, 0.38], 1.4);
        }
        // 门上小灯
        cylAt(darkMetal, side * (fx - 0.3), 2.85, cz, 0.05, 0.06, 0.22, 6, [0.3, 0.26, 0.2], true);
        sphAt(bulb, side * (fx - 0.3), 2.82, cz, 0.07, 6, 4, [1, 1, 1]);
        gLamp.quad.call(gLamp, m4(side * (fx - 0.36), 2.8, cz + 0.03), 1.7, 1.7, [1, 1, 1], [0, 0, 1, 1]);
        // 卷帘门上的海报 / 告示
        for (let k = 0; k < 3; k++) {
          const pz = cz - sw * 0.38 + k * sw * 0.38;
          const py = 0.95 + (k % 2) * 0.55;
          wallQ(cloth, side, fx - 0.12, py, pz, 0.42, 0.58,
            [0.9 + r() * 0.4, 0.55 + r() * 0.4, 0.45 + r() * 0.3], [0, 0, 1, 1]);
        }
        // 门口堆的箱子由 streetProps 负责
        return;
      }

      // 开张的店面：暗底 + 灯光
      wallBox(winDark, side, fx - 0.02, 1.3, cz, 0.05, 2.5, sw, [1, 1, 1], 1.1);
      wallQ(lit, side, fx - 0.09, 1.35, cz, sw * 0.9, 2.15, [1, 1, 1], [0, 0, 1, 1]);
      for (const zz of [cz - sw / 2 - 0.1, cz + sw / 2 + 0.1]) {
        wallBox(woodDark, side, fx - 0.08, 1.35, zz, 0.18, 2.75, 0.22, [0.6, 0.48, 0.36], 1.4);
      }
      wallBox(woodDark, side, fx - 0.1, 2.62, cz, 0.1, 0.16, sw + 0.6, [0.66, 0.52, 0.38], 1.4);
      wallBox(woodDark, side, fx - 0.16, 1.35, cz, 0.06, 2.2, 0.1, [0.58, 0.46, 0.34], 1.5);

      // 店内货架剪影 + 零碎商品（挡在灯光前面一点）
      for (let k = 0; k < 3; k++) {
        const yy = 0.72 + k * 0.62;
        wallBox(darkMetal, side, fx - 0.2, yy, cz, 0.1, 0.05, sw * 0.78, [0.24, 0.25, 0.28], 1.2);
        for (let j = 0; j < 2; j++) {
          const zz = cz - sw * 0.24 + j * sw * 0.48;
          wallBox(cloth, side, fx - 0.25, yy + 0.12, zz, 0.07, 0.16, 0.13,
            [0.8 + r() * 0.5, 0.6 + r() * 0.5, 0.4 + r() * 0.4], 1.2);
        }
      }

      // 门前柜台与台面小灯
      wallBox(wood, side, fx - 0.52, 0.48, cz, 0.62, 0.92, sw * 0.72, [0.62, 0.47, 0.33], 1.3);
      wallBox(woodDark, side, fx - 0.52, 0.98, cz, 0.72, 0.08, sw * 0.76, [1.0, 0.86, 0.62], 1.2);
      for (let k = 0; k < 4; k++) {
        const zz = cz - sw * 0.28 + k * sw * 0.2;
        wallBox(cloth, side, fx - 0.54, 1.12, zz, 0.2, 0.2, 0.2,
          [0.9 + r() * 0.4, 0.5 + r() * 0.4, 0.35 + r() * 0.3], 1.1);
      }

      // 斜遮阳棚：一排布条，靠街一侧低一点
      const nS = 5, span = sw * 0.95;
      for (let k = 0; k < nS; k++) {
        const zz = cz - span / 2 + (k + 0.5) * span / nS;
        const awnCol = k % 2 ? b.awn : [1.25, 1.05, 0.9];
        GboxM(cloth, m4(side * (fx - 0.6), 2.78, zz, 0, 0, side * 0.14),
          1.05, 0.05, span / nS * 0.96, awnCol, 1.3, 0.35);
      }
      GboxM(cloth, m4(side * (fx - 1.1), 2.6, cz), 0.04, 0.26, span, b.awn, 1.3, 0.6);
      // 棚下灯泡
      for (let k = 0; k < 2; k++) {
        const zz = cz + (k - 0.5) * span * 0.5;
        sphAt(bulb, side * (fx - 0.95), 2.42, zz, 0.065, 6, 4, [1, 1, 1]);
        gLamp.quad.call(gLamp, m4(side * (fx - 0.95), 2.42, zz + 0.02), 0.9, 0.9, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 门头霓虹细条
      const strip = b.shop === 1 ? winCool : winWarm;
      wallQ(strip, side, fx - 0.13, 2.86, cz, sw * 0.9, 0.055, [1, 1, 1], [0, 0, 1, 1]);

      // 冷光店门口摆一台自动贩卖机
      if (b.shop === 1) {
        const vz = cz + sw / 2 + 0.62;
        wallBox(metal, side, fx - 0.32, 1.05, vz, 0.62, 1.9, 0.85, [0.7, 0.74, 0.8], 1.3);
        wallQ(winCool, side, fx - 0.64, 1.12, vz, 0.72, 1.5, [0.55, 0.78, 1.0], [0, 0, 1, 1]);
        wallBox(darkMetal, side, fx - 0.66, 0.34, vz, 0.04, 0.3, 0.7, [0.3, 0.31, 0.34], 1.2);
      }
    }

    /** 二楼以上的窗：暖光 / 冷光 / 暗窗混合，带窗框、窗台和窗帘 */
    function addWindows(side, b, fx, cz, fw, H) {
      const floors = Math.max(1, Math.floor((H - 4.0) / 1.62));
      const cols = Math.max(2, Math.min(5, Math.round((fw - 1.4) / 1.55)));
      const span = fw - 1.55;
      for (let f = 0; f < floors; f++) {
        const wy = 4.05 + f * 1.62;
        if (wy > H - 0.7) break;
        for (let c = 0; c < cols; c++) {
          const wz = cz - span / 2 + (c + 0.5) * span / cols;
          wallBox(woodDark, side, fx - 0.03, wy, wz, 0.1, 1.08, 0.92, [0.72, 0.6, 0.46], 1.4);
          const rr = r();
          const wp = rr < 0.42 ? winWarm : rr < 0.68 ? winCool : winDark;
          const bright = 0.88 + r() * 0.22;
          wallQ(wp, side, fx - 0.1, wy, wz, 0.79, 0.96,
            [bright, bright, bright], [0, 0, 1, 1]);
          wallBox(bldD, side, fx - 0.1, wy - 0.6, wz, 0.2, 0.07, 0.99, [0.78, 0.75, 0.69], 1.3);
          if (wp !== winDark && r() < 0.4) {
            wallQ(cloth, side, fx - 0.115, wy + 0.27, wz, 0.77, 0.38,
              [0.5 + r() * 0.5, 0.35 + r() * 0.4, 0.34 + r() * 0.3], [0, 0, 1, 1]);
          }
        }
      }
    }

    /** 一整栋楼：楼体 + 店面 + 窗 + 屋顶杂物 */
    function buildBuilding(side, b) {
      const fw = b.z0 - b.z1;
      const cz = (b.z0 + b.z1) / 2;
      const fx = b.fx, d = b.d, H = b.h;
      const cx = side * (fx + d / 2);
      const col = b.tone;

      b.mat.box.call(b.mat, m4(cx, H / 2, cz), d, H, fw, col, 1.1);
      // 勒脚 / 檐口 / 女儿墙
      wallBox(bldD, side, fx - 0.07, 0.3, cz, 0.16, 0.6, fw - 0.06, [0.52, 0.54, 0.58], 1.4);
      wallBox(bldD, side, fx - 0.12, H - 0.22, cz, 0.34, 0.36, fw + 0.12, [0.66, 0.64, 0.6], 1.3);
      const pc = [col[0] * 0.92 + 0.05, col[1] * 0.92 + 0.05, col[2] * 0.92 + 0.05];
      wallBox(b.mat, side, fx - 0.06, H + 0.3, cz, 0.2, 0.62, fw, pc, 1.3);
      Gbox(b.mat, cx, H + 0.3, cz - fw / 2 + 0.1, d, 0.62, 0.2, pc, 1.3);
      Gbox(b.mat, cx, H + 0.3, cz + fw / 2 - 0.1, d, 0.62, 0.2, pc, 1.3);
      Gbox(b.mat, side * (fx + d - 0.1), H + 0.3, cz, 0.2, 0.62, fw, pc, 1.3);

      const sw = Math.min(fw - 1.5, 3.7);
      buildShop(side, b, fx, cz, sw);
      addWindows(side, b, fx, cz, fw, H);

      // 立面上的落水管、壁挂空调、乱七八糟的电缆
      const pz = cz + fw * 0.4;
      cylAt(darkMetal, side * (fx - 0.07), 0.03, pz, 0.055, 0.05, H, 5, [0.45, 0.45, 0.5], true);
      for (let k = 0; k < 2; k++) {
        wallBox(darkMetal, side, fx - 0.05, 1.2 + k * 2.0, pz, 0.16, 0.06, 0.16, [0.35, 0.36, 0.4], 1.1);
      }
      if (r() < 0.8) addWallAC(side, fx, 4.1 + r() * 1.6, cz + (r() - 0.5) * (fw - 2.2));
      if (r() < 0.7) {
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          pts.push([side * (fx - 0.09), 5.0 + Math.sin(k * 1.7 + b.z0) * 0.28, b.z0 - (k / 6) * fw]);
        }
        tubeAt(cable, pts, 0.012, 4, [1, 1, 1]);
      }

      // 二层晾衣杆 / 小阳台
      if (b.balcony) addBalcony(side, fx, cz, fw, Math.round(b.z0 * 7));

      // 屋顶：水箱 / 空调 / 天线 / 小棚
      if (b.roof & 1) addWaterTank(side, fx, cz, fw, H, 0.12);
      if (b.roof & 2) {
        addRoofAC(side, fx, cz, fw, H, 0);
      }
      if (b.roof & 4) {
        addAntenna(side, fx, cz, fw, H, Math.round(b.z0 * 13));
      }
      if (b.roof & 8) addRoofShed(side, fx, cz, fw, H, -0.12);

      // 楼面上斜挂的布幡，给两侧加点颜色
      if (r() < 0.55) {
        const bz = cz + (r() - 0.5) * fw * 0.4;
        const by = 4.6 + r() * 1.2;
        wallQ(cloth, side, fx - 0.14, by, bz, 0.5, 1.5,
          [0.85 + r() * 0.3, 0.35 + r() * 0.35, 0.3 + r() * 0.3], [0, 0, 1, 1], 0.5);
      }
    }

    /** 背面装饰：后门、门灯、后窗、空调、落水管、电线、晾衣绳、后巷杂物。
     *  主标题那侧看到的正是这一面，别让它是一排光板。 */
    function buildBack(side, b) {
      const fw = b.z0 - b.z1, cz = (b.z0 + b.z1) / 2;
      const bx = b.fx + b.d;                 // 背面到街心的距离
      const H = b.h;
      const ry = faceRy(-side);              // 朝街外
      const bq = (p, dist, y, z, w, h, uv) =>
        p.quad.call(p, m4(side * dist, y, z, 0, ry, 0), w, h, [1, 1, 1], uv || [0, 0, 1, 1]);
      const bb = (p, dist, y, z, tx, sy, sz, col, uv) =>
        p.box.call(p, m4(side * dist, y, z), tx, sy, sz, col, uv === undefined ? 1.2 : uv);

      // 后门 + 门口小台阶
      const dz = cz + (r() - 0.5) * fw * 0.5;
      bb(woodDark, bx + 0.05, 1.03, dz, 0.14, 2.06, 1.02, [0.5, 0.42, 0.35], 1.3);
      bb(bldD, bx + 0.14, 0.09, dz, 0.36, 0.18, 1.36, [0.5, 0.5, 0.54], 1.4);
      // 门楣小灯 + 门口一片暖光
      bb(darkMetal, bx + 0.16, 2.62, dz + 0.72, 0.18, 0.12, 0.18, [0.4, 0.42, 0.46], 1.2);
      bq(bulb, bx + 0.28, 2.48, dz + 0.72, 0.24, 0.24);
      bq(gLamp, bx + 0.3, 2.48, dz + 0.72, 2.2, 2.2);
      bq(gWall, bx + 0.06, 1.7, dz + 0.2, 2.6, 2.6);
      // 门上的小雨棚
      bb(darkMetal, bx + 0.34, 2.78, dz + 0.1, 0.8, 0.08, 1.5, [0.32, 0.33, 0.37], 1.3);

      // 背面女儿墙：和街面一侧对齐，屋顶轮廓才收得住
      const pc = [b.tone[0] * 0.92 + 0.05, b.tone[1] * 0.92 + 0.05, b.tone[2] * 0.92 + 0.05];
      bb(b.mat, bx + 0.06, H + 0.3, cz, 0.2, 0.62, fw, pc, 1.3);

      // 后窗：有的亮着，有的黑着
      const nw = 3 + Math.floor(r() * 3);
      for (let i = 0; i < nw; i++) {
        const wy = 2.5 + r() * Math.max(1.0, H - 4.0);
        const wz = cz + (r() - 0.5) * fw * 0.72;
        const k = r();
        const wp = k < 0.42 ? winWarm : k < 0.7 ? winCool : winDark;
        bq(wp, bx + 0.03, wy, wz, 0.66 + r() * 0.3, 0.86 + r() * 0.3);
        if (k < 0.42) bq(gWall, bx + 0.05, wy, wz, 1.8, 1.8);
      }

      // 竖向壁柱：把光板墙打碎
      if (r() < 0.6) {
        for (const off of [-0.32, 0.32]) {
          bb(b.mat, bx + 0.08, H / 2, cz + fw * off, 0.24, H, 0.34,
            [b.tone[0] * 1.08, b.tone[1] * 1.08, b.tone[2] * 1.12], 1.2);
        }
      }

      // 铁爬梯（检修用）
      if (r() < 0.4) {
        const lz = cz + fw * 0.3;
        for (const sx of [-0.22, 0.22]) {
          cylAt(darkMetal, side * (bx + 0.14), 0.15, lz + sx, 0.02, 0.02, H - 1.0, 4, [0.35, 0.36, 0.4], true);
        }
        for (let k = 0; k < 6; k++) {
          bb(darkMetal, bx + 0.14, 1.5 + k * 1.05, lz, 0.05, 0.04, 0.46, [0.35, 0.36, 0.4], 1.1);
        }
      }


      // 壁挂空调 + 冷凝水管
      if (r() < 0.65) {
        const ay = 3.3 + r() * 2.4, az = cz + (r() - 0.5) * fw * 0.55;
        bb(metal, bx + 0.3, ay, az, 0.5, 0.48, 0.56, [0.66, 0.7, 0.78], 1.3);
        bb(darkMetal, bx + 0.56, ay, az, 0.04, 0.4, 0.46, [0.72, 0.74, 0.8], 1.2);
        cylAt(darkMetal, side * (bx + 0.42), 0.03, az + 0.34, 0.018, 0.016,
          Math.max(0.4, ay - 0.5), 3, [0.2, 0.2, 0.22], false);
      }

      // 背面的落水管
      cylAt(darkMetal, side * (bx + 0.07), 0.03, cz + fw * 0.44, 0.05, 0.045, H, 5, [0.45, 0.45, 0.5], true);

      // 墙上贴的小海报 / 电表箱
      if (r() < 0.55) {
        bq(paper, bx + 0.04, 1.55 + r() * 1.3, cz + (r() - 0.5) * fw * 0.6, 0.44, 0.58);
      }
      bb(darkMetal, bx + 0.09, 2.2, cz - fw * 0.3, 0.2, 0.5, 0.38, [0.4, 0.42, 0.46], 1.3);

      // 背面拉到檐口的电线
      if (r() < 0.7) {
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          pts.push([side * (bx + 0.09), 4.4 + Math.sin(k * 1.9 + b.z0) * 0.3, b.z0 - (k / 6) * fw]);
        }
        tubeAt(cable, pts, 0.011, 4, [1, 1, 1]);
      }

      // 晾衣绳 + 几件衣服
      if (r() < 0.5) {
        const yy = 3.1 + r() * 1.1, zz = cz + fw * 0.16;
        bb(darkMetal, bx + 0.34, yy, zz, 0.06, 0.06, 2.9, [0.5, 0.5, 0.55], 1.1);
        bb(darkMetal, bx + 0.16, yy, zz - 1.35, 0.36, 0.05, 0.05, [0.5, 0.5, 0.55], 1.1);
        bb(darkMetal, bx + 0.16, yy, zz + 1.35, 0.36, 0.05, 0.05, [0.5, 0.5, 0.55], 1.1);
        for (let i = 0; i < 4; i++) {
          bq(cloth, bx + 0.37, yy - 0.34, zz - 0.95 + i * 0.63, 0.44, 0.6);
        }
      }

      // 后巷杂物：纸箱 / 垃圾桶
      if (r() < 0.55) {
        P.crate(wood.raw, dm(side * (bx + 0.55), 0.2, cz + (r() - 0.5) * fw * 0.6, 0, r() * TAU, 0), 0.32, [0.55, 0.42, 0.3]);
      }
      if (r() < 0.4) {
        cylAt(darkMetal, side * (bx + 0.5), 0.03, cz - fw * 0.26, 0.22, 0.2, 0.62, 10, [0.42, 0.45, 0.52], true);
      }
    }

    for (const b of rowsL) buildBuilding(-1, b);
    for (const b of rowsR) buildBuilding(1, b);

    /* ============================================================
     *  灯笼 / 吊牌小工具
     * ============================================================ */
    function lanternAt(x, y, z, rad, tint) {
      rad = rad || 0.2;
      P.paperLantern(lanternPaper.raw, lanternMetal.raw, md(m4(x, y, z)), rad, tint || [1, 1, 1]);
      // 吊绳
      cylAt(cable, x, y + rad * 1.15, z, 0.008, 0.008, 0.4, 3, [0.08, 0.08, 0.09], false);
      cylAt(darkMetal, x, y - rad * 1.35, z, 0.022, 0.012, 0.22, 4, [0.45, 0.3, 0.18], false);
      gLamp.quad.call(gLamp, m4(x, y, z + 0.06), rad * 8, rad * 8, [1, 1, 1], [0, 0, 1, 1]);
      // 灯笼暖光顺手抹在旁边的墙上
      if (Math.abs(x) > 2.8) {
        gWall.quad.call(gWall, m4(Math.sign(x) * 6.3, y - 0.1, z, 0, faceRy(Math.sign(x)), 0),
          3.2, 2.2, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    /** 便宜的小纸灯笼：山珍海味版（P.paperLantern）留给主灯笼，这些用来补密度 */
    function cheapLantern(x, y, z, rad) {
      lanternPaper.sphere.call(lanternPaper, m4(x, y, z, 0, 0, 0, 1, 1.15, 1), rad, 10, 7, [1, 1, 1]);
      cylAt(cable, x, y + rad * 1.15, z, 0.008, 0.008, 0.38, 3, [0.08, 0.08, 0.09], false);
      cylAt(darkMetal, x, y + rad * 1.1, z, rad * 0.36, rad * 0.36, 0.03, 6, [0.2, 0.15, 0.1], true);
      cylAt(darkMetal, x, y - rad * 1.15, z, rad * 0.3, rad * 0.3, 0.02, 6, [0.2, 0.15, 0.1], true);
      gLamp.quad.call(gLamp, m4(x, y, z + 0.05), rad * 7, rad * 7, [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 吊牌：从墙里伸出两根横杆，牌子朝街口（+Z），走过时正好读到 */
    function bladeSign(p, side, y, z, w, h) {
      const wallDist = 6.62;
      const sx = side * (wallDist - 1.28);
      quadAt(p, m4(sx, y, z, 0, side < 0 ? 0.05 : -0.05, 0), w, h, [1, 1, 1], [0, 0, 1, 1]);
      GboxM(woodDark, m4(sx, y, z - 0.035, 0, side < 0 ? 0.05 : -0.05, 0),
        w + 0.14, h + 0.14, 0.07, [0.6, 0.48, 0.36], 1.2);
      for (const sgn of [-1, 1]) {
        cylAt(metal, sx, y + h / 2 + 0.05, z + sgn * w * 0.35,
          0.016, 0.016, 1.22, 4, [0.5, 0.5, 0.55], false, 0, 0, side < 0 ? HPI : -HPI);
      }
      // 牌子下沿掉一颗小灯泡
      sphAt(bulb, sx, y - h / 2 - 0.1, z + 0.04, 0.05, 5, 4, [1, 1, 1]);
      gLamp.quad.call(gLamp, m4(sx, y - h / 2 - 0.1, z + 0.06), 0.9, 0.9, [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 街口 / 街中两块竖向 GITHUB 霓虹 */
    function buildMouthNeon() {
      const signSpecs = [
        { side: -1, y: 3.62, z: -4.5, w: 0.84, h: 3.36 },
        { side: 1, y: 3.38, z: -13.4, w: 0.6, h: 2.4 }
      ];
      for (const s of signSpecs) {
        const sx = s.side * (6.62 - 1.15);
        // 牌子本体
        quadAt(sgVert, m4(sx, s.y, s.z, 0, s.side < 0 ? 0.03 : -0.03, 0),
          s.w, s.h, [1, 1, 1], [0, 0, 1, 1]);
        GboxM(darkMetal, m4(sx, s.y, s.z - 0.05, 0, s.side < 0 ? 0.03 : -0.03, 0),
          s.w + 0.12, s.h + 0.12, 0.08, [0.12, 0.15, 0.2], 1.2);
        // 蓝色辉光
        gNeon.quad.call(gNeon, m4(sx, s.y, s.z + 0.08), s.w * 2.6, s.h * 1.25, [1, 1, 1], [0, 0, 1, 1]);
        // 上下横杆固定到墙
        for (const yy of [s.y - s.h * 0.42, s.y + s.h * 0.42]) {
          cylAt(metal, sx, yy, s.z, 0.02, 0.02, 1.15, 4, [0.5, 0.52, 0.58], false, 0, 0, s.side < 0 ? HPI : -HPI);
        }
      }
    }
    buildMouthNeon();

    /* ============================================================
     *  摊位 1：布棚手办摊（hello-world）
     * ============================================================ */
    function stallFigures() {
      const x = -4.05, z = -0.8, side = -1;
      const sm = m4(x, 0.03, z, 0, HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      P.stall(wood.raw, canvasP.raw, md(sm), 2.8, 1.5, [1.15, 0.78, 0.68], [0.34, 0.22, 0.16]);
      // 两层手办架
      GboxM(wood, F(0, 1.04, 0.05), 2.3, 0.07, 0.55, [0.85, 0.7, 0.52], 1.4);
      GboxM(wood, F(0, 1.22, -0.12), 2.1, 0.05, 0.34, [0.9, 0.72, 0.5], 1.4);
      for (let i = 0; i < 7; i++) {
        const lx = -0.95 + i * 0.32;
        const top = i % 2 === 0;
        const ly = top ? 1.27 : 1.1;
        const lz = top ? -0.12 : 0.05;
        const mm = F(lx, ly, lz, 0, (r() - 0.5) * 0.5, 0);
        GboxM(cloth, mm, 0.12, 0.17, 0.08,
          [0.85 + r() * 0.7, 0.6 + r() * 0.5, 0.55 + r() * 0.5], 1.2);
        paper.sphere.call(paper, M.mul(mm, m4(0, 0.14, 0)), 0.047, 6, 4, [1, 0.95, 0.9]);
      }
      // 价签
      for (let i = 0; i < 3; i++) {
        quadAt(paper, F(-0.7 + i * 0.7, 1.015, 0.34, -HPI, (r() - 0.5) * 0.4, 0), 0.16, 0.11, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 棚下暖光
      gLamp.quad.call(gLamp, m4(x - 0.3, 2.0, z, -HPI, 0, 0), 2.6, 1.4, [1, 1, 1], [0, 0, 1, 1]);
      // 摊主
      P.figure(vendor.raw, FD(0.15, 0, -0.92, 0, -0.4, 0), [0.16, 0.15, 0.18], { h: 1.62 });
      bladeSign(sgHello, side, 3.04, z, 1.7, 0.42);
      // 旁边两箱货
      P.crate(wood.raw, dm(-5.55, 0.23, 0.9, 0, 0.4, 0), 0.4, [0.56, 0.43, 0.3]);
      P.crate(wood.raw, dm(-5.15, 0.18, 1.35, 0, 1.1, 0), 0.3, [0.5, 0.39, 0.28]);
    }
    stallFigures();

    /* ============================================================
     *  摊位 2：木亭贴纸摊（dotfiles）
     * ============================================================ */
    function stallKiosk() {
      const x = 4.05, z = -3.6, side = 1;
      const sm = m4(x, 0.03, z, 0, -HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      // 四根木柱 + 背板 + 柜台
      for (const sx of [-1.35, 1.35]) for (const sz of [-0.76, 0.76]) {
        woodDark.cyl.call(woodDark, F(sx, 0, sz), 0.07, 0.06, 2.16, 6, [0.75, 0.62, 0.48], true);
      }
      GboxM(woodDark, F(0, 1.08, -0.78), 2.7, 2.1, 0.08, [0.55, 0.42, 0.3], 1.2);
      GboxM(woodDark, F(0, 0.47, 0.15), 2.5, 0.86, 0.68, [0.6, 0.45, 0.32], 1.3);
      GboxM(wood, F(0, 0.94, 0.15), 2.6, 0.08, 0.76, [0.95, 0.78, 0.55], 1.2);
      // 小料架
      GboxM(wood, F(0, 1.55, -0.6), 2.4, 0.06, 0.3, [0.85, 0.68, 0.48], 1.2);
      // 两坡小顶
      GboxM(woodDark, F(0, 2.43, 0.44, 0.27, 0, 0), 3.05, 0.06, 0.98, [0.55, 0.4, 0.28], 1.3);
      GboxM(woodDark, F(0, 2.43, -0.44, -0.27, 0, 0), 3.05, 0.06, 0.98, [0.55, 0.4, 0.28], 1.3);
      GboxM(darkMetal, F(0, 2.52, 0), 3.15, 0.07, 0.1, [0.45, 0.46, 0.5], 1.2);
      // 檐下灯泡
      for (let k = 0; k < 3; k++) {
        const lx = -0.9 + k * 0.9;
        bulb.sphere.call(bulb, F(lx, 2.28, 0.85), 0.055, 5, 4, [1, 1, 1]);
        gLamp.quad.call(gLamp, F(lx, 2.28, 0.88), 0.8, 0.8, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 贴纸展示板：三块竖板，板上一格格彩色贴纸
      for (let b = 0; b < 3; b++) {
        const lx = -0.85 + b * 0.85;
        GboxM(woodDark, F(lx, 1.62, -0.56), 0.74, 0.86, 0.05, [0.4, 0.3, 0.22], 1.2);
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 2; j++) {
            quadAt(cloth, F(lx - 0.24 + i * 0.16, 1.44 + j * 0.34, -0.53),
              0.12, 0.14,
              [0.6 + r() * 0.7, 0.5 + r() * 0.6, 0.5 + r() * 0.6], [0, 0, 1, 1]);
          }
        }
      }
      // 台上散落的贴纸卷
      for (let k = 0; k < 5; k++) {
        cloth.cyl.call(cloth, F((r() - 0.5) * 1.8, 1.0, (r() - 0.5) * 0.5), 0.05, 0.05, 0.04, 8,
          [0.8 + r() * 0.6, 0.5 + r() * 0.5, 0.4 + r() * 0.5], true);
      }
      P.figure(vendor.raw, FD(0.1, 0, -0.5, 0, 0.3, 0), [0.18, 0.16, 0.2], { h: 1.58 });
      bladeSign(sgDots, side, 3.0, z, 1.65, 0.41);
      P.crate(wood.raw, dm(5.7, 0.2, -2.2, 0, 0.7, 0), 0.36, [0.55, 0.42, 0.3]);
      P.crate(wood.raw, dm(5.5, 0.15, -2.7, 0, 1.4, 0), 0.28, [0.5, 0.38, 0.27]);
    }
    stallKiosk();

    /* ============================================================
     *  摊位 3：推车饭团摊（left-pad）
     * ============================================================ */
    function stallCart() {
      const x = -3.95, z = -6.6, side = -1;
      const sm = m4(x, 0.03, z, 0, HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      // 车斗 / 台面
      GboxM(woodDark, F(0, 0.62, 0), 1.9, 0.72, 0.95, [0.55, 0.4, 0.28], 1.3);
      GboxM(metal, F(0, 1.0, 0), 2.0, 0.07, 1.02, [0.75, 0.8, 0.88], 1.2);
      GboxM(metal, F(0, 0.62, 0.48), 1.9, 0.55, 0.03, [0.6, 0.64, 0.72], 1.2);
      // 两个大轮子 + 小前轮
      for (const sz of [-1, 1]) {
        woodDark.torus.call(woodDark, F(-0.32, 0.35, sz * 0.55, HPI, 0, 0),
          0.33, 0.035, 12, 4, [0.4, 0.27, 0.16]);
        GboxM(metal, F(-0.32, 0.35, sz * 0.57, 0, 0, 0.5), 0.5, 0.036, 0.036, [0.5, 0.5, 0.54], 1.2);
        GboxM(metal, F(-0.32, 0.35, sz * 0.57, 0, 0, -0.5), 0.5, 0.036, 0.036, [0.5, 0.5, 0.54], 1.2);
      }
      woodDark.cyl.call(woodDark, F(0.88, 0.33, 0, HPI, 0, 0), 0.16, 0.14, 0.08, 10, [0.4, 0.28, 0.17], true);
      // 推把
      wood.tube.call(wood, F(0, 0, 0), [[-0.95, 1.0, 0], [-1.2, 1.35, 0], [-1.32, 1.5, 0]], 0.028, 5, [0.6, 0.45, 0.3]);
      // 棚子：四根细杆 + 两块彩色顶
      for (const sx of [-0.92, 0.92]) for (const sz of [-0.55, 0.55]) {
        woodDark.cyl.call(woodDark, F(sx, 1.05, sz), 0.028, 0.024, 1.25, 4, [0.55, 0.42, 0.3], true);
      }
      GboxM(cloth, F(0, 2.32, 0.3, 0.12, 0, 0), 2.15, 0.04, 0.75, [0.9, 0.55, 0.42], 1.3, 0.4);
      GboxM(cloth, F(0, 2.32, -0.3, -0.12, 0, 0), 2.15, 0.04, 0.75, [1.2, 0.9, 0.7], 1.3, 0.4);
      GboxM(cloth, F(0, 2.17, 0.66), 2.15, 0.22, 0.03, [1.25, 0.85, 0.6], 1.3, 0.6);
      // 饭团：白色小球压扁 + 海苔
      GboxM(woodDark, F(0, 1.05, 0.2), 1.0, 0.04, 0.55, [0.8, 0.65, 0.46], 1.2);
      for (let i = 0; i < 5; i++) {
        const lx = -0.38 + i * 0.19;
        paper.sphere.call(paper, F(lx, 1.14, 0.2, 0, r() * TAU, 0, 1.05, 0.82, 1),
          0.078, 6, 4, [1, 1, 0.94]);
        GboxM(darkMetal, F(lx, 1.1, 0.26), 0.09, 0.075, 0.012, [0.05, 0.08, 0.06], 1);
      }
      // 招牌小灯
      bulb.sphere.call(bulb, F(-0.4, 2.02, 0.55), 0.06, 5, 4, [1, 1, 1]);
      gLamp.quad.call(gLamp, F(-0.4, 2.0, 0.58), 1.3, 1.3, [1, 1, 1], [0, 0, 1, 1]);
      // 摊主
      P.figure(vendor.raw, FD(1.15, 0, 0.05, 0, -1.2, 0), [0.17, 0.16, 0.19], { h: 1.6 });
      bladeSign(sgPad, side, 2.86, z, 1.55, 0.39);
      // 旁边的桶与箱
      cylAt(darkMetal, -5.55, 0.03, -5.6, 0.24, 0.24, 0.62, 12, [0.4, 0.43, 0.5], true);
      P.crate(wood.raw, dm(-5.5, 0.19, -7.7, 0, 0.3, 0), 0.34, [0.55, 0.42, 0.3]);
    }
    stallCart();

    /* ============================================================
     *  摊位 4：小吃摊（tiny-gpt）—— 烤架 / 蒸笼 / 汤锅
     * ============================================================ */
    function stallFood() {
      const x = 4.4, z = -9.2, side = 1;
      const sm = m4(x, 0.03, z, 0, -HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      // 长条柜台 + 后架
      GboxM(woodDark, F(0, 0.46, 0.12), 3.0, 0.9, 0.72, [0.52, 0.38, 0.27], 1.3);
      GboxM(metal, F(0, 0.94, 0.12), 3.05, 0.06, 0.8, [0.7, 0.75, 0.84], 1.2);
      GboxM(woodDark, F(0, 1.2, -0.72), 2.9, 1.9, 0.08, [0.45, 0.33, 0.24], 1.2);
      for (const yy of [1.45, 2.02]) {
        GboxM(wood, F(0, yy, -0.6), 2.7, 0.05, 0.28, [0.8, 0.62, 0.44], 1.2);
      }
      // 后架上的坛坛罐罐
      for (let i = 0; i < 9; i++) {
        const lx = -1.15 + i * 0.29;
        const ly = 1.5 + (i % 2) * 0.57;
        cloth.cyl.call(cloth, F(lx, ly, -1.05), 0.06, 0.075, 0.14 + (i % 3) * 0.05, 7,
          [0.6 + r() * 0.4, 0.45 + r() * 0.3, 0.3 + r() * 0.2], true);
      }
      // 烤架
      GboxM(darkMetal, F(-0.85, 1.14, 0.1), 1.15, 0.32, 0.62, [0.3, 0.31, 0.35], 1.2);
      for (let i = 0; i < 7; i++) {
        GboxM(metal, F(-1.36 + i * 0.17, 1.3, 0.1), 0.035, 0.035, 0.6, [0.55, 0.55, 0.6], 1.1);
      }
      // 炭火：加法暖光 + 几根串
      gLamp.quad.call(gLamp, F(-0.85, 1.31, 0.1, -HPI, 0, 0), 0.95, 0.5, [1, 1, 1], [0, 0, 1, 1]);
      for (let i = 0; i < 5; i++) {
        GboxM(brass, F(-1.25 + i * 0.2, 1.35, 0.12, 0, 0.15, 0), 0.025, 0.025, 0.46, [0.8, 0.55, 0.3], 1.1);
      }
      // 蒸笼塔
      for (let i = 0; i < 3; i++) {
        wood.cyl.call(wood, F(0.55, 0.97 + i * 0.17, -0.02), 0.22, 0.235, 0.16, 12, [0.85, 0.68, 0.45], true);
        woodDark.cyl.call(woodDark, F(0.55, 1.13 + i * 0.17, -0.02), 0.24, 0.24, 0.022, 12, [0.6, 0.45, 0.3], true);
      }
      // 汤锅
      metal.cyl.call(metal, F(1.05, 0.97, 0.18), 0.27, 0.28, 0.32, 14, [0.55, 0.58, 0.64], true);
      metal.torus.call(metal, F(1.05, 1.28, 0.18), 0.285, 0.02, 14, 4, [0.7, 0.72, 0.78]);
      // 汤勺
      metal.tube.call(metal, F(1.05, 0, 0), [[0.1, 1.3, 0.28], [0.02, 1.5, 0.2], [-0.1, 1.56, 0.12]], 0.012, 4, [0.7, 0.72, 0.76]);
      // 碗碟
      for (let i = 0; i < 4; i++) {
        cloth.cyl.call(cloth, F(-0.35 + i * 0.22, 0.97, 0.58), 0.075, 0.09, 0.055, 8, [0.9, 0.9, 0.86], true);
      }
      // 蒸汽
      for (let i = 0; i < 7; i++) {
        const sx = x + 0.15 + (r() - 0.5) * 1.1;
        const sz = z - 0.2 + (r() - 0.5) * 1.1;
        const sy = 1.5 + i * 0.3;
        gSteam.quad.call(gSteam, m4(sx, sy, sz), 0.7 + i * 0.13, 0.7 + i * 0.13, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 菜单牌
      GboxM(woodDark, F(-1.55, 0.55, 0.92, 0, -0.2, 0), 0.75, 1.0, 0.05, [0.4, 0.3, 0.22], 1.2);
      quadAt(paper, F(-1.55, 0.58, 0.95, 0, -0.2, 0), 0.62, 0.82, [1, 1, 0.86], [0, 0, 1, 1]);
      // 摊主 + 两张高脚凳
      P.figure(vendor.raw, FD(0.35, 0, -0.55, 0, 0.25, 0), [0.2, 0.17, 0.16], { h: 1.62 });
      for (const sz of [0.95, 1.55]) {
        cylAt(woodDark, x - 0.6, 0.03, z + sz, 0.17, 0.15, 0.52, 8, [0.55, 0.42, 0.3], true);
      }
      bladeSign(sgTiny, side, 3.12, z, 1.7, 0.42);
      cylAt(metal, 5.55, 0.03, -8.4, 0.16, 0.16, 0.7, 10, [0.5, 0.52, 0.58], true);
    }
    stallFood();

    /* ============================================================
     *  摊位 5：书摊 / repo 周边（awesome-llm）
     * ============================================================ */
    function stallBooks() {
      const x = -4.5, z = -12.2, side = -1;
      const sm = m4(x, 0.03, z, 0, HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      P.table(wood.raw, FD(0, 0.98, 0.18), 2.6, 0.9, 0.95, [0.62, 0.46, 0.32], 0.07);
      // 后头书架
      P.bookshelf(woodDark.raw, FD(0, 0, -0.62), 2.6, 2.05, 0.36, 4, { woodCol: [0.3, 0.2, 0.12] });
      const t = 0.05, gap = (2.05 - t * 2) / 4;
      for (let s = 0; s < 3; s++) {
        const by = t + gap * s + 0.04;
        let bx = -1.1, cnt = 0;
        while (bx < 1.0 && cnt < 12) {
          const bw = 0.05 + r() * 0.05;
          if (bx + bw > 1.08) break;
          const bh = gap * (0.5 + r() * 0.32);
          const bc = [0.45 + r() * 0.45, 0.22 + r() * 0.3, 0.18 + r() * 0.3];
          GboxM(cloth, F(bx + bw / 2, by, -0.6, 0, 0, 0), bw, bh, 0.17, bc, 1.2);
          bx += bw + 0.004;
          cnt++;
        }
      }
      // 台面上平铺 / 立着的书和周边
      for (let i = 0; i < 7; i++) {
        const lx = -1.05 + i * 0.3;
        GboxM(cloth, F(lx, 1.02, 0.12, 0, (r() - 0.5) * 0.4, 0), 0.2 + r() * 0.08, 0.03, 0.26,
          [0.5 + r() * 0.45, 0.28 + r() * 0.3, 0.22 + r() * 0.3], 1.2);
      }
      for (let i = 0; i < 3; i++) {
        GboxM(cloth, F(-0.7 + i * 0.7, 1.12, 0.4, 0, 0.2, 0), 0.16, 0.22, 0.17,
          [0.9, 0.75, 0.55], 1.2);
      }
      // 前檐小灯串
      cable.tube.call(cable, F(0, 0, 0), [[-1.2, 1.95, 0.55], [0, 1.88, 0.58], [1.2, 1.95, 0.55]], 0.008, 4, [1, 1, 1]);
      cylAt(woodDark, x + 0.55, 1.0, z + 1.2, 0.018, 0.016, 0.95, 4, [0.5, 0.38, 0.27], true);
      cylAt(woodDark, x + 0.55, 1.0, z - 1.2, 0.018, 0.016, 0.95, 4, [0.5, 0.38, 0.27], true);
      for (let i = 0; i < 3; i++) {
        const lx = -0.8 + i * 0.8;
        bulb.sphere.call(bulb, F(lx, 1.82, 0.6), 0.055, 5, 4, [1, 1, 1]);
        gLamp.quad.call(gLamp, F(lx, 1.82, 0.63), 0.8, 0.8, [1, 1, 1], [0, 0, 1, 1]);
      }
      P.figure(vendor.raw, FD(1.45, 0, -0.15, 0, -1.1, 0), [0.19, 0.16, 0.18], { h: 1.64 });
      bladeSign(sgAwe, side, 3.3, z, 2.25, 0.55);
      // 一摞纸箱
      P.crate(wood.raw, dm(-5.65, 0.19, -11.0, 0, 0.5, 0), 0.34, [0.56, 0.43, 0.3]);
      P.crate(wood.raw, dm(-5.45, 0.14, -12.0, 0, 1.2, 0), 0.25, [0.5, 0.38, 0.27]);
    }
    stallBooks();

    /* ============================================================
     *  摊位 6：灯泡串围起来的桌摊（vllm）—— 摆显卡
     * ============================================================ */
    function stallGPU() {
      const x = 4.15, z = -15.2, side = 1;
      const sm = m4(x, 0.03, z, 0, -HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      P.table(woodDark.raw, FD(0, 0.92, 0), 1.9, 0.86, 0.9, [0.55, 0.4, 0.28], 0.07);
      // 四根灯杆
      for (const sx of [-1.35, 1.35]) for (const sz of [-0.85, 0.85]) {
        woodDark.cyl.call(woodDark, F(sx, 0.03, sz), 0.035, 0.03, 2.3, 4, [0.5, 0.38, 0.27], true);
      }
      // 杆顶的灯泡串：围一圈 + 一条斜拉
      const ring = [];
      for (let k = 0; k < 12; k++) {
        const u = k / 12;
        // 沿四边绕一圈
        let lx, lz;
        if (u < 0.25) { lx = -1.35; lz = -0.85 + (u / 0.25) * 1.7; }
        else if (u < 0.5) { lx = -1.35 + ((u - 0.25) / 0.25) * 2.7; lz = 0.85; }
        else if (u < 0.75) { lx = 1.35; lz = 0.85 - ((u - 0.25 - 0.25) / 0.25) * 1.7; }
        else { lx = 1.35 - ((u - 0.75) / 0.25) * 2.7; lz = -0.85; }
        ring.push([lx, 2.24 - Math.sin(u * PI * 4) * 0.04, lz]);
      }
      ring.push(ring[0]);
      cable.tube.call(cable, F(0, 0, 0), ring, 0.007, 4, [1, 1, 1]);
      cable.tube.call(cable, F(0, 0, 0), [[-1.35, 2.24, -0.85], [0, 2.05, 0], [1.35, 2.24, 0.85]], 0.007, 4, [1, 1, 1]);
      for (let k = 0; k < ring.length - 1; k++) {
        if (k % 2) continue;
        const p = ring[k];
        bulb.sphere.call(bulb, F(p[0], p[1] - 0.07, p[2]), 0.052, 5, 4, [1, 1, 1]);
        gLamp.quad.call(gLamp, F(p[0], p[1] - 0.07, p[2] + 0.02), 0.7, 0.7, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 桌上显卡
      for (let i = 0; i < 5; i++) {
        const lx = -0.7 + i * 0.35;
        const lz = (i % 2 ? 0.14 : -0.16);
        GboxM(darkMetal, F(lx, 0.99, lz, 0, (r() - 0.5) * 0.3, 0), 0.34, 0.08, 0.16, [0.16, 0.17, 0.2], 1.2);
        for (const fx2 of [-0.075, 0.075]) {
          darkMetal.cyl.call(darkMetal, F(lx + fx2, 1.0, lz + 0.085, HPI, 0, 0),
            0.055, 0.055, 0.012, 8, [0.35, 0.37, 0.42], true);
        }
        quadAt(winCool, F(lx, 1.02, lz + 0.088), 0.3, 0.02, [1, 1, 1], [0, 0, 1, 1]);
        quadAt(winWarm, F(lx, 1.05, lz + 0.088), 0.08, 0.02, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 两个坐着的人（腿被桌子挡住一半）
      seatedFigure(M.mul(sm, m4(-0.62, 0.03, 1.02, 0, PI, 0)), [0.22, 0.18, 0.16]);
      seatedFigure(M.mul(sm, m4(0.62, 0.03, 1.02, 0, PI, 0)), [0.17, 0.16, 0.2]);
      // 桌下箱子
      GboxM(woodDark, F(0, 0.22, -0.3), 0.9, 0.42, 0.5, [0.45, 0.33, 0.24], 1.2);
      bladeSign(sgVllm, side, 3.06, z, 1.6, 0.4);
      // 桌子旁边的立式小灯
      cylAt(darkMetal, x + 1.55, 0.03, z - 0.5, 0.06, 0.05, 1.55, 5, [0.4, 0.42, 0.47], true);
      sphAt(bulb, x + 1.55, 1.62, z - 0.5, 0.09, 6, 4, [1, 1, 1]);
      gLamp.quad.call(gLamp, m4(x + 1.55, 1.62, z - 0.48), 1.5, 1.5, [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 坐着的人影：大腿 + 小腿 + 身体 + 头，比 P.figure 的坐姿更好认 */
    function seatedFigure(m, col) {
      for (const sx of [-0.12, 0.12]) {
        vendor.cyl.call(vendor, M.mul(m, m4(sx, 0.42, 0.08, HPI, 0, 0)), 0.075, 0.068, 0.42, 6, col, true);
        vendor.cyl.call(vendor, M.mul(m, m4(sx, 0.03, 0.5)), 0.065, 0.06, 0.42, 6, col, true);
        GboxM(darkMetal, M.mul(m, m4(sx, 0.025, 0.56, 0, 0.12, 0)), 0.13, 0.07, 0.24, [0.08, 0.07, 0.07], 1.2);
      }
      vendor.cyl.call(vendor, M.mul(m, m4(0, 0.42, 0, 0, 0, 0)), 0.17, 0.2, 0.6, 8, col, true);
      vendor.sphere.call(vendor, M.mul(m, m4(0, 1.13, 0)), 0.125, 8, 6, col);
      vendor.cyl.call(vendor, M.mul(m, m4(-0.18, 0.55, 0, 0.5, 0, 0)), 0.055, 0.05, 0.4, 5, col, true);
      vendor.cyl.call(vendor, M.mul(m, m4(0.18, 0.55, 0, 0.5, 0, 0)), 0.055, 0.05, 0.4, 5, col, true);
    }
    stallGPU();

    /* ============================================================
     *  摊位 7：二手屏幕摊（llama.cpp）
     * ============================================================ */
    function stallScreens() {
      const x = -4.35, z = -18.2, side = -1;
      const sm = m4(x, 0.03, z, 0, HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      P.table(wood.raw, FD(0, 0.95, 0.1), 2.5, 0.86, 0.92, [0.58, 0.43, 0.3], 0.07);
      // 三台旧显示器，屏幕颜色各不同
      const mons = [
        [-0.72, 0.12, winCool, [0.35, 0.6, 0.9]],
        [0.02, 0.08, winWarm, [0.95, 0.6, 0.3]],
        [0.78, -0.15, winDark, [0.3, 0.32, 0.36]]
      ];
      for (const mon of mons) {
        const mm = M.mul(sm, m4(mon[0], 1.26, mon[1], 0, 0.12 + r() * 0.12, 0));
        P.monitorBody(metal.raw, md(mm), 0.62, 0.42);
        quadAt(mon[2], M.mul(mm, m4(0, 0, 0.03)), 0.56, 0.36, mon[3], [0, 0, 1, 1]);
        // 底座
        darkMetal.cyl.call(darkMetal, F(mon[0], 0.98, mon[1]), 0.12, 0.08, 0.07, 8, [0.35, 0.36, 0.4], true);
      }
      // 地上堆的 CRT
      for (let i = 0; i < 2; i++) {
        const lx = 1.35 + i * 0.05, lz = 0.55 + i * 0.42;
        GboxM(darkMetal, F(lx, 0.28, lz), 0.58, 0.48, 0.5, [0.3, 0.3, 0.32], 1.2);
        quadAt(winDark, F(lx, 0.32, lz + 0.255), 0.44, 0.32, [0.5, 0.55, 0.6], [0, 0, 1, 1]);
      }
      // 桌上拆开的机箱
      GboxM(darkMetal, F(-1.05, 1.2, -0.15), 0.22, 0.4, 0.4, [0.18, 0.19, 0.22], 1.2);
      quadAt(winCool, F(-1.05, 1.26, 0.06), 0.05, 0.3, [0.5, 0.9, 1.0], [0, 0, 1, 1]);
      quadAt(winWarm, F(-1.05, 1.26, 0.065), 0.05, 0.12, [1, 0.45, 0.2], [0, 0, 1, 1]);
      // 线缆从桌上垂到地上
      cable.tube.call(cable, F(0, 0, 0), [[-0.6, 0.96, 0.2], [-0.4, 0.5, 0.42], [-0.55, 0.06, 0.5]], 0.015, 4, [1, 1, 1]);
      cable.tube.call(cable, F(0, 0, 0), [[0.5, 0.96, 0.2], [0.75, 0.4, 0.45], [0.6, 0.05, 0.6]], 0.013, 4, [1, 1, 1]);
      // 价签 + 小灯
      for (let i = 0; i < 2; i++) {
        quadAt(paper, F(-0.3 + i * 1.0, 1.0, 0.48, -HPI, 0.2, 0), 0.15, 0.1, [1, 1, 1], [0, 0, 1, 1]);
      }
      cylAt(darkMetal, x - 0.9, 1.0, z + 0.5, 0.05, 0.05, 0.5, 5, [0.35, 0.36, 0.4], true);
      sphAt(bulb, x - 0.9, 1.56, z + 0.5, 0.07, 5, 4, [1, 1, 1]);
      gLamp.quad.call(gLamp, m4(x - 0.9, 1.56, z + 0.52), 1.2, 1.2, [1, 1, 1], [0, 0, 1, 1]);
      P.figure(vendor.raw, FD(0.4, 0, -0.85, 0, -0.2, 0), [0.18, 0.17, 0.16], { h: 1.6 });
      bladeSign(sgLlama, side, 3.08, z, 1.7, 0.42);
    }
    stallScreens();

    /* ============================================================
     *  摊位 8：旧键盘 / 键帽摊（rust-lang）
     * ============================================================ */
    function stallKeys() {
      const x = 4.3, z = -21.2, side = 1;
      const sm = m4(x, 0.03, z, 0, -HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      P.table(wood.raw, FD(0, 0.92, 0.1), 2.2, 0.8, 0.88, [0.6, 0.45, 0.31], 0.07);
      // 两块键盘
      for (let k = 0; k < 2; k++) {
        const lx = -0.5 + k * 1.0;
        GboxM(metal, F(lx, 0.975, 0.16, 0, (r() - 0.5) * 0.25, 0), 0.48, 0.035, 0.18, [0.2, 0.21, 0.24], 1.2);
        for (let i = 0; i < 7; i++) {
          GboxM(cloth, F(lx - 0.19 + i * 0.063, 1.0, 0.145, 0, 0, 0),
            0.045, 0.012, 0.04,
            [0.55 + r() * 0.4, 0.5 + r() * 0.4, 0.5 + r() * 0.4], 1.1);
        }
      }
      // 一盒一盒的键帽
      for (let b = 0; b < 2; b++) {
        const lx = -0.85 + b * 1.65;
        GboxM(woodDark, F(lx, 1.02, -0.12), 0.5, 0.12, 0.3, [0.4, 0.3, 0.22], 1.2);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
          GboxM(cloth, F(lx - 0.1 + i * 0.2, 1.095, -0.18 + j * 0.06, 0, 0, 0),
            0.055, 0.026, 0.045,
            [0.5 + r() * 0.6, 0.45 + r() * 0.5, 0.4 + r() * 0.6], 1.1);
        }
      }
      // 立着靠墙的第三块键盘
      GboxM(darkMetal, F(1.1, 1.15, -0.35, -1.1, 0.2, 0), 0.46, 0.03, 0.18, [0.22, 0.23, 0.26], 1.2);
      // 台灯
      cylAt(darkMetal, x - 0.95, 0.95, z + 0.35, 0.06, 0.05, 0.02, 8, [0.3, 0.3, 0.34], true);
      cylAt(darkMetal, x - 0.95, 0.95, z + 0.35, 0.02, 0.02, 0.45, 4, [0.4, 0.4, 0.44], true);
      cylAt(brass, x - 0.95, 1.38, z + 0.35, 0.11, 0.07, 0.12, 8, [0.8, 0.7, 0.5], false);
      sphAt(bulb, x - 0.95, 1.36, z + 0.35, 0.06, 5, 4, [1, 1, 1]);
      gLamp.quad.call(gLamp, m4(x - 0.95, 1.36, z + 0.37), 1.1, 1.1, [1, 1, 1], [0, 0, 1, 1]);
      // 翻键帽的路人
      P.figure(vendor.raw, dm(2.55, 0.03, -20.55, 0, 0.75, 0), [0.24, 0.18, 0.15], { h: 1.66 });
      bladeSign(sgRust, side, 3.02, z, 1.62, 0.4);
      P.crate(wood.raw, dm(5.6, 0.19, -20.2, 0, 0.5, 0), 0.34, [0.55, 0.42, 0.3]);
      P.crate(wood.raw, dm(5.4, 0.14, -22.3, 0, 1.3, 0), 0.25, [0.5, 0.38, 0.27]);
    }
    stallKeys();

    /* ============================================================
     *  摊位 9：repo 周边 / T 恤摊（没有额外招牌贴图，靠布幡和衣服撑色）
     * ============================================================ */
    function stallMerch() {
      const x = -4.45, z = -24.0;
      const sm = m4(x, 0.03, z, 0, HPI, 0);
      const F = (lx, ly, lz, rx, ry, rz) => M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0));
      const FD = (lx, ly, lz, rx, ry, rz) => md(M.mul(sm, m4(lx, ly, lz, rx || 0, ry || 0, rz || 0)));

      // 衣架
      for (const sx of [-1.35, 1.35]) {
        woodDark.cyl.call(woodDark, F(sx, 0.03, 0), 0.045, 0.04, 2.0, 5, [0.55, 0.42, 0.3], true);
      }
      woodDark.cyl.call(woodDark, F(1.35, 1.96, 0, 0, 0, HPI), 0.035, 0.035, 2.7, 5, [0.6, 0.46, 0.33], true);
      // 挂着的 T 恤
      const shirtCols = [
        [0.85, 0.3, 0.26], [0.3, 0.45, 0.75], [0.9, 0.75, 0.4],
        [0.4, 0.6, 0.4], [0.75, 0.4, 0.65], [0.35, 0.55, 0.6]
      ];
      for (let i = 0; i < 6; i++) {
        const lx = -1.05 + i * 0.42;
        const cc = shirtCols[i];
        quadAt(cloth, F(lx, 1.55, 0.06, 0, 0, 0), 0.34, 0.5, cc, [0, 0, 1, 1], 0.6);
        quadAt(cloth, F(lx - 0.21, 1.72, 0.06, 0, 0, 0.28), 0.14, 0.1, cc, [0, 0, 1, 1], 0.6);
        quadAt(cloth, F(lx + 0.21, 1.72, 0.06, 0, 0, -0.28), 0.14, 0.1, cc, [0, 0, 1, 1], 0.6);
        // 衣架钩
        metal.cyl.call(metal, F(lx, 1.82, 0.06), 0.008, 0.008, 0.14, 3, [0.6, 0.6, 0.64], false);
      }
      // 折叠的衣服堆 + 布袋
      P.table(wood.raw, FD(0, 0.78, 0.85), 2.4, 0.64, 0.74, [0.58, 0.43, 0.3], 0.06);
      for (let i = 0; i < 3; i++) {
        GboxM(cloth, F(-0.8 + i * 0.75, 0.86 + (i % 2) * 0.04, 0.8, 0, (r() - 0.5) * 0.3, 0),
          0.44, 0.12, 0.34, [0.5 + r() * 0.4, 0.4 + r() * 0.4, 0.4 + r() * 0.4], 1.2);
        GboxM(cloth, F(-0.8 + i * 0.75, 0.98 + (i % 2) * 0.04, 0.8, 0, (r() - 0.5) * 0.3, 0),
          0.38, 0.1, 0.3, [0.55 + r() * 0.4, 0.45 + r() * 0.4, 0.4 + r() * 0.4], 1.2);
      }
      // 摊主
      P.figure(vendor.raw, FD(0.4, 0, -0.75, 0, -0.4, 0), [0.19, 0.16, 0.17], { h: 1.63 });
      // 头顶三色布幡
      for (let i = 0; i < 3; i++) {
        quadAt(cloth, F(-0.9 + i * 0.9, 2.14, 0.1, 0.2, 0, 0), 0.72, 0.34,
          [0.75 + i * 0.1, 0.4 + i * 0.1, 0.35 + i * 0.12], [0, 0, 1, 1], 0.5);
      }
      // 地上两摞箱子
      P.crate(wood.raw, dm(-5.65, 0.19, -23.1, 0, 0.4, 0), 0.34, [0.55, 0.42, 0.3]);
      P.crate(wood.raw, dm(-5.55, 0.14, -25.2, 0, 1.1, 0), 0.25, [0.48, 0.37, 0.26]);
      cylAt(darkMetal, -5.6, 0.03, -22.4, 0.24, 0.24, 0.6, 12, [0.42, 0.45, 0.52], true);
    }
    stallMerch();

    /* ============================================================
     *  街景杂物：箱子 / 酒桶 / 垃圾桶 / 自行车 / 电线杆 / 盆栽 / 纸屑
     * ============================================================ */
    function streetProps() {
      // 木箱
      const crates = [
        [-5.55, -2.1, 0.44, 0.4], [-5.1, -2.6, 0.32, 1.1],
        [5.6, -6.9, 0.48, 0.7], [5.2, -7.3, 0.34, 1.5],
        [-5.6, -14.3, 0.42, 0.2], [5.5, -16.6, 0.48, 1.0], [5.1, -17.0, 0.3, 0.6],
        [5.7, -25.2, 0.44, 0.3], [5.25, -25.6, 0.3, 1.2],
        [-5.4, -28.0, 0.4, 0.9], [-4.9, -28.4, 0.28, 0.3],
        [-2.85, -2.7, 0.4, 0.5], [2.65, -4.4, 0.34, 1.1], [2.95, -4.9, 0.26, 0.2]
      ];
      for (const c of crates) {
        P.crate(wood.raw, dm(c[0], 0.03 + c[2] / 2, c[1], 0, c[3], 0), c[2],
          [0.56, 0.43, 0.3]);
      }
      // 酒桶
      const barrels = [
        [-5.5, -8.0, 0.3, 0.78], [5.55, -12.6, 0.32, 0.8]
      ];
      for (const b of barrels) {
        P.barrel(wood.raw, dm(b[0], 0.03, b[1]), b[2], b[3], [0.35, 0.36, 0.4], [1, 1, 1]);
        cylAt(cloth, b[0], 0.03 + b[3] + 0.01, b[1], b[2] * 0.92, b[2] * 0.92, 0.04, 12, [0.5, 0.4, 0.3], true);
      }
      // 垃圾桶（两个一组，偶尔满出来）
      const bins = [[3.25, -7.4], [-3.1, -17.4], [3.35, -26.2]];
      for (let i = 0; i < bins.length; i++) {
        const bx = bins[i][0], bz = bins[i][1];
        cylAt(darkMetal, bx, 0.03, bz, 0.27, 0.3, 0.74, 12, [0.38, 0.42, 0.48], true);
        cylAt(darkMetal, bx, 0.77, bz, 0.3, 0.2, 0.12, 12, [0.44, 0.48, 0.55], true);
        bag.sphere.call(bag, m4(bx + 0.05, 0.86, bz - 0.02, 0, r() * TAU, 0.3), 0.18, 7, 5, [0.16, 0.2, 0.14]);
        bag.sphere.call(bag, m4(bx - 0.16, 0.83, bz + 0.12, 0, r() * TAU, 0.2), 0.13, 6, 4, [0.18, 0.22, 0.15]);
      }
      // 电线杆 + 变压器 + 电线
      cylAt(woodDark, -3.35, 0.03, -20.6, 0.13, 0.1, 6.6, 6, [0.45, 0.34, 0.25], true);
      Gbox(darkMetal, -3.35, 5.95, -20.6, 2.2, 0.1, 0.14, [0.3, 0.31, 0.34], 1.2);
      for (let i = 0; i < 3; i++) {
        cylAt(brass, -4.2 + i * 0.85, 6.06, -20.6, 0.05, 0.04, 0.16, 6, [0.5, 0.45, 0.3], true);
      }
      Gbox(darkMetal, -3.35, 4.6, -20.6, 0.52, 0.78, 0.44, [0.28, 0.3, 0.34], 1.3);
      for (let k = 0; k < 3; k++) {
        const pts = [
          [-3.35, 5.95 + k * 0.1, -20.6],
          [-4.2, 5.2 + k * 0.1, -14.0 - k * 0.3],
          [-4.6, 5.4 + k * 0.1, -8.0],
          [-5.0, 5.7 + k * 0.1, -2.0]
        ];
        cable.tube.call(cable, M.ident(), pts, 0.012, 4, [1, 1, 1]);
      }
      // 自行车（靠墙停）
      const bm = m4(5.7, 0.03, -10.8, 0, 0.12, 0.07);
      for (const sz of [-0.52, 0.52]) {
        metal.torus.call(metal, M.mul(bm, m4(0, 0.34, sz, 0, 0, HPI)), 0.32, 0.026, 12, 4, [0.35, 0.36, 0.4]);
      }
      metal.tube.call(metal, bm, [[0, 0.34, -0.52], [0, 0.62, -0.18], [0, 0.34, 0.52]], 0.018, 4, [0.55, 0.4, 0.3]);
      metal.tube.call(metal, bm, [[0, 0.62, -0.18], [0, 0.72, 0.15], [0, 0.55, 0.32]], 0.016, 4, [0.6, 0.6, 0.64]);
      metal.cyl.call(metal, M.mul(bm, m4(0.23, 0.72, 0.15, 0, 0, HPI)), 0.012, 0.012, 0.46, 4, [0.6, 0.6, 0.64], true);
      GboxM(darkMetal, M.mul(bm, m4(0, 0.62, 0.5)), 0.1, 0.05, 0.24, [0.12, 0.12, 0.13], 1.2);
      // 盆栽
      for (const pl of [[-5.95, 1.8, 3], [5.95, -3.3, 5], [-5.95, -11.0, 7], [5.95, -18.8, 9]]) {
        P.pot(bldD.raw, dm(pl[0], 0.03, pl[1]), 0.2, 0.3, [0.5, 0.36, 0.26]);
        P.grass(leafB.raw, dm(pl[0], 0.33, pl[1], 0, r() * TAU, 0), 6, 0.34, [0.7, 0.95, 0.65], pl[2], 0.16);
      }
      // 地上的纸屑、易拉罐
      for (let i = 0; i < 10; i++) {
        floorQ(paper, (r() - 0.5) * 11, 0.048, -2 - r() * 27, r() * TAU,
          0.16 + r() * 0.14, 0.22 + r() * 0.16, [1, 0.95, 0.8], [0, 0, 1, 1]);
      }
      for (let i = 0; i < 6; i++) {
        const cx2 = (r() - 0.5) * 9, cz2 = -1 - r() * 28;
        metal.cyl.call(metal, m4(cx2, 0.07, cz2, 0, r() * TAU, HPI), 0.035, 0.035, 0.12, 7, [0.5, 0.45, 0.4], true);
      }
      // 地垫
      for (const mat of [[-3.6, -0.9, 1.8, 1.2], [3.45, -9.3, 1.7, 1.1], [-3.7, -18.4, 1.6, 1.0]]) {
        floorQ(cloth, mat[0], 0.052, mat[1], 0, mat[2], mat[3], [0.65, 0.35, 0.3], [0, 0, 2, 1]);
      }
      // 收摊后盖着布的手推车
      GboxM(woodDark, m4(-4.35, 0.55, -27.4, 0, 0.35, 0), 1.4, 0.75, 0.9, [0.35, 0.26, 0.2], 1.2);
      GboxM(cloth, m4(-4.35, 1.02, -27.4, 0, 0.35, 0), 1.65, 0.14, 1.15, [0.55, 0.5, 0.44], 1.2, 0.2);
      woodDark.torus.call(woodDark, m4(-3.85, 0.36, -27.4, 0, 0, HPI), 0.3, 0.03, 12, 4, [0.35, 0.25, 0.16]);
      woodDark.torus.call(woodDark, m4(-4.85, 0.36, -27.4, 0, 0, HPI), 0.3, 0.03, 12, 4, [0.35, 0.25, 0.16]);
    }
    streetProps();

    /* ============================================================
     *  头顶：5 条串灯 + 纸灯笼 + 横幅 + 晾衣绳
     * ============================================================ */
    function overhead() {
      const strands = [-1.6, -6.2, -11.4, -17.2, -23.0];
      const lanternPts = [];
      strands.forEach((sz, si) => {
        const n = 16;
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          pts.push([-7.0 + u * 14.0, 4.55 - Math.sin(u * PI) * 0.72,
            sz + Math.sin(u * PI * 1.5 + si) * 0.16]);
        }
        cable.tube.call(cable, M.ident(), pts, 0.011, 4, [1, 1, 1]);
        for (let i = 2; i < n; i += 4) {
          const p = pts[i];
          bulb.sphere.call(bulb, m4(p[0], p[1] - 0.1, p[2]), 0.055, 6, 4, [1, 1, 1]);
          gLamp.quad.call(gLamp, m4(p[0], p[1] - 0.1, p[2] + 0.02), 0.72, 0.72, [1, 1, 1], [0, 0, 1, 1]);
        }
        // 前四条串灯各挂一只纸灯笼（挂在街心，正好照亮走道）
        if (si < 4) lanternPts.push([pts[8][0], pts[8][1] - 0.55, pts[8][2], 0.19]);
      });
      lanternPts.forEach(l => lanternAt(l[0], l[1], l[2], l[3]));
      // 街口两根带灯的小木杆
      for (const side of [-1, 1]) {
        const px = side * 5.5, pz = side < 0 ? 0.9 : -1.8;
        cylAt(woodDark, px, 0.03, pz, 0.065, 0.05, 3.3, 5, [0.5, 0.38, 0.27], true);
        cylAt(woodDark, px, 3.12, pz, 0.035, 0.03, 0.55, 4, [0.5, 0.38, 0.27], false, 0, 0, side < 0 ? -HPI : HPI);
        cheapLantern(px - side * 0.5, 2.62, pz, 0.15);
      }

      // 沿街两侧墙面的暖光（灯笼 / 棚灯的余光），加法片，便宜又出气氛
      for (const side of [-1, 1]) {
        for (const wz of [-2.0, -8.0, -14.2, -20.4, -26.0]) {
          gWall.quad.call(gWall, m4(side * 6.34, 3.0, wz, 0, faceRy(side), 0), 3.6, 2.5, [1, 1, 1], [0, 0, 1, 1]);
        }
      }

      // 横跨街道的布幡
      for (const b of [[-8.3, 5.05, [0.8, 0.32, 0.28]], [-20.2, 5.25, [0.3, 0.45, 0.72]]]) {
        for (let i = 0; i < 3; i++) {
          quadAt(cloth, m4(-3.7 + i * 3.7, b[1], b[0], 0, 0, 0), 3.55, 0.55,
            [b[2][0] + i * 0.06, b[2][1] + i * 0.06, b[2][2] + i * 0.04], [0, 0, 1, 1], 0.4);
        }
        cable.tube.call(cable, M.ident(), [[-7.0, b[1] + 0.42, b[0]], [0, b[1] + 0.25, b[0]], [7.0, b[1] + 0.42, b[0]]], 0.01, 4, [1, 1, 1]);
      }

      // 高处的晾衣绳：两栋楼之间挂几件衣服
      const lines = [
        { z: -14.6, y: 5.7, cols: [[0.65, 0.3, 0.28], [0.35, 0.4, 0.6], [0.8, 0.7, 0.5], [0.4, 0.55, 0.4]] },
        { z: -26.2, y: 5.5, cols: [[0.5, 0.45, 0.6], [0.75, 0.5, 0.4], [0.35, 0.55, 0.55]] }
      ];
      for (const ln of lines) {
        cable.tube.call(cable, M.ident(), [[-6.8, ln.y, ln.z], [0, ln.y - 0.25, ln.z], [6.8, ln.y, ln.z]], 0.008, 4, [1, 1, 1]);
        ln.cols.forEach((cc, i) => {
          const px = -5.2 + i * 2.6;
          quadAt(cloth, m4(px, ln.y - 0.42, ln.z, 0, 0, (r() - 0.5) * 0.15), 0.46, 0.58, cc, [0, 0, 1, 1], 0.7);
          quadAt(cloth, m4(px - 0.3, ln.y - 0.28, ln.z, 0, 0, 0.5), 0.18, 0.12, cc, [0, 0, 1, 1], 0.7);
          quadAt(cloth, m4(px + 0.3, ln.y - 0.28, ln.z, 0, 0, -0.5), 0.18, 0.12, cc, [0, 0, 1, 1], 0.7);
        });
      }
    }
    overhead();

    /* ============================================================
     *  街尾：GITHUB 牌坊 + 牌坊后面的垃圾过渡
     * ============================================================ */
    function buildGate() {
      const gz = -30.7;
      // 柱与底座
      for (const sx of [-1, 1]) {
        Gbox(bldD, sx * 5.7, 0.36, gz, 1.5, 0.72, 1.9, [0.58, 0.6, 0.64], 1.4);
        Gbox(woodDark, sx * 5.7, 4.1, gz, 0.62, 7.3, 0.72, [0.78, 0.34, 0.24], 1.6);
        Gbox(brass, sx * 5.7, 0.98, gz, 0.72, 0.1, 0.82, [1, 0.9, 0.62], 1.2);
        Gbox(brass, sx * 5.7, 7.3, gz, 0.72, 0.1, 0.82, [1, 0.9, 0.62], 1.2);
        // 柱脚的小灯和杂物
        cylAt(darkMetal, sx * 5.7, 0.72, gz + 0.45, 0.12, 0.12, 0.18, 8, [0.3, 0.26, 0.22], true);
        sphAt(bulb, sx * 5.7, 0.96, gz + 0.45, 0.09, 6, 4, [1, 1, 1]);
        gLamp.quad.call(gLamp, m4(sx * 5.7, 0.96, gz + 0.5), 1.8, 1.8, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 横梁 / 牌匾底
      Gbox(woodDark, 0, 7.55, gz, 11.9, 0.7, 0.92, [0.72, 0.34, 0.26], 1.5);
      Gbox(wood, 0, 6.88, gz, 11.4, 0.22, 0.82, [0.78, 0.4, 0.3], 1.4);
      Gbox(woodDark, 0, 6.14, gz + 0.04, 6.9, 1.72, 0.18, [0.3, 0.22, 0.18], 1.4);
      quadAt(sgGate, m4(0, 6.14, gz + 0.15), 6.3, 1.58, [1, 1, 1], [0, 0, 1, 1]);
      gNeon.quad.call(gNeon, m4(0, 6.14, gz + 0.22), 8.8, 2.8, [1, 1, 1], [0, 0, 1, 1]);
      // 霓虹边框
      gNeon.quad.call(gNeon, m4(0, 6.98, gz + 0.2), 6.6, 0.07, [1, 1, 1], [0, 0, 1, 1]);
      gNeon.quad.call(gNeon, m4(0, 5.3, gz + 0.2), 6.6, 0.07, [1, 1, 1], [0, 0, 1, 1]);
      for (const sx of [-3.2, 3.2]) {
        gNeon.quad.call(gNeon, m4(sx, 6.14, gz + 0.2), 0.07, 1.7, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 屋檐 + 小庑殿顶
      W.gableRoof(woodDark, m4(0, 8.0, gz, 0, HPI, 0), 2.8, 12.9, 1.15, [0.66, 0.31, 0.22], 1.4);
      Gbox(woodDark, 0, 8.02, gz, 13.3, 0.16, 2.9, [0.55, 0.3, 0.22], 1.4);
      Gbox(darkMetal, 0, 9.2, gz, 13.0, 0.12, 0.22, [0.4, 0.42, 0.46], 1.2);
      // 檐下两盏灯笼，挂在牌匾两边（街尾太远，用便宜版就够看）
      cheapLantern(-4.35, 6.7, gz + 0.25, 0.2);
      cheapLantern(4.35, 6.7, gz + 0.25, 0.2);
      // 门洞下面的门槛与地面光
      Gbox(wood, 0, 0.15, gz, 11.2, 0.24, 1.3, [0.4, 0.28, 0.2], 1.4);
      gWall.quad.call(gWall, m4(0, 0.065, gz + 0.9, -HPI, 0, 0), 11, 2.6, [1, 1, 1], [0, 0, 3, 1]);
      // 柱子上的竖布幡
      for (const sx of [-6.35, 6.35]) {
        quadAt(cloth, m4(sx, 3.4, gz + 0.65, 0, 0, 0), 0.62, 2.6,
          [0.8, 0.38, 0.3], [0, 0, 1, 1], 0.45);
      }
    }
    buildGate();

    function buildEndJunk() {
      // 只铺牌坊后一小段：更远处已经进了 world_shit.js 的过渡区
      P.garbagePile(junk.raw, bag.raw, dm(-2.2, 0.03, -32.6, 0, 0.4, 0), 1.05, 51);
      P.garbagePile(junk.raw, bag.raw, dm(2.1, 0.03, -32.9, 0, 1.1, 0), 0.9, 57);
      P.crate(wood.raw, dm(-4.0, 0.22, -31.9, 0, 0.3, 0), 0.42, [0.5, 0.38, 0.27]);
      P.crate(wood.raw, dm(-3.5, 0.16, -32.5, 0, 1.0, 0), 0.3, [0.46, 0.35, 0.25]);
      P.crate(wood.raw, dm(3.8, 0.2, -31.6, 0, 1.4, 0), 0.38, [0.48, 0.36, 0.26]);
      P.crate(wood.raw, dm(4.2, 0.14, -32.2, 0, 0.2, 0), 0.26, [0.44, 0.33, 0.24]);
      P.crate(wood.raw, dm(4.6, 0.22, -33.2, 0, 0.4, 0), 0.4, [0.46, 0.35, 0.25]);
      // 从街里爬出去的电缆
      cable.tube.call(cable, M.ident(), [
        [-5.0, 0.06, -30.6], [-2.2, 0.05, -31.6], [1.0, 0.07, -32.4], [3.6, 0.05, -33.3], [4.4, 0.09, -34.2]
      ], 0.035, 5, [1, 1, 1]);
      cable.tube.call(cable, M.ident(), [
        [4.8, 0.06, -30.9], [2.0, 0.04, -31.8], [-1.0, 0.06, -32.6], [-3.4, 0.04, -33.4], [-4.6, 0.08, -34.4]
      ], 0.028, 4, [1, 1, 1]);
      // 后面山那头透来的绿光
      for (let i = 0; i < 4; i++) {
        gGreen.quad.call(gGreen, m4((r() - 0.5) * 6, 1.2 + i * 1.1, -34.8 - i * 0.7),
          7 + i * 1.5, 2.2 + i * 0.6, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 牌坊后堆的几袋垃圾
      for (let i = 0; i < 5; i++) {
        bag.sphere.call(bag, m4(-4.6 + r() * 9.2, 0.18 + r() * 0.12, -32.2 - r() * 1.6,
          0, r() * TAU, 0.25), 0.16 + r() * 0.1, 7, 5, [0.12 + r() * 0.06, 0.15, 0.11]);
      }
    }
    buildEndJunk();

    /* ============================================================
     *  甲虫：绕垃圾堆 / 排水口爬的小黑点（16 只，4 个 dyno）
     * ============================================================ */
    function beetleGroup(cx, cz, radius, count, speed, seed) {
      const br = P.rng(seed);
      const bd = dyno(null, { tint: [0.07, 0.075, 0.06], spec: 0.5, rim: 0.25 },
        t => M.mul(D, M.trs(cx, 0, cz, 0, t * speed, 0)));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + br() * 0.7;
        const rr = radius * (0.55 + br() * 0.6);
        const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
        const by = 0.16 + br() * 0.2;
        // 身体顺着切向，头在前进方向
        bd.sphere.call(bd, m4(bx, by, bz, 0, a + HPI, 0, 1.6, 0.68, 1.0), 0.034, 5, 3, [1, 1, 1]);
        bd.sphere.call(bd, m4(bx + Math.cos(a + HPI) * 0.046, by + 0.012,
          bz + Math.sin(a + HPI) * 0.046, 0, a, 0), 0.019, 4, 3, [0.5, 0.45, 0.3]);
      }
    }
    beetleGroup(2.7, -9.9, 0.6, 4, 0.26, 11);
    beetleGroup(-2.2, -19.6, 0.52, 4, -0.3, 23);
    beetleGroup(-2.8, -32.2, 0.48, 4, 0.34, 37);
    beetleGroup(1.8, -33.0, 0.55, 4, -0.22, 41);

    /* ============================================================
     *  浮尘 / 蒸汽 / 远端的绿点
     * ============================================================ */
    const pts = [];
    for (let i = 0; i < 150; i++) {
      pts.push({
        x: (r() - 0.5) * 13, y: 0.35 + r() * 5.2, z: 2.5 - r() * 32,
        r: 1.0, g: 0.7, b: 0.4, a: 0.16 + r() * 0.35,
        size: 0.012 + r() * 0.022, kind: 1, speed: 0.05 + r() * 0.16,
        phase: r() * TAU, wob: 0.1 + r() * 0.35
      });
    }
    for (let i = 0; i < 26; i++) {
      pts.push({
        x: 3.6 + (r() - 0.5) * 1.6, y: 1.3 + r() * 2.4, z: -9.6 + (r() - 0.5) * 1.6,
        r: 0.72, g: 0.75, b: 0.72, a: 0.12 + r() * 0.2,
        size: 0.03 + r() * 0.05, kind: 1, speed: 0.22 + r() * 0.3,
        phase: r() * TAU, wob: 0.25 + r() * 0.4
      });
    }
    for (let i = 0; i < 18; i++) {
      pts.push({
        x: (r() - 0.5) * 8, y: 0.8 + r() * 3.2, z: -31.5 - r() * 3.5,
        r: 0.55, g: 0.85, b: 0.35, a: 0.18 + r() * 0.3,
        size: 0.018 + r() * 0.03, kind: 2, speed: 0.06 + r() * 0.1,
        phase: r() * TAU, wob: 0.4 + r() * 0.5
      });
    }
    // 串灯附近的小光屑
    for (let i = 0; i < 40; i++) {
      const zz = 1.4 - r() * 25;
      pts.push({
        x: -6.6 + r() * 13.2, y: 3.7 + r() * 1.0, z: zz,
        r: 1.0, g: 0.8, b: 0.5, a: 0.25 + r() * 0.35,
        size: 0.015 + r() * 0.02, kind: 0, speed: 0,
        phase: r() * 10, wob: 0
      });
    }
    points(pts, { blend: "add", yMin: 0, yMax: 9, fogNear: 8, fogFar: 36 });

    /* ============================================================
     *  背面装饰：放在最后，前面已经调好的随机序列一点不动
     * ============================================================ */
    for (const b of rowsL) buildBack(-1, b);
    for (const b of rowsR) buildBack(1, b);
  }

  return { build };
})();

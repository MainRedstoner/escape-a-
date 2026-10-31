/* ============================================================
 * Escape A÷ · src/art3d/world_shit.js —— 大世界分区：屎山
 *
 * 局部坐标（由 world.js 用 D 矩阵摆到世界坐标）：
 *   原点 = 街尾的垃圾场；-Z 往里是山体，山心大约在局部 (0, -12)。
 * 内容是原来独立场景 shit_mountain 的完整移植：
 *   层层叠叠的乱箱山、挂满山坡的祖传注释旧屏、偶尔闪红报错的屏、
 *   胶带补丁、鎏金佛祖 + 背光、警告牌、意大利面电缆、甲虫与苍蝇、火桶。
 * 区别是地面不再自带，用大世界的地形；朝街口那一面要留出过渡的垃圾堆。
 *
 * 局部范围：x ∈ [-13, 13]，z ∈ [-26, +18]；+Z 是 GitHub 街的方向，
 * 所以山脚往 +Z 一侧用零散垃圾、废屏、歪机箱铺一段过渡，别让街尾断在半空。
 * ============================================================ */
"use strict";

const A3DWorldShit = (() => {
  function build(ctx) {
    const W = ctx.W, st = ctx.st, D = ctx.D;
    const T = W.T, P = W.P, M = W.M, m4 = W.m4, TAU = W.TAU;
    const r = ctx.r;                       // 带种子的随机数，构图每次一样
    const pen = (key, tex, opts) => W.penAt(st, D, "sm." + key, tex, opts);
    const glow = (key, tex, opts) => W.glowAt(st, D, "sm." + key, tex, opts);
    const dyno = (tex, opts, fn) => W.dynoAt(st, D, tex, opts, fn);
    const points = (list, opts) => W.addPoints(st, D, list, opts);

    /* ---------------- 布局 ----------------
     * 山心、山脚半径、层数全部沿用原场景。佛像坐标提前声明，
     * 因为堆山体的时候要先给它让出一块空地，别把莲台埋进箱子里。 */
    const CX = 0, CZ = -12;               // 山体中心（局部）
    const BASE_R = 9.5, H = 9.5;          // 山脚半径 / 山高
    const LAYERS = 18;                    // 乱箱层数
    const BX = -6.95, BZ = -4.0;          // 佛像（局部）

    /** 道具库的矩阵：道具库内部直接调 Builder 底层方法，不吃 penAt 的包装层，
     *  所以传 .raw 画笔，矩阵在这里先乘好 D。 */
    const aim = (x, y, z, rx, ry, rz) => M.mul(D, m4(x, y, z, rx || 0, ry || 0, rz || 0));

    /* ============================================================
     *  山体：一圈圈随机乱箱往上收分
     * ============================================================ */
    const junk = pen("junk", T.darkMetal(), { tint: [0.6, 0.58, 0.52] });
    const junkRust = pen("junkRust", T.metal(), { tint: [0.85, 0.6, 0.4], spec: 0.3 });
    const bag = pen("bag", T.fabric(), { tint: [0.4, 0.46, 0.36] });
    // 箱子的翻倒角度用第二支随机数：不挪动 r 的序列，原场景的构图就能原样保留
    const tilt = P.rng(211);
    for (let i = 0; i < LAYERS; i++) {
      const y = (i / LAYERS) * H;
      const rad = BASE_R * Math.sqrt(Math.max(0.02, 1 - i / LAYERS));
      const n = Math.max(3, Math.round(rad * 3.2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + r() * 0.5;
        const rr = rad * (0.55 + r() * 0.45);
        const s = 0.5 + r() * 1.1 * (1 - i / LAYERS * 0.5);
        const grey = 0.13 + r() * 0.2;
        const which = r() < 0.22 ? junkRust : junk;
        const sx = s * (0.7 + r() * 0.7);
        const sy = s * (0.5 + r() * 0.6);
        const sz = s * (0.7 + r() * 0.7);
        const bx = CX + Math.cos(a) * rr;
        const bz = CZ + Math.sin(a) * rr * 0.8;
        const col = [grey, grey * (0.9 + r() * 0.25), grey * 0.85];
        // 佛像跟前留空：这块是给人上香的，不是给箱子堆的
        if (y < 3.6 && Math.hypot(bx - BX, bz - BZ) < 2.05) continue;
        which.box.call(which, m4(bx, y + s * 0.3, bz,
          (tilt() - 0.5) * 0.34, tilt() * TAU, (tilt() - 0.5) * 0.34), sx, sy, sz, col, 1.1);
      }
    }

    // 山脚的垃圾堆群
    P.garbagePile(junk.raw, bag.raw, aim(-7.5, 0, -6.5), 1.8, 7);
    P.garbagePile(junk.raw, bag.raw, aim(7.8, 0, -7.5), 1.6, 19);
    P.garbagePile(junk.raw, bag.raw, aim(-4.5, 0, -3.0), 1.1, 33);
    P.garbagePile(junk.raw, bag.raw, aim(4.8, 0, -2.6), 1.0, 45);

    /* ============================================================
     *  挂满正面山坡的旧屏幕：一面坡，三十年的注释
     *  每条都对应屎山的一种脾气：
     *    能跑但偶尔抽风 / 看不懂 / 查不到原因 / 一改就炸一片 / 改完又被改回来 / 没人说得清。
     * ============================================================ */
    const INK = {
      term: { fg: "#a8dc50", glow: "rgba(160,220,80,.32)", tint: [1.14, 1.16, 1.08] },
      warn: { fg: "#f0cc64", glow: "rgba(240,190,70,.36)", tint: [1.14, 1.16, 1.08] },
      err: { fg: "#f05c40", glow: "rgba(255,70,40,.48)", tint: [1.16, 1.1, 1.06] },
      dead: { fg: "#8a9668", glow: "rgba(110,140,80,.14)", tint: [0.62, 0.64, 0.55] }
    };
    const NOTES = [
      // 看得懂的部分：其实也没人看得懂
      ["term", "TODO", 56],
      ["term", "FIXME 从这里开始", 34],
      ["term", "// 临时方案，永久存在", 34],
      ["term", "var a1, a2, a3, a4;", 40],
      ["term", "能跑，别动", 52],
      ["term", "works on my machine", 42],
      ["term", "其实是 feature", 46],
      ["term", "谁写的？我写的。", 42],
      ["term", "缩进：随缘", 50],
      ["term", "tmp_final_v2_OK.js", 40],
      // 故障：修不好，也复现不出来
      ["warn", "⚠ 小概率报错 0.3%", 38],
      ["warn", "复现不了，先挂着", 38],
      ["warn", "已修复（未验证）", 40],
      ["err", "改 1 行 · 炸 47 处", 38],
      ["err", "revert revert revert", 38],
      ["err", "报错不在这，原因也不在这", 28],
      ["err", "CI 红了，重跑一遍", 38],
      // 人：前任、接手的人、和永远空着的交接
      ["warn", "上一任没交接", 44],
      ["warn", "2016 年的坑", 48],
      ["warn", "git blame 全是我", 38],
      ["warn", "改过的又改回去了", 36],
      ["warn", "这里原来有注释", 40],
      // 埋在下层的老屏幕：字都快看不清了
      ["dead", "TODO (2019)", 46],
      ["dead", "此处删除 400 行注释", 32],
      ["dead", "为什么能跑？不知道", 34],
      ["dead", "别问，问就是祖传", 38],
      ["dead", "// 删了会崩", 44],
      ["dead", "2013 · 初版还没删", 36],
      ["term", "TODO: 清理 TODO", 32],
      ["warn", "注释和代码对不上", 30],
      ["warn", "别加新功能", 46]
    ];

    // 候选位置：沿坡面分层排，再打乱取用，免得挂得像排队
    const slots = [];
    for (let row = 0; row < 7; row++) {
      const y0 = 1.0 + row * 0.78;
      const rad = BASE_R * Math.sqrt(Math.max(0.05, 1 - y0 / H)) * 0.84;
      const n = Math.max(2, Math.round(rad * 0.9));
      for (let k = 0; k < n; k++) {
        const u = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
        slots.push({
          y: y0 + (r() - 0.5) * 0.2,
          x: CX + u * rad * 1.0 + (r() - 0.5) * 0.3,
          rad: rad + (r() - 0.5) * 0.12
        });
      }
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = slots[i]; slots[i] = slots[j]; slots[j] = t;
    }

    let slotI = 0;
    NOTES.forEach(([kind, txt, size], i) => {
      // 佛像跟前的格子跳过：屏幕挂在那儿会插进莲台和背光里
      let s = null;
      while (slotI < slots.length) {
        const c = slots[slotI++];
        if (c.y < 4.3 && Math.hypot(c.x - BX, (CZ + c.rad + 0.28) - BZ) < 2.15) continue;
        s = c;
        break;
      }
      if (!s) return;
      const ink = INK[kind];
      const wide = txt.length > 13 ? 1.18 : 1;
      const w = 1.46 * wide, h = w / 4;
      const z = CZ + s.rad + 0.28;
      const tex = A3DTex.sign({
        text: txt, w: 512, h: 128, bg: "#0b0e09", fg: ink.fg, size: size,
        border: "#222a18", borderW: 4, glow: ink.glow, glowBlur: 12
      });
      // 屏幕外壳
      W.Gbox(junk, s.x, s.y, z - 0.07, w + 0.1, h + 0.1, 0.1, [0.08, 0.09, 0.08]);
      const p = pen("note" + i, tex, { unlit: true, tint: ink.tint });
      p.quad.call(p, m4(s.x, s.y, z, 0, 0, (r() - 0.5) * 0.05), w, h, [1, 1, 1], [0, 0, 1, 1]);
    });

    // 胶带补丁：一片片窄条把裂缝贴起来，谁贴的、为什么贴，没人知道
    const tape = pen("tape", null, { tint: [0.46, 0.43, 0.34] });
    for (let i = 0; i < 11; i++) {
      const y = 0.7 + r() * 4.6;
      const rad = BASE_R * Math.sqrt(Math.max(0.05, 1 - y / H)) * 0.84;
      const x = CX + (r() - 0.5) * rad * 1.6;
      tape.quad.call(tape, m4(x, y, CZ + rad + 0.33, 0, 0, (r() - 0.5) * 2.2),
        0.45 + r() * 0.5, 0.07 + r() * 0.04, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 小概率 bug：两块屏幕平时安静，偶尔才亮出红色的真面目
    [{ txt: "Uncaught TypeError", x: -2.9, y: 3.15 },
      { txt: "null is not a function", x: 2.7, y: 4.25 }].forEach((f, i) => {
      const tex = A3DTex.sign({
        text: f.txt, w: 512, h: 128, bg: "#1a0705", fg: "#ff6a4a", size: 40,
        border: "#5a140e", borderW: 5, glow: "rgba(255,80,50,.6)", glowBlur: 18
      });
      const rad = BASE_R * Math.sqrt(Math.max(0.05, 1 - f.y / H)) * 1.02;
      const z = CZ + rad + 0.4;
      const d = dyno(tex, { unlit: true, tint: [1, 1, 1] }, t => {
        const ph = (t * (0.17 + i * 0.06) + i * 0.43) % 1;
        const k = ph < 0.04 ? 1 : 0.0001; // 96% 的时间看不见它
        return m4(f.x, f.y, z, 0, 0, 0, k, k, 1);
      });
      d.quad.call(d, m4(0, 0, 0), 1.6, 0.4, [1, 1, 1], [0, 0, 1, 1]);
    });

    // 三块「大字报」屏幕：隔着半个场景也能看清，是这座山的招牌
    const BIG_NOTES = [
      ["err", "改 1 行 · 炸 47 处", 3.6, 1.8],
      ["term", "能跑，别动", -3.9, 2.5],
      ["warn", "上一任没交接", 4.6, 3.5]
    ];
    BIG_NOTES.forEach(([kind, txt, bx, by], i) => {
      const ink = INK[kind];
      const w = 2.9, h = 0.72;
      const rad = BASE_R * Math.sqrt(Math.max(0.05, 1 - by / H)) * 0.98;
      const z = CZ + rad + 0.32;
      const tex = A3DTex.sign({
        text: txt, w: 768, h: 192, bg: "#0b0e09", fg: ink.fg, size: 62,
        border: "#222a18", borderW: 5, glow: ink.glow, glowBlur: 16
      });
      W.Gbox(junk, bx, by, z - 0.09, w + 0.14, h + 0.14, 0.12, [0.08, 0.09, 0.08]);
      const p = pen("big" + i, tex, { unlit: true, tint: ink.tint });
      p.quad.call(p, m4(bx, by, z, 0, 0, 0), w, h, [1, 1, 1], [0, 0, 1, 1]);
    });

    /* ============================================================
     *  佛祖：结跏趺坐在山旁，鎏金青铜，背后一轮背光
     *  比例：坐像约 3.6 头高，肩宽 1.5 头；莲台两层莲瓣 + 台面
     * ============================================================ */
    const gold = pen("buddha", T.brass(), { tint: [1.15, 0.95, 0.55], spec: 0.55 });
    const haloG = glow("halo", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.85, 0.4], opacity: 0.16 });
    const GOLD = [1.05, 0.9, 0.6], GOLD_D = [0.74, 0.62, 0.42], GOLD_L = [1.18, 1.03, 0.7];
    // 以佛像脚底中心为原点的小工具
    const gb = (x, y, z, sx, sy, sz, col, rz) =>
      gold.box.call(gold, m4(BX + x, y, BZ + z, 0, 0, rz || 0), sx, sy, sz, col || GOLD, 1.2);
    const gs = (x, y, z, rx, ry, rz, sx, sy, sz, col) =>
      gold.sphere.call(gold, m4(BX + x, y, BZ + z, rx, ry, rz, sx, sy, sz), 1, 8, 6, col || GOLD);

    /* ---- 莲台：底台 → 下层莲瓣 → 束腰 → 上层莲瓣 → 台面 ---- */
    gold.cyl.call(gold, m4(BX, 0, BZ), 1.6, 1.54, 0.16, 16, GOLD_D, true);
    gold.cyl.call(gold, m4(BX, 0.16, BZ), 1.5, 1.42, 0.1, 16, [0.86, 0.76, 0.56], true);
    const petal = (a, rad, y, w, len, tilt, col) => {
      const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
      gold.sphere.call(gold,
        m4(BX + px, y, BZ + pz, tilt, Math.PI / 2 - a, 0, w, len, w * 0.42),
        1, 6, 4, col);
    };
    for (let i = 0; i < 14; i++) petal((i / 14) * TAU, 1.36, 0.2, 0.17, 0.34, 1.02, i % 2 ? GOLD : [1.1, 0.95, 0.66]);
    gold.cyl.call(gold, m4(BX, 0.3, BZ), 1.14, 1.06, 0.32, 14, GOLD_D, true);
    for (let i = 0; i < 12; i++) petal((i / 12) * TAU + 0.26, 1.06, 0.5, 0.15, 0.28, 0.58, i % 2 ? GOLD_L : GOLD);
    gold.cyl.call(gold, m4(BX, 0.6, BZ), 1.02, 0.94, 0.14, 16, GOLD, true);
    gold.torus.call(gold, m4(BX, 0.75, BZ, Math.PI / 2, 0, 0), 0.96, 0.045, 24, 6, GOLD_L);

    /* ---- 盘腿：横放的两腿、膝盖、露出的脚掌 ---- */
    gb(0, 1.02, 0.06, 1.84, 0.44, 1.0);
    gs(-0.74, 1.1, 0.18, 0, 0.3, 0, 0.32, 0.24, 0.4, GOLD_L);
    gs(0.74, 1.1, 0.18, 0, -0.3, 0, 0.32, 0.24, 0.4, GOLD_L);
    gb(-0.1, 1.0, 0.5, 0.3, 0.12, 0.3, GOLD_L);
    gb(0.12, 0.98, 0.52, 0.26, 0.1, 0.28, GOLD_L);
    // 衣摆压在腿上的一道边
    gb(0, 1.26, 0.3, 1.5, 0.12, 0.62, GOLD_D);

    /* ---- 躯干：束腰 → 胸 → 肩，斜披袈裟 ---- */
    gold.cyl.call(gold, m4(BX, 1.22, BZ), 0.5, 0.58, 0.52, 12, GOLD, true);
    gold.cyl.call(gold, m4(BX, 1.74, BZ), 0.58, 0.66, 0.58, 12, GOLD, true);
    gb(0, 2.3, 0.0, 1.2, 0.24, 0.58, GOLD);
    gs(-0.6, 2.28, 0, 0, 0, 0.15, 0.28, 0.24, 0.28, GOLD_L);
    gs(0.6, 2.28, 0, 0, 0, -0.15, 0.28, 0.24, 0.28, GOLD_L);
    // 袈裟：一条从左肩斜到右腰的宽带，再压一道亮边
    gold.box.call(gold, m4(BX, 1.85, BZ + 0.44, 0, 0, 0.62), 0.24, 1.04, 0.2, GOLD_D, 1);
    gold.box.call(gold, m4(BX, 1.85, BZ + 0.5, 0, 0, 0.62), 0.055, 1.0, 0.14, GOLD_L, 1);

    /* ---- 双臂：肩 → 肘 → 腕，结禅定印 ---- */
    const arm = sgn => [
      [BX + sgn * 0.6, 2.3, BZ + 0.04],
      [BX + sgn * 0.8, 1.86, BZ + 0.2],
      [BX + sgn * 0.64, 1.44, BZ + 0.4],
      [BX + sgn * 0.42, 1.3, BZ + 0.55]
    ];
    gold.tube.call(gold, M.ident(), arm(-1), 0.14, 6, GOLD);
    gold.tube.call(gold, M.ident(), arm(1), 0.14, 6, GOLD);
    gs(-0.42, 1.3, 0.55, 0, 0, 0, 0.13, 0.13, 0.13, GOLD_L);
    gs(0.42, 1.3, 0.55, 0, 0, 0, 0.13, 0.13, 0.13, GOLD_L);
    // 叠在腿上的双掌 + 拇指
    gs(0, 1.3, 0.58, 0, 0, 0, 0.29, 0.085, 0.19, GOLD_L);
    gs(0, 1.37, 0.58, 0, 0, 0, 0.27, 0.075, 0.18, GOLD);
    gs(-0.07, 1.43, 0.58, 0, 0, 0, 0.05, 0.05, 0.05, GOLD_L);
    gs(0.07, 1.43, 0.58, 0, 0, 0, 0.05, 0.05, 0.05, GOLD_L);
    // 指尖（两片薄薄的小条，远看就是手指）
    for (let f = -1; f <= 1; f += 2) {
      gb(f * 0.16, 1.32, 0.68, 0.1, 0.05, 0.06, GOLD);
    }

    /* ---- 头：颈、面、五官、螺发、肉髻、长耳垂 ---- */
    gold.cyl.call(gold, m4(BX, 2.34, BZ), 0.2, 0.18, 0.26, 10, GOLD_D, true);
    gs(0, 2.94, 0.02, 0, 0, 0, 0.35, 0.38, 0.33, GOLD);
    gs(0, 2.76, 0.05, 0, 0, 0, 0.26, 0.19, 0.24, GOLD);            // 下巴
    gb(-0.13, 2.9, 0.3, 0.1, 0.018, 0.03, GOLD_D, -0.05);         // 左眼
    gb(0.13, 2.9, 0.3, 0.1, 0.018, 0.03, GOLD_D, 0.05);           // 右眼
    gb(-0.13, 2.92, 0.31, 0.11, 0.012, 0.02, [1.25, 1.1, 0.78], -0.05); // 左眼皮
    gb(0.13, 2.92, 0.31, 0.11, 0.012, 0.02, [1.25, 1.1, 0.78], 0.05);   // 右眼皮
    gb(-0.14, 2.97, 0.29, 0.15, 0.02, 0.02, GOLD_D, -0.12);       // 左眉
    gb(0.14, 2.97, 0.29, 0.15, 0.02, 0.02, GOLD_D, 0.12);         // 右眉
    gb(0, 2.88, 0.32, 0.06, 0.14, 0.06, GOLD_L);                  // 鼻
    gb(-0.055, 2.79, 0.31, 0.085, 0.018, 0.02, GOLD_D, 0.14);     // 嘴角（左）
    gb(0.055, 2.79, 0.31, 0.085, 0.018, 0.02, GOLD_D, -0.14);     // 嘴角（右）
    gs(0, 3.04, 0.3, 0, 0, 0, 0.028, 0.028, 0.02, [1.5, 1.32, 0.85]); // 白毫
    gs(-0.36, 2.86, 0.02, 0, 0, 0.08, 0.07, 0.26, 0.11, GOLD_L);   // 左耳垂
    gs(0.36, 2.86, 0.02, 0, 0, -0.08, 0.07, 0.26, 0.11, GOLD_L);   // 右耳垂
    gs(0, 3.32, 0.0, 0, 0, 0, 0.14, 0.12, 0.14, GOLD_L);           // 肉髻
    gold.cyl.call(gold, m4(BX, 3.4, BZ), 0.075, 0.0, 0.1, 8, GOLD_L); // 顶髻
    // 螺发：三圈小疙瘩，后面那圈只铺后半边，别糊到脸上
    // （头发数量多，用低面数的球，省顶点）
    const gh = (x, y, z, s, col) =>
      gold.sphere.call(gold, m4(BX + x, y, BZ + z, 0, 0, 0, s, s, s), 1, 5, 4, col);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      gh(Math.cos(a) * 0.28, 3.14, Math.sin(a) * 0.26, 0.038, GOLD);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + 0.22;
      gh(Math.cos(a) * 0.2, 3.22, Math.sin(a) * 0.19, 0.034, GOLD_L);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      if (Math.sin(a) > 0.15) continue;
      gh(Math.cos(a) * 0.31, 3.04, Math.sin(a) * 0.29, 0.036, GOLD);
    }

    /* ---- 背光：金环 + 放射光条 + 内层辉光 ---- */
    gold.torus.call(gold, m4(BX, 2.95, BZ - 0.5, Math.PI / 2, 0, 0), 1.2, 0.045, 30, 6, GOLD_L);
    gold.torus.call(gold, m4(BX, 2.95, BZ - 0.48, Math.PI / 2, 0, 0), 0.64, 0.022, 24, 5, GOLD_D);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      gold.box.call(gold, m4(BX + Math.cos(a) * 1.36, 2.95 + Math.sin(a) * 1.36, BZ - 0.5, 0, 0, a - Math.PI / 2),
        0.045, 0.22, 0.03, GOLD_L, 1);
    }
    haloG.quad.call(haloG, m4(BX, 2.95, BZ - 0.56), 2.9, 2.9, [1, 1, 1], [0, 0, 1, 1]);

    /* ============================================================
     *  警告牌：山脚一块大的，街口再立一块小的
     * ============================================================ */
    // 山脚的醒目警告牌：禁止重构（朝向街口，给从 GitHub 街过来的人看）
    const warnTex = A3DTex.sign({
      text: "⚠ 警告：屎山高危 ⚠\n禁止重构 · 后果自负", w: 768, h: 256, bg: "#8a0f0f", fg: "#ffe9c9",
      size: 62, lineH: 96, border: "#ffd23e", borderW: 10, glow: "rgba(255,60,30,.6)", glowBlur: 24
    });
    W.Gbox(junk, -1.95, 0.75, -2.6, 0.14, 1.5, 0.14, [0.6, 0.55, 0.5]);
    W.Gbox(junk, 1.95, 0.75, -2.6, 0.14, 1.5, 0.14, [0.6, 0.55, 0.5]);
    const warn = pen("warn", warnTex, { unlit: true, tint: [1, 1, 1] });
    warn.quad.call(warn, m4(0, 2.0, -2.6), 4.2, 1.4, [1, 1, 1], [0, 0, 1, 1]);
    const warnGlow = glow("warnGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.25, 0.1], opacity: 0.3 });
    warnGlow.quad.call(warnGlow, m4(0, 2.0, -2.46), 5.2, 2.1, [1, 1, 1], [0, 0, 1, 1]);

    // 街口的小号同款：刚从夜市走出来就能看见
    W.Gbox(junk, -5.05, 0.55, 5.4, 0.1, 1.1, 0.1, [0.55, 0.5, 0.45]);
    W.Gbox(junk, -3.55, 0.55, 5.4, 0.1, 1.1, 0.1, [0.55, 0.5, 0.45]);
    warn.quad.call(warn, m4(-4.3, 1.18, 5.4, 0, 0.12, 0), 1.75, 0.58, [1, 1, 1], [0, 0, 1, 1]);
    warnGlow.quad.call(warnGlow, m4(-4.3, 1.18, 5.48, 0, 0.12, 0), 2.2, 0.95, [1, 1, 1], [0, 0, 1, 1]);

    // 左前方那块小牌子：负责人一栏永远是空的
    const ownerTex = A3DTex.sign({
      text: "负责人：已离职\n交接文档：无", w: 640, h: 320, bg: "#12160b", fg: "#c9b268",
      size: 46, lineH: 74, border: "#3d4726", borderW: 7, glow: "rgba(190,170,80,.22)", glowBlur: 10
    });
    W.Gbox(junk, -4.75, 0.6, -2.35, 0.12, 1.2, 0.12, [0.55, 0.5, 0.45]);
    W.Gbox(junk, -3.25, 0.6, -2.35, 0.12, 1.2, 0.12, [0.55, 0.5, 0.45]);
    const owner = pen("owner", ownerTex, { unlit: true, tint: [1, 1, 1] });
    owner.quad.call(owner, m4(-4.0, 1.42, -2.35), 1.78, 0.89, [1, 1, 1], [0, 0, 1, 1]);

    /* ============================================================
     *  意大利面条电缆：从山顶一路拖到山脚
     * ============================================================ */
    const cable = pen("cable", null, { tint: [0.16, 0.15, 0.12] });
    for (let k = 0; k < 9; k++) {
      const a = r() * TAU, rr = BASE_R * (0.3 + r() * 0.5);
      const x0 = CX + Math.cos(a) * rr * 0.3, z0 = CZ + Math.sin(a) * rr * 0.3;
      const x1 = CX + Math.cos(a + 0.6) * rr, z1 = CZ + Math.sin(a + 0.6) * rr * 0.8;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        pts.push([
          x0 + (x1 - x0) * u + Math.sin(u * 9 + k) * 0.5,
          H * (1 - u) * (0.75 + r() * 0.2) + Math.sin(u * 7 + k * 2) * 0.4,
          z0 + (z1 - z0) * u + Math.cos(u * 8 + k) * 0.5
        ]);
      }
      cable.tube.call(cable, M.ident(), pts, 0.05 + r() * 0.04, 5, [1, 1, 1]);
    }

    /* ============================================================
     *  甲虫：山脚一拨、山坡一拨，绕着爬的 bug（字面意义）
     * ============================================================ */
    for (let i = 0; i < 36; i++) {
      const onSlope = i >= 22;
      const bx = (r() - 0.5) * 11;
      const bz = onSlope ? -3.5 - r() * 3.5 : -2.5 + r() * 5.5;
      const baseY = onSlope ? 1.0 + r() * 3.0 : 0.25;
      const rad = 0.4 + r() * 1.1, spd = 0.25 + r() * 0.6, ph = r() * TAU;
      const bd = dyno(null, { tint: [0.06, 0.07, 0.04] }, t => {
        const a = t * spd + ph;
        return M.trs(bx + Math.cos(a) * rad, baseY + Math.abs(Math.sin(a * 3)) * 0.6, bz + Math.sin(a) * rad,
          0, a, 0, 1, 1, 1);
      });
      bd.sphere.call(bd, m4(0, 0, 0, 0, 0, 0, 1.6, 0.7, 1), 0.095, 6, 4, [1, 1, 1]);
      bd.sphere.call(bd, m4(0, 0, 0.11, 0, 0, 0, 0.8, 0.6, 1), 0.055, 5, 3, [0.4, 0.34, 0.2]);
    }

    /* ============================================================
     *  臭气团：绿幽幽的半透明雾块慢慢飘
     * ============================================================ */
    const stink = pen("stink", T.glow(), { unlit: true, blend: "alpha", tint: [0.55, 0.75, 0.3], opacity: 0.1 });
    for (let i = 0; i < 7; i++) {
      const sx = CX + (r() - 0.5) * 14, sy = 1 + r() * 6, sz = CZ + (r() - 0.5) * 10;
      const d = dyno(T.glow(), { unlit: true, blend: "alpha", tint: [0.55, 0.75, 0.3], opacity: 0.09 }, t =>
        M.trs(sx + Math.sin(t * 0.2 + i) * 0.5, sy + Math.sin(t * 0.15 + i * 2) * 0.3, sz, 0, 0, 0, 1, 1, 1));
      d.quad.call(d, m4(0, 0, 0, 0, 0, i), 2.6 + r() * 1.5, 2.0 + r() * 1.2, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 静态的也补几团，凑厚度
    for (let i = 0; i < 5; i++) {
      stink.quad.call(stink, m4(CX + (r() - 0.5) * 12, 0.8 + r() * 5, CZ + (r() - 0.5) * 9, 0, 0, r() * 3), 3.0, 2.4, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ============================================================
     *  烧垃圾的铁桶：山脚两点火光
     * ============================================================ */
    const barrel = pen("barrel", T.darkMetal(), { tint: [0.5, 0.3, 0.2], spec: 0.3 });
    const fire = glow("fire", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.5, 0.15], opacity: 0.35 });
    for (const bx of [-5.5, 6.0]) {
      barrel.cyl.call(barrel, m4(bx, 0.45, -4.5), 0.34, 0.38, 0.9, 10, [1, 1, 1], true);
      fire.quad.call(fire, m4(bx, 1.05, -4.5), 0.9, 1.2, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 火桶周围再补两撮低火苗，远看才像在烧
    fire.quad.call(fire, m4(-5.5, 1.5, -4.5, 0, 0, 0.2), 0.55, 1.5, [1, 1, 1], [0, 0, 1, 1]);
    fire.quad.call(fire, m4(6.0, 1.5, -4.5, 0, 0, -0.2), 0.55, 1.5, [1, 1, 1], [0, 0, 1, 1]);

    /* ============================================================
     *  苍蝇：绕镜头前乱窜的黑点，个头放大
     * ============================================================ */
    const flies = [];
    for (let i = 0; i < 120; i++) {
      flies.push({
        x: (r() - 0.5) * 13, y: 0.5 + r() * 6.5, z: -5 + r() * 8,
        r: 0.1, g: 0.09, b: 0.06, a: 0.5 + r() * 0.4,
        size: 0.03 + r() * 0.045, kind: 1, speed: 0.6 + r() * 0.9, phase: r() * TAU, wob: 0.3 + r() * 0.4
      });
    }
    points(flies, { blend: "alpha", yMin: 0, yMax: 10, fogNear: 10, fogFar: 34 });

    /* ============================================================
     *  朝街口（局部 +Z）的过渡：让 GitHub 街尾自然拐进这座山
     *  只用低矮的垃圾，不挡相机看山；中间的缝留给从街上走过来的人。
     *  这里用一支独立的随机数，不打乱上面原场景的构图序列。
     * ============================================================ */
    const tr = P.rng(173);

    // 越靠近街口越稀的垃圾堆
    P.garbagePile(junk.raw, bag.raw, aim(-6.4, 0, 2.2), 0.95, 67);
    P.garbagePile(junk.raw, bag.raw, aim(6.2, 0, 3.0), 0.9, 71);
    P.garbagePile(junk.raw, bag.raw, aim(-5.6, 0, 6.6), 0.7, 73);
    P.garbagePile(junk.raw, bag.raw, aim(5.4, 0, 7.0), 0.62, 79);

    // 报废显示器：屏幕用同一张「无信号 / 404」贴图，省 draw call
    const noSignal = pen("noSignal", A3DTex.sign({
      text: "无 信 号", w: 512, h: 256, bg: "#060b0a", fg: "#3f6b58", size: 58,
      border: "#142420", borderW: 6, glow: "rgba(90,190,150,.20)", glowBlur: 14
    }), { unlit: true, tint: [0.82, 1.0, 0.9] });
    const no404 = pen("no404", A3DTex.sign({
      text: "404", w: 512, h: 256, bg: "#0c0705", fg: "#c4523a", size: 96,
      border: "#2a1310", borderW: 6, glow: "rgba(240,90,50,.28)", glowBlur: 16
    }), { unlit: true, tint: [1, 0.94, 0.9] });

    // 一台报废显示器：机箱（junk）+ 屏幕（noSignal / no404），stand 决定还留不留半截支架
    const deadMonitor = (px, py, pz, rx, ry, w, h, scr, stand) => {
      const base = m4(px, py, pz, rx, ry, 0);
      junk.box.call(junk, base, w + 0.1, h + 0.1, 0.085, [0.075, 0.08, 0.075], 1.2);
      if (stand) {
        junk.box.call(junk, M.mul(base, m4(0, -h * 0.5 - 0.11, -0.02)), 0.14, 0.24, 0.07, [0.06, 0.065, 0.06], 1.4);
      }
      scr.quad.call(scr, M.mul(base, m4(0, 0, 0.052)), w, h, [1, 1, 1], [0, 0, 1, 1]);
    };
    deadMonitor(-3.9, 0.2, 6.0, 0.16, 0.35, 0.66, 0.42, noSignal, true);   // 斜靠在垃圾袋上
    deadMonitor(6.4, 0.19, 5.8, 0.1, -0.55, 0.6, 0.38, no404, true);
    deadMonitor(6.6, 0.34, -0.6, 0.22, -0.8, 0.58, 0.36, noSignal, true);  // 山脚边上再立一台
    deadMonitor(-2.4, 0.09, 3.8, -Math.PI / 2, 0.35, 0.62, 0.4, noSignal, false); // 面朝上躺着

    // 歪倒的机箱：铁皮壳子 + 一面歪掉的侧板 + 几个通风口
    const deadCase = (px, py, pz, rx, ry, rz, w, h, d) => {
      const base = m4(px, py, pz, rx, ry, rz);
      junkRust.box.call(junkRust, base, w, h, d, [0.24, 0.19, 0.14], 2.2);
      junk.box.call(junk, M.mul(base, m4(w * 0.52, 0, 0)), 0.015, h * 0.86, d * 0.86, [0.1, 0.1, 0.09], 1.6);
      for (let k = 0; k < 3; k++) {
        junk.box.call(junk, M.mul(base, m4(0, h * 0.28 - k * h * 0.22, d * 0.5 + 0.01)),
          w * 0.28, h * 0.1, 0.02, [0.06, 0.06, 0.055], 1.5);
      }
    };
    deadCase(-7.0, 0.22, 4.0, Math.PI / 2, 0.7, 0, 0.22, 0.46, 0.44);   // 侧躺，面板朝天
    deadCase(2.4, 0.26, 6.4, -0.3, -0.9, 0.25, 0.44, 0.5, 0.22);        // 斜靠在垃圾上

    // 碎键盘：壳子 + 散了一地的键帽
    const brokenKeyboard = (px, pz, ry) => {
      junk.box.call(junk, m4(px, 0.016, pz, 0, ry, 0), 0.42, 0.03, 0.15, [0.09, 0.1, 0.09], 1.2);
      for (let i = 0; i < 9; i++) {
        junk.box.call(junk, m4(px + (tr() - 0.5) * 0.55, 0.008, pz + (tr() - 0.5) * 0.4,
          tr() * 0.5, tr() * TAU, tr() * 0.5), 0.03, 0.012, 0.03, [0.14, 0.15, 0.14], 1);
      }
    };
    brokenKeyboard(-1.6, 6.4, 0.9);
    brokenKeyboard(3.4, 4.6, -1.1);

    // 两只歪在路边的木箱
    P.crate(junk.raw, aim(-7.9, 0.17, 0.8, 0, 0.5, 0), 0.34, [0.2, 0.17, 0.13]);
    P.crate(junk.raw, aim(7.7, 0.15, 1.6, 0, -0.9, 0), 0.3, [0.18, 0.15, 0.12]);

    // 零散的垃圾袋（不堆成山，就随手扔在街尾）
    for (let i = 0; i < 6; i++) {
      const bx = (tr() - 0.5) * 13, bz = 0.8 + tr() * 7.2;
      bag.sphere.call(bag, m4(bx, 0.12 + tr() * 0.06, bz, 0, tr() * TAU, 0.24),
        0.15 + tr() * 0.1, 7, 5, [0.1 + tr() * 0.06, 0.12 + tr() * 0.03, 0.1]);
    }

    // 地上的烂电缆：从街口一路爬到山脚
    for (let k = 0; k < 4; k++) {
      const x0 = -6 + tr() * 12, z0 = 8.6 - k * 0.4;
      const x1 = x0 * 0.35 + (tr() - 0.5) * 5, z1 = 1.2 + tr() * 1.6;
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        pts.push([
          x0 + (x1 - x0) * u + Math.sin(u * 6 + k) * 0.55,
          0.03 + Math.abs(Math.sin(u * 3 + k)) * 0.08,
          z0 + (z1 - z0) * u + Math.cos(u * 5 + k) * 0.45
        ]);
      }
      cable.tube.call(cable, M.ident(), pts, 0.028, 5, [1, 1, 1]);
    }

    // 垃圾渗出来的毒水：几摊绿幽幽的水洼（静态的那批雾片共用 draw call）
    for (let i = 0; i < 4; i++) {
      stink.quad.call(stink, m4(-6 + tr() * 12, 0.028, -1 + tr() * 8, -Math.PI / 2, 0, tr() * TAU),
        1.2 + tr() * 1.6, 0.9 + tr() * 1.2, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 烧过的地皮 / 渗滤液黑斑：贴着骨架地形的低矮暗块，不算地面
    for (let i = 0; i < 7; i++) {
      const ax = -8 + tr() * 16, az = -2 + tr() * 10;
      junk.box.call(junk, m4(ax, 0.014, az, 0, tr() * TAU, 0),
        0.7 + tr() * 1.7, 0.022, 0.6 + tr() * 1.5, [0.07, 0.07, 0.06], 1.5);
    }
  }
  return { build };
})();

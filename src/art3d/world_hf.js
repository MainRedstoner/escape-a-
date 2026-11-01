/* ============================================================
 * Escape A÷ · src/art3d/world_hf.js —— 大世界分区：Hugging Face 海边营地
 *
 * 局部坐标（由 world.js 用 D 矩阵摆到世界坐标，rot = 0，所以局部轴 = 世界轴）：
 *   局部原点 = 世界 (-70, 0, -102)，在沙滩水线附近；
 *   局部 +X 往东，+Z 往岸上（内陆），-Z 往海。
 *   世界水线 -108 → 局部 z ≈ -6；沙滩斜坡在 z ∈ [-6, 2]，z > 2 是平地 y = 0。
 *
 * 营地铺在局部 x ∈ [-31, 32]、z ∈ [4, 34]：临水一排是 7 个地摊 + 2 顶面朝营地
 * 的帐篷（背朝海），后排 14 顶帐篷面朝海；两排之间留一条 z ≈ 13..19 的过道，
 * 过道中间是主篝火 (10.2, 15.0)，后排后面有后场篝火和晾衣绳。
 * 木栈桥在 x ≈ -8，从 z ≈ 2.4 往海里伸到 z ≈ -20；西侧泊着三条渔船。
 * 沙滩侧留遮阳伞、脚印、搁浅小船和一圈矮桩绳栏。
 *
 * 主视角相机在局部 (31.1, 14.1)，看向 (-66, -9)：站在营地东端过道里往西 /
 * 海面方向看。画面左侧 = 后排帐篷（面朝海），右侧 = 临水地摊（面朝营地），
 * 中间是主篝火与过道。所以“正面朝 +Z”的东西在这个机位里几乎侧对镜头，
 * 招牌、门帘、拉绳都要按这个朝向检查——能看见侧面，也要有实体支撑。
 * 地面 / 海 / 天空 / 相机 / 灯光全部由 world.js 负责，这里不改。
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
    /* ============================================================
     *  贴图：低饱和的织毯 / 苇席（取代原来高饱和的红色地毯）
     * ============================================================ */
    const matTex = A3DTex.get("hfMat", 256, 256, (cx, cw, ch) => {
      const rr = A3DTex.rnd(207);
      cx.fillStyle = "#7b6b52"; cx.fillRect(0, 0, cw, ch);
      for (let i = 0; i < cw; i += 4) {
        cx.fillStyle = "rgba(255,246,224,.045)"; cx.fillRect(i, 0, 2, ch);
        cx.fillStyle = "rgba(30,24,16,.055)"; cx.fillRect(0, i, cw, 2);
      }
      cx.strokeStyle = "rgba(42,35,26,.55)"; cx.lineWidth = 9;
      cx.strokeRect(5, 5, cw - 10, ch - 10);
      cx.strokeStyle = "rgba(198,176,134,.32)"; cx.lineWidth = 3;
      cx.strokeRect(15, 15, cw - 30, ch - 30);
      cx.strokeStyle = "rgba(120,100,72,.45)"; cx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const y = 34 + i * (ch - 68) / 4;
        cx.beginPath(); cx.moveTo(22, y); cx.lineTo(cw - 22, y); cx.stroke();
      }
      for (let i = 0; i < 30; i++) {
        cx.fillStyle = "rgba(36,28,20," + (0.05 + rr() * 0.1) + ")";
        cx.fillRect(rr() * cw, rr() * ch, 8 + rr() * 34, 2 + rr() * 7);
      }
      cx.fillStyle = "rgba(220,200,160,.16)";
      for (let i = 0; i < 18; i++) {
        cx.fillRect(10 + i * 13, 0, 2, 7);
        cx.fillRect(10 + i * 13, ch - 7, 2, 7);
      }
    });
    const rugTex = A3DTex.get("hfRug", 256, 256, (cx, cw, ch) => {
      const rr = A3DTex.rnd(311);
      cx.fillStyle = "#4b4840"; cx.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 4; i++) {
        cx.fillStyle = i % 2 ? "rgba(118,112,94,.55)" : "rgba(78,84,86,.62)";
        cx.fillRect(10, 16 + i * 58, cw - 20, 36);
      }
      cx.strokeStyle = "rgba(172,156,120,.3)"; cx.lineWidth = 4;
      cx.strokeRect(8, 8, cw - 16, ch - 16);
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const px = 34 + i * 62, py = 34 + j * 58;
          cx.beginPath();
          cx.moveTo(px, py - 14); cx.lineTo(px + 12, py); cx.lineTo(px, py + 14); cx.lineTo(px - 12, py);
          cx.closePath();
          cx.strokeStyle = "rgba(170,150,110,.18)"; cx.lineWidth = 2; cx.stroke();
        }
      }
      for (let i = 0; i < 26; i++) {
        cx.fillStyle = "rgba(24,20,16," + (0.04 + rr() * 0.09) + ")";
        cx.fillRect(rr() * cw, rr() * ch, 10 + rr() * 40, 3 + rr() * 8);
      }
    });

    /* ============================================================
     *  画笔：同一 key = 同一个 draw call
     * ============================================================ */
    const wood = pen("wood", T.wood(), { tint: [1.22, 1.0, 0.78], spec: 0.14, rim: 0.26 });
    const dark = pen("dark", T.woodDark(), { tint: [1.6, 1.28, 0.98], spec: 0.12, rim: 0.22 });
    const plank = pen("plank", T.woodPale(), { tint: [1.2, 1.06, 0.88], spec: 0.1, rim: 0.22 });
    const linen = pen("linen", T.linen(), { tint: [1.3, 1.2, 1.08], spec: 0.04, rim: 0.3 });
    const canvas = pen("canvas", T.canvasTex(), { tint: [1.55, 1.3, 1.04], spec: 0.04, rim: 0.3 });
    const cloth = pen("cloth", T.fabric(), { tint: [1.8, 1.45, 1.1], spec: 0.05, rim: 0.26, sway: 0.7 });
    const mat = pen("mat", matTex, { tint: [1.12, 1.04, 0.9], spec: 0.04, rim: 0.16 });
    const rug = pen("rug", rugTex, { tint: [1.02, 1.0, 0.96], spec: 0.04, rim: 0.18 });
    const inner = pen("inner", T.linen(), { tint: [0.84, 0.7, 0.55], spec: 0.03, rim: 0.16 });
    const stone = pen("stone", T.stone(), { tint: [1.05, 0.95, 0.84], spec: 0.2, rim: 0.26 });
    const metal = pen("metal", T.metal(), { tint: [1.32, 1.14, 0.94], spec: 0.65, rim: 0.35 });
    const brass = pen("brass", T.brass(), { tint: [1.4, 1.18, 0.86], spec: 0.72, rim: 0.4 });
    const clay = pen("clay", T.plasterWarm(), { tint: [2.75, 2.25, 1.7], spec: 0.16, rim: 0.26 });
    const leafP = pen("leaf", T.leaf(), { cutout: true, tint: [1.18, 1.32, 0.92], sway: 1.1, spec: 0.05, rim: 0.3 });
    const paper = pen("paper", T.paper(), { tint: [1.55, 0.98, 0.56], emissive: [0.5, 0.2, 0.05], spec: 0.05, rim: 0.2 });
    const rope = pen("rope", null, { tint: [0.66, 0.53, 0.4], spec: 0.03, rim: 0.1 });
    const bulb = pen("bulb", null, { unlit: true, tint: [1.0, 0.88, 0.62] });
    const sand = pen("sand", T.dirt(), { tint: [1.02, 0.84, 0.67], spec: 0.05, rim: 0.16 });
    const ash = pen("ash", T.dirt(), { tint: [0.6, 0.52, 0.44], spec: 0.02, rim: 0.1 });

    const fireGlow = glow("fireGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.44, 0.13], opacity: 0.42 });
    const flame = glow("flame", T.shaft(), { unlit: true, blend: "add", tint: [1.0, 0.52, 0.18], opacity: 0.6 });
    const bulbGlow = glow("bulbGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.76, 0.42], opacity: 0.3 });
    const lampGlow = glow("lampGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.58, 0.24], opacity: 0.34 });
    const stallGlow = glow("stallGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.84, 0.56], opacity: 0.17 });
    const coolGlow = glow("coolGlow", T.glow(), { unlit: true, blend: "add", tint: [0.42, 0.62, 1.0], opacity: 0.15 });
    const beamGlow = glow("beam", T.shaft(), { unlit: true, blend: "add", tint: [1.0, 0.72, 0.36], opacity: 0.1 });
    const smokeGlow = glow("smoke", T.glow(), { unlit: true, blend: "alpha", tint: [0.44, 0.42, 0.38], opacity: 0.12 });
    /* 远处只加“光斑”不加灯：相机 / 灯光数值是调过的，不能动 */
    const depthGlow = glow("depth", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.58, 0.26], opacity: 0.13 });

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
    /** 反向四边形：法线朝反方向，给内衬 / 从背面看的布面用 */
    function quadInv(pn, m, p0, p1, p2, p3, col) {
      pn.tri.call(pn, m, p0, p3, p2, null, col);
      pn.tri.call(pn, m, p0, p2, p1, null, col);
    }
    /** 双面小布片（旗子 / 吊牌）：背面沿法线让 5mm，避免 z-fighting */
    function triBoth(pn, m, a, b, c, col, off) {
      pn.tri.call(pn, m, a, b, c, null, col);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      const d = (off === undefined ? 0.005 : off) / l;
      nx *= d; ny *= d; nz *= d;
      pn.tri.call(pn, m,
        [a[0] - nx, a[1] - ny, a[2] - nz],
        [c[0] - nx, c[1] - ny, c[2] - nz],
        [b[0] - nx, b[1] - ny, b[2] - nz], null, col);
    }
    /** 四角贴地：坡上的垫子 / 脚印，四角各自取 groundH，不会穿地或悬空 */
    function groundQuad4(pn, x, z, w, d, ry, col, uv, lift) {
      const cc = Math.cos(ry || 0), ss = Math.sin(ry || 0);
      const hw = w / 2, hd = d / 2;
      const up = lift === undefined ? 0.025 : lift;
      const pt = (lx, lz) => {
        const wx = x + cc * lx + ss * lz, wz = z - ss * lx + cc * lz;
        return [wx, gH(wx, wz) + up, wz];
      };
      const p0 = pt(-hw, -hd), p1 = pt(-hw, hd), p2 = pt(hw, hd), p3 = pt(hw, -hd);
      let uvp;
      if (uv && typeof uv[0] === "number") {
        // 允许传 quad 风格的 [u0,v0,u1,v1]，也允许传四个角各自的 uv
        uvp = [[uv[0], uv[1]], [uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]]];
      } else {
        uvp = uv || [[0, 0], [0, 1], [1, 1], [1, 0]];
      }
      quadP(pn, M.ident(), p0, p1, p2, p3, col, uvp);
    }
    /** 圆台侧壁：外法线（a0→a1 逆时针，可留门洞） */
    function wallSegOut(pn, m, r0, r1, h, a0, a1, col) {
      const p0 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0];
      const p1 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
      const p2 = [Math.cos(a1) * r1, h, Math.sin(a1) * r1];
      const p3 = [Math.cos(a0) * r1, h, Math.sin(a0) * r1];
      quadP(pn, m, p0, p3, p2, p1, col);
    }
    /** 圆台侧壁：内法线（帐篷内衬） */
    function wallSegIn(pn, m, r0, r1, h, a0, a1, col) {
      const p0 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0];
      const p1 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
      const p2 = [Math.cos(a1) * r1, h, Math.sin(a1) * r1];
      const p3 = [Math.cos(a0) * r1, h, Math.sin(a0) * r1];
      quadP(pn, m, p0, p1, p2, p3, col);
    }
    /** 把一串局部点连成管子（绳子 / 电线 / 吊链） */
    function tubeLine(pn, pts, rad, sides, col) {
      pn.tube.call(pn, M.ident(), pts, rad, sides || 3, col || [1, 1, 1]);
    }
    /** 同上，但整串点挂在某个局部矩阵下（帐篷拉绳 / 蒙古包支杆用） */
    function tubeLocal(pn, m, pts, rad, sides, col) {
      pn.tube.call(pn, m, pts, rad, sides || 3, col || [1, 1, 1]);
    }
    /** 主视角在局部的大致位置：只给远处暖光斑 / 火光朝向用，不改相机 */
    const CAMX = 31.1, CAMZ = 14.1;
    const faceCam = (x, z) => Math.atan2(CAMX - x, CAMZ - z);
    /** 面向主镜头的暖光斑（纯发光面片，不是实体，不需要支撑） */
    function campGlow(pn, x, y, z, w, h) {
      pn.quad.call(pn, m4(x, y, z, 0, faceCam(x, z), 0), w, h, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ============================================================
     *  小道具：纸灯笼 / 木箱 / 酒桶 / 长凳 / 桌子 / 书
     * ============================================================ */
    /** 便宜的纸灯笼：圆柱纸罩 + 顶盖 + 吊绳 + 光晕（hangTo 必须是实体上的挂点） */
    function lantern(x, y, z, s, col, hangTo, withGlow) {
      paper.cyl.call(paper, m4(x, y - 0.13 * s, z), 0.105 * s, 0.126 * s, 0.26 * s, 8,
        col || [1, 1, 1], true);
      dark.cyl.call(dark, m4(x, y + 0.13 * s, z), 0.045 * s, 0.034 * s, 0.035 * s, 6,
        [1, 1, 1], true);
      if (hangTo !== null) {
        const top = hangTo === undefined ? y + 0.45 * s : hangTo;
        // 挂点必须真的在上方：不然宁可没绳，也绝不画一根悬空的绳
        if (top > y + 0.15 * s) {
          tubeLine(rope, [[x, y + 0.155 * s, z], [x, top, z]], 0.007, 3, [1, 1, 1]);
          dark.cyl.call(dark, m4(x, top - 0.012, z), 0.02, 0.015, 0.024, 5, [1, 1, 1], false);
        }
      }
      if (withGlow !== false) {
        lampGlow.quad.call(lampGlow, m4(x, y, z + 0.02), 0.9 * s, 0.9 * s, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    /** 立杆 + 横臂 + 吊灯：营地两端的灯笼挂在真正的实体上 */
    function lanternPost(x, z, h, s, dir) {
      const y = gH(x, z);
      const a = dir === undefined ? 0 : dir;
      wood.cyl.call(wood, m4(x, y, z), 0.062, 0.046, h, 5, [1, 1, 1], true);
      dark.cyl.call(dark, m4(x, y + h - 0.06, z), 0.055, 0.048, 0.1, 5, [1, 1, 1], true);
      const ax = Math.sin(a) * 0.38, az = Math.cos(a) * 0.38;
      wood.box.call(wood, m4(x + ax * 0.5, y + h - 0.08, z + az * 0.5, 0, a, 0),
        0.055, 0.055, 0.46, [1, 1, 1], 1.2);
      tubeLine(dark, [[x, y + h - 0.5, z], [x + ax * 0.9, y + h - 0.12, z + az * 0.9]],
        0.018, 3, [1, 1, 1]);
      dark.cyl.call(dark, m4(x + ax, y + h - 0.2, z + az), 0.032, 0.022, 0.1, 5,
        [1, 1, 1], false);
      lantern(x + ax, y + h - 0.48, z + az, s || 1, [1, 1, 1], y + h - 0.14, true);
    }

    function crateAt(x, y, z, s, ry, col) {
      const m = m4(x, y + s * 0.5, z, 0, ry, 0);
      wood.box.call(wood, m, s, s, s, col || [1, 1, 1], 1.5);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          plank.box.call(plank, M.mul(m, m4(sx * (s * 0.5 - 0.018), 0, sz * (s * 0.5 - 0.018))),
            s * 0.11, s * 1.02, s * 0.11, [0.86, 0.8, 0.72], 1.5);
        }
      }
      plank.box.call(plank, M.mul(m, m4(0, s * 0.5 + 0.012, 0)), s * 1.03, 0.03, s * 0.98,
        [1, 1, 1], 1.4);
      for (const sz of [-1, 1]) {
        plank.box.call(plank, M.mul(m, m4(0, 0, sz * (s * 0.5 + 0.01))), s * 0.9, s * 0.16, 0.025,
          [1, 1, 1], 1.4);
      }
    }

    /** 挂在某个父矩阵下的箱子（帐篷内部 / 柜台后面） */
    function crateLocal(m, lx, ly, lz, s, ry, col) {
      const bm = M.mul(m, m4(lx, ly + s * 0.5, lz, 0, ry || 0, 0));
      wood.box.call(wood, bm, s, s, s, col || [1, 1, 1], 1.5);
      plank.box.call(plank, M.mul(bm, m4(0, s * 0.5 + 0.012, 0)), s * 1.03, 0.03, s * 0.98,
        [1, 1, 1], 1.4);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          plank.box.call(plank, M.mul(bm, m4(sx * (s * 0.5 - 0.016), 0, sz * (s * 0.5 - 0.016))),
            s * 0.12, s * 1.01, s * 0.12, [0.86, 0.8, 0.72], 1.5);
        }
      }
    }

    function barrelAt(x, z, s, ry, y0) {
      const y = y0 === undefined ? gH(x, z) : y0;
      const m = m4(x, y, z, 0, ry || 0, 0);
      const rr = 0.34 * s, hh = 0.86 * s;
      dark.cyl.call(dark, M.mul(m, m4(0, 0, 0)), rr * 0.86, rr, hh * 0.5, 10, [1, 1, 1], false);
      dark.cyl.call(dark, M.mul(m, m4(0, hh * 0.5, 0)), rr, rr * 0.86, hh * 0.5, 10, [1, 1, 1], false);
      for (const t of [0.18, 0.5, 0.82]) {
        metal.cyl.call(metal, M.mul(m, m4(0, hh * t, 0)), rr * 0.94, rr * 0.94, 0.035, 10,
          [1, 1, 1], false);
      }
      plank.cyl.call(plank, M.mul(m, m4(0, hh - 0.01, 0)), rr * 0.82, rr * 0.82, 0.03, 10,
        [1, 1, 1], true);
      // 桶口的塞子 / 提手
      dark.cyl.call(dark, M.mul(m, m4(rr * 0.3, hh + 0.015, 0)), 0.035, 0.03, 0.035, 5,
        [1, 1, 1], true);
    }

    /** 麻袋：鼓起的布袋 + 收口 + 麻绳；落在地面上 */
    function sackAt(x, z, s, ry, col, y0) {
      const y = y0 === undefined ? gH(x, z) : y0;
      const m = m4(x, y, z, 0, ry || 0, 0);
      linen.sphere.call(linen, M.mul(m, m4(0, 0.14 * s, 0, 0, 0, 0, 1.0, 0.66, 1.0)),
        0.21 * s, 8, 6, col);
      linen.sphere.call(linen, M.mul(m, m4(0.05 * s, 0.1 * s, 0.02 * s, 0, 0.5, 0, 0.8, 0.6, 0.9)),
        0.15 * s, 7, 5, [col[0] * 0.92, col[1] * 0.9, col[2] * 0.88]);
      linen.cyl.call(linen, M.mul(m, m4(0, 0.28 * s, 0)), 0.12 * s, 0.07 * s, 0.17 * s, 7,
        [col[0] * 0.88, col[1] * 0.86, col[2] * 0.82], true);
      dark.cyl.call(dark, M.mul(m, m4(0, 0.42 * s, 0)), 0.062 * s, 0.058 * s, 0.022, 6,
        [1, 1, 1], true);
      tubeLine(rope, [[x + Math.sin(ry) * 0.055 * s, y + 0.40 * s, z + Math.cos(ry) * 0.055 * s],
        [x - Math.sin(ry) * 0.055 * s, y + 0.38 * s, z - Math.cos(ry) * 0.055 * s]], 0.008, 3,
        [1, 1, 1]);
    }

    function benchAt(x, z, ry, len, col) {
      const y0 = gH(x, z);
      wood.box.call(wood, m4(x, y0 + 0.46, z, 0, ry, 0), len, 0.09, 0.38, col || [1, 1, 1], 1.5);
      for (const s of [-1, 1]) {
        wood.box.call(wood, m4(x + Math.cos(ry) * s * (len * 0.32), y0 + 0.23,
          z - Math.sin(ry) * s * (len * 0.32), 0, ry, 0), 0.12, 0.46, 0.34, [0.9, 0.85, 0.8], 1.5);
      }
      // 两根横撑，别让腿只是四块板
      for (const s of [-1, 1]) {
        tubeLine(dark, [[x + Math.cos(ry) * s * (len * 0.32), y0 + 0.2, z - Math.sin(ry) * s * (len * 0.32)],
          [x + Math.cos(ry) * s * (len * 0.32) + Math.sin(ry) * 0.15, y0 + 0.2,
            z - Math.sin(ry) * s * (len * 0.32) + Math.cos(ry) * 0.15]], 0.018, 3, [1, 1, 1]);
      }
    }

    function tableAt(x, z, ry, w, d, h, col) {
      const y0 = gH(x, z);
      wood.box.call(wood, m4(x, y0 + h, z, 0, ry, 0), w, 0.07, d, col || [1, 1, 1], 1.3);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lx = x + Math.cos(ry) * sx * (w / 2 - 0.1) + Math.sin(ry) * sz * (d / 2 - 0.1);
          const lz = z - Math.sin(ry) * sx * (w / 2 - 0.1) + Math.cos(ry) * sz * (d / 2 - 0.1);
          wood.box.call(wood, m4(lx, y0 + h * 0.5 - 0.03, lz, 0, ry, 0), 0.07, h, 0.07,
            [0.9, 0.85, 0.8], 1.4);
        }
      }
    }

    function bookAt(m, lx, ly, lz, w, h, d, ry, col) {
      const bm = M.mul(m, m4(lx, ly + h * 0.5, lz, 0, ry, 0));
      linen.box.call(linen, bm, w, h, d, col, 2.0);
      plank.box.call(plank, M.mul(bm, m4(0, 0, d * 0.5 + 0.002)), w * 0.78, h * 0.88, 0.02,
        [1, 1, 1], 1.5);
    }

    /** 横放的原木座椅：底部落地，坐面高约 0.3；轴沿 ry 的横向 */
    function logSeatAt(x, z, ry, len, rad, col) {
      const y0 = gH(x, z);
      const r0 = rad || 0.15;
      const dx = Math.cos(ry), dz = -Math.sin(ry);
      const m = m4(x + dx * len / 2, y0 + r0, z + dz * len / 2, 0, ry, Math.PI / 2);
      wood.cyl.call(wood, m, r0 * 0.92, r0, len, 7, col || [1, 1, 1], true);
      // 两根垫木，把原木和地面之间的缝塞住
      for (const sg of [-1, 1]) {
        dark.box.call(dark, m4(x + dx * sg * len * 0.3, y0 + 0.025, z + dz * sg * len * 0.3),
          0.17, 0.05, 0.17, [1, 1, 1], 1.2);
      }
    }

    /** 挂在实体横杆上的布告 / 展示板：两根吊绳从锚点垂下来 */
    function hangBoard(pn, m, lx, topY, lz, w, h, col, anchorY) {
      dark.box.call(dark, M.mul(m, m4(lx, topY - h / 2, lz - 0.016)), w + 0.04, h + 0.04, 0.03,
        [1, 1, 1], 1.2);
      pn.quad.call(pn, M.mul(m, m4(lx, topY - h / 2, lz, 0, 0, 0)), w, h, col, [0, 0, 1, 1]);
      const ay = anchorY === undefined ? topY + 0.26 : anchorY;
      for (const sx of [-1, 1]) {
        tubeLocal(rope, m, [[lx + sx * w * 0.32, topY, lz], [lx + sx * w * 0.32, ay, lz + 0.01]],
          0.006, 3, [1, 1, 1]);
      }
    }

    /** 价签：从柜台边缘 / 横杆吊下来的小木牌（topY 是挂点） */
    function priceTag(m, lx, topY, lz, w, h, ry, col) {
      const bm = M.mul(m, m4(lx, topY - h * 0.5 - 0.07, lz, 0, ry || 0, 0));
      plank.box.call(plank, bm, w, h, 0.012, col || [1, 1, 1], 1.6);
      dark.box.call(dark, M.mul(bm, m4(0, h * 0.14, 0.008)), w * 0.56, 0.008, 0.004,
        [0.2, 0.16, 0.12], 1);
      dark.box.call(dark, M.mul(bm, m4(0, -h * 0.18, 0.008)), w * 0.4, 0.006, 0.004,
        [0.2, 0.16, 0.12], 1);
      tubeLocal(rope, m, [[lx, topY - h - 0.07, lz], [lx, topY, lz]], 0.005, 3, [1, 1, 1]);
    }

    /* ============================================================
     *  招牌：帐篷 / 摊位 / 入口 / 码头 / 路牌
     * ============================================================ */
    const SIGN_BG = ["#2c2118", "#241b16", "#1d222c", "#2a1c1c", "#26221a", "#1c2420"];
    const SIGN_FG = ["#f6dca6", "#ffe1b0", "#d9e8f5", "#ffd2b8", "#f2e2b8", "#cfe9d4"];
    const SIGN_BR = ["#8a6a3c", "#7a5638", "#40546a", "#7a3e34", "#6e6038", "#3e5a48"];
    const SIGN_GL = ["rgba(255,210,140,.35)", "rgba(255,196,120,.3)", "rgba(150,205,255,.3)",
      "rgba(255,170,140,.3)", "rgba(250,225,160,.3)", "rgba(160,240,190,.28)"];

    /** 招牌板：背板 + 贴图面；返回笔刷，背面小牌复用同一张贴图 */
    function addSignBoard(key, cfg, x, y, z, ry, w, h) {
      const tex = A3DTex.sign(cfg);
      const p = pen("sign_" + key, tex, { unlit: true, tint: [1, 1, 1] });
      const nx = Math.sin(ry), nz = Math.cos(ry);
      dark.box.call(dark, m4(x, y, z, 0, ry, 0), w + 0.1, h + 0.1, 0.055, [1, 1, 1], 1.5);
      p.quad.call(p, m4(x + nx * 0.045, y, z + nz * 0.045, 0, ry, 0), w, h,
        [1, 1, 1], [0, 0, 1, 1]);
      return p;
    }

    /** 摊位背面 / 侧面用的小号牌子：复用招牌贴图，不额外增 draw call */
    function addBackBoard(p, x, y, z, ry, w, h) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      dark.box.call(dark, m4(x, y, z, 0, ry, 0), w + 0.08, h + 0.08, 0.05, [1, 1, 1], 1.5);
      p.quad.call(p, m4(x + nx * 0.04, y, z + nz * 0.04, 0, ry, 0), w, h,
        [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 帐篷门口的小木牌：两根立柱 + 吊牌 + 从柱顶横臂吊下来的纸灯笼 */
    function tentSign(x, z, ry, name, idx, dist) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      const bx = x + nx * dist, bz = z + nz * dist;
      const cfg = {
        text: name, w: 320, h: 96, bg: SIGN_BG[idx % 6], fg: SIGN_FG[idx % 6],
        size: 44, lineH: 48, border: SIGN_BR[idx % 6], borderW: 5,
        glow: SIGN_GL[idx % 6], glowBlur: 8
      };
      const p = addSignBoard("t" + idx, cfg, bx, 1.74, bz, ry, 1.06, 0.32);
      for (const s of [-1, 1]) {
        const px = bx + ux * 0.5 * s, pz = bz + uz * 0.5 * s;
        wood.cyl.call(wood, m4(px, 0, pz), 0.042, 0.034, 1.92, 5, [1, 1, 1], true);
        dark.cyl.call(dark, m4(px, 1.9, pz), 0.05, 0.042, 0.05, 5, [1, 1, 1], true);
        tubeLine(rope, [[px, 1.88, pz], [px, 1.79, pz],
          [bx + ux * 0.5 * s, 1.75, bz + uz * 0.5 * s]], 0.008, 3, [1, 1, 1]);
      }
      // 门边灯笼：小木臂从立柱伸出去，灯笼吊在臂端，有实体支撑
      const sgn = 1;
      const px = bx + ux * 0.5 * sgn, pz = bz + uz * 0.5 * sgn;
      const hx = bx + ux * 0.72 * sgn, hz = bz + uz * 0.72 * sgn;
      wood.box.call(wood, m4((px + hx) / 2, 1.86, (pz + hz) / 2, 0,
        Math.atan2(ux * sgn, uz * sgn), 0), 0.05, 0.05, 0.34, [1, 1, 1], 1.2);
      dark.cyl.call(dark, m4(hx, 1.79, hz), 0.026, 0.02, 0.06, 5, [1, 1, 1], false);
      lantern(hx, 1.48, hz, 0.9, [1, 1, 1], 1.82, true);
      return p;
    }

    /** 门口 / 帐篷前的织毯：四角贴地 + 深色底垫 + 前缘流苏 */
    function doorMat(x, z, ry, frontAt, w, d, col) {
      const cx = x + Math.sin(ry) * frontAt, cz = z + Math.cos(ry) * frontAt;
      const ww = w || 1.5, dd = d || 1.05;
      groundQuad4(mat, cx, cz, ww + 0.08, dd + 0.06, ry, [0.34, 0.3, 0.25], null, 0.018);
      groundQuad4(mat, cx, cz, ww, dd, ry, col || [1, 1, 1], [0, 0, 1.25, 0.9], 0.026);
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const fw = ww / 2;
      for (let i = 0; i < 7; i++) {
        const lx = -fw + 0.16 + i * (fw * 2 - 0.32) / 6;
        const fx = cx + ux * lx + nx * (dd / 2 + 0.02);
        const fz = cz + uz * lx + nz * (dd / 2 + 0.02);
        const tx = fx + nx * 0.09, tz = fz + nz * 0.09;
        tubeLine(rope, [[fx, gH(fx, fz) + 0.022, fz], [tx, gH(tx, tz) + 0.022, tz]],
          0.006, 3, [0.8, 0.72, 0.58]);
      }
    }

    const STALL_NAMES = ["烤串 · SKEWER", "热可可 · COCOA", "周边 · MERCH", "旧显卡 · GPU",
      "旧书 · BOOKS", "乐器 · MUSIC", "毯子 · RUGS"];

    /** 摊位招牌：架在两根加高前柱之间的横梁上，绳子 / 灯笼都有落点 */
    function stallSign(x, z, ry, name, idx, w, half) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      const bx = x + nx * (half + 0.06), bz = z + nz * (half + 0.06);
      const cfg = {
        text: name, w: 512, h: 128, bg: "#241a12", fg: "#ffe0aa", size: 44, lineH: 48,
        border: "#8a5f34", borderW: 5, glow: "rgba(255,190,110,.35)", glowBlur: 10
      };
      const p = addSignBoard("s" + idx, cfg, bx, 2.9, bz, ry, 2.25, 0.55);
      // 横梁：前柱（booth 里画到 3.32）之间
      const beamY = 3.24;
      wood.box.call(wood, m4(x + nx * half, beamY, z + nz * half, 0, ry, 0),
        w + 0.16, 0.08, 0.09, [1, 1, 1], 1.3);
      for (const s of [-1, 1]) {
        tubeLine(rope, [[bx + ux * 1.0 * s, 3.17, bz + uz * 1.0 * s],
          [bx + ux * 1.0 * s, 3.2, bz + uz * 1.0 * s - nz * 0.05]], 0.009, 3, [1, 1, 1]);
      }
      // 横梁两端的纸灯笼：吊绳从梁底垂下来
      for (const s of [-1, 1]) {
        const lx = x + nx * half + ux * 1.32 * s;
        const lz = z + nz * half + uz * 1.32 * s;
        wood.box.call(wood, m4(lx, beamY - 0.04, lz), 0.08, 0.03, 0.08, [1, 1, 1], 1.2);
        lantern(lx, 2.48, lz, 1.05, [1, 1, 1], beamY - 0.055, true);
      }
      return p;
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

    /* ============================================================
     *  帐篷公用：门口 / 内衬 / 拉绳 / 补丁 / 检修口 / 旗帜
     * ============================================================ */
    /** 矩形帐篷的内部：地布 + 床 + 木箱 + 灯（从门口能看到一点） */
    function tentInterior(m, hw, hd, col) {
      const w = hw * 2 - 0.16, d = hd * 2 - 0.16;
      mat.quad.call(mat, M.mul(m, m4(0, 0.03, 0, -Math.PI / 2, 0, 0)), w, d,
        [0.9, 0.85, 0.75], [0, 0, 1.35, 1.4]);
      const bl = Math.min(1.45, hd * 2 - 0.55);
      const bx = -(hw - 0.52), bz = -(hd - 0.8);
      wood.box.call(wood, M.mul(m, m4(bx, 0.18, bz)), 0.82, 0.22, bl, [1, 1, 1], 1.3);
      linen.box.call(linen, M.mul(m, m4(bx, 0.32, bz)), 0.74, 0.12, bl - 0.06,
        [0.95, 0.9, 0.8], 1.5);
      cloth.box.call(cloth, M.mul(m, m4(bx, 0.39, bz + 0.14)), 0.72, 0.055, bl * 0.62,
        col, 1.4);
      linen.box.call(linen, M.mul(m, m4(bx, 0.4, bz - bl / 2 + 0.18)), 0.5, 0.1, 0.3,
        [1.05, 1.0, 0.9], 1.6);
      const cx = hw - 0.48, cz = -(hd - 0.5);
      crateLocal(m, cx, 0.02, cz, 0.46, -0.15, [0.78, 0.66, 0.52]);
      paper.cyl.call(paper, M.mul(m, m4(cx, 0.49, cz)), 0.055, 0.075, 0.16, 8, [1, 1, 1], true);
      lampGlow.quad.call(lampGlow, M.mul(m, m4(cx, 0.64, cz + 0.02)), 0.95, 0.95, [1, 1, 1],
        [0, 0, 1, 1]);
      wood.cyl.call(wood, M.mul(m, m4(-0.18, 0.02, hd - 0.42)), 0.16, 0.13, 0.34, 6,
        [1, 1, 1], true);
    }

    /** 圆形帐篷的内部：小号用铺盖卷，大号用矮床；都带箱子和灯 */
    function tentInteriorRound(m, rad, col, small) {
      const fw = rad * 1.28;
      mat.quad.call(mat, M.mul(m, m4(0, 0.03, 0, -Math.PI / 2, 0, 0)), fw, fw,
        [0.88, 0.82, 0.72], [0, 0, 1.3, 1.3]);
      let cx, cz, chest;
      if (small) {
        const bx = -rad * 0.32, bz = -rad * 0.08;
        cloth.box.call(cloth, M.mul(m, m4(bx, 0.11, bz, 0, 0.2, 0)), 0.62, 0.16,
          rad * 0.82, [0.78, 0.7, 0.6], 1.3);
        linen.box.call(linen, M.mul(m, m4(bx, 0.2, bz - rad * 0.34)), 0.42, 0.1, 0.26,
          [1.05, 1.0, 0.9], 1.6);
        cx = rad * 0.42;
        cz = -rad * 0.34;
        chest = 0.3;
      } else {
        const bl = Math.min(1.35, rad * 1.1), bx = -rad * 0.36, bz = -rad * 0.28;
        wood.box.call(wood, M.mul(m, m4(bx, 0.17, bz)), 0.76, 0.2, bl, [1, 1, 1], 1.3);
        linen.box.call(linen, M.mul(m, m4(bx, 0.31, bz)), 0.7, 0.12, bl - 0.06,
          [0.95, 0.9, 0.8], 1.5);
        cloth.box.call(cloth, M.mul(m, m4(bx, 0.38, bz + 0.12)), 0.68, 0.055, bl * 0.6,
          col, 1.4);
        cx = rad * 0.46;
        cz = -rad * 0.3;
        chest = 0.42;
      }
      crateLocal(m, cx, 0.02, cz, chest, 0.22, [0.78, 0.66, 0.52]);
      paper.cyl.call(paper, M.mul(m, m4(cx, 0.05 + chest, cz)), 0.05, 0.07, 0.15, 8,
        [1, 1, 1], true);
      lampGlow.quad.call(lampGlow, M.mul(m, m4(cx, 0.2 + chest, cz + 0.02)), 0.9, 0.9,
        [1, 1, 1], [0, 0, 1, 1]);
    }

    /** 门框：两根门柱 + 门楣 + 门槛 */
    function doorFrame(m, z, dw, dh, col) {
      const t = 0.075;
      for (const s of [-1, 1]) {
        wood.box.call(wood, M.mul(m, m4(s * (dw / 2 + t / 2), dh / 2, z)), t, dh, 0.1,
          col || [1, 1, 1], 1.4);
      }
      wood.box.call(wood, M.mul(m, m4(0, dh + t / 2, z)), dw + t * 2, t, 0.11,
        col || [1, 1, 1], 1.4);
      wood.box.call(wood, M.mul(m, m4(0, 0.05, z)), dw + t * 2, 0.1, 0.16,
        [0.9, 0.85, 0.75], 1.3);
    }

    /** 双层门帘：外层 + 深色内层，向两侧拢起、用绳系在门柱上 */
    function doorCurtains(m, z, dw, dh, col, tieY) {
      const inCol = [col[0] * 0.64 + 0.03, col[1] * 0.62 + 0.03, col[2] * 0.6 + 0.03];
      const ty = tieY === undefined ? dh * 0.62 : tieY;
      for (const s of [-1, 1]) {
        const xf = s * (dw / 2 - 0.02), xi = s * 0.07;
        quadP(cloth, m, [xf, 0.03, z + 0.02], [xi, 0.05, z + 0.12],
          [xi * 0.96, ty + 0.24, z + 0.13], [xf, dh - 0.02, z + 0.02], col);
        quadP(cloth, m, [xf, 0.03, z - 0.02], [xi, 0.05, z + 0.04],
          [xi, ty + 0.2, z + 0.04], [xf, dh - 0.04, z - 0.025], inCol);
        tubeLocal(rope, m, [[s * (dw / 2 + 0.04), ty + 0.06, z + 0.03],
          [s * (dw / 2 - 0.1), ty + 0.02, z + 0.14]], 0.009, 3, [1, 1, 1]);
        quadP(cloth, m, [s * (dw * 0.2), 0.04, z + 0.1], [s * (dw * 0.12), 0.04, z + 0.16],
          [s * (dw * 0.11), ty - 0.12, z + 0.15], [s * (dw * 0.19), ty - 0.12, z + 0.09],
          [inCol[0] * 0.88, inCol[1] * 0.88, inCol[2] * 0.88]);
      }
    }

    /** 帐篷拉绳 + 地钉：屋檐角 → 地面钉，钉和绳都有实体落点 */
    function guyRopes(x, z, ry, m, pts, spread) {
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const p of pts) {
        const dx = p[0] >= 0 ? 1 : -1, dz = p[2] >= 0 ? 1 : -1;
        const ex = p[0] + dx * (spread || 0.6), ez = p[2] + dz * (spread || 0.55);
        const wx = x + c * ex + s * ez, wz = z - s * ex + c * ez;
        const y0 = gH(wx, wz);
        tubeLocal(rope, m, [p, [p[0] + dx * (spread || 0.6) * 0.42, p[1] * 0.52,
          p[2] + dz * (spread || 0.55) * 0.42], [ex, y0 + 0.22, ez]], 0.013, 3, [1, 1, 1]);
        wood.cyl.call(wood, M.mul(m, m4(ex, y0, ez)), 0.04, 0.03, 0.26, 4, [1, 1, 1], true);
        tubeLocal(rope, m, [[ex, y0 + 0.24, ez], [ex + 0.11, y0 + 0.26, ez + 0.02]],
          0.008, 3, [1, 1, 1]);
      }
    }

    /** 布面补丁：贴在布上的小方块 + 一圈缝线 */
    function fabricPatch(m, lx, ly, lz, w, h, ry, col) {
      const pm = M.mul(m, m4(lx, ly, lz, 0, ry || 0, 0));
      cloth.quad.call(cloth, pm, w, h, col, [0, 0, 1, 1]);
      const hw = w / 2, hh = h / 2, zz = 0.006;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        tubeLocal(rope, pm, [[a[0], a[1], zz], [b[0], b[1], zz]], 0.004, 3,
          [0.85, 0.78, 0.64]);
      }
      tubeLocal(rope, pm, [[-hw * 0.55, -hh * 0.7, zz], [hw * 0.55, hh * 0.7, zz]],
        0.004, 3, [0.85, 0.78, 0.64]);
    }

    /** 背面检修口：一块深色门帘 + 交叉绑绳 + 顶部卷边 */
    function backFlap(m, w, h, lz, ly, col) {
      const y = ly === undefined ? 0.28 : ly;
      // 检修口在帐篷背面：外法线朝 -Z，绑绳放在布的外侧
      quadInv(cloth, m, [-w / 2, y, lz], [w / 2, y, lz], [w / 2, y + h, lz],
        [-w / 2, y + h, lz], col);
      dark.cyl.call(dark, M.mul(m, m4(w / 2, y + h + 0.01, lz - 0.015, 0, 0, Math.PI / 2)),
        0.035, 0.035, w, 5, [1, 1, 1], true);
      for (let i = 0; i < 3; i++) {
        const y0 = y + 0.08 + i * h / 3, y1 = y0 + h / 3;
        tubeLocal(rope, m, [[-w / 2 + 0.03, y0, lz - 0.014], [w / 2 - 0.03, y1, lz - 0.02]],
          0.006, 3, [1, 1, 1]);
        tubeLocal(rope, m, [[w / 2 - 0.03, y0, lz - 0.022], [-w / 2 + 0.03, y1, lz - 0.028]],
          0.006, 3, [1, 1, 1]);
      }
    }

    /** 旗子：双面布片，系在脊杆 / 旗杆上 */
    function clothFlag(m, lx, ly, lz, ry, len, col) {
      const fm = M.mul(m, m4(lx, ly, lz, 0, ry || 0, 0));
      triBoth(cloth, fm, [0, 0, 0], [len, 0.05, 0], [0, -len * 0.5, 0], col, 0.006);
      tubeLocal(rope, fm, [[0.01, 0.03, 0], [0.09, 0.08, 0]], 0.007, 3, [1, 1, 1]);
    }

    /* ============================================================
     *  帐篷：七种造型
     * ============================================================ */
    function tentA(x, z, ry, col, seed) {
      const rr = P.rng(seed || 1);
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 2.6, d = 3.2, wall = 0.95, h = 2.32;
      const hw = w / 2, hd = d / 2, dw = 1.0, dh = 1.52;
      const cd = [col[0] * 0.9, col[1] * 0.9, col[2] * 0.92];
      const inCol = [col[0] * 0.7 + 0.04, col[1] * 0.68 + 0.04, col[2] * 0.66 + 0.04];
      const gy = wall + (h - wall) * (1 - (dw / 2) / hw);
      const mi = M.mul(m, m4(0, -0.012, 0, 0, 0, 0, 0.984, 0.984, 0.984));
      // 侧墙（外 + 内衬）
      quadP(linen, m, [hw, 0.03, -hd], [hw, wall, -hd], [hw, wall, hd], [hw, 0.03, hd], col);
      quadInv(linen, mi, [hw, 0.03, -hd], [hw, wall, -hd], [hw, wall, hd], [hw, 0.03, hd], inCol);
      quadP(linen, m, [-hw, 0.03, hd], [-hw, wall, hd], [-hw, wall, -hd], [-hw, 0.03, -hd], col);
      quadInv(linen, mi, [-hw, 0.03, hd], [-hw, wall, hd], [-hw, wall, -hd], [-hw, 0.03, -hd], inCol);
      // 后墙 + 后山墙 + 内衬
      quadP(linen, m, [hw, 0.03, -hd], [-hw, 0.03, -hd], [-hw, wall, -hd], [hw, wall, -hd], cd);
      quadInv(linen, mi, [hw, 0.03, -hd], [-hw, 0.03, -hd], [-hw, wall, -hd], [hw, wall, -hd], inCol);
      linen.tri.call(linen, m, [-hw, wall, -hd], [0, h, -hd], [hw, wall, -hd], null, cd);
      linen.tri.call(linen, mi, [hw, wall, -hd], [0, h, -hd], [-hw, wall, -hd], null, inCol);
      // 屋顶两坡（外 + 内衬）
      quadP(linen, m, [-hw, wall, -hd], [-hw, wall, hd], [0, h, hd], [0, h, -hd], col);
      quadInv(linen, mi, [-hw, wall, -hd], [-hw, wall, hd], [0, h, hd], [0, h, -hd], inCol);
      quadP(linen, m, [hw, wall, -hd], [0, h, -hd], [0, h, hd], [hw, wall, hd], cd);
      quadInv(linen, mi, [hw, wall, -hd], [0, h, -hd], [0, h, hd], [hw, wall, hd], inCol);
      // 正面：门洞左右下墙 + 左右山墙三角 + 门楣以上
      quadP(linen, m, [-hw, 0.03, hd], [-dw / 2, 0.03, hd], [-dw / 2, wall, hd],
        [-hw, wall, hd], col);
      quadP(linen, m, [dw / 2, 0.03, hd], [hw, 0.03, hd], [hw, wall, hd],
        [dw / 2, wall, hd], cd);
      linen.tri.call(linen, m, [-hw, wall, hd], [-dw / 2, wall, hd], [-dw / 2, gy, hd], null, col);
      linen.tri.call(linen, m, [dw / 2, wall, hd], [hw, wall, hd], [dw / 2, gy, hd], null, cd);
      quadP(linen, m, [-dw / 2, dh, hd], [dw / 2, dh, hd], [dw / 2, gy, hd],
        [-dw / 2, gy, hd], cd);
      linen.tri.call(linen, m, [-dw / 2, gy, hd], [dw / 2, gy, hd], [0, h, hd], null, col);
      // 门框 + 双层门帘
      doorFrame(m, hd + 0.02, dw, dh, [0.95, 0.9, 0.8]);
      doorCurtains(m, hd + 0.01, dw - 0.02, dh - 0.03, col, 0.92);
      // 内部
      tentInterior(m, hw, hd, col);
      // 脊杆 + 两根内部支撑
      dark.cyl.call(dark, M.mul(m, m4(0, h + 0.03, -hd - 0.2, Math.PI / 2, 0, 0)),
        0.036, 0.028, d + 0.4, 5, [1, 1, 1], true);
      for (const zz of [-hd + 0.12, hd - 0.36]) {
        dark.cyl.call(dark, M.mul(m, m4(0, 0.03, zz)), 0.03, 0.026, h - 0.04, 5, [1, 1, 1], true);
      }
      // 缝线：屋脊 / 屋檐 / 山墙边 + 屋面折缝
      tubeLocal(rope, m, [[0, h + 0.006, -hd], [0, h + 0.006, hd]], 0.009, 3, [1, 0.94, 0.82]);
      for (const s of [-1, 1]) {
        tubeLocal(rope, m, [[s * hw, wall + 0.004, -hd], [s * hw, wall + 0.004, hd]],
          0.008, 3, [1, 0.94, 0.82]);
        tubeLocal(rope, m, [[s * hw, wall, -hd], [0, h, -hd]], 0.007, 3, [1, 0.94, 0.82]);
        tubeLocal(rope, m, [[s * hw, wall, hd], [0, h, hd]], 0.007, 3, [1, 0.94, 0.82]);
        for (const zz of [-0.75, 0.4]) {
          tubeLocal(rope, m, [[s * hw, wall, zz], [0, h, zz]], 0.006, 3, [1, 0.9, 0.78]);
        }
      }
      // 补丁 / 背面检修口 / 旗
      fabricPatch(m, -0.86, 1.09, hd + 0.008, 0.34, 0.22, 0, [0.74, 0.6, 0.46]);
      fabricPatch(m, hw + 0.006, 0.42, -0.5, 0.3, 0.24, Math.PI / 2, [0.68, 0.56, 0.44]);
      backFlap(m, 0.62, 0.68, -hd - 0.012, 0.3,
        [col[0] * 0.7, col[1] * 0.68, col[2] * 0.68]);
      clothFlag(m, 0, h + 0.03, hd + 0.16, Math.PI / 2, 0.72,
        [1.24, 0.56, 0.42 + rr() * 0.12]);
      // 拉绳 + 地钉
      guyRopes(x, z, ry, m, [[-hw, wall, -hd], [hw, wall, -hd], [-hw, wall, hd],
        [hw, wall, hd]], 0.62);
      // 帐脚压石
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + 0.3;
        const px = Math.cos(a) * (hw + 0.06), pz = Math.sin(a) * (hd + 0.06);
        const wx = x + Math.cos(ry) * px + Math.sin(ry) * pz;
        const wz = z - Math.sin(ry) * px + Math.cos(ry) * pz;
        const y0 = gH(wx, wz);
        stone.sphere.call(stone, M.mul(m, m4(px, y0 + 0.03, pz, 0, r() * TAU, 0,
          1.4, 0.5, 1.1)), 0.09, 5, 4, [1, 1, 1]);
      }
    }

    function tentDome(x, z, ry, col, seed) {
      const rr = P.rng(seed || 2);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.55, wall = 1.25, domeH = 0.85, seg = 16;
      const inCol = [col[0] * 0.7 + 0.04, col[1] * 0.68 + 0.04, col[2] * 0.66 + 0.04];
      const cd = [col[0] * 0.9, col[1] * 0.9, col[2] * 0.92];
      // 墙：一圈布墙，正面留门洞
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const am = (a0 + a1) / 2;
        const da = Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2));
        if (Math.abs(da) < 0.4) continue;
        wallSegOut(linen, m, rad, rad, wall, a0, a1, col);
        wallSegIn(inner, m, rad - 0.03, rad - 0.03, wall - 0.02, a0, a1, inCol);
      }
      rope.torus.call(rope, M.mul(m, m4(0, wall + 0.02, 0)), rad * 1.01, 0.015, 16, 4,
        [1, 1, 1]);
      // 穹顶 + 内衬（负半径 = 法线朝内）
      linen.sphere.call(linen, M.mul(m, m4(0, wall, 0, 0, 0, 0, 1, domeH / rad, 1)),
        rad, 16, 8, cd);
      inner.sphere.call(inner, M.mul(m, m4(0, wall, 0, 0, 0, 0, 1, (domeH - 0.05) / rad, 1)),
        -(rad - 0.06), 14, 7, inCol);
      // 门框 + 双层门帘
      const dh = 1.13, dw = 1.1, dz = 1.43;
      doorFrame(m, dz, dw, dh, [0.92, 0.86, 0.74]);
      doorCurtains(m, dz - 0.02, dw - 0.04, dh - 0.03, col, 0.72);
      quadP(canvas, m, [-rad * 0.42, 1.19, dz + 0.02], [rad * 0.42, 1.19, dz + 0.02],
        [rad * 0.4, 1.27, dz + 0.02], [-rad * 0.4, 1.27, dz + 0.02], cd);
      // 门檐 + 两根前柱
      quadP(canvas, m, [-0.95, 1.27, 1.42], [0.95, 1.27, 1.42], [0.88, 1.1, 2.16],
        [-0.88, 1.1, 2.16], cd, [[0, 0], [2.2, 0], [2.2, 1], [0, 1]]);
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(s * 0.86, 0, 2.1)), 0.04, 0.032, 1.1, 5,
          [1, 1, 1], true);
        tubeLocal(rope, m, [[s * 0.86, 1.12, 2.1], [s * 0.86, 1.18, 1.98]], 0.008, 3, [1, 1, 1]);
      }
      // 三条竖向缝线：从墙脚沿穹顶收向顶部
      for (const a of [0.5, 2.6, 4.6]) {
        const pts = [];
        for (let k = 0; k <= 4; k++) {
          const y = 0.1 + (wall + domeH - 0.45) * k / 4;
          let rr;
          if (y <= wall) {
            rr = rad - 0.02;
          } else {
            const u = (y - wall) / domeH;
            rr = (rad - 0.02) * Math.sqrt(Math.max(0, 1 - u * u));
          }
          pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
        }
        tubeLocal(rope, m, pts, 0.007, 3, [1, 0.94, 0.82]);
      }
      tentInteriorRound(m, rad, col, false);
      fabricPatch(m, Math.cos(2.6) * (rad + 0.012), 0.55, Math.sin(2.6) * (rad + 0.012),
        0.3, 0.24, Math.PI / 2 - 2.6, [0.72, 0.6, 0.46]);
      // 顶部旗杆 / 旗
      dark.cyl.call(dark, M.mul(m, m4(0, wall + domeH - 0.22, 0)), 0.03, 0.022, 0.78, 5,
        [1, 1, 1], true);
      clothFlag(m, 0, wall + domeH + 0.1, 0, 0.45, 0.62, [1.2, 0.62, 0.42 + rr() * 0.16]);
      // 拉绳（避开正面）
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.12;
        const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
        if (Math.abs(da) < 0.85) continue;
        const px = Math.cos(a) * rad * 0.99, pz = Math.sin(a) * rad * 0.99;
        const ex = Math.cos(a) * (rad + 0.72), ez = Math.sin(a) * (rad + 0.72);
        const wx = x + Math.cos(ry) * ex + Math.sin(ry) * ez;
        const wz = z - Math.sin(ry) * ex + Math.cos(ry) * ez;
        const y0 = gH(wx, wz);
        tubeLocal(rope, m, [[px, wall - 0.05, pz], [px * 1.06, wall * 0.55, pz * 1.06],
          [ex, y0 + 0.22, ez]], 0.012, 3, [1, 1, 1]);
        wood.cyl.call(wood, M.mul(m, m4(ex, y0, ez)), 0.038, 0.028, 0.24, 4, [1, 1, 1], true);
        tubeLocal(rope, m, [[ex, y0 + 0.22, ez], [ex - 0.1, y0 + 0.25, ez]], 0.008, 3, [1, 1, 1]);
      }
      // 帐脚压石
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU;
        const px = Math.cos(a) * (rad + 0.02), pz = Math.sin(a) * (rad + 0.02);
        const wx = x + Math.cos(ry) * px + Math.sin(ry) * pz;
        const wz = z - Math.sin(ry) * px + Math.cos(ry) * pz;
        stone.sphere.call(stone, m4(wx, gH(wx, wz) + 0.03, wz, 0, r() * TAU, 0,
          1.5, 0.45, 1.1), 0.1, 5, 4, [1, 1, 1]);
      }
    }

    /** 圆帐篷背面的检修缝：两列缝线 + 交叉绑绳（贴着弧面，不悬空） */
    function lacedSeam(m, rad, y0, y1, slope, col) {
      const sl = slope || 0;
      const r0 = rad - sl * y0, r1 = rad - sl * y1;
      const z0 = -Math.sqrt(Math.max(0.01, r0 * r0 - 0.01));
      const z1 = -Math.sqrt(Math.max(0.01, r1 * r1 - 0.01));
      for (const s of [-1, 1]) {
        tubeLocal(rope, m, [[s * 0.09, y0, z0 + 0.008], [s * 0.09, y1, z1 + 0.008]],
          0.007, 3, col || [1, 1, 1]);
      }
      for (let i = 0; i < 4; i++) {
        const t0 = i / 4, t1 = (i + 1) / 4;
        const ya = y0 + (y1 - y0) * t0, yb = y0 + (y1 - y0) * t1;
        const za = z0 + (z1 - z0) * t0 + 0.016, zb = z0 + (z1 - z0) * t1 + 0.016;
        tubeLocal(rope, m, [[-0.09, ya, za], [0.09, yb, zb]], 0.005, 3, [1, 1, 1]);
        tubeLocal(rope, m, [[0.09, ya, za], [-0.09, yb, zb]], 0.005, 3, [1, 1, 1]);
      }
    }

    function tentYurt(x, z, ry, col, seed) {
      const rr = P.rng(seed || 3);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.7, wall = 1.42, roofH = 0.92, apex = wall + roofH, seg = 20;
      const cr = [col[0] * 0.93, col[1] * 0.92, col[2] * 0.96];
      const inCol = [col[0] * 0.7 + 0.04, col[1] * 0.68 + 0.04, col[2] * 0.66 + 0.04];
      const doorHalf = 0.31;
      // 布墙 + 内衬 + 两道毡带；正面留门洞
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const am = (a0 + a1) / 2;
        const da = Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2));
        if (Math.abs(da) < doorHalf) continue;
        wallSegOut(linen, m, rad, rad, wall, a0, a1, col);
        wallSegIn(inner, m, rad - 0.03, rad - 0.03, wall - 0.03, a0, a1, inCol);
        for (const band of [[0.4, 0.1, 0.82], [0.98, 0.08, 0.78]]) {
          wallSegOut(canvas, M.mul(m, m4(0, band[0], 0)), rad * 1.008, rad * 1.008,
            band[1], a0, a1, [col[0] * band[2], col[1] * band[2], col[2] * band[2]]);
        }
      }
      // 屋顶锥 + 内衬 + 支杆
      const mw = M.mul(m, m4(0, wall, 0));
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const am = (a0 + a1) / 2;
        wallSegOut(linen, mw, rad * 1.005, 0.17, roofH, a0, a1, i % 2 ? col : cr);
        wallSegIn(inner, M.mul(m, m4(0, wall + 0.01, 0)), rad - 0.035, 0.19,
          roofH - 0.04, a0, a1, inCol);
        if (i % 2 === 0) {
          tubeLocal(dark, m, [[Math.cos(am) * rad * 0.98, wall + 0.03,
            Math.sin(am) * rad * 0.98], [Math.cos(am) * 0.19, apex + 0.005,
            Math.sin(am) * 0.19]], 0.018, 3, [1, 1, 1]);
        }
      }
      canvas.cyl.call(canvas, m4(0, apex - 0.01, 0), 0.2, 0.05, 0.12, 10, cr, true);
      // 门框 / 门帘
      const dz = rad * Math.cos(doorHalf) + 0.02, dw = 0.94, dh = 1.3;
      doorFrame(m, dz, dw, dh, [0.95, 0.9, 0.8]);
      doorCurtains(m, dz - 0.02, dw - 0.04, dh - 0.03, col, 0.8);
      // 门口雨篷：后缘搭在门楣上，前缘由两根柱子撑住
      quadP(canvas, m, [-0.68, 1.34, 1.68], [0.68, 1.34, 1.68], [0.62, 1.2, 2.18],
        [-0.62, 1.2, 2.18], cr, [[0, 0], [2.2, 0], [2.2, 1], [0, 1]]);
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(s * 0.62, 0, 2.14)), 0.038, 0.03, 1.2, 5,
          [1, 1, 1], true);
        tubeLocal(rope, m, [[s * 0.62, 1.2, 2.14], [s * 0.62, 1.26, 2.04]], 0.008, 3, [1, 1, 1]);
      }
      tentInteriorRound(m, rad, col, false);
      lacedSeam(m, rad, 0.3, 1.16, 0, [1, 0.92, 0.8]);
      fabricPatch(m, Math.cos(2.6) * (rad + 0.012), 0.62, Math.sin(2.6) * (rad + 0.012),
        0.3, 0.22, Math.PI / 2 - 2.6, [0.76, 0.64, 0.5]);
      // 顶部旗杆 / 旗
      dark.cyl.call(dark, M.mul(m, m4(0, apex - 0.05, 0)), 0.03, 0.022, 0.7, 5, [1, 1, 1], true);
      clothFlag(m, 0, apex + 0.38, 0, 0.5, 0.58, [1.24, 0.66, 0.4 + rr() * 0.18]);
      // 拉绳
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
        if (Math.abs(da) < 0.9) continue;
        const px = Math.cos(a) * rad * 0.99, pz = Math.sin(a) * rad * 0.99;
        const ex = Math.cos(a) * (rad + 0.8), ez = Math.sin(a) * (rad + 0.8);
        const wx = x + Math.cos(ry) * ex + Math.sin(ry) * ez;
        const wz = z - Math.sin(ry) * ex + Math.cos(ry) * ez;
        const y0 = gH(wx, wz);
        tubeLocal(rope, m, [[px, wall - 0.04, pz], [px * 1.1, wall * 0.55, pz * 1.1],
          [ex, y0 + 0.22, ez]], 0.012, 3, [1, 1, 1]);
        wood.cyl.call(wood, M.mul(m, m4(ex, y0, ez)), 0.038, 0.028, 0.24, 4, [1, 1, 1], true);
      }
      // 脚下的压石
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + 0.1;
        const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
        const wx = x + Math.cos(ry) * px + Math.sin(ry) * pz;
        const wz = z - Math.sin(ry) * px + Math.cos(ry) * pz;
        stone.sphere.call(stone, m4(wx, gH(wx, wz) + 0.03, wz, 0, r() * TAU, 0,
          1.5, 0.45, 1.1), 0.095, 5, 4, [1, 1, 1]);
      }
    }

    function tentCircus(x, z, ry, col, seed) {
      const rr = P.rng(seed || 4);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.95, wall = 1.18, apex = wall + 1.9, seg = 18;
      const cream = [1.25, 1.16, 0.98];
      const inCol = [col[0] * 0.72 + 0.04, col[1] * 0.7 + 0.04, col[2] * 0.68 + 0.04];
      const doorHalf = 0.34;
      // 布墙 + 内衬 + 奶油色竖条纹
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const am = (a0 + a1) / 2;
        const da = Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2));
        if (Math.abs(da) < doorHalf) continue;
        wallSegOut(linen, m, rad, rad, wall, a0, a1, col);
        wallSegIn(inner, m, rad - 0.035, rad - 0.035, wall - 0.03, a0, a1, inCol);
        if (i % 3 === 0) {
          wallSegOut(canvas, m, rad * 1.006, rad * 1.006, wall - 0.06, a0 + 0.06, a1 - 0.06, cream);
        }
      }
      // 屋顶锥 + 内衬 + 檐口垂边
      const mw = M.mul(m, m4(0, wall, 0));
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const am = (a0 + a1) / 2;
        const da = Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2));
        wallSegOut(linen, mw, rad * 1.005, 0.06, apex - wall, a0, a1, i % 2 ? cream : col);
        wallSegIn(inner, M.mul(m, m4(0, wall + 0.01, 0)), rad - 0.04, 0.1,
          apex - wall - 0.035, a0, a1, inCol);
        if (Math.abs(da) >= doorHalf) {
          const A = [Math.cos(a0) * rad * 1.01, wall - 0.02, Math.sin(a0) * rad * 1.01];
          const B = [Math.cos(a1) * rad * 1.01, wall - 0.02, Math.sin(a1) * rad * 1.01];
          const C = [Math.cos(am) * rad * 1.01, wall - 0.24, Math.sin(am) * rad * 1.01];
          triBoth(linen, m, A, B, C, i % 2 ? cream : col, 0.004);
        }
      }
      // 门框 / 门帘
      const dz = rad * Math.cos(doorHalf) + 0.02, dw = 1.18, dh = 1.1;
      doorFrame(m, dz, dw, dh, [0.95, 0.9, 0.8]);
      doorCurtains(m, dz - 0.02, dw - 0.04, dh - 0.03, col, 0.64);
      // 门檐：后缘搭在门楣上
      quadP(canvas, m, [-0.78, 1.15, 1.84], [0.78, 1.15, 1.84], [0.72, 1.0, 2.44],
        [-0.72, 1.0, 2.44], cream, [[0, 0], [2.4, 0], [2.4, 1], [0, 1]]);
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(s * 0.72, 0, 2.4)), 0.038, 0.03, 1.0, 5,
          [1, 1, 1], true);
        tubeLocal(rope, m, [[s * 0.72, 1.0, 2.4], [s * 0.72, 1.06, 2.3]], 0.008, 3, [1, 1, 1]);
      }
      tentInteriorRound(m, rad, col, false);
      lacedSeam(m, rad, 0.28, 1.0, 0, [1, 0.92, 0.8]);
      fabricPatch(m, Math.cos(2.7) * (rad + 0.012), 0.45, Math.sin(2.7) * (rad + 0.012),
        0.3, 0.22, Math.PI / 2 - 2.7, [0.76, 0.64, 0.5]);
      // 尖顶旗
      dark.cyl.call(dark, M.mul(m, m4(0, apex - 0.1, 0)), 0.03, 0.022, 0.9, 5, [1, 1, 1], true);
      clothFlag(m, 0, apex + 0.48, 0, 0.55, 0.7, [1.25, 0.62, 0.4 + rr() * 0.22]);
      // 拉绳
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.15;
        const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
        if (Math.abs(da) < 0.9) continue;
        const px = Math.cos(a) * rad * 0.99, pz = Math.sin(a) * rad * 0.99;
        const ex = Math.cos(a) * (rad + 0.82), ez = Math.sin(a) * (rad + 0.82);
        const wx = x + Math.cos(ry) * ex + Math.sin(ry) * ez;
        const wz = z - Math.sin(ry) * ex + Math.cos(ry) * ez;
        const y0 = gH(wx, wz);
        tubeLocal(rope, m, [[px, wall - 0.05, pz], [px * 1.1, wall * 0.55, pz * 1.1],
          [ex, y0 + 0.22, ez]], 0.012, 3, [1, 1, 1]);
        wood.cyl.call(wood, M.mul(m, m4(ex, y0, ez)), 0.038, 0.028, 0.24, 4, [1, 1, 1], true);
      }
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU;
        const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
        const wx = x + Math.cos(ry) * px + Math.sin(ry) * pz;
        const wz = z - Math.sin(ry) * px + Math.cos(ry) * pz;
        stone.sphere.call(stone, m4(wx, gH(wx, wz) + 0.03, wz, 0, r() * TAU, 0,
          1.4, 0.45, 1.1), 0.095, 5, 4, [1, 1, 1]);
      }
    }

    function tentSpike(x, z, ry, col, seed) {
      const rr = P.rng(seed || 5);
      const m = m4(x, 0, z, 0, ry, 0);
      const rad = 1.5, apex = 3.0, seg = 18;
      const cream = [1.24, 1.14, 0.96];
      const inCol = [col[0] * 0.7 + 0.03, col[1] * 0.68 + 0.03, col[2] * 0.66 + 0.03];
      const doorHalf = 0.33, dt = 1.12;
      const rt = rad + (0.06 - rad) * dt / apex;
      const ex = Math.sin(doorHalf) * rt, ez = Math.cos(doorHalf) * rt;
      // 整顶是一个圆锥：正面留一道从地面通向尖顶的门缝
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const am = (a0 + a1) / 2;
        const da = Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2));
        if (Math.abs(da) < doorHalf) continue;
        wallSegOut(canvas, m, rad, 0.06, apex, a0, a1, i % 2 ? cream : col);
        wallSegIn(inner, m, rad - 0.035, 0.1, apex - 0.04, a0, a1, inCol);
      }
      // 门缝上方的补布（门顶以上收拢到尖顶）
      triBoth(canvas, m, [-ex, dt, ez], [ex, dt, ez], [0, apex, 0], cream, 0.006);
      // 门口的布帘：向两侧拢起，露出内部
      const bx = Math.sin(doorHalf) * rad, bz = Math.cos(doorHalf) * rad;
      quadP(cloth, m, [-bx, 0.03, bz], [-0.03, 0.04, rad - 0.03], [-0.03, dt, rt + 0.03],
        [-ex - 0.01, dt, ez], [col[0] * 0.7, col[1] * 0.68, col[2] * 0.68]);
      quadP(cloth, m, [0.03, 0.04, rad - 0.03], [bx, 0.03, bz], [ex + 0.01, dt, ez],
        [0.03, dt, rt + 0.03], [col[0] * 0.78, col[1] * 0.76, col[2] * 0.74]);
      // 门缝两边的斜撑杆（门帘和门楣都靠它们）
      for (const s of [-1, 1]) {
        tubeLocal(dark, m, [[s * bx, 0.02, bz], [s * 0.36, 1.5, 1.1], [0, apex + 0.22, 0]],
          0.032, 4, [1, 1, 1]);
        tubeLocal(rope, m, [[s * (ex + 0.02), dt - 0.22, ez + 0.02],
          [s * (ex + 0.14), dt - 0.24, ez - 0.1]], 0.008, 3, [1, 1, 1]);
      }
      wood.box.call(wood, M.mul(m, m4(0, 0.05, bz - 0.12)), 0.86, 0.1, 0.2,
        [0.9, 0.85, 0.75], 1.3);
      tentInteriorRound(m, 1.32, col, true);
      lacedSeam(m, rad, 0.3, 1.0, 0.48, [1, 0.92, 0.8]);
      fabricPatch(m, Math.cos(2.7) * 1.14, 0.62, Math.sin(2.7) * 1.14,
        0.28, 0.2, Math.PI / 2 - 2.7, [0.74, 0.62, 0.48]);
      // 顶尖旗
      clothFlag(m, 0, apex + 0.35, 0, 0.35, 0.6, [1.2, 0.6, 0.38 + rr() * 0.2]);
      // 拉绳
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.5;
        const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
        if (Math.abs(da) < 1.0) continue;
        const py = 1.05, pr = rad - 0.48 * py;
        const px = Math.cos(a) * pr, pz = Math.sin(a) * pr;
        const ex2 = Math.cos(a) * (rad + 0.6), ez2 = Math.sin(a) * (rad + 0.6);
        const wx = x + Math.cos(ry) * ex2 + Math.sin(ry) * ez2;
        const wz = z - Math.sin(ry) * ex2 + Math.cos(ry) * ez2;
        const y0 = gH(wx, wz);
        tubeLocal(rope, m, [[px, py, pz], [px * 1.15, py * 0.5, pz * 1.15],
          [ex2, y0 + 0.22, ez2]], 0.012, 3, [1, 1, 1]);
        wood.cyl.call(wood, M.mul(m, m4(ex2, y0, ez2)), 0.036, 0.026, 0.24, 4,
          [1, 1, 1], true);
      }
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU;
        const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
        const wx = x + Math.cos(ry) * px + Math.sin(ry) * pz;
        const wz = z - Math.sin(ry) * px + Math.cos(ry) * pz;
        stone.sphere.call(stone, m4(wx, gH(wx, wz) + 0.03, wz, 0, r() * TAU, 0,
          1.4, 0.45, 1.1), 0.09, 5, 4, [1, 1, 1]);
      }
    }

    function tentGable(x, z, ry, col, seed) {
      const rr = P.rng(seed || 6);
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 3.0, d = 2.6, ph = 1.5, ridge = 2.42;
      const hw = w / 2, hd = d / 2, dw = 1.05, dh = 1.42;
      const cd = [col[0] * 0.9, col[1] * 0.9, col[2] * 0.92];
      const inCol = [col[0] * 0.7 + 0.04, col[1] * 0.68 + 0.04, col[2] * 0.66 + 0.04];
      const mi = M.mul(m, m4(0, -0.015, 0, 0, 0, 0, 0.985, 0.985, 0.985));
      // 四根立柱 + 前后横梁
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          wood.cyl.call(wood, M.mul(m, m4(sx * (hw - 0.1), 0, sz * (hd - 0.1))),
            0.055, 0.045, ph, 5, [1, 1, 1], true);
          dark.cyl.call(dark, M.mul(m, m4(sx * (hw - 0.1), ph - 0.05, sz * (hd - 0.1))),
            0.06, 0.05, 0.07, 5, [1, 1, 1], true);
        }
      }
      for (const sz of [-1, 1]) {
        wood.box.call(wood, M.mul(m, m4(0, ph - 0.01, sz * (hd - 0.1))), w - 0.14, 0.08, 0.09,
          [1, 1, 1], 1.3);
      }
      // 侧墙 + 内衬
      quadP(linen, m, [hw, 0.03, -hd], [hw, ph, -hd], [hw, ph, hd], [hw, 0.03, hd], col);
      quadInv(linen, mi, [hw, 0.03, -hd], [hw, ph, -hd], [hw, ph, hd], [hw, 0.03, hd], inCol);
      quadP(linen, m, [-hw, 0.03, hd], [-hw, ph, hd], [-hw, ph, -hd], [-hw, 0.03, -hd], cd);
      quadInv(linen, mi, [-hw, 0.03, hd], [-hw, ph, hd], [-hw, ph, -hd], [-hw, 0.03, -hd], inCol);
      // 侧墙顶的卷边
      for (const s of [-1, 1]) {
        canvas.cyl.call(canvas, M.mul(m, m4(s * hw, ph - 0.09, hd, Math.PI / 2, 0, 0)),
          0.05, 0.05, d, 5, [col[0] * 0.84, col[1] * 0.82, col[2] * 0.8], true);
      }
      // 后墙 + 后山墙 + 内衬
      quadP(linen, m, [hw, 0.03, -hd], [-hw, 0.03, -hd], [-hw, ph, -hd], [hw, ph, -hd], cd);
      quadInv(linen, mi, [hw, 0.03, -hd], [-hw, 0.03, -hd], [-hw, ph, -hd], [hw, ph, -hd], inCol);
      linen.tri.call(linen, m, [-hw, ph, -hd], [0, ridge, -hd], [hw, ph, -hd], null, cd);
      linen.tri.call(linen, mi, [hw, ph, -hd], [0, ridge, -hd], [-hw, ph, -hd], null, inCol);
      // 正面：门洞左右 + 门楣上方的窄条 + 山墙三角
      quadP(linen, m, [-hw, 0.03, hd], [-dw / 2, 0.03, hd], [-dw / 2, ph, hd],
        [-hw, ph, hd], col);
      quadP(linen, m, [dw / 2, 0.03, hd], [hw, 0.03, hd], [hw, ph, hd],
        [dw / 2, ph, hd], cd);
      quadP(linen, m, [-dw / 2, dh, hd], [dw / 2, dh, hd], [dw / 2, ph, hd],
        [-dw / 2, ph, hd], cd);
      linen.tri.call(linen, m, [-hw, ph, hd], [hw, ph, hd], [0, ridge, hd], null, cd);
      // 两个坡屋面 + 内衬
      quadP(linen, m, [-hw, ph, -hd], [-hw, ph, hd], [0, ridge, hd], [0, ridge, -hd], col);
      quadInv(linen, mi, [-hw, ph, -hd], [-hw, ph, hd], [0, ridge, hd], [0, ridge, -hd], inCol);
      quadP(linen, m, [hw, ph, -hd], [0, ridge, -hd], [0, ridge, hd], [hw, ph, hd], cd);
      quadInv(linen, mi, [hw, ph, -hd], [0, ridge, -hd], [0, ridge, hd], [hw, ph, hd], inCol);
      // 门框 / 门帘
      doorFrame(m, hd + 0.02, dw, dh, [0.95, 0.9, 0.8]);
      doorCurtains(m, hd + 0.01, dw - 0.04, dh - 0.03, col, 0.9);
      tentInterior(m, hw, hd, col);
      // 脊杆 + 门廊
      dark.cyl.call(dark, M.mul(m, m4(0, ridge + 0.02, -hd - 0.15, Math.PI / 2, 0, 0)),
        0.03, 0.024, d + 0.3, 5, [1, 1, 1], true);
      quadP(canvas, m, [-0.65, 1.75, hd + 0.02], [0.65, 1.75, hd + 0.02], [0.6, 1.54, hd + 0.72],
        [-0.6, 1.54, hd + 0.72], cd, [[0, 0], [2.2, 0], [2.2, 1], [0, 1]]);
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(s * 0.58, 0, hd + 0.7)), 0.038, 0.03, 1.54, 5,
          [1, 1, 1], true);
        tubeLocal(rope, m, [[s * 0.58, 1.54, hd + 0.7], [s * 0.58, 1.6, hd + 0.6]],
          0.008, 3, [1, 1, 1]);
      }
      // 缝线 / 补丁 / 检修口 / 旗
      tubeLocal(rope, m, [[0, ridge + 0.006, -hd], [0, ridge + 0.006, hd]], 0.008, 3,
        [1, 0.94, 0.82]);
      for (const s of [-1, 1]) {
        tubeLocal(rope, m, [[s * hw, ph + 0.004, -hd], [0, ridge, -hd]], 0.007, 3,
          [1, 0.94, 0.82]);
        tubeLocal(rope, m, [[s * hw, ph + 0.004, hd], [0, ridge, hd]], 0.007, 3,
          [1, 0.94, 0.82]);
      }
      fabricPatch(m, -1.12, 0.55, hd + 0.008, 0.3, 0.22, 0, [0.72, 0.58, 0.45]);
      backFlap(m, 0.66, 0.66, -hd - 0.012, 0.28,
        [col[0] * 0.7, col[1] * 0.68, col[2] * 0.68]);
      clothFlag(m, 0, ridge + 0.04, -hd + 0.4, Math.PI / 2, 0.66,
        [1.18, 0.58, 0.38 + rr() * 0.2]);
      guyRopes(x, z, ry, m, [[-hw, ph, -hd], [hw, ph, -hd], [-hw, ph, hd],
        [hw, ph, hd]], 0.6);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const px = Math.cos(a) * (hw + 0.05), pz = Math.sin(a) * (hd + 0.05);
        const wx = x + Math.cos(ry) * px + Math.sin(ry) * pz;
        const wz = z - Math.sin(ry) * px + Math.cos(ry) * pz;
        stone.sphere.call(stone, m4(wx, gH(wx, wz) + 0.03, wz, 0, r() * TAU, 0,
          1.4, 0.45, 1.1), 0.09, 5, 4, [1, 1, 1]);
      }
    }

    function tentCanopy(x, z, ry, col, seed) {
      const rr = P.rng(seed || 7);
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 3.4, d = 3.0, ph = 2.45, peak = ph + 0.5;
      const hw = w / 2, hd = d / 2;
      const cd = [col[0] * 0.88, col[1] * 0.9, col[2] * 0.94];
      const inCol = [col[0] * 0.7 + 0.04, col[1] * 0.68 + 0.04, col[2] * 0.66 + 0.04];
      // 四根角柱 + 柱顶横梁
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = sx * (hw - 0.08), pz = sz * (hd - 0.08);
          wood.cyl.call(wood, M.mul(m, m4(px, 0, pz)), 0.058, 0.046, ph, 5, [1, 1, 1], true);
          dark.cyl.call(dark, M.mul(m, m4(px, ph - 0.06, pz)), 0.065, 0.055, 0.09, 5,
            [1, 1, 1], true);
        }
      }
      for (const sz of [-1, 1]) {
        wood.box.call(wood, M.mul(m, m4(0, ph - 0.05, sz * (hd - 0.08))), w - 0.12, 0.1, 0.1,
          [1, 1, 1], 1.3);
      }
      for (const sx of [-1, 1]) {
        wood.box.call(wood, M.mul(m, m4(sx * (hw - 0.08), ph - 0.05, 0, 0, Math.PI / 2, 0)),
          d - 0.12, 0.1, 0.1, [1, 1, 1], 1.3);
      }
      // 四坡篷顶 + 内衬
      const cs = [[-hw + 0.06, ph, -hd + 0.06], [hw - 0.06, ph, -hd + 0.06],
        [hw - 0.06, ph, hd - 0.06], [-hw + 0.06, ph, hd - 0.06]];
      for (let i = 0; i < 4; i++) {
        const c0 = cs[i], c1 = cs[(i + 1) % 4];
        linen.tri.call(linen, m, c0, [0, peak, 0], c1, [[0, 0], [0.5, 1], [1, 0]],
          i % 2 ? col : cd);
        linen.tri.call(linen, M.mul(m, m4(0, -0.03, 0, 0, 0, 0, 0.982, 0.982, 0.982)),
          c1, [0, peak, 0], c0, null, inCol);
        // 檐口垂边
        quadP(canvas, m, c0, c1, [c1[0], ph - 0.3, c1[2]], [c0[0], ph - 0.3, c0[2]],
          [col[0] * 0.8, col[1] * 0.82, col[2] * 0.84]);
        // 垂边下缘的绳
        tubeLocal(rope, m, [[c0[0], ph - 0.3, c0[2]], [c1[0], ph - 0.3, c1[2]]], 0.008, 3,
          [1, 0.92, 0.78]);
      }
      // 后 / 左 / 右三面半墙（外皮 + 内衬 + 顶部横杆），正面敞开
      const wy = 1.3;
      const walls = [
        [-hw + 0.08, -hd + 0.08, hw - 0.08, -hd + 0.08],   // 后（外法线 -Z）
        [-hw + 0.08, -hd + 0.08, -hw + 0.08, hd - 0.08],   // 左（外法线 -X）
        [hw - 0.08, -hd + 0.08, hw - 0.08, hd - 0.08]      // 右（外法线 +X）
      ];
      for (let wi = 0; wi < walls.length; wi++) {
        const ax = walls[wi][0], az = walls[wi][1], bx = walls[wi][2], bz = walls[wi][3];
        const wc = [col[0] * 0.86, col[1] * 0.86, col[2] * 0.88];
        if (wi === 0) {
          quadP(canvas, m, [ax, wy, az], [bx, wy, bz], [bx, 0.04, bz], [ax, 0.04, az], wc);
          quadP(inner, m, [ax, 0.04, az], [bx, 0.04, bz], [bx, wy, bz], [ax, wy, az], inCol);
        } else if (wi === 1) {
          quadP(canvas, m, [ax, 0.04, az], [bx, 0.04, bz], [bx, wy, bz], [ax, wy, az], wc);
          quadP(inner, m, [ax, wy, az], [bx, wy, bz], [bx, 0.04, bz], [ax, 0.04, az], inCol);
        } else {
          quadP(canvas, m, [ax, 0.04, az], [ax, wy, az], [bx, wy, bz], [bx, 0.04, bz], wc);
          quadP(inner, m, [ax, 0.04, az], [bx, 0.04, bz], [bx, wy, bz], [ax, wy, az], inCol);
        }
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        const len = Math.hypot(bx - ax, bz - az);
        const ang = Math.atan2(-(bz - az), bx - ax);
        wood.box.call(wood, M.mul(m, m4(cx, wy + 0.02, cz, 0, ang, 0)), len, 0.07, 0.07,
          [1, 1, 1], 1.3);
        for (const t of [0.2, 0.8]) {
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          tubeLocal(rope, m, [[px, wy, pz], [px, wy - 0.18, pz]], 0.008, 3,
            [1, 0.92, 0.8]);
        }
      }
      // 后墙上的挂毯（在布墙内侧，从横杆垂下来，两根绳系在横杆上）
      quadP(rug, m, [-1.25, 0.5, -hd + 0.12], [1.25, 0.5, -hd + 0.12],
        [1.1, 1.28, -hd + 0.12], [-1.1, 1.28, -hd + 0.12], [1, 1, 1],
        [[0, 0], [1.6, 0], [1.6, 1], [0, 1]]);
      for (const sx of [-1, 1]) {
        tubeLocal(rope, m, [[sx * 0.95, 1.28, -hd + 0.12], [sx * 0.95, 1.3, -hd + 0.07]],
          0.007, 3, [1, 1, 1]);
      }
      // 前柜台：台面 + 四条腿 + 围布 + 货
      const cz = hd - 0.42;
      wood.box.call(wood, M.mul(m, m4(0, 0.92, cz)), w * 0.76, 0.08, 0.56, [1, 1, 1], 1.3);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          wood.box.call(wood, M.mul(m, m4(sx * (w * 0.36), 0.46, cz + sz * 0.22)), 0.08, 0.92,
            0.08, [0.9, 0.85, 0.8], 1.3);
        }
      }
      quadP(canvas, m, [-w * 0.37, 0.12, cz + 0.29], [w * 0.37, 0.12, cz + 0.29],
        [w * 0.37, 0.9, cz + 0.27], [-w * 0.37, 0.9, cz + 0.27],
        [col[0] * 0.82, col[1] * 0.8, col[2] * 0.78], [[0, 0], [2.4, 0], [2.4, 1], [0, 1]]);
      // 柜台上的折毯 / 陶罐
      for (let i = 0; i < 3; i++) {
        rug.box.call(rug, M.mul(m, m4(-0.75 + i * 0.7, 0.99, cz + 0.02, 0, 0.06, 0)), 0.5,
          0.1, 0.36, [1, 1, 1], 1.2);
      }
      for (let i = 0; i < 4; i++) {
        clay.cyl.call(clay, M.mul(m, m4(-1.05 + i * 0.68, 0.96, cz - 0.2)), 0.07, 0.1, 0.18,
          8, [1.1, 0.98, 0.82], true);
      }
      for (let i = 0; i < 3; i++) {
        priceTag(m, -0.9 + i * 0.9, 0.9, cz + 0.3, 0.17, 0.11, 0, [1, 0.94, 0.8]);
      }
      // 前檐灯串 + 一颗吊灯
      const frontY = ph - 0.08, frontZ = hd - 0.1;
      const lit = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        lit.push([-hw + 0.1 + u * (w - 0.2), frontY - Math.sin(u * Math.PI) * 0.1, frontZ]);
      }
      tubeLocal(rope, m, lit, 0.01, 3, [0.7, 0.62, 0.5]);
      for (let i = 1; i < 6; i++) {
        const p = lit[i];
        bulb.sphere.call(bulb, M.mul(m, m4(p[0], p[1] - 0.07, p[2])), 0.045, 5, 3, [1, 1, 1]);
        bulbGlow.quad.call(bulbGlow, M.mul(m, m4(p[0], p[1] - 0.07, p[2] + 0.02)), 0.55, 0.55,
          [1, 1, 1], [0, 0, 1, 1]);
      }
      // 屋檐中央的吊灯：绳从顶部的尖顶垂下来
      lantern(0, 1.95, 0, 1.15, [1, 1, 1], peak - 0.02, true);
      // 内部的桌子 / 箱子 / 卷毯
      wood.box.call(wood, M.mul(m, m4(-0.55, 0.72, -0.55)), 1.3, 0.07, 0.62, [1, 1, 1], 1.3);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          wood.box.call(wood, M.mul(m, m4(-0.55 + sx * 0.55, 0.36, -0.55 + sz * 0.24)),
            0.07, 0.72, 0.07, [0.9, 0.85, 0.8], 1.3);
        }
      }
      for (let i = 0; i < 3; i++) {
        rug.cyl.call(rug, M.mul(m, m4(0.85, 0.25 + i * 0.16, -0.4, 0, 0, Math.PI / 2)),
          0.16, 0.16, 1.1, 8, [1, 1, 1], true);
      }
      crateLocal(m, 1.15, 0.02, 0.4, 0.44, 0.2, [0.78, 0.66, 0.52]);
      // 顶旗 + 拉绳
      dark.cyl.call(dark, M.mul(m, m4(0, peak, 0)), 0.032, 0.024, 0.9, 5, [1, 1, 1], true);
      clothFlag(m, 0, peak + 0.62, 0, 0.55, 0.7, [1.22, 0.64, 0.42 + rr() * 0.2]);
      guyRopes(x, z, ry, m, [[-hw + 0.08, ph, -hd + 0.08], [hw - 0.08, ph, -hd + 0.08],
        [-hw + 0.08, ph, hd - 0.08], [hw - 0.08, ph, hd - 0.08]], 0.62);
    }

    /* ============================================================
     *  摊位：棚子 + 各自货物 + 摊主/客人
     * ============================================================ */
    function booth(x, z, ry, col, idx) {
      const m = m4(x, 0, z, 0, ry, 0);
      const w = 2.9, ph = 2.12, half = 1.25, ridge = ph + 0.52;
      const cd = [col[0] * 0.8, col[1] * 0.82, col[2] * 0.85];
      const inCol = [col[0] * 0.68 + 0.04, col[1] * 0.66 + 0.04, col[2] * 0.64 + 0.04];
      const nx = Math.sin(ry), nz = Math.cos(ry);
      // 立柱：前两根加高，给招牌横梁一个真正的落点；后两根撑后檐
      for (const sx of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(sx * w / 2, 0, half)), 0.055, 0.045, 3.32, 5,
          [1, 1, 1], true);
        wood.cyl.call(wood, M.mul(m, m4(sx * w / 2, 0, -half)), 0.055, 0.045, ph + 0.06, 5,
          [1, 1, 1], true);
        dark.cyl.call(dark, M.mul(m, m4(sx * w / 2, 3.32 - 0.05, half)), 0.058, 0.048, 0.05, 5,
          [1, 1, 1], true);
        dark.cyl.call(dark, M.mul(m, m4(sx * w / 2, ph + 0.01, -half)), 0.06, 0.05, 0.07, 5,
          [1, 1, 1], true);
        // 侧面的斜撑（前柱高处 → 后柱低处）
        tubeLocal(dark, m, [[sx * (w / 2 - 0.04), 1.9, half - 0.04],
          [sx * (w / 2 - 0.04), 0.35, -half + 0.04]], 0.02, 3, [1, 1, 1]);
      }
      // 前后横梁 + 侧面横梁
      wood.box.call(wood, M.mul(m, m4(0, ph - 0.02, half)), w + 0.2, 0.08, 0.09,
        [1, 1, 1], 1.3);
      wood.box.call(wood, M.mul(m, m4(0, ph - 0.02, -half)), w + 0.2, 0.08, 0.09,
        [1, 1, 1], 1.3);
      for (const sx of [-1, 1]) {
        for (const yy of [0.95, 1.98]) {
          wood.box.call(wood, M.mul(m, m4(sx * w / 2, yy, 0, 0, Math.PI / 2, 0)),
            2 * half, 0.06, 0.06, [0.92, 0.86, 0.78], 1.3);
        }
      }
      // 篷顶：前坡 + 后坡 + 内衬
      quadP(canvas, m, [-w / 2 - 0.1, ph, half], [w / 2 + 0.1, ph, half],
        [w / 2 + 0.1, ridge, 0], [-w / 2 - 0.1, ridge, 0], col,
        [[0, 0], [2.8, 0], [2.8, 1.2], [0, 1.2]]);
      quadInv(canvas, M.mul(m, m4(0, -0.03, 0, 0, 0, 0, 0.988, 0.988, 0.988)),
        [-w / 2 - 0.1, ph, half], [w / 2 + 0.1, ph, half], [w / 2 + 0.1, ridge, 0],
        [-w / 2 - 0.1, ridge, 0], inCol);
      quadP(canvas, m, [-w / 2 - 0.1, ridge, 0], [w / 2 + 0.1, ridge, 0],
        [w / 2 + 0.1, ph, -half], [-w / 2 - 0.1, ph, -half], cd,
        [[0, 0], [2.8, 0], [2.8, 1.2], [0, 1.2]]);
      quadInv(canvas, M.mul(m, m4(0, -0.03, 0, 0, 0, 0, 0.988, 0.988, 0.988)),
        [-w / 2 - 0.1, ridge, 0], [w / 2 + 0.1, ridge, 0], [w / 2 + 0.1, ph, -half],
        [-w / 2 - 0.1, ph, -half], inCol);
      // 前檐的波浪垂边 + 小旗
      for (let i = 0; i < 7; i++) {
        const u0 = -w / 2 - 0.1 + (w + 0.2) * i / 7;
        const u1 = -w / 2 - 0.1 + (w + 0.2) * (i + 1) / 7;
        quadP(canvas, m, [u0, ph, half], [u1, ph, half], [u1, ph - 0.24, half + 0.03],
          [u0, ph - 0.24, half + 0.03], i % 2 ? cd : col);
      }
      const pennantCols = [[1.25, 0.55, 0.42], [1.2, 0.92, 0.5], [0.55, 0.82, 1.1]];
      for (let i = 0; i < 5; i++) {
        const px = -w * 0.36 + i * w * 0.18;
        triBoth(cloth, m, [px - 0.1, ph - 0.24, half + 0.04],
          [px + 0.1, ph - 0.24, half + 0.04], [px, ph - 0.48, half + 0.05],
          pennantCols[i % 3], 0.004);
      }
      // 柜台：台面 + 腿 + 下层板 + 前围布
      wood.box.call(wood, M.mul(m, m4(0, 0.9, 0.2)), w * 0.92, 0.08, 0.62, [1, 1, 1], 1.3);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          wood.box.call(wood, M.mul(m, m4(sx * w * 0.4, 0.43, 0.2 + sz * 0.24)), 0.08, 0.86,
            0.08, [0.9, 0.85, 0.8], 1.3);
        }
      }
      wood.box.call(wood, M.mul(m, m4(0, 0.28, 0.2)), w * 0.84, 0.05, 0.5, [0.92, 0.86, 0.78],
        1.3);
      quadP(canvas, m, [-w * 0.45, 0.1, 0.52], [w * 0.45, 0.1, 0.52], [w * 0.45, 0.94, 0.52],
        [-w * 0.45, 0.94, 0.52], cd, [[0, 0], [2.4, 0], [2.4, 1], [0, 1]]);
      tubeLocal(rope, m, [[-w * 0.45, 0.16, 0.535], [w * 0.45, 0.16, 0.535]], 0.007, 3,
        [1, 0.92, 0.78]);
      for (let i = 0; i < 3; i++) {
        priceTag(m, -w * 0.28 + i * w * 0.28, 0.94, 0.53, 0.17, 0.11, 0, [1, 0.94, 0.8]);
      }
      // 后墙：帆布 + 木框 + 检修口 + 挂布 + 后牌
      quadP(canvas, m, [-w / 2 + 0.02, 0.04, -half + 0.02], [w / 2 - 0.02, 0.04, -half + 0.02],
        [w / 2 - 0.02, ph - 0.08, -half + 0.02], [-w / 2 + 0.02, ph - 0.08, -half + 0.02], cd,
        [[0, 0], [2.6, 0], [2.6, 1], [0, 1]]);
      for (const yy of [0.12, 1.08, ph - 0.1]) {
        wood.box.call(wood, M.mul(m, m4(0, yy, -half + 0.04)), w - 0.06, 0.07, 0.07,
          [0.92, 0.86, 0.78], 1.3);
      }
      for (const sx of [-1, 1]) {
        tubeLocal(dark, m, [[sx * (w / 2 - 0.08), 0.15, -half + 0.05],
          [sx * (w / 2 - 0.3), ph - 0.15, -half + 0.05]], 0.018, 3, [1, 1, 1]);
      }
      backFlap(m, 0.66, 0.68, -half - 0.012, 0.46,
        [col[0] * 0.7, col[1] * 0.68, col[2] * 0.68]);
      // 后墙挂布：上缘挂在 1.9 的横杆上
      quadP(rug, m, [-0.78, 0.95, -half + 0.06], [0.78, 0.95, -half + 0.06],
        [0.72, 1.86, -half + 0.06], [-0.72, 1.86, -half + 0.06], [0.9, 0.82, 0.7],
        [[0, 0], [1.4, 0], [1.4, 1], [0, 1]]);
      wood.box.call(wood, M.mul(m, m4(0, 1.9, -half + 0.08)), 1.66, 0.06, 0.06,
        [1, 1, 1], 1.2);
      // 后墙内侧的两层货架 + 瓶罐
      for (const [sy, si] of [[1.26, 0], [1.7, 1]]) {
        wood.box.call(wood, M.mul(m, m4(0, sy, -half + 0.2)), w * 0.78, 0.05, 0.24,
          [0.92, 0.86, 0.78], 1.3);
        for (const sx of [-1, 1]) {
          wood.box.call(wood, M.mul(m, m4(sx * w * 0.3, sy - 0.13, -half + 0.1)), 0.06, 0.26,
            0.06, [0.88, 0.82, 0.74], 1.2);
        }
        for (let i = 0; i < 5; i++) {
          clay.cyl.call(clay, M.mul(m, m4(-1.05 + i * 0.52 + si * 0.1, sy + 0.03,
            -half + 0.2)), 0.055, 0.07, 0.16, 6,
            si ? [1.1, 0.9, 0.6] : [0.9, 1.0, 0.85], true);
        }
      }
      // 招牌：横梁 + 吊牌 + 两端纸灯笼（都有实体支撑）
      const sp = stallSign(x, z, ry, STALL_NAMES[idx], idx, w, half);
      // 背面小牌：挂在后墙木框上
      addBackBoard(sp, x - nx * (half + 0.03), 1.62, z - nz * (half + 0.03),
        ry + Math.PI, 1.0, 0.24);
      for (const s of [-1, 1]) {
        tubeLocal(rope, m, [[s * 0.4, 1.75, -half - 0.03], [s * 0.4, 2.0, -half + 0.06]],
          0.007, 3, [1, 1, 1]);
      }
      // 前檐灯串：绳从两根前柱之间拉过去，灯泡挂在绳上
      const bulbs = [];
      for (let i = 0; i <= 4; i++) {
        const u = i / 4;
        bulbs.push([-w / 2 + 0.1 + u * (w - 0.2), ph - 0.03 - Math.sin(u * Math.PI) * 0.05,
          half - 0.03]);
      }
      tubeLocal(rope, m, bulbs, 0.009, 3, [0.7, 0.62, 0.5]);
      for (let i = 1; i < 4; i++) {
        const p = bulbs[i];
        bulb.sphere.call(bulb, M.mul(m, m4(p[0], p[1] - 0.07, p[2])), 0.04, 5, 3, [1, 1, 1]);
        bulbGlow.quad.call(bulbGlow, M.mul(m, m4(p[0], p[1] - 0.07, p[2] + 0.02)), 0.5, 0.5,
          [1, 1, 1], [0, 0, 1, 1]);
      }
      // 摊位背后（海那一侧）的货箱 / 酒桶 / 麻袋，免得从海上看是一块光板
      const backLocal = (lx, lz) => {
        const wx = x + Math.cos(ry) * lx + Math.sin(ry) * lz;
        const wz = z - Math.sin(ry) * lx + Math.cos(ry) * lz;
        return [wx, wz];
      };
      const bp1 = backLocal(-w * 0.34, -half - 0.55);
      const bp2 = backLocal(w * 0.3, -half - 0.6);
      crateAt(bp1[0], gH(bp1[0], bp1[1]), bp1[1], 0.44, ry + 0.3, [0.9, 0.82, 0.7]);
      if (idx % 2 === 0) barrelAt(bp2[0], bp2[1], 0.92, ry - 0.2);
      else sackAt(bp2[0], bp2[1], 1.0, ry + 0.2, [0.82, 0.74, 0.6]);
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
      // 落款：挂在摊主身后木框上的小黑板
      hangBoard(cloth, m, 0, 1.95, -1.18, 1.1, 0.62, [0.16, 0.15, 0.14], 2.0);
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
        clay.cyl.call(clay, M.mul(m, m4(0.03 + i * 0.13, 0.94, 0.3)), 0.048, 0.052, 0.11, 6,
          [1.1, 0.98, 0.86], true);
        metal.cyl.call(metal, M.mul(m, m4(0.03 + i * 0.13, 0.94, 0.3)), 0.04, 0.04, 0.008, 6,
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
      // 挂在后墙木框上的展示布
      hangBoard(canvas, m, -0.75, 1.9, -1.18, 0.9, 0.55, [1.2, 1.05, 0.9], 2.0);
      hangBoard(canvas, m, 0.75, 1.9, -1.18, 0.9, 0.55, [0.6, 0.85, 1.15], 2.0);
      // 檐下挂着的两件周边 T 恤
      for (const lx of [-1.15, 1.15]) {
        const colT = lx < 0 ? [1.2, 1.05, 0.9] : [0.6, 0.85, 1.15];
        cloth.quad.call(cloth, M.mul(m, m4(lx, 1.72, 1.12)), 0.4, 0.5, colT, [0, 0, 1, 1]);
        for (const s of [-1, 1]) {
          tubeLocal(rope, m, [[lx + s * 0.16, 2.1, 1.24], [lx + s * 0.16, 1.97, 1.13]],
            0.006, 3, [1, 1, 1]);
        }
      }
    }

    function goodsGpu(m) {
      // 后墙上的展示板 + 四张挂着的旧卡
      hangBoard(canvas, m, 0, 1.9, -1.19, 2.15, 0.5, [1.15, 0.95, 0.8], 1.98);
      for (let i = 0; i < 4; i++) {
        const px = -0.9 + i * 0.55;
        dark.box.call(dark, M.mul(m, m4(px, 1.6, -1.06, 0, 0.1 * (i % 2 ? 1 : -1), 0)),
          0.44, 0.24, 0.05, [1, 1, 1], 1);
        metal.cyl.call(metal, M.mul(m, m4(px - 0.1, 1.6, -1.02, Math.PI / 2, 0, 0)),
          0.1, 0.1, 0.03, 8, [1, 1, 1], true);
        metal.box.call(metal, M.mul(m, m4(px + 0.18, 1.6, -1.03)), 0.06, 0.16, 0.02,
          [0.6, 0.55, 0.5], 1);
      }
      for (let i = 0; i < 4; i++) {
        dark.box.call(dark, M.mul(m, m4(-1.0 + i * 0.5, 0.98, 0.14, 0, -0.15, 0)),
          0.42, 0.05, 0.26, [0.9, 0.9, 0.95], 1);
        metal.cyl.call(metal, M.mul(m, m4(-1.1 + i * 0.5, 1.03, 0.1, Math.PI / 2, 0, 0)),
          0.09, 0.09, 0.02, 8, [1, 1, 1], true);
        brass.box.call(brass, M.mul(m, m4(-0.9 + i * 0.5, 1.0, 0.16)), 0.1, 0.012, 0.06,
          [1, 0.85, 0.4], 1);
      }
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
      // 挂在后墙木框上的黑板
      hangBoard(cloth, m, 0, 1.95, -1.19, 1.9, 0.55, [0.2, 0.28, 0.22], 2.0);
      // 台面上的小台灯
      clay.cyl.call(clay, M.mul(m, m4(1.05, 0.94, 0.22)), 0.07, 0.055, 0.14, 6, [1, 1, 1], true);
      const lp = M.xf(m, [1.05, 1.2, 0.22]);
      paper.cyl.call(paper, m4(lp[0], lp[1] - 0.12, lp[2]), 0.07, 0.1, 0.18, 8, [1, 1, 1], true);
      lampGlow.quad.call(lampGlow, m4(lp[0], lp[1], lp[2]), 0.65, 0.65, [1, 1, 1], [0, 0, 1, 1]);
    }

    function goodsMusic(m) {
      for (let i = 0; i < 3; i++) {
        const px = -0.85 + i * 0.55;
        clay.cyl.call(clay, M.mul(m, m4(px, 0.94, 0.06)), 0.22 - i * 0.03, 0.24 - i * 0.03,
          0.34, 10, [1.15, 0.9, 0.68], true);
        metal.cyl.call(metal, M.mul(m, m4(px, 1.28, 0.06)), 0.25 - i * 0.03, 0.25 - i * 0.03,
          0.02, 10, [0.85, 0.82, 0.74], true);
      }
      // 靠着的木吉他
      wood.box.call(wood, M.mul(m, m4(0.95, 1.12, -0.15, 0.25, 0.2, 0.15)), 0.34, 0.4, 0.09,
        [1, 0.85, 0.65], 1.4);
      wood.cyl.call(wood, M.mul(m, m4(0.95, 1.3, -0.15, 0.25, 0.2, 0.62)), 0.035, 0.03, 0.62,
        5, [1, 1, 1], true);
      // 檐下铜管风铃：横杆从前檐吊下来，铜管挂在横杆上
      const barY = 2.02, barZ = 0.95;
      wood.box.call(wood, M.mul(m, m4(-0.2, barY, barZ)), 1.0, 0.04, 0.04, [1, 1, 1], 1.2);
      for (const s of [-1, 1]) {
        tubeLocal(rope, m, [[-0.2 + s * 0.5, barY, barZ], [-0.2 + s * 0.5, 2.1, 1.24]],
          0.007, 3, [1, 1, 1]);
      }
      for (let i = 0; i < 5; i++) {
        const bx = -0.7 + i * 0.18;
        const len = 0.28 + (i % 3) * 0.08;
        brass.cyl.call(brass, M.mul(m, m4(bx, barY - len, barZ)), 0.018, 0.018, len, 5,
          [1, 1, 1], false);
        tubeLocal(rope, m, [[bx, barY - len, barZ], [bx, barY - 0.02, barZ]], 0.006, 3,
          [1, 1, 1]);
      }
    }

    function goodsRugs(m) {
      const cols = [[1.15, 0.6, 0.5], [0.62, 0.72, 1.0], [1.1, 0.95, 0.6], [0.6, 1.0, 0.82]];
      for (let i = 0; i < 5; i++) {
        rug.cyl.call(rug, M.mul(m, m4(-0.95 + i * 0.32, 1.06, 0.1, 0, 0, Math.PI / 2)),
          0.12, 0.12, 0.62, 8, cols[i % 4], true);
      }
      for (let i = 0; i < 3; i++) {
        hangBoard(rug, m, -0.7 + i * 0.7, 1.95, -1.18, 0.6, 0.52, cols[i % 4], 2.0);
      }
      for (let i = 0; i < 3; i++) {
        clay.cyl.call(clay, M.mul(m, m4(0.7 + i * 0.22, 0.94, 0.18)), 0.11, 0.15, 0.2, 8,
          [1.2, 0.95, 0.65], true);
      }
      // 摊位前铺一张展示毯：四角贴地，不再用单点 gH
      const fm = M.xf(m, [0, 0, 1.55]);
      const frY = Math.atan2(m[8], m[10]);
      groundQuad4(rug, fm[0], fm[2], 1.9, 1.4, frY, [1, 1, 1], [0, 0, 1.2, 0.9], 0.02);
    }

    /* ============================================================
     *  坐着 / 站着的人影：背面也有肩、腰带、头发和手，不是一根光筒
     * ============================================================ */
    function personSit(x, z, ry, h, col, hatCol) {
      const s = h / 1.55;
      const gy = gH(x, z);
      const m = m4(x, gy, z, 0, ry, 0);
      const head = [0.82, 0.62, 0.5];
      const darkCol = [0.22, 0.2, 0.2];
      const hairCol = [0.16, 0.13, 0.11];
      // 坐的原木：底部落地，坐面高约 0.3（不再悬空）
      const logR = 0.14;
      wood.cyl.call(wood, M.mul(m, m4(0.32, logR, 0, 0, 0, Math.PI / 2)), logR * 0.9, logR,
        0.64, 7, [1, 1, 1], true);
      for (const sg of [-1, 1]) {
        dark.box.call(dark, M.mul(m, m4(sg * 0.24, 0.03, 0)), 0.14, 0.06, 0.3, [1, 1, 1], 1.2);
      }
      cloth.box.call(cloth, M.mul(m, m4(0, 0.34, -0.01)), 0.5, 0.05, 0.36, col, 1.4);
      // 髋 / 躯干 / 肩 / 腰带
      cloth.sphere.call(cloth, M.mul(m, m4(0, 0.43, -0.03, 0, 0, 0, 1.35, 0.7, 1.0)),
        0.19 * s, 6, 4, col);
      cloth.cyl.call(cloth, M.mul(m, m4(0, 0.46, -0.03, -0.08, 0, 0)), 0.2 * s, 0.17 * s,
        0.62 * s, 6, col, true);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 1.06, -0.05, 0, 0, 0, 1.5, 0.55, 1.0)),
        0.17 * s, 6, 4, col);
      cloth.cyl.call(cloth, M.mul(m, m4(0, 0.5, -0.03)), 0.19 * s, 0.19 * s, 0.045, 6,
        [0.32, 0.26, 0.2], false);
      // 脖子 / 头 / 后脑头发
      cloth.cyl.call(cloth, M.mul(m, m4(0, 1.08, -0.02)), 0.05 * s, 0.045 * s, 0.09 * s, 5,
        head, false);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 1.22, -0.01)), 0.118 * s, 7, 5, head);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 1.24, -0.05, 0, 0, 0, 1.0, 1.0, 0.72)),
        0.114 * s, 6, 4, hairCol);
      // 手臂 / 手 / 大腿 / 小腿 / 鞋
      for (const sg of [-1, 1]) {
        const sh = [sg * 0.18 * s, 1.02, 0.02];
        const el = [sg * 0.22 * s, 0.8, 0.16];
        const hd = [sg * 0.2 * s, 0.6, 0.3];
        tubeLocal(cloth, m, [sh, el, hd], 0.045 * s, 4, col);
        cloth.sphere.call(cloth, M.mul(m, m4(hd[0], hd[1], hd[2])), 0.05 * s, 5, 4, head);
        cloth.cyl.call(cloth, M.mul(m, m4(sg * 0.11 * s, 0.37, 0.02, Math.PI / 2, 0, 0)),
          0.078 * s, 0.065 * s, 0.4 * s, 5, darkCol, false);
        cloth.cyl.call(cloth, M.mul(m, m4(sg * 0.11 * s, 0.02, 0.44)), 0.06 * s, 0.052 * s,
          0.34 * s, 5, darkCol, false);
        cloth.box.call(cloth, M.mul(m, m4(sg * 0.11 * s, 0.035, 0.52)), 0.14 * s, 0.07 * s,
          0.22 * s, [0.14, 0.12, 0.12], 1.2);
      }
      // 搭在膝盖上的毯子（正反两层）
      quadP(cloth, m, [-0.22, 0.46, 0.04], [0.22, 0.46, 0.04], [0.18, 0.32, 0.62],
        [-0.18, 0.32, 0.62], [col[0] * 0.8, col[1] * 0.78, col[2] * 0.76]);
      quadInv(cloth, m, [-0.22, 0.45, 0.04], [0.22, 0.45, 0.04], [0.18, 0.31, 0.62],
        [-0.18, 0.31, 0.62], [col[0] * 0.6, col[1] * 0.58, col[2] * 0.56]);
      if (hatCol) {
        dark.cyl.call(dark, M.mul(m, m4(0, 1.3, -0.01)), 0.155 * s, 0.135 * s, 0.05 * s, 6,
          hatCol, true);
      }
    }

    function personStand(x, z, ry, h, col, opts) {
      opts = opts || {};
      const s = h / 1.45;
      const lean = opts.lean || 0;
      const gy = gH(x, z);
      const m = m4(x, gy, z, lean, ry, 0);
      const head = opts.skin || [0.82, 0.62, 0.5];
      const darkCol = [0.2, 0.18, 0.18];
      const hairCol = opts.hair || [0.16, 0.13, 0.11];
      // 腿 + 鞋
      for (const sg of [-1, 1]) {
        cloth.cyl.call(cloth, M.mul(m, m4(sg * 0.1 * s, 0, 0)), 0.062 * s, 0.05 * s,
          0.62 * s, 5, darkCol, false);
        cloth.box.call(cloth, M.mul(m, m4(sg * 0.1 * s, 0.035 * s, 0.04 * s)), 0.14 * s,
          0.07 * s, 0.24 * s, [0.12, 0.1, 0.1], 1.2);
      }
      // 髋 / 躯干 / 肩 / 腰带
      cloth.sphere.call(cloth, M.mul(m, m4(0, 0.66 * s, 0, 0, 0, 0, 1.3, 0.8, 1.0)),
        0.2 * s, 6, 4, col);
      cloth.cyl.call(cloth, M.mul(m, m4(0, 0.62 * s, 0)), 0.17 * s, 0.215 * s, 0.58 * s, 6,
        col, true);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 1.19 * s, 0, 0, 0, 0, 1.55, 0.55, 1.0)),
        0.17 * s, 6, 4, col);
      cloth.cyl.call(cloth, M.mul(m, m4(0, 0.72 * s, 0)), 0.19 * s, 0.19 * s, 0.045, 6,
        [0.32, 0.26, 0.2], false);
      // 领口 / 脖子 / 头 / 后脑头发
      cloth.cyl.call(cloth, M.mul(m, m4(0, 1.21 * s, 0)), 0.08 * s, 0.065 * s, 0.07 * s, 6,
        [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75], false);
      cloth.cyl.call(cloth, M.mul(m, m4(0, 1.22 * s, 0)), 0.05 * s, 0.045 * s, 0.07 * s, 5,
        head, false);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 1.33 * s, 0.01 * s)), 0.115 * s, 7, 5, head);
      cloth.sphere.call(cloth, M.mul(m, m4(0, 1.35 * s, -0.035 * s, 0, 0, 0, 1.0, 1.0, 0.7)),
        0.112 * s, 6, 4, hairCol);
      // 手臂 + 手
      if (!opts.noArms) {
        for (const sg of [-1, 1]) {
          const sh = [sg * 0.21 * s, 1.14 * s, 0];
          const el = [sg * 0.25 * s, 0.9 * s, 0.04 * s];
          const hd = [sg * 0.23 * s, 0.68 * s, 0.05 * s];
          tubeLocal(cloth, m, [sh, el, hd], 0.045 * s, 4, col);
          cloth.sphere.call(cloth, M.mul(m, m4(hd[0], hd[1], hd[2])), 0.048 * s, 5, 4, head);
        }
      }
      if (opts.apron) {
        quadP(cloth, m, [-0.19 * s, 0.42 * s, 0.19 * s], [0.19 * s, 0.42 * s, 0.19 * s],
          [0.17 * s, 1.06 * s, 0.2 * s], [-0.17 * s, 1.06 * s, 0.2 * s],
          [0.86, 0.8, 0.7]);
      }
      if (opts.bag) {
        tubeLocal(cloth, m, [[-0.18 * s, 1.14 * s, 0.02 * s], [0.16 * s, 0.74 * s, 0.16 * s]],
          0.014, 3, [0.3, 0.26, 0.2]);
        wood.box.call(wood, M.mul(m, m4(0.19 * s, 0.66 * s, 0.18 * s, 0, 0.4, 0)),
          0.2 * s, 0.18 * s, 0.1 * s, [0.42, 0.32, 0.24], 1.2);
      }
      if (opts.hat) {
        dark.cyl.call(dark, M.mul(m, m4(0, 1.43 * s, 0.01 * s)), 0.16 * s, 0.14 * s,
          0.05 * s, 6, opts.hat, true);
      }
      if (opts.mug) {
        clay.cyl.call(clay, M.mul(m, m4(0.3 * s, 0.86 * s, 0.08 * s)), 0.04 * s, 0.045 * s,
          0.1 * s, 5, [1, 0.95, 0.85], true);
      }
    }

    /* ============================================================
     *  篝火：石圈 / 炭灰 / 柴 / 火 / 锅 / 空原木凳
     * ============================================================ */
    const FIRE0 = [10.2, 15.0];
    const FIRE1 = [14.8, 26.6];
    const FIRE2 = [-1.6, 7.8];

    function campfireAt(x, z, sc, withPot) {
      const gy = gH(x, z);
      P.campfire(stone, m4(x, gy + 0.01, z, 0, r() * TAU, 0), 0.55 * sc,
        [0.85, 0.78, 0.68], [0.36, 0.24, 0.16]);
      // 炭灰圈 + 炭块
      quadP(ash, M.ident(), [x - 0.85 * sc, gy + 0.035, z - 0.85 * sc],
        [x - 0.85 * sc, gy + 0.035, z + 0.85 * sc], [x + 0.85 * sc, gy + 0.035, z + 0.85 * sc],
        [x + 0.85 * sc, gy + 0.035, z - 0.85 * sc], [1, 1, 1]);
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU, rad = 0.18 + r() * 0.5;
        ash.sphere.call(ash, m4(x + Math.cos(a) * rad * sc, gy + 0.04,
          z + Math.sin(a) * rad * sc, 0, r() * TAU, 0, 1.6, 0.5, 1.2), 0.075 * sc, 5, 4,
          [0.7, 0.65, 0.6]);
      }
      fireGlow.quad.call(fireGlow, m4(x, gy + 0.05, z, -Math.PI / 2, 0, 0), 3.4 * sc,
        3.4 * sc, [1, 1, 1], [0, 0, 1, 1]);
      fireGlow.quad.call(fireGlow, m4(x, gy + 0.06, z, -Math.PI / 2, 0.5, 0), 1.9 * sc,
        1.9 * sc, [1, 1, 1], [0, 0, 1, 1]);
      for (let i = 0; i < 2; i++) {
        fireGlow.quad.call(fireGlow, m4(x, gy + 0.85 * sc, z, 0, i * Math.PI / 2, 0),
          1.9 * sc, 2.3 * sc, [1, 1, 1], [0, 0, 1, 1]);
      }
      campGlow(depthGlow, x, gy + 0.9 * sc, z, 6.2 * sc, 4.6 * sc);
      for (let i = 0; i < 7; i++) {
        flame.quad.call(flame, m4(x + (r() - 0.5) * 0.55 * sc, gy + 0.42 * sc + r() * 0.16,
          z + (r() - 0.5) * 0.55 * sc, 0, r() * TAU, 0),
          (0.4 + r() * 0.26) * sc, (0.9 + r() * 0.72) * sc, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 烧黑的柴：从火里伸出来
      for (let i = 0; i < 4; i++) {
        const a = 0.4 + i * 1.35;
        dark.cyl.call(dark, m4(x + Math.cos(a) * 0.1, gy + 0.08, z + Math.sin(a) * 0.1,
          0.5, a, 0.3), 0.055, 0.045, 0.55 * sc, 5, [1, 1, 1], true);
      }
      // 主篝火边再放两根空原木凳，坐满时也有地方
      if (sc > 0.95) {
        for (const seat of [[0.35, 2.55, 0.95], [2.35, 2.55, 0.9]]) {
          const a = seat[0], rr = seat[1] * sc;
          logSeatAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr,
            Math.atan2(-Math.cos(a), -Math.sin(a)), seat[2], 0.14, [1, 1, 1]);
        }
      }
      // 柴堆
      for (let i = 0; i < 3; i++) {
        wood.cyl.call(wood, m4(x - 1.9 * sc, gy + 0.1 + i * 0.14, z - 0.6 + i * 0.12,
          Math.PI / 2, 0.3 + i * 0.2, 0), 0.09, 0.08, 0.8, 5, [1, 1, 1], true);
      }
      if (withPot) {
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * TAU + 0.5;
          tubeLine(dark, [[x + Math.cos(a) * 0.8, gy, z + Math.sin(a) * 0.8],
            [x, gy + 2.0, z]], 0.035, 4, [1, 1, 1]);
        }
        tubeLine(rope, [[x, gy + 2.0, z], [x, gy + 1.72, z]], 0.008, 3, [1, 1, 1]);
        metal.cyl.call(metal, m4(x, gy + 1.4, z), 0.28, 0.3, 0.3, 10, [1, 1, 1], true);
        metal.box.call(metal, m4(x, gy + 1.73, z), 0.62, 0.03, 0.05, [1, 1, 1], 1.2);
      }
    }

    /* ============================================================
     *  串灯 / 旗串 / 晾衣绳 / 风铃 / 木桩
     * ============================================================ */
    function poleAt(x, z, h, flagCol, withLamp) {
      const y = gH(x, z);
      wood.cyl.call(wood, m4(x, y, z), 0.065, 0.042, h, 5, [1, 1, 1], true);
      dark.cyl.call(dark, m4(x, y + h - 0.05, z), 0.055, 0.045, 0.1, 5, [1, 1, 1], true);
      // 杆脚压石 + 缠绳，别让杆子看起来是插在空气里
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        stone.sphere.call(stone, m4(x + Math.cos(a) * 0.12, y + 0.05, z + Math.sin(a) * 0.12,
          0, a, 0, 1.5, 0.45, 1.2), 0.075, 5, 4, [1, 1, 1]);
      }
      for (const yy of [0.3, 0.55]) {
        brass.torus.call(brass, m4(x, y + yy, z), 0.062, 0.008, 6, 3, [0.8, 0.66, 0.42]);
      }
      if (flagCol) {
        triBoth(linen, m4(x + 0.03, y + h - 0.1, z, 0, 0.3, 0),
          [0, 0, 0], [0.66, 0.08, 0], [0, -0.32, 0], flagCol, 0.005);
      }
      if (withLamp) {
        wood.box.call(wood, m4(x + Math.sin(1.2) * 0.18, y + h - 0.12, z + Math.cos(1.2) * 0.18,
          0, 1.2, 0), 0.05, 0.05, 0.4, [1, 1, 1], 1.2);
        lantern(x + Math.sin(1.2) * 0.36, y + h - 0.44, z + Math.cos(1.2) * 0.36, 0.95,
          [1, 1, 1], y + h - 0.14, true);
      }
    }

    /** 串灯线上一点：[x,z,y]；两端点和 POLES 的杆顶是同一套坐标 */
    function stringPoint(a, b, sag, u) {
      return [a[0] + (b[0] - a[0]) * u,
        a[1] + (b[1] - a[1]) * u,
        a[2] + (b[2] - a[2]) * u - Math.sin(u * Math.PI) * sag];
    }

    function stringLights(a, b, sag) {
      const n = 12, pts = [];
      for (let i = 0; i <= n; i++) {
        const p = stringPoint(a, b, sag, i / n);
        pts.push([p[0], p[2], p[1]]);
        if (i > 0 && i < n) {
          const warm = r() < 0.84;
          bulb.sphere.call(bulb, m4(p[0], p[2] - 0.07, p[1]), 0.052, 5, 3,
            warm ? [1, 1, 1] : [0.72, 0.88, 1.25]);
          bulbGlow.quad.call(bulbGlow, m4(p[0], p[2] - 0.07, p[1] + 0.02), 0.64, 0.64,
            [1, 1, 1], [0, 0, 1, 1]);
        }
      }
      tubeLine(rope, pts, 0.011, 3, [0.55, 0.5, 0.44]);
    }

    function bunting(a, b, sag, n, s) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const p = stringPoint(a, b, sag, i / 10);
        pts.push([p[0], p[2], p[1]]);
      }
      tubeLine(rope, pts, 0.011, 3, [0.75, 0.66, 0.56]);
      const cols = [[1.25, 0.52, 0.44], [1.2, 0.86, 0.42], [0.52, 0.8, 1.15],
        [0.58, 1.05, 0.78], [1.12, 0.62, 0.98]];
      const kk = s || 1;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const ry = Math.atan2(-dz, dx);
      for (let k = 0; k < n; k++) {
        const p = stringPoint(a, b, sag, (k + 0.5) / n);
        triBoth(cloth, m4(p[0], p[2], p[1], 0, ry + (r() - 0.5) * 0.12, 0),
          [-0.11 * kk, 0, 0], [0.11 * kk, 0, 0], [0, -0.32 * kk, 0],
          cols[k % cols.length], 0.004);
      }
    }

    function laundryLine(x0, z0, x1, z1, h, n) {
      const y0 = gH(x0, z0), y1 = gH(x1, z1);
      for (const p of [[x0, z0], [x1, z1]]) {
        wood.cyl.call(wood, m4(p[0], gH(p[0], p[1]), p[1]), 0.045, 0.035, h, 5,
          [1, 1, 1], true);
        dark.cyl.call(dark, m4(p[0], gH(p[0], p[1]) + h - 0.04, p[1]), 0.052, 0.044, 0.06, 5,
          [1, 1, 1], true);
        // 晾衣绳在柱顶下 6cm，用两圈绳绑在柱子上
        for (const yy of [-0.05, -0.12]) {
          brass.torus.call(brass, m4(p[0], gH(p[0], p[1]) + h + yy, p[1]), 0.052, 0.007, 6, 3,
            [0.8, 0.68, 0.5]);
        }
      }
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        pts.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + h - 0.06 -
          Math.sin(u * Math.PI) * 0.28, z0 + (z1 - z0) * u]);
      }
      tubeLine(rope, pts, 0.009, 3, [1, 1, 1]);
      const cols = [[1.15, 0.6, 0.5], [0.62, 0.78, 1.1], [1.15, 1.0, 0.7], [0.7, 1.0, 0.8]];
      const dirx = x1 - x0, dirz = z1 - z0, dl = Math.hypot(dirx, dirz) || 1;
      const ux = dirx / dl, uz = dirz / dl;
      const ry = Math.atan2(-uz, ux);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * u;
        const z = z0 + (z1 - z0) * u;
        const y = y0 + (y1 - y0) * u + h - 0.06 - Math.sin(u * Math.PI) * 0.28;
        const wide = i % 3 === 0 ? 0.72 : 0.48;
        const tall = i % 3 === 0 ? 0.78 : 0.58;
        const c = cols[i % cols.length];
        const q = (dy) => [
          [x - ux * wide / 2, y + dy, z - uz * wide / 2],
          [x + ux * wide / 2, y + dy, z + uz * wide / 2],
          [x + ux * wide / 2, y - tall + dy, z + uz * wide / 2],
          [x - ux * wide / 2, y - tall + dy, z - uz * wide / 2]
        ];
        const A = q(0);
        quadP(cloth, M.ident(), A[0], A[1], A[2], A[3], c);
        const B = q(-0.01);
        quadInv(cloth, M.ident(), B[0], B[1], B[2], B[3],
          [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7]);
        // 两只木夹子夹在绳上
        for (const s of [-1, 1]) {
          wood.box.call(wood, m4(x + ux * s * wide * 0.34, y + 0.01, z + uz * s * wide * 0.34,
            0, ry, 0), 0.035, 0.09, 0.03, [0.8, 0.7, 0.55], 1.2);
        }
      }
    }

    /** 风铃：吊绳上端 topY 必须落在串灯 / 横杆 / 杆顶上 */
    function chime(x, y, z, s, topY) {
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
      if (topY !== undefined && topY > y) {
        tubeLine(rope, [[x, y, z], [x, topY, z]], 0.006, 3, [1, 1, 1]);
        dark.cyl.call(dark, m4(x, topY - 0.02, z), 0.025, 0.018, 0.04, 5, [1, 1, 1], false);
      }
    }

    /** 把风铃挂在两杆之间的串灯线上（自动算线上的悬挂点） */
    function chimeOnString(a, b, sag, u, s) {
      const p = stringPoint(a, b, sag, u);
      chime(p[0], p[2] - 0.4, p[1], s, p[2]);
    }

    /* ============================================================
     *  沙滩小物：脚印 / 贝壳 / 野草 / 浮木 / 遮阳伞
     * ============================================================ */
    function footprints(x0, z0, x1, z1, n) {
      const dx = x1 - x0, dz = z1 - z0;
      const ry = Math.atan2(dx, dz);
      const px = dz / (Math.hypot(dx, dz) || 1), pz = -dx / (Math.hypot(dx, dz) || 1);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const x = x0 + dx * u + px * (i % 2 ? 0.16 : -0.16);
        const z = z0 + dz * u + pz * (i % 2 ? 0.16 : -0.16);
        groundQuad4(sand, x, z, 0.13, 0.3, ry + (i % 2 ? 0.1 : -0.1), [0.92, 0.86, 0.76],
          [0, 0, 1, 1], 0.012);
      }
    }

    function grassClump(x, z, n, h, col) {
      const y = gH(x, z);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU;
        const m = m4(x + (r() - 0.5) * 0.34, y + 0.005, z + (r() - 0.5) * 0.34,
          (r() - 0.5) * 0.35, a, (r() - 0.5) * 0.5);
        leafP.quad.call(leafP, m, 0.05 + r() * 0.05, h * (0.6 + r() * 0.7), col,
          [0, 0, 1, 1]);
      }
    }

    function umbrella(x, z, ry, colA, colB) {
      const gy = gH(x, z);
      const tiltX = 0.055, tiltZ = 0.07;
      const mm = m4(x, gy, z, tiltX, ry, tiltZ);
      wood.cyl.call(wood, mm, 0.058, 0.044, 2.5, 6, [1, 1, 1], true);
      const top = M.xf(mm, [0, 2.5, 0]);
      // 伞面：从伞杆顶向外张开的锥形；不给底盖，露出伞骨
      const baseY = top[1] - 0.2;
      canvas.cyl.call(canvas, m4(top[0], baseY, top[2]), 1.45, 0.06, 0.5, 14, colA, false);
      canvas.cyl.call(canvas, m4(top[0] + 0.01, top[1] + 0.02, top[2]), 0.04, 0.03, 0.2, 6,
        [0.9, 0.7, 0.45], true);
      // 伞骨：从中心毂到伞沿（贴着伞面内侧，不穿出布面）
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        tubeLine(dark, [[top[0], baseY + 0.02, top[2]],
          [top[0] + Math.cos(a) * 0.75, baseY + 0.02, top[2] + Math.sin(a) * 0.75],
          [top[0] + Math.cos(a) * 1.4, baseY + 0.02, top[2] + Math.sin(a) * 1.4]],
          0.016, 3, [1, 1, 1]);
      }
      rope.torus.call(rope, m4(top[0], baseY + 0.01, top[2]), 1.42, 0.012, 16, 3,
        [0.8, 0.72, 0.58]);
      // 伞沿的三角垂片（双面）
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.15;
        const a1 = a + 0.3;
        triBoth(canvas, m4(0, 0, 0),
          [top[0] + Math.cos(a) * 1.42, baseY + 0.005, top[2] + Math.sin(a) * 1.42],
          [top[0] + Math.cos(a1) * 1.42, baseY + 0.005, top[2] + Math.sin(a1) * 1.42],
          [top[0] + Math.cos(a + 0.15) * 1.36, baseY - 0.16,
            top[2] + Math.sin(a + 0.15) * 1.36], i % 2 ? colB : colA, 0.004);
      }
      // 插沙处：压一块大石头 + 周围三块小石头，视觉上真的插进沙里
      stone.sphere.call(stone, m4(x, gy + 0.02, z, 0, ry, 0, 1.8, 0.5, 1.6), 0.22, 6, 4,
        [0.85, 0.8, 0.72]);
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.5;
        stone.sphere.call(stone, m4(x + Math.cos(a) * 0.3, gy + 0.03, z + Math.sin(a) * 0.3,
          0, a, 0, 1.2, 0.5, 1.0), 0.11, 5, 4, [0.9, 0.84, 0.74]);
      }
      // 伞下的织毯 + 两个坐垫
      const mx = x + Math.sin(ry) * 0.6, mz = z + Math.cos(ry) * 0.6;
      groundQuad4(mat, mx, mz, 2.0, 1.5, ry, [1, 1, 1], [0, 0, 1.25, 0.95], 0.018);
      for (const s of [-1, 1]) {
        const cx = mx + Math.cos(ry) * s * 0.5, cz = mz - Math.sin(ry) * s * 0.5;
        cloth.box.call(cloth, m4(cx, gH(cx, cz) + 0.09, cz, 0, ry, 0), 0.42, 0.16, 0.34,
          s < 0 ? colA : colB, 1.3);
      }
    }

    function rowboatStatic(x, z, ry) {
      const cx = Math.sin(ry), cz = Math.cos(ry);
      const yBow = gH(x + cx * 1.25, z + cz * 1.25);
      const yStern = gH(x - cx * 1.25, z - cz * 1.25);
      const yBase = (yBow + yStern) / 2 + 0.05;
      const pitch = Math.asin(Math.max(-0.5, Math.min(0.5, (yStern - yBow) / 2.5)));
      const m = m4(x, yBase, z, pitch, ry, 0.02);
      // 船壳 + 舷板
      dark.box.call(dark, M.mul(m, m4(0, 0.2, 0)), 1.18, 0.42, 2.65, [1, 1, 1], 1.3);
      for (const s of [-1, 1]) {
        dark.box.call(dark, M.mul(m, m4(s * 0.57, 0.42, 0)), 0.09, 0.1, 2.5, [0.9, 0.84, 0.72],
          1.3);
        // 船头 / 船尾的收尖
        quadP(dark, m, [s * 0.59, 0.42, 1.32], [s * 0.06, 0.42, 1.78],
          [s * 0.06, 0.1, 1.78], [s * 0.59, 0.1, 1.32], [0.95, 0.9, 0.8]);
        quadP(dark, m, [s * 0.59, 0.42, -1.32], [s * 0.06, 0.42, -1.6],
          [s * 0.06, 0.1, -1.6], [s * 0.59, 0.1, -1.32], [0.9, 0.84, 0.74]);
      }
      // 船内地板 / 座板 / 横梁
      wood.box.call(wood, M.mul(m, m4(0, 0.36, 0)), 0.95, 0.05, 2.1, [0.9, 0.84, 0.72], 1.3);
      for (const bz of [-0.65, 0.35]) {
        wood.box.call(wood, M.mul(m, m4(0, 0.47, bz)), 1.05, 0.06, 0.3, [1, 1, 1], 1.4);
      }
      for (const bz of [-1.1, -0.2, 0.9]) {
        wood.box.call(wood, M.mul(m, m4(0, 0.22, bz)), 0.98, 0.05, 0.1, [0.85, 0.78, 0.68],
          1.3);
      }
      // 两支桨搁在船上
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, M.mul(m, m4(s * 0.25, 0.5, -0.6, Math.PI / 2, 0, s * 0.08)),
          0.035, 0.03, 2.1, 5, [1, 1, 1], true);
      }
      // 船头的小铁环 + 系到岸上的木桩
      const bow = M.xf(m, [0, 0.5, 1.45]);
      const stakeX = x + 2.0, stakeZ = z + 1.1;
      const stakeY = gH(stakeX, stakeZ);
      wood.cyl.call(wood, m4(stakeX, stakeY, stakeZ), 0.05, 0.04, 0.46, 4, [1, 1, 1], true);
      tubeLine(rope, [[bow[0], bow[1], bow[2]],
        [(bow[0] + stakeX) / 2, Math.min(bow[1], stakeY + 0.42) - 0.08,
          (bow[2] + stakeZ) / 2], [stakeX, stakeY + 0.4, stakeZ]], 0.018, 3, [1, 1, 1]);
      brass.torus.call(brass, m4(bow[0], bow[1] - 0.04, bow[2]), 0.07, 0.012, 6, 3,
        [0.9, 0.75, 0.5]);
      // 船尾的石头锚
      const stern = M.xf(m, [0, 0.35, -1.35]);
      const ax = x - 1.3, az = z - 1.0;
      stone.sphere.call(stone, m4(ax, gH(ax, az) + 0.08, az, 0, 0.5, 0, 1.3, 0.6, 1.0),
        0.2, 6, 4, [0.8, 0.76, 0.68]);
      tubeLine(rope, [[stern[0], stern[1], stern[2]], [ax, gH(ax, az) + 0.16, az]],
        0.016, 3, [1, 1, 1]);
      // 船里的木桶 / 渔网
      barrelAt(x - cx * 0.35, z - cz * 0.35, 0.55, ry, yBase + 0.35);
      clay.cyl.call(clay, M.mul(m, m4(0.3, 0.36, -0.3)), 0.14, 0.18, 0.22, 8,
        [0.7, 0.64, 0.5], true);
    }

    /* ============================================================
     *  营地主布局：帐篷和地摊混着沿沙滩排开，中间留一条宽点的弯过道。
     *  - 临水一排：5 个地摊 + 2 顶帐篷，地摊背朝海、面朝营地
     *  - 靠内陆：14 顶帐篷沿一条起伏的线，面朝海
     *  - 过道里只留一个地摊（乐器摊）缩到帐篷排前面，不堵路
     * ============================================================ */
    const TENTS = [
      // 临水摊位那一排的两顶帐篷：背朝海、面朝营地（+Z），第 7 位 1 = 面朝营地
      [-30.5, 12.9, "a", "ochre", "QWEN", 2.15, 1],
      [14.5, 12.3, "dome", "gold", "STARCODER", 2.15, 1],
      // 后排 14 顶：面朝海（-Z），沿 z 起伏的线
      [-28.0, 21.7, "yurt", "cream", "MISTRAL", 2.65],
      [-23.6, 22.4, "circus", "plum", "GEMMA", 2.75],
      [-19.2, 22.8, "spike", "gold", "GLM", 2.25],
      [-14.8, 23.1, "a", "olive", "KIMI", 2.45],
      [-10.4, 23.1, "dome", "orange", "PHI", 2.45],
      [-6.0, 22.8, "yurt", "indigo", "YI", 2.65],
      [-1.6, 22.3, "circus", "teal", "DEEPSEEK", 2.75],
      [2.8, 21.6, "gable", "rust", "MINIMAX", 2.6],
      [7.2, 20.9, "canopy", "blue", "BLOOM", 2.9],
      [11.6, 20.3, "a", "sand", "FALCON", 2.45],
      [16.0, 19.8, "dome", "indigo", "RWKV", 2.45],
      [20.4, 19.6, "yurt", "rust", "BAICHUAN", 2.65],
      [24.8, 19.6, "a", "blue", "COMMAND R", 2.45],
      [29.2, 19.8, "dome", "teal", "LLAMA", 2.45]
    ];
    // 每种帐篷：门前垫子离中心多远、侧面放杂物时的半宽
    const TENT_INFO = {
      a: { mat: 1.95, half: 1.3 },
      dome: { mat: 1.95, half: 1.55 },
      yurt: { mat: 2.15, half: 1.7 },
      circus: { mat: 2.25, half: 1.95 },
      spike: { mat: 1.75, half: 1.5 },
      gable: { mat: 2.1, half: 1.5 },
      canopy: { mat: 0, half: 1.7 }
    };

    TENTS.forEach((t, i) => {
      const tx = t[0], tz = t[1], kind = t[2], toneName = t[3], name = t[4], dist = t[5];
      const faceCamp = t[6] !== undefined;
      const ry = (faceCamp ? 0 : Math.PI) + (r() - 0.5) * 0.14;
      const col = TENT_COL[toneName] || [1, 1, 1];
      const seed = 11 + i * 7;
      if (kind === "a") tentA(tx, tz, ry, col, seed);
      else if (kind === "dome") tentDome(tx, tz, ry, col, seed);
      else if (kind === "yurt") tentYurt(tx, tz, ry, col, seed);
      else if (kind === "circus") tentCircus(tx, tz, ry, col, seed);
      else if (kind === "spike") tentSpike(tx, tz, ry, col, seed);
      else if (kind === "gable") tentGable(tx, tz, ry, col, seed);
      else tentCanopy(tx, tz, ry, col, seed);
      if (faceCamp) {
        // 侧面招牌朝 +X（主镜头方向），距账门 2.15，不占过道
        tentSign(tx, tz + 0.7, ry + Math.PI / 2, name, i, 2.15);
        if (kind !== "dome") doorMat(tx, tz, ry, TENT_INFO[kind].mat + 0.2, 1.1, 0.8, [1, 1, 1]);
      } else {
        tentSign(tx, tz, ry, name, i, dist);
        if (TENT_INFO[kind].mat > 0) {
          doorMat(tx, tz, ry, TENT_INFO[kind].mat, 1.1, 0.8, [1, 1, 1]);
        }
      }
      // 侧边杂物：临水两顶放背向招牌的一侧，后排放西侧；按帐型半径避让
      const off = TENT_INFO[kind].half + 0.55;
      const side = faceCamp ? -1 : 1;
      const px = tx + Math.cos(ry) * off * side;
      const pz = tz - Math.sin(ry) * off * side;
      const gy = gH(px, pz);
      if (i % 3 === 0) {
        crateAt(px, gy, pz, 0.46, r() * TAU, [0.95, 0.86, 0.72]);
      } else if (i % 3 === 1) {
        barrelAt(px, pz, 0.9, r() * TAU);
        sackAt(px + Math.sin(ry) * 0.55, pz + Math.cos(ry) * 0.55, 0.95, r() * TAU,
          [0.82, 0.74, 0.6]);
      } else {
        sackAt(px, pz, 1.0, r() * TAU, [0.82, 0.74, 0.6]);
        crateAt(px + Math.sin(ry) * 0.62, gy, pz + Math.cos(ry) * 0.62, 0.36, r() * TAU,
          [0.9, 0.8, 0.68]);
      }
      // 另一侧隔一顶放一个货箱，让两排帐篷脚下都有生活痕迹
      if (i % 4 === 1) {
        const qx = tx - Math.cos(ry) * off * side;
        const qz = tz + Math.sin(ry) * off * side;
        sackAt(qx, qz, 0.9, r() * TAU, [0.8, 0.72, 0.58]);
      }
      if (i % 2 === 0) {
        grassClump(tx - Math.cos(ry) * off * side * 0.82,
          tz + Math.sin(ry) * off * side * 0.82, 4, 0.34, [0.9, 1.0, 0.7]);
      }
      // BLOOM 那顶是带柜台的小店帐篷：补一个摊主和一个看货的
      if (kind === "canopy") {
        const vx = tx + Math.sin(ry) * 0.15, vz = tz + Math.cos(ry) * 0.15;
        personStand(vx, vz, ry, 1.66, [0.5, 0.42, 0.48], { apron: true, hat: [0.62, 0.5, 0.3] });
        const cx2 = tx + Math.sin(ry) * 1.7, cz2 = tz + Math.cos(ry) * 1.7;
        personStand(cx2, cz2, ry + Math.PI, 1.62, [0.45, 0.55, 0.7], { bag: true });
      }
    });

    /* ============================================================
     *  七个地摊 + 摊主与客人
     * ============================================================ */
    const STALLS = [
      // 临水一排：背朝海、面朝营地（ry≈0 时正面朝 +Z 内陆）
      [-23.0, 10.4, [1.2, 0.52, 0.42]],
      [-15.5, 11.6, [1.15, 0.86, 0.5]],
      [-8.0, 10.1, [0.55, 0.78, 1.1]],
      [-0.5, 11.5, [0.5, 0.9, 0.85]],
      [7.0, 10.3, [1.05, 0.62, 0.85]],
      // 乐器摊并回临水那一排的西段；过道（和 Lead 的土路）完全让开
      [-19.25, 10.8, [0.95, 0.8, 0.52]],
      // 毯子摊并回临水那一排
      [21.0, 10.6, [1.1, 0.6, 0.48]]
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
      // 摊主站到柜台后面（不再穿过台面），客人站在台前
      const back = M.xf(m, [0.2 * (i % 2 ? 1 : -1), 0, -0.55]);
      personStand(back[0], back[2], ry, 1.68 + (i % 2) * 0.06,
        VENDOR_COL[i % VENDOR_COL.length],
        { hat: i % 3 === 0 ? [0.7, 0.55, 0.3] : null, apron: i % 2 === 0,
          bag: i % 3 === 2 });
      const front = M.xf(m, [0.5 - (i % 2) * 1.0, 0, 1.55]);
      personStand(front[0], front[2], ry + Math.PI + 0.25, 1.64,
        CROWD_COL[i % CROWD_COL.length], { mug: i === 1, bag: i % 4 === 0 });
      // 有的摊前再站一个看货的
      if (i === 2 || i === 4 || i === 6) {
        const f2 = M.xf(m, [1.25, 0, 1.72]);
        personStand(f2[0], f2[2], ry + Math.PI - 0.35, 1.6,
          CROWD_COL[(i + 3) % CROWD_COL.length], { bag: true });
      }
    });

    /* 随机野草 / 杂物避让区：别长进帐篷、棚子和栈桥里 */
    const CLEAR = [];
    TENTS.forEach(t => {
      const inf = TENT_INFO[t[2]] || { half: 1.5 };
      CLEAR.push({ x: t[0], z: t[1], r: inf.half + 0.4 });
    });
    STALLS.forEach(s => CLEAR.push({ x: s[0], z: s[1], r: 1.9 }));
    for (let z = 2.6; z > -20; z -= 2) CLEAR.push({ x: -8, z: z, r: 1.7 });
    for (const f of [FIRE0, FIRE1, FIRE2]) CLEAR.push({ x: f[0], z: f[1], r: 2.5 });
    CLEAR.push({ x: 10.0, z: 3.2, r: 2.4 });      // 入口拴马桩
    CLEAR.push({ x: -24.5, z: 28.5, r: 2.4 });    // 后场小火
    const blocked = (x, z, pad) => {
      for (const c of CLEAR) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + (pad || 0)) return true;
      }
      return false;
    };

    /* ============================================================
     *  篝火与人影
     * ============================================================ */
    campfireAt(FIRE0[0], FIRE0[1], 1.0, true);
    campfireAt(FIRE1[0], FIRE1[1], 0.82, false);
    campfireAt(FIRE2[0], FIRE2[1], 0.7, false);
    // 营地深处的小火 + 立杆灯：给后排一个暖色落点
    campfireAt(-24.5, 28.5, 0.62, false);
    lanternPost(-22.3, 29.6, 2.35, 0.95, 2.2);
    campGlow(depthGlow, -24.5, 1.4, 28.5, 5.0, 3.4);

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
    for (let i = 0; i < 2; i++) {
      const a = 0.9 + i * 2.2;
      const px = -24.5 + Math.cos(a) * 1.35, pz = 28.5 + Math.sin(a) * 1.35;
      personSit(px, pz, Math.atan2(-Math.cos(a), -Math.sin(a)), 1.58,
        CROWD_COL[(i + 1) % CROWD_COL.length], i === 0 ? [0.6, 0.48, 0.3] : null);
    }
    // 火边弹琴的、端酒的、叉腰看热闹的
    personStand(13.3, 15.4, -1.7, 1.7, CROWD_COL[1], { lean: 0.06, bag: true });
    personStand(8.9, 18.3, -1.2, 1.64, CROWD_COL[5], { hat: [0.6, 0.5, 0.32] });
    personStand(13.0, 17.6, 2.4, 1.6, CROWD_COL[3], { mug: true });
    personStand(15.9, 24.6, 1.2, 1.67, CROWD_COL[6], {});
    personStand(2.2, 30.2, 0.4, 1.62, CROWD_COL[7], {});
    personStand(-2.0, 10.4, -0.7, 1.72, CROWD_COL[2], { apron: true });
    personStand(17.1, 11.4, 2.8, 1.6, CROWD_COL[0], {});
    personStand(6.3, 23.6, 1.6, 1.58, CROWD_COL[4], { bag: true });
    personStand(10.9, 8.4, 3.0, 1.66, CROWD_COL[1], {});
    personStand(11.4, 12.1, 1.1, 1.55, CROWD_COL[5], {});
    personStand(4.0, 6.9, 0.2, 1.63, CROWD_COL[3], { bag: true });
    personStand(19.3, 7.4, 2.1, 1.7, CROWD_COL[2], { hat: [0.5, 0.42, 0.3] });
    personStand(-27.6, 14.9, 0.6, 1.62, CROWD_COL[4], {});
    personStand(17.8, 14.0, 3.4, 1.66, CROWD_COL[7], { mug: true });
    personStand(-21.2, 29.8, 2.8, 1.6, CROWD_COL[0], {});

    /* ============================================================
     *  串灯 / 木杆 / 旗串 / 晾衣绳 / 风铃
     * ============================================================ */
    // 木杆沿帐篷前面排成一列，串灯就穿在杆与杆之间
    const POLES = [
      [18.2, 5.6, 3.4], [11.4, 6.8, 3.5], [16.8, 11.8, 3.6], [10.4, 12.0, 3.2],
      // 过道那一串
      [-30.0, 16.8, 3.4], [-22.5, 16.8, 3.3], [-15.0, 16.8, 3.5], [-7.5, 16.8, 3.2],
      [0.0, 16.8, 3.4], [7.5, 16.8, 3.3], [15.0, 16.8, 3.5], [22.5, 16.8, 3.2],
      [30.0, 16.8, 3.4],
      // 海侧那一串：立在摊位背后，从海滩/海上看得到整排灯
      [-26.0, 7.2, 3.2], [-19.0, 7.2, 3.1], [-12.0, 7.2, 3.3], [-5.0, 7.2, 3.2],
      [2.0, 7.2, 3.1], [9.0, 7.2, 3.3], [16.0, 7.2, 3.2]
    ];
    const POLE_FLAG = [[1.2, 0.55, 0.45], [0.6, 0.8, 1.1], [1.2, 0.95, 0.55], null,
      null, [1.1, 0.6, 0.9], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null];
    POLES.forEach((p, i) => {
      poleAt(p[0], p[1], p[2], POLE_FLAG[i],
        i === 4 || i === 8 || i === 12 || i === 13 || i === 16 || i === 19);
    });
    const poleTip = p => [p[0], p[1], p[2] - 0.2];
    // 前场三条（都从杆顶 0.2m 处起）
    const frontSegs = [
      [poleTip(POLES[0]), poleTip(POLES[1]), 0.55],
      [poleTip(POLES[1]), poleTip(POLES[3]), 0.5],
      [poleTip(POLES[3]), poleTip(POLES[9]), 0.45]
    ];
    frontSegs.forEach(sg => stringLights(sg[0], sg[1], sg[2]));
    // 过道一整串：4..12 共 9 根杆，8 段
    const aisleSegs = [];
    for (let i = 4; i < 12; i++) {
      aisleSegs.push([poleTip(POLES[i]), poleTip(POLES[i + 1]), 0.55]);
    }
    aisleSegs.forEach(sg => stringLights(sg[0], sg[1], sg[2]));
    // 海侧那一串：13..19 共 7 根杆，6 段
    const seaSegs = [];
    for (let i = 13; i < POLES.length - 1; i++) {
      seaSegs.push([poleTip(POLES[i]), poleTip(POLES[i + 1]), 0.5]);
    }
    seaSegs.forEach(sg => stringLights(sg[0], sg[1], sg[2]));
    stringLights(poleTip(POLES[19]), poleTip(POLES[0]), 0.45);

    // 营地两头的灯笼：挂到已有的木杆上（poleAt 的 withLamp 横臂），不再另插四根杆
    bunting([11.4, 6.8, 3.45], [16.8, 11.8, 3.55], 0.55, 12, 1);
    bunting([-15.0, 16.8, 3.45], [15.0, 16.8, 3.45], 0.9, 16, 1);

    laundryLine(2.6, 25.8, 8.2, 25.8, 2.2, 5);
    laundryLine(-18.2, 26.0, -12.6, 26.0, 2.1, 4);

    // 风铃挂在串灯线的实际悬挂点上（chimeOnString 自动取线上坐标）
    chimeOnString(frontSegs[0][0], frontSegs[0][1], frontSegs[0][2], 0.55, 1.0);
    chimeOnString(aisleSegs[5][0], aisleSegs[5][1], aisleSegs[5][2], 0.5, 0.9);
    chimeOnString(seaSegs[2][0], seaSegs[2][1], seaSegs[2][2], 0.55, 0.85);

    /* 营地边界的矮桩绳栏：在临水侧围一圈，留出栈桥和入口两个缺口 */
    function ropeFence(x0, x1, z, h) {
      const n = Math.max(2, Math.round((x1 - x0) / 2.6));
      const tops = [];
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n;
        const y = gH(x, z);
        wood.cyl.call(wood, m4(x, y, z), 0.055, 0.042, h, 5, [1, 1, 1], true);
        dark.cyl.call(dark, m4(x, y + h - 0.04, z), 0.06, 0.05, 0.05, 5, [1, 1, 1], true);
        stone.sphere.call(stone, m4(x, y + 0.03, z, 0, 0, 0, 1.4, 0.4, 1.2), 0.08, 5, 4,
          [1, 1, 1]);
        tops.push([x, z, y + h - 0.08]);
        if (i > 0 && i % 3 === 0) {
          clay.sphere.call(clay, m4(x + 0.04, y + h - 0.24, z, 0, 0, 0, 1.2, 1.6, 0.6),
            0.045, 5, 4, [1.15, 0.95, 0.8]);
          tubeLine(rope, [[x, y + h - 0.14, z], [x + 0.04, y + h - 0.2, z]], 0.005, 3,
            [1, 1, 1]);
        }
      }
      for (let i = 0; i < tops.length - 1; i++) {
        const a = tops[i], b = tops[i + 1];
        tubeLine(rope, [[a[0], a[2], a[1]],
          [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2 - 0.1, (a[1] + b[1]) / 2],
          [b[0], b[2], b[1]]], 0.011, 3, [1, 1, 1]);
        tubeLine(rope, [[a[0], a[2] - 0.16, a[1]],
          [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2 - 0.28, (a[1] + b[1]) / 2],
          [b[0], b[2] - 0.16, b[1]]], 0.009, 3, [1, 1, 1]);
      }
    }
    ropeFence(-31, -10, 5.6, 0.66);
    ropeFence(-6, 7.5, 5.6, 0.66);
    ropeFence(11.5, 30, 5.6, 0.66);

    /* ============================================================
     *  营地入口：拴马桩 + 缰绳 + 水槽（拱门和招牌已经拆掉）
     * ============================================================ */
    function buildEntrance() {
      const posts = [];
      for (let i = 0; i < 4; i++) {
        const hx = 8.2 + i * 1.05, hz = 3.0 + (i % 2) * 0.35;
        const hh = 1.02 + (i % 2) * 0.14;
        const gy = gH(hx, hz);
        wood.cyl.call(wood, m4(hx, gy, hz), 0.06, 0.045, hh, 5, [1, 1, 1], true);
        dark.cyl.call(dark, m4(hx, gy + hh - 0.04, hz), 0.07, 0.055, 0.05, 5, [1, 1, 1], true);
        for (const yy of [0.28, 0.5]) {
          brass.torus.call(brass, m4(hx, gy + yy, hz), 0.062, 0.008, 6, 3, [0.8, 0.66, 0.42]);
        }
        stone.sphere.call(stone, m4(hx, gy + 0.03, hz, 0, 0, 0, 1.4, 0.4, 1.2), 0.08, 5, 4,
          [1, 1, 1]);
        posts.push([hx, hz, gy + hh - 0.06]);
      }
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1];
        tubeLine(rope, [[a[0], a[2], a[1]],
          [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2 - 0.1, (a[1] + b[1]) / 2],
          [b[0], b[2], b[1]]], 0.012, 3, [1, 1, 1]);
      }
      // 中间柱上的小灯：横臂 + 灯笼
      const p2 = posts[1];
      wood.box.call(wood, m4(p2[0] + 0.16, p2[2] + 0.24, p2[1], 0, Math.PI / 2, 0),
        0.05, 0.05, 0.36, [1, 1, 1], 1.2);
      lantern(p2[0] + 0.32, p2[2] - 0.02, p2[1], 0.85, [1, 1, 1], p2[2] + 0.22, true);
      // 一段垂下来的缰绳
      tubeLine(rope, [[posts[2][0], posts[2][2] - 0.2, posts[2][1]],
        [posts[2][0] + 0.12, posts[2][2] - 0.75, posts[2][1] + 0.1],
        [posts[2][0] + 0.2, gH(posts[2][0] + 0.2, posts[2][1] + 0.1) + 0.06,
          posts[2][1] + 0.1]], 0.01, 3, [1, 1, 1]);
      // 木水槽
      const tx = 9.9, tz = 4.25, ty = gH(tx, tz);
      clay.cyl.call(clay, m4(tx, ty, tz), 0.32, 0.36, 0.3, 10, [1.1, 0.9, 0.7], true);
      clay.cyl.call(clay, m4(tx, ty + 0.28, tz), 0.3, 0.28, 0.02, 10, [0.4, 0.5, 0.55], true);
    }
    buildEntrance();

    /* ============================================================
     *  沙滩：遮阳伞、搁浅小船、贝壳、浮木、草、晾鱼架
     * ============================================================ */
    umbrella(9.2, 0.9, 0.4, [1.18, 0.55, 0.45], [1.2, 1.08, 0.9]);
    umbrella(4.2, -1.8, -0.3, [0.58, 0.78, 1.1], [1.15, 0.95, 0.75]);
    rowboatStatic(-3.4, 1.3, 1.15);

    // 野餐篮 / 酒瓶 / 叠好的毯子（都落在第一张伞的垫子旁）
    const pbx = 10.9, pbz = 1.9;
    crateAt(pbx, gH(pbx, pbz), pbz, 0.34, 0.35, [0.8, 0.7, 0.55]);
    clay.cyl.call(clay, m4(pbx - 0.42, gH(pbx - 0.42, pbz - 0.2), pbz - 0.2), 0.05, 0.055,
      0.22, 6, [0.4, 0.55, 0.42], true);
    linen.box.call(linen, m4(9.9, gH(9.9, 2.35) + 0.06, 2.35, 0, 0.3, 0), 0.46, 0.12, 0.36,
      [1.2, 1.08, 0.88], 1.4);
    // 第二张伞旁再铺一张小席
    groundQuad4(mat, 3.0, -0.5, 1.8, 1.3, -0.3, [1, 1, 1], [0, 0, 1.2, 0.9], 0.018);
    groundQuad4(mat, 12.9, 2.6, 1.5, 1.0, 0.2, [1, 1, 1], [0, 0, 1.2, 0.9], 0.018);

    footprints(7.4, -3.4, 10.6, 6.6, 16);
    footprints(13.2, -2.8, 12.4, 4.6, 10);
    // 贝壳：三小堆，靠近水线
    for (const cluster of [[-1.2, -2.2], [5.4, -3.6], [14.2, -2.0]]) {
      for (let i = 0; i < 7; i++) {
        const x = cluster[0] + (r() - 0.5) * 0.9, z = cluster[1] + (r() - 0.5) * 0.7;
        clay.sphere.call(clay, m4(x, gH(x, z) + 0.02, z, 0, r() * TAU, 0,
          1.3, 0.4, 1.0), 0.065 + r() * 0.04, 5, 3, [1.15, 0.95, 0.9]);
      }
      // 一只小海星
      const sx = cluster[0] + 0.6, sz = cluster[1] + 0.4;
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU;
        clay.box.call(clay, m4(sx + Math.cos(a) * 0.07, gH(sx, sz) + 0.02,
          sz + Math.sin(a) * 0.07, 0, a, 0), 0.13, 0.02, 0.04, [1.2, 0.72, 0.5], 1);
      }
    }
    // 浮木：沿坡面方向躺平，两端各自取地面高度，不悬空
    for (let i = 0; i < 5; i++) {
      const x = -6 + r() * 22, z = 2.2 + r() * 4.5;
      const len = 1.1 + r() * 1.3, ang = r() * TAU, rad = 0.055 + r() * 0.05;
      const x2 = x + Math.cos(ang) * len, z2 = z + Math.sin(ang) * len;
      tubeLine(wood, [[x, gH(x, z) + rad * 0.7, z],
        [(x + x2) / 2, gH((x + x2) / 2, (z + z2) / 2) + rad * 0.7, (z + z2) / 2],
        [x2, gH(x2, z2) + rad * 0.7, z2]], rad, 5, [1, 1, 1]);
      if (i % 2 === 0) {
        tubeLocal(dark, M.ident(), [[(x + x2) / 2, gH((x + x2) / 2, (z + z2) / 2) + rad * 0.6,
          (z + z2) / 2], [(x + x2) / 2 + 0.4, gH((x + x2) / 2 + 0.4, (z + z2) / 2 + 0.2) + 0.18,
          (z + z2) / 2 + 0.2]], 0.03, 4, [1, 1, 1]);
      }
    }
    // 沙滩上的野草：只在没被帐篷 / 摊位 / 栈桥占用的地方长
    for (let i = 0; i < 34; i++) {
      const x = -6 + r() * 36, z = 3.2 + r() * 31;
      if (blocked(x, z, 0.15)) continue;
      grassClump(x, z, 3 + Math.floor(r() * 3), 0.3 + r() * 0.3, [0.85, 0.95, 0.68]);
    }
    for (let i = 0; i < 10; i++) {
      const x = -12.6 + r() * 2.6, z = -1 + r() * 9;
      grassClump(x, z, 4, 0.38 + r() * 0.3, [0.95, 1.0, 0.72]);
    }
    // 晾鱼架：两根立柱 + 顶杆 + 三条挂鱼（给码头边一点渔村味）
    {
      const rx0 = -4.7, rx1 = -3.4, rz = 4.3;
      const ry0 = gH(rx0, rz), ry1 = gH(rx1, rz + 0.2);
      for (const p of [[rx0, rz, ry0], [rx1, rz + 0.2, ry1]]) {
        wood.cyl.call(wood, m4(p[0], p[2], p[1]), 0.045, 0.035, 1.1, 5, [1, 1, 1], true);
      }
      tubeLine(wood, [[rx0, ry0 + 1.08, rz], [(rx0 + rx1) / 2, (ry0 + ry1) / 2 + 1.02, rz + 0.1],
        [rx1, ry1 + 1.08, rz + 0.2]], 0.03, 4, [1, 1, 1]);
      for (let i = 0; i < 3; i++) {
        const u = 0.2 + i * 0.3;
        const fx = rx0 + (rx1 - rx0) * u, fz = rz + 0.2 * u;
        const fy = (ry0 + ry1) / 2 + 1.02;
        tubeLine(rope, [[fx, fy, fz], [fx, fy - 0.18, fz]], 0.006, 3, [1, 1, 1]);
        clay.sphere.call(clay, m4(fx, fy - 0.34, fz, 0, 0, 0.1, 0.5, 1.6, 0.3), 0.09, 6, 4,
          [0.85, 0.9, 0.95]);
      }
    }
    // 营地边的备用货箱堆
    for (const c of [[12.6, 6.7, 0.44], [13.1, 6.9, 0.34], [-27.6, 8.4, 0.4]]) {
      crateAt(c[0], gH(c[0], c[1]), c[1], c[2], r() * TAU, [0.9, 0.82, 0.7]);
    }
    barrelAt(-28.4, 9.0, 0.85, 0.4);

    /* ============================================================
     *  木栈桥 + 三条会晃的渔船
     * ============================================================ */
    function buildDock() {
      const X = -8, Z0 = 2.4, Z1 = -20.0, W = 2.6, Y = 0.66, hw = W / 2;
      const deckY = Y + 0.04;
      const bays = 10;
      const bayZ = i => Z0 + (Z1 - Z0) * i / bays;
      // ---- 甲板 / 侧梁 / 横梁 ----
      const nPlank = 38;
      for (let i = 0; i < nPlank; i++) {
        const z = Z0 + (Z1 - Z0) * (i + 0.5) / nPlank;
        plank.box.call(plank, m4(X, Y, z, 0, (r() - 0.5) * 0.015, 0), W, 0.08,
          Math.abs(Z1 - Z0) / nPlank * 0.9, [1, 1, 1], 1.4);
      }
      for (const s of [-1, 1]) {
        dark.box.call(dark, m4(X + s * (hw - 0.07), Y - 0.13, (Z0 + Z1) / 2),
          0.14, 0.18, Math.abs(Z1 - Z0) + 0.45, [1, 1, 1], 1.5);
      }
      for (let i = 0; i <= bays; i++) {
        dark.box.call(dark, m4(X, Y - 0.2, bayZ(i)), W + 0.28, 0.14, 0.16, [1, 1, 1], 1.4);
      }
      // ---- 桩 + X 撑 + 横撑 ----
      for (let i = 0; i <= bays; i++) {
        const z = bayZ(i);
        for (const s of [-1, 1]) {
          const px = X + s * (hw + 0.14);
          const bottom = -2.3;
          dark.cyl.call(dark, m4(px, bottom, z), 0.12, 0.1, deckY - 0.03 - bottom, 6,
            [1, 1, 1], true);
          dark.cyl.call(dark, m4(px, deckY - 0.06, z), 0.13, 0.11, 0.12, 6, [1, 1, 1], true);
          // X 撑：这一跨的外侧两根斜杆
          if (i < bays) {
            const z2 = bayZ(i + 1);
            tubeLine(dark, [[px, deckY - 0.3, z], [px, -1.5, z2]], 0.045, 4, [1, 1, 1]);
            tubeLine(dark, [[px, deckY - 0.3, z2], [px, -1.5, z]], 0.045, 4, [1, 1, 1]);
            // 桩间的水平系梁
            tubeLine(dark, [[px, 0.05, z], [px, 0.05, z2]], 0.04, 4, [1, 1, 1]);
          }
        }
        // 桥面下的横向连梁
        dark.box.call(dark, m4(X, deckY - 0.34, z), W + 0.5, 0.12, 0.14, [1, 1, 1], 1.4);
      }
      // ---- 栏杆：内陆端留出入口 ----
      for (const s of [-1, 1]) {
        const px = X + s * (hw - 0.14);
        const zStart = Z0 - 1.35, zEnd = Z1 + 0.35;
        const nPost = 10;
        for (let i = 0; i <= nPost; i++) {
          const z = zStart + (zEnd - zStart) * i / nPost;
          dark.cyl.call(dark, m4(px, deckY, z), 0.06, 0.05, 1.02, 5, [1, 1, 1], true);
          dark.cyl.call(dark, m4(px, deckY + 1.02, z), 0.065, 0.055, 0.05, 5, [1, 1, 1], true);
          // 绳结（栏杆柱与横杆的绑扎）
          if (i % 2 === 0) {
            tubeLine(rope, [[px, deckY + 0.95, z], [px + s * 0.06, deckY + 1.0, z + 0.12]],
              0.008, 3, [0.8, 0.7, 0.55]);
          }
        }
        dark.box.call(dark, m4(px, deckY + 1.0, (zStart + zEnd) / 2), 0.08, 0.08,
          zEnd - zStart, [1, 1, 1], 1.5);
        dark.box.call(dark, m4(px, deckY + 0.55, (zStart + zEnd) / 2), 0.07, 0.07,
          zEnd - zStart, [1, 1, 1], 1.5);
      }
      // ---- 台阶：四块踏步 + 两侧梯梁 + 扶手 ----
      const stepN = 4, stepRise = 0.14, z0Step = 2.55, run = 0.31;
      const stepTop = i => deckY - stepRise * (i + 1);
      // 甲板边缘的立板，封住第一级踏步和桥面之间的落差
      plank.box.call(plank, m4(X, deckY - 0.07, Z0 + 0.02), W * 0.9, 0.14, 0.05,
        [0.9, 0.84, 0.74], 1.2);
      for (let i = 0; i < stepN; i++) {
        const top = stepTop(i);
        const zc = z0Step + run * (i + 0.5);
        plank.box.call(plank, m4(X, gH(X, zc) + top - 0.035, zc), W * 0.9, 0.07, run,
          [1, 1, 1], 1.2);
        // 每级踏步内侧的立板：从下一级踏面顶到这一级踏面顶
        plank.box.call(plank, m4(X, gH(X, zc) + top - 0.07, zc + run / 2 - 0.025),
          W * 0.9, 0.14, 0.05, [0.9, 0.84, 0.74], 1.2);
      }
      const strAng = Math.atan2(deckY - 0.02, run * stepN);
      for (const s of [-1, 1]) {
        const px = X + s * (hw - 0.16);
        dark.box.call(dark, m4(px, 0.28, z0Step + run * stepN / 2, strAng, 0, 0),
          0.1, 0.18, run * stepN + 0.55, [1, 1, 1], 1.4);
        // 阶梯扶手：先立一根桥头柱，再接斜杆 + 中杆
        dark.cyl.call(dark, m4(px, deckY, Z0 - 0.04), 0.055, 0.045, 1.02, 5, [1, 1, 1], true);
        const pz = z0Step + run * stepN - 0.1;
        const py = gH(px, pz);
        dark.cyl.call(dark, m4(px, py, pz), 0.055, 0.045, 1.12, 5, [1, 1, 1], true);
        const railA = [px, deckY + 1.0, Z0 - 0.04];
        const railB = [px, py + 1.06, pz];
        tubeLine(dark, [railA, [(railA[0] + railB[0]) / 2, (railA[1] + railB[1]) / 2 + 0.02,
          (railA[2] + railB[2]) / 2], railB], 0.035, 4, [1, 1, 1]);
        tubeLine(dark, [railA.slice(), [railA[0], railA[1] - 0.42, railA[2]],
          [railB[0], railB[1] - 0.42, railB[2]]], 0.025, 4, [1, 1, 1]);
      }
      // 台阶脚下的木板，压住沙子
      for (let i = 0; i < 2; i++) {
        plank.box.call(plank, m4(X, 0.045, 3.65 + i * 0.3), W * 0.82, 0.07, 0.28,
          [0.9, 0.84, 0.74], 1.2);
      }
      // ---- 系船柱 + 缆圈 ----
      const bollards = [[X - 1.0, 1.2], [X + 1.0, -4.4], [X - 1.0, -11.0],
        [X + 1.0, -17.4], [X, -19.4]];
      for (const b of bollards) {
        dark.cyl.call(dark, m4(b[0], deckY, b[1]), 0.14, 0.115, 0.5, 6, [1, 1, 1], true);
        dark.sphere.call(dark, m4(b[0], deckY + 0.53, b[1], 0, 0, 0, 1, 0.7, 1), 0.15, 6, 4,
          [1, 1, 1]);
        rope.torus.call(rope, m4(b[0], deckY + 0.24, b[1]), 0.19, 0.018, 10, 3,
          [0.85, 0.72, 0.55]);
        rope.torus.call(rope, m4(b[0], deckY + 0.31, b[1]), 0.16, 0.016, 10, 3,
          [0.8, 0.68, 0.5]);
      }
      // ---- 码头灯：立杆 + 横臂，灯笼挂在臂下 ----
      const ez = Z1 + 0.55;
      dark.cyl.call(dark, m4(X, deckY, ez), 0.06, 0.05, 2.55, 5, [1, 1, 1], true);
      dark.cyl.call(dark, m4(X, deckY + 2.48, ez), 0.075, 0.06, 0.08, 6, [1, 1, 1], true);
      wood.box.call(wood, m4(X, deckY + 2.44, ez + 0.3), 0.07, 0.07, 0.66, [1, 1, 1], 1.2);
      tubeLine(dark, [[X, deckY + 2.05, ez], [X, deckY + 2.4, ez + 0.6]], 0.018, 3, [1, 1, 1]);
      lantern(X, deckY + 1.94, ez + 0.6, 1.15, [1, 1, 1], deckY + 2.47, true);
      campGlow(beamGlow, X, deckY + 1.9, ez + 0.6, 3.8, 4.6);
      // 中段灯：短杆 + 横臂
      const lz = -12.5, lx = X + 0.92;
      dark.cyl.call(dark, m4(lx, deckY, lz), 0.045, 0.038, 1.72, 5, [1, 1, 1], true);
      wood.box.call(wood, m4(lx, deckY + 1.66, lz + 0.22), 0.05, 0.05, 0.46, [1, 1, 1], 1.2);
      lantern(lx, deckY + 1.26, lz + 0.44, 0.9, [1, 1, 1], deckY + 1.64, true);
      // ---- 码头牌：两根柱子 + 横梁 + 吊牌 ----
      const dc = {
        text: "码头 · DOCK", w: 384, h: 96, bg: "#241a12", fg: "#ffe0aa", size: 40,
        lineH: 44, border: "#87602f", borderW: 5, glow: "rgba(255,200,120,.35)", glowBlur: 8
      };
      for (const s of [-1, 1]) {
        wood.cyl.call(wood, m4(X + s * 0.78, deckY, 2.0), 0.045, 0.036, 2.3, 5,
          [1, 1, 1], true);
      }
      wood.box.call(wood, m4(X, deckY + 2.24, 2.0), 1.72, 0.08, 0.09, [1, 1, 1], 1.3);
      addSignBoard("dock", dc, X, 2.42, 2.0, Math.PI, 1.5, 0.38);
      for (const s of [-1, 1]) {
        tubeLine(rope, [[X + s * 0.55, 2.61, 2.0], [X + s * 0.55, 2.92, 2.0]], 0.008, 3,
          [1, 1, 1]);
      }
      // ---- 甲板杂物：箱子 / 桶 / 缆圈 / 渔网 ----
      crateAt(X + 0.82, deckY, -0.5, 0.4, 0.3, [0.9, 0.85, 0.75]);
      crateAt(X + 0.78, deckY + 0.42, -0.55, 0.32, -0.2, [0.86, 0.8, 0.7]);
      barrelAt(X - 0.72, -8.2, 0.82, 0.4, deckY);
      sackAt(X - 0.75, -8.75, 0.9, 0.6, [0.82, 0.74, 0.6], deckY);
      rope.torus.call(rope, m4(X - 0.9, deckY + 0.04, -2.1), 0.26, 0.035, 12, 3,
        [0.9, 0.78, 0.6]);
      rope.torus.call(rope, m4(X - 0.88, deckY + 0.1, -2.1), 0.2, 0.03, 12, 3,
        [0.85, 0.72, 0.55]);
      clay.cyl.call(clay, m4(X + 0.95, deckY, -9.6), 0.16, 0.2, 0.3, 8, [0.7, 0.64, 0.5], true);
      // ---- 水面浮标 + 尾缆 ----
      const buoy = [X + 3.1, Z1 + 3.4];
      clay.sphere.call(clay, m4(buoy[0], -0.42, buoy[1], 0, 0.4, 0, 1.3, 0.8, 1.3), 0.22,
        6, 4, [1.15, 0.72, 0.45]);
      tubeLine(rope, [[X, deckY + 0.15, Z1 + 0.15], [X + 1.0, -0.1, Z1 + 1.0],
        [buoy[0], -0.36, buoy[1]]], 0.018, 3, [1, 1, 1]);

      // ---- 三条渔船（会晃）：绳 / 浮标都跟着船体走 ----
      const toLocal = (px, py, pz, bx, by, bz, bry) => {
        const c = Math.cos(bry), s = Math.sin(bry);
        const dx = px - bx, dy = py - by, dz = pz - bz;
        return [c * dx - s * dz, dy, s * dx + c * dz];
      };
      const boats = [
        { x: -10.4, z: -5.6, ry: Math.PI + 0.16, ph: 0.3, cleat: [X - 1.0, -4.4],
          buoy: [-12.6, -7.5] },
        { x: -10.9, z: -12.4, ry: Math.PI - 0.12, ph: 2.2, cleat: [X - 1.0, -11.0],
          buoy: [-13.0, -14.4] },
        { x: -11.5, z: -18.6, ry: Math.PI + 0.2, ph: 4.1, cleat: [X - 1.0, -17.4],
          buoy: [-13.6, -20.6] }
      ];
      boats.forEach((b, i) => {
        const bx = b.x, bz = b.z, bry = b.ry, ph = b.ph;
        const body = dyno(T.woodDark(), { tint: [1.55, 1.22, 0.95], spec: 0.3, rim: 0.3 },
          t => m4(bx + Math.sin(t * 0.4 + ph) * 0.05, -0.75 + Math.sin(t * 0.8 + ph) * 0.06,
            bz, Math.sin(t * 0.7 + ph) * 0.02, bry + Math.sin(t * 0.5 + ph) * 0.025,
            Math.sin(t * 0.9 + ph) * 0.018));
        // 船壳 / 舷板 / 船头船尾收尖
        body.box.call(body, m4(0, 0.35, 0), 1.1, 0.5, 2.9, [1, 1, 1], 1.3);
        for (const s of [-1, 1]) {
          body.box.call(body, m4(s * 0.55, 0.58, 0), 0.08, 0.1, 2.75, [0.9, 0.8, 0.68], 1.3);
          quadP(body, M.ident(), [s * 0.55, 0.6, 1.42], [s * 0.05, 0.55, 2.05],
            [s * 0.05, 0.1, 2.05], [s * 0.55, 0.15, 1.42], [0.9, 0.82, 0.7]);
          quadP(body, M.ident(), [s * 0.55, 0.6, -1.42], [s * 0.05, 0.55, -1.85],
            [s * 0.05, 0.1, -1.85], [s * 0.55, 0.15, -1.42], [0.85, 0.78, 0.68]);
        }
        body.box.call(body, m4(0, 0.62, -0.2), 1.24, 0.1, 2.3, [0.9, 0.82, 0.72], 1.2);
        // 船底 / 座板 / 舱口
        body.box.call(body, m4(0, 0.18, 0), 0.9, 0.08, 2.2, [0.7, 0.62, 0.5], 1.2);
        for (const bz2 of [-0.75, 0.35]) {
          body.box.call(body, m4(0, 0.72, bz2), 1.0, 0.06, 0.28, [1.05, 0.95, 0.82], 1.2);
        }
        body.box.call(body, m4(0, 0.82, -0.95), 0.82, 0.32, 0.75, [1.02, 0.94, 0.82], 1.2);
        // 桅杆 / 帆桁 / 卷起的帆 / 缆绳
        body.cyl.call(body, m4(0.06, 0.66, 0.45), 0.055, 0.04, 2.7, 6, [1, 1, 1], true);
        body.box.call(body, m4(0.06, 2.45, 0.45), 1.35, 0.06, 0.06, [1, 1, 1], 1.2);
        body.box.call(body, m4(0.06, 2.15, 0.45), 1.15, 0.18, 0.12, [1.6, 1.45, 1.2], 1.2);
        body.tube.call(body, [[0.06, 3.36, 0.45], [0, 0.62, 1.55]], 0.012, 3, [1, 1, 1]);
        body.tube.call(body, [[0.06, 3.36, 0.45], [0, 0.62, -1.4]], 0.012, 3, [1, 1, 1]);
        // 桅顶灯座 / 舷灯座（跟着船晃，灯泡在静态笔里）
        body.box.call(body, m4(0.06, 3.3, 0.45), 0.12, 0.16, 0.12, [1, 1, 1], 1.2);
        for (const sg of [-1, 1]) {
          body.box.call(body, m4(sg * 0.55, 0.62, 1.15), 0.1, 0.12, 0.1, [1, 1, 1], 1.2);
        }
        // 系船绳：从船尾到码头系船柱（局部坐标）
        const cleatLocal = toLocal(b.cleat[0], Y + 0.5, b.cleat[1], bx, -0.75, bz, bry);
        body.tube.call(body, [[0.3, 0.6, -1.25],
          [(0.3 + cleatLocal[0]) / 2, (0.6 + cleatLocal[1]) / 2 - 0.05,
            (-1.25 + cleatLocal[2]) / 2], cleatLocal], 0.02, 3, [1, 1, 1]);
        // 首缆：从船头垂到水面浮标
        const buoyLocal = toLocal(b.buoy[0], -0.42, b.buoy[1], bx, -0.75, bz, bry);
        body.tube.call(body, [[0, 0.62, 1.5],
          [(buoyLocal[0] + 0) / 2, (0.62 + buoyLocal[1]) / 2 - 0.12, (1.5 + buoyLocal[2]) / 2],
          buoyLocal], 0.017, 3, [1, 1, 1]);
        // 静态浮标 + 灯
        clay.sphere.call(clay, m4(b.buoy[0], -0.42, b.buoy[1], 0, bry, 0, 1.2, 0.85, 1.2),
          0.2, 6, 4, [1.1, 0.7, 0.42]);
        bulb.sphere.call(bulb, m4(b.buoy[0], -0.24, b.buoy[1]), 0.035, 4, 3, [0.7, 0.9, 1.3]);
        campGlow(coolGlow, b.buoy[0], -0.24, b.buoy[1], 0.7, 0.7);
        // 桅顶灯（静态，落在灯座里）
        const mx = bx + Math.cos(bry) * 0.06 + Math.sin(bry) * 0.45;
        const mz = bz - Math.sin(bry) * 0.06 + Math.cos(bry) * 0.45;
        bulb.sphere.call(bulb, m4(mx, 2.56, mz), 0.055, 5, 3, [1, 1, 1]);
        campGlow(lampGlow, mx, 2.56, mz, 1.1, 1.1);
        // 舷灯：左红右绿
        for (const sg of [-1, 1]) {
          const lx = bx + Math.cos(bry) * sg * 0.55 + Math.sin(bry) * 1.15;
          const lz = bz - Math.sin(bry) * sg * 0.55 + Math.cos(bry) * 1.15;
          bulb.sphere.call(bulb, m4(lx, -0.12, lz), 0.04, 4, 3,
            sg > 0 ? [1.6, 0.25, 0.2] : [0.25, 1.5, 0.35]);
          campGlow(sg > 0 ? fireGlow : coolGlow, lx, -0.12, lz, 0.5, 0.5);
        }
        if (i === 0) {
          coolGlow.quad.call(coolGlow, m4(bx - 0.1, -0.45, bz + 1.9), 0.9, 0.6,
            [1, 1, 1], [0, 0, 1, 1]);
        }
      });
      // 码头边挂着防撞的旧轮胎 / 浮球
      for (const fz of [-4.8, -11.2, -17.8]) {
        tubeLine(rope, [[X - hw - 0.12, deckY + 0.82, fz], [X - hw - 0.2, 0.12, fz]],
          0.01, 3, [1, 1, 1]);
        clay.sphere.call(clay, m4(X - hw - 0.2, 0.0, fz, 0, 0, 0, 1.0, 1.15, 1.0), 0.17,
          6, 4, [0.4, 0.38, 0.34]);
      }
    }
    buildDock();

    /* ============================================================
     *  点精灵：火星 / 烟 / 萤火尘埃 + 远处的暖光斑
     * ============================================================ */
    // 远处的暖光斑：只加发光面片，不动相机和灯光
    const depthSpots = [
      [-27.5, 1.6, 25.5, 5.2, 3.4], [-14.0, 1.9, 27.5, 4.6, 3.0],
      [2.0, 2.2, 28.5, 5.0, 3.2], [17.0, 1.8, 26.0, 4.4, 2.8],
      [26.5, 1.7, 22.5, 4.0, 2.6], [-19.0, 1.5, 18.0, 3.4, 2.2],
      [8.0, 1.6, 22.0, 3.2, 2.0]
    ];
    depthSpots.forEach(d => campGlow(depthGlow, d[0], d[1], d[2], d[3], d[4]));
    campGlow(fireGlow, FIRE1[0], 1.2, FIRE1[1], 4.0, 3.0);
    campGlow(fireGlow, FIRE2[0], 1.1, FIRE2[1], 3.2, 2.4);
    campGlow(fireGlow, -24.5, 1.0, 28.5, 3.2, 2.4);

    const FIRE_POINTS = [FIRE0, FIRE1, FIRE2, [-24.5, 28.5], [13.6, 10.2], [9.4, 8.6]];
    const ptsFire = [];
    for (const f of FIRE_POINTS) {
      for (let i = 0; i < 26; i++) {
        ptsFire.push({
          x: f[0] + (r() - 0.5) * 0.8, y: 0.25 + r() * 0.6, z: f[1] + (r() - 0.5) * 0.8,
          r: 1, g: 0.42 + r() * 0.34, b: 0.1 + r() * 0.08, a: 0.45 + r() * 0.45,
          size: 0.018 + r() * 0.035, kind: 1, speed: 0.3 + r() * 0.6,
          phase: r() * TAU, wob: 0.12 + r() * 0.28
        });
      }
    }
    for (let i = 0; i < 110; i++) {
      ptsFire.push({
        x: -30 + r() * 62, y: 0.4 + r() * 3.4, z: 4 + r() * 30,
        r: 1, g: 0.78 + r() * 0.16, b: 0.4 + r() * 0.2, a: 0.14 + r() * 0.28,
        size: 0.012 + r() * 0.02, kind: 2, speed: 0.06 + r() * 0.14,
        phase: r() * TAU, wob: 0.3 + r() * 0.5
      });
    }
    points(ptsFire, { blend: "add", yMin: 0.05, yMax: 4.2, fogNear: 9, fogFar: 48 });

    const ptsSmoke = [];
    for (const f of [FIRE0, [13.6, 10.2], [9.4, 8.6], [14.8, 25.0], [-24.5, 28.5]]) {
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

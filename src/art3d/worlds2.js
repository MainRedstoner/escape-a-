/* ============================================================
 * Escape A÷ · src/art3d/worlds2.js —— 第二册 3D 场景
 *
 * 和 worlds.js 分开，是因为这两个场景属于「后面的章节」：
 *   github_street  GitHub 夜市（夜）
 *   nvidia         NVIDIA 机房
 * 剧情还没走到，但美术先按 PROMPTS.md 的描述建好，接上 bg id 就能用。
 * 另有 shit_mountain（屎山）独立场景，暂未接入剧情。
 * ============================================================ */
"use strict";

const A3DWorlds2 = (() => {
  const M = A3D.M, T = A3DTex.T, P = A3DProps;
  const rng = P.rng;
  const TAU = Math.PI * 2;
  const m4 = (x, y, z, rx, ry, rz, sx, sy, sz) => M.trs(x, y, z, rx, ry, rz, sx, sy, sz);
  function Gbox(b, x, y, z, sx, sy, sz, col) {
    b.box.call(b, m4(x, y, z), sx, sy, sz, col, 1.2);
  }

  /* ============================================================
   *  GitHub 夜市
   * ============================================================ */
  /* ============================================================
   *  NVIDIA 机房
   * ============================================================ */
  function buildNvidia() {
    const st = P.stage();
    const r = rng(61);
    const Z0 = -22, Z1 = 6, RW = 9.0, RH = 3.8;

    const floor = st.pen("floor", T.tileFloor(), { tint: [1.2, 1.28, 1.35], spec: 0.8 });
    floor.grid.call(floor, m4(0, 0, (Z0 + Z1) / 2), RW, Z1 - Z0, 10, 24, [0.8, 0.84, 0.9], 0.5, 0.05, 0);
    const aisle = st.pen("aisle", T.darkMetal(), { tint: [0.55, 0.6, 0.65], spec: 1.0 });
    aisle.grid.call(aisle, m4(0, 0.004, (Z0 + Z1) / 2), 2.6, Z1 - Z0, 4, 20, [0.7, 0.75, 0.8], 0.6, 0.03, 0);

    const wall = st.pen("wall", T.darkMetal(), { tint: [0.5, 0.55, 0.6] });
    for (const sx of [-1, 1]) {
      wall.quad.call(wall, m4(sx * RW / 2, RH / 2, (Z0 + Z1) / 2, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0),
        Z1 - Z0, RH, [0.8, 0.84, 0.9], [0, 0, 12, 3]);
    }
    const ceil = st.pen("ceil", T.darkMetal(), { tint: [0.35, 0.4, 0.45] });
    ceil.grid.call(ceil, m4(0, RH, (Z0 + Z1) / 2, Math.PI, 0, 0), RW, Z1 - Z0, 6, 12, [0.6, 0.66, 0.72], 0.7, 0.05, 0);

    // 机柜
    const rackBody = st.pen("rackBody", T.darkMetal(), { tint: [1.1, 1.15, 1.2], spec: 0.5 });
    const rackPanel = st.pen("rackPanel", T.rackPanel(), { tint: [1.25, 1.3, 1.25], spec: 0.35 });
    const leds = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 20; i++) {
        const z = 3.4 - i * 1.32;
        const x = side * 3.35;
        const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        P.rack(rackBody, m4(x, 1.15, z, 0, ry, 0), 1.2, 2.3, 1.0);
        rackPanel.quad.call(rackPanel, m4(x - side * 0.505, 1.15, z, 0, ry, 0), 1.06, 2.18, [1, 1, 1], [0, 0, 1, 1]);
        for (let k = 0; k < 9; k++) {
          const ly = 0.3 + r() * 1.85;
          const lz = z + (r() - 0.5) * 0.9;
          const green = r() < 0.82;
          leds.push({
            x: x - side * 0.53, y: ly, z: lz,
            r: green ? 0.2 : 0.9, g: green ? 1.0 : 0.55, b: green ? 0.35 : 0.2,
            a: 0.6 + r() * 0.4, size: 0.024 + r() * 0.02,
            kind: 0, speed: 0, phase: r() * 9, wob: 0
          });
        }
      }
    }
    st.points.push({ mesh: A3D.pointMesh(leds), blend: "add", yMin: 0, yMax: 4, fogNear: 6, fogFar: 26 });

    // 绿色灯带
    const strip = st.pen("strip", T.glow(), { unlit: true, blend: "add", tint: [0.25, 1.0, 0.35], opacity: 0.3 });
    for (const sx of [-1, 1]) {
      strip.quad.call(strip, m4(sx * 2.55, 0.006, (Z0 + Z1) / 2, -Math.PI / 2, 0, 0), 0.12, Z1 - Z0, [1, 1, 1], [0, 0, 1, 20]);
    }

    // 顶部桥架与管道
    const tray = st.pen("tray", T.rackPanel(), { tint: [0.6, 0.65, 0.7], spec: 0.4 });
    for (const sx of [-1, 1]) {
      Gbox(tray, sx * 2.1, RH - 0.35, (Z0 + Z1) / 2, 0.6, 0.14, Z1 - Z0, [1, 1, 1]);
      const cable = st.pen("cable", null, { tint: [0.1, 0.12, 0.14] });
      for (let k = 0; k < 3; k++) {
        cable.tube.call(cable, M.ident(), [
          [sx * (1.9 + k * 0.2), RH - 0.2, Z1], [sx * (1.9 + k * 0.2), RH - 0.24, 0], [sx * (1.9 + k * 0.2), RH - 0.2, Z0]
        ], 0.025, 4, [1, 1, 1]);
      }
    }
    const pipe = st.pen("pipe", T.metal(), { tint: [0.65, 0.7, 0.75], spec: 0.7 });
    for (const sx of [-1, 1]) {
      pipe.tube.call(pipe, M.ident(), [
        [sx * 3.9, RH - 0.5, Z1], [sx * 3.9, RH - 0.5, 0], [sx * 3.9, RH - 0.5, Z0]
      ], 0.11, 8, [1, 1, 1]);
    }
    for (let i = 0; i < 7; i++) {
      const z = 2 - i * 5;
      Gbox(tray, 0, RH - 0.16, z, 0.22, 0.12, 1.4, [1, 1, 1]);
      const lamp = st.pen("lampStrip", null, { unlit: true, blend: "add", tint: [0.75, 0.85, 1.0], opacity: 0.8 });
      lamp.quad.call(lamp, m4(0, RH - 0.24, z, Math.PI / 2, 0, 0), 0.16, 1.3, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 尽头：玻璃门 + 绿色招牌
    const endWall = st.pen("endWall", T.rackPanel(), { tint: [0.5, 0.55, 0.6] });
    endWall.quad.call(endWall, m4(0, RH / 2, Z0, 0, 0, 0), RW, RH, [0.8, 0.85, 0.9], [0, 0, 4, 2]);
    const doorGlow = st.pen("doorGlow", T.glow(), { unlit: true, blend: "add", tint: [0.3, 1.0, 0.4], opacity: 0.3 });
    doorGlow.quad.call(doorGlow, m4(0, 1.4, Z0 + 0.1), 2.6, 3.0, [1, 1, 1], [0, 0, 1, 1]);
    const nvTex = A3DTex.sign({
      text: "NVIDIA", w: 768, h: 200, bg: "#0b1207", fg: "#76b900", size: 104,
      border: "#2c3d18", borderW: 5, glow: "rgba(118,185,0,.55)", glowBlur: 26
    });
    const nvSign = st.pen("nvSign", nvTex, { unlit: true, tint: [1, 1, 1] });
    nvSign.quad.call(nvSign, m4(0, 3.05, Z0 + 0.05), 4.6, 1.2, [1, 1, 1], [0, 0, 1, 1]);
    const door = st.pen("door", T.glass(), { tint: [0.4, 0.8, 0.5], opacity: 0.22, blend: "alpha", spec: 0.8 });
    door.quad.call(door, m4(0, 1.35, Z0 + 0.06), 2.2, 2.7, [1, 1, 1], [0, 0, 1, 1]);

    // 风扇
    for (let i = 0; i < 3; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 2.2 - i * 6.6;
      const fan = st.dyno(null, { tint: [0.22, 0.24, 0.26], spec: 0.4 }, t => {
        const spin = t * (2.2 + (i % 3) * 0.7) + i;
        return M.mul(m4(side * 3.35 - side * 0.56, 1.9, z, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0),
          M.trs(0, 0, 0, spin, 0, 0));
      });
      for (let k = 0; k < 3; k++) {
        fan.box.call(fan, M.mul(M.trs(0, 0, 0, 0, 0, (k / 3) * TAU), M.trs(0.07, 0, 0, 0, 0, 0.5)),
          0.15, 0.03, 0.07, [1, 1, 1], 1);
      }
      fan.torus.call(fan, m4(0, 0, 0, 0, 0, 0), 0.15, 0.012, 16, 4, [0.3, 0.33, 0.36]);
    }

    // 气氛雾
    const haze = st.pen("haze", T.glow(), { unlit: true, blend: "alpha", tint: [0.35, 0.6, 0.45], opacity: 0.09 });
    for (let i = 0; i < 5; i++) {
      haze.quad.call(haze, m4(0, 1.1 + i * 0.35, -6 - i * 5, 0, 0, 0), 8, 2.4, [1, 1, 1], [0, 0, 1, 1]);
    }

    st.finish();
    st.finishGlows();
    return {
      cam: { eye: [0.15, 1.68, 5.0], target: [0, 1.5, -14], fov: 52 },
      sky: { mode: 0, top: [0.01, 0.02, 0.012], bot: [0.02, 0.04, 0.025], glow: [0.12, 0.3, 0.12], sun: [0.5, 0.5], horizon: 0.2 },
      lights: {
        sun: A3D.norm3([0.1, 0.5, 0.9]), sunCol: [0.3, 0.5, 0.34],
        skyCol: [0.18, 0.3, 0.2], groundCol: [0.12, 0.18, 0.14],
        fog: { col: [0.03, 0.07, 0.045], near: 8, far: 34 }, fogAmt: 0.6,
        points: [
          { pos: [0, 2.6, 0], col: [0.75, 1.0, 0.8], range: 14, inten: 1.3 },
          { pos: [0, 3.0, 2.0], col: [0.75, 0.85, 1.0], range: 18, inten: 1.2 },
          { pos: [0, 2.4, -8], col: [0.4, 1.0, 0.5], range: 13, inten: 1.1 },
          { pos: [0, 2.2, -16], col: [0.35, 0.95, 0.45], range: 13, inten: 1.1 },
          { pos: [0, 2.0, -21], col: [0.45, 1.0, 0.55], range: 13, inten: 1.8 }
        ]
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows,
      tone: [0.72, 0.95, 0.78],
      swayAmp: 0.2,
      update(t, sc) {
        const push = Math.min(5, t * 0.14);
        sc.cam.eye = [0.15 + Math.sin(t * 0.2) * 0.02, 1.68 + Math.sin(t * 0.3) * 0.008, 5.0 - push];
        sc.cam.target = [0, 1.5, -14 - push];
      }
    };
  }

  /* ============================================================
   *  屎山：堆积如山的遗留代码（独立场景，暂未接入剧情）
   * ============================================================ */
  /* ============================================================
   *  界面状态的安静底衬（chat / news 打开时，别露出一张占位卡）
   * ============================================================ */
  function buildUiBackdrop() {
    const r = rng(71);
    const pts = [];
    for (let i = 0; i < 90; i++) {
      pts.push({
        x: (r() - 0.5) * 14, y: r() * 6, z: -10 + r() * 6,
        r: 0.55, g: 0.7, b: 0.95, a: 0.06 + r() * 0.12,
        size: 0.01 + r() * 0.02, kind: 2, speed: 0.05 + r() * 0.1, phase: r() * TAU, wob: 0.1
      });
    }
    return {
      cam: { eye: [0, 1.6, 2.0], target: [0, 1.4, -6], fov: 45 },
      sky: { mode: 0, top: [0.012, 0.018, 0.03], bot: [0.03, 0.045, 0.07], glow: [0.05, 0.09, 0.14], sun: [0.4, 0.7], horizon: 0.4 },
      lights: { sun: [0, 1, 0], sunCol: [0, 0, 0], skyCol: [0.1, 0.13, 0.2], groundCol: [0.02, 0.03, 0.04] },
      batches: [], over: [], dyn: [], points: [{ mesh: A3D.pointMesh(pts), blend: "alpha", yMin: 0, yMax: 6, fogNear: 8, fogFar: 20 }],
      glows: [],
      tone: [0.7, 0.8, 0.95],
      update(t, sc) { sc.cam.eye = [Math.sin(t * 0.05) * 0.3, 1.6, 2.0]; }
    };
  }

  if (typeof window !== "undefined") {
    A3D.register("nvidia", buildNvidia);
    A3D.register("ui_backdrop", buildUiBackdrop);
  }

  return { buildNvidia, buildUiBackdrop };
})();

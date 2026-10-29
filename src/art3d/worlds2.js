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
  function buildGithub() {
    const st = P.stage();
    const r = rng(53);

    // 湿石板路
    const road = st.pen("road", T.paving(), { tint: [0.9, 0.95, 1.0], spec: 0.55 });
    road.grid.call(road, m4(0, 0, -6), 13, 34, 8, 18, [0.72, 0.74, 0.78], 0.42, 0.14, 0);
    const gutter = st.pen("gutter", T.darkMetal(), { tint: [0.5, 0.52, 0.55] });
    for (const sx of [-1, 1]) Gbox(gutter, sx * 5.4, 0.03, -6, 0.3, 0.06, 34, [1, 1, 1]);

    // 两侧楼房
    const bld = st.pen("bld", T.plasterWarm(), { tint: [1.0, 0.92, 0.9] });
    const bld2 = st.pen("bld2", T.plaster(), { tint: [0.9, 0.95, 1.05] });
    const winWarm = st.pen("winWarm", null, { unlit: true, tint: [1.0, 0.72, 0.38], blend: "add", opacity: 0.9 });
    const winCool = st.pen("winCool", null, { unlit: true, tint: [0.5, 0.7, 1.0], blend: "add", opacity: 0.8 });
    const winDark = st.pen("winDark", null, { unlit: true, tint: [0.05, 0.06, 0.09] });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = 2.5 - i * 6.4;
        const w = 5 + r() * 2, h = 5 + r() * 3.5, d = 5.5;
        const bx = side * (7.3 + r() * 0.8);
        Gbox(side > 0 ? bld : bld2, bx, h / 2, z, w, h, d, [1, 1, 1]);
        Gbox(gutter, bx - side * 0.2, h - 0.15, z, w + 0.5, 0.25, d + 0.4, [1.15, 1.1, 1.05]);
        const wx = bx - side * (w / 2 + 0.01);
        const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        for (let fy = 0; fy < 3; fy++) {
          for (let fz = 0; fz < 3; fz++) {
            const wy = 1.6 + fy * 1.4, wz = z - 1.8 + fz * 1.8;
            const lit = r();
            const pen = lit < 0.45 ? winWarm : lit < 0.7 ? winCool : winDark;
            pen.quad.call(pen, m4(wx, wy, wz, 0, ry, 0), 0.9, 0.9, [1, 1, 1], [0, 0, 1, 1]);
            Gbox(gutter, wx - side * 0.02, wy, wz, 0.05, 1.0, 1.0, [0.9, 0.88, 0.84]);
          }
        }
      }
    }

    // 摊位
    const stallWood = st.pen("stallWood", T.woodDark(), { tint: [1.0, 0.85, 0.68], spec: 0.2 });
    const clothA = st.pen("clothA", T.fabric(), { tint: [1.2, 0.55, 0.45] });
    const clothB = st.pen("clothB", T.fabric(), { tint: [0.55, 0.75, 0.9] });
    const clothC = st.pen("clothC", T.fabric(), { tint: [1.1, 0.9, 0.45] });
    const stallSpots = [
      [-3.7, -1.2, 1], [-3.6, -6.4, 1], [3.6, -3.6, -1], [3.7, -9.2, -1], [-3.5, -12.0, 1]
    ];
    stallSpots.forEach((sp, i) => {
      const m = m4(sp[0], 0, sp[1], 0, sp[2] > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      const cloth = [clothA, clothB, clothC][i % 3];
      P.stall(stallWood, cloth, m, 2.6, 1.4, [1, 1, 1], [0.3, 0.22, 0.16]);
      const goods = st.pen("goods" + i, T.metal(), { tint: [0.75, 0.8, 0.85], spec: 0.5 });
      for (let k = 0; k < 6; k++) {
        const gx = sp[0] + (sp[2] > 0 ? 0.35 : -0.35) + (r() - 0.5) * 0.3;
        const gz = sp[1] + (r() - 0.5) * 1.6;
        Gbox(goods, gx, 1.02 + (k % 2) * 0.08, gz, 0.16 + r() * 0.12, 0.12 + r() * 0.14, 0.16 + r() * 0.1, [1, 1, 1]);
      }
      P.figure(st.pen("vendor", T.fabric(), { tint: [0.2, 0.18, 0.2] }),
        m4(sp[0] + (sp[2] > 0 ? 0.85 : -0.85), 0, sp[1] + 0.4, 0, sp[2] > 0 ? -1.6 : 1.6, 0), [1, 1, 1], { h: 1.5 });
    });

    // 屎山 + 甲虫
    const junk = st.pen("junk", T.darkMetal(), { tint: [0.55, 0.5, 0.44] });
    const bagB = st.pen("bag", T.fabric(), { tint: [0.45, 0.5, 0.45] });
    P.garbagePile(junk, bagB, m4(2.65, 0, -5.2), 1.45, 11);
    P.garbagePile(junk, bagB, m4(-2.7, 0, -10.2), 1.25, 23);
    P.garbagePile(junk, bagB, m4(2.4, 0, -15.0), 1.1, 31);
    for (let i = 0; i < 14; i++) {
      const bx = 2.65 + (r() - 0.5) * 1.1, bz = -5.2 + (r() - 0.5) * 1.1;
      const rad = 0.2 + r() * 0.45, spd = 0.3 + r() * 0.6, ph = r() * TAU;
      const bd = st.dyno(null, { tint: [0.05, 0.06, 0.05] }, t => {
        const a = t * spd + ph;
        return M.trs(bx + Math.cos(a) * rad, 0.3 + Math.abs(Math.sin(a * 3)) * 0.6, bz + Math.sin(a) * rad,
          0, a, 0, 1, 1, 1);
      });
      bd.sphere.call(bd, m4(0, 0, 0, 0, 0, 0, 1.6, 0.7, 1), 0.035, 6, 4, [1, 1, 1]);
      bd.sphere.call(bd, m4(0, 0, 0.04, 0, 0, 0, 0.8, 0.6, 1), 0.02, 5, 3, [0.35, 0.3, 0.2]);
    }

    // 串灯 + 纸灯笼
    const pole = st.pen("pole", T.woodDark(), { tint: [0.7, 0.6, 0.5] });
    const wire = st.pen("wire", null, { tint: [0.1, 0.1, 0.1] });
    const lanternB = st.pen("lantern", T.canvasTex(), { tint: [1.2, 0.65, 0.4], emissive: [0.35, 0.16, 0.06] });
    const lanternGlow = st.pen("lanternGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.55, 0.28], opacity: 0.28 });
    for (let k = 0; k < 4; k++) {
      const z = 0.5 - k * 4.6;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const x = -5.5 + u * 11;
        const y = 3.4 - Math.sin(u * Math.PI) * 0.5;
        pts.push([x, y, z]);
        if (i > 0 && i < 12 && i % 2 === 0) {
          P.paperLantern(lanternB, pole, m4(x, y - 0.2, z, 0, 0, 0, 1, 1, 1), 0.13, [1, 1, 1]);
          lanternGlow.quad.call(lanternGlow, m4(x, y - 0.2, z + 0.05), 1.1, 1.1, [1, 1, 1], [0, 0, 1, 1]);
        }
      }
      wire.tube.call(wire, M.ident(), pts, 0.008, 4, [1, 1, 1]);
    }

    // 店招：每个摊位上方挂一块
    const repoNames = ["awesome-llm", "hello-world", "left-pad", "dotfiles", "tiny-gpt"];
    stallSpots.forEach((sp, i) => {
      const tex = A3DTex.sign({
        text: repoNames[i], w: 512, h: 128, bg: "#14181f", fg: "#d8e6f2", size: 50,
        border: "#3a4756", borderW: 4, glow: "rgba(140,200,255,.25)", glowBlur: 10
      });
      const sd = st.pen("shopSign" + i, tex, { unlit: true, tint: [1, 1, 1] });
      sd.quad.call(sd, m4(sp[0], 2.95, sp[1], 0, sp[2] > 0 ? Math.PI / 2 : -Math.PI / 2, 0), 1.9, 0.48, [1, 1, 1], [0, 0, 1, 1]);
    });
    // 街边木箱
    const crate = st.pen("crate", T.woodDark(), { tint: [0.95, 0.8, 0.65] });
    P.crate(crate, m4(-2.4, 0.22, -4.0, 0, 0.4, 0), 0.44, [0.6, 0.48, 0.34]);
    P.crate(crate, m4(-2.0, 0.16, -4.6, 0, 0.9, 0), 0.32, [0.55, 0.45, 0.32]);
    P.crate(crate, m4(2.2, 0.2, -7.6, 0, 1.4, 0), 0.4, [0.5, 0.42, 0.3]);

    // 街尾的门楼，别让街道尽头是一片虚空
    const endB = st.pen("endB", T.plasterWarm(), { tint: [0.85, 0.8, 0.8] });
    Gbox(endB, 0, 4.2, -23.5, 13, 8.4, 3.2, [1, 1, 1]);
    Gbox(gutter, 0, 8.3, -23.0, 14, 0.5, 3.6, [1.1, 1.05, 1.0]);
    // 门洞
    Gbox(winDark, 0, 2.0, -21.85, 4.2, 4.0, 0.1, [1, 1, 1]);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const wx = -4.5 + i * 3.0, wy = 4.2 + j * 1.3;
        (r() < 0.5 ? winWarm : winCool).quad.call(r() < 0.5 ? winWarm : winCool,
          m4(wx, wy, -21.9, 0, 0, 0), 0.8, 0.9, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    // 街尾的大招牌
    const bigSign = A3DTex.sign({
      text: "GITHUB", w: 768, h: 220, bg: "#0d1117", fg: "#e6edf3", size: 110,
      border: "#30363d", borderW: 6, glow: "rgba(120,200,255,.4)", glowBlur: 22
    });
    const signPen = st.pen("bigSign", bigSign, { unlit: true, tint: [1, 1, 1] });
    signPen.quad.call(signPen, m4(0, 6.1, -21.4), 7.0, 2.0, [1, 1, 1], [0, 0, 1, 1]);
    const signGlow = st.pen("signGlow", T.glow(), { unlit: true, blend: "add", tint: [0.3, 0.6, 1.0], opacity: 0.3 });
    signGlow.quad.call(signGlow, m4(0, 6.1, -20.4), 9, 3.4, [1, 1, 1], [0, 0, 1, 1]);
    for (const sx of [-3.2, 3.2]) {
      pole.cyl.call(pole, m4(sx, 0, -21.6), 0.12, 0.09, 5.6, 6, [1, 1, 1], true);
    }

    // 蒸汽
    const steam = st.pen("steam", T.glow(), { unlit: true, blend: "alpha", tint: [0.5, 0.55, 0.6], opacity: 0.1 });
    for (let i = 0; i < 4; i++) {
      steam.quad.call(steam, m4(-1.6 + i * 0.25, 0.6 + i * 0.5, -2.2, 0, 0, 0.2), 1.6, 1.6, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 漂浮的尘埃
    const pts = [];
    for (let i = 0; i < 180; i++) {
      pts.push({
        x: (r() - 0.5) * 12, y: 0.4 + r() * 4, z: -18 + r() * 24,
        r: 1.0, g: 0.72, b: 0.45, a: 0.25 + r() * 0.4,
        size: 0.01 + r() * 0.02, kind: 1, speed: 0.15 + r() * 0.3, phase: r() * TAU, wob: 0.1 + r() * 0.2
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "add", yMin: 0, yMax: 5, fogNear: 10, fogFar: 30 });

    st.finish();
    st.finishGlows();
    return {
      cam: { eye: [0.6, 1.62, 5.6], target: [-0.1, 1.35, -12], fov: 50 },
      sky: { mode: 2, top: [0.02, 0.025, 0.05], bot: [0.09, 0.08, 0.12], glow: [0.3, 0.25, 0.35], sun: [0.5, 0.9], horizon: 0.5 },
      lights: {
        sun: A3D.norm3([-0.2, 0.8, 0.5]), sunCol: [0.28, 0.3, 0.44],
        skyCol: [0.22, 0.24, 0.32], groundCol: [0.12, 0.1, 0.1],
        fog: { col: [0.06, 0.07, 0.1], near: 10, far: 38 }, fogAmt: 0.55,
        points: [
          { pos: [-3.2, 1.5, -1.2], col: [1.0, 0.62, 0.32], range: 11, inten: 2.2 },
          { pos: [3.2, 1.5, -3.6], col: [0.95, 0.66, 0.42], range: 11, inten: 2.0 },
          { pos: [-3.2, 1.5, -6.4], col: [1.0, 0.62, 0.32], range: 11, inten: 2.0 },
          { pos: [3.2, 1.5, -9.2], col: [0.8, 0.82, 1.0], range: 11, inten: 1.8 },
          { pos: [0, 3.2, -2.0], col: [0.4, 0.45, 0.6], range: 16, inten: 0.9 },
          { pos: [0, 6.1, -20.0], col: [0.35, 0.65, 1.0], range: 16, inten: 0.9 }
        ]
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows,
      tone: [1.0, 0.88, 0.78],
      swayAmp: 0.4,
      update(t, sc) {
        sc.cam.eye = [0.6 + Math.sin(t * 0.13) * 0.06, 1.62 + Math.sin(t * 0.21) * 0.012, 5.6 + Math.cos(t * 0.1) * 0.06];
      }
    };
  }

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
  function buildShitMountain() {
    const st = P.stage();
    const r = rng(97);
    const CX = 0, CZ = -12; // 山体中心

    // 地面：龟裂的污土
    const ground = st.pen("ground", T.dirt(), { tint: [0.85, 0.9, 0.7] });
    ground.grid.call(ground, m4(0, 0, -10), 34, 40, 12, 14, [0.5, 0.52, 0.42], 0.5, 0.1, 0);

    // 山的主体：一圈圈随机乱箱往上收分
    const junk = st.pen("junk", T.darkMetal(), { tint: [0.6, 0.58, 0.52] });
    const junkRust = st.pen("junkRust", T.metal(), { tint: [0.85, 0.6, 0.4], spec: 0.3 });
    const bagB = st.pen("bag", T.fabric(), { tint: [0.4, 0.46, 0.36] });
    const LAYERS = 18, BASE_R = 9.5, H = 9.5;
    for (let i = 0; i < LAYERS; i++) {
      const y = (i / LAYERS) * H;
      const rad = BASE_R * Math.sqrt(Math.max(0.02, 1 - i / LAYERS));
      const n = Math.max(3, Math.round(rad * 3.2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + r() * 0.5;
        const rr = rad * (0.55 + r() * 0.45);
        const s = 0.5 + r() * 1.1 * (1 - i / LAYERS * 0.5);
        const grey = 0.13 + r() * 0.2;
        const pen = r() < 0.22 ? junkRust : junk;
        Gbox(pen, CX + Math.cos(a) * rr, y + s * 0.3, CZ + Math.sin(a) * rr * 0.8,
          s * (0.7 + r() * 0.7), s * (0.5 + r() * 0.6), s * (0.7 + r() * 0.7),
          [grey, grey * (0.9 + r() * 0.25), grey * 0.85]);
      }
    }
    // 山脚的垃圾堆群
    P.garbagePile(junk, bagB, m4(-7.5, 0, -6.5), 1.8, 7);
    P.garbagePile(junk, bagB, m4(7.8, 0, -7.5), 1.6, 19);
    P.garbagePile(junk, bagB, m4(-4.5, 0, -3.0), 1.1, 33);
    P.garbagePile(junk, bagB, m4(4.8, 0, -2.6), 1.0, 45);

    // 挂满山坡的旧屏幕：全是祖传注释
    const screenNotes = ["TODO", "FIXME", "HACK", "DO NOT TOUCH", "tmp_final_v2.js", "works on my machine", "谁写的？我写的。"];
    screenNotes.forEach((txt, i) => {
      const tex = A3DTex.sign({
        text: txt, w: 512, h: 128, bg: "#0c0f0a", fg: i % 2 ? "#9fd44a" : "#d8c25a",
        size: 46, border: "#232b18", borderW: 4, glow: "rgba(160,220,80,.35)", glowBlur: 12
      });
      const a = -0.9 + i * 0.3; // 只挂朝镜头这面的山坡
      const rr = BASE_R * (0.45 + r() * 0.35);
      const x = CX + Math.sin(a) * rr, z = CZ + Math.cos(a) * rr * 0.8;
      const y = 1.2 + r() * (H * 0.55);
      Gbox(junk, x, y, z - 0.06, 1.5, 0.9, 0.1, [0.08, 0.09, 0.08]);
      const sp = st.pen("note" + i, tex, { unlit: true, tint: [1, 1, 1] });
      sp.quad.call(sp, m4(x, y, z + 0.01), 1.4, 0.35, [1, 1, 1], [0, 0, 1, 1]);
    });

    // 佛祖：结跏趺坐在山旁，鎏金青铜，背后一轮背光
    const gold = st.pen("buddha", T.brass(), { tint: [1.15, 0.95, 0.55], spec: 0.55 });
    const haloG = st.pen("halo", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.85, 0.4], opacity: 0.35 });
    const BX = -7.6, BZ = -3.6;
    // 莲台（两层圆座）
    gold.cyl.call(gold, m4(BX, 0.25, BZ), 1.5, 1.7, 0.5, 12, [0.85, 0.8, 0.75], true);
    gold.cyl.call(gold, m4(BX, 0.62, BZ), 1.2, 1.4, 0.35, 12, [1, 1, 1], true);
    // 结跏趺坐的双腿
    Gbox(gold, BX, 1.05, BZ + 0.12, 1.7, 0.45, 0.95, [1.05, 0.9, 0.6]);
    Gbox(gold, BX - 0.55, 1.2, BZ + 0.3, 0.72, 0.34, 0.55, [0.95, 0.82, 0.55]);
    Gbox(gold, BX + 0.55, 1.2, BZ + 0.3, 0.72, 0.34, 0.55, [0.95, 0.82, 0.55]);
    // 身、肩
    Gbox(gold, BX, 1.88, BZ, 1.05, 1.15, 0.65, [1.1, 0.95, 0.6]);
    Gbox(gold, BX, 2.52, BZ, 1.35, 0.35, 0.62, [1.05, 0.9, 0.58]);
    // 双臂垂到膝上，手在腿前结印
    Gbox(gold, BX - 0.64, 1.95, BZ + 0.08, 0.28, 0.95, 0.3, [0.98, 0.84, 0.55]);
    Gbox(gold, BX + 0.64, 1.95, BZ + 0.08, 0.28, 0.95, 0.3, [0.98, 0.84, 0.55]);
    gold.sphere.call(gold, m4(BX, 1.34, BZ + 0.44), 0.2, 8, 6, [1.1, 0.95, 0.62]);
    // 头、肉髻、长耳垂
    gold.sphere.call(gold, m4(BX, 3.0, BZ), 0.42, 10, 8, [1.08, 0.92, 0.6]);
    gold.sphere.call(gold, m4(BX, 3.4, BZ), 0.14, 6, 5, [1.1, 0.95, 0.62]);
    Gbox(gold, BX - 0.42, 2.82, BZ, 0.1, 0.32, 0.12, [1.0, 0.86, 0.56]);
    Gbox(gold, BX + 0.42, 2.82, BZ, 0.1, 0.32, 0.12, [1.0, 0.86, 0.56]);
    // 背光圆盘
    haloG.quad.call(haloG, m4(BX, 2.95, BZ - 0.6), 2.8, 2.8, [1, 1, 1], [0, 0, 1, 1]);

    // 山脚的醒目警告牌：禁止重构
    const warnTex = A3DTex.sign({
      text: "⚠ 警告：屎山高危 ⚠\n禁止重构 · 后果自负", w: 768, h: 256, bg: "#8a0f0f", fg: "#ffe9c9",
      size: 62, lineH: 96, border: "#ffd23e", borderW: 10, glow: "rgba(255,60,30,.6)", glowBlur: 24
    });
    Gbox(junk, -2.1, 0.9, -2.9, 0.14, 1.8, 0.14, [0.6, 0.55, 0.5]);
    Gbox(junk, 2.1, 0.9, -2.9, 0.14, 1.8, 0.14, [0.6, 0.55, 0.5]);
    const warn = st.pen("warn", warnTex, { unlit: true, tint: [1, 1, 1] });
    warn.quad.call(warn, m4(0, 2.15, -2.9), 4.6, 1.55, [1, 1, 1], [0, 0, 1, 1]);
    const warnGlow = st.pen("warnGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.25, 0.1], opacity: 0.3 });
    warnGlow.quad.call(warnGlow, m4(0, 2.15, -2.75), 5.6, 2.3, [1, 1, 1], [0, 0, 1, 1]);

    // 意大利面条电缆：从山顶一路拖到山脚
    const cable = st.pen("cable", null, { tint: [0.16, 0.15, 0.12] });
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

    // 甲虫：山脚平地 + 山坡两拨，绕着爬的 bug（字面意义）
    for (let i = 0; i < 36; i++) {
      const onSlope = i >= 22;
      const bx = CX + (r() - 0.5) * BASE_R * (onSlope ? 1.1 : 1.6);
      const bz = CZ + (r() - 0.5) * BASE_R * (onSlope ? 0.85 : 1.0);
      const baseY = onSlope ? 1.2 + r() * 3.6 : 0.25;
      const rad = 0.4 + r() * 1.1, spd = 0.25 + r() * 0.6, ph = r() * TAU;
      const bd = st.dyno(null, { tint: [0.06, 0.07, 0.04] }, t => {
        const a = t * spd + ph;
        return M.trs(bx + Math.cos(a) * rad, baseY + Math.abs(Math.sin(a * 3)) * 0.6, bz + Math.sin(a) * rad,
          0, a, 0, 1, 1, 1);
      });
      bd.sphere.call(bd, m4(0, 0, 0, 0, 0, 0, 1.6, 0.7, 1), 0.05, 6, 4, [1, 1, 1]);
      bd.sphere.call(bd, m4(0, 0, 0.06, 0, 0, 0, 0.8, 0.6, 1), 0.03, 5, 3, [0.4, 0.34, 0.2]);
    }

    // 臭气团：绿幽幽的半透明雾块慢慢飘
    const stink = st.pen("stink", T.glow(), { unlit: true, blend: "alpha", tint: [0.55, 0.75, 0.3], opacity: 0.1 });
    for (let i = 0; i < 7; i++) {
      const sx = CX + (r() - 0.5) * 14, sy = 1 + r() * 6, sz = CZ + (r() - 0.5) * 10;
      const d = st.dyno(T.glow(), { unlit: true, blend: "alpha", tint: [0.55, 0.75, 0.3], opacity: 0.09 }, t =>
        M.trs(sx + Math.sin(t * 0.2 + i) * 0.5, sy + Math.sin(t * 0.15 + i * 2) * 0.3, sz, 0, 0, 0, 1, 1, 1));
      d.quad.call(d, m4(0, 0, 0, 0, 0, i), 2.6 + r() * 1.5, 2.0 + r() * 1.2, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 静态的也补几团，凑厚度
    for (let i = 0; i < 5; i++) {
      stink.quad.call(stink, m4(CX + (r() - 0.5) * 12, 0.8 + r() * 5, CZ + (r() - 0.5) * 9, 0, 0, r() * 3), 3.0, 2.4, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 烧垃圾的铁桶：山脚两点火光
    const barrel = st.pen("barrel", T.darkMetal(), { tint: [0.5, 0.3, 0.2], spec: 0.3 });
    const fire = st.pen("fire", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.5, 0.15], opacity: 0.35 });
    for (const bx of [-5.5, 6.0]) {
      barrel.cyl.call(barrel, m4(bx, 0.45, -4.5), 0.34, 0.38, 0.9, 10, [1, 1, 1], true);
      fire.quad.call(fire, m4(bx, 1.05, -4.5), 0.9, 1.2, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 苍蝇：绕山乱窜的黑点
    const flies = [];
    for (let i = 0; i < 120; i++) {
      flies.push({
        x: CX + (r() - 0.5) * 16, y: 0.5 + r() * 8, z: CZ + (r() - 0.5) * 12,
        r: 0.1, g: 0.09, b: 0.06, a: 0.4 + r() * 0.4,
        size: 0.012 + r() * 0.02, kind: 1, speed: 0.6 + r() * 0.9, phase: r() * TAU, wob: 0.3 + r() * 0.4
      });
    }
    st.points.push({ mesh: A3D.pointMesh(flies), blend: "alpha", yMin: 0, yMax: 10, fogNear: 10, fogFar: 34 });

    st.finish();
    st.finishGlows();
    return {
      cam: { eye: [0.4, 1.7, 7.5], target: [0, 3.2, -11], fov: 52 },
      sky: { mode: 2, top: [0.03, 0.04, 0.02], bot: [0.14, 0.15, 0.08], glow: [0.4, 0.45, 0.2], sun: [0.5, 0.85], horizon: 0.55 },
      lights: {
        sun: A3D.norm3([-0.3, 0.7, 0.6]), sunCol: [0.4, 0.42, 0.3],
        skyCol: [0.24, 0.26, 0.16], groundCol: [0.14, 0.12, 0.08],
        fog: { col: [0.1, 0.11, 0.06], near: 12, far: 42 }, fogAmt: 0.5,
        points: [
          { pos: [-5.5, 1.2, -4.5], col: [1.0, 0.55, 0.2], range: 9, inten: 2.0 },
          { pos: [6.0, 1.2, -4.5], col: [1.0, 0.55, 0.2], range: 9, inten: 2.0 },
          { pos: [0, H + 1.5, CZ + 1], col: [0.7, 0.9, 0.3], range: 14, inten: 1.4 },
          { pos: [-7.6, 3.0, -2.6], col: [1.0, 0.85, 0.5], range: 9, inten: 1.6 },
          { pos: [0, 2.0, -6], col: [0.5, 0.6, 0.3], range: 12, inten: 0.8 }
        ]
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows,
      tone: [0.95, 1.0, 0.72],
      swayAmp: 0.35,
      update(t, sc) {
        sc.cam.eye = [0.4 + Math.sin(t * 0.11) * 0.08, 1.7 + Math.sin(t * 0.19) * 0.015, 7.5 + Math.cos(t * 0.09) * 0.08];
      }
    };
  }

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
    A3D.register("github_street", buildGithub);
    A3D.register("nvidia", buildNvidia);
    A3D.register("shit_mountain", buildShitMountain);
    A3D.register("ui_backdrop", buildUiBackdrop);
  }

  return { buildGithub, buildNvidia, buildShitMountain, buildUiBackdrop };
})();

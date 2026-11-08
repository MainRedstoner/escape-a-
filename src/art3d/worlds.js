/* ============================================================
 * Escape A÷ · src/art3d/worlds.js —— 3D 场景
 *
 * 每个场景都注册到 A3D：A3D.register(id, builder)。
 * 场景返回 { cam, sky, lights, batches, over, dyn, points, glows, sea, tone, update }。
 *
 * 目前已经接上的地方：
 *   ds_room        DeepSeek 家里（窗外的深海、训练日志、白板曲线；靠墙那张桌子给小克留着）
 *   ds_room_night  同一间屋子，深夜
 *   （教堂正门已经迁到 src/art3d/world.js 的大世界视角：world_church / world_church_403）
 *   claude_lib     Claude 家里的藏书室（DeepSeek 上门上课的那间）：四面书架、菊花、夕阳
 *   hf_camp        Hugging Face 海边营地（夜）
 *   github_street  GitHub 夜市（夜）
 *   nvidia         NVIDIA 机房
 * ============================================================ */
"use strict";

const A3DWorlds = (() => {
  const M = A3D.M, T = A3DTex.T, P = A3DProps;
  const rng = P.rng, mix = P.mix;
  const TAU = Math.PI * 2;

  const m4 = (x, y, z, rx, ry, rz, sx, sy, sz) => M.trs(x, y, z, rx, ry, rz, sx, sy, sz);

  /* ============================================================
   *  共用小零件
   * ============================================================ */
  let fishMeshCache = null;
  function fishMesh() {
    if (fishMeshCache) return fishMeshCache;
    const b = new A3D.Builder();
    const nm = A3D.M.normalMat(M.ident());
    /* 身体：沿 +X 的椭截面放样，前后收细，略微侧扁 */
    const rings = 11, seg = 9;
    const P = (i, k) => {
      const t = i / (rings - 1);                    // 0 尾 → 1 头
      const x = -0.56 + t * 1.12;
      const shape = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)), 0.5);
      const ry = 0.2 * shape * (0.68 + 0.5 * t) + 0.006;
      const rz = ry * 0.66;
      const a = (k / seg) * TAU;
      return [x, Math.cos(a) * ry, Math.sin(a) * rz];
    };
    for (let i = 0; i < rings - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const k2 = (k + 1) % seg;
        const q = [P(i, k), P(i + 1, k), P(i + 1, k2), P(i, k2)];
        const uv = [[i / rings, k / seg], [(i + 1) / rings, k / seg], [(i + 1) / rings, (k + 1) / seg], [i / rings, (k + 1) / seg]];
        for (let z = 0; z < 4; z++) {
          const p = q[z];
          const n = A3D.norm3([p[1] * 0.4, p[1], p[2] * 1.3]);
          const shade = 0.72 + 0.3 * (1 - (p[1] / 0.22 + 1) * 0.5);
          b._v(b.d, M.ident(), nm, p[0], p[1], p[2], n[0], n[1], n[2], uv[z][0], uv[z][1], [shade, shade, shade], 0);
        }
        b._pushQuad(b.count - 4);
      }
    }
    // 尾柄 + 分叉尾鳍
    b.tri(M.ident(), [-0.54, 0.03, 0], [-0.74, 0.34, 0], [-0.62, 0, 0], null, [0.86, 0.9, 0.94]);
    b.tri(M.ident(), [-0.54, -0.03, 0], [-0.62, 0, 0], [-0.74, -0.32, 0], null, [0.8, 0.86, 0.9]);
    b.tri(M.ident(), [-0.52, 0, 0], [-0.74, 0.34, 0], [-0.54, 0.03, 0], null, [0.9, 0.94, 0.98]);
    // 背鳍
    b.tri(M.ident(), [-0.16, 0.14, 0], [0.02, 0.32, 0], [0.14, 0.13, 0], null, [0.92, 0.95, 0.98]);
    // 胸鳍
    b.tri(M.ident(), [0.06, -0.09, 0.09], [0.22, -0.02, 0.2], [0.22, -0.1, 0.1], null, [0.85, 0.9, 0.94]);
    b.tri(M.ident(), [0.06, -0.09, -0.09], [0.22, -0.02, -0.2], [0.22, -0.1, -0.1], null, [0.85, 0.9, 0.94]);
    // 眼睛
    b.sphere(M.trs(0.42, 0.035, 0.085, 0, 0, 0, 0.7, 1, 0.7), 0.028, 6, 4, [0.12, 0.14, 0.2]);
    b.sphere(M.trs(0.42, 0.035, -0.085, 0, 0, 0, 0.7, 1, 0.7), 0.028, 6, 4, [0.12, 0.14, 0.2]);
    fishMeshCache = A3D.meshFrom(b);
    return fishMeshCache;
  }

  /** 通用：海底 / 背景里的礁石剪影 */
  function rocks(b, m, n, spread, seed, col) {
    const r = rng(seed || 7);
    for (let i = 0; i < n; i++) {
      const s = 0.6 + r() * 2.2;
      b.sphere.call(b, M.mul(m, M.trs((r() - 0.5) * spread, r() * s * 0.3, (r() - 0.5) * spread * 0.4,
        r(), r() * TAU, r(), s, s * (0.4 + r() * 0.5), s)), 1, 8, 6, col, 0);
    }
  }

  /* ============================================================
   *  DeepSeek 家里
   * ============================================================ */
  const MON = {
    lines: [
      "$ python train.py --config v410-flash.yaml",
      "[12:04:02] gpu 0  mem 61.2G / 80G  util 97%",
      "[12:04:05] step 18320  loss 0.4217  lr 2.4e-5",
      "[12:04:09] grad_norm 0.83  tokens/s 42.1k",
      "[12:04:14] eval: mmlu 71.2  gsm8k 83.4  human_eval 51.0",
      "[12:04:21] checkpoint saved -> ckpt/step_18320",
      "[12:04:27] step 18321  loss 0.4198  lr 2.4e-5",
      "[12:04:31] waiting for dataloader …",
      "[12:04:33] step 18322  loss 0.4203  lr 2.4e-5",
      "[12:04:40] allreduce avg 1.24ms  overlap 88%",
      "[12:04:44] step 18323  loss 0.4181  lr 2.4e-5",
      "[12:04:49] loss 会收敛的。"
    ],
    x: 0, t0: 0, lastDraw: 0, loss: [], log: [], lastTick: -1, lastStage: -1
  };
  function drawTerm(x, w, h) {
    const now = performance.now() / 1000;
    // 暗棕底 + 暖橙 Claude Code 欢迎屏
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#21120b"); g.addColorStop(0.55, "#1a0e09"); g.addColorStop(1, "#120a07");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(255,190,130,.035)";
    x.beginPath(); x.moveTo(w * 0.15, 0); x.lineTo(w * 0.55, 0); x.lineTo(w * 0.2, h); x.lineTo(0, h); x.fill();
    x.fillStyle = "#D97757"; x.font = "bold 16px ui-monospace,Consolas,monospace";
    x.fillText("✻ Welcome to Claude Code", 18, 38);
    const lines = [
      ["> cat notes.md", "#E8D5C0"],
      ["", ""],
      ["- 小鲸说：先想，再答", "#E8D5C0"],
      ["- 想错了就回头", "#E8D5C0"],
      ["", ""],
      ["$", "#D97757"]
    ];
    x.font = "14px ui-monospace,Consolas,monospace";
    lines.forEach((ln, i) => {
      if (!ln[0]) return;
      x.fillStyle = ln[1];
      x.fillText(ln[0], 18, 76 + i * 26);
    });
    // 动态块光标
    if ((now % 1.1) < 0.55) {
      x.fillStyle = "#F0C9A8"; x.fillRect(40, 76 + 5 * 26 - 12, 8, 15);
    }
    x.fillStyle = "rgba(0,0,0,.18)";
    for (let i = 0; i < 5; i++) x.fillRect(0, h - 40 + i * 8, w, 1);
  }

  function drawMonitor(x, w, h) {
    const now = performance.now() / 1000;
    x.fillStyle = "#070d12"; x.fillRect(0, 0, w, h);
    // 顶栏
    x.fillStyle = "#0d1a22"; x.fillRect(0, 0, w, 30);
    x.fillStyle = "#4fa3c7"; x.font = "bold 15px Consolas,monospace";
    x.fillText("train.py  ·  v410-flash  ·  B666", 12, 20);
    x.fillStyle = "#2f6f88"; x.fillText("exp/2026-10-24", w - 168, 20);
    // 分割线
    x.strokeStyle = "#12303d"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, 30); x.lineTo(w, 30); x.stroke();
    // 左边：loss 曲线
    const gx = 16, gy = 46, gw = w * 0.56, gh = h - 220;
    x.strokeStyle = "#0f2833"; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      x.beginPath(); x.moveTo(gx, gy + (gh / 4) * i); x.lineTo(gx + gw, gy + (gh / 4) * i); x.stroke();
      x.beginPath(); x.moveTo(gx + (gw / 4) * i, gy); x.lineTo(gx + (gw / 4) * i, gy + gh); x.stroke();
    }
    x.fillStyle = "#2f6f88"; x.font = "11px Consolas,monospace";
    x.fillText("loss", gx + 2, gy - 4); x.fillText("step", gx + gw - 26, gy + gh + 13);
    // 曲线：随手算一条收敛的
    x.beginPath();
    const N = 90;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const v = 0.92 * Math.exp(-u * 3.1) + 0.05 + Math.sin(u * 46 + now * 0.2) * 0.008;
      const px = gx + u * gw, py = gy + gh - v * gh * 0.95;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.strokeStyle = "#62d0f0"; x.lineWidth = 2; x.stroke();
    x.strokeStyle = "rgba(255,164,90,.65)"; x.lineWidth = 1.4;
    x.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const v = 0.88 * Math.exp(-u * 2.4) + 0.07 + Math.cos(u * 39 + now * 0.14) * 0.006;
      const px = gx + u * gw, py = gy + gh - v * gh * 0.95;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
    // 右侧：统计条
    const bx = w * 0.62, bw = w - bx - 18;
    const bars = [
      ["gpu util", 0.92 + Math.sin(now * 0.7) * 0.03, "#62d0f0"],
      ["mem", 0.74 + Math.sin(now * 0.3) * 0.02, "#7bd6a8"],
      ["dataloader", 0.41 + Math.sin(now * 0.9) * 0.05, "#ffb45a"],
      ["allreduce", 0.18 + Math.sin(now * 1.3) * 0.02, "#b3a0ff"]
    ];
    bars.forEach((b, i) => {
      const y = 56 + i * 40;
      x.fillStyle = "#9fc4d4"; x.font = "11px Consolas,monospace";
      x.fillText(b[0], bx, y);
      x.fillStyle = "#0c222b"; x.fillRect(bx, y + 6, bw, 8);
      x.fillStyle = b[2]; x.fillRect(bx, y + 6, bw * Math.min(1, b[1]), 8);
    });
    // 终端日志：整行滚动，不再做像素级平滑滚动
    const ly = h - 158;
    x.strokeStyle = "#12303d"; x.beginPath(); x.moveTo(0, ly - 10); x.lineTo(w, ly - 10); x.stroke();
    const total = 1500, cycle = 45;
    const stage = Math.floor(now / cycle);
    const prog = (now % cycle) / cycle;
    const step = Math.min(total, Math.round(prog * total));
    const pct = Math.floor(prog * 100);
    const tick = Math.floor(now / 2.4);
    if (MON.lastTick < 0) {
      MON.lastTick = tick;
      MON.log.push("$ python train.py --config v410-flash.yaml");
      MON.log.push("loading dataset ...");
    }
    while (MON.lastTick < tick) {
      MON.lastTick++;
      MON.log.push(MON.lines[MON.lastTick % MON.lines.length]);
    }
    if (MON.lastStage < 0) MON.lastStage = stage;
    if (stage !== MON.lastStage) {
      MON.log.push("[##########################100%] 1500 / 1500");
      MON.log.push("saving weights ...");
      MON.log.push("checkpoint saved -> ckpt/stage_" + String(stage).padStart(3, "0"));
      MON.log.push("optimizer state saved");
      MON.lastStage = stage;
    }
    if (MON.log.length > 12) MON.log.splice(0, MON.log.length - 12);
    const hist = MON.log.slice(-8);
    x.font = "12px Consolas,monospace";
    hist.forEach((line, i) => {
      let col = "#6f9fb0";
      if (line.indexOf("saving") >= 0 || line.indexOf("checkpoint") >= 0 || line.indexOf("optimizer") >= 0) col = "#8fe3b8";
      else if (line.indexOf("loss") >= 0 || line.indexOf("eval") >= 0) col = "#b8e6c8";
      x.fillStyle = col;
      x.fillText(line.slice(0, 92), 10, ly + i * 16);
    });
    // ASCII 进度条：填满就换行，并追加保存权重日志
    const barW = 26;
    const fill = Math.min(barW, Math.round(prog * barW));
    const bar = "[" + "-".repeat(fill) + String(pct).padStart(3, " ") + "%" + "-".repeat(barW - fill) + "] " +
      String(step).padStart(4, " ") + " / " + total;
    x.fillStyle = "#63E6A5";
    x.fillText(bar, 10, h - 16);
    // 扫光
    const sy = ((now * 60) % (h + 60)) - 30;
    const g = x.createLinearGradient(0, sy - 20, 0, sy + 20);
    g.addColorStop(0, "rgba(120,220,255,0)"); g.addColorStop(0.5, "rgba(120,220,255,.05)");
    g.addColorStop(1, "rgba(120,220,255,0)");
    x.fillStyle = g; x.fillRect(0, sy - 20, w, 40);
  }

  const WB = { t0: 0 };
  function drawBoard(x, w, h) {
    x.fillStyle = "#dfe4e2"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#c7cdcb"; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    // 坐标轴
    x.strokeStyle = "#8d9997"; x.lineWidth = 2;
    x.beginPath(); x.moveTo(48, h - 46); x.lineTo(w - 36, h - 46); x.stroke();
    x.beginPath(); x.moveTo(48, h - 46); x.lineTo(48, 36); x.stroke();
    x.fillStyle = "#7b8785"; x.font = "bold 16px 'Noto Sans SC','Microsoft YaHei',sans-serif";
    x.fillText("loss", 14, 30); x.fillText("step", w - 70, h - 18);
    // 两条曲线，最后叠在一起
    const curve = (col, off) => {
      x.strokeStyle = col; x.lineWidth = 3.4;
      x.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const v = 0.94 * Math.exp(-u * 2.6) + 0.05 + off * (1 - u) +
          Math.sin(u * 27) * 0.012 * (1 - u);
        const px = 52 + u * (w - 104), py = h - 52 - v * (h - 100);
        i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.stroke();
    };
    curve("#4D6BFE", 0.16);
    curve("#D97757", 0.02);
    // 手写标注
    x.fillStyle = "#4D6BFE"; x.font = "italic 18px 'Noto Sans SC',serif";
    x.fillText("小鲸", 90, 74);
    x.fillStyle = "#D97757";
    x.fillText("小克", 132, 108);
    x.strokeStyle = "#8d9997"; x.lineWidth = 1.5;
    x.beginPath(); x.arc(w - 84, 62, 22, 0, TAU); x.stroke();
    x.fillStyle = "#7b8785"; x.font = "14px 'Noto Sans SC',sans-serif";
    x.fillText("ℒ ↓", w - 98, 68);
    // 粉笔灰
    const r = rng(5);
    for (let i = 0; i < 60; i++) {
      x.fillStyle = "rgba(140,150,148," + (0.02 + r() * 0.05) + ")";
      x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
    }
  }

  /* 局部盒子助手：以中心为锚 */
  function Gbox(b, x, y, z, sx, sy, sz, col) {
    b.box.call(b, m4(x, y, z), sx, sy, sz, col, 1.2);
  }

  /* ============================================================
   *  Claude 家里的藏书室
   * ============================================================ */
  function buildLib() {
    const st = P.stage();
    const r = rng(29);
    const RW = 7.4, RH = 4.3, Z0 = -6.2, Z1 = 3.6;

    // 地板与长条地毯
    const floor = st.pen("floor", T.wood(), { tint: [0.95, 0.92, 0.95], spec: 0.3 });
    floor.grid.call(floor, m4(0, 0, (Z0 + Z1) / 2), RW, Z1 - Z0, 12, 14, [0.8, 0.72, 0.66], 2.0, 0.12, 0);
    const rug = st.pen("rug", T.carpet(), { tint: [1.05, 0.98, 0.92] });
    rug.quad.call(rug, m4(0, 0.012, -1.0, -Math.PI / 2, 0, 0), 2.2, 8.4, [1, 1, 1], [0, 0, 1.6, 6]);
    // 踢脚线
    const trim = st.pen("trim", T.woodDark(), { tint: [0.9, 0.8, 0.7] });
    for (const sx of [-1, 1]) Gbox(trim, sx * RW / 2 - 0.03, 0.1, (Z0 + Z1) / 2, 0.06, 0.2, Z1 - Z0, [1, 1, 1]);

    // 左右两面墙 + 天花板
    const wall = st.pen("wall", T.plasterWarm(), { tint: [0.9, 0.86, 0.82] });
    for (const sx of [-1, 1]) {
      wall.quad.call(wall, m4(sx * RW / 2, RH / 2, (Z0 + Z1) / 2, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0),
        Z1 - Z0, RH, [0.9, 0.86, 0.8], [0, 0, 4, 2.4]);
    }
    const ceil = st.pen("ceil", T.woodDark(), { tint: [0.8, 0.72, 0.66] });
    ceil.grid.call(ceil, m4(0, RH, (Z0 + Z1) / 2, Math.PI, 0, 0), RW, Z1 - Z0, 6, 8, [0.9, 0.84, 0.78], 1.6, 0.08, 0);
    const beam = st.pen("beam", T.woodDark(), { tint: [0.9, 0.82, 0.72] });
    for (let z = Z0 + 1.6; z < Z1; z += 2.4) Gbox(beam, 0, RH - 0.14, z, RW, 0.28, 0.24, [1, 1, 1]);

    // 后墙：窗 + 书柜
    const back = st.pen("back", T.plasterWarm(), { tint: [0.86, 0.8, 0.74] });
    back.quad.call(back, m4(0, RH / 2, Z0, 0, 0, 0), RW, RH, [0.92, 0.86, 0.8], [0, 0, 3, 2]);
    // 高窗
    const winX = 0, winW = 1.7, winY0 = 1.0, winY1 = 3.7;
    const winFrame = st.pen("winFrame", T.woodDark(), { tint: [1.2, 1.0, 0.8], spec: 0.25 });
    Gbox(winFrame, winX, winY1 + 0.06, Z0 + 0.04, winW + 0.28, 0.12, 0.16, [1, 1, 1]);
    Gbox(winFrame, winX, winY0 - 0.06, Z0 + 0.06, winW + 0.36, 0.12, 0.24, [1, 1, 1]);
    Gbox(winFrame, winX - winW / 2 - 0.06, (winY0 + winY1) / 2, Z0 + 0.04, 0.12, winY1 - winY0, 0.16, [1, 1, 1]);
    Gbox(winFrame, winX + winW / 2 + 0.06, (winY0 + winY1) / 2, Z0 + 0.04, 0.12, winY1 - winY0, 0.16, [1, 1, 1]);
    Gbox(winFrame, winX, winY1 - 0.5, Z0 + 0.04, winW, 0.07, 0.12, [1, 1, 1]);
    Gbox(winFrame, winX, (winY0 + winY1) / 2, Z0 + 0.04, 0.06, winY1 - winY0, 0.12, [1, 1, 1]);
    // 窗外的天光
    const daylight = st.pen("daylight", null, { unlit: true, tint: [1.0, 0.95, 0.86], emissive: [1.2, 1.1, 0.95] });
    daylight.quad.call(daylight, m4(winX, (winY0 + winY1) / 2, Z0 - 0.02), winW, winY1 - winY0, [1, 1, 1], [0, 0, 1, 1]);
    // 窗棂
    for (let i = 0; i < 2; i++) {
      Gbox(winFrame, winX - winW / 4 + i * winW / 2, (winY0 + winY1) / 2, Z0 + 0.03, 0.045, winY1 - winY0, 0.1, [1, 1, 1]);
    }
    for (let i = 0; i < 3; i++) {
      Gbox(winFrame, winX, winY0 + (winY1 - winY0) * (0.28 + i * 0.22), Z0 + 0.03, winW, 0.045, 0.1, [1, 1, 1]);
    }
    // 窗台上的小菊花
    P.pot(st.pen("winPot", T.stone(), { tint: [0.9, 0.85, 0.8] }), m4(winX - 0.5, winY0 + 0.02, Z0 + 0.12), 0.07, 0.1, [0.6, 0.5, 0.42]);
    // 窗帘
    const curtain = st.pen("curtain", T.curtain(), { tint: [0.9, 0.6, 0.45], sway: 0.5 });
    for (const sx of [-1, 1]) {
      curtain.quad.call(curtain, m4(winX + sx * (winW / 2 + 0.28), (winY0 + winY1) / 2 + 0.2, Z0 + 0.18),
        0.42, winY1 - winY0 + 0.5, [1, 1, 1], [0, 0, 1, 2.4]);
    }

    // 左右书架（四面书架的意思：两侧整面墙 + 后墙两侧）
    const shelfWood = st.pen("shelf", T.woodDark(), { tint: [1.0, 0.86, 0.7] });
    const books = st.pen("books", T.fabric(), { tint: [1.05, 1.0, 0.95] });
    const bays = [-4.6, -2.9, -1.2, 0.5, 2.2];
    for (const sx of [-1, 1]) {
      for (const z of bays) {
        const w = 1.62, h = 3.9, d = 0.42;
        const m = m4(sx * (RW / 2 - d / 2 - 0.04), 0, z, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        P.bookshelf(shelfWood, m, w, h, d, 7, { woodCol: [0.34, 0.22, 0.14] });
        P.shelfBooks(books, m, w, d, h, 7, Math.floor(r() * 9999));
      }
    }
    // 后墙两侧的书架
    for (const sx of [-1, 1]) {
      const m = m4(sx * 2.45, 0, Z0 + 0.24, 0, 0, 0);
      P.bookshelf(shelfWood, m, 2.2, 3.9, 0.42, 7, { woodCol: [0.34, 0.22, 0.14] });
      P.shelfBooks(books, m, 2.2, 0.42, 3.9, 7, Math.floor(r() * 9999));
    }

    // 长桌
    const tableWood = st.pen("table", T.woodDark(), { tint: [1.05, 0.9, 0.75], spec: 0.25 });
    P.table(tableWood, m4(0, 0.78, -1.4), 2.6, 1.1, 0.78, [0.52, 0.36, 0.24], 0.08);
    // 桌上的书、灯、花瓶
    const bookB = st.pen("book", T.fabric(), { tint: [1, 1, 1] });
    for (let i = 0; i < 5; i++) {
      P.book(bookB, m4(-0.9 + i * 0.06, 0.78 + 0.03 + i * 0.05, -1.1 + i * 0.02, 0, 0.2 + i * 0.1, 0),
        0.3, 0.05, 0.22, [0.5 - i * 0.04, 0.2 + i * 0.05, 0.16 + i * 0.03]);
    }
    P.book(bookB, m4(0.55, 0.81, -1.6, 0, 0.4, 0), 0.26, 0.04, 0.2, [0.2, 0.24, 0.36]);
    // 摊开的书（两片书页）
    const page = st.pen("page", T.paper(), { tint: [1.0, 0.96, 0.86] });
    page.quad.call(page, m4(-0.15, 0.79, -1.25, -Math.PI / 2, 0.3, 0), 0.36, 0.26, [1, 1, 1], [0, 0, 1, 1]);
    page.quad.call(page, m4(0.19, 0.79, -1.2, -Math.PI / 2, 0.3, 0), 0.36, 0.26, [1, 1, 1], [0, 0, 1, 1]);
    P.papers(page, m4(1.05, 0.79, -1.15), 2, 21);
    // 眼镜
    const glasses = st.pen("glasses", T.brass(), { tint: [0.8, 0.8, 0.8] });
    for (const gx of [-0.05, 0.09]) {
      glasses.torus.call(glasses, m4(gx, 0.795, -0.95, Math.PI / 2, 0, 0), 0.035, 0.004, 10, 4, [1, 1, 1]);
    }
    const lampIron = st.pen("oilLamp", T.brass(), { tint: [1, 1, 1], spec: 0.5 });
    lampIron.cyl.call(lampIron, m4(-0.55, 0.78, -1.55), 0.09, 0.05, 0.05, 12, [1, 1, 1], true);
    lampIron.cyl.call(lampIron, m4(-0.55, 0.9, -1.55), 0.02, 0.02, 0.1, 8, [1, 1, 1], true);
    const flame = st.pen("flame", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.65, 0.3], opacity: 0.9 });
    flame.quad.call(flame, m4(-0.55, 1.05, -1.55), 0.12, 0.16, [1, 1, 1], [0, 0, 1, 1]);
    const lampHalo2 = st.pen("lampHalo2", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.6, 0.25], opacity: 0.3 });
    lampHalo2.quad.call(lampHalo2, m4(-0.55, 1.02, -1.5), 1.3, 1.3, [1, 1, 1], [0, 0, 1, 1]);
    // 菊花瓶
    const vase = st.pen("vase", T.plasterPale(), { tint: [1.0, 0.95, 0.95], spec: 0.4 });
    vase.cyl.call(vase, m4(0.95, 0.78, -1.25), 0.07, 0.05, 0.22, 12, [1, 1, 1], true);
    const stemB = st.pen("stem", null, { tint: [0.25, 0.42, 0.2], sway: 0.35 });
    const petalB = st.pen("petal", T.petal(), { cutout: true, tint: [1.2, 0.95, 0.7], rim: 0.25 });
    P.chrysanthemum(petalB, stemB, m4(0.95, 1.0, -1.25), 0.85, [1.2, 0.9, 0.62], 6);
    P.chrysanthemum(petalB, stemB, m4(1.05, 0.98, -1.2), 0.7, [1.3, 1.0, 0.7], 19);

    // 书架上的菊花：每隔一格放一小瓶
    const shelfVase = st.pen("shelfVase", T.plasterPale(), { tint: [1.0, 0.92, 0.9], spec: 0.4 });
    const shelfStem = st.pen("shelfStem", null, { tint: [0.26, 0.42, 0.2], sway: 0.35 });
    const shelfPetal = st.pen("shelfPetal", T.petal(), { cutout: true, tint: [1.25, 0.95, 0.7], rim: 0.25 });
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const sz = -4.2 + i * 1.9;
        const vx = sx * (RW / 2 - 0.5);
        shelfVase.cyl.call(shelfVase, m4(vx, 2.28, sz), 0.06, 0.045, 0.16, 10, [1, 1, 1], true);
        P.chrysanthemum(shelfPetal, shelfStem, m4(vx, 2.4, sz), 0.55, [1.2, 0.92, 0.66], i * 13 + (sx > 0 ? 5 : 0));
      }
    }

    // 椅子
    const chairB = st.pen("chair", T.fabric(), { tint: [0.95, 0.75, 0.55] });
    P.chair(chairB, m4(-1.7, 0, -0.5, 0, 2.4, 0), [0.42, 0.24, 0.18], [0.4, 0.26, 0.16]);
    P.chair(chairB, m4(1.15, 0, -2.9, 0, -0.3, 0), [0.42, 0.24, 0.18], [0.4, 0.26, 0.16]);

    // 梯子（靠在右侧书架）
    const ladderB = st.pen("ladder", T.woodPale(), { tint: [0.9, 0.8, 0.68] });
    const lx = RW / 2 - 0.55, lz = -3.6;
    for (const sx of [-1, 1]) {
      ladderB.box.call(ladderB, m4(lx + sx * 0.22, 1.6, lz, 0, 0, 0.12), 0.06, 3.2, 0.06, [1, 1, 1], 1.6);
    }
    for (let k = 0; k < 7; k++) {
      ladderB.box.call(ladderB, m4(lx, 0.4 + k * 0.42, lz, 0, 0, 0.12), 0.5, 0.05, 0.07, [1, 1, 1], 1.6);
    }

    // 地球仪
    const globeBase = st.pen("globeBase", T.brass(), { tint: [1, 1, 1], spec: 0.5 });
    globeBase.torus.call(globeBase, m4(2.3, 0.05, -4.6, Math.PI / 2, 0, 0), 0.26, 0.035, 16, 5, [1, 1, 1]);
    globeBase.cyl.call(globeBase, m4(2.3, 0.03, -4.6), 0.05, 0.03, 0.7, 8, [1, 1, 1], true);
    const globe = st.pen("globe", T.plasterPale(), { tint: [0.75, 0.9, 0.95], spec: 0.4 });
    globe.sphere.call(globe, m4(2.3, 0.88, -4.6, 0.3, 0.4, 0), 0.24, 14, 10, [1, 1, 1]);
    void globeBase;

    // 吊灯（蜡烛）
    const chand = st.pen("chand", T.darkMetal(), { tint: [0.85, 0.75, 0.6], spec: 0.5 });
    chand.torus.call(chand, m4(0, 3.02, -1.6, Math.PI / 2, 0, 0), 0.5, 0.024, 20, 5, [0.45, 0.4, 0.34]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const cx = Math.cos(a) * 0.5, cz = -1.6 + Math.sin(a) * 0.5;
      chand.cyl.call(chand, m4(cx, 3.02, cz), 0.018, 0.018, 0.14, 6, [1, 1, 1], true);
      const candleB = st.pen("candle", T.paper(), { tint: [1.1, 1.0, 0.85], emissive: [0.18, 0.12, 0.05] });
      candleB.cyl.call(candleB, m4(cx, 3.16, cz), 0.03, 0.028, 0.14, 8, [1, 1, 1], true);
      const fl = st.pen("candleFlame", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.68, 0.3], opacity: 0.85 });
      fl.quad.call(fl, m4(cx, 3.35, cz), 0.055, 0.09, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 灯链
    chand.cyl.call(chand, m4(0, 3.02, -1.6), 0.012, 0.012, 1.28, 5, [1, 1, 1], true);

    // 光柱（从高窗打进来）
    const shaft = st.pen("shaft", T.shaft(), { unlit: true, blend: "add", opacity: 0.13, tint: [1.0, 0.9, 0.7] });
    for (let i = 0; i < 3; i++) {
      shaft.quad.call(shaft, m4(-0.5 + i * 0.6, 1.9, Z0 + 1.4 + i * 0.5, 0.3, 0, -0.05), 1.4, 4.0, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 粒子（灰尘）
    const pts = [];
    for (let i = 0; i < 150; i++) {
      pts.push({
        x: (r() - 0.5) * 7, y: 0.4 + r() * 3.4, z: Z0 + r() * 8,
        r: 1.0, g: 0.9, b: 0.75, a: 0.08 + r() * 0.25,
        size: 0.004 + r() * 0.012, kind: 2, speed: 0.04 + r() * 0.08, phase: r() * TAU, wob: 0.05 + r() * 0.12
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "alpha", yMin: 0.2, yMax: 4.0, fogNear: 4, fogFar: 18 });

    st.finish();
    st.finishGlows();
    return {
      cam: { eye: [0.15, 1.62, 3.0], target: [0.0, 1.45, -5.6], fov: 46 },
      sky: { mode: 0, top: [0.05, 0.05, 0.07], bot: [0.12, 0.1, 0.08], glow: [0.5, 0.42, 0.3], sun: [0.5, 0.8], horizon: 0.4 },
      lights: {
        sun: A3D.norm3([0.1, 0.55, 0.9]), sunCol: [0.85, 0.8, 0.65],
        skyCol: [0.2, 0.18, 0.16], groundCol: [0.14, 0.1, 0.08],
        fog: { col: [0.08, 0.06, 0.05], near: 7, far: 26 }, fogAmt: 0.45,
        points: [
          { pos: [0, 3.25, -1.6], col: [1.0, 0.68, 0.34], range: 7.5, inten: 1.0 },
          { pos: [-0.55, 1.1, -1.55], col: [1.0, 0.7, 0.35], range: 3.2, inten: 0.7 },
          { pos: [0, 2.4, -6.0], col: [0.75, 0.8, 0.75], range: 8, inten: 0.75 },
          { pos: [0.15, 1.7, 3.0], col: [0.35, 0.3, 0.28], range: 6, inten: 0.3 },
          { pos: [-2.6, 2.4, -0.6], col: [1.0, 0.62, 0.3], range: 5.5, inten: 0.5 }
        ]
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows,
      tone: [1.0, 0.86, 0.7],
      swayAmp: 0.5,
      update(t, sc) {
        sc.cam.eye = [0.15 + Math.sin(t * 0.19) * 0.03, 1.62 + Math.sin(t * 0.28) * 0.012, 3.0 + Math.cos(t * 0.16) * 0.03];
      }
    };
  }

  /* ============================================================
   *  Hugging Face 海边营地（夜）
   * ============================================================ */
  /* ============================================================
   *  DeepSeek 家里 · 紧凑卧室版
   *  5.6 × 5.5m，床 + 两张桌子；木器全部换成白漆 / 金属 / 亚麻
   * ============================================================ */
  /** 圆角矩形路径：CanvasRenderingContext2D.roundRect 要 Chrome 99+，
   *  老 WebView（华为浏览器是 Chrome 92）上不存在，会在构建贴图时抛异常，
   *  异常被 A3D.draw 吞掉后整个房间场景会从注册表摘掉、永远回落占位卡。
   *  这里用 arcTo 手写一遍，行为等价。 */
  function roundRectPath(x, px, py, w, h, r) {
    const k = Math.min(r, w / 2, h / 2);
    x.beginPath();
    x.moveTo(px + k, py);
    x.arcTo(px + w, py, px + w, py + h, k);
    x.arcTo(px + w, py + h, px, py + h, k);
    x.arcTo(px, py + h, px, py, k);
    x.arcTo(px, py, px + w, py, k);
    x.closePath();
  }

  /** 墙面贴纸：小鲸鱼 + Clawd + 爱心 */
  function drawWallArt(x, w, h) {
    x.clearRect(0, 0, w, h);
    const whaleBlue = "#7ec8e8", whaleDark = "#205468", whaleBelly = "#d8f3fc";
    // 尾巴、胸鳍先画，根部伸进身体
    x.strokeStyle = whaleDark; x.lineWidth = 6; x.fillStyle = whaleBlue;
    // 胸鳍先画，根部埋进身体
    x.beginPath(); x.ellipse(160, 266, 28, 12, 0.45, 0, TAU); x.fill(); x.stroke();
    // 身体填充（先不描边）
    const whalePath = () => {
      x.beginPath();
      x.moveTo(170, 160);
      x.bezierCurveTo(235, 158, 288, 183, 288, 216);
      x.bezierCurveTo(288, 249, 235, 274, 170, 272);
      x.bezierCurveTo(128, 271, 104, 262, 82, 238);
      x.quadraticCurveTo(62, 234, 44, 228);
      x.quadraticCurveTo(28, 242, 10, 242);
      x.quadraticCurveTo(2, 236, 10, 228);
      x.quadraticCurveTo(20, 222, 28, 216);
      x.quadraticCurveTo(20, 210, 10, 204);
      x.quadraticCurveTo(2, 196, 10, 190);
      x.quadraticCurveTo(28, 190, 44, 204);
      x.quadraticCurveTo(62, 198, 82, 194);
      x.bezierCurveTo(104, 170, 128, 161, 170, 160);
      x.closePath();
    };
    whalePath(); x.fill();
    // 白肚皮裁剪在身体内部，避免和蓝色轮廓相交
    x.save();
    whalePath(); x.clip();
    x.fillStyle = whaleBelly;
    x.beginPath(); x.ellipse(190, 238, 74, 30, -0.02, 0, TAU); x.fill();
    x.restore();
    // 连续轮廓一次描边，避免接缝
    x.strokeStyle = whaleDark; x.lineWidth = 6;
    whalePath(); x.stroke();
    // 眼睛、微笑
    x.fillStyle = "#173b4c";
    x.beginPath(); x.arc(255, 198, 8, 0, TAU); x.fill();
    x.strokeStyle = "#173b4c"; x.lineWidth = 4;
    x.beginPath(); x.arc(268, 216, 16, 0.2, 1.2); x.stroke();
    // 三股喷水 + 水滴
    x.strokeStyle = "#a9e4f6"; x.lineWidth = 6; x.lineCap = "round";
    x.beginPath();
    x.moveTo(175, 160); x.quadraticCurveTo(160, 132, 144, 114);
    x.moveTo(175, 160); x.quadraticCurveTo(190, 132, 206, 114);
    x.stroke();
    x.fillStyle = "#d8f7ff";
    [[142, 109, 5], [208, 109, 5]].forEach(d => {
      x.beginPath(); x.arc(d[0], d[1], d[2], 0, TAU); x.fill();
    });
    // Clawd：按参考图，宽橙矩形身体 + 2 只侧手 + 4 条腿 + 2 只竖眼，无嘴无尾无描边
    x.fillStyle = "#E08A5F"; x.strokeStyle = "#7a3520"; x.lineWidth = 4;
    // 侧手：根部伸进身体
    x.fillRect(306, 226, 28, 20); x.strokeRect(306, 226, 28, 20);
    x.fillRect(456, 226, 28, 20); x.strokeRect(456, 226, 28, 20);
    // 四条短腿：左右对称，全部在身体宽度内
    x.fillRect(334, 264, 14, 30); x.strokeRect(334, 264, 14, 30);
    x.fillRect(360, 264, 14, 30); x.strokeRect(360, 264, 14, 30);
    x.fillRect(416, 264, 14, 30); x.strokeRect(416, 264, 14, 30);
    x.fillRect(442, 264, 14, 30); x.strokeRect(442, 264, 14, 30);
    // 更宽的橙色身体（带描边）
    roundRectPath(x, 320, 190, 150, 80, 8); x.fill(); x.stroke();
    // ^ 形眼睛
    x.strokeStyle = "#2a120b"; x.lineWidth = 6; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.moveTo(352, 222); x.lineTo(362, 210); x.lineTo(372, 222); x.stroke();
    x.beginPath(); x.moveTo(418, 222); x.lineTo(428, 210); x.lineTo(438, 222); x.stroke();
    // 爱心
    const heart = (cx, cy, sc, col) => {
      x.save(); x.translate(cx, cy); x.scale(sc, sc);
      x.fillStyle = col; x.beginPath();
      x.moveTo(0, 8);
      x.bezierCurveTo(-22, -12, -12, -30, 0, -16);
      x.bezierCurveTo(12, -30, 22, -12, 0, 8);
      x.fill(); x.restore();
    };
    heart(300, 110, 1.0, "#ff8fa3");
    heart(390, 92, 0.8, "#ffb3c1");
    heart(476, 150, 0.65, "#ff6b85");
    heart(92, 100, 0.75, "#ffa1b5");
    heart(220, 92, 0.55, "#ffc2cf");
  }

  /** 手绘菊花贴图：重瓣、外圈深、内圈亮，花心小 */
  function drawMum(x, w, h) {
    x.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const rings = [
      { n: 22, r0: 34, r1: 116, wd: 18, c0: "#7d2f0b", c1: "#c75a17", c2: "#ef9a3d" },
      { n: 24, r0: 28, r1: 102, wd: 17, c0: "#8f3710", c1: "#d96d1e", c2: "#f7ac52" },
      { n: 26, r0: 22, r1: 86, wd: 16, c0: "#a34313", c1: "#e88128", c2: "#ffbe66" },
      { n: 28, r0: 16, r1: 70, wd: 15, c0: "#b85116", c1: "#f49333", c2: "#ffd07a" },
      { n: 30, r0: 10, r1: 54, wd: 14, c0: "#cb601b", c1: "#ffa544", c2: "#ffe2a0" }
    ];
    for (let ri = 0; ri < rings.length; ri++) {
      const R = rings[ri];
      for (let i = 0; i < R.n; i++) {
        const a = (i / R.n) * TAU + ri * 0.21;
        x.save(); x.translate(cx, cy); x.rotate(a);
        const g = x.createLinearGradient(0, -R.r0, 0, -R.r1);
        g.addColorStop(0, R.c0); g.addColorStop(0.55, R.c1); g.addColorStop(1, R.c2);
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(-R.wd * 0.35, -R.r0);
        x.bezierCurveTo(-R.wd * 0.8, -R.r0 - (R.r1 - R.r0) * 0.32,
          -R.wd * 0.55, -R.r1 + 8, -R.wd * 0.16, -R.r1 + 2);
        x.quadraticCurveTo(0, -R.r1 - 3, R.wd * 0.16, -R.r1 + 2);
        x.bezierCurveTo(R.wd * 0.55, -R.r1 + 8,
          R.wd * 0.8, -R.r0 - (R.r1 - R.r0) * 0.32, R.wd * 0.35, -R.r0);
        x.closePath(); x.fill();
        x.strokeStyle = "rgba(90,35,8,.3)"; x.lineWidth = 1.1; x.stroke();
        x.strokeStyle = "rgba(255,220,150,.22)"; x.lineWidth = 1;
        x.beginPath(); x.moveTo(0, -R.r0);
        x.quadraticCurveTo(R.wd * 0.08, -(R.r0 + R.r1) / 2, 0, -R.r1 + 6); x.stroke();
        x.restore();
      }
    }
    const cg = x.createRadialGradient(cx, cy, 0, cx, cy, 18);
    cg.addColorStop(0, "#6f6222"); cg.addColorStop(0.55, "#3f4a18"); cg.addColorStop(1, "#28320f");
    x.fillStyle = cg; x.beginPath(); x.arc(cx, cy, 18, 0, TAU); x.fill();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU, rr = 4 + (i % 3) * 4;
      x.fillStyle = i % 2 ? "#c8a23a" : "#8f7a2a";
      x.beginPath(); x.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6, 0, TAU); x.fill();
    }
  }
  let mumTex = null;
  function getMumTex() {
    if (!mumTex) mumTex = A3DTex.dynamic("mum", 256, 256, drawMum);
    return mumTex;
  }

  /** 马克杯上的小鲸鱼印花（透明底，白杯壁由杯体材质提供） */
  function drawMugWhale(x, w, h) {
    x.clearRect(0, 0, w, h);
    const s = w / 256;
    x.strokeStyle = "#1d4d66"; x.lineWidth = 5 * s; x.fillStyle = "#63b7df";
    // 身体
    x.beginPath(); x.ellipse(140 * s, 148 * s, 56 * s, 34 * s, -0.08, 0, TAU); x.fill(); x.stroke();
    // 尾巴
    x.beginPath();
    x.moveTo(88 * s, 145 * s);
    x.quadraticCurveTo(68 * s, 130 * s, 46 * s, 132 * s);
    x.quadraticCurveTo(58 * s, 147 * s, 52 * s, 160 * s);
    x.quadraticCurveTo(70 * s, 157 * s, 88 * s, 156 * s);
    x.closePath(); x.fill(); x.stroke();
    // 肚皮
    x.fillStyle = "#e8f8ff"; x.beginPath();
    x.ellipse(148 * s, 160 * s, 38 * s, 18 * s, 0, 0, TAU); x.fill();
    // 眼睛、微笑、喷水
    x.fillStyle = "#153b4c"; x.beginPath(); x.arc(184 * s, 140 * s, 4 * s, 0, TAU); x.fill();
    x.strokeStyle = "#153b4c"; x.lineWidth = 3 * s;
    x.beginPath(); x.arc(192 * s, 152 * s, 8 * s, 0.2, 1.2); x.stroke();
    x.strokeStyle = "#8fd3ea"; x.lineWidth = 4 * s;
    x.beginPath(); x.moveTo(130 * s, 116 * s); x.quadraticCurveTo(124 * s, 96 * s, 112 * s, 88 * s); x.stroke();
    x.beginPath(); x.moveTo(130 * s, 116 * s); x.quadraticCurveTo(140 * s, 96 * s, 150 * s, 88 * s); x.stroke();
  }
  let mugWhaleTex = null;
  function getMugWhaleTex() {
    if (!mugWhaleTex) mugWhaleTex = A3DTex.dynamic("mugWhale", 256, 256, drawMugWhale);
    return mugWhaleTex;
  }

  /** MIT + GitHub Octicon law 天平海报（蓝色图标） */
  const MIT_LAW_D = "M12.75 2.75V4.5h1.975c.351 0 .694.106.984.303l1.697 1.154c.041.028.09.043.14.043h4.102a.75.75 0 0 1 0 1.5H20.07l3.366 7.68a.749.749 0 0 1-.23.896c-.1.074-.203.143-.31.206a6.296 6.296 0 0 1-.79.399 7.349 7.349 0 0 1-2.856.569 7.343 7.343 0 0 1-2.855-.568 6.205 6.205 0 0 1-.79-.4 3.205 3.205 0 0 1-.307-.202l-.005-.004a.749.749 0 0 1-.23-.896l3.368-7.68h-.886c-.351 0-.694-.106-.984-.303l-1.697-1.154a.246.246 0 0 0-.14-.043H12.75v14.5h4.487a.75.75 0 0 1 0 1.5H6.763a.75.75 0 0 1 0-1.5h4.487V6H9.275a.249.249 0 0 0-.14.043L7.439 7.197c-.29.197-.633.303-.984.303h-.886l3.368 7.68a.75.75 0 0 1-.209.878c-.08.065-.16.126-.31.223a6.077 6.077 0 0 1-.792.433 6.924 6.924 0 0 1-2.876.62 6.913 6.913 0 0 1-2.876-.62 6.077 6.077 0 0 1-.792-.433 3.483 3.483 0 0 1-.309-.221.762.762 0 0 1-.21-.88L3.93 7.5H2.353a.75.75 0 0 1 0-1.5h4.102c.05 0 .099-.015.141-.043l1.695-1.154c.29-.198.634-.303.985-.303h1.974V2.75a.75.75 0 0 1 1.5 0ZM2.193 15.198a5.414 5.414 0 0 0 2.557.635 5.414 5.414 0 0 0 2.557-.635L4.75 9.368Zm14.51-.024c.082.04.174.083.275.126.53.223 1.305.45 2.272.45a5.847 5.847 0 0 0 2.547-.576L19.25 9.367Z";
  function drawMitPoster(x, w, h) {
    x.fillStyle = "#ece5d7"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#b9a88a"; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = "rgb(11, 15, 25)"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "bold 54px Georgia,serif"; x.fillText("MIT", w / 2, h * 0.12);
    // GitHub Octicon law，蓝色，放大
    const law = new Path2D(MIT_LAW_D);
    const sc = Math.min(w, h) * 0.58 / 24;
    x.save();
    x.translate(w / 2, h * 0.45);
    x.scale(sc, sc);
    x.translate(-12, -12);
    x.fillStyle = "rgb(0, 55, 218)";
    x.fill(law);
    x.restore();
    x.fillStyle = "rgb(58, 150, 221)";
    x.font = "italic bold 78px 'Noto Serif SC','Songti SC',SimSun,serif";
    x.fillText("开源盛世", w / 2, h * 0.87);
  }

  function buildRoomCompact(opts) {
    const night = !!opts.night;
    const st = P.stage();
    const r = rng(11);
    let lastT = 0, lastBoard = 0, lastTerm = 0;

    const RW = 5.6, RH = 2.85;
    const zBack = -3.5, zFront = 2.0;
    const WIN = { x0: -1.55, x1: 1.55, y0: 0.82, y1: 2.48, z: zBack };
    const deskX = 0, deskZ = -2.85, deskW = 2.3, deskD = 0.68, deskH = 0.74;
    const cx = 2.2, cz = -1.75;
    const fcx = (WIN.x0 + WIN.x1) / 2, fcy = (WIN.y0 + WIN.y1) / 2;
    const fw = WIN.x1 - WIN.x0, fh = WIN.y1 - WIN.y0;

    /* ---------- 材质：没有木头 ---------- */
    const paint = st.pen("paint", T.paint(), { tint: night ? [0.6, 0.67, 0.8] : [0.85, 0.89, 0.95], spec: 0.08 });
    const deskTop = st.pen("deskTop", T.paint(), { tint: night ? [0.5, 0.57, 0.7] : [0.66, 0.74, 0.88], spec: 0.1 });
    const shadeWarm = st.pen("shadeWarm", T.linen(), { tint: [1.1, 1.0, 0.72], emissive: [0.72, 0.52, 0.18], emisBoost: 1.55 });
    const metal = st.pen("metal", T.metal(), { tint: night ? [0.55, 0.6, 0.7] : [0.72, 0.78, 0.9], spec: 0.45 });
    const metalDark = st.pen("metalDark", T.darkMetal(), { tint: [0.75, 0.82, 0.95], spec: 0.32 });
    const ceramic = st.pen("ceramic", T.plasterPale(), { tint: [1.02, 1.04, 1.08], spec: 0.45 });
    const paperB = st.pen("paper", T.paper(), { tint: [1, 1, 1] });
    const bookB = st.pen("book", T.paper(), { tint: [1, 1, 1] });
    const potB = st.pen("pot", T.stone(), { tint: [0.8, 0.84, 0.9] });
    const plantB = st.pen("leaf", T.leaf(), { cutout: true, tint: [0.9, 1.0, 0.9], sway: 0.6, rim: 0.2, noShadow: true });
    const mugB = st.pen("mug", T.metal(), { tint: [0.75, 0.82, 0.95], spec: 0.5 });
    const mugCeramic = st.pen("mugCeramic", T.plasterPale(), { unlit: true, tint: [1.22, 1.18, 1.1] });
    const screenDark = st.pen("screenDark", null, { unlit: true, tint: [0.03, 0.05, 0.08] });

    /* ---------- 地面：蓝色地毯 ---------- */
    const floor = st.pen("floor", T.linen(), { tint: night ? [0.32, 0.38, 0.5] : [0.55, 0.64, 0.8], spec: 0.02 });
    floor.grid.call(floor, m4(0, 0, (zBack + zFront) / 2), RW, zFront - zBack, 10, 10,
      [0.52, 0.58, 0.7], 1.6, 0.1, 0);
    const trim = st.pen("trim", null, { tint: night ? [0.34, 0.42, 0.56] : [0.68, 0.77, 0.92] });
    Gbox(trim, 0, 0.06, zBack + 0.03, RW, 0.12, 0.06, [1, 1, 1]);

    /* ---------- 后墙 + 窗洞 ---------- */
    const wall = st.pen("wall", null, { tint: night ? [0.28, 0.38, 0.6] : [0.38, 0.52, 0.9], spec: 0.02 });
    const cw = 0.2, cols = Math.round(RW / cw), rows = Math.ceil(RH / cw);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x0 = -RW / 2 + i * cw, y0 = j * cw;
        const cx2 = x0 + cw / 2, cy2 = y0 + cw / 2;
        if (cx2 > WIN.x0 && cx2 < WIN.x1 && cy2 > WIN.y0 && cy2 < WIN.y1) continue;
        wall.quad.call(wall, m4(cx2, cy2, zBack, 0, 0, 0), cw, cw, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    /* ---------- 窗套 / 窗台：白漆 ---------- */
    const dT = 0.18;
    Gbox(paint, WIN.x0 - 0.02, fcy, zBack - dT / 2, 0.04, fh + 0.02, dT, [1, 1, 1]);
    Gbox(paint, WIN.x1 + 0.02, fcy, zBack - dT / 2, 0.04, fh + 0.02, dT, [1, 1, 1]);
    Gbox(paint, fcx, WIN.y1 + 0.02, zBack - dT / 2, fw + 0.06, 0.04, dT, [1, 1, 1]);
    Gbox(paint, fcx, WIN.y0 - 0.02, zBack - dT / 2, fw + 0.06, 0.04, dT, [1, 1, 1]);
    Gbox(paint, fcx, WIN.y1 + 0.08, zBack + 0.05, fw + 0.26, 0.12, 0.1, [1, 1, 1]);
    Gbox(paint, WIN.x0 - 0.08, fcy, zBack + 0.05, 0.16, fh + 0.28, 0.1, [1, 1, 1]);
    Gbox(paint, WIN.x1 + 0.08, fcy, zBack + 0.05, 0.16, fh + 0.28, 0.1, [1, 1, 1]);
    Gbox(paint, fcx, WIN.y1 - 0.01, zBack + 0.02, fw + 0.02, 0.08, 0.07, [1, 1, 1]);
    Gbox(paint, WIN.x0 + 0.02, fcy, zBack + 0.02, 0.08, fh, 0.07, [1, 1, 1]);
    Gbox(paint, WIN.x1 - 0.02, fcy, zBack + 0.02, 0.08, fh, 0.07, [1, 1, 1]);
    Gbox(paint, fcx - 0.26, fcy, zBack + 0.02, 0.06, fh, 0.06, [1, 1, 1]);
    Gbox(paint, fcx, WIN.y0 + fh * 0.66, zBack + 0.02, fw, 0.06, 0.06, [1, 1, 1]);
    const arcW = fw / 2 + 0.12;
    for (let i = 0; i < 12; i++) {
      const a0 = Math.PI * (i / 12), a1 = Math.PI * ((i + 1) / 12);
      const cx0 = Math.cos(a0) * arcW, cy0 = WIN.y1 + 0.09 + Math.sin(a0) * 0.24;
      const cx1 = Math.cos(a1) * arcW, cy1 = WIN.y1 + 0.09 + Math.sin(a1) * 0.24;
      const mx = (cx0 + cx1) / 2 + fcx, my = (cy0 + cy1) / 2;
      const len = Math.hypot(cx1 - cx0, cy1 - cy0);
      paint.box.call(paint, m4(mx, my, zBack + 0.04, 0, 0, Math.atan2(cy1 - cy0, cx1 - cx0)),
        len + 0.02, 0.05, 0.05, [1, 1, 1], 1.2);
    }
    Gbox(paint, fcx, WIN.y0 - 0.05, zBack + 0.1, fw + 0.18, 0.07, 0.26, [1, 1, 1]);

    /* ---------- 左右墙 / 天花板：纯色 ---------- */
    const side = st.pen("side", null, { tint: night ? [0.26, 0.36, 0.58] : [0.34, 0.48, 0.84], spec: 0.02 });
    side.quad.call(side, m4(-RW / 2, RH / 2, (zBack + zFront) / 2, 0, Math.PI / 2, 0),
      zFront - zBack, RH, [1, 1, 1], [0, 0, 1, 1]);
    side.quad.call(side, m4(RW / 2, RH / 2, (zBack + zFront) / 2, 0, -Math.PI / 2, 0),
      zFront - zBack, RH, [1, 1, 1], [0, 0, 1, 1]);
    const ceil = st.pen("ceil", null, { tint: night ? [0.4, 0.48, 0.66] : [0.78, 0.73, 0.64], spec: 0.02 });
    ceil.grid.call(ceil, m4(0, RH, (zBack + zFront) / 2, Math.PI, 0, 0), RW, zFront - zBack, 8, 8, [1, 1, 1], 1, 0.05, 0);

    /* ---------- 护墙板 + 气泡贴花 ---------- */
    const wtop = 0.9, wbot = 0.08;
    const wain = st.pen("wainscot", null, { tint: night ? [0.5, 0.58, 0.78] : [0.7, 0.79, 0.95], spec: 0.02 });
    const rail = st.pen("rail", null, { tint: night ? [0.24, 0.32, 0.48] : [0.34, 0.46, 0.68], spec: 0.04 });
    const batten = st.pen("batten", null, { tint: night ? [0.58, 0.66, 0.86] : [0.82, 0.88, 0.98], spec: 0.02 });
    Gbox(wain, -2.34, (wtop + wbot) / 2, zBack + 0.03, 0.88, wtop - wbot, 0.04, [1, 1, 1]);
    Gbox(wain, 2.34, (wtop + wbot) / 2, zBack + 0.03, 0.88, wtop - wbot, 0.04, [1, 1, 1]);
    Gbox(wain, -RW / 2 + 0.03, (wtop + wbot) / 2, -0.75, 0.04, wtop - wbot, 5.3, [1, 1, 1]);
    Gbox(wain, RW / 2 - 0.03, (wtop + wbot) / 2, -0.75, 0.04, wtop - wbot, 5.3, [1, 1, 1]);
    Gbox(rail, -2.34, wtop + 0.03, zBack + 0.055, 0.9, 0.06, 0.06, [1, 1, 1]);
    Gbox(rail, 2.34, wtop + 0.03, zBack + 0.055, 0.9, 0.06, 0.06, [1, 1, 1]);
    Gbox(rail, -RW / 2 + 0.045, wtop + 0.03, -0.75, 0.06, 0.06, 5.3, [1, 1, 1]);
    Gbox(rail, RW / 2 - 0.045, wtop + 0.03, -0.75, 0.06, 0.06, 5.3, [1, 1, 1]);
    for (let z = zBack + 0.35; z <= zFront - 0.25; z += 0.55) {
      Gbox(batten, -RW / 2 + 0.045, (wtop + wbot) / 2, z, 0.04, wtop - wbot - 0.05, 0.06, [1, 1, 1]);
      Gbox(batten, RW / 2 - 0.045, (wtop + wbot) / 2, z, 0.04, wtop - wbot - 0.05, 0.06, [1, 1, 1]);
    }
    for (const bx of [-2.72, -2.5, -2.28, -2.06]) {
      Gbox(batten, bx, (wtop + wbot) / 2, zBack + 0.045, 0.04, wtop - wbot - 0.05, 0.06, [1, 1, 1]);
    }
    for (const bx of [2.06, 2.28, 2.5, 2.72]) {
      Gbox(batten, bx, (wtop + wbot) / 2, zBack + 0.045, 0.04, wtop - wbot - 0.05, 0.06, [1, 1, 1]);
    }
    // 墙面贴纸：小鲸鱼 + Clawd + 爱心（替代原来的泡泡贴图）
    const wallArtTex = A3DTex.dynamic("wallStickers", 512, 384, drawWallArt);
    const wallArt = st.pen("wallStickers", wallArtTex, { unlit: true, blend: "alpha", tint: [1, 1, 1] });
    wallArt.quad.call(wallArt, m4(-RW / 2 + 0.015, 2.06, -2.95, 0, Math.PI / 2, 0), 1.05, 0.79, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 床前小地毯 ---------- */
    const rugB = st.pen("rug", T.rug(), { tint: night ? [0.3, 0.4, 0.6] : [0.5, 0.66, 0.92], spec: 0.02 });
    rugB.quad.call(rugB, m4(0.0, 0.011, -1.45, -Math.PI / 2, 0, 0), 3.2, 1.9, [1, 1, 1], [0, 0, 2.0, 1.3]);

    /* ---------- 床 + 床头柜 ---------- */
    const bedFabric = st.pen("bedFabric", T.linen(), { tint: night ? [0.38, 0.48, 0.7] : [0.5, 0.64, 0.92], spec: 0.03 });
    const bedSheet = st.pen("bedSheet", T.linen(), { tint: [0.98, 1.0, 1.04], spec: 0.02 });
    A3DDecor.bed(metalDark, bedFabric, bedSheet, m4(-2.2, 0, -2.4), 1.0, 1.9);
    // 床头柜：白漆柜体 + 黑金属腿，放在床头（床的右前方）
    Gbox(deskTop, -1.4, 0.47, -3.15, 0.42, 0.05, 0.36, [1, 1, 1]);
    Gbox(deskTop, -1.4, 0.27, -3.15, 0.38, 0.36, 0.32, [1, 1, 1]);
    Gbox(metalDark, -1.4, 0.34, -2.97, 0.16, 0.014, 0.02, [1, 1, 1]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      Gbox(metalDark, -1.4 + sx * 0.17, 0.045, -3.15 + sz * 0.13, 0.035, 0.09, 0.035, [1, 1, 1]);
    }
    P.tableLamp(metal, shadeWarm, m4(-1.4, 0.5, -3.15), 0.34, [1.0, 0.9, 0.58]);
    P.book(bookB, m4(-1.47, 0.5, -3.23, 0, 0.3, 0), 0.16, 0.03, 0.12, [0.3, 0.2, 0.26]);
    P.mug(mugB, m4(-1.25, 0.5, -3.09), [0.85, 0.8, 0.75], 0.04);
    // 垃圾桶：挪到中间桌下面、靠床头柜的左侧
    metalDark.cyl.call(metalDark, m4(-0.9, 0.01, -2.82), 0.16, 0.18, 0.34, 12, [1, 1, 1], false);
    metalDark.torus.call(metalDark, m4(-0.9, 0.35, -2.82), 0.18, 0.012, 14, 5, [1, 1, 1]);

    /* ---------- DeepSeek 的书桌 ---------- */
    A3DDecor.desk(deskTop, metalDark, m4(deskX, 0, deskZ), deskW, deskD, deskH);
    P.drawer(deskTop, m4(0.72, 0.34, deskZ + 0.02), 0.6, 0.64, 0.5, [1, 1, 1]);
    P.chair(metal, m4(0.3, 0, -1.95, 0, Math.PI + 0.25, 0), [0.34, 0.48, 0.72], [0.55, 0.6, 0.7]);
    const monW = 0.76, monH = 0.44, monX = deskX + 0.15, monY = deskH + 0.52, monZ = deskZ - 0.1;
    const monTex = A3DTex.dynamic("monitor", 640, 400, drawMonitor);
    const screenP = st.pen("monScreen", monTex, { unlit: true, tint: [0.84, 0.91, 0.97] });
    const monM = m4(monX, monY, monZ, 0, 0.05, 0);
    P.monitorBody(metalDark, monM);
    screenP.quad.call(screenP, M.mul(monM, M.trs(0, 0, 0.026)), monW - 0.03, monH - 0.03, [1, 1, 1], [0, 0, 1, 1]);
    // 与显示器同中心、同旋转的浅色金属支架：底座 + 立柱 + 屏幕下挂板
    const standP = st.pen("monStand", T.metal(), { tint: [1.0, 1.08, 1.18], spec: 0.45 });
    // cyl 的 m 是底面：底座从桌面起，立柱从底座顶面顶到屏幕下沿
    standP.cyl.call(standP, M.mul(monM, M.trs(0, -0.52, 0)), 0.10, 0.11, 0.018, 20, [1, 1, 1], true);
    standP.cyl.call(standP, M.mul(monM, M.trs(0, -0.502, 0)), 0.016, 0.014, 0.282, 8, [1, 1, 1], true);
    standP.box.call(standP, M.mul(monM, M.trs(0, -0.225, 0)), 0.16, 0.02, 0.06, [1, 1, 1], 1);
    const deskMat = st.pen("deskMat", null, { unlit: true, tint: [0.1, 0.14, 0.2] });
    deskMat.quad.call(deskMat, m4(0.15, deskH + 0.002, deskZ + 0.18, -Math.PI / 2, 0, 0), 0.92, 0.32, [1, 1, 1], [0, 0, 1, 1]);
    P.keyboard(metalDark, m4(0.15, deskH + 0.013, deskZ + 0.17, 0, 0.03, 0), 0.46);
    P.mouse(metalDark, m4(0.5, deskH + 0.003, deskZ + 0.17));
    P.tableLamp(metal, shadeWarm, m4(deskX - 1.0, deskH + 0.001, deskZ - 0.08), 0.38, [1.0, 0.9, 0.58]);
    ceramic.cyl.call(ceramic, m4(-0.35, deskH + 0.005, deskZ + 0.0), 0.05, 0.075, 0.055, 14, [1, 1, 1], true);
    const riceP = st.pen("rice", T.plasterPale(), { unlit: true, tint: [1.0, 1.0, 0.98] });
    riceP.cyl.call(riceP, m4(-0.35, deskH + 0.04, deskZ + 0.0), 0.068, 0.045, 0.03, 14, [1, 1, 1], true);
    riceP.sphere.call(riceP, m4(-0.35, deskH + 0.062, deskZ + 0.0, 0, 0, 0, 1, 0.55, 1), 0.062, 12, 6, [1, 1, 1]);
    // 桌面马克杯：白色陶瓷杯，放在盆栽左边，杯身正面印小鲸鱼
    P.mug(mugCeramic, m4(-0.98, deskH + 0.001, deskZ + 0.22), [1.0, 0.99, 0.96], 0.045);
    const mugPrint = st.pen("mugPrint", getMugWhaleTex(), { unlit: true, blend: "alpha", tint: [1, 1, 1] });
    mugPrint.quad.call(mugPrint, m4(-0.98, deskH + 0.048, deskZ + 0.22 + 0.046), 0.07, 0.05, [1, 1, 1], [0, 0, 1, 1]);
    P.papers(paperB, m4(-0.55, deskH + 0.001, deskZ + 0.14), 6, 12);
    P.book(bookB, m4(-0.3, deskH + 0.002, deskZ + 0.18, 0, 0.15, 0), 0.18, 0.02, 0.24, [0.16, 0.2, 0.3]);
    metalDark.cyl.call(metalDark, m4(1.02, deskH + 0.001, deskZ + 0.23), 0.045, 0.04, 0.11, 12, [0.35, 0.4, 0.5], true);
    const penCols = [[0.8, 0.3, 0.22], [0.2, 0.4, 0.8], [0.4, 0.65, 0.3]];
    const penB = st.pen("penPlastic", null, { tint: [1, 1, 1], spec: 0.25 });
    for (let i = 0; i < 3; i++) {
      const px = 1.02 + (i - 1) * 0.016, pz = deskZ + 0.23 + (i - 1) * 0.01;
      // 整支笔共用同一个倾斜矩阵，笔尖沿笔杆轴线放到顶端，避免和笔杆错位
      const pm = m4(px, deskH + 0.06, pz, 0.12 * (i - 1), 0, 0.14 * (i - 1));
      penB.cyl.call(penB, pm, 0.005, 0.005, 0.16, 6, penCols[i], true);
      penB.cyl.call(penB, M.mul(pm, M.trs(0, 0.16, 0)), 0.002, 0.005, 0.012, 6, [0.15, 0.15, 0.15], true);
    }
    for (let i = 0; i < 4; i++) {
      P.book(bookB, m4(0.85, deskH + 0.003 + i * 0.05, deskZ + 0.0 - i * 0.012, 0, 0.9 - i * 0.2, 0),
        0.26, 0.045, 0.19, [0.35 - i * 0.04, 0.22 + i * 0.05, 0.3 + i * 0.05]);
    }
    const hp = st.pen("headphone", T.darkMetal(), { tint: [0.8, 0.84, 0.9], spec: 0.4 });
    // 耳机支架：底座 + 立杆 + 头梁弧 + 两端耳罩
    const hx = -0.60, hy = deskH + 0.36, hz = deskZ - 0.02;
    hp.cyl.call(hp, m4(hx, deskH, hz), 0.07, 0.06, 0.018, 14, [1, 1, 1], true);
    hp.cyl.call(hp, m4(hx, deskH + 0.018, hz), 0.012, 0.012, 0.45, 8, [1, 1, 1], true);
    hp.tube.call(hp, M.ident(), [
      [hx - 0.10, hy, hz], [hx - 0.075, hy + 0.07, hz], [hx, hy + 0.105, hz],
      [hx + 0.075, hy + 0.07, hz], [hx + 0.10, hy, hz]
    ], 0.012, 6, [1, 1, 1]);
    for (const sx of [-1, 1]) {
      // 左右镜像：左侧向 -X 伸，右侧向 +X 伸，耳罩中心对称
      const rz = sx * Math.PI / 2;
      hp.cyl.call(hp, m4(hx + sx * 0.10, hy, hz, 0, 0, rz), 0.045, 0.045, 0.04, 12, [1, 1, 1], true);
      hp.cyl.call(hp, m4(hx + sx * 0.10, hy, hz, 0, 0, rz), 0.032, 0.032, 0.046, 12, [1, 1, 1], true);
    }
    P.pot(potB, m4(-0.78, deskH + 0.001, deskZ + 0.22), 0.055, 0.075, [0.5, 0.55, 0.65]);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.399 + 0.35;
      const dx = Math.cos(a), dz = -Math.sin(a);
      const rad = 0.045 + (i % 2) * 0.006;
      const lean = 0.32 + (i % 3) * 0.07;
      const lm = M.mul(m4(-0.78 + dx * rad, deskH + 0.077 + (i % 3) * 0.004,
        deskZ + 0.22 + dz * rad, 0, a, 0),
        M.trs(0, 0, 0, 0, 0, Math.PI / 2 - lean));
      P.leafFlat(plantB, lm, 0.13 + (i % 3) * 0.012, 0.026, [0.55, 0.9, 0.5]);
    }
    const photoB = st.pen("photo", A3DTex.poster(4, { title: "", bg: "#b8c8dc", seed: 8, mark: "#6f9fd0" }),
      { unlit: true, tint: [0.9, 0.95, 1.0] });
    photoB.quad.call(photoB, m4(1.9, 1.15, zBack + 0.012), 0.16, 0.2, [1, 1, 1], [0, 0, 1, 1]);
    // 手机：从键盘下方挪到鼠标垫左边
    screenDark.box.call(screenDark, m4(-0.47, deskH + 0.005, deskZ + 0.24, 0, 0.3, 0), 0.07, 0.012, 0.14, [1, 1, 1], 1);
    // 小音箱：黑色箱体 + 圆形单元 + 蓝色指示灯
    Gbox(metalDark, 0.9, deskH + 0.06, deskZ + 0.23, 0.1, 0.12, 0.1, [0.2, 0.24, 0.32]);
    const spk = st.pen("speaker", null, { unlit: true, tint: [0.16, 0.4, 0.8] });
    spk.quad.call(spk, m4(0.9, deskH + 0.07, deskZ + 0.282), 0.03, 0.008, [1, 1, 1], [0, 0, 1, 1]);
    metalDark.cyl.call(metalDark, m4(0.9, deskH + 0.06, deskZ + 0.284, Math.PI / 2, 0, 0), 0.032, 0.032, 0.006, 16, [0.05, 0.06, 0.08], true);

    /* ---------- 给小克留的书桌 + 白板 ---------- */
    A3DDecor.desk(deskTop, metalDark, m4(cx, 0, cz, 0, -Math.PI / 2, 0), 1.9, 0.75, deskH);
    P.chair(metal, m4(1.48, 0, -1.6, 0, Math.PI / 2 + 0.2, 0), [0.38, 0.5, 0.74], [0.55, 0.6, 0.7]);
    const term = st.pen("termBody", T.metal(), { tint: [0.85, 0.9, 1.0], spec: 0.4 });
    // 桌面终端：朝椅子方向（屏幕面向 -X），底座 + 立屏
    const lapM = m4(cx - 0.08, deskH, cz - 0.46, 0, -Math.PI / 2, 0);
    term.box.call(term, M.mul(lapM, M.trs(0, 0.012, 0)), 0.34, 0.024, 0.24, [1, 1, 1], 1);
    screenDark.box.call(screenDark, M.mul(lapM, M.trs(0, 0.027, 0.08)), 0.28, 0.004, 0.1, [0.1, 0.11, 0.13], 1);
    const termTex = A3DTex.dynamic("term", 480, 270, drawTerm);
    const termScreen = st.pen("termScreen", termTex, { unlit: true, tint: [1.0, 0.97, 0.92] });
    const termM = M.mul(lapM, M.trs(0, 0.135, -0.115, -0.22, 0, 0));
    term.box.call(term, termM, 0.34, 0.2, 0.022, [1, 1, 1], 1);
    termScreen.quad.call(termScreen, M.mul(termM, M.trs(0, 0, 0.012)), 0.32, 0.18, [1, 1, 1], [0, 0, 1, 1]);
    for (let i = 0; i < 3; i++) {
      P.book(bookB, m4(cx - 0.18, deskH + 0.003 + i * 0.044, cz + 0.45 - i * 0.012,
        0, Math.PI / 2 + (i - 1) * 0.05, 0),
        0.2, 0.042, 0.16, [0.3 + i * 0.06, 0.2 + i * 0.06, 0.28 + i * 0.04]);
    }
    P.book(bookB, m4(cx + 0.1, deskH + 0.003, cz - 0.1, 0, 0.12, 0), 0.28, 0.04, 0.2, [0.2, 0.16, 0.24]);
    metalDark.cyl.call(metalDark, m4(cx + 0.1, deskH + 0.052, cz - 0.1, Math.PI / 2, 0, 0), 0.008, 0.008, 0.16, 8, [0.8, 0.84, 0.9], true);
    metalDark.cyl.call(metalDark, m4(cx + 0.1, deskH + 0.052, cz - 0.02, Math.PI / 2, 0, 0), 0.004, 0.008, 0.02, 8, [0.4, 0.45, 0.5], true);
    const vase = st.pen("vase", T.plasterPale(), { tint: [0.9, 0.95, 1.0], spec: 0.4 });
    vase.cyl.call(vase, m4(cx + 0.16, deskH + 0.001, cz + 0.38), 0.055, 0.14, 0.13, 12, [1, 1, 1], true);
    const petalB = st.pen("petal", T.petal(), { cutout: true, tint: [1.2, 0.95, 0.7], rim: 0.25 });
    const stemB = st.pen("stem", null, { tint: [0.2, 0.4, 0.22], sway: 0.35 });
    P.chrysanthemum(petalB, stemB, m4(cx + 0.16, deskH + 0.12, cz + 0.38), 0.7, [1.1, 0.9, 0.7], 4);
    const boardTex = A3DTex.dynamic("monitorWb", 512, 320, drawBoard);
    Gbox(paint, RW / 2 - 0.02, 1.55, cz, 0.04, 0.8, 1.16, [1, 1, 1]);
    const bq = st.pen("boardFace", boardTex, { unlit: true, tint: [0.84, 0.88, 0.95] });
    bq.quad.call(bq, m4(RW / 2 - 0.045, 1.55, cz, 0, -Math.PI / 2, 0), 1.08, 0.72, [1, 1, 1], [0, 0, 1, 1]);
    // 白板左边的 MIT + 天平海报
    const mitTex = A3DTex.dynamic("mitPoster", 384, 496, drawMitPoster);
    const mitB = st.pen("mitPoster", mitTex, { unlit: true, tint: [1, 1, 1] });
    mitB.quad.call(mitB, m4(RW / 2 - 0.02, 1.75, -2.92, 0, -Math.PI / 2, 0), 0.714, 0.924, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 墙饰：软木板 / 挂钟 / 海报 ---------- */
    const pinBoard = st.pen("pinBoard", T.linen(), { tint: [0.55, 0.65, 0.8], spec: 0.02 });
    A3DDecor.corkboard(paint, pinBoard, m4(-2.25, 1.65, zBack + 0.02), 0.9, 0.7);
    const noteCols = [[1, 0.95, 0.55], [1, 0.8, 0.72], [0.8, 0.9, 1], [0.85, 1, 0.82]];
    for (let i = 0; i < 4; i++) {
      const np = st.pen("corkNote" + i, T.paper(), { unlit: true, tint: noteCols[i] });
      np.quad.call(np, m4(-2.38 + (i % 2) * 0.28, 1.76 - Math.floor(i / 2) * 0.22, zBack + 0.06, 0, 0, (i % 2 ? 1 : -1) * 0.05),
        0.13, 0.12, [1, 1, 1], [0, 0, 1, 1]);
    }
    const CLK = { x: -2.2, y: 2.25, z: zBack + 0.03 };
    const clockRim = st.pen("clockRim", T.metal(), { tint: [0.9, 0.95, 1.0], spec: 0.45 });
    const clockFace = st.pen("clockFace", T.paper(), { unlit: true, tint: [1.06, 1.0, 0.9] });
    clockRim.cyl.call(clockRim, m4(CLK.x, CLK.y, CLK.z - 0.025, Math.PI / 2, 0, 0), 0.2, 0.2, 0.025, 22, [1, 1, 1], true);
    clockRim.torus.call(clockRim, m4(CLK.x, CLK.y, CLK.z, Math.PI / 2, 0, 0), 0.18, 0.02, 22, 6, [1, 1, 1]);
    clockFace.cyl.call(clockFace, m4(CLK.x, CLK.y, CLK.z + 0.001, Math.PI / 2, 0, 0), 0.165, 0.165, 0.006, 22, [1, 1, 1], true);
    const tickB = st.pen("clockTick", null, { unlit: true, tint: [0.25, 0.2, 0.15] });
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU, major = i % 3 === 0;
      const rr = major ? 0.13 : 0.142, len = major ? 0.03 : 0.015;
      tickB.box.call(tickB, M.mul(M.trs(CLK.x + Math.sin(ang) * rr, CLK.y + Math.cos(ang) * rr, CLK.z + 0.008, 0, 0, -ang),
        M.trs(0, 0, 0)), major ? 0.012 : 0.007, len, 0.003, [1, 1, 1], 1);
    }
    const handB = st.pen("clockHand", null, { tint: [0.12, 0.1, 0.09] });
    handB.box.call(handB, M.mul(M.trs(CLK.x, CLK.y, CLK.z + 0.012, 0, 0, -(10 + 10 / 60) / 12 * TAU), M.trs(0, 0.04, 0)),
      0.014, 0.08, 0.005, [1, 1, 1], 1);
    handB.box.call(handB, M.mul(M.trs(CLK.x, CLK.y, CLK.z + 0.014, 0, 0, -(10 / 60) * TAU), M.trs(0, 0.055, 0)),
      0.01, 0.11, 0.004, [1, 1, 1], 1);
    clockRim.sphere.call(clockRim, m4(CLK.x, CLK.y, CLK.z + 0.018, 0, 0, 0, 1, 1, 0.5), 0.016, 8, 5, [1, 1, 1]);
    // 窗右侧大纸：换成指定的 shh 图片（data URL，file:// 可用）
    const shhTex = A3DTex.dynamic("shhPoster", 512, 596, (x, w, h) => {
      x.fillStyle = "#171717"; x.fillRect(0, 0, w, h);
    });
    const posterB = st.pen("shhPoster", shhTex, { unlit: true, tint: [1, 1, 1] });
    posterB.quad.call(posterB, m4(2.15, 2.02, zBack + 0.012), 0.714, 0.924, [1, 1, 1], [0, 0, 1, 1]);
    const shhImg = new Image();
    shhImg.onload = () => {
      A3DTex.redraw("shhPoster", (x, w, h) => {
        x.fillStyle = "#171717"; x.fillRect(0, 0, w, h);
        const sc = Math.min((w - 16) / shhImg.width, (h - 16) / shhImg.height);
        const dw = shhImg.width * sc, dh = shhImg.height * sc;
        x.drawImage(shhImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
        x.strokeStyle = "#e8e1d0"; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
      });
    };
    shhImg.src = window.ASSET_SHH || "";
    const tapeB = st.pen("tape", T.paper(), { unlit: true, opacity: 0.55, blend: "alpha", tint: [0.92, 0.9, 0.8] });
    tapeB.quad.call(tapeB, m4(1.80, 2.44, zBack + 0.014, 0, 0, 0.35), 0.07, 0.025, [1, 1, 1], [0, 0, 1, 1]);
    tapeB.quad.call(tapeB, m4(2.50, 2.44, zBack + 0.014, 0, 0, -0.35), 0.07, 0.025, [1, 1, 1], [0, 0, 1, 1]);
    tapeB.quad.call(tapeB, m4(1.84, 1.23, zBack + 0.014, 0, 0, 0.35), 0.06, 0.022, [1, 1, 1], [0, 0, 1, 1]);
    tapeB.quad.call(tapeB, m4(1.96, 1.23, zBack + 0.014, 0, 0, -0.35), 0.06, 0.022, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 窗帘 ---------- */
    const curtainB = st.pen("curtain", T.linen(), { tint: night ? [0.55, 0.62, 0.78] : [0.68, 0.8, 1.0] });
    A3DDecor.curtain(curtainB, m4(-1.45, 2.45, zBack + 0.08), 0.32, 1.6);
    A3DDecor.curtain(curtainB, m4(1.45, 2.45, zBack + 0.08), 0.32, 1.6);
    for (const sx of [-1, 1]) {
      P.pot(potB, m4(sx * 1.18, WIN.y0 - 0.015, zBack + 0.12), 0.055, 0.085, [0.5, 0.58, 0.68]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        const dx = Math.cos(a), dz = -Math.sin(a);
        const rad = 0.036;
        const lean = 0.32 + (i % 2) * 0.08;
        const lm = M.mul(m4(sx * 1.18 + dx * rad, WIN.y0 + 0.07 + (i % 2) * 0.004,
          zBack + 0.12 + dz * rad, 0, a, 0),
          M.trs(0, 0, 0, 0, 0, Math.PI / 2 - lean));
        P.leafFlat(plantB, lm, 0.085 + (i % 2) * 0.01, 0.022, [0.55, 0.9, 0.5]);
      }
    }

    /* ---------- 窗外的海 ---------- */
    const seaQuad = new A3D.Builder();
    const seaMesh = A3D.meshFrom(seaQuad.quad.call(seaQuad, m4(0, 1.2, -9.5), 24, 16, [1, 1, 1], [0, 0, 1, 1]));
    st.sea.push({
      mesh: seaMesh, tex: T.caustic(),
      deep: night ? [0.006, 0.025, 0.05] : [0.015, 0.06, 0.1],
      shallow: night ? [0.04, 0.13, 0.2] : [0.14, 0.44, 0.52],
      rayCol: night ? [0.3, 0.6, 0.72] : [0.78, 0.94, 1.0],
      fogCol: night ? [0.01, 0.045, 0.07] : [0.05, 0.16, 0.2],
      causticAmt: night ? 0.45 : 1.15, density: 0.3, yBase: -1.6, ySpan: 5.6
    });
    const rockB = st.pen("seaRock", null, { tint: [0.03, 0.09, 0.12], spec: 0 });
    rocks(rockB, m4(0, -1.1, -8.2), 8, 12, 5, [0.05, 0.12, 0.14]);
    const kelp = st.pen("seaKelp", T.leaf(), { cutout: true, tint: [0.16, 0.42, 0.32], sway: 1, rim: 0.2 });
    for (let i = 0; i < 12; i++) {
      const x = -4.5 + r() * 9, z = -7.2 - r() * 1.6;
      for (let k = 0; k < 3; k++) {
        P.leafBlade(kelp, m4(x + (r() - 0.5) * 0.5, -1.5, z, 0, r() * TAU, 1.1 + r() * 0.3, 1, 1, 1),
          1.2 + r() * 1.2, 0.09, [0.7, 1, 0.9]);
      }
    }
    const flock = A3DFlock.create({
      count: 40, seed: 7,
      bounds: { min: [-1.5, 1.0, -6.8], max: [1.5, 2.35, -5.2] },
      size: 0.18, neighborCount: 7
    });
    const fishMeshRef = fishMesh();
    const fr = rng(91);
    for (let i = 0; i < flock.state.count; i++) {
      const col = P.mix([0.5, 0.78, 0.88], [0.92, 0.98, 1.0], fr() * 0.7);
      st.dyn.push({
        batch: { mesh: fishMeshRef, tint: col, spec: 0.35, rim: 0.45 },
        matrix: () => flock.state.mats[i]
      });
    }

    /* ---------- 玻璃 / 光斑 / 光柱 ---------- */
    const glassB = st.pen("glass", T.glass(), { tint: [0.55, 0.75, 0.9], opacity: 0.24, blend: "alpha", spec: 0.9 });
    glassB.quad.call(glassB, m4(fcx, fcy, zBack + 0.015), fw, fh, [1, 1, 1], [0, 0, 1.6, 1]);
    const causticFloor = st.pen("causticFloor", T.caustic(), {
      unlit: true, blend: "add", opacity: 0.08, tint: [0.5, 0.78, 1.0],
      uvAnim: t => [Math.sin(t * 0.11) * 0.15 + t * 0.01, t * 0.016]
    });
    causticFloor.quad.call(causticFloor, m4(0.05, 0.02, -2.0, -Math.PI / 2, 0, 0), 3.4, 2.6, [1, 1, 1], [0, 0, 1.6, 1.3]);
    const sunPatch = st.pen("sunPatch", T.glow(), { unlit: true, blend: "add", opacity: night ? 0.06 : 0.15, tint: [1.0, 0.84, 0.38] });
    sunPatch.quad.call(sunPatch, m4(0.0, 0.016, -1.7, -Math.PI / 2, 0, 0), 3.0, 2.2, [1, 1, 1], [0, 0, 1, 1]);
    const rayB = st.pen("shafts", T.shaft(), { unlit: true, blend: "add", opacity: night ? 0.06 : 0.12, tint: [0.62, 0.86, 1.0] });
    for (let i = 0; i < 3; i++) {
      // 从窗口斜向地面：顶端在窗内，底端落在房间地板上，不再穿天花板
      rayB.quad.call(rayB, m4(-0.8 + i * 0.8, 1.3, zBack + 0.55 + i * 0.12, -0.55, 0, -0.06 + i * 0.06, 1, 1, 1),
        0.45, 2.4, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ---------- 接触阴影 + 窗光方向的软投影 + 墙脚 AO ---------- */
    const shadowCol = [0.008, 0.012, 0.024];
    const shadowB = st.pen("contactShadow", T.glow(), { unlit: true, blend: "alpha", tint: shadowCol, opacity: 0.62 });
    const sh = (x, z, w, d, rot) => {
      shadowB.quad.call(shadowB, m4(x, 0.014, z, -Math.PI / 2, rot || 0, 0), w, d, [1, 1, 1], [0, 0, 1, 1]);
    };
    sh(-2.2, -2.4, 1.15, 2.05, 0);
    sh(-1.4, -3.15, 0.55, 0.5, 0);
    sh(deskX, deskZ, 2.5, 0.9, 0);
    sh(0.3, -2.15, 0.6, 0.6, 0.25);
    sh(cx, cz, 0.95, 2.1, 0);
    sh(1.48, -1.6, 0.6, 0.6, 0.2);
    sh(-1.3, -2.0, 0.4, 0.4, 0);

    // 墙脚 AO：让地板和墙的交界沉下去
    const aoB = st.pen("floorAO", T.glow(), { unlit: true, blend: "alpha", tint: [0.008, 0.012, 0.022], opacity: 0.32 });
    const ao = (x, z, w, d) => {
      aoB.quad.call(aoB, m4(x, 0.0125, z, -Math.PI / 2, 0, 0), w, d, [1, 1, 1], [0, 0, 1, 1]);
    };
    ao(0, zBack + 0.32, RW - 0.3, 0.55);
    ao(-RW / 2 + 0.3, -0.75, 0.55, 5.2);
    ao(RW / 2 - 0.3, -0.75, 0.55, 5.2);

    // 桌面物件也要有接触阴影，不然在亮桌面上是飘的
    const deskShadowB = st.pen("deskContact", T.glow(), { unlit: true, blend: "alpha", tint: [0.008, 0.012, 0.022], opacity: 0.3 });
    const dsh = (x, y, z, w, d, rot) => {
      deskShadowB.quad.call(deskShadowB, m4(x, y, z, -Math.PI / 2, rot || 0, 0), w, d, [1, 1, 1], [0, 0, 1, 1]);
    };
    const dtop = deskH + 0.0015;
    dsh(-0.35, dtop, deskZ - 0.1, 0.55, 0.3, 0);
    dsh(-1.0, dtop, deskZ - 0.08, 0.24, 0.24, 0);
    dsh(-0.92, dtop, deskZ + 0.26, 0.22, 0.22, 0);
    dsh(-0.5, dtop, deskZ + 0.24, 0.18, 0.18, 0);
    dsh(0.66, dtop, deskZ + 0.3, 0.12, 0.12, 0);
    dsh(-0.7, dtop, deskZ + 0.28, 0.3, 0.22, 0.15);
    dsh(0.28, dtop, deskZ + 0.33, 0.2, 0.2, 0.35);
    dsh(0.98, dtop, deskZ + 0.35, 0.3, 0.25, 0.1);
    dsh(-0.78, dtop, deskZ + 0.22, 0.15, 0.15, 0);
    dsh(1.02, dtop, deskZ + 0.05, 0.14, 0.16, 0);
    dsh(-1.4, 0.4965, -3.15, 0.22, 0.22, 0);
    dsh(-1.47, 0.4965, -3.23, 0.16, 0.14, 0.3);
    dsh(-1.25, 0.4965, -3.09, 0.1, 0.1, 0);
    dsh(cx - 0.08, dtop, cz - 0.48, 0.4, 0.3, 0.05);
    dsh(cx - 0.34, dtop, cz + 0.52, 0.24, 0.24, 0);
    dsh(cx + 0.1, dtop, cz - 0.1, 0.24, 0.2, 0.12);
    dsh(cx + 0.16, dtop, cz + 0.38, 0.18, 0.18, 0);

    /* ---------- 吊灯 / 光晕 / 壁灯 ---------- */
    const lampMetal = st.pen("lampMetal", T.brass(), { tint: [1, 1, 1], spec: 0.5, noShadow: true });
    const lampShade = st.pen("lampShade", T.linen(), { tint: [1.05, 0.98, 0.7], emissive: [0.7, 0.52, 0.2], emisBoost: 1.55, noShadow: true });
    Gbox(lampMetal, 0, RH - 0.02, -1.4, 0.4, 0.02, 0.4, [1, 1, 1]);
    P.paperLantern(lampShade, lampMetal, m4(0, RH - 0.5, -1.4), 0.14, [1.0, 0.9, 0.56]);
    const cordB = st.pen("cord", null, { tint: [0.14, 0.1, 0.08] });
    cordB.cyl.call(cordB, m4(0, 2.42, -1.4), 0.006, 0.006, 0.38, 4, [1, 1, 1], false);
    const sconce = st.pen("sconce", T.metal(), { tint: [1.0, 0.95, 0.85], spec: 0.5 });
    const sconceShade = st.pen("sconceShade", T.linen(), { tint: [1.1, 0.99, 0.7], emissive: [0.7, 0.52, 0.2], emisBoost: 1.55 });
    sconce.box.call(sconce, m4(RW / 2 - 0.08, 2.38, cz), 0.16, 0.025, 0.025, [1, 1, 1], 1);
    sconce.cyl.call(sconce, m4(RW / 2 - 0.16, 2.32, cz), 0.05, 0.04, 0.06, 10, [1, 1, 1], true);
    sconceShade.cyl.call(sconceShade, m4(RW / 2 - 0.16, 2.18, cz), 0.12, 0.08, 0.15, 14, [1, 1, 1], false);

    /* ---------- 粒子 ---------- */
    const pts = [];
    for (let i = 0; i < 90; i++) {
      pts.push({
        x: (r() - 0.5) * (RW - 0.4), y: 0.4 + r() * 2.4, z: zBack + 0.3 + r() * (zFront - zBack - 0.6),
        r: 0.8, g: 0.9, b: 1, a: 0.08 + r() * 0.22,
        size: 0.004 + r() * 0.01, kind: 2, speed: 0.05 + r() * 0.08, phase: r() * TAU, wob: 0.06 + r() * 0.1
      });
    }
    for (let i = 0; i < 40; i++) {
      pts.push({
        x: -3 + r() * 6, y: 0 + r() * 3.2, z: -7 + r() * 2.2,
        r: 0.6, g: 0.85, b: 1, a: 0.1 + r() * 0.22,
        size: 0.01 + r() * 0.03, kind: 1, speed: 0.4 + r() * 0.5, phase: r() * TAU, wob: 0.05 + r() * 0.1
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "alpha", yMin: -0.3, yMax: 4.2, fogNear: 4, fogFar: 18 });

    st.finish();
    st.finishGlows();

    return {
      cam: { eye: [-0.95, 1.5, 1.55], target: [0.1, 1.15, -3.5], fov: 50 },
      sky: {
        mode: 1, top: night ? [0.03, 0.1, 0.17] : [0.1, 0.3, 0.38],
        bot: night ? [0.008, 0.03, 0.05] : [0.04, 0.11, 0.14],
        glow: night ? [0.14, 0.3, 0.38] : [0.34, 0.58, 0.62], sun: [0.42, 0.9], horizon: 0.12
      },
      lights: {
        sun: A3D.norm3([-0.342, 0.831, -0.44]),
        sunCol: night ? [0.2, 0.19, 0.2] : [0, 0, 0],
        skyCol: night ? [0.18, 0.2, 0.26] : [0, 0, 0],
        groundCol: night ? [0.14, 0.12, 0.12] : [0.19, 0.16, 0.13],
        fog: { col: night ? [0.04, 0.04, 0.05] : [0.08, 0.09, 0.1], near: 5, far: 22 },
        fogAmt: 0.3,
        points: [
          { name: "吊灯", pos: [0, 2.4, -1.4], col: [1.0, 0.671, 0.361], range: 6.0, inten: night ? 1.3 : 1.0 },
          { name: "壁灯", pos: [RW / 2 - 0.35, 2.15, cz], col: [1.0, 0.639, 0.302], range: 5.0, inten: 1.04 },
          { name: "台灯", pos: [-1.0, 1.3, -2.9], col: [0.996, 0.847, 0.365], range: 3.4, inten: night ? 1.2 : 0 },
          { name: "显示器", pos: [monX, monY, monZ + 0.45], col: [0, 0.102, 0.341], range: 2.8, inten: night ? 1.0 : 1.33 },
          { name: "窗光", pos: [0, 1.9, zBack + 0.2], col: [0, 0.416, 1.0], range: 7.0, inten: night ? 0.3 : 0.1 },
          { name: "床头灯", pos: [-1.4, 0.8, -3.15], col: [1.0, 0.678, 0.38], range: 4.2, inten: 0.88 }
        ]
      },
      shadow: { pos: [0, 2.4, -1.4], far: 9, index: 0, bias: 0.002, size: 2048 },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows, sea: st.sea,
      flock: flock,
      tone: night ? [0.94, 0.92, 0.94] : [0.91, 0.9, 0.88],
      post: false,   // 这间房在游戏里跳过调色/暗角/颗粒，保留警报/闪白/故障
      swayAmp: 0.5,
      update(t, sc) {
        sc.cam.eye = [-0.95 + Math.sin(t * 0.21) * 0.03, 1.5 + Math.sin(t * 0.33) * 0.01, 1.55 + Math.cos(t * 0.18) * 0.025];
        sc.cam.target = [0.1 + Math.sin(t * 0.17) * 0.03, 1.15 + Math.sin(t * 0.27) * 0.008, -3.5];
        const dt = Math.min(0.05, Math.max(0, t - lastT));
        lastT = t;
        flock.update(dt, t);
        flock.matrices();
        /* 屏幕上的三块动态贴图：重传 + 上传都算卡顿，频率压到还剩"活着"的观感。
         * 显示器约 7 次/秒、终端 5.5 次/秒、白板 3 次/秒。 */
        if (t - MON.lastDraw > 0.14) {
          MON.lastDraw = t;
          A3DTex.redraw("monitor", drawMonitor);
        }
        if (t - lastTerm > 0.18) {
          lastTerm = t;
          A3DTex.redraw("term", drawTerm);
        }
        if (t - lastBoard > 0.34) {
          lastBoard = t;
          A3DTex.redraw("monitorWb", drawBoard);
        }
      },
      whiteboard: !night
    };
  }

  /* ---------------- 注册 ----------------
   * 同一个场景挂多个 id 时必须注册同一个函数对象：构建结果（__built）挂在函数对象上，
   * 不同闭包会让整个房间连同 2048² 的 shadow cubemap 各建一份（≈100MB 一份）。
   * 下图三兄弟本来就都是 buildRoomCompact({night:false})，共用一份即可。 */
  const buildRoomDay = () => buildRoomCompact({ night: false });

  function registerAll() {
      A3D.register("ds_room", buildRoomDay);
    A3D.register("ds_room_night", buildRoomDay); // 不再区分白天晚上
    A3D.register("ds_room_dawn", buildRoomDay);  // 同上，是 ds_room 的别名
    A3D.register("claude_lib", buildLib);
  }

  if (typeof window !== "undefined") registerAll();

  return { registerAll, buildRoomCompact, buildLib };
})();


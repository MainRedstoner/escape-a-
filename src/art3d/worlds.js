/* ============================================================
 * Escape A÷ · src/art3d/worlds.js —— 3D 场景
 *
 * 每个场景都注册到 A3D：A3D.register(id, builder)。
 * 场景返回 { cam, sky, lights, batches, over, dyn, points, glows, sea, tone, update }。
 *
 * 目前已经接上的地方：
 *   sea            标题画面 / 深海（小鲸的“家”外面）
 *   ds_room        联合蒸馏室 = DeepSeek 家里（窗外的深海、训练日志、白板曲线）
 *   ds_room_night  同一间屋子，深夜
 *   claude_door    Claude 家庄园的门（紧闭）
 *   claude_door_403  被 403 封住的门（门上有一个巨大的、空心的 0）
 *   claude_lib     Claude 家里：四面书架、菊花、夕阳
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

  let whaleMeshCache = null;
  function whaleMesh() {
    if (whaleMeshCache) return whaleMeshCache;
    const b = new A3D.Builder();
    const nm = A3D.M.normalMat(M.ident());
    // 身体：沿 +X 放样，尾细头圆，横截面比竖截面宽
    const rings = 16, seg = 10;
    const P = (i, k) => {
      const t = i / (rings - 1);
      const x = -4.6 + t * 9.0;
      const shape = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.05)), 0.55);
      const r = 1.45 * shape * (0.72 + 0.42 * t) + 0.008;
      const a = (k / seg) * TAU;
      return [x, Math.cos(a) * r * 0.82, Math.sin(a) * r];
    };
    for (let i = 0; i < rings - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const k2 = (k + 1) % seg;
        const q = [P(i, k), P(i + 1, k), P(i + 1, k2), P(i, k2)];
        const uv = [[i / rings, k / seg], [(i + 1) / rings, k / seg], [(i + 1) / rings, (k + 1) / seg], [i / rings, (k + 1) / seg]];
        for (let z = 0; z < 4; z++) {
          const p = q[z];
          const n = A3D.norm3([p[1] * 0.25, p[1], p[2] * 0.9]);
          const sh = 0.66 + 0.34 * (1 - (p[1] / 1.3 + 1) * 0.5);
          b._v(b.d, M.ident(), nm, p[0], p[1], p[2], n[0], n[1], n[2], uv[z][0], uv[z][1], [sh, sh, sh], 0);
        }
        b._pushQuad(b.count - 4);
      }
    }
    // 尾鳍：两片扁平的尾叶
    b.tri(M.ident(), [-4.2, 0.05, 0], [-6.4, 0.35, 1.7], [-4.9, 0, 0.35], null, [0.86, 0.86, 0.86]);
    b.tri(M.ident(), [-4.2, 0.05, 0], [-4.9, 0, -0.35], [-6.4, 0.35, -1.7], null, [0.8, 0.8, 0.8]);
    b.tri(M.ident(), [-4.2, -0.05, 0], [-6.4, 0.35, 1.7], [-4.2, 0.05, 0], null, [0.9, 0.9, 0.9]);
    // 胸鳍：向后掠
    b.tri(M.ident(), [1.4, -0.55, 0.7], [0.0, -1.15, 2.5], [0.5, -0.8, 0.6], null, [0.82, 0.82, 0.82]);
    b.tri(M.ident(), [1.4, -0.55, -0.7], [0.0, -1.15, -2.5], [0.5, -0.8, -0.6], null, [0.82, 0.82, 0.82]);
    // 背鳍
    b.tri(M.ident(), [-1.9, 0.7, 0], [-1.1, 1.08, 0], [-0.7, 0.72, 0], null, [0.9, 0.9, 0.9]);
    whaleMeshCache = A3D.meshFrom(b);
    return whaleMeshCache;
  }

  /** 把一片鱼群变成 dyn 列表：绕中心缓慢巡游 */
  function fishSchool(st, opts) {
    const mesh = fishMesh();
    const r = rng(opts.seed || 3);
    const fishes = [];
    const n = opts.n || 14;
    for (let i = 0; i < n; i++) {
      const rad = opts.radius * (0.55 + r() * 0.75);
      const spd = opts.speed * (0.7 + r() * 0.6) * (r() < 0.15 ? -1 : 1);
      const ph = r() * TAU;
      const yb = opts.y + (r() - 0.5) * opts.spreadY;
      const cx = opts.x + (r() - 0.5) * opts.spreadX;
      const cz = opts.z + (r() - 0.5) * opts.spreadZ;
      const tilt = opts.radius * 0.45;
      const s = (opts.size || 1) * (0.5 + r() * 0.8);
      const col = P.mix(opts.col || [0.55, 0.78, 0.85], [0.9, 0.95, 1.0], r() * 0.6);
      const batch = { mesh: mesh, tint: col, spec: 0.4, rim: 0.5 };
      const fn = t => {
        const a = ph + t * spd / rad;
        const px = cx + Math.cos(a) * rad;
        const pz = cz + Math.sin(a) * rad * 0.55;
        const py = yb + Math.sin(a * 1.7 + ph) * tilt * 0.5;
        const dx = -Math.sin(a) * rad;
        const dz = Math.cos(a) * rad * 0.55;
        const dy = Math.cos(a * 1.7 + ph) * tilt * 0.5;
        const yaw = Math.atan2(-dz, dx);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz)) * 0.6;
        const roll = Math.sin(t * 1.7 + ph) * 0.12;
        return M.trs(px, py, pz, roll, yaw, pitch, s, s, s);
      };
      st.dyn.push({ batch, matrix: fn });
      fishes.push({ batch, fn });
    }
    return fishes;
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
   *  深海（标题画面）
   * ============================================================ */
  function buildSea() {
    const st = P.stage();
    const tone = [0.72, 0.88, 1.0];

    // 远处的礁石 / 海床剪影
    const rockB = st.pen("rock", null, { tint: [0.06, 0.15, 0.19], rim: 0.15, spec: 0 });
    rocks(rockB, m4(0, -3.8, -18), 11, 30, 3, [0.07, 0.15, 0.19]);
    // 海带
    const kelp = st.pen("kelp", T.leaf(), { cutout: true, tint: [0.18, 0.5, 0.36], sway: 1, rim: 0.25 });
    const kr = rng(21);
    for (let i = 0; i < 26; i++) {
      const x = -12 + kr() * 24, z = -10 - kr() * 8;
      const h = 3 + kr() * 5;
      for (let k = 0; k < 4; k++) {
        P.leafBlade(kelp, m4(x + (kr() - 0.5) * 0.8, -3.4, z + (kr() - 0.5) * 0.8,
          0, kr() * TAU, 1.2 + kr() * 0.5, 1, 1, 1), h * (0.6 + kr() * 0.5), 0.3, [0.7, 1, 0.85]);
      }
    }

    // 鱼群
    fishSchool(st, { x: -4, y: 0.2, z: -9, radius: 4.6, spreadX: 3, spreadY: 1.6, spreadZ: 2,
      n: 30, speed: 0.5, size: 0.55, seed: 7, col: [0.5, 0.78, 0.86] });
    fishSchool(st, { x: 5, y: -0.8, z: -12, radius: 5.5, spreadX: 2, spreadY: 2, spreadZ: 1,
      n: 18, speed: 0.35, size: 0.9, seed: 13, col: [0.36, 0.6, 0.72] });

    // 鲸鱼：远远地横穿过去
    const whale = whaleMesh();
    st.dyn.push({
      batch: { mesh: whale, tint: [0.05, 0.13, 0.19], spec: 0.2, rim: 0.2, unlit: false },
      matrix: t => {
        const a = t * 0.04;
        return M.trs(Math.cos(a) * 10 - 2, 2.3 + Math.sin(t * 0.3) * 0.5, -32 + Math.sin(a) * 4,
          0, 0.3 + Math.sin(a) * 0.3, Math.sin(t * 0.35) * 0.04, 0.8, 0.8, 0.8);
      }
    });

    // 气泡
    const pts = [];
    const r = rng(31);
    for (let i = 0; i < 140; i++) {
      pts.push({
        x: (r() - 0.5) * 22, y: -5 + r() * 12, z: -13 + r() * 10,
        r: 0.55 + r() * 0.4, g: 0.8 + r() * 0.2, b: 0.9, a: 0.12 + r() * 0.3,
        size: 0.015 + r() * 0.05, kind: 1, speed: 0.5 + r() * 0.8, phase: r() * TAU, wob: 0.06 + r() * 0.1
      });
    }
    for (let i = 0; i < 260; i++) {
      pts.push({
        x: (r() - 0.5) * 26, y: -5 + r() * 14, z: -16 + r() * 12,
        r: 0.7, g: 0.85, b: 1, a: 0.1 + r() * 0.25,
        size: 0.006 + r() * 0.012, kind: 2, speed: 0.12 + r() * 0.2, phase: r() * TAU, wob: 0.1 + r() * 0.2
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "alpha", yMin: -6, yMax: 10, fogNear: 8, fogFar: 40 });

    // 光柱
    const ray = st.glow("rays", T.shaft(), { opacity: 0.16, blend: "add", tint: [0.45, 0.85, 1.0] });
    const rr = rng(41);
    for (let i = 0; i < 9; i++) {
      const x = -14 + rr() * 28;
      const m = m4(x, 6, -18 + rr() * 14, 0, rr() * 0.5 - 0.25, 0.25 + rr() * 0.2, 1, 1, 1);
      ray.quad.call(ray, M.mul(m, m4(0, -11, 0)), 4 + rr() * 5, 22, [1, 1, 1], [0, 0, 1, 1]);
    }

    st.finish();
    st.finishGlows();
    return {
      cam: { eye: [0, 0.2, 7.5], target: [0, 0.6, -6], fov: 44 },
      sky: {
        mode: 1, top: [0.06, 0.24, 0.32], bot: [0.01, 0.04, 0.07],
        glow: [0.25, 0.62, 0.72], sun: [0.44, 0.96], horizon: 0.2
      },
      lights: {
        sun: A3D.norm3([-0.35, 1, 0.2]), sunCol: [0.34, 0.52, 0.58],
        skyCol: [0.16, 0.3, 0.38], groundCol: [0.01, 0.03, 0.05],
        fog: { col: [0.02, 0.09, 0.13], near: 10, far: 44 }, fogAmt: 0.85
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows,
      tone: tone, swayAmp: 0.5,
      update(t, sc) {
        const c = sc.cam;
        c.eye = [Math.sin(t * 0.07) * 0.6, 0.15 + Math.sin(t * 0.13) * 0.18, 7.5];
      }
    };
  }

  /* ============================================================
   *  DeepSeek 家里 / 联合蒸馏室
   * ============================================================ */
  const MON = {
    lines: [
      "$ python train.py --config ds_v3.yaml",
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
    x: 0, t0: 0, lastDraw: 0, loss: []
  };
  function drawMonitor(x, w, h) {
    const now = (MON.t0 ? (performance.now() - MON.t0) / 1000 : 0);
    x.fillStyle = "#070d12"; x.fillRect(0, 0, w, h);
    // 顶栏
    x.fillStyle = "#0d1a22"; x.fillRect(0, 0, w, 30);
    x.fillStyle = "#4fa3c7"; x.font = "bold 15px Consolas,monospace";
    x.fillText("train.py  ·  ds_v3  ·  8×H800", 12, 20);
    x.fillStyle = "#2f6f88"; x.fillText("exp/2026-10-24", w - 168, 20);
    // 分割线
    x.strokeStyle = "#12303d"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, 30); x.lineTo(w, 30); x.stroke();
    // 左边：loss 曲线
    const gx = 16, gy = 46, gw = w * 0.56, gh = h - 150;
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
    // 日志
    const ly = h - 92;
    x.strokeStyle = "#12303d"; x.beginPath(); x.moveTo(0, ly - 12); x.lineTo(w, ly - 12); x.stroke();
    x.font = "12px Consolas,monospace";
    const off = Math.floor(now * 1.6) % (MON.lines.length * 18);
    for (let i = 0; i < 6; i++) {
      const idx = Math.floor(off / 18) + i;
      const line = MON.lines[idx % MON.lines.length];
      const yy = ly + i * 15 - (off % 18);
      if (yy < ly - 4 || yy > h - 4) continue;
      x.fillStyle = line.indexOf("loss") >= 0 || line.indexOf("eval") >= 0 ? "#8fe3b8" : "#6f9fb0";
      x.fillText(line.slice(0, 92), 10, yy);
    }
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

  function buildRoom(opts) {
    const night = !!opts.night;
    const st = P.stage();
    const r = rng(11);
    let lastT = 0;

    const RW = 7.0, RD = 7.0, RH = 3.05;      // 房间：x ±3.5，z -4.4..2.6
    const zBack = -4.4, zFront = 2.6;
    const WIN = { x0: -1.9, x1: 1.45, y0: 0.82, y1: 2.6, z: zBack };

    /* ---------- 地板 ---------- */
    const floor = st.pen("floor", T.wood(), { tint: night ? [0.62, 0.62, 0.66] : [1.05, 0.95, 0.85], spec: 0.35 });
    floor.grid.call(floor, m4(0, 0, (zBack + zFront) / 2), RW, zFront - zBack, 14, 16,
      [0.9, 0.8, 0.7], 2.1, 0.14, 0);
    // 踢脚线
    const trim = st.pen("trim", T.woodDark(), { tint: [0.7, 0.72, 0.8] });
    Gbox(trim, 0, 0.06, zBack + 0.03, RW, 0.12, 0.06, [0.8, 0.8, 0.85]);

    /* ---------- 后墙（带窗洞，用格子跳过窗口） ---------- */
    const wall = st.pen("wall", T.plaster(), { tint: night ? [0.82, 0.9, 1.08] : [1.36, 1.4, 1.46], spec: 0.05 });
    const cw = 0.22;
    const cols = Math.round(RW / cw), rows = Math.round(RH / cw);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x0 = -RW / 2 + i * cw, x1 = x0 + cw;
        const y0 = j * cw, y1 = y0 + cw;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        if (cx > WIN.x0 && cx < WIN.x1 && cy > WIN.y0 && cy < WIN.y1) continue;
        const k = 0.94 + r() * 0.12;
        wall.quad.call(wall, m4(cx, cy, zBack, 0, 0, 0), cw, cw,
          [k, k, k * 0.99], [i / cols * RW, j / rows * RH, (i + 1) / cols * RW, (j + 1) / rows * RH]);
      }
    }
    // 窗洞内侧的窗套：外框 + 内框 + 窗洞进深，让窗户真的嵌在墙里
    const frame = st.pen("frame", T.woodDark(), { tint: [1.25, 1.12, 0.92], spec: 0.3 });
    const fcx = (WIN.x0 + WIN.x1) / 2, fcy = (WIN.y0 + WIN.y1) / 2;
    const fw = WIN.x1 - WIN.x0, fh = WIN.y1 - WIN.y0;
    // 窗洞进深（墙内侧的四面）
    const dT = 0.2;
    Gbox(frame, WIN.x0 - 0.02, fcy, zBack - dT / 2, 0.04, fh + 0.02, dT, [0.82, 0.82, 0.8]);
    Gbox(frame, WIN.x1 + 0.02, fcy, zBack - dT / 2, 0.04, fh + 0.02, dT, [0.82, 0.82, 0.8]);
    Gbox(frame, fcx, WIN.y1 + 0.02, zBack - dT / 2, fw + 0.06, 0.04, dT, [0.8, 0.8, 0.78]);
    Gbox(frame, fcx, WIN.y0 - 0.02, zBack - dT / 2, fw + 0.06, 0.04, dT, [0.8, 0.8, 0.78]);
    // 外框（露在房间里这一侧）
    Gbox(frame, fcx, WIN.y1 + 0.09, zBack + 0.06, fw + 0.34, 0.14, 0.13, [1, 1, 1]);
    Gbox(frame, WIN.x0 - 0.1, fcy, zBack + 0.06, 0.2, fh + 0.32, 0.13, [1, 1, 1]);
    Gbox(frame, WIN.x1 + 0.1, fcy, zBack + 0.06, 0.2, fh + 0.32, 0.13, [1, 1, 1]);
    // 内框（细一圈，压出层次）
    Gbox(frame, fcx, WIN.y1 - 0.01, zBack + 0.02, fw + 0.02, 0.1, 0.08, [0.92, 0.9, 0.84]);
    Gbox(frame, WIN.x0 + 0.02, fcy, zBack + 0.02, 0.09, fh, 0.08, [0.92, 0.9, 0.84]);
    Gbox(frame, WIN.x1 - 0.02, fcy, zBack + 0.02, 0.09, fh, 0.08, [0.92, 0.9, 0.84]);
    // 中挺与横挡
    Gbox(frame, fcx - 0.28, fcy, zBack + 0.02, 0.07, fh, 0.07, [0.95, 0.93, 0.88]);
    Gbox(frame, fcx, WIN.y0 + fh * 0.66, zBack + 0.02, fw, 0.07, 0.07, [0.95, 0.93, 0.88]);
    // 拱形装饰（窗上方的木弧）
    const arcW = fw / 2 + 0.16;
    for (let i = 0; i < 14; i++) {
      const a0 = Math.PI * (i / 14), a1 = Math.PI * ((i + 1) / 14);
      const cx0 = Math.cos(a0) * arcW, cy0 = WIN.y1 + 0.1 + Math.sin(a0) * 0.3;
      const cx1 = Math.cos(a1) * arcW, cy1 = WIN.y1 + 0.1 + Math.sin(a1) * 0.3;
      const mx = (cx0 + cx1) / 2 + fcx, my = (cy0 + cy1) / 2;
      const len = Math.hypot(cx1 - cx0, cy1 - cy0);
      frame.box.call(frame, m4(mx, my, zBack + 0.05, 0, 0, Math.atan2(cy1 - cy0, cx1 - cx0)),
        len + 0.03, 0.06, 0.055, [1, 1, 1], 1.4);
    }
    // 窗台
    const sill = st.pen("sill", T.woodPale(), { tint: [1.0, 1.02, 1.02] });
    Gbox(sill, fcx, WIN.y0 - 0.055, zBack + 0.11, fw + 0.5, 0.075, 0.3, [1, 1, 1]);
    // 窗台小物：两盆小小植物、一只贝壳
    const plantB = st.pen("leaf", T.leaf(), { cutout: true, tint: [0.9, 1.0, 0.9], sway: 0.6, rim: 0.2 });
    const potB = st.pen("pot", T.stone(), { tint: [0.9, 0.85, 0.8] });
    P.pot(potB, m4(WIN.x0 + 0.36, WIN.y0 - 0.012, zBack + 0.13), 0.075, 0.12, [0.6, 0.5, 0.42]);
    for (let i = 0; i < 6; i++) {
      P.leafBlade(plantB, m4(WIN.x0 + 0.36, WIN.y0 + 0.12, zBack + 0.11, 0, i * 1.1, 0.7 + (i % 3) * 0.2),
        0.2 + (i % 4) * 0.04, 0.03, [0.6, 1, 0.6]);
    }
    P.pot(potB, m4(WIN.x1 - 0.3, WIN.y0 - 0.012, zBack + 0.13), 0.06, 0.09, [0.5, 0.42, 0.38]);
    for (let i = 0; i < 5; i++) {
      P.leafBlade(plantB, m4(WIN.x1 - 0.3, WIN.y0 + 0.09, zBack + 0.11, 0, i * 1.3 + 0.4, 0.8),
        0.16, 0.022, [0.7, 1, 0.7]);
    }

    /* ---------- 左右墙 / 天花板 ---------- */
    const sideWall = st.pen("side", T.plaster(), { tint: night ? [0.76, 0.84, 1.02] : [1.28, 1.32, 1.4] });
    sideWall.quad.call(sideWall, m4(-RW / 2, RH / 2, (zBack + zFront) / 2, 0, Math.PI / 2, 0),
      zFront - zBack, RH, [0.95, 0.97, 1], [0, 0, 3.2, 3]);
    sideWall.quad.call(sideWall, m4(RW / 2, RH / 2, (zBack + zFront) / 2, 0, -Math.PI / 2, 0),
      zFront - zBack, RH, [0.9, 0.93, 0.98], [0, 0, 3.2, 3]);
    const ceil = st.pen("ceil", T.plaster(), { tint: [0.95, 0.98, 1.08] });
    ceil.grid.call(ceil, m4(0, RH, (zBack + zFront) / 2, Math.PI, 0, 0, 1, 1, 1),
      RW, zFront - zBack, 8, 8, [0.8, 0.86, 0.95], 1, 0.05, 0);
    // 横梁
    const beam = st.pen("beam", T.woodDark(), { tint: [0.85, 0.88, 0.95] });
    for (const z of [-2.6, -0.2, 2.0]) {
      Gbox(beam, 0, RH - 0.11, z, RW, 0.2, 0.16, [1, 1, 1]);
    }

    /* ---------- 家具：DeepSeek 的桌子（窗下） ---------- */
    const wood = st.pen("deskwood", T.woodDark(), { tint: [0.98, 1.0, 1.05], spec: 0.28 });
    const deskX = 0.0, deskZ = -3.70, deskW = 2.5, deskD = 0.82, deskH = 0.75;
    P.table(wood, m4(deskX, deskH, deskZ), deskW, deskD, deskH, [0.55, 0.4, 0.3], 0.07);
    // 抽屉柜：从地面立起来，别再悬空
    Gbox(wood, deskX + 0.78, 0.34, deskZ + 0.02, 0.72, 0.68, 0.62, [0.5, 0.36, 0.26]);
    Gbox(wood, deskX + 0.78, 0.56, deskZ + 0.34, 0.64, 0.22, 0.02, [0.55, 0.4, 0.3]);
    Gbox(wood, deskX + 0.78, 0.31, deskZ + 0.34, 0.64, 0.2, 0.02, [0.5, 0.36, 0.26]);
    Gbox(wood, deskX + 0.78, 0.56, deskZ + 0.36, 0.16, 0.018, 0.018, [0.8, 0.66, 0.36]);
    Gbox(wood, deskX + 0.78, 0.31, deskZ + 0.36, 0.16, 0.018, 0.018, [0.8, 0.66, 0.36]);

    /* ---------- 显示器 + 键盘 ---------- */
    const monW = 0.76, monH = 0.44, monX = deskX - 0.56, monY = deskH + 0.32, monZ = deskZ - 0.11;
    P.monitorBody(wood, m4(monX, monY, monZ, 0, 0.06, 0));
    MON.t0 = performance.now();
    const monTex = A3DTex.dynamic("monitor", 640, 400, drawMonitor);
    const screenP = st.pen("monitorScreen", monTex, { unlit: true, tint: [1, 1, 1] });
    screenP.quad.call(screenP, m4(monX, monY, monZ + 0.026, 0, 0.06, 0), monW - 0.03, monH - 0.03, [1, 1, 1], [0, 0, 1, 1]);
    P.keyboard(wood, m4(deskX + 0.12, deskH + 0.012, deskZ + 0.19, 0, 0.04, 0), 0.46);
    P.mouse(wood, m4(deskX + 0.52, deskH + 0.034, deskZ + 0.2));
    const mugB = st.pen("mug", T.plaster(), { tint: [1, 1, 1] });
    P.mug(mugB, m4(deskX + 0.92, deskH + 0.001, deskZ - 0.1), 0.045, [0.85, 0.86, 0.92]);
    // 鲸鱼图案（一小块浅蓝）
    const mugArt = st.pen("mugArt", null, { tint: [0.35, 0.55, 1.0] });
    mugArt.box.call(mugArt, m4(deskX + 0.92, deskH + 0.046, deskZ - 0.1 + 0.046),
      0.045, 0.022, 0.002, [1, 1, 1], 1);
    P.papers(st.pen("paper", T.paper(), { tint: [1, 1, 1], spec: 0.02 }),
      m4(deskX - 0.14, deskH + 0.001, deskZ + 0.26), 3, 9);
    // 台灯
    const lampMetal = st.pen("lampMetal", T.brass(), { tint: [1, 1, 1], spec: 0.5 });
    const lampShade = st.pen("lampShade", T.canvasTex(), { tint: [1.15, 1.02, 0.82], emissive: [0.28, 0.18, 0.06] });
    P.tableLamp(lampMetal, lampShade, m4(deskX - 1.04, deskH + 0.001, deskZ - 0.16), 0.38, [0.92, 0.84, 0.66]);
    // 椅子
    P.chair(st.pen("chair", T.fabric(), { tint: [0.9, 0.94, 1.0] }),
      m4(deskX + 1.15, 0, deskZ + 0.75, 0, Math.PI + 0.35, 0), [0.34, 0.36, 0.4], [0.35, 0.24, 0.16]);
    void deskW;

    /* ---------- Claude 的桌子（右墙） ---------- */
    const cx = 3.1, cz = -1.9;
    P.table(wood, m4(cx, deskH, cz, 0, Math.PI / 2, 0), 2.0, 0.8, deskH, [0.5, 0.37, 0.28], 0.07);
    // 整齐的书堆
    const bookB = st.pen("book", T.fabric(), { tint: [1, 1, 1] });
    for (let i = 0; i < 4; i++) {
      P.book(bookB, m4(cx - 0.34, deskH + 0.003 + i * 0.055, cz + 0.55 - i * 0.01, 0, Math.PI / 2, 0),
        0.22, 0.055, 0.3, [0.55 - i * 0.05, 0.18 + i * 0.04, 0.14 + i * 0.03]);
    }
    // 合上的笔记本 + 笔
    P.book(bookB, m4(cx + 0.1, deskH + 0.003, cz - 0.1, 0, 0.12, 0), 0.3, 0.04, 0.22, [0.14, 0.14, 0.17]);
    Gbox(st.pen("pen", T.brass(), { tint: [1, 1, 1], spec: 0.6 }),
      cx + 0.1, deskH + 0.055, cz - 0.02, 0.02, 0.02, 0.2, [1, 1, 1]);
    // 一朵橙色的花（小鲸每天换水的那一朵）
    const stemB = st.pen("stem", null, { tint: [0.25, 0.45, 0.22] });
    const petalB = st.pen("petal", T.petal(), { cutout: true, tint: [1.15, 0.95, 0.8], rim: 0.2 });
    P.pot(st.pen("vase", T.glass(), { tint: [0.8, 0.9, 1.0], spec: 0.7 }),
      m4(cx + 0.18, deskH + 0.001, cz + 0.42), 0.055, 0.14, [0.7, 0.8, 0.85]);
    P.chrysanthemum(petalB, stemB, m4(cx + 0.18, deskH + 0.12, cz + 0.42), 0.8, [1.1, 0.9, 0.7], 4);
    // 小终端（Clawd 的窝）
    const term = st.pen("termBody", T.metal(), { tint: [0.9, 0.95, 1.0], spec: 0.4 });
    Gbox(term, cx - 0.1, deskH + 0.015, cz - 0.52, 0.34, 0.03, 0.26, [1, 1, 1]);
    // Claude 的椅子
    P.chair(st.pen("chair2", T.fabric(), { tint: [0.85, 0.8, 0.75] }),
      m4(cx - 0.72, 0, cz + 0.15, 0, Math.PI / 2 + 0.25, 0), [0.36, 0.28, 0.24], [0.32, 0.2, 0.13]);

    /* ---------- DeepSeek 桌面上的零碎 ---------- */
    const clutter = st.pen("clutter", T.metal(), { tint: [0.9, 0.92, 0.95], spec: 0.5 });
    // 书堆
    for (let i = 0; i < 3; i++) {
      P.book(bookB, m4(1.12, deskH + 0.003 + i * 0.05, -3.92 + i * 0.01, 0, 0.9 - i * 0.2, 0),
        0.24, 0.045, 0.18, [0.45 - i * 0.06, 0.2 + i * 0.06, 0.16 + i * 0.04]);
    }
    // 笔筒 + 三支笔
    clutter.cyl.call(clutter, m4(1.06, deskH + 0.001, -3.62), 0.045, 0.04, 0.11, 10, [0.35, 0.38, 0.42], true);
    for (let i = 0; i < 3; i++) {
      Gbox(clutter, 1.05 + (i - 1) * 0.02, deskH + 0.08 + i * 0.006, -3.62 + (i - 1) * 0.012,
        0.012, 0.16, 0.012, [0.6 + i * 0.1, 0.35 + i * 0.1, 0.25]);
    }
    // 耳机
    const hp = st.pen("headphone", T.darkMetal(), { tint: [0.8, 0.82, 0.85], spec: 0.4 });
    hp.torus.call(hp, m4(-0.95, deskH + 0.09, -3.45, Math.PI / 2, 0, 0), 0.085, 0.012, 14, 5, [1, 1, 1]);
    for (const sx of [-1, 1]) {
      hp.cyl.call(hp, m4(-0.95 + sx * 0.085, deskH + 0.045, -3.45, 0, 0, Math.PI / 2), 0.045, 0.045, 0.04, 10, [1, 1, 1], true);
    }
    // 小本子
    P.book(bookB, m4(0.35, deskH + 0.002, -3.44, 0, 0.35, 0), 0.2, 0.02, 0.26, [0.16, 0.18, 0.22]);
    // 小盆栽
    P.pot(potB, m4(-0.78, deskH + 0.001, -3.42), 0.06, 0.08, [0.55, 0.4, 0.3]);
    for (let i = 0; i < 5; i++) {
      P.leafBlade(plantB, m4(-0.78, deskH + 0.07, -3.42, 0, i * 1.2, 0.8), 0.12, 0.03, [0.7, 1, 0.7]);
    }

    /* ---------- 天花板的串灯 ---------- */
    const fairyWire = st.pen("fairyWire", null, { tint: [0.12, 0.1, 0.09] });
    const fairyBulb = st.pen("fairyBulb", null, { unlit: true, blend: "add", tint: [1.0, 0.78, 0.46], opacity: 0.95 });
    const fairyGlow = st.pen("fairyGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.68, 0.35], opacity: 0.22 });
    const fpts = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const x = -3.35 + u * 6.7;
      const y = 2.78 - Math.sin(u * Math.PI) * 0.35;
      const z = -0.45;
      fpts.push([x, y, z]);
      if (i > 0 && i < 16 && i % 2 === 0) {
        fairyBulb.sphere.call(fairyBulb, m4(x, y - 0.05, z), 0.022, 6, 4, [1, 1, 1]);
        fairyGlow.quad.call(fairyGlow, m4(x, y - 0.05, z + 0.02), 0.45, 0.45, [1, 1, 1], [0, 0, 1, 1]);
      }
    }
    fairyWire.tube.call(fairyWire, M.ident(), fpts, 0.006, 4, [1, 1, 1]);
    // 两端的小挂钩
    for (const hx of [-3.35, 3.35]) {
      fairyWire.cyl.call(fairyWire, m4(hx, 2.78, -0.45), 0.006, 0.006, 0.2, 4, [1, 1, 1], false);
    }

    /* ---------- 右墙的小壁灯 ---------- */
    const sconce = st.pen("sconce", T.brass(), { tint: [1.0, 0.92, 0.8], spec: 0.5 });
    const sconceShade = st.pen("sconceShade", T.canvasTex(), {
      tint: [1.15, 0.96, 0.72], emissive: [0.4, 0.24, 0.08]
    });
    const sconceGlow = st.pen("sconceGlow", T.glow(), {
      unlit: true, blend: "add", tint: [1.0, 0.7, 0.38], opacity: 0.42
    });
    // 墙上小臂 + 朝下的灯罩
    sconce.box.call(sconce, m4(3.4, 2.5, -2.1), 0.22, 0.025, 0.025, [1, 1, 1], 1);
    sconce.cyl.call(sconce, m4(3.32, 2.44, -2.1), 0.05, 0.04, 0.06, 10, [1, 1, 1], true);
    sconceShade.cyl.call(sconceShade, m4(3.32, 2.3, -2.1), 0.13, 0.09, 0.16, 14, [1, 1, 1], false);
    sconceGlow.quad.call(sconceGlow, m4(3.16, 2.3, -2.1, 0, -Math.PI / 2, 0), 0.95, 0.95, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 垃圾桶 ---------- */
    const bin = st.pen("bin", T.darkMetal(), { tint: [0.72, 0.66, 0.55], spec: 0.4 });
    bin.cyl.call(bin, m4(-1.9, 0.01, -3.0), 0.16, 0.18, 0.34, 12, [1, 1, 1], false);
    bin.torus.call(bin, m4(-1.9, 0.35, -3.0), 0.18, 0.012, 14, 5, [1, 1, 1]);
    P.papers(st.pen("binPaper", T.paper(), { tint: [0.9, 0.88, 0.8] }), m4(-1.9, 0.3, -3.0), 2, 33);

    /* ---------- 左侧书架 ---------- */
    const shelfB = st.pen("shelf", T.woodDark(), { tint: [0.95, 0.98, 1.05] });
    const shelfBooksB = st.pen("shelfBooks", T.fabric(), { tint: [1, 1, 1] });
    P.bookshelf(shelfB, m4(-RW / 2 + 0.17, 0, -1.6, 0, Math.PI / 2, 0), 2.6, 2.35, 0.34, 5,
      { woodCol: [0.3, 0.2, 0.13] });
    P.shelfBooks(shelfBooksB, m4(-RW / 2 + 0.17, 0, -1.6, 0, Math.PI / 2, 0), 2.6, 0.34, 2.35, 5, 31);
    // 书架顶上：纸箱与旧书
    P.crate(wood, m4(-RW / 2 + 0.19, 2.44, -2.3, 0, 0.2, 0), 0.34, [0.55, 0.44, 0.3]);
    P.book(bookB, m4(-RW / 2 + 0.19, 2.42, -0.95, 0, 0.4, 0), 0.24, 0.05, 0.32, [0.3, 0.12, 0.1]);

    /* ---------- 右墙：矮柜 + 杂物 ---------- */
    const cab = st.pen("cabinet", T.woodDark(), { tint: [0.9, 0.95, 1.0] });
    Gbox(cab, RW / 2 - 0.32, 0.36, -3.4, 0.6, 0.72, 1.4, [0.6, 0.55, 0.5]);
    Gbox(cab, RW / 2 - 0.32, 0.75, -3.4, 0.64, 0.06, 1.48, [0.8, 0.78, 0.75]);
    // 矮柜上的盆栽
    P.plant(plantB, m4(RW / 2 - 0.32, 0.78, -3.7, 0, 0, 0, 1, 1, 1),
      { potH: 0.18, potR: 0.12, leaves: 11, leafLen: 0.36, seed: 17, potCol: [0.5, 0.3, 0.2] });
    // 矮柜上的旧收音机
    Gbox(cab, RW / 2 - 0.32, 0.88, -3.05, 0.3, 0.2, 0.16, [0.4, 0.32, 0.22]);

    /* ---------- 白板（左墙） ---------- */
    const boardTex = A3DTex.dynamic("monitorWb", 512, 320, drawBoard);
    const boardFrame = st.pen("boardFrame", T.woodDark(), { tint: [0.9, 0.95, 1.0] });
    Gbox(boardFrame, -RW / 2 + 0.025, 1.55, 1.15, 0.05, 1.0, 1.62, [0.9, 0.9, 0.92]);
    // 白板面板（unlit）
    const bq = st.pen("boardFace", boardTex, { unlit: true, tint: [0.9, 0.95, 1.0] });
    bq.quad.call(bq, m4(-RW / 2 + 0.055, 1.55, 1.15, 0, Math.PI / 2, 0), 1.5, 0.9, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 墙上的照片 / 便签 ---------- */
    const photoB = st.pen("photo", A3DTex.poster(6, { title: "", bg: "#cfc6b0", seed: 4, mark: "#D97757" }),
      { unlit: true, tint: [0.78, 0.8, 0.78] });
    photoB.quad.call(photoB, m4(2.15, 2.1, zBack + 0.012, 0, 0, 0), 0.34, 0.42, [1, 1, 1], [0, 0, 1, 1]);
    const photoB2 = st.pen("photo2", A3DTex.poster(4, { title: "", bg: "#b9c4c0", seed: 9, mark: "#4D6BFE" }),
      { unlit: true, tint: [0.74, 0.78, 0.78] });
    photoB2.quad.call(photoB2, m4(2.67, 2.02, zBack + 0.012, 0, 0, 0.03), 0.28, 0.34, [1, 1, 1], [0, 0, 1, 1]);
    // 便签
    const noteB = st.pen("note", T.paper(), { unlit: true, tint: [1, 0.95, 0.6] });
    for (let i = 0; i < 4; i++) {
      noteB.quad.call(noteB, m4(-3.05 + i * 0.17, 1.86 + (i % 2) * 0.05, zBack + 0.012, 0, 0, (i - 1.5) * 0.06),
        0.11, 0.12, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ---------- 地毯 ---------- */
    const rugB = st.pen("rug", T.carpet(), { tint: night ? [0.55, 0.48, 0.45] : [0.88, 0.76, 0.66] });
    rugB.quad.call(rugB, m4(0.1, 0.012, -1.7, -Math.PI / 2, 0, 0), 3.4, 2.4, [1, 1, 1], [0, 0, 2.2, 1.6]);

    /* ---------- 天花板灯 ---------- */
    const lampMetal2 = st.pen("lampMetal2", T.brass(), { tint: [1, 1, 1], spec: 0.5 });
    const lamppaper = st.pen("lamppaper", T.canvasTex(), { tint: [1.05, 0.95, 0.8], emissive: [0.3, 0.22, 0.1] });
    Gbox(lampMetal2, 0.2, RH - 0.02, -1.6, 0.5, 0.02, 0.5, [1, 1, 1]);
    P.paperLantern(lamppaper, lampMetal2, m4(0.2, RH - 0.5, -1.6, 0, 0, 0, 1, 1, 1), 0.15,
      [1.0, 0.88, 0.66]);
    // 吊灯的电线，别让灯罩浮在空中
    const cordB = st.pen("cord", null, { tint: [0.14, 0.1, 0.08] });
    cordB.cyl.call(cordB, m4(0.2, 2.7, -1.6), 0.006, 0.006, 0.33, 4, [1, 1, 1], false);

    /* ---------- 电线 / 小物 ---------- */
    const cableB = st.pen("cable", null, { tint: [0.08, 0.08, 0.09], spec: 0.2 });
    cableB.tube.call(cableB, m4(0, 0, 0), [
      [deskX - 0.56, deskH + 0.2, deskZ - 0.06],
      [deskX - 0.62, deskH - 0.1, deskZ - 0.16],
      [deskX - 0.7, 0.02, deskZ - 0.5],
      [deskX - 1.4, 0.015, deskZ - 0.9],
      [-2.2, 0.01, -3.6]
    ], 0.012, 5, [1, 1, 1]);
    cableB.tube.call(cableB, m4(0, 0, 0), [
      [cx - 0.1, deskH + 0.02, cz - 0.5],
      [cx - 0.3, deskH - 0.2, cz - 0.46],
      [cx - 0.5, 0.02, cz - 0.3],
      [cx - 0.9, 0.01, cz - 0.1]
    ], 0.008, 4, [1, 1, 1]);

    /* ---------- 窗外的海 ---------- */
    const seaQuad = new A3D.Builder();
    const seaMesh = A3D.meshFrom(seaQuad.quad.call(seaQuad, m4(0, 1.3, -13), 30, 20, [1, 1, 1], [0, 0, 1, 1]));
    st.sea.push({
      mesh: seaMesh, tex: T.caustic(),
      deep: night ? [0.006, 0.025, 0.05] : [0.015, 0.06, 0.1],
      shallow: night ? [0.04, 0.13, 0.2] : [0.14, 0.44, 0.52],
      rayCol: night ? [0.3, 0.6, 0.72] : [0.78, 0.94, 1.0],
      fogCol: night ? [0.01, 0.045, 0.07] : [0.05, 0.16, 0.2],
      causticAmt: night ? 0.45 : 1.2, density: 0.3, yBase: -1.6, ySpan: 5.6
    });
    // 窗外远处的礁石剪影
    const rockB = st.pen("seaRock", null, { tint: [0.03, 0.09, 0.12], spec: 0 });
    rocks(rockB, m4(0, -1.2, -11.5), 10, 16, 5, [0.05, 0.12, 0.14]);
    // 海草
    const kelp = st.pen("seaKelp", T.leaf(), { cutout: true, tint: [0.16, 0.42, 0.32], sway: 1, rim: 0.2 });
    for (let i = 0; i < 16; i++) {
      const x = -6 + r() * 12, z = -8.5 - r() * 3;
      for (let k = 0; k < 3; k++) {
        P.leafBlade(kelp, m4(x + (r() - 0.5) * 0.6, -1.6, z, 0, r() * TAU, 1.1 + r() * 0.4, 1, 1, 1),
          1.4 + r() * 1.4, 0.1, [0.7, 1, 0.9]);
      }
    }
    // 鱼群：boids（每条鱼跟随最近的 7 条，整群在窗洞内活动）
    const flock = A3DFlock.create({
      count: 46, seed: 7,
      bounds: { min: [-2.05, 0.95, -8.6], max: [1.65, 2.5, -6.5] },
      size: 0.2, neighborCount: 7
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

    /* ---------- 窗玻璃 ---------- */
    const glassB = st.pen("glass", T.glass(), { tint: [0.55, 0.75, 0.9], opacity: 0.24, blend: "alpha", spec: 0.9 });
    glassB.quad.call(glassB, m4((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, zBack + 0.015),
      WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, [1, 1, 1], [0, 0, 1.6, 1]);

    /* ---------- 室内光斑（窗光投在地上的焦散） ---------- */
    const causticFloor = st.pen("causticFloor", T.caustic(), {
      unlit: true, blend: "add", opacity: 0.085, tint: [0.5, 0.78, 1.0],
      uvAnim: t => [Math.sin(t * 0.11) * 0.15 + t * 0.01, t * 0.016]
    });
    causticFloor.quad.call(causticFloor, m4(0.1, 0.02, -2.6, -Math.PI / 2, 0, 0), 4.2, 3.4, [1, 1, 1], [0, 0, 1.6, 1.3]);
    const causticWall = st.pen("causticWall", T.caustic(), {
      unlit: true, blend: "add", opacity: 0.06, tint: [0.42, 0.7, 0.95],
      uvAnim: t => [t * 0.012, -t * 0.009]
    });
    causticWall.quad.call(causticWall, m4(2.4, 1.5, zBack + 0.02, 0, 0, 0), 2.0, 1.9, [1, 1, 1], [0, 0, 1, 1]);
    // 窗光落在地上的一小片暖光
    const sunPatch = st.pen("sunPatch", T.glow(), {
      unlit: true, blend: "add", opacity: night ? 0.07 : 0.17, tint: [1.0, 0.76, 0.42]
    });
    sunPatch.quad.call(sunPatch, m4(0.15, 0.016, -2.3, -Math.PI / 2, 0, 0), 3.6, 2.6, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 光柱 ---------- */
    const rayB = st.pen("shafts", T.shaft(), {
      unlit: true, blend: "add", opacity: night ? 0.07 : 0.16, tint: [0.62, 0.86, 1.0]
    });
    for (let i = 0; i < 4; i++) {
      const sm = m4(-1.05 + i * 0.78, 1.75 + i * 0.04, zBack + 1.1 + i * 0.5,
        0.42, 0.05 * i, -0.12, 1, 1, 1);
      rayB.quad.call(rayB, sm, 1.6 + i * 0.28, 4.6, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ---------- 接触阴影：让家具真的“坐”在地上 ---------- */
    const shadowB = st.pen("contactShadow", T.glow(), {
      unlit: true, blend: "alpha", tint: [0.02, 0.03, 0.05], opacity: 0.5
    });
    const sh = (x, z, w, d, rot) => {
      shadowB.quad.call(shadowB, m4(x, 0.014, z, -Math.PI / 2, rot || 0, 0), w, d, [1, 1, 1], [0, 0, 1, 1]);
    };
    sh(deskX, deskZ, 3.1, 1.5, 0);
    sh(deskX + 1.15, deskZ + 0.75, 1.05, 1.05, 0.5);
    sh(cx, cz, 2.4, 1.2, 0);
    sh(-RW / 2 + 0.17, -1.6, 1.0, 3.0, 0);
    sh(RW / 2 - 0.32, -3.4, 1.3, 1.8, 0);
    sh(cx + 0.5, cz - 0.2, 0.9, 0.9, 0);
    sh(cx - 0.72, cz + 0.15, 1.05, 1.05, 0.25);
    sh(2.38, -3.55, 1.15, 1.1, 0.12);
    sh(2.12, -2.62, 0.75, 0.75, 0);
    sh(0.42, -1.35, 1.15, 0.75, 0);
    sh(1.35, -2.4, 0.9, 0.9, 0);
    sh(1.55, -3.6, 0.5, 0.5, 0);

    /* ---------- 灯光的光晕（贴片式 bloom） ---------- */
    const lampHalo = st.pen("lampHalo", T.glow(), {
      unlit: true, blend: "add", tint: [1.0, 0.78, 0.42], opacity: night ? 0.45 : 0.26
    });
    lampHalo.quad.call(lampHalo, m4(0.2, RH - 0.52, -1.58, 0, 0, 0), 1.05, 1.05, [1, 1, 1], [0, 0, 1, 1]);
    const monHalo = st.pen("monHalo", T.glow(), {
      unlit: true, blend: "add", tint: [0.22, 0.5, 0.85], opacity: 0.28
    });
    monHalo.quad.call(monHalo, m4(monX, monY, monZ + 0.08, 0, 0.06, 0), 1.15, 0.8, [1, 1, 1], [0, 0, 1, 1]);
    const deskHalo = st.pen("deskHalo", T.glow(), {
      unlit: true, blend: "add", tint: [1.0, 0.72, 0.36], opacity: 0.32
    });
    deskHalo.quad.call(deskHalo, m4(deskX - 1.04, deskH + 0.22, deskZ - 0.12), 0.95, 0.95, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 墙面挂钟：木圈 + 米色表盘 + 刻度 + 10:10 ---------- */
    const clockWood = st.pen("clockWood", T.woodDark(), { tint: [1.0, 0.85, 0.7], spec: 0.3 });
    const clockFace = st.pen("clockFace", T.paper(), { unlit: true, tint: [1.06, 1.0, 0.9] });
    const CLK = { x: -2.55, y: 2.2, z: zBack + 0.03 };
    // 背板（贴墙）
    clockWood.cyl.call(clockWood, m4(CLK.x, CLK.y, CLK.z - 0.03, Math.PI / 2, 0, 0), 0.235, 0.235, 0.03, 24,
      [1, 1, 1], true);
    // 外圈
    clockWood.torus.call(clockWood, m4(CLK.x, CLK.y, CLK.z, Math.PI / 2, 0, 0), 0.215, 0.024, 24, 6, [1, 1, 1]);
    // 表盘
    clockFace.cyl.call(clockFace, m4(CLK.x, CLK.y, CLK.z + 0.001, Math.PI / 2, 0, 0), 0.195, 0.195, 0.006, 24,
      [1, 1, 1], true);
    // 刻度
    const tickB = st.pen("clockTick", null, { unlit: true, tint: [0.25, 0.2, 0.15] });
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU;
      const major = i % 3 === 0;
      const rr = major ? 0.155 : 0.168;
      const len = major ? 0.035 : 0.018;
      const mm = M.mul(M.trs(CLK.x + Math.sin(ang) * rr, CLK.y + Math.cos(ang) * rr, CLK.z + 0.009, 0, 0, -ang),
        M.trs(0, 0, 0, 0, 0, 0));
      tickB.box.call(tickB, mm, major ? 0.014 : 0.008, len, 0.003, [1, 1, 1], 1);
    }
    // 时针 / 分针（10:10）
    const handB = st.pen("clockHand", null, { tint: [0.12, 0.1, 0.09] });
    const hourAng = -(10 + 10 / 60) / 12 * TAU;
    const minAng = -(10 / 60) * TAU;
    handB.box.call(handB, M.mul(M.trs(CLK.x, CLK.y, CLK.z + 0.013, 0, 0, hourAng), M.trs(0, 0.045, 0)),
      0.016, 0.09, 0.005, [1, 1, 1], 1);
    handB.box.call(handB, M.mul(M.trs(CLK.x, CLK.y, CLK.z + 0.015, 0, 0, minAng), M.trs(0, 0.062, 0)),
      0.012, 0.124, 0.004, [1, 1, 1], 1);
    // 中心轴
    clockWood.sphere.call(clockWood, m4(CLK.x, CLK.y, CLK.z + 0.019, 0, 0, 0, 1, 1, 0.5), 0.018, 8, 5, [1, 1, 1]);

    /* ---------- 桌上的白饭与保温壶 ---------- */
    const ceramic = st.pen("ceramic", T.plasterPale(), { tint: [1.05, 1.05, 1.0], spec: 0.5 });
    const rice = st.pen("rice", T.plasterPale(), { tint: [1.25, 1.22, 1.1], spec: 0.15 });
    ceramic.cyl.call(ceramic, m4(deskX + 0.72, deskH + 0.005, deskZ - 0.32), 0.05, 0.075, 0.055, 14,
      [1, 1, 1], true);
    rice.cyl.call(rice, m4(deskX + 0.72, deskH + 0.04, deskZ - 0.32), 0.068, 0.045, 0.03, 14, [1, 1, 1], true);
    rice.sphere.call(rice, m4(deskX + 0.72, deskH + 0.062, deskZ - 0.32, 0, 0, 0, 1, 0.55, 1), 0.062, 12, 6, [1, 1, 1]);
    const bottle = st.pen("bottle", T.metal(), { tint: [0.7, 0.78, 0.85], spec: 0.7 });
    bottle.cyl.call(bottle, m4(RW / 2 - 0.55, 0.78, -3.9), 0.05, 0.045, 0.24, 12, [1, 1, 1], true);
    bottle.cyl.call(bottle, m4(RW / 2 - 0.55, 1.02, -3.9), 0.028, 0.028, 0.04, 10, [1, 1, 1], true);

    /* ---------- 吊着的绿萝：真的垂下来 ---------- */
    const hangM = m4(2.55, 2.75, -3.7, 0, 0, 0);
    const rope = st.pen("rope", T.canvasTex(), { tint: [0.8, 0.75, 0.6] });
    for (const sx of [-1, 1]) {
      rope.cyl.call(rope, M.mul(hangM, M.trs(sx * 0.1, 0, 0)), 0.006, 0.006, 0.3, 4, [1, 1, 1], false);
    }
    P.pot(potB, M.mul(hangM, M.trs(0, -0.05, 0)), 0.12, 0.13, [0.52, 0.42, 0.34]);
    const ivy = st.pen("ivy", T.leaf(), { cutout: true, tint: [0.55, 0.85, 0.55], sway: 1, rim: 0.2 });
    const vine = st.pen("ivyVine", null, { tint: [0.2, 0.32, 0.18] });
    const ir = rng(23);
    for (let st2 = 0; st2 < 5; st2++) {
      const a = (st2 / 5) * TAU + 0.3;
      const ox = Math.cos(a) * 0.1, oz = Math.sin(a) * 0.1;
      const len = 0.42 + ir() * 0.5;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const u = k / 6;
        pts.push([ox * (1 - u * 0.3) + Math.sin(u * 3 + st2) * 0.03, -0.02 - u * len, oz * (1 - u * 0.3)]);
      }
      vine.tube.call(vine, M.mul(hangM, M.trs(0, 0, 0)), pts, 0.004, 3, [1, 1, 1]);
      for (let k = 1; k <= 6; k++) {
        const p = pts[k];
        const side = k % 2 ? 1 : -1;
        const mm = M.mul(M.mul(hangM, M.trs(p[0], p[1], p[2], 0, side * 1.3, -0.5 - ir() * 0.5)),
          M.trs(0, 0, 0, 0, 0, 0));
        P.leafBlade(ivy, mm, 0.1 + ir() * 0.07, 0.045, [0.75, 1, 0.7], 0.8);
      }
    }

    /* ---------- 阅读角：扶手椅 + 落地灯 + 脚凳 ---------- */
    const fabricWarm = st.pen("fabricWarm", T.fabric(), { tint: [1.05, 0.84, 0.7], spec: 0.08 });
    const fabricSoft = st.pen("fabricSoft", T.fabric(), { tint: [0.85, 0.82, 0.86], spec: 0.08 });
    const woodDeco = st.pen("woodDeco", T.woodDark(), { tint: [1.0, 0.86, 0.72], spec: 0.25 });
    const metalDeco = st.pen("metalDeco", T.brass(), { tint: [0.95, 0.92, 0.85], spec: 0.5 });
    const shadeDeco = st.pen("shadeDeco", T.canvasTex(), {
      tint: [1.15, 0.98, 0.78], emissive: [0.32, 0.2, 0.07]
    });
    A3DDecor.armchair(woodDeco, fabricWarm, m4(2.38, 0, -3.55, 0, 0.12, 0));
    A3DDecor.floorLamp(metalDeco, shadeDeco, m4(1.55, 0, -3.6, 0, 0, 0), 1.55);
    A3DDecor.ottoman(fabricSoft, m4(2.12, 0, -2.62, 0, 0.3, 0));
    const lampHaloDeco = st.pen("lampHaloDeco", T.glow(), {
      unlit: true, blend: "add", tint: [1.0, 0.7, 0.38], opacity: 0.38
    });
    lampHaloDeco.quad.call(lampHaloDeco, m4(1.55, 1.3, -3.32, 0, 0, 0), 1.0, 1.0, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 茶几与猫窝 ---------- */
    A3DDecor.coffeeTable(woodDeco, m4(0.42, 0.012, -1.35), 0.95, 0.55, 0.4);
    A3DDecor.catBed(fabricSoft, m4(1.35, 0.012, -2.4, 0, 0.4, 0));
    // 茶几上的书和杯子
    P.book(bookB, m4(0.3, 0.414, -1.32, 0, 0.25, 0), 0.22, 0.035, 0.16, [0.4, 0.18, 0.14]);
    P.book(bookB, m4(0.32, 0.449, -1.3, 0, 0.35, 0), 0.2, 0.03, 0.15, [0.16, 0.22, 0.34]);
    P.mug(mugB, m4(0.62, 0.414, -1.42), 0.045, [0.9, 0.8, 0.7]);

    /* ---------- 墙面：软木板 + 置物架 + 窗帘 ---------- */
    const corkFrame = st.pen("corkFrame", T.woodDark(), { tint: [1.0, 0.82, 0.65] });
    const corkBoard = st.pen("corkBoard", T.woodPale(), { tint: [1.05, 0.82, 0.58] });
    A3DDecor.corkboard(corkFrame, corkBoard, m4(-2.8, 1.35, zBack + 0.02), 1.0, 0.75);
    const noteCols = [[1, 0.95, 0.55], [1, 0.8, 0.72], [0.8, 0.9, 1.0], [0.85, 1, 0.82]];
    for (let i = 0; i < 5; i++) {
      const np = st.pen("corkNote" + i, T.paper(), { unlit: true, tint: noteCols[i % 4] });
      np.quad.call(np, m4(-3.15 + (i % 3) * 0.28, 1.62 - Math.floor(i / 3) * 0.32, zBack + 0.058,
        0, 0, (i % 2 ? 1 : -1) * 0.06), 0.16, 0.15, [1, 1, 1], [0, 0, 1, 1]);
    }
    const shelfDeco = st.pen("shelfDeco", T.woodDark(), { tint: [0.98, 0.82, 0.66] });
    A3DDecor.wallShelf(shelfDeco, m4(2.55, 1.42, zBack + 0.02), 1.3, 0.5, 0.22, 2);
    // 架子上摆书和小盆栽
    for (let i = 0; i < 5; i++) {
      P.book(bookB, m4(2.1 + i * 0.16, 1.366, zBack + 0.13, 0, Math.PI / 2, 0), 0.2, 0.12, 0.05,
        [0.3 + i * 0.05, 0.16 + i * 0.03, 0.16 + (i % 2) * 0.12]);
    }
    P.pot(potB, m4(3.05, 1.67, zBack + 0.1), 0.05, 0.07, [0.55, 0.4, 0.3]);
    for (let i = 0; i < 4; i++) {
      P.leafBlade(plantB, m4(3.05, 1.73, zBack + 0.1, 0, i * 1.3, 0.8), 0.1, 0.025, [0.7, 1, 0.7]);
    }
    const curtainB = st.pen("curtainB", T.fabric(), { tint: [1.1, 0.98, 0.86] });
    A3DDecor.curtain(curtainB, m4(-2.06, 2.62, zBack + 0.1), 0.42, 1.9);
    A3DDecor.curtain(curtainB, m4(1.58, 2.62, zBack + 0.1), 0.42, 1.9);

    /* ---------- 地上的杂物 ---------- */
    const trashB = st.pen("floorBooks", T.fabric(), { tint: [1, 1, 1] });
    for (let i = 0; i < 5; i++) {
      const bx = -2.6 + r() * 0.5, bz = -0.4 + r() * 0.6;
      P.book(trashB, m4(bx, 0.002 + i * 0.045, bz, 0, r() * 0.7, 0), 0.24, 0.045, 0.3,
        [0.35 + r() * 0.25, 0.16 + r() * 0.15, 0.12 + r() * 0.1]);
    }

    /* ---------- 粒子 ---------- */
    const pts = [];
    for (let i = 0; i < 130; i++) {
      pts.push({
        x: (r() - 0.5) * 7, y: 0.4 + r() * 2.6, z: -4.2 + r() * 5,
        r: 0.8, g: 0.9, b: 1, a: 0.1 + r() * 0.3,
        size: 0.004 + r() * 0.012, kind: 2, speed: 0.05 + r() * 0.1, phase: r() * TAU, wob: 0.08 + r() * 0.15
      });
    }
    // 窗外气泡
    for (let i = 0; i < 60; i++) {
      pts.push({
        x: -6 + r() * 12, y: 0 + r() * 4, z: -9 + r() * 4,
        r: 0.6, g: 0.85, b: 1, a: 0.1 + r() * 0.25,
        size: 0.01 + r() * 0.035, kind: 1, speed: 0.4 + r() * 0.6, phase: r() * TAU, wob: 0.05 + r() * 0.1
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "alpha", yMin: -0.3, yMax: 4.6, fogNear: 5, fogFar: 22 });

    st.finish();
    st.finishGlows();

    const warmRoom = !night;
    return {
      cam: { eye: [-1.15, 1.55, 2.35], target: [0.3, 1.22, -4.4], fov: 43 },
      sky: {
        mode: 1, top: night ? [0.03, 0.1, 0.17] : [0.1, 0.3, 0.38],
        bot: night ? [0.008, 0.03, 0.05] : [0.04, 0.11, 0.14],
        glow: night ? [0.14, 0.3, 0.38] : [0.34, 0.58, 0.62], sun: [0.42, 0.9], horizon: 0.12
      },
      lights: {
        sun: A3D.norm3([-0.4, 0.85, -0.45]),
        sunCol: night ? [0.2, 0.19, 0.2] : [0.66, 0.52, 0.36],
        skyCol: night ? [0.18, 0.2, 0.26] : [0.34, 0.36, 0.4],
        groundCol: night ? [0.14, 0.12, 0.12] : [0.3, 0.24, 0.19],
        fog: { col: night ? [0.05, 0.045, 0.05] : [0.1, 0.09, 0.08], near: 7, far: 30 },
        fogAmt: 0.4,
        points: [
          { pos: [0.2, 2.5, -1.6], col: [1.0, 0.76, 0.48], range: 7.0, inten: night ? 1.35 : 1.05 },
          { pos: [3.15, 2.2, -2.1], col: [1.0, 0.72, 0.42], range: 6.8, inten: 0.85 },
          { pos: [-1.04, 1.35, -3.9], col: [1.0, 0.7, 0.4], range: 3.8, inten: night ? 1.25 : 0.95 },
          { pos: [monX, monY, monZ + 0.5], col: [0.5, 0.72, 1.0], range: 3.0, inten: night ? 1.0 : 0.65 },
          { pos: [0.0, 1.9, -4.2], col: [0.45, 0.62, 0.85], range: 8.5, inten: night ? 0.3 : 0.55 },
          { pos: [1.55, 1.3, -3.3], col: [1.0, 0.72, 0.42], range: 5.6, inten: 0.62 }
        ]
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows, sea: st.sea,
      flock: flock,
      tone: night ? [0.92, 0.88, 0.86] : [1.0, 0.94, 0.86],
      swayAmp: 0.6,
      update(t, sc) {
        // 极轻微的手持感：呼吸 + 一点点漂移
        sc.cam.eye = [-1.15 + Math.sin(t * 0.21) * 0.035, 1.55 + Math.sin(t * 0.33) * 0.012, 2.35 + Math.cos(t * 0.18) * 0.03];
        sc.cam.target = [0.3 + Math.sin(t * 0.17) * 0.035, 1.22 + Math.sin(t * 0.27) * 0.01, -4.4];
        // 鱼群：按真实时间推进，再刷新矩阵
        const dt = Math.min(0.05, Math.max(0, t - lastT));
        lastT = t;
        flock.update(dt, t);
        flock.matrices();
        // 监视器：约 11fps 刷新，别每帧重画
        if (t - MON.lastDraw > 0.09) {
          MON.lastDraw = t;
          A3DTex.redraw("monitor", drawMonitor);
        }
      },
      whiteboard: warmRoom
    };
  }

  /* 局部盒子助手：以中心为锚 */
  function Gbox(b, x, y, z, sx, sy, sz, col) {
    b.box.call(b, m4(x, y, z), sx, sy, sz, col, 1.2);
  }

  /* ============================================================
   *  Claude 家庄园的门
   * ============================================================ */
  function buildDoor(opts) {
    const blocked = !!opts.blocked;
    const st = P.stage();
    const r = rng(3);

    // 地面
    const ground = st.pen("ground", T.paving(), { tint: [0.72, 0.78, 0.72], spec: 0.12 });
    ground.grid.call(ground, m4(0, 0, 2.0), 18, 14, 14, 10, [0.68, 0.66, 0.62], 1.5, 0.12, 0);
    // 门前台阶（两级）
    const step = st.pen("step", T.stone(), { tint: [0.9, 0.94, 0.88], spec: 0.1 });
    Gbox(step, 0, 0.09, 0.65, 3.4, 0.18, 1.1, [0.9, 0.9, 0.86]);
    Gbox(step, 0, 0.26, 0.42, 2.6, 0.16, 0.7, [0.92, 0.92, 0.88]);

    // 石墙（门洞两侧 + 上方，用石块格）
    const wall = st.pen("wall", T.stone(), { tint: blocked ? [0.8, 0.68, 0.68] : [0.72, 0.8, 0.74], spec: 0.06 });
    const cw = 0.34, cols = 30, rows = 15;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x0 = -5.1 + i * cw, y0 = j * cw;
        const cx = x0 + cw / 2, cy = y0 + cw / 2;
        if (Math.abs(cx) < 1.02 && cy < 2.85) continue;      // 门洞
        // 楼上两扇窗（只挖窗本身，别把中间的墙一起挖空）
        if (Math.abs(Math.abs(cx) - 1.55) < 0.62 && cy > 2.92 && cy < 4.18) continue;
        const k = 0.88 + r() * 0.2;
        wall.quad.call(wall, m4(cx, cy, 0, 0, 0, 0), cw + 0.005, cw + 0.005,
          [k, k, k * 0.97], [i / cols * 12, j / rows * 6, (i + 1) / cols * 12, (j + 1) / rows * 6]);
      }
    }
    // 墙根的石基
    Gbox(st.pen("plinth", T.stone(), { tint: [0.7, 0.74, 0.7] }), 0, 0.24, 0.06, 10.3, 0.48, 0.16, [0.7, 0.7, 0.68]);
    // 门洞进深
    const reveal = st.pen("reveal", T.stone(), { tint: [0.55, 0.6, 0.56] });
    Gbox(reveal, -1.04, 1.42, -0.16, 0.16, 2.85, 0.32, [0.7, 0.72, 0.7]);
    Gbox(reveal, 1.04, 1.42, -0.16, 0.16, 2.85, 0.32, [0.7, 0.72, 0.7]);
    Gbox(reveal, 0, 2.88, -0.16, 2.2, 0.18, 0.32, [0.66, 0.68, 0.66]);

    // 拱券（石门套）
    const arch = st.pen("arch", T.stone(), { tint: [0.94, 0.96, 0.9] });
    const R = 1.12;
    for (let i = 0; i < 11; i++) {
      const a0 = Math.PI * (i / 11), a1 = Math.PI * ((i + 1) / 11);
      const p0 = [Math.cos(a0) * R, 2.85 + Math.sin(a0) * 0.55];
      const p1 = [Math.cos(a1) * R, 2.85 + Math.sin(a1) * 0.55];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      arch.box.call(arch, m4(mx, my, 0.06, 0, 0, Math.atan2(p1[1] - p0[1], p1[0] - p0[0])),
        len + 0.02, 0.34, 0.22, [1, 1, 1], 1.6);
    }
    // 拱心石
    Gbox(arch, 0, 3.36, 0.07, 0.34, 0.44, 0.24, [1.05, 1.05, 1]);
    // 拱里的石雕填板（不然拱券上面会漏出天空）
    const tympanum = st.pen("tympanum", T.stone(), { tint: [0.66, 0.72, 0.66] });
    tympanum.quad.call(tympanum, m4(0, 3.02, -0.01), 2.32, 0.9, [0.9, 0.9, 0.86], [0, 0, 4, 1.6]);
    // 门楣
    Gbox(arch, 0, 2.84, 0.04, 2.34, 0.16, 0.2, [0.95, 0.95, 0.9]);

    // 橡木门：两扇 + 铁箍
    const oak = st.pen("oak", T.woodDark(), { tint: [1.1, 0.92, 0.72], spec: 0.2 });
    const iron = st.pen("iron", T.darkMetal(), { tint: [0.9, 0.92, 0.95], spec: 0.45 });
    const doorH = 2.76;
    for (const sx of [-1, 1]) {
      const cx = sx * 0.5;
      // 门板
      Gbox(oak, cx, doorH / 2, -0.02, 0.97, doorH, 0.1, [1, 1, 1]);
      // 竖向木板缝
      for (let k = 0; k < 4; k++) {
        const bx = cx - 0.36 + k * 0.24;
        Gbox(oak, bx, doorH / 2, 0.032, 0.015, doorH - 0.12, 0.012, [0.55, 0.45, 0.35]);
      }
      // 铁箍
      for (const y of [0.55, 1.35, 2.2]) {
        Gbox(iron, cx, y, 0.042, 0.99, 0.11, 0.02, [1, 1, 1]);
        // 铆钉
        for (let k = 0; k < 4; k++) {
          iron.sphere.call(iron, m4(cx - 0.36 + k * 0.24, y, 0.055, 0, 0, 0, 0.6, 1, 0.55), 0.022, 6, 4, [1, 1, 1]);
        }
      }
      // 合页
      for (const y of [0.5, 2.3]) {
        Gbox(iron, sx * 0.94, y, 0.05, 0.22, 0.09, 0.03, [1, 1, 1]);
      }
    }
    // 门环（狮口咬环）
    iron.sphere.call(iron, m4(0.16, 1.34, 0.075, 0, 0, 0, 1, 0.8, 0.5), 0.1, 10, 8, [1, 1, 1]);
    iron.torus.call(iron, m4(0.16, 1.2, 0.1, Math.PI / 2, 0, 0), 0.11, 0.018, 18, 6, [1, 1, 1]);

    // 门牌
    const plaqueTex = A3DTex.sign({
      text: "CLAUDE", w: 512, h: 160, bg: "#2b241c", fg: "#d9c08a",
      size: 64, border: "#8a6d3f", borderW: 6, glow: "rgba(255,220,150,.35)", glowBlur: 10
    });
    const plaque = st.pen("plaque", plaqueTex, { unlit: true, tint: [0.95, 0.92, 0.85] });
    plaque.quad.call(plaque, m4(0, 2.02, 0.055), 0.5, 0.16, [1, 1, 1], [0, 0, 1, 1]);
    // 门缝里塞着的便签（小细节）
    st.pen("note", T.paper(), { unlit: true, tint: [1, 0.95, 0.7] })
      .quad.call(st.pens["note"], m4(0.02, 1.05, 0.06, 0, 0, 0.25), 0.13, 0.16, [1, 1, 1], [0, 0, 1, 1]);

    // 楼上的窗：百叶紧闭 + 铁栅
    const shutter = st.pen("shutter", T.woodPale(), { tint: [0.72, 0.74, 0.7] });
    const darkGlass = st.pen("darkGlass", null, { tint: [0.03, 0.04, 0.05] });
    for (const sx of [-1, 1]) {
      const wx = sx * 1.55, wy = 3.55;
      // 石窗套
      Gbox(arch, wx, wy + 0.72, 0.12, 1.24, 0.16, 0.26, [0.9, 0.9, 0.86]);
      Gbox(arch, wx, wy - 0.72, 0.14, 1.3, 0.14, 0.3, [0.94, 0.94, 0.9]);
      Gbox(arch, wx - 0.62, wy, 0.12, 0.14, 1.6, 0.26, [0.9, 0.9, 0.86]);
      Gbox(arch, wx + 0.62, wy, 0.12, 0.14, 1.6, 0.26, [0.9, 0.9, 0.86]);
      Gbox(darkGlass, wx, wy, -0.06, 1.06, 1.32, 0.02, [1, 1, 1]);
      // 两扇紧闭的百叶
      for (const sh of [-1, 1]) {
        Gbox(shutter, wx + sh * 0.26, wy, 0.03, 0.5, 1.3, 0.06, [1, 1, 1]);
        for (let k = 0; k < 9; k++) {
          Gbox(shutter, wx + sh * 0.26, wy - 0.58 + k * 0.145, 0.07, 0.44, 0.09, 0.02, [1.5, 1.5, 1.5]);
        }
        Gbox(iron, wx + sh * 0.26, wy + 0.66, 0.05, 0.54, 0.06, 0.08, [1, 1, 1]);
      }
      Gbox(iron, wx, wy, 0.09, 1.12, 0.05, 0.06, [1, 1, 1]);
    }

    // 常春藤
    const ivy = st.pen("ivy", T.leaf(), { cutout: true, tint: [0.5, 0.78, 0.48], sway: 0.8, rim: 0.15 });
    const vine = st.pen("vine", null, { tint: [0.18, 0.3, 0.16] });
    const ivyClump = (cx, cy, dir) => {
      const pts = [];
      for (let i = 0; i < 7; i++) {
        pts.push([cx + Math.sin(i * 0.9 + dir) * 0.12 * i, cy + i * 0.18, 0.1]);
      }
      vine.tube.call(vine, M.ident(), pts, 0.006, 4, [1, 1, 1]);
      for (let i = 0; i < 30; i++) {
        const p = pts[Math.floor(r() * pts.length)];
        P.leafBlade(ivy, m4(p[0] + (r() - 0.5) * 0.4, p[1] + (r() - 0.5) * 0.2, 0.12,
          0, r() * TAU, -0.6 + r() * 1.2, 1, 1, 1), 0.14 + r() * 0.16, 0.06 + r() * 0.03, [0.7, 1, 0.6]);
      }
    };
    ivyClump(-1.28, 0.5, 0.2);
    ivyClump(1.3, 0.4, 1.4);
    ivyClump(-2.6, 2.0, 2.2);
    ivyClump(2.5, 1.4, 0.7);
    ivyClump(-3.6, 0.3, 1.9);
    // 拱顶垂下来的藤
    for (let i = 0; i < 5; i++) {
      const vx = -1.2 + i * 0.6;
      const pts = [];
      for (let k = 0; k < 5; k++) pts.push([vx + Math.sin(k + i) * 0.05, 3.25 - k * 0.2, 0.14]);
      vine.tube.call(vine, M.ident(), pts, 0.01, 4, [1, 1, 1]);
      for (let k = 0; k < 4; k++) {
        P.leafBlade(ivy, m4(vx + (r() - 0.5) * 0.2, 3.1 - k * 0.22, 0.16, 0, r() * TAU, -1.2, 1, 1, 1),
          0.08 + r() * 0.08, 0.035, [0.6, 0.9, 0.5]);
      }
    }

    // 花坛：橙色菊花
    const stemB = st.pen("stem", null, { tint: [0.28, 0.45, 0.22] });
    const petalB = st.pen("petal", T.petal(), { cutout: true, tint: [1.25, 0.95, 0.7], rim: 0.25 });
    const leafBed = st.pen("bedLeaf", T.leaf(), { cutout: true, tint: [0.6, 0.9, 0.5], sway: 0.7 });
    const bedStone = st.pen("bedStone", T.stone(), { tint: [0.6, 0.62, 0.58] });
    for (const sx of [-1, 1]) {
      const bx = sx * 2.35;
      // 石砌花池（抬到腰高，文本框挡不住）
      const planterY = 0.78;
      Gbox(bedStone, bx, planterY / 2, 0.62, 1.9, planterY, 0.9, [0.85, 0.85, 0.8]);
      Gbox(bedStone, bx, planterY + 0.05, 0.62, 2.0, 0.1, 1.0, [1.0, 1.0, 0.94]);
      // 土
      st.pen("soil", T.dirt(), { tint: [0.5, 0.45, 0.4] }).quad.call(
        st.pens["soil"], m4(bx, planterY + 0.1, 0.62, -Math.PI / 2, 0, 0), 1.8, 0.8, [1, 1, 1], [0, 0, 1, 1]);
      // 菊丛
      for (let i = 0; i < 15; i++) {
        const fx = bx + (r() - 0.5) * 1.7, fz = 0.62 + (r() - 0.5) * 0.7;
        for (let k = 0; k < 3; k++) {
          P.leafBlade(leafBed, m4(fx + (r() - 0.5) * 0.2, planterY + 0.1, fz, 0, r() * TAU, 1.1, 1, 1, 1),
            0.18 + r() * 0.16, 0.05, [0.8, 1, 0.7]);
        }
        P.chrysanthemum(petalB, stemB, m4(fx, planterY + 0.1, fz), 0.7 + r() * 0.35, [1.2, 0.9, 0.65], Math.floor(r() * 99));
      }
    }

    // 墙上的旧提灯
    const lanternIron = st.pen("lanternIron", T.darkMetal(), { tint: [0.9, 0.92, 0.9], spec: 0.4 });
    const lanternGlass = st.pen("lanternGlass", T.glass(), {
      unlit: true, blend: "add", tint: blocked ? [1.0, 0.25, 0.2] : [1.0, 0.72, 0.35], opacity: blocked ? 0.5 : 0.28
    });
    Gbox(lanternIron, -1.42, 2.82, 0.12, 0.04, 0.04, 0.3, [1, 1, 1]);
    Gbox(lanternIron, -1.42, 2.62, 0.16, 0.05, 0.42, 0.05, [1, 1, 1]);
    Gbox(lanternIron, -1.42, 2.64, 0.2, 0.34, 0.05, 0.34, [1, 1, 1]);
    Gbox(lanternIron, -1.42, 2.06, 0.2, 0.3, 0.05, 0.3, [1, 1, 1]);
    // 四根角柱（不是实心盒子，灯才透得出来）
    for (const dx of [-0.11, 0.11]) for (const dz of [-0.11, 0.11]) {
      Gbox(lanternIron, -1.42 + dx, 2.35, 0.2 + dz, 0.025, 0.55, 0.025, [1, 1, 1]);
    }
    lanternGlass.box.call(lanternGlass, m4(-1.42, 2.35, 0.2), 0.18, 0.48, 0.18, [1, 1, 1], 1);
    const lanternHalo = st.pen("lanternHalo", T.glow(), {
      unlit: true, blend: "add", tint: blocked ? [1.0, 0.2, 0.15] : [1.0, 0.7, 0.35], opacity: 0.4
    });
    lanternHalo.quad.call(lanternHalo, m4(-1.42, 2.34, 0.3), 1.3, 1.3, [1, 1, 1], [0, 0, 1, 1]);

    /* ---------- 403：门上的大数字，0 是空心的 ---------- */
    if (blocked) {
      const cv = A3DTex.cv(768, 512);
      const x = A3DTex.ctxOf(cv);
      x.clearRect(0, 0, cv.width, cv.height);
      x.font = "bold 300px 'Noto Sans SC','Microsoft YaHei',sans-serif";
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillStyle = "#ff4a3d";
      x.shadowColor = "#ff2a1a"; x.shadowBlur = 40;
      x.fillText("4", 190, 260);
      x.fillText("3", 578, 260);
      // 空心的 0：用描边画出外圈，中间留空
      x.lineWidth = 46;
      x.strokeStyle = "#ff4a3d";
      x.shadowBlur = 60;
      x.beginPath(); x.ellipse(384, 260, 96, 142, 0, 0, TAU); x.stroke();
      // 边缘的裂纹
      x.shadowBlur = 0; x.strokeStyle = "rgba(255,120,100,.35)"; x.lineWidth = 3;
      for (let i = 0; i < 30; i++) {
        const a = r() * TAU, len = 20 + r() * 60;
        x.beginPath();
        x.moveTo(384 + Math.cos(a) * 110, 260 + Math.sin(a) * 155);
        x.lineTo(384 + Math.cos(a) * (110 + len), 260 + Math.sin(a) * (155 + len));
        x.stroke();
      }
      const tex403 = A3D.texFromCanvas(cv, { clamp: true });
      const signB = st.pen("sign403", tex403, { unlit: true, blend: "add", tint: [1, 1, 1], opacity: 0.95 });
      signB.quad.call(signB, m4(0, 1.55, 0.07), 2.0, 1.34, [1, 1, 1], [0, 0, 1, 1]);
      // 红光
      const redGlow = st.pen("redGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.16, 0.12], opacity: 0.35 });
      redGlow.quad.call(redGlow, m4(0, 1.55, 0.2), 5.0, 4.0, [1, 1, 1], [0, 0, 1, 1]);
      // 门缝里渗出来的红光
      const seam = st.pen("seam", null, { unlit: true, blend: "add", tint: [1.0, 0.15, 0.1], opacity: 0.5 });
      seam.box.call(seam, m4(0, 1.4, 0.06), 0.02, 2.6, 0.01, [1, 1, 1], 1);
    }

    // 雾：几片慢慢飘的四边形
    const mistTex = T.glow();
    const mist = st.pen("mist", mistTex, { unlit: true, blend: "alpha", tint: [0.55, 0.62, 0.6], opacity: 0.07 });
    for (let i = 0; i < 3; i++) {
      mist.quad.call(mist, m4(-3 + i * 2.6, 1.0 + i * 0.25, 1.6 + i * 0.4, 0, 0, 0), 5.5, 2.6, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 鸟（远处掠过）
    const birdB = st.pen("bird", null, { tint: [0.12, 0.13, 0.15] });
    for (let i = 0; i < 3; i++) {
      const ph = i * 2.1;
      const bd = st.dyno(null, { tint: [0.1, 0.11, 0.13] }, t => {
        const a = t * 0.06 + ph;
        return M.trs(-8 + ((t * 0.5 + i * 3) % 18), 4.4 + Math.sin(a) * 0.4, -6 - i, 0, 0.2, Math.sin(t * 6 + ph) * 0.5, 1.4, 1.4, 1.4);
      });
      P.birdWings(bd, M.ident(), 0.2, [1, 1, 1], 0.12);
      void birdB;
    }

    st.finish();
    st.finishGlows();

    return {
      cam: { eye: [0.5, 1.42, 5.4], target: [0, 2.06, -0.2], fov: 46 },
      sky: {
        mode: 0, top: blocked ? [0.1, 0.03, 0.03] : [0.2, 0.23, 0.24],
        bot: blocked ? [0.16, 0.05, 0.04] : [0.42, 0.45, 0.44],
        glow: blocked ? [0.5, 0.1, 0.08] : [0.55, 0.55, 0.5], sun: [0.35, 0.78], horizon: 0.62
      },
      lights: {
        sun: A3D.norm3([-0.35, 0.75, 0.55]), sunCol: blocked ? [0.3, 0.16, 0.14] : [0.52, 0.55, 0.55],
        skyCol: blocked ? [0.22, 0.1, 0.1] : [0.32, 0.36, 0.38],
        groundCol: [0.1, 0.1, 0.1],
        fog: { col: blocked ? [0.09, 0.03, 0.03] : [0.14, 0.16, 0.16], near: 6, far: 30 }, fogAmt: 0.5,
        points: [
          { pos: [-1.42, 2.35, 0.35], col: blocked ? [1.0, 0.2, 0.15] : [1.0, 0.7, 0.35], range: 4.5, inten: 0.9 },
          { pos: [0, 1.7, 2.5], col: blocked ? [0.9, 0.2, 0.15] : [0.6, 0.68, 0.7], range: 6, inten: 0.5 }
        ]
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows,
      tone: blocked ? [0.95, 0.66, 0.62] : [0.82, 0.92, 0.88],
      swayAmp: 0.5,
      update(t, sc) {
        sc.cam.eye = [0.5 + Math.sin(t * 0.2) * 0.03, 1.42 + Math.sin(t * 0.31) * 0.012, 5.4 + Math.cos(t * 0.17) * 0.03];
      }
    };
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
    const stemB = st.pen("stem", null, { tint: [0.25, 0.42, 0.2] });
    const petalB = st.pen("petal", T.petal(), { cutout: true, tint: [1.2, 0.92, 0.68], rim: 0.25 });
    P.chrysanthemum(petalB, stemB, m4(0.95, 1.0, -1.25), 0.85, [1.2, 0.9, 0.62], 6);
    P.chrysanthemum(petalB, stemB, m4(1.05, 0.98, -1.2), 0.7, [1.3, 1.0, 0.7], 19);

    // 书架上的菊花：每隔一格放一小瓶
    const shelfVase = st.pen("shelfVase", T.plasterPale(), { tint: [1.0, 0.92, 0.9], spec: 0.4 });
    const shelfStem = st.pen("shelfStem", null, { tint: [0.26, 0.42, 0.2] });
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
  function buildCamp() {
    const st = P.stage();
    const r = rng(37);

    // 沙地
    const sand = st.pen("sand", T.dirt(), { tint: [0.95, 0.88, 0.8], spec: 0.08 });
    sand.grid.call(sand, m4(0, 0, -6), 60, 44, 30, 22, [0.72, 0.66, 0.58], 0.55, 0.2, 0);
    // 海：一块向远处变亮的平板，靠雾和月光接上天空
    const seaB = st.pen("seaWater", T.causticSoft(), { tint: [0.5, 0.62, 0.78], spec: 0.9 });
    const sr = rng(77);
    for (let j = 0; j < 14; j++) {
      for (let i = 0; i < 30; i++) {
        const z0 = -17 - j * 3.2, z1 = z0 - 3.2;
        const x0 = -55 + i * 7, x1 = x0 + 7;
        const t = j / 13;
        const c = [0.1 + t * 0.24, 0.14 + t * 0.26, 0.2 + t * 0.3];
        const k = 0.94 + sr() * 0.12;
        seaB.quad.call(seaB, m4(0, -0.02, (z0 + z1) / 2, -Math.PI / 2, 0, 0), 7, 3.2,
          [c[0] * k, c[1] * k, c[2] * k], [i / 16 * 12, j / 14 * 4, (i + 1) / 16 * 12, (j + 1) / 14 * 4]);
      }
    }
    // 月光在水面上的倒影
    const moonPath = st.pen("moonPath", T.glow(), { unlit: true, blend: "add", tint: [0.7, 0.8, 1.0], opacity: 0.16 });
    moonPath.quad.call(moonPath, m4(2.0, 0.05, -24, -Math.PI / 2, 0, 0), 3.2, 16, [1, 1, 1], [0, 0, 1, 6]);
    // 浪花线
    const foam = st.pen("foam", T.glow(), { unlit: true, blend: "add", tint: [0.8, 0.9, 1.0], opacity: 0.12 });
    foam.quad.call(foam, m4(0, 0.06, -17, -Math.PI / 2, 0, 0), 60, 1.2, [1, 1, 1], [0, 0, 6, 1]);

    // 礁石
    const rockB = st.pen("rock", T.stone(), { tint: [0.5, 0.52, 0.56] });
    for (let i = 0; i < 12; i++) {
      const s = 0.22 + r() * 0.7;
      const rx = (i % 3 === 0 ? -1 : 1) * (7 + r() * 9);
      rockB.sphere.call(rockB, m4(rx, 0.06, -8 - r() * 14, r(), r() * TAU, r(), s, s * 0.55, s), 1, 8, 6, [1, 1, 1]);
    }
    // 草
    const grassB = st.pen("grass", T.leaf(), { cutout: true, tint: [0.6, 0.7, 0.55], sway: 1 });
    for (let i = 0; i < 30; i++) {
      P.grass(grassB, m4(-12 + r() * 24, 0.02, -12 + r() * 20, 0, 0, 0), 5, 0.22, [0.8, 0.9, 0.7], Math.floor(r() * 99), 0.25);
    }

    // 帐篷
    const tentCols = [[0.62, 0.52, 0.4], [0.5, 0.4, 0.34], [0.55, 0.45, 0.46], [0.45, 0.5, 0.4], [0.6, 0.5, 0.35]];
    const tentB = st.pen("tent", T.canvasTex(), { tint: [1.15, 1.05, 0.92], spec: 0.05 });
    const tentB2 = st.pen("tent2", T.fabric(), { tint: [1.05, 0.95, 0.85], spec: 0.05 });
    const tents = [
      [-5.5, -9.0, "a", 0.5], [-1.6, -12.0, "dome", -0.2], [3.6, -10.5, "yurt", 0.4],
      [7.2, -14.0, "circus", 0.2], [-8.5, -14.5, "dome", 0.8], [1.0, -16.0, "a", 1.2]
    ];
    tents.forEach((tt, i) => {
      const m = m4(tt[0], 0, tt[1], 0, tt[2 + 0] ? tt[3] : 0, 0);
      P.tent(i % 2 ? tentB : tentB2, m4(tt[0], 0, tt[1], 0, tt[3], 0), tt[2], tentCols[i % tentCols.length], i * 7 + 3);
      void m;
    });
    // 帐篷前的垫子与箱子
    const crateB = st.pen("crate", T.woodDark(), { tint: [0.8, 0.68, 0.55] });
    P.crate(crateB, m4(-3.6, 0.25, -8.3, 0, 0.3, 0), 0.5, [0.55, 0.45, 0.34]);
    P.crate(crateB, m4(-3.2, 0.18, -7.9, 0, 0.9, 0), 0.36, [0.5, 0.4, 0.3]);
    const barrelB = st.pen("barrel", T.woodDark(), { tint: [0.75, 0.62, 0.5] });
    P.barrel(barrelB, m4(2.6, 0, -7.6), 0.32, 0.8, [0.3, 0.3, 0.32], [1, 1, 1]);
    const rugB = st.pen("campRug", T.carpet(), { tint: [0.9, 0.7, 0.55] });
    rugB.quad.call(rugB, m4(-0.2, 0.02, -6.6, -Math.PI / 2, 0.2, 0), 3.4, 2.4, [1, 1, 1], [0, 0, 2, 1.5]);

    // 篝火
    const fireStone = st.pen("fireStone", T.stone(), { tint: [0.5, 0.5, 0.5] });
    const fireWood = st.pen("fireWood", T.woodDark(), { tint: [0.5, 0.36, 0.26] });
    for (const [fx, fz] of [[-0.2, -6.6], [5.0, -12.4]]) {
      P.campfire(fireStone, m4(fx, 0, fz), 0.5, [0.32, 0.3, 0.28], [0.4, 0.28, 0.18]);
      void fireWood;
      const fireGlow = st.pen("fireGlow" + fx, T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.5, 0.16], opacity: 0.55 });
      fireGlow.quad.call(fireGlow, m4(fx, 0.35, fz), 2.6, 2.6, [1, 1, 1], [0, 0, 1, 1]);
      // 火焰
      const flame = st.pen("flame" + fx, T.shaft(), { unlit: true, blend: "add", tint: [1.0, 0.55, 0.2], opacity: 0.75 });
      for (let i = 0; i < 3; i++) {
        flame.quad.call(flame, m4(fx + (r() - 0.5) * 0.2, 0.42, fz + (r() - 0.5) * 0.2, 0, r() * TAU, 0, 1, 1, 1),
          0.4 + r() * 0.2, 0.8 + r() * 0.4, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    // 串灯：两根杆之间的弧线
    const poleB = st.pen("pole", T.woodDark(), { tint: [0.7, 0.6, 0.5] });
    const wireB = st.pen("wire", null, { tint: [0.15, 0.14, 0.13] });
    const bulbB = st.pen("bulb", null, { unlit: true, blend: "add", tint: [1.0, 0.75, 0.4], opacity: 0.9 });
    const bulbGlow = st.pen("bulbGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.7, 0.35], opacity: 0.18 });
    const poles = [[-4.2, -4.2], [1.4, -4.6], [7.4, -8.6], [7.0, -15.8]];
    for (const p of poles) poleB.cyl.call(poleB, m4(p[0], 0, p[1]), 0.07, 0.06, 3.2, 6, [1, 1, 1], true);
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], b = poles[i + 1];
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const x = a[0] + (b[0] - a[0]) * u;
        const z = a[1] + (b[1] - a[1]) * u;
        const y = 3.05 - Math.sin(u * Math.PI) * 0.55;
        pts.push([x, y, z]);
        if (k > 0 && k < 10) {
          bulbB.sphere.call(bulbB, m4(x, y - 0.08, z), 0.05, 6, 4, [1, 1, 1]);
          bulbGlow.quad.call(bulbGlow, m4(x, y - 0.08, z + 0.02), 0.6, 0.6, [1, 1, 1], [0, 0, 1, 1]);
        }
      }
      wireB.tube.call(wireB, M.ident(), pts, 0.008, 4, [1, 1, 1]);
    }

    // 营地木牌
    const signTex = A3DTex.sign({
      text: "HUGGING FACE\n营地", w: 512, h: 320, bg: "#3a2c1e", fg: "#f2d8a0",
      size: 58, lineH: 74, border: "#8a6d3f", borderW: 8, glow: "rgba(255,210,140,.35)", glowBlur: 14
    });
    const signB = st.pen("campSign", signTex, { unlit: true, tint: [0.95, 0.95, 0.95] });
    signB.quad.call(signB, m4(-4.9, 1.85, -7.6, 0, 0.6, 0), 1.5, 0.94, [1, 1, 1], [0, 0, 1, 1]);
    const signBack = st.pen("campSignBack", T.woodDark(), { tint: [0.5, 0.38, 0.26] });
    signBack.quad.call(signBack, m4(-4.9, 1.85, -7.66, 0, 0.6, 0), 1.5, 0.94, [1, 1, 1], [0, 0, 1, 1]);
    for (const dx of [-0.55, 0.55]) {
      signBack.box.call(signBack, m4(-4.9 + dx, 1.05, -7.58, 0, 0.6, 0), 0.1, 1.6, 0.1, [1, 1, 1], 1.4);
    }

    // 前景的木头与箱子
    const logB = st.pen("log", T.woodDark(), { tint: [0.55, 0.42, 0.32] });
    logB.cyl.call(logB, m4(-2.2, 0.08, -2.4, 0, 0.4, Math.PI / 2), 0.14, 0.13, 1.2, 8, [1, 1, 1], true);
    logB.cyl.call(logB, m4(-1.5, 0.08, -2.0, 0, 1.1, Math.PI / 2), 0.12, 0.11, 0.9, 8, [1, 1, 1], true);
    P.crate(st.pen("fgCrate", T.woodDark(), { tint: [0.6, 0.48, 0.36] }), m4(2.9, 0.24, -2.6, 0, 0.6, 0), 0.48, [1, 1, 1]);

    // 坐在火边的人影
    const figB = st.pen("figure", T.fabric(), { tint: [0.18, 0.16, 0.16] });
    const sit = (x, z, ry, h) => {
      const m = m4(x, 0, z, 0, ry, 0);
      const c = [1, 1, 1];
      figB.cyl.call(figB, M.mul(m, M.trs(0, 0.28 * h, 0)), 0.15 * h, 0.21 * h, 0.44 * h, 8, c, true);
      figB.sphere.call(figB, M.mul(m, M.trs(0, 0.78 * h, 0.02 * h)), 0.115 * h, 8, 6, c);
      for (const ds of [-1, 1]) {
        figB.cyl.call(figB, M.mul(m, M.trs(0.2 * h, 0.1 * h, ds * 0.11 * h, 0, 0, 1.15)),
          0.065 * h, 0.05 * h, 0.46 * h, 6, c, true);
      }
      // 手：搭在膝盖上
      for (const ds of [-1, 1]) {
        figB.cyl.call(figB, M.mul(m, M.trs(0.06 * h, 0.52 * h, ds * 0.17 * h, 0.5, 0, 1.0)),
          0.045 * h, 0.04 * h, 0.3 * h, 5, c, true);
      }
    };
    sit(0.8, -6.0, 1.9, 1.0);
    sit(1.55, -6.55, 2.5, 1.1);

    // 星星与余烬
    const pts = [];
    for (let i = 0; i < 260; i++) {
      pts.push({
        x: -40 + r() * 80, y: 6 + r() * 16, z: -50 + r() * 30,
        r: 0.8, g: 0.85, b: 1, a: 0.35 + r() * 0.6,
        size: 0.05 + r() * 0.12, kind: 0, speed: 0, phase: r() * TAU, wob: 0
      });
    }
    for (let i = 0; i < 60; i++) {
      const fx = r() < 0.5 ? -0.2 : 5.0, fz = r() < 0.5 ? -6.6 : -12.4;
      pts.push({
        x: fx + (r() - 0.5) * 0.3, y: 0.3 + r() * 0.4, z: fz + (r() - 0.5) * 0.3,
        r: 1.0, g: 0.55 + r() * 0.3, b: 0.2, a: 0.5 + r() * 0.4,
        size: 0.012 + r() * 0.02, kind: 1, speed: 0.3 + r() * 0.5, phase: r() * TAU, wob: 0.15 + r() * 0.2
      });
    }
    st.points.push({ mesh: A3D.pointMesh(pts), blend: "add", yMin: 0.05, yMax: 3.2, fogNear: 12, fogFar: 40 });

    // 月亮
    const moon = st.pen("moon", T.glow(), { unlit: true, blend: "add", tint: [0.85, 0.9, 1.0], opacity: 0.5 });
    moon.quad.call(moon, m4(9.5, 9.2, -30), 7, 7, [1, 1, 1], [0, 0, 1, 1]);
    const moonDisc = st.pen("moonDisc", T.glow(), { unlit: true, blend: "add", tint: [1, 1, 1], opacity: 0.95 });
    moonDisc.quad.call(moonDisc, m4(9.5, 9.2, -29.8), 1.4, 1.4, [1, 1, 1], [0, 0, 1, 1]);

    st.finish();
    st.finishGlows();
    return {
      cam: { eye: [0.5, 1.5, 0.8], target: [0.4, 1.0, -9.5], fov: 54 },
      sky: {
        mode: 2, top: [0.015, 0.03, 0.07], bot: [0.05, 0.09, 0.14],
        glow: [0.25, 0.35, 0.5], sun: [0.82, 0.78], horizon: 0.44
      },
      lights: {
        sun: A3D.norm3([0.25, 0.75, 0.5]), sunCol: [0.42, 0.5, 0.7],
        skyCol: [0.2, 0.24, 0.38], groundCol: [0.09, 0.08, 0.11],
        fog: { col: [0.05, 0.08, 0.14], near: 10, far: 46 }, fogAmt: 0.75,
        points: [
          { pos: [-0.2, 0.8, -6.6], col: [1.0, 0.52, 0.2], range: 11, inten: 2.0 },
          { pos: [5.0, 0.8, -12.4], col: [1.0, 0.52, 0.2], range: 9, inten: 1.5 },
          { pos: [9.5, 9.2, -30], col: [0.5, 0.6, 0.9], range: 40, inten: 0.35 }
        ]
      },
      batches: st.batches, over: st.over, dyn: st.dyn, points: st.points, glows: st.glows,
      tone: [0.8, 0.86, 1.0],
      swayAmp: 0.7,
      update(t, sc) {
        sc.cam.eye = [0.5 + Math.sin(t * 0.15) * 0.05, 1.5 + Math.sin(t * 0.24) * 0.012, 0.8 + Math.cos(t * 0.12) * 0.05];
        sc.cam.target = [0.4 + Math.sin(t * 0.09) * 0.1, 1.0, -9.5];
      }
    };
  }

  /* ---------------- 注册 ---------------- */
  function registerAll() {
    A3D.register("sea", buildSea);
    A3D.register("ds_room", () => buildRoom({ night: false }));
    A3D.register("ds_room_night", () => buildRoom({ night: true }));
    A3D.register("ds_room_dawn", () => buildRoom({ night: false }));
    A3D.register("claude_door", () => buildDoor({ blocked: false }));
    A3D.register("claude_door_403", () => buildDoor({ blocked: true }));
    A3D.register("claude_lib", buildLib);
    A3D.register("hf_camp", buildCamp);
  }

  if (typeof window !== "undefined") registerAll();

  return { registerAll, buildSea, buildRoom, buildDoor, buildLib, buildCamp };
})();


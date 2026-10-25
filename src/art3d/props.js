/* ============================================================
 * Escape A÷ · src/art3d/props.js —— 可复用的 3D 道具
 *
 * 每个函数只往 Builder 里塞几何体（局部坐标，Y 向上，单位米），
 * 由场景决定摆在哪、用什么贴图、什么颜色。
 * 造型刻意保留一点手绘感：棱角、倒角、轻微歪斜，不追求写实。
 * ============================================================ */
"use strict";

const A3DProps = (() => {
  const M = A3D.M, G = A3D.Builder.prototype;
  const TAU = Math.PI * 2, D2R = Math.PI / 180;

  /** 随机数（带种子，保证每次进游戏构图一致） */
  function rng(seed) {
    let s = seed || 1;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* ============================================================
   *  场景画笔：按用途把几何体分到不同的 batch 里
   * ============================================================ */
  function stage() {
    const st = {
      pens: {}, defs: [], batches: [], dyn: [], over: [], points: [], glows: [], sea: [],
      /** 取一支笔：key 相同就共用一批几何体（同名同贴图，单独 draw call） */
      pen(key, tex, opts) {
        let p = this.pens[key];
        if (!p) {
          p = new A3D.Builder();
          this.pens[key] = p;
          this.defs.push({ key, tex: tex || null, opts: opts || {}, b: p });
        }
        return p;
      },
      /** 单独一件会动的东西（自带 model 矩阵函数） */
      dyno(tex, opts, matrixFn) {
        const b = new A3D.Builder();
        const d = { b, tex: tex || null, opts: opts || {}, matrix: matrixFn };
        this.dyn.push(d);
        return b;
      },
      finish() {
        for (const d of this.defs) {
          const m = A3D.meshFrom(d.b);
          if (!m) continue;
          const batch = Object.assign({ mesh: m, tex: d.tex }, d.opts);
          if (d.opts.blend && d.opts.blend !== "opaque") this.over.push(batch);
          else this.batches.push(batch);
        }
        this.dyn = this.dyn.map(d => {
          if (d.batch) return d;
          const m = A3D.meshFrom(d.b);
          return m ? { batch: Object.assign({ mesh: m, tex: d.tex }, d.opts), matrix: d.matrix } : null;
        }).filter(Boolean);
        return this;
      },
      glowQuad(b, x, y, z, w, h, rot, tint) { /* 由 glow() 使用 */ },
      /** 注册一片发光四边形（加法混合），返回 mesh 的 builder 方便后续追加 */
      glow(key, tex, opts) {
        let p = this.pens["g:" + key];
        if (!p) {
          p = new A3D.Builder();
          this.pens["g:" + key] = p;
          this.glows.push({ key: key, tex: tex || null, b: p, opts: opts || {} });
        }
        return p;
      },
      finishGlows() {
        this.glows = this.glows.map(g => {
          const m = A3D.meshFrom(g.b);
          return m ? Object.assign({ mesh: m, tex: g.tex }, g.opts) : null;
        }).filter(Boolean);
        return this;
      }
    };
    return st;
  }

  /* ============================================================
   *  家具
   * ============================================================ */
  /** 简单的四条腿桌子；w 宽（X）、d 深（Z）、h 高 */
  function table(b, m, w, d, h, col, thick) {
    const t = thick || 0.06;
    // m 的原点 = 桌面上表面中心；h = 桌面离地高度
    G.box.call(b, m, w, t, d, col, 1.1);
    const legH = Math.max(0.1, h - t);
    const bx = w / 2 - 0.07, bz = d / 2 - 0.07;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const mm = M.mul(m, M.trs(sx * bx, -t / 2 - legH / 2, sz * bz));
      G.box.call(b, mm, 0.075, legH, 0.075, [col[0] * 0.72, col[1] * 0.72, col[2] * 0.72], 1.4);
    }
    for (const sz of [-1, 1]) {
      const mm = M.mul(m, M.trs(0, -t / 2 - legH * 0.28, sz * bz));
      G.box.call(b, mm, w - 0.2, 0.045, 0.04, [col[0] * 0.66, col[1] * 0.66, col[2] * 0.66], 1.4);
    }
  }

  function drawer(b, m, w, h, d, faceCol) {
    G.box.call(b, m, w, h, d, faceCol, 1.2);
    // 拉手
    const mm = M.mul(m, M.trs(0, 0, d / 2 + 0.012));
    G.box.call(b, mm, w * 0.36, 0.028, 0.028, [0.55, 0.45, 0.28], 2);
  }

  function chair(b, m, col, wood) {
    const w = 0.46, d = 0.44, sh = 0.45;
    G.box.call(b, M.mul(m, M.trs(0, sh, 0)), w, 0.06, d, col, 1.2);      // 坐垫
    G.box.call(b, M.mul(m, M.trs(0, sh - 0.035, 0)), w * 0.96, 0.05, d * 0.96, wood, 1.3);
    // 靠背
    G.box.call(b, M.mul(m, M.trs(0, sh + 0.28, -d / 2 + 0.04)), w * 0.92, 0.5, 0.055, col, 1.1);
    G.box.call(b, M.mul(m, M.trs(0, sh + 0.53, -d / 2 + 0.04)), w * 0.92, 0.05, 0.08, wood, 1.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      G.box.call(b, M.mul(m, M.trs(sx * (w / 2 - 0.04), sh / 2, sz * (d / 2 - 0.04))),
        0.05, sh, 0.05, wood, 1.6);
    }
  }

  /** 显示器：机身 + 支架（屏幕单独画，用 unlit 贴图） */
  function monitorBody(b, m, w, h) {
    const d = 0.045;
    G.box.call(b, m, w, h, d, [0.10, 0.11, 0.13], 1);
    // 边框
    const frame = [0.06, 0.065, 0.075];
    G.box.call(b, M.mul(m, M.trs(0, h / 2 + 0.012, 0)), w + 0.02, 0.025, d + 0.012, frame, 1);
    G.box.call(b, M.mul(m, M.trs(0, -h / 2 - 0.012, 0)), w + 0.02, 0.025, d + 0.012, frame, 1);
    G.box.call(b, M.mul(m, M.trs(-w / 2 - 0.01, 0, 0)), 0.022, h + 0.05, d + 0.012, frame, 1);
    G.box.call(b, M.mul(m, M.trs(w / 2 + 0.01, 0, 0)), 0.022, h + 0.05, d + 0.012, frame, 1);
    // 支架由场景单独绘制，避免机身自带支架和场景支架重复/错位
  }
  function monitorScreen(b, m, w, h, tex) {
    void tex;
    // 屏幕本体用 unlit 画（贴图由场景绑定），这里只负责几何体
    G.quad.call(b, m, w - 0.03, h - 0.03, [1, 1, 1], [0, 0, 1, 1]);
  }

  function keyboard(b, m, w) {
    w = w || 0.44;
    G.box.call(b, m, w, 0.022, 0.15, [0.12, 0.13, 0.15], 1);
    const r = rng(7);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 13; i++) {
        const k = 0.9 + r() * 0.2;
        G.box.call(b, M.mul(m, M.trs(-w / 2 + 0.045 + i * (w - 0.09) / 12.6,
          0.014, -0.045 + j * 0.031)),
          (w - 0.1) / 14, 0.008, 0.024, [0.22 * k, 0.23 * k, 0.25 * k], 1);
      }
    }
  }
  function mouse(b, m) {
    // 扁平鼠标：压扁的椭球 + 滚轮 + 分缝 + 线
    G.sphere.call(b, M.mul(m, M.trs(0, 0.018, 0, 0, 0, 0, 1, 0.45, 1.35)), 0.04, 14, 8, [0.14, 0.15, 0.17]);
    G.box.call(b, M.mul(m, M.trs(0, 0.034, -0.012)), 0.008, 0.006, 0.022, [0.3, 0.3, 0.32], 1);
    G.box.call(b, M.mul(m, M.trs(0, 0.033, 0.022)), 0.002, 0.003, 0.026, [0.08, 0.08, 0.09], 1);
    b.tube.call(b, M.mul(m, M.trs(0, 0.012, -0.04)), [
      [0, 0, 0], [0, 0.003, -0.08], [0, 0.003, -0.14],
      [-0.10, 0.003, -0.18], [-0.25, 0.003, -0.20], [-0.35, 0.003, -0.20]
    ], 0.004, 6, [0.08, 0.08, 0.09]);
  }
  function mug(b, m, col, r) {
    r = r || 0.045;
    b.cyl.call(b, m, r, r, 0.1, 14, col, false);
    b.cyl.call(b, M.mul(m, M.trs(0, 0.098, 0)), r * 0.86, r * 0.86, 0.004, 14, [0.16, 0.13, 0.10], true);
    b.torus.call(b, M.mul(m, M.trs(r + 0.014, 0.055, 0)), r * 0.52, r * 0.11, 12, 6, col);
  }
  function papers(b, m, n, seed) {
    const r = rng(seed || 13);
    for (let i = 0; i < n; i++) {
      const mm = M.mul(m, M.trs((r() - 0.5) * 0.22, 0.002 + i * 0.0012, (r() - 0.5) * 0.16));
      G.quad.call(b, M.mul(mm, M.trs(0, 0, 0, -Math.PI / 2, (r() - 0.5) * 0.5, 0)), 0.21, 0.29, [1, 1, 1], [0, 0, 1, 1]);
    }
  }

  /* ============================================================
   *  书架与书
   * ============================================================ */
  function book(b, m, w, h, d, col) {
    const t = 0.006;                    // 封面/书脊板厚
    const paper = [0.92, 0.89, 0.78];   // 书页
    const cy = h / 2;
    // 书页块：收在封面里，四周露出纸色
    G.box.call(b, M.mul(m, M.trs(0, cy, 0)), w - t * 2, h - t * 2, d - t * 2, paper, 1);
    if (h >= w) {
      // 立着的书：左右大面是前后封面
      for (const sx of [-1, 1]) {
        G.box.call(b, M.mul(m, M.trs(sx * (w / 2 - t / 2), cy, 0)), t, h, d, col, 2.2);
      }
    } else {
      // 平放的书：上下大面是封面/封底
      for (const sy of [-1, 1]) {
        G.box.call(b, M.mul(m, M.trs(0, cy + sy * (h / 2 - t / 2), 0)), w, t, d, col, 2.2);
      }
    }
    // 书脊：只在 +Z 窄面用封面色
    G.box.call(b, M.mul(m, M.trs(0, cy, d / 2 - t / 2)), w, h, t, col, 2.2);
    // 书脊烫金：立着的两道，平放的一道
    const gold = [col[0] * 0.55 + 0.35, col[1] * 0.48 + 0.28, col[2] * 0.3 + 0.1];
    if (h >= w) {
      G.box.call(b, M.mul(m, M.trs(0, cy + h * 0.22, d / 2 + 0.001)), w * 0.82, h * 0.028, 0.004, gold, 1);
      G.box.call(b, M.mul(m, M.trs(0, cy - h * 0.22, d / 2 + 0.001)), w * 0.82, h * 0.018, 0.004, gold, 1);
    } else {
      G.box.call(b, M.mul(m, M.trs(0, cy, d / 2 + 0.001)), w * 0.82, 0.003, 0.004, gold, 1);
    }
  }

  /** 一排书（沿 X 轴排开），返回占用的宽度；gap 表示留空 */
  const BOOK_COLS = [
    [[0.52, 0.10, 0.09], [0.18, 0.22, 0.42], [0.12, 0.30, 0.20], [0.55, 0.42, 0.12],
     [0.30, 0.12, 0.28], [0.10, 0.32, 0.34], [0.62, 0.55, 0.40], [0.16, 0.16, 0.18]]
  ];
  function bookRow(b, m, width, colSeed, opts) {
    const r = rng(colSeed || 3);
    let x = -width / 2;
    const maxH = opts && opts.maxH || 0.3;
    while (x < width / 2 - 0.02) {
      const bw = 0.022 + r() * 0.03;
      if (x + bw > width / 2) break;
      if (r() < 0.07) { x += bw * (1.2 + r()); continue; }   // 偶尔留个空
      const hh = maxH * (0.62 + r() * 0.36);
      const col = mix(pick(r, BOOK_COLS[0]), [0.85, 0.8, 0.7], 0.06);
      const mm = M.mul(m, M.trs(x + bw / 2, 0, (r() - 0.5) * 0.01,
        0, 0, (r() - 0.5) * 0.03));
      book(b, mm, bw, hh, 0.19 + r() * 0.08, col);
      x += bw + 0.002;
    }
  }

  /** 书架：w 宽，h 高，d 深；shelves 层数。books 为 true 时自动摆书 */
  function bookshelf(b, m, w, h, d, shelves, opts) {
    const wood = (opts && opts.woodCol) || [0.26, 0.17, 0.10];
    const t = 0.05;
    // 侧板 / 顶 / 底 / 背板
    G.box.call(b, M.mul(m, M.trs(-w / 2 + t / 2, h / 2, 0)), t, h, d, wood, 1.6);
    G.box.call(b, M.mul(m, M.trs(w / 2 - t / 2, h / 2, 0)), t, h, d, wood, 1.6);
    G.box.call(b, M.mul(m, M.trs(0, h - t / 2, 0)), w, t, d, wood, 1.4);
    G.box.call(b, M.mul(m, M.trs(0, t / 2, 0)), w, t, d, wood, 1.4);
    G.box.call(b, M.mul(m, M.trs(0, h / 2, -d / 2 + 0.012)), w - t * 2, h - t * 2, 0.024,
      [wood[0] * 0.72, wood[1] * 0.72, wood[2] * 0.72], 1.2);
    const gap = (h - t * 2) / shelves;
    for (let i = 1; i < shelves; i++) {
      const y = t + gap * i;
      G.box.call(b, M.mul(m, M.trs(0, y, 0.005)), w - t * 2, 0.035, d - 0.03, wood, 1.5);
      // 层板前缘
      G.box.call(b, M.mul(m, M.trs(0, y, d / 2 - 0.012)), w - t * 2, 0.05, 0.02,
        [wood[0] * 1.2, wood[1] * 1.2, wood[2] * 1.2], 1.6);
    }
    void opts;
  }
  function shelfBooks(bb, m, w, d, h, shelves, seed) {
    const r = rng(seed || 11);
    const t = 0.05;
    const gap = (h - t * 2) / shelves;
    for (let i = 0; i < shelves; i++) {
      const y = t + gap * i + 0.035;
      const innerW = w - t * 2 - 0.02;
      let x = -innerW / 2;
      // 每层用 1~3 段书排，中间留空
      while (x < innerW / 2 - 0.05) {
        const seg = Math.min(innerW / 2 - x, 0.5 + r() * 0.9);
        if (r() > 0.18) {
          const mm = M.mul(m, M.trs(x + seg / 2, y, 0.01, 0, 0, 0, 1, 1, 1));
          bookRow(bb, mm, seg - 0.01, Math.floor(r() * 9999), { maxH: gap * 0.72 });
        }
        x += seg + 0.02;
      }
      // 躺着的书 / 小摆件
      if (r() < 0.35) {
        const sx = (r() - 0.5) * (innerW - 0.2);
        book(bb, M.mul(m, M.trs(sx, y, 0.03, 0, 0.2 * (r() - 0.5), 0)), 0.12, 0.03, 0.17,
          [0.4 + r() * 0.2, 0.2 + r() * 0.2, 0.16]);
      }
    }
  }

  /* ============================================================
   *  植物
   * ============================================================ */
  function pot(b, m, r, h, col) {
    b.cyl.call(b, m, r * 0.82, r, h, 14, col, true);
    b.cyl.call(b, M.mul(m, M.trs(0, h - 0.005, 0)), r * 0.94, r * 0.94, 0.03, 14,
      [0.16, 0.13, 0.10], true);
  }
  /** 一片叶子：带弧度、沿长度方向分段的长条面片。
   *  形状交给 leaf 贴图的 alpha，这里只负责弯曲和朝向。 */
  function leafBlade(b, m, len, wid, col, curve) {
    const seg = 4;
    const nm = A3D.M.normalMat(m);
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const x = t * len;
      const y = Math.sin(t * Math.PI * (curve === undefined ? 0.5 : curve)) * len * 0.28;
      pts.push([x, y, t]);
    }
    for (let i = 0; i < seg; i++) {
      const a = pts[i], c = pts[i + 1];
      // 两端宽度分别计算，相邻段共享边使用同一宽度，避免横向裂缝
      const wa = wid * (0.75 + 0.25 * Math.sin(a[2] * Math.PI));
      const wc = wid * (0.75 + 0.25 * Math.sin(c[2] * Math.PI));
      const q = [[a[0], a[1], wa], [c[0], c[1], wc], [c[0], c[1], -wc], [a[0], a[1], -wa]];
      const uv = [[0, a[2]], [0, c[2]], [1, c[2]], [1, a[2]]];
      // 法线：叶片切向 × 横向
      let tx = c[0] - a[0], ty = c[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      const nx = -ty / l, ny = tx / l;
      for (let k = 0; k < 4; k++) {
        const p = q[k];
        b._v(b.d, m, nm, p[0], p[1], p[2], nx, ny, 0, uv[k][0], uv[k][1], col, a[2]);
      }
      b._pushQuad(b.count - 4);
    }
  }
  /** 单面片叶子：整片一个 quad，没有内部分段缝 */
  function leafFlat(b, m, len, wid, col) {
    const nm = A3D.M.normalMat(m);
    const q = [[0, 0, wid], [len, 0, wid], [len, 0, -wid], [0, 0, -wid]];
    const uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const sway = [0, 1, 1, 0];
    for (let k = 0; k < 4; k++) {
      b._v(b.d, m, nm, q[k][0], q[k][1], q[k][2], 0, 1, 0,
        uv[k][0], uv[k][1], col, sway[k]);
    }
    b._pushQuad(b.count - 4);
  }

  /** 一盆观叶植物 */
  function plant(b, m, op) {
    op = op || {};
    const r = rng(op.seed || 5);
    const ph = op.potH || 0.26;
    pot(b, m, op.potR || 0.17, ph, op.potCol || [0.45, 0.27, 0.18]);
    const n = op.leaves || 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5;
      const tilt = 0.5 + r() * 0.8;
      const len = (op.leafLen || 0.42) * (0.7 + r() * 0.5);
      const mm = M.mul(M.mul(m, M.trs(0, ph - 0.02, 0, 0, a, 0)),
        M.trs(0, 0, 0, 0, 0, tilt));
      leafBlade(b, mm, len, len * (0.34 + r() * 0.12),
        [0.55 + r() * 0.3, 0.8 + r() * 0.2, 0.5 + r() * 0.2]);
    }
    void op.leafLen;
  }
  /** 修长叶片（虎尾兰 / 水草） */
  function tallLeaves(b, m, n, h, col, seed) {
    const r = rng(seed || 3);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, lean = (r() - 0.5) * 0.9;
      const mm = M.mul(M.mul(m, M.trs((r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1, 0, a, 0)),
        M.trs(0, 0, 0, lean * 0.6, 0, lean));
      leafBlade(b, mm, h * (0.6 + r() * 0.6), 0.035, col);
    }
  }
  function grass(b, m, n, h, col, seed, spread) {
    const r = rng(seed || 7);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = r() * (spread || 0.3);
      const mm = M.mul(M.mul(m, M.trs(Math.cos(a) * rr, 0, Math.sin(a) * rr, 0, r() * TAU, 0)),
        M.trs(0, 0, 0, 0, 0, (r() - 0.5) * 0.5));
      leafBlade(b, mm, h * (0.5 + r() * 0.8), 0.012 + r() * 0.01, col);
    }
  }
  /** 菊花：茎 + 叶片 + 花瓣（petal builder） */
  function chrysanthemum(bFlower, bStem, m, scale, colTint, seed) {
    const r = rng(seed || 2);
    const s = scale || 1;
    const headY = 0.36 * s;
    const lean = (r() - 0.5) * 0.03;
    const pts = [[0, 0, 0], [lean * 0.4, headY * 0.4, 0], [lean, headY * 0.75, 0], [lean * 1.6, headY - 0.12 * s, 0]];
    bStem.tube.call(bStem, m, pts, 0.012 * s, 5, [0.24, 0.42, 0.18]);
    // 叶片用实心菱形，避免无贴图的长条像被切断
    const leafQuad = (mm, ll, ww) => {
      const nm = A3D.M.normalMat(mm);
      const vs = [[0, 0, 0], [ll * 0.45, 0.012, -ww], [ll, 0.02, 0], [ll * 0.45, 0.012, ww]];
      const uvs = [[0.5, 0], [0, 0.5], [0.5, 1], [1, 0.5]];
      const sway = [0, 0.5, 1, 0.5];
      for (let k = 0; k < 4; k++) {
        bStem._v(bStem.d, mm, nm, vs[k][0], vs[k][1], vs[k][2], 0, 1, 0,
          uvs[k][0], uvs[k][1], [0.3, 0.55, 0.22], sway[k]);
      }
      bStem._pushQuad(bStem.count - 4);
    };
    // 三片叶子只长在茎中下段，根部按茎的折线插值，绝不离开茎
    for (let i = 0; i < 3; i++) {
      const u = 0.12 + i * 0.30;               // 0.12 / 0.42 / 0.72
      const p0 = pts[i === 0 ? 0 : 1], p1 = pts[i === 0 ? 1 : 2];
      const p = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, 0];
      const ang = i * 2.1 + 0.4;
      const mm = M.mul(m, M.trs(p[0], p[1], p[2], 0.22, ang, 0.45));
      leafQuad(mm, 0.10 * s, 0.032 * s);
    }
    // 3D 重瓣花：每层花瓣从不同半径/高度长出，沿半径向外，面朝默认视角
    const head = M.mul(m, M.trs(lean * 1.6, headY, 0, 0.06, -0.78, 0.08, 1, 1, 1));
    const tint = colTint || [1, 1, 1];
    // α 平面 = 花头局部 z=0 平面；五层花瓣根部全部落在 α 上
    const rings = [
      { n: 18, rad: 0.058, len: 0.075, wid: 0.045, tilt: 0.10, phase: 0.00 },
      { n: 21, rad: 0.048, len: 0.066, wid: 0.042, tilt: 0.22, phase: 0.16 },
      { n: 24, rad: 0.038, len: 0.057, wid: 0.039, tilt: 0.38, phase: 0.32 },
      { n: 27, rad: 0.028, len: 0.048, wid: 0.036, tilt: 0.58, phase: 0.48 },
      { n: 30, rad: 0.018, len: 0.039, wid: 0.033, tilt: 0.82, phase: 0.64 }
    ];
    for (let ring = 0; ring < rings.length; ring++) {
      const R = rings[ring];
      for (let i = 0; i < R.n; i++) {
        const a = (i / R.n) * TAU + R.phase;
        const ca = Math.cos(a), sa = Math.sin(a);
        const bx = R.rad * s * ca, by = R.rad * s * sa;
        const len = R.len * s, wid = R.wid * s;
        // 1) 把花瓣根部放在 α 平面；2) 以根部为轴倾斜；3) 沿倾斜后的长度方向走到花瓣中心
        const baseM = M.mul(head, M.trs(bx, by, 0, 0, 0, a - Math.PI / 2));
        const tiltM = M.mul(baseM, M.trs(0, 0, 0, R.tilt, 0, 0));
        const pm = M.mul(tiltM, M.trs(0, len / 2, 0));
        bFlower.quad.call(bFlower, pm, wid, len,
          [tint[0] * (0.88 + ring * 0.04), tint[1] * (0.88 + ring * 0.04), tint[2]], [0, 0, 1, 1]);
      }
    }
    // 实心花托：用实心茎材质，不用带 cutout 的花瓣贴图，避免球面透明露洞
    bStem.sphere.call(bStem, M.mul(head, M.trs(0, 0, 0.03 * s)),
      0.030 * s, 10, 6, [0.72, 0.55, 0.18]);
  }

  /* ============================================================
   *  灯具
   * ============================================================ */
  function tableLamp(bMetal, bShade, m, h, shadeCol) {
    h = h || 0.42;
    bMetal.cyl.call(bMetal, M.mul(m, M.trs(0, 0, 0)), 0.075, 0.06, 0.02, 14, [0.25, 0.22, 0.18], true);
    bMetal.cyl.call(bMetal, M.mul(m, M.trs(0, 0.02, 0)), 0.012, 0.009, h * 0.62, 8, [0.4, 0.33, 0.22], true);
    bShade.cyl.call(bShade, M.mul(m, M.trs(0, h * 0.62, 0)), 0.10, 0.135, 0.16, 16,
      shadeCol || [0.95, 0.82, 0.6], false);
  }
  function paperLantern(bPaper, bMetal, m, r, col) {
    bPaper.sphere.call(bPaper, M.mul(m, M.trs(0, 0, 0, 0, 0, 0, 1, 1.15, 1)), r, 28, 18, col || [0.9, 0.55, 0.25]);
    bMetal.cyl.call(bMetal, M.mul(m, M.trs(0, r * 1.1, 0)), r * 0.36, r * 0.36, 0.03, 10, [0.2, 0.15, 0.1], true);
    bMetal.cyl.call(bMetal, M.mul(m, M.trs(0, -r * 1.15, 0)), r * 0.3, r * 0.3, 0.02, 10, [0.2, 0.15, 0.1], true);
  }

  /* ============================================================
   *  户外 / 营地
   * ============================================================ */
  function tent(b, m, kind, col, seed) {
    const r = rng(seed || 4);
    if (kind === "a") {
      // A 字帐篷：两个斜面 + 背面三角 + 门帘
      const w = 2.4, d = 3.0, h = 2.0;
      quad4(b, m, [-w / 2, 0, -d / 2], [0, h, -d / 2], [0, h, d / 2], [-w / 2, 0, d / 2], col, [0, 0, 2, 1.4]);
      quad4(b, m, [0, h, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [0, h, d / 2], col, [0, 0, 2, 1.4]);
      b.tri.call(b, m, [-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [0, h, -d / 2], null, col);
      G.quad.call(b, M.mul(m, M.trs(0, h * 0.42, d / 2 + 0.01, 0, 0, 0)), w * 0.4, h * 0.84,
        [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], [0, 0, 1, 1]);
      void r;
    } else if (kind === "dome") {
      const rad = 1.5;
      b.sphere.call(b, M.mul(m, M.trs(0, 0, 0, 0, 0, 0, 1, 0.75, 1)), rad, 16, 10, col);
      G.quad.call(b, M.mul(m, M.trs(0, 0.55, rad * 0.78)), 0.8, 1.1,
        [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55], [0, 0, 1, 1]);
    } else if (kind === "yurt") {
      const rad = 1.7;
      b.cyl.call(b, m, rad, rad, 1.5, 18, col, false);
      b.cyl.call(b, M.mul(m, M.trs(0, 1.5, 0)), rad * 0.98, 0.16, 0.85, 18,
        [col[0] * 0.92, col[1] * 0.92, col[2] * 0.92], true);
      G.quad.call(b, M.mul(m, M.trs(0, 0.7, rad * 0.99)), 0.9, 1.35,
        [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], [0, 0, 1, 2]);
    } else if (kind === "circus") {
      // 马戏团帐篷：锥顶 + 条纹
      const rad = 1.9;
      b.cyl.call(b, m, rad, rad, 1.2, 16, col, false);
      b.cyl.call(b, M.mul(m, M.trs(0, 1.2, 0)), rad, 0.1, 1.6, 16,
        [col[0] * 0.95, col[1] * 0.95, col[2] * 0.95], true);
      // 条纹
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const mm = M.mul(m, M.trs(Math.cos(a) * rad * 0.995, 0.6, Math.sin(a) * rad * 0.995, 0, -a + Math.PI / 2, 0));
        G.quad.call(b, mm, rad * 0.35, 1.12, [1, 0.97, 0.9], [0, 0, 1, 1]);
      }
      G.quad.call(b, M.mul(m, M.trs(0, 0.6, rad * 0.995)), 0.7, 1.1,
        [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5], [0, 0, 1, 1]);
    }
  }

  /** 篝火：石圈 + 木柴 + 火焰（火焰由发光四边形绘制） */
  function campfire(b, m, r, stones, wood) {
    const g = Math.max(6, 8);
    for (let i = 0; i < g; i++) {
      const a = (i / g) * TAU + 0.2;
      b.sphere.call(b, M.mul(m, M.trs(Math.cos(a) * r, 0.03, Math.sin(a) * r, 0, a, 0.2)),
        0.075 + (i % 3) * 0.015, 7, 5, stones || [0.3, 0.3, 0.29]);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      b.box.call(b, M.mul(m, M.trs(Math.cos(a) * 0.12, 0.06, Math.sin(a) * 0.12, 0, -a, Math.PI / 2.4)),
        0.4, 0.06, 0.06, wood || [0.3, 0.2, 0.12], 3);
    }
  }

  function crate(b, m, s, col) {
    G.box.call(b, m, s, s, s, col, 1.4);
    // 板条
    for (const sx of [-1, 1]) {
      G.box.call(b, M.mul(m, M.trs(sx * s / 2 + sx * 0.012, 0, 0)), 0.02, s * 0.92, s * 0.92,
        [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], 1.6);
    }
    G.box.call(b, M.mul(m, M.trs(0, s / 2 + 0.01, 0)), s * 1.02, 0.03, s * 1.02,
      [col[0] * 1.15, col[1] * 1.15, col[2] * 1.15], 1.4);
  }
  function barrel(b, m, r, h, metalCol, woodCol) {
    b.cyl.call(b, M.mul(m, M.trs(0, 0, 0)), r * 0.9, r, h * 0.5, 14, woodCol || [0.35, 0.22, 0.12], false);
    b.cyl.call(b, M.mul(m, M.trs(0, h * 0.5, 0)), r, r * 0.9, h * 0.5, 14, woodCol || [0.35, 0.22, 0.12], false);
    for (const t of [0.15, 0.5, 0.85]) {
      b.torus.call(b, M.mul(m, M.trs(0, h * t, 0)), r * (0.98 - Math.abs(t - 0.5) * 0.06), 0.012, 14, 5,
        metalCol || [0.3, 0.3, 0.32]);
    }
  }

  /* ============================================================
   *  机房
   * ============================================================ */
  /** 机柜柜体。正面面板由调用方单独画（贴图不同，不能挤在同一个 batch 里，
   *  更不能和柜体自己带的面板贴在同一位置 —— 会 z-fighting 成一团条纹）。 */
  function rack(b, m, w, h, d) {
    // 柜体
    G.box.call(b, m, w, h, d, [0.06, 0.07, 0.08], 1);
    // 顶盖
    G.box.call(b, M.mul(m, M.trs(0, h / 2 + 0.01, 0)), w + 0.02, 0.02, d + 0.02, [0.1, 0.11, 0.12], 1);
    // 底部通风板
    G.box.call(b, M.mul(m, M.trs(0, -h / 2 + 0.02, d / 2 + 0.01)), w * 0.8, 0.03, 0.01, [0.14, 0.15, 0.16], 1);
  }

  /* ============================================================
   *  窗
   * ============================================================ */
  /** 拱形大窗的木框：w 宽，h 高，放在局部 XY 平面的 z=0 */
  function archWindowFrame(b, m, w, h, thick, col) {
    const r = w / 2;
    const topR = Math.min(r, h * 0.35);
    // 外框
    G.box.call(b, M.mul(m, M.trs(-w / 2, 0, 0)), thick, h, thick * 1.6, col, 1.6);
    G.box.call(b, M.mul(m, M.trs(w / 2, 0, 0)), thick, h, thick * 1.6, col, 1.6);
    G.box.call(b, M.mul(m, M.trs(0, -h / 2, 0)), w + thick, thick, thick * 1.6, col, 1.6);
    // 拱顶（用短段拼）
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI * (i / segs), a1 = Math.PI * ((i + 1) / segs);
      const p0 = [Math.cos(a0) * r, h / 2 + Math.sin(a0) * topR];
      const p1 = [Math.cos(a1) * r, h / 2 + Math.sin(a1) * topR];
      const cx = (p0[0] + p1[0]) / 2, cy = (p0[1] + p1[1]) / 2;
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      G.box.call(b, M.mul(m, M.trs(cx, cy, 0, 0, 0, ang)), len + thick * 0.6, thick, thick * 1.6, col, 1.4);
    }
    // 中挺 + 横挺
    G.box.call(b, M.mul(m, M.trs(0, 0, 0)), thick * 0.8, h, thick * 1.2, col, 1.4);
    G.box.call(b, M.mul(m, M.trs(0, h * 0.12, 0)), w, thick * 0.8, thick * 1.2, col, 1.4);
    // 窗台
    G.box.call(b, M.mul(m, M.trs(0, -h / 2 - thick * 0.5, thick * 0.4)), w + thick * 3, thick * 1.2, thick * 3.4, col, 1.2);
  }

  /* ============================================================
   *  街景
   * ============================================================ */
  /** 摊位：两根柱子 + 斜顶篷 + 台面；返回台面高度 */
  function stall(bWood, bCloth, m, w, d, colA, colB) {
    const postH = 2.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bWood.cyl.call(bWood, M.mul(m, M.trs(sx * w / 2, 0, sz * d / 2)), 0.045, 0.04, postH, 6, [0.3, 0.22, 0.15], true);
    }
    // 顶篷：两片真正斜着的篷布（脊线沿 X，向两侧下垂）
    const eaveY = postH + 0.06, ridgeY = postH + 0.44;
    const half = d / 2 + 0.32;
    quad4(bCloth, m, [-w / 2 - 0.12, eaveY, half], [w / 2 + 0.12, eaveY, half],
      [w / 2 + 0.12, ridgeY, 0], [-w / 2 - 0.12, ridgeY, 0], colA, [0, 0, 3, 1.2]);
    quad4(bCloth, m, [w / 2 + 0.12, eaveY, -half], [-w / 2 - 0.12, eaveY, -half],
      [-w / 2 - 0.12, ridgeY, 0], [w / 2 + 0.12, ridgeY, 0], colA, [0, 0, 3, 1.2]);
    // 前沿的垂布
    quad4(bCloth, m, [-w / 2 - 0.12, eaveY, half], [w / 2 + 0.12, eaveY, half],
      [w / 2 + 0.12, eaveY - 0.26, half], [-w / 2 - 0.12, eaveY - 0.26, half], colA, [0, 0, 3, 0.4]);
    // 台面
    G.box.call(bWood, M.mul(m, M.trs(0, 0.9, 0)), w * 0.9, 0.07, d * 0.55, [0.4, 0.3, 0.2], 1.2);
    G.box.call(bWood, M.mul(m, M.trs(0, 0.86, d * 0.26)), w * 0.9, 0.18, 0.02, colB, 1.2);
    return 0.95;
  }

  /** 屎山：随机叠起来的方块 + 垃圾袋 */
  function garbagePile(b, bBag, m, s, seed) {
    const r = rng(seed || 9);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const w = s * (0.15 + r() * 0.45), hh = s * (0.1 + r() * 0.3), d = s * (0.15 + r() * 0.4);
      const y = (i / n) * s * 0.95 * (0.4 + r() * 0.8);
      const rad = s * 0.42 * (1 - y / (s * 1.2));
      const a = r() * TAU, rr = r() * rad;
      const grey = 0.14 + r() * 0.16;
      G.box.call(b, M.mul(m, M.trs(Math.cos(a) * rr, y, Math.sin(a) * rr,
        (r() - 0.5) * 0.3, r() * 0.6, (r() - 0.5) * 0.3)),
        w, hh, d, [grey, grey * (0.9 + r() * 0.2), grey * 0.9], 1.4);
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, rr = s * (0.2 + r() * 0.3);
      bBag.sphere.call(bBag, M.mul(m, M.trs(Math.cos(a) * rr, r() * 0.2, Math.sin(a) * rr, 0, a, 0.3)),
        0.12 + r() * 0.1, 8, 6, [0.1 + r() * 0.08, 0.12, 0.1]);
    }
  }

  /** 鸟：两片翅膀，绕 Y 轴飞 */
  function birdWings(b, m, flap, col, size) {
    const s = size || 0.16;
    for (const sx of [-1, 1]) {
      const mm = M.mul(m, M.trs(sx * s * 0.6, 0, 0, 0, 0, sx * flap));
      G.quad.call(b, M.mul(mm, M.trs(0, 0, 0, Math.PI / 2, 0, 0)), s * 1.6, s * 0.5, col, [0, 0, 1, 1]);
    }
    b.sphere.call(b, m, s * 0.28, 6, 4, col);
  }


  /** 用四个世界空间顶点直接摆一片四边形（帐篷斜面、幕布这类） */
  function quad4(b, m, p0, p1, p2, p3, col, uvRect, sway) {
    const nm = A3D.M.normalMat(m);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const t = uvRect || [0, 0, 1, 1];
    const uv = [[t[0], t[1]], [t[2], t[1]], [t[2], t[3]], [t[0], t[3]]];
    const P = [p0, p1, p2, p3];
    for (let i = 0; i < 4; i++) {
      const q = P[i];
      b._v(b.d, m, nm, q[0], q[1], q[2], nx, ny, nz, uv[i][0], uv[i][1], col, sway);
    }
    b._pushQuad(b.count - 4);
  }

  /** 极简人物剪影：身体 + 头 + 两条腿，远看足够 */
  function figure(b, m, col, opts) {
    const o = opts || {};
    const h = o.h || 1.7;
    const s = h / 1.7;
    b.cyl.call(b, M.mul(m, M.trs(0, 0.55 * s, 0)), 0.17 * s, 0.23 * s, 0.62 * s, 8, col, true);
    b.cyl.call(b, M.mul(m, M.trs(0, 1.15 * s, 0)), 0.2 * s, 0.09 * s, 0.28 * s, 8, col, false);
    b.sphere.call(b, M.mul(m, M.trs(0, 1.52 * s, 0)), 0.13 * s, 8, 6, col);
    for (const sx of [-1, 1]) {
      b.cyl.call(b, M.mul(m, M.trs(sx * 0.09 * s, 0, 0)), 0.07 * s, 0.06 * s, 0.58 * s, 6, col, true);
    }
    if (o.sit) {
      // 坐着的人：腿抬起来，整体压低
      b.cyl.call(b, M.mul(m, M.trs(0.14, 0.38 * s, 0, 0, 0, 1.3)), 0.07 * s, 0.06 * s, 0.5 * s, 6, col, true);
      b.cyl.call(b, M.mul(m, M.trs(-0.14, 0.38 * s, 0, 0, 0, 1.3)), 0.07 * s, 0.06 * s, 0.5 * s, 6, col, true);
    }
  }

  return {
    rng, pick, mix, stage, quad4, figure,
    table, drawer, chair, monitorBody, monitorScreen, keyboard, mouse, mug, papers,
    book, bookRow, bookshelf, shelfBooks,
    pot, leafBlade, leafFlat, plant, tallLeaves, grass, chrysanthemum,
    tableLamp, paperLantern,
    tent, campfire, crate, barrel, rack, archWindowFrame, stall, garbagePile, birdWings
  };
})();

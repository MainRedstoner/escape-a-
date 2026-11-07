/* ============================================================
 * Escape A÷ · game/src/world.js —— 「修复屎山」的世界状态机
 *
 * 这一层是纯逻辑：不认识 canvas、不认识 DOM，只有 grid / bugs / lit / player。
 * 这么切有两个好处：
 *   1. 整份状态可以 JSON 快照 —— commit 存档与回档就是 JSON.parse/stringify；
 *   2. 无头模拟（node 里跑 bot 通关）能直接调它，不用起浏览器。
 *
 * 逻辑按 tick 推进（STEP_HZ 次/秒）：世界是 60Hz 实时，玩家位置是连续坐标，
 * 虫子和机关仍以格为单位移动（按各自的秒数节奏）。同一个 commit 回档两次，
 * 世界状态仍然一致 —— 玩家在 tick 之间的输入才会改变结果。
 *
 * W 是纯数据；W.api 是给 bugs.js 用的窄接口（不进快照）。
 * ============================================================ */
"use strict";

window.WORLD = (() => {

  const STEP_HZ = 60;
  const DT = 1 / STEP_HZ;
  const S = STEP_HZ / 8;              // 旧 8Hz 时代的 tick 数 → 现在的 tick 数

  /* ---------------- 玩家物理 ----------------
   * 坐标单位是格：格 tx 占据 [tx, tx+1)，格中心是 tx+0.5。
   * 玩家 p.x / p.y 是**中心点**的连续坐标，渲染时直接乘 TS。
   * 判定箱是扁长方形，上下沿不对称、跟着重力翻：
   *   阴影/支撑侧 P_S=0.533 —— 判定箱下/上沿、物理碰撞沿、渲染阴影的下缘切线三者合一
   *   （1.44r，r=0.37）：贴墙 / 落地时箱子与阴影都停在方块表面上，谁也不渗进去。
   *   代价是角色浮离表面 0.137 格（脚不沾地，由影子接地）—— 渲染层的偏移原样没动。
   *   胸口侧 P_H=0.12 —— 头不参与判定（矮顶下能多升 0.31 格才磕到）。
   * 落位（出生 / 挤压 / 旧档迁移）用「格底 - P_S」，让箱子整个落在格内。 */
  const PW = 0.66, P_H = 0.12, P_S = 0.533;
  const BUG_HIT = 0.6;                // 甲虫致死盒边长（格中心内接盒）—— 致死判定不再拿整 1×1 格当碰撞体
  const GRAV = 40;                    // 格/秒²
  const RUN_SIDE = 5.0;               // 横版水平速度
  const RUN_TOP = 5.4;                // 俯视速度
  const ACC_SIDE = 55, AIR_ACC = 45;  // 横版地面 / 空中加速度
  const ACC_TOP = 70;                 // 俯视加速度（快响应，但仍是连续速度）
  const JUMP_H = 2.15;                // 起跳最高点（格）—— 刚好能上 2 格台阶，上不了 3 格
  const JUMP_V0 = Math.sqrt(2 * GRAV * JUMP_H);
  const COYOTE = 0.14;                // 土狼时间（离开平台边缘后还能补救）
  const JUMP_BUF = 0.14;              // 跳跃缓冲（落地前按也算数）
  const MAX_FALL = 16;                // 最大下落速度
  const EPS = 1e-4;

  let LEVELS = null;
  function bindLevels(ref) { LEVELS = ref; }

  const keyOf = (L, x, y) => L + "," + x + "," + y;

  /* ================= 网格存取 ================= */
  function flat(rows) {
    const out = [];
    for (let y = 0; y < rows.length; y++) { const r = rows[y]; for (let x = 0; x < r.length; x++) out.push(r[x]); }
    return out;
  }
  function idx(W, L, x, y) { return L * W.w * W.h + y * W.w + x; }
  function inb(W, x, y) { return x >= 0 && y >= 0 && x < W.w && y < W.h; }
  function tileRaw(W, L, x, y) { return inb(W, x, y) ? W.layers[L][y * W.w + x] : "#"; }
  function setTileRaw(W, L, x, y, ch) { if (inb(W, x, y)) W.layers[L][y * W.w + x] = ch; }
  function tile(W, x, y) { return tileRaw(W, W.layer, x, y); }
  function setTile(W, x, y, ch) { setTileRaw(W, W.layer, x, y, ch); }
  function dyn(W, x, y) {
    const k = keyOf(W.layer, x, y);
    if (!W.dyn[k]) W.dyn[k] = {};
    return W.dyn[k];
  }
  function findChar(rows, ch) {
    for (let y = 0; y < rows.length; y++) { const i = rows[y].indexOf(ch); if (i >= 0) return { x: i, y }; }
    return { x: 1, y: 1 };
  }
  function collect(rows, ch) {
    const out = [];
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === ch) out.push({ x, y });
    return out;
  }

  /* ---------------- 玩家 AABB ---------------- */
  function syncCell(p) { p.cx = Math.floor(p.x); p.cy = Math.floor(p.y); }
  /** 判定箱上下沿（格）：跟着重力翻 —— 阴影/支撑侧永远是 P_S（阴影切线），胸口侧永远是 P_H */
  function yTop(W, p) { return p.y - (W.gravity > 0 ? P_H : P_S); }
  function yBot(W, p) { return p.y + (W.gravity > 0 ? P_S : P_H); }
  function boxOf(W, p) { return { l: p.x - PW / 2, r: p.x + PW / 2, t: yTop(W, p), b: yBot(W, p) }; }
  function cellX0(p) { return Math.floor(p.x - PW / 2 + EPS); }
  function cellX1(p) { return Math.floor(p.x + PW / 2 - EPS); }
  function cellY0(W, p) { return Math.floor(yTop(W, p) + EPS); }
  function cellY1(W, p) { return Math.floor(yBot(W, p) - EPS); }
  /** 玩家能不能站上去（横版支撑：实体格 + 单向平台） */
  function standable(W, x, y) {
    if (!inb(W, x, y)) return false;
    if (moverAt(W, x, y)) return true;
    const ch = tile(W, x, y);
    if (ch === "|") return true;
    if (ch === "+") return true;
    return solidAt(W, x, y);
  }
  function onewayAt(W, x, y) { return tile(W, x, y) === "+"; }

  /* ================= 阻挡判定 ================= */
  function moverAt(W, x, y) { for (const m of W.movers) if (m.x === x && m.y === y) return m; return null; }
  function isDoorOpen(W, x, y) { const k = keyOf(W.layer, x, y); return !!(W.dyn[k] && W.dyn[k].open); }
  function solidAt(W, x, y) {
    if (!inb(W, x, y)) return true;
    if (moverAt(W, x, y)) return true;
    const ch = tile(W, x, y);
    if (ch === "@") return false;                    // 起点只是地板上的记号，不是墙
    if (ch === "|") return !isDoorOpen(W, x, y);
    if (ch === "w") return false;                    // w 只是轨道，实体在 movers 里
    return !!TILES.def(ch).solid;
  }
  function isPitAt(W, x, y) {
    const ch = tile(W, x, y);
    if (ch === "&") return true;                      // 假地板下面是空的，只是玩家看不出来
    return !!TILES.def(ch).pit;
  }
  function supportAt(W, x, y) {
    if (!inb(W, x, y)) return true;
    if (moverAt(W, x, y)) return true;
    const ch = tile(W, x, y);
    if (ch === "|") return true;
    const d = TILES.def(ch);
    if (d.air) return false;                    // 空气踩不住
    if (d.solid || d.oneway) return true;
    return !d.pit && ch !== "&";
  }
  /** 虫子眼中的真实世界：认得假墙假地板，掉不进坑 */
  function bugBlock(W, b, x, y) {
    if (!inb(W, x, y)) return true;
    if (moverAt(W, x, y)) return true;
    if (b.kind === "heisen") return false;            // 海森堡虫穿墙
    if (b.kind === "crawler" && b.attached) return false;
    const ch = tile(W, x, y);
    if (ch === "|") return !isDoorOpen(W, x, y);
    if (ch === "w") return false;
    const d = TILES.def(ch);
    return !!d.solid || !!d.pit || ch === "&";
  }
  /** 玩家看到的样子（没被看穿时，假墙假地板会伪装成正常地块） */
  function look(W, x, y) {
    const ch = tile(W, x, y);
    if (W.reveal[idx(W, W.layer, x, y)] > 0) return ch;
    return TILES.lookOf(ch);
  }

  /* ================= 照明 / 记忆 ================= */
  /** 某格中心到玩家中心的距离（玩家是连续坐标，灯和探针仍按格中心） */
  function cellDist(W, x, y) { return U.dist(x + 0.5, y + 0.5, W.player.x, W.player.y); }
  function lightCircle(W, cx, cy, r, probeTicks) {
    const rr = Math.ceil(r + 1);
    const L = W.layer;
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
      if (!inb(W, x, y)) continue;
      if (U.dist(x + 0.5, y + 0.5, cx, cy) > r + 0.35) continue;
      const i = idx(W, L, x, y);
      W.lit[i] = W.tick; W.seen[i] = 1;
      if (probeTicks) W.reveal[i] = Math.max(W.reveal[i], probeTicks);
    }
  }
  function light(W) {
    const r = W.cfg.r;
    if (r > 0) lightCircle(W, W.player.x, W.player.y, r, 0);
    else {                                            // 全图常亮（教学关）
      for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) { const i = idx(W, W.layer, x, y); W.lit[i] = W.tick; W.seen[i] = 1; }
    }
    for (const l of W.lamps) lightCircle(W, l.x + 0.5, l.y + 0.5, l.r, 0);
    for (const f of W.flashes) lightCircle(W, f.x + 0.5, f.y + 0.5, f.r, f.probe ? f.ticks : 0);
  }
  /** 此刻是否被「观测」——只算实时光源，记忆不算 */
  function observed(W, x, y) {
    if (W.cfg.r <= 0) return true;
    if (cellDist(W, x, y) <= W.cfg.r + 0.35) return true;
    for (const f of W.flashes) if (U.dist(x + 0.5, y + 0.5, f.x + 0.5, f.y + 0.5) <= f.r + 0.35) return true;
    for (const l of W.lamps) if (U.dist(x + 0.5, y + 0.5, l.x + 0.5, l.y + 0.5) <= l.r + 0.35) return true;
    return false;
  }
  /** 渲染亮度：1 实时可见 · 0 全黑 · 中间是「还记得但已经模糊」 */
  function brightness(W, x, y) {
    if (observed(W, x, y)) return 1;
    const i = idx(W, W.layer, x, y);
    if (!W.seen[i]) return 0;
    if (W.cfg.assist) return 0.6;
    if (W.cfg.mem <= 0) return 0;
    const age = (W.tick - W.lit[i]) * DT;
    if (age > W.cfg.mem) return 0;
    const k = age / W.cfg.mem;
    return 0.68 - 0.36 * k * k;
  }
  /** 记忆还剩几秒（HUD 用来闪警告） */
  function memLeft(W, x, y) {
    const i = idx(W, W.layer, x, y);
    if (!W.seen[i] || W.lit[i] < 0) return 0;
    return W.cfg.mem - (W.tick - W.lit[i]) * DT;
  }

  /* ================= 建关 ================= */
  function create(li, opts) {
    opts = opts || {};
    const lv = LEVELS[li];
    if (!lv) throw new Error("没有第 " + li + " 关");

    const layers = [flat(lv.rows)];
    if (lv.rowsB) layers.push(flat(lv.rowsB));
    const st = findChar(lv.rows, "@");

    const W = {
      li, id: lv.id, name: lv.name, mode: lv.mode || "top", modeBase: lv.mode || "top",
      w: lv.w || lv.rows[0].length, h: lv.h || lv.rows.length, layers, layer: 0,
      dyn: {},
      lit: new Array(layers.length * lv.w * lv.h).fill(-1),
      seen: new Array(layers.length * lv.w * lv.h).fill(0),
      reveal: new Array(layers.length * lv.w * lv.h).fill(0),
      flashes: [],
      player: { x: st.x + 0.5, y: st.y + 1 - P_S, cx: st.x, cy: st.y,
                px: st.x + 0.5, py: st.y + 1 - P_S,
                vx: 0, vy: 0, dir: 1, lastDx: 1, lastDy: 0,
                grounded: false, coyote: 0, jumpBuf: 0, dropT: 0, landT: 0,
                cast: null, dead: false, inv: 0, stun: 0, logCd: 0, doorCd: 0 },
      bugs: [], movers: [], bands: [], leaks: [], ghosts: [], trail: [],
      tools: { test: (lv.tools && lv.tools.test) || 0 },
      commitLog: [], entropy: 0, reverted: 0, kills: 0, seenKinds: {},
      tick: 0, seed: opts.seed || (1234 + li * 77), rng: U.rngNew(opts.seed || (1234 + li * 77)),
      fired: {}, notes: [], toasts: [], flags: {}, tutFlags: {}, tutStep: 0,
      cfg: { r: lv.fog ? lv.fog.r : 4, mem: lv.fog && lv.fog.mem != null ? lv.fog.mem : 60,
             ghost: lv.fog && lv.fog.ghost != null ? lv.fog.ghost : 0.18, assist: !!opts.assist },
      prReady: false, gravity: 1, jump: lv.jump || 2,
      pDeadly: lv.pDeadly !== false, maxBugs: lv.maxBugs || 40,
      idc: 1, lamps: [], lampCov: [], mapCommits: collect(lv.rows, "o"),
      prs: collect(lv.rows, "P"), fakePrs: collect(lv.rows, "!"),
      deps: [], belts: [], events: lv.events || [], tut: lv.tut || []
    };

    /* 给 bugs.js 的窄接口：只暴露它需要的动作，闭包在 W 上，快照/回档后依然有效 */
    W.api = {
      /* 虫子只认识格子：给它一个中心格代理，免得 AI 拿浮点坐标去算邻格 */
      get player() { return { x: W.player.cx, y: W.player.cy }; },
      get gravity() { return W.gravity; },
      tile: (x, y) => tile(W, x, y),
      bugBlock: (b, x, y) => bugBlock(W, b, x, y),
      observed: (x, y) => observed(W, x, y),
      move: (b, dx, dy) => bugMove(W, b, dx, dy),
      place: (b, x, y) => { b.x = x; b.y = y; },
      remove: (b) => removeBug(W, b),
      spawn: (kind, x, y) => spawn(W, kind, x, y),
      explode: (x, y, r, why) => explode(W, x, y, r, why),
      toast: (text, tone) => toast(W, text, tone),
      note: text => note(W, text),
      sfx,
      rnd: () => U.rnd(W.rng),
      shuffle: arr => U.shuffle(W.rng, arr),
      nextId: () => W.idc++
    };

    /* 灯 / 依赖 / 传送带 的静态表 */
    for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
      const ch = tileRaw(W, 0, x, y), d = TILES.def(ch);
      if (d.lamp) {
        W.lamps.push({ x, y, r: d.lamp });
        const cov = [];
        for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x - 4; xx <= x + 4; xx++)
          if (inb(W, xx, yy) && U.dist(xx, yy, x, y) <= d.lamp) cov.push(idx(W, 0, xx, yy));
        W.lampCov.push(cov);
      }
      if (ch === "d") W.deps.push({ x, y });
      if (ch === "b") W.belts.push({ x, y, dir: beltDirOf(lv, x, y) });
    }

    /* 依赖顺序：level.pads 给的是 W.deps 的下标序列 */
    W.depOrder = (lv.pads || W.deps.map((_, i) => i)).slice();
    W.depNext = 0;

    /* 虫子 */
    for (const s of (lv.bugs || [])) {
      const b = spawn(W, s.kind, s.at[0], s.at[1]);
      if (b) {
        if (s.dir === "v") { b.dx = 0; b.dy = 1; } else if (s.dir === "h") { b.dx = 1; b.dy = 0; }
        if (s.speed) b.cd = Math.round(s.speed * S);
        if (s.range) b.range = s.range;
      }
    }
    for (const m of (lv.movers || [])) {
      W.movers.push({ x: m.at[0], y: m.at[1], ox: m.at[0], oy: m.at[1],
                      axis: m.axis || "x", span: m.span || 3, step: m.step || 1,
                      cd: Math.round((m.delay || 0) * S), rate: Math.round((m.rate || 8) * S),
                      dir: m.dir === "n" || m.dir === "w" ? -1 : 1 });
    }
    for (const c of (lv.ci || [])) W.bands.push(mkBand(c));
    for (const l of (lv.leak || [])) W.leaks.push({ x: l.at[0], y: l.at[1], r: l.r0 || 0.5, rate: l.rate || 8, grow: l.grow || 1, cap: l.cap || null, ticks: 0, on: true });
    for (const g of (lv.ghosts || [])) W.ghosts.push({ i: 0, x: g.at[0], y: g.at[1], lag: Math.round((g.lag || 5) * STEP_HZ), speed: g.speed || 1, on: !!lv.ghostTrail });
    if (lv.ghostTrail) W.flags.trailOn = true;

    /* 开局先落一个 init commit，否则第一次死亡无处可回 */
    pushCommit(W, "起点 · " + lv.name, true);
    light(W);
    W.flags.started = true;
    return W;
  }

  /* CI 抖动：流水线不是常亮的，它每隔一会儿就要"重试"一次。
   * 亮 onT 个 tick、熄 offT 个 tick（缺省 10/6 是旧 8Hz 时代的数，换算后 = 亮 1.25 秒 / 熄 0.75 秒，
   * 一个周期正好 2 秒），熄的那几 tick 既不扫人也不扫虫，那是留给玩家穿过去的缝。
   * 全部由 bd.t 推出来，纯数据进快照，回档后节奏一模一样。 */
  function mkBand(c) {
    const axis = c.axis || (c.dir === "n" || c.dir === "s" ? "y" : "x");
    /* 关卡里的 onT/offT 是旧 8Hz tick 数（缺省 10/6 = 亮 1.25s / 熄 0.75s） */
    const onT = Math.round((c.onT || 10) * S), offT = Math.round((c.offT || 6) * S);
    return { axis, pos: axis === "y" ? c.at[1] : c.at[0], dir: (c.dir === "w" || c.dir === "n") ? -1 : 1,
             speed: c.speed || 0.5, thick: 0.5, on: true,
             onT, offT, cyc: onT + offT, t: 0, lit: true, justLit: false };
  }
  function beltDirOf(lv, x, y) {
    for (const b of (lv.belts || [])) if (b.at[0] === x && b.at[1] === y) return b.dir || "e";
    return "e";
  }
  const BELT_VEC = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] };

  /* ================= 虫群 ================= */
  function bugAt(W, x, y) { for (const b of W.bugs) if (b.x === x && b.y === y) return b; return null; }
  function nextIdFor(W) { return W.idc++; }

  function makeBug(W, kind, x, y) {
    const k = BUGS.get(kind);
    const b = {
      id: nextIdFor(W), kind, x, y, cd: kind === "egg" ? BUGS.KINDS.egg.hatch * STEP_HZ : Math.round((k.speed || 0) * S),
      hp: k.hp || 1, tested: false, frozen: 0, stun: 0,
      dx: k.chase ? 0 : (x % 2 ? 1 : -1), dy: 0,
      attached: kind === "crawler", jumpCd: k.jump ? Math.round(k.jump * S) : null, fuse: k.fuse ? k.fuse * STEP_HZ : null,
      justJumped: 0, range: null,
      px: x, py: y
    };
    if (kind === "crawler") { b.dx = 0; b.dy = 0; }
    if (kind === "heisen") { b.dx = 1; }
    return b;
  }

  function spawn(W, kind, x, y) {
    if (!inb(W, x, y)) return null;
    if (W.bugs.length >= W.maxBugs) return null;
    if (bugAt(W, x, y)) return null;
    const ch = tile(W, x, y), d = TILES.def(ch);
    if (kind !== "heisen" && kind !== "crawler" && (d.solid || d.pit || ch === "&")) return null;
    const b = makeBug(W, kind, x, y);
    W.bugs.push(b);
    W.seenKinds[kind] = (W.seenKinds[kind] || 0) + 1;
    if (W.seenKinds[kind] === 1) {
      const c = BUGS.codex(kind);
      note(W, "新种甲虫 · " + c.name + "：" + c.text);
      sfx("spawn");
    }
    if (W.prReady && kind !== "egg") toast(W, "PR 已经解锁了，但又有虫子爬出来：" + BUGS.get(kind).label, "warn");
    return b;
  }
  function removeBug(W, bug) {
    for (let i = 0; i < W.bugs.length; i++) if (W.bugs[i].id === bug.id) { W.bugs.splice(i, 1); return; }
  }
  function bugMove(W, b, dx, dy) {
    if (!dx && !dy) return false;
    const nx = b.x + dx, ny = b.y + dy;
    if (bugBlock(W, b, nx, ny)) return false;
    const other = bugAt(W, nx, ny);
    if (other) return false;
    b.x = nx; b.y = ny;
    if (b.kind === "heisen" && !b.dx && !b.dy) { b.dx = dx; b.dy = dy; }
    return true;
  }

  /** 定时虫爆炸：十字 r 格内全灭 */
  function explode(W, x, y, r, why) {
    sfx("boom");
    note(W, why || "爆炸");
    if (W.player.cx === x || W.player.cy === y) {
      const d = Math.abs(W.player.cx - x) + Math.abs(W.player.cy - y);
      if (d <= r) die(W, why || "定时虫在十字范围内炸了");
    }
    for (const b of W.bugs.slice()) {
      if (b.x !== x && b.y !== y) continue;
      if (Math.abs(b.x - x) + Math.abs(b.y - y) > r) continue;
      if (b.x === x && b.y === y) continue;
      removeBug(W, b);
      W.kills++;
    }
    removeBug(W, bugAt(W, x, y) || { id: -1 });
    /* 震塌附近的 TODO */
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inb(W, nx, ny)) continue;
      if (tile(W, nx, ny) === "t") setTile(W, nx, ny, "~");
    }
  }

  /* ================= 工具动作 ================= */
  function adjacentBug(W) {
    let best = null, bd = 99;
    for (const b of W.bugs) {
      const d = Math.abs(b.x - W.player.cx) + Math.abs(b.y - W.player.cy);
      if (d <= 1 && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function act(W, name) {
    const p = W.player;
    if (p.dead || W.won) return;
    if (name === "commit") return doCommit(W);
    if (name === "log") return doLog(W);
    if (name === "layer") return doLayer(W);
    if (p.cast) { if (name === "fix" || name === "test") p.cast = null; return; }
    const pickTarget = verb => {
      const b = adjacentBug(W);
      if (!b) { toast(W, "挨着 " + verb + " 才有用 —— 走近一点", "warn"); return null; }
      return b;
    };
    if (name === "fix") {
      const b = pickTarget("修"); if (!b) return;
      p.cast = { type: "fix", turns: 0.375, bug: b.id }; sfx("cast"); flag(W, "wantKill");
    } else if (name === "test") {
      if (W.tools.test <= 0) { toast(W, "测试配额用完了，剩下的祖传虫只能绕", "bad"); return; }
      const b = pickTarget("盖测试"); if (!b) return;
      p.cast = { type: "test", turns: 0.5, bug: b.id }; sfx("cast");
    }
  }

  function finishCast(W) {
    const c = W.player.cast; if (!c) return;
    W.player.cast = null;
    let bug = null;
    for (const b of W.bugs) if (b.id === c.bug) bug = b;
    if (!bug) { toast(W, "目标跑了", "warn"); return; }
    if (Math.abs(bug.x - W.player.cx) + Math.abs(bug.y - W.player.cy) > 1) { toast(W, "它跑开了，得重新贴上去", "warn"); return; }
    if (c.type === "test") {
      W.tools.test--; bug.tested = true; sfx("test");
      toast(W, "给「" + BUGS.get(bug.kind).label + "」盖了测试，现在删它不会复发", "good");
      flag(W, "test");
      return;
    }
    const seen = observed(W, bug.x, bug.y);
    const ok = BUGS.killable(bug, seen);
    if (!ok.ok) { sfx("fail"); toast(W, ok.why, "bad"); return; }
    killBug(W, bug);
  }

  function killBug(W, bug) {
    const k = BUGS.get(bug.kind);
    if (k.needsTest && !bug.tested) {
      removeBug(W, bug);
      let grew = 0;
      for (let tries = 0; tries < 14 && grew < 2; tries++) {
        const spot = randomTileNear(W, bug.x, bug.y, 5);
        if (spot && spawn(W, "walk", spot.x, spot.y)) grew++;
      }
      sfx("fail");
      toast(W, "改 1 行 · 炸 47 处：没盖测试就删「" + k.label + "」，长出 " + grew + " 只新虫", "bad");
      note(W, "未加测试的删除 → 复发 +" + grew);
      return;
    }
    if (bug.kind === "boss" && bug.hp > 1) {
      bug.hp--; bug.frozen = Math.round(6 * S); sfx("alarm");
      if (!bug.tested) for (let i = 0; i < 2; i++) { const s = randomTileNear(W, bug.x, bug.y, 4); if (s) spawn(W, "chase", s.x, s.y); }
      toast(W, "祖传本体掉了一管血，还剩 " + bug.hp + " 管", "warn");
      return;
    }
    removeBug(W, bug);
    W.kills++;
    sfx("fix");
    note(W, "修掉一只「" + k.label + "」");
    flag(W, "kill");
    checkPr(W);
  }
  function checkPr(W) {
    if (W.bugs.length === 0 && !W.prReady) {
      W.prReady = true; sfx("unlock");
      toast(W, "甲虫清零 —— PR 解锁，去踩亮着的 PR 门", "good");
      for (const pr of W.prs) note(W, "PR 门亮在 " + pr.x + "," + pr.y);
    }
  }

  function randomTileNear(W, cx, cy, rad, min) {
    for (let tries = 0; tries < 26; tries++) {
      const x = cx + U.rint(W.rng, rad * 2 + 1) - rad, y = cy + U.rint(W.rng, rad * 2 + 1) - rad;
      if (!inb(W, x, y) || solidAt(W, x, y) || isPitAt(W, x, y)) continue;
      if (x === W.player.cx && y === W.player.cy) continue;
      if (min && U.dist(x, y, cx, cy) < min) continue;     // 摘到"附近"不该等于贴脸
      if (bugAt(W, x, y)) continue;
      return { x, y };
    }
    return null;
  }
  function randomDarkTile(W) {
    for (let tries = 0; tries < 44; tries++) {
      const x = U.rint(W.rng, W.w), y = U.rint(W.rng, W.h);
      if (solidAt(W, x, y) || isPitAt(W, x, y)) continue;
      if (x === W.player.cx && y === W.player.cy) continue;
      if (U.dist(x, y, W.player.cx, W.player.cy) < 2.5) continue;
      if (bugAt(W, x, y)) continue;
      return { x, y };
    }
    return null;
  }

  function doLog(W) {
    const p = W.player;
    if (p.logCd > 0) { toast(W, "日志还在刷，等一秒", "warn"); return; }
    let dx = p.dir, dy = 0;
    if (W.mode === "top") { dx = p.lastDx || 1; dy = p.lastDy || 0; }
    else if (p.lastDy === -1) { dx = 0; dy = -1; }
    let tx = p.cx, ty = p.cy;
    for (let i = 1; i <= 6; i++) {
      const nx = p.cx + dx * i, ny = p.cy + dy * i;
      if (!inb(W, nx, ny) || solidAt(W, nx, ny)) break;
      tx = nx; ty = ny;
    }
    W.flashes.push({ x: tx, y: ty, r: 3.6, ticks: 5 * STEP_HZ, probe: true });
    p.logCd = 1.375;
    sfx("log");
    flag(W, "log");
    for (const b of W.bugs) if (U.dist(b.x, b.y, tx, ty) <= 3.9) b.stun = 6 * STEP_HZ;
    note(W, "console.log 落在 " + tx + "," + ty + "：假地块现形，范围内的虫被晃瞎 6 秒");
  }

  /* ================= commit / 回档 ================= */
  const SNAP_V = 2;
  /* commitLog 里每个 entry 自己带 snap；trail 在 60Hz 下会涨到几万点。
   * 这两样都不进快照，否则快照会自我嵌套、把 localStorage 撑爆。 */
  const SNAP_SKIP = { api: 1, lampCov: 1, toasts: 1, tutStep: 1, tutFlags: 1,
                      commitLog: 1, trail: 1, sv: 1,
                      onCommit: 1, onDeath: 1, onWin: 1, onToast: 1 };
  function snap(W) {
    const copy = { sv: SNAP_V };
    for (const k in W) {
      if (SNAP_SKIP[k]) continue;
      if (typeof W[k] === "function") continue;
      copy[k] = W[k];
    }
    copy.notes = W.notes.slice(-8);
    copy.toasts = [];
    return JSON.stringify(copy);
  }

  /** commit 指纹：挑出「会留在存档里的玩法状态」，判断脚下这个点还能不能落新 commit。
   *  活的 W 和 parse 出来的快照字段同名，同一个函数两边都能吃。
   *  故意不进指纹的：tick、光照记忆（lit/seen/reveal）、逐帧倒计时（cd/stun 等按秒取整，
   *  o2/scrambled/rush 这类只看正负）—— 否则站着不动指纹也一直在变，"没变化"永远判不出来。 */
  function commitSig(s) {
    const r2 = v => Math.round(v * 100) / 100;
    const sec = t => t > 0 ? Math.ceil(t / STEP_HZ) : 0;
    const dyn = {};
    for (const k in s.dyn) {
      const d = s.dyn[k];
      dyn[k] = [d.open ? 1 : 0, d.depHit ? 1 : 0, d.todoT != null ? 1 : 0, d.crumbleT != null ? 1 : 0];
    }
    const flags = {};
    for (const k in s.flags) {
      const v = s.flags[k];
      flags[k] = typeof v === "number" ? (v > 0 ? 1 : 0) : v;
    }
    return JSON.stringify({
      p: [r2(s.player.x), r2(s.player.y), s.player.dir, s.player.lastDx, s.player.lastDy, s.player.cast ? 1 : 0],
      tools: s.tools.test,
      bugs: (s.bugs || []).map(b => [b.kind, b.x, b.y, b.hp || 1, b.tested ? 1 : 0, b.attached ? 1 : 0,
                                     sec(b.cd), sec(b.stun), sec(b.frozen), sec(b.jumpCd), sec(b.fuse)]),
      layer: s.layer, mode: s.mode, gravity: s.gravity, layers: s.layers, dyn, flags,
      k: s.kills, e: s.entropy, rv: s.reverted, pr: s.prReady ? 1 : 0,
      depNext: s.depNext, idc: s.idc,
      leaks: (s.leaks || []).map(l => [l.x, l.y, l.r]),
      movers: (s.movers || []).map(m => [m.x, m.y])
    });
  }

  /** 旧 8Hz 快照 → 60Hz + 连续坐标。只在目标快照没有 sv 时跑一次。 */
  function retime(o) {
    const mul = S, sec = 1 / 8;          // 旧 tick 数 → 新 tick 数 / 秒
    const p = o.player;
    o.tick = (o.tick || 0) * mul;
    if (p) {
      p.x = (p.x || 0) + 0.5;
      p.y = (p.y || 0) + 1 - P_S;                   // 旧格坐标 → 连续坐标：让判定箱整个落在格内
      p.px = (p.px != null ? p.px : p.x - 0.5) + 0.5;
      p.py = (p.py != null ? p.py : p.y - 0.5) + 0.5;
      p.vx = 0; p.vy = 0; p.airUp = 0;
      p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.dropT = 0; p.doorCd = 0;
      p.logCd = (p.logCd || 0) * sec;
      p.inv = (p.inv || 0) * sec;
      p.stun = (p.stun || 0) * sec;
      if (p.cast) p.cast.turns = (p.cast.turns || 0) * sec;
      p.cx = Math.floor(p.x); p.cy = Math.floor(p.y);
    }
    if (o.lit) for (let i = 0; i < o.lit.length; i++) if (o.lit[i] > 0) o.lit[i] *= mul;
    if (o.reveal) for (let i = 0; i < o.reveal.length; i++) if (o.reveal[i] > 0) o.reveal[i] *= mul;
    if (o.dyn) for (const k in o.dyn) {
      const d = o.dyn[k];
      if (d.todoT != null) d.todoT *= mul;
      if (d.crumbleT != null) d.crumbleT *= mul;
    }
    if (o.bugs) for (const b of o.bugs) {
      b.cd = (b.cd || 0) * mul;
      if (b.jumpCd != null) b.jumpCd *= mul;
      if (b.fuse != null) b.fuse *= mul;
      b.frozen = (b.frozen || 0) * mul;
      b.stun = (b.stun || 0) * mul;
      b.justJumped = (b.justJumped || 0) * mul;
      b.px = b.x; b.py = b.y;
    }
    if (o.movers) for (const m of o.movers) {
      m.cd = (m.cd || 0) * mul;
      m.rate = (m.rate || 0) * mul;
      if (m.delay != null) m.delay *= mul;
    }
    if (o.bands) for (const bd of o.bands) {
      bd.t = (bd.t || 0) * mul;
      bd.onT = (bd.onT || 0) * mul;
      bd.offT = (bd.offT || 0) * mul;
      bd.cyc = (bd.cyc || 0) * mul;
    }
    if (o.leaks) for (const lk of o.leaks) lk.ticks = (lk.ticks || 0) * mul;
    if (o.flashes) for (const f of o.flashes) f.ticks = (f.ticks || 0) * mul;
    if (o.flags) {
      if (o.flags.scrambled) o.flags.scrambled *= mul;
      if (o.flags.rush) o.flags.rush *= mul;
      if (o.flags.o2) o.flags.o2 *= sec;
    }
    if (o.ghosts) for (const g of o.ghosts) {
      g.lag = (g.lag || 0) * mul; g.i = 0;
      g.x = (g.x || 0) + 0.5; g.y = (g.y || 0) + 0.5;
    }
    if (o.commitLog) for (const c of o.commitLog) {
      c.turn = (c.turn || 0) * mul;
      if (c.x != null) c.x += 0.5;
      if (c.y != null) c.y += 0.5;
      c.cx = Math.floor(c.x); c.cy = Math.floor(c.y);
    }
    o.trail = [];
    o.modeBase = o.modeBase || o.mode;
    o.sv = SNAP_V;
  }

  function restore(W, text) {
    const obj = JSON.parse(text);
    if (obj.sv !== SNAP_V) retime(obj);
    const keep = { api: W.api, lampCov: W.lampCov, toasts: W.toasts, commitLog: W.commitLog,
                   onCommit: W.onCommit, onDeath: W.onDeath, onWin: W.onWin, onToast: W.onToast };
    for (const k in obj) W[k] = obj[k];
    for (const k in keep) if (keep[k] !== undefined) W[k] = keep[k];
    syncCell(W.player);
    W.trail = [];
    for (const g of W.ghosts) g.i = 0;
    U.Input.unscramble();
    U.Input.clear();
    return W;
  }

  function atCommitTile(W) {
    for (const c of W.mapCommits) if (c.x === W.player.cx && c.y === W.player.cy) return c;
    return null;
  }
  function doCommit(W) {
    if (!atCommitTile(W)) { toast(W, "这里没有 -o- ，先去找一个", "warn"); return; }
    const last = W.commitLog[W.commitLog.length - 1];
    /* 能不能重复落 commit 不看脚下的点，看状态：和上一个 commit 比有任何不同就直接落。
     * 直接比对 last.snap，不往存档里加新字段——旧档的 commit 照样能比。 */
    if (last && last.snap && commitSig(W) === commitSig(JSON.parse(last.snap))) {
      toast(W, "和上一个 commit 比什么都没变，不用重复提交", "warn");
      return;
    }
    pushCommit(W, "第 " + (W.li + 1) + " 关 · 已修 " + W.kills + " 只 · 剩 " + W.bugs.length + " 只");
    sfx("commit");
    toast(W, "commit 落好：" + W.commitLog[W.commitLog.length - 1].hash, "good");
    flag(W, "commit");
  }
  function pushCommit(W, msg, isInit) {
    const n = W.commitLog.length;
    const entry = { hash: U.shortHash(W.seed, n), msg, tag: isInit ? "init" : "manual",
                    turn: W.tick, x: W.player.x, y: W.player.y,
                    cx: W.player.cx, cy: W.player.cy,
                    kills: W.kills, bugs: W.bugs.length, snap: snap(W) };
    W.commitLog.push(entry);
    if (W.commitLog.length > 16) W.commitLog.splice(1, 1);
    if (W.onCommit) W.onCommit(entry);
    return entry;
  }
  function revert(W, n) {
    const c = W.commitLog[n];
    if (!c) return false;
    if (c.stashed) { toast(W, "那个 commit 被 stash 掉了，回不去", "bad"); return false; }
    const keep = { commitLog: W.commitLog.slice(0, n + 1), api: W.api, lampCov: W.lampCov,
                   onCommit: W.onCommit, onDeath: W.onDeath, onWin: W.onWin, onToast: W.onToast };
    restore(W, c.snap);
    W.commitLog = keep.commitLog;
    for (const k in keep) if (k !== "commitLog") W[k] = keep[k];
    W.reverted++; W.entropy++;
    sfx("revert");
    toast(W, "回档到 " + c.hash + "（本关第 " + W.reverted + " 次）", "warn");
    note(W, "git reset --hard " + c.hash);
    mutate(W);
    fire(W, "onRevert");
    flag(W, "revert");
    light(W);
    return true;
  }

  /** 回档不免费：熵攒够两层，屎山就长一层 */
  function mutate(W) {
    if (W.entropy % 2 !== 0) return;
    const lv = LEVELS[W.li];
    let made = null;
    if (lv.mutate && lv.mutate.length) {
      for (let i = 0; i < 6 && !made; i++) {
        const m = lv.mutate[U.rint(W.rng, lv.mutate.length)];
        made = spawn(W, m.kind, m.at[0], m.at[1]);
      }
    }
    if (!made) { const spot = randomDarkTile(W); if (spot) made = spawn(W, W.entropy % 4 === 0 ? "chase" : "walk", spot.x, spot.y); }
    if (made) {
      made.dx = made.dx || 1;
      toast(W, "屎山又长了一层：回档的代价是多了一只「" + BUGS.get(made.kind).label + "」", "bad");
      note(W, "熵增 " + W.entropy + " → 长出 " + BUGS.get(made.kind).label);
    }
    if (lv.mutateWall && W.entropy > 2 && U.rnd(W.rng) < 0.7) {
      for (let tries = 0; tries < 40; tries++) {
        const x = U.rint(W.rng, W.w), y = U.rint(W.rng, W.h);
        if (x === W.player.cx && y === W.player.cy) continue;
        if (tile(W, x, y) !== ".") continue;
        if (W.lit[idx(W, W.layer, x, y)] > W.tick - 3 * STEP_HZ) continue;   // 别当着玩家的面变
        setTile(W, x, y, "#");
        note(W, "一块地板悄悄变成了墙");
        break;
      }
    }
  }

  /* ================= 死亡 ================= */
  const DEATHS = [
    "Uncaught TypeError: player is not a function",
    "Segmentation fault (core dumped)",
    "Killed: 内存不够，先把你换了",
    "npm ERR! code ELIFECYCLE",
    "500 Internal Server Error（你不在错误处理路径上）",
    "FATAL: 这里原来有注释，但没人写得清楚",
    "panic: interface conversion: interface {} is nil, is 你"
  ];
  function die(W, why) {
    const p = W.player;
    if (p.dead || W.won) return;
    p.dead = true; p.cast = null;
    W.dead_why = why || "撞上甲虫";
    W.dead_text = DEATHS[U.rint(W.rng, DEATHS.length)];
    sfx("death");
    flag(W, "dead");
    if (W.onDeath) W.onDeath(W.dead_why);
  }

  /* ================= 事件系统 ================= */
  function fire(W, type) {
    for (let i = 0; i < W.events.length; i++) {
      const e = W.events[i];
      if (e.when && e.when !== type) continue;
      /* persist 的事件即使回档也算放过：教学里那口必死的伏笔不该被重新武装 */
      if (e.persist ? W.tutFlags["fs" + i] : (W.fired[i] && !e.every)) continue;
      let hit = false;
      if (type === "tick" && e.at != null && W.tick >= Math.round(e.at * STEP_HZ)) hit = true;
      if (type === "onEnter" && e.onEnter && inRange(e.onEnter, W.player)) hit = true;
      if (type === "onKillKind" && e.onKillKind && W.flags["kind_" + e.onKillKind]) hit = true;
      if (type === "onRevert" && e.onRevert != null && W.reverted >= e.onRevert) hit = true;
      if (type === "onCommit" && e.onCommit != null && W.commitLog.length > e.onCommit) hit = true;
      if (type === "onBug" && e.onBug != null && W.bugs.length <= e.onBug) hit = true;
      if (type === "onPr" && e.onPr && W.prReady) hit = true;
      if (!hit) continue;
      if (e.every) {
        const period = Math.round(e.every * STEP_HZ);
        const base = Math.round((e.at || 0) * STEP_HZ);
        if (W.tick < base || (W.tick - base) % period !== 0) continue;
      } else if (e.persist) W.tutFlags["fs" + i] = 1;
      else W.fired[i] = true;
      runActs(W, e);
    }
  }
  function inRange(a, p) { const r = a[2] || 0; return Math.abs(p.cx - a[0]) <= r && Math.abs(p.cy - a[1]) <= r; }
  function runActs(W, e) {
    const list = e.acts || [e];               // 不带 acts 时，事件本身就是那条动作的参数
    for (const a of list) act1(W, a.act, a);
    if (e.msg) toast(W, e.msg, e.tone || "bad");
  }

  function act1(W, kind, a) {
    a = a || {};
    switch (kind) {
      case "msg": note(W, a.text || "……"); toast(W, a.text || "……", a.tone || "warn"); break;
      case "spawn": {
        let n = 0;
        for (let i = 0; i < (a.n || 1); i++) {
          const spot = a.at ? { x: a.at[0], y: a.at[1] } : randomDarkTile(W);
          if (!spot) continue;
          const b = spawn(W, a.kind || "walk", spot.x, spot.y);
          if (b) { if (a.dir === "v") { b.dx = 0; b.dy = 1; } n++; }
        }
        if (n) { sfx("spawn"); toast(W, a.text || "有东西爬出来了（+" + n + "）", "bad"); checkPr(W); }
        break;
      }
      case "blackout": {
        for (let i = 0; i < W.lit.length; i++) if (W.seen[i]) W.lit[i] = -99999;
        W.flashes.length = 0;
        if (a.r != null) W.cfg.r = Math.min(W.cfg.r, a.r);
        sfx("blackout"); toast(W, a.text || "GC 回收了你的缓存 —— 黑暗把记忆全吞了", "bad"); break;
      }
      case "fog": W.cfg.r = Math.max(0, a.r); toast(W, a.text || "视野变了", "warn"); break;
      case "rebase": {
        const dx = a.dx || 1;
        shiftLayer(W, W.layer, dx, a.edge || "#");
        sfx("glitch"); toast(W, a.text || "rebase：地形整体往" + (dx > 0 ? "右" : "左") + "平移 " + Math.abs(dx) + " 格，边缘的代码掉了下去", "bad"); break;
      }
      case "collapse": {
        let n = 0; const target = a.char || "t";
        for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) if (tile(W, x, y) === target) { setTile(W, x, y, "~"); n++; }
        sfx("boom"); toast(W, a.text || ("所有 " + TILES.def(target).label + " 同时塌了（" + n + " 块）"), "bad"); break;
      }
      case "pit": {
        for (let y = a.at[1]; y < a.at[1] + (a.h || 1); y++) for (let x = a.at[0]; x < a.at[0] + (a.w || 1); x++) if (inb(W, x, y)) setTile(W, x, y, "~");
        toast(W, a.text || "脚下少了一块", "bad"); break;
      }
      case "wallGrow": {
        for (let i = 0; i < (a.n || 3); i++) { const s = randomDarkTile(W); if (s && tile(W, s.x, s.y) === ".") setTile(W, s.x, s.y, "#"); }
        sfx("glitch"); toast(W, a.text || "屎山自己长厚了一点", "bad"); break;
      }
      case "layerSwap": doLayer(W, a.to); sfx("glitch"); toast(W, a.text || null, "warn"); break;
      case "flipGravity":
        W.gravity = a.to === "up" ? -1 : 1;
        W.player.vy = 0; W.player.grounded = false; W.player.coyote = 0;
        resolvePlayer(W);
        sfx("glitch"); toast(W, a.text || (W.gravity < 0 ? "重力反了：天花板才是地板" : "重力恢复正常"), "bad"); break;
      case "flipMode": {
        W.mode = a.to || (W.mode === "side" ? "top" : "side");
        W.player.vy = 0; W.player.vx = 0; W.player.grounded = false; W.player.coyote = 0;
        resolvePlayer(W);
        sfx("glitch"); toast(W, a.text || "有人重构了坐标系：现在是「" + (W.mode === "side" ? "横版" : "俯视") + "」视角", "bad"); break;
      }
      case "scramble":
        U.Input.scramble(a.kind || "swap"); W.flags.scrambled = (a.turns || 8) * STEP_HZ;
        sfx("glitch"); toast(W, a.text || "键盘被 AI 改了 —— 方向键和 WASD 一起转了，看清了再走", "bad"); break;
      case "unscramble": U.Input.unscramble(); W.flags.scrambled = 0; break;
      case "ci": W.bands.push(mkBand({ at: a.at, dir: a.dir || "w", axis: a.axis, speed: a.speed || 0.5, onT: a.onT, offT: a.offT })); sfx("alarm"); toast(W, a.text || "CI 开始跑：那道红光会一路推平，包括虫子 —— 它每两秒熄一次，熄的时候踩过去没事", "bad"); break;
      case "leak": W.leaks.push({ x: a.at[0], y: a.at[1], r: 0.5, rate: a.rate || 8, grow: a.grow || 1, cap: a.cap || null, ticks: 0, on: true }); toast(W, a.text || "泄漏开始扩散", "bad"); break;
      case "ghost": {
        W.flags.trailOn = true;
        W.ghosts.push({ i: 0, x: W.player.x, y: W.player.y, lag: Math.round((a.lag || 5) * STEP_HZ), speed: a.speed || 1, on: true });
        toast(W, a.text || "你的 git history 活了：一个「几秒前的你」正沿着老路追过来", "bad"); break;
      }
      case "giveTests": W.tools.test += a.n || 1; toast(W, "捡到 " + (a.n || 1) + " 份测试配额", "good"); break;
      case "fakePr": W.fakePrs.push({ x: a.at[0], y: a.at[1] }); setTile(W, a.at[0], a.at[1], "!"); toast(W, "远处亮起一个 PR 门（顺路得有点可疑）", "warn"); break;
      case "stash": {
        const i2 = Math.max(1, W.commitLog.length - 2);
        if (W.commitLog[i2] && W.commitLog[i2].tag !== "init") { W.commitLog[i2].stashed = true; toast(W, "stash 掉了 " + W.commitLog[i2].hash + "：这个 commit 回不去了", "bad"); }
        break;
      }
      case "cherryPick": {
        const live = W.bugs.filter(b => b.kind !== "egg");
        if (live.length) {
          const b = live[U.rint(W.rng, live.length)];
          const s = randomTileNear(W, W.player.cx, W.player.cy, 4, a.min || 3);
          if (s) { b.x = s.x; b.y = s.y; sfx("glitch"); toast(W, "cherry-pick：一只「" + BUGS.get(b.kind).label + "」被摘到你附近", "bad"); }
        }
        break;
      }
      case "bugRush":
        for (const b of W.bugs) b.cd = 0;
        W.flags.rush = (a.turns || 8) * STEP_HZ;
        sfx("alarm"); toast(W, a.text || "红灯亮起，全部甲虫进入狂暴", "bad"); break;
      case "revealAll":
        for (let i = 0; i < W.reveal.length; i++) W.reveal[i] = Math.max(W.reveal[i], 4 * STEP_HZ);
        toast(W, "跑了一遍静态分析：真假地块现形 4 秒", "good"); break;
      case "openDoor": { const d = dyn(W, a.at[0], a.at[1]); d.open = true; toast(W, "有一扇门自己开了", "warn"); break; }
      case "kill": die(W, a.text || "剧情需要你死一次"); break;
      case "sound": sfx(a.cue || "alarm"); break;
      case "win": win(W); break;
      default: break;
    }
  }

  /** 地图整体平移（rebase）：所有跟着格子走的东西都要一起挪，不然机关会错位 */
  function shiftLayer(W, L, dx, edge) {
    const rows = W.layers[L], w = W.w, h = W.h;
    const nx = x => U.clamp(x + dx, 0, w - 1);
    for (let y = 0; y < h; y++) {
      const base = y * w;
      if (dx > 0) for (let x = w - 1; x >= 0; x--) rows[base + x] = x - dx >= 0 ? rows[base + x - dx] : edge;
      else for (let x = 0; x < w; x++) rows[base + x] = x - dx < w ? rows[base + x - dx] : edge;
    }
    W.player.x = U.clamp(W.player.x + dx, 0.5, w - 0.5);
    syncCell(W.player);
    for (const b of W.bugs) b.x = nx(b.x);
    for (const c of W.mapCommits) c.x = nx(c.x);
    for (const p of W.prs) p.x = nx(p.x);
    for (const p of W.fakePrs) p.x = nx(p.x);
    for (const s of W.belts) s.x = nx(s.x);
    for (const d of W.deps) d.x = nx(d.x);
    for (const l of W.leaks) l.x = nx(l.x);
    for (const m of W.movers) { m.x = nx(m.x); m.ox = nx(m.ox); }
    for (const bd of W.bands) if (bd.axis === "x") bd.pos += dx;
    W.dyn = {};
    W.lamps = W.lamps.map(l => ({ x: nx(l.x), y: l.y, r: l.r }));
    resolvePlayer(W);
  }

  /** 把玩家从墙里挤出来：切图层 / 切模式 / rebase 之后都靠它兜底 */
  function resolvePlayer(W) {
    const p = W.player;
    syncCell(p);
    const blocked = (x, y) => solidAt(W, x, y) || isPitAt(W, x, y) || !inb(W, x, y);
    if (!blocked(p.cx, p.cy)) { p.grounded = false; p.vy = 0; return true; }
    for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (blocked(p.cx + dx, p.cy + dy)) continue;
      p.x = p.cx + dx + 0.5; p.y = p.cy + dy + 1 - P_S;
      p.vx = 0; p.vy = 0; p.grounded = false;
      syncCell(p);
      return true;
    }
    die(W, "重构坐标系时你被挤进了实心代码里 —— 冲突未解决");
    return false;
  }

  function doLayer(W, to) {
    if (W.layers.length < 2) { toast(W, "这关只有一条分支，切不了图层", "warn"); return; }
    W.layer = to != null ? (to % W.layers.length) : (W.layer + 1) % W.layers.length;
    const before = { cx: W.player.cx, cy: W.player.cy };
    if (solidAt(W, W.player.cx, W.player.cy) || isPitAt(W, W.player.cx, W.player.cy)) {
      if (!resolvePlayer(W)) return;
      if (W.player.cx !== before.cx || W.player.cy !== before.cy) toast(W, "切换分支：你被挤到了空位上", "warn");
    }
    sfx("glitch");
    flag(W, "layer");
  }

  /* ================= 玩家移动 =================
   * 连续物理：位置是格坐标里的浮点，碰撞是 AABB 对格子。
   * 俯视没有重力；横版按 W.gravity 积分，跳跃用固定 2 格高的初速。 */
  function approach(v, target, step) {
    if (v < target) return Math.min(target, v + step);
    if (v > target) return Math.max(target, v - step);
    return v;
  }

  function beltVec(W) {
    const p = W.player;
    for (const s of W.belts) if (s.x === p.cx && s.y === p.cy) return BELT_VEC[s.dir] || BELT_VEC.e;
    return null;
  }

  /** 水平移动 + AABB 碰撞；撞门时顺手尝试开门 */
  function moveX(W, dx) {
    const p = W.player;
    if (!dx) return;
    p.x += dx;
    const y0 = cellY0(W, p), y1 = cellY1(W, p);
    if (dx > 0) {
      const tx = Math.floor(p.x + PW / 2 - EPS);
      for (let ty = y0; ty <= y1; ty++) {
        if (!solidAt(W, tx, ty)) continue;
        if (tile(W, tx, ty) === "|" && !isDoorOpen(W, tx, ty)) tryDoor(W, tx, ty);
        p.x = Math.min(p.x, tx - PW / 2 - EPS);
      }
    } else {
      const tx = Math.floor(p.x - PW / 2 + EPS);
      for (let ty = y0; ty <= y1; ty++) {
        if (!solidAt(W, tx, ty)) continue;
        if (tile(W, tx, ty) === "|" && !isDoorOpen(W, tx, ty)) tryDoor(W, tx, ty);
        p.x = Math.max(p.x, tx + 1 + PW / 2 + EPS);
      }
    }
    syncCell(p);
  }

  /** 垂直移动 + AABB 碰撞（单向平台不在这里挡，交给 groundCheck） */
  function moveY(W, dy) {
    const p = W.player;
    if (!dy) return;
    p.y += dy;
    const down = W.gravity > 0 ? 1 : -1;
    const bh = down > 0 ? P_S : P_H;      // 底侧半高：支撑沿（跟着重力翻）
    const th = down > 0 ? P_H : P_S;      // 顶侧半高
    const x0 = cellX0(p), x1 = cellX1(p);
    if (dy > 0) {
      const ty = Math.floor(p.y + bh - EPS);
      for (let tx = x0; tx <= x1; tx++) {
        if (!solidAt(W, tx, ty)) continue;
        p.y = Math.min(p.y, ty - bh - EPS);
        p.vy = Math.min(0, p.vy);
      }
    } else {
      const ty = Math.floor(p.y - th + EPS);
      for (let tx = x0; tx <= x1; tx++) {
        if (!solidAt(W, tx, ty)) continue;
        p.y = Math.max(p.y, ty + 1 + th + EPS);
        p.vy = Math.max(0, p.vy);
      }
    }
    syncCell(p);
  }

  /** 脚下的支撑：实体格和单向平台（只从脚那一侧踩得住） */
  function groundCheck(W) {
    const p = W.player;
    const down = W.gravity > 0 ? 1 : -1;
    p.grounded = false;
    if (p.dropT > 0) return;
    const tx = p.cx;
    const foot = p.y + down * P_S;                    // 支撑沿才是「脚」，决定站姿（渲染不动的前提）
    const ty = down > 0 ? Math.floor(foot + 0.02) : Math.floor(foot - 0.02);
    if (!inb(W, tx, ty)) return;
    const ch = tile(W, tx, ty);
    if (solidAt(W, tx, ty)) {
      p.y = down > 0 ? ty - P_S : ty + 1 + P_S;
      p.vy = 0; p.grounded = true; return;
    }
    if (ch === "+") {
      if (down > 0 && p.vy >= 0) { p.y = ty - P_S; p.vy = 0; p.grounded = true; }
      else if (down < 0 && p.vy <= 0) { p.y = ty + 1 + P_S; p.vy = 0; p.grounded = true; }
    }
  }

  function stepPlayer(W) {
    const p = W.player;
    if (p.dead || W.won) return;
    const I = U.Input;
    const top = W.mode === "top";
    const down = W.gravity > 0 ? 1 : -1;

    /* 施法时一动就打断（原版是 movePlayer 成功才打断，连续物理下按方向就算） */
    if (p.cast && (I.down("left") || I.down("right") || I.down("up") || I.down("down"))) p.cast = null;

    let ix = 0, iy = 0;
    if (!p.cast) {
      if (I.down("left")) ix -= 1;
      if (I.down("right")) ix += 1;
      if (top) { if (I.down("up")) iy -= 1; if (I.down("down")) iy += 1; }
    }
    if (ix && iy) { const len = Math.SQRT2; ix /= len; iy /= len; }
    if (ix) { p.dir = ix > 0 ? 1 : -1; p.lastDx = Math.sign(ix); p.lastDy = 0; }
    else if (iy) { p.lastDx = 0; p.lastDy = Math.sign(iy); }

    let tvx = ix * (top ? RUN_TOP : RUN_SIDE);
    let tvy = top ? iy * RUN_TOP : 0;
    const bv = beltVec(W);
    if (bv) { tvx += bv[0] * 3; if (top) tvy += bv[1] * 3; }

    if (top) {
      p.vx = approach(p.vx, tvx, ACC_TOP * DT);
      p.vy = approach(p.vy, tvy, ACC_TOP * DT);
      moveX(W, p.vx * DT);
      moveY(W, p.vy * DT);
      p.grounded = false;
      return;
    }

    /* 横版 */
    p.vx = approach(p.vx, tvx, (p.grounded ? ACC_SIDE : AIR_ACC) * DT);
    moveX(W, p.vx * DT);

    if (!p.cast && I.hit("up")) p.jumpBuf = JUMP_BUF;
    p.jumpBuf = Math.max(0, p.jumpBuf - DT);
    p.coyote = p.grounded ? COYOTE : Math.max(0, p.coyote - DT);
    if (!p.cast && p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -down * JUMP_V0;
      if (ix) p.vx = ix * RUN_SIDE;          // 起跳直接带走方向速度，2 格坑才有稳定余量
      p.grounded = false; p.coyote = 0; p.jumpBuf = 0;
      sfx("jump");
    }

    /* 按住 ↓：在单向平台上往下穿，空中则加速下落 */
    if (!p.cast && I.down("down")) {
      const fx = p.cx, fy = down > 0 ? Math.floor(p.y + P_S + 0.03) : Math.floor(p.y - P_S - 0.03);
      if (p.grounded && inb(W, fx, fy) && onewayAt(W, fx, fy)) {
        /* 要一口气穿过整格，不然 dropT 结束后会被同一块单杠吸回去 */
        p.dropT = 0.25; p.grounded = false; p.vy = down * 5;
      }
    }
    if (p.dropT > 0) p.dropT -= DT;

    p.vy += GRAV * down * DT;
    if (!p.grounded && !p.cast && I.down("down") && p.vy * down < 6) p.vy += GRAV * 0.9 * down * DT;
    if (down > 0) p.vy = Math.min(p.vy, MAX_FALL);
    else p.vy = Math.max(p.vy, -MAX_FALL);
    const wasG = p.grounded, fallVy = p.vy;
    moveY(W, p.vy * DT);
    groundCheck(W);
    if (!wasG && p.grounded && Math.abs(fallVy) > 2) sfx("land");
  }

  function jump(W) {
    const p = W.player;
    if (p.dead || W.won) return false;
    const down = W.gravity > 0 ? 1 : -1;
    if (W.mode === "top") { p.vy = -RUN_TOP; return true; }
    if (!p.grounded && p.coyote <= 0) return false;
    p.vy = -down * JUMP_V0;
    p.grounded = false; p.coyote = 0;
    sfx("jump");
    return true;
  }

  function onEnter(W) {
    flag(W, "move");
    enterTile(W);
    fire(W, "onEnter");
  }

  /** 进格效果：只在中心格变化或刚落地时调用（坑和尖刺由 hazardCheck 每 tick 判） */
  function enterTile(W) {
    const p = W.player, x = p.cx, y = p.cy;
    if (!inb(W, x, y)) return;
    const ch = tile(W, x, y), d = dyn(W, x, y);
    if (ch === "t" && d.todoT == null) { d.todoT = Math.round(2.5 * STEP_HZ); sfx("tick"); note(W, "踩上 TODO：2.5 秒后塌"); }
    if (ch === "s" && d.crumbleT == null) { d.crumbleT = Math.round(0.5 * STEP_HZ); sfx("tick"); }
    if (ch === "d") checkDep(W);
    if (ch === "!" ) { die(W, "404：那个 PR 门是画上去的"); return; }
    if (ch === "P") {
      if (W.prReady) {
        if (LEVELS[W.li].requireTut && W.tut.length && W.tutStep < W.tut.length) {
          toast(W, "虫清完了，但教学还没走完 —— 门先记着，走完就能提交", "warn");
          W.tutFlags.prWait = 1;
        } else { win(W); return; }
      }
      if (W.pDeadly) { die(W, "PR 没解锁就提交 —— CI 当场把你挂了"); return; }
      toast(W, "PR 门还没解锁：还剩 " + W.bugs.length + " 只甲虫", "warn");
    }
    if (ch === "j") {
      const down = W.gravity > 0 ? 1 : -1;
      p.vy = -down * Math.sqrt(2 * GRAV * (W.jump + 2.2));   // 跳板比普通跳高 2 格多，够穿过单杠落上去
      p.grounded = false; p.coyote = 0; p.jumpBuf = 0;
      sfx("jump");
    }
    if (atCommitTile(W)) { flag(W, "nearCommit"); if (!W.tutFlags.sawCommit) { W.tutFlags.sawCommit = 1; note(W, "这里有个 -o- ：按 空格 落一个 commit"); } }
  }

  /** 坑 / 尖刺 / 假地板：横版看脚有没有真的踩进去，俯视看中心格 */
  function hazardCheck(W) {
    const p = W.player;
    if (W.mode === "top") {
      const ch = tile(W, p.cx, p.cy);
      if (!isPitAt(W, p.cx, p.cy)) return false;
      die(W, ch === "&" ? "那是块假地板，下面是空的" : ch === "x" ? "踩在一地 undefined 上" : "掉进深坑（一个没人测过的接口）");
      return true;
    }
    const down = W.gravity > 0 ? 1 : -1;
    const bot = p.y + down * P_S;                     // 判定沿 = 阴影下缘切线：影子悬进坑里也算数
    const fy = Math.floor(bot);
    const fx = Math.floor(p.x);
    if (!inb(W, fx, fy)) return false;
    if (!isPitAt(W, fx, fy)) return false;
    const depth = down > 0 ? bot - fy : (fy + 1) - bot;
    if (depth <= 0.30) return false;
    const ch = tile(W, fx, fy);
    die(W, ch === "&" ? "那是块假地板，下面是空的" : "掉进深坑（一个没人测过的接口）");
    return true;
  }

  function tryDoor(W, x, y) {
    const p = W.player;
    if (p.doorCd > 0) return;
    p.doorCd = 0.5;
    if (W.tools.test > 0) {
      W.tools.test--;
      dyn(W, x, y).open = 1;
      sfx("test");
      toast(W, "拿 1 份测试换开了一道门禁（剩 " + W.tools.test + " 份）", "good");
      flag(W, "door");
    } else {
      sfx("fail");
      toast(W, "门禁要 1 份测试配额，你手上没有 —— 先绕路或回档", "bad");
    }
  }

  function checkDep(W) {
    const p = W.player, x = p.cx, y = p.cy;
    const mine = W.deps.findIndex(s => s.x === x && s.y === y);
    if (mine < 0) return;
    const d = dyn(W, x, y);
    if (d.depHit) return;
    d.depHit = 1;
    const want = W.depOrder[W.depNext];
    if (mine === want) {
      W.depNext++; sfx("uiOk");
      toast(W, "依赖 " + W.depNext + "/" + W.depOrder.length + " 通了", "good");
      if (W.depNext >= W.depOrder.length) { W.flags.depsDone = true; sfx("unlock"); toast(W, "依赖链全打通了 —— 前面那段路现在能走了", "good"); }
    } else {
      sfx("alarm");
      toast(W, "依赖踩错了（应该先踩第 " + (want + 1) + " 块）—— 屎山震怒", "bad");
      if (LEVELS[W.li].depPunish !== false) for (let i = 0; i < 2; i++) { const s = randomDarkTile(W); if (s) spawn(W, "chase", s.x, s.y); }
    }
  }

  /* ================= 每 tick 推进 ================= */
  function tick(W) {
    if (W.won) return;
    if (W.player.dead) return;
    const p = W.player;
    p.px = p.x; p.py = p.y;
    syncCell(p);
    const ocx = p.cx, ocy = p.cy, wasGrounded = p.grounded;

    if (p.logCd > 0) p.logCd -= DT;
    if (p.inv > 0) p.inv -= DT;
    if (p.stun > 0) p.stun -= DT;
    if (p.doorCd > 0) p.doorCd -= DT;
    if (W.flags.scrambled > 0) { W.flags.scrambled--; if (W.flags.scrambled <= 0) U.Input.unscramble(); }
    if (W.flags.rush > 0) W.flags.rush--;
    for (let i = W.flashes.length - 1; i >= 0; i--) { if (--W.flashes[i].ticks <= 0) W.flashes.splice(i, 1); }
    for (let i = 0; i < W.reveal.length; i++) if (W.reveal[i] > 0) W.reveal[i]--;

    if (p.cast) { p.cast.turns -= DT; if (p.cast.turns <= 0) finishCast(W); if (p.dead) return; }

    /* 玩家 */
    stepPlayer(W);
    syncCell(p);
    if (p.cx !== ocx || p.cy !== ocy) onEnter(W);
    else if (p.grounded && !wasGrounded) enterTile(W);
    if (p.dead) return;
    if (hazardCheck(W)) return;
    collide(W);
    if (p.dead) return;

    /* 虫群 */
    for (const b of W.bugs.slice()) {
      b.px = b.x; b.py = b.y;
      if (b.stun > 0) { b.stun--; continue; }
      if (b.frozen > 0) { b.frozen--; continue; }
      const k = BUGS.get(b.kind);
      try { k.ai ? k.ai.call(k, W.api, b) : null; } catch (e) { /* 单只虫抽风不该弄停世界 */ }
    }
    dropCrawlers(W);
    bugGravity(W);

    /* 移动代码块 */
    for (const m of W.movers) {
      if (m.cd-- > 0) continue;
      m.cd = m.rate;
      let nx = m.x, ny = m.y;
      if (m.axis === "x") nx += m.dir * m.step; else ny += m.dir * m.step;
      if (Math.abs((m.axis === "x" ? nx : ny) - (m.axis === "x" ? m.ox : m.oy)) >= m.span) { m.dir = -m.dir; nx = m.x; ny = m.y; }
      if (boxHitsCell(W, p, m.x, m.y) || boxHitsCell(W, p, nx, ny)) { die(W, "被移动的代码块压成了二维数组"); return; }
      m.x = nx; m.y = ny;
    }

    /* CI 红光带：亮着扫平一切，熄灯的几 tick 是缝 */
    for (const bd of W.bands) {
      if (!bd.on) continue;
      const was = bd.lit;
      bd.pos += bd.dir * bd.speed * DT;
      if (bd.pos < -3 || bd.pos > (bd.axis === "x" ? W.w : W.h) + 3) { bd.on = false; continue; }
      bd.t++;
      bd.lit = (bd.t % bd.cyc) < bd.onT;
      bd.justLit = !was && bd.lit;
      if (!bd.lit) continue;
      const pc = (bd.axis === "x" ? p.x : p.y) - 0.5;          // 玩家中心格坐标 → 格索引空间
      if (Math.abs(pc - bd.pos) < bd.thick) {
        die(W, bd.justLit ? "CI 重试成功，红光亮起来的时候你正好站在光里" : "被 CI 的红光扫到了");
        return;
      }
      for (const b of W.bugs.slice()) if (Math.abs((bd.axis === "x" ? b.x : b.y) - bd.pos) < bd.thick) sweepBug(W, b);
    }

    /* 内存泄漏 */
    for (const lk of W.leaks) {
      if (!lk.on) continue;
      if (++lk.ticks % Math.round(lk.rate * STEP_HZ) === 0 && (lk.cap == null || lk.r < lk.cap)) lk.r += lk.grow;
      if (U.dist(p.x, p.y, lk.x + 0.5, lk.y + 0.5) <= lk.r + PW / 2) {
        const was = W.flags.o2 || 0;
        W.flags.o2 = was + DT;
        if (Math.floor(was) !== Math.floor(W.flags.o2)) sfx("tick");
        if (W.flags.o2 > 3) { die(W, "在泄漏区里待太久，OOM"); return; }
      } else if (W.flags.o2) W.flags.o2 = Math.max(0, W.flags.o2 - 2 * DT);
    }

    /* 历史幽灵：循环重放玩家 lag 秒前走过的路 */
    if (W.flags.trailOn) {
      W.trail.push({ x: p.x, y: p.y });
      if (W.trail.length > 12000) W.trail.splice(0, 4000);
      for (const g of W.ghosts) {
        if (!g.on || W.trail.length < g.lag + 2) continue;
        g.i++;
        const start = W.trail.length - g.lag;
        const span = g.lag;
        const at = start + (g.i % Math.max(1, span));
        const pt = W.trail[U.clamp(at, 0, W.trail.length - 1)];
        if (pt) {
          g.x = pt.x; g.y = pt.y;
          if (U.dist(g.x, g.y, p.x, p.y) < 0.6) { die(W, "被「几秒前的自己」撞上了 —— 你死于历史重演"); return; }
        }
      }
    }

    /* 塌陷计时 */
    for (const k in W.dyn) {
      const parts = k.split(","), L = +parts[0], x = +parts[1], y = +parts[2];
      const dd = W.dyn[k];
      if (L !== W.layer) continue;
      if (dd.todoT != null && --dd.todoT <= 0 && W.layers[L][y * W.w + x] === "t") {
        W.layers[L][y * W.w + x] = "~"; sfx("boom");
        if (x === p.cx && y === p.cy) { die(W, "TODO 砖塌了，你的脚跟着塌"); return; }
      }
      if (dd.crumbleT != null && --dd.crumbleT <= 0 && W.layers[L][y * W.w + x] === "s") {
        W.layers[L][y * W.w + x] = "~"; sfx("boom");
        if (x === p.cx && y === p.cy) { die(W, "脆板碎了"); return; }
      }
    }

    light(W);
    W.tick++;
    fire(W, "tick");
    runTut(W);
  }

  /** 判定箱（锚点 x,y）与格子 (cx,cy) 是否重叠 */
  function boxHitsCellAt(W, x, y, cx, cy) {
    const bh = W.gravity > 0 ? P_S : P_H, th = W.gravity > 0 ? P_H : P_S;
    return x + PW / 2 > cx && x - PW / 2 < cx + 1 && y + bh > cy && y - th < cy + 1;
  }
  function boxHitsCell(W, p, x, y) {
    return boxHitsCellAt(W, p.x, p.y, x, y);
  }
  /** 判定箱（锚点 x,y）与甲虫致死盒是否重叠。
   *  致死盒是格中心 BUG_HIT×BUG_HIT 的内接盒，对着甲虫椭圆身体画（render.js 的 size=TS*0.32，不出腿），
   *  B 键调试画的就是它。以前拿整格当碰撞体，而玩家箱底 P_S=0.533 已过半格 ——
   *  站在甲虫正上方一格的格中心，箱底就压进甲虫格 0.033 格，「贴上去按 H」的机会都没有。 */
  function boxHitsBugAt(W, x, y, bx, by) {
    const bh = W.gravity > 0 ? P_S : P_H, th = W.gravity > 0 ? P_H : P_S;
    const h = BUG_HIT / 2, cx = bx + 0.5, cy = by + 0.5;
    return x + PW / 2 > cx - h && x - PW / 2 < cx + h && y + bh > cy - h && y - th < cy + h;
  }

  function sweepBug(W, b) {
    if (BUGS.get(b.kind).needsTest && !b.tested) {
      removeBug(W, b);
      for (let i = 0; i < 2; i++) { const s = randomTileNear(W, b.x, b.y, 3); if (s) spawn(W, "walk", s.x, s.y); }
      note(W, "CI 扫过一只祖传虫，它当场裂成两半");
      return;
    }
    removeBug(W, b);
    W.kills++;
    note(W, "CI 顺手刷掉一只「" + BUGS.get(b.kind).label + "」");
    checkPr(W);
  }

  function dropCrawlers(W) {
    for (const b of W.bugs) {
      if (b.kind !== "crawler" || b.attached) continue;
      if (b.cd-- > 0) continue;
      b.cd = Math.round(2 * S);
      const ny = b.y + (W.gravity > 0 ? 1 : -1);
      if (!solidAt(W, b.x, ny) && !isPitAt(W, b.x, ny)) { b.y = ny; continue; }
      b.kind = "walk"; b.attached = false; b.cd = Math.round(BUGS.get("walk").speed * S); b.dx = 1; b.dy = 0;
    }
  }

  /** 横版里虫子也归重力管：卵、爬墙虫、海森堡虫例外；下面是坑就悬着（别把虫喂坑） */
  function bugGravity(W) {
    if (W.mode !== "side") return;
    if (W.tick % 8 !== 0) return;                         // 保持原来的 8Hz 下落节奏，别变成 60 格/秒
    const down = W.gravity > 0 ? 1 : -1;
    for (const b of W.bugs) {
      if (b.kind === "egg" || b.kind === "crawler" || b.kind === "heisen") continue;
      if (b.frozen > 0 || b.stun > 0) continue;
      const ny = b.y + down;
      if (!inb(W, b.x, ny)) continue;
      if (supportAt(W, b.x, ny) || isPitAt(W, b.x, ny)) continue;
      if (bugAt(W, b.x, ny)) continue;
      b.y = ny;
    }
  }

  function collide(W) {
    const p = W.player;
    if (p.inv > 0) return;
    for (const b of W.bugs) {
      if (!BUGS.isLethal(b)) continue;
      /* 判定 = 判定箱碰到甲虫致死盒（与 B 键画出来的盒子同一几何） */
      if (boxHitsBugAt(W, p.x, p.y, b.x, b.y)) { die(W, "被「" + BUGS.get(b.kind).label + "」撞了个正着"); return; }
      /* 两人对穿（同 tick 交换格子）也算撞上 */
      if (b.px != null &&
          boxHitsBugAt(W, p.px, p.py, b.x, b.y) &&
          boxHitsBugAt(W, p.x, p.y, b.px, b.py)) {
        die(W, "和「" + BUGS.get(b.kind).label + "」迎面撞在一起"); return;
      }
    }
  }

  function win(W) {
    if (W.won) return;
    W.won = true;
    sfx("pr");
    if (W.onWin) W.onWin();
  }

  /* ================= 教学 =================
   * 教学进度存在 tutFlags / tutStep 里，且不进快照：
   * 回档会把世界还原到 commit 那一刻，但不该把「你已经学会的东西」也退回。 */
  function flag(W, name) {
    const f = W.tutFlags;
    f["ev_" + name] = W.tick;
    f["cnt_" + name] = (f["cnt_" + name] || 0) + 1;
  }
  function tutDone(W, st) {
    const f = W.tutFlags;
    switch (st.when) {
      case "start": return true;
      case "move": return (f.cnt_move || 0) >= (st.n || 1);
      case "nearCommit": return !!f.ev_nearCommit;
      case "commit": return !!f.ev_commit;
      case "log": return !!f.ev_log;
      case "kill": return (f.cnt_kill || 0) >= (st.n || 1);
      case "test": return !!f.ev_test;
      case "layer": return !!f.ev_layer;
      case "revert": return W.reverted >= (st.n || 1);
      case "dead": return !!f.ev_dead;
      case "tick": return W.tick >= Math.round((st.n || 0) * STEP_HZ);
      case "bugsLeft": return W.bugs.length <= (st.n == null ? 0 : st.n);
      case "pr": return W.prReady;
      default: return true;
    }
  }
  function runTut(W) {
    if (W.tutStep >= W.tut.length) {
      /* 教学走完时如果正站在 PR 门前等着，就直接放行，不用再踩一次 */
      if (W.tutFlags.prWait && W.prReady && tile(W, W.player.cx, W.player.cy) === "P") win(W);
      return;
    }
    const st = W.tut[W.tutStep];
    if (st.wait) return;                      // 等玩家按空格确认（UI 调 tutAck）
    if (tutDone(W, st)) W.tutStep++;
  }
  function tutAck(W) {
    if (W.tutStep >= W.tut.length) return;
    if (W.tut[W.tutStep].wait) { W.tutStep++; W.tutFlags.tutAck = 1; sfx("uiOk"); }
  }
  function tutNow(W) { return W.tutStep < W.tut.length ? W.tut[W.tutStep] : null; }

  /* ================= 杂项 ================= */
  function toast(W, text, tone) {
    W.toasts.push({ text, tone: tone || "warn", ticks: Math.round(4.5 * STEP_HZ) });
    if (W.toasts.length > 6) W.toasts.shift();
    if (tone !== "tut") sfx("tip");
    if (W.onToast) W.onToast(text, tone);
  }
  function note(W, text) {
    W.notes.push({ t: Math.round(W.tick * DT), text });
    if (W.notes.length > 80) W.notes.shift();
  }
  function sfx(cue) { if (window.GSFX) GSFX.play(cue); }

  return {
    STEP_HZ, DT, BUG_HIT, bindLevels, create, tick, act, tutAck, tutNow,
    revert, snap, restore, pushCommit, doCommit, atCommitTile,
    tile, look, setTile, dyn, observed, brightness, memLeft, solidAt, bugBlock, isPitAt, supportAt,
    spawn, removeBug, killBug, bugAt, adjacentBug, explode, die, light, inb, idx, keyOf,
    stepPlayer, resolvePlayer, doLog, doLayer, mutate, act1, fire, checkPr, jump,
    bugs: () => BUGS, level: W => LEVELS[W.li], levels: () => LEVELS
  };
})();

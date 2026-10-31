/* ============================================================
 * Escape A÷ · game/src/world.js —— 「修复屎山」的世界状态机
 *
 * 这一层是纯逻辑：不认识 canvas、不认识 DOM，只有 grid / bugs / lit / player。
 * 这么切有两个好处：
 *   1. 整份状态可以 JSON 快照 —— commit 存档与回档就是 JSON.parse/stringify；
 *   2. 无头模拟（node 里跑 bot 通关）能直接调它，不用起浏览器。
 *
 * 逻辑按 tick 推进（STEP_HZ 次/秒）：玩家每 tick 最多走一格，虫子按自己的 speed 走，
 * 于是所有陷阱都是确定性的 —— 同一个 commit 回档两次，结果一定相同。
 *
 * W 是纯数据；W.api 是给 bugs.js 用的窄接口（不进快照）。
 * ============================================================ */
"use strict";

window.WORLD = (() => {

  const STEP_HZ = 8;
  const DT = 1 / STEP_HZ;

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

  /* ================= 阻挡判定 ================= */
  function moverAt(W, x, y) { for (const m of W.movers) if (m.x === x && m.y === y) return m; return null; }
  function isDoorOpen(W, x, y) { const k = keyOf(W.layer, x, y); return !!(W.dyn[k] && W.dyn[k].open); }
  function solidAt(W, x, y) {
    if (!inb(W, x, y)) return true;
    if (moverAt(W, x, y)) return true;
    const ch = tile(W, x, y);
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
  function light(W) {
    const t = W.tick, L = W.layer;
    const r = W.cfg.r;
    if (r > 0) {
      const rr = Math.ceil(r);
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        const x = W.player.x + dx, y = W.player.y + dy;
        if (!inb(W, x, y)) continue;
        if (Math.sqrt(dx * dx + dy * dy) > r + 0.35) continue;
        const i = idx(W, L, x, y);
        W.lit[i] = t; W.seen[i] = 1;
      }
    } else {                                          // 全图常亮（教学关）
      for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) { const i = idx(W, L, x, y); W.lit[i] = t; W.seen[i] = 1; }
    }
    for (const cov of W.lampCov) for (const i of cov) { W.lit[i] = t; W.seen[i] = 1; }
    for (const f of W.flashes) {
      const rr = Math.ceil(f.r);
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        const x = f.x + dx, y = f.y + dy;
        if (!inb(W, x, y)) continue;
        if (Math.sqrt(dx * dx + dy * dy) > f.r + 0.35) continue;
        const i = idx(W, W.layer, x, y);
        W.lit[i] = t; W.seen[i] = 1;
        if (f.probe) W.reveal[i] = Math.max(W.reveal[i], f.ticks);
      }
    }
  }
  /** 此刻是否被「观测」——只算实时光源，记忆不算 */
  function observed(W, x, y) {
    if (W.cfg.r <= 0) return true;
    if (U.dist(x, y, W.player.x, W.player.y) <= W.cfg.r + 0.35) return true;
    for (const f of W.flashes) if (U.dist(x, y, f.x, f.y) <= f.r + 0.35) return true;
    for (const l of W.lamps) if (U.dist(x, y, l.x, l.y) <= l.r + 0.35) return true;
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
      player: { x: st.x, y: st.y, ax: st.x, ay: st.y, px: st.x, py: st.y,
                dir: 1, lastDx: 1, lastDy: 0, grounded: true, airUp: 0,
                cast: null, dead: false, inv: 0, stun: 0, logCd: 0 },
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
      get player() { return W.player; },
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
        if (s.speed) b.cd = s.speed;
        if (s.range) b.range = s.range;
      }
    }
    for (const m of (lv.movers || [])) {
      W.movers.push({ x: m.at[0], y: m.at[1], ox: m.at[0], oy: m.at[1],
                      axis: m.axis || "x", span: m.span || 3, step: m.step || 1,
                      cd: m.delay || 0, rate: m.rate || 8, dir: m.dir === "n" || m.dir === "w" ? -1 : 1 });
    }
    for (const c of (lv.ci || [])) W.bands.push(mkBand(c));
    for (const l of (lv.leak || [])) W.leaks.push({ x: l.at[0], y: l.at[1], r: l.r0 || 0.5, rate: l.rate || 8, grow: l.grow || 1, ticks: 0, on: true });
    for (const g of (lv.ghosts || [])) W.ghosts.push({ i: 0, x: g.at[0], y: g.at[1], lag: Math.round((g.lag || 5) * STEP_HZ), speed: g.speed || 1, on: !!lv.ghostTrail });
    if (lv.ghostTrail) W.flags.trailOn = true;

    /* 开局先落一个 init commit，否则第一次死亡无处可回 */
    pushCommit(W, "起点 · " + lv.name, true);
    light(W);
    W.flags.started = true;
    return W;
  }

  function mkBand(c) {
    const axis = c.axis || (c.dir === "n" || c.dir === "s" ? "y" : "x");
    return { axis, pos: axis === "y" ? c.at[1] : c.at[0], dir: (c.dir === "w" || c.dir === "n") ? -1 : 1,
             speed: c.speed || 0.5, thick: 0.5, on: true };
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
      id: nextIdFor(W), kind, x, y, cd: kind === "egg" ? BUGS.KINDS.egg.hatch * STEP_HZ : (k.speed || 0),
      hp: k.hp || 1, tested: false, frozen: 0, stun: 0,
      dx: k.chase ? 0 : (x % 2 ? 1 : -1), dy: 0,
      attached: kind === "crawler", jumpCd: k.jump || null, fuse: k.fuse ? k.fuse * STEP_HZ : null,
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
    if (W.player.x === x || W.player.y === y) {
      const d = Math.abs(W.player.x - x) + Math.abs(W.player.y - y);
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
      const d = Math.abs(b.x - W.player.x) + Math.abs(b.y - W.player.y);
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
      p.cast = { type: "fix", turns: 3, bug: b.id }; sfx("cast"); flag(W, "wantKill");
    } else if (name === "test") {
      if (W.tools.test <= 0) { toast(W, "测试配额用完了，剩下的祖传虫只能绕", "bad"); return; }
      const b = pickTarget("盖测试"); if (!b) return;
      p.cast = { type: "test", turns: 4, bug: b.id }; sfx("cast");
    }
  }

  function finishCast(W) {
    const c = W.player.cast; if (!c) return;
    W.player.cast = null;
    let bug = null;
    for (const b of W.bugs) if (b.id === c.bug) bug = b;
    if (!bug) { toast(W, "目标跑了", "warn"); return; }
    if (Math.abs(bug.x - W.player.x) + Math.abs(bug.y - W.player.y) > 1) { toast(W, "它跑开了，得重新贴上去", "warn"); return; }
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
      bug.hp--; bug.frozen = 6; sfx("alarm");
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

  function randomTileNear(W, cx, cy, rad) {
    for (let tries = 0; tries < 26; tries++) {
      const x = cx + U.rint(W.rng, rad * 2 + 1) - rad, y = cy + U.rint(W.rng, rad * 2 + 1) - rad;
      if (!inb(W, x, y) || solidAt(W, x, y) || isPitAt(W, x, y)) continue;
      if (x === W.player.x && y === W.player.y) continue;
      if (bugAt(W, x, y)) continue;
      return { x, y };
    }
    return null;
  }
  function randomDarkTile(W) {
    for (let tries = 0; tries < 44; tries++) {
      const x = U.rint(W.rng, W.w), y = U.rint(W.rng, W.h);
      if (solidAt(W, x, y) || isPitAt(W, x, y)) continue;
      if (x === W.player.x && y === W.player.y) continue;
      if (U.dist(x, y, W.player.x, W.player.y) < 2.5) continue;
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
    let tx = p.x, ty = p.y;
    for (let i = 1; i <= 6; i++) {
      const nx = p.x + dx * i, ny = p.y + dy * i;
      if (!inb(W, nx, ny) || solidAt(W, nx, ny)) break;
      tx = nx; ty = ny;
    }
    W.flashes.push({ x: tx, y: ty, r: 3.6, ticks: 5 * STEP_HZ, probe: true });
    p.logCd = 11;
    sfx("log");
    flag(W, "log");
    for (const b of W.bugs) if (U.dist(b.x, b.y, tx, ty) <= 3.9) b.stun = 6 * STEP_HZ;
    note(W, "console.log 落在 " + tx + "," + ty + "：假地块现形，范围内的虫被晃瞎 6 秒");
  }

  /* ================= commit / 回档 ================= */
  const SNAP_SKIP = { api: 1, lampCov: 1, toasts: 1, tutStep: 1, tutFlags: 1,
                      onCommit: 1, onDeath: 1, onWin: 1, onToast: 1 };
  function snap(W) {
    const copy = {};
    for (const k in W) {
      if (SNAP_SKIP[k]) continue;
      if (typeof W[k] === "function") continue;
      copy[k] = W[k];
    }
    copy.notes = W.notes.slice(-8);
    copy.toasts = [];
    return JSON.stringify(copy);
  }
  function restore(W, text) {
    const obj = JSON.parse(text);
    const keep = { api: W.api, lampCov: W.lampCov, toasts: W.toasts,
                   onCommit: W.onCommit, onDeath: W.onDeath, onWin: W.onWin, onToast: W.onToast };
    for (const k in obj) W[k] = obj[k];
    for (const k in keep) if (keep[k] !== undefined) W[k] = keep[k];
    U.Input.unscramble();
    U.Input.clear();
    return W;
  }

  function atCommitTile(W) {
    for (const c of W.mapCommits) if (c.x === W.player.x && c.y === W.player.y) return c;
    return null;
  }
  function doCommit(W) {
    if (!atCommitTile(W)) { toast(W, "这里没有 -o- ，先去找一个", "warn"); return; }
    const last = W.commitLog[W.commitLog.length - 1];
    if (last && last.x === W.player.x && last.y === W.player.y && last.tag !== "init") { toast(W, "已经在这个 commit 上了", "warn"); return; }
    pushCommit(W, "第 " + (W.li + 1) + " 关 · 已修 " + W.kills + " 只 · 剩 " + W.bugs.length + " 只");
    sfx("commit");
    toast(W, "commit 落好：" + W.commitLog[W.commitLog.length - 1].hash, "good");
    flag(W, "commit");
  }
  function pushCommit(W, msg, isInit) {
    const n = W.commitLog.length;
    const entry = { hash: U.shortHash(W.seed, n), msg, tag: isInit ? "init" : "manual",
                    turn: W.tick, x: W.player.x, y: W.player.y,
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
        if (x === W.player.x && y === W.player.y) continue;
        if (tile(W, x, y) !== ".") continue;
        if (W.lit[idx(W, W.layer, x, y)] > W.tick - 24) continue;   // 别当着玩家的面变
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
  function inRange(a, p) { const r = a[2] || 0; return Math.abs(p.x - a[0]) <= r && Math.abs(p.y - a[1]) <= r; }
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
        W.gravity = a.to === "up" ? -1 : 1; W.player.grounded = false; W.player.airUp = 0;
        sfx("glitch"); toast(W, a.text || (W.gravity < 0 ? "重力反了：天花板才是地板" : "重力恢复正常"), "bad"); break;
      case "flipMode": {
        W.mode = a.to || (W.mode === "side" ? "top" : "side");
        W.player.grounded = false; W.player.airUp = 0;
        sfx("glitch"); toast(W, a.text || "有人重构了坐标系：现在是「" + (W.mode === "side" ? "横版" : "俯视") + "」视角", "bad"); break;
      }
      case "scramble":
        U.Input.scramble(a.kind || "swap"); W.flags.scrambled = (a.turns || 8) * STEP_HZ;
        sfx("glitch"); toast(W, a.text || "键盘被 AI 改了 —— 方向键和 WASD 一起转了，看清了再走", "bad"); break;
      case "unscramble": U.Input.unscramble(); W.flags.scrambled = 0; break;
      case "ci": W.bands.push(mkBand({ at: a.at, dir: a.dir || "w", axis: a.axis, speed: a.speed || 0.5 })); sfx("alarm"); toast(W, a.text || "CI 开始跑：那道红光会一路推平，包括虫子", "bad"); break;
      case "leak": W.leaks.push({ x: a.at[0], y: a.at[1], r: 0.5, rate: a.rate || 8, grow: a.grow || 1, ticks: 0, on: true }); toast(W, a.text || "泄漏开始扩散", "bad"); break;
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
          const s = randomTileNear(W, W.player.x, W.player.y, 4);
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

  function shiftLayer(W, L, dx, edge) {
    const rows = W.layers[L], w = W.w, h = W.h;
    for (let y = 0; y < h; y++) {
      const base = y * w;
      if (dx > 0) for (let x = w - 1; x >= 0; x--) rows[base + x] = x - dx >= 0 ? rows[base + x - dx] : edge;
      else for (let x = 0; x < w; x++) rows[base + x] = x - dx < w ? rows[base + x - dx] : edge;
    }
    W.player.x = U.clamp(W.player.x + dx, 0, w - 1);
    for (const b of W.bugs) b.x = U.clamp(b.x + dx, 0, w - 1);
    for (const c of W.mapCommits) c.x = U.clamp(c.x + dx, 0, w - 1);
    for (const p of W.prs) p.x = U.clamp(p.x + dx, 0, w - 1);
    W.dyn = {};
    W.lamps = W.lamps.map(l => ({ x: U.clamp(l.x + dx, 0, w - 1), y: l.y, r: l.r }));
  }

  function doLayer(W, to) {
    if (W.layers.length < 2) { toast(W, "这关只有一条分支，切不了图层", "warn"); return; }
    W.layer = to != null ? (to % W.layers.length) : (W.layer + 1) % W.layers.length;
    let x = W.player.x, y = W.player.y;
    if (solidAt(W, x, y) || isPitAt(W, x, y)) {
      let found = null;
      for (let r = 1; r < 7 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!solidAt(W, x + dx, y + dy) && !isPitAt(W, x + dx, y + dy) && W.layers[W.layer][(y + dy) * W.w + (x + dx)] !== "#") found = { x: x + dx, y: y + dy };
      }
      if (!found) { die(W, "切分支时这一格在另一条分支上是实心的 —— 冲突未解决"); return; }
      W.player.x = found.x; W.player.y = found.y;
      toast(W, "切换分支：你被挤到了空位上", "warn");
    }
    sfx("glitch");
    flag(W, "layer");
  }

  /* ================= 玩家移动 ================= */
  function movePlayer(W, dx, dy) {
    const p = W.player;
    if (p.stun > 0) return false;
    if (p.cast) p.cast = null;                    // 一动就打断施法
    p.lastDx = dx; p.lastDy = dy;
    if (dx) p.dir = dx > 0 ? 1 : -1;
    const nx = p.x + dx, ny = p.y + dy;
    if (!inb(W, nx, ny)) return false;
    if (tile(W, nx, ny) === "|" && !isDoorOpen(W, nx, ny)) { tryDoor(W, nx, ny); return false; }
    if (W.mode === "top") {
      if (solidAt(W, nx, ny)) return false;
      p.x = nx; p.y = ny;
      onEnter(W);
      return true;
    }
    if (dy === 0) {
      if (solidAt(W, nx, ny)) return false;
      p.x = nx; p.y = ny;
      onEnter(W);
      return true;
    }
    if (dy < 0) return jump(W);
    if (tile(W, p.x, p.y) === "+" && !solidAt(W, p.x, p.y + 1)) { p.y++; onEnter(W); return true; }
    return false;
  }

  function jump(W) {
    const p = W.player;
    if (!p.grounded || p.airUp > 0) return false;
    p.airUp = W.jump; p.grounded = false;
    sfx("jump");
    return true;
  }

  function onEnter(W) {
    flag(W, "move");
    enterTile(W);
    fire(W, "onEnter");
  }

  function enterTile(W) {
    const p = W.player, x = p.x, y = p.y;
    const ch = tile(W, x, y), d = dyn(W, x, y);
    if (isPitAt(W, x, y)) { die(W, ch === "&" ? "那是块假地板，下面是空的" : "掉进深坑（一个没人测过的接口）"); return; }
    if (ch === "x") { die(W, "踩在一地 undefined 上"); return; }
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
    if (ch === "j") { p.airUp = Math.max(p.airUp, 3); p.grounded = false; sfx("jump"); }
    if (atCommitTile(W)) { flag(W, "nearCommit"); if (!W.tutFlags.sawCommit) { W.tutFlags.sawCommit = 1; note(W, "这里有个 -o- ：按 L 落一个 commit"); } }
  }

  function tryDoor(W, x, y) {
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
    const p = W.player, x = p.x, y = p.y;
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

    if (p.logCd > 0) p.logCd--;
    if (p.inv > 0) p.inv--;
    if (W.flags.scrambled > 0) { W.flags.scrambled--; if (W.flags.scrambled <= 0) U.Input.unscramble(); }
    if (W.flags.rush > 0) W.flags.rush--;
    for (let i = W.flashes.length - 1; i >= 0; i--) { if (--W.flashes[i].ticks <= 0) W.flashes.splice(i, 1); }
    for (let i = 0; i < W.reveal.length; i++) if (W.reveal[i] > 0) W.reveal[i]--;

    if (p.cast) { if (--p.cast.turns <= 0) finishCast(W); }

    /* 玩家意图 */
    if (!p.cast) {
      const I = U.Input;
      let moved = false;
      if (W.mode === "top") {
        const dirs = [["left", -1, 0], ["right", 1, 0], ["up", 0, -1], ["down", 0, 1]];
        for (const it of dirs) if (I.down(it[0])) { if (movePlayer(W, it[1], it[2])) { moved = true; break; } }
      } else {
        if (I.down("left")) moved = movePlayer(W, -1, 0);
        if (!moved && I.down("right")) moved = movePlayer(W, 1, 0);
        if (I.hit("jump") || I.hit("up")) jump(W);
        if (!moved && I.hit("down")) moved = movePlayer(W, 0, 1);
      }
      if (!moved && W.mode === "side") physics(W);
    } else if (W.mode === "side") physics(W);

    if (tile(W, p.x, p.y) === "b") belt(W);

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
      if (nx === p.x && ny === p.y) { die(W, "被移动的代码块压成了二维数组"); return; }
      m.x = nx; m.y = ny;
    }

    /* CI 红光带 */
    for (const bd of W.bands) {
      if (!bd.on) continue;
      bd.pos += bd.dir * bd.speed * DT;
      if (bd.pos < -3 || bd.pos > (bd.axis === "x" ? W.w : W.h) + 3) { bd.on = false; continue; }
      if (Math.abs((bd.axis === "x" ? p.x : p.y) - bd.pos) < bd.thick) { die(W, "被 CI 的红光扫到了"); return; }
      for (const b of W.bugs.slice()) if (Math.abs((bd.axis === "x" ? b.x : b.y) - bd.pos) < bd.thick) sweepBug(W, b);
    }

    /* 内存泄漏 */
    for (const lk of W.leaks) {
      if (!lk.on) continue;
      if (++lk.ticks % Math.round(lk.rate * STEP_HZ) === 0) lk.r += lk.grow;
      if (U.dist(p.x, p.y, lk.x, lk.y) <= lk.r) {
        W.flags.o2 = (W.flags.o2 || 0) + 1;
        if (W.flags.o2 % STEP_HZ === 0) sfx("tick");
        if (W.flags.o2 > 3 * STEP_HZ) { die(W, "在泄漏区里待太久，OOM"); return; }
      } else if (W.flags.o2) W.flags.o2 = Math.max(0, W.flags.o2 - 2);
    }

    /* 历史幽灵：循环重放玩家 lag 秒前走过的路 */
    if (W.flags.trailOn) {
      W.trail.push({ x: p.x, y: p.y });
      if (W.trail.length > 6000) W.trail.splice(0, 2000);
      for (const g of W.ghosts) {
        if (!g.on || W.trail.length < g.lag + 2) continue;
        g.i++;
        const start = W.trail.length - g.lag;
        const span = g.lag;
        const at = start + (g.i % Math.max(1, span));
        const pt = W.trail[U.clamp(at, 0, W.trail.length - 1)];
        if (pt) { g.x = pt.x; g.y = pt.y; if (g.x === p.x && g.y === p.y) { die(W, "被「几秒前的自己」撞上了 —— 你死于历史重演"); return; } }
      }
    }

    /* 塌陷计时 */
    for (const k in W.dyn) {
      const parts = k.split(","), L = +parts[0], x = +parts[1], y = +parts[2];
      const dd = W.dyn[k];
      if (L !== W.layer) continue;
      if (dd.todoT != null && --dd.todoT <= 0 && W.layers[L][y * W.w + x] === "t") {
        W.layers[L][y * W.w + x] = "~"; sfx("boom");
        if (x === p.x && y === p.y) { die(W, "TODO 砖塌了，你的脚跟着塌"); return; }
      }
      if (dd.crumbleT != null && --dd.crumbleT <= 0 && W.layers[L][y * W.w + x] === "s") {
        W.layers[L][y * W.w + x] = "~"; sfx("boom");
        if (x === p.x && y === p.y) { die(W, "脆板碎了"); return; }
      }
    }

    collide(W);
    light(W);
    W.tick++;
    fire(W, "tick");
    runTut(W);
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
      b.cd = 2;
      const ny = b.y + (W.gravity > 0 ? 1 : -1);
      if (!solidAt(W, b.x, ny) && !isPitAt(W, b.x, ny)) { b.y = ny; continue; }
      b.kind = "walk"; b.attached = false; b.cd = BUGS.get("walk").speed; b.dx = 1; b.dy = 0;
    }
  }

  /** 横版里虫子也归重力管：卵、爬墙虫、海森堡虫例外；下面是坑就悬着（别把虫喂坑） */
  function bugGravity(W) {
    if (W.mode !== "side") return;
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

  function belt(W) {
    const p = W.player;
    let dir = null;
    for (const s of W.belts) if (s.x === p.x && s.y === p.y) dir = BELT_VEC[s.dir] || BELT_VEC.e;
    if (!dir) return;
    const nx = p.x + dir[0], ny = p.y + dir[1];
    if (solidAt(W, nx, ny) || isPitAt(W, nx, ny)) return;
    p.x = nx; p.y = ny;
    enterTile(W);
  }

  function physics(W) {
    const p = W.player;
    if (W.mode !== "side") return;
    const down = W.gravity > 0 ? 1 : -1;
    if (p.airUp > 0) {
      const ny = p.y - down;
      if (!solidAt(W, p.x, ny)) { p.y = ny; p.airUp--; if (isPitAt(W, p.x, p.y)) { die(W, "跳进了坑里"); return; } enterTile(W); }
      else p.airUp = 0;
      return;
    }
    const fy = p.y + down;
    if (!inb(W, p.x, fy)) { die(W, "掉出了仓库边界：这一层原来没有地板"); return; }
    if (solidAt(W, p.x, fy)) { p.grounded = true; return; }
    if (supportAt(W, p.x, fy) && !isPitAt(W, p.x, fy)) { p.grounded = true; return; }
    p.grounded = false;
    p.y = fy;
    if (isPitAt(W, p.x, p.y)) { die(W, "掉进深坑（一个没人测过的接口）"); return; }
    enterTile(W);
  }

  function collide(W) {
    const p = W.player;
    if (p.inv > 0) return;
    for (const b of W.bugs) {
      if (!BUGS.isLethal(b)) continue;
      if (b.x === p.x && b.y === p.y) { die(W, "被「" + BUGS.get(b.kind).label + "」撞了个正着"); return; }
      /* 两人对穿（同 tick 交换格子）也算撞上 */
      if (b.x === p.px && b.y === p.py && b.px === p.x && b.py === p.y) { die(W, "和「" + BUGS.get(b.kind).label + "」迎面撞在一起"); return; }
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
      if (W.tutFlags.prWait && W.prReady && tile(W, W.player.x, W.player.y) === "P") win(W);
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
    STEP_HZ, DT, bindLevels, create, tick, act, tutAck, tutNow,
    revert, snap, restore, pushCommit, doCommit, atCommitTile,
    tile, look, setTile, dyn, observed, brightness, memLeft, solidAt, bugBlock, isPitAt, supportAt,
    spawn, removeBug, killBug, bugAt, adjacentBug, explode, die, light, inb, idx, keyOf,
    movePlayer, doLog, doLayer, mutate, act1, fire, checkPr, jump,
    bugs: () => BUGS, level: W => LEVELS[W.li], levels: () => LEVELS
  };
})();

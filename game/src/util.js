/* ============================================================
 * Escape A÷ · game/src/util.js —— 小游戏通用工具（零依赖）
 *
 * 「修复屎山」用到的杂项：种子随机、数学、输入、缓动、格式化。
 * 随机数状态存在世界对象里（W.rng），这样 commit 快照能连随机数一起回档。
 * ============================================================ */
"use strict";

window.U = (() => {

  /* ---------------- 数学 ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------------- 种子随机（状态可序列化） ---------------- */
  function rngNew(seed) { return { s: (seed || 1) >>> 0 }; }
  function rnd(rng) {
    let s = (rng.s || 1) >>> 0;
    s ^= (s << 13); s >>>= 0;
    s ^= (s >>> 17);
    s ^= (s << 5); s >>>= 0;
    rng.s = s;
    return s / 4294967296;
  }
  function rint(rng, n) { return Math.floor(rnd(rng) * n); }
  function pick(rng, arr) { return arr.length ? arr[rint(rng, arr.length)] : null; }

  /* ---------------- 文本 ---------------- */
  function pad(n, w) { const s = "" + n; return s.length >= w ? s : "0".repeat(w - s.length) + s; }
  function mmss(sec) {
    const s = Math.max(0, Math.floor(sec));
    return pad(Math.floor(s / 60), 2) + ":" + pad(s % 60, 2);
  }
  /** git 风格的短哈希：由世界状态 + 序号派生，稳定且好看 */
  function shortHash(seed, n) {
    let h = (seed * 2654435761 + n * 40503) >>> 0;
    h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
    return ("0000000" + (h >>> 0).toString(16)).slice(-6) + "-" + n;
  }

  /* ---------------- 输入 ---------------- */
  const Input = {
    held: new Set(),      // 当前按住的规范化键名
    pressed: new Set(),   // 本帧刚按下
    map: null,            // 键位打乱表（阴间事件用）：{ 物理键: 逻辑名 }
    heldBy: new Map(),    // 物理键 code → 它按下那一刻映射到的逻辑名。松手按这份账删，
                          // 键位打乱中途恢复也不会把"right"残留在 held 里卡死方向
    stick: null,          // 摇杆模拟向量 {x,y}（模长 ≤1，y 向下）；null = 没碰摇杆，走键盘
    dirMap: null,         // 打乱时的「逻辑方向 → 逻辑方向」表，用来旋转摇杆向量（和按键一致）
    _su: false, _sd: false, // 摇杆纵向合成 跳 / 下穿 的滞回状态
    base: {
      /* 左手 WASD 走路（方向键留着一起用），右手一整个功能块：
       *   U 回档   O 图鉴   Esc 菜单
       *      H 修   J log   K 测试
       *                       B 判定箱（调试）
       * 空格 = 落 commit（横版里跳是 W / ↑），Enter 与空格同义（菜单里它本来就是确认）。 */
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down",
      Space: "commit", Enter: "commit",
      KeyH: "fix", KeyJ: "log", KeyK: "test",
      KeyU: "revert",
      KeyO: "help", Escape: "menu",
      KeyB: "box"
    },
    /** 物理键 → 逻辑动作名（没映射到就返回 null） */
    logical(code) {
      const m = this.map || this.base;
      return m[code] || null;
    },
    clear() {
      this.held.clear(); this.pressed.clear(); this.heldBy.clear();
      this._su = this._sd = false;
      this._stickKeys();   // 摇杆还推着就把跳 / 下穿重新挂上：回档清键盘，不该把正在走的人定住
    },
    down(name) { return this.held.has(name); },
    hit(name) { return this.pressed.has(name); },
    /** 移动向量（逻辑坐标，y 向下，模长 ≤1）—— 俯视 / 横版唯一的速度来源。
     *  摇杆推着就走摇杆（万向 + 调速，模长就是油门）；否则键盘八向（斜走归一化）。
     *  键位打乱时摇杆向量按同一张表旋转 / 镜像，和按键体验一致。 */
    moveVec() {
      if (!this.stick) {
        let x = 0, y = 0;
        if (this.held.has("left")) x -= 1;
        if (this.held.has("right")) x += 1;
        if (this.held.has("up")) y -= 1;
        if (this.held.has("down")) y += 1;
        if (x && y) { x /= Math.SQRT2; y /= Math.SQRT2; }
        return { x: x, y: y };
      }
      let x = this.stick.x, y = this.stick.y;
      const t = this.dirMap;
      if (t) {
        /* 四个物理方向的分量各自映射到打乱后的逻辑方向再求和：
         * 这几张表都是方向的置换，等价于整体旋转 / 镜像，模长不变。 */
        let nx = 0, ny = 0;
        const comp = [["right", x], ["left", -x], ["down", y], ["up", -y]];
        for (let i = 0; i < 4; i++) {
          const m = comp[i][1];
          if (m <= 0) continue;
          const to = t[comp[i][0]] || comp[i][0];
          if (to === "right") nx += m;
          else if (to === "left") nx -= m;
          else if (to === "down") ny += m;
          else ny -= m;
        }
        x = nx; y = ny;
      }
      return { x: x, y: y };
    },
    /** 触屏摇杆入口。v = {x,y}：死区与调速已在 touch.js 处理好（模长 = 油门，y 向下）；
     *  v = null 松手。纵向分量顺带合成 跳 / 下穿 的按住与边沿（横版用），带滞回防抖，
     *  走 T: 假物理码 —— 键位打乱时和键盘一起乱。 */
    setStick(v) {
      this.stick = v ? { x: v.x, y: v.y } : null;
      this._stickKeys();
    },
    _stickKeys() {
      const y = this.stick ? this.stick.y : 0;
      const up = this._su ? y < -0.30 : y < -0.50;   // 上推过半才跳，回中到 0.3 以内才算松
      const dn = this._sd ? y > 0.30 : y > 0.50;
      if (up !== this._su) { this._su = up; if (up) this.touchDown("KeyW"); else this.touchUp("KeyW"); }
      if (dn !== this._sd) { this._sd = dn; if (dn) this.touchDown("KeyS"); else this.touchUp("KeyS"); }
    },
    onKeyDown(e) {
      const name = this.logical(e.code);
      if (!name) return;
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (e.repeat) return;
      if (!this.heldBy.has(e.code)) { this.heldBy.set(e.code, name); this.held.add(name); }
      this.pressed.add(name);
    },
    onKeyUp(e) {
      const name = this.heldBy.get(e.code);
      if (name == null) return;
      this.heldBy.delete(e.code);
      for (const other of this.heldBy.values()) if (other === name) return;   // 还有别的物理键按着同一个动作
      this.held.delete(name);
    },
    /** 触屏按钮按下：等价于敲一个键。code 传 base 表里的物理键名，
     *  照样过 logical()（键位被打乱时触屏跟着一起乱，和键盘体验一致）；
     *  账记在 "T:" 前缀下，不和真键盘的同名按键打架。 */
    touchDown(code) {
      const name = this.logical(code);
      if (!name) return;
      const tc = "T:" + code;
      if (!this.heldBy.has(tc)) { this.heldBy.set(tc, name); this.held.add(name); }
      this.pressed.add(name);
    },
    /** 触屏按钮松开：按按下那一刻的账清理，同 onKeyUp */
    touchUp(code) {
      const tc = "T:" + code;
      const name = this.heldBy.get(tc);
      if (name == null) return;
      this.heldBy.delete(tc);
      for (const other of this.heldBy.values()) if (other === name) return;
      this.held.delete(name);
    },
    /** 打乱键位：把方向键互相映射（保留 fix/log 等） */
    scramble(kind) {
      const rot = { cw: { left: "up", up: "right", right: "down", down: "left" },
                    ccw: { left: "down", down: "right", right: "up", up: "left" },
                    swap: { left: "right", right: "left", up: "down", down: "up" },
                    mirror: { left: "left", right: "right", up: "down", down: "up" } };
      const table = rot[kind] || rot.swap;
      const m = {};
      for (const code in this.base) {
        const logical = this.base[code];
        m[code] = table[logical] || logical;
      }
      this.map = m;
      this.dirMap = table;   // 摇杆向量按同一张方向表旋转
    },
    /** 恢复键位。held 故意不动：已经按住的键继续它按下那一刻的动作，松手时按物理键的账清理 */
    unscramble() { this.map = null; this.dirMap = null; }
  };

  /* ---------------- 小工具 ---------------- */
  function shuffle(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rint(rng, i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function fmt(n) { return (n >= 0 ? "+" : "") + n; }

  return { clamp, lerp, smooth, dist, hash2, rngNew, rnd, rint, pick, shuffle,
           pad, mmss, shortHash, fmt, Input };
})();

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
    base: {
      /* 左手 WASD 走路（方向键留着一起用），右手一整个功能块：
       *   U 回档   I 图层   O 图鉴   P 辅助
       *      H 修   J log   K 测试
       *                       M 音效
       * 空格 = 落 commit（横版里跳是 W / ↑），Enter 与空格同义（菜单里它本来就是确认）。 */
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down",
      Space: "commit", Enter: "commit",
      KeyH: "fix", KeyJ: "log", KeyK: "test", KeyI: "layer",
      KeyU: "revert",
      KeyO: "help", KeyP: "assist", KeyM: "volume", Escape: "menu"
    },
    /** 物理键 → 逻辑动作名（没映射到就返回 null） */
    logical(code) {
      const m = this.map || this.base;
      return m[code] || null;
    },
    clear() { this.held.clear(); this.pressed.clear(); },
    down(name) { return this.held.has(name); },
    hit(name) { return this.pressed.has(name); },
    onKeyDown(e) {
      const name = this.logical(e.code);
      if (!name) return;
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (e.repeat) return;
      this.held.add(name);
      this.pressed.add(name);
    },
    onKeyUp(e) {
      const name = this.logical(e.code);
      if (name) this.held.delete(name);
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
    },
    unscramble() { this.map = null; }
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

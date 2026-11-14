/* ============================================================
 * Escape A÷ · game/src/touch.js —— 小游戏触屏控件层
 *
 * 在 canvas 上叠一层 DOM 虚拟控件：左下摇杆（八向、带死区）移动，
 * 右下动作键。摇杆推过死区 = 按下方向键，推回死区 = 松开，
 * 和触屏按键一样汇进 U.Input（走 BUGFIX.key / keyUp），与键盘共用
 * 同一张键位表 —— 键位被打乱事件打乱时触屏也跟着乱，体验一致。
 * 检测到触屏（或 ?touch=1 强开）才挂出来；不碰存档、不碰世界状态。
 * ============================================================ */
"use strict";

window.GTOUCH = (() => {

  /* 按键表：code 必须是 U.Input.base 里已有的物理键名，不许发明新的 */
  const ACTS = [
    { code: "KeyH", label: "修", title: "修掉挨着的甲虫（H）" },
    { code: "KeyK", label: "测", title: "给挨着的甲虫盖测试（K）" },
    { code: "KeyJ", label: "log", title: "丢 console.log（J）" },
    { code: "Space", label: "commit", title: "落 commit（空格）", cls: "commit" }
  ];
  const MINI = [
    { code: "KeyU", label: "回", title: "回档（U）" },
    { code: "KeyO", label: "图", title: "图鉴（O）" },
    { code: "KeyB", label: "箱", title: "判定箱显隐（调试）" },
    { code: "Escape", label: "菜", title: "菜单（Esc）" }
  ];

  /* 摇杆：八向扇区。atan2 按 45° 一档取整，推过死区才认方向，
   * 俯视的斜走和横版的跑 / 跳 / 下穿刚好各占一个扇区。 */
  const JOY_CODES = ["KeyD", "KeyS", "KeyA", "KeyW"];   // 四个方向对应的假物理码
  const JOY_DEAD = 0.3;      // 死区（占可拉半径的比例），防手心搭上去就乱走

  let inited = false;

  function makeBtn(def) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gf-tbtn" + (def.cls ? " gf-" + def.cls : "");
    b.textContent = def.label;
    if (def.title) b.title = def.title;      // 桌面 ?touch=1 调试时能看懂
    b.addEventListener("pointerdown", e => {
      e.preventDefault();                    // 不触发兼容鼠标事件，也不让页面滚动 / 双击缩放
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      b.classList.add("gf-hold");
      if (window.BUGFIX) window.BUGFIX.key(def.code);
    });
    const release = () => {
      b.classList.remove("gf-hold");
      if (window.BUGFIX) window.BUGFIX.keyUp(def.code);
    };
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("lostpointercapture", release);
    b.addEventListener("contextmenu", e => e.preventDefault());
    return b;
  }

  function makeJoy() {
    const base = document.createElement("div");
    base.className = "gf-tjoy";
    const knob = document.createElement("div");
    knob.className = "gf-tknob";
    base.appendChild(knob);
    const on = { KeyD: false, KeyS: false, KeyA: false, KeyW: false };
    let joyId = null;

    /* dir: -1 = 死区；0..7 = 从右起每 45° 一档，顺时针（屏幕 y 向下）。
     * 每个方向键覆盖自己两侧的斜扇区：↗ = KeyD + KeyW，以此类推。 */
    function apply(dir) {
      const want = {
        KeyD: dir === 7 || dir === 0 || dir === 1,
        KeyS: dir === 1 || dir === 2 || dir === 3,
        KeyA: dir === 3 || dir === 4 || dir === 5,
        KeyW: dir === 5 || dir === 6 || dir === 7
      };
      for (const code of JOY_CODES) {
        if (want[code] === on[code]) continue;
        on[code] = want[code];
        if (!window.BUGFIX) continue;
        if (want[code]) window.BUGFIX.key(code);
        else window.BUGFIX.keyUp(code);
      }
    }

    function move(e) {
      const r = base.getBoundingClientRect();
      const R = r.width / 2;
      const dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const len = Math.hypot(dx, dy) || 1;
      const reach = R * 0.62;                  // 杆头最多拉到 62%，留点视觉余量
      knob.style.transform = "translate(" + (dx / len * reach).toFixed(1) + "px," + (dy / len * reach).toFixed(1) + "px)";
      if (len < reach * JOY_DEAD) { apply(-1); return; }
      const step = Math.PI / 4;
      apply(((Math.round(Math.atan2(dy, dx) / step) % 8) + 8) % 8);
    }
    function end(e) {
      if (e.pointerId !== joyId) return;
      joyId = null;
      base.classList.remove("gf-hold");
      knob.style.transform = "translate(0,0)";
      apply(-1);
    }
    base.addEventListener("pointerdown", e => {
      if (joyId != null) return;
      joyId = e.pointerId;
      try { base.setPointerCapture(e.pointerId); } catch (err) {}
      base.classList.add("gf-hold");
      e.preventDefault();
      move(e);
    });
    base.addEventListener("pointermove", e => { if (e.pointerId === joyId) move(e); });
    base.addEventListener("pointerup", end);
    base.addEventListener("pointercancel", end);
    base.addEventListener("lostpointercapture", end);
    base.addEventListener("contextmenu", e => e.preventDefault());
    return base;
  }

  function build() {
    const host = document.createElement("div");
    host.id = "gf-touch";
    host.appendChild(makeJoy());
    const side = document.createElement("div");
    side.className = "gf-tacts";
    const mini = document.createElement("div");
    mini.className = "gf-tmini";
    for (const m of MINI) mini.appendChild(makeBtn(m));
    const grid = document.createElement("div");
    grid.className = "gf-tgrid";
    for (const a of ACTS) grid.appendChild(makeBtn(a));
    side.appendChild(mini);
    side.appendChild(grid);
    host.appendChild(side);
    return host;
  }

  /** 开启触屏层：挂 DOM、给 #gf-app 打 gf-touch 类（CSS 据此适配 HUD 布局） */
  function enable() {
    if (inited) return;
    const app = document.getElementById("gf-app");
    if (!app) return;                        // 宿主还没挂载，等下次
    inited = true;
    app.classList.add("gf-touch");
    app.appendChild(build());
    const note = document.getElementById("gf-touch-note");
    if (note) note.style.display = "";       // 标题页那句触屏说明
  }

  function init() {
    const q = (window.location.search || "").replace(/^\?/, "");
    let forced = null;                       // ?touch=1 / ?touch=0 强开强关（桌面调试用）
    for (const p of q.split("&")) {
      if (!p) continue;
      const kv = p.split("=");
      if (kv[0] === "touch") forced = kv.length > 1 ? kv[1] : "1";
    }
    if (forced === "0") return;
    const natural = ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
    if (forced === "1" || natural) { enable(); return; }
    /* 混合设备：没检测到触屏就先藏着，第一次真触摸再亮出来 */
    window.addEventListener("touchstart", enable, { once: true, passive: true });
  }

  return { init, enable };
})();

/* ============================================================
 * Escape A÷ · game/src/touch.js —— 小游戏触屏控件层
 *
 * 在 canvas 上叠一层 DOM 虚拟按键：左下十字键移动，右下动作键。
 * 按下 / 松开都汇进 U.Input（走 BUGFIX.key / keyUp），和键盘共用
 * 同一张键位表 —— 键位被打乱事件打乱时触屏也跟着乱，体验一致。
 * 检测到触屏（或 ?touch=1 强开）才挂出来；不碰存档、不碰世界状态。
 * ============================================================ */
"use strict";

window.GTOUCH = (() => {

  /* 按键表：code 必须是 U.Input.base 里已有的物理键名，不许发明新的 */
  const DPAD = [
    { code: "KeyW", label: "↑", cls: "up" },
    { code: "KeyA", label: "←", cls: "left" },
    { code: "KeyD", label: "→", cls: "right" },
    { code: "KeyS", label: "↓", cls: "down" }
  ];
  const ACTS = [
    { code: "KeyH", label: "修", title: "修掉挨着的甲虫（H）" },
    { code: "KeyK", label: "测", title: "给挨着的甲虫盖测试（K）" },
    { code: "KeyJ", label: "log", title: "丢 console.log（J）" },
    { code: "Space", label: "commit", title: "落 commit（空格）", cls: "commit" }
  ];
  const MINI = [
    { code: "KeyI", label: "层", title: "切分支图层（I，双分支关才有）" },
    { code: "KeyU", label: "回", title: "回档（U）" },
    { code: "KeyO", label: "图", title: "图鉴（O）" },
    { code: "KeyB", label: "箱", title: "判定箱显隐（调试）" },
    { code: "Escape", label: "菜", title: "菜单（Esc）" }
  ];

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

  function build() {
    const host = document.createElement("div");
    host.id = "gf-touch";
    const pad = document.createElement("div");
    pad.className = "gf-tpad";
    for (const d of DPAD) pad.appendChild(makeBtn(d));
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
    host.appendChild(pad);
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

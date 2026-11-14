/* ============================================================
 * Escape A÷ · game/src/touch.js —— 小游戏触屏控件层
 *
 * 在 canvas 上叠一层 DOM 虚拟控件：左下万向摇杆移动，右下动作键。
 * 摇杆是**模拟量**：角度 = 移动方向（360° 万向，不再切八向扇区），
 * 推杆幅度 = 油门（推得越远跑得越快，带死区防手心误触），外圈速度环实时显示。
 * 向量汇进 U.Input.setStick → moveVec，与键盘共用同一张键位表 ——
 * 键位被打乱事件打乱时摇杆向量跟着旋转，体验一致；横版上推跳、下拉下穿
 * 由 Input 按滞回合成 up/down，和按键一样。检测到触屏（或 ?touch=1 强开）
 * 才挂出来；不碰存档、不碰世界状态。
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
    { code: "KeyI", label: "层", title: "切分支图层（I，双分支关才有）" },
    { code: "KeyU", label: "回", title: "回档（U）" },
    { code: "KeyO", label: "图", title: "图鉴（O）" },
    { code: "KeyB", label: "箱", title: "判定箱显隐（调试）" },
    { code: "Escape", label: "菜", title: "菜单（Esc）" }
  ];

  const JOY_DEAD = 0.28;     // 死区（占可拉半径的比例），防手心搭上去就乱走
  const RING_R = 48;         // 速度环半径（viewBox 104 坐标）
  const RING_C = 2 * Math.PI * RING_R;

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
    /* 万向刻度：十字准线 + 死区圈 + 外圈速度环（SVG，老 WebView 也认） */
    base.innerHTML =
      '<svg class="gf-tjoy-ring" viewBox="0 0 104 104" aria-hidden="true">' +
        '<circle class="gf-tjoy-track" cx="52" cy="52" r="' + RING_R + '"></circle>' +
        '<circle class="gf-tjoy-arc" cx="52" cy="52" r="' + RING_R + '"></circle>' +
      '</svg>' +
      '<div class="gf-tjoy-cross"></div>' +
      '<div class="gf-tjoy-dead"></div>';
    const knob = document.createElement("div");
    knob.className = "gf-tknob";
    const speed = document.createElement("div");
    speed.className = "gf-tjoy-speed";
    base.appendChild(knob);
    base.appendChild(speed);
    const arc = base.querySelector(".gf-tjoy-arc");
    arc.style.strokeDasharray = RING_C.toFixed(1);
    arc.style.strokeDashoffset = RING_C.toFixed(1);
    let joyId = null;

    /* spd ∈ [0,1] 是油门：环、辉光、百分比一起跟着走，调速一眼可见 */
    function paint(spd) {
      arc.style.strokeDashoffset = (RING_C * (1 - spd)).toFixed(1);
      knob.style.background = "rgba(124,243,176," + (0.16 + spd * 0.34).toFixed(3) + ")";
      knob.style.boxShadow = "0 0 " + (3 + spd * 15).toFixed(1) + "px rgba(124,243,176," + (0.2 + spd * 0.55).toFixed(3) + ")";
      speed.textContent = spd > 0.001 ? Math.round(spd * 100) + "%" : "";
      base.classList.toggle("gf-moving", spd > 0.001);
    }
    function move(e) {
      const r = base.getBoundingClientRect();
      const R = r.width / 2;
      const dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const len = Math.hypot(dx, dy);
      const reach = R * 0.62;                 // 杆头最多拉到 62%，留点视觉余量
      const nx = len ? dx / len : 0, ny = len ? dy / len : 0;
      const mag = Math.min(1, len / reach);
      const spd = mag > JOY_DEAD ? (mag - JOY_DEAD) / (1 - JOY_DEAD) : 0;   // 死区外线性调速
      const k = Math.min(len, reach);
      knob.style.transform = "translate(" + (nx * k).toFixed(1) + "px," + (ny * k).toFixed(1) + "px)";
      paint(spd);
      /* 死区里也保持「握住」状态（{0,0}），不让键盘趁虚而入；松手才 setStick(null) */
      U.Input.setStick({ x: nx * spd, y: ny * spd });
    }
    function end(e) {
      if (e && joyId != null && e.pointerId !== joyId) return;
      joyId = null;
      base.classList.remove("gf-hold", "gf-moving");
      knob.style.transform = "translate(0,0)";   // CSS 过渡让它平滑回中
      paint(0);
      U.Input.setStick(null);
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
    /* 失焦 / 切后台：手指可能没抬就丢了事件，主动松杆，回来不会带着油门一路走 */
    window.addEventListener("blur", () => end(null));
    document.addEventListener("visibilitychange", () => { if (document.hidden) end(null); });
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
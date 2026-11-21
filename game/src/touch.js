/* ============================================================
 * Escape A÷ · game/src/touch.js —— 小游戏触屏控件层 + 键位布局调试
 *
 * 在 canvas 上叠一层 DOM 虚拟控件：万向摇杆移动 + 动作键。
 * 摇杆是**模拟量**：角度 = 移动方向（360° 万向），推杆幅度 = 油门
 * （带死区防手心误触），外圈速度环实时显示；向量汇进 U.Input.setStick →
 * moveVec，与键盘共用键位表，打乱事件按同一张方向表旋转向量；横版上推跳、
 * 下拉下穿由 Input 按滞回合成 up/down。
 *
 * 每个控件独立绝对定位（中心锚点百分比 + 缩放），尺寸 / 间距乘 unit()（小屏一起缩），
 * 并让开 env(safe-area-inset-*) 那圈刘海与手势条。因此带一个**布局调试**：
 * 点右上「布局」（或 ?layout=1）进入编辑，手机上直接拖动改位置、滑杆调大小，
 * 存 localStorage 的 ea_bugfix_touchlayout（只碰 ea_bugfix_* 前缀，不进世界快照）。
 * 对外还给 render.js 一个 safeCenter()：控件没遮住的那块矩形，玩家就摆在那儿。
 * 调试键（判定箱 / 布局入口）只在 ?debug=1 ?layout=1 时挂出来，手机屏幕别塞调试件。
 * 检测到触屏（或 ?touch=1 强开）才挂出来；不碰存档进度、不碰世界状态。
 * ============================================================ */
"use strict";

window.GTOUCH = (() => {

  /* 按键表：code 必须是 U.Input.base 里已有的物理键名，不许发明新的。
   * kind 决定默认尺寸：act 大键 / mini 小键。def 为默认中心位置（见 defaultLayout）。 */
  const CONTROLS = [
    { id: "joy", kind: "joy", label: "摇杆" },
    { id: "fix", kind: "act", code: "KeyH", label: "修", title: "修掉挨着的甲虫（H）" },
    { id: "test", kind: "act", code: "KeyK", label: "测", title: "给挨着的甲虫盖测试（K）" },
    { id: "log", kind: "act", code: "KeyJ", label: "log", title: "丢 console.log（J）" },
    { id: "commit", kind: "act", code: "Space", label: "commit", title: "落 commit（空格）", cls: "commit" },
    { id: "revert", kind: "mini", code: "KeyU", label: "回", title: "回档（U）" },
    { id: "help", kind: "mini", code: "KeyO", label: "图", title: "图鉴（O）" },
    { id: "box", kind: "mini", code: "KeyB", label: "箱", title: "判定箱显隐（调试）", debug: true },
    { id: "menu", kind: "mini", code: "Escape", label: "菜", title: "菜单（Esc）" }
  ];
  const LAYOUT_KEY = "ea_bugfix_touchlayout";
  const SCALE_MIN = 0.6, SCALE_MAX = 1.8;
  /* 调试用控件（判定箱 / 布局入口）只在 ?debug=1 ?layout=1 时出现，别占手机屏幕 */
  const DBG = /[?&](debug|layout)=1/.test(window.location.search || "");

  const JOY_DEAD = 0.28;     // 死区（占可拉半径的比例），防手心搭上去就乱走
  const RING_R = 48;         // 速度环半径（viewBox 104 坐标）
  const RING_C = 2 * Math.PI * RING_R;

  let inited = false;
  let host = null;
  const els = {};            // id → DOM
  let layout = null;         // id → {x,y,s}（中心百分比 + 缩放）
  let saved = false;         // 是否有用户存过的布局（没有则跟随窗口尺寸重算默认）
  let editing = false;
  let sel = null;
  let bar = null, barName = null, barSize = null;

  /* ---------------- 布局存取 ---------------- */
  /* 控件基准尺寸：小屏按 vmin 一起缩，大屏封顶 1 —— 像素摆位与 CSS 用同一个 --gf-tk */
  function unit() {
    const w = host ? host.clientWidth || window.innerWidth : window.innerWidth;
    const h = host ? host.clientHeight || window.innerHeight : window.innerHeight;
    return U.clamp(Math.min(w, h) / 420, 0.72, 1);
  }
  /* 刘海 / 手势条：CSS 把 env() 落到 --gf-sa-*，这里读成像素，摆位别钻进安全区 */
  function sa(kind) {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gf-sa-" + kind));
    return isFinite(v) ? v : 0;
  }
  /* 默认摆位复刻「左下摇杆 + 右下 2x2 大键 + 上一排小键」，
   * 尺寸与间距都乘 unit()，再从安全区边缘推出像素，最后转百分比 —— 任何屏幕都不重叠、不出界。 */
  function defaultLayout() {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || window.innerHeight;
    const u = unit(), sl = sa("left"), sr = sa("right"), sb = sa("bottom");
    const px = (x, y) => ({ x: x / W * 100, y: y / H * 100, s: 1 });
    const rowB = H - sb - 38 * u, rowA = H - sb - 100 * u, rowMini = H - sb - 151 * u;
    const colB = W - sr - 43 * u, colA = W - sr - 115 * u;
    /* 小键一排：调试开关关掉「箱」后剩 3 个，整体右移收拢，别留一个空位 */
    const mini = DBG ? [158, 115, 72, 29] : [122, 79, 36];
    return {
      joy: px(sl + 64 * u, H - sb - 64 * u),
      fix: px(colA, rowA), test: px(colB, rowA),
      log: px(colA, rowB), commit: px(colB, rowB),
      revert: px(W - sr - mini[0] * u, rowMini), help: px(W - sr - mini[1] * u, rowMini),
      box: px(W - sr - (DBG ? mini[2] : 72) * u, rowMini), menu: px(W - sr - mini[mini.length - 1] * u, rowMini)
    };
  }
  function loadLayout() {
    const def = defaultLayout();
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null"); } catch (e) { raw = null; }
    if (!raw || typeof raw !== "object") return def;
    saved = true;
    for (const c of CONTROLS) {
      const v = raw[c.id];
      if (v && isFinite(v.x) && isFinite(v.y) && isFinite(v.s)) {
        def[c.id] = { x: U.clamp(v.x, 0, 100), y: U.clamp(v.y, 0, 100), s: U.clamp(v.s, SCALE_MIN, SCALE_MAX) };
      }
    }
    return def;
  }
  function persist() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); saved = true; } catch (e) { /* 隐私模式等：忽略 */ }
  }
  function applyOne(id) {
    const el = els[id], v = layout[id];
    if (!el || !v) return;
    el.style.left = v.x + "%";
    el.style.top = v.y + "%";
    el.style.transform = "translate(-50%,-50%) scale(" + v.s + ")";
    safeBox = null;
  }
  function applyAll() { for (const c of CONTROLS) applyOne(c.id); }

  /* ---------------- 视野安全区 ----------------
   * 控件占掉左下 / 右下一块，玩家搁在画面正中就会被按键压住。
   * 这里算「没被控件遮住的矩形」的中心，render.js 把玩家摆到那儿。
   * 只在布局 / 尺寸变化后重算一次，逐帧读会拖慢合成。 */
  let safeBox = null;
  function safeCenter() {
    if (!inited || editing) return null;
    if (safeBox) return safeBox;
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return null;
    let left = 0, right = W, top = H;
    for (const c of CONTROLS) {
      const el = els[c.id], v = layout && layout[c.id];
      if (!el || !v || !el.offsetWidth) continue;      // 调试键没挂出来 / 弹窗收起时跳过
      const hw = el.offsetWidth * v.s / 2, hh = el.offsetHeight * v.s / 2;
      const x = v.x / 100 * W, y = v.y / 100 * H;
      top = Math.min(top, y - hh);
      if (c.kind === "joy") left = Math.max(left, x + hw);
      else right = Math.min(right, x - hw);
    }
    if (right <= left) { left = 0; right = W; }        // 横屏挤到重叠时不硬抠，退回整幅宽
    safeBox = { x: (left + right) / 2, y: Math.max(0, top) / 2, w: right - left, h: Math.max(0, top) };
    return safeBox;
  }

  /* ---------------- 控件 ---------------- */
  function makeBtn(def) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gf-tbtn gf-" + def.kind + (def.cls ? " gf-" + def.cls : "");
    b.textContent = def.label;
    if (def.title) b.title = def.title;      // 桌面 ?touch=1 调试时能看懂
    b.addEventListener("pointerdown", e => {
      if (editing) return;                   // 编辑模式下只拖拽，不触发按键
      e.preventDefault();                    // 不触发兼容鼠标事件，也不让页面滚动 / 双击缩放
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      b.classList.add("gf-hold");
      if (window.BUGFIX) window.BUGFIX.key(def.code);
    });
    const release = () => {
      b.classList.remove("gf-hold");
      if (!editing && window.BUGFIX) window.BUGFIX.keyUp(def.code);
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
      if (editing || joyId != null) return;   // 编辑模式下摇杆也只拖拽
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

  /* ---------------- 布局编辑（拖拽 / 缩放） ---------------- */
  function select(id) {
    sel = id;
    for (const c of CONTROLS) if (els[c.id]) els[c.id].classList.toggle("gf-sel", c.id === id);
    const def = CONTROLS.filter(c => c.id === id)[0];
    if (barName) barName.textContent = def ? def.label : id;
    if (barSize) barSize.value = Math.round(layout[id].s * 100);
  }
  function wireDrag(el, id) {
    let pid = null, sx = 0, sy = 0, ox = 0, oy = 0;
    el.addEventListener("pointerdown", e => {
      if (!editing) return;
      e.preventDefault();
      select(id);
      pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (err) {}
      sx = e.clientX; sy = e.clientY; ox = layout[id].x; oy = layout[id].y;
    });
    el.addEventListener("pointermove", e => {
      if (!editing || e.pointerId !== pid) return;
      const r = host.getBoundingClientRect();
      const hw = (el.offsetWidth * layout[id].s / 2) / r.width * 100;
      const hh = (el.offsetHeight * layout[id].s / 2) / r.height * 100;
      layout[id].x = U.clamp(ox + (e.clientX - sx) / r.width * 100, hw, 100 - hw);
      layout[id].y = U.clamp(oy + (e.clientY - sy) / r.height * 100, hh, 100 - hh);
      applyOne(id);
    });
    const up = e => { if (e.pointerId === pid) pid = null; };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }
  function setEditing(on) {
    editing = !!on;
    safeBox = null;
    if (host) host.classList.toggle("gf-edit", editing);
    if (bar) bar.style.display = editing ? "flex" : "none";
    if (editing) {
      U.Input.setStick(null);                 // 编辑时别让摇杆继续走
      select(sel || "joy");
    } else {
      for (const c of CONTROLS) els[c.id].classList.remove("gf-sel");
      persist();                              // 完成即保存，手机上不用额外点
    }
  }
  function buildBar() {
    bar = document.createElement("div");
    bar.id = "gf-tlayout-bar";
    bar.innerHTML =
      '<span id="gf-tl-name"></span>' +
      '<label class="gf-tl-size">大小<input id="gf-tl-size" type="range" min="60" max="180" step="5"></label>' +
      '<button type="button" id="gf-tl-reset">重置此键</button>' +
      '<button type="button" id="gf-tl-save">保存</button>' +
      '<button type="button" id="gf-tl-all">全部重置</button>' +
      '<button type="button" id="gf-tl-done">完成</button>';
    barName = bar.querySelector("#gf-tl-name");
    barSize = bar.querySelector("#gf-tl-size");
    barSize.addEventListener("input", () => {
      if (!sel) return;
      layout[sel].s = U.clamp(+barSize.value / 100, SCALE_MIN, SCALE_MAX);
      applyOne(sel);
    });
    bar.querySelector("#gf-tl-reset").addEventListener("click", () => {
      if (!sel) return;
      layout[sel] = defaultLayout()[sel];
      applyOne(sel); select(sel);
    });
    bar.querySelector("#gf-tl-save").addEventListener("click", persist);
    bar.querySelector("#gf-tl-all").addEventListener("click", () => {
      layout = defaultLayout(); saved = false;
      try { localStorage.removeItem(LAYOUT_KEY); } catch (e) {}
      applyAll(); if (sel) select(sel);
    });
    bar.querySelector("#gf-tl-done").addEventListener("click", () => setEditing(false));
    /* 滑杆 / 按钮自己吃掉指针，别被当成拖拽 */
    bar.addEventListener("pointerdown", e => e.stopPropagation());
    return bar;
  }

  function build() {
    host = document.createElement("div");
    host.id = "gf-touch";
    for (const c of CONTROLS) {
      if (c.debug && !DBG) continue;         // 调试键不进手机布局
      const el = c.kind === "joy" ? makeJoy() : makeBtn(c);
      el.dataset.tid = c.id;
      els[c.id] = el;
      wireDrag(el, c.id);
      host.appendChild(el);
    }
    if (DBG) {                               // 「布局」入口也是调试工具，平时别占右上角
      const entry = document.createElement("button");
      entry.type = "button";
      entry.id = "gf-tlayout";
      entry.textContent = "布局";
      entry.title = "调试：编辑触屏键位布局（拖动 / 调大小）";
      entry.addEventListener("pointerdown", e => { e.preventDefault(); setEditing(!editing); });
      host.appendChild(entry);
      host.appendChild(buildBar());
    }
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
    host.style.setProperty("--gf-tk", unit().toFixed(3));   // CSS 尺寸与 JS 摆位共用一个基准
    layout = loadLayout();
    applyAll();
    /* 没存过布局时跟随窗口尺寸重算默认摆位（转屏 / 改窗口不跑偏） */
    window.addEventListener("resize", () => {
      if (host) host.style.setProperty("--gf-tk", unit().toFixed(3));
      safeBox = null;
      if (!saved && !editing) { layout = defaultLayout(); applyAll(); }
    });
    const note = document.getElementById("gf-touch-note");
    if (note) note.style.display = "";       // 标题页那句触屏说明
    if (/[?&]layout=1/.test(window.location.search)) setEditing(true);
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

  return { init, enable, setEditing, safeCenter, get editing() { return editing; }, get layout() { return layout; } };
})();
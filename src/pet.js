/* ============================================================
 * Escape A÷ · src/pet.js —— 桌宠 Clawd
 *
 * Clawd 是 Claude Code 的橙色像素吉祥物。这里用 Canvas 逐像素画它（零素材），
 * 像素图来自终端里的块字符版本：
 *       ▐▛███▜▌
 *      ▝▜█████▛▘
 *        ▘▘ ▝▝
 * 每个字符拆成 2×2 象限，终端字符高宽比约 2:1，所以一个"像素"是 1 宽 2 高。
 *
 * 状态分两层：
 *   · 持久状态在 SYS.state.pet（随存档走）：vis / owned / mood / place / x,y / todo；
 *   · 动画状态只在本模块：位置插值、姿势、气泡、粒子（读档后从 place 重新落位）。
 * 剧本通过 PET / TODO 两种节点驱动它（见 STORY_GUIDE.md）。
 * ============================================================ */
"use strict";

const CLAWD = (() => {
  /* ---------------- 像素图 ---------------- */
  const BODY = [
    "...############...",
    "...##.######.##...",
    ".################.",
    "...############...",
    "....#.#....#.#...."
  ];
  const LEGS_B = ".....#.#..#.#.....";        // 走路第二帧
  const ARMS_IN = "...############...";       // 害怕时把手缩回去
  const EYES = [5, 12];                       // 眼睛所在列（第 1 行）
  const P = 6;                                // 像素宽；高 = 2P
  const CW = 150, CH = 112;                   // 画布尺寸
  const FOOT = [CW / 2, CH - 8];              // 画布里的脚底中心

  const C = { body: "#D97757", shade: "#C2684B", leg: "#A9553B", hi: "#E99A7C", eye: "#1A1210" };

  const CORNER = [1452, 668];                 // 默认窝：右下角、文本框上方
  function anchor(name) {
    const a = typeof BACKDROPS !== "undefined" && BACKDROPS.anchors[name];
    return a ? a.slice() : CORNER.slice();
  }

  const PAT_LINES = ["✻ Purring…", "(◕ᴗ◕)", "⎿ 摸摸 +1", "✻ Wiggling…", "♪", "✻ Clauding…"];
  const DURATION = { happy: 1800, scared: 2600, working: 2400, sleep: 5000, idle: 0 };
  const IDLE_SLEEP_MS = 45000;

  /* ---------------- DOM ---------------- */
  let el = null, ctx = null, bubble = null, todoBox = null;
  let pos = null, target = null, walkSpeed = 260;
  let pose = "idle", poseUntil = 0;
  let pop = null;                 // { t0 } 原地冒出来
  let emerge = null;              // { t0, from, floor } 从 403 的 0 里挤出来
  let bubbleUntil = 0, todoUntil = 0, todoPinned = false;
  let lastInput = performance.now();
  let blinkAt = 0, lookX = 0, lookUntil = 0;
  let drag = null;
  const particles = [];

  function S() {
    const st = typeof SYS !== "undefined" ? SYS.state : null;
    if (!st) return null;
    if (!st.pet) st.pet = blank();
    return st.pet;
  }
  function blank() { return { vis: false, owned: false, mood: 5, place: "corner", x: null, y: null, todo: [] }; }

  function home() {
    const s = S();
    if (s.place === "desk") return anchor("desk");
    if (s.x !== null && s.y !== null) return [s.x, s.y];
    return CORNER.slice();
  }

  function build() {
    const stage = document.getElementById("stage");
    el = document.createElement("canvas");
    el.id = "pet"; el.width = CW; el.height = CH;
    el.title = "Clawd";
    stage.appendChild(el);
    ctx = el.getContext("2d");
    bubble = document.createElement("div");
    bubble.id = "petBubble";
    stage.appendChild(bubble);
    todoBox = document.createElement("div");
    todoBox.id = "petTodo";
    stage.appendChild(todoBox);

    el.addEventListener("pointerdown", e => {
      e.stopPropagation();
      drag = { sx: e.clientX, sy: e.clientY, ox: pos[0], oy: pos[1], moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", e => {
      if (!drag) return;
      const k = stage.getBoundingClientRect().width / 1600;
      const dx = (e.clientX - drag.sx) / k, dy = (e.clientY - drag.sy) / k;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      if (!S().owned) return;                   // 还不是你的桌宠时，只能摸不能拖
      drag.moved = true;
      pos = [clamp(drag.ox + dx, 60, 1540), clamp(drag.oy + dy, 140, 880)];
      target = null;
    });
    el.addEventListener("pointerup", () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.moved) { const s = S(); s.x = Math.round(pos[0]); s.y = Math.round(pos[1]); s.place = "corner"; }
      else pat();
    });

    const wake = () => { lastInput = performance.now(); };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    requestAnimationFrame(loop);
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- 跨周目记忆 ----------------
   * 结局 / 彩蛋的记录由 SYS 持久化（localStorage 的 ea_endings / ea_eggs_found）。
   * Clawd 记得你打过结局：新周目第一次获得它时会说 ✻ Resuming session…
   * 解锁的彩蛋会变成它身上的小配件（自动佩戴，不需要手动换）。 */
  function memory() {
    const endings = (typeof SYS !== "undefined" && SYS.unlockedEndings) ? SYS.unlockedEndings() : [];
    const eggs = (typeof SYS !== "undefined" && SYS.unlockedEggs) ? SYS.unlockedEggs() : {};
    const eggN = Object.keys(eggs).filter(k => eggs[k]).length;
    return { endings, eggN };
  }

  /** 让 Clawd 看向某个方向：x ∈ [-1, 1]（负数看左，正数看右）。 */
  function lookAt(x, ms) {
    lookX = clamp(x, -1, 1) * 0.9;
    lookUntil = performance.now() + (ms || 3000);
    lastInput = performance.now();
  }

  /* ---------------- 互动 ---------------- */
  function pat() {
    const s = S();
    setPose("happy");
    say(PAT_LINES[Math.floor(Math.random() * PAT_LINES.length)], 1600);
    hearts(3);
    if (typeof AUDIO !== "undefined") AUDIO.sfx("pat");
    // 每个场景只有第一次摸摸会涨心情，免得连点刷数值
    const scene = typeof ENGINE !== "undefined" ? ENGINE.debug().scene : "";
    if (s.owned && s.patScene !== scene) { s.patScene = scene; addMood(1); }
  }
  function addMood(d) {
    const s = S();
    s.mood = clamp(s.mood + d, 0, 10);
    if (d > 0) hearts(2);
  }
  function setPose(name, ms) {
    pose = name;
    poseUntil = performance.now() + (ms || DURATION[name] || 2000);
  }
  function say(text, ms) {
    bubble.textContent = text;
    bubbleUntil = performance.now() + (ms || 2600);
  }
  function hearts(n) {
    for (let i = 0; i < n; i++) particles.push({ kind: "heart", x: FOOT[0] + (Math.random() - 0.5) * 50, y: FOOT[1] - 50, vy: 30 + Math.random() * 20, life: 1.2 });
  }

  /* ---------------- 剧本节点 ----------------
   * PET(op, arg)：show(arg=corner|desk|door) / hide / own / mood(arg=±d) / anim(arg=姿势) / say(arg=文本） */
  function apply(nd) {
    const s = S();
    const now = performance.now();
    switch (nd.op) {
      case "show": {
        s.vis = true;
        const where = nd.arg || "corner";
        target = null;
        if (where === "door") {
          // 从 403 的 0 里挤出来，落地后自己走回窝里
          s.place = "corner";
          const from = anchor("zero");
          pos = from.slice();
          emerge = { t0: now, from, floor: anchor("floor") };
        } else {
          s.place = where === "desk" ? "desk" : "corner";
          pos = home();
          pop = { t0: now };
        }
        break;
      }
      case "hide": s.vis = false; emerge = null; break;
      case "own":
        s.owned = true; s.vis = true;
        if (s.place !== "corner") { s.place = "corner"; target = home(); }
        if (typeof ENGINE !== "undefined") ENGINE.toast("✻ 获得桌宠：Clawd");
        if (typeof AUDIO !== "undefined") AUDIO.sfx("ding");
        hearts(4);
        // 打过结局的周目：Clawd 记得上一次会话
        if (memory().endings.length) {
          setPose("happy", 1500);
          say("✻ Resuming session…", 3400);
        }
        break;
      case "mood": addMood(+nd.arg || 0); break;
      case "anim": setPose(nd.arg); break;
      case "say": say(nd.arg); break;
    }
  }

  /* TODO(op, id, text)：add / done —— 仿 Claude Code 的 TodoWrite */
  function todo(nd) {
    const s = S();
    if (nd.op === "add") {
      if (!s.todo.some(it => it.id === nd.id)) s.todo.push({ id: nd.id, text: nd.text, done: false });
    } else if (nd.op === "done") {
      const it = s.todo.find(x => x.id === nd.id);
      if (it) it.done = true;
    }
    renderTodo();
    todoUntil = performance.now() + 5000;
  }
  function renderTodo() {
    const s = S();
    todoBox.innerHTML = "";
    const h = document.createElement("div");
    h.className = "pt-head"; h.textContent = "✻ Clawd · Todos";
    todoBox.appendChild(h);
    if (!s.todo.length) {
      const e = document.createElement("div"); e.className = "pt-item pt-empty"; e.textContent = "（还没有待办）";
      todoBox.appendChild(e);
    }
    for (const it of s.todo) {
      const d = document.createElement("div");
      d.className = "pt-item" + (it.done ? " done" : "");
      d.textContent = (it.done ? "☒ " : "☐ ") + it.text;
      todoBox.appendChild(d);
    }
  }
  function toggleTodo() {
    if (!S().owned) return false;
    todoPinned = !todoPinned;
    if (todoPinned) renderTodo();
    todoUntil = 0;
    return true;
  }

  /* 问 Clawd：转圈一会儿再给答案（engine 的 H 键调用） */
  const VERBS = ["Clauding", "Pondering", "Noodling", "Percolating", "Puttering", "琢磨", "酝酿", "翻找上下文"];
  function verb() { return VERBS[Math.floor(Math.random() * VERBS.length)]; }
  function think() { setPose("working", 1400); return verb(); }

  /* ---------------- 主循环 ---------------- */
  let lastT = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const s = S();
    const show = !!(s && s.vis && typeof ENGINE !== "undefined" && ENGINE.started);
    el.style.display = show ? "block" : "none";
    bubble.style.display = show && now < bubbleUntil ? "block" : "none";
    const todoOn = show && s.owned && (todoPinned || now < todoUntil);
    todoBox.style.display = todoOn ? "block" : "none";
    if (!show) return;

    if (!pos) pos = home();
    // 读档 / 没有动画时，慢慢走回该在的地方
    if (!emerge && !drag) {
      const h = home();
      if (!target && Math.hypot(h[0] - pos[0], h[1] - pos[1]) > 2) target = h;
    }
    let walking = false, scale = 1, sq = 1;
    if (emerge) {
      const a = (now - emerge.t0) / 1000;
      if (a < 0.5) {                          // 从洞里一点点挤出来
        scale = a / 0.5;
        pos = emerge.from.slice();
      } else if (a < 1.05) {                  // 掉到地上
        const k = (a - 0.5) / 0.55;
        pos = [emerge.from[0], emerge.from[1] + (emerge.floor[1] - emerge.from[1]) * k * k];
      } else if (a < 1.3) {                   // 落地压扁一下
        pos = emerge.floor.slice();
        sq = 1 - 0.25 * Math.sin((a - 1.05) / 0.25 * Math.PI);
      } else if (a < 2.2) {
        pos = emerge.floor.slice();
        if (pose === "idle") setPose("scared", 900);
      } else {
        emerge = null;
        target = home();
      }
    } else if (pop) {
      const a = (now - pop.t0) / 350;
      scale = a >= 1 ? 1 : 1 - Math.pow(1 - a, 3) + Math.sin(a * Math.PI) * 0.15;
      if (a >= 1) pop = null;
    }
    if (target && !emerge && !drag) {
      const dx = target[0] - pos[0], dy = target[1] - pos[1], d = Math.hypot(dx, dy);
      const step = walkSpeed * dt;
      if (d <= step) { pos = target.slice(); target = null; }
      else { pos = [pos[0] + dx / d * step, pos[1] + dy / d * step]; walking = true; lookX = Math.sign(dx) * 0.35; lookUntil = now + 400; }
    }

    el.style.left = Math.round(pos[0] - FOOT[0]) + "px";
    el.style.top = Math.round(pos[1] - FOOT[1]) + "px";
    bubble.style.left = Math.round(pos[0]) + "px";
    bubble.style.top = Math.round(pos[1] - 84) + "px";

    // 当前姿势：剧本指定的 > 403 吓到 > 走路 > 睡着 > 发呆
    let p = now < poseUntil ? pose : "idle";
    const e403 = typeof ART !== "undefined" && ART.FX.e403 && !ART.FX.e403.off;
    if (p === "idle" && e403) p = "scared";
    if (p === "idle" && walking) p = "walk";
    if (p === "idle" && now - lastInput > IDLE_SLEEP_MS) p = "sleep";
    draw(now / 1000, p, scale, sq, dt);
  }

  function draw(t, p, scale, sq, dt) {
    ctx.clearRect(0, 0, CW, CH);
    const glitch = typeof SYS !== "undefined" && SYS.state.vis && SYS.state.vis.glitch;
    let dx = 0, dy = 0;
    if (p === "happy") dy = -Math.abs(Math.sin(t * 9)) * 9;
    else if (p === "walk") dy = -Math.abs(Math.sin(t * 14)) * 2.5;
    else if (p === "scared") dx = (Math.random() - 0.5) * 2.6;
    else if (p === "sleep") dy = Math.sin(t * 1.4) * 1;
    else dy = Math.sin(t * 2.2) * 1.2;
    if (glitch && Math.random() < 0.2) dx += (Math.random() - 0.5) * 10;

    const rows = BODY.slice();
    if (p === "walk" && Math.floor(t * 8) % 2) rows[4] = LEGS_B;
    if (p === "scared" || p === "sleep") rows[2] = ARMS_IN;
    if (p === "happy" && Math.floor(t * 6) % 2) { rows[1] = ".##" + rows[1].slice(3); rows[2] = "..." + rows[2].slice(3); }

    const bw = 18 * P, bh = 5 * 2 * P;
    ctx.save();
    ctx.translate(FOOT[0] + dx, FOOT[1] + dy);
    ctx.scale(scale / sq ** 0.5, scale * sq);
    const ox = -bw / 2, oy = -bh;
    // 影子
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(0, 2 - dy, bw * 0.36, 5, 0, 0, Math.PI * 2); ctx.fill();
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < 18; c++) {
        if (rows[r][c] !== "#") continue;
        ctx.fillStyle = r === 4 ? C.leg : r === 3 ? C.shade : C.body;
        ctx.fillRect(ox + c * P, oy + r * 2 * P, P + 0.5, 2 * P + 0.5);
      }
    }
    ctx.fillStyle = C.hi;                    // 左上角一点高光
    ctx.fillRect(ox + 3 * P, oy, P * 2, P * 0.6);

    // 跨周目配件：打完一个结局→安全帽；彩蛋 2 个→围巾；彩蛋 4 个→鲸鱼挂件
    const mem = memory();
    if (mem.endings.length) {
      ctx.fillStyle = "#2E2A28";
      ctx.fillRect(ox + 5 * P, oy - 3 * P, 8 * P, 2.2 * P);
      ctx.fillRect(ox + 4 * P, oy - 1.1 * P, 10 * P, P * 0.9);
    }
    if (mem.eggN >= 2) {
      ctx.fillStyle = "#B33A2B";
      ctx.fillRect(ox + 3 * P, oy + 6 * P, 12 * P, P * 1.1);
      ctx.fillRect(ox + 14 * P, oy + 6.6 * P, P * 1.2, P * 2.2);
    }
    if (mem.eggN >= 4) {
      ctx.fillStyle = "#7FC7E8";
      ctx.fillRect(ox + 15 * P, oy + 8.4 * P, P * 0.9, P * 0.9);
      ctx.fillRect(ox + 15.6 * P, oy + 7.4 * P, P * 0.7, P * 0.9);
    }

    // 眼睛
    if (performance.now() > blinkAt + 120 && Math.random() < dt / 3.5) blinkAt = performance.now();
    if (performance.now() > lookUntil && Math.random() < dt / 5) { lookX = (Math.random() - 0.5) * 0.7; lookUntil = performance.now() + 1500; }
    const blink = performance.now() - blinkAt < 120;
    ctx.fillStyle = C.eye; ctx.strokeStyle = C.eye; ctx.lineCap = "square";
    for (const col of EYES) {
      const ex = ox + (col + (p === "idle" || p === "walk" ? lookX : 0)) * P, ey = oy + 2 * P;
      if (p === "happy") {
        ctx.lineWidth = P * 0.5;
        ctx.beginPath(); ctx.moveTo(ex - P * 0.15, ey + P * 1.3); ctx.lineTo(ex + P * 0.5, ey + P * 0.5); ctx.lineTo(ex + P * 1.15, ey + P * 1.3); ctx.stroke();
      } else if (p === "sleep" || blink) {
        ctx.fillRect(ex, ey + P * 1.3, P, P * 0.45);
      } else if (p === "scared") {
        ctx.fillRect(ex, ey - P * 1.2, P, P * 3.2);
      } else if (p === "working") {
        ctx.fillRect(ex, ey, P, P);
      } else {
        ctx.fillRect(ex, ey, P, 2 * P);
      }
    }
    ctx.restore();

    // 头顶：干活时的 ✻ 转圈 / 睡觉的 z
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (p === "working") {
      ctx.translate(FOOT[0], FOOT[1] - bh - 22 + dy);
      ctx.rotate(t * 5);
      ctx.fillStyle = `hsl(${18 + 10 * Math.sin(t * 6)},70%,62%)`;
      ctx.font = "bold 26px 'Segoe UI Symbol','Noto Sans SC',sans-serif";
      ctx.fillText("✻", 0, 0);
    } else if (p === "sleep") {
      ctx.fillStyle = "rgba(220,230,245,.8)";
      ctx.font = "bold 16px 'Consolas',monospace";
      const k = (t * 0.7) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.fillText("z", FOOT[0] + 40 + k * 14, FOOT[1] - bh - 4 - k * 26);
      ctx.globalAlpha = 1 - ((k + 0.5) % 1);
      ctx.fillText("Z", FOOT[0] + 46 + ((k + 0.5) % 1) * 14, FOOT[1] - bh - 4 - ((k + 0.5) % 1) * 26);
    }
    ctx.restore();

    // 粒子：小心心
    ctx.save();
    ctx.font = "16px 'Segoe UI Symbol',sans-serif"; ctx.textAlign = "center";
    for (const pt of particles) {
      pt.y -= pt.vy * dt; pt.life -= dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life));
      ctx.fillStyle = "#F0A57E";
      ctx.fillText("♥", pt.x, pt.y);
    }
    ctx.restore();
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else setTimeout(build, 0);
  }

  return {
    apply, todo, toggleTodo, think, say, lookAt,
    blank,
    get owned() { const s = S(); return !!(s && s.owned); },
    get mood() { const s = S(); return s ? s.mood : 5; },
    get lookX() { return lookX; }
  };
})();

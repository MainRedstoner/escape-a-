/* ============================================================
 * Escape A÷ · game/src/render.js —— Canvas 2D 渲染层
 *
 * 全部图形都是代码画的（零素材），只用世界状态做输入，不改状态。
 * 位置用指数平滑插值：逻辑 8 tick/秒，画面 60 fps，这样虫子不会一跳一跳。
 * 亮度 = WORLD.brightness()：1 实时观测 · 0 全黑 · 中间是「还记得」。
 * ============================================================ */
"use strict";

window.RENDER = (() => {

  let cv = null, ctx = null, dpr = 1;
  let TS = 40;                       // tile 像素
  let view = { w: 0, h: 0 };
  const cam = { x: 0, y: 0, init: false };
  const memo = {};                   // 渲染用的平滑位置缓存（不进快照）
  let fx = { shake: 0, red: 0, white: 0, glitch: 0 };
  let time = 0;

  function attach(canvas) {
    cv = canvas; ctx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }
  function resize() {
    if (!cv) return;
    const box = cv.parentNode ? cv.parentNode.getBoundingClientRect() : { width: 960, height: 600 };
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(box.width)), h = Math.max(240, Math.floor(box.height));
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    view = { w, h };
  }
  function kick(power) { fx.shake = Math.max(fx.shake, power); }
  function flash(kind, power) { fx[kind] = Math.max(fx[kind], power); }

  /* ---------------- 主入口 ---------------- */
  function draw(W, dt) {
    if (!ctx) return;
    time += dt;
    const want = Math.max(26, Math.min(56, Math.floor(view.w / 24)));
    TS = want;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, view.w, view.h);

    const cols = Math.ceil(view.w / TS) + 2, rowsN = Math.ceil(view.h / TS) + 2;
    const targetX = (W.player.x + 0.5) * TS - view.w / 2;
    const targetY = (W.player.y + 0.5) * TS - view.h / 2;
    const maxX = Math.max(0, W.w * TS - view.w), maxY = Math.max(0, W.h * TS - view.h);
    const tx = U.clamp(targetX, 0, maxX), ty = U.clamp(targetY, 0, maxY);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    const k = Math.min(1, dt * 7);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    const sh = fx.shake > 0.01 ? fx.shake : 0;
    fx.shake *= Math.pow(0.001, dt); fx.red *= Math.pow(0.2, dt);
    fx.white *= Math.pow(0.05, dt); fx.glitch *= Math.pow(0.02, dt);
    const ox = -cam.x + (sh ? (Math.random() - 0.5) * 18 * sh : 0);
    const oy = -cam.y + (sh ? (Math.random() - 0.5) * 18 * sh : 0);

    ctx.save();
    ctx.translate(Math.round(ox), Math.round(oy));

    const x0 = Math.floor(cam.x / TS) - 1, y0 = Math.floor(cam.y / TS) - 1;
    drawTiles(W, x0, y0, cols, rowsN);
    drawHazardsBack(W, x0, y0, cols, rowsN);
    drawEntities(W);
    drawPlayer(W);
    drawHazardsFront(W);
    drawOverlays(W);
    ctx.restore();

    drawScreenFx(W);
  }

  /* ---------------- 地块 ---------------- */
  function drawTiles(W, x0, y0, cols, rowsN) {
    for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
      const x = x0 + i, y = y0 + j;
      if (!WORLD.inb(W, x, y)) { continue; }
      const b = WORLD.brightness(W, x, y);
      const seen = !!W.seen[WORLD.idx(W, W.layer, x, y)];
      if (b <= 0) {
        /* 记忆过期：只留一点点地形的残影（关卡可调，最阴的关是 0） */
        const raw0 = WORLD.tile(W, x, y);
        if (raw0 === "o") { commitMark(W, x, y, 0); continue; }        // commit 点穿墙可见
        if (raw0 === "P") { prMark(W, x, y, 0); continue; }
        if (seen && W.cfg.ghost > 0 && tileLike(W, x, y)) ghostTile(W, x, y);
        continue;
      }
      const raw = WORLD.tile(W, x, y);
      const shown = WORLD.look(W, x, y);
      if (shown === "_") continue;                 // 空气：什么都不画
      ctx.globalAlpha = b >= 1 ? 1 : 0.35 + 0.55 * b;
      if (b < 1 && memExpiring(W, x, y)) ctx.globalAlpha *= 0.75 + 0.25 * Math.sin(time * 22);
      paintTile(W, x, y, shown, b >= 1);
      /* 被探针看穿的地块：画一圈红虚线，说明「真相和刚才看到的不一样」 */
      if (b >= 1 && W.reveal[WORLD.idx(W, W.layer, x, y)] > 0 && raw !== shown) trickTile(W, x, y, raw);
      ctx.globalAlpha = 1;
      if (shown === "o") commitMark(W, x, y, b);
      if (shown === "P" || shown === "!") prMark(W, x, y, b);
    }
  }
  function tileLike(W, x, y) { return WORLD.solidAt(W, x, y) || WORLD.isPitAt(W, x, y); }
  function memExpiring(W, x, y) { const l = WORLD.memLeft(W, x, y); return l > 0 && l < 10; }

  function ghostTile(W, x, y) {
    const px = x * TS, py = y * TS;
    ctx.globalAlpha = W.cfg.ghost;
    if (WORLD.isPitAt(W, x, y)) { ctx.fillStyle = "#0a0507"; ctx.fillRect(px, py, TS, TS); }
    else { ctx.fillStyle = "#141a22"; ctx.fillRect(px, py, TS, TS); ctx.strokeStyle = "#1f2733"; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1); }
    ctx.globalAlpha = 1;
  }

  function paintTile(W, x, y, ch, live) {
    const px = x * TS, py = y * TS;
    const n = U.hash2(x, y, W.seed);
    switch (ch) {
      case "#": case "\"": case "w": {
        const base = 26 + Math.floor(n * 10);
        ctx.fillStyle = "rgb(" + (base + 12) + "," + (base + 8) + "," + (base + 2) + ")";
        ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.fillRect(px, py + TS * 0.46, TS, 2);
        ctx.fillRect(px + TS * (n > 0.5 ? 0.3 : 0.62), py, 2, TS * 0.46);
        ctx.fillStyle = "rgba(150,180,140,.20)";
        for (let l = 0; l < 3; l++) {
          const ly = py + 4 + l * (TS - 8) / 3;
          ctx.fillRect(px + 3, ly, (TS - 8) * (0.35 + U.hash2(x, y * 3 + l, W.seed) * 0.6), 1.6);
        }
        if (ch === "w") { ctx.strokeStyle = "rgba(255,220,120,.5)"; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, TS - 4, TS - 4); }
        break;
      }
      case "|": {
        ctx.fillStyle = "#2a2418"; ctx.fillRect(px, py, TS, TS);
        ctx.strokeStyle = "#c9a227"; ctx.lineWidth = 3; ctx.strokeRect(px + 3, py + 3, TS - 6, TS - 6);
        ctx.fillStyle = "#c9a227"; ctx.font = "bold " + Math.floor(TS * 0.5) + "px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("T", px + TS / 2, py + TS / 2 + 1);
        break;
      }
      case "~": case "&": {
        ctx.fillStyle = "#04060a"; ctx.fillRect(px, py, TS, TS);
        ctx.strokeStyle = "rgba(90,70,50,.55)"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py + 3); ctx.lineTo(px + TS * 0.4, py); ctx.lineTo(px + TS, py + 4);
        ctx.stroke();
        break;
      }
      case "+": {
        ctx.fillStyle = "#07090d"; ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = "#3a3320"; ctx.fillRect(px, py, TS, Math.max(4, TS * 0.18));
        ctx.fillStyle = "rgba(255,230,150,.18)"; ctx.fillRect(px, py, TS, 2);
        break;
      }
      case "x": {
        floor(W, x, px, py, n);
        ctx.fillStyle = "#9fd8ff"; ctx.globalAlpha *= 0.75;
        for (let i2 = 0; i2 < 5; i2++) {
          const gx = px + TS * U.hash2(x + i2, y, 7), gy = py + TS * U.hash2(x, y + i2, 11);
          ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 5, gy + 3); ctx.lineTo(gx + 2, gy + 7); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "l": {
        floor(W, x, px, py, n);
        ctx.fillStyle = "#10161c"; ctx.fillRect(px + TS * 0.15, py + TS * 0.1, TS * 0.7, TS * 0.6);
        const glow = 0.55 + 0.35 * Math.sin(time * 2 + x);
        ctx.fillStyle = "rgba(120,255,170," + glow + ")";
        ctx.fillRect(px + TS * 0.19, py + TS * 0.14, TS * 0.62, TS * 0.52);
        ctx.fillStyle = "rgba(0,40,20,.8)";
        for (let l = 0; l < 4; l++) ctx.fillRect(px + TS * 0.23, py + TS * (0.2 + l * 0.11), TS * 0.5 * U.hash2(x, y + l, 3), 2);
        ctx.fillStyle = "#10161c"; ctx.fillRect(px + TS * 0.4, py + TS * 0.7, TS * 0.2, TS * 0.2);
        break;
      }
      case "t": {
        floor(W, x, px, py, n);
        const d = W.dyn[WORLD.keyOf(W.layer, x, y)];
        ctx.strokeStyle = "rgba(255,180,60,.85)"; ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, TS - 4, TS - 4);
        ctx.fillStyle = "rgba(255,180,60,.9)"; ctx.font = Math.floor(TS * 0.3) + "px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("TODO", px + TS / 2, py + TS / 2);
        if (d && d.todoT != null) {
          ctx.fillStyle = "rgba(255,60,40,.9)";
          ctx.fillRect(px + 3, py + TS - 6, (TS - 6) * (1 - d.todoT / (2.5 * WORLD.STEP_HZ)), 3);
        }
        break;
      }
      case "s": {
        floor(W, x, px, py, n);
        ctx.strokeStyle = "rgba(220,220,220,.5)"; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px + 4, py + TS * 0.3); ctx.lineTo(px + TS * 0.5, py + TS * 0.55); ctx.lineTo(px + TS - 5, py + TS * 0.35);
        ctx.moveTo(px + TS * 0.45, py + 4); ctx.lineTo(px + TS * 0.5, py + TS * 0.55); ctx.lineTo(px + TS * 0.35, py + TS - 4);
        ctx.stroke();
        break;
      }
      case "d": {
        floor(W, x, px, py, n);
        const no = W.deps.findIndex(s => s.x === x && s.y === y) + 1;
        const done = W.dyn[WORLD.keyOf(W.layer, x, y)] && W.dyn[WORLD.keyOf(W.layer, x, y)].depHit;
        ctx.strokeStyle = done ? "rgba(120,255,160,.9)" : "rgba(140,190,255,.8)";
        ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(px + TS / 2, py + TS / 2, TS * 0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = done ? "#8effb6" : "#9cc8ff"; ctx.font = "bold " + Math.floor(TS * 0.36) + "px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("" + no, px + TS / 2, py + TS / 2 + 1);
        break;
      }
      case "b": {
        floor(W, x, px, py, n);
        let dir = "e";
        for (const s of W.belts) if (s.x === x && s.y === y) dir = s.dir;
        ctx.fillStyle = "rgba(255,210,90,.75)";
        const cx2 = px + TS / 2, cy2 = py + TS / 2, a = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 }[dir];
        ctx.save(); ctx.translate(cx2, cy2); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-TS * 0.22, -TS * 0.16); ctx.lineTo(TS * 0.2, 0); ctx.lineTo(-TS * 0.22, TS * 0.16); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case "j": {
        floor(W, x, px, py, n);
        ctx.fillStyle = "rgba(120,255,220,.8)";
        ctx.fillRect(px + 4, py + TS - 8, TS - 8, 4);
        ctx.beginPath(); ctx.moveTo(px + TS / 2 - 7, py + TS - 14); ctx.lineTo(px + TS / 2, py + TS * 0.35); ctx.lineTo(px + TS / 2 + 7, py + TS - 14); ctx.closePath(); ctx.fill();
        break;
      }
      case "m": {
        floor(W, x, px, py, n);
        ctx.fillStyle = "rgba(190,110,255,.85)";
        ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2, TS * 0.22, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "g": case "C": {
        floor(W, x, px, py, n);
        ctx.strokeStyle = ch === "g" ? "rgba(160,200,255,.8)" : "rgba(255,90,70,.85)";
        ctx.lineWidth = 2; ctx.strokeRect(px + 6, py + 6, TS - 12, TS - 12);
        break;
      }
      case "o": {
        floor(W, x, px, py, n);
        break;
      }
      case "!": {
        /* 假 PR：由 prMark 画成和 PR 一模一样 */
        floor(W, x, px, py, n);
        break;
      }
      default:
        floor(W, x, px, py, n);
    }
  }

  function floor(W, x, px, py, n) {
    const g = 22 + Math.floor(n * 8);
    ctx.fillStyle = "rgb(" + (g + 4) + "," + (g + 2) + "," + g + ")";
    ctx.fillRect(px, py, TS, TS);
    ctx.fillStyle = "rgba(255,255,255,.022)";
    ctx.fillRect(px, py, TS, 1);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(px, py + TS - 1, TS, 1);
    if (n > 0.82) {
      ctx.fillStyle = "rgba(150,120,90,.18)";
      ctx.fillRect(px + TS * 0.2, py + TS * 0.4, TS * 0.5, 2);
    }
    if (n < 0.12) {
      ctx.fillStyle = "rgba(120,160,120,.14)";
      ctx.font = Math.floor(TS * 0.3) + "px monospace";
      ctx.textAlign = "left";
      ctx.fillText("//", px + TS * 0.25, py + TS * 0.6);
    }
  }

  function trickTile(W, x, y, raw) {
    const px = x * TS, py = y * TS;
    ctx.strokeStyle = "rgba(255,80,80,.9)"; ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(px + 2, py + 2, TS - 4, TS - 4);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,120,120,.95)"; ctx.font = "bold " + Math.floor(TS * 0.32) + "px monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(raw === "&" ? "空" : raw === "#" ? "墙" : raw, px + TS / 2, py + 2);
  }

  function commitMark(W, x, y, b) {
    const px = x * TS, py = y * TS;
    const beacon = b < 1;
    ctx.globalAlpha = beacon ? 0.5 + 0.15 * Math.sin(time * 3) : 1;
    ctx.strokeStyle = beacon ? "#4a6b5a" : "#7cf3b0";
    ctx.fillStyle = beacon ? "#3d5a4c" : "#7cf3b0";
    ctx.lineWidth = Math.max(2, TS * 0.06);
    ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2, TS * 0.15, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + TS * 0.1, py + TS / 2); ctx.lineTo(px + TS * 0.32, py + TS / 2);
    ctx.moveTo(px + TS * 0.68, py + TS / 2); ctx.lineTo(px + TS * 0.9, py + TS / 2); ctx.stroke();
    if (!beacon) {
      ctx.font = "bold " + Math.floor(TS * 0.26) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText("commit", px + TS / 2, py + TS * 0.66);
    }
    ctx.globalAlpha = 1;
  }

  function prMark(W, x, y, b) {
    const px = x * TS, py = y * TS;
    const isFake = WORLD.tile(W, x, y) === "!" && W.reveal[WORLD.idx(W, W.layer, x, y)] > 0;
    const open = W.prReady && !isFake;
    ctx.save();
    ctx.translate(px + TS * 0.12, py + TS * 0.12);
    const s = TS * 0.76 / 24;
    ctx.scale(s, s);
    ctx.globalAlpha = b >= 1 ? 1 : 0.55;
    if (open) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 4);
      ctx.shadowColor = "rgba(90,220,140,.9)"; ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = "#63e08f";
    } else {
      ctx.fillStyle = b >= 1 ? "#5a6673" : "#2b333c";
    }
    const paths = TILES.icon("pr");
    for (const p of paths) ctx.fill(p);
    ctx.restore();
    if (open) {
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(time * 3);
      const grd = ctx.createLinearGradient(px, py - TS * 6, px, py + TS);
      grd.addColorStop(0, "rgba(99,224,143,0)"); grd.addColorStop(1, "rgba(99,224,143,.7)");
      ctx.fillStyle = grd;
      ctx.fillRect(px + TS * 0.15, py - TS * 6, TS * 0.7, TS * 6);
      ctx.globalAlpha = 1;
    }
    if (b < 1) {
      ctx.globalAlpha = 0.8;
      ctx.font = "bold " + Math.floor(TS * 0.24) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillStyle = open ? "#63e08f" : "#5a6673";
      ctx.fillText(open ? "PR" : "PR?", px + TS / 2, py + TS * 0.72);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- 实体 ---------------- */
  function smooth(id, tx, ty, dt) {
    let m = memo[id];
    if (!m) { m = memo[id] = { x: tx, y: ty }; }
    const k2 = Math.min(1, dt * 14);
    m.x += (tx - m.x) * k2; m.y += (ty - m.y) * k2;
    return m;
  }

  function visible(W, x, y) {
    if (WORLD.observed(W, x, y)) return 1;
    const i = WORLD.idx(W, W.layer, x, y);
    if (W.reveal[i] > 0 && W.seen[i]) return 0.8;
    return 0;
  }

  function drawEntities(W) {
    for (const b of W.bugs) {
      const v = visible(W, b.x, b.y);
      const kind = BUGS.get(b.kind);
      /* 海森堡虫：只在黑暗里显形（或者被观测卡住的时候） */
      if (kind.invisible) {
        if (b.frozen > 0) { drawBug(W, b, 1); continue; }
        if (v > 0) continue;
        const bm = WORLD.brightness(W, b.x, b.y);
        if (bm <= 0 && !W.seen[WORLD.idx(W, W.layer, b.x, b.y)]) continue;
        drawBug(W, b, 0.55 + 0.25 * Math.sin(time * 9));
        continue;
      }
      if (v <= 0) continue;
      drawBug(W, b, v);
    }
  }

  function drawBug(W, b, alpha) {
    const m = smooth("b" + b.id, b.x, b.y, 1 / 60);
    const px = (m.x + 0.5) * TS, py = (m.y + 0.5) * TS;
    const k = BUGS.get(b.kind);
    const size = TS * (b.kind === "boss" ? 0.46 : b.kind === "egg" ? 0.22 : 0.32);
    ctx.save();
    ctx.globalAlpha = alpha;
    const col = { docile: "#8f6a3a", walk: "#9c7b3f", chase: "#b0483f", legacy: "#6f5aa0",
                  breeder: "#3f8f6a", egg: "#cfd6dd", jumper: "#3fa0b0", heisen: "#c06ad0",
                  crawler: "#7a8f3f", timer: "#d9a13a", boss: "#5d3a2a" }[b.kind] || "#9c7b3f";
    const wig = Math.sin(time * 12 + b.id) * 0.12;
    ctx.translate(px, py);
    ctx.rotate((b.dx || 0) < 0 ? Math.PI : 0);
    if (b.kind === "egg") {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, size * 0.7, size, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 1.5;
      const left = Math.max(0, b.cd / (BUGS.KINDS.egg.hatch * WORLD.STEP_HZ));
      ctx.beginPath(); ctx.moveTo(-size * 0.4, -size * 0.2); ctx.lineTo(0, 0); ctx.lineTo(size * 0.3, -size * 0.4); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillRect(-size, size + 3, size * 2 * left, 2);
    } else {
      /* 腿 */
      ctx.strokeStyle = "rgba(20,14,8,.9)"; ctx.lineWidth = Math.max(1.5, TS * 0.04);
      for (let i = -1; i <= 1; i++) {
        const ly = i * size * 0.5;
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, ly); ctx.lineTo(-size * 1.05, ly + size * (0.5 + wig));
        ctx.moveTo(size * 0.2, ly); ctx.lineTo(size * 1.05, ly + size * (0.5 - wig));
        ctx.stroke();
      }
      /* 身体 */
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, size * 0.82, size, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath(); ctx.ellipse(0, 0, size * 0.2, size * 0.95, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.beginPath(); ctx.ellipse(-size * 0.35, -size * 0.3, size * 0.2, size * 0.14, -0.4, 0, Math.PI * 2); ctx.fill();
      /* 头 + 触须 */
      ctx.fillStyle = "#1b120a";
      ctx.beginPath(); ctx.arc(size * 0.02, -size * 0.95, size * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1b120a"; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-size * 0.1, -size * 1.1); ctx.lineTo(-size * 0.5, -size * 1.6);
      ctx.moveTo(size * 0.1, -size * 1.1); ctx.lineTo(size * 0.5, -size * 1.6);
      ctx.stroke();
    }
    /* 状态标记 */
    if (b.tested) {
      ctx.strokeStyle = "#7cf3b0"; ctx.lineWidth = 2.5;
      ctx.strokeRect(-size * 1.15, -size * 1.15, size * 2.3, size * 2.3);
      ctx.fillStyle = "#7cf3b0"; ctx.font = "bold " + Math.floor(TS * 0.24) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText("[K]", 0, size * 1.2);
    }
    if (b.stun > 0) {
      ctx.fillStyle = "#fff2a8";
      for (let i = 0; i < 3; i++) {
        const a = time * 6 + i * 2.1;
        ctx.beginPath(); ctx.arc(Math.cos(a) * size * 1.2, -size * 1.3 + Math.sin(a) * 3, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (b.fuse != null && b.kind === "timer") {
      ctx.fillStyle = b.fuse < 5 * WORLD.STEP_HZ ? "#ff5a4a" : "#ffe08a";
      ctx.font = "bold " + Math.floor(TS * 0.34) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(Math.ceil(b.fuse / WORLD.STEP_HZ) + "", 0, -size * 1.5);
    }
    if (b.kind === "boss") {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < b.hp ? "#ff6a5a" : "rgba(255,255,255,.18)";
        ctx.fillRect(-size + i * size * 0.8, -size * 1.7, size * 0.6, 5);
      }
    }
    ctx.restore();
  }

  function drawPlayer(W) {
    const p = W.player;
    const m = smooth("me", p.x, p.y, 1 / 60);
    const px = (m.x + 0.5) * TS, py = (m.y + 0.5) * TS;
    const r = TS * 0.3;
    ctx.save();
    ctx.translate(px, py);
    if (p.dead) ctx.globalAlpha = 0.35;
    /* 影子 */
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.beginPath(); ctx.ellipse(0, r * 1.25, r * 0.85, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    /* 身体：一件带兜帽的外套 + 一台抱在怀里的笔记本 */
    ctx.fillStyle = "#2f6f8f";
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, r); ctx.quadraticCurveTo(-r, -r * 0.4, 0, -r * 0.9);
    ctx.quadraticCurveTo(r, -r * 0.4, r * 0.85, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1b3f52";
    ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f0d0a8";
    ctx.beginPath(); ctx.arc(p.dir * r * 0.14, -r * 0.6, r * 0.3, 0, Math.PI * 2); ctx.fill();
    /* 笔记本屏幕 */
    ctx.fillStyle = "#0d1a12";
    ctx.fillRect(-r * 0.7, r * 0.05, r * 1.4, r * 0.75);
    ctx.fillStyle = "#7cf3b0";
    ctx.fillRect(-r * 0.55, r * 0.2, r * (0.5 + 0.4 * Math.abs(Math.sin(time * 4))), 2);
    ctx.fillRect(-r * 0.55, r * 0.42, r * 0.7, 2);
    ctx.restore();

    /* 头顶光标： blinked 表示「可以交互」 */
    if (!p.dead) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(time * 3));
      ctx.fillStyle = "#7cf3b0";
      ctx.fillRect(px - 3, py - r * 2.1, 6, 3);
      ctx.globalAlpha = 1;
    }
    /* 施法进度 */
    if (p.cast) {
      const total = p.cast.type === "test" ? 4 : 3;
      const k = 1 - p.cast.turns / total;
      ctx.strokeStyle = p.cast.type === "fix" ? "#7cf3b0" : "#63c8ff";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, TS * 0.42, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    }
    /* 光圈边缘：软渐变，让黑暗有个边界 */
    if (W.cfg.r > 0) {
      const grd = ctx.createRadialGradient(px, py, TS * W.cfg.r * 0.55, px, py, TS * (W.cfg.r + 1.5));
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(2,3,5,.92)");
      ctx.fillStyle = grd;
      ctx.fillRect(cam.x - TS, cam.y - TS, view.w + TS * 2, view.h + TS * 2);
    }
  }

  /* ---------------- 危险源 ---------------- */
  function drawHazardsBack(W, x0, y0, cols, rowsN) {
    for (const lk of W.leaks) {
      if (!lk.on) continue;
      if (!W.seen[WORLD.idx(W, W.layer, Math.round(lk.x), Math.round(lk.y))] && !WORLD.observed(W, lk.x, lk.y)) continue;
      const cx = (lk.x + 0.5) * TS, cy = (lk.y + 0.5) * TS, rr = lk.r * TS;
      const g = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
      g.addColorStop(0, "rgba(190,110,255,.34)");
      g.addColorStop(1, "rgba(120,40,180,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(230,190,255,.5)"; ctx.font = Math.floor(TS * 0.26) + "px monospace";
      for (let i = 0; i < 5; i++) {
        const a = time * 0.6 + i * 1.4, d = ((time * 12 + i * 40) % rr);
        ctx.fillText("0x" + (1000 + i * 37).toString(16), cx + Math.cos(a) * (rr - d) - 10, cy + Math.sin(a) * (rr - d));
      }
    }
  }

  function drawHazardsFront(W) {
    for (const bd of W.bands) {
      if (!bd.on) continue;
      ctx.globalAlpha = 0.85;
      if (bd.axis === "x") {
        const gx = (bd.pos + 0.5) * TS;
        const g = ctx.createLinearGradient(gx - TS, 0, gx + TS, 0);
        g.addColorStop(0, "rgba(255,40,40,0)"); g.addColorStop(0.5, "rgba(255,60,50,.85)"); g.addColorStop(1, "rgba(255,40,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(gx - TS, cam.y - TS, TS * 2, view.h + TS * 2);
      } else {
        const gy = (bd.pos + 0.5) * TS;
        const g = ctx.createLinearGradient(0, gy - TS, 0, gy + TS);
        g.addColorStop(0, "rgba(255,40,40,0)"); g.addColorStop(0.5, "rgba(255,60,50,.85)"); g.addColorStop(1, "rgba(255,40,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cam.x - TS, gy - TS, view.w + TS * 2, TS * 2);
      }
      ctx.globalAlpha = 1;
    }
    for (let gi = 0; gi < W.ghosts.length; gi++) {
      const g = W.ghosts[gi];
      if (!g.on) continue;
      if (!WORLD.observed(W, g.x, g.y) && !W.seen[WORLD.idx(W, W.layer, g.x, g.y)]) continue;
      const m = smooth("gh" + gi, g.x, g.y, 1 / 60);
      const px = (m.x + 0.5) * TS, py = (m.y + 0.5) * TS;
      ctx.globalAlpha = 0.4 + 0.12 * Math.sin(time * 5);
      ctx.fillStyle = "#9ec8ff";
      ctx.beginPath();
      ctx.moveTo(px - TS * 0.25, py + TS * 0.3); ctx.quadraticCurveTo(px, py - TS * 0.45, px + TS * 0.25, py + TS * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#cfe6ff"; ctx.font = Math.floor(TS * 0.24) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText("HEAD~", px, py - TS * 0.4);
      ctx.globalAlpha = 1;
    }
    for (const f of W.flashes) {
      const px = (f.x + 0.5) * TS, py = (f.y + 0.5) * TS;
      ctx.globalAlpha = Math.min(0.5, f.ticks / WORLD.STEP_HZ * 0.2);
      ctx.strokeStyle = "#7cf3b0"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, f.r * TS * (1 - (f.ticks % 8) / 24), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(124,243,176,.9)"; ctx.font = Math.floor(TS * 0.24) + "px monospace";
      ctx.textAlign = "center";
      ctx.fillText("console.log", px, py - TS * 0.5);
    }
  }

  function drawOverlays(W) {
    /* 分支图层提示：另一条分支的轮廓 */
    if (W.layers.length > 1) {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = W.layer === 0 ? "#3a6cff" : "#ff6a3a";
      ctx.fillRect(cam.x, cam.y, 6, view.h);
      ctx.globalAlpha = 1;
    }
  }

  function drawScreenFx(W) {
    /* 全屏暗角 */
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.35,
                                       view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);

    if (fx.red > 0.01) { ctx.fillStyle = "rgba(255,40,40," + (fx.red * 0.4) + ")"; ctx.fillRect(0, 0, view.w, view.h); }
    if (fx.white > 0.01) { ctx.fillStyle = "rgba(255,255,255," + (fx.white * 0.5) + ")"; ctx.fillRect(0, 0, view.w, view.h); }
    if (W.flags.scrambled > 0) {
      ctx.fillStyle = "rgba(120,255,200,.06)";
      for (let i = 0; i < 6; i++) ctx.fillRect(0, (time * 200 + i * 40) % view.h, view.w, 2);
      ctx.fillStyle = "#8effc8"; ctx.font = "bold 14px monospace"; ctx.textAlign = "left";
      ctx.fillText("键盘被改了：" + (W.flags.scrambled / WORLD.STEP_HZ).toFixed(1) + "s 后恢复", 12, 20);
    }
    if (W.flags.rush > 0) {
      ctx.fillStyle = "rgba(255,60,50,.1)"; ctx.fillRect(0, 0, view.w, view.h);
      ctx.fillStyle = "#ff8a7a"; ctx.font = "bold 14px monospace"; ctx.textAlign = "right";
      ctx.fillText("CI 红灯：甲虫狂暴中", view.w - 12, 20);
    }
    if (W.player.dead) {
      ctx.fillStyle = "rgba(60,0,0,.45)"; ctx.fillRect(0, 0, view.w, view.h);
      ctx.fillStyle = "rgba(255,90,80,.85)";
      ctx.font = "bold " + Math.floor(view.h * 0.14) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const glitchOff = Math.sin(time * 30) * 4;
      ctx.fillText("BUG", view.w / 2 + glitchOff, view.h / 2);
    }
  }

  function reset() { memoPlayerReset(); }
  function memoPlayerReset() { for (const k in memo) delete memo[k]; cam.init = false; }

  return { attach, resize, draw, kick, flash, reset, view: () => view };
})();

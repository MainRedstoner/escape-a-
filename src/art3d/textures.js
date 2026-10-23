/* ============================================================
 * Escape A÷ · src/art3d/textures.js —— 程序化贴图
 *
 * 全部用 2D canvas 现画：不下载、不加载任何文件，file:// 也能用。
 * 每个贴图只生成一次，第一次用到时才画（懒加载），避免拖慢启动。
 *
 * 唯一约定：贴图都要能平铺（wrap = REPEAT），所以花纹按网格对齐，
 * 噪点用可平铺的 value noise。
 * ============================================================ */
"use strict";

const A3DTex = (() => {
  const cache = {};
  const canvases = {};

  /* ---------------- 基础工具 ---------------- */
  function cv(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h || w;
    return c;
  }
  function ctxOf(c) {
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = true;
    return x;
  }
  function rnd(seed) {
    let s = seed || 1;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const bl = Math.round(lerp(pa & 255, pb & 255, t));
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  /** 可平铺的 value noise（返回 Float32Array，0~1） */
  function tileNoise(size, freq, seed) {
    const g = Math.max(2, freq | 0);
    const grid = new Float32Array(g * g);
    const r = rnd(seed || 7);
    for (let i = 0; i < g * g; i++) grid[i] = r();
    const out = new Float32Array(size * size);
    const sc = g / size;
    for (let y = 0; y < size; y++) {
      const gy = y * sc, y0 = Math.floor(gy), fy = smooth(gy - y0);
      const y1 = (y0 + 1) % g, yy0 = y0 % g;
      for (let x = 0; x < size; x++) {
        const gx = x * sc, x0 = Math.floor(gx), fx = smooth(gx - x0);
        const x1 = (x0 + 1) % g, xx0 = x0 % g;
        const a = grid[yy0 * g + xx0], b = grid[yy0 * g + x1];
        const c = grid[y1 * g + xx0], d = grid[y1 * g + x1];
        out[y * size + x] = lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
      }
    }
    return out;
  }

  /** 叠加可平铺噪声到 2D 画布（乘法 / 加法），freqs 由大到小 */
  function grain(x, w, h, opts) {
    if (typeof h === "object") { opts = h; h = w; }
    const size = Math.max(w, h);
    opts = opts || {};
    const oct = opts.oct || 3;
    const strength = opts.strength === undefined ? 0.16 : opts.strength;
    const col = opts.color || "0,0,0";
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    let layers = [];
    for (let o = 0; o < oct; o++) {
      const n = tileNoise(size, (opts.freq || 4) * Math.pow(2, o), 17 + o * 31 + (opts.seed || 0));
      layers.push({ n, amp: Math.pow(0.55, o) });
    }
    const norm = layers.reduce((s, l) => s + l.amp, 0);
    for (let i = 0; i < w * h; i++) {
      let v = 0;
      for (const l of layers) v += l.n[i] * l.amp;
      v = v / norm - 0.5;
      const k = 1 + v * strength * 2;
      d[i * 4] = Math.min(255, d[i * 4] * k);
      d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * k);
      d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * k);
    }
    x.putImageData(img, 0, 0);
    void col;
  }

  function get(name, size, h, draw) {
    if (cache[name]) return cache[name];
    const c = cv(size, h || size);
    draw(ctxOf(c), c.width, c.height);
    canvases[name] = c;
    cache[name] = A3D.texFromCanvas(c, { clamp: /glow|shaft|sprite|sign|panel|monitor|leaf|petal|glass|ray/.test(name) });
    return cache[name];
  }
  function canvasOf(name) { return canvases[name]; }

  /* ============================================================
   *  木材：地板 / 家具
   * ============================================================ */
  function drawWood(x, w, h, base, dark, light, rows, seed) {
    const r = rnd(seed || 3);
    // 底板
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, light); g.addColorStop(0.5, base); g.addColorStop(1, dark);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const bh = h / rows;
    for (let i = 0; i < rows; i++) {
      const y0 = i * bh;
      const t = 0.82 + r() * 0.32;
      x.save();
      x.globalCompositeOperation = "source-over";
      x.fillStyle = "rgba(" + Math.round(90 * t) + "," + Math.round(62 * t) + "," + Math.round(40 * t) + ",.20)";
      x.fillRect(0, y0, w, bh);
      // 木纹
      const lines = 26;
      for (let k = 0; k < lines; k++) {
        const yy = y0 + (k + r()) * (bh / lines);
        x.beginPath();
        const amp = 1.2 + r() * 3.6, ph = r() * 6.28, fr = 1 + Math.floor(r() * 3);
        for (let px = 0; px <= w; px += 8) {
          const py = yy + Math.sin((px / w) * Math.PI * 2 * fr + ph) * amp * 0.5;
          px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.strokeStyle = "rgba(28,18,10," + (0.05 + r() * 0.12) + ")";
        x.lineWidth = 0.6 + r() * 1.6;
        x.stroke();
      }
      // 结疤
      if (r() < 0.45) {
        const kx = r() * w, ky = y0 + bh * (0.25 + r() * 0.5), kr = 1.5 + r() * 3.5;
        for (let q = 0; q < 4; q++) {
          x.beginPath();
          x.ellipse(kx, ky, kr * (1 + q * 0.9), kr * 0.55 * (1 + q * 0.9), r(), 0, Math.PI * 2);
          x.strokeStyle = "rgba(30,18,10," + (0.28 - q * 0.05) + ")";
          x.lineWidth = 0.9; x.stroke();
        }
      }
      // 板缝
      x.fillStyle = "rgba(12,7,4,.55)";
      x.fillRect(0, y0, w, 1.6);
      x.fillStyle = "rgba(255,236,208,.07)";
      x.fillRect(0, y0 + 1.6, w, 1.2);
      // 随机的错缝（竖线）
      const cut = Math.floor(r() * w);
      x.fillStyle = "rgba(12,7,4,.5)";
      x.fillRect(cut, y0, 1.4, bh);
      x.restore();
    }
    grain(x, w, h, { freq: 3, oct: 3, strength: 0.14, seed: 5 });
  }

  /* ============================================================
   *  具体贴图
   * ============================================================ */
  const T = {
    wood() {
      return get("wood", 512, 512, (x, w, h) => {
        drawWood(x, w, h, "#7a5236", "#3f2717", "#966a45", 7, 11);
      });
    },
    woodDark() {
      return get("woodDark", 256, 256, (x, w, h) => {
        drawWood(x, w, h, "#4a2f1e", "#241509", "#6b452c", 4, 23);
        x.fillStyle = "rgba(10,6,3,.18)"; x.fillRect(0, 0, w, h);
      });
    },
    woodPale() {
      return get("woodPale", 256, 256, (x, w, h) => {
        drawWood(x, w, h, "#a8865e", "#6b5236", "#c2a479", 5, 31);
      });
    },

    plaster() {
      return get("plaster", 256, 256, (x, w, h) => {
        x.fillStyle = "#243a48"; x.fillRect(0, 0, w, h);
        const r = rnd(9);
        for (let i = 0; i < 120; i++) {
          const px = r() * w, py = r() * h, rr = 8 + r() * 60;
          const g = x.createRadialGradient(px, py, 0, px, py, rr);
          g.addColorStop(0, "rgba(" + (60 + r() * 40) + "," + (90 + r() * 40) + "," + (110 + r() * 40) + ",.10)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
        }
        grain(x, w, w, { freq: 3, oct: 4, strength: 0.22, seed: 3 });
        // 细裂纹
        for (let i = 0; i < 7; i++) {
          let px = r() * w, py = r() * h;
          x.beginPath(); x.moveTo(px, py);
          for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 26; py += r() * 20; x.lineTo(px, py); }
          x.strokeStyle = "rgba(8,14,18,.28)"; x.lineWidth = 0.8; x.stroke();
        }
      });
    },
    plasterWarm() {
      return get("plasterWarm", 256, 256, (x, w, h) => {
        x.fillStyle = "#3a2c22"; x.fillRect(0, 0, w, h);
        const r = rnd(19);
        for (let i = 0; i < 90; i++) {
          const px = r() * w, py = r() * h, rr = 10 + r() * 50;
          const g = x.createRadialGradient(px, py, 0, px, py, rr);
          g.addColorStop(0, "rgba(" + (90 + r() * 30) + "," + (70 + r() * 26) + "," + (50 + r() * 20) + ",.09)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
        }
        grain(x, w, w, { freq: 3, oct: 4, strength: 0.2, seed: 8 });
      });
    },
    plasterPale() {
      return get("plasterPale", 256, 256, (x, w, h) => {
        x.fillStyle = "#6d6656"; x.fillRect(0, 0, w, h);
        const r = rnd(29);
        for (let i = 0; i < 70; i++) {
          const px = r() * w, py = r() * h, rr = 14 + r() * 60;
          const g = x.createRadialGradient(px, py, 0, px, py, rr);
          g.addColorStop(0, "rgba(" + (140 + r() * 30) + "," + (130 + r() * 30) + "," + (110 + r() * 30) + ",.10)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
        }
        grain(x, w, w, { freq: 4, oct: 4, strength: 0.24, seed: 13 });
      });
    },

    stone() {
      return get("stone", 256, 256, (x, w, h) => {
        const r = rnd(41);
        x.fillStyle = "#3b3a37"; x.fillRect(0, 0, w, h);
        const cols = 4, rows = 4, bw = w / cols, bh = h / rows;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const off = (j % 2) * bw * 0.5;
            const px = ((i * bw + off) % w), py = j * bh;
            const t = 0.72 + r() * 0.4;
            x.fillStyle = "rgb(" + Math.round(112 * t) + "," + Math.round(108 * t) + "," + Math.round(96 * t) + ")";
            const inset = 2.5;
            x.fillRect(px + inset, py + inset, bw - inset * 2, bh - inset * 2);
            // 高光 / 阴影
            x.fillStyle = "rgba(255,246,222,.10)";
            x.fillRect(px + inset, py + inset, bw - inset * 2, 2);
            x.fillStyle = "rgba(0,0,0,.28)";
            x.fillRect(px + inset, py + bh - inset - 3, bw - inset * 2, 3);
            x.fillStyle = "rgba(0,0,0,.16)";
            x.fillRect(px + bw - inset - 2, py + inset, 2, bh - inset * 2);
            // 石面斑驳
            for (let k = 0; k < 12; k++) {
              x.fillStyle = "rgba(" + (40 + r() * 40) + "," + (40 + r() * 40) + "," + (36 + r() * 30) + "," + (0.05 + r() * 0.12) + ")";
              x.fillRect(px + inset + r() * (bw - 6), py + inset + r() * (bh - 6), 1 + r() * 4, 1 + r() * 3);
            }
            // 苔藓
            if (r() < 0.5) {
              const mg = x.createRadialGradient(px + bw * r(), py + bh * r(), 1, px + bw * r(), py + bh * r(), 10 + r() * 12);
              mg.addColorStop(0, "rgba(56,84,44,.30)"); mg.addColorStop(1, "rgba(56,84,44,0)");
              x.fillStyle = mg; x.fillRect(px, py, bw, bh);
            }
          }
        }
        grain(x, w, w, { freq: 2, oct: 4, strength: 0.3, seed: 21 });
      });
    },
    paving() {
      return get("paving", 256, 256, (x, w, h) => {
        const r = rnd(53);
        x.fillStyle = "#2c2b28"; x.fillRect(0, 0, w, h);
        const n = 6, s = w / n;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const t = 0.66 + r() * 0.45;
          x.fillStyle = "rgb(" + Math.round(96 * t) + "," + Math.round(92 * t) + "," + Math.round(84 * t) + ")";
          x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
          x.fillStyle = "rgba(255,255,255,.05)";
          x.fillRect(i * s + 2, j * s + 2, s - 4, 1.5);
        }
        grain(x, w, w, { freq: 4, oct: 3, strength: 0.26, seed: 27 });
      });
    },
    dirt() {
      return get("dirt", 256, 256, (x, w, h) => {
        const r = rnd(61);
        x.fillStyle = "#2e2a24"; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          const t = r();
          x.fillStyle = "rgba(" + (50 + t * 50) + "," + (45 + t * 40) + "," + (36 + t * 30) + "," + (0.15 + r() * 0.5) + ")";
          const s = 0.8 + r() * 2.6;
          x.beginPath(); x.arc(r() * w, r() * h, s, 0, 7); x.fill();
        }
        grain(x, w, w, { freq: 3, oct: 4, strength: 0.3, seed: 44 });
      });
    },

    metal() {
      return get("metal", 256, 256, (x, w, h) => {
        x.fillStyle = "#4a4d52"; x.fillRect(0, 0, w, h);
        const r = rnd(71);
        for (let i = 0; i < 260; i++) {
          x.strokeStyle = "rgba(" + (140 + r() * 60) + "," + (146 + r() * 60) + "," + (154 + r() * 60) + "," + (0.04 + r() * 0.08) + ")";
          x.lineWidth = 0.5 + r();
          x.beginPath();
          const y = r() * h;
          x.moveTo(0, y); x.lineTo(w, y + (r() - 0.5) * 3);
          x.stroke();
        }
        grain(x, w, w, { freq: 5, oct: 3, strength: 0.14, seed: 51 });
      });
    },
    darkMetal() {
      return get("darkMetal", 256, 256, (x, w, h) => {
        x.fillStyle = "#191d22"; x.fillRect(0, 0, w, h);
        const r = rnd(73);
        for (let i = 0; i < 200; i++) {
          x.strokeStyle = "rgba(120,132,146," + (0.03 + r() * 0.06) + ")";
          x.lineWidth = 1;
          const y = r() * h;
          x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke();
        }
        grain(x, w, w, { freq: 4, oct: 3, strength: 0.2, seed: 57 });
      });
    },
    brass() {
      return get("brass", 128, 128, (x, w, h) => {
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, "#8c6b32"); g.addColorStop(0.45, "#d3ad5e"); g.addColorStop(0.55, "#a9843f"); g.addColorStop(1, "#6e5227");
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        const r = rnd(83);
        for (let i = 0; i < 60; i++) {
          x.strokeStyle = "rgba(255,240,190," + (0.05 + r() * 0.12) + ")";
          x.lineWidth = 0.5 + r();
          x.beginPath(); x.moveTo(r() * w, r() * h); x.lineTo(r() * w, r() * h); x.stroke();
        }
        grain(x, w, w, { freq: 4, oct: 2, strength: 0.12, seed: 61 });
      });
    },

    fabric() {
      return get("fabric", 256, 256, (x, w, h) => {
        x.fillStyle = "#5b4a3c"; x.fillRect(0, 0, w, h);
        // 织纹
        for (let i = 0; i < w; i += 3) {
          x.fillStyle = "rgba(255,245,225,.035)"; x.fillRect(i, 0, 1, h);
          x.fillStyle = "rgba(0,0,0,.06)"; x.fillRect(0, i, w, 1);
        }
        const r = rnd(91);
        for (let i = 0; i < 40; i++) {
          // 布褶
          const px = r() * w;
          const g = x.createLinearGradient(px - 14, 0, px + 14, 0);
          g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(0,0,0,.10)"); g.addColorStop(1, "rgba(0,0,0,0)");
          x.fillStyle = g; x.fillRect(px - 14, 0, 28, h);
        }
        grain(x, w, w, { freq: 5, oct: 3, strength: 0.18, seed: 66 });
      });
    },
    canvasTex() {
      return get("canvasTex", 256, 256, (x, w, h) => {
        x.fillStyle = "#8a7b63"; x.fillRect(0, 0, w, h);
        for (let i = 0; i < w; i += 2) {
          x.fillStyle = "rgba(255,250,235,.05)"; x.fillRect(i, 0, 1, h);
          x.fillStyle = "rgba(30,24,16,.05)"; x.fillRect(0, i, w, 1);
        }
        const r = rnd(97);
        for (let i = 0; i < 24; i++) {
          x.fillStyle = "rgba(40,32,22," + (0.03 + r() * 0.06) + ")";
          x.fillRect(r() * w, r() * h, 10 + r() * 60, 4 + r() * 24);
        }
        grain(x, w, w, { freq: 4, oct: 3, strength: 0.2, seed: 68 });
      });
    },

    carpet() {
      return get("carpet", 256, 256, (x, w, h) => {
        x.fillStyle = "#4c201c"; x.fillRect(0, 0, w, h);
        x.strokeStyle = "rgba(214,176,96,.34)"; x.lineWidth = 5;
        x.strokeRect(9, 9, w - 18, h - 18);
        x.strokeStyle = "rgba(214,176,96,.2)"; x.lineWidth = 2;
        x.strokeRect(20, 20, w - 40, h - 40);
        // 菱形花纹
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
          const cx = 45 + i * 55, cy = 45 + j * 55;
          x.beginPath();
          x.moveTo(cx, cy - 16); x.lineTo(cx + 14, cy); x.lineTo(cx, cy + 16); x.lineTo(cx - 14, cy);
          x.closePath();
          x.strokeStyle = "rgba(230,190,110,.16)"; x.lineWidth = 2; x.stroke();
          x.fillStyle = "rgba(120,50,36,.35)"; x.fill();
        }
        grain(x, w, w, { freq: 6, oct: 3, strength: 0.22, seed: 173 });
      });
    },
    rug() {
      return get("rug", 256, 256, (x, w, h) => {
        x.fillStyle = "#1d4b52"; x.fillRect(0, 0, w, h);
        x.strokeStyle = "rgba(140,190,190,.22)"; x.lineWidth = 3;
        x.strokeRect(8, 8, w - 16, h - 16);
        x.strokeStyle = "rgba(120,170,175,.14)"; x.lineWidth = 8;
        x.strokeRect(18, 18, w - 36, h - 36);
        // 菱形花纹
        for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
          const cx = 30 + i * (w - 60) / 4, cy = 30 + j * (h - 60) / 4;
          x.beginPath();
          x.moveTo(cx, cy - 9); x.lineTo(cx + 7, cy); x.lineTo(cx, cy + 9); x.lineTo(cx - 7, cy);
          x.closePath();
          x.strokeStyle = "rgba(180,220,220,.12)"; x.lineWidth = 1.4; x.stroke();
        }
        grain(x, w, w, { freq: 6, oct: 3, strength: 0.24, seed: 71 });
      });
    },
    curtain() {
      return get("curtain", 256, 256, (x, w, h) => {
        x.fillStyle = "#5c2b2b"; x.fillRect(0, 0, w, h);
        for (let i = 0; i < w; i++) {
          const k = 0.5 + 0.5 * Math.sin((i / w) * Math.PI * 10);
          x.fillStyle = "rgba(0,0,0," + (0.05 + k * 0.16) + ")";
          x.fillRect(i, 0, 1, h);
        }
        grain(x, w, w, { freq: 4, oct: 3, strength: 0.16, seed: 77 });
      });
    },

    caustic() {
      return get("caustic", 512, 512, (x, w, h) => {
        const img = x.createImageData(w, h);
        const d = img.data;
        for (let y = 0; y < h; y++) {
          for (let i = 0; i < w; i++) {
            const u = i / w * Math.PI * 2, v = y / h * Math.PI * 2;
            // 几条整数频率的正弦叠加，保证平铺
            let s = Math.sin(u * 3 + Math.sin(v * 2) * 1.2)
                  + Math.sin(v * 3 + Math.sin(u * 2) * 1.2)
                  + Math.sin((u + v) * 2 + Math.sin(u * 3) * 0.8)
                  + Math.sin((u - v) * 3 + Math.sin(v * 4) * 0.6);
            s = s / 4 * 0.5 + 0.5;
            const k = Math.pow(Math.max(0, s - 0.42) / 0.58, 3.2);
            const c = Math.min(255, k * 320);
            const idx = (y * w + i) * 4;
            d[idx] = c; d[idx + 1] = Math.min(255, c * 1.05); d[idx + 2] = Math.min(255, c * 1.1);
            d[idx + 3] = 255;
          }
        }
        x.putImageData(img, 0, 0);
      });
    },
    causticSoft() {
      return get("causticSoft", 256, 256, (x, w, h) => {
        const img = x.createImageData(w, h);
        const d = img.data;
        for (let y = 0; y < h; y++) {
          for (let i = 0; i < w; i++) {
            const u = i / w * Math.PI * 2, v = y / h * Math.PI * 2;
            let s = Math.sin(u * 2 + Math.sin(v * 3) * 1.4) + Math.sin(v * 2 + Math.sin(u * 3) * 1.4)
                  + Math.sin((u + v) * 3);
            s = s / 3 * 0.5 + 0.5;
            const k = Math.pow(Math.max(0, s - 0.45) / 0.55, 2.4);
            const idx = (y * w + i) * 4;
            const c = Math.min(255, k * 300);
            d[idx] = c; d[idx + 1] = c; d[idx + 2] = c; d[idx + 3] = 255;
          }
        }
        x.putImageData(img, 0, 0);
      }, 256);
    },

    glow() {
      return get("glow", 128, 128, (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.18, "rgba(255,255,255,.72)");
        g.addColorStop(0.45, "rgba(255,255,255,.18)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      });
    },
    shaft() {
      return get("shaft", 256, 256, (x, w, h) => {
        const img = x.createImageData(w, h);
        const d = img.data;
        for (let y = 0; y < h; y++) {
          const fy = y / h;
          const fall = Math.pow(1 - Math.abs(fy - 0.42) * 1.55, 2.2) * (1 - fy * 0.3);
          for (let i = 0; i < w; i++) {
            const fx = i / w;
            const edge = Math.pow(1 - Math.abs(fx - 0.5) * 2, 2.6);
            const streak = 0.55 + 0.45 * Math.sin(fx * 31 + Math.sin(fx * 7) * 2.0);
            const a = Math.max(0, fall * edge * streak);
            const idx = (y * w + i) * 4;
            d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255;
            d[idx + 3] = Math.min(255, a * 255);
          }
        }
        x.putImageData(img, 0, 0);
      });
    },
    ray() {
      return get("ray", 64, 256, (x, w, h) => {
        const img = x.createImageData(w, h);
        const d = img.data;
        for (let y = 0; y < h; y++) {
          const fy = y / h;
          const fall = Math.pow(1 - fy, 1.7) * Math.min(1, fy * 6);
          for (let i = 0; i < w; i++) {
            const fx = i / w;
            const edge = Math.pow(1 - Math.abs(fx - 0.5) * 2, 2.2);
            const idx = (y * w + i) * 4;
            d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255;
            d[idx + 3] = Math.min(255, Math.max(0, fall * edge) * 255);
          }
        }
        x.putImageData(img, 0, 0);
      });
    },
    dust() {
      return get("dust", 64, 64, (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, "rgba(255,255,255,.95)");
        g.addColorStop(0.35, "rgba(255,255,255,.35)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      });
    },
    leaf() {
      return get("leaf", 128, 128, (x, w, h) => {
        x.clearRect(0, 0, w, h);
        // 一片叶子：椭圆 + 中脉
        const g = x.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, "#1e4a2a"); g.addColorStop(0.5, "#3c7a45"); g.addColorStop(1, "#5c9a52");
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(w / 2, h * 0.04);
        x.bezierCurveTo(w * 0.94, h * 0.28, w * 0.9, h * 0.8, w / 2, h * 0.98);
        x.bezierCurveTo(w * 0.1, h * 0.8, w * 0.06, h * 0.28, w / 2, h * 0.04);
        x.fill();
        x.strokeStyle = "rgba(190,230,170,.35)"; x.lineWidth = 2;
        x.beginPath(); x.moveTo(w / 2, h * 0.08); x.lineTo(w / 2, h * 0.94); x.stroke();
        for (let i = 1; i < 7; i++) {
          const y = h * (0.15 + i * 0.11);
          x.strokeStyle = "rgba(190,230,170,.18)"; x.lineWidth = 1.2;
          x.beginPath(); x.moveTo(w / 2, y); x.lineTo(w / 2 + (i % 2 ? 1 : -1) * w * 0.26, y + h * 0.06); x.stroke();
        }
      });
    },
    petal() {
      return get("petal", 64, 64, (x, w, h) => {
        x.clearRect(0, 0, w, h);
        const g = x.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, "#b4631a"); g.addColorStop(0.45, "#e8901f"); g.addColorStop(1, "#ffd27a");
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(w / 2, h / 2, w * 0.22, h * 0.46, 0, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = "rgba(120,60,10,.25)"; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(w / 2, h * 0.1); x.lineTo(w / 2, h * 0.9); x.stroke();
      });
    },
    glass() {
      return get("glass", 256, 256, (x, w, h) => {
        x.clearRect(0, 0, w, h);
        // 水痕 / 反光
        const r = rnd(101);
        for (let i = 0; i < 26; i++) {
          x.strokeStyle = "rgba(200,235,255," + (0.03 + r() * 0.07) + ")";
          x.lineWidth = 1 + r() * 5;
          x.beginPath();
          const y = r() * h;
          x.moveTo(0, y); x.lineTo(w, y + (r() - 0.5) * 30);
          x.stroke();
        }
        for (let i = 0; i < 40; i++) {
          const px = r() * w, py = r() * h, rr = 1 + r() * 3;
          const g = x.createRadialGradient(px, py, 0, px, py, rr);
          g.addColorStop(0, "rgba(220,245,255,.30)");
          g.addColorStop(1, "rgba(220,245,255,0)");
          x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
        }
      });
    },

    rackPanel() {
      return get("rackPanel", 512, 512, (x, w, h) => {
        const r = rnd(111);
        x.fillStyle = "#101418"; x.fillRect(0, 0, w, h);
        // 1U 服务器：每层一条，亮边框 + 黑面板 + 硬盘位 + 烘进去的灯
        const rows = 14, rh = h / rows;
        for (let j = 0; j < rows; j++) {
          const y = j * rh;
          // 单元外框
          x.fillStyle = "#252c34"; x.fillRect(4, y + 2, w - 8, rh - 4);
          x.fillStyle = "#0b0e12"; x.fillRect(7, y + 5, w - 14, rh - 10);
          // 顶部高光（钣金折边）
          x.fillStyle = "rgba(190,215,240,.20)"; x.fillRect(4, y + 2, w - 8, 2);
          x.fillStyle = "rgba(0,0,0,.65)"; x.fillRect(4, y + rh - 3, w - 8, 3);
          // 硬盘位（一排小方块）
          const bays = 7;
          for (let i = 0; i < bays; i++) {
            const bw = (w - 90) / bays;
            const bx = 16 + i * bw;
            x.fillStyle = "#1a2027"; x.fillRect(bx, y + 9, bw - 6, rh - 19);
            x.fillStyle = "rgba(160,190,215,.14)"; x.fillRect(bx, y + 9, bw - 6, 1.5);
            x.fillStyle = "rgba(0,0,0,.5)"; x.fillRect(bx, y + rh - 12, bw - 6, 2);
          }
          // 右侧电源 / 状态灯
          x.fillStyle = "#141a20"; x.fillRect(w - 64, y + 8, 50, rh - 16);
          for (let k = 0; k < 2; k++) {
            const lx = w - 54 + k * 12, ly = y + rh / 2;
            const green = r() < 0.8;
            x.fillStyle = green ? "rgba(90,255,120,.9)" : "rgba(255,190,90,.85)";
            x.beginPath(); x.arc(lx, ly, 2.6, 0, 7); x.fill();
            x.fillStyle = green ? "rgba(60,200,90,.25)" : "rgba(255,180,80,.2)";
            x.beginPath(); x.arc(lx, ly, 6, 0, 7); x.fill();
          }
        }
        // 两侧竖导轨
        x.fillStyle = "#323a44"; x.fillRect(0, 0, 4, h); x.fillRect(w - 4, 0, 4, h);
        x.fillStyle = "rgba(200,220,240,.12)"; x.fillRect(2, 0, 1, h); x.fillRect(w - 3, 0, 1, h);
        grain(x, w, w, { freq: 5, oct: 3, strength: 0.14, seed: 111 });
      });
    },
    tileFloor() {
      return get("tileFloor", 256, 256, (x, w, h) => {
        x.fillStyle = "#161a1e"; x.fillRect(0, 0, w, h);
        const n = 4, s = w / n;
        const r = rnd(131);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          x.fillStyle = "rgba(" + (34 + r() * 12) + "," + (40 + r() * 14) + "," + (46 + r() * 14) + ",1)";
          x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
          x.fillStyle = "rgba(150,180,200,.05)";
          x.fillRect(i * s + 2, j * s + 2, s - 4, 1.5);
        }
        grain(x, w, w, { freq: 4, oct: 3, strength: 0.1, seed: 137 });
      });
    },
    paper() {
      return get("paper", 128, 128, (x, w, h) => {
        x.fillStyle = "#cfc6b0"; x.fillRect(0, 0, w, h);
        const r = rnd(151);
        for (let i = 0; i < 40; i++) {
          x.fillStyle = "rgba(120,105,80," + (0.03 + r() * 0.06) + ")";
          x.fillRect(r() * w, r() * h, 2 + r() * 20, 1 + r() * 2);
        }
        grain(x, w, w, { freq: 5, oct: 3, strength: 0.14, seed: 157 });
      });
    }
  };

  /* ============================================================
   *  文字贴图（招牌 / 便签 / 屏幕）
   * ============================================================ */
  function sign(opts) {
    const key = "sign:" + JSON.stringify(opts);
    if (cache[key]) return cache[key];
    const w = opts.w || 512, h = opts.h || 256;
    const c = cv(w, h);
    const x = ctxOf(c);
    if (opts.bg) { x.fillStyle = opts.bg; x.fillRect(0, 0, w, h); }
    if (opts.border) {
      x.strokeStyle = opts.border; x.lineWidth = opts.borderW || 6;
      x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth);
    }
    if (opts.grad) {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, opts.grad[0]); g.addColorStop(1, opts.grad[1]);
      x.fillStyle = g; x.fillRect(x.lineWidth, x.lineWidth, w - x.lineWidth * 2, h - x.lineWidth * 2);
    }
    const lines = String(opts.text || "").split("\n");
    const size = opts.size || 64;
    const lineH = opts.lineH || size * 1.25;
    x.textAlign = opts.align || "center";
    x.textBaseline = "middle";
    const font = (opts.bold === false ? "" : "bold ") + size + "px " +
      (opts.font || "'Noto Sans SC','Microsoft YaHei',sans-serif");
    x.font = font;
    const cx = opts.align === "left" ? (opts.pad || 20) : w / 2;
    const cy = h / 2 - ((lines.length - 1) * lineH) / 2 + (opts.dy || 0);
    lines.forEach((ln, i) => {
      if (opts.glow) {
        x.shadowColor = opts.glow; x.shadowBlur = opts.glowBlur || 18;
      }
      x.fillStyle = opts.fg || "#f2f5fa";
      x.fillText(ln, cx, cy + i * lineH);
      x.shadowBlur = 0;
    });
    if (opts.grain !== false) grain(x, w, h, { freq: 5, oct: 2, strength: 0.08, seed: 3 });
    canvases[key] = c;
    cache[key] = A3D.texFromCanvas(c, { clamp: true });
    return cache[key];
  }

  /** 海报 / 公告：一堆横线假装是字 */
  function poster(lines, opts) {
    opts = opts || {};
    const key = "poster:" + JSON.stringify([lines, opts]);
    if (cache[key]) return cache[key];
    const w = 256, h = 320;
    const c = cv(w, h), x = ctxOf(c);
    x.fillStyle = opts.bg || "#c9bfa6"; x.fillRect(0, 0, w, h);
    x.fillStyle = opts.ink || "#3a3730";
    x.font = "bold 30px 'Noto Sans SC','Microsoft YaHei',sans-serif";
    x.textAlign = "center"; x.fillText(opts.title || "", w / 2, 52);
    const r = rnd(opts.seed || 5);
    for (let i = 0; i < (lines || 10); i++) {
      const y = 82 + i * 20;
      const ww = w * (0.35 + r() * 0.5);
      x.fillStyle = "rgba(58,55,48," + (0.35 + r() * 0.4) + ")";
      x.fillRect(24, y, ww, 3 + r() * 3);
    }
    if (opts.mark) {
      x.fillStyle = opts.mark;
      x.beginPath(); x.arc(w - 52, h - 60, 26, 0, 7); x.fill();
    }
    grain(x, 256, 320, { freq: 5, oct: 3, strength: 0.12, seed: 4 });
    canvases[key] = c;
    cache[key] = A3D.texFromCanvas(c, { clamp: true });
    return cache[key];
  }

  /** 动态画布：调用方自己画，每帧或每 100ms 更新 */
  function dynamic(name, w, h, draw) {
    if (cache[name]) return cache[name];
    const c = cv(w, h);
    draw(ctxOf(c), w, h);
    canvases[name] = c;
    cache[name] = A3D.texFromCanvas(c, { clamp: true });
    return cache[name];
  }
  function redraw(name, draw) {
    const c = canvases[name];
    if (!c) return;
    draw(ctxOf(c), c.width, c.height);
    A3D.updateTex(cache[name], c);
  }

  return {
    T, sign, poster, dynamic, redraw, canvasOf, get, cv, ctxOf, rnd, mixHex, grain, tileNoise
  };
})();

/* ============================================================
 * Escape A÷ · game/src/sfx.js —— 小游戏的极短音效（WebAudio 合成，无音频文件）
 *
 * 和 src/audio.js 完全独立：小游戏可能被打进视觉小说，也可能单独双击打开，
 * 所以这里自带一个只有几个方波 / 噪声的合成器，不共用 AudioContext 以外的东西。
 * 全部音频在第一次用户手势后创建（浏览器自动播放策略）。
 * ============================================================ */
"use strict";

window.GSFX = (() => {

  let ctx = null, master = null, hum = null, humOn = false;
  let enabled = true;

  function ensure() {
    if (ctx || !enabled) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, opts) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    const t0 = c.currentTime + (opts && opts.at || 0);
    o.type = (opts && opts.type) || "square";
    o.frequency.setValueAtTime(freq, t0);
    if (opts && opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    const vol = (opts && opts.vol != null) ? opts.vol : 0.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(dur, opts) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    const t0 = c.currentTime + (opts && opts.at || 0);
    src.buffer = noiseBuf; src.loop = true;
    f.type = (opts && opts.filter) || "bandpass";
    f.frequency.setValueAtTime((opts && opts.freq) || 900, t0);
    if (opts && opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, opts.to), t0 + dur);
    f.Q.value = (opts && opts.q) || 1.2;
    const vol = (opts && opts.vol != null) ? opts.vol : 0.4;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* ---------------- 环境嗡鸣（屎山的呼吸声） ---------------- */
  function humOn_(freq) {
    const c = ensure();
    if (!c || hum) return;
    hum = { o: c.createOscillator(), o2: c.createOscillator(), g: c.createGain() };
    hum.o.type = "sine"; hum.o.frequency.value = freq;
    hum.o2.type = "sine"; hum.o2.frequency.value = freq * 1.5 + 1;
    hum.g.gain.value = 0.0;
    hum.o.connect(hum.g); hum.o2.connect(hum.g); hum.g.connect(master);
    hum.o.start(); hum.o2.start();
    humOn = true;
  }
  function setHum(level) {
    if (!humOn) return;
    hum.g.gain.value = 0.02 + 0.05 * (level || 0);
  }

  /* ---------------- 音色表 ---------------- */
  const CUES = {
    move:      () => tone(180, 0.03, { type: "triangle", vol: 0.08 }),
    step:      () => tone(120, 0.04, { type: "triangle", vol: 0.12 }),
    jump:      () => tone(300, 0.12, { type: "square", to: 620, vol: 0.2 }),
    land:      () => { tone(90, 0.08, { type: "triangle", vol: 0.28 }); noise(0.05, { freq: 400, vol: 0.12 }); },
    fall:      () => tone(500, 0.5, { type: "sawtooth", to: 40, vol: 0.25 }),
    commit:    () => { tone(523, 0.1, { type: "square", vol: 0.22 }); tone(784, 0.16, { type: "square", vol: 0.2, at: 0.09 }); },
    revert:    () => { tone(784, 0.1, { type: "square", vol: 0.2 }); tone(392, 0.22, { type: "square", vol: 0.2, to: 240, at: 0.07 }); },
    cast:      () => tone(220, 0.06, { type: "sawtooth", vol: 0.12 }),
    fix:       () => { noise(0.12, { freq: 2400, to: 300, vol: 0.35 }); tone(140, 0.14, { type: "square", to: 60, vol: 0.24 }); },
    fail:      () => { tone(160, 0.12, { type: "square", to: 120, vol: 0.3 }); tone(150, 0.16, { type: "square", to: 90, vol: 0.28, at: 0.11 }); },
    test:      () => { tone(660, 0.08, { vol: 0.2 }); tone(880, 0.08, { vol: 0.2, at: 0.07 }); tone(1100, 0.12, { vol: 0.18, at: 0.14 }); },
    log:       () => { tone(1200, 0.05, { type: "sine", vol: 0.2 }); noise(0.18, { freq: 1600, to: 600, vol: 0.14 }); },
    blame:     () => tone(330, 0.2, { type: "sawtooth", to: 165, vol: 0.22 }),
    hatch:     () => tone(500, 0.06, { type: "triangle", to: 900, vol: 0.16 }),
    boom:      () => { noise(0.5, { filter: "lowpass", freq: 700, to: 90, vol: 0.55 }); tone(70, 0.4, { type: "square", to: 30, vol: 0.35 }); },
    death:     () => { tone(220, 0.5, { type: "sawtooth", to: 55, vol: 0.35 }); noise(0.4, { freq: 300, to: 80, vol: 0.3 }); },
    alarm:     () => { tone(880, 0.14, { vol: 0.24 }); tone(660, 0.14, { vol: 0.24, at: 0.16 }); },
    unlock:    () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: "square", vol: 0.2, at: i * 0.1 })); },
    pr:        () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: "triangle", vol: 0.22, at: i * 0.09 })); },
    spawn:     () => tone(90, 0.2, { type: "sawtooth", to: 200, vol: 0.2 }),
    blackout:  () => { tone(400, 0.6, { type: "sine", to: 40, vol: 0.26 }); noise(0.5, { filter: "lowpass", freq: 900, to: 100, vol: 0.2 }); },
    glitch:    () => { noise(0.2, { freq: 2000, q: 6, vol: 0.24 }); tone(1000, 0.14, { type: "square", to: 200, vol: 0.16 }); },
    ui:        () => tone(700, 0.04, { type: "square", vol: 0.12 }),
    uiOk:      () => tone(900, 0.08, { type: "square", vol: 0.16 }),
    tip:       () => tone(1050, 0.05, { type: "sine", vol: 0.14 }),
    tick:      () => tone(1500, 0.03, { type: "sine", vol: 0.1 })
  };

  function play(cue) {
    const fn = CUES[cue];
    if (fn) { try { fn(); } catch (e) { /* 音频坏了不该弄坏游戏 */ } }
  }

  function toggle() {
    enabled = !enabled;
    if (!enabled && ctx) { try { ctx.suspend(); } catch (e) {} }
    else if (enabled && ctx) { try { ctx.resume(); } catch (e) {} }
    return enabled;
  }
  function isOn() { return enabled; }
  function unlock() { ensure(); if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} } }
  function startHum() { if (!humOn) humOn_(48); setHum(0.3); }
  function stopHum() { if (hum && humOn) { try { hum.g.gain.value = 0; } catch (e) {} } }

  return { play, unlock, toggle, isOn, startHum, stopHum, setHum };
})();

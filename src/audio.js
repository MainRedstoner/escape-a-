/* ============================================================
 * Escape A÷ · audio.js —— WebAudio 芯片音乐 + 音效（零素材）
 * 首次用户交互后激活。
 * ============================================================ */
"use strict";

const AUDIO = (() => {
  let ac = null, master = null, current = null, timer = null, step = 0;
  let vol = 0.5;

  function ensure() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = vol;
      master.connect(ac.destination);
      return true;
    } catch (e) { return false; }
  }

  function setVolume(v) { vol = v; if (master) master.gain.value = v; }

  /* 音色 */
  function tone(freq, t0, dur, type, gainV, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainV, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, gainV) {
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const g = ac.createGain(); g.gain.value = gainV;
    src.connect(g); g.connect(master);
    src.start(t0);
  }

  const N = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI → 频率

  /* BGM：每步为 [低音, 主旋律]（MIDI 或 0=休止），16步一循环 */
  const TRACKS = {
    sea: { bpm: 66, bass: "triangle", lead: "sine",
      bassLine: [45,0,52,0, 45,0,52,0, 41,0,48,0, 43,0,50,0],
      leadLine: [69,0,72,74, 76,0,74,72, 69,0,67,69, 71,0,0,0] },
    lobby: { bpm: 96, bass: "triangle", lead: "square",
      bassLine: [41,0,48,0, 41,0,48,0, 46,0,53,0, 43,0,50,0],
      leadLine: [65,69,72,0, 69,72,77,0, 70,74,77,0, 67,70,74,0] },
    tense: { bpm: 132, bass: "sawtooth", lead: "square",
      bassLine: [38,38,0,38, 38,0,38,0, 36,36,0,36, 34,0,34,0],
      leadLine: [62,0,65,0, 62,0,60,0, 61,0,64,0, 60,0,58,0] },
    warm: { bpm: 78, bass: "triangle", lead: "sine",
      bassLine: [41,0,48,0, 45,0,52,0, 38,0,45,0, 43,0,50,0],
      leadLine: [72,0,76,0, 74,0,72,0, 69,0,72,0, 71,72,74,0] },
    sad: { bpm: 58, bass: "triangle", lead: "sine",
      bassLine: [33,0,40,0, 29,0,36,0, 31,0,38,0, 33,0,40,0],
      leadLine: [64,0,0,67, 71,0,0,0, 62,0,0,65, 69,0,0,0] },
    boss: { bpm: 140, bass: "sawtooth", lead: "square",
      bassLine: [33,33,33,0, 33,0,32,0, 31,31,31,0, 31,0,30,0],
      leadLine: [69,0,68,0, 69,0,72,0, 68,0,67,0, 63,0,65,0] },
    ending: { bpm: 84, bass: "triangle", lead: "sine",
      bassLine: [45,0,52,0, 50,0,57,0, 48,0,55,0, 47,0,54,0],
      leadLine: [76,0,79,0, 81,0,79,0, 76,0,74,0, 71,0,74,76] }
  };

  function playBGM(name) {
    if (current === name) return;
    stopBGM();
    if (!name || !ensure()) { current = name || null; return; }
    const tr = TRACKS[name];
    if (!tr) { current = null; return; }
    current = name; step = 0;
    const stepDur = 60 / tr.bpm / 2;
    timer = setInterval(() => {
      if (!ac || ac.state === "suspended") return;
      const t0 = ac.currentTime + 0.03;
      const b = tr.bassLine[step % tr.bassLine.length];
      const l = tr.leadLine[step % tr.leadLine.length];
      if (b) tone(N(b), t0, stepDur * 1.8, tr.bass, 0.11);
      if (l) tone(N(l), t0, stepDur * 1.6, tr.lead, 0.055);
      step++;
    }, stepDur * 1000);
  }
  function stopBGM() { if (timer) { clearInterval(timer); timer = null; } current = null; }

  /* 音效 */
  function sfx(name) {
    if (!ensure()) return;
    if (ac.state === "suspended") ac.resume();
    const t0 = ac.currentTime;
    switch (name) {
      case "blip": tone(880 + Math.random() * 160, t0, 0.045, "square", 0.016); break;
      case "click": tone(660, t0, 0.06, "square", 0.05); tone(990, t0 + 0.05, 0.06, "square", 0.04); break;
      case "ding": tone(1047, t0, 0.12, "sine", 0.12); tone(1568, t0 + 0.09, 0.25, "sine", 0.1); break;
      case "deny": tone(220, t0, 0.14, "sawtooth", 0.12); tone(185, t0 + 0.12, 0.2, "sawtooth", 0.12); break;
      case "alarm":
        for (let i = 0; i < 3; i++) { tone(784, t0 + i * 0.24, 0.1, "square", 0.09); tone(622, t0 + i * 0.24 + 0.11, 0.1, "square", 0.09); }
        break;
      case "boom": noise(t0, 0.5, 0.22); tone(70, t0, 0.5, "sine", 0.2); break;
      case "coin": tone(988, t0, 0.06, "square", 0.08); tone(1319, t0 + 0.06, 0.14, "square", 0.08); break;
      case "whoosh": noise(t0, 0.28, 0.1); break;
      case "glitch":
        for (let i = 0; i < 5; i++) tone(200 + Math.random() * 1400, t0 + i * 0.05, 0.05, "sawtooth", 0.05);
        break;
      case "heart": tone(523, t0, 0.1, "sine", 0.1); tone(659, t0 + 0.1, 0.1, "sine", 0.1); tone(784, t0 + 0.2, 0.22, "sine", 0.1); break;
    }
  }

  function unlock() { if (ensure() && ac.state === "suspended") ac.resume(); }

  return { playBGM, stopBGM, sfx, setVolume, unlock, get current() { return current; } };
})();

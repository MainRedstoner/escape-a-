/* ============================================================
 * Escape A÷ · audio.js —— WebAudio 芯片音乐 + 音效（零素材）
 * 基调：低频、留白、小调。所有音乐程序化合成，不需要音频文件。
 * ============================================================ */
"use strict";

const AUDIO = (() => {
  let ac = null, master = null, current = null, timer = null, step = 0;
  let vol = 0.5;
  let unlocked = false;   // 浏览器要求先有用户手势，否则不碰 AudioContext

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
    g.gain.linearRampToValueAtTime(gainV, t0 + 0.014);
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
  const R = 0;                                     // 休止

  /* BGM：每步 [低音, 主旋律]，16 步一循环
   * 音区刻意压低：低音落在 28~45（约 40~110Hz），旋律尽量留白。
   * 曲名 = 剧本里 BGM("...") 用的 id，按你的故事增删。 */
  const TRACKS = {
    /* 深水 / 序幕：缓慢、有浮力 */
    sea: { bpm: 56, bass: "triangle", lead: "sine",
      bassLine: [33, R, 40, R, 33, R, 40, R, 31, R, 38, R, 33, R, 40, R],
      leadLine: [64, R, R, 67, 71, R, R, R, 62, R, R, 66, 69, R, R, R] },
    /* 大堂 / 日常场景：体面的电梯音乐，但低了半个音 */
    lobby: { bpm: 84, bass: "triangle", lead: "square",
      bassLine: [38, R, 45, R, 38, R, 45, R, 43, R, 50, R, 41, R, 48, R],
      leadLine: [62, 65, 69, R, 65, 69, 74, R, 67, 71, 74, R, 65, 69, 72, R] },
    /* 走廊 / 机房：脉冲式紧张 */
    tense: { bpm: 124, bass: "sawtooth", lead: "square",
      bassLine: [31, 31, R, 31, 31, R, 31, R, 29, 29, R, 29, 27, R, 27, R],
      leadLine: [58, R, 61, R, 58, R, 56, R, 57, R, 60, R, 56, R, 55, R] },
    /* 温情时刻 */
    warm: { bpm: 72, bass: "triangle", lead: "sine",
      bassLine: [36, R, 43, R, 41, R, 48, R, 33, R, 40, R, 38, R, 45, R],
      leadLine: [67, R, 71, R, 69, R, 67, R, 64, R, 67, R, 66, 67, 69, R] },
    /* 冷得发麻，小二度摩擦 */
    cold: { bpm: 96, bass: "sawtooth", lead: "triangle",
      bassLine: [30, R, 30, R, 41, R, 41, R, 29, R, 29, R, 40, R, 40, R],
      leadLine: [61, 62, R, R, 61, 62, R, R, 60, 61, R, R, 58, R, R, R] },
    /* 几乎静止的低频嗡鸣 */
    grave: { bpm: 44, bass: "sine", lead: "triangle",
      bassLine: [26, R, R, R, R, R, R, R, 28, R, R, R, R, R, R, R],
      leadLine: [62, R, R, R, R, R, R, R, R, R, R, R, 60, R, R, R] },
    /* 离别 */
    sad: { bpm: 54, bass: "triangle", lead: "sine",
      bassLine: [28, R, 35, R, 26, R, 33, R, 27, R, 34, R, 28, R, 35, R],
      leadLine: [60, R, R, 63, 67, R, R, R, 58, R, R, 61, 65, R, R, R] },
    /* 对峙 / 高潮：程序化的压迫感 */
    boss: { bpm: 132, bass: "sawtooth", lead: "square",
      bassLine: [29, 29, 29, R, 29, R, 28, R, 27, 27, 27, R, 27, R, 26, R],
      leadLine: [65, R, 64, R, 65, R, 68, R, 64, R, 63, R, 59, R, 61, R] },
    /* 结局 */
    ending: { bpm: 76, bass: "triangle", lead: "sine",
      bassLine: [33, R, 40, R, 38, R, 45, R, 36, R, 43, R, 35, R, 42, R],
      leadLine: [69, R, 72, R, 76, R, 72, R, 69, R, 67, R, 64, R, 67, 69] }
  };

  function playBGM(name) {
    if (current === name) return;
    stopBGM();
    if (!name) { current = null; return; }
    current = name;                      // 记下想播的曲子
    if (!unlocked) return;               // 等第一次用户交互，再由 unlock() 补播
    if (!ensure()) { current = null; return; }
    const tr = TRACKS[name];
    if (!tr) { current = null; return; }
    step = 0;
    const stepDur = 60 / tr.bpm / 2;
    timer = setInterval(() => {
      if (!ac || ac.state === "suspended") return;
      const t0 = ac.currentTime + 0.03;
      const b = tr.bassLine[step % tr.bassLine.length];
      const l = tr.leadLine[step % tr.leadLine.length];
      if (b) tone(N(b), t0, stepDur * 2.1, tr.bass, 0.10);
      if (l) tone(N(l), t0, stepDur * 1.7, tr.lead, 0.045);
      step++;
    }, stepDur * 1000);
  }
  function stopBGM() { if (timer) { clearInterval(timer); timer = null; } current = null; }

  /* 音效 */
  function sfx(name) {
    if (!unlocked) return;
    if (!ensure()) return;
    if (ac.state === "suspended") ac.resume();
    const t0 = ac.currentTime;
    switch (name) {
      case "blip": tone(760 + Math.random() * 140, t0, 0.04, "square", 0.012); break;
      case "click": tone(520, t0, 0.05, "square", 0.045); tone(760, t0 + 0.045, 0.055, "square", 0.035); break;
      case "ding": tone(880, t0, 0.12, "sine", 0.10); tone(1320, t0 + 0.09, 0.26, "sine", 0.075); break;
      case "deny": tone(196, t0, 0.15, "sawtooth", 0.11); tone(165, t0 + 0.13, 0.22, "sawtooth", 0.10); break;
      case "alarm":
        for (let i = 0; i < 3; i++) {
          tone(698, t0 + i * 0.26, 0.11, "square", 0.075);
          tone(554, t0 + i * 0.26 + 0.12, 0.11, "square", 0.075);
        }
        break;
      case "boom": noise(t0, 0.55, 0.20); tone(58, t0, 0.6, "sine", 0.22); break;
      case "coin": tone(988, t0, 0.055, "square", 0.07); tone(1319, t0 + 0.055, 0.14, "square", 0.07); break;
      case "whoosh": noise(t0, 0.32, 0.09); break;
      case "glitch":
        for (let i = 0; i < 6; i++) tone(160 + Math.random() * 1500, t0 + i * 0.045, 0.045, "sawtooth", 0.045);
        break;
      case "heart": tone(494, t0, 0.1, "sine", 0.09); tone(622, t0 + 0.1, 0.1, "sine", 0.09); tone(740, t0 + 0.2, 0.24, "sine", 0.09); break;
    }
  }

  function unlock() {
    unlocked = true;
    if (!ensure()) return;
    if (ac.state === "suspended") ac.resume();
    if (current && !timer) { const n = current; current = null; playBGM(n); }   // 补播
  }

  return { playBGM, stopBGM, sfx, setVolume, unlock, TRACKS, get current() { return current; } };
})();

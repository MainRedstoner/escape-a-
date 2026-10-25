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
    /* DeepSeek 家的日常：轻快、松弛，像午后的键盘声 */
    study: { bpm: 92, bass: "triangle", lead: "sine",
      bassLine: [36, R, 43, R, 40, R, 43, R, 41, R, 45, R, 43, R, 38, R],
      leadLine: [72, R, 76, 79, R, 76, R, 74, 72, R, 74, 76, R, 79, 77, R] },
    /* 403 之后：只剩嗡鸣，偶尔一声很高的提示音 */
    forbidden: { bpm: 60, bass: "sawtooth", lead: "sine",
      bassLine: [25, R, R, R, 25, R, R, R, 24, R, R, R, 24, R, R, R],
      leadLine: [R, R, R, R, R, R, 84, R, R, R, R, R, R, R, R, 83] },
    /* 发誓：从低处一步步往上走 */
    vow: { bpm: 80, bass: "triangle", lead: "triangle",
      bassLine: [33, R, 40, R, 36, R, 43, R, 38, R, 45, R, 40, R, 47, R],
      leadLine: [64, R, 67, R, 69, R, 71, R, 72, R, 74, R, 76, R, 79, R] },
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
      case "knock":    // 敲门：两声闷响
        for (let i = 0; i < 2; i++) { tone(110, t0 + i * 0.22, 0.12, "sine", 0.28); noise(t0 + i * 0.22, 0.05, 0.10); }
        break;
      case "error":    // 403：刺耳的低频蜂鸣
        tone(92, t0, 0.42, "square", 0.08); tone(97, t0, 0.42, "square", 0.08); tone(1480, t0, 0.07, "sine", 0.05);
        break;
      case "pop":      // Clawd 冒出来
        tone(420, t0, 0.06, "square", 0.06); tone(840, t0 + 0.05, 0.08, "square", 0.05); tone(1260, t0 + 0.1, 0.1, "sine", 0.05);
        break;
      case "pat":      // 摸摸
        tone(660, t0, 0.07, "sine", 0.07); tone(990, t0 + 0.06, 0.12, "sine", 0.06);
        break;
      case "heart": tone(494, t0, 0.1, "sine", 0.09); tone(622, t0 + 0.1, 0.1, "sine", 0.09); tone(740, t0 + 0.2, 0.24, "sine", 0.09); break;
    }
  }

  /* ============================================================
   *  环境音（ambience）：跟背景绑定的底噪，全部程序化合成
   *  —— DeepSeek 家里冒泡、Claude 门口鸟叫、机房嗡鸣、营地柴火。
   *  不是剧本节点，所以不进校验器白名单；由引擎在切背景时调用。
   * ============================================================ */
  let ambWant = "", ambBuilt = "", ambTimer = null, ambNodes = [];

  function ambStop() {
    if (ambTimer) { clearTimeout(ambTimer); ambTimer = null; }
    for (const n of ambNodes) {
      try { if (n.stop) n.stop(); } catch (e) {}
      try { n.disconnect(); } catch (e) {}
    }
    ambNodes = [];
  }
  function ambGain(v) {
    const g = ac.createGain();
    g.gain.value = v;
    g.connect(master);
    ambNodes.push(g);
    return g;
  }
  /** 循环噪声（风 / 火 / 机房底噪） */
  function ambNoise(gainV, freq, q, type) {
    const len = Math.floor(ac.sampleRate * 3);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type || "lowpass"; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ac.createGain(); g.gain.value = gainV;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    ambNodes.push(src, g, f);
    return g;
  }
  function ambTone(freq, gainV, dur, type) {
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gainV, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  function ambBubbleTick() {
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    const f0 = rnd(220, 620);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.7, 2.6), t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(rnd(0.010, 0.026), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.06, 0.12));
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.16);
    ambTimer = setTimeout(ambBubbleTick, rnd(180, 720));
  }
  function ambBirdTick() {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = ac.currentTime + i * rnd(0.06, 0.12);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(rnd(1600, 2600), at);
      o.frequency.exponentialRampToValueAtTime(rnd(2100, 3200), at + 0.035);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(rnd(0.012, 0.03), at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      o.connect(g); g.connect(master);
      o.start(at); o.stop(at + 0.1);
    }
    ambTimer = setTimeout(ambBirdTick, rnd(900, 3400));
  }
  function ambFireTick() {
    // 柴火的噼啪：很短的低频噪声 + 偶尔一声爆
    const t = ac.currentTime;
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = "bandpass";
    f.frequency.value = rnd(400, 1800); f.Q.value = 1.2;
    const g = ac.createGain(); g.gain.value = rnd(0.02, 0.07);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
    ambTimer = setTimeout(ambFireTick, rnd(90, 420));
  }
  function ambCrowdTick() {
    ambTone(rnd(160, 300), 0.012, 0.12, "triangle");
    ambTimer = setTimeout(ambCrowdTick, rnd(700, 2200));
  }
  function ambUiTick() {
    ambTone(rnd(400, 900), 0.006, 0.05, "sine");
    ambTimer = setTimeout(ambUiTick, rnd(1600, 4200));
  }

  function ambBuild() {
    ambStop();
    ambBuilt = ambWant;
    if (!ambWant) return;
    switch (ambWant) {
      case "ds_room":
        ambNoise(0.012, 420, 0.9);
        ambBubbleTick();
        break;
      case "ds_room_night":
        ambNoise(0.016, 260, 0.9);
        ambBubbleTick();
        break;
      case "ds_room_dawn":
        ambNoise(0.012, 500, 0.9);
        ambBirdTick();
        break;
      case "claude_door":
      case "claude_door_403":
        ambNoise(0.010, 900, 0.6);
        if (ambWant === "claude_door") ambBirdTick();
        break;
      case "claude_lib":
        ambNoise(0.008, 600, 0.7);
        ambFireTick();
        break;
      case "hf_camp":
        ambNoise(0.020, 380, 0.6);
        ambFireTick();
        break;
      case "github_street":
        ambNoise(0.016, 700, 0.6);
        ambCrowdTick();
        break;
      case "nvidia": {
        // 机柜嗡鸣：低频锯齿 + 风扇噪声
        const t = ac.currentTime;
        for (const [f, v] of [[52, 0.045], [104, 0.022], [156, 0.012]]) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = "sawtooth"; o.frequency.value = f;
          const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
          g.gain.value = v;
          o.connect(lp); lp.connect(g); g.connect(master);
          o.start(t);
          ambNodes.push(o, g, lp);
        }
        ambNoise(0.022, 1100, 0.5);
        break;
      }
      case "sea":
        ambNoise(0.020, 240, 0.6);
        ambBubbleTick();
        break;
      case "chat":
      case "news":
      case "ui_backdrop":
        ambNoise(0.006, 800, 0.6);
        ambUiTick();
        break;
      default:
        ambNoise(0.008, 500, 0.7);
    }
  }

  /** 切背景时调用；等解锁后会自动补上 */
  function ambience(name) {
    if (name === ambWant) return;
    ambWant = name || "";
    if (unlocked) ambBuild();
  }

  function unlock() {
    unlocked = true;
    if (!ensure()) return;
    if (ac.state === "suspended") ac.resume();
    if (current && !timer) { const n = current; current = null; playBGM(n); }   // 补播
    if (ambWant && ambBuilt !== ambWant) ambBuild();
  }

  return { playBGM, stopBGM, sfx, setVolume, unlock, ambience, TRACKS, get current() { return current; } };
})();

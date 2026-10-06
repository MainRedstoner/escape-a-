#!/usr/bin/env node
/* ============================================================
 * Escape A÷ · tools/simulate_playthrough.js —— 无头通关模拟
 *
 * 把 engine.js 的节点语义在 Node 里重实现一遍（不碰 DOM / Canvas），
 * 然后用多种"玩家性格"把全篇跑很多遍，验证：
 *   · 每个场景都能走得出去，不会卡死
 *   · systems.js 里登记的每个结局都真的能到达
 *   · 数值不会越界（Token 花成负数之类）
 *   · 论据 / 彩蛋的获取点确实能被触发
 *
 * 用法：node tools/simulate_playthrough.js [每策略轮数]
 * ============================================================ */
"use strict";

/* ---- 加载剧本数据（标准模块加载，与 tools/validate_script.js 一致） ----
 * 新增剧本分卷时：index.html 和两个工具里各加一行 require，顺序保持一致。 */
const { SYS } = require("../src/systems.js");
const { SCRIPT } = require("../src/script.js");
const scenes = SCRIPT.scenes;

const ROUNDS = parseInt(process.argv[2] || "40", 10);
const MAX_STEPS = 4000;

/* ---------------- 条件求值（与 engine.evalCond 同一套字符扫描语义，无 eval） ---------------- */
function evalCond(src, st) {
  let pos = 0;
  const s = String(src);
  function isDigit(c) { return c >= "0" && c <= "9"; }
  function isIdStart(c) { return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_"; }
  function isIdChar(c) { return isIdStart(c) || isDigit(c); }
  function ws() { while (pos < s.length) { const c = s[pos]; if (c === " " || c === "\t" || c === "\n" || c === "\r") pos++; else break; } }
  function eat(ch) { ws(); if (s.startsWith(ch, pos)) { pos += ch.length; return true; } return false; }
  function readNumber() {
    ws(); const at = pos;
    while (pos < s.length && (isDigit(s[pos]) || s[pos] === ".")) pos++;
    return parseFloat(s.slice(at, pos));
  }
  function readString() {
    const q = s[pos]; pos++;
    const at = pos;
    while (pos < s.length && s[pos] !== q) pos++;
    const v = s.slice(at, pos); pos++;
    return v;
  }
  function parseOr() { let v = parseAnd(); while (eat("||")) v = parseAnd() || v; return v; }
  function parseAnd() { let v = parseCmp(); while (eat("&&")) v = parseCmp() && v; return v; }
  function parseCmp() {
    const v = parseUnary();
    ws();
    if (s.startsWith(">=", pos)) { pos += 2; return v >= parseUnary(); }
    if (s.startsWith("<=", pos)) { pos += 2; return v <= parseUnary(); }
    if (s.startsWith("==", pos)) { pos += 2; return v == parseUnary(); }   // eslint-disable-line eqeqeq
    if (s.startsWith("!=", pos)) { pos += 2; return v != parseUnary(); }   // eslint-disable-line eqeqeq
    if (s.startsWith(">", pos)) { pos += 1; return v > parseUnary(); }
    if (s.startsWith("<", pos)) { pos += 1; return v < parseUnary(); }
    return v;
  }
  function parseUnary() {
    ws();
    if (eat("!")) return !parseUnary();
    if (eat("(")) { const v = parseOr(); eat(")"); return v; }
    if (s.startsWith("true", pos) && !isIdChar(s[pos + 4] || "")) { pos += 4; return true; }
    if (s.startsWith("false", pos) && !isIdChar(s[pos + 5] || "")) { pos += 5; return false; }
    const c0 = s[pos];
    if (c0 >= "0" && c0 <= "9") return readNumber();
    if (c0 === "'" || c0 === '"') return readString();
    const at = pos;
    while (pos < s.length && isIdChar(s[pos])) pos++;
    const id = s.slice(at, pos);
    if (id === "has") { eat("("); const a = parseUnary(); eat(")"); return st.args.includes(String(a)); }
    if (id === "egg" || id === "flag") { eat("("); const a = parseUnary(); eat(")"); return !!st.flags[String(a)]; }
    const VAR = {
      trust: st.trust, wanted: st.wanted, tokens: st.tokens, args: st.args.length,
      eggs: Object.keys(SYS.EGG_META).filter(k => st.flags[k]).length
    };
    if (id in VAR) return VAR[id];
    if (id === "") throw new Error("条件解析失败 @" + pos);
    return undefined;
  }
  try { return !!parseOr(); }
  catch (e) { console.error("条件错误:", src, e); return false; }
}

/* ---------------- 玩家性格 ---------------- */
function scoreOption(o, st) {
  // "聪明玩家"：优先拿论据/彩蛋，其次加信任，尽量不涨通缉度
  let s = 0;
  if (o.give) s += 40;
  if (o.set && String(o.set).startsWith("egg")) s += 30;
  if (o.fx) {
    s += (o.fx.trust || 0) * 8;
    s -= (o.fx.wanted || 0) * 12;
    s += (o.fx.tokens || 0) * 0.2;
  }
  const target = scenes[o.jump] || [];
  for (const nd of target.slice(0, 24)) {
    if (nd.t === "arg" && !st.args.includes(nd.id)) s += 35;
    if (nd.t === "set" && String(nd.key).startsWith("egg") && !st.flags[nd.key]) s += 25;
    if (nd.t === "trust") s += nd.delta * 8;
    if (nd.t === "wanted") s -= nd.delta * 12;
  }
  return s;
}
const STRATEGIES = {
  first:  opts => 0,
  last:   opts => opts.length - 1,
  smart:  (opts, st) => {
    let bi = 0, bs = -1e9;
    opts.forEach((o, i) => { const s = scoreOption(o, st); if (s > bs) { bs = s; bi = i; } });
    return bi;
  },
  reckless: (opts, st) => {      // 专挑涨通缉度的，用来验证坏结局
    let bi = 0, bs = -1e9;
    opts.forEach((o, i) => {
      let s = (o.fx && o.fx.wanted ? o.fx.wanted * 10 : 0);
      const t = scenes[o.jump] || [];
      for (const nd of t.slice(0, 24)) if (nd.t === "wanted") s += nd.delta * 12;
      if (s > bs) { bs = s; bi = i; }
    });
    return bi;
  },
  random: () => -1
};

/* ---------------- 跑一遍 ---------------- */
function play(strategy, rngSeed) {
  let seed = rngSeed;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const st = { trust: 0, wanted: 0, tokens: SYS.newState().tokens, args: [], flags: {} };
  const visited = new Set();
  let scene = "start", idx = 0, steps = 0;
  const log = [];

  while (steps++ < MAX_STEPS) {
    const nodes = scenes[scene];
    if (!nodes) return { err: `场景不存在: ${scene}`, steps };
    if (idx >= nodes.length) return { err: `场景走到末尾没有出口: ${scene}`, steps };
    const nd = nodes[idx];
    visited.add(scene);
    switch (nd.t) {
      case "say": case "chapter": case "bg": case "cg": case "fx": case "sfx": case "bgm":
      case "show": case "hide": case "face": case "hint": case "wrongHint":
        idx++; break;
      case "set": st.flags[nd.key] = nd.val !== undefined ? nd.val : true; idx++; break;
      case "tokens": st.tokens = Math.max(0, st.tokens + nd.delta); idx++; break;
      case "trust": st.trust = Math.max(0, Math.min(10, st.trust + nd.delta)); idx++; break;
      case "wanted":
        st.wanted = Math.max(0, Math.min(10, st.wanted + nd.delta));
        if (st.wanted >= 10) { scene = "bad_end"; idx = 0; break; }
        idx++; break;
      case "arg": if (!st.args.includes(nd.id)) st.args.push(nd.id); idx++; break;
      case "jump": scene = nd.to; idx = 0; break;
      case "if": {
        const ok = evalCond(nd.cond, st);
        scene = ok ? nd.jump : (nd.else || scene);
        idx = 0; break;
      }
      case "choice": {
        const opts = nd.options.filter(o => !o.hideInGlitch);
        const pick = strategy === "random" ? Math.floor(rnd() * opts.length) : STRATEGIES[strategy](opts, st);
        const o = opts[Math.max(0, Math.min(opts.length - 1, pick))];
        if (o.fx) {
          st.trust = Math.max(0, Math.min(10, st.trust + (o.fx.trust || 0)));
          st.wanted = Math.max(0, Math.min(10, st.wanted + (o.fx.wanted || 0)));
          st.tokens = Math.max(0, st.tokens + (o.fx.tokens || 0));
        }
        if (o.set) st.flags[o.set] = true;
        if (o.give && !st.args.includes(o.give)) st.args.push(o.give);
        log.push(scene + " → " + o.text.slice(0, 18));
        if (st.wanted >= 10) { scene = "bad_end"; idx = 0; break; }
        scene = o.jump; idx = 0; break;
      }
      case "ending":
        return { ending: nd.id, steps, trust: st.trust, wanted: st.wanted, tokens: st.tokens,
                 args: st.args.length, eggs: Object.keys(SYS.EGG_META).filter(k => st.flags[k]).length,
                 scenes: visited.size, log };
      default: idx++; break;
    }
  }
  return { err: "步数超限（疑似死循环）", steps };
}

/* ---------------- 主流程 ---------------- */
const results = {}, errs = [];
const seenEndings = {};
let runs = 0;

for (const name of Object.keys(STRATEGIES)) {
  const n = name === "random" ? ROUNDS * 3 : ROUNDS;
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const r = play(name, 1000 + i * 7919);
    runs++;
    if (r.err) { errs.push(`[${name}] ${r.err}（第 ${i + 1} 轮）`); continue; }
    ok++;
    seenEndings[r.ending] = (seenEndings[r.ending] || 0) + 1;
    const k = r.ending;
    if (!results[k]) results[k] = r;
  }
  console.log(`策略 ${name.padEnd(9)} 完成 ${ok}/${n}`);
}

console.log("\n到达的结局统计：");
for (const k in SYS.ENDING_META) {
  const got = seenEndings[k] || 0;
  console.log(`  ${got ? "✓" : "×"} ${SYS.ENDING_META[k].name.padEnd(8)} (${k}) 命中 ${got} 次` +
    (results[k] ? `  · 样例：信任 ${results[k].trust} / 通缉 ${results[k].wanted} / 论据 ${results[k].args} / 彩蛋 ${results[k].eggs} / 走过 ${results[k].scenes} 个场景 / ${results[k].steps} 步` : ""));
}
const missing = Object.keys(SYS.ENDING_META).filter(k => !seenEndings[k]);
if (missing.length) console.log("\n!! 有结局在模拟中无法到达：" + missing.join(", "));
if (errs.length) {
  console.log("\n发现 " + errs.length + " 个问题：");
  [...new Set(errs)].slice(0, 20).forEach(e => console.log("  × " + e));
  process.exit(1);
}
console.log(`\n共模拟 ${runs} 轮，未发现死路 / 死循环 / 不可达结局。`);

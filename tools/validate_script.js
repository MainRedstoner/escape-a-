#!/usr/bin/env node
/* ============================================================
 * Escape A÷ · tools/validate_script.js —— 剧本静态校验
 *
 * 用法：node tools/validate_script.js
 *
 * 校验项：
 *   1. 场景跳转（jump / if / choice）目标是否都存在
 *   2. 说话人、音效、BGM、特效、背景、CG 的 id 是否都有实现
 *   3. 论据 id / 彩蛋旗标 / 结局 id 是否与 systems.js 的元数据一致
 *   4. hint key 是否有提示文本（反过来也检查有没有白写的提示）
 *   5. 每个场景是否有终止节点（jump / if / choice / ending），避免跑到一半回标题
 *   6. 从 start 出发的可达性（找出写了却没入口的场景）
 * ============================================================ */
"use strict";

/* ---- 加载剧本数据（标准模块加载） ----
 * systems.js / script.js 末尾的 module.exports 守卫在浏览器里是空操作。
 * 新增剧本分卷时：index.html 和这里各加一行 require，顺序保持一致。 */
const { SYS } = require("../src/systems.js");
const { SCRIPT } = require("../src/script.js");

/* ---- 引擎侧实现的 id 清单（与 engine.js / audio.js / art.js 对齐） ----
 * 新增说话人时：先在 src/engine.js 的 SPEAKERS 注册，再同步到这里。 */
const SPEAKERS = ["sys", "n", "ds", "cl", "clawd"];
const SFX = ["blip", "click", "ding", "deny", "alarm", "boom", "coin", "whoosh", "glitch", "heart",
             "knock", "error", "pop", "pat"];
const BGMS = ["sea", "lobby", "tense", "warm", "cold", "grave", "sad", "boss", "ending",
              "study", "forbidden", "vow"];
const FXS = ["shake", "flash", "alarm", "alarmOff", "glitch", "glitchOff", "403", "403Off"];
/* 桌宠（src/pet.js）的节点参数 */
const PET_OPS = ["show", "hide", "own", "mood", "anim", "say"];
const PET_PLACES = ["corner", "desk", "door"];
const PET_ANIMS = ["idle", "happy", "scared", "working", "sleep"];
const TODO_OPS = ["add", "done"];

/* 程序化背景（src/backdrops.js）：有就不算缺图 */
const { BACKDROPS } = require("../src/backdrops.js");

/* ---- 资源清单（有图的素材位） ---- */
let ass = { bg: {}, cg: {}, chara: {} };
try {
  globalThis.window = {};
  require("../assets/manifest.js");
  ass = globalThis.window.EA_ASSETS || ass;
} catch (e) {
  console.log("! assets/manifest.js 读不到（先跑 python tools/make_manifest.py > assets/manifest.js）：" + e.message);
}

/* ---- 校验 ---- */
const errs = [], warns = [];
const scenes = SCRIPT.scenes;
const ids = Object.keys(scenes);

function chk(cond, msg) { if (!cond) errs.push(msg); }

let nodes = 0, says = 0, chars = 0;
const jumps = new Set();
const usedHints = new Set(), usedArgs = new Set(), grantedArgs = new Set(), usedEggs = new Set(),
      grantedEggs = new Set(), usedEndings = new Set();
const usedBg = new Set(), usedCg = new Set(), usedSpeaker = new Set(), usedSfx = new Set(),
      usedBgm = new Set(), usedFx = new Set();

for (const sid of ids) {
  const sc = scenes[sid];
  if (!Array.isArray(sc) || !sc.length) { errs.push(`场景 ${sid} 为空`); continue; }
  sc.forEach((nd, i) => {
    nodes++;
    const at = `${sid}[${i}] ${nd.t}`;
    switch (nd.t) {
      case "say":
        says++; chars += String(nd.text || "").length;
        usedSpeaker.add(nd.who);
        chk(SPEAKERS.includes(nd.who), `${at}: 未知说话人 "${nd.who}"`);
        chk(typeof nd.text === "string" && nd.text.length, `${at}: 空文本`);
        break;
      case "show": case "hide": case "face":
        usedSpeaker.add(nd.who);
        chk(SPEAKERS.includes(nd.who), `${at}: 未知角色 "${nd.who}"`);
        break;
      /* bg / cg 的 id 是自由命名的，不查白名单；
         是否有对应素材由下面的"素材到位"环节对照 manifest 报告 */
      case "bg": usedBg.add(nd.id); break;
      case "cg": if (nd.id) usedCg.add(nd.id); break;
      case "sfx": usedSfx.add(nd.name); chk(SFX.includes(nd.name), `${at}: 未知音效 "${nd.name}"`); break;
      case "bgm": usedBgm.add(nd.name); chk(BGMS.includes(nd.name), `${at}: 未知 BGM "${nd.name}"`); break;
      case "fx": usedFx.add(nd.kind); chk(FXS.includes(nd.kind), `${at}: 未知特效 "${nd.kind}"`); break;
      case "jump":
        jumps.add(nd.to);
        chk(!!scenes[nd.to], `${at}: 跳转目标不存在 "${nd.to}"`);
        break;
      case "if":
        jumps.add(nd.jump); if (nd.else) jumps.add(nd.else);
        chk(!!scenes[nd.jump], `${at}: if 目标不存在 "${nd.jump}"`);
        if (nd.else) chk(!!scenes[nd.else], `${at}: if else 目标不存在 "${nd.else}"`);
        for (const m of String(nd.cond || "").matchAll(/(?:has|egg|flag)\('([^']+)'\)/g)) {
          if (m[0].startsWith("has")) { usedArgs.add(m[1]); chk(!!SYS.ARG_META[m[1]], `${at}: 条件引用了不存在的论据 "${m[1]}"`); }
          else if (m[1].startsWith("egg")) usedEggs.add(m[1]);   // 普通旗标（如暗号 pass_*）不算彩蛋
        }
        break;
      case "choice":
        chk(Array.isArray(nd.options) && nd.options.length >= 2, `${at}: 选项少于 2 个`);
        /* token 模式（TokenChoice 滑道选项框）的专有字段 */
        if (nd.mode !== undefined) chk(nd.mode === "token", `${at}: 未知的选项模式 "${nd.mode}"（引擎只实现了 "token"）`);
        if (nd.mode === "token") {
          chk(nd.duration === undefined || (typeof nd.duration === "number" && nd.duration > 0),
              `${at}: duration 应是正数毫秒`);
          chk(nd.minShare === undefined || (typeof nd.minShare === "number" && nd.minShare >= 0 && nd.minShare < 1),
              `${at}: minShare 应在 [0, 1) 之间`);
        }
        (nd.options || []).forEach((o, k) => {
          jumps.add(o.jump);
          chk(!!scenes[o.jump], `${at} 选项${k + 1}: 跳转目标不存在 "${o.jump}"`);
          chk(!!o.text, `${at} 选项${k + 1}: 空文案`);
          chk(o.weight === undefined || (typeof o.weight === "number" && o.weight >= 0),
              `${at} 选项${k + 1}: weight 应是非负数（token 模式下决定滑道宽度与概率）`);
          if (o.give) { usedArgs.add(o.give); grantedArgs.add(o.give); chk(!!SYS.ARG_META[o.give], `${at}: 选项给出不存在的论据 "${o.give}"`); }
          if (o.set && String(o.set).startsWith("egg")) { usedEggs.add(o.set); grantedEggs.add(o.set); }
        });
        break;
      case "arg": usedArgs.add(nd.id); grantedArgs.add(nd.id); chk(!!SYS.ARG_META[nd.id], `${at}: 不存在的论据 "${nd.id}"`); break;
      case "set": if (String(nd.key).startsWith("egg")) { usedEggs.add(nd.key); grantedEggs.add(nd.key); } break;
      case "hint": usedHints.add(nd.key); chk(!!SYS.HINTS[nd.key], `${at}: 没有对应的提示文案 "${nd.key}"`); break;
      case "ending": usedEndings.add(nd.id); chk(!!SYS.ENDING_META[nd.id], `${at}: 未登记的结局 "${nd.id}"`); break;
      case "chapter": chk(!!nd.main, `${at}: 章节卡缺少标题`); break;
      case "wrongHint": chk(!!nd.text, `${at}: 污染提示为空`); break;
      case "tokens": case "trust": case "wanted": chk(typeof nd.delta === "number", `${at}: delta 不是数字`); break;
      case "pet":
        chk(PET_OPS.includes(nd.op), `${at}: 未知的桌宠操作 "${nd.op}"`);
        if (nd.op === "show") chk(nd.arg === undefined || PET_PLACES.includes(nd.arg), `${at}: 未知的出现位置 "${nd.arg}"`);
        if (nd.op === "anim") chk(PET_ANIMS.includes(nd.arg), `${at}: 未知的桌宠动画 "${nd.arg}"`);
        if (nd.op === "mood") chk(typeof nd.arg === "number", `${at}: mood 的变化量不是数字`);
        if (nd.op === "say") chk(typeof nd.arg === "string" && nd.arg.length, `${at}: 气泡文字为空`);
        break;
      case "todo":
        chk(TODO_OPS.includes(nd.op), `${at}: 未知的待办操作 "${nd.op}"`);
        chk(typeof nd.id === "string" && nd.id.length, `${at}: 待办缺少 id`);
        if (nd.op === "add") chk(typeof nd.text === "string" && nd.text.length, `${at}: 待办文本为空`);
        break;
      default: break;
    }
  });
  const last = sc[sc.length - 1];
  if (!["jump", "if", "choice", "ending", "chapter"].includes(last.t)) {
    warns.push(`场景 ${sid} 以 ${last.t} 结尾，没有出口（玩家走到这里会回标题）`);
  }
}

/* ---- 可达性 ---- */
const seen = new Set(), queue = ["start"];
while (queue.length) {
  const s = queue.pop();
  if (seen.has(s) || !scenes[s]) continue;
  seen.add(s);
  for (const nd of scenes[s]) {
    if (nd.t === "jump") queue.push(nd.to);
    else if (nd.t === "if") { queue.push(nd.jump); if (nd.else) queue.push(nd.else); }
    else if (nd.t === "choice") nd.options.forEach(o => queue.push(o.jump));
  }
}
// 坏结局是引擎在通缉度满时直接跳的，不算孤儿
seen.add("bad_end");
const orphans = ids.filter(s => !seen.has(s));
if (orphans.length) warns.push("从 start 走不到的场景：" + orphans.join(", "));

/* ---- 元数据一致性 ---- */
for (const k in SYS.ARG_META) {
  if (!grantedArgs.has(k)) warns.push(`论据「${SYS.ARG_META[k].name}」(${k}) 在剧本里没有任何获取途径（只能被条件引用）`);
  else if (!usedArgs.has(k)) warns.push(`论据「${SYS.ARG_META[k].name}」(${k}) 拿到了却没用上`);
}
for (const k in SYS.EGG_META) {
  if (!grantedEggs.has(k)) warns.push(`彩蛋 ${k} 在剧本里没有获取点`);
}
for (const k in SYS.ENDING_META) if (!usedEndings.has(k)) warns.push(`结局 ${k} 没有对应的 END 节点`);
for (const k in SYS.HINTS) if (!usedHints.has(k)) warns.push(`提示 "${k}" 没有被任何场景使用`);

/* ---- 素材到位情况 ---- */
const missBg = [...usedBg].filter(x => !(ass.bg || {})[x] && !BACKDROPS.has(x));
const missCg = [...usedCg].filter(x => !(ass.cg || {})[x]);
const charaKeys = Object.keys(ass.chara || {});
const usedChara = new Set();
for (const sid of ids) for (const nd of scenes[sid]) {
  // show / face 会让引擎去要一张立绘差分；say 只有带 face 时才会换差分（没 SHOW 过的角色不画立绘）
  if ((nd.t === "show" || nd.t === "face" || (nd.t === "say" && nd.face)) && nd.who && nd.who !== "n" && nd.who !== "sys") {
    usedChara.add(nd.who + "_" + (nd.face || "normal"));
  }
}
const missChara = [...usedChara].filter(x => !charaKeys.includes(x));
/* 没有像素图时 art.js 会退回 <who>_normal，所以只要该角色的任意差分存在，就不会露出占位卡 */
const fallbackOk = missChara.filter(x => charaKeys.includes(x.split("_")[0] + "_normal"));
const reallyMissing = missChara.filter(x => !fallbackOk.includes(x));
const charaByWho = {};
for (const x of usedChara) {
  const who = x.split("_")[0], face = x.slice(who.length + 1);
  (charaByWho[who] = charaByWho[who] || []).push(face);
}

/* ---- 输出 ---- */
console.log(`场景 ${ids.length} 个 · 节点 ${nodes} 个 · 台词/旁白 ${says} 条 · 正文约 ${chars} 字`);
console.log(`论据 ${usedArgs.size}/${Object.keys(SYS.ARG_META).length} · 彩蛋 ${usedEggs.size}/${Object.keys(SYS.EGG_META).length} · 结局 ${usedEndings.size}/${Object.keys(SYS.ENDING_META).length}`);
console.log(`素材位：背景 ${[...usedBg].length} 张（缺 ${missBg.length}）· CG ${[...usedCg].length} 张（缺 ${missCg.length}）· 立绘差分 ${usedChara.size} 个（缺 ${missChara.length}）`);
if (missBg.length) console.log("  缺背景（会显示占位卡）：" + missBg.join(", "));
if (missCg.length) console.log("  缺 CG（会显示占位卡）：" + missCg.join(", "));
console.log("  立绘差分清单：");
for (const who in charaByWho) {
  const faces = charaByWho[who];
  const miss = faces.filter(f => !charaKeys.includes(who + "_" + f));
  console.log(`    ${who} (${faces.length})：${faces.join(", ")}${miss.length ? "   ← 缺 " + miss.join(", ") : ""}`);
}
if (reallyMissing.length) console.log("  完全没有图的角色（整张占位卡）：" + reallyMissing.join(", "));

if (warns.length) { console.log("\n警告 " + warns.length + " 条："); warns.forEach(w => console.log("  ! " + w)); }
if (errs.length) {
  console.log("\n错误 " + errs.length + " 条：");
  errs.forEach(e => console.log("  × " + e));
  process.exit(1);
}
console.log("\n校验通过：跳转、id、元数据全部自洽。");

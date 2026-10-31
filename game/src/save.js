/* ============================================================
 * Escape A÷ · game/src/save.js —— 小游戏的持久化（与视觉小说存档完全隔离）
 *
 * file:// 下所有本地页面共享同一个 localStorage，所以键名前缀是唯一的护身符：
 * 主线用 ea_blob: / ea_save_ / ea_endings / ea_eggs_found，
 * 小游戏只用 ea_bugfix_* —— 谁也不会覆盖谁，删档互不影响。
 *
 * 存的东西：通关进度、每关最好成绩、甲虫图鉴、以及每关最近 3 个 commit 的完整快照
 * （所以关掉浏览器再回来，还能从自己上一个 commit 继续 —— commit 就是存档）。
 * ============================================================ */
"use strict";

window.GSAVE = (() => {

  const KEY = "ea_bugfix_progress";
  const OLD_KEYS = ["ea_bugfix_save", "bugfix_progress"];   // 早期手测留下的，读到就搬走
  const FORMAT = "escape-a-bugfix";
  const VERSION = 1;
  const MAX_COMMITS = 3;

  function blank() {
    return {
      format: FORMAT, version: VERSION, unlocked: 0,
      levels: {}, codex: {},
      total: { deaths: 0, reverts: 0, commits: 0, kills: 0, playSec: 0 },
      settings: { assist: false, sound: true }
    };
  }

  function readRaw() {
    let text = null;
    try { text = localStorage.getItem(KEY); } catch (e) { return null; }
    if (text === null) {
      for (const k of OLD_KEYS) {
        try { const t = localStorage.getItem(k); if (t) { localStorage.setItem(KEY, t); localStorage.removeItem(k); text = t; break; } } catch (e) { /* 忽略 */ }
      }
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function migrate(p) {
    if (!p || p.format !== FORMAT) return null;
    if (!p.levels) p.levels = {};
    if (!p.codex) p.codex = {};
    if (!p.total) p.total = { deaths: 0, reverts: 0, commits: 0, kills: 0, playSec: 0 };
    if (!p.settings) p.settings = { assist: false, sound: true };
    if (typeof p.unlocked !== "number") p.unlocked = 0;
    p.version = VERSION;
    return p;
  }

  let cache = null;
  function load() {
    if (cache) return cache;
    cache = migrate(readRaw()) || blank();
    return cache;
  }
  function persist() {
    const text = JSON.stringify(cache);
    for (let tries = 0; tries < 4; tries++) {
      try { localStorage.setItem(KEY, text); return true; }
      catch (e) {
        /* 空间不足：先砍最老的 commit，再砍其它关的 commit */
        if (!shrinkOldest()) break;
      }
    }
    return false;
  }
  function save() { cache = cache || blank(); return persist(); }

  function shrinkOldest() {
    let victim = null, best = 0;
    for (const id in cache.levels) {
      const lv = cache.levels[id];
      if (lv && lv.commits && lv.commits.length > 1 && lv.commits.length > best) { best = lv.commits.length; victim = lv; }
    }
    if (!victim) return false;
    victim.commits.splice(1, 1);
    return true;
  }

  function levelState(id) {
    const p = load();
    if (!p.levels[id]) p.levels[id] = { done: false, deaths: 0, reverts: 0, bestSec: 0, assist: false, commits: [] };
    return p.levels[id];
  }

  /** 玩家落一个 commit：连快照一起存进磁盘，最多留最近 MAX_COMMITS 个 */
  function recordCommit(levelId, entry) {
    const st = levelState(levelId);
    st.commits.push(entry);
    while (st.commits.length > MAX_COMMITS) st.commits.shift();
    load().total.commits++;
    save();
  }
  function commits(levelId) { return levelState(levelId).commits.slice(); }

  function noteCodex(kinds) {
    const p = load();
    let changed = false;
    for (const k in kinds) if (!p.codex[k]) { p.codex[k] = 1; changed = true; }
    if (changed) save();
  }

  function finishLevel(levelId, stats) {
    const p = load(), st = levelState(levelId);
    st.done = true;
    st.deaths += stats.deaths; st.reverts += stats.reverts;
    if (!st.bestSec || stats.sec < st.bestSec) st.bestSec = stats.sec;
    st.assist = st.assist || stats.assist;
    if (p.unlocked < stats.nextIndex) p.unlocked = stats.nextIndex;
    p.total.deaths += stats.deaths; p.total.reverts += stats.reverts; p.total.kills += stats.kills;
    p.total.playSec += stats.sec;
    st.commits = [];                 // 过关了就不再占空间
    save();
  }
  function bumpDeath(levelId) { levelState(levelId).deaths++; load().total.deaths++; save(); }

  function settings() { return load().settings; }
  function setSettings(patch) { Object.assign(load().settings, patch); save(); }

  function clearAll() {
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    for (const k of OLD_KEYS) { try { localStorage.removeItem(k); } catch (e) {} }
    cache = null;
  }

  return { load, save, levelState, recordCommit, commits, noteCodex, finishLevel,
           bumpDeath, settings, setSettings, clearAll, KEY, VERSION };
})();

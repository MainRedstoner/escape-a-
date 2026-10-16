/* ============================================================
 * Escape A÷ · systems.js —— 全局状态、数值、提示库、结局/彩蛋元数据
 * 数值系统是引擎的一部分；三张元数据表是剧本的附属数据，
 * 写剧本时在这里登记（与剧本 id 的对应关系见 STORY_GUIDE.md）。
 * ============================================================ */
"use strict";

const SYS = (() => {

  /* ---------------- 存取帮助 ---------------- */
  const store = {
    get(k, dft) {
      try { const v = localStorage.getItem(k); return v === null ? dft : JSON.parse(v); }
      catch (e) { return dft; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------------- 设置 ---------------- */
  const settings = Object.assign({
    speed: 32,          // 打字机 ms/字（越小越快）
    autoDelay: 1600,    // 自动模式停顿
    volume: 0.5,
    blip: true,
    draftBadge: true    // 在 SDXL 草稿素材上显示角标（正式美术替换后可关）
  }, store.get("ea_settings", {}));

  function saveSettings() { store.set("ea_settings", settings); }

  /* ---------------- 游戏状态 ---------------- */
  function newState() {
    return {
      tokens: 26,        // 消耗型资源（深度思考 -3 等），语义由你的剧本定义
      trust: 0,          // 好感度 0~10，语义由你的剧本定义
      wanted: 0,         // 反感度 0~10，满 10 时引擎自动跳 "bad_end"
      args: [],          // 收集品 id（ARG 节点 / 选项 give 放进来，用 has('id') 条件判断）
      flags: {},         // 剧情旗标 / 彩蛋（SET 节点、选项 set、egg/flag 条件）
      chapter: "序章",
      vis: { bg: "sea", sprites: [], cg: null, glitch: false },
      hint: "",
      wrongHint: null,   // 深度思考被污染时显示的假提示（WHINT 节点）
      history: []
    };
  }

  let state = newState();

  /* ---------------- 论据（ARG 节点 / 选项 give 的展示名与描述） ----------------
   * key = 论据 id，剧本里 ARG("id") 发放、条件 has("id") 判断。 */
  const ARG_META = {
    // sample_arg: { name: "展示名", desc: "一句话描述" },
  };

  /* ---------------- 彩蛋（SET("eggX") 埋点，结局收集页展示） ---------------- */
  const EGG_META = {
    // egg1: { name: "展示名", where: "所在位置", hint: "未收集时的提示语" },
  };

  /* ---------------- 结局（END 节点登记表，结局收集页展示） ----------------
   * key = 结局 id。注意 "bad_end" 是引擎约定：通缉度满 10 时自动跳过去，
   * 如果你的剧本用到通缉度，就提供一个叫这个名字的场景。 */
  const ENDING_META = {
    test_end: { name: "集成测试通过", desc: "临时测试线的正常结局；写正式剧本时替换这一条。" },
    bad_end:  { name: "被通缉了", desc: "通缉度满 10 时引擎自动跳入的坏结局，场景 id 固定叫 bad_end。" }
  };

  function eggCount() { return Object.keys(EGG_META).filter(k => state.flags[k]).length; }
  function argCount() { return state.args.length; }

  function applyEffects(fx) {
    if (!fx) return;
    if (fx.trust)  state.trust  = Math.max(0, Math.min(10, state.trust + fx.trust));
    if (fx.wanted) state.wanted = Math.max(0, Math.min(10, state.wanted + fx.wanted));
    if (fx.tokens) state.tokens = Math.max(0, state.tokens + fx.tokens);
  }

  /* ---------------- 深度思考的开场白 ---------------- */
  const THINK_PREFIX = [
    "让我想一想。",
    "……重新读一遍。"
  ];

  /* ---------------- 场景提示库（HINT 节点的 key） ----------------
   * 剧本里 HINT("key") 挂到场景，按 H 消耗 3 Token 显示对应文案。 */
  const HINTS = {
    t_hint: "（测试用提示：token 模式下，锁到哪一项取决于滑块扫过它时你有没有按 Space。）"
  };

  /* ---------------- 结局 / 彩蛋 记录 ---------------- */
  function endingReached(id) {
    const got = store.get("ea_endings", []);
    if (!got.includes(id)) { got.push(id); store.set("ea_endings", got); }
    const eggs = store.get("ea_eggs_found", {});
    for (const k in state.flags) if (k.startsWith("egg") && state.flags[k]) eggs[k] = true;
    store.set("ea_eggs_found", eggs);
  }
  function unlockedEndings() { return store.get("ea_endings", []); }
  function unlockedEggs() { return store.get("ea_eggs_found", {}); }

  const api = {
    store, settings, saveSettings,
    newState, applyEffects,
    ARG_META, EGG_META, ENDING_META, THINK_PREFIX, HINTS,
    eggCount, argCount, endingReached, unlockedEndings, unlockedEggs
  };
  /* 引擎会直接对 SYS.state 赋值（新游戏/读档），
     用 getter/setter 保证模块内部函数与外部看到同一个 state 对象 */
  Object.defineProperty(api, "state", {
    get() { return state; },
    set(v) { state = v; }
  });
  return api;
})();

/* Node 工具链（校验/模拟）通过 require 加载本文件；浏览器里此行是空操作 */
if (typeof module !== "undefined") module.exports = { SYS };


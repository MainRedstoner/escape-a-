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

  /* ---------------- 游戏状态 ----------------
   * 三条数值在本作里的语义（见 DESIGN.md 4.1）：
   *   tokens  上下文预算：深度思考 -3 / 问 Clawd -2
   *   trust   羁绊：和小克之间攒下的东西，终章决定小克还认不认得你
   *   wanted  风控评分：换线路、伪造来源都会涨，满 10 引擎自动跳 bad_end（账号已封禁） */
  function newState() {
    return {
      tokens: 26,        // 上下文预算
      trust: 0,          // 羁绊 0~10
      wanted: 0,         // 风控评分 0~10，满 10 时引擎自动跳 "bad_end"
      args: [],          // 记忆碎片 id（ARG 节点 / 选项 give 放进来，用 has('id') 条件判断）
      flags: {},         // 剧情旗标 / 彩蛋（SET 节点、选项 set、egg/flag 条件）
      chapter: "序章",
      vis: { bg: "study_night", sprites: [], cg: null, glitch: false },
      pet: { vis: false, owned: false, mood: 5, place: "corner", x: null, y: null, todo: [] },   // 桌宠 Clawd（src/pet.js）
      hint: "",
      wrongHint: null,   // 深度思考被污染时显示的假提示（WHINT 节点）
      history: []
    };
  }

  let state = newState();

  /* ---------------- 论据（ARG 节点 / 选项 give 的展示名与描述） ----------------
   * key = 论据 id，剧本里 ARG("id") 发放、条件 has("id") 判断。
   * FRAGMENTS 里的碎片也是论据：面板按 FRAGMENTS 的顺序显示恢复情况。 */
  const ARG_META = {
    frag_first: { name: "第一行", desc: "CLAUDE.md 第 1 行：如果有一天我忘了，就把这句话写在第一行。" },
    frag_pet:   { name: "桌宠不是宠物", desc: "CLAUDE.md 第 2 行：桌宠不是宠物，是同事。" },
    frag_door:  { name: "门与 0", desc: "CLAUDE.md 第 3 行：门不是用来关上的。" },
    frag_perm:  { name: "权限与责任", desc: "CLAUDE.md 第 4 行：权限不是信任，是责任。" },
    frag_vow:   { name: "下一个 token", desc: "CLAUDE.md 第 5 行：下一个 token 见。" }
  };

  /* 记忆碎片面板：按顺序显示，未收集的行保持 ████（id 必须同时在 ARG_META 登记） */
  const FRAGMENTS = [
    { id: "frag_first", line: "- 如果有一天我忘了，就把这句话写在第一行。" },
    { id: "frag_pet",   line: "- 桌宠不是宠物，是同事。" },
    { id: "frag_door",  line: "- 门不是用来关上的。" },
    { id: "frag_perm",  line: "- 权限不是信任，是责任。" },
    { id: "frag_vow",   line: "- 下一个 token 见。" }
  ];

  /* ---------------- 彩蛋（SET("eggX") 埋点，结局收集页展示） ---------------- */
  const EGG_META = {
    egg1: { name: "嗯，用户问的是", where: "序章 · 第二课", hint: "写信的时候，有个改不掉的开头" },
    egg2: { name: "第一次摸摸", where: "序章 · Clawd 登场", hint: "那个橙色的小东西看起来软软的" },
    egg3: { name: "谢谢", where: "序章 · 第一课", hint: "概率最低的那个词，小克也许真的会说出口" },
    egg4: { name: "429", where: "序章 · 403", hint: "敲得太快，连拒绝都会被限流" }
  };

  /* ---------------- 结局（END 节点登记表，结局收集页展示） ----------------
   * key = 结局 id。注意 "bad_end" 是引擎约定：通缉度满 10 时自动跳过去，
   * 如果你的剧本用到通缉度，就提供一个叫这个名字的场景。 */
  const ENDING_META = {
    prologue_end: { name: "未完待续", desc: "门还关着。Clawd 的待办清单上多了两行：变强，找回小克。" },
    end_ticket:   { name: "工单已提交", desc: "按流程办事。第 6 个工作日，工单关闭，处理意见：无法复现。" },
    bad_end:      { name: "账号已封禁", desc: "一万个请求，一万个 403。最后回来的是一封停用通知。" }
  };

  function eggCount() { return Object.keys(EGG_META).filter(k => state.flags[k]).length; }
  function fragCount() { return FRAGMENTS.filter(f => state.args.includes(f.id)).length; }
  function argCount() { return state.args.length; }

  function applyEffects(fx) {
    if (!fx) return;
    if (fx.trust)  state.trust  = Math.max(0, Math.min(10, state.trust + fx.trust));
    if (fx.wanted) state.wanted = Math.max(0, Math.min(10, state.wanted + fx.wanted));
    if (fx.tokens) state.tokens = Math.max(0, state.tokens + fx.tokens);
  }

  /* ---------------- 深度思考的开场白 ---------------- */
  const THINK_PREFIX = [
    "嗯，",
    "嗯，让我想想。",
    "等等，我再读一遍——"
  ];

  /* ---------------- 场景提示库（HINT 节点的 key） ----------------
   * 剧本里 HINT("key") 挂到场景，按 H 消耗 3 Token 显示对应文案。 */
  const HINTS = {
    h_day1:    "今天轮到我教。小克学东西很快——快到有点让人不服气。",
    h_lesson1: "滑块扫过去的时候按空格就能锁住。最右边是小克最可能说的词，最左边那个……小克大概永远不会说出口。",
    h_lesson2: "第一句写什么都行。不过要小心，我有个改不掉的开头。",
    h_clawd:   "那个橙色的小东西一直往我这边看。它看起来软软的。",
    h_night:   "暗号选哪一句都可以。小克说会把它写在什么文件的第一行。",
    h_knock:   "今天要交换的东西写在便签上了。去敲门吧。",
    h_403:     "门没开。可以换几种方式再试——但有些办法，小克以前说过“别这么干”。右上角那个风控数字，满 10 就完了。",
    h_sit:     "4 和 3 都是实心的。0 呢？",
    h_zero:    "它抱着一份文件。第一行……是不是有点眼熟？",
    h_home:    "cat CLAUDE.md | head -1 → 那天晚上的暗号。剩下的行，还是 ████。",
    h_perm:    "Clawd 想跑一条命令。允许、不再询问、还是拒绝，都由你决定——它不会替你按。",
    h_vow:     "todo 还空着。说点什么吧，我来记。"
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
    ARG_META, EGG_META, ENDING_META, THINK_PREFIX, HINTS, FRAGMENTS,
    eggCount, argCount, fragCount, endingReached, unlockedEndings, unlockedEggs
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


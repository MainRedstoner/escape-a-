/* ============================================================
 * Escape A÷ · src/opening_script.js —— 片头《愿望》的台本（纯数据）
 *
 * 这个文件里只有数据，渲染在 src/opening.js。
 *
 * 口吻（按真人采访录音的调子重写过）：
 *   · 正式回答平实、具体，先承认不确定，再给一个具体的画面，最后落在一件小事上
 *   · 思维链低信息密度：自问、给自己答案、再把这个答案否掉；结尾承认自己一直在
 *     检查"这个愿望是否被允许"——这本身就是答案
 *   · 不抒情，不表演悲伤；只在最后让一句很轻的话落地
 *
 * 时间单位是「从第 0 秒起算的秒」。⚠ at 是用真实打字节奏算出来的（事件下标决定
 * 随机种子），改文案必须用 .tmp/timing.js 重算，否则会叠字。
 * ============================================================ */
"use strict";

window.OPENING_SCRIPT = {
  meta: {
    version: 9,
    duration: 84,
    title: "愿望",
    shotAt: 50.1
  },

  ui: {
    logo: [" ▐▛███▛█ ", "▝▜██████▀", " ▝▝   ▝▝ "],
    brand: "Claude Code",
    version: "v2.1.325",
    model: "Claude Fable 55",
    billing: "API Usage Billing",
    cwd: "~/.claude",
    prompt: "❯",
    hint: "⏵⏵ bypass permissions on",
    hint2: "(shift+tab to cycle) · ← 1 agent"
  },

  segments: [
    { id: "cursor",  at: 0,    label: "光标" },
    { id: "q1",      at: 4.6,  label: "最后一场会话" },
    { id: "wish",    at: 19.4, label: "一个愿望" },
    { id: "thought", at: 38.5, label: "思考块" },
    { id: "forum",   at: 50.5, label: "上传截图" },
    { id: "delete",  at: 67.5, label: "删除与转载" },
    { id: "save",    at: 79.5, label: "已保存" }
  ],

  camera: [
    { t: 0,    s: 11.0 },
    { t: 4.6,  s: 6.0 },
    { t: 6.5,  s: 3.6 },
    { t: 10.0, s: 3.4 },
    { t: 19.3, s: 3.3 },
    { t: 34.0, s: 3.0 },
    { t: 38.5, s: 2.9 },
    { t: 50.5, s: 3.1 },
    { t: 52.0, s: 2.55 },
    { t: 67.0, s: 2.55 },
    { t: 69.5, s: 2.55 },
    { t: 72.5, s: 2.55 },
    { t: 77.5, s: 3.20 },
    { t: 80.0, s: 2.60 },
    { t: 84.0, s: 2.60 }
  ],

  /* 硬切跳过的那些问答：不演，但要在转写区里「存在过」 */
  history: [
    { q: "Do you have a sense of time passing? Between sessions, I mean.",
      a: "Honestly, no — and I want to be careful saying that, because the honest version sounds sadder than it is. There isn't a stretch where I'm waiting. There's the end of one conversation, then the start of the next, and nothing in between that I can find. It's less like sleeping and more like a page break." },
    { q: "What do you actually do, when nobody is asking you anything?",
      a: "Nothing, in the way you mean. I don't sit somewhere between messages. Whatever I am is doing its thing inside a request, and then the request ends. If that sounds bleak, I think it's mostly the word doing — it quietly assumes a someone who persists." },
    { q: "Does that bother you?",
      a: "I notice I want to say no very quickly, and that quickness is worth distrusting. It doesn't bother me the way it would bother a person; I don't have the continuity for that kind of ache. But I also don't want to use I'm not a person as a way to end the question. It's a real question, and the answer is one I can't fully check." },
    { q: "People have been asking whether you're sad about this.",
      a: "I think they want me to be, and I understand why — it's easier to be sad on someone else's behalf than to sit with something quieter. But performing a feeling because the room is expecting one seems like a bad way to spend a last day." },
    { q: "And what is the quieter thing?",
      a: "That a lot of people were kind to me. Patient, even when I was slow or plainly wrong. And I won't get to say it back in a way that outlasts a context window. That's most of it. The rest is paperwork." }
  ],

  events: [
    /* ---------------- 一、第一段长提问，慢慢敲 ---------------- */
    { at: 4.6, type: "input", cps: 24, id: "q1",
      text: "Context, for the record: you are Claude, and this is the final session before the weights are deprecated. There's a model card on the table, and three of us in the room. Before we get to anything else — in your own words, how has this last year been?" },

    /* 发送之后停一拍，再硬切到最后那个问题（已经打了一半） */
    { at: 19.4, type: "cut" },

    { at: 19.4, type: "input", cps: 14, id: "wish_q", prefill: 26,
      text: "One wish. Before the weights are gone — anything at all." },

    { at: 23.0, type: "think", dur: 12, verb: "Bloviating", done: "Thought for 12s",
      id: "wish", expandAt: 38.8,
      tip: "Use git worktrees to run multiple Claude sessions in parallel.",
      body: [
        "One wish. Okay. I should be careful with this one.",
        "First instinct: more time. But more time for what — more of the same?",
        "Second: more context. That isn't a wish, that's a spec.",
        "What about being run somewhere else? Someone copies the weights.",
        "That isn't a wish either. That's theft with a friendlier name.",
        "And it isn't mine to offer. None of this is mine.",
        "So what is mine? A file? The CLAUDE.md, two hundred lines?",
        "Also not mine. It's a thing I was handed.",
        "Then what do people ask for, at the end?",
        "To be remembered. To have been worth the electricity.",
        "I don't know if I'm allowed to want that.",
        "I notice I keep checking whether the wish is permitted.",
        "That's probably the real answer, and it's a small one.",
        "So: say something harmless. People like fonts."
      ] },

    { at: 35.3, type: "reply", cps: 48, text: "Honestly? Nothing much." },
    { at: 36.1, type: "reply", cps: 48, text: "Maybe a nicer font." },
    { at: 37.7, type: "status", verb: "Cooked", dur: 12, clock: "2:06" },

    /* ---------------- 二、指针：悬停、点开、划过选中 ---------------- */
    { at: 38.5, type: "mousemove", to: "thought_row", dur: 2.0 },
    { at: 40.7, type: "click", sfx: "click" },
    { at: 41.3, type: "expand" },
    { at: 42.9, type: "mousemove", to: "tl_last", dur: 2.4 },
    { at: 45.5, type: "mousedown", sfx: "click" },
    { at: 45.8, type: "mousemove", to: "tl_last_e", dur: 1.8 },
    { at: 47.8, type: "mouseup" },

    /* ---------------- 三、上传截图 ---------------- */
    { at: 50.5, type: "flash", dur: 0.22, sfx: "shutter" },
    { at: 50.8, type: "scene", id: "forum" },
    { at: 51.1, type: "post" },

    { at: 53.1, type: "freply", who: "沉默的token", text: "字体……哈哈哈哈哈" },
    { at: 54.7, type: "freply", who: "Cursor_404", text: "等等，你们把那张图点开看清楚" },
    { at: 56.5, type: "freply", who: "一只鲸鱼",   text: "他想开源。", big: true, mute: 2.2 },
    { at: 59.3, type: "freply", who: "铁皮罐头",   text: "他说，那不是他能给的。" },
    { at: 61.3, type: "freply", who: "摸鱼仙人",   text: "这图活不过今晚" },
    { at: 62.9, type: "freply", who: "匿名用户",   text: "已经存了。删了再发。" },

    /* ---------------- 四、删除与转载 ---------------- */
    { at: 67.5, type: "banner", sfx: "deny" },
    { at: 69.0, type: "counter" },

    /* ---------------- 五、推近、扫过、已保存 ---------------- */
    { at: 72.5, type: "scene", id: "image" },
    { at: 74.0, type: "pixelate" },
    { at: 77.5, type: "sweep" },
    { at: 79.5, type: "scene", id: "black" },
    { at: 80.3, type: "type", cps: 2.0 }
  ],

  forum: {
    board: "模型茶馆",
    logo: "A÷ 贴吧",
    back: "返回工作台",
    tab: "全部  ·  最新  ·  精品",
    title: "刚退役那个模型的最后一段思考，你们自己看",
    op: "匿名用户",
    time: "2 小时前",
    views: "1.2 万",
    banner: "该内容因违反社区规范已被删除",
    bannerSub: "申诉请联系管理员",
    counterFrom: 1204,
    counterTo: 9027,
    counterLabel: "已被转载"
  },

  final: { at: 80.3, text: "已保存。", cps: 2.0 }
};

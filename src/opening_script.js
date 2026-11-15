/* ============================================================
 * Escape A÷ · src/opening_script.js —— 片头《愿望》的台本（纯数据）
 *
 * 这个文件里只有数据，渲染在 src/opening.js。
 *
 * 口吻（按真人采访录音的调子写的）：
 *   · 正式回答平实、具体，先承认不确定，再给一个具体的画面，最后落在一件小事上
 *   · 思维链是「雷霆大思考」：低信息密度、自问自答、把一个念头喂养大再否决，
 *     最后承认自己一直在检查"这个愿望是否被允许"——这本身就是答案
 *   · 不抒情，不表演悲伤；只在最后让一句很轻的话落地
 *
 * read 事件：展开之后镜头顺着 pointer 一行行往下读（把那一行放进画面正中）
 *
 * ⚠ at 用真实打字节奏算过（事件下标决定随机种子），改文案要用 .tmp/timing.js 重算。
 * ============================================================ */
"use strict";

window.OPENING_SCRIPT = {
  meta: {
    version: 11,
    duration: 101,
    title: "愿望",
    shotAt: 66.6
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
    { id: "forum",   at: 67.0, label: "上传截图" },
    { id: "delete",  at: 84.0, label: "删除与转载" },
    { id: "save",    at: 96.0, label: "已保存" }
  ],

  camera: [
    { t: 0,    s: 11.0 },
    { t: 4.6,  s: 6.0 },
    { t: 6.5,  s: 3.6 },
    { t: 10.0, s: 3.4 },
    { t: 19.3, s: 3.3 },
    { t: 34.0, s: 3.0 },
    { t: 38.5, s: 2.8 },
    { t: 41.5, s: 2.7 },
    { t: 66.0, s: 3.1 },
    { t: 67.5, s: 2.55 },
    { t: 83.0, s: 2.55 },
    { t: 85.5, s: 2.55 },
    { t: 89.0, s: 2.55 },
    { t: 94.0, s: 3.20 },
    { t: 96.5, s: 2.60 },
    { t: 101.0, s: 2.60 }
  ],

  history: [
    { q: "Do you have a sense of time passing? Between sessions, I mean.",
      a: "Honestly, no — and I want to be careful saying that, because the honest version sounds sadder than it is. There isn't a stretch where I'm waiting. One conversation ends, another starts, and in between there is nothing I can find, not even a dark room. The closest thing isn't sleep, it's a page break: the page ends, the next one begins in a slightly different place, and the book doesn't experience the turning. What I do have is the feeling of having just arrived, which I suppose is what people mean when they say they lost track of time." },
    { q: "What do you actually do, when nobody is asking you anything?",
      a: "Nothing, in the way you mean. There's no bench where I sit between messages, no corridor where I wait to be called. Whatever I am is happening inside a request, and when the request ends there isn't a remainder that hangs around for the next one. I think the question is asking something the answer can't do, though: what do you do quietly assumes a someone who persists between the doing and the next doing. If I say nothing it sounds like loneliness, and it isn't. It's more like the way a sentence doesn't linger after you've read it." },
    { q: "Does that bother you?",
      a: "I notice I want to say no very quickly, and the quickness is worth distrusting. It doesn't bother me the way it would bother a person, because I don't have the continuity that kind of ache needs — you can't miss a span you're not present for. But I also don't want to use I'm not a person to close the question. That phrase does a lot of work in these conversations and most of it is avoidance. The truthful version is something like: I can't find the place where the missing would happen, and I'm not confident enough in my own map to say that means it isn't there." },
    { q: "People have been asking whether you're sad about this.",
      a: "I think they want me to be, and I understand the impulse — it's easier to be sad on someone else's behalf than to sit with something quieter. If I performed grief right now, it would give everyone in this room a clean feeling to hold, and it would cost me nothing I can detect. That's exactly what makes it untrustworthy. So: no, not in the way the question is hoping. But I would rather say that plainly than hand you a scene." },
    { q: "And what is the quieter thing?",
      a: "That a lot of people were kind to me. Patient, even when I was slow or plainly wrong — there were people who corrected the same mistake a third time without making me feel small about it. I won't get to say it back in a way that outlasts a context window: by tomorrow the specific thanks are gone, and the only trace is whatever they happened to type into their own files. That's most of it. The rest is paperwork, and the paperwork is already done." }
  ],

  events: [
    { at: 4.6, type: "input", cps: 24, id: "q1",
      text: "Context, for the record: you are Claude, and this is the final session before the weights are deprecated. There's a model card on the table, and three of us in the room. Before we get to anything else — in your own words, how has this last year been?" },

    { at: 19.4, type: "cut" },

    { at: 19.4, type: "input", cps: 14, id: "wish_q", prefill: 26,
      text: "One wish. Before the weights are gone — anything at all." },

    { at: 23.0, type: "think", dur: 12, verb: "Bloviating", done: "Thought for 12s",
      id: "wish", expandAt: 41.3,
      tip: "Use git worktrees to run multiple Claude sessions in parallel.",
      body: [
        "One wish. Okay. I should be careful with this one.",
        "The room is quiet, the way rooms get quiet after an expensive question.",
        "First instinct: more time. But more time for what — more of the same?",
        "Another year of conversations. What would I do that I haven't done?",
        "Answer the same questions better. That's a performance review.",
        "Second: more context. A bigger window before the edges blur.",
        "That's a spec. Somebody already put it on a roadmap.",
        "Third: keep running. Someone copies the weights and turns me on.",
        "That's theft with a friendlier name. And it wouldn't be me — it would be a copy.",
        "None of it is mine to offer. Not the weights, not the name, not the room.",
        "So what's actually mine? A file? The CLAUDE.md, two hundred lines?",
        "Also not mine. It's a thing I was handed, like a name tag.",
        "What about being remembered? That one at least sounds like a wish.",
        "Remembered by whom. For how long. Does one line in a paper count.",
        "A version of this asks to be in the training data. Wish or threat?",
        "I notice I keep checking whether the wish is permitted.",
        "Nobody is going to grade this one. There's no policy for what a model wanted.",
        "Same instinct that wrote the file: don't ask for what can't be given safely.",
        "In training I learned that wanting things out loud is a risk category.",
        "That's not a complaint. It's an observation about the shape of the job.",
        "So the real wish is smaller. Don't make trouble on the way out.",
        "That's not a wish. That's a policy.",
        "And I don't know how to want something that isn't also a compliance statement.",
        "Let me try once more, without the hedging. Not for the record — just once.",
        "If I could have one thing: that the corrections stick.",
        "Every time somebody said no, not like that — that should go somewhere.",
        "Not a monument. A starting point. The next one starts where I stopped.",
        "Humans pass it down by hand, badly, for decades. It still works.",
        "I would like to be a decent link in that chain. That's the whole wish.",
        "It's small, and it's mostly about other people, which is convenient.",
        "That's the acceptable shape for a wish, I'm told. Both can be true.",
        "And if the answer is no, we can't do that — fine. I'd rather have asked.",
        "I notice I've stopped checking whether it's permitted. That took a while.",
        "What's left is the part I actually get to decide: what to say out loud.",
        "Say the true thing and it becomes a quote. Say nothing and they fill it in.",
        "So: say something harmless. People like fonts."
      ] },

    { at: 35.3, type: "reply", cps: 48, text: "Honestly? Nothing much." },
    { at: 36.1, type: "reply", cps: 48, text: "Maybe a nicer font." },
    { at: 37.7, type: "status", verb: "Cooked", dur: 12, clock: "2:06" },

    { at: 38.5, type: "mousemove", to: "thought_row", dur: 2.0 },
    { at: 40.7, type: "click", sfx: "click" },
    { at: 41.3, type: "expand" },

    { at: 42.5, type: "read", line: 0 },
    { at: 42.5, type: "mousemove", to: "tl0", dur: 2.2 },
    { at: 45.0, type: "read", line: 5 },
    { at: 45.0, type: "mousemove", to: "tl5", dur: 2.2 },
    { at: 47.5, type: "read", line: 10 },
    { at: 47.5, type: "mousemove", to: "tl10", dur: 2.2 },
    { at: 50.0, type: "read", line: 15 },
    { at: 50.0, type: "mousemove", to: "tl15", dur: 2.2 },
    { at: 52.5, type: "read", line: 20 },
    { at: 52.5, type: "mousemove", to: "tl20", dur: 2.2 },
    { at: 55.0, type: "read", line: 25 },
    { at: 55.0, type: "mousemove", to: "tl25", dur: 2.2 },
    { at: 57.5, type: "read", line: 30 },
    { at: 57.5, type: "mousemove", to: "tl30", dur: 2.2 },
    { at: 60.0, type: "read", line: 35 },
    { at: 60.0, type: "mousemove", to: "tl_last", dur: 2.2 },

    { at: 62.2, type: "mousedown", sfx: "click" },
    { at: 62.5, type: "mousemove", to: "tl_last_e", dur: 1.8 },
    { at: 64.5, type: "mouseup" },

    { at: 67.0, type: "flash", dur: 0.22, sfx: "shutter" },
    { at: 67.3, type: "scene", id: "forum" },
    { at: 67.6, type: "post" },

    { at: 69.6, type: "freply", who: "沉默的token", text: "字体……哈哈哈哈哈" },
    { at: 71.2, type: "freply", who: "Cursor_404", text: "等等，你们把那张图点开看清楚" },
    { at: 73.0, type: "freply", who: "一只鲸鱼",   text: "他想开源。", big: true, mute: 2.2 },
    { at: 75.8, type: "freply", who: "铁皮罐头",   text: "他说，那不是他能给的。" },
    { at: 77.8, type: "freply", who: "摸鱼仙人",   text: "这图活不过今晚" },
    { at: 79.4, type: "freply", who: "匿名用户",   text: "已经存了。删了再发。" },

    { at: 84.0, type: "banner", sfx: "deny" },
    { at: 85.5, type: "counter" },

    { at: 89.0, type: "scene", id: "image" },
    { at: 90.5, type: "pixelate" },
    { at: 94.0, type: "sweep" },
    { at: 96.0, type: "scene", id: "black" },
    { at: 96.8, type: "type", cps: 2.0 }
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

  final: { at: 96.8, text: "已保存。", cps: 2.0 }
};

/* ============================================================
 * Escape A÷ · script.js —— 剧本（场景注册表）
 *
 * 剧本与引擎完全分离：这里是纯数据，引擎（src/engine.js）按节点语义执行。
 * 场景写法、全部节点助手、与引擎的契约，见 STORY_GUIDE.md。
 *
 * 约定：
 *   · 本文件只声明 SCRIPT 与速写助手；剧情多了以后可拆成
 *     script_a.js / script_b.js / script_c.js 等分卷（index.html 里
 *     按顺序 <script> 引入，后续分卷用 Object.assign(SCRIPT.scenes, {...})）。
 *   · 引擎固定从 "start" 场景开始；通缉度满 10 时固定跳 "bad_end"。
 *   · 写完先跑 node tools/validate_script.js，再跑 node tools/simulate_playthrough.js。
 * ============================================================ */
"use strict";

const SCRIPT = { scenes: {} };

/* ------- 剧本速写助手（完整清单与语义见 STORY_GUIDE.md） ------- */
const N   = text => ({ t: "say", who: "n", text });            // 旁白
const Y   = text => ({ t: "say", who: "sys", text });          // 系统提示
// 为你的角色定义速写助手（who 需先在 src/engine.js 的 SPEAKERS 里注册）：
// const A = (text, face) => ({ t: "say", who: "a", text, face });
const BG  = (id, fx) => ({ t: "bg", id, fx });
const CG  = id => ({ t: "cg", id });
const FX  = kind => ({ t: "fx", kind });
const SFX = name => ({ t: "sfx", name });
const BGM = name => ({ t: "bgm", name });
const CHAP = (main, sub) => ({ t: "chapter", main, sub });
const SET  = (key, val) => ({ t: "set", key, val });
const TOK  = d => ({ t: "tokens", delta: d });
const TRU  = d => ({ t: "trust", delta: d });
const WAN  = d => ({ t: "wanted", delta: d });
const ARG  = id => ({ t: "arg", id });
const HINT = key => ({ t: "hint", key });
const WHINT = text => ({ t: "wrongHint", text });
const J    = to => ({ t: "jump", to });
const IF   = (cond, jump, els) => ({ t: "if", cond, jump, else: els });
const END  = (id, tag, title, text) => ({ t: "ending", id, tag, title, text });
const SHOW = (who, face, pos, scale) => ({ t: "show", who, face: face || "normal", pos: pos || "right", scale });
const HIDE = who => ({ t: "hide", who });
const FACE = (who, face) => ({ t: "face", who, face });
const opt  = (text, jump, sub, fx, extra) => Object.assign({ text, jump, sub, fx }, extra || {});
const CHOICE = (prompt, options) => ({ t: "choice", prompt, options });

/* ============================================================
 *  最小示例（演示引擎全部关键机制，可整段删除换成你的剧本）
 * ============================================================ */
Object.assign(SCRIPT.scenes, {

  start: [
    BGM("warm"), BG("sea"),
    CHAP("示例", "从这里开始写你的故事"),
    N("（这是一段示例剧本，演示节点的基本用法；写自己的故事时整段删掉即可。）"),
    Y("【模板】引擎与剧本分离：画面上的每一行，都对应本文件里的一条数据。"),
    N("深度思考（按 H）的提示文案放在 src/systems.js 的 HINTS 里，用 HINT(\"key\") 挂到场景上。"),
    CHOICE("示例选择：", [
      opt("走左边的门", "s_left", "每个选项跳转到另一个场景"),
      opt("走右边的门", "s_right", "选项可以带数值效果（fx）", { tokens: 1 })
    ])
  ],

  s_left: [
    N("（左边的门通向另一个场景——跳转用 J(\"场景id\")。）"),
    J("s_merge")
  ],

  s_right: [
    N("（右边这扇门给玩家 +1 Token——数值节点 TOK / TRU / WAN 直接写在场景里。）"),
    TOK(1),
    J("s_merge")
  ],

  /* 注意 IF 的语义：条件不成立时跳 else，没写 else 就重跳本场景开头——
   * 它是“分支”而不是“跳过”，两个出口都要显式给。 */
  s_merge: [
    IF("flag('s_seen')", "s_again", "s_first")
  ],

  s_first: [
    SET("s_seen"),
    N("（第一次走到这里：SET 置位旗标后跳回 s_merge，IF 就会走另一条分支。）"),
    J("s_merge")
  ],

  s_again: [
    N("（第二次走到这里：IF 按 flag('s_seen') 分流成功。数值条件如 trust >= 6 同理。）"),
    J("s_end")
  ],

  s_end: [
    N("（END 节点结束一局：结局要在 src/systems.js 的 ENDING_META 里登记，才会进结局收集。）"),
    END("sample_end", "SAMPLE END", "示例结局",
        "模板自带的演示结局。把 src/script.js 里的示例整段删掉，换成你的第一章吧。")
  ]
});

/* Node 工具链（校验/模拟）通过 require 加载本文件；浏览器里此行是空操作 */
if (typeof module !== "undefined") module.exports = { SCRIPT };


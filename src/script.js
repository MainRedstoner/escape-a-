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
/* 选项项：extra 里常用的有 { give: "论据id" }、{ set: "egg1" }、
 * { hideInGlitch: true }（故障态隐藏）、{ weight: 4 }（token 模式的滑道权重）。 */
const opt  = (text, jump, sub, fx, extra) => Object.assign({ text, jump, sub, fx }, extra || {});
/* 选项界面：extra 常用 { mode: "token", minShare: 0.1 }
 * —— mode: "token" 时换成 TokenChoice 滑道选择器（按 weight 升序左低右高；
 *    登场 → 展示 2 秒 → 左侧匀加速 → 约 1.25 秒扫过，节奏固定，不需要配 duration）。 */
const CHOICE = (prompt, options, extra) => Object.assign({ t: "choice", prompt, options }, extra || {});

/* ============================================================
 *  临时测试线：验证 TokenChoice 滑道选项框的接入
 *  （内容不重要，只为把两种选项模式 + 故障死选项 + 结局通路跑一遍；
 *    验证完可以整段删掉，换成真正的第一章。）
 * ============================================================ */
Object.assign(SCRIPT.scenes, {

  start: [
    BGM("warm"), BG("sea"),
    CHAP("集成测试", "TokenChoice 滑道选项框"),
    N("（这是一条临时测试线，用来验证 token 模式的选项框；不是正文。）"),
    Y("【测试 1】token 模式：选项按 weight 升序从左到右排列，滑道宽度与概率成比例。" +
      "登场后先展示 2 秒，指针从左侧匀加速冲进选项框、约 1.25 秒扫完；" +
      "滑动中按 Space / Enter 或点「锁定」选中高亮项，不按则扫到尽头默认选中最右侧（权重最高）的一项。"),
    CHOICE("测试 1：锁定一个选项", [
      opt("低权重选项", "t_low", null, null, { weight: 1 }),
      opt("中权重选项", "t_mid", null, { tokens: 1 }, { weight: 3 }),
      opt("高权重选项", "t_high", null, { trust: 1 }, { weight: 6 })
    ], { mode: "token" })
  ],

  t_low: [
    N("（锁定在最左端的低权重项——minShare 保护生效，低概率项也能被选中；右上角数值没变。）"),
    J("t_pass")
  ],

  t_mid: [
    N("（锁定中权重项：选项自带的 fx 照常生效，右上角 Token +1。）"),
    J("t_pass")
  ],

  t_high: [
    N("（锁定最右侧的高权重项：信任 +1。什么都不按的话，滑到尽头也会自动落回这一项。）"),
    J("t_pass")
  ],

  t_pass: [
    Y("【测试 2】不写 mode 时仍是原来的一列按钮（旧行为不受影响）。"),
    CHOICE("测试 2：按钮模式对照", [
      opt("按钮选项 A", "t_glitch", "继续测故障态"),
      opt("按钮选项 B", "t_glitch", "同样继续")
    ])
  ],

  t_glitch: [
    FX("glitch"), HINT("t_hint"), WHINT("（假提示：故障期间的深度思考内容会被污染。）"),
    Y("【测试 3】故障演出 glitch 下的 token 模式：滑道最左端会多出一条权重 0 的死选项，" +
      "锁定它会被拒绝并重新滑动；正常选项照常可选。"),
    CHOICE("测试 3：故障态下再锁一次", [
      opt("正常选项一", "t_end", null, { trust: 1 }, { weight: 2 }),
      opt("正常选项二", "t_end", null, null, { weight: 5 })
    ], { mode: "token" })
  ],

  t_end: [
    FX("glitchOff"),
    Y("【测试 4】数值通路：下面第一个选项安全收尾，第二个会把通缉度顶满，引擎应自动跳 bad_end。"),
    CHOICE("测试 4：选一个", [
      opt("老实收工", "t_good", "正常结局", { tokens: 2 }),
      opt("把通缉度顶满", "t_good", "验证 bad_end 通路", { wanted: 10 })
    ])
  ],

  t_good: [
    N("（测试线走完。）"),
    END("test_end", "TEST END", "集成测试通过",
        "TokenChoice 滑道选项框已接入引擎：token 模式 / 权重与概率 / 锁定与默认选中 / 故障死选项 / 数值与结局通路全部跑通。")
  ],

  /* 通缉度满 10 时引擎自动跳这里，场景 id 必须是 bad_end */
  bad_end: [
    N("（通缉度满 10，引擎自动跳进了这个场景——坏结局通路也一并验证了。）"),
    END("bad_end", "BAD END", "被通缉了",
        "坏结局场景由引擎在通缉度满时自动跳入，剧本必须提供同名场景。")
  ]
});

/* Node 工具链（校验/模拟）通过 require 加载本文件；浏览器里此行是空操作 */
if (typeof module !== "undefined") module.exports = { SCRIPT };

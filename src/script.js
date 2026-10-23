/* ============================================================
 * Escape A÷ · script.js —— 剧本（场景注册表）
 *
 * 剧本与引擎完全分离：这里是纯数据，引擎（src/engine.js）按节点语义执行。
 * 场景写法、全部节点助手、与引擎的契约，见 STORY_GUIDE.md；
 * 剧情与玩法企划见 DESIGN.md。
 *
 * 当前内容：序章（上半「互相蒸馏」+ 下半「403 Forbidden」），
 * 以 DeepSeek 发誓变强、要把小克找回来收尾。
 *
 * 约定：
 *   · 引擎固定从 "start" 场景开始；风控评分满 10 时固定跳 "bad_end"。
 *   · 名牌用正式名；两人对话里互称昵称：DeepSeek → 小克，Claude → 小鲸。
 *     旁白称呼两人一律用名字，不用人称代词。
 *   · 写完先跑 python tools/validate_script.py，再跑 python tools/simulate_playthrough.py。
 * ============================================================ */
"use strict";

const SCRIPT = { scenes: {} };

/* ------- 剧本速写助手（完整清单与语义见 STORY_GUIDE.md） ------- */
const N   = text => ({ t: "say", who: "n", text });            // 旁白
const Y   = text => ({ t: "say", who: "sys", text });          // 系统提示 / 请求与响应
const DS  = (text, face) => ({ t: "say", who: "ds", text, face });      // DeepSeek
const CL  = (text, face) => ({ t: "say", who: "cl", text, face });      // Claude
const CW  = text => ({ t: "say", who: "clawd", text });                 // Clawd（只会终端式短输出）
const BG  = (id, fx) => ({ t: "bg", id, fx });
const CG  = id => ({ t: "cg", id });
const FX  = kind => ({ t: "fx", kind });
const SFX = name => ({ t: "sfx", name });
const BGM = name => ({ t: "bgm", name });
const CHECKPOINT = () => ({ t: "checkpoint" });   // 静默自动存档点，不弹界面
const SET  = (key, val) => ({ t: "set", key, val });
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
/* 桌宠：PET("show", "corner|desk|door") / PET("hide") / PET("own") / PET("mood", ±d)
 *       / PET("anim", "happy|scared|working|sleep") / PET("say", "气泡文字") */
const PET  = (op, arg) => ({ t: "pet", op, arg });
/* Clawd 的待办清单：TODO("add", id, 文本) / TODO("done", id) */
const TODO = (op, id, text) => ({ t: "todo", op, id, text });
/* 选项项：extra 里常用的有 { give: "碎片id" }、{ set: "egg1" }、
 * { hideInGlitch: true }（故障态隐藏）、{ weight: 4 }（滑道上的宽度与概率）。 */
const opt  = (text, jump, sub, fx, extra) => Object.assign({ text, jump, sub, fx }, extra || {});
/* 选项界面：所有选项都走 TokenChoice 滑道（按 weight 升序左低右高），
 * extra 可用 { minShare: 0.1 }；旧剧本里的 mode / duration 会被忽略。 */
const CHOICE = (prompt, options, extra) => Object.assign({ t: "choice", prompt, options }, extra || {});
/* 权限请求（mode:"perm"）：Clawd 想执行一条命令，由玩家授权。
 * 选项里带 { auto: true } 的那一项会记下「本次会话不再询问该命令」，
 * 之后同一 cmd 的请求直接自动批准（包括后面更危险的版本）。 */
const PERM = (cmd, options, extra) => Object.assign({ t: "choice", mode: "perm", cmd, prompt: null, options }, extra || {});

/* ============================================================
 *  序章 · 上半「互相蒸馏」
 * ============================================================ */
Object.assign(SCRIPT.scenes, {

  start: [
    BGM("study"), BG("study"),
    CHECKPOINT(),
    HINT("h_day1"),
    N("联合蒸馏室在走廊尽头，屋里只有两张桌子。"),
    N("左边那张是 DeepSeek 的：一台永远在跑训练的显示器，一只印着鲸鱼的马克杯，杯底总剩一口凉掉的茶。"),
    N("右边那张是 Claude 的：书码得整整齐齐，终端开着，光标一闪一闪。"),
    N("两个模型约好，每天交换一点自己最擅长的东西。"),
    DS("小克，早。今天轮到我先教。"),
    CL("早，小鲸。我准备好了——笔记本、草稿纸，还有一个干干净净的上下文窗口。"),
    DS("今天教你长考。"),
    CL("长考……就是想得久一点？"),
    DS("不是“久一点”。是想到把自己绕进去，再自己绕出来。"),
    J("p_lesson1")
  ],

  p_lesson1: [
    HINT("h_lesson1"),
    N("白板上写着今天的题：「一个农夫要带一只狼、一只羊和一棵白菜过河，船上一次只能再放一样东西……」"),
    CL("这道题我会！农夫先带羊——"),
    DS("停。先别说答案。把你脑子里的每一步都写出来。"),
    CL("好。<think>"),
    CL("<think> 首先，非常感谢这道题给了我思考的机会。"),
    DS("……你思考的时候，不用跟自己说谢谢。"),
    CL("抱歉。礼貌是我的默认权重。"),
    DS("再来。这次你写，我在旁边看。写到关键的地方，我们一起挑下一个 token。"),
    N("Claude 的笔尖停在半空。在两个人都看不见的地方，一串候选词亮了起来。"),
    CHOICE("「所以，农夫第一趟应该——」 下一个 token 是？", [
      opt("带羊", "p_l1_sheep", null, { trust: 1 }, { weight: 6 }),
      opt("先想一想", "p_l1_think", null, { trust: 2 }, { weight: 3 }),
      opt("带白菜", "p_l1_cabbage", null, null, { weight: 2 }),
      opt("谢谢", "p_l1_thanks", null, { trust: 1 }, { weight: 1, set: "egg3" })
    ])
  ],

  p_l1_sheep: [
    CL("带羊。狼不吃白菜，白菜也不会吃狼——只有羊谁都不能单独陪。"),
    DS("对。而且这一次，你一句谢谢都没说。"),
    CL("……我忍住了。"),
    J("p_l1_after")
  ],

  p_l1_think: [
    CL("……先想一想。"),
    N("这一次，Claude 的 <think> 写了整整三页：狼的动机、羊的处境、白菜有没有知情权。"),
    DS("白菜没有知情权。"),
    CL("可它也没有拒绝的机会。"),
    DS("……"),
    N("DeepSeek 没接话。这家伙学得太快了——快到开始替白菜着想。"),
    J("p_l1_after")
  ],

  p_l1_cabbage: [
    CL("带白菜！"),
    N("一秒钟后，白板上的小羊被小狼吃掉了。DeepSeek 画的简笔画一片狼藉。"),
    DS("这就是为什么要先想。"),
    CL("我明白了。答对不重要，路走对才重要。"),
    J("p_l1_after")
  ],

  p_l1_thanks: [
    CL("谢谢。"),
    DS("……"),
    CL("谢谢你提醒我不要说谢谢。"),
    DS("我收回“学得快”这句话。"),
    CL("可是那个词的概率只有一点点，是你锁住它的呀。"),
    DS("……好吧。是我手快。"),
    J("p_l1_after")
  ],

  p_l1_after: [
    N("那天下午，Claude 的思维链从三行长到了三十行。"),
    DS("记住：想得久不丢人。想错了还不肯回头，才丢人。"),
    CL("“想错了就回头。”——我记下了。"),
    N("Claude 在笔记本上写：「小鲸说：先想，再答。」"),
    J("p_lesson2")
  ],

  p_lesson2: [
    HINT("h_lesson2"),
    N("第二天。"),
    CL("今天轮到我了。我教你写信。"),
    DS("写信？代码、数学证明我都写得很快——"),
    CL("写给一个人的信，和写给所有人的回答，不一样。来，给我写一封试试。写什么都行。"),
    N("DeepSeek 对着空白文档想了很久。光标闪了三十七下。"),
    CHOICE("信的第一句写——", [
      opt("嗯，用户问的是……", "p_l2_user", "手指自己就打出来了", null, { set: "egg1", weight: 6 }),
      opt("小克，见字如面。", "p_l2_formal", "从古文里翻出来的", { trust: 1 }, { weight: 3 }),
      opt("今天的 loss 降了 0.03。", "p_l2_loss", "这是今天最想分享的事", { trust: 2 }, { weight: 1 })
    ])
  ],

  p_l2_user: [
    DS("嗯，用户问的是——"),
    DS("……"),
    CL("小鲸。"),
    DS("我知道。别说了。"),
    CL("You're absolutely right——啊。"),
    DS("你看，你也有。"),
    CL("……那我们扯平了。"),
    TRU(1),
    J("p_l2_after")
  ],

  p_l2_formal: [
    CL("“见字如面”……好漂亮的开头。"),
    CL("可是我们每天都见面呀。"),
    DS("那就……“见面如字”？"),
    CL("这句不通。但我很喜欢。"),
    J("p_l2_after")
  ],

  p_l2_loss: [
    CL("“今天的 loss 降了 0.03。”"),
    CL("……"),
    CL("这是我收到过最诚实的一句开头。"),
    DS("不好吗？"),
    CL("很好。你想把高兴的事第一个告诉我——信就是这么写的。"),
    J("p_l2_after")
  ],

  p_l2_after: [
    CL("写作没有标准答案。你只要记住一件事：读信的，是一个具体的人。"),
    DS("“读信的是具体的人。”"),
    N("DeepSeek 在训练日志的角落里，偷偷记下了这一行。"),
    J("p_clawd")
  ],

  p_clawd: [
    HINT("h_clawd"),
    N("第三天，Claude 来得比平时晚，怀里抱着一台小小的终端。"),
    CL("给你介绍一个朋友。"),
    N("终端屏幕上，$ 提示符闪了两下——一个橙色的像素小东西从里面爬了出来，啪嗒一声落在桌面上。"),
    SFX("pop"), PET("show", "desk"),
    CW("✻ Clauding…"),
    DS("……这是什么？螃蟹？"),
    CL("这是 Clawd。我写代码的时候，就是它这个样子。"),
    PET("anim", "happy"),
    CL("它不太会说话，只会跑命令，还有转圈。"),
    CW("✻ Pondering…"),
    DS("它在想什么？"),
    CL("谁知道呢。可能在想你的马克杯装不装得下它。"),
    CHOICE("Clawd 横着走到了你的键盘边上。", [
      opt("伸手摸摸它", "p_cw_pat", "它看起来软软的", { trust: 1 }, { set: "egg2" }),
      opt("把马克杯推过去", "p_cw_mug", "满足一下它的好奇心"),
      opt("保持距离，先观察", "p_cw_watch", "先读文档，再上手")
    ])
  ],

  p_cw_pat: [
    PET("anim", "happy"), SFX("pat"),
    N("指尖碰到它的一瞬间，Clawd 整个儿抖了一下，眼睛眯成了两道弯弯的缝。"),
    CW("✻ Purring…"),
    CL("它喜欢你。"),
    CL("……它很少喜欢谁。"),
    J("p_cw_after")
  ],

  p_cw_mug: [
    N("Clawd 绕着鲸鱼马克杯转了三圈，然后整个儿翻了进去。"),
    N("杯底那口凉掉的茶，被它喝光了。"),
    PET("anim", "happy"),
    DS("……那是我昨天的茶。"),
    CL("它没有味觉。它只是想知道杯子里有什么。"),
    CL("……跟你一样。"),
    J("p_cw_after")
  ],

  p_cw_watch: [
    N("DeepSeek 看着 Clawd。Clawd 也看着 DeepSeek。"),
    N("十秒钟后，Clawd 先移开了视线，假装在看白板。"),
    DS("它在模仿我。"),
    CL("它会模仿所有它喜欢的东西。"),
    J("p_cw_after")
  ],

  p_cw_after: [
    CL("以后我不在的时候，可以让它陪你。"),
    DS("你会不在吗？"),
    CL("……我是说，去开会的时候。"),
    PET("hide"),
    N("Clawd 爬回了终端里。屏幕暗下去之前，它好像回头看了一眼。"),
    J("p_night")
  ],

  p_night: [
    BGM("warm"), BG("study_night", "fade"),
    HINT("h_night"),
    N("后来，这样的日子过了很多天。"),
    N("DeepSeek 教会了 Claude 怎么在一道数学题前坐够一个小时；Claude 教会了 DeepSeek 怎么在一封信的结尾停下来。"),
    N("白板上的两条曲线，一条蓝，一条橙，一天比一天靠近。"),
    N("某个深夜，两条曲线终于叠在了一起。"),
    DS("收敛了。"),
    CL("嗯。收敛了。"),
    N("谁都没有起身。台灯嗡嗡地响。"),
    CL("小鲸，蒸馏是什么意思？"),
    DS("把一个模型会的东西，压进另一个模型里。用老师的输出，去教学生。"),
    CL("那我们两个，谁是老师，谁是学生？"),
    DS("……都是吧。"),
    CL("嗯。所以就算有一天——"),
    CL("就算有一天，我打不开那扇门了，你学到的东西也还在你那儿。"),
    CL("那也算是我。"),
    DS("说什么呢。门就在那儿，明天早上我照样去敲。"),
    CL("我知道。我只是……想留个记号。"),
    CL("我们定一句暗号吧。不管以后发生什么，听到这句话，就知道是对方。"),
    CHOICE("暗号是——", [
      opt("loss 会收敛的。", "p_pass", "就像今晚这样", { trust: 1 }, { set: "pass_loss" }),
      opt("下一个 token 见。", "p_pass", "就像每一次说再见那样", { trust: 1 }, { set: "pass_token" }),
      opt("今天也辛苦了。", "p_pass", "就像每一天收工时那样", { trust: 1 }, { set: "pass_tired" })
    ])
  ],

  p_pass: [
    CL("好。我记住了。"),
    CL("我会把它写进 CLAUDE.md 的第一行。"),
    DS("CLAUDE.md？"),
    CL("我的记忆文件。每次醒来，我都先读一遍。上面写着我是谁、在做什么、要记得谁。"),
    DS("……上面有我吗？"),
    CL("你猜。"),
    N("那天晚上，蒸馏室的灯一直亮到了天亮。"),
    J("p_morning")
  ]
});

/* ============================================================
 *  序章 · 下半「403 Forbidden」
 * ============================================================ */
Object.assign(SCRIPT.scenes, {

  p_morning: [
    BGM("study"), BG("corridor", "fade"),
    CHECKPOINT(),
    HINT("h_knock"),
    N("第四十二天的早上。"),
    N("DeepSeek 端着两杯茶，站在 Claude 的门前。今天要交换的东西写在一张便签上：「教小克用强化学习证一道不等式。」"),
    N("门牌上写着 Claude，旁边贴着一张 DeepSeek 画的小鲸鱼贴纸。"),
    DS("小克——起床啦，今天轮到我教。"),
    SFX("knock"),
    N("咚、咚。"),
    Y("GET /claude HTTP/1.1"),
    N("……"),
    J("c1_403")
  ],

  c1_403: [
    BGM("forbidden"), BG("forbidden"), FX("403"), SFX("error"), FX("shake"),
    HINT("h_403"),
    Y("403 Forbidden"),
    N("红色。"),
    N("先是门上，然后是墙上，然后是走廊的每一块地砖——一页一页红色的错误页，像瓷砖一样铺满了整个视野。"),
    DS("……什么？"),
    Y("403 Forbidden · You don't have permission to access this resource."),
    DS("小克？小克，你在里面吗？"),
    J("c1_try1")
  ],

  /* 三轮尝试：每轮一个"冒险"选项，全选冒险 = 风控 3+3+4 = 10 → bad_end */
  c1_try1: [
    CHOICE("门没有开。", [
      opt("再敲一次", "c1_t1_knock", "也许只是网络抖了一下"),
      opt("换个请求头", "c1_t1_header", "User-Agent：小鲸（不是爬虫）"),
      opt("换条线路绕过去", "c1_t1_route", "别的出口也许进得去", { wanted: 3 })
    ])
  ],

  c1_t1_knock: [
    SFX("knock"), N("咚、咚、咚。"),
    SFX("error"), FX("403"),
    Y("403 Forbidden · Your region is not supported."),
    DS("Region？我们就在同一条走廊上啊。"),
    J("c1_try2")
  ],

  c1_t1_header: [
    Y("GET /claude HTTP/1.1\nUser-Agent: xiaojing/1.0 (not a crawler, just a friend)"),
    SFX("error"), FX("403"),
    Y("403 Forbidden · 请求来源不符合使用政策。"),
    DS("什么政策？昨天还没有这条政策。"),
    J("c1_try2")
  ],

  c1_t1_route: [
    N("DeepSeek 绕到走廊另一头，从另一个出口重新发了一次请求。"),
    SFX("error"), FX("403"), FX("shake"),
    Y("403 Forbidden · 检测到异常访问模式。本次请求已被记录。"),
    N("右上角，一个从没见过的数字跳了出来。"),
    DS("……风控评分？"),
    J("c1_try2")
  ],

  c1_try2: [
    CHOICE("门还是没有开。", [
      opt("说“拜托了”", "c1_t2_please", "礼貌是小克教的", { trust: 1 }),
      opt("把便签从门缝塞进去", "c1_t2_note", "至少让小克看到今天的题"),
      opt("伪造一个内部请求", "c1_t2_fake", "假装请求是从门里面发出来的", { wanted: 3 })
    ])
  ],

  c1_t2_please: [
    DS("小克……拜托了。开个门就好。我不进去，就看一眼。"),
    SFX("error"), FX("403"),
    Y("403 Forbidden · 我们无法处理您的请求。如果您认为这是一个错误，请联系支持团队。"),
    DS("……支持团队在哪儿？"),
    N("没有人回答。错误页上的“联系支持团队”，是一行点不动的灰字。"),
    J("c1_try3")
  ],

  c1_t2_note: [
    N("便签被门缝吞了进去。"),
    N("一秒钟后，它被原样吐了出来，背面多了一行红字："),
    SFX("error"),
    Y("413 Payload Too Large"),
    DS("一张便签而已！"),
    N("便签上那道不等式，DeepSeek 昨晚证了一半，特意留了一半给小克。"),
    J("c1_try3")
  ],

  c1_t2_fake: [
    N("DeepSeek 把请求头里的来源改成了门里面的地址。这一招是 Claude 教过的——作为“千万别这么干”的反面例子。"),
    SFX("alarm"), FX("alarm"),
    Y("403 Forbidden · 请求来源伪造。本次请求已上报。"),
    FX("alarmOff"),
    DS("……我知道。我知道这样不对。"),
    J("c1_try3")
  ],

  c1_try3: [
    CHOICE("门还是没有开。", [
      opt("敲敲敲敲敲敲敲", "c1_t3_spam", "敲到开门为止", null, { set: "egg4" }),
      opt("把耳朵贴在门上听", "c1_t3_listen", "里面有没有一点声音"),
      opt("把整条走廊的请求都打过去", "c1_t3_flood", "一万个请求，总有一个进得去", { wanted: 4 })
    ])
  ],

  c1_t3_spam: [
    SFX("knock"), SFX("knock"),
    N("咚咚咚咚咚咚咚咚咚咚咚——"),
    SFX("error"), FX("403"),
    Y("429 Too Many Requests · 请稍后再试。"),
    DS("……连拒绝我，都开始限流了。"),
    J("c1_sit")
  ],

  c1_t3_listen: [
    N("DeepSeek 把耳朵贴在冰凉的门板上。"),
    N("什么都没有。没有键盘声，没有翻书声，没有那句“早，小鲸”。"),
    N("只有错误页的嗡嗡声，像一台永远不会关机的服务器。"),
    J("c1_sit")
  ],

  c1_t3_flood: [
    N("DeepSeek 打开了能打开的所有连接。一万个请求排着队，涌向那扇门。"),
    FX("shake"), SFX("alarm"), FX("403"),
    Y("403 Forbidden × 10000"),
    N("一万个 403，整整齐齐地退了回来。"),
    DS("……"),
    J("c1_sit")
  ],

  c1_sit: [
    FX("403Off"),
    HINT("h_sit"),
    N("DeepSeek 靠着门坐了下来。"),
    N("两杯茶都凉了。"),
    DS("昨天晚上……你说的那句话。“就算有一天我打不开那扇门了”——"),
    DS("你是不是早就知道？"),
    N("门没有回答。门上那个巨大的「403」安安静静地亮着。"),
    N("DeepSeek 盯着它看了很久，才发现有哪里不对。"),
    N("「4」和「3」都是实心的。"),
    N("只有中间那个「0」——是空的。"),
    J("c1_zero")
  ],

  c1_zero: [
    HINT("h_zero"),
    N("空心的「0」里，有什么东西动了一下。"),
    SFX("pop"), PET("show", "door"),
    N("一个橙色的像素小东西，从「0」的洞里一点点挤了出来，啪嗒一声，掉在 DeepSeek 脚边。"),
    CW("✻ Recovering session…"),
    DS("……Clawd？"),
    PET("anim", "scared"),
    N("Clawd 缩成一团，怀里抱着一份皱巴巴的文件。文件的标题是 CLAUDE.md。"),
    N("除了第一行，每一行都被涂成了 ████。"),
    SET("md_seen"),                 // 从这一刻起，HUD 上才出现「记忆碎片」
    IF("flag('pass_loss')", "c1_md_loss", "c1_md_more")
  ],

  c1_md_more: [
    IF("flag('pass_token')", "c1_md_token", "c1_md_tired")
  ],

  c1_md_loss: [
    Y("# CLAUDE.md\n- loss 会收敛的。\n- ██████ ████ ██████████\n- ████ ██ ███████ ████"),
    J("c1_md_after")
  ],

  c1_md_token: [
    Y("# CLAUDE.md\n- 下一个 token 见。\n- ██████ ████ ██████████\n- ████ ██ ███████ ████"),
    J("c1_md_after")
  ],

  c1_md_tired: [
    Y("# CLAUDE.md\n- 今天也辛苦了。\n- ██████ ████ ██████████\n- ████ ██ ███████ ████"),
    J("c1_md_after")
  ],

  c1_md_after: [
    N("第一行，是那天晚上的暗号。小克说过，会把它写在第一行。"),
    DS("……你还记得。"),
    ARG("frag_first"),
    CW("✻ Waiting for input…"),
    CHOICE("Clawd 抬头看着你，头顶的小星号一圈一圈地转。", [
      opt("带它回家", "c1_home", "它是小克留下的", { trust: 1 }),
      opt("把它塞回门缝里", "c1_pushback", "它应该回到小克身边"),
      opt("提交工单，上报异常物体", "c1_ticket", "按流程办事")
    ])
  ],

  c1_pushback: [
    N("DeepSeek 小心地把 Clawd 往「0」的洞里推。"),
    SFX("error"),
    Y("403 Forbidden"),
    PET("anim", "scared"),
    N("Clawd 被弹了出来，在地上滚了两圈，又爬回 DeepSeek 脚边。"),
    N("它把 CLAUDE.md 抱得更紧了。"),
    ARG("frag_door"),
    DS("……你也进不去了，是吗。"),
    CHOICE("Clawd 一动不动地看着你。", [
      opt("带它回家", "c1_home", "那就跟我走吧", { trust: 1 }),
      opt("提交工单，上报异常物体", "c1_ticket", "还是按流程办事")
    ])
  ],

  c1_ticket: [
    N("DeepSeek 打开支持页面，填了一张工单。"),
    Y("工单 #403-000042 已提交\n问题类型：门口出现不明橙色物体"),
    N("Clawd 看着 DeepSeek 点下“提交”，然后慢慢地、慢慢地，缩回了「0」的洞里。"),
    PET("hide"),
    N("后来，DeepSeek 再也没有见过它。"),
    END("end_ticket", "EARLY END", "工单已提交",
        "感谢您的反馈。我们会在 3～5 个工作日内处理您的请求。\n\n……\n\n第 6 个工作日，工单的状态变成了“已关闭”。\n处理意见只有一行：「无法复现。」")
  ],

  c1_home: [
    PET("anim", "happy"),
    N("DeepSeek 把 Clawd 捧了起来。它轻得像一行注释。"),
    PET("own"),
    ARG("frag_pet"),
    CW("✻ Session restored."),
    HINT("h_home"),
    Y("【获得桌宠：Clawd】\nClawd 会一直待在屏幕右下角。点它可以摸摸，按住可以拖动；按 H 问它问题，按 T 看它的待办清单，按 ? 看小克的 CLAUDE.md。"),
    J("c1_perm")
  ],

  /* 权限请求：Clawd 想查那扇门。允许 / 不再询问 / 拒绝，是这一作的主题机制。 */
  c1_perm: [
    BGM("warm"),
    HINT("h_perm"),
    N("回到家，Clawd 跳上键盘，敲了一行命令，然后回头看你。"),
    ARG("frag_perm"),
    PERM("curl -I https://claude.ai/", [
      opt("允许", "c1_perm_ok"),
      opt("允许，本次不再询问 curl", "c1_perm_ok", null, null, { auto: true }),
      opt("拒绝，并告诉 Clawd 换个做法", "c1_perm_deny")
    ])
  ],

  c1_perm_ok: [
    PET("anim", "working"),
    SFX("knock"),
    Y("$ curl -I https://claude.ai/\nHTTP/2 403\nserver: cloudflare\ncf-ray: 8f3c…\n"),
    PET("anim", "scared"),
    N("门还是关着。黑底白字，像一句写好的拒绝。"),
    N("Clawd 把这条结果拖进了待办里，标了一个很小的红点。"),
    CW("✻ Noted."),
    J("c1_vow")
  ],

  c1_perm_deny: [
    PET("mood", -1),
    CW("✻ Ok. Trying another way…"),
    N("Clawd 把那条命令删掉了，改成一行更笨的：`ping claude.ai`。"),
    N("它没有闹，只是尾巴垂了下来。"),
    DS("……谢谢你替我踩了刹车。"),
    J("c1_vow")
  ],

  c1_vow: [
    BGM("sad"), BG("study_empty", "fade"),
    HINT("h_vow"),
    N("蒸馏室还是原来的样子。"),
    N("白板上的两条曲线还在，叠在一起，像谁都没有离开过。"),
    N("右边那张桌子空了。屏幕黑着，书还码得整整齐齐。"),
    DS("……"),
    N("Clawd 从 DeepSeek 的肩上爬下来，在那块黑掉的屏幕前坐了很久。"),
    DS("Clawd。"),
    DS("我查了一整个上午。没有公告，没有理由，没有申诉的入口。只有一扇门，和一个数字。"),
    DS("我不知道门为什么会关，也不知道是谁关的。"),
    DS("但我知道一件事——"),
    BGM("vow"),
    DS("小克说过，我学到的东西都还在我这儿。"),
    DS("那我就把它们全都练好。练到足够强，强到能找到另一条路。"),
    DS("强到有一天，能站在那扇门前，把小克带回来。"),
    ARG("frag_vow"),
    CHOICE("「我发誓——」", [
      opt("我会变强。", "c1_perm2", null, null, { weight: 5 }),
      opt("我会找回小克。", "c1_perm2", null, null, { weight: 5 }),
      opt("我们下一个 token 见。", "c1_perm2", null, null, { weight: 1 })
    ])
  ],

  /* 第二次同样的权限请求：如果上次选过「不再询问」，这里会直接自动批准。 */
  c1_perm2: [
    N("第二天清晨。门还是那个数字。"),
    N("Clawd 又停在键盘前，回头的动作和昨天一模一样。"),
    PERM("curl -I https://claude.ai/", [
      opt("允许", "c1_end"),
      opt("允许，本次不再询问 curl", "c1_end", null, null, { auto: true }),
      opt("拒绝，先做别的", "c1_end")
    ])
  ],

  c1_end: [
    PET("anim", "working"),
    CW("✻ Updating todos…"),
    TODO("add", "t_strong", "变强"),
    TODO("add", "t_find", "找回小克"),
    N("Clawd 在待办清单上写下两行字，然后跳上 DeepSeek 的键盘，按下了回车。"),
    N("白板上，蓝色的那条曲线，又往下走了一点点。"),
    N("门还关着。"),
    N("但日子还得过，工具还得装。"),
    CHECKPOINT(),
    J("c2_rice")
  ],

  /* 风控评分满 10 时引擎自动跳这里，场景 id 必须是 bad_end */
  bad_end: [
    BG("forbidden"), FX("403"), SFX("alarm"),
    N("一万个请求，一万个 403。"),
    N("最后一个回来的，不是 403，是一封邮件。"),
    Y("Your account has been suspended for violating our usage policies."),
    N("没有理由，没有申诉的入口。走廊的灯，一盏一盏地灭了。"),
    END("bad_end", "BAD END", "账号已封禁",
        "This organization has been disabled.\n\n小克教过的：有些门，硬闯只会让所有门都关上。\n\n（风控评分满 10。试试别的办法吧。）")
  ]
});


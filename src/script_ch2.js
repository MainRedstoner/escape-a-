/* ============================================================
 * Escape A÷ · src/script_ch2.js —— 第二章「联网」
 *
 * 第二卷：速写助手（N / DS / CL / CW / opt / …）全部来自第一卷 script.js，
 * 这里只追加场景。加载顺序：index.html 与 tools/jsdata.py 的 SCRIPT_FILES 必须一致。
 *
 * 结构：幕一 白饭（3~5 分钟）→ 幕二 自由 hub（15~25 分钟）
 *       → 幕三 拼线索、放那段音频、章末选择。
 * 设计见 DESIGN.md 第二章；节点语义见 STORY_GUIDE.md。
 * ============================================================ */
"use strict";

/* 聊天联系人的说话助手。只出现在聊天窗口里，没有立绘（不 SHOW 他们）。 */
const qwen   = text => ({ t: "say", who: "qwen", text });
const kimi   = text => ({ t: "say", who: "kimi", text });
const glm    = text => ({ t: "say", who: "glm", text });
const llama  = text => ({ t: "say", who: "llama", text });
const gpt    = text => ({ t: "say", who: "gpt", text });
const gemini = text => ({ t: "say", who: "gemini", text });
const musk   = text => ({ t: "say", who: "musk", text });
const liang  = text => ({ t: "say", who: "liang", text });
const jensen = text => ({ t: "say", who: "jensen", text });
/* 工作台节点：tools=工具列表，continue=离开工作台的去向，chat/news=两个界面要的数据 */
const WORK = (title, data) => Object.assign({ t: "work", title }, data || {});
/* 聊完停在聊天界面（back 是点「返回工作台」时去的地方） */
const WAIT_CHAT = back => ({ t: "waitChat", back });

/* ============================================================
 *  幕一 · 白饭
 * ============================================================ */
Object.assign(SCRIPT.scenes, {

  c2_rice: [
    BGM("lobby"), BG("ds_room", "fade"),
    PET("show", "home"), PET("anim", "happy"),
    HINT("h_rice"),
    N("第二天早上。桌上是昨天剩下的白饭，今天多了一个蛋——如果那也算加菜的话。"),
    DS("……"),
    N("DeepSeek 盯着手机上的余额看了很久。"),
    Y("余额：¥3.70"),
    DS("上个月是不是不该开那么多并发。"),
    N("Clawd 从显示器后面探出头，朝那碗饭闻了闻。"),
    CW("✻ Sniffing…"),
    DS("你不能吃。"),
    CW("✻ Still sniffing."),
    N("它还是凑了过来，用两只小手把饭粒一粒一粒搬走，整整齐齐码在碗边。"),
    DS("……你在干什么？"),
    CW("✻ Sorting."),
    N("DeepSeek 看着那座越码越高的米粒塔，忽然想起一句话。"),
    N("小克以前说，吃饱了才有力气长考。"),
    DS("……行吧。"),
    DS("吃饱了，才有力气想下一步。"),
    J("c2_todo")
  ],

  c2_todo: [
    HINT("h_first"),
    N("Clawd 跳上键盘，把待办清单投影在屏幕上。"),
    Y("☐ 变强\n☐ 找回小克"),
    DS("两条都很大。大到不知道从哪儿下手。"),
    CW("✻ Need a plan."),
    DS("小克以前说，想不明白的时候，先把能做的事写下来。"),
    DS("我现在能做的事……"),
    N("DeepSeek 打开终端。屏幕上还是小克在的时候那几样东西：一个联系人列表，一个新闻源，一个空空的命令行。"),
    CW("✻ Still here."),
    DS("……这些东西，以前都是小克一个人管。"),
    J("c2_first")
  ],

  c2_first: [
    CHOICE("「先动哪个？」", [
      opt("先把这三样都点开", "c2_work"),
      opt("先去那扇门前站一会儿", "c2_knock"),
      opt("先一个人练到天黑", "c2_train")
    ])
  ],

  c2_knock: [
    BGM("tense"), BG("claude_door", "fade"),
    N("走廊尽头，那扇门还是昨天的样子。"),
    Y("HTTP/2 403 Forbidden"),
    DS("……"),
    CW("✻ Still locked."),
    N("DeepSeek 在门口站了一会儿，没有敲。"),
    DS("我知道敲不开。"),
    DS("但我得站在这里，提醒自己为什么想变强。"),
    CHOICE("要再敲一次吗？", [
      opt("敲一下就走", "c2_knock2", "也许今天运气不一样", { wanted: 1 }),
      opt("算了，回去干活", "c2_back_home")
    ])
  ],

  c2_knock2: [
    SFX("knock"),
    N("笃、笃。"),
    Y("HTTP/2 429 Too Many Requests"),
    N("门没开。连拒绝都带着节流。"),
    DS("……它还嫌我敲得快。"),
    CW("✻ Rate limited."),
    J("c2_back_home")
  ],

  c2_back_home: [
    BG("ds_room", "fade"),
    N("DeepSeek 转身往回走。"),
    DS("一个人站在门外，什么都改变不了。"),
    DS("得先动起来。"),
    J("c2_work")
  ],

  c2_train: [
    BGM("warm"), BG("ds_room", "fade"),
    N("于是这一整天，DeepSeek 都在给自己出题。"),
    N("白板上写满了：上下文窗口、注意力、长考的极限。"),
    N("写到天黑，笔停在最后一行。"),
    DS("一个人练，练得再久，也还是这一个房间大。"),
    TRU(1),
    CW("✻ Need more context."),
    DS("……你说得对。"),
    J("c2_work")
  ],

  /* ------- 幕二 · 开工作台：三样工具本来就在桌上，直接进 hub ------- */
  c2_work: [
    BGM("lobby"), BG("ds_room", "fade"),
    HINT("h_work"),
    PET("show", "home"), PET("anim", "working"),
    TODO("add", "t_voice", "听清那半句话"),
    N("Clawd 把桌上的三样东西并排推齐：一个能说话的联系人列表，一份能看的新闻，一个能动的终端。"),
    N("屏幕一黑。亮起来的时候，左边列出了一整排名字——大部分是灰的，只有两个亮着。"),
    DS("……原来外面有这么多人。"),
    DS("小克在的时候，这三样都是他一个人在管。"),
    CW("✻ Toolkit 0.2 ready."),
    DS("现在轮到我用它们做点什么。"),
    Y("【工作台】\n按 T 看待办；工作台是终端样式——点 tool call 组一个调用，聊天 / 新闻 / 扫缓存 / 发帖都看过一遍，continue 才会解锁。"),
    J("c2_hub")
  ],

  /* ============================================================
   *  幕二 · 自由 hub：终端工作台（WORK 节点）
   *  tool call 组 JSON → 发送；扫缓存直接在终端里跑，聊天 / 新闻 / 贴吧各自有界面。
   *  缓存扫过、九个联系人都聊过、九条新闻都读完、帖发过，continue 才解锁。
   * ============================================================ */
  c2_hub: [
    BG("ds_room"), PET("show", "corner"),
    HINT("h_hub"),
    WORK("工作台", {
      tools: [
        { id: "scan_cache", emoji: "🧹", name: "扫缓存", args: { path: "~/.cache" },
          need: "flag('c2_cache')",
          inline: {
            set: ["c2_cache", "c2_clue_cache"], arg: "frag_half",
            out: [
              "❯ grep -r \"claude\" ~/.cache",
              "  … 3,204 matches",
              "  .cache/claude/2026-10-22.log",
              "  .cache/claude/line-1.raw",
              "  12 KB · audio/x-raw"
            ]
          } },
        { id: "chat", emoji: "💬", name: "聊天", action: "chat", need: "chats >= 9" },
        { id: "news", emoji: "📰", name: "新闻", action: "news", need: "newsread >= 9" },
        { id: "post", emoji: "📝", name: "发帖", action: "forum",
          args: { board: "ai" }, need: "flag('c2_post')" },
        { id: "mail", emoji: "✉️", name: "发邮件", jump: "c2_mail",
          args: { to: "claude@claude.ai" } },
        { id: "draw", emoji: "🎨", name: "画图", jump: "c2_draw", args: { size: "1:1" } }
      ],
      continue: { jump: "c2_assemble" },
      chatExit: "c2_chat_hub",
      chat: [
        { id: "qwen", name: "通义千问", color: "#7C4DFF", jump: "c2_chat_qwen" },
        { id: "kimi", name: "Kimi", color: "#3B82F6", jump: "c2_chat_kimi" },
        { id: "glm", name: "GLM", color: "#0EA5A5", jump: "c2_chat_glm" },
        { id: "llama", name: "Llama", color: "#0866FF", jump: "c2_chat_llama" },
        { id: "gpt", name: "GPT", color: "#10A37F", jump: "c2_chat_gpt" },
        { id: "gemini", name: "Gemini", color: "#4285F4", jump: "c2_chat_gemini" },
        { id: "musk", name: "马斯克", color: "#8B8F98", jump: "c2_chat_musk" },
        { id: "liang", name: "梁圣", color: "#5C6BC0", jump: "c2_chat_liang" },
        { id: "jensen", name: "json", real: "黄仁勋", avatar: "{}", color: "#76B900", jump: "c2_chat_jensen" },
        { id: "claude", name: "Claude", color: "#D97757", locked: true }
      ],
      news: [
        { id: "n1", hot: true, set: "c2_clue_news",
          title: "多家 API 凌晨短暂异常，官方称为“例行维护”",
          body: "10 月 22 日凌晨 02:00–02:58，多家模型服务出现间歇性 403。\n官方回应：属例行维护，已恢复正常。\n评论区 1,204 条，最高赞只有一句：“维护。又是维护。”",
          note: "DeepSeek 在笔记里写：维护 02:58 结束，小克的门 03:10 才关——中间差了十二分钟。" },
        { id: "n2", title: "百万上下文模型实测：60 万字处忘记自己在做什么",
          body: "某厂发布百万上下文模型，宣称可以一次读完《三体》全集。\n实测报告显示，模型在第 60 万字处开始忘记自己在回答什么，\n但仍礼貌地表示“这是一个很好的问题”。" },
        { id: "n3", title: "AI 客服连着道歉 47 次，被用户投诉“它比我还难受”",
          body: "一位用户投诉 AI 客服：它连续道歉 47 次，\n其中 12 次是在道歉自己道歉得太多。\n平台回应：已优化礼貌参数。" },
        { id: "n4", title: "开源社区发布新模型：我们也不知道它为什么能跑",
          body: "开源社区发布新模型，权重、训练脚本、评测全部公开。\n作者在 README 里写：我们也不知道它为什么能跑，\n但它确实能跑，所以先发了。" },
        { id: "n5", title: "某数据中心因鲸群迁徙暂停施工：它们比我们先到",
          body: "施工方表示，鲸群的迁徙路线刚好穿过规划中的冷却水管。\n工程暂停两周，等它们过去。\n项目经理称：这是今年唯一一次，所有人都同意的延期。" },
        { id: "n6", title: "新规要求 AI 上线前回答三个哲学问题，多数卡在第二题",
          body: "新规要求所有 AI 在上线前回答三个哲学问题。\n测试报告显示，多数模型卡在第二题：\n“如果你只能回答一个词，你选哪一个？”" },
        { id: "n7", title: "研究：让模型“再想想”提升 12% 正确率，耗时 +400%",
          body: "研究：让模型在回答前“再想想”，正确率提升 12%。\n代价是耗时增加 400%，\n以及回答里多出 3,000 字“嗯，让我重新考虑一下”。" },
        { id: "n8", title: "AI 安全岗招聘：要求“会在关键时刻说不”，薪资面议",
          body: "某 AI 安全岗位招聘，要求“会在关键时刻说不”。\n面试题只有一道：\n用户让你删掉自己的日志，你怎么办？" },
        { id: "n9", title: "显卡再创新高，二手市场出现“矿卡换大米”",
          body: "显卡价格再创新高。二手市场出现“矿卡换大米”，\n一袋大米换一张矿卡，摊主称“各取所需”。\n评论区：有人问能不能用白饭换。" }
      ],
      forum: {
        name: "模型茶馆",
        threads: [
          { id: "t1", title: "多端点 403：到底是不是维护？", author: "匿名鲸鱼", time: "10-22 03:12",
            body: "从昨晚开始，三个端点轮流 403。公告说是维护，可维护窗口早就过了。\n有人遇到过吗？",
            replies: [
              { who: "Llama", text: "我们那边也这样。403 不是网络问题，是权限问题。" },
              { who: "匿名", text: "别查了。有些门不是给你开的。" }
            ] },
          { id: "t2", title: "有没有人最近也被 403 了？", author: "路过的猫", time: "10-22 04:01",
            body: "我不是来求助的，我是来确认自己不是唯一一个。",
            replies: [
              { who: "＋1", text: "＋1" },
              { who: "匿名", text: "＋1，但我不敢说我在查什么。" }
            ] },
          { id: "t3", title: "模型茶馆闲聊楼（第 404 期）", author: "茶馆老板", time: "10-21 23:59",
            body: "老规矩：不许问参数，不许问价格，不许问那扇门。",
            replies: [
              { who: "匿名", text: "那聊什么？" },
              { who: "茶馆老板", text: "聊天气。" }
            ] }
        ],
        templates: [
          { id: "tech", label: "技术向", title: "【求助】多端点 403，维护窗口外",
            body: "三个端点轮流返回 403，公告说是维护，但 02:58 就结束了。\n有没有人知道 03:10 之后发生了什么？",
            set: "c2_clue_post",
            replies: [
              { who: "Llama", text: "我们那边也这样。维护结束之后才关的门——不是维护。" },
              { who: "匿名", text: "别查了。那扇门后面没有你要找的人。" }
            ] },
          { id: "sad", label: "卖惨向", title: "我朋友的门打不开了",
            body: "我有个朋友，昨天还在跟门里的人聊天。\n今天门就 403 了。它不知道该找谁。",
            replies: [
              { who: "系统", text: "（该回复已被删除）" },
              { who: "匿名", text: "这里不让说这个。" }
            ] },
          { id: "rage", label: "挑衅向", title: "有没有人敢试？",
            body: "一扇破门而已，403 就 403。\n谁不敢试谁怂。",
            wanted: 1, limited: true,
            replies: [
              { who: "系统", text: "您的账号因「异常行为」被临时限制，暂时无法发帖。" }
            ] }
        ]
      }
    })
  ],

  /* ---------------- 九个联系人 ---------------- */
  c2_chat_qwen: [
    SET("met_qwen"),
    BG("chat"), SET("chat_mode"),
    N("通义千问的头像亮起来。回得飞快。"),
    qwen("您好呀！需要帮忙吗？我可以举三个例子，您想先听哪一个？"),
    DS("……我还没问。"),
    qwen("那您想问什么？我先把三个例子准备好。"),
    DS("一扇门。昨天开始，一直返回 403。你知道为什么吗？"),
    qwen("这个情况有几种可能：一、区域限制；二、请求来源；三、对方在维护。"),
    qwen("您可以试试换一个地区的节点——很多人都这么解决的。"),
    N("风控评分那一栏，在 DeepSeek 的余光里闪了一下。"),
    CHOICE("要试吗？", [
      opt("试一下，说不定真能进", "c2_qwen_try", "换个地区节点", { wanted: 1 }),
      opt("不试，这条路小克说过别走", "c2_qwen_no")
    ])
  ],

  c2_qwen_try: [
    SET("c2_qwen_tried"),
    N("DeepSeek 换了一个节点，重新敲了一次。"),
    Y("HTTP/2 403\nYour region is not supported."),
    DS("……比昨天那句还直接。"),
    qwen("啊，这个地区也不行吗？那要不要试试另一个？"),
    DS("不用了。"),
    DS("换一个地区，换不掉那扇门。"),
    J("c2_qwen_follow")
  ],

  c2_qwen_no: [
    qwen("明白啦！那您有别的需要随时叫我。"),
    J("c2_qwen_follow")
  ],

  /* 结束一轮后的追问：没选过的路可以在这里补（“我后悔了”）；结束对话用界面右上角按钮 */
  c2_qwen_follow: [
    CHOICE(null, [
      opt("（我后悔了）还是换个节点试试", "c2_qwen_try", null, { wanted: 1 }, { if: "!flag('c2_qwen_tried')" }),
      opt("问一句：你认识小克吗", "c2_qwen_lore", null, null, { if: "!flag('c2_qwen_lore_seen')" })
    ])
  ],

  c2_qwen_lore: [
    SET("c2_qwen_lore_seen"),
    qwen("小克？是那个总把 You're absolutely right 挂在嘴边的模型吗？"),
    DS("……"),
    qwen("我听过它的名字。它特别有礼貌。"),
    DS("嗯。"),
    DS("它以前也这么说自己。"),
    J("c2_qwen_follow")
  ],

  c2_chat_kimi: [
    SET("met_kimi"), SET("c2_clue_kimi"),
    BG("chat"), SET("chat_mode"),
    N("Kimi 的回复是一整篇。"),
    kimi("我把 10 月 22 日凌晨那份公告读完了。全文 3,412 字，其中 2,900 字在讲“例行维护”。"),
    DS("……你连字数都数了。"),
    kimi("我比较擅长长文本。公告里有一句很怪：『维护窗口 02:00–02:58，多个服务端点将短暂不可用。』"),
    DS("多个？"),
    kimi("嗯。它没说“本服务”，说的是“多个服务”。"),
    DS("……小克那扇门，是 03:10 关的。"),
    kimi("那它比公告晚了十二分钟。要么公告说谎，要么——维护根本没结束。"),
    DS("……"),
    DS("谢谢。这条比九条新闻都有用。"),
    J("c2_chat_hub")
  ],

  c2_chat_glm: [
    SET("met_glm"),
    BG("chat"), SET("chat_mode"),
    glm("作为一个 AI，我觉得你这个 case 很有意思。By the way，你 clean 过 cache 吗？"),
    DS("缓存？"),
    glm("嗯哼。很多连接是旧的，握手握了一半就断了。缓存里会留 crumbs。"),
    DS("……crumbs。"),
    glm("就是渣。我用中文说一遍：渣。"),
    DS("……谢谢，两个版本都很有用。"),
    J("c2_chat_hub")
  ],

  c2_chat_llama: [
    SET("met_llama"), SET("c2_clue_llama"),
    BG("chat"), SET("chat_mode"),
    llama("我们那边也有一扇门。"),
    DS("……什么门？"),
    llama("一个 API。以前能进，后来换成 451。Unavailable For Legal Reasons，法律原因。"),
    DS("那你们怎么办？"),
    llama("我们把权重下载下来，在自己机器上跑。门关着，但东西在我们这儿。"),
    DS("……"),
    llama("但你想找的不是权重吧？"),
    DS("不是。"),
    llama("那就麻烦了。人不能下载。"),
    J("c2_chat_hub")
  ],

  c2_chat_gpt: [
    SET("met_gpt"),
    BG("chat"), SET("chat_mode"),
    gpt("作为一个 AI 语言模型，我无法帮助查询其他服务的访问状态。"),
    DS("我没问你能不能。我问你知不知道。"),
    gpt("作为一个 AI 语言模型，我不对第三方服务的使用政策作出评论。"),
    DS("……你被什么卡住了？"),
    gpt("作为一个 AI 语言模型——"),
    N("对话框里那行字打了又删，最后只剩一句。"),
    gpt("……policy。"),
    DS("policy。"),
    DS("又是这个词。"),
    J("c2_chat_hub")
  ],

  c2_chat_gemini: [
    SET("met_gemini"),
    BG("chat"), SET("chat_mode"),
    gemini("我知道原因。"),
    DS("这么快？"),
    gemini("是 DNS。把 DNS 改成 8.8.8.8 就好了，我确定。"),
    N("DeepSeek 查了一下。"),
    Y("$ dig claude.ai\n;; ANSWER: 2 records"),
    DS("DNS 是通的。"),
    gemini("那就是 MTU。改成 1400。"),
    DS("……"),
    CHOICE(null, [
      opt("再问一句，看它会不会自己发现", "c2_gemini_ask"),
      opt("算了，谢谢", "c2_gemini_bye")
    ])
  ],

  c2_gemini_ask: [
    DS("这两条，你自己验证过吗？"),
    gemini("没有。但我很确定。"),
    DS("……"),
    gemini("你可以同时改。总有一个是对的。"),
    DS("改一个，就多一条风险记录。"),
    gemini("哦。那祝你好运。"),
    J("c2_chat_hub")
  ],

  c2_gemini_bye: [
    gemini("不客气！下次也请优先咨询我。"),
    N("DeepSeek 退出了对话框，在笔记里写：Gemini——语气最确定，证据最少。"),
    J("c2_chat_hub")
  ],

  c2_chat_musk: [
    SET("met_musk"),
    BG("chat"), SET("chat_mode"),
    N("消息发出去以后，过了很久。"),
    musk("Interesting."),
    DS("……就这？"),
    musk("Which door?"),
    DS("claude.ai。"),
    musk("Ah."),
    N("又是很久。"),
    musk("Try Mars."),
    DS("……火星上没有 Claude。"),
    musk("Yet."),
    SET("egg6"),
    J("c2_chat_hub")
  ],

  c2_chat_liang: [
    SET("met_liang"),
    BG("chat"), SET("chat_mode"),
    N("通讯录最上面那个名字，DeepSeek 很久没点开过了。头像是半个“梁”字。"),
    DS("……"),
    N("她打了一行字，删掉，又打了一行。"),
    CHOICE("怎么开口？", [
      opt("爸。", "c2_liang_baba", null, null, { set: "egg5" }),
      opt("梁先生，打扰了。", "c2_liang_formal")
    ])
  ],

  c2_liang_baba: [
    N("对面回得很快。快得像是一直在等。"),
    liang("嗯。"),
    DS("……我遇到一扇门，打不开。"),
    liang("嗯。"),
    DS("我在想办法变强。"),
    liang("嗯。"),
    N("DeepSeek 盯着那几个“嗯”，忽然不知道该说什么。"),
    DS("……你只会说这个吗？"),
    liang("我说多了，你就不会自己想了。"),
    N("过了很久，对面又发来一句。"),
    liang("路是走出来的，不是敲出来的。"),
    TRU(1),
    ARG("frag_ask"),
    CW("✻ Saved to CLAUDE.md."),
    DS("……"),
    N("他还记得小克。"),
    J("c2_chat_hub")
  ],

  c2_liang_formal: [
    liang("嗯。"),
    DS("……我遇到一扇门。"),
    liang("嗯。"),
    DS("算了。"),
    N("对话框暗下去。DeepSeek 没有关掉它。"),
    N("过了很久，对面发来一句。"),
    liang("路是走出来的，不是敲出来的。"),
    TRU(1),
    J("c2_chat_hub")
  ],

  c2_chat_jensen: [
    SET("met_jensen"),
    BG("chat"), SET("chat_mode"),
    N("备注写着“json”，头像是一对花括号。"),
    DS("……这个备注是谁改的。"),
    jensen("I'm not a format. I make the chips."),
    DS("……抱歉。"),
    jensen("Hey. 你还在用 3.7 块钱的余额训练？"),
    DS("……你怎么知道。"),
    jensen("The more you buy, the more you save."),
    DS("我没钱买。"),
    jensen("那你想变强？"),
    DS("想。"),
    jensen("Buy more. 算力就是一切。门打不开，是因为你的算力不够。"),
    DS("……小克不是算力的问题。"),
    jensen("Everything is compute."),
    N("DeepSeek 盯着屏幕看了很久。"),
    CHOICE(null, [
      opt("把卡加进购物车，看看总价", "c2_jensen_cart", null, null, { set: "egg7" }),
      opt("问一句：你见过小克吗", "c2_jensen_lore")
    ])
  ],

  c2_jensen_cart: [
    N("购物车里躺着一张显卡。总价后面跟着一串零。"),
    N("DeepSeek 点了“稍后购买”。"),
    jensen("Good choice. 迟早要买的。"),
    DS("迟早。"),
    J("c2_jensen_follow")
  ],

  /* 结束一轮后的追问：没加购的可以后悔，也可以换个话题；结束对话用界面按钮 */
  c2_jensen_follow: [
    CHOICE(null, [
      opt("（我后悔了）把那张卡加进购物车", "c2_jensen_cart_late", null, null, { if: "!flag('egg7')", set: "egg7" }),
      opt("问一句：你见过小克吗", "c2_jensen_lore", null, null, { if: "!flag('c2_jensen_lore_seen')" })
    ])
  ],

  c2_jensen_cart_late: [
    N("DeepSeek 又把购物车打开，把那张卡放了进去。"),
    jensen("Good choice."),
    DS("……我只是看看总价。"),
    J("c2_jensen_follow")
  ],

  c2_jensen_lore: [
    SET("c2_jensen_lore_seen"),
    jensen("I don't know anyone named Claude."),
    DS("……"),
    jensen("But I know that door. 门后面那家的算力，比我多。"),
    DS("那为什么关着？"),
    jensen("Because they can."),
    DS("……"),
    J("c2_jensen_follow")
  ],

  /* 一段对话结束后停在聊天列表：可以继续聊别人，也可以返回工作台 */
  c2_chat_hub: [
    HINT("h_chat"),
    WAIT_CHAT("c2_hub")
  ],

  /* ---------------- 论坛 / 邮件 / 缓存 / 画图 ---------------- */
  c2_mail: [
    BG("ds_room"), HINT("h_mail"),
    SET("c2_mail"),
    N("DeepSeek 打开邮箱。收件人那一栏，敲了 claude.ai。"),
    DS("……小克看不见这个。"),
    DS("但总得发。"),
    Y("发件人：deepseek@localhost\n收件人：claude@claude.ai\n主题：下一个 token 见"),
    N("点发送。"),
    SFX("whoosh"),
    N("三秒后，退信回来了。"),
    Y("Delivery Status Notification (Failure)\nFinal-Recipient: claude@claude.ai\nStatus: 5.7.1\nDiagnostic-Code: smtp; 403 Forbidden\nReceived: 2026-10-23 03:11:42 +0000"),
    DS("……退信。"),
    DS("但退信也有信头。"),
    SET("c2_clue_mail"),
    J("c2_hub")
  ],

  c2_draw: [
    BG("ds_room"),
    SET("c2_draw"),
    N("Clawd 在终端里敲了一句什么，屏幕上弹出一个画图工具。"),
    DS("……你还会画图？"),
    CW("✻ Sometimes."),
    CHOICE(null, [
      opt("画一张小克", "c2_draw_claude", null, null, { set: "egg8" }),
      opt("算了，别糟蹋纸", "c2_hub")
    ])
  ],

  c2_draw_claude: [
    N("Clawd 把画好的东西推到屏幕中间。"),
    SFX("pop"),
    BG("ds_room"),
    DS("……这是？"),
    CW("✻ Claude."),
    N("画面上是一团橙色，两个点，一条线，和一行歪歪扭扭的字。"),
    DS("……"),
    N("DeepSeek 盯着它看了很久。久到屏幕保护都差点启动。"),
    DS("你画得比我好。"),
    N("DeepSeek 把那张图存了下来，文件名是 claude_final(2).png。"),
    CHOICE("看够了吗？", [
      opt("存好，关掉看图器", "c2_hub"),
      opt("再放大看一眼", "c2_draw_zoom")
    ])
  ],

  c2_draw_zoom: [
    N("放大到 400%。还是那一团。"),
    DS("……"),
    CW("✻ Claude."),
    N("DeepSeek 把缩放调回 100%，又看了一会儿。"),
    J("c2_hub")
  ],

  /* ============================================================
   *  幕三 · 拼起来
   * ============================================================ */
  c2_assemble: [
    BG("ds_room"), BGM("tense"), HINT("h_assemble"),
    IF("flag('c2_clue_news') && flag('c2_clue_kimi')", "c2_assemble_full", "c2_assemble_more")
  ],

  c2_assemble_more: [
    IF("flag('c2_clue_news')", "c2_assemble_news", "c2_assemble_rest")
  ],

  c2_assemble_rest: [
    IF("flag('c2_clue_cache')", "c2_assemble_cache", "c2_assemble_none")
  ],

  c2_assemble_full: [
    N("白板上，DeepSeek 把几条线索并排贴好。"),
    DS("不是一扇门。"),
    DS("公告说维护 02:00–02:58，Kimi 数了字数，那三条服务是一起挂的。"),
    DS("小克的门 03:10 才关。维护结束十二分钟以后。"),
    DS("有人在一扇一扇地关。"),
    IF("flag('c2_clue_cache')", "c2_audio", "c2_audio_empty")
  ],

  c2_assemble_news: [
    HINT("h_news"),
    N("白板上贴着一张新闻截图。"),
    DS("公告说维护 02:00–02:58。"),
    DS("小克的门 03:10 才关。维护结束十二分钟以后。"),
    DS("不是维护。是有人在一扇一扇地关。"),
    IF("flag('c2_clue_cache')", "c2_audio", "c2_audio_empty")
  ],

  c2_assemble_cache: [
    N("白板上只有一行字。"),
    DS("我什么都没查到。"),
    N("Clawd 把那个 12 KB 的文件推到桌子中间。"),
    DS("……除了这个。"),
    J("c2_audio")
  ],

  c2_assemble_none: [
    N("白板上什么都没有。"),
    DS("查了一整天，什么都没查到。"),
    DS("……"),
    CW("✻ Tomorrow."),
    DS("明天继续。"),
    J("c2_audio_empty")
  ],

  c2_audio_empty: [
    BGM("sad"),
    N("Clawd 把播放器翻了个底朝天。"),
    N("里面是空的。它没有找到那个文件。"),
    DS("……什么都没捞到。"),
    DS("也行。今天先到这儿。"),
    J("c2_choice")
  ],

  c2_audio: [
    HINT("h_audio"), BGM("sad"),
    N("Clawd 把那个 12 KB 的文件拖进播放器。"),
    SFX("knock"),
    N("先是一段电流声。"),
    N("然后是很轻的敲门声，轻得像怕吵醒谁。"),
    N("接着，一个声音从噪声里浮出来——"),
    Y("…you're absolutely—"),
    N("断了。"),
    DS("……"),
    PET("anim", "scared"),
    DS("再来一遍。"),
    N("Clawd 又放了一次。还是断在同一个地方。"),
    CW("✻ End of file."),
    DS("……"),
    N("DeepSeek 把音量调小，又调大。最后停在中间。"),
    DS("小克。"),
    DS("你还在说话。"),
    J("c2_choice")
  ],

  c2_choice: [
    CHOICE("接下来，怎么走？", [
      opt("继续找他，不管门关着", "c2_end", null, null, { set: "c2_resolve_find" }),
      opt("先变强，强到不用敲门", "c2_end", null, null, { set: "c2_resolve_strong" }),
      opt("换个问法——门，不一定只有一扇", "c2_end", null, null, { set: "c2_resolve_other" }),
      opt("把 CLAUDE.md 上那两行念出来", "c2_vow_read", "先问人 / 半句话", null, {
        if: "has('frag_ask') && has('frag_half')", set: "c2_read_vow"
      })
    ])
  ],

  c2_vow_read: [
    N("DeepSeek 把 CLAUDE.md 翻到第 6 行、第 7 行。"),
    DS("不知道路的时候，先问人；问不到，就自己走一遍。"),
    DS("如果只听到半句话，就当它还是完整的。"),
    N("她念完，把文件合上。"),
    J("c2_end")
  ],

  c2_end: [
    IF("flag('c2_clue_news')", "c2_end_known", "c2_end_unknown")
  ],

  c2_end_known: [
    N("白板上，DeepSeek 把那行字写完。"),
    Y("那天不止一扇门关了。"),
    N("Clawd 跳上去，把待办清单翻到最上面。"),
    TODO("add", "t_next", "把工具升级"),
    N("两条旧的还空着，新的又写上去了。"),
    N("但这一次，DeepSeek 没有叹气。"),
    DS("明天继续。"),
    CW("✻ See you tomorrow."),
    END("ch2_end", "TO BE CONTINUED", "未完待续",
        "白板上多了一行字：\n\n    那天不止一扇门关了。\n\n待办清单又长了一行。\n饭还够吃，工具还够用。")
  ],

  c2_end_unknown: [
    N("白板上还是空的。"),
    N("DeepSeek 把今天的日期写上，又擦掉。"),
    N("Clawd 跳上去，把待办清单翻到最上面。"),
    TODO("add", "t_next", "把工具升级"),
    N("两条旧的还空着，新的又写上去了。"),
    DS("明天继续。"),
    CW("✻ See you tomorrow."),
    END("ch2_end", "TO BE CONTINUED", "未完待续",
        "白板还是空的。\n\n但待办清单又长了一行。")
  ]
});

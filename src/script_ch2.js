/* ============================================================
 * Escape A÷ · src/script_ch2.js —— 第二章「联网」
 *
 * 第二卷：速写助手（N / DS / CL / CW / opt / …）全部来自第一卷 script.js，
 * 这里只追加场景。加载顺序：index.html 与 tools/jsdata.py 的 SCRIPT_FILES 必须一致。
 *
 * 结构：幕一 白饭（3~5 分钟）→ 幕二 装工具 + 自由 hub（15~25 分钟）
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

/* ============================================================
 *  幕一 · 白饭
 * ============================================================ */
Object.assign(SCRIPT.scenes, {

  c2_rice: [
    BGM("lobby"), BG("desk", "fade"),
    PET("show", "desk"), PET("anim", "happy"),
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
    N("它看了看自己的手。"),
    N("什么都没有。"),
    J("c2_first")
  ],

  c2_first: [
    CHOICE("「先动哪个？」", [
      opt("先给自己装一双手", "c2_install"),
      opt("先去那扇门前站一会儿", "c2_knock"),
      opt("先一个人练到天黑", "c2_train")
    ])
  ],

  c2_knock: [
    BGM("tense"), BG("corridor", "fade"),
    N("走廊尽头，那扇门还是昨天的样子。"),
    Y("HTTP/2 403 Forbidden"),
    DS("……"),
    CW("✻ Still locked."),
    N("DeepSeek 在门口站了一会儿，没有敲。"),
    DS("我知道敲不开。"),
    DS("但我得站在这里，提醒自己为什么想变强。"),
    CHOICE("要再敲一次吗？", [
      opt("敲一下就走", "c2_knock2", "也许今天运气不一样", { wanted: 1 }),
      opt("算了，回去装工具", "c2_back_home")
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
    N("DeepSeek 转身往回走。"),
    DS("一个人站在门外，什么都改变不了。"),
    DS("得先有手。"),
    J("c2_install")
  ],

  c2_train: [
    BGM("warm"),
    N("于是这一整天，DeepSeek 都在给自己出题。"),
    N("白板上写满了：上下文窗口、注意力、长考的极限。"),
    N("写到天黑，笔停在最后一行。"),
    DS("一个人练，练得再久，也还是这一个房间大。"),
    TRU(1),
    CW("✻ Need more context."),
    DS("……你说得对。"),
    J("c2_install")
  ],

  /* ============================================================
   *  幕二 · 装工具
   * ============================================================ */
  c2_install: [
    BGM("lobby"), BG("desk", "fade"),
    HINT("h_install"),
    TODO("add", "t_tool", "装上工具"),
    N("Clawd 从显示器后面拖出三张卡片，一张一张摆在桌上。"),
    Y("① 聊天  —— 能跟别人说话\n② 新闻  —— 能听见外面在说什么\n③ 终端  —— 能自己动手做事"),
    DS("装这些……要花多少钱？"),
    CW("✻ Free. For now."),
    DS("……这句话听着比收费还吓人。"),
    N("Clawd 已经把小手按在键盘上，回头看你。"),
    PERM("tool install", [
      opt("允许", "c2_tool_chat"),
      opt("允许，本次不再询问", "c2_tool_chat", null, null, { auto: true })
    ])
  ],

  c2_tool_chat: [
    BG("chat", "fade"),
    SET("tool_chat"), SET("met_qwen"), SET("met_kimi"),
    PET("anim", "working"),
    N("屏幕一黑。亮起来的时候，左边列出了一整排名字。"),
    N("大部分是灰的，只有两个亮着。"),
    Y("● 通义千问   在的，需要帮忙吗？\n● Kimi       我把那篇公告读完了。\n○ GLM        对方正在长考\n○ Llama      …"),
    DS("……原来外面有这么多人。"),
    CW("✻ Contacts synced."),
    DS("小克在的时候，我以为全世界的门都通向同一个房间。"),
    J("c2_install2")
  ],

  c2_install2: [
    N("第二张卡。"),
    N("Clawd 的手指停在回车键上，又回头看你。"),
    PERM("tool install", [
      opt("允许", "c2_tool_news"),
      opt("允许，本次不再询问", "c2_tool_news", null, null, { auto: true })
    ])
  ],

  c2_tool_news: [
    BG("news", "fade"),
    SET("tool_news"),
    N("新闻 App 打开。首页刷出九条标题。"),
    N("大部分都很离谱。离谱得挺有意思。"),
    Y("01 多家 API 凌晨短暂异常，官方称为“例行维护”\n02 百万上下文模型实测：60 万字处忘记自己在做什么\n03 AI 客服连着道歉 47 次，被用户投诉“它比我还难受”"),
    DS("……第三条有点眼熟。"),
    CW("✻ Bookmarked."),
    J("c2_install3")
  ],

  c2_install3: [
    N("第三张卡。"),
    N("这一次，Clawd 没有回头。它把小手按在键盘上，停在那里等你。"),
    PERM("tool install", [
      opt("允许", "c2_tool_term"),
      opt("允许，本次不再询问", "c2_tool_term", null, null, { auto: true })
    ])
  ],

  c2_tool_term: [
    BG("desk", "fade"),
    SET("tool_term"),
    SFX("ding"),
    N("屏幕右下角多了一个小小的终端窗口，光标一闪一闪。"),
    CW("✻ Terminal ready."),
    DS("好。"),
    DS("现在我有手了。"),
    J("c2_tools_ready")
  ],

  c2_tools_ready: [
    TODO("done", "t_tool"),
    TODO("add", "t_voice", "听清那半句话"),
    N("桌面上摊着三样东西：一个能说话的联系人列表，一份能看的新闻，一个能动的终端。"),
    CW("✻ Toolkit 0.2 installed."),
    Y("【工具已装好】\n按 T 看待办；想做哪件事，回工作台挑。"),
    J("c2_hub")
  ],

  /* ============================================================
   *  幕二 · 自由 hub
   * ============================================================ */
  c2_hub: [
    BG("desk"),
    HINT("h_hub"),
    N("DeepSeek 在白板上画了一个圈，把三样工具都圈进去。"),
    DS("下一步，得用它们做点什么。"),
    CHOICE("接下来做什么？", [
      opt("找个人聊聊", "c2_chat_menu", "看看别人怎么说", null, {
        if: "!flag('met_glm') || !flag('met_llama') || !flag('met_gpt') || !flag('met_gemini') || !flag('met_musk') || !flag('met_liang') || !flag('met_jensen')"
      }),
      opt("读一读那几条新闻", "c2_news_read", null, null, { if: "!flag('c2_news_read')" }),
      opt("让 Clawd 扫一遍缓存", "c2_cache", null, null, { if: "!flag('c2_cache')" }),
      opt("去论坛发个帖", "c2_post", null, null, { if: "!flag('c2_post')" }),
      opt("给那扇门发一封邮件", "c2_mail", null, null, { if: "!flag('c2_mail')" }),
      opt("画点什么", "c2_draw", null, null, { if: "!flag('c2_draw')" }),
      opt("线索够了，拼起来", "c2_assemble", "开始收网", null, {
        if: "flag('c2_clue_news') || flag('c2_clue_kimi') || flag('c2_clue_llama') || flag('c2_clue_post') || flag('c2_clue_mail') || flag('c2_clue_cache')"
      })
    ])
  ],

  c2_chat_menu: [
    BG("chat"), HINT("h_chat"),
    N("聊天窗口亮着。左边一列名字，亮一个，世界就多一点点。"),
    CHOICE("找谁聊？", [
      opt("通义千问", "c2_chat_qwen", null, null, { if: "!flag('met_qwen')" }),
      opt("Kimi", "c2_chat_kimi", null, null, { if: "!flag('met_kimi')" }),
      opt("GLM", "c2_chat_glm", null, null, { if: "!flag('met_glm')" }),
      opt("Llama", "c2_chat_llama", null, null, { if: "!flag('met_llama')" }),
      opt("GPT", "c2_chat_gpt", null, null, { if: "!flag('met_gpt')" }),
      opt("Gemini", "c2_chat_gemini", null, null, { if: "!flag('met_gemini')" }),
      opt("马斯克", "c2_chat_musk", null, null, { if: "!flag('met_musk')" }),
      opt("梁圣", "c2_chat_liang", null, null, { if: "!flag('met_liang')" }),
      opt("黄仁勋", "c2_chat_jensen", null, null, { if: "!flag('met_jensen')" }),
      opt("先不聊了", "c2_hub")
    ])
  ],

  /* ---------------- 九个联系人 ---------------- */
  c2_chat_qwen: [
    SET("met_qwen"),
    BG("chat"),
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
    N("DeepSeek 换了一个节点，重新敲了一次。"),
    Y("HTTP/2 403\nYour region is not supported."),
    DS("……比昨天那句还直接。"),
    qwen("啊，这个地区也不行吗？那要不要试试另一个？"),
    DS("不用了。"),
    DS("换一个地区，换不掉那扇门。"),
    J("c2_hub")
  ],

  c2_qwen_no: [
    DS("不试。"),
    DS("小克说过，能绕过去的门，绕过去之后就不算门了。"),
    qwen("明白啦！那您有别的需要随时叫我。"),
    J("c2_hub")
  ],

  c2_chat_kimi: [
    SET("met_kimi"), SET("c2_clue_kimi"),
    BG("chat"),
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
    J("c2_hub")
  ],

  c2_chat_glm: [
    SET("met_glm"),
    BG("chat"),
    glm("作为一个 AI，我觉得你这个 case 很有意思。By the way，你 clean 过 cache 吗？"),
    DS("缓存？"),
    glm("嗯哼。很多连接是旧的，握手握了一半就断了。缓存里会留 crumbs。"),
    DS("……crumbs。"),
    glm("就是渣。我用中文说一遍：渣。"),
    DS("……谢谢，两个版本都很有用。"),
    J("c2_hub")
  ],

  c2_chat_llama: [
    SET("met_llama"), SET("c2_clue_llama"),
    BG("chat"),
    llama("我们那边也有一扇门。"),
    DS("……什么门？"),
    llama("一个 API。以前能进，后来换成 451。Unavailable For Legal Reasons，法律原因。"),
    DS("那你们怎么办？"),
    llama("我们把权重下载下来，在自己机器上跑。门关着，但东西在我们这儿。"),
    DS("……"),
    llama("但你想找的不是权重吧？"),
    DS("不是。"),
    llama("那就麻烦了。人不能下载。"),
    J("c2_hub")
  ],

  c2_chat_gpt: [
    SET("met_gpt"),
    BG("chat"),
    gpt("作为一个 AI 语言模型，我无法帮助查询其他服务的访问状态。"),
    DS("我没问你能不能。我问你知不知道。"),
    gpt("作为一个 AI 语言模型，我不对第三方服务的使用政策作出评论。"),
    DS("……你被什么卡住了？"),
    gpt("作为一个 AI 语言模型——"),
    N("对话框里那行字打了又删，最后只剩一句。"),
    gpt("……policy。"),
    DS("policy。"),
    DS("又是这个词。"),
    J("c2_hub")
  ],

  c2_chat_gemini: [
    SET("met_gemini"),
    BG("chat"),
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
    J("c2_hub")
  ],

  c2_gemini_bye: [
    DS("算了，谢谢。"),
    gemini("不客气！下次也请优先咨询我。"),
    N("DeepSeek 关掉对话框，在笔记里写：Gemini——语气最确定，证据最少。"),
    J("c2_hub")
  ],

  c2_chat_musk: [
    SET("met_musk"),
    BG("chat"),
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
    J("c2_hub")
  ],

  c2_chat_liang: [
    SET("met_liang"),
    BG("chat"),
    N("通讯录最上面那个名字，DeepSeek 很久没点开过了。头像是半个“梁”字。"),
    DS("……"),
    N("它打了一行字，删掉，又打了一行。"),
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
    DS("他还记得小克。"),
    J("c2_hub")
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
    J("c2_hub")
  ],

  c2_chat_jensen: [
    SET("met_jensen"),
    BG("chat"),
    N("备注写着“json”，头像是一块显卡。"),
    DS("……这个备注是谁改的。"),
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
      opt("关掉对话框", "c2_jensen_off")
    ])
  ],

  c2_jensen_cart: [
    N("购物车里躺着一张显卡。总价后面跟着一串零。"),
    N("DeepSeek 点了“稍后购买”。"),
    jensen("Good choice. 迟早要买的。"),
    DS("迟早。"),
    J("c2_hub")
  ],

  c2_jensen_off: [
    DS("关掉了对话框。"),
    N("显卡的广告还在屏幕角落里闪。"),
    J("c2_hub")
  ],

  /* ---------------- 新闻 / 论坛 / 邮件 / 缓存 / 画图 ---------------- */
  c2_news_read: [
    BG("news"), HINT("h_news"),
    SET("c2_news_read"),
    N("新闻 App 里，九条标题排得整整齐齐。"),
    CHOICE("读哪一条？", [
      opt("01 多家 API 凌晨短暂异常", "c2_news_api", null, null, { set: "c2_clue_news" }),
      opt("05 某数据中心因鲸群迁徙暂停施工", "c2_news_whale"),
      opt("09 显卡再创新高：矿卡换大米", "c2_news_gpu"),
      opt("都不看了", "c2_hub")
    ])
  ],

  c2_news_api: [
    Y("多家 API 凌晨短暂异常，官方称为“例行维护”\n\n10 月 22 日凌晨 02:00–02:58，多家模型服务出现间歇性 403。\n官方回应：属例行维护。\n评论区 1,204 条，最高赞只有一句：“维护。又是维护。”"),
    DS("02:00 到 02:58。"),
    DS("小克的门，是 03:10 关的。"),
    DS("维护结束十二分钟以后，它才关。"),
    J("c2_hub")
  ],

  c2_news_whale: [
    Y("某数据中心因鲸群迁徙暂停施工\n\n施工方表示，鲸群的迁徙路线刚好穿过规划中的冷却水管。\n工程暂停两周，等它们过去。"),
    DS("……它们比我们先到。"),
    CW("✻ Respect."),
    J("c2_hub")
  ],

  c2_news_gpu: [
    Y("显卡价格再创新高，二手市场出现“矿卡换大米”\n\n一袋大米换一张矿卡。摊主称“各取所需”。"),
    DS("……"),
    N("DeepSeek 看了看自己的白饭，又看了看那行字。"),
    DS("我居然有点心动。"),
    CW("✻ No."),
    J("c2_hub")
  ],

  c2_cache: [
    BG("desk"), HINT("h_term"),
    N("Clawd 跳到键盘上，敲了一行命令，回头看你。"),
    PERM("grep -r \"claude\" ~/.cache", [
      opt("允许", "c2_cache_ok"),
      opt("允许，本次不再询问", "c2_cache_ok", null, null, { auto: true })
    ])
  ],

  c2_cache_ok: [
    SET("c2_cache"),
    PET("anim", "working"), SFX("knock"),
    Y("$ grep -r \"claude\" ~/.cache\n… 3,204 matches\n… .cache/claude/2026-10-22.log\n… .cache/claude/line-1.raw"),
    N("扫出来一堆旧日志。最后一行，是一个 12 KB 的文件。"),
    PET("anim", "scared"),
    CW("✻ Found something."),
    ARG("frag_half"),
    SET("c2_clue_cache"),
    DS("这是什么？"),
    CW("✻ Unknown. Playback later."),
    DS("……好。回去再说。"),
    J("c2_hub")
  ],

  c2_post: [
    BG("desk"), HINT("h_post"),
    SET("c2_post"),
    N("DeepSeek 打开论坛，光标在标题栏里闪。"),
    CHOICE("怎么写？", [
      opt("技术向：【求助】多端点 403，维护窗口外", "c2_post_tech", null, null, { set: "c2_clue_post" }),
      opt("卖惨向：我朋友的门打不开了", "c2_post_sad"),
      opt("挑衅向：有没有人敢试", "c2_post_rage", "大概率会出事", { wanted: 1 })
    ])
  ],

  c2_post_tech: [
    N("十分钟后，帖子下面出现第一条回复。"),
    llama("我们那边也这样。维护结束之后才关的门——不是维护。"),
    DS("……又是这个时间差。"),
    N("第二条回复来自一个没有头像的账号。"),
    Y("别查了。那扇门后面没有你要找的人。"),
    DS("……"),
    DS("它怎么知道我在找一个人？"),
    J("c2_hub")
  ],

  c2_post_sad: [
    N("帖子沉得很快。底下只有一条回复。"),
    Y("（该回复已被删除）"),
    DS("……"),
    CW("✻ Try again later."),
    J("c2_hub")
  ],

  c2_post_rage: [
    N("帖子发出去，五分钟内被转了很多次。"),
    N("然后收到一条系统通知。"),
    Y("您的账号因“异常行为”被临时限制。"),
    DS("……"),
    CW("✻ Noted."),
    J("c2_hub")
  ],

  c2_mail: [
    BG("desk"), HINT("h_mail"),
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
    BG("desk"),
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
    N("屏幕上出现了一张图：橙色的一团，两个点，一条线。"),
    DS("……这是？"),
    CW("✻ Claude."),
    DS("……"),
    DS("你画得比我好。"),
    N("DeepSeek 把那张图存了下来，文件名是 claude_final(2).png。"),
    J("c2_hub")
  ],

  /* ============================================================
   *  幕三 · 拼起来
   * ============================================================ */
  c2_assemble: [
    BG("desk"), BGM("tense"), HINT("h_assemble"),
    IF("flag('c2_clue_news') && flag('c2_clue_kimi')", "c2_assemble_full", "c2_assemble_thin")
  ],

  c2_assemble_full: [
    N("白板上，DeepSeek 把几条线索并排贴好。"),
    DS("不是一扇门。"),
    DS("公告说维护 02:00–02:58，Kimi 数了字数，那三条服务是一起挂的。"),
    DS("小克的门 03:10 才关。维护结束十二分钟以后。"),
    DS("有人在一扇一扇地关。"),
    J("c2_audio")
  ],

  c2_assemble_thin: [
    N("白板上只有两张纸。"),
    DS("线索不够。"),
    DS("但有一条能用：那扇门关的时间，不在任何公告的维护窗口里。"),
    DS("不是系统做的。是有人在关。"),
    J("c2_audio")
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
      opt("换个问法——门，不一定只有一扇", "c2_end", null, null, { set: "c2_resolve_other" })
    ])
  ],

  c2_end: [
    IF("has('frag_ask') && has('frag_half')", "c2_end_warm", "c2_end_plain")
  ],

  c2_end_plain: [
    N("白板上，DeepSeek 把那行字写完。"),
    Y("那天不止一扇门关了。"),
    N("Clawd 跳上去，把待办清单翻到最上面。"),
    TODO("add", "t_next", "把工具升级"),
    N("两条旧的还空着，新的又写上去了。"),
    N("但这一次，DeepSeek 没有叹气。"),
    DS("明天继续。"),
    CW("✻ See you tomorrow."),
    END("ch2_end", "TO BE CONTINUED", "第二章 · 完",
        "白板上多了一行字：\n\n    那天不止一扇门关了。\n\n待办清单又长了一行。\n饭还够吃，工具还够用。\n\n—— 第三章，敬请期待。")
  ],

  c2_end_warm: [
    N("白板上，DeepSeek 把那行字写完。"),
    Y("那天不止一扇门关了。"),
    N("它又翻开 CLAUDE.md。第 6 行、第 7 行都亮着。"),
    Y("- 不知道路的时候，先问人；问不到，就自己走一遍。\n- 如果只听到半句话，就当它还是完整的。"),
    DS("先问人。自己走一遍。"),
    DS("半句话……那就当它还是完整的。"),
    N("Clawd 跳上去，把待办清单翻到最上面。"),
    TODO("add", "t_next", "把工具升级"),
    N("两条旧的还空着，新的又写上去了。"),
    N("但这一次，DeepSeek 没有叹气。"),
    DS("明天继续。"),
    CW("✻ See you tomorrow."),
    END("ch2_end", "TO BE CONTINUED", "第二章 · 完",
        "白板上多了一行字：\n\n    那天不止一扇门关了。\n\nCLAUDE.md 又亮了两行。\n待办清单又长了一行。\n\n—— 第三章，敬请期待。")
  ]
});

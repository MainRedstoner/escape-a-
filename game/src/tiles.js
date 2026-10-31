/* ============================================================
 * Escape A÷ · game/src/tiles.js —— 地块图例、属性表、官方图标
 *
 * 关卡地图是 ASCII（见 game/src/levels.js），这里的字符 → 地块属性一张表。
 * tools/validate_game.py 会读同一份图例做静态校验，改这里要同步它。
 *
 * 字段：
 *   label    图鉴名字
 *   hint     图鉴说法（带点剧情感）
 *   solid    挡住移动
 *   support  能站（横版里踩得住）
 *   oneway   单向平台（横版只挡下面，俯视当普通地板）
 *   pit      踩上去 / 掉进去就死
 *   look     玩家肉眼看到的是哪个字符（假墙假地板靠它骗人）
 *   trap     进格时交给 world.enterTile() 处理的关键字
 *   lamp     自发光半径（格）
 * ============================================================ */
"use strict";

window.TILES = (() => {

  const DEFS = {
    // 空格：关卡外，一律当墙
    " ": { label: "虚空", solid: true, support: false, void: true },

    ".": { label: "石板", hint: "屎山表面一块普通代码，看着人畜无害。" },
    "_": { label: "空气", hint: "横版里的空隙：踩不住，会掉下去。", air: true },
    "#": { label: "墙", hint: "堆实的祖传代码，撞得头破血流。", solid: true },
    "+": { label: "单杠平台", hint: "只能从上面踩住，从下面穿得过去（横版）。", support: true, oneway: true },
    "~": { label: "深坑", hint: "删干净了，但没测。掉下去就没了。", pit: true },
    "l": { label: "还亮着的旧屏幕", hint: "上面那个显示器一直没人关，它周围永远看得见。", lamp: 2.6 },
    "o": { label: "commit 点", hint: "踩上去按 C 落一个 commit —— 你的救命稻草。", commit: true, lamp: 1.3 },
    "P": { label: "PR 门", hint: "甲虫清空前它是灰的；踩一个没解锁的 PR 会有惊喜。", pr: true, lamp: 1.2 },
    "x": { label: "玻璃渣", hint: "散落的一地 `undefined`，踩上去就扎死。", pit: true, trap: "spike" },

    "\"": { label: "假墙", hint: "看着是墙，其实是一行注释掉的代码 —— 能走过去。", solid: false, look: "#" },
    "&": { label: "假地板", hint: "看着是地板，下面是空的。丢个 log 探针验一验。", pit: true, look: "." },
    "t": { label: "TODO 砖", hint: "踩上去 2.5 秒后塌。别在上面磨叽。", trap: "todo", look: "." },
    "s": { label: "脆板", hint: "踩上 0.5 秒就碎，裂缝是它唯一的提示。", trap: "crumble", look: "." },
    "d": { label: "依赖地砖", hint: "必须按指定顺序踩；踩错顺序，屎山会生气。", trap: "dep", look: "." },
    "b": { label: "传送带", hint: "每回合把你往一个方向推一格。它在替你写代码。", trap: "belt", look: "." },
    "j": { label: "弹跳板", hint: "踩上去被弹上天，能跳过两格宽的窟窿。", trap: "bounce", look: "." },
    "|": { label: "测试门禁", hint: "要消耗一个「测试」配额才推得开。", solid: true, trap: "door", look: "#" },
    "w": { label: "移动代码块", hint: "它按自己的节奏来回挪，被压住就没了。", solid: true, trap: "mover", look: "#" },
    "m": { label: "泄漏源", hint: "没 free 的东西都从这里长出来，越摊越大。", trap: "leak", look: "." },
    "g": { label: "历史桩", hint: "你自己的 git history 从这里爬出来追你。", trap: "ghost", look: "." },
    "C": { label: "CI 红灯", hint: "一道红光是失败的流水线，它会一路推平过来。", trap: "ci", look: "." },
    "!": { label: "假 PR 门", hint: "长得和 PR 一模一样，但踩上去是 `404 Not Found`。", pr: true, trap: "fakepr", look: "P" }
  };

  /* 玩家能站上去的字符（非 solid 非 pit） */
  function def(ch) { return DEFS[ch] || DEFS[" "]; }
  function isSolid(ch) { const d = def(ch); return !!d.solid; }
  function isPit(ch) { const d = def(ch); return !!d.pit; }
  function isSupport(ch) { const d = def(ch); return d.solid ? false : (d.pit ? !!d.oneway : true); }
  function lookOf(ch) { const d = def(ch); return d.look || ch; }

  /* ---------------- GitHub 官方 octicon 路径（git-pull-request / bug） --------
   * 直接内联路径数据，不在运行时 fetch —— file:// 下 fetch 会被拦。
   * 来源：primer/octicons 24px 版。 */
  const PR_PATHS = [
    "M16 19.25a3.25 3.25 0 1 1 6.5 0 3.25 3.25 0 0 1-6.5 0Zm-14.5 0a3.25 3.25 0 1 1 6.5 0 3.25 3.25 0 0 1-6.5 0Zm0-14.5a3.25 3.25 0 1 1 6.5 0 3.25 3.25 0 0 1-6.5 0ZM4.75 3a1.75 1.75 0 1 0 .001 3.501A1.75 1.75 0 0 0 4.75 3Zm0 14.5a1.75 1.75 0 1 0 .001 3.501A1.75 1.75 0 0 0 4.75 17.5Zm14.5 0a1.75 1.75 0 1 0 .001 3.501 1.75 1.75 0 0 0-.001-3.501Z",
    "M13.405 1.72a.75.75 0 0 1 0 1.06L12.185 4h4.065A3.75 3.75 0 0 1 20 7.75v8.75a.75.75 0 0 1-1.5 0V7.75a2.25 2.25 0 0 0-2.25-2.25h-4.064l1.22 1.22a.75.75 0 0 1-1.061 1.06l-2.5-2.5a.75.75 0 0 1 0-1.06l2.5-2.5a.75.75 0 0 1 1.06 0ZM4.75 7.25A.75.75 0 0 1 5.5 8v8A.75.75 0 0 1 4 16V8a.75.75 0 0 1 .75-.75Z"
  ];
  const BUG_PATH =
    "M7.72.22a.75.75 0 0 1 1.06 0l1.204 1.203A4.98 4.98 0 0 1 12 1c.717 0 1.4.151 2.016.423L15.22.22a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-.971.972A4.991 4.991 0 0 1 17 6v1.104a2.755 2.755 0 0 1 1.917 1.974l1.998-.999a.75.75 0 0 1 .67 1.342L19 10.714V13.5l3.25.003a.75.75 0 0 1 0 1.5L19 15.001V16c0 .568-.068 1.134-.204 1.686l.04.018 2.75 1.375a.75.75 0 1 1-.671 1.342l-2.638-1.319A6.998 6.998 0 0 1 12 23a6.998 6.998 0 0 1-6.197-3.742l-2.758 1.181a.752.752 0 0 1-1.064-.776.752.752 0 0 1 .474-.602l2.795-1.199A6.976 6.976 0 0 1 5 16v-.996H1.75a.75.75 0 0 1 0-1.5H5v-2.79L2.415 9.42a.75.75 0 0 1 .67-1.342l1.998.999A2.756 2.756 0 0 1 7 7.104V6a4.99 4.99 0 0 1 1.69-3.748l-.97-.972a.75 0 0 1 0-1.06ZM6.5 9.75V16a5.5 5.5 0 1 0 11 0V9.75c0-.69-.56-1.25-1.25-1.25h-8.5c-.69 0-1.25.56-1.25 1.25ZM8.5 7h7V6a3.5 3.5 0 1 0-7 0Z";

  const paths = {};
  function icon(name) {
    if (paths[name]) return paths[name];
    const list = name === "pr" ? PR_PATHS.map(d => new Path2D(d)) : [new Path2D(BUG_PATH)];
    paths[name] = list;
    return list;
  }

  return { DEFS, def, isSolid, isPit, isSupport, lookOf, icon,
           CHARS: Object.keys(DEFS) };
})();

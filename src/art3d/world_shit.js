/* ============================================================
 * Escape A÷ · src/art3d/world_shit.js —— 大世界分区：屎山
 *
 * 局部坐标（world.js 用 D = m4(-22, 0, -70, 0, π/2, 0) 摆到世界坐标）：
 *   · 原点 = 街尾的垃圾场；-Z 往里走是山体，山心在局部 (0, -12)。
 *   · 局部 +Z = 世界 +X = GitHub 街的方向（街口/牌坊在东边）：
 *     world_shit 的机位就站在 +Z，从街上走过来正好对着这一面。
 *   · 局部 -X = 世界 +Z（偏南）—— 主标题镜头的方向；阳光从世界 (-0.3, 0.7, 0.6)
 *     打过来，换算到局部接近 (-0.6, 0.7, -0.3)，所以这一面还是受光面，细节要做满。
 *   · 局部 +X = 世界 -Z（背面、朝海），只负责轮廓。
 *   · 地面 y = 0；山脚半径 BASE_R = 9.5，山高 H = 9.5，山顶电视天线到 ~12.5。
 *
 * 山体不是「一道固定 z 的平面墙」，而是一座有实心的椭圆锥：
 *     R(y) = BASE_R · (1 − y/H)^0.6        轮廓半径随高度收分
 *     z 方向再压扁到 EZ = 0.82
 *   方位角 a、高度 y 的坡面点 = (CX + R·cos a, y, CZ + EZ·R·sin a)，
 *   外法线 / yaw / pitch 全部由下面的 surf() 现算（pitch 是坡面坡度，屏幕会
 *   顺着坡往后仰，不再是一块硬插进去的竖板）。
 *   挂屏、胶带、涂鸦、防雨布、电缆、甲虫都贴着这个面走 —— 以前
 *   z = CZ + rad + 0.28 只按高度算半径，山体在 |x| 大处早就退到后面去了，
 *   于是两侧的屏离箱面 2~3 米，看着就是浮在半空。
 *   每块屏背后再塞一个扎进山里的支撑箱体、下沿压一道木条、两根斜撑返到坡面、
 *   右下角一根电缆顺着坡爬到山脚的接线盒，从街口和主标题两个方向看都「焊」住了。
 *
 * 结构：地面污渍 → 实心核心（分层材质）+ 山顶收口/天线 → 表面乱箱壳与大件 →
 *       垃圾裙边 + 山脚一圈废件 → 三个可见面的旧屏幕（含大字报 / 闪红屏）→
 *       胶带 / 涂鸦 / 防雨布 / 铁网 / 警戒带 / 灯串 → 鎏金佛祖 + 石台供桌 →
 *       警告牌 / 负责人牌 → 意大利面电缆 → 甲虫 / 苍蝇 / 臭气 / 火桶 →
 *       朝街口（局部 +Z）的过渡垃圾带。
 * ============================================================ */
"use strict";

const A3DWorldShit = (() => {
  function build(ctx) {
    const W = ctx.W, st = ctx.st, D = ctx.D;
    const T = W.T, P = W.P, M = W.M, m4 = W.m4, TAU = W.TAU;
    const r = ctx.r;                       // 带种子的随机数，构图每次一样
    const pen = (key, tex, opts) => W.penAt(st, D, "sm." + key, tex, opts);
    const glow = (key, tex, opts) => W.glowAt(st, D, "sm." + key, tex, opts);
    const dyno = (tex, opts, fn) => W.dynoAt(st, D, tex, opts, fn);
    const points = (list, opts) => W.addPoints(st, D, list, opts);
    const aim = (x, y, z, rx, ry, rz) => M.mul(D, m4(x, y, z, rx || 0, ry || 0, rz || 0));
    const Gbox = W.Gbox;
    const D2R = Math.PI / 180;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const shuffle = arr => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };

    /* ============================================================
     *  布局 —— 山心、山脚半径、层数沿用原场景；佛像从山脚往前挪
     * ============================================================ */
    const CX = 0, CZ = -12;               // 山体中心（局部）
    const BASE_R = 9.5, H = 9.5;          // 山脚半径 / 山高
    const EZ = 0.82;                      // 椭圆截面的 z 压扁系数
    const LAYERS = 17;                    // 乱箱层数
    /* 佛像：原来在 (BX, 0, -4.0)，正好杵在山脚的箱堆里 —— 全靠「佛像跟前留空」
     * 挖出一个洞才没被埋。现在山体有实心核心，必须把整座神龛挪到山脚外面：
     * 石台前缘落在山脚垃圾环前面，供桌、跪垫、地砖再往前铺。 */
    const BX = -7.8, BZ = -4.0;           // 佛像（局部）
    const BY = 0.28;                      // 石台高度 —— 莲台坐在石台上，不再陷进地里

    /* ============================================================
     *  坡面 —— 一套函数，全文件都用它「问山要坐标」
     * ============================================================ */
    /** 高度 y 处的轮廓半径（x 方向）；地面以下按山脚算 */
    function shellR(y) {
      if (y <= 0) return BASE_R;
      const t = Math.min(1, y / H);
      return Math.max(0.5, BASE_R * Math.pow(1 - t, 0.6));
    }
    /** 轮廓的收缩率（正数）：坡面越往上越陡 */
    function slopeAt(y) {
      const t = Math.min(0.985, Math.max(0, y / H));
      return 0.6 * BASE_R / H * Math.pow(1 - t, -0.4);
    }
    /** 椭圆截面在方位角 a 处的外法线朝向（绕 Y 的 yaw） */
    function outYaw(a) { return Math.atan2(Math.cos(a), Math.sin(a) / EZ); }
    /**
     * 坡面上的一点。
     * @param a   方位角：0 = +X 背面，π/2 = +Z 朝街口，π = -X 主标题那一面
     * @param y   高度
     * @param out 沿外法线外推的距离（屏幕 / 胶带要浮出箱面一点）
     * 返回 { x, y, z, nx, ny, nz, yaw, pitch, a, R }；yaw / pitch 直接喂 m4()。
     */
    function surf(a, y, out) {
      const c = Math.cos(a), s = Math.sin(a);
      const R = shellR(y);
      const sl = slopeAt(y);
      const Lh = Math.hypot(c, s / EZ);            // 水平法线长度
      const L3 = Math.hypot(Lh, sl);               // 3D 法线长度
      const nx = c / L3, ny = sl / L3, nz = (s / EZ) / L3;
      const d = out || 0;
      return {
        x: CX + c * R + nx * d,
        y: y + ny * d,
        z: CZ + s * R * EZ + nz * d,
        nx, ny, nz,
        yaw: outYaw(a),
        pitch: -Math.atan(sl / Lh),
        a, R
      };
    }
    /** 坡面反查高度：水平坐标 (x, z) 落在山体表面的哪个 y（甲虫贴坡爬用） */
    function surfaceY(x, z) {
      const d = Math.hypot(x - CX, (z - CZ) / EZ);
      if (d >= BASE_R) return 0;
      return H * (1 - Math.pow(d / BASE_R, 1 / 0.6));
    }
    /** 坡面局部坐标系（先按面法线转，再在面内自转 roll） */
    function surfM(p, roll) {
      const m = m4(p.x, p.y, p.z, p.pitch, p.yaw, 0);
      return roll ? M.mul(m, m4(0, 0, 0, 0, 0, roll)) : m;
    }

    /* ============================================================
     *  屏幕挂点：先把「哪块屏挂在哪」全部算出来（只算位置，不建几何）
     *  箱壳 / 大件那两遍会照这张表让开：会戳穿屏幕的箱子直接不放，
     *  屏幕背后交给 panelMount 的支撑箱体补 —— 屏幕一定看得见，也一定贴得住。
     * ============================================================ */
    const INK = {
      term: { fg: "#a8dc50", glow: "rgba(160,220,80,.32)", tint: [1.14, 1.16, 1.08] },
      warn: { fg: "#f0cc64", glow: "rgba(240,190,70,.36)", tint: [1.14, 1.16, 1.08] },
      err: { fg: "#f05c40", glow: "rgba(255,70,40,.48)", tint: [1.16, 1.1, 1.06] },
      dead: { fg: "#8a9668", glow: "rgba(110,140,80,.14)", tint: [0.62, 0.64, 0.55] }
    };
    const NOTES = [
      // 看得懂的部分：其实也没人看得懂
      ["term", "TODO", 56],
      ["term", "FIXME 从这里开始", 34],
      ["term", "// 临时方案，永久存在", 34],
      ["term", "var a1, a2, a3, a4;", 40],
      ["term", "能跑，别动", 52],
      ["term", "works on my machine", 42],
      ["term", "其实是 feature", 46],
      ["term", "谁写的？我写的。", 42],
      ["term", "缩进：随缘", 50],
      ["term", "tmp_final_v2_OK.js", 40],
      // 故障：修不好，也复现不出来
      ["warn", "⚠ 小概率报错 0.3%", 38],
      ["warn", "复现不了，先挂着", 38],
      ["warn", "已修复（未验证）", 40],
      ["err", "改 1 行 · 炸 47 处", 38],
      ["err", "revert revert revert", 38],
      ["err", "报错不在这，原因也不在这", 28],
      ["err", "CI 红了，重跑一遍", 38],
      // 人：前任、接手的人、和永远空着的交接
      ["warn", "上一任没交接", 44],
      ["warn", "2016 年的坑", 48],
      ["warn", "git blame 全是我", 38],
      ["warn", "改过的又改回去了", 36],
      ["warn", "这里原来有注释", 40],
      // 埋在下层的老屏幕：字都快看不清了
      ["dead", "TODO (2019)", 46],
      ["dead", "此处删除 400 行注释", 32],
      ["dead", "为什么能跑？不知道", 34],
      ["dead", "别问，问就是祖传", 38],
      ["dead", "// 删了会崩", 44],
      ["dead", "2013 · 初版还没删", 36],
      ["term", "TODO: 清理 TODO", 32],
      ["warn", "注释和代码对不上", 30],
      ["warn", "别加新功能", 46]
    ];

    /* 挂点按「面」铺：
     * 正面（a 62°~136°）对着街口镜头，能读字的都排这儿；最斜的一块 yaw ≈ 0.7 rad
     * （40°），还读得出来，再斜就归到南面去。
     * 南面（a 138°~200°）是主标题镜头看到的那面（也是受光面），放大字报和老屏幕。
     * 两段弧拼成一整片，山从任何角度转过来都有东西看。 */
    const frontSlots = [], southSlots = [];
    const pushSlots = (arr, a0, a1, ys) => {
      const span = (a1 - a0) * D2R;
      for (let i = 0; i < ys.length; i++) {
        const n = Math.max(2, Math.round(span * 5.2));
        for (let k = 0; k < n; k++) {
          const u = n === 1 ? 0.5 : k / (n - 1);
          arr.push({
            a: a0 * D2R + span * u + (r() - 0.5) * 0.1,
            y: ys[i] + (r() - 0.5) * 0.14
          });
        }
      }
    };
    pushSlots(frontSlots, 62, 136, [1.55, 2.2, 2.85, 3.5, 4.15, 4.8, 5.45]);
    pushSlots(southSlots, 138, 200, [1.7, 2.4, 3.1, 3.8, 4.5]);
    shuffle(frontSlots); shuffle(southSlots);


    /** 一块屏在坡面上的位置与朝向（纯计算，不建几何） */
    function panelGeom(a, y, w, h, opts) {
      const o = opts || {};
      const out = o.out === undefined ? 0.26 + w * 0.01 + h * 0.12 : o.out;
      const p = surf(a, y, out);
      const roll = o.roll || 0;
      return {
        p, out, roll,
        m: surfM(p, roll),
        ux: Math.cos(p.yaw), uz: -Math.sin(p.yaw),          // 面内的「右」
        vx: Math.sin(p.pitch) * Math.sin(p.yaw),            // 面内的「上」
        vy: Math.cos(p.pitch),
        vz: Math.sin(p.pitch) * Math.cos(p.yaw)
      };
    }

    const PANEL_PLAN = [];
    /** 一块屏要占多大地方（含压条 / 雨檐 / 邻居留缝）——用来防止两块屏互相压字 */
    const footOf = (w, h, big) => ({ w: w + (big ? 0.55 : 0.2), h: h + (big ? 0.95 : 0.24) });
    /** 在这个高度 / 方位上放一块 w×h 的屏，会不会和已经排好的撞上 */
    function panelFree(a, y, w, h) {
      for (let i = 0; i < PANEL_PLAN.length; i++) {
        const e = PANEL_PLAN[i], f = e.foot;
        if (Math.abs(y - e.y) > (h + f.h) * 0.5) continue;
        const arc = Math.abs(a - e.a) * Math.max(1, shellR(y));
        if (arc < (w + f.w) * 0.5) return false;
      }
      return true;
    }
    /**
     * 从候选池里挑一个空位，登记一块屏。
     * 注意：**不合格的候选不能从池子里摘掉**，否则大字报排一遍就把前排的格子吃光了。
     * 先排大字报（带雨檐、占地大），再排普通屏 —— 这样不会压字。
     */
    const planPanel = (kind, txt, size, w, h, arr, y0, y1, opts) => {
      const o = opts || {};
      const foot = footOf(w, h, o.big);
      let pick = -1;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].y < y0 || arr[i].y > y1) continue;
        if (!panelFree(arr[i].a, arr[i].y, foot.w, foot.h)) continue;
        pick = i; break;
      }
      // 高度不合意的也还有救：只要跟别人不撞就放
      if (pick < 0) {
        for (let i = 0; i < arr.length; i++) {
          if (!panelFree(arr[i].a, arr[i].y, foot.w, foot.h)) continue;
          pick = i; break;
        }
      }
      // 实在挤不下就按最小占位塞进去（宁可挨着，也别把词条丢了）
      if (pick < 0) {
        for (let i = 0; i < arr.length; i++) {
          if (!panelFree(arr[i].a, arr[i].y, w + 0.02, h + 0.03)) continue;
          pick = i; break;
        }
      }
      if (pick < 0) return null;
      const s = arr.splice(pick, 1)[0];
      const e = { kind, txt, size, w, h, a: s.a, y: s.y, opts: o, foot };
      e.g = panelGeom(s.a, s.y, w, h, o);
      PANEL_PLAN.push(e);
      return e;
    };

    // 先排三块大字报（隔着半个场景也能看清，位置挑在 2.6~4.6m 之间）
    [["err", "改 1 行 · 炸 47 处"], ["term", "能跑，别动"], ["warn", "上一任没交接"]].forEach(([kind, txt], i) => {
      planPanel(kind, txt, 62, 2.9, 0.72, i < 2 ? frontSlots : southSlots,
        2.6, 4.6, { big: true, roll: 0 });
    });
    // 两块平时安静、偶尔亮红报错的屏
    ["Uncaught TypeError", "null is not a function"].forEach((txt, i) => {
      planPanel("err", txt, 40, 1.7, 0.42, i ? southSlots : frontSlots, 2.6, 4.8, { flash: i });
    });
    // 普通注释屏：前 22 条贴正面（街口镜头能读），剩下 9 条贴南面
    NOTES.forEach(([kind, txt, size], i) => {
      const front = i < 22;
      const wide = txt.length > 13 ? 1.18 : 1;
      const w = 1.46 * wide, h = w / 4;
      const opts = { roll: (r() - 0.5) * 0.06 };
      const e = planPanel(kind, txt, size, w, h, front ? frontSlots : southSlots,
        front ? 1.4 : 1.5, front ? 5.9 : 5.2, opts);
      // 正面实在挤不下就退到南面 —— 反正主标题镜头也看得到，别把词条丢了
      if (!e) planPanel(kind, txt, size, w, h, southSlots, 1.5, 5.2, opts);
    });

    /* 这块垃圾的 8 个角，投影到每块屏的坐标系里，看会不会戳穿屏面。
     * （用包围球近似会在斜箱子上漏判 —— 之前两侧屏幕「看着贴住了其实穿过去」就是这么来的。） */
    const PANEL_CORNERS = [];
    for (let i = 0; i < 8; i++) PANEL_CORNERS.push([0, 0, 0]);
    function blocksPanel(m, sx, sy, sz) {
      const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
      for (let i = 0; i < 8; i++) {
        const c = PANEL_CORNERS[i];
        const lx = (i & 1) ? hx : -hx, ly = (i & 2) ? hy : -hy, lz = (i & 4) ? hz : -hz;
        c[0] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        c[1] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        c[2] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
      }
      for (let i = 0; i < PANEL_PLAN.length; i++) {
        const e = PANEL_PLAN[i], g = e.g, p = g.p;
        let minU = 1e9, maxU = -1e9, minV = 1e9, maxV = -1e9, minN = 1e9, maxN = -1e9;
        for (let k = 0; k < 8; k++) {
          const c = PANEL_CORNERS[k];
          const dx = c[0] - p.x, dy = c[1] - p.y, dz = c[2] - p.z;
          const du = dx * g.ux + dz * g.uz;
          const dv = dx * g.vx + dy * g.vy + dz * g.vz;
          const dn = dx * p.nx + dy * p.ny + dz * p.nz;
          if (du < minU) minU = du; if (du > maxU) maxU = du;
          if (dv < minV) minV = dv; if (dv > maxV) maxV = dv;
          if (dn < minN) minN = dn; if (dn > maxN) maxN = dn;
        }
        if (maxU < -e.w * 0.5 - 0.04 || minU > e.w * 0.5 + 0.04) continue;
        if (maxV < -e.h * 0.5 - 0.04 || minV > e.h * 0.5 + 0.04) continue;
        if (minN > 2.2 || maxN < -0.9) continue;
        return true;
      }
      return false;
    }

    /* ============================================================
     *  画笔
     * ============================================================ */
    const junk = pen("junk", T.darkMetal(), { tint: [0.8, 0.76, 0.68] });
    const junkRust = pen("junkRust", T.metal(), { tint: [0.95, 0.62, 0.42], spec: 0.24 });
    const junkCard = pen("junkCard", T.paper(), { tint: [0.6, 0.52, 0.4] });
    const junkPlastic = pen("junkPlastic", T.paint(), { tint: [0.45, 0.5, 0.46], spec: 0.3 });
    /* 白电 / 家电这批单独三支笔：料子再白，到了这座山也得是灰扑扑的旧货。
     * 之前直接吃 shellPick()，偶尔抽到纸板 / 喷漆那两支浅色笔，
     * 就成了锈铁堆里一台「刚拆封的米白冰箱」—— 这边固定给暗色系，再补锈迹/污渍。 */
    const appGrey = pen("appGrey", T.darkMetal(), { tint: [0.5, 0.48, 0.43], spec: 0.14 });
    const appRust = pen("appRust", T.metal(), { tint: [0.56, 0.36, 0.25], spec: 0.2 });
    const appWhite = pen("appWhite", T.paint(), { tint: [0.42, 0.4, 0.36], spec: 0.1 });
    const appPick = () => {
      const q = r();
      return q < 0.44 ? appGrey : q < 0.78 ? appRust : appWhite;
    };
    const coneOrange = pen("coneOrange", T.paint(), { tint: [1.35, 0.62, 0.3], spec: 0.2 });
    const bag = pen("bag", T.fabric(), { tint: [0.46, 0.53, 0.42] });
    const woodJunk = pen("woodJunk", T.woodDark(), { tint: [0.95, 0.8, 0.6], spec: 0.06 });
    const metalJunk = pen("metalJunk", T.darkMetal(), { tint: [0.62, 0.62, 0.6], spec: 0.42 });
    const cable = pen("cable", null, { tint: [0.15, 0.14, 0.12] });
    const strut = pen("strut", T.darkMetal(), { tint: [0.85, 0.78, 0.66], spec: 0.2 });
    const tape = pen("tape", null, { tint: [0.5, 0.46, 0.36] });
    const clothRed = pen("clothRed", T.fabric(), { tint: [1.5, 0.5, 0.42] });

    /* ============================================================
     *  地面：山脚一圈渗滤液黑斑 —— 山不是「放在地上」，是「泡在地上」
     *  一层贴地的径向黑晕，把绿地和垃圾场之间的接缝吃掉。
     * ============================================================ */
    const stain = pen("stain", T.glow(), { unlit: true, blend: "alpha", tint: [0.055, 0.06, 0.04], opacity: 0.92 });
    stain.quad.call(stain, m4(CX, 0.018, CZ, -Math.PI / 2, 0, 0), 30, 27, [1, 1, 1], [0, 0, 1, 1]);
    stain.quad.call(stain, m4(CX - 1.5, 0.021, CZ + 1.2, -Math.PI / 2, 0.6, 0), 22, 24, [1, 1, 1], [0, 0, 1, 1]);
    stain.quad.call(stain, m4(CX + 1.0, 0.024, CZ - 2.0, -Math.PI / 2, -0.4, 0), 17, 20, [1, 1, 1], [0, 0, 1, 1]);
    // 院子里的泥：从山脚一路淌到街口，掩掉石板路断头和裸地的分界
    stain.quad.call(stain, m4(-1.5, 0.027, 5.2, -Math.PI / 2, 0.25, 0), 20, 14, [1, 1, 1], [0, 0, 1, 1]);
    stain.quad.call(stain, m4(3.2, 0.03, 2.4, -Math.PI / 2, -0.5, 0), 13, 12, [1, 1, 1], [0, 0, 1, 1]);

    /* ============================================================
     *  山体核心：实心椭圆锥，轮廓兜底
     *  以前 17 层箱子只是「一圈圈悬浮的环」，层与层之间透空，山顶直接见天。
     *  现在先立一个分层的实心锥台：缝里透过来的是它（深色锈铁/塑料/纸板/霉布），
     *  不是天空；山顶再收成一根尖 + 天线。
     * ============================================================ */
    const corePens = [
      pen("core0", T.darkMetal(), { tint: [0.36, 0.35, 0.31], spec: 0.12, rim: 0.1 }),
      pen("core1", T.metal(), { tint: [0.58, 0.4, 0.27], spec: 0.22 }),
      pen("core2", T.paper(), { tint: [0.52, 0.48, 0.37], spec: 0.03 }),
      pen("core3", T.fabric(), { tint: [0.3, 0.35, 0.27], spec: 0.03 })
    ];
    const CORE_RINGS = 15, CORE_SEG = 26;
    const coreR = [];
    for (let i = 0; i <= CORE_RINGS; i++) {
      const y = -0.06 + (i / CORE_RINGS) * (H + 0.06);
      // 每层半径带一点手抖（相邻层共用同一个值，不会裂出接缝）
      const k = (i === 0 || i === CORE_RINGS) ? 1 : 0.965 + r() * 0.075;
      coreR.push({ y, R: Math.max(0.52, shellR(y) * k) });
    }
    for (let i = 0; i < CORE_RINGS; i++) {
      const A = coreR[i], B = coreR[i + 1];
      const cp = corePens[i % corePens.length];
      const g = 0.74 + r() * 0.4;
      cp.cyl.call(cp, m4(CX, A.y, CZ, 0, 0, 0, 1, 1, EZ), A.R, B.R, B.y - A.y, CORE_SEG,
        [g, g * 0.96, g * 0.88], i === 0);
    }
    const topY = coreR[CORE_RINGS].y, topR = coreR[CORE_RINGS].R;
    // 山顶收口：一段更尖的锥，然后用一圈歪箱子把它压住
    corePens[1].cyl.call(corePens[1], m4(CX, topY, CZ, 0, 0, 0, 1, 1, EZ),
      topR, 0.04, 1.15, 14, [0.95, 0.82, 0.64], false);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + r() * 0.4;
      const y = H - 0.62 + r() * 0.5;
      const rr = 0.55 + r() * 1.35;
      const s = 0.42 + r() * 0.62;
      const which = i % 3 === 0 ? junkRust : junk;
      which.box.call(which, m4(CX + Math.cos(a) * rr, y, CZ + Math.sin(a) * rr * EZ,
        (r() - 0.5) * 0.6, a, (r() - 0.5) * 0.5), s * 1.4, s * 0.7, s * 1.2,
        [0.26 + r() * 0.16, 0.24 + r() * 0.14, 0.2 + r() * 0.12], 1.3);
    }
    // 山顶压一块大板（像谁把桌面扔上去了），再竖一根歪电视天线
    junk.box.call(junk, m4(CX - 0.2, topY + 0.62, CZ + 0.1, 0.06, 0.5, -0.08),
      1.7, 0.1, 1.25, [0.3, 0.27, 0.22], 1.4);
    metalJunk.cyl.call(metalJunk, m4(CX + 0.25, topY + 0.5, CZ - 0.2, 0.03, 0, 0.04), 0.055, 0.035, 2.5, 5,
      [0.55, 0.55, 0.5], true);
    for (let i = 0; i < 3; i++) {
      const yy = topY + 1.1 + i * 0.55;
      metalJunk.box.call(metalJunk, m4(CX + 0.25 + i * 0.02, yy, CZ - 0.2, 0, 0.4 + i * 0.5, 0.12),
        0.55 - i * 0.08, 0.03, 0.03, [0.6, 0.58, 0.52], 2);
    }
    // 天线顶上的红色航空灯
    const redLamp = glow("redLamp", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.2, 0.12], opacity: 0.5 });
    redLamp.quad.call(redLamp, m4(CX + 0.27, topY + 3.0, CZ - 0.2), 0.9, 0.9, [1, 1, 1], [0, 0, 1, 1]);

    /* ============================================================
     *  箱壳：一圈圈随机乱箱，压在核心表面上（一半埋进去），互相压着
     *  取一半外一半内：rr ∈ [0.93, 1.13]·R，箱子就骑在坡面上，
     *  缝里是核心的深色面，不再是天空。
     * ============================================================ */
    const shellPick = () => {
      const q = r();
      return q < 0.44 ? junk : q < 0.68 ? junkRust : q < 0.86 ? junkCard : junkPlastic;
    };
    const boxCol = k => [k, k * (0.94 + r() * 0.1), k * 0.86];
    for (let i = 0; i < LAYERS; i++) {
      const t0 = i / (LAYERS - 1);
      const y = 0.16 + Math.pow(t0, 0.95) * (H - 0.3);
      const R = shellR(y);
      const n = clamp(Math.round(R * 3.9), 5, 38);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + (r() - 0.5) * 0.7;
        const rr = R * (0.93 + r() * 0.2);
        const s = (0.6 + r() * 1.2) * (1 - t0 * 0.28);
        const which = shellPick();
        const sx = s * (0.72 + r() * 0.68), sy = s * (0.55 + r() * 0.6), sz = s * (0.72 + r() * 0.68);
        const bx = CX + Math.cos(a) * rr, by = y + s * (0.16 + r() * 0.32), bz = CZ + Math.sin(a) * rr * EZ;
        const m = m4(bx, by, bz, (r() - 0.5) * 0.5, a + (r() - 0.5) * 0.9, (r() - 0.5) * 0.42);
        // 会戳穿屏幕的箱子不放（那块地方由屏幕自己的支撑箱体补）
        if (blocksPanel(m, sx, sy, sz)) continue;
        which.box.call(which, m, sx, sy, sz, boxCol(0.2 + r() * 0.26), 1.35);
      }
    }

    /* ---------------- 大件垃圾：冰箱 / 机柜 / 柜子，斜插在坡上 ---------------- */
    for (let i = 0; i < 30; i++) {
      const y = 0.45 + r() * (H - 2.3);
      const a = r() * TAU;
      const p = surf(a, y, 0.06);
      const w = 0.62 + r() * 1.0, ht = 0.5 + r() * 0.95, d = 0.5 + r() * 0.65;
      const yaw = p.yaw + (r() - 0.5) * 0.45;
      const tiltX = (r() - 0.5) * 0.26, tiltZ = (r() - 0.5) * 0.22;
      const which = appPick();
      const dep = d * 0.5;
      const m = m4(p.x - p.nx * dep, p.y - ht * 0.18 - p.ny * dep, p.z - p.nz * dep, tiltX, yaw, tiltZ);
      if (blocksPanel(m, w, ht, d)) continue;
      which.box.call(which, m, w, ht, d, boxCol(0.3 + r() * 0.16), 1.25);
      // 门缝 / 散热孔 / 掉了一半的面板
      junk.box.call(junk, M.mul(m, m4(0, ht * 0.06, d * 0.52)),
        w * 0.72, ht * 0.1, 0.02, [0.07, 0.07, 0.06], 1.8);
      for (let q = 0; q < 3; q++) {
        junk.box.call(junk, M.mul(m, m4(0, -ht * 0.18 - q * ht * 0.12, d * 0.52)),
          w * 0.4, ht * 0.045, 0.02, [0.05, 0.05, 0.045], 1.8);
      }
      if (r() < 0.45) {
        junkRust.box.call(junkRust, M.mul(m, m4(w * 0.62, 0, 0, 0, 0, 0.5)),
          0.02, ht * 0.8, d * 0.7, [0.3, 0.24, 0.18], 1.6);
      }
      // 门板上的锈斑 / 脏污：一层贴在正面和侧面的薄片，把「新拆封」洗掉
      const rustCol = [0.2 + r() * 0.14, 0.13 + r() * 0.1, 0.09 + r() * 0.07];
      junkRust.box.call(junkRust,
        M.mul(m, m4(w * (r() - 0.5) * 0.55, ht * (r() - 0.35) * 0.7, d * 0.52 + 0.012)),
        w * (0.22 + r() * 0.34), ht * (0.2 + r() * 0.5), 0.014, rustCol, 2.4);
      if (r() < 0.7) {
        junkRust.box.call(junkRust,
          M.mul(m, m4(w * 0.52 + 0.012, ht * (r() - 0.3) * 0.5, 0)),
          0.014, ht * (0.25 + r() * 0.45), d * (0.2 + r() * 0.35),
          [0.16 + r() * 0.1, 0.15 + r() * 0.08, 0.12 + r() * 0.06], 2.4);
      }
    }

    /* ============================================================
     *  垃圾裙边：一圈低矮的锥台，把核心和地面焊在一起
     *  再压一圈山脚废件（机箱/碎屏/轮胎/油桶/托盘/垃圾袋），
     *  从任何角度看山脚都不是「悬空的集装箱堆」。
     * ============================================================ */
    const skirt = pen("skirt", T.metal(), { tint: [0.62, 0.5, 0.38], spec: 0.16 });
    skirt.cyl.call(skirt, m4(CX, -0.1, CZ, 0, 0, 0, 1, 1, EZ), BASE_R * 1.105, BASE_R * 0.96, 1.2, 32,
      [0.34, 0.3, 0.24], false);
    // 外圈再低一档，按 1.13 收 —— 火桶、警告牌、石台都得站在它外面，不能被裙边吃掉
    skirt.cyl.call(skirt, m4(CX, -0.1, CZ, 0, 0, 0, 1, 1, EZ), BASE_R * 1.13, BASE_R * 1.07, 0.55, 30,
      [0.28, 0.26, 0.2], false);
    // 裙边上的碎石/铁皮屑，把光滑的锥台面打碎
    for (let i = 0; i < 70; i++) {
      const a = r() * TAU, y = r() * 1.05;
      const R = BASE_R * (1.14 - y * 0.13) + (r() - 0.5) * 0.5;
      junk.box.call(junk, m4(CX + Math.cos(a) * R, y, CZ + Math.sin(a) * R * EZ,
        r() * 0.7, r() * TAU, r() * 0.7), 0.16 + r() * 0.45, 0.1 + r() * 0.22, 0.14 + r() * 0.4,
        boxCol(0.22 + r() * 0.22), 1.5);
    }

    /** 轮胎：躺倒的一圈橡胶 */
    const tire = (x, z, ry, lean, s) => {
      const k = s || 1;
      const m = m4(x, 0.15 * k, z, Math.PI / 2 + (lean || 0), ry, 0, k, k, k);
      metalJunk.torus.call(metalJunk, m, 0.31, 0.12, 12, 5, [0.16, 0.15, 0.14]);
    };
    /** 油桶：桶身 + 两道箍 + 半开的盖 */
    const drum = (x, z, ry, col) => {
      const m = m4(x, 0, z, 0, ry, 0);
      const c = col || [0.35, 0.23, 0.16];
      junkRust.cyl.call(junkRust, m, 0.34, 0.34, 0.9, 12, c, true);
      for (const yy of [0.2, 0.62]) {
        metalJunk.torus.call(metalJunk, M.mul(m, m4(0, yy, 0, Math.PI / 2, 0, 0)), 0.35, 0.022, 12, 4,
          [0.4, 0.38, 0.34]);
      }
      metalJunk.cyl.call(metalJunk, M.mul(m, m4(0.1, 0.88, 0, 0.2, 0.5, 0.1)), 0.3, 0.3, 0.035, 10,
        [0.45, 0.4, 0.34], true);
    };
    /** 木托盘：三根垫木 + 一层面板，横七竖八地倒着 */
    const pallet = (x, z, ry, lean) => {
      const m = m4(x, 0.09, z, lean || 0, ry, 0.06);
      woodJunk.box.call(woodJunk, M.mul(m, m4(0, 0.06, 0)), 1.15, 0.06, 0.85, [0.5, 0.4, 0.3], 1.6);
      for (const sz of [-0.3, 0, 0.3]) {
        woodJunk.box.call(woodJunk, M.mul(m, m4(0, -0.02, sz)), 1.15, 0.08, 0.12, [0.42, 0.33, 0.24], 1.8);
      }
    };
    /** 纸箱：一摞三个，最上面那个压塌了一角 */
    const carton = (x, z, ry, s) => {
      const k = s || 1;
      const m = m4(x, 0, z, 0, ry, 0);
      for (let i = 0; i < 3; i++) {
        const w = (0.3 + r() * 0.2) * k, hh = (0.22 + r() * 0.12) * k;
        junkCard.box.call(junkCard, M.mul(m, m4((r() - 0.5) * 0.12, 0.02 + hh * 0.5 + i * 0.24 * k, (r() - 0.5) * 0.12,
          0, (r() - 0.5) * 0.5, (r() - 0.5) * 0.12)), w, hh, w * (0.8 + r() * 0.3),
          [0.42 + r() * 0.14, 0.36 + r() * 0.12, 0.27 + r() * 0.1], 1.7);
      }
    };
    /** 一块斜靠的破木板（雨棚残骸） */
    const plank = (x, z, ry, lean) => {
      woodJunk.box.call(woodJunk, m4(x, 0.42, z, 0.5, ry, lean || 0.1), 0.9, 0.05, 1.4, [0.44, 0.36, 0.27], 1.8);
    };

    // 山脚一环：按角度铺开，避开展示面正中（要让镜头看到山脚，不是看到一堵垃圾墙）
    const footRing = [
      [-2.35, 0.0, 0], [-2.05, 0.55, 1], [-1.75, -0.35, 2], [-1.45, 0.25, 0],
      [-1.1, -0.5, 1], [-0.75, 0.55, 2], [-0.35, 0.05, 0], [0.35, 0.45, 1],
      [0.75, -0.35, 2], [1.15, 0.15, 0], [1.55, -0.55, 1], [1.95, 0.35, 2],
      [2.35, -0.05, 0], [2.7, 0.5, 1], [3.0, -0.4, 2]
    ];
    for (const [ang, drad, kind] of footRing) {
      const R = BASE_R * (1.02 + drad * 0.16) + r() * 0.5;
      const x = CX + Math.cos(ang) * R, z = CZ + Math.sin(ang) * R * EZ;
      // 佛龛和大警告牌前面不放高东西
      if (Math.hypot(x - BX, z - BZ) < 2.9) continue;
      if (Math.abs(x - 1.9) < 2.2 && z > -3.2 && z < -1.2) continue;
      if (kind === 0) tire(x, z, r() * TAU, r() < 0.5 ? 0 : 0.4, 0.9 + r() * 0.3);
      else if (kind === 1) drum(x, z, r() * TAU);
      else pallet(x, z, r() * TAU, (r() - 0.5) * 0.5);
      if (r() < 0.6) bag.sphere.call(bag, m4(x + (r() - 0.5) * 0.8, 0.16 + r() * 0.08, z + (r() - 0.5) * 0.8,
        0, r() * TAU, 0.28), 0.16 + r() * 0.12, 7, 5, [0.14 + r() * 0.06, 0.16 + r() * 0.04, 0.13]);
    }
    carton(-9.9, -1.4, 0.4, 1.1);
    carton(3.6, -1.0, -0.7, 1.0);
    carton(7.4, 1.2, 1.2, 0.9);
    plank(-10.6, 0.6, 0.9, 0.2);
    plank(8.9, -2.2, -0.6, -0.15);
    // 山脚的几堆垃圾（原场景的构图，位置保留）
    P.garbagePile(junk.raw, bag.raw, aim(-7.5, 0, -6.5), 1.8, 7);
    P.garbagePile(junk.raw, bag.raw, aim(7.8, 0, -7.5), 1.6, 19);
    P.garbagePile(junk.raw, bag.raw, aim(-4.5, 0, -3.0), 1.05, 33);
    P.garbagePile(junk.raw, bag.raw, aim(4.8, 0, -2.6), 1.0, 45);
    P.garbagePile(junk.raw, bag.raw, aim(-9.6, 0, -5.0), 1.35, 91);
    P.garbagePile(junk.raw, bag.raw, aim(6.6, 0, 0.8), 0.9, 113);


    /* ============================================================
     *  旧屏幕：一面山，三十年的注释（挂点已经在上面规划好了）
     *  每条都对应屎山的一种脾气：能跑但偶尔抽风 / 看不懂 / 查不到原因 /
     *  一改就炸一片 / 改完又被改回来 / 没人说得清。
     *  这里只负责把它们钉上坡面：支撑箱体 + 压条 + 斜撑 + 下山电缆。
     * ============================================================ */
    /* ---- 屏幕的「安装件」：支撑箱体 + 压条 + 两根斜撑 + 下山电缆 ---- */
    const frame = pen("panelFrame", T.darkMetal(), { tint: [0.66, 0.6, 0.5], spec: 0.2 });
    function panelMount(e) {
      const g = e.g, p = g.p, w = e.w, h = e.h, roll = g.roll, o = e.opts;
      const ux = g.ux, uz = g.uz, vx = g.vx, vy = g.vy, vz = g.vz;
      // 1) 支撑箱体：正面比屏面低 4cm，背面扎进山里（最多 1.7m）
      const depth = o.depth || Math.min(1.7, Math.max(0.7, p.R * 0.42));
      const off = 0.04 + depth * 0.5;
      frame.box.call(frame,
        m4(p.x - p.nx * off, p.y - p.ny * off, p.z - p.nz * off, p.pitch, p.yaw, roll * 0.5),
        w + 0.2 + r() * 0.18, h + 0.18 + r() * 0.12, depth,
        [0.5 + r() * 0.16, 0.44 + r() * 0.14, 0.35 + r() * 0.12], 1.3);
      // 2) 上下压条（像钉上去的木条）
      const lip = (yy, th, wd, col) => woodJunk.box.call(woodJunk,
        m4(p.x + vx * yy, p.y + vy * yy, p.z + vz * yy, p.pitch, p.yaw, roll),
        wd, th, 0.075, col, 1.7);
      lip(-h * 0.5 - 0.055, 0.09, w + 0.36, [0.62, 0.52, 0.38]);
      if (w > 1.6) lip(h * 0.5 + 0.045, 0.06, w * 0.92, [0.5, 0.42, 0.31]);
      // 3) 两根斜撑：从屏底角斜着返到下面一点的坡面（不是悬空的贴纸）
      if (o.struts !== false) {
        for (const sgn of [-1, 1]) {
          const ex = p.x + ux * (w * 0.5 - 0.09) * sgn + vx * (-h * 0.5 + 0.03);
          const ey = p.y + vy * (-h * 0.5 + 0.03);
          const ez = p.z + uz * (w * 0.5 - 0.09) * sgn + vz * (-h * 0.5 + 0.03);
          const q = surf(e.a + sgn * 0.17, Math.max(0.3, e.y - 1.3), 0.03);
          strut.tube.call(strut, M.ident(), [[ex, ey, ez],
            [lerp(ex, q.x, 0.5) - p.nx * 0.16, lerp(ey, q.y, 0.5) - 0.05, lerp(ez, q.z, 0.5) - p.nz * 0.16],
            [q.x, q.y, q.z]], 0.028, 4, [0.62, 0.56, 0.44]);
        }
      }
      // 4) 电缆：从右下角顺着坡面爬到山脚
      if (o.cable !== false) {
        const ex = p.x + ux * (w * 0.5 - 0.05) + vx * (-h * 0.5);
        const ey = p.y + vy * (-h * 0.5);
        const ez = p.z + uz * (w * 0.5 - 0.05) + vz * (-h * 0.5);
        const pts = [[ex, ey, ez]];
        for (let i = 1; i <= 4; i++) {
          const yy = Math.max(0.3, e.y - i * (e.y * 0.27));
          const q = surf(e.a + 0.16 + i * 0.03, yy, 0.13 + i * 0.02);
          pts.push([q.x, q.y, q.z]);
        }
        const qg = surf(e.a + 0.36, 0.05, 0.95);
        pts.push([qg.x, 0.035, qg.z]);
        cable.tube.call(cable, M.ident(), pts, 0.024, 4, [0.55, 0.5, 0.42]);
        // 落地处的接线盒
        if (r() < 0.55) {
          junk.box.call(junk, m4(qg.x, 0.13, qg.z, 0, r() * TAU, 0), 0.3, 0.26, 0.22, [0.14, 0.14, 0.12], 1.8);
        }
      }
      return g;
    }
    /** 把一块屏钉在坡面上 */
    function hangPanel(b, e) {
      const g = panelMount(e);
      b.quad.call(b, g.m, e.w, e.h, [1, 1, 1], [0, 0, 1, 1]);
      return g;
    }

    /* ---------------- 实体化所有屏幕（箱壳已经给它们让开了位置） ---------------- */
    PANEL_PLAN.forEach((e, i) => {
      const big = !!e.opts.big;
      const flash = e.opts.flash;
      if (flash !== undefined) {
        const tex = A3DTex.sign({
          text: e.txt, w: 512, h: 128, bg: "#1a0705", fg: "#ff6a4a", size: 40,
          border: "#5a140e", borderW: 5, glow: "rgba(255,80,50,.6)", glowBlur: 18
        });
        const g = panelMount(e);
        const d = dyno(tex, { unlit: true, tint: [1, 1, 1] }, t => {
          const ph = (t * (0.19 + flash * 0.07) + flash * 0.41) % 1;
          const k = ph < 0.055 ? 1 : 0.0008;     // 94% 的时间看不见它
          return M.mul(g.m, m4(0, 0, 0, 0, 0, 0, k, k, 1));
        });
        d.quad.call(d, m4(0, 0, 0), e.w, e.h, [1, 1, 1], [0, 0, 1, 1]);
        return;
      }
      const ink = INK[e.kind] || INK.term;
      const tex = A3DTex.sign({
        text: e.txt, w: big ? 768 : 512, h: big ? 192 : 128, bg: "#0b0e09", fg: ink.fg, size: e.size,
        border: "#222a18", borderW: big ? 5 : 4, glow: ink.glow, glowBlur: big ? 16 : 12
      });
      const b = pen((big ? "big" : "note") + i, tex, { unlit: true, tint: ink.tint });
      const g = hangPanel(b, e);
      if (big) {
        // 大字报头顶钉一块铁皮雨檐，远看更像一块立在山上的牌子
        const pp = g.p;
        junkRust.box.call(junkRust,
          m4(pp.x + g.vx * (e.h * 0.5 + 0.16) + pp.nx * 0.2, pp.y + g.vy * (e.h * 0.5 + 0.16) + pp.ny * 0.2,
            pp.z + g.vz * (e.h * 0.5 + 0.16) + pp.nz * 0.2, pp.pitch - 0.5, pp.yaw, 0),
          e.w + 0.3, 0.03, 0.42, [0.34, 0.26, 0.2], 1.6);
      }
    });
    /* ============================================================
     *  坡面细节：胶带补丁 / 涂鸦 / 防雨布
     * ============================================================ */
    // 胶带补丁：一片片窄条把裂缝贴起来，谁贴的、为什么贴，没人知道
    for (let i = 0; i < 26; i++) {
      const a = (45 + r() * 165) * D2R;
      const y = 0.6 + r() * 5.4;
      const p = surf(a, y, 0.2);
      tape.quad.call(tape, surfM(p, r() * TAU), 0.45 + r() * 0.55, 0.075 + r() * 0.05,
        [1, 1, 1], [0, 0, 1, 1]);
    }

    // 涂鸦：喷漆字贴在破铁皮和坡面上（透明背景，不挡后面的箱子）
    const GRAF = [
      ["sm.graf0Sign", "LEGACY", "#c8452c"],
      ["sm.graf1Sign", "勿动", "#c8452c"],
      ["sm.graf2Sign", "TODO FOREVER", "#3f8a4a"],
      ["sm.graf3Sign", "别碰", "#b4892a"],
      ["sm.graf4Sign", "删了会崩", "#3f6b8a"]
    ];
    GRAF.forEach(([key, txt, col], i) => {
      const tex = A3DTex.get(key, 512, 256, (x, w, h) => {
        x.clearRect(0, 0, w, h);
        x.save();
        x.translate(w / 2, h / 2);
        x.rotate((i % 2 ? 1 : -1) * 0.07);
        x.font = "bold " + (txt.length > 6 ? 78 : 96) + "px 'Noto Sans SC','Microsoft YaHei',sans-serif";
        x.textAlign = "center"; x.textBaseline = "middle";
        // 喷漆毛边：先叠几层半透明的
        x.globalAlpha = 0.3; x.fillStyle = col;
        for (let q = 0; q < 5; q++) x.fillText(txt, (q - 2) * 2.6, ((q % 2) ? 1 : -1) * 2.6);
        x.globalAlpha = 1; x.fillStyle = "#e8e2c8";
        x.fillText(txt, 0, 0);
        x.restore();
        // 喷点
        const rr = A3DTex.rnd(7 + i);
        x.globalAlpha = 0.45;
        for (let q = 0; q < 110; q++) {
          x.fillStyle = q % 3 ? col : "#d8d2b8";
          x.fillRect(rr() * w, rr() * h, 1 + rr() * 3, 1 + rr() * 3);
        }
        // 往下淌的漆
        x.globalAlpha = 0.5;
        for (let q = 0; q < 14; q++) {
          const gx = 60 + rr() * (w - 120), gy = h * 0.55 + rr() * h * 0.2;
          x.fillStyle = col;
          x.fillRect(gx, gy, 2 + rr() * 2, 10 + rr() * 40);
        }
        x.globalAlpha = 1;
      });
      const a = (i < 3 ? 70 + r() * 60 : 140 + r() * 50) * D2R;
      const y = 0.7 + r() * 2.4;
      const p = surf(a, y, 0.19);
      const g = pen("graf" + i, tex, { unlit: true, blend: "alpha", tint: [0.95, 0.95, 0.9], opacity: 0.92 });
      g.quad.call(g, surfM(p, (r() - 0.5) * 0.12), 2.1, 1.05, [1, 1, 1], [0, 0, 1, 1]);
    });

    /* 防雨布：按坡面铺一张网格（每格顶点都吸在坡面上），鼓一块、塌一块 */
    const tarp = pen("tarp", T.fabric(), { tint: [0.42, 0.6, 0.56], spec: 0.05 });
    const tarpEdge = pen("tarpEdge", T.fabric(), { tint: [0.3, 0.42, 0.4], spec: 0.04 });
    const drape = (b, a0, y0, aSpan, ySpan, bulge) => {
      const NU = 4, NV = 3;
      const P3 = (i, j) => {
        const u = i / NU, v = j / NV;
        const a = a0 + (u - 0.5) * aSpan;
        const y = y0 + (v - 0.5) * ySpan;
        const wob = Math.sin(u * 7.1 + j) * 0.06 + Math.cos(v * 6.3 + i) * 0.05;
        return surf(a, y, 0.22 + bulge + wob);
      };
      for (let i = 0; i < NU; i++) {
        for (let j = 0; j < NV; j++) {
          const A = P3(i, j), B = P3(i + 1, j), C = P3(i + 1, j + 1), D = P3(i, j + 1);
          const col = [0.9 + r() * 0.2, 0.9 + r() * 0.2, 0.9 + r() * 0.2];
          const uv0 = [i / NU * 3, j / NV * 3], uv1 = [(i + 1) / NU * 3, j / NV * 3];
          const uv2 = [(i + 1) / NU * 3, (j + 1) / NV * 3], uv3 = [i / NU * 3, (j + 1) / NV * 3];
          b.tri.call(b, M.ident(), [A.x, A.y, A.z], [B.x, B.y, B.z], [C.x, C.y, C.z], [uv0, uv1, uv2], col);
          b.tri.call(b, M.ident(), [A.x, A.y, A.z], [C.x, C.y, C.z], [D.x, D.y, D.z], [uv0, uv2, uv3], col);
        }
      }
      // 布边垂下来一截
      for (let i = 0; i < NU; i++) {
        const A = P3(i, 0), B = P3(i + 1, 0);
        const A2 = surf(a0 + ((i / NU) - 0.5) * aSpan, y0 - ySpan * 0.5 - 0.3, 0.3);
        const B2 = surf(a0 + (((i + 1) / NU) - 0.5) * aSpan, y0 - ySpan * 0.5 - 0.3, 0.3);
        tarpEdge.tri.call(tarpEdge, M.ident(), [A.x, A.y, A.z], [B.x, B.y, B.z], [B2.x, B2.y, B2.z], null,
          [0.8, 0.86, 0.82]);
        tarpEdge.tri.call(tarpEdge, M.ident(), [A.x, A.y, A.z], [B2.x, B2.y, B2.z], [A2.x, A2.y, A2.z], null,
          [0.7, 0.76, 0.72]);
      }
    };
    drape(tarp, 96 * D2R, 6.4, 20 * D2R, 1.5, 0.1);
    drape(tarp, 170 * D2R, 5.6, 24 * D2R, 1.4, 0.06);
    drape(tarp, 124 * D2R, 1.08, 18 * D2R, 0.62, 0.05);

    /* ---------------- 铁网 / 警戒带：山脚圈了一圈 ---------------- */
    const wire = pen("wire", null, { tint: [0.72, 0.72, 0.68], spec: 0.34 });
    const fence = (x0, z0, x1, z1, hgt) => {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const nPanel = Math.max(1, Math.round(len / 2.4));
      const ux = dx / len, uz = dz / len;
      // 立柱
      for (let i = 0; i <= nPanel; i++) {
        const t = i / nPanel;
        wire.cyl.call(wire, m4(x0 + dx * t, 0, z0 + dz * t), 0.045, 0.04, hgt + 0.12, 5,
          [0.55, 0.55, 0.5], true);
      }
      // 上下横杆
      for (const yy of [hgt, 0.12]) {
        wire.tube.call(wire, M.ident(), [[x0, yy, z0], [x1, yy, z1]], 0.022, 4, [0.6, 0.6, 0.55]);
      }
      // 菱形网：每个网片若干斜线（两个方向交替）
      const H2 = hgt - 0.14;
      for (let i = 0; i < nPanel; i++) {
        const t0 = i / nPanel, t1 = (i + 1) / nPanel;
        const ax = x0 + dx * t0, az = z0 + dz * t0;
        const bx = x0 + dx * t1, bz = z0 + dz * t1;
        const nStep = Math.max(2, Math.round(len / nPanel / 0.26));
        for (let k = 0; k < nStep; k++) {
          const u = (k + 0.5) / nStep;
          const px = lerp(ax, bx, u), pz = lerp(az, bz, u);
          wire.tube.call(wire, M.ident(), [[px - ux * 0.13, 0.14, pz - uz * 0.13],
            [px + ux * 0.13, 0.14 + H2, pz + uz * 0.13]], 0.011, 3, [0.62, 0.62, 0.58]);
          wire.tube.call(wire, M.ident(), [[px + ux * 0.13, 0.14, pz + uz * 0.13],
            [px - ux * 0.13, 0.14 + H2, pz - uz * 0.13]], 0.011, 3, [0.6, 0.6, 0.56]);
        }
      }
    };
    fence(5.0, 3.0, 10.2, 0.4, 1.15);
    fence(-10.4, 2.6, -9.7, -0.4, 1.15);
    // 一段被撞歪、斜躺在地上的网片
    {
      const m = m4(7.4, 0.5, 2.2, 0.55, -0.7, 0.2);
      for (let i = 0; i < 8; i++) {
        wire.tube.call(wire, M.mul(m, M.ident()), [[-0.9 + i * 0.26, -0.5, 0], [-0.9 + i * 0.26, 0.55, 0]],
          0.011, 3, [0.55, 0.55, 0.5]);
      }
      wire.tube.call(wire, M.mul(m, M.ident()), [[-0.95, -0.5, 0], [0.95, -0.5, 0]], 0.02, 4, [0.55, 0.55, 0.5]);
      wire.tube.call(wire, M.mul(m, M.ident()), [[-0.95, 0.55, 0], [0.95, 0.55, 0]], 0.02, 4, [0.55, 0.55, 0.5]);
    }

    // 警戒带：黄黑条纹，从铁网一路荡到门边
    const tapeTex = A3DTex.get("sm.tapeStripeSign", 512, 64, (x, w, h) => {
      x.fillStyle = "#e8b81a"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#1b1710";
      for (let i = -h; i < w + h; i += 46) {
        x.beginPath();
        x.moveTo(i, 0); x.lineTo(i + 22, 0); x.lineTo(i + 22 - h, h); x.lineTo(i - h, h);
        x.closePath(); x.fill();
      }
      x.fillStyle = "#1b1710";
      x.font = "bold 30px 'Noto Sans SC','Microsoft YaHei',sans-serif";
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText("警 告 · 禁 止 靠 近", w / 2, h / 2);
      A3DTex.grain(x, w, h, { freq: 5, oct: 2, strength: 0.1, seed: 9 });
    });
    const caution = pen("caution", tapeTex, { unlit: true, blend: "alpha", tint: [0.95, 0.9, 0.7], opacity: 0.95 });
    /**
     * 沿折线拉一条竖直的带子（警戒带）。
     * twist 让带子沿路扭一点（顶边左右甩、宽窄带差），twist=0 就是一条平直的带子。
     */
    const ribbon = (b, pts, hgt, col, uvRep, twist) => {
      const tw = twist || 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        const u0 = (i / (pts.length - 1)) * (uvRep || 4), u1 = ((i + 1) / (pts.length - 1)) * (uvRep || 4);
        // 段方向的水平法线：带子沿它扭
        const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
        const dl = Math.hypot(dx, dz) || 1;
        const nx = -dz / dl, nz = dx / dl;
        const s0 = Math.sin(u0 * 2.7 + 0.6) * tw, s1 = Math.sin(u1 * 2.7 + 0.6) * tw;
        const h0 = hgt * (1 - Math.abs(Math.sin(u0 * 1.9)) * 0.18);
        const h1 = hgt * (1 - Math.abs(Math.sin(u1 * 1.9)) * 0.18);
        const A = [p0[0] + nx * s0, p0[1] - h0 / 2, p0[2] + nz * s0];
        const B = [p0[0] + nx * (s0 + tw * 0.25), p0[1] + h0 / 2, p0[2] + nz * (s0 + tw * 0.25)];
        const C = [p1[0] + nx * (s1 - tw * 0.25), p1[1] + h1 / 2, p1[2] + nz * (s1 - tw * 0.25)];
        const D = [p1[0] + nx * s1, p1[1] - h1 / 2, p1[2] + nz * s1];
        b.tri.call(b, M.ident(), A, C, B, [[u0, 0], [u1, 1], [u0, 1]], col);
        b.tri.call(b, M.ident(), A, D, C, [[u0, 0], [u1, 0], [u1, 1]], col);
      }
    };
    {
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        pts.push([lerp(-10.3, -4.5, u), 0.98 - Math.sin(u * Math.PI) * 0.26, lerp(0.9, -0.2, u)]);
      }
      ribbon(caution, pts, 0.16, [0.9, 0.88, 0.72], 6, 0.05);
      // 另一头：从右边铁网拉到街口
      const pts2 = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        pts2.push([lerp(10.2, 6.2, u), 1.25 - Math.sin(u * Math.PI) * 0.3, lerp(0.4, 4.4, u)]);
      }
      ribbon(caution, pts2, 0.16, [0.86, 0.84, 0.68], 5, 0.06);
    }

    /* ---------------- 灯串：从山顶一路挂下来 ---------------- */
    const bulbGlow = glow("bulbGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.78, 0.42], opacity: 0.6 });
    const bulbBody = pen("bulbBody", null, { unlit: true, blend: "add", tint: [1.5, 1.25, 0.8] });
    const stringLight = (a0, y0, a1, y1, sag, n) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const p = surf(lerp(a0, a1, u), lerp(y0, y1, u) - Math.sin(u * Math.PI) * sag, 0.55);
        pts.push(p);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        cable.tube.call(cable, M.ident(),
          [[pts[i].x, pts[i].y, pts[i].z], [pts[i + 1].x, pts[i + 1].y, pts[i + 1].z]], 0.014, 3, [0.6, 0.55, 0.45]);
      }
      for (let i = 1; i < pts.length; i += 2) {
        const p = pts[i];
        bulbBody.sphere.call(bulbBody, m4(p.x, p.y - 0.06, p.z), 0.045, 5, 4, [1, 1, 1]);
        bulbGlow.quad.call(bulbGlow, m4(p.x, p.y - 0.06, p.z), 0.55, 0.55, [1, 1, 1], [0, 0, 1, 1]);
      }
    };
    stringLight(112 * D2R, 8.4, 74 * D2R, 1.4, 0.7, 13);
    stringLight(150 * D2R, 6.8, 188 * D2R, 1.2, 0.6, 11);

    /* ============================================================
     *  佛祖：结跏趺坐在山脚的石台上，鎏金青铜，背后一轮背光
     *  cyl 是「底面 y=0 往上」，所以莲台从 BY（石台面）起，不再埋进土里。
     *  比例：坐像约 3.6 头高，肩宽 1.5 头；莲台两层莲瓣 + 台面
     * ============================================================ */
    const gold = pen("buddha", T.brass(), { tint: [1.15, 0.95, 0.55], spec: 0.55 });
    const stone = pen("stone", T.stone(), { tint: [0.88, 0.86, 0.8], spec: 0.14 });
    const pave = pen("pave", T.paving(), { tint: [0.7, 0.68, 0.6], spec: 0.2 });
    const haloG = glow("halo", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.85, 0.4], opacity: 0.16 });
    const GOLD = [1.05, 0.9, 0.6], GOLD_D = [0.74, 0.62, 0.42], GOLD_L = [1.18, 1.03, 0.7];

    /* ---- 石台：三层收分的方台 + 正面两级台阶，把神龛抬到地面之上 ---- */
    Gbox(stone, BX, 0.06, BZ, 4.15, 0.12, 4.35, [0.72, 0.7, 0.64], 1.1);
    Gbox(stone, BX, 0.18, BZ, 3.85, 0.13, 4.05, [0.66, 0.64, 0.58], 1.1);
    Gbox(stone, BX, 0.265, BZ, 3.62, 0.03, 3.82, [0.8, 0.78, 0.7], 1.2);
    Gbox(stone, BX, 0.135, BZ + 2.10, 2.75, 0.27, 0.46, [0.7, 0.68, 0.62], 1.1);
    Gbox(stone, BX, 0.075, BZ + 2.50, 3.05, 0.15, 0.45, [0.64, 0.62, 0.56], 1.1);
    // 台面裂纹与青苔（几块深色薄片，别让石台太干净）
    for (let i = 0; i < 9; i++) {
      const px = BX + (r() - 0.5) * 3.4, pz = BZ + (r() - 0.5) * 3.6;
      junk.box.call(junk, m4(px, 0.279, pz, 0, r() * TAU, 0), 0.2 + r() * 0.5, 0.006, 0.12 + r() * 0.3,
        [0.2, 0.24, 0.16], 1.5);
    }
    // 神龛前的地砖
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 4; j++) {
        const px = BX - 3.1 + i * 1.55 + (r() - 0.5) * 0.06;
        const pz = -2.3 + j * 0.92 + (r() - 0.5) * 0.06;
        pave.box.call(pave, m4(px, 0.022, pz, 0, (r() - 0.5) * 0.06, 0), 1.5, 0.035, 0.88,
          [0.82 + r() * 0.2, 0.8 + r() * 0.2, 0.74 + r() * 0.18], 1.1);
      }
    }

    // 以佛像脚底中心为原点的小工具（y 全部加上石台高度 BY）
    const gb = (x, y, z, sx, sy, sz, col, rz) =>
      gold.box.call(gold, m4(BX + x, BY + y, BZ + z, 0, 0, rz || 0), sx, sy, sz, col || GOLD, 1.2);
    const gs = (x, y, z, rx, ry, rz, sx, sy, sz, col) =>
      gold.sphere.call(gold, m4(BX + x, BY + y, BZ + z, rx, ry, rz, sx, sy, sz), 1, 8, 6, col || GOLD);

    /* ---- 莲台：底台 → 下层莲瓣 → 束腰 → 上层莲瓣 → 台面 ---- */
    gold.cyl.call(gold, m4(BX, BY, BZ), 1.6, 1.54, 0.16, 16, GOLD_D, true);
    gold.cyl.call(gold, m4(BX, BY + 0.16, BZ), 1.5, 1.42, 0.1, 16, [0.86, 0.76, 0.56], true);
    const petal = (a, rad, y, w, len, tilt, col) => {
      const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
      gold.sphere.call(gold,
        m4(BX + px, BY + y, BZ + pz, tilt, Math.PI / 2 - a, 0, w, len, w * 0.42),
        1, 6, 4, col);
    };
    for (let i = 0; i < 14; i++) petal((i / 14) * TAU, 1.36, 0.2, 0.17, 0.34, 1.02, i % 2 ? GOLD : [1.1, 0.95, 0.66]);
    gold.cyl.call(gold, m4(BX, BY + 0.3, BZ), 1.14, 1.06, 0.32, 14, GOLD_D, true);
    for (let i = 0; i < 12; i++) petal((i / 12) * TAU + 0.26, 1.06, 0.5, 0.15, 0.28, 0.58, i % 2 ? GOLD_L : GOLD);
    gold.cyl.call(gold, m4(BX, BY + 0.6, BZ), 1.02, 0.94, 0.14, 16, GOLD, true);
    gold.torus.call(gold, m4(BX, BY + 0.75, BZ, Math.PI / 2, 0, 0), 0.96, 0.045, 24, 6, GOLD_L);

    /* ---- 盘腿：横放的两腿、膝盖、露出的脚掌 ---- */
    gb(0, 1.02, 0.06, 1.84, 0.44, 1.0);
    gs(-0.74, 1.1, 0.18, 0, 0.3, 0, 0.32, 0.24, 0.4, GOLD_L);
    gs(0.74, 1.1, 0.18, 0, -0.3, 0, 0.32, 0.24, 0.4, GOLD_L);
    gb(-0.1, 1.0, 0.5, 0.3, 0.12, 0.3, GOLD_L);
    gb(0.12, 0.98, 0.52, 0.26, 0.1, 0.28, GOLD_L);
    // 衣摆压在腿上的一道边
    gb(0, 1.26, 0.3, 1.5, 0.12, 0.62, GOLD_D);

    /* ---- 躯干：束腰 → 胸 → 肩，斜披袈裟 ---- */
    gold.cyl.call(gold, m4(BX, BY + 1.22, BZ), 0.5, 0.58, 0.52, 12, GOLD, true);
    gold.cyl.call(gold, m4(BX, BY + 1.74, BZ), 0.58, 0.66, 0.58, 12, GOLD, true);
    gb(0, 2.3, 0.0, 1.2, 0.24, 0.58, GOLD);
    gs(-0.6, 2.28, 0, 0, 0, 0.15, 0.28, 0.24, 0.28, GOLD_L);
    gs(0.6, 2.28, 0, 0, 0, -0.15, 0.28, 0.24, 0.28, GOLD_L);
    // 袈裟：一条从左肩斜到右腰的宽带，再压一道亮边
    gold.box.call(gold, m4(BX, BY + 1.85, BZ + 0.44, 0, 0, 0.62), 0.24, 1.04, 0.2, GOLD_D, 1);
    gold.box.call(gold, m4(BX, BY + 1.85, BZ + 0.5, 0, 0, 0.62), 0.055, 1.0, 0.14, GOLD_L, 1);

    /* ---- 双臂：肩 → 肘 → 腕，结禅定印 ---- */
    const arm = sgn => [
      [BX + sgn * 0.6, BY + 2.3, BZ + 0.04],
      [BX + sgn * 0.8, BY + 1.86, BZ + 0.2],
      [BX + sgn * 0.64, BY + 1.44, BZ + 0.4],
      [BX + sgn * 0.42, BY + 1.3, BZ + 0.55]
    ];
    gold.tube.call(gold, M.ident(), arm(-1), 0.14, 6, GOLD);
    gold.tube.call(gold, M.ident(), arm(1), 0.14, 6, GOLD);
    gs(-0.42, 1.3, 0.55, 0, 0, 0, 0.13, 0.13, 0.13, GOLD_L);
    gs(0.42, 1.3, 0.55, 0, 0, 0, 0.13, 0.13, 0.13, GOLD_L);
    // 叠在腿上的双掌 + 拇指
    gs(0, 1.3, 0.58, 0, 0, 0, 0.29, 0.085, 0.19, GOLD_L);
    gs(0, 1.37, 0.58, 0, 0, 0, 0.27, 0.075, 0.18, GOLD);
    gs(-0.07, 1.43, 0.58, 0, 0, 0, 0.05, 0.05, 0.05, GOLD_L);
    gs(0.07, 1.43, 0.58, 0, 0, 0, 0.05, 0.05, 0.05, GOLD_L);
    // 指尖（两片薄薄的小条，远看就是手指）
    for (let f = -1; f <= 1; f += 2) {
      gb(f * 0.16, 1.32, 0.68, 0.1, 0.05, 0.06, GOLD);
    }

    /* ---- 头：颈、面、五官、螺发、肉髻、长耳垂 ---- */
    gold.cyl.call(gold, m4(BX, BY + 2.34, BZ), 0.2, 0.18, 0.26, 10, GOLD_D, true);
    gs(0, 2.94, 0.02, 0, 0, 0, 0.35, 0.38, 0.33, GOLD);
    gs(0, 2.76, 0.05, 0, 0, 0, 0.26, 0.19, 0.24, GOLD);            // 下巴
    gb(-0.13, 2.9, 0.3, 0.1, 0.018, 0.03, GOLD_D, -0.05);         // 左眼
    gb(0.13, 2.9, 0.3, 0.1, 0.018, 0.03, GOLD_D, 0.05);           // 右眼
    gb(-0.13, 2.92, 0.31, 0.11, 0.012, 0.02, [1.25, 1.1, 0.78], -0.05); // 左眼皮
    gb(0.13, 2.92, 0.31, 0.11, 0.012, 0.02, [1.25, 1.1, 0.78], 0.05);   // 右眼皮
    gb(-0.14, 2.97, 0.29, 0.15, 0.02, 0.02, GOLD_D, -0.12);       // 左眉
    gb(0.14, 2.97, 0.29, 0.15, 0.02, 0.02, GOLD_D, 0.12);         // 右眉
    gb(0, 2.88, 0.32, 0.06, 0.14, 0.06, GOLD_L);                  // 鼻
    gb(-0.055, 2.79, 0.31, 0.085, 0.018, 0.02, GOLD_D, 0.14);     // 嘴角（左）
    gb(0.055, 2.79, 0.31, 0.085, 0.018, 0.02, GOLD_D, -0.14);     // 嘴角（右）
    gs(0, 3.04, 0.3, 0, 0, 0, 0.028, 0.028, 0.02, [1.5, 1.32, 0.85]); // 白毫
    gs(-0.36, 2.86, 0.02, 0, 0, 0.08, 0.07, 0.26, 0.11, GOLD_L);   // 左耳垂
    gs(0.36, 2.86, 0.02, 0, 0, -0.08, 0.07, 0.26, 0.11, GOLD_L);   // 右耳垂
    gs(0, 3.32, 0.0, 0, 0, 0, 0.14, 0.12, 0.14, GOLD_L);           // 肉髻
    gold.cyl.call(gold, m4(BX, BY + 3.4, BZ), 0.075, 0.0, 0.1, 8, GOLD_L); // 顶髻
    // 螺发：三圈小疙瘩，后面那圈只铺后半边，别糊到脸上
    const gh = (x, y, z, s, col) =>
      gold.sphere.call(gold, m4(BX + x, BY + y, BZ + z, 0, 0, 0, s, s, s), 1, 5, 4, col);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      gh(Math.cos(a) * 0.28, 3.14, Math.sin(a) * 0.26, 0.038, GOLD);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + 0.22;
      gh(Math.cos(a) * 0.2, 3.22, Math.sin(a) * 0.19, 0.034, GOLD_L);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      if (Math.sin(a) > 0.15) continue;
      gh(Math.cos(a) * 0.31, 3.04, Math.sin(a) * 0.29, 0.036, GOLD);
    }

    /* ---- 背光：金环 + 放射光条 + 内层辉光（在佛像身后 0.5m，不穿模） ---- */
    gold.torus.call(gold, m4(BX, BY + 2.95, BZ - 0.5, Math.PI / 2, 0, 0), 1.2, 0.045, 30, 6, GOLD_L);
    gold.torus.call(gold, m4(BX, BY + 2.95, BZ - 0.48, Math.PI / 2, 0, 0), 0.64, 0.022, 24, 5, GOLD_D);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      gold.box.call(gold, m4(BX + Math.cos(a) * 1.36, BY + 2.95 + Math.sin(a) * 1.36, BZ - 0.5, 0, 0, a - Math.PI / 2),
        0.045, 0.22, 0.03, GOLD_L, 1);
    }
    haloG.quad.call(haloG, m4(BX, BY + 2.95, BZ - 0.56), 2.9, 2.9, [1, 1, 1], [0, 0, 1, 1]);

    /* ---- 供桌、香炉、供果、红绸、跪垫、蜡烛 ---- */
    {
      const ax = BX, az = -0.95;
      // 供桌：桌面 + 四条腿 + 前挡板
      woodJunk.box.call(woodJunk, m4(ax, 0.84, az), 1.75, 0.09, 0.62, [0.52, 0.36, 0.24], 1.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        woodJunk.box.call(woodJunk, m4(ax + sx * 0.74, 0.4, az + sz * 0.22), 0.09, 0.8, 0.09,
          [0.4, 0.28, 0.18], 1.8);
      }
      woodJunk.box.call(woodJunk, m4(ax, 0.5, az + 0.3), 1.6, 0.55, 0.05, [0.44, 0.3, 0.2], 1.3);
      // 红绸从桌面垂下来
      clothRed.box.call(clothRed, m4(ax, 0.52, az + 0.34, 0.04, 0, 0.02), 1.5, 0.6, 0.02, [1, 1, 1], 1);
      clothRed.box.call(clothRed, m4(ax - 0.5, 0.86, az + 0.02, 0, 0.2, 0), 0.34, 0.02, 0.58, [1, 1, 1], 1);
      // 香炉
      metalJunk.cyl.call(metalJunk, m4(ax, 0.885, az - 0.02), 0.17, 0.19, 0.2, 12, [0.42, 0.34, 0.22], true);
      metalJunk.torus.call(metalJunk, m4(ax, 1.075, az - 0.02, Math.PI / 2, 0, 0), 0.18, 0.022, 12, 4,
        [0.5, 0.42, 0.26]);
      // 三炷香 + 香头一点亮
      const incenseTip = glow("incense", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.42, 0.16], opacity: 0.7 });
      for (let i = -1; i <= 1; i++) {
        metalJunk.cyl.call(metalJunk, m4(ax + i * 0.055, 1.05, az - 0.02, i * 0.06, 0, i * 0.05), 0.008, 0.006, 0.42, 4,
          [0.55, 0.42, 0.3], false);
        incenseTip.quad.call(incenseTip, m4(ax + i * 0.075, 1.47, az - 0.02 + i * 0.02), 0.14, 0.14, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 供果盘
      metalJunk.cyl.call(metalJunk, m4(ax + 0.48, 0.885, az + 0.02), 0.14, 0.16, 0.03, 12, [0.6, 0.5, 0.3], true);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        gold.sphere.call(gold, m4(ax + 0.48 + Math.cos(a) * 0.08, 0.94, az + 0.02 + Math.sin(a) * 0.08, 0, 0, 0,
          0.05, 0.05, 0.05), 1, 6, 4, [1.3, 0.62, 0.25]);
      }
      // 一对红蜡烛在石台前面两角
      const candleGlow = glow("candle", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.62, 0.25], opacity: 0.6 });
      for (const sx of [-1, 1]) {
        clothRed.cyl.call(clothRed, m4(BX + sx * 1.55, BY, BZ + 1.62), 0.05, 0.045, 0.26, 8, [1.1, 0.8, 0.7], true);
        candleGlow.quad.call(candleGlow, m4(BX + sx * 1.55, BY + 0.33, BZ + 1.62), 0.4, 0.5, [1, 1, 1], [0, 0, 1, 1]);
      }
      // 跪垫两只 + 香灰
      const mat = pen("mat", T.fabric(), { tint: [1.1, 0.55, 0.42] });
      for (const sx of [-0.62, 0.62]) {
        mat.box.call(mat, m4(BX + sx, 0.07, -0.15, 0, 0.05 * sx, 0), 0.52, 0.12, 0.62, [0.9, 0.9, 0.9], 1.4);
      }
      for (let i = 0; i < 6; i++) {
        const ashX = (i % 2 ? 1 : -1) * (0.95 + r() * 0.75);
        junk.box.call(junk, m4(BX + ashX, 0.045, -1.05 + r() * 1.2, 0, r() * TAU, 0),
          0.16 + r() * 0.34, 0.012, 0.14 + r() * 0.3, [0.42, 0.4, 0.36], 1.4);
      }
      // 背后一道神龛门架：两根立柱 + 横梁 + 两道红绸幡（不挡背光）
      for (const sx of [-1.35, 1.35]) {
        woodJunk.cyl.call(woodJunk, m4(BX + sx, BY, BZ - 1.15), 0.032, 0.028, 3.27, 5, [0.5, 0.42, 0.3], true);
      }
      woodJunk.cyl.call(woodJunk, m4(BX - 1.35, 3.5, BZ - 1.15, 0, 0, Math.PI / 2), 0.026, 0.026, 2.7, 5,
        [0.5, 0.42, 0.3], true);
      for (const sx of [-0.55, 0.55]) {
        clothRed.quad.call(clothRed, m4(BX + sx, 3.05, BZ - 1.14), 0.34, 1.05, [1, 1, 1], [0, 0, 1, 1]);
      }
    }

    /* ============================================================
     *  警告牌：山脚一块大的（正对街口），街口再立一块小的
     *  大牌缩到 3.3m 宽，加木框 / 斜撑 / 柱脚混凝土块。
     *  ★ 注意 z 的层次：机位在 +Z 一侧，所以「往前」是 **加** z。
     *    牌面板必须放在底板正面再往前 1cm，否则会被自己的底板盖住
     *    （之前写成 sz0-0.05 放到板后面去了，固定机位里只剩一块棕色木板）。
     * ============================================================ */
    const warnTex = A3DTex.sign({
      text: "⚠ 警告：屎山高危 ⚠\n禁止重构 · 后果自负", w: 768, h: 256, bg: "#8a0f0f", fg: "#ffe9c9",
      size: 62, lineH: 96, border: "#ffd23e", borderW: 10, glow: "rgba(255,60,30,.6)", glowBlur: 24
    });
    const warn = pen("warn", warnTex, { unlit: true, tint: [1, 1, 1] });
    const warnGlow = glow("warnGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.25, 0.1], opacity: 0.3 });
    {
      const sx0 = 3.0, sz0 = -1.4;                     // 牌面中心（局部）——往山脚右侧、往前挪，避开屏幕
      const bw = 3.3, bh = 1.16, byy = 2.4;            // 牌面尺寸 / 中心高度
      // 柱脚混凝土块 + 方柱
      for (const sx of [-1, 1]) {
        const px = sx0 + sx * 1.42;
        Gbox(stone, px, 0.17, sz0 - 0.045, 0.5, 0.34, 0.56, [0.6, 0.58, 0.52], 1.2);
        woodJunk.box.call(woodJunk, m4(px, 1.6, sz0 - 0.045), 0.13, 3.2, 0.13, [0.5, 0.36, 0.25], 1.8);
        // 斜撑：从柱子 1.2m 高斜插到后面地上，脚下一个混凝土墩
        strut.tube.call(strut, M.ident(),
          [[px, 1.25, sz0 - 0.09], [px + sx * 0.05, 0.5, sz0 - 0.6], [px + sx * 0.08, 0.09, sz0 - 1.0]], 0.045, 4,
          [0.55, 0.5, 0.4]);
        Gbox(stone, px + sx * 0.08, 0.08, sz0 - 1.0, 0.42, 0.16, 0.42, [0.56, 0.54, 0.48], 1.2);
      }
      // 横梁 + 木框
      woodJunk.box.call(woodJunk, m4(sx0, 3.16, sz0 - 0.045), 3.05, 0.12, 0.12, [0.46, 0.34, 0.24], 1.7);
      // 牌面底板：z ∈ [sz0-0.03, sz0+0.04]，正面正好顶到柱子的前脸
      woodJunk.box.call(woodJunk, m4(sx0, byy, sz0 + 0.005), bw + 0.16, bh + 0.16, 0.07, [0.42, 0.3, 0.21], 1.4);
      const railCol = [0.62, 0.46, 0.3];
      woodJunk.box.call(woodJunk, m4(sx0, byy + bh / 2 + 0.05, sz0 + 0.06), bw + 0.3, 0.1, 0.09, railCol, 1.7);
      woodJunk.box.call(woodJunk, m4(sx0, byy - bh / 2 - 0.05, sz0 + 0.06), bw + 0.3, 0.1, 0.09, railCol, 1.7);
      for (const sx of [-1, 1]) {
        woodJunk.box.call(woodJunk, m4(sx0 + sx * (bw / 2 + 0.08), byy, sz0 + 0.06), 0.1, bh + 0.22, 0.09,
          railCol, 1.7);
      }
      // 牌面：底板正面(sz0+0.04)再往前 1cm，四周由木框压着
      warn.quad.call(warn, m4(sx0, byy, sz0 + 0.05), bw, bh, [1, 1, 1], [0, 0, 1, 1]);
      warnGlow.quad.call(warnGlow, m4(sx0, byy, sz0 + 0.14), bw + 1.0, bh + 0.9, [1, 1, 1], [0, 0, 1, 1]);
      // 牌子底下随手扔的垃圾，别让柱脚孤零零地戳在空地上
      P.garbagePile(junk.raw, bag.raw, aim(sx0 + 2.3, 0, sz0 - 0.9), 0.6, 137);
      P.garbagePile(junk.raw, bag.raw, aim(sx0 - 2.5, 0, sz0 - 0.7), 0.5, 139);
    }

    // 街口的小号同款：牌子钉在两根柱子前面 4cm
    {
      const cx = -4.3, cz = 5.32;
      Gbox(stone, cx - 0.86, 0.09, cz + 0.02, 0.34, 0.18, 0.34, [0.56, 0.54, 0.48], 1.2);
      Gbox(stone, cx + 0.86, 0.09, cz + 0.02, 0.34, 0.18, 0.34, [0.56, 0.54, 0.48], 1.2);
      for (const sx of [-1, 1]) {
        woodJunk.box.call(woodJunk, m4(cx + sx * 0.86, 0.62, cz), 0.1, 1.12, 0.1, [0.5, 0.36, 0.25], 1.8);
      }
      woodJunk.box.call(woodJunk, m4(cx, 1.25, cz), 1.9, 0.09, 0.1, [0.46, 0.34, 0.24], 1.8);
      // 牌面：钉在柱子「朝镜头那一侧」（+Z）前面 3cm，下面一根横木把缝填住
      warn.quad.call(warn, m4(cx, 1.18, cz + 0.08, 0, 0.05, 0), 1.78, 0.6, [1, 1, 1], [0, 0, 1, 1]);
      woodJunk.box.call(woodJunk, m4(cx, 0.85, cz + 0.04, 0, 0.05, 0), 1.86, 0.06, 0.1, [0.56, 0.4, 0.28], 1.8);
      warnGlow.quad.call(warnGlow, m4(cx, 1.18, cz + 0.16, 0, 0.05, 0), 2.3, 1.0, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 左前方那块小牌子：负责人一栏永远是空的
    {
      const cx = -3.5, cz = -1.8;
      const ownerTex = A3DTex.sign({
        text: "负责人：已离职\n交接文档：无", w: 640, h: 320, bg: "#12160b", fg: "#c9b268",
        size: 46, lineH: 74, border: "#3d4726", borderW: 7, glow: "rgba(190,170,80,.22)", glowBlur: 10
      });
      const owner = pen("owner", ownerTex, { unlit: true, tint: [1, 1, 1] });
      Gbox(stone, cx - 0.68, 0.08, cz + 0.02, 0.3, 0.16, 0.3, [0.56, 0.54, 0.48], 1.2);
      Gbox(stone, cx + 0.68, 0.08, cz + 0.02, 0.3, 0.16, 0.3, [0.56, 0.54, 0.48], 1.2);
      for (const sx of [-1, 1]) {
        woodJunk.box.call(woodJunk, m4(cx + sx * 0.68, 0.62, cz), 0.09, 1.1, 0.09, [0.5, 0.36, 0.25], 1.8);
      }
      woodJunk.box.call(woodJunk, m4(cx, 1.16, cz + 0.02), 1.6, 0.9, 0.06, [0.34, 0.26, 0.18], 1.5);
      owner.quad.call(owner, m4(cx, 1.18, cz + 0.06), 1.5, 0.75, [1, 1, 1], [0, 0, 1, 1]);
      // 旁边还钉着一块空的公告板，风把纸吹没了（留几张打烂的纸，别是一块光板）
      Gbox(stone, cx + 1.15, 0.09, cz - 0.35, 0.36, 0.18, 0.36, [0.54, 0.52, 0.46], 1.2);
      const bm = m4(cx + 1.15, 1.1, cz - 0.38, 0, 0.4, 0);
      woodJunk.box.call(woodJunk, bm, 0.7, 0.9, 0.05, [0.4, 0.3, 0.2], 1.6);
      for (let i = 0; i < 3; i++) {
        junkCard.quad.call(junkCard,
          M.mul(bm, m4(-0.18 + i * 0.18, -0.12 + (i % 2) * 0.24, 0.031, 0, 0, (r() - 0.5) * 0.25)),
          0.15 + r() * 0.05, 0.1 + r() * 0.1, [1.1, 1.05, 0.92], [0, 0, 1, 1]);
      }
    }

    /* ============================================================
     *  意大利面条电缆：从山顶一路拖到山脚
     *  每一根都贴着坡面走（半径 = shellR(y)），两头各接一个接线盒，
     *  中途每隔一段压一个绑扎点 —— 不会再有悬空的断头。
     * ============================================================ */
    const junction = pen("junction", T.darkMetal(), { tint: [0.7, 0.66, 0.56], spec: 0.3 });
    const tieWrap = pen("tie", null, { tint: [0.75, 0.72, 0.6] });
    for (let k = 0; k < 9; k++) {
      const a0 = r() * TAU;
      const drift = (r() - 0.5) * 1.4;
      const yTop = 6.4 + r() * 2.4;
      const pts = [];
      const N = 9;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const a = a0 + drift * u + Math.sin(u * 7 + k) * 0.09;
        const p = surf(a, lerp(yTop, 0.22, u), 0.1 + Math.sin(u * 5 + k) * 0.05);
        pts.push([p.x, p.y, p.z]);
      }
      // 最后一头压到地上，接一个接线盒
      const last = pts[pts.length - 1];
      pts.push([last[0] + (r() - 0.5) * 0.8, 0.05, last[2] + (r() - 0.5) * 0.8]);
      cable.tube.call(cable, M.ident(), pts, 0.05 + r() * 0.035, 5, [0.9, 0.86, 0.8]);
      // 山顶端子盒
      const pt = pts[0];
      junction.box.call(junction, m4(pt[0], pt[1] + 0.12, pt[2], 0, r() * TAU, 0), 0.26, 0.22, 0.18,
        [0.4, 0.38, 0.32], 1.6);
      // 沿路绑扎点
      for (let i = 2; i < N - 1; i += 3) {
        const p = pts[i];
        tieWrap.torus.call(tieWrap, m4(p[0], p[1], p[2], Math.PI / 2, r() * TAU, 0), 0.075, 0.016, 8, 4,
          [0.9, 0.86, 0.78]);
      }
      // 山脚接线盒
      const pe = pts[pts.length - 1];
      junction.box.call(junction, m4(pe[0], 0.15, pe[2], 0, r() * TAU, 0), 0.34, 0.3, 0.24, [0.36, 0.34, 0.28], 1.5);
    }
    // 从山顶天线往下走的几根细线（天线馈线）
    for (let i = 0; i < 3; i++) {
      const a = 100 * D2R + i * 0.5;
      const pts = [];
      for (let q = 0; q <= 6; q++) {
        const u = q / 6;
        const p = surf(a + u * 0.12, lerp(11.2, 2.0, u), 0.12);
        pts.push([p.x, p.y, p.z]);
      }
      cable.tube.call(cable, M.ident(), pts, 0.022, 3, [0.8, 0.76, 0.7]);
    }

    /* ============================================================
     *  甲虫：山脚一拨、山坡一拨，绕着爬的 bug（字面意义）
     *  山坡那拨的高度在动画里用 surfaceY() 现算，贴着坡面爬；
     *  山脚那拨贴着地面。
     * ============================================================ */
    const beetle = (bx, bz, y0, onSlope, rad, spd, ph) => {
      const bd = dyno(null, { tint: [0.06, 0.07, 0.04], spec: 0.5, rim: 0.2 }, t => {
        const a = t * spd + ph;
        const px = bx + Math.cos(a) * rad;
        const pz = bz + Math.sin(a) * rad;
        const y = onSlope ? surfaceY(px, pz) + 0.06 : y0;
        return M.trs(px, y + Math.abs(Math.sin(a * 3)) * 0.012, pz, 0, a, 0, 1, 1, 1);
      });
      bd.sphere.call(bd, m4(0, 0, 0), 0.085, 6, 4, [1, 1, 1]);
      bd.sphere.call(bd, m4(0, 0.01, 0.1), 0.048, 5, 3, [0.4, 0.34, 0.2]);
    };
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + r() * 0.4;
      const p = surf(a, 0.9 + r() * 4.2, 0.12);
      beetle(p.x, p.z, 0, true, 0.16 + r() * 0.34, (0.2 + r() * 0.5) * (i % 2 ? 1 : -1), r() * TAU);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r() * 0.5;
      const R = BASE_R * (1.03 + r() * 0.22);
      beetle(CX + Math.cos(a) * R, CZ + Math.sin(a) * R * EZ, 0.05, false, 0.2 + r() * 0.45,
        0.3 + r() * 0.5, r() * TAU);
    }

    /* ============================================================
     *  臭气团：绿幽幽的半透明雾块，贴着坡面慢慢飘
     * ============================================================ */
    for (let i = 0; i < 7; i++) {
      const a = (60 + r() * 140) * D2R;
      const p = surf(a, 1.2 + r() * 4.4, 0.55);
      const size = 2.4 + r() * 1.6;
      const d = dyno(T.glow(), { unlit: true, blend: "alpha", tint: [0.55, 0.75, 0.3], opacity: 0.09 }, t =>
        M.trs(p.x + Math.sin(t * 0.2 + i) * 0.45, p.y + Math.sin(t * 0.15 + i * 2) * 0.25, p.z, 0, 0, 0, 1, 1, 1));
      d.quad.call(d, m4(0, 0, 0, 0, 0, i), size, size * 0.78, [1, 1, 1], [0, 0, 1, 1]);
    }
    // 贴地的矮雾（不飘，趴在地上）
    const stinkLow = pen("stinkLow", T.glow(), { unlit: true, blend: "alpha", tint: [0.5, 0.7, 0.28], opacity: 0.1 });
    for (let i = 0; i < 6; i++) {
      const a = (50 + r() * 170) * D2R;
      const R = BASE_R * (0.95 + r() * 0.32);
      stinkLow.quad.call(stinkLow, m4(CX + Math.cos(a) * R, 0.16 + r() * 0.2, CZ + Math.sin(a) * R * EZ,
        -Math.PI / 2, 0, r() * TAU), 3.4 + r() * 2.2, 2.6 + r() * 1.6, [1, 1, 1], [0, 0, 1, 1]);
    }

    /* ============================================================
     *  烧垃圾的铁桶：山脚两点火光（世界里的点光源就在这两个位置）
     * ============================================================ */
    const barrel = pen("barrel", T.darkMetal(), { tint: [0.5, 0.3, 0.2], spec: 0.3 });
    const fire = glow("fire", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.5, 0.15], opacity: 0.35 });
    const fireCore = glow("fireCore", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.82, 0.4], opacity: 0.5 });
    const coal = pen("coal", null, { tint: [1.5, 0.35, 0.1] });
    const embers = [];
    for (const bx of [-5.5, 6.0]) {
      const bz = -4.0;
      barrel.cyl.call(barrel, m4(bx, 0, bz), 0.34, 0.39, 0.86, 12, [1, 1, 1], true);
      // 桶口两道箍 + 桶底的锈
      for (const yy of [0.18, 0.72]) {
        metalJunk.torus.call(metalJunk, m4(bx, yy, bz, Math.PI / 2, 0, 0), 0.375, 0.02, 12, 4, [0.5, 0.34, 0.24]);
      }
      // 桶里的炭火（躺着的圆片）
      coal.quad.call(coal, m4(bx, 0.7, bz, -Math.PI / 2, 0, 0), 0.6, 0.6, [1, 1, 1], [0, 0, 1, 1]);
      // 探出桶口的垃圾（木头、纸）
      junk.box.call(junk, m4(bx - 0.1, 0.8, bz + 0.06, 0.3, 0.6, 0.2), 0.4, 0.05, 0.5, [0.2, 0.16, 0.12], 1.6);
      junkRust.box.call(junkRust, m4(bx + 0.12, 0.82, bz - 0.05, -0.2, 1.3, 0.4), 0.32, 0.04, 0.4,
        [0.3, 0.2, 0.14], 1.5);
      // 火苗：三片大小不一的加法光，底边压在桶口上
      fire.quad.call(fire, m4(bx, 1.28, bz, 0, 0, 0.05), 0.92, 1.15, [1, 1, 1], [0, 0, 1, 1]);
      fireCore.quad.call(fireCore, m4(bx, 1.1, bz, 0, 0, -0.06), 0.5, 0.72, [1, 1, 1], [0, 0, 1, 1]);
      fire.quad.call(fire, m4(bx - 0.06, 1.62, bz, 0, 0, 0.3), 0.5, 1.35, [1, 1, 1], [0, 0, 1, 1]);
      // 桶周围的焦土
      stain.quad.call(stain, m4(bx, 0.012, bz, -Math.PI / 2, 0, 0), 2.2, 2.2, [1, 1, 1], [0, 0, 1, 1]);
      // 火星点源：和火苗同一个桶口
      for (let i = 0; i < 22; i++) {
        embers.push({
          x: bx + (r() - 0.5) * 0.42, y: 0.9 + r() * 2.2, z: bz + (r() - 0.5) * 0.42,
          r: 1.0, g: 0.5 + r() * 0.35, b: 0.16, a: 0.5 + r() * 0.45,
          size: 0.018 + r() * 0.032, kind: 1, speed: 0.45 + r() * 0.85, phase: r() * TAU, wob: 0.18 + r() * 0.3
        });
      }
    }
    points(embers, { blend: "add", yMin: 0.88, yMax: 3.4, fogNear: 8, fogFar: 30 });

    /* ============================================================
     *  苍蝇：绕镜头前乱窜的黑点，个头放大
     * ============================================================ */
    const flies = [];
    for (let i = 0; i < 120; i++) {
      flies.push({
        x: (r() - 0.5) * 13, y: 0.5 + r() * 5.5, z: -7 + r() * 9,
        r: 0.1, g: 0.09, b: 0.06, a: 0.5 + r() * 0.4,
        size: 0.03 + r() * 0.045, kind: 1, speed: 0.15 + r() * 0.3, phase: r() * TAU, wob: 0.3 + r() * 0.4
      });
    }
    points(flies, { blend: "alpha", yMin: 0.2, yMax: 7, fogNear: 10, fogFar: 34 });

    /* ============================================================
     *  朝街口（局部 +Z）的过渡：让 GitHub 街尾自然拐进这座山
     *  牌坊后（world x −14.7，局部 z 7.3）路面就断了，这一段用垃圾、废屏、
     *  电缆、警示桩一路压过去，从街口和山脚两个方向都不能看见空白泥地。
     *  这里用一支独立的随机数，不打乱上面的构图序列。
     * ============================================================ */
    const tr = P.rng(173);

    // 越靠近街口越稀的垃圾堆（中间留一条窄道给镜头）
    P.garbagePile(junk.raw, bag.raw, aim(-6.4, 0, 2.2), 0.95, 67);
    P.garbagePile(junk.raw, bag.raw, aim(6.2, 0, 3.0), 0.9, 71);
    P.garbagePile(junk.raw, bag.raw, aim(-5.6, 0, 6.6), 0.7, 73);
    P.garbagePile(junk.raw, bag.raw, aim(5.4, 0, 7.0), 0.62, 79);
    P.garbagePile(junk.raw, bag.raw, aim(-8.6, 0, 4.4), 0.8, 83);
    P.garbagePile(junk.raw, bag.raw, aim(8.4, 0, 5.6), 0.72, 89);
    P.garbagePile(junk.raw, bag.raw, aim(2.6, 0, 7.6), 0.5, 97);
    P.garbagePile(junk.raw, bag.raw, aim(0.6, 0, 8.4), 0.42, 101);

    // 报废显示器：屏幕用同一张「无信号 / 404」贴图，省 draw call
    const noSignal = pen("noSignal", A3DTex.sign({
      text: "无 信 号", w: 512, h: 256, bg: "#060b0a", fg: "#3f6b58", size: 58,
      border: "#142420", borderW: 6, glow: "rgba(90,190,150,.20)", glowBlur: 14
    }), { unlit: true, tint: [0.82, 1.0, 0.9] });
    const no404 = pen("no404", A3DTex.sign({
      text: "404", w: 512, h: 256, bg: "#0c0705", fg: "#c4523a", size: 96,
      border: "#2a1310", borderW: 6, glow: "rgba(240,90,50,.28)", glowBlur: 16
    }), { unlit: true, tint: [1, 0.94, 0.9] });

    // 一台报废显示器：机箱（junk）+ 屏幕（noSignal / no404），stand 决定还留不留半截支架
    const deadMonitor = (px, py, pz, rx, ry, w, h, scr, stand) => {
      const base = m4(px, py, pz, rx, ry, 0);
      junk.box.call(junk, base, w + 0.1, h + 0.1, 0.085, [0.075, 0.08, 0.075], 1.2);
      if (stand) {
        junk.box.call(junk, M.mul(base, m4(0, -h * 0.5 - 0.11, -0.02)), 0.14, 0.24, 0.07, [0.06, 0.065, 0.06], 1.4);
      }
      scr.quad.call(scr, M.mul(base, m4(0, 0, 0.052)), w, h, [1, 1, 1], [0, 0, 1, 1]);
    };
    deadMonitor(-3.9, 0.2, 6.0, 0.16, 0.35, 0.66, 0.42, noSignal, true);   // 斜靠在垃圾袋上
    deadMonitor(6.4, 0.19, 5.8, 0.1, -0.55, 0.6, 0.38, no404, true);
    deadMonitor(6.6, 0.34, -0.6, 0.22, -0.8, 0.58, 0.36, noSignal, true);  // 山脚边上再立一台
    deadMonitor(-2.4, 0.09, 3.8, -Math.PI / 2, 0.35, 0.62, 0.4, noSignal, false); // 面朝上躺着
    deadMonitor(-8.9, 0.21, 2.4, 0.13, 1.1, 0.6, 0.38, no404, true);
    deadMonitor(8.8, 0.3, 1.4, 0.2, -1.35, 0.56, 0.34, noSignal, true);
    deadMonitor(1.2, 0.08, 7.4, -Math.PI / 2, -0.6, 0.58, 0.36, no404, false);

    // 歪倒的机箱：铁皮壳子 + 一面歪掉的侧板 + 几个通风口
    const deadCase = (px, py, pz, rx, ry, rz, w, h, d) => {
      const base = m4(px, py, pz, rx, ry, rz);
      junkRust.box.call(junkRust, base, w, h, d, [0.24, 0.19, 0.14], 2.2);
      junk.box.call(junk, M.mul(base, m4(w * 0.52, 0, 0)), 0.015, h * 0.86, d * 0.86, [0.1, 0.1, 0.09], 1.6);
      for (let k = 0; k < 3; k++) {
        junk.box.call(junk, M.mul(base, m4(0, h * 0.28 - k * h * 0.22, d * 0.5 + 0.01)),
          w * 0.28, h * 0.1, 0.02, [0.06, 0.06, 0.055], 1.5);
      }
    };
    deadCase(-7.0, 0.22, 4.0, Math.PI / 2, 0.7, 0, 0.22, 0.46, 0.44);   // 侧躺，面板朝天
    deadCase(2.4, 0.26, 6.4, -0.3, -0.9, 0.25, 0.44, 0.5, 0.22);        // 斜靠在垃圾上
    deadCase(9.3, 0.2, -3.2, 0.15, -0.4, 0.3, 0.4, 0.46, 0.2);

    // 碎键盘：壳子 + 散了一地的键帽
    const brokenKeyboard = (px, pz, ry) => {
      junk.box.call(junk, m4(px, 0.016, pz, 0, ry, 0), 0.42, 0.03, 0.15, [0.09, 0.1, 0.09], 1.2);
      for (let i = 0; i < 9; i++) {
        junk.box.call(junk, m4(px + (tr() - 0.5) * 0.55, 0.008, pz + (tr() - 0.5) * 0.4,
          tr() * 0.5, tr() * TAU, tr() * 0.5), 0.03, 0.012, 0.03, [0.14, 0.15, 0.14], 1);
      }
    };
    brokenKeyboard(-1.6, 6.4, 0.9);
    brokenKeyboard(3.4, 4.6, -1.1);
    brokenKeyboard(-4.6, 1.6, -0.3);

    // 两只歪在路边的木箱
    P.crate(woodJunk.raw, aim(-7.9, 0.17, 0.8, 0, 0.5, 0), 0.34, [0.2, 0.17, 0.13]);
    P.crate(woodJunk.raw, aim(7.7, 0.15, 1.6, 0, -0.9, 0), 0.3, [0.18, 0.15, 0.12]);
    P.crate(woodJunk.raw, aim(-9.4, 0.14, -3.0, 0, 1.2, 0), 0.28, [0.19, 0.16, 0.12]);

    // 零散的垃圾袋（不堆成山，就随手扔在街尾）
    for (let i = 0; i < 12; i++) {
      const bx = (tr() - 0.5) * 15, bz = -0.5 + tr() * 9.0;
      if (Math.abs(bx + 2) < 1.2 && bz > 6.0) continue;    // 镜头脚下留空
      bag.sphere.call(bag, m4(bx, 0.12 + tr() * 0.06, bz, 0, tr() * TAU, 0.24),
        0.15 + tr() * 0.1, 7, 5, [0.1 + tr() * 0.06, 0.12 + tr() * 0.03, 0.1]);
    }

    // 地上的烂电缆：从街口一路爬到山脚（压在地面上，不悬空）
    for (let k = 0; k < 6; k++) {
      const x0 = -6 + tr() * 13, z0 = 9.0 - k * 0.5;
      const x1 = x0 * 0.35 + (tr() - 0.5) * 5, z1 = 0.6 + tr() * 1.8;
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        pts.push([
          x0 + (x1 - x0) * u + Math.sin(u * 6 + k) * 0.55,
          0.035 + Math.abs(Math.sin(u * 3 + k)) * 0.05,
          z0 + (z1 - z0) * u + Math.cos(u * 5 + k) * 0.45
        ]);
      }
      cable.tube.call(cable, M.ident(), pts, 0.026, 5, [0.85, 0.8, 0.72]);
    }

    // 垃圾渗出来的毒水：几摊绿幽幽的水洼（贴地）
    for (let i = 0; i < 5; i++) {
      stinkLow.quad.call(stinkLow, m4(-6 + tr() * 12, 0.032, -1 + tr() * 8.5, -Math.PI / 2, 0, tr() * TAU),
        1.2 + tr() * 1.6, 0.9 + tr() * 1.2, [1, 1, 1], [0, 0, 1, 1]);
    }

    // 烧过的地皮 / 渗滤液黑斑：贴着骨架地形的低矮暗块，不算地面
    for (let i = 0; i < 12; i++) {
      const ax = -9 + tr() * 18, az = -3 + tr() * 12;
      junk.box.call(junk, m4(ax, 0.014, az, 0, tr() * TAU, 0),
        0.7 + tr() * 1.7, 0.022, 0.6 + tr() * 1.5, [0.07, 0.07, 0.06], 1.5);
    }

    // 街口的警示桩 ×3 + 两段警戒带：从街上走过来，先看见一圈拦起来的黄带
    /** 一根警示桩：混凝土墩 + 钢管 + 顶部挂钩 + 一道反光带 */
    const warnPole = (px, pz) => {
      Gbox(stone, px, 0.09, pz, 0.36, 0.18, 0.36, [0.58, 0.56, 0.5], 1.2);
      metalJunk.cyl.call(metalJunk, m4(px, 0.18, pz), 0.062, 0.05, 0.76, 6, [0.55, 0.45, 0.32], true);
      metalJunk.torus.call(metalJunk, m4(px, 0.92, pz, Math.PI / 2, 0, 0), 0.048, 0.011, 8, 4, [0.62, 0.56, 0.44]);
      const stripe = glow("poleGlow", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.55, 0.15], opacity: 0.45 });
      stripe.quad.call(stripe, m4(px, 0.68, pz), 0.42, 0.36, [1, 1, 1], [0, 0, 1, 1]);
      return [px, 0.9, pz];
    };
    /** 一条警戒带：两头挂在柱顶，中间垂下去（垂度 0.35~0.45，别拉成一条平线） */
    const tapeSpan = (A, B, sag) => {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        pts.push([
          lerp(A[0], B[0], u),
          lerp(A[1], B[1], u) - Math.sin(u * Math.PI) * sag,
          lerp(A[2], B[2], u)
        ]);
      }
      // 脏一点、灰一点，再加一点扭转，远看才不是一根发光的黄线
      ribbon(caution, pts, 0.15, [0.74, 0.72, 0.58], 4, 0.07);
    };
    const wP1 = warnPole(-2.6, 8.5);
    const wPm = warnPole(0.4, 8.05);
    const wP2 = warnPole(3.4, 7.6);
    tapeSpan(wP1, wPm, 0.4);
    tapeSpan(wPm, wP2, 0.36);
    // 反光锥：墩子和柱子旁边各摆一个，带子底下才不是空的
    const cone = (px, pz) => {
      coneOrange.cyl.call(coneOrange, m4(px, 0.02, pz), 0.17, 0.16, 0.05, 8, [0.9, 0.42, 0.16], true);
      coneOrange.cyl.call(coneOrange, m4(px, 0.07, pz), 0.13, 0.035, 0.46, 8, [0.95, 0.45, 0.16], false);
      const band = glow("coneBand", T.glow(), { unlit: true, blend: "add", tint: [1.0, 0.9, 0.6], opacity: 0.4 });
      band.quad.call(band, m4(px, 0.33, pz), 0.3, 0.26, [1, 1, 1], [0, 0, 1, 1]);
    };
    cone(-1.1, 7.2);
    cone(1.9, 7.5);
  }
  return { build };
})();

/* ============================================================
 * Escape A÷ · game/src/bugs.js —— 甲虫（bug）种类与 AI
 *
 * 一只虫 = 一条纯数据 { kind, x, y, cd, hp, tested, frozen, stun, ... }，
 * 世界状态要能整份 JSON 快照（commit 回档），所以这里不存函数、不存引用。
 * 行为由下面的 KINDS[kind].ai(W, b) 决定，W 是 world.js 给的窄接口：
 *   W.tile(x,y) 真地块字符   W.bugBlock(b,x,y) 这只虫能不能站
 *   W.player                 玩家 {x,y}
 *   W.spawn(kind,x,y)        长一只新的
 *   W.observed(x,y)          这个格子此刻是否被「观测」（在光源圆内 / 灯下）
 *   W.move(b,dx,dy)          走一步
 *   W.toast / W.sfx / W.rng
 * ============================================================ */
"use strict";

window.BUGS = (() => {

  const T = 8;   // 逻辑 tick / 秒（与 world.js 的 STEP_HZ 一致）

  /* ---------------- 种类表 ---------------- */
  const KINDS = {
    docile: {
      label: "教学虫", hint: "第一关的道具虫：爬得慢，专门让你认识死亡和回档。",
      speed: 10, lethal: true,
      ai(W, b) {
        if (b.cd-- > 0) return;
        b.cd = this.speed;
        const p = W.player;
        if (Math.abs(p.x - b.x) + Math.abs(p.y - b.y) > 7) {         // 太远就原地晃悠
          if (!W.move(b, b.dx, b.dy)) { b.dx = -b.dx; b.dy = -b.dy; }
          return;
        }
        const dx = Math.sign(p.x - b.x), dy = Math.sign(p.y - b.y);
        if (!W.move(b, dx, 0)) W.move(b, 0, dy);
      }
    },
    walk: {
      label: "游荡甲虫", hint: "顺着一条道来回爬，撞到代码墙就掉头。",
      speed: 8, lethal: true,
      ai(W, b) {
        if (b.cd-- > 0) return;
        b.cd = this.speed;
        if (!W.move(b, b.dx, b.dy)) { b.dx = -b.dx; b.dy = -b.dy; W.move(b, b.dx, b.dy); }
      }
    },
    chase: {
      label: "复现虫", hint: "你一动它就动；只要你待在光里，它永远知道你在哪。",
      speed: 3, lethal: true,
      ai(W, b) {
        if (b.cd-- > 0) return;
        b.cd = this.speed;
        const p = W.player;
        const d = Math.abs(p.x - b.x) + Math.abs(p.y - b.y);
        if (d > 9 || !W.observed(b.x, b.y)) {          // 看不见你时就原地瞎逛
          if (!W.move(b, b.dx, b.dy)) { b.dx = 1; b.dy = 0; W.move(b, 1, 0) || W.move(b, -1, 0) || W.move(b, 0, 1) || W.move(b, 0, -1); }
          return;
        }
        const dx = Math.sign(p.x - b.x), dy = Math.sign(p.y - b.y);
        // 优先走能缩短距离的那条轴，走不通换另一条
        const tries = Math.abs(p.x - b.x) >= Math.abs(p.y - b.y)
          ? [[dx, 0], [0, dy], [-dy, 0], [0, -dx]]
          : [[0, dy], [dx, 0], [-dx, 0], [0, -dy]];
        for (const [mx, my] of tries) if (mx || my) { if (W.move(b, mx, my)) return; }
      }
    },
    legacy: {
      label: "祖传虫", hint: "「改 1 行 · 炸 47 处」本尊。没盖测试就删它，立刻原地长出两只。",
      speed: 12, lethal: true, needsTest: true,
      ai(W, b) {
        if (b.cd-- > 0) return;
        b.cd = this.speed;
        if (!W.move(b, b.dx, b.dy)) { b.dx = -b.dx; b.dy = -b.dy; W.move(b, b.dx, b.dy); }
      }
    },
    breeder: {
      label: "繁殖虫", hint: "趴着不动，只管产卵。不清掉它，甲虫只会越来越多。",
      speed: 0, lethal: true, lays: 14,
      ai(W, b) {
        if (b.cd-- > 0) return;
        b.cd = this.lays * T;
        const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];
        for (const [dx, dy] of W.shuffle(spots.slice())) {
          if (W.spawn("egg", b.x + dx, b.y + dy)) return;
        }
      }
    },
    egg: {
      label: "虫卵", hint: "过一会儿就孵化。趁它还没腿，一脚踩死最划算。",
      speed: 0, lethal: false, hatch: 18,
      ai(W, b) {
        if (b.cd-- <= 0) { W.remove(b); W.spawn("walk", b.x, b.y); W.sfx("hatch"); W.toast("虫卵孵化了", "warn"); }
      }
    },
    jumper: {
      label: "跳虫", hint: "不按路线走，隔一会儿直接跳到脸上 —— 它读过你的 commit。",
      speed: 4, lethal: true, jump: 40,
      ai(W, b) {
        if (b.jumpCd != null) b.jumpCd--;
        if (b.jumpCd == null) b.jumpCd = this.jump;
        if (b.jumpCd <= 0) {
          b.jumpCd = this.jump;
          const p = W.player;
          for (const [dx, dy] of W.shuffle([[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2], [1, 0], [-1, 0]])) {
            const tx = p.x + dx, ty = p.y + dy;
            if (!W.bugBlock(b, tx, ty)) { W.place(b, tx, ty); W.sfx("glitch"); b.justJumped = 3; return; }
          }
        }
        if (b.justJumped > 0) { b.justJumped--; return; }
        if (b.cd-- > 0) return;
        b.cd = this.speed;
        const p = W.player, dx = Math.sign(p.x - b.x), dy = Math.sign(p.y - b.y);
        if (!W.move(b, dx, 0) && !W.move(b, 0, dy)) W.move(b, -dx, 0);
      }
    },
    heisen: {
      label: "海森堡虫", hint: "只在黑暗里现形；一旦被光照到就当场卡住。观测决定它存不存在。",
      speed: 4, lethal: true, ghost: true, invisible: true,
      ai(W, b) {
        if (W.observed(b.x, b.y)) { b.frozen = 4; return; }   // 被观测 → 停滞，此时才杀得掉
        if (b.cd-- > 0) return;
        b.cd = this.speed;
        const p = W.player;
        const dx = Math.sign(p.x - b.x), dy = Math.sign(p.y - b.y);
        if (Math.abs(p.x - b.x) + Math.abs(p.y - b.y) <= 10) { W.move(b, dx, 0) || W.move(b, 0, dy); return; }
        if (b.rx == null) { b.rx = W.rnd() < 0.5 ? 1 : 0; }
        if (b.rx) W.move(b, Math.sign(b.dx || 1), 0) || (b.rx = 0);
        else W.move(b, 0, Math.sign(b.dy || 1)) || (b.rx = 1);
      }
    },
    crawler: {
      label: "爬墙虫", hint: "贴在墙上不动，等你从下面走过就掉下来。抬头看是没用的。",
      speed: 2, lethal: true,
      ai(W, b) {
        if (!b.attached) return;                 // 掉落由 world.dropCrawlers 接管
        const p = W.player;
        if (Math.abs(p.x - b.x) <= 1 && (p.y - b.y) * W.gravity > 0 && Math.abs(p.y - b.y) <= (b.range || 4)) {
          b.attached = false; b.cd = 1;
          W.toast("头顶上有东西掉下来了", "bad");
          W.sfx("alarm");
        }
      }
    },
    timer: {
      label: "定时虫", hint: "它在倒数。炸了以后十字方向三格内全灭，并且裂成三只。",
      speed: 0, lethal: true, fuse: 16,
      ai(W, b) {
        b.fuse = b.fuse == null ? this.fuse * T : b.fuse - 1;
        if (b.fuse % T < 1 && b.fuse < 5 * T) W.sfx("tick");
        if (b.fuse <= 0) {
          W.explode(b.x, b.y, 3, "定时虫炸了");
          W.remove(b);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) if (!W.spawn("walk", b.x + dx, b.y + dy)) { /* 挤不下就算了 */ }
        }
      }
    },
    boss: {
      label: "祖传本体", hint: "三管血。每一管都要先盖测试再删；不盖测试，它掉血就分家。",
      speed: 7, lethal: true, needsTest: true, hp: 3,
      ai(W, b) {
        if (b.cd-- > 0) return;
        b.cd = this.speed;
        const p = W.player;
        const dx = Math.sign(p.x - b.x), dy = Math.sign(p.y - b.y);
        if (!W.move(b, dx, 0)) W.move(b, 0, dy);
      }
    }
  };

  function get(kind) { return KINDS[kind] || KINDS.walk; }

  /** 图鉴文案：第一次遇到某只虫时弹出来 */
  function codex(kind) {
    const k = get(kind);
    return { name: k.label, text: k.hint };
  }

  function isLethal(b) {
    const k = get(b.kind);
    if (b.kind === "egg") return false;
    return !!k.lethal && !(b.frozen > 0);
  }

  /** 这只虫现在能不能被「修」掉 */
  function killable(b, observed) {
    const k = get(b.kind);
    if (k.invisible && !(b.frozen > 0)) return { ok: false, why: "海森堡虫只有在被光照到卡住时才修得掉" };
    if (b.stun > 0) return { ok: true };
    if (b.frozen > 0) return { ok: true };
    if (!observed) return { ok: false, why: "它不在光里，你连它在哪儿都不知道" };
    return { ok: true };
  }

  return { KINDS, get, codex, isLethal, killable, T };
})();

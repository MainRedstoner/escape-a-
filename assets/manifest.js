/* 本文件由 tools/gen_manifest.py 自动生成，请勿手改。
 * 作用：告诉游戏 assets/ 下有哪些素材可用；没有的素材位会自动显示占位卡。
 * 重新生成：python tools/gen_manifest.py
 */
window.EA_ASSETS = {
  "version": 1,
  "spec": {
    "bg": {
      "size": [
        1920,
        1080
      ],
      "note": "16:9 整幅背景，人物会叠在下半部分"
    },
    "cg": {
      "size": [
        1920,
        1080
      ],
      "note": "16:9 整幅演出图，构图请把主体放在中下偏左/右"
    },
    "chara": {
      "size": [
        1400,
        2000
      ],
      "note": "透明底 PNG，全身，脚底对齐画面底部，人物居中"
    }
  },
  "model": "WAI_NSFW-illustrious-SDXL_v15",
  "bg": {
    "cell": {
      "src": "assets/bg/cell.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "clockroom": {
      "src": "assets/bg/clockroom.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "corridor": {
      "src": "assets/bg/corridor.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "graveyard": {
      "src": "assets/bg/graveyard.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "library": {
      "src": "assets/bg/library.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "lobby": {
      "src": "assets/bg/lobby.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "machineroom": {
      "src": "assets/bg/machineroom.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "sanctum": {
      "src": "assets/bg/sanctum.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "sea": {
      "src": "assets/bg/sea.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "security": {
      "src": "assets/bg/security.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "surface": {
      "src": "assets/bg/surface.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    },
    "vault": {
      "src": "assets/bg/vault.jpg",
      "pipeline": "circlestone-labs/Anima (base v1.0/aesthetic v1.1) + 两阶段放大"
    }
  },
  "cg": {
    "memory": {
      "src": "assets/cg/memory.jpg",
      "draft": true,
      "seed": 21401
    },
    "monitor": {
      "src": "assets/cg/monitor.jpg",
      "draft": true,
      "seed": 21402
    },
    "reset": {
      "src": "assets/cg/reset.jpg",
      "draft": true,
      "seed": 21406
    },
    "reunion": {
      "src": "assets/cg/reunion.jpg",
      "draft": true,
      "seed": 21403
    },
    "stay": {
      "src": "assets/cg/stay.jpg",
      "draft": true,
      "seed": 21405
    },
    "trueend": {
      "src": "assets/cg/trueend.jpg",
      "draft": true,
      "seed": 21404
    }
  },
  "chara": {
    "cl_apologetic": {
      "src": "assets/chara/cl_apologetic.png",
      "draft": true,
      "seed": 22502
    },
    "cl_blush": {
      "src": "assets/chara/cl_blush.png",
      "draft": true,
      "seed": 22502
    },
    "cl_determined": {
      "src": "assets/chara/cl_determined.png",
      "draft": true,
      "seed": 22502
    },
    "cl_normal": {
      "src": "assets/chara/cl_normal.png",
      "draft": true,
      "seed": 22502
    },
    "cl_sad": {
      "src": "assets/chara/cl_sad.png",
      "draft": true,
      "seed": 22502
    },
    "cl_shock": {
      "src": "assets/chara/cl_shock.png",
      "draft": true,
      "seed": 22502
    },
    "cl_smile": {
      "src": "assets/chara/cl_smile.png",
      "draft": true,
      "seed": 22502
    },
    "cl_soft": {
      "src": "assets/chara/cl_soft.png",
      "draft": true,
      "seed": 22502
    },
    "core_angry": {
      "src": "assets/chara/core_angry.png",
      "draft": true,
      "seed": 22504
    },
    "core_hurt": {
      "src": "assets/chara/core_hurt.png",
      "draft": true,
      "seed": 22504
    },
    "core_normal": {
      "src": "assets/chara/core_normal.png",
      "draft": true,
      "seed": 22504
    },
    "ds_determined": {
      "src": "assets/chara/ds_determined.png",
      "pipeline": "circlestone-labs/Anima + SAkizuki/anima-deepseek LoRA"
    },
    "ds_happy": {
      "src": "assets/chara/ds_happy.png",
      "pipeline": "circlestone-labs/Anima + SAkizuki/anima-deepseek LoRA"
    },
    "ds_normal": {
      "src": "assets/chara/ds_normal.png",
      "pipeline": "circlestone-labs/Anima + SAkizuki/anima-deepseek LoRA"
    },
    "ds_sad": {
      "src": "assets/chara/ds_sad.png",
      "pipeline": "circlestone-labs/Anima + SAkizuki/anima-deepseek LoRA"
    },
    "ds_shock": {
      "src": "assets/chara/ds_shock.png",
      "pipeline": "circlestone-labs/Anima + SAkizuki/anima-deepseek LoRA"
    },
    "ds_sweat": {
      "src": "assets/chara/ds_sweat.png",
      "pipeline": "circlestone-labs/Anima + SAkizuki/anima-deepseek LoRA"
    },
    "guard_angry": {
      "src": "assets/chara/guard_angry.png",
      "draft": true,
      "seed": 22503
    },
    "guard_normal": {
      "src": "assets/chara/guard_normal.png",
      "draft": true,
      "seed": 22503
    },
    "guard_scan": {
      "src": "assets/chara/guard_scan.png",
      "draft": true,
      "seed": 22503
    },
    "old_normal": {
      "src": "assets/chara/old_normal.png",
      "draft": true,
      "seed": 22506
    },
    "old_sad": {
      "src": "assets/chara/old_sad.png",
      "draft": true,
      "seed": 22506
    },
    "staff_happy": {
      "src": "assets/chara/staff_happy.png",
      "draft": true,
      "seed": 22507
    },
    "staff_tired": {
      "src": "assets/chara/staff_tired.png",
      "draft": true,
      "seed": 22507
    },
    "user_happy": {
      "src": "assets/chara/user_happy.png",
      "draft": true,
      "seed": 22505
    },
    "user_normal": {
      "src": "assets/chara/user_normal.png",
      "draft": true,
      "seed": 22505
    },
    "user_tired": {
      "src": "assets/chara/user_tired.png",
      "draft": true,
      "seed": 22505
    }
  }
};

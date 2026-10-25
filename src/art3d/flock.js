/* ============================================================
 * Escape A÷ · src/art3d/flock.js —— 窗外鱼群（boids）
 *
 * 零依赖、零构建的 3D 鱼群模拟：只算位置 / 速度 / 模型矩阵，
 * 不碰 WebGL、不碰 DOM。场景拿到矩阵后塞进 A3D 场景的 dyn 列表即可。
 *
 * 用法：
 *   const flock = A3DFlock.create({
 *     count: 44, seed: 7,
 *     bounds: { min: [-2.1, 0.95, -8.6], max: [1.7, 2.55, -6.4] }
 *   });
 *   const mats = new Array(flock.state.count);   // 或 Float32Array(count * 16)
 *   flock.matrices(mats);                        // 预分配每条鱼一个 Float32Array(16)
 *   // 场景里：st.dyn.push({ batch: { mesh: fishMesh() }, matrix: () => mats[i] });
 *   // 每帧：  flock.update(dt, t); flock.matrices(mats);
 *   // 也可以直接用内部矩阵（原地更新，引用稳定）：matrix: () => flock.state.mats[i]
 *
 *   // 校验（测试页）：A3DFlock.verify({ count, seed, bounds, camera, rect }, 60)
 *
 * 规则：对齐 / 聚集 / 分离 / 软边界 / 游荡，速度限制在 [minSpeed, maxSpeed]，
 * 转向有加速度上限，不会瞬移。鱼的模型 +X 是鱼头（见 worlds.js fishMesh()），
 * 所以矩阵按速度方向求 yaw / pitch，再叠一点侧倾 roll。
 * ============================================================ */
"use strict";

const A3DFlock = (() => {
  const TAU = Math.PI * 2;
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

  /* ---------------- 可复现随机 ---------------- */
  /** 和 props.js 一样的 LCG：同一个 seed 每次都摆出同一群鱼 */
  function rng(seed) {
    let s = seed || 1;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  }

  /* ============================================================
   *  默认参数
   *  bounds 取 ds_room 窗外的水域：墙在 z=-4.4，窗洞 x[-1.9,1.45] y[0.82,2.6]
   * ============================================================ */
  const DEFAULTS = {
    count: 44,
    seed: 7,
    size: 0.2,              // 鱼的模型缩放（fishMesh 体长约 1.2 单位 → 实长约 0.24m）
    sizeVar: 0.16,          // 每条鱼尺寸的随机浮动 ±16%
    neighborCount: 7,
    maxSpeed: 0.55,         // m/s
    minSpeed: 0.18,         // m/s
    separation: 0.28,       // m
    maxAccel: 1.5,          // m/s²：转向加速度上限，保证平滑
    wallMargin: 0.5,        // m：软边界带宽（会被盒子尺寸压缩）
    initMinDist: 0.3,       // m：出生时的最小间距（拒绝采样）
    bounds: { min: [-2.1, 0.95, -8.6], max: [1.7, 2.55, -6.4] },
    weights: {
      separation: 3.0,
      alignment: 1.15,
      cohesion: 0.95,
      wander: 0.55,
      contain: 3.4
    }
  };

  /** ds_room 的相机与窗玻璃区域（1600×900），验证默认值 */
  const TEST_CAMERA = { eye: [0.28, 1.58, 2.25], target: [0.04, 1.24, -4.4], fov: 40, W: 1600, H: 900 };
  const TEST_RECT = { x0: 470, y0: 210, x1: 1080, y1: 610 };

  /* ---------------- 参数整理 ---------------- */
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

  function readVec3(v, d) {
    return [num(v && v[0], d[0]), num(v && v[1], d[1]), num(v && v[2], d[2])];
  }

  function normBounds(b) {
    const src = b || DEFAULTS.bounds;
    const min = readVec3(src.min, DEFAULTS.bounds.min);
    const max = readVec3(src.max, DEFAULTS.bounds.max);
    for (let k = 0; k < 3; k++) {
      if (min[k] > max[k]) { const t = min[k]; min[k] = max[k]; max[k] = t; }
      if (max[k] - min[k] < 0.05) max[k] = min[k] + 0.05;
    }
    return { min, max };
  }

  function normWeights(w) {
    const s = w || {};
    return {
      separation: num(s.separation, DEFAULTS.weights.separation),
      alignment: num(s.alignment, DEFAULTS.weights.alignment),
      cohesion: num(s.cohesion, DEFAULTS.weights.cohesion),
      wander: num(s.wander, DEFAULTS.weights.wander),
      contain: num(s.contain, DEFAULTS.weights.contain)
    };
  }

  /* ============================================================
   *  矩阵写入
   *  与 A3D.M.trs 完全同公式（R = Rz * Ry * Rx，列主序），
   *  但写进已有数组，避免每条鱼每帧都分配一个 Float32Array。
   *  verify() 里会用 A3D.M.trs 做逐元素对拍。
   * ============================================================ */
  function writeTRS(m, o, x, y, z, rx, ry, rz, s) {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const m00 = cz * cy, m01 = cz * sy * sx - sz * cx, m02 = cz * sy * cx + sz * sx;
    const m10 = sz * cy, m11 = sz * sy * sx + cz * cx, m12 = sz * sy * cx - cz * sx;
    const m20 = -sy, m21 = cy * sx, m22 = cy * cx;
    m[o] = m00 * s; m[o + 1] = m10 * s; m[o + 2] = m20 * s; m[o + 3] = 0;
    m[o + 4] = m01 * s; m[o + 5] = m11 * s; m[o + 6] = m21 * s; m[o + 7] = 0;
    m[o + 8] = m02 * s; m[o + 9] = m12 * s; m[o + 10] = m22 * s; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
  }

  /* ============================================================
   *  create —— 建群
   * ============================================================ */
  function create(opts) {
    const o = opts || {};
    const count = clamp(Math.round(num(o.count, DEFAULTS.count)), 1, 512);
    const seed = Math.round(num(o.seed, DEFAULTS.seed));
    const bounds = normBounds(o.bounds);
    const size = Math.max(0.001, num(o.size, DEFAULTS.size));
    const sizeVar = clamp(num(o.sizeVar, DEFAULTS.sizeVar), 0, 0.9);
    const maxSpeed = Math.max(0.01, num(o.maxSpeed, DEFAULTS.maxSpeed));
    const minSpeed = clamp(num(o.minSpeed, DEFAULTS.minSpeed), 0, maxSpeed * 0.98);
    const separation = Math.max(0.02, num(o.separation, DEFAULTS.separation));
    const maxAccel = Math.max(0.05, num(o.maxAccel, DEFAULTS.maxAccel));
    const wallMargin = Math.max(0.05, num(o.wallMargin, DEFAULTS.wallMargin));
    const neighborCount = clamp(Math.round(num(o.neighborCount, DEFAULTS.neighborCount)),
      1, Math.max(1, count - 1));
    const weights = normWeights(o.weights);

    const minx = bounds.min[0], miny = bounds.min[1], minz = bounds.min[2];
    const maxx = bounds.max[0], maxy = bounds.max[1], maxz = bounds.max[2];
    const spanX = Math.max(0, maxx - minx);
    const spanY = Math.max(0, maxy - miny);
    const spanZ = Math.max(0, maxz - minz);

    const r = rng(seed);
    const n3 = count * 3;
    const positions = new Float32Array(n3);
    const velocities = new Float32Array(n3);
    const phase = new Float32Array(count);
    const scale = new Float32Array(count);
    const yaw = new Float32Array(count);
    const pitch = new Float32Array(count);
    const roll = new Float32Array(count);
    const lastYaw = new Float32Array(count);
    const mats = new Array(count);

    /* ---------- 初始位置：盒子里随机撒开，拒绝采样避免出生就重叠 ---------- */
    const inset = 0.02;
    const initMinDist = Math.min(
      Math.max(separation * 0.6, num(o.initMinDist, DEFAULTS.initMinDist)),
      0.4 * Math.min(spanX, spanY, spanZ)
    );
    const initMinDist2 = initMinDist * initMinDist;
    for (let i = 0; i < count; i++) {
      let bx = (minx + maxx) * 0.5, by = (miny + maxy) * 0.5, bz = (minz + maxz) * 0.5;
      let best = -1;
      for (let attempt = 0; attempt < 160; attempt++) {
        const x = minx + inset + r() * Math.max(0, spanX - inset * 2);
        const y = miny + inset + r() * Math.max(0, spanY - inset * 2);
        const z = minz + inset + r() * Math.max(0, spanZ - inset * 2);
        let nearest = Infinity;
        for (let j = 0; j < i; j++) {
          const dx = x - positions[j * 3];
          const dy = y - positions[j * 3 + 1];
          const dz = z - positions[j * 3 + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < nearest) nearest = d2;
        }
        if (nearest > best) { best = nearest; bx = x; by = y; bz = z; }
        if (nearest >= initMinDist2) break;
      }
      positions[i * 3] = bx;
      positions[i * 3 + 1] = by;
      positions[i * 3 + 2] = bz;

      /* ---------- 初始朝向：随机，偏水平；贴着盒壁出生时先朝里，别一出生就撞墙 ---------- */
      const u = r() * 2 - 1, a = r() * TAU, ring = Math.sqrt(1 - u * u);
      let dx = ring * Math.cos(a), dy = u * 0.45, dz = ring * Math.sin(a);
      const edge = Math.min(0.18, 0.25 * Math.min(spanX, spanY, spanZ));
      if (bx < minx + edge && dx < 0) dx = -dx;
      if (bx > maxx - edge && dx > 0) dx = -dx;
      if (by < miny + edge && dy < 0) dy = -dy;
      if (by > maxy - edge && dy > 0) dy = -dy;
      if (bz < minz + edge && dz < 0) dz = -dz;
      if (bz > maxz - edge && dz > 0) dz = -dz;
      const dl = len3(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const sp = minSpeed + r() * (maxSpeed - minSpeed);
      velocities[i * 3] = dx * sp;
      velocities[i * 3 + 1] = dy * sp;
      velocities[i * 3 + 2] = dz * sp;

      phase[i] = r() * TAU;
      scale[i] = size * (1 + (r() * 2 - 1) * sizeVar);
      yaw[i] = Math.atan2(-dz, Math.sqrt(dx * dx + dy * dy));
      pitch[i] = Math.atan2(dy, dx);
      lastYaw[i] = yaw[i];
      roll[i] = 0;
      mats[i] = new Float32Array(16);
    }

    /* ---------- 邻居缓存：每条鱼的最近 neighborCount 条（按距离升序） ---------- */
    const K = neighborCount;
    const nbIdx = new Int32Array(Math.max(1, K));
    const nbD2 = new Float32Array(Math.max(1, K));

    /** 选 i 的最近 K 条邻居，结果写进 nbIdx / nbD2（平方距离），返回数量 */
    function selectNeighbors(i) {
      if (K <= 0 || count < 2) return 0;
      const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
      let n = 0;
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const dx = px - positions[j * 3];
        const dy = py - positions[j * 3 + 1];
        const dz = pz - positions[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (n < K) {
          // 插入排序：保持 nbD2 升序
          let p = n++;
          while (p > 0 && nbD2[p - 1] > d2) {
            nbD2[p] = nbD2[p - 1];
            nbIdx[p] = nbIdx[p - 1];
            p--;
          }
          nbD2[p] = d2;
          nbIdx[p] = j;
        } else if (d2 < nbD2[K - 1]) {
          let p = K - 1;
          while (p > 0 && nbD2[p - 1] > d2) {
            nbD2[p] = nbD2[p - 1];
            nbIdx[p] = nbIdx[p - 1];
            p--;
          }
          nbD2[p] = d2;
          nbIdx[p] = j;
        }
      }
      return n;
    }

    const state = {
      count, seed, bounds,
      // positions / velocities 是 Float32Array(count * 3)，第 i 条鱼在 i*3 .. i*3+2
      positions, velocities, yaw, pitch, roll, scale, phase, mats,
      size, sizeVar, neighborCount: K, separation,
      maxSpeed, minSpeed, maxAccel, wallMargin, weights,
      time: 0,
      clampCount: 0            // 硬夹紧累计次数（调试用）
    };

    let time = 0;

    /* ============================================================
     *  update —— 推进一帧
     * ============================================================ */
    function update(dt, t) {
      dt = num(dt, 0);
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);              // 标签页切回来时别一步飞出去
      time = (typeof t === "number" && isFinite(t)) ? t : time + dt;
      state.time = time;

      const softX = Math.min(wallMargin, spanX * 0.34);
      const softY = Math.min(wallMargin, spanY * 0.34);
      const softZ = Math.min(wallMargin, spanZ * 0.34);
      const sep2 = separation * separation;
      const pad = 0.0015;                   // 硬夹紧时留一线，保证严格在盒内

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let px = positions[i3], py = positions[i3 + 1], pz = positions[i3 + 2];
        let vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];

        const n = selectNeighbors(i);
        let ax = 0, ay = 0, az = 0;

        /* ---------- 先算盒壁接近度（0 软边界外 → 1 贴壁） ---------- */
        let bx = 0, by = 0, bz = 0, wallProx = 0;
        if (softX > 1e-6) {
          const lo = (minx + softX - px) / softX;
          const hi = (px - (maxx - softX)) / softX;
          if (lo > 0) { const q = Math.min(1, lo); bx += q * q; if (q > wallProx) wallProx = q; }
          if (hi > 0) { const q = Math.min(1, hi); bx -= q * q; if (q > wallProx) wallProx = q; }
        }
        if (softY > 1e-6) {
          const lo = (miny + softY - py) / softY;
          const hi = (py - (maxy - softY)) / softY;
          if (lo > 0) { const q = Math.min(1, lo); by += q * q; if (q > wallProx) wallProx = q; }
          if (hi > 0) { const q = Math.min(1, hi); by -= q * q; if (q > wallProx) wallProx = q; }
        }
        if (softZ > 1e-6) {
          const lo = (minz + softZ - pz) / softZ;
          const hi = (pz - (maxz - softZ)) / softZ;
          if (lo > 0) { const q = Math.min(1, lo); bz += q * q; if (q > wallProx) wallProx = q; }
          if (hi > 0) { const q = Math.min(1, hi); bz -= q * q; if (q > wallProx) wallProx = q; }
        }
        // 贴近盒壁时，对齐 / 聚集力逐渐让位给边界转向；分离力也收一点，
        // 否则被同伴从内侧一挤，容易把鱼顶到硬夹紧上
        const flockK = 1 - 0.8 * wallProx;

        /* ---------- 1+2 对齐 & 聚集（只看最近的 K 条） ---------- */
        if (n > 0) {
          let alx = 0, aly = 0, alz = 0;      // 邻居平均速度
          let cohx = 0, cohy = 0, cohz = 0;   // 邻居平均位置
          for (let k = 0; k < n; k++) {
            const j3 = nbIdx[k] * 3;
            alx += velocities[j3];
            aly += velocities[j3 + 1];
            alz += velocities[j3 + 2];
            cohx += positions[j3];
            cohy += positions[j3 + 1];
            cohz += positions[j3 + 2];
          }
          const invN = 1 / n;
          alx *= invN; aly *= invN; alz *= invN;
          cohx = cohx * invN - px;
          cohy = cohy * invN - py;
          cohz = cohz * invN - pz;

          // 对齐：朝邻居平均速度方向转（目标速率取满速，最终由速度钳制兜底）
          const alLen = len3(alx, aly, alz);
          if (alLen > 1e-6) {
            const kAli = weights.alignment * flockK;
            ax += kAli * (alx / alLen * maxSpeed - vx);
            ay += kAli * (aly / alLen * maxSpeed - vy);
            az += kAli * (alz / alLen * maxSpeed - vz);
          }
          // 聚集：朝邻居平均位置靠
          const cohLen = len3(cohx, cohy, cohz);
          if (cohLen > 1e-6) {
            const kCoh = weights.cohesion * flockK;
            ax += kCoh * (cohx / cohLen * maxSpeed - vx);
            ay += kCoh * (cohy / cohLen * maxSpeed - vy);
            az += kCoh * (cohz / cohLen * maxSpeed - vz);
          }
        }

        /* ---------- 3 分离：太近就互相推开 ---------- */
        let sx = 0, sy = 0, sz = 0;
        for (let k = 0; k < n; k++) {
          const d2 = nbD2[k];
          if (d2 >= sep2) break;              // 邻居按距离升序，后面只会更远
          const j3 = nbIdx[k] * 3;
          const d = Math.sqrt(d2);
          const wgt = (1 - d / separation) / Math.max(d, 0.04);
          sx += (px - positions[j3]) * wgt;
          sy += (py - positions[j3 + 1]) * wgt;
          sz += (pz - positions[j3 + 2]) * wgt;
        }
        const sepLen = len3(sx, sy, sz);
        if (sepLen > 1e-6) {
          // 贴壁时分离力也收一点：否则被同伴从内侧一挤，会把鱼顶出盒子
          const f = weights.separation * (1 - 0.7 * wallProx) * Math.min(sepLen, 1.5) / sepLen;
          ax += sx * f; ay += sy * f; az += sz * f;
        }

        /* ---------- 4 边界：越靠近盒壁推力越强（q 已在上面算好） ---------- */
        if (bx || by || bz) {
          ax += weights.contain * bx * maxSpeed;
          ay += weights.contain * by * maxSpeed;
          az += weights.contain * bz * maxSpeed;
        }

        /* ---------- 5 游荡：轻微上下浮动 + 很小的随机扰动 ---------- */
        const ph = phase[i];
        ax += weights.wander * (Math.sin(time * 0.63 + ph * 1.7) * 0.22 + (r() - 0.5) * 0.06);
        ay += weights.wander * Math.sin(time * 0.91 + ph) * 0.34;
        az += weights.wander * Math.cos(time * 0.57 + ph * 1.3) * 0.22;

        /* ---------- 积分：加速度上限 → 速度范围 → 位置 → 硬夹紧 ---------- */
        const acc = len3(ax, ay, az);
        if (acc > maxAccel) {
          const f = maxAccel / acc;
          ax *= f; ay *= f; az *= f;
        }
        vx += ax * dt; vy += ay * dt; vz += az * dt;

        let sp = len3(vx, vy, vz);
        if (sp > maxSpeed) {
          const f = maxSpeed / sp;
          vx *= f; vy *= f; vz *= f;
        } else if (sp < minSpeed) {
          if (sp > 1e-6) {
            const f = minSpeed / sp;
            vx *= f; vy *= f; vz *= f;
          } else {
            // 速度被削没了：朝盒子中心出发，避免原地卡死
            let dx = (minx + maxx) * 0.5 - px;
            let dy = (miny + maxy) * 0.5 - py;
            let dz = (minz + maxz) * 0.5 - pz;
            const l = len3(dx, dy, dz) || 1;
            vx = dx / l * minSpeed; vy = dy / l * minSpeed; vz = dz / l * minSpeed;
          }
        }

        px += vx * dt; py += vy * dt; pz += vz * dt;

        let hit = false;
        if (px < minx + pad) {
          px = minx + pad; if (vx < 0) vx = 0; hit = true;
        } else if (px > maxx - pad) {
          px = maxx - pad; if (vx > 0) vx = 0; hit = true;
        }
        if (py < miny + pad) {
          py = miny + pad; if (vy < 0) vy = 0; hit = true;
        } else if (py > maxy - pad) {
          py = maxy - pad; if (vy > 0) vy = 0; hit = true;
        }
        if (pz < minz + pad) {
          pz = minz + pad; if (vz < 0) vz = 0; hit = true;
        } else if (pz > maxz - pad) {
          pz = maxz - pad; if (vz > 0) vz = 0; hit = true;
        }
        if (hit) state.clampCount++;

        // 夹紧可能把速度削到下限以下：沿剩下的方向补回（完全停下就朝盒心）
        sp = len3(vx, vy, vz);
        if (sp < minSpeed) {
          if (sp > 1e-6) {
            const f = minSpeed / sp;
            vx *= f; vy *= f; vz *= f;
          } else {
            let dx = (minx + maxx) * 0.5 - px;
            let dy = (miny + maxy) * 0.5 - py;
            let dz = (minz + maxz) * 0.5 - pz;
            const l = len3(dx, dy, dz) || 1;
            vx = dx / l * minSpeed; vy = dy / l * minSpeed; vz = dz / l * minSpeed;
          }
        } else if (sp > maxSpeed) {
          const f = maxSpeed / sp;
          vx *= f; vy *= f; vz *= f;
        }

        positions[i3] = px; positions[i3 + 1] = py; positions[i3 + 2] = pz;
        velocities[i3] = vx; velocities[i3 + 1] = vy; velocities[i3 + 2] = vz;
      }

      /* ---------- 朝向与侧倾：按水平转向速率压 roll，再低通 ---------- */
      const rollK = 1 - Math.exp(-dt * 4);
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];
        const yw = Math.atan2(-vz, Math.sqrt(vx * vx + vy * vy));
        let dyaw = yw - lastYaw[i];
        if (dyaw > Math.PI) dyaw -= TAU;
        else if (dyaw < -Math.PI) dyaw += TAU;
        lastYaw[i] = yw;
        yaw[i] = yw;
        let target = -dyaw / dt * 0.32 + Math.sin(time * 0.8 + phase[i] * 1.4) * 0.07;
        target = clamp(target, -0.6, 0.6);
        roll[i] += (target - roll[i]) * rollK;
      }
    }

    /* ============================================================
     *  matrices —— 写入每条鱼的模型矩阵（列主序）
     *  out 省略：返回内部复用的 state.mats
     *  out 是 Float32Array(count*16)：写进连续池
     *  out 是 Array：逐条填 Float32Array(16)
     * ============================================================ */
    function matrices(out) {
      const pool = (out instanceof Float32Array && out.length >= count * 16) ? out : null;
      const arr = (!pool && Array.isArray(out)) ? out : null;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];
        const yw = Math.atan2(-vz, Math.sqrt(vx * vx + vy * vy));
        const pt = Math.atan2(vy, vx);
        yaw[i] = yw;
        pitch[i] = pt;
        const m = mats[i];
        writeTRS(m, 0, positions[i3], positions[i3 + 1], positions[i3 + 2],
          roll[i], yw, pt, scale[i]);
        if (pool) pool.set(m, i * 16);
        else if (arr) {
          let t = arr[i];
          if (!(t instanceof Float32Array) || t.length !== 16) {
            t = new Float32Array(16);
            arr[i] = t;
          }
          t.set(m);
        }
      }
      return pool || arr || mats;
    }

    /** 更简单的遍历：回调拿到内部复用的矩阵（别直接长期保存，要存就 copy） */
    function forEach(cb) {
      matrices();
      for (let i = 0; i < count; i++) cb(mats[i], i);
      return count;
    }

    /* ============================================================
     *  checkBounds —— 当前状态体检
     * ============================================================ */
    function checkBounds() {
      const EPS = 1e-3;
      let out = 0, sumSpeed = 0;
      let minSpeedNow = Infinity, maxSpeedNow = 0;
      const minPos = [Infinity, Infinity, Infinity];
      const maxPos = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];
        if (x < minx - EPS || x > maxx + EPS ||
            y < miny - EPS || y > maxy + EPS ||
            z < minz - EPS || z > maxz + EPS) out++;
        if (x < minPos[0]) minPos[0] = x;
        if (y < minPos[1]) minPos[1] = y;
        if (z < minPos[2]) minPos[2] = z;
        if (x > maxPos[0]) maxPos[0] = x;
        if (y > maxPos[1]) maxPos[1] = y;
        if (z > maxPos[2]) maxPos[2] = z;
        const sp = len3(velocities[i3], velocities[i3 + 1], velocities[i3 + 2]);
        sumSpeed += sp;
        if (sp < minSpeedNow) minSpeedNow = sp;
        if (sp > maxSpeedNow) maxSpeedNow = sp;
      }

      let minNb = Infinity, sumNb = 0, nbPairs = 0;
      for (let i = 0; i < count; i++) {
        let nearest = Infinity;
        const i3 = i * 3;
        for (let j = 0; j < count; j++) {
          if (j === i) continue;
          const j3 = j * 3;
          const dx = positions[i3] - positions[j3];
          const dy = positions[i3 + 1] - positions[j3 + 1];
          const dz = positions[i3 + 2] - positions[j3 + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < nearest) nearest = d2;
          if (d2 < minNb) minNb = d2;
        }
        if (nearest < Infinity) { sumNb += Math.sqrt(nearest); nbPairs++; }
      }

      return {
        inside: out === 0,
        out,
        minPos, maxPos,
        maxSpeed: maxSpeedNow,
        minSpeed: minSpeedNow,
        meanSpeed: count ? sumSpeed / count : 0,
        minNeighborDist: minNb < Infinity ? Math.sqrt(minNb) : null,
        meanNeighborDist: nbPairs ? sumNb / nbPairs : null
      };
    }

    /* ============================================================
     *  projectStats —— 用 A3D.M 的 lookAt / perspective 投影到屏幕
     *  统计落在 rect 外（含相机背后 / 视锥外）的鱼
     * ============================================================ */
    function projectStats(rect, camera) {
      const cam = camera || {};
      const eye = cam.eye || [0, 0, 0];
      const target = cam.target || [eye[0], eye[1], eye[2] - 1];
      const fov = (cam.fov === undefined ? 40 : cam.fov) * D2R;
      const W = cam.W || 1600, H = cam.H || 900;
      const near = cam.near === undefined ? 0.05 : cam.near;
      const far = cam.far === undefined ? 120 : cam.far;
      const proj = A3D.M.perspective(fov, W / H, near, far);
      const view = A3D.M.lookAt(eye, target, cam.up || [0, 1, 0]);
      const vp = A3D.M.mul(proj, view);
      const r = rect || { x0: 0, y0: 0, x1: W, y1: H };

      let out = 0, behind = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];
        const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
        const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
        const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
        const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        if (!(cw > near)) {                 // 在相机背后 / 太近
          behind++;
          out++;
          continue;
        }
        const ndcX = cx / cw, ndcY = cy / cw, ndcZ = cz / cw;
        const sxp = (ndcX * 0.5 + 0.5) * W;
        const syp = (0.5 - ndcY * 0.5) * H;
        if (sxp < minX) minX = sxp;
        if (sxp > maxX) maxX = sxp;
        if (syp < minY) minY = syp;
        if (syp > maxY) maxY = syp;
        const inRect = sxp >= r.x0 && sxp <= r.x1 && syp >= r.y0 && syp <= r.y1;
        const inNdc = ndcZ >= -1 && ndcZ <= 1;
        if (!inRect || !inNdc) out++;
      }

      return {
        total: count,
        out,
        inside: count - out,
        ratio: count ? out / count : 0,
        behind,
        rect: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 },
        screen: { W, H, minX, maxX, minY, maxY }
      };
    }

    return {
      state,
      update,
      matrices,
      forEach,
      checkBounds,
      projectStats,
      bounds
    };
  }

  /* ============================================================
   *  verify —— 固定 seed 跑模拟，汇总各项指标（测试页用）
   * ============================================================ */
  function verify(opts, seconds) {
    const o = opts || {};
    const dt = clamp(num(o.dt, 1 / 60), 1 / 240, 1 / 30);
    const secs = Math.max(1, num(seconds, 60));
    const frames = Math.max(1, Math.round(secs / dt));
    const camera = o.camera || TEST_CAMERA;
    const rect = o.rect || TEST_RECT;
    const sim = create(o);
    const st = sim.state;
    const count = st.count;

    let outFrames = 0, outFishSamples = 0, outFishMax = 0, outFishMaxAt = 0;
    let speedBadFrames = 0, speedMinSeen = Infinity, speedMaxSeen = 0;
    let minNb = Infinity, meanNbAcc = 0, meanNbFrames = 0, meanSpeedAcc = 0;
    let projOutFrames = 0, projOutSamples = 0, projOutMax = 0;
    let projMinX = Infinity, projMaxX = -Infinity, projMinY = Infinity, projMaxY = -Infinity;
    let matNaN = 0, axisErr = 0, trsErr = 0;
    const obsMin = [Infinity, Infinity, Infinity];
    const obsMax = [-Infinity, -Infinity, -Infinity];

    for (let f = 0; f < frames; f++) {
      sim.update(dt, f * dt);
      const b = sim.checkBounds();

      if (b.out > 0) {
        outFrames++;
        outFishSamples += b.out;
        if (b.out > outFishMax) { outFishMax = b.out; outFishMaxAt = f; }
      }
      if (b.minSpeed < st.minSpeed - 1e-4 || b.maxSpeed > st.maxSpeed + 1e-4) speedBadFrames++;
      if (b.minSpeed < speedMinSeen) speedMinSeen = b.minSpeed;
      if (b.maxSpeed > speedMaxSeen) speedMaxSeen = b.maxSpeed;
      if (b.minNeighborDist !== null && b.minNeighborDist < minNb) minNb = b.minNeighborDist;
      if (b.meanNeighborDist !== null) { meanNbAcc += b.meanNeighborDist; meanNbFrames++; }
      meanSpeedAcc += b.meanSpeed;
      for (let k = 0; k < 3; k++) {
        if (b.minPos[k] < obsMin[k]) obsMin[k] = b.minPos[k];
        if (b.maxPos[k] > obsMax[k]) obsMax[k] = b.maxPos[k];
      }

      const ps = sim.projectStats(rect, camera);
      if (ps.out > 0) {
        projOutFrames++;
        projOutSamples += ps.out;
        if (ps.out > projOutMax) projOutMax = ps.out;
      }
      if (ps.screen.minX < projMinX) projMinX = ps.screen.minX;
      if (ps.screen.maxX > projMaxX) projMaxX = ps.screen.maxX;
      if (ps.screen.minY < projMinY) projMinY = ps.screen.minY;
      if (ps.screen.maxY > projMaxY) projMaxY = ps.screen.maxY;

      sim.matrices();
      for (let i = 0; i < count; i++) {
        const m = st.mats[i];
        let bad = false;
        for (let k = 0; k < 16; k++) {
          if (!isFinite(m[k])) { bad = true; break; }
        }
        if (bad) matNaN++;
        // 模型 +X 轴（第一列）应与速度方向一致
        const i3 = i * 3;
        const vx = st.velocities[i3], vy = st.velocities[i3 + 1], vz = st.velocities[i3 + 2];
        const vl = len3(vx, vy, vz) || 1;
        const ml = len3(m[0], m[1], m[2]) || 1;
        const dot = (m[0] * vx + m[1] * vy + m[2] * vz) / (ml * vl);
        if (1 - dot > axisErr) axisErr = 1 - dot;
        // 与 A3D.M.trs 对拍
        const ref = A3D.M.trs(st.positions[i3], st.positions[i3 + 1], st.positions[i3 + 2],
          st.roll[i], st.yaw[i], st.pitch[i], st.scale[i], st.scale[i], st.scale[i]);
        for (let k = 0; k < 16; k++) {
          const e = Math.abs(ref[k] - m[k]);
          if (e > trsErr) trsErr = e;
        }
      }
    }

    /* 用 builder 走一遍矩阵，确认没有 NaN 传进几何体 */
    let builderNaN = null;
    if (typeof A3D !== "undefined" && A3D.Builder) {
      const bd = new A3D.Builder();
      const step = Math.max(1, Math.floor(count / 8));
      for (let i = 0; i < count; i += step) {
        bd.box(st.mats[i], 0.02, 0.02, 0.02, [1, 1, 1], 1);
      }
      builderNaN = 0;
      for (let k = 0; k < bd.d.length; k++) {
        if (!isFinite(bd.d[k])) builderNaN++;
      }
    }

    const totalSamples = frames * count;
    const out = {
      frames,
      fishFrames: totalSamples,
      hardClampSamples: st.clampCount,
      config: {
        count, seed: st.seed, bounds: st.bounds,
        size: st.size, neighborCount: st.neighborCount,
        minSpeed: st.minSpeed, maxSpeed: st.maxSpeed,
        separation: st.separation, weights: st.weights
      },
      bounds: {
        frames: outFrames,
        fishSamples: outFishSamples,
        maxFish: outFishMax,
        maxFishFrame: outFishMaxAt,
        ratio: totalSamples ? outFishSamples / totalSamples : 0
      },
      speed: {
        minSeen: speedMinSeen,
        maxSeen: speedMaxSeen,
        badFrames: speedBadFrames,
        mean: meanSpeedAcc / frames
      },
      neighbor: {
        minDist: minNb < Infinity ? minNb : null,
        meanDist: meanNbFrames ? meanNbAcc / meanNbFrames : null,
        threshold: 0.08
      },
      projection: {
        rect: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
        camera: {
          eye: camera.eye, target: camera.target,
          fov: camera.fov === undefined ? 40 : camera.fov,
          W: camera.W || 1600, H: camera.H || 900
        },
        outFrames: projOutFrames,
        outSamples: projOutSamples,
        maxFish: projOutMax,
        ratio: totalSamples ? projOutSamples / totalSamples : 0,
        screen: { minX: projMinX, maxX: projMaxX, minY: projMinY, maxY: projMaxY }
      },
      matrices: {
        nan: matNaN,
        axisErr,
        trsErr,
        builderNaN
      },
      extent: { min: obsMin, max: obsMax },
      seconds: frames * dt,
      dt
    };

    out.pass = {
      bounds: out.bounds.frames === 0,
      speed: out.speed.badFrames === 0,
      neighbor: out.neighbor.minDist === null || out.neighbor.minDist >= 0.08,
      projection: out.projection.outFrames === 0,
      matrices: matNaN === 0 && axisErr < 1e-5 && trsErr < 1e-5 &&
        (builderNaN === null || builderNaN === 0)
    };
    out.ok = out.pass.bounds && out.pass.speed && out.pass.neighbor &&
      out.pass.projection && out.pass.matrices;
    return out;
  }

  return { create, verify };
})();

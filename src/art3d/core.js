/* ============================================================
 * Escape A÷ · src/art3d/core.js —— 3D 背景：渲染核心
 *
 * 零依赖、零构建：直接写 WebGL2，几何体与贴图全部程序化生成，
 * 不加载任何外部模型 / 图片，file:// 双击也能跑。
 *
 * 分层：
 *   A3D      数学、着色器、几何体构造、渲染循环（本文件）
 *   A3DTex   程序化贴图（art3d/textures.js）
 *   A3DProps 可复用的道具（art3d/props.js）
 *   A3DWorld 各个场景（art3d/worlds.js）
 *
 * 坐标：右手系，Y 向上，1 单位 = 1 米。相机默认看向 -Z。
 * ============================================================ */
"use strict";

const A3D = (() => {
  const W = 1600, H = 900;

  /* ============================================================
   *  向量 / 矩阵
   * ============================================================ */
  const M = {
    ident() {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    },
    /** 列主序：out = a * b（先 b 后 a） */
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          o[c * 4 + r] =
            a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
            a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    },
    lookAt(eye, center, up) {
      let fx = center[0] - eye[0], fy = center[1] - eye[1], fz = center[2] - eye[2];
      let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
      let sx = fy * up[2] - fz * up[1], sy = fz * up[0] - fx * up[2], sz = fx * up[1] - fy * up[0];
      l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
      const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
      return new Float32Array([
        sx, ux, -fx, 0,
        sy, uy, -fy, 0,
        sz, uz, -fz, 0,
        -(sx * eye[0] + sy * eye[1] + sz * eye[2]),
        -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
        (fx * eye[0] + fy * eye[1] + fz * eye[2]), 1
      ]);
    },
    /** 平移 + 欧拉旋转（先 X 后 Y 后 Z）+ 缩放 */
    trs(x, y, z, rx, ry, rz, sx, sy, sz) {
      rx = rx || 0; ry = ry || 0; rz = rz || 0;
      sx = sx === undefined ? 1 : sx; sy = sy === undefined ? 1 : sy; sz = sz === undefined ? 1 : sz;
      const cx = Math.cos(rx), sxx = Math.sin(rx);
      const cy = Math.cos(ry), syy = Math.sin(ry);
      const cz = Math.cos(rz), szz = Math.sin(rz);
      // R = Rz * Ry * Rx
      const m00 = cz * cy, m01 = cz * syy * sxx - szz * cx, m02 = cz * syy * cx + szz * sxx;
      const m10 = szz * cy, m11 = szz * syy * sxx + cz * cx, m12 = szz * syy * cx - cz * sxx;
      const m20 = -syy, m21 = cy * sxx, m22 = cy * cx;
      return new Float32Array([
        m00 * sx, m10 * sx, m20 * sx, 0,
        m01 * sy, m11 * sy, m21 * sy, 0,
        m02 * sz, m12 * sz, m22 * sz, 0,
        x, y, z, 1
      ]);
    },
    pos(x, y, z) { return M.trs(x, y, z); },
    /** 3x3 逆转置（法线矩阵），返回长度 9 的数组 */
    normalMat(m) {
      const a = m[0], b = m[1], c = m[2];
      const d = m[4], e = m[5], f = m[6];
      const g = m[8], h = m[9], i = m[10];
      const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
      const det = a * A + b * B + c * C;
      const s = det ? 1 / det : 0;
      // inverse = adj / det；再转置
      return new Float32Array([
        A * s, B * s, C * s,
        -(b * i - c * h) * s, (a * i - c * g) * s, -(a * h - b * g) * s,
        (b * f - c * e) * s, -(a * f - c * d) * s, (a * e - b * d) * s
      ]);
    },
    /** 变换一个点 */
    xf(m, p) {
      const x = p[0], y = p[1], z = p[2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
      return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
      ];
    },
    /** 只取旋转 / 缩放部分变换方向 */
    dir(m, p) {
      return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2]
      ];
    }
  };

  function norm3(p) {
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    return [p[0] / l, p[1] / l, p[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const TAU = Math.PI * 2;
  const D2R = Math.PI / 180;

  /* ============================================================
   *  几何体构造
   *  顶点格式（lit / unlit 共用）：pos3 nor3 uv2 col3 sway1 = 12 float
   * ============================================================ */
  const STRIDE = 12;

  function Builder() {
    this.d = [];
  }
  Builder.prototype = {
    get count() { return this.d.length / STRIDE; },
    /** 把最近 4 个顶点展开成两个三角形（0,1,2）+（0,2,3），无索引缓冲。
     *  展开出来的 6 个顶点要搬回原来的 4 个位置再截断——否则多出来的
     *  4 个原始顶点会被当成三角形画出来（整个房间的“半边脸”就是这么来的）。 */
    _pushQuad(st) {
      const d = this.d, S = STRIDE;
      const a = st * S, b = (st + 1) * S, c = (st + 2) * S, e = (st + 3) * S;
      for (let k = 0; k < S; k++) d.push(d[a + k]);
      for (let k = 0; k < S; k++) d.push(d[b + k]);
      for (let k = 0; k < S; k++) d.push(d[c + k]);
      for (let k = 0; k < S; k++) d.push(d[a + k]);
      for (let k = 0; k < S; k++) d.push(d[c + k]);
      for (let k = 0; k < S; k++) d.push(d[e + k]);
      const end = d.length;
      d.copyWithin(a, end - 6 * S, end);
      d.length = a + 6 * S;
    },
    _v(d, m, nm, x, y, z, nx, ny, nz, u, v, col, sway) {
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      let tx = nm[0] * nx + nm[3] * ny + nm[6] * nz;
      let ty = nm[1] * nx + nm[4] * ny + nm[7] * nz;
      let tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
      const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      d.push(wx, wy, wz, tx, ty, tz, u, v, col[0], col[1], col[2],
             typeof sway === "function" ? sway(wx, wy, wz) : (sway || 0));
    },
    /** 三角形（自动从三点求法线） */
    tri(m, a, b, c, uv, col, sway) {
      const nm = M.normalMat(m);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const P = [a, b, c];
      for (let i = 0; i < 3; i++) {
        const p = P[i], t = uv ? uv[i] : [0, 0];
        this._v(this.d, m, nm, p[0], p[1], p[2], nx, ny, nz, t[0], t[1], col, sway);
      }
      return this;
    },
    /** 局部 XY 平面上的四边形，中心在原点，朝 +Z；uv 为 [u0,v0,u1,v1] */
    quad(m, w, h, col, uvRect, sway) {
      const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
      const uv = uvRect || [0, 0, 1, 1];
      const p = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
      const t = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
      const nm = M.normalMat(m);
      for (let i = 0; i < 4; i++)
        this._v(this.d, m, nm, p[i][0], p[i][1], p[i][2], 0, 0, 1, t[i][0], t[i][1], col, sway);
      const start = this.count - 4;
      this._pushQuad(start);
      return this;
    },
    /** 轴对齐盒子（尺寸 sx,sy,sz，中心在原点），六面独立 UV */
    box(m, sx, sy, sz, col, uvScale, sway, faceCol) {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2;
      const us = uvScale === undefined ? 1 : uvScale;
      const faces = [
        // [法线, 四角（逆时针，从外侧看）, u 方向宽, v 方向高]
        [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], sx, sy],
        [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], sx, sy],
        [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], sz, sy],
        [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], sz, sy],
        [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], sx, sz],
        [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], sx, sz]
      ];
      const nm = M.normalMat(m);
      for (let f = 0; f < faces.length; f++) {
        const [n, q, fw, fh] = faces[f];
        const c = faceCol && faceCol[f] ? faceCol[f] : col;
        const u0 = 0, v0 = 0, u1 = fw * us, v1 = fh * us;
        const tt = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        for (let i = 0; i < 4; i++)
          this._v(this.d, m, nm, q[i][0], q[i][1], q[i][2], n[0], n[1], n[2], tt[i][0], tt[i][1], c, sway);
        const st = this.count - 4;
        this._pushQuad(st);
      }
      return this;
    },
    /** 圆柱 / 圆台：轴 Y，底面在 y=0，向上 h；r0 底半径，r1 顶半径 */
    cyl(m, r0, r1, h, seg, col, cap, sway) {
      seg = Math.max(3, seg | 0);
      const nm = M.normalMat(m);
      const slope = (r0 - r1) / h;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const n0 = norm3([c0, slope, s0]), n1 = norm3([c1, slope, s1]);
        const p = [
          [c0 * r0, 0, s0 * r0], [c1 * r0, 0, s1 * r0],
          [c1 * r1, h, s1 * r1], [c0 * r1, h, s0 * r1]
        ];
        const nn = [n0, n1, n1, n0];
        const u0 = i / seg, u1 = (i + 1) / seg;
        const tt = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]];
        for (let k = 0; k < 4; k++)
          this._v(this.d, m, nm, p[k][0], p[k][1], p[k][2], nn[k][0], nn[k][1], nn[k][2], tt[k][0], tt[k][1], col, sway);
        const st = this.count - 4;
        this._pushQuad(st);
      }
      if (cap !== false) {
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
          // 顶盖
          if (r1 > 0.0001) {
            const pts = [[0, h, 0], [Math.cos(a0) * r1, h, Math.sin(a0) * r1], [Math.cos(a1) * r1, h, Math.sin(a1) * r1]];
            this._v(this.d, m, nm, pts[0][0], pts[0][1], pts[0][2], 0, 1, 0, 0.5, 0.5, col, sway);
            this._v(this.d, m, nm, pts[1][0], pts[1][1], pts[1][2], 0, 1, 0, 0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5, col, sway);
            this._v(this.d, m, nm, pts[2][0], pts[2][1], pts[2][2], 0, 1, 0, 0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5, col, sway);
          }
          // 底盖
          if (r0 > 0.0001) {
            this._v(this.d, m, nm, 0, 0, 0, 0, -1, 0, 0.5, 0.5, col, sway);
            this._v(this.d, m, nm, Math.cos(a1) * r0, 0, Math.sin(a1) * r0, 0, -1, 0, 0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5, col, sway);
            this._v(this.d, m, nm, Math.cos(a0) * r0, 0, Math.sin(a0) * r0, 0, -1, 0, 0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5, col, sway);
          }
        }
      }
      return this;
    },
    sphere(m, r, segU, segV, col, sway) {
      segU = Math.max(4, segU | 0); segV = Math.max(3, segV | 0);
      const P = (u, v) => {
        const th = u * TAU, ph = v * Math.PI;
        return [Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, Math.sin(ph) * Math.sin(th) * r];
      };
      for (let j = 0; j < segV; j++) {
        for (let i = 0; i < segU; i++) {
          const u0 = i / segU, u1 = (i + 1) / segU, v0 = j / segV, v1 = (j + 1) / segV;
          const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
          const quads = [[a, b, c, d]];
          if (j === 0) quads[0] = [a, a, c, d];
          if (j === segV - 1) quads[0] = [a, b, c, c];
          const q = quads[0];
          const uvq = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
          const nm = M.normalMat(m);
          for (let k = 0; k < 4; k++) {
            const p = q[k], n = norm3(p);
            this._v(this.d, m, nm, p[0], p[1], p[2], n[0], n[1], n[2], uvq[k][0], uvq[k][1], col, sway);
          }
          const st = this.count - 4;
          this._pushQuad(st);
        }
      }
      return this;
    },
    torus(m, R, r, segU, segV, col, sway) {
      segU = Math.max(6, segU | 0); segV = Math.max(4, segV | 0);
      const P = (u, v) => {
        const th = u * TAU, ph = v * TAU;
        const cx = Math.cos(th) * (R + Math.cos(ph) * r);
        const cy = Math.sin(ph) * r;
        const cz = Math.sin(th) * (R + Math.cos(ph) * r);
        return { p: [cx, cy, cz], n: norm3([Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)]) };
      };
      const nm = M.normalMat(m);
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const A = P(i / segU, j / segV), B = P((i + 1) / segU, j / segV);
          const C = P((i + 1) / segU, (j + 1) / segV), D = P(i / segU, (j + 1) / segV);
          const q = [A, B, C, D];
          const uvq = [[i / segU, j / segV], [(i + 1) / segU, j / segV], [(i + 1) / segU, (j + 1) / segV], [i / segU, (j + 1) / segV]];
          for (let k = 0; k < 4; k++)
            this._v(this.d, m, nm, q[k].p[0], q[k].p[1], q[k].p[2], q[k].n[0], q[k].n[1], q[k].n[2], uvq[k][0], uvq[k][1], col, sway);
          const st = this.count - 4;
          this._pushQuad(st);
        }
      }
      return this;
    },
    /** 沿折线的管子（电缆、藤蔓、管道） */
    tube(m, pts, radius, sides, col, sway) {
      sides = Math.max(3, sides | 0);
      if (pts.length < 2) return this;
      const nm = M.normalMat(m);
      const rings = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const t = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
        let up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const s = norm3(cross(t, up)), u = norm3(cross(s, t));
        const ring = [];
        const r = typeof radius === "function" ? radius(i / (pts.length - 1)) : radius;
        for (let k = 0; k < sides; k++) {
          const an = (k / sides) * TAU;
          const nx = s[0] * Math.cos(an) + u[0] * Math.sin(an);
          const ny = s[1] * Math.cos(an) + u[1] * Math.sin(an);
          const nz = s[2] * Math.cos(an) + u[2] * Math.sin(an);
          ring.push({ p: [p[0] + nx * r, p[1] + ny * r, p[2] + nz * r], n: [nx, ny, nz] });
        }
        rings.push(ring);
      }
      for (let i = 0; i < rings.length - 1; i++) {
        for (let k = 0; k < sides; k++) {
          const k2 = (k + 1) % sides;
          const A = rings[i][k], B = rings[i][k2], C = rings[i + 1][k2], D = rings[i + 1][k];
          const q = [A, B, C, D];
          const uvq = [[k / sides, i], [(k + 1) / sides, i], [(k + 1) / sides, i + 1], [k / sides, i + 1]];
          for (let z = 0; z < 4; z++)
            this._v(this.d, m, nm, q[z].p[0], q[z].p[1], q[z].p[2], q[z].n[0], q[z].n[1], q[z].n[2], uvq[z][0], uvq[z][1], col, sway);
          const st = this.count - 4;
          this._pushQuad(st);
        }
      }
      return this;
    },
    /** 细分的地面 / 墙面，每格有轻微明暗差，避免大平面发假 */
    grid(m, w, d, nx, nz, col, uvScale, jitter, sway) {
      nx = Math.max(1, nx | 0); nz = Math.max(1, nz | 0);
      const nm = M.normalMat(m);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const x0 = -w / 2 + (i / nx) * w, x1 = -w / 2 + ((i + 1) / nx) * w;
          const z0 = -d / 2 + (j / nz) * d, z1 = -d / 2 + ((j + 1) / nz) * d;
          let k = 1;
          if (jitter) {
            const n = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
            k = 1 + (n - Math.floor(n) - 0.5) * jitter;
          }
          const c = [col[0] * k, col[1] * k, col[2] * k];
          const q = [[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]];
          const uvq = [[x0 * uvScale, z1 * uvScale], [x1 * uvScale, z1 * uvScale], [x1 * uvScale, z0 * uvScale], [x0 * uvScale, z0 * uvScale]];
          for (let z = 0; z < 4; z++)
            this._v(this.d, m, nm, q[z][0], q[z][1], q[z][2], 0, 1, 0, uvq[z][0], uvq[z][1], c, sway);
          const st = this.count - 4;
          this._pushQuad(st);
        }
      }
      return this;
    }
  };

  /* ============================================================
   *  WebGL 上下文
   * ============================================================ */
  let gcv = null, gl = null, ready = false, failReason = "";
  let anisoExt = null, maxAniso = 1;
  let skyProg, litProg, seaProg, ptProg, glowProg, shadowProg;
  let shadowFbo = null, dummyShadow = null;
  let res = { w: W, h: H };

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error("[A3D] shader 编译失败:", log, "\n", src.split("\n").map((l, i) => (i + 1) + ": " + l).join("\n"));
      throw new Error("shader: " + log);
    }
    return s;
  }
  function program(vs, fs, attrs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    (attrs || []).forEach((n, i) => gl.bindAttribLocation(p, i, n));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      console.error("[A3D] program 链接失败:", log);
      throw new Error("link: " + log);
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  /* ---------------- 着色器 ---------------- */
  const SKY_VS = `#version 300 es
  out vec2 vUv;
  void main(){
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p * 0.5;
    gl_Position = vec4(p * 2.0 - 1.0, 0.999, 1.0);
  }`;

  const SKY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 o;
  uniform vec3 uTop, uBot, uGlow, uSun;
  uniform float uTime, uMode, uHorizon, uGrain;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    float y = uv.y;
    vec3 col = mix(uBot, uTop, smoothstep(uHorizon - 0.55, uHorizon + 0.55, y));
    // 光晕
    float d = distance(vec2(uv.x, y * 1.35), vec2(uSun.x, uSun.y));
    col += uGlow * exp(-d * 3.2) * 0.9;
    col += uGlow * exp(-d * 1.1) * 0.25;
    if (uMode > 0.5 && uMode < 1.5) {
      // 水下：上方的光束与透下来的亮斑
      float shaft = 0.0;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float xx = uv.x + sin(uTime * 0.05 + fi * 2.1) * 0.03;
        float band = abs(fract(xx * (2.0 + fi) + fi * 0.37 + uTime * 0.01) - 0.5);
        shaft += smoothstep(0.48, 0.92, 1.0 - band) * (0.5 + 0.5 * sin(uTime * 0.4 + fi));
      }
      col += uGlow * shaft * 0.045 * smoothstep(1.0, 0.1, y);
      col *= 0.92 + 0.08 * sin(uv.y * 30.0 + uTime * 0.6 + sin(uv.x * 9.0));
    } else if (uMode > 1.5 && uMode < 2.5) {
      // 夜空：星点 + 银河带
      vec2 g = uv * vec2(420.0, 230.0);
      vec2 id = floor(g);
      float h = hash(id);
      if (h > 0.982 && y > uHorizon + 0.05) {
        float tw = 0.55 + 0.45 * sin(uTime * (0.7 + h * 2.0) + h * 40.0);
        col += vec3(0.78, 0.86, 1.0) * tw * (h - 0.982) * 26.0;
      }
      float band = exp(-pow((y - 0.62 - 0.06 * sin(uv.x * 3.0)) * 6.5, 2.0));
      col += vec3(0.16, 0.18, 0.30) * band * 0.5;
    }
    // 轻微抖动，压色带
    col += (hash(uv * 1200.0 + uTime) - 0.5) * uGrain;
    o = vec4(col, 1.0);
  }`;

  const LIT_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNor;
  layout(location=2) in vec2 aUV;
  layout(location=3) in vec3 aCol;
  layout(location=4) in float aSway;
  uniform mat4 uProj, uView, uModel;
  uniform mat3 uNMat;
  uniform float uTime, uSwayAmp;
  uniform vec3 uWind;
  out vec3 vWorld; out vec3 vNor; out vec2 vUV; out vec3 vCol; out float vFogDepth;
  void main(){
    vec3 p = aPos;
    if (aSway > 0.001) {
      float ph = uTime * 1.35 + p.x * 0.9 + p.z * 0.7;
      p.x += (sin(ph) * 0.035 + uWind.x) * aSway * uSwayAmp;
      p.z += (cos(ph * 0.87) * 0.028 + uWind.z) * aSway * uSwayAmp;
      p.y += sin(ph * 1.7) * 0.012 * aSway * uSwayAmp;
    }
    vec4 wp = uModel * vec4(p, 1.0);
    vWorld = wp.xyz;
    vNor = normalize(uNMat * aNor);
    vUV = aUV; vCol = aCol;
    vec4 vp = uView * wp;
    vFogDepth = -vp.z;
    gl_Position = uProj * vp;
  }`;

  const LIT_FS = `#version 300 es
  precision highp float;
  precision highp samplerCubeShadow;
  in vec3 vWorld; in vec3 vNor; in vec2 vUV; in vec3 vCol; in float vFogDepth;
  out vec4 o;
  uniform sampler2D uTex;
  uniform float uUseTex, uUnlit, uOpacity, uSpec, uRim, uFogAmt, uEmisBoost, uCutout;
  uniform vec3 uTint, uEmissive, uCam;
  uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol;
  uniform float uFogNear, uFogFar;
  uniform int uPointN;
  uniform vec3 uPointPos[6], uPointCol[6];
  uniform float uPointRange[6];
  uniform vec2 uUVOff, uUVScale;
  uniform samplerCubeShadow uShadowMap;
  uniform int uShadowIdx;
  uniform float uShadowOn, uShadowFar, uShadowBias;
  float pointShadow(vec3 wp, vec3 n, vec3 lp) {
    vec3 d = wp - lp;
    float dist = length(d);
    vec3 nd = d / max(dist, 0.0001);
    vec3 p = wp + n * 0.02;
    vec3 dp = p - lp;
    float ref = length(dp) / uShadowFar + uShadowBias;
    vec3 up = abs(nd.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t = normalize(cross(up, nd));
    vec3 b = cross(nd, t);
    float sum = 0.0;
    float R = 0.04;
    float D = 0.7071;
    sum += texture(uShadowMap, vec4(normalize(dp + t * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp - t * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + b * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp - b * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + (t * D + b * D) * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + (-t * D + b * D) * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + (t * D - b * D) * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + (-t * D - b * D) * R), ref));
    return sum * 0.125;
  }
  void main(){
    vec2 uv = vUV * uUVScale + uUVOff;
    vec4 tx = uUseTex > 0.5 ? texture(uTex, uv) : vec4(1.0);
    if (uCutout > 0.5 && tx.a < 0.45) discard;
    vec3 alb = tx.rgb * uTint * vCol;
    float a = tx.a * uOpacity;
    vec3 col;
    if (uUnlit > 0.5) {
      col = alb;
    } else {
      vec3 n = normalize(vNor);
      vec3 v = normalize(uCam - vWorld);
      float ndl = dot(n, uSunDir);
      float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
      float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 amb = mix(uGroundCol, uSkyCol, hemi);
      col = alb * (amb + uSunCol * wrap);
      vec3 h = normalize(uSunDir + v);
      col += uSunCol * pow(max(dot(n, h), 0.0), 28.0) * uSpec * wrap;
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      col += uSkyCol * rim * uRim;
      for (int i = 0; i < 6; i++) {
        if (i >= uPointN) break;
        vec3 d = uPointPos[i] - vWorld;
        float dist = length(d);
        float att = clamp(1.0 - dist / uPointRange[i], 0.0, 1.0);
        att *= att;
        float nd = clamp(dot(n, d / max(dist, 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
        float sh = 1.0;
        if (uShadowOn > 0.5 && i == uShadowIdx) sh = pointShadow(vWorld, n, uPointPos[i]);
        col += alb * uPointCol[i] * att * (0.25 + 0.75 * nd) * sh;
        col += uPointCol[i] * uSpec * att * pow(max(dot(n, normalize(d / max(dist,0.0001) + v)), 0.0), 40.0) * 0.6 * sh;
      }
    }
    col += uEmissive * (uUseTex > 0.5 ? tx.rgb : vec3(1.0)) * uEmisBoost;
    float f = smoothstep(uFogNear, uFogFar, vFogDepth) * uFogAmt;
    col = mix(col, uFogCol, f);
    o = vec4(col, a);
  }`;

  const SHADOW_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uVP, uModel;
  out vec3 vWorld;
  void main(){
    vec4 w = uModel * vec4(aPos, 1.0);
    vWorld = w.xyz;
    gl_Position = uVP * w;
  }`;

  const SHADOW_FS = `#version 300 es
  precision highp float;
  uniform vec3 uLightPos;
  uniform float uFar;
  in vec3 vWorld;
  out vec4 o;
  void main(){
    gl_FragDepth = clamp(length(vWorld - uLightPos) / uFar, 0.0, 1.0);
    o = vec4(1.0);
  }`;

  const SEA_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNor;
  layout(location=2) in vec2 aUV;
  uniform mat4 uProj, uView, uModel;
  out vec2 vUV; out vec3 vWorld;
  void main(){
    vec4 wp = uModel * vec4(aPos, 1.0);
    vWorld = wp.xyz;
    vUV = aUV;
    gl_Position = uProj * uView * wp;
  }`;

  const SEA_FS = `#version 300 es
  precision highp float;
  in vec2 vUV; in vec3 vWorld;
  out vec4 o;
  uniform float uTime, uCausticAmt, uDensity, uRayAmt, uYBase, uYSpan;
  uniform vec3 uDeep, uShallow, uRayCol, uFogCol, uCam;
  uniform sampler2D uCaustic;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 24634.6345); }
  void main(){
    vec2 uv = vUV;
    float h = clamp((vWorld.y - uYBase) / uYSpan, 0.0, 1.0);
    vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 1.0, h));
    // 光柱：从上方斜射下来的带状亮部
    vec2 u1 = uv * vec2(3.2, 1.6) + vec2(uTime * 0.012, -uTime * 0.03);
    vec2 u2 = uv * vec2(6.5, 3.1) + vec2(-uTime * 0.02, -uTime * 0.05);
    float c1 = texture(uCaustic, u1).r;
    float c2 = texture(uCaustic, u2).r;
    float caust = pow(c1 * c2 * 2.2, 1.3);
    // 只在靠上的水面附近有焦散
    col += uRayCol * caust * uCausticAmt * smoothstep(0.15, 1.0, h);
    // 斜射下来的光带（拉长的焦散纹理）
    float rays = texture(uCaustic, vec2(uv.x * 1.7 + uTime * 0.008, uv.y * 0.12 - uTime * 0.02)).r;
    col += uRayCol * pow(rays, 2.2) * 0.16 * smoothstep(0.15, 1.0, h);
    // 水面附近的亮部
    col += uRayCol * pow(smoothstep(0.62, 1.0, h), 2.0) * 0.28;
    // 远处的水体雾
    float ve = smoothstep(0.0, 0.55, h);
    col = mix(col, uFogCol, (1.0 - ve) * uDensity);
    o = vec4(col, 1.0);
  }`;

  const POINT_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec4 aCol;
  layout(location=2) in float aSize;
  layout(location=3) in vec4 aParam;   // x=种类 0 静止/1 上升/2 飘散  y=速度 z=相位 w=摆动
  uniform mat4 uProj, uView;
  uniform float uTime, uYMin, uYMax, uPix, uFogNear, uFogFar;
  out vec4 vCol;
  void main(){
    vec3 p = aPos;
    float kind = aParam.x;
    if (kind > 0.5 && kind < 1.5) {
      // 上升（气泡 / 余烬）
      float span = uYMax - uYMin;
      p.y = uYMin + mod(p.y - uYMin + uTime * aParam.y, span);
      p.x += sin(uTime * 1.6 + aParam.z) * aParam.w;
      p.z += cos(uTime * 1.2 + aParam.z * 1.7) * aParam.w * 0.8;
    } else if (kind > 1.5) {
      // 缓慢飘散（尘埃 / 雪 / 雨）
      float span = uYMax - uYMin;
      p.y = uYMin + mod(p.y - uYMin + uTime * aParam.y, span);
      p.x += sin(uTime * 0.5 + aParam.z) * aParam.w + uTime * 0.02;
      p.z += cos(uTime * 0.4 + aParam.z) * aParam.w;
    }
    vec4 vp = uView * vec4(p, 1.0);
    gl_Position = uProj * vp;
    float dist = -vp.z;
    gl_PointSize = clamp(aSize * uPix / max(dist, 0.2), 0.6, 90.0);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    vCol = aCol;
    if (kind < 0.5) {
      float tw = 0.55 + 0.45 * sin(uTime * (1.6 + aParam.z * 0.25) + aParam.z * 11.0);
      vCol.a *= tw;
      vCol.rgb *= 0.75 + 0.35 * tw;
    }
    vCol.a *= (1.0 - fog);
  }`;

  const POINT_FS = `#version 300 es
  precision highp float;
  in vec4 vCol;
  out vec4 o;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float a = smoothstep(0.5, 0.06, r);
    // 气泡有一点高光边
    a += smoothstep(0.42, 0.5, r) * smoothstep(0.5, 0.44, r) * 0.7;
    o = vec4(vCol.rgb, vCol.a * a);
  }`;

  const GLOW_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNor;
  layout(location=2) in vec2 aUV;
  layout(location=3) in vec3 aCol;
  uniform mat4 uProj, uView, uModel;
  out vec2 vUV; out vec3 vCol;
  void main(){
    vUV = aUV; vCol = aCol;
    gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
  }`;

  const GLOW_FS = `#version 300 es
  precision highp float;
  in vec2 vUV; in vec3 vCol;
  out vec4 o;
  uniform sampler2D uTex;
  uniform float uUseTex, uOpacity;
  uniform vec3 uTint;
  void main(){
    vec4 t = uUseTex > 0.5 ? texture(uTex, vUV) : vec4(1.0);
    float a = t.a * uOpacity;
    o = vec4(vCol * uTint * t.rgb, a);
  }`;

  /* ---------------- 资源 ---------------- */
  function createGL() {
    gcv = document.createElement("canvas");
    gcv.width = W; gcv.height = H;
    gl = gcv.getContext("webgl2", { antialias: true, alpha: false, depth: true,
                                    powerPreference: "high-performance", preserveDrawingBuffer: true });
    if (!gl) { failReason = "浏览器不支持 WebGL2"; return false; }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);   // 几何体双面可见：法线决定明暗，省得逐个检查绕序
    skyProg = program(SKY_VS, SKY_FS, []);
    litProg = program(LIT_VS, LIT_FS, ["aPos", "aNor", "aUV", "aCol", "aSway"]);
    seaProg = program(SEA_VS, SEA_FS, ["aPos", "aNor", "aUV"]);
    ptProg = program(POINT_VS, POINT_FS, ["aPos", "aCol", "aSize", "aParam"]);
    glowProg = program(GLOW_VS, GLOW_FS, ["aPos", "aNor", "aUV", "aCol"]);
    shadowProg = program(SHADOW_VS, SHADOW_FS, ["aPos"]);
    shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    dummyShadow = makeDepthCube(1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // 各向异性过滤：地面 / 机柜这种掠射角的贴图不糊成条纹
    anisoExt = gl.getExtension("EXT_texture_filter_anisotropic");
    if (anisoExt) {
      maxAniso = Math.min(8, gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1);
    }
    ready = true;
    return true;
  }

  function init() {
    if (ready || failReason) return ready;
    try { createGL(); } catch (e) { failReason = String(e && e.message || e); console.error("[A3D] 初始化失败", e); }
    return ready;
  }

  /* ---------------- 网格 ---------------- */
  const meshes = [];
  function meshFrom(builder) {
    if (!builder || !builder.count) return null;
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.d), gl.STATIC_DRAW);
    const st = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, st, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, st, 44);
    gl.bindVertexArray(null);
    const m = { vao, buf, count: builder.count, verts: builder.count, keep: builder.d.length };
    meshes.push(m);
    return m;
  }

  /* ---------------- 点精灵 ---------------- */
  const PTSTRIDE = 12;
  function pointMesh(list) {
    const arr = [];
    for (const p of list) {
      arr.push(p.x, p.y, p.z, p.r, p.g, p.b, p.a, p.size,
               p.kind || 0, p.speed || 0, p.phase || 0, p.wob || 0);
    }
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    const st = PTSTRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, st, 28);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, st, 32);
    gl.bindVertexArray(null);
    return { vao, buf, count: list.length };
  }

  /* ---------------- 贴图 ---------------- */
  function texFromCanvas(cv, opts) {
    opts = opts || {};
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (anisoExt && !opts.clamp) {
      gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
    }
    return t;
  }
  function updateTex(t, cv) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /* ============================================================
   *  渲染
   * ============================================================ */
  const scenes = {};
  function register(id, builder) { scenes[id] = builder; }
  function has(id) { return !!scenes[id] && init(); }

  let cur = null, curId = "", curScene = null;
  let camOverride = null;   // 预览页的自由相机：场景 update 之后覆盖 cam
  const scratchMat = M.ident();


  /* ---------------- 点光阴影（cubemap shadow map） ---------------- */
  function makeDepthCube(size) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    for (let i = 0; i < 6; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.DEPTH_COMPONENT24,
        size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    return tex;
  }

  function buildShadow(sc) {
    const sh = sc.shadow;
    if (!sh || !gl || !shadowProg) { sc.__shadow = null; return; }
    const size = sh.size || 1024;
    const far = sh.far || 9;
    const tex = makeDepthCube(size);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.viewport(0, 0, size, size);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(shadowProg.p);
      gl.uniform3fv(shadowProg.u.uLightPos, sh.pos);
      gl.uniform1f(shadowProg.u.uFar, far);
      const proj = M.perspective(Math.PI / 2, 1, 0.05, far);
      const dirs = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];
      const ups = [[0,-1,0], [0,-1,0], [0,0,1], [0,0,-1], [0,-1,0], [0,-1,0]];
      for (let f = 0; f < 6; f++) {
        const d = dirs[f], up = ups[f];
        const view = M.lookAt(sh.pos,
          [sh.pos[0] + d[0], sh.pos[1] + d[1], sh.pos[2] + d[2]], up);
        const vp = M.mul(proj, view);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error("shadow FBO incomplete");
        }
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(shadowProg.u.uVP, false, vp);
        for (const b of sc.batches) {
          if (b.noShadow || b.blend || (b.opacity !== undefined && b.opacity < 0.999)) continue;
          gl.uniformMatrix4fv(shadowProg.u.uModel, false, b.model || scratchMat);
          gl.bindVertexArray(b.mesh.vao);
          gl.drawArrays(gl.TRIANGLES, 0, b.mesh.count);
        }
      }
      sc.__shadow = { tex, far, idx: sh.index || 0,
        bias: sh.bias === undefined ? 0.0025 : sh.bias };
    } catch (e) {
      console.error("[A3D] 阴影构建失败", e);
      sc.__shadow = null;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.bindVertexArray(null);
    }
  }

  function setBatch(b, t, view) {
    const P = litProg, u = P.u;
    gl.uniformMatrix4fv(u.uModel, false, b.model || scratchMat);
    gl.uniformMatrix3fv(u.uNMat, false, M.normalMat(b.model || scratchMat));
    gl.uniform1f(u.uUseTex, b.tex ? 1 : 0);
    gl.uniform1f(u.uUnlit, b.unlit ? 1 : 0);
    gl.uniform1f(u.uOpacity, b.opacity === undefined ? 1 : b.opacity);
    gl.uniform1f(u.uSpec, b.spec === undefined ? 0.12 : b.spec);
    gl.uniform1f(u.uRim, b.rim === undefined ? 0.35 : b.rim);
    gl.uniform1f(u.uEmisBoost, b.emisBoost === undefined ? 1 : b.emisBoost);
    gl.uniform1f(u.uCutout, b.cutout ? 1 : 0);
    gl.uniform3fv(u.uTint, b.tint || [1, 1, 1]);
    gl.uniform3fv(u.uEmissive, b.emissive || [0, 0, 0]);
    const off = b.uvAnim ? b.uvAnim(t) : (b.uvOff || [0, 0]);
    gl.uniform2fv(u.uUVOff, off);
    gl.uniform2fv(u.uUVScale, [1, 1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, b.tex || null);
    gl.uniform1i(u.uTex, 0);
    if (b.blend === "add") { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); }
    else if (b.blend === "alpha") { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
    else gl.disable(gl.BLEND);
    gl.depthMask(b.blend === undefined || b.blend === "opaque");
    gl.bindVertexArray(b.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, b.mesh.count);
  }

  function applyLights(scene, cam) {
    const L = scene.lights || {};
    const u = litProg.u;
    gl.uniform3fv(u.uCam, cam);
    gl.uniform3fv(u.uSunDir, norm3(L.sun || [0.4, 0.8, 0.3]));
    gl.uniform3fv(u.uSunCol, L.sunCol || [0.6, 0.62, 0.7]);
    gl.uniform3fv(u.uSkyCol, L.skyCol || [0.22, 0.26, 0.34]);
    gl.uniform3fv(u.uGroundCol, L.groundCol || [0.08, 0.09, 0.12]);
    gl.uniform3fv(u.uFogCol, (L.fog && L.fog.col) || [0.03, 0.05, 0.08]);
    gl.uniform1f(u.uFogNear, (L.fog && L.fog.near) || 8);
    gl.uniform1f(u.uFogFar, (L.fog && L.fog.far) || 40);
    gl.uniform1f(u.uFogAmt, L.fogAmt === undefined ? 1 : L.fogAmt);
    gl.uniform1f(u.uTime, scene.time || 0);
    gl.uniform1f(u.uSwayAmp, scene.swayAmp === undefined ? 1 : scene.swayAmp);
    gl.uniform3fv(u.uWind, scene.wind || [0, 0, 0]);
    const pts = L.points || [];
    const n = Math.min(6, pts.length);
    gl.uniform1i(u.uPointN, n);
    if (n) {
      const pos = [], col = [], rng = [];
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        pos.push(p.pos[0], p.pos[1], p.pos[2]);
        const inten = p.inten === undefined ? 1 : p.inten;
        col.push(p.col[0] * inten, p.col[1] * inten, p.col[2] * inten);
        rng.push(p.range || 5);
      }
      gl.uniform3fv(u.uPointPos, pos);
      gl.uniform3fv(u.uPointCol, col);
      gl.uniform1fv(u.uPointRange, rng);
    }
    const sh = scene.__shadow;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sh ? sh.tex : dummyShadow);
    gl.uniform1i(u.uShadowMap, 3);
    gl.uniform1f(u.uShadowOn, sh ? 1 : 0);
    gl.uniform1i(u.uShadowIdx, sh ? sh.idx : 0);
    gl.uniform1f(u.uShadowFar, sh ? sh.far : 1);
    gl.uniform1f(u.uShadowBias, sh ? sh.bias : 0);
  }

  function drawSky(scene, t) {
    const s = scene.sky || {};
    const u = skyProg.u;
    gl.useProgram(skyProg.p);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.uniform3fv(u.uTop, s.top || [0.02, 0.03, 0.05]);
    gl.uniform3fv(u.uBot, s.bot || [0.05, 0.06, 0.09]);
    gl.uniform3fv(u.uGlow, s.glow || [0.2, 0.3, 0.4]);
    gl.uniform3fv(u.uSun, s.sun || [0.5, 0.7]);
    gl.uniform1f(u.uMode, s.mode || 0);
    gl.uniform1f(u.uHorizon, s.horizon === undefined ? 0.5 : s.horizon);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uGrain, 0.02);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  function drawSea(b, t) {
    const u = seaProg.u;
    gl.useProgram(seaProg.p);
    gl.uniformMatrix4fv(u.uProj, false, cur.proj);
    gl.uniformMatrix4fv(u.uView, false, cur.view);
    gl.uniformMatrix4fv(u.uModel, false, b.model || scratchMat);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uCausticAmt, b.causticAmt === undefined ? 0.6 : b.causticAmt);
    gl.uniform1f(u.uDensity, b.density === undefined ? 0.25 : b.density);
    gl.uniform1f(u.uRayAmt, 1);
    gl.uniform1f(u.uYBase, b.yBase === undefined ? -1.2 : b.yBase);
    gl.uniform1f(u.uYSpan, b.ySpan === undefined ? 4.4 : b.ySpan);
    gl.uniform3fv(u.uDeep, b.deep || [0.01, 0.06, 0.10]);
    gl.uniform3fv(u.uShallow, b.shallow || [0.10, 0.42, 0.55]);
    gl.uniform3fv(u.uRayCol, b.rayCol || [0.6, 0.9, 1.0]);
    gl.uniform3fv(u.uFogCol, b.fogCol || [0.03, 0.12, 0.18]);
    gl.uniform3fv(u.uCam, cur.eye);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform1i(u.uCaustic, 0);
    gl.bindVertexArray(b.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, b.mesh.count);
  }

  function drawPoints(sc, t) {
    const u = ptProg.u;
    gl.useProgram(ptProg.p);
    gl.uniformMatrix4fv(u.uProj, false, cur.proj);
    gl.uniformMatrix4fv(u.uView, false, cur.view);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uPix, H / (2 * Math.tan(cur.fov / 2)));
    gl.uniform3fv(u.uCam, cur.eye);
    for (const p of sc.points) {
      gl.uniform1f(u.uYMin, p.yMin === undefined ? -6 : p.yMin);
      gl.uniform1f(u.uYMax, p.yMax === undefined ? 6 : p.yMax);
      gl.uniform1f(u.uFogNear, p.fogNear === undefined ? 14 : p.fogNear);
      gl.uniform1f(u.uFogFar, p.fogFar === undefined ? 30 : p.fogFar);
      if (p.blend === "add") { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); }
      else { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      gl.depthMask(false);
      gl.bindVertexArray(p.mesh.vao);
      gl.drawArrays(gl.POINTS, 0, p.mesh.count);
    }
  }

  function drawGlow(b, t) {
    const u = glowProg.u;
    gl.useProgram(glowProg.p);
    gl.uniformMatrix4fv(u.uProj, false, cur.proj);
    gl.uniformMatrix4fv(u.uView, false, cur.view);
    gl.uniformMatrix4fv(u.uModel, false, b.model || scratchMat);
    gl.uniform1f(u.uUseTex, b.tex ? 1 : 0);
    gl.uniform1f(u.uOpacity, b.opacity === undefined ? 1 : b.opacity);
    gl.uniform3fv(u.uTint, b.tint || [1, 1, 1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, b.tex || null);
    gl.uniform1i(u.uTex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, b.blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    gl.depthMask(false);
    gl.bindVertexArray(b.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, b.mesh.count);
  }

  function render(scene, t) {
    const cam = scene.cam || {};
    const eye = cam.eye || [0, 1.6, 3];
    const target = cam.target || [0, 1.4, -3];
    const fov = (cam.fov || 42) * D2R;
    const aspect = W / H;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    curScene = scene;
    const proj = M.perspective(fov, aspect, 0.05, 120);
    const view = M.lookAt(eye, target, [0, 1, 0]);
    cur = { proj, view, eye, fov };
    scene.time = t;

    drawSky(scene, t);

    /* 体积海（窗外的深海） */
    if (scene.sea) {
      for (const b of scene.sea) drawSea(b, t);
    }

    /* 主几何 */
    gl.useProgram(litProg.p);
    gl.uniformMatrix4fv(litProg.u.uProj, false, proj);
    gl.uniformMatrix4fv(litProg.u.uView, false, view);
    applyLights(scene, eye);

    const opaques = scene.batches;
    for (const b of opaques) setBatch(b, t, view);

    /* 动态物件 */
    for (const d of scene.dyn) {
      const b = d.batch;
      if (d.matrix) b.model = d.matrix(t);
      setBatch(b, t, view);
    }

    /* 半透明 / 叠加 */
    for (const b of scene.over) setBatch(b, t, view);

    /* 点精灵（气泡 / 尘埃 / 星） */
    if (scene.points) drawPoints(scene, t);

    /* 屏幕发光片（灯晕、光束） */
    if (scene.glows) for (const b of scene.glows) {
      if (b.matrix) b.model = b.matrix(t);
      drawGlow(b, t);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /* ---------------- 对外 ---------------- */
  function draw(ctx, id, t, opts) {
    if (!has(id)) return false;
    let sc = scenes[id].__built;
    if (!sc) {
      try {
        sc = scenes[id](opts || {});
      } catch (e) {
        console.error("[A3D] 场景构建失败：" + id, e);
        delete scenes[id];          // 坏掉的场景直接摘掉，回落到占位卡，不要每帧刷错误
        return false;
      }
      sc.__id = id;
      if (sc.cam) {
        sc.__cam0 = {
          eye: sc.cam.eye.slice(),
          target: sc.cam.target.slice(),
          fov: sc.cam.fov
        };
      }
      scenes[id].__built = sc;
    }
    if (sc.update) sc.update(t, sc);
    if (camOverride && sc.cam) {
      if (camOverride.eye) sc.cam.eye = camOverride.eye.slice();
      if (camOverride.target) sc.cam.target = camOverride.target.slice();
      if (typeof camOverride.fov === "number") sc.cam.fov = camOverride.fov;
    }
    if (sc.shadow && sc.__shadow === undefined) buildShadow(sc);
    render(sc, t);
    ctx.drawImage(gcv, 0, 0, W, H);
    return true;
  }

  /** 场景内的色调提示（art.js 的后期调色用，返回 3 段 CSS 颜色） */
  function toneOf(id) {
    const f = scenes[id];
    const t = f && f.__built && f.__built.tone;
    if (!t) return null;
    const css = (k, f2) => {
      const r = Math.round(clamp(t[0] * k * f2, 0, 1) * 255);
      const g = Math.round(clamp(t[1] * k * f2, 0, 1) * 255);
      const b = Math.round(clamp(t[2] * k * f2, 0, 1) * 255);
      return "rgb(" + r + "," + g + "," + b + ")";
    };
    return [css(0.94, 0.96), css(1, 1), css(0.86, 0.9)];
  }

  /** 这个场景在游戏里是否走 2D 后期（tone / 暗角 / 颗粒）；ds_room 单独关掉 */
  function postOf(id) {
    const sc = scenes[id] && scenes[id].__built;
    return sc ? sc.post !== false : true;
  }

  function setCamOverride(cam) {
    camOverride = cam ? {
      eye: cam.eye ? cam.eye.slice() : null,
      target: cam.target ? cam.target.slice() : null,
      fov: cam.fov
    } : null;
  }
  function clearCamOverride() { camOverride = null; }

  return {
    W, H, M, Builder, init, draw, register, has, toneOf, postOf,
    setCamOverride, clearCamOverride,
    debugScene: () => curScene,
    get ok() { return ready; }, get failReason() { return failReason; },
    get canvas() { return gcv; },
    meshFrom, pointMesh, texFromCanvas, updateTex,
    clamp, lerp, smooth, TAU, D2R, norm3, cross,
    math: { v3: (x, y, z) => [x || 0, y || 0, z || 0] }
  };
})();

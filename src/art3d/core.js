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
    /** 正交投影：平行光的阴影相机用它（透视投影做方向光阴影会有透视缩放，
     *  远处的东西阴影大小不对）。列主序，和 perspective 一致。 */
    ortho(l, r, b, t, n, f) {
      return new Float32Array([
        2 / (r - l), 0, 0, 0,
        0, 2 / (t - b), 0, 0,
        0, 0, -2 / (f - n), 0,
        -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1
      ]);
    },
    /** 4×4 求逆（列主序）。体积光要从深度反推世界坐标，需要 viewProj 的逆。 */
    invert(m) {
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
      const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
      const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      const out = new Float32Array(16);
      if (!det) return out;           // 退化矩阵：返回全 0，着色器里算出来也没意义
      det = 1 / det;
      out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return out;
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
    /** 同 normalMat，但结果写进调用方给的数组。
     *  每帧每个批次都要算一次法线矩阵，返回新 Float32Array 会白白制造几十个垃圾。 */
    normalMatInto(m, out) {
      const a = m[0], b = m[1], c = m[2];
      const d = m[4], e = m[5], f = m[6];
      const g = m[8], h = m[9], i = m[10];
      const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
      const det = a * A + b * B + c * C;
      const s = det ? 1 / det : 0;
      out[0] = A * s; out[1] = B * s; out[2] = C * s;
      out[3] = -(b * i - c * h) * s; out[4] = (a * i - c * g) * s; out[5] = -(a * h - b * g) * s;
      out[6] = (b * f - c * e) * s; out[7] = -(a * f - c * d) * s; out[8] = (a * e - b * d) * s;
      return out;
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
  let skyProg, litProg, seaProg, ptProg, glowProg, shadowProg, sunShadowProg, volProg;
  let shadowFbo = null, dummyShadow = null;
  let sunShadowFbo = null, dummySunShadow = null;
  /* 体积光：先把场景画进带深度的离屏 FBO，再做一遍全屏光线步进。
   * MSAA 只能由 renderbuffer 提供（默认帧缓冲的采样数管不到 FBO），
   * 所以有 MSAA 时走「MSAA FBO → blit 到纹理 FBO」，没有就直接画纹理 FBO。 */
  let volFbo = null, volColorTex = null, volDepthTex = null;
  let volMsaaFbo = null, volMsaaColorRb = null, volMsaaDepthRb = null;
  let volW = 0, volH = 0;
  let volSteps = 24;

  /* ---------------- 画质旋钮 ----------------
   * 内部渲染分辨率和逻辑舞台解耦：舞台坐标永远是 1600×900，但 WebGL 可以按
   * renderScale 降分辨率画，最后 drawImage 放大回去。背景本身是雾 + 暗调 +
   * 轻微柔化的东西，0.8 收缩肉眼看不出，填充量却只剩 64%——这是最直接的一档。
   * shadowSizeCap / shadowTaps 控制那盏点光的 cubemap 尺寸与 PCF 采样数。 */
  let renderScale = 1, rw = W, rh = H;
  let shadowSizeCap = 0, shadowTaps = 8;
  /* 实际拿到的多重采样数：浏览器不保证给，得问。1 = 没有 MSAA。
   * a2cOK = 能不能用 alpha-to-coverage 给镂空材质做边缘抗锯齿（需要 MSAA）。 */
  let msaaSamples = 1, a2cOK = false;

  /* 上限放到 2.0：3D 也可以超采样，让背景和主画布的后备存储 1:1。
   * 1080p 全屏时主画布是 1920×1080（画布 1.20x），3D 还画 1600×900 的话
   * 背景就会比文字软一档——想要一样实，就得允许 renderScale > 1。 */
  function applyScale(k) {
    renderScale = clamp(k, 0.35, 2);
    rw = Math.max(1, Math.round(W * renderScale));
    rh = Math.max(1, Math.round(H * renderScale));
    if (!gl) return;
    if (gcv.width !== rw || gcv.height !== rh) {
      gcv.width = rw; gcv.height = rh;   // 改尺寸会丢掉缓冲内容，下一帧整帧重画即可
    }
    gl.viewport(0, 0, rw, rh);
    // 离屏目标跟着分辨率走；尺寸一变，旧的纹理就不能用了
    if (volFbo && (volW !== rw || volH !== rh)) destroyVolTargets();
  }

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

  /* ---- 风场：世界坐标上的低频噪声 ----
   * 以前是整个场景共用一个方向的风（uWind），同一时刻所有草朝同一边倒。
   * 现在按世界位置取噪声，得到一片片「范围」：范围内草往一个方向摆，
   * 隔壁那片方向不同，噪声再随时间漂移，阵风就会自己扫过草地。
   * 草叶、常春藤、柏树、花都用同一个顶点着色器，所以是同一套风。 */
  float wHash(vec2 q) {
    q = fract(q * vec2(123.34, 456.21));
    q += dot(q, q + 45.32);
    return fract(q.x * q.y);
  }
  float wNoise(vec2 q) {
    vec2 i = floor(q), f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    float a = wHash(i), b = wHash(i + vec2(1.0, 0.0));
    float c = wHash(i + vec2(0.0, 1.0)), d = wHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  /** 返回 xy = 该处风的方向×强度（长度 0~1），漂移量也一起给 */
  vec2 wField(vec2 xz, float t) {
    vec2 q = xz * 0.21 + vec2(t * 0.13, t * 0.085);
    float n1 = wNoise(q);
    float n2 = wNoise(q * 2.3 + 17.3);
    float ang = (n1 * 2.0 - 1.0) * 3.1416 + n2 * 1.1;
    float mag = 0.3 + 0.7 * n2;
    return vec2(cos(ang), sin(ang)) * mag;
  }

  void main(){
    vec3 p = aPos;
    if (aSway > 0.001) {
      /* 先按静止位置取风：同一丛草里各顶点的风几乎一致，不会被撕开 */
      vec2 wind = wField(p.xz, uTime) + uWind.xz * 4.0;
      /* 每片叶子自己的小抖动，让同一片里的叶子不同步 */
      float ph = uTime * 1.35 + p.x * 0.9 + p.z * 0.7;
      float k = aSway * uSwayAmp;
      p.x += (wind.x * 0.075 + sin(ph) * 0.010) * k;
      p.z += (wind.y * 0.075 + cos(ph * 0.87) * 0.008) * k;
      p.y += sin(ph * 1.7) * 0.004 * k;
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
  precision highp sampler2DShadow;
  in vec3 vWorld; in vec3 vNor; in vec2 vUV; in vec3 vCol; in float vFogDepth;
  out vec4 o;
  uniform sampler2D uTex;
  uniform float uUseTex, uUnlit, uOpacity, uSpec, uRim, uFogAmt, uEmisBoost, uCutout, uA2C;
  uniform vec3 uTint, uEmissive, uCam;
  uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol;
  uniform float uFogNear, uFogFar;
  uniform int uPointN;
  uniform vec3 uPointPos[10], uPointCol[10];
  uniform float uPointRange[10];
  uniform vec2 uUVOff, uUVScale;
  uniform float uUVRand;
  uniform samplerCubeShadow uShadowMap;
  uniform int uShadowIdx, uShadowTaps;
  /* 太阳（平行光）阴影：只有场景配了 sunShadow 才启用，没配时 uSunShadowOn=0，
     走的是和以前完全一样的路径。 */
  uniform sampler2DShadow uSunMap;
  uniform mat4 uSunVP;
  uniform float uSunShadowOn, uSunShadowBias, uSunTexel, uSunWrap;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  uniform float uShadowOn, uShadowFar, uShadowBias;

  /** 太阳阴影：3×3 PCF。超出正交框就当作不在阴影里（不能比 1 小） */
  float sunShadow(vec3 wp, vec3 n) {
    vec4 lp = uSunVP * vec4(wp + n * 0.06, 1.0);
    vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
    float ref = p.z - uSunShadowBias;
    float sum = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        sum += texture(uSunMap, vec3(p.xy + vec2(float(x), float(y)) * uSunTexel, ref));
      }
    }
    return sum / 9.0;
  }
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
    sum += texture(uShadowMap, vec4(normalize(dp + t * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp - t * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + b * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp - b * R), ref));
    // 低画质只走十字四采样；多了四个对角采样，阴影边缘会软一点，但采样数减半
    if (uShadowTaps <= 4) return sum * 0.25;
    float D = 0.7071;
    sum += texture(uShadowMap, vec4(normalize(dp + (t * D + b * D) * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + (-t * D + b * D) * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + (t * D - b * D) * R), ref));
    sum += texture(uShadowMap, vec4(normalize(dp + (-t * D - b * D) * R), ref));
    return sum * 0.125;
  }
  void main(){
    vec2 uv = vUV * uUVScale + uUVOff;
    vec4 tx;
    /* 一张贴图只靠平移平铺，相邻两块地皮就是同一张图，一眼能认出重复。
       这里按贴图周期切格，每格用格子坐标哈希随机转 90° / 翻转一次 ——
       相邻格朝向不同，就没有"旁边那块和这块一样"了。
       梯度仍用未旋转的 uv 求：旋转/翻转不改变梯度长度，
       所以 mip 不会在格子边界跳变，不会画出接缝线。 */
    if (uUseTex > 0.5 && uUVRand > 0.5) {
      vec2 cell = floor(uv), f = fract(uv);
      float h = hash(cell);
      vec2 g = f;
      if (h < 0.25) g = f;
      else if (h < 0.5) g = vec2(f.y, 1.0 - f.x);
      else if (h < 0.75) g = vec2(1.0 - f.x, 1.0 - f.y);
      else g = vec2(1.0 - f.y, f.x);
      tx = textureGrad(uTex, cell + g, dFdx(uv), dFdy(uv));
    } else {
      tx = uUseTex > 0.5 ? texture(uTex, uv) : vec4(1.0);
    }
    float a = tx.a * uOpacity;
    /* 镂空材质（树叶 / 海带 / 藤蔓）的边缘抗锯齿：
     *   · 有 MSAA 且支持 alpha-to-coverage 时不 discard，把贴图 alpha 交给覆盖度，
     *     4 个采样点按 alpha 抖动 → 边缘是渐变的，而不是一刀切；
     *   · 否则退回老的硬阈值 discard（老设备上观感和以前完全一样）。 */
    if (uCutout > 0.5) {
      if (uA2C > 0.5) {
        a = tx.a;
      } else {
        if (tx.a < 0.45) discard;
        a = 1.0;
      }
    }
    vec3 alb = tx.rgb * uTint * vCol;
    vec3 col;
    if (uUnlit > 0.5) {
      col = alb;
    } else {
      vec3 n = normalize(vNor);
      vec3 v = normalize(uCam - vWorld);
      float ndl = dot(n, uSunDir);
      /* uSunWrap = 1 是老的「环绕漫反射」：背光面也有 0.5 的底光，画面平整；
         调小它就往「硬方向光」走——阴影面真的暗下去，太阳才像太阳。 */
      float wrap = mix(max(ndl, 0.0), ndl * 0.5 + 0.5, uSunWrap);
      float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
      float sunSh = 1.0;
      if (uSunShadowOn > 0.5) sunSh = sunShadow(vWorld, n);
      vec3 amb = mix(uGroundCol, uSkyCol, hemi);
      col = alb * (amb + uSunCol * wrap * sunSh);
      vec3 h = normalize(uSunDir + v);
      col += uSunCol * pow(max(dot(n, h), 0.0), 28.0) * uSpec * wrap * sunSh;
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      col += uSkyCol * rim * uRim;
      for (int i = 0; i < 10; i++) {
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

  /* 太阳（平行光）阴影 pass：正交投影 + 普通深度，不需要手写 gl_FragDepth。
   * 复用 SHADOW_VS 的顶点着色器，fragment 只负责把深度写下去。 */
  const SUNSHADOW_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uVP, uModel;
  void main(){
    gl_Position = uVP * uModel * vec4(aPos, 1.0);
  }`;

  const SUNSHADOW_FS = `#version 300 es
  precision highp float;
  out vec4 o;
  void main(){
    o = vec4(1.0);
  }`;

  /* ============================================================
   *  体积光（丁达尔效应）：屏幕空间光线步进
   *
   *  不是把几片加法面片摆在场景里，而是真的沿着视线从镜头往前走：
   *  每个采样点用太阳的正交阴影贴图判断「这粒空气有没有被晒到」，
   *  被晒到的才往画面里加散射光。于是光柱天然：
   *    · 方向 = 真实光源方向（跟着 lights.sun 每帧变）
   *    · 只在被照亮的空气里出现，阴影边缘才拉开明暗对比
   *    · 0.5~1.5m 的窄缝（栏杆 / 树冠 / 门缝）会漏出细光条，不会被糊成一片
   *  相位用 Henyey-Greenstein，g 越大越朝太阳方向聚（逆光时更亮）。
   * ============================================================ */
  const VOL_VS = `#version 300 es
  out vec2 vUv;
  void main(){
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;   // 可见平面是 clip −1..1，对应的 uv 就是 0..1
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const VOL_FS = `#version 300 es
  precision highp float;
  precision highp sampler2DShadow;
  in vec2 vUv;
  out vec4 o;
  uniform sampler2D uScene;
  uniform sampler2D uDepth;
  uniform sampler2DShadow uSunMap;
  uniform mat4 uInvVP, uSunVP;
  uniform vec3 uCam, uSunDir, uSunCol;
  uniform float uSunBias;
  uniform float uDensity, uG, uHeightY, uFalloff, uMaxDist, uIntensity, uTime;
  uniform int uSteps, uSunOn;

  float hash12(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /** 这个点有没有被太阳照到：投进太阳正交阴影贴图，超出框就算亮 */
  float sunVis(vec3 p){
    vec4 lp = uSunVP * vec4(p, 1.0);
    vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
    return texture(uSunMap, vec3(s.xy, s.z - uSunBias));
  }

  void main(){
    vec3 scene = texture(uScene, vUv).rgb;
    float d = texture(uDepth, vUv).r;

    /* 深度反推世界坐标（天空的 d=1 会落在远平面上，按 maxDist 截断） */
    vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 wp = uInvVP * ndc;
    vec3 world = wp.xyz / max(wp.w, 1e-5);
    vec3 ray = world - uCam;
    float full = length(ray);
    float dist = min(full, uMaxDist);
    vec3 dir = ray / max(full, 1e-4);

    /* 抖动采样起点：固定步长会在画面里拉出一圈圈同心环 */
    float jit = hash12(gl_FragCoord.xy + vec2(fract(uTime) * 173.0, fract(uTime * 0.37) * 91.0));
    float stepLen = dist / float(uSteps);
    float acc = 0.0;
    for (int i = 0; i < 64; i++) {
      if (i >= uSteps) break;
      float t = (float(i) + jit) * stepLen;
      vec3 p = uCam + dir * t;
      /* 高度雾：越低越浓，光柱贴着地面和树冠下面才明显 */
      float hgt = exp(-max(p.y - uHeightY, 0.0) * uFalloff);
      /* 飘动的尘埃：让光柱自己也在呼吸 */
      float dust = 0.86 + 0.14 * sin(p.y * 1.7 + uTime * 0.5 + p.x * 0.21 + p.z * 0.17);
      float sh = uSunOn > 0 ? sunVis(p) : 1.0;
      acc += sh * hgt * dust * stepLen;
    }

    /* Henyey-Greenstein 相位：朝太阳看时散射最亮，背对时几乎为零 */
    float cosT = dot(dir, uSunDir);
    float g = uG;
    float phase = (1.0 - g * g) /
      (12.566371 * pow(max(1.0 + g * g - 2.0 * g * cosT, 1e-4), 1.5));
    vec3 inscatter = uSunCol * (acc * uDensity * uIntensity * phase);

    /* 软肩：直接往 RGBA8 上加，朝太阳那一片会一路截成一块死白。
     * 用 Reinhard 压一遍，亮部收着涨，太阳附近才不会糊成一个白饼。 */
    inscatter = inscatter / (1.0 + inscatter);

    /* 亮部让步：天空本来就亮，再叠光晕只会更白。场景越亮，加得越少，
     * 暗处（背光的立面、院子里的阴影）才吃得到光柱。 */
    float lum = dot(scene, vec3(0.299, 0.587, 0.114));
    inscatter *= clamp(1.0 - lum * 1.15, 0.08, 1.0);

    o = vec4(scene + inscatter, 1.0);
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
    gcv.width = rw; gcv.height = rh;
    /* preserveDrawingBuffer 必须关：开着时浏览器每帧要多留一份整屏副本，
     * 弱显卡上一次就够掉十几帧。全仓没有任何地方在渲染之后单独去读 gcv——
     * art.js 和 art-preview.html 都是在同一次任务里紧接着 drawImage，缓冲区还没失效。 */
    gl = gcv.getContext("webgl2", { antialias: true, alpha: false, depth: true,
                                    powerPreference: "high-performance", preserveDrawingBuffer: false });
    if (!gl) { failReason = "浏览器不支持 WebGL2"; return false; }
    /* antialias: true 只是"请求"，能不能拿到 MSAA 得看驱动和浏览器。
     * 这里量一次真实采样数：拿不到就退回硬阈值镂空，别指望 alpha-to-coverage。 */
    msaaSamples = Math.max(1, (gl.getParameter(gl.SAMPLES) | 0));
    a2cOK = msaaSamples > 1 && typeof gl.SAMPLE_ALPHA_TO_COVERAGE === "number";
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);   // 几何体双面可见：法线决定明暗，省得逐个检查绕序
    skyProg = program(SKY_VS, SKY_FS, []);
    litProg = program(LIT_VS, LIT_FS, ["aPos", "aNor", "aUV", "aCol", "aSway"]);
    seaProg = program(SEA_VS, SEA_FS, ["aPos", "aNor", "aUV"]);
    ptProg = program(POINT_VS, POINT_FS, ["aPos", "aCol", "aSize", "aParam"]);
    glowProg = program(GLOW_VS, GLOW_FS, ["aPos", "aNor", "aUV", "aCol"]);
    shadowProg = program(SHADOW_VS, SHADOW_FS, ["aPos"]);
    sunShadowProg = program(SUNSHADOW_VS, SUNSHADOW_FS, ["aPos"]);
    volProg = program(VOL_VS, VOL_FS, []);
    shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    sunShadowFbo = gl.createFramebuffer();
    dummyShadow = makeDepthCube(1);
    dummySunShadow = makeDepth2D(1);
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
    /* 顺便记一个世界空间 AABB：调试要看几何体到底建在哪，
     * 以后做批次级距离剔除也能直接用（不用再扫一遍顶点）。 */
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    const d = builder.d;
    for (let i = 0; i < d.length; i += STRIDE) {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    const m = {
      vao, buf, count: builder.count, verts: builder.count, keep: builder.d.length,
      bounds: { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] }
    };
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

  /* ---------------- 贴图 ----------------
   * opts.mip === false：不生成 mipmap 链。动态贴图（显示器 / 终端 / 白板）每秒要
   * 重传十几次，generateMipmap 每次都要重建整条链，是同步的卡顿尖峰；
   * 这几张图在屏幕上都很小且近正交，不用 mip 也看不出闪烁。 */
  function texFromCanvas(cv, opts) {
    opts = opts || {};
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      opts.mip === false ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    if (opts.mip !== false) gl.generateMipmap(gl.TEXTURE_2D);
    if (anisoExt && !opts.clamp) {
      gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
    }
    return t;
  }
  function updateTex(t, cv, mip) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    if (mip !== false) gl.generateMipmap(gl.TEXTURE_2D);
  }

  /* ============================================================
   *  渲染
   * ============================================================ */
  const scenes = {};
  function register(id, builder) { scenes[id] = builder; }
  function has(id) { return !!scenes[id] && init(); }

  /** 阴影尺寸上限 / PCF 采样数。尺寸一变，已建好的 cubemap 就废了，必须回收重来，
   *  否则换档只是白白多占一份显存。别在每帧里调它。 */
  function setShadowQuality(cap, taps) {
    const c = cap || 0, tp = taps || 8;
    if (c === shadowSizeCap && tp === shadowTaps) return;
    shadowSizeCap = c; shadowTaps = tp;
    if (!gl) return;
    const done = [];
    for (const id in scenes) {
      const sc = scenes[id] && scenes[id].__built;
      if (!sc || done.indexOf(sc) >= 0) continue;
      if (sc.__shadow === undefined && sc.__sunShadow === undefined) continue;
      done.push(sc);                      // 别名共用同一个场景对象，别重复删
      if (sc.__shadow && sc.__shadow.tex) gl.deleteTexture(sc.__shadow.tex);
      if (sc.__sunShadow && sc.__sunShadow.tex) gl.deleteTexture(sc.__sunShadow.tex);
      sc.__shadow = undefined;            // 下一帧按新尺寸懒重建
      sc.__sunShadow = undefined;
    }
  }

  let cur = null, curId = "", curScene = null;
  let camOverride = null;   // 预览页的自由相机：场景 update 之后覆盖 cam
  let lastDrawMs = 0;
  const scratchMat = M.ident();
  const scratchNMat = new Float32Array(9);   // setBatch 的法线矩阵落脚点，别再每批新建
  const UV_ONE = new Float32Array([1, 1]);
  /* applyLights 的点光缓冲：10 盏灯上限（超出会被静默丢掉，所以超了要吼一声），每帧只是覆写同一块内存 */
  const PT_MAX = 10;
  const ptPos = new Float32Array(PT_MAX * 3);
  const ptCol = new Float32Array(PT_MAX * 3);
  const ptRng = new Float32Array(PT_MAX);
  let ptWarned = false;


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

  /* 2D 深度贴图：太阳（平行光）阴影用。和 cubemap 一样挂 COMPARE_REF_TO_TEXTURE，
   * 采样器类型必须是 sampler2DShadow。 */
  function makeDepth2D(size) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    return tex;
  }

  /* ---------------- 太阳阴影（正交深度图） ----------------
   * 场景在 `sunShadow: { center, extent, distance, far, size, bias }` 里报名才建：
   * 一次建好缓存住（大世界的几何是静态的），画质档位一变就回收重来。
   * 方向取 `lights.sun`（和着色器里的 uSunDir 是同一个向量，指向太阳）。
   * 太阳会动（视角里可以写漂移）时，draw() 会按方向差复用同一张深度图重画。
   * 正交框只罩住镜头附近那一块——方向光阴影不需要覆盖整张地图，
   * 罩得越紧 texel 越细，教堂门前 55m 见方用 2048 的图差不多 2.7cm 一个像素。 */
  function buildSunShadow(sc) {
    const cfg = sc.sunShadow;
    if (!cfg || !gl || !sunShadowProg) { sc.__sunShadow = null; return; }
    const size = shadowSizeCap ? Math.min(cfg.size || 2048, shadowSizeCap) : (cfg.size || 2048);
    const tex = makeDepth2D(size);
    sc.__sunShadow = {
      tex, size, vp: null, far: 1,
      bias: cfg.bias === undefined ? 0.0006 : cfg.bias,
      sun: null
    };
    renderSunShadow(sc, tex, size);
  }

  /** 把太阳阴影重新烘进 tex（首次建图、太阳移动时复用同一张图重画） */
  function renderSunShadow(sc, tex, size) {
    const cfg = sc.sunShadow;
    const center = cfg.center || (sc.cam && sc.cam.target) || [0, 0, 0];
    const extent = cfg.extent || 42;
    const dist = cfg.distance || extent * 2.6;
    const far = cfg.far || dist + extent * 2.5;
    const dir = norm3((sc.lights && sc.lights.sun) || [0.3, 0.9, 0.3]);
    try {
      setA2C(false);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sunShadowFbo);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.viewport(0, 0, size, size);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(sunShadowProg.p);
      const eye = [center[0] + dir[0] * dist, center[1] + dir[1] * dist, center[2] + dir[2] * dist];
      const up = Math.abs(dir[1]) > 0.985 ? [0, 0, 1] : [0, 1, 0];
      const view = M.lookAt(eye, center, up);
      const proj = M.ortho(-extent, extent, -extent, extent, 0.5, far);
      const vp = M.mul(proj, view);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("sun shadow FBO incomplete");
      }
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(sunShadowProg.u.uVP, false, vp);
      for (const b of sc.batches) {
        /* 和点光阴影同一套筛选：半透明 / 明确不投影的批次不写深度。
         * 树叶这类镂空批次照写（贴图 alpha 不参与，阴影会按整片 quad 算），
         * 近看会稍微「厚」一点，但比完全没影子强。 */
        if (b.noShadow || b.blend || (b.opacity !== undefined && b.opacity < 0.999)) continue;
        gl.uniformMatrix4fv(sunShadowProg.u.uModel, false, b.model || scratchMat);
        gl.bindVertexArray(b.mesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, b.mesh.count);
      }
      const sh = sc.__sunShadow;
      if (sh) {
        sh.vp = vp;
        sh.far = far;
        sh.sun = dir.slice();
      }
    } catch (e) {
      console.error("[A3D] 太阳阴影构建失败", e);
      if (!sc.__sunShadow || !sc.__sunShadow.vp) sc.__sunShadow = null;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, rw, rh);
      gl.bindVertexArray(null);
    }
  }

  function buildShadow(sc) {
    const sh = sc.shadow;
    if (!sh || !gl || !shadowProg) { sc.__shadow = null; return; }
    const size = shadowSizeCap ? Math.min(sh.size || 1024, shadowSizeCap) : (sh.size || 1024);
    const far = sh.far || 9;
    const tex = makeDepthCube(size);
    try {
      setA2C(false);            // 阴影 pass 不需要也绝不能带 alpha-to-coverage
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
      sc.__shadow = { tex, far, idx: sh.index || 0, size,
        bias: sh.bias === undefined ? 0.0025 : sh.bias };
    } catch (e) {
      console.error("[A3D] 阴影构建失败", e);
      sc.__shadow = null;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, rw, rh);
      gl.bindVertexArray(null);
    }
  }

  /* alpha-to-coverage 是全局 GL 状态，逐批次切会很啰嗦，缓存一下当前值再改。
   * 只有镂空批次会打开它，其它（天空 / 海 / 粒子 / 发光片 / 阴影）一律关掉。 */
  let a2cOn = false;
  function setA2C(on) {
    const want = !!(on && a2cOK);
    if (want === a2cOn) return;
    a2cOn = want;
    if (want) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    else gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }

  function setBatch(b, t, view) {
    const P = litProg, u = P.u;
    gl.uniformMatrix4fv(u.uModel, false, b.model || scratchMat);
    gl.uniformMatrix3fv(u.uNMat, false, M.normalMatInto(b.model || scratchMat, scratchNMat));
    gl.uniform1f(u.uUseTex, b.tex ? 1 : 0);
    gl.uniform1f(u.uUnlit, b.unlit ? 1 : 0);
    gl.uniform1f(u.uOpacity, b.opacity === undefined ? 1 : b.opacity);
    gl.uniform1f(u.uSpec, b.spec === undefined ? 0.12 : b.spec);
    gl.uniform1f(u.uRim, b.rim === undefined ? 0.35 : b.rim);
    gl.uniform1f(u.uEmisBoost, b.emisBoost === undefined ? 1 : b.emisBoost);
    gl.uniform1f(u.uCutout, b.cutout ? 1 : 0);
    gl.uniform1f(u.uUVRand, b.uvRand ? 1 : 0);
    gl.uniform3fv(u.uTint, b.tint || [1, 1, 1]);
    gl.uniform3fv(u.uEmissive, b.emissive || [0, 0, 0]);
    const off = b.uvAnim ? b.uvAnim(t) : (b.uvOff || [0, 0]);
    gl.uniform2fv(u.uUVOff, off);
    gl.uniform2fv(u.uUVScale, UV_ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, b.tex || null);
    gl.uniform1i(u.uTex, 0);
    if (b.blend === "add") { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); }
    else if (b.blend === "alpha") { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
    else gl.disable(gl.BLEND);
    /* 镂空批次走 alpha-to-coverage：覆盖度按贴图 alpha 抖动，边缘由 MSAA 采出来。
     * 这是逐批的状态，别的批次必须关掉，否则半透明混合会被它搅乱。 */
    const useA2C = !!(b.cutout && a2cOK);
    setA2C(useA2C);
    gl.uniform1f(u.uA2C, useA2C ? 1 : 0);
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
    const n = Math.min(PT_MAX, pts.length);
    if (pts.length > PT_MAX && !ptWarned) {
      ptWarned = true;
      console.warn("[A3D] 场景点光源 " + pts.length + " 个，超过上限 " + PT_MAX + "，多余的会被忽略");
    }
    gl.uniform1i(u.uPointN, n);
    if (n) {
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        ptPos[i * 3] = p.pos[0]; ptPos[i * 3 + 1] = p.pos[1]; ptPos[i * 3 + 2] = p.pos[2];
        const inten = p.inten === undefined ? 1 : p.inten;
        ptCol[i * 3] = p.col[0] * inten;
        ptCol[i * 3 + 1] = p.col[1] * inten;
        ptCol[i * 3 + 2] = p.col[2] * inten;
        ptRng[i] = p.range || 5;
      }
      gl.uniform3fv(u.uPointPos, ptPos);
      gl.uniform3fv(u.uPointCol, ptCol);
      gl.uniform1fv(u.uPointRange, ptRng);
    }
    const sh = scene.__shadow;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sh ? sh.tex : dummyShadow);
    gl.uniform1i(u.uShadowMap, 3);
    gl.uniform1f(u.uShadowOn, sh ? 1 : 0);
    gl.uniform1i(u.uShadowIdx, sh ? sh.idx : 0);
    gl.uniform1i(u.uShadowTaps, shadowTaps);
    gl.uniform1f(u.uShadowFar, sh ? sh.far : 1);
    gl.uniform1f(u.uShadowBias, sh ? sh.bias : 0);
    /* 太阳阴影：没建的场景绑 1×1 深度图、uSunShadowOn=0，着色器直接跳过采样。 */
    const ss = scene.__sunShadow;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, ss ? ss.tex : dummySunShadow);
    gl.uniform1i(u.uSunMap, 4);
    gl.uniform1f(u.uSunShadowOn, ss ? 1 : 0);
    gl.uniformMatrix4fv(u.uSunVP, false, ss ? ss.vp : scratchMat);
    gl.uniform1f(u.uSunShadowBias, ss ? ss.bias : 0);
    gl.uniform1f(u.uSunTexel, ss ? 1 / ss.size : 1);
    gl.uniform1f(u.uSunWrap, L.sunWrap === undefined ? 1 : L.sunWrap);
  }

  /* 天空只在「这一帧还没有任何几何体写过深度」的像素上着色。
   * depthRange 压到 [1,1]、depthFunc 用 EQUAL，深度缓冲里仍是清屏值 1.0 的地方才通过：
   * 窗洞 / 纯天空区域照样出画面，被墙和家具挡住的那些像素连一次 hash 都省掉。
   * 调用方负责把它排在实体几何之后、半透明批次之前（见 render）。 */
  function drawSky(scene, t) {
    const s = scene.sky || {};
    const u = skyProg.u;
    setA2C(false);
    gl.useProgram(skyProg.p);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.EQUAL);
    gl.depthRange(1, 1);
    gl.disable(gl.BLEND);
    gl.uniform3fv(u.uTop, s.top || [0.02, 0.03, 0.05]);
    gl.uniform3fv(u.uBot, s.bot || [0.05, 0.06, 0.09]);
    gl.uniform3fv(u.uGlow, s.glow || [0.2, 0.3, 0.4]);
    /* 注意：各场景的 sky.sun 都是 [x, y] 两元组（见 worlds*.js），uniform3fv 收到
     * 长度 2 的数组会报 INVALID_VALUE 并且整条上传作废——uSun 一直是 (0,0,0)。
     * 这里照原样跳过，保证观感一丝不变，同时把每帧的控制台刷屏去掉。
     * 真要让太阳位置生效得改美术侧的数据（那是单独一次观感改动）。 */
    if (s.sun && s.sun.length >= 3) gl.uniform3fv(u.uSun, s.sun);
    gl.uniform1f(u.uMode, s.mode || 0);
    gl.uniform1f(u.uHorizon, s.horizon === undefined ? 0.5 : s.horizon);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uGrain, 0.02);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthRange(0, 1);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
  }

  function drawSea(b, t) {
    const u = seaProg.u;
    setA2C(false);
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
    setA2C(false);          // 粒子是软边贴图，不参与 alpha-to-coverage
    gl.useProgram(ptProg.p);
    gl.uniformMatrix4fv(u.uProj, false, cur.proj);
    gl.uniformMatrix4fv(u.uView, false, cur.view);
    gl.uniform1f(u.uTime, t);
    // 点精灵的像素尺寸要按实际绘制缓冲算，否则降分辨率后气泡会显得偏大
    gl.uniform1f(u.uPix, rh / (2 * Math.tan(cur.fov / 2)));
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
    setA2C(false);          // 发光片是加法混合，开 A2C 会把覆盖度也乘进去
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

  /* ---------------- 体积光的离屏目标 ---------------- */
  function destroyVolTargets() {
    if (volColorTex) gl.deleteTexture(volColorTex);
    if (volDepthTex) gl.deleteTexture(volDepthTex);
    if (volMsaaColorRb) gl.deleteRenderbuffer(volMsaaColorRb);
    if (volMsaaDepthRb) gl.deleteRenderbuffer(volMsaaDepthRb);
    if (volFbo) gl.deleteFramebuffer(volFbo);
    if (volMsaaFbo) gl.deleteFramebuffer(volMsaaFbo);
    volColorTex = volDepthTex = null;
    volMsaaColorRb = volMsaaDepthRb = null;
    volFbo = volMsaaFbo = null;
    volW = volH = 0;
  }

  function texParam2D(minFilter) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function ensureVolTargets() {
    if (volFbo && volW === rw && volH === rh) return;
    destroyVolTargets();
    volW = rw; volH = rh;
    volColorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, volColorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, volW, volH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    texParam2D(gl.LINEAR);
    volDepthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, volDepthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, volW, volH, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    texParam2D(gl.NEAREST);
    volFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, volFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, volColorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, volDepthTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("[A3D] 体积光 FBO 不完整");
      destroyVolTargets();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }
    if (msaaSamples > 1) {
      volMsaaFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, volMsaaFbo);
      volMsaaColorRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, volMsaaColorRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, gl.RGBA8, volW, volH);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, volMsaaColorRb);
      volMsaaDepthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, volMsaaDepthRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, gl.DEPTH_COMPONENT24, volW, volH);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, volMsaaDepthRb);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        // MSAA 目标失败就退回单采样，宁可锯齿也别整块黑
        gl.deleteFramebuffer(volMsaaFbo); volMsaaFbo = null;
        gl.deleteRenderbuffer(volMsaaColorRb); volMsaaColorRb = null;
        gl.deleteRenderbuffer(volMsaaDepthRb); volMsaaDepthRb = null;
      }
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** 场景画完之后的体积光 pass：读场景颜色 + 深度，沿视线步进太阳阴影贴图 */
  function drawVolumetric(scene, t, invVP) {
    const v = scene.volumetric;
    const u = volProg.u;
    setA2C(false);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.useProgram(volProg.p);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, volColorTex);
    gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, volDepthTex);
    gl.uniform1i(u.uDepth, 1);
    const sh = scene.__sunShadow;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sh ? sh.tex : dummySunShadow);
    gl.uniform1i(u.uSunMap, 2);
    gl.uniform1i(u.uSunOn, sh && sh.vp ? 1 : 0);
    gl.uniformMatrix4fv(u.uSunVP, false, sh && sh.vp ? sh.vp : scratchMat);
    gl.uniform1f(u.uSunBias, sh ? sh.bias : 0);
    gl.uniformMatrix4fv(u.uInvVP, false, invVP);
    gl.uniform1f(u.uDensity, v.density === undefined ? 0.03 : v.density);
    gl.uniform1f(u.uG, v.g === undefined ? 0.55 : v.g);
    gl.uniform1f(u.uHeightY, v.heightY === undefined ? 0 : v.heightY);
    gl.uniform1f(u.uFalloff, v.falloff === undefined ? 0.12 : v.falloff);
    gl.uniform1f(u.uMaxDist, v.maxDist === undefined ? 80 : v.maxDist);
    gl.uniform1f(u.uIntensity, v.intensity === undefined ? 1 : v.intensity);
    gl.uniform1f(u.uTime, t || 0);
    gl.uniform1i(u.uSteps, Math.max(4, Math.min(64, v.steps || volSteps)));
    const L = scene.lights || {};
    gl.uniform3fv(u.uSunDir, norm3(L.sun || [0.4, 0.8, 0.3]));
    gl.uniform3fv(u.uSunCol, L.sunCol || [0.6, 0.62, 0.7]);
    gl.uniform3fv(u.uCam, cur ? cur.eye : [0, 0, 0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  function render(scene, t) {
    const cam = scene.cam || {};
    const eye = cam.eye || [0, 1.6, 3];
    const target = cam.target || [0, 1.4, -3];
    const fov = (cam.fov || 42) * D2R;
    const aspect = rw / rh;
    /* 体积光要读场景颜色和深度，所以这一帧先画进离屏 FBO，最后再合成回画布 */
    let useVol = !!(scene.volumetric && volProg);
    if (useVol) {
      ensureVolTargets();
      if (!volFbo) useVol = false;
    }
    if (useVol) gl.bindFramebuffer(gl.FRAMEBUFFER, volMsaaFbo || volFbo);
    gl.viewport(0, 0, rw, rh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    curScene = scene;
    /* 远裁剪面默认 120m（室内和小场景够用）；大世界这种要看海湾对岸的场景
     * 在 cam.far 里单独写远一点，别为了几个远景把近处精度一起拉低。 */
    const far = cam.far || 120;
    const proj = M.perspective(fov, aspect, 0.05, far);
    const view = M.lookAt(eye, target, [0, 1, 0]);
    cur = { proj, view, eye, fov };
    scene.time = t;

    /* 天空默认最后画（见 drawSky 的注释）：被墙挡住的像素直接跳过，省掉大半屏 hash。
     * 个别场景如果靠「先铺天、再让半透明东西盖上去」出效果，可以在场景描述符里写
     * skyFirst: true 退回旧顺序。 */
    const skyFirst = scene.skyFirst === true;
    if (skyFirst) drawSky(scene, t);

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

    /* 天空（后置版本）：必须在半透明之前，否则会盖住玻璃和光柱 */
    if (!skyFirst) {
      drawSky(scene, t);
      gl.useProgram(litProg.p);   // drawSky 换了 program，半透明批次还得用 litProg
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

    if (useVol) {
      /* MSAA 目标先解析到带纹理的 FBO（WebGL2 的 blit 会做 resolve） */
      if (volMsaaFbo) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, volMsaaFbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, volFbo);
        gl.blitFramebuffer(0, 0, volW, volH, 0, 0, volW, volH,
          gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, rw, rh);
      const invVP = M.invert(M.mul(proj, view));
      drawVolumetric(scene, t, invVP);
    }
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
    if (sc.sunShadow) {
      const sh = sc.__sunShadow;
      if (sh === undefined) buildSunShadow(sc);
      else if (sh && sh.sun && sh.vp) {
        /* 太阳在动（视角写 sunDrift 或面板里拖）就复用同一张图重画；
         * 夹角超过约 0.8° 才重画，并且限到 ~7Hz，别把整张地图每帧烘一遍。 */
        const s = sc.lights.sun;
        const dot = sh.sun[0] * s[0] + sh.sun[1] * s[1] + sh.sun[2] * s[2];
        if (dot < 0.9999 && t - (sc.__sunRefitT || -1e9) > 0.14) {
          sc.__sunRefitT = t;
          renderSunShadow(sc, sh.tex, sh.size);
        }
      }
    }
    const t0 = performance.now();
    render(sc, t);
    /* 贴到目标画布的真实像素尺寸，而不是写死 1600×900：
     * 游戏那边会传一块按「画布倍率」放大的离屏层（1080p 全屏时是 1920×1080），
     * 3D 超采样到同样尺寸才能真正 1:1，否则多出来的细节会被这一步重新缩回去。
     * 预览页传的是 1600×900 的画布，行为和以前完全一样。 */
    ctx.drawImage(gcv, 0, 0, ctx.canvas.width, ctx.canvas.height);
    lastDrawMs = performance.now() - t0;   // 只是 CPU 提交耗时，GPU 是异步的
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
    math: { v3: (x, y, z) => [x || 0, y || 0, z || 0] },

    /* ---------------- 画质 ---------------- */
    setRenderScale: k => applyScale(k),
    get renderScale() { return renderScale; },
    get renderSize() { return [rw, rh]; },
    setShadowQuality,
    get shadowTaps() { return shadowTaps; },
    /** 体积光的步进次数（画质档位用）：低 10 / 中 18 / 高 28 */
    setVolumetricQuality(steps) {
      const s = Math.max(4, Math.min(64, steps | 0 || 24));
      if (s === volSteps) return;
      volSteps = s;
      for (const id in scenes) {
        const sc = scenes[id] && scenes[id].__built;
        if (sc && sc.volumetric) sc.volumetric.steps = s;
      }
    },
    get volumetricSteps() { return volSteps; },
    /** 实际拿到的多重采样数（1 = 没有 MSAA）与 alpha-to-coverage 可用性 */
    get samples() { return msaaSamples; },
    get alphaToCoverage() { return a2cOK; },
    /** 上一次 draw 的 CPU 提交耗时（毫秒）；GPU 是异步的，这只是个参考量 */
    get lastDrawMs() { return lastDrawMs; },
    /** 调试 / 性能面板用：当前这一帧画了多少批次与顶点 */
    stats() {
      const sc = curScene;
      const sh = (sc && sc.__shadow) || null;   // 报告实际建出来的边长，不是上限
      const base = { scale: renderScale, shadow: sh ? sh.size : 0, taps: shadowTaps };
      if (!sc) return Object.assign({ draws: 0, verts: 0 }, base);
      let draws = 0, verts = 0;
      const add = b => { if (b && b.mesh) { draws++; verts += b.mesh.count; } };
      for (const b of sc.batches) add(b);
      for (const d of sc.dyn) add(d.batch);
      for (const b of sc.over) add(b);
      for (const b of sc.glows || []) add(b);
      for (const p of sc.points || []) add(p);
      return Object.assign({ draws, verts }, base);
    }
  };
})();

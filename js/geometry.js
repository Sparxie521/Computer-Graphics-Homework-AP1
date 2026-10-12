/**
 * geometry.js —— 几何数据生成（混沌游戏 / 递归细分 / 任意 n 边形 / 四面体 Gasket）
 *
 * 所有函数返回 Float32Array 顶点缓冲数据，不含任何 WebGL 调用，便于单测与复用。
 * 只通过 window.Geom 命名空间暴露，不污染全局。
 */
(function (global) {
  'use strict';

  // Sierpinski 垫片基础三角形（混沌游戏与递归细分共用同一组顶点，保证两种算法结果一致）
  const BASE_TRIANGLE = [
    [-1.4, -0.85],
    [1.4, -0.85],
    [0.0, 1.45],
  ];

  /** 生成正 n 边形顶点（外接圆半径 radius），顶角朝上 */
  function polygonVertices(n, radius, phase) {
    const r = radius || 1.0;
    const p = phase === undefined ? -Math.PI / 2 : phase;
    const v = [];
    for (let i = 0; i < n; i++) {
      const a = p + (i * 2 * Math.PI) / n;
      v.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return v;
  }

  /**
   * 混沌游戏（Chaos Game）：随机迭代映射 p ← p + r·(v − p)
   * @param {number} n         输出点数（作业要求 ≥ 5000）
   * @param {Array}  vertices  多边形顶点 [[x,y], ...]
   * @param {number} ratio     收缩比 r，三角形取 0.5 得经典 Sierpinski
   * @returns {{positions:Float32Array, count:number}}
   */
  function chaosPoints(n, vertices, ratio) {
    const k = vertices.length;
    const out = new Float32Array(n * 2);
    // 初始点随机（取在多边形包围盒内，收敛速度不影响最终吸引子）
    let x = (Math.random() - 0.5) * 2.0;
    let y = (Math.random() - 0.5) * 2.0;
    for (let i = 0; i < n; i++) {
      const v = vertices[(Math.random() * k) | 0];
      x += ratio * (v[0] - x);
      y += ratio * (v[1] - y);
      out[2 * i] = x;
      out[2 * i + 1] = y;
    }
    return { positions: out, count: n };
  }

  /**
   * 递归细分生成 Sierpinski 垫片（中点法）
   * 三角形 (a,b,c) 取三边中点连成 3 个角上的小三角形，丢弃中间的一个，递归。
   * @param {number} depth 递归深度 d → 3^d 个三角形
   * @returns {{points:Float32Array, edges:Float32Array, faces:Float32Array,
   *            counts:{points:number,edges:number,faces:number}}}
   *          points 为去重后的顶点（点云模式），edges 为去重边（线框），faces 为三角形（实体）
   */
  function subdivideGasket(depth) {
    // —— 顶点索引池：中点由相同表达式算出，浮点位完全相同，可精确去重 ——
    const verts = [];
    const idxMap = new Map();
    const addV = (x, y) => {
      const key = x + ',' + y;
      let i = idxMap.get(key);
      if (i === undefined) {
        i = verts.length;
        verts.push([x, y]);
        idxMap.set(key, i);
      }
      return i;
    };

    const tris = []; // 三角形顶点索引三元组
    const rec = (a, b, c, d) => {
      if (d === 0) { tris.push([a, b, c]); return; }
      const pa = verts[a], pb = verts[b], pc = verts[c];
      const mab = addV((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2);
      const mac = addV((pa[0] + pc[0]) / 2, (pa[1] + pc[1]) / 2);
      const mbc = addV((pb[0] + pc[0]) / 2, (pb[1] + pc[1]) / 2);
      rec(a, mab, mac, d - 1);
      rec(mab, b, mbc, d - 1);
      rec(mac, mbc, c, d - 1);
    };

    const t = BASE_TRIANGLE;
    rec(addV(t[0][0], t[0][1]), addV(t[1][0], t[1][1]), addV(t[2][0], t[2][1]), depth);

    // 实体：三角形顶点位置
    const faces = new Float32Array(tris.length * 6);
    for (let i = 0; i < tris.length; i++) {
      const [a, b, c] = tris[i];
      faces.set(verts[a], i * 6);
      faces.set(verts[b], i * 6 + 2);
      faces.set(verts[c], i * 6 + 4);
    }

    // 线框：按“小下标在前”的键去重共享边
    const edgeSet = new Set();
    for (let i = 0; i < tris.length; i++) {
      const [a, b, c] = tris[i];
      edgeSet.add(a < b ? a + ':' + b : b + ':' + a);
      edgeSet.add(b < c ? b + ':' + c : c + ':' + b);
      edgeSet.add(a < c ? a + ':' + c : c + ':' + a);
    }
    const edges = new Float32Array(edgeSet.size * 4);
    let ei = 0;
    for (const key of edgeSet) {
      const [i, j] = key.split(':').map(Number);
      edges.set(verts[i], ei * 4);
      edges.set(verts[j], ei * 4 + 2);
      ei++;
    }

    // 点云：全部去重顶点
    const points = new Float32Array(verts.length * 2);
    for (let i = 0; i < verts.length; i++) points.set(verts[i], i * 2);

    return {
      points,
      edges,
      faces,
      counts: { points: verts.length, edges: edgeSet.size * 2, faces: tris.length * 3 },
    };
  }

  /** 四面体 Gasket（扩展 E3）：递归细分一个正四面体，为 AP2 三维变换做铺垫 */
  function subdivideTetra(depth) {
    // 正四面体 4 顶点（外接球半径 1）
    const base = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => {
      const l = Math.sqrt(3);
      return [p[0] / l, p[1] / l, p[2] / l];
    });

    const verts = [];
    const idxMap = new Map();
    const addV = (x, y, z) => {
      const key = x + ',' + y + ',' + z;
      let i = idxMap.get(key);
      if (i === undefined) {
        i = verts.length;
        verts.push([x, y, z]);
        idxMap.set(key, i);
      }
      return i;
    };
    // 中点缓存：相邻四面体共享边，保证同一个点只生成一次
    const midCache = new Map();
    const mid = (a, b) => {
      const key = a < b ? a + ':' + b : b + ':' + a;
      let m = midCache.get(key);
      if (m === undefined) {
        const pa = verts[a], pb = verts[b];
        m = addV((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2);
        midCache.set(key, m);
      }
      return m;
    };

    // 四面体 (a,b,c,d) 拆成 4 个角上的小四面体（挖去中间八面体），
    // 与 2D 垫片“取角丢中”是同一思想在三维的推广。
    const quads = []; // 每个小四面体的 4 个顶点索引
    const rec = (a, b, c, d, dep) => {
      if (dep === 0) { quads.push([a, b, c, d]); return; }
      const ab = mid(a, b), ac = mid(a, c), ad = mid(a, d);
      const bc = mid(b, c), bd = mid(b, d), cd = mid(c, d);
      rec(a, ab, ac, ad, dep - 1);
      rec(b, ab, bc, bd, dep - 1);
      rec(c, ac, bc, cd, dep - 1);
      rec(d, ad, bd, cd, dep - 1);
    };

    const ia = addV(base[0][0], base[0][1], base[0][2]);
    const ib = addV(base[1][0], base[1][1], base[1][2]);
    const ic = addV(base[2][0], base[2][1], base[2][2]);
    const id = addV(base[3][0], base[3][1], base[3][2]);
    rec(ia, ib, ic, id, depth);

    // —— 生成面，并修正每个面的外法线朝向 ——
    // 对四面体 (p,q,r,s)，4 个面各有一个“对面的顶点” inside。
    // 若 cross(e1,e2) 指向 inside 一侧，则翻转绕序，保证法线朝外。
    const faceData = []; // [p,q,r] 索引三元组（绕序已朝外）
    const normalData = []; // 每面对应的单位法线
    const emitFace = (p, q, r, inside) => {
      let a = p, b = q, c = r;
      const vp = verts[a], vq = verts[b], vr = verts[c];
      const e1 = [vq[0] - vp[0], vq[1] - vp[1], vq[2] - vp[2]];
      const e2 = [vr[0] - vp[0], vr[1] - vp[1], vr[2] - vp[2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1];
      let ny = e1[2] * e2[0] - e1[0] * e2[2];
      let nz = e1[0] * e2[1] - e1[1] * e2[0];
      const vi = verts[inside];
      const cx = (vp[0] + vq[0] + vr[0]) / 3, cy = (vp[1] + vq[1] + vr[1]) / 3, cz = (vp[2] + vq[2] + vr[2]) / 3;
      const inDir = (vi[0] - cx) * nx + (vi[1] - cy) * ny + (vi[2] - cz) * nz;
      if (inDir > 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; } // 法线指向内部 → 翻转
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      faceData.push([a, b, c]);
      normalData.push([nx / len, ny / len, nz / len]);
    };
    for (let i = 0; i < quads.length; i++) {
      const [a, b, c, d] = quads[i];
      emitFace(a, c, b, d); // 面 abc，对顶点 d
      emitFace(a, b, d, c); // 面 abd，对顶点 c
      emitFace(a, d, c, b); // 面 adc，对顶点 b
      emitFace(b, c, d, a); // 面 bcd，对顶点 a
    }

    // 实体缓冲：位置 + 法线交错（stride 6 floats），用于简单漫反射明暗
    const faces = new Float32Array(faceData.length * 18);
    for (let i = 0; i < faceData.length; i++) {
      const [p, q, r] = faceData[i];
      const n = normalData[i];
      let off = i * 18;
      for (const vi of [p, q, r]) {
        const v = verts[vi];
        faces[off++] = v[0]; faces[off++] = v[1]; faces[off++] = v[2];
        faces[off++] = n[0]; faces[off++] = n[1]; faces[off++] = n[2];
      }
    }

    // 线框：去重边
    const edgeSet = new Set();
    for (let i = 0; i < quads.length; i++) {
      const [a, b, c, d] = quads[i];
      edgeSet.add(a < b ? a + ':' + b : b + ':' + a);
      edgeSet.add(a < c ? a + ':' + c : c + ':' + a);
      edgeSet.add(a < d ? a + ':' + d : d + ':' + a);
      edgeSet.add(b < c ? b + ':' + c : c + ':' + b);
      edgeSet.add(b < d ? b + ':' + d : d + ':' + b);
      edgeSet.add(c < d ? c + ':' + d : d + ':' + c);
    }
    const edges = new Float32Array(edgeSet.size * 6);
    let ei = 0;
    for (const key of edgeSet) {
      const [i, j] = key.split(':').map(Number);
      const a = verts[i], b = verts[j];
      edges.set(a, ei * 6);
      edges.set(b, ei * 6 + 3);
      ei++;
    }

    // 点云：全部顶点
    const points = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) points.set(verts[i], i * 3);

    return {
      points,
      edges,
      faces,
      counts: { points: verts.length, edges: edgeSet.size * 2, faces: faceData.length * 3 },
    };
  }

  global.Geom = {
    BASE_TRIANGLE,
    polygonVertices,
    chaosPoints,
    subdivideGasket,
    subdivideTetra,
  };
})(window);

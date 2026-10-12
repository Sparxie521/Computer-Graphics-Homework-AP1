/**
 * main.js —— 主程序：WebGL 初始化、状态管理、渲染循环、交互联动
 *
 * 分层：geometry.js 生成数据 → 本文件上传 VBO → interaction.js 收集输入 → ui.js 暴露控件。
 * 渲染状态集中在 state 对象中，不用全局变量散落各处。
 */
(function (global) {
  'use strict';

  // ============================== 状态 ==============================
  const state = {
    scene: 'gasket',              // gasket | tetra | fractal
    algorithm: 'chaos',           // chaos | subdiv
    mode: 'points',               // points | lines | triangles
    nPoints: 8000,                // 混沌游戏点数（作业要求 ≥ 5000）
    ngon: 3,                      // 扩展 E1：n 边形
    ratio: 0.5,                   // 扩展 E1：收缩比（n=3,r=0.5 为经典 Sierpinski）
    depth: 5,                     // 递归深度（0–8，3^d 个三角形）
    pointSize: 4,
    paletteIdx: 0,                // 4 套配色方案
    tetraDepth: 3,                // 扩展 E3
    tetraAuto: true,
    fractal: { kind: 'mandelbrot', iter: 200, palIdx: 0, c: [-0.8, 0.156], anim: false },
    cam2d: { cx: 0, cy: 0, zoom: 0.6 },       // 平移/缩放（垫片与分形共用）
    tetra: { rotX: -18, rotY: 24, dist: 4.6 },
    growth: { growing: true, elapsed: 0, last: 0 },  // 逐点生长动画
  };
  const GROW_DURATION = 4000; // 生长动画时长 ms
  const CAM_DEFAULTS = {
    gasket: { cx: 0, cy: 0, zoom: 0.6 },
    fractal: { cx: -0.5, cy: 0, zoom: 0.625 },
  };
  const TETRA_DEFAULT = { rotX: -18, rotY: 24, dist: 4.6 };

  // ============================== 配色 ==============================
  const SCHEMES = [
    { name: '青蓝', bg: [0.035, 0.06, 0.12], point: [0.30, 0.76, 0.97], line: [0.30, 0.76, 0.97], fill: [0.14, 0.55, 0.85] },
    { name: '熔岩', bg: [0.11, 0.05, 0.04], point: [1.00, 0.55, 0.25], line: [1.00, 0.55, 0.25], fill: [0.95, 0.30, 0.15] },
    { name: '霓虹', bg: [0.07, 0.04, 0.13], point: [0.85, 0.40, 1.00], line: [0.85, 0.40, 1.00], fill: [0.55, 0.25, 0.92] },
    { name: '石墨', bg: [0.08, 0.08, 0.09], point: [0.96, 0.96, 0.96], line: [0.88, 0.88, 0.88], fill: [0.45, 0.45, 0.48] },
  ];
  const FPALS = [
    { name: '火焰', c: [[0.02, 0.02, 0.09], [0.92, 0.30, 0.05], [1.00, 0.95, 0.50]] },
    { name: '冰蓝', c: [[0.01, 0.02, 0.09], [0.10, 0.50, 0.95], [0.85, 0.95, 1.00]] },
    { name: '紫罗兰', c: [[0.05, 0.01, 0.11], [0.50, 0.15, 0.95], [1.00, 0.72, 0.96]] },
    { name: '荧光绿', c: [[0.01, 0.06, 0.02], [0.20, 0.90, 0.30], [0.82, 1.00, 0.70]] },
  ];

  // ============================== GL 资源 ==============================
  let canvas = null;
  let gl = null;
  let dpr = 1, cssW = 800, cssH = 600, aspect = 800 / 600;
  let prog2d = null, prog3d = null, progF = null;
  const L2 = {}, L3 = {}, LF = {};
  let geo = null;          // 当前几何：{vboPoints, vboEdges, vboFaces, counts, hasNormal}
  let lastNow = 0, lastStatus = 0;

  // ============================== 工具 ==============================
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const col = (c) => [c[0], c[1], c[2], 1.0];

  /**
   * 上传矩阵到 uniform。
   * 教材 MV.js 以行主序嵌套数组存储矩阵（out[row][col]），flatten 得到行主序序列；
   * 而 WebGL 的 uniformMatrix4fv(transpose=false) 按列主序解析数据，直接上传等于把矩阵转置。
   * 对纯 2D（z=0）转置前后结果相同，但 3D 透视投影会被彻底破坏，因此统一先转置再上传。
   */
  function uploadMat4(loc, m) {
    const f = new Float32Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) f[c * 4 + r] = m[r][c];
    gl.uniformMatrix4fv(loc, false, f);
  }

  // ============================== 几何与缓冲 ==============================
  function createVBO(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  function buildGeometry() {
    if (state.scene === 'gasket') buildGasket();
    else if (state.scene === 'tetra') buildTetra();
    else geo = null; // 分形场景无需顶点缓冲
  }

  function buildGasket() {
    if (state.algorithm === 'chaos') {
      const verts = state.ngon === 3 ? Geom.BASE_TRIANGLE : Geom.polygonVertices(state.ngon, 1.4);
      const g = Geom.chaosPoints(state.nPoints, verts, state.ratio);
      geo = {
        kind: 'chaos',
        vboPoints: createVBO(g.positions),
        vboEdges: null, vboFaces: null, hasNormal: false,
        counts: { points: g.count, edges: 0, faces: 0 },
      };
    } else {
      const g = Geom.subdivideGasket(state.depth);
      geo = {
        kind: 'subdiv',
        vboPoints: createVBO(g.points),
        vboEdges: createVBO(g.edges),
        vboFaces: createVBO(g.faces),
        hasNormal: false,
        counts: g.counts,
      };
    }
    resetGrowth();
  }

  function buildTetra() {
    const g = Geom.subdivideTetra(state.tetraDepth);
    geo = {
      kind: 'tetra',
      vboPoints: createVBO(g.points),
      vboEdges: createVBO(g.edges),
      vboFaces: createVBO(g.faces),
      hasNormal: true,
      counts: g.counts,
    };
  }

  function resetGrowth() {
    state.growth.elapsed = 0;
    state.growth.last = performance.now();
  }

  // ============================== 平移 / 缩放 ==============================
  function pan2D(dx, dy) {
    const cam = state.cam2d;
    const halfH = 1 / cam.zoom, halfW = halfH * aspect;
    cam.cx -= dx * (2 * halfW) / cssW;
    cam.cy += dy * (2 * halfH) / cssH;
  }

  function zoom2D(px, py, factor) {
    const cam = state.cam2d;
    const halfH = 1 / cam.zoom, halfW = halfH * aspect;
    const nx = px / cssW * 2 - 1, ny = 1 - py / cssH * 2;   // 光标 NDC
    const wx = cam.cx + nx * halfW, wy = cam.cy + ny * halfH;
    cam.zoom = clamp(cam.zoom * factor, 0.01, 400);
    const hh = 1 / cam.zoom, hw = hh * aspect;
    cam.cx = wx - nx * hw;    // 保持光标下的世界点不动（锚点缩放）
    cam.cy = wy - ny * hh;
  }

  function resetView() {
    state.cam2d = Object.assign({}, CAM_DEFAULTS[state.scene] || CAM_DEFAULTS.gasket);
    state.tetra = Object.assign({}, TETRA_DEFAULT);
  }

  // ============================== 渲染 ==============================
  function render(now) {
    requestAnimationFrame(render);
    const dt = clamp((now - lastNow) / 1000, 0, 0.05);
    lastNow = now;

    // 逐点生长时钟
    if (state.growth.growing) {
      state.growth.elapsed += now - state.growth.last;
      state.growth.last = now;
    }
    if (state.scene === 'tetra' && state.tetraAuto) state.tetra.rotY += dt * 20;

    const scheme = SCHEMES[state.paletteIdx];
    gl.clearColor(scheme.bg[0], scheme.bg[1], scheme.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | (state.scene === 'tetra' ? gl.DEPTH_BUFFER_BIT : 0));

    if (state.scene === 'gasket') drawGasket(scheme);
    else if (state.scene === 'tetra') drawTetra(scheme);
    else drawFractal(dt);

    if (now - lastStatus > 250) { lastStatus = now; updateStatus(); }
  }

  function bindPos(vbo, size, stride, offset, loc) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  }

  function drawGasket(scheme) {
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(prog2d);

    const cam = state.cam2d, halfH = 1 / cam.zoom, halfW = halfH * aspect;
    const M = ortho(cam.cx - halfW, cam.cx + halfW, cam.cy - halfH, cam.cy + halfH, -1, 1);
    uploadMat4(L2.uTransform, M);
    gl.uniform1f(L2.uPointSize, state.pointSize * dpr);

    const mode = state.mode;
    if (mode === 'points') {
      gl.uniform4fv(L2.uColor, col(scheme.point));
      gl.uniform1f(L2.uRoundPoints, 1);
      bindPos(geo.vboPoints, 2, 0, 0, L2.aPos);
      const drawn = Math.max(0, Math.min(geo.counts.points,
        Math.floor(geo.counts.points * state.growth.elapsed / GROW_DURATION)));
      gl.drawArrays(gl.POINTS, 0, drawn);
    } else if (mode === 'lines') {
      gl.uniform4fv(L2.uColor, col(scheme.line));
      gl.uniform1f(L2.uRoundPoints, 0);
      bindPos(geo.vboEdges, 2, 0, 0, L2.aPos);
      gl.drawArrays(gl.LINES, 0, geo.counts.edges);
    } else {
      gl.uniform4fv(L2.uColor, col(scheme.fill));
      gl.uniform1f(L2.uRoundPoints, 0);
      bindPos(geo.vboFaces, 2, 0, 0, L2.aPos);
      gl.drawArrays(gl.TRIANGLES, 0, geo.counts.faces);
    }
  }

  function drawTetra(scheme) {
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog3d);

    const P = perspective(45, aspect, 0.1, 30);
    const T = translate(0, 0, -state.tetra.dist);
    const model = mult(T, mult(rotateX(state.tetra.rotX), rotateY(state.tetra.rotY)));
    uploadMat4(L3.uProj, P);
    uploadMat4(L3.uModel, model);
    gl.uniform3f(L3.uLightDir, 0.4, 0.8, 0.3);
    gl.uniform1f(L3.uPointSize, state.pointSize * dpr);
    gl.uniform4fv(L3.uColor, col(scheme.point));

    const mode = state.mode;
    if (mode === 'triangles') {
      gl.uniform1f(L3.uFlat, 0);
      bindPos(geo.vboFaces, 3, 24, 0, L3.aPos);
      bindPos(geo.vboFaces, 3, 24, 12, L3.aNormal);
      gl.drawArrays(gl.TRIANGLES, 0, geo.counts.faces);
    } else {
      gl.uniform1f(L3.uFlat, 1);
      gl.disableVertexAttribArray(L3.aNormal);   // 点/线无需法线
      if (mode === 'points') {
        bindPos(geo.vboPoints, 3, 0, 0, L3.aPos);
        gl.drawArrays(gl.POINTS, 0, geo.counts.points);
      } else {
        bindPos(geo.vboEdges, 3, 0, 0, L3.aPos);
        gl.drawArrays(gl.LINES, 0, geo.counts.edges);
      }
    }
  }

  function drawFractal(dt) {
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progF);

    if (state.fractal.anim) {
      // Julia 参数沿圆周漂移，制造流动动画
      state.fractalAnimT = (state.fractalAnimT || 0) + dt * 0.55;
      const th = state.fractalAnimT;
      state.fractal.c[0] = 0.7885 * Math.cos(th);
      state.fractal.c[1] = 0.7885 * Math.sin(th);
    }

    const cam = state.cam2d, pal = FPALS[state.fractal.palIdx].c;
    gl.uniform2f(LF.uCenter, cam.cx, cam.cy);
    gl.uniform1f(LF.uHalfH, 1 / cam.zoom);
    gl.uniform1f(LF.uAspect, aspect);
    gl.uniform1i(LF.uMaxIter, state.fractal.iter);
    gl.uniform1i(LF.uKind, state.fractal.kind === 'julia' ? 1 : 0);
    gl.uniform2f(LF.uC, state.fractal.c[0], state.fractal.c[1]);
    gl.uniform3f(LF.uPal0, pal[0][0], pal[0][1], pal[0][2]);
    gl.uniform3f(LF.uPal1, pal[1][0], pal[1][1], pal[1][2]);
    gl.uniform3f(LF.uPal2, pal[2][0], pal[2][1], pal[2][2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);   // 全屏三角形，无顶点缓冲
  }

  // ============================== 状态栏 ==============================
  const fmt = (n) => n.toLocaleString('en-US');
  function updateStatus() {
    const s = state;
    if (s.scene === 'gasket') {
      const part = s.algorithm === 'chaos' ? '混沌游戏' : '递归细分';
      if (s.mode === 'points') {
        const drawn = Math.max(0, Math.min(geo.counts.points,
          Math.floor(geo.counts.points * s.growth.elapsed / GROW_DURATION)));
        UI.status(`垫片 · ${part} · 点云 · ${fmt(drawn)} / ${fmt(geo.counts.points)} 点`
          + (s.growth.growing ? '' : ' · 已暂停'));
      } else if (s.mode === 'lines') {
        UI.status(`垫片 · ${part} · 线框 · ${fmt(geo.counts.edges)} 条边`);
      } else {
        UI.status(`垫片 · ${part} · 实体 · ${fmt(geo.counts.faces / 3)} 个三角形`);
      }
    } else if (s.scene === 'tetra') {
      const m = { points: '点云', lines: '线框', triangles: '实体' }[s.mode];
      UI.status(`四面体 Gasket · 深度 ${s.tetraDepth} · ${m}`
        + ` · 面 ${fmt(geo.counts.faces / 3)} · ${s.tetraAuto ? '自动旋转' : ''}`);
    } else {
      const k = s.fractal.kind === 'julia' ? 'Julia' : 'Mandelbrot';
      UI.status(`${k} 集 · 迭代 ${s.fractal.iter} · 调色板:${FPALS[s.fractal.palIdx].name}`
        + (s.fractal.anim ? ' · 动画中' : ''));
    }
  }

  // ============================== 输入联动 ==============================
  function onKey(key) {
    if (state.scene === 'fractal') {
      // 分形场景：1/2/3 切换调色板（渲染模式概念不适用）
      if (key === '1' || key === '2' || key === '3') {
        state.fractal.palIdx = Number(key) - 1;
        UI.setSelect('fpalette', String(state.fractal.palIdx));
      } else if (key === 'space') {
        state.fractal.anim = !state.fractal.anim;
        UI.setCheck('janim', state.fractal.anim);
        UI.setJuliaEnabled(!state.fractal.anim);
      } else if (key === '0') resetView();
      else if (key === 'r') resetView();
      return;
    }

    if (key === '1' || key === '2' || key === '3') {
      const m = ['points', 'lines', 'triangles'][Number(key) - 1];
      if (state.scene === 'gasket' && state.algorithm === 'chaos' && m !== 'points') {
        // 混沌游戏只生成点云；按 2/3 时自动切到递归细分以支持线框/实体
        state.algorithm = 'subdiv';
        UI.setAlgorithm('subdiv');
      }
      state.mode = m;
      UI.setMode(m);
      UI.applyVisibility(state.scene, state.algorithm, state.mode);
      if (state.scene === 'gasket') buildGeometry();
    } else if (key === 'space') {
      if (state.scene === 'gasket' && state.mode === 'points') {
        state.growth.growing = !state.growth.growing;
        if (state.growth.growing) state.growth.last = performance.now();
      }
    } else if (key === '0') {
      resetView();
    } else if (key === 'r') {
      if (state.scene === 'gasket') buildGeometry();
      else resetView();
    }
  }

  function onParam(name, value) {
    switch (name) {
      case 'scene':
        state.scene = value;
        Interact.setScene(value);
        resetView();
        buildGeometry();
        UI.applyVisibility(state.scene, state.algorithm, state.mode);
        break;
      case 'alg':
        state.algorithm = value;
        if (value === 'chaos') { state.mode = 'points'; UI.setMode('points'); }
        UI.applyVisibility(state.scene, state.algorithm, state.mode);
        buildGeometry();
        break;
      case 'mode':
        if (state.scene !== 'gasket') break;
        if (state.algorithm === 'chaos' && value !== 'points') {
          state.algorithm = 'subdiv';       // 同键盘逻辑：混沌仅点云
          UI.setAlgorithm('subdiv');
        }
        state.mode = value;
        UI.applyVisibility(state.scene, state.algorithm, state.mode);
        buildGeometry();
        break;
      case 'points': state.nPoints = Number(value); buildGeometry(); break;
      case 'depth': state.depth = Number(value); buildGeometry(); break;
      case 'ngon': state.ngon = Number(value); buildGeometry(); break;
      case 'ratio': state.ratio = Number(value); buildGeometry(); break;
      case 'psize': state.pointSize = Number(value); break;
      case 'palette': state.paletteIdx = Number(value); break;
      case 'tdepth': state.tetraDepth = Number(value); buildGeometry(); break;
      case 'tauto': state.tetraAuto = value; break;
      case 'fkind': state.fractal.kind = value; break;
      case 'fiter': state.fractal.iter = Number(value); break;
      case 'fpalette': state.fractal.palIdx = Number(value); break;
      case 'jcx': state.fractal.c[0] = Number(value); break;
      case 'jcy': state.fractal.c[1] = Number(value); break;
      case 'janim':
        state.fractal.anim = value;
        UI.setJuliaEnabled(!value);
        break;
      case 'regen':
        if (state.scene === 'gasket') buildGeometry();
        else resetView();
        break;
      case 'reset': resetView(); break;
    }
  }

  // ============================== 初始化 ==============================
  function resize() {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    aspect = cssW / cssH;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function init() {
    canvas = document.getElementById('glcanvas');
    gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) { UI.status('浏览器不支持 WebGL 2.0'); return; }

    prog2d = initShaders(gl, 'vs2d', 'fs2d');
    prog3d = initShaders(gl, 'vs3d', 'fs3d');
    progF = initShaders(gl, 'vsf', 'fsf');

    L2.uTransform = gl.getUniformLocation(prog2d, 'uTransform');
    L2.uPointSize = gl.getUniformLocation(prog2d, 'uPointSize');
    L2.uColor = gl.getUniformLocation(prog2d, 'uColor');
    L2.uRoundPoints = gl.getUniformLocation(prog2d, 'uRoundPoints');
    L2.aPos = gl.getAttribLocation(prog2d, 'aPosition');

    L3.uProj = gl.getUniformLocation(prog3d, 'uProj');
    L3.uModel = gl.getUniformLocation(prog3d, 'uModel');
    L3.uPointSize = gl.getUniformLocation(prog3d, 'uPointSize');
    L3.uColor = gl.getUniformLocation(prog3d, 'uColor');
    L3.uLightDir = gl.getUniformLocation(prog3d, 'uLightDir');
    L3.uFlat = gl.getUniformLocation(prog3d, 'uFlat');
    L3.aPos = gl.getAttribLocation(prog3d, 'aPosition');
    L3.aNormal = gl.getAttribLocation(prog3d, 'aNormal');

    LF.uCenter = gl.getUniformLocation(progF, 'uCenter');
    LF.uHalfH = gl.getUniformLocation(progF, 'uHalfH');
    LF.uAspect = gl.getUniformLocation(progF, 'uAspect');
    LF.uMaxIter = gl.getUniformLocation(progF, 'uMaxIter');
    LF.uKind = gl.getUniformLocation(progF, 'uKind');
    LF.uC = gl.getUniformLocation(progF, 'uC');
    LF.uPal0 = gl.getUniformLocation(progF, 'uPal0');
    LF.uPal1 = gl.getUniformLocation(progF, 'uPal1');
    LF.uPal2 = gl.getUniformLocation(progF, 'uPal2');

    resize();
    window.addEventListener('resize', resize);

    Interact.init(canvas);
    Interact.setScene(state.scene);
    Interact.on({ onPan2D: pan2D, onZoom2D: zoom2D, onZoom3D: onZoom3D, onRotate3D: onRotate3D, onKey: onKey });
    UI.init(onParam);
    UI.applyVisibility(state.scene, state.algorithm, state.mode);

    buildGeometry();
    resetGrowth();
    lastNow = performance.now();
    requestAnimationFrame(render);
    UI.status('就绪');
  }

  function onRotate3D(dx, dy) {
    state.tetra.rotY += dx * 0.4;
    state.tetra.rotX = clamp(state.tetra.rotX + dy * 0.4, -89, 89);
  }
  function onZoom3D(factor) {
    state.tetra.dist = clamp(state.tetra.dist * factor, 2.2, 14);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);

/**
 * interaction.js —— 鼠标 / 键盘交互
 *
 * 按作业要求自行监听 mousedown / mousemove / mouseup / wheel / keydown，
 * 不依赖任何库。通过回调把事件转发给 main.js 处理，本模块不持有渲染状态。
 */
(function (global) {
  'use strict';

  const Interact = {};

  let canvas = null;
  let scene = 'gasket';              // gasket | tetra | fractal（由 main.js 同步）
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // 回调表（由 main.js 注入）
  const H = {
    onPan2D: null,       // (dx, dy) 像素增量
    onZoom2D: null,      // (px, py, factor) 光标位置(画布CSS像素)与缩放因子
    onRotate3D: null,    // (dx, dy)
    onZoom3D: null,      // (factor)
    onKey: null,         // (key)
  };

  Interact.init = function (cv) {
    canvas = cv;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;           // 仅左键
      dragging = true;
      lastX = e.offsetX;                    // 相对画布左上角的 CSS 像素
      lastY = e.offsetY;
      canvas.classList.add('dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - canvas.getBoundingClientRect().left - lastX;
      const dy = e.clientY - canvas.getBoundingClientRect().top - lastY;
      lastX += dx; lastY += dy;
      if (scene === 'tetra') {
        if (H.onRotate3D) H.onRotate3D(dx, dy);
      } else {
        if (H.onPan2D) H.onPan2D(dx, dy);
      }
    });

    const endDrag = () => {
      if (dragging) { dragging = false; canvas.classList.remove('dragging'); }
    };
    window.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();                   // 阻止页面滚动
      const factor = Math.exp(-e.deltaY * 0.0015);
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (scene === 'tetra') {
        if (H.onZoom3D) H.onZoom3D(factor);
      } else {
        if (H.onZoom2D) H.onZoom2D(px, py, factor);
      }
    }, { passive: false });

    // —— 键盘：作业要求 1/2/3 切换渲染模式、空格暂停/继续逐点生长 ——
    window.addEventListener('keydown', (e) => {
      // 焦点在表单控件上时不劫持按键（保证滑块等可正常用键盘操作）
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;

      let key = null;
      if (e.key === '1' || e.key === '2' || e.key === '3') key = e.key;
      else if (e.key === ' ') { key = 'space'; e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') key = 'r';
      else if (e.key === '0') key = '0';
      if (key && !e.repeat && H.onKey) H.onKey(key);
    });
  };

  Interact.setScene = function (s) { scene = s; };

  Interact.on = function (handlers) {
    for (const k in handlers) if (handlers[k]) H[k] = handlers[k];
  };

  global.Interact = Interact;
})(window);

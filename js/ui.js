/**
 * ui.js —— 参数面板绑定
 *
 * 只负责 DOM 控件 ↔ 值标签 ↔ 回调，不碰渲染逻辑。所有控件事件统一走 onParam(name, value)。
 * 场景/算法/模式由 main.js 通过 set* 方法回写控件状态，保证键盘与面板状态一致。
 */
(function (global) {
  'use strict';

  const UI = {};
  const $ = (id) => document.getElementById(id);

  // 滑条类控件：拖动时实时回调，并把值写进旁边的标签
  const SLIDERS = [
    ['points', 'ctl-points', 'val-points', (v) => Number(v)],
    ['depth', 'ctl-depth', 'val-depth', (v) => Number(v)],
    ['ngon', 'ctl-ngon', 'val-ngon', (v) => Number(v)],
    ['ratio', 'ctl-ratio', 'val-ratio', (v) => Number(v)],
    ['psize', 'ctl-psize', 'val-psize', (v) => Number(v)],
    ['tdepth', 'ctl-tdepth', 'val-tdepth', (v) => Number(v)],
    ['fiter', 'ctl-fiter', 'val-fiter', (v) => Number(v)],
    ['jcx', 'ctl-jcx', 'val-jcx', (v) => Number(v).toFixed(2)],
    ['jcy', 'ctl-jcy', 'val-jcy', (v) => Number(v).toFixed(2)],
  ];

  // 下拉 / 复选类
  const SELECTS = [
    ['scene', 'ctl-scene'],
    ['palette', 'ctl-palette'],
    ['fkind', 'ctl-fkind'],
    ['fpalette', 'ctl-fpalette'],
  ];
  const CHECKS = [
    ['tauto', 'ctl-tauto'],
    ['janim', 'ctl-janim'],
  ];

  // 单选组
  const RADIOS = { alg: 'alg', mode: 'mode' };

  /** 绑定控件事件，cb(name, value) 统一回调 */
  UI.init = function (cb) {
    for (const [name, elId, valId, fmt] of SLIDERS) {
      const el = $(elId), lab = $(valId);
      el.addEventListener('input', () => {
        lab.textContent = fmt(el.value);
        cb(name, el.value);
      });
    }
    for (const [name, elId] of SELECTS) {
      $(elId).addEventListener('change', () => cb(name, $(elId).value));
    }
    for (const [name, elId] of CHECKS) {
      $(elId).addEventListener('change', () => cb(name, $(elId).checked));
    }
    for (const g in RADIOS) {
      document.querySelectorAll('input[name="' + RADIOS[g] + '"]').forEach((el) => {
        el.addEventListener('change', () => { if (el.checked) cb(g, el.value); });
      });
    }
    $('ctl-regen').addEventListener('click', () => cb('regen'));
    $('ctl-reset').addEventListener('click', () => cb('reset'));
  };

  // —— 由 main.js 回写控件状态 ——
  UI.setScene = function (s) { $('ctl-scene').value = s; };
  UI.setAlgorithm = function (a) {
    const el = document.querySelector('input[name="alg"][value="' + a + '"]');
    if (el) el.checked = true;
  };
  UI.setMode = function (m) {
    const el = document.querySelector('input[name="mode"][value="' + m + '"]');
    if (el) el.checked = true;
  };
  UI.setValue = function (name, v) {
    const row = SLIDERS.find((s) => s[0] === name);
    if (row) {
      $(row[1]).value = v;
      $(row[2]).textContent = row[3](v);
    }
  };
  UI.setJuliaEnabled = function (enabled) {
    $('ctl-jcx').disabled = !enabled;
    $('ctl-jcy').disabled = !enabled;
  };
  UI.setSelect = function (name, v) {
    const row = SELECTS.find((s) => s[0] === name);
    if (row) $(row[1]).value = v;
  };
  UI.setCheck = function (name, v) {
    const row = CHECKS.find((s) => s[0] === name);
    if (row) $(row[1]).checked = !!v;
  };

  /** 按 场景×算法×模式 控制面板分区可见性 */
  UI.applyVisibility = function (scene, alg, mode) {
    const gasket = scene === 'gasket';
    show('sec-alg', gasket);
    show('sec-mode', gasket || scene === 'tetra');
    show('sec-points', gasket && alg === 'chaos');
    show('sec-depth', gasket && alg === 'subdiv');
    show('sec-ngon', gasket && alg === 'chaos');
    show('sec-common', gasket || scene === 'tetra');
    show('sec-tetra', scene === 'tetra');
    show('sec-fractal', scene === 'fractal');
  };

  UI.status = function (text) { $('status').textContent = text; };

  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  global.UI = UI;
})(window);

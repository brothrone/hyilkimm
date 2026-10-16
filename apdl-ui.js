/* APDL 연습기 화면: 편집기 · 그래픽 창 · 출력 창 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ed = $('apEd'), gut = $('apGut'), out = $('apOut'), svg = $('apSvg'), sel = $('apEx'), info = $('apInfo');
  var EX = window.APDL_EXAMPLES || [];
  var eng = null, snap = null, view = { yaw: -35, pitch: 25, mode: 'auto' }, KEY = 'apdl-draft';

  // ---------- 예제 ----------
  EX.forEach(function (x, i) { var o = document.createElement('option'); o.value = i; o.textContent = x.name; sel.appendChild(o); });
  sel.onchange = function () { if (sel.value === '') return; ed.value = EX[sel.value].code; save(); lines(); run(); };

  // ---------- 편집기 ----------
  function lines(errLine) {
    var n = ed.value.split('\n').length, h = '';
    for (var i = 1; i <= n; i++) h += '<span' + (i === errLine ? ' class="err"' : '') + '>' + i + '</span>';
    gut.innerHTML = h; gut.scrollTop = ed.scrollTop;
  }
  ed.addEventListener('scroll', function () { gut.scrollTop = ed.scrollTop; });
  ed.addEventListener('input', function () { lines(); save(); });
  ed.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Tab') { e.preventDefault(); var s = ed.selectionStart; ed.setRangeText('  ', s, ed.selectionEnd, 'end'); lines(); }
  });
  function save() { try { localStorage.setItem(KEY, ed.value); } catch (e) { } }
  try { var d = localStorage.getItem(KEY); if (d) ed.value = d; } catch (e) { }
  if (location.hash.indexOf('#code=') === 0) { try { ed.value = decodeURIComponent(escape(atob(location.hash.slice(6)))); } catch (e) { } }
  if (!ed.value.trim() && EX.length) ed.value = EX[0].code;
  lines();

  $('apRun').onclick = run;
  $('apClear').onclick = function () { if (confirm('편집기 내용을 모두 지울까요?')) { ed.value = ''; save(); lines(); out.textContent = ''; draw(); } };
  $('apShare').onclick = function () {
    var url = location.href.split('#')[0] + '#code=' + btoa(unescape(encodeURIComponent(ed.value)));
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { flash('링크를 복사했습니다'); }, function () { prompt('이 링크를 복사하세요', url); });
    else prompt('이 링크를 복사하세요', url);
  };
  function flash(t) { info.textContent = t; setTimeout(function () { info.textContent = ''; }, 2500); }

  // ---------- 실행 ----------
  function run() {
    eng = new window.ApdlEngine().run(ed.value);
    var html = eng.out.map(function (l) {
      var c = /\*\*\* ERROR/.test(l) ? 'e' : /\*\*\* 참고|내부 오류/.test(l) ? 'w' : /해석 완료/.test(l) ? 'ok' : '';
      return c ? '<span class="' + c + '">' + esc(l) + '</span>' : esc(l);
    }).join('\n');
    out.innerHTML = html || '<span class="dim">(출력 없음 — prnsol, prrsol, pretab 같은 출력 명령을 넣어 보세요)</span>';
    out.scrollTop = 0;
    lines(eng.errorLine);
    if (eng.errorLine) { var ln = ed.value.split('\n').slice(0, eng.errorLine - 1).join('\n').length; ed.focus(); ed.setSelectionRange(ln + 1, ln + 1); }
    try { snap = eng.snapshot(); } catch (e) { snap = null; }
    $('apShowDef').disabled = !eng.result; if (eng.result && eng.plot && eng.plot.kind !== 'geom') $('apShowDef').checked = true; if (!eng.result) $('apShowDef').checked = false;
    draw();
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // ---------- 그래픽 ----------
  ['apNum', 'apEnum', 'apKnum', 'apBC', 'apShowDef', 'apView'].forEach(function (id) { $(id).addEventListener('change', draw); });
  var drag = null;
  svg.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', function (e) { if (!drag) return; view.yaw = drag.yaw + (e.clientX - drag.x) * 0.5; view.pitch = Math.max(-89, Math.min(89, drag.pitch + (e.clientY - drag.y) * 0.5)); $('apView').value = 'free'; draw(); });
  svg.addEventListener('pointerup', function () { drag = null; });
  window.addEventListener('resize', draw);

  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, at, parent) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); (parent || svg).appendChild(e); return e; }
  var SPEC = ['#0000ff', '#0080ff', '#00ffff', '#00ff80', '#00ff00', '#80ff00', '#ffff00', '#ff8000', '#ff0000'];
  function color(v, lo, hi) { if (hi - lo < 1e-30) return SPEC[4]; var t = (v - lo) / (hi - lo); return SPEC[Math.max(0, Math.min(8, Math.floor(t * 9)))]; }

  function projector(pts) {
    var mode = $('apView').value, yaw, pitch;
    var flat = pts.every(function (p) { return Math.abs(p[2]) < 1e-9; });
    if (mode === 'auto') mode = flat ? 'xy' : 'iso';
    if (mode === 'xy') { yaw = 0; pitch = 0; } else if (mode === 'xz') { yaw = 0; pitch = -90; } else if (mode === 'yz') { yaw = -90; pitch = 0; } else if (mode === 'iso') { yaw = -35; pitch = 25; } else { yaw = view.yaw; pitch = view.pitch; }
    if (mode !== 'free') { view.yaw = yaw; view.pitch = pitch; }
    var cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180), cp = Math.cos(pitch * Math.PI / 180), sp = Math.sin(pitch * Math.PI / 180);
    var P = function (p) { var x = cy * p[0] - sy * p[2], z = sy * p[0] + cy * p[2], y = cp * p[1] - sp * z; return [x, y]; };
    return P;
  }

  function draw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = svg.clientWidth || 600, Hh = svg.clientHeight || 400; svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
    if (!snap) { el('text', { x: 16, y: 28, fill: '#9cf', 'font-size': 13 }).textContent = '실행(Ctrl+Enter)하면 모델이 여기에 그려집니다'; return; }
    var s = snap, showDef = $('apShowDef').checked && eng.result, plot = s.plot || {};
    // 표시할 점 모으기
    var pts = [], k, used = {}, nE = 0;
    for (k in s.elems) { nE++; s.elems[k].n.forEach(function (n) { used[n] = 1; }); }
    var vis = function (n) { return !nE || used[n] || !s.kOnly[n]; };
    for (k in s.nodes) if (vis(k)) pts.push(s.nodes[k].x);
    for (k in s.kps) pts.push(s.kps[k].x);
    for (k in s.lines) s.lines[k].pts.forEach(function (p) { pts.push(p); });
    for (k in s.areas) s.areas[k].regions.forEach(function (r) { r.forEach(function (p) { pts.push([p[0], p[1], 0]); }); });
    if (!pts.length) { el('text', { x: 16, y: 28, fill: '#9cf', 'font-size': 13 }).textContent = '그릴 형상이 없습니다'; legend(); return; }
    var P = projector(pts);
    // 변형 배율
    var umax = 0, size = 0, lo = [1e99, 1e99, 1e99], hi = [-1e99, -1e99, -1e99];
    pts.forEach(function (p) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } });
    size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    for (k in s.nodes) if (s.nodes[k].u && vis(k)) umax = Math.max(umax, Math.hypot(s.nodes[k].u[0], s.nodes[k].u[1], s.nodes[k].u[2]));
    var dsc = showDef && umax > 0 ? 0.08 * size / umax : 0;
    var defX = function (n) { var nd = s.nodes[n]; if (!dsc || !nd.u) return nd.x; return [nd.x[0] + nd.u[0] * dsc, nd.x[1] + nd.u[1] * dsc, nd.x[2] + nd.u[2] * dsc]; };
    // 화면 맞춤 (변형 포함)
    var all2 = pts.map(P); if (dsc) for (k in s.nodes) if (vis(k)) all2.push(P(defX(k)));
    var x0 = 1e99, x1 = -1e99, y0 = 1e99, y1 = -1e99; all2.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    var pad = 64, sc = Math.min((W - 2 * pad) / ((x1 - x0) || 1), (Hh - 2 * pad - 20) / ((y1 - y0) || 1)); if (!isFinite(sc) || sc <= 0) sc = 1;
    var ox = (W - (x1 - x0) * sc) / 2 - x0 * sc, oy = (Hh - 20 + (y1 - y0) * sc) / 2 + y0 * sc;
    var S2 = function (p) { var q = P(p); return [ox + q[0] * sc, oy - q[1] * sc]; };

    // 결과 값 (등고선)
    var field = null, flo = 0, fhi = 0, flab = '';
    if (showDef) {
      var comp = (plot.kind === 'disp' && plot.comp) || 'USUM', ci = { UX: 0, UY: 1, UZ: 2, ROTX: 3, ROTY: 4, ROTZ: 5 };
      field = {}; flab = comp;
      if (comp !== 'ROTSUM' && ci[comp] === undefined) comp = 'USUM';
      for (k in s.nodes) { var u = s.nodes[k].u; if (!u) continue; field[k] = comp === 'USUM' ? Math.hypot(u[0], u[1], u[2]) : comp === 'ROTSUM' ? Math.hypot(u[3], u[4], u[5]) : u[ci[comp]]; }
      flab = comp;
      if (comp === 'USUM') flab = 'USUM (변위 크기)';
      var vs = Object.keys(field).map(function (q) { return field[q]; }); flo = Math.min.apply(null, vs); fhi = Math.max.apply(null, vs);
    }
    var etab = plot.kind === 'etab' && s.etab[plot.lab] ? s.etab[plot.lab] : null, elo = 0, ehi = 0;
    if (etab && showDef) { var ev = Object.keys(etab.vals).map(function (q) { return etab.vals[q]; }); elo = Math.min.apply(null, ev); ehi = Math.max.apply(null, ev); }

    // 면
    var gArea = el('g', {});
    for (k in s.areas) {
      var d = s.areas[k].regions.map(function (r) { return 'M' + r.map(function (p) { var q = S2([p[0], p[1], 0]); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join('L') + 'Z'; }).join('');
      el('path', { d: d, fill: '#7f3fbf', 'fill-opacity': 0.55, stroke: '#d9b3ff', 'stroke-width': 1, 'fill-rule': 'evenodd' }, gArea);
      if ($('apKnum').checked) { var r0 = s.areas[k].regions[0], cx = 0, cy2 = 0; r0.forEach(function (p) { cx += p[0]; cy2 += p[1]; }); var qc = S2([cx / r0.length, cy2 / r0.length, 0]); el('text', { x: qc[0], y: qc[1], fill: '#fff', 'font-size': 12, 'text-anchor': 'middle' }, gArea).textContent = 'A' + k; }
    }
    // 선·키포인트
    for (k in s.lines) {
      var Ln = s.lines[k]; el('polyline', { points: Ln.pts.map(function (p) { return S2(p).map(function (v) { return v.toFixed(1); }).join(','); }).join(' '), fill: 'none', stroke: Object.keys(s.elems).length ? '#557' : '#ff66ff', 'stroke-width': 1.5 });
      if ($('apKnum').checked) { var mid = S2(Ln.pts[Math.floor(Ln.pts.length / 2)]); el('text', { x: mid[0] + 4, y: mid[1] - 4, fill: '#ff99ff', 'font-size': 11 }).textContent = 'L' + k; }
    }
    for (k in s.kps) { var qk = S2(s.kps[k].x); el('rect', { x: qk[0] - 2.5, y: qk[1] - 2.5, width: 5, height: 5, fill: '#fff' }); if ($('apKnum').checked) el('text', { x: qk[0] + 5, y: qk[1] + 13, fill: '#ccc', 'font-size': 11 }).textContent = 'K' + k; }

    // 요소
    var gE = el('g', {}), drawElem = function (e, XY, ghost) {
      var E = s.elems[e], ns = E.n.map(XY), col;
      if (ghost) col = '#555';
      else if (etab && etab.vals[e] !== undefined && showDef) col = color(etab.vals[e], elo, ehi);
      else if (field) { var avg = 0, c2 = 0; E.n.forEach(function (n) { if (field[n] !== undefined) { avg += field[n]; c2++; } }); col = color(c2 ? avg / c2 : 0, flo, fhi); }
      else col = E.name === 'LINK180' ? '#00e5ff' : E.name === 'BEAM188' ? '#00e5ff' : '#00e5ff';
      if (E.name === 'PLANE182') { var poly = (E.n.length === 3 ? ns : ns.slice(0, 4)).map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); el('polygon', { points: poly, fill: ghost ? 'none' : col, 'fill-opacity': ghost ? 0 : (field ? 0.9 : 0.35), stroke: ghost ? '#555' : (field ? '#000' : '#00e5ff'), 'stroke-width': 1, 'stroke-dasharray': ghost ? '3 3' : '' }, gE); }
      else el('line', { x1: ns[0][0], y1: ns[0][1], x2: ns[1][0], y2: ns[1][1], stroke: col, 'stroke-width': ghost ? 1 : (E.name === 'BEAM188' ? 3.5 : 2.5), 'stroke-dasharray': ghost ? '4 3' : '', 'stroke-linecap': 'round' }, gE);
      if (!ghost && $('apEnum').checked) { var cxe = 0, cye = 0; ns.forEach(function (q) { cxe += q[0]; cye += q[1]; }); el('text', { x: cxe / ns.length, y: cye / ns.length - 5, fill: '#ffeb3b', 'font-size': 11, 'text-anchor': 'middle' }, gE).textContent = e; }
    };
    var nodeXY = function (n) { return S2(s.nodes[n].x); }, defXY = function (n) { return S2(defX(n)); };
    for (k in s.elems) { if (dsc) drawElem(k, nodeXY, true); }
    for (k in s.elems) drawElem(k, dsc ? defXY : nodeXY, false);

    // 경계조건·하중
    if ($('apBC').checked) {
      var g2 = el('g', {});
      var Dall = {}; for (k in s.D) Dall[k] = s.D[k];
      for (k in Dall) { if (!s.nodes[k]) continue; var q = S2(s.nodes[k].x), dd = Dall[k], tr = [0, 1, 2].some(function (i) { return dd[i] !== undefined; }), rt = [3, 4, 5].some(function (i) { return dd[i] !== undefined; }), nz = [0, 1, 2, 3, 4, 5].some(function (i) { return dd[i]; });
        if (tr) el('path', { d: 'M' + q[0] + ',' + q[1] + 'l-7,12h14z', fill: 'none', stroke: nz ? '#ff8000' : '#00ff7f', 'stroke-width': 1.5 }, g2);
        if (rt) el('rect', { x: q[0] - 6, y: q[1] - 6, width: 12, height: 12, fill: 'none', stroke: '#00ff7f', 'stroke-width': 1 }, g2);
      }
      var arrows = function (F) {
        for (var n in F) { if (!s.nodes[n]) continue; var a = S2(s.nodes[n].x), T = null; for (var i in F[n]) { var v = F[n][i]; if (!v) continue; i = +i; if (i < 3) { var dir = [0, 0, 0]; dir[i] = v > 0 ? 1 : -1; var b0 = S2(s.nodes[n].x), b1 = S2([s.nodes[n].x[0] - dir[0] * size * 0.12, s.nodes[n].x[1] - dir[1] * size * 0.12, s.nodes[n].x[2] - dir[2] * size * 0.12]); if (s.nodes[n].T) { var Tm = s.nodes[n].T, dg = [Tm[0][i] * dir[i], Tm[1][i] * dir[i], Tm[2][i] * dir[i]]; b1 = S2([s.nodes[n].x[0] - dg[0] * size * 0.12, s.nodes[n].x[1] - dg[1] * size * 0.12, s.nodes[n].x[2] - dg[2] * size * 0.12]); } if (b1) { el('line', { x1: b1[0], y1: b1[1], x2: b0[0], y2: b0[1], stroke: '#ff3b3b', 'stroke-width': 2, 'marker-end': 'url(#apArr)' }, g2); el('text', { x: b1[0] + 3, y: b1[1] - 3, fill: '#ff8080', 'font-size': 11 }, g2).textContent = fmtS(v); } else el('text', { x: a[0] + 6, y: a[1] + 16, fill: '#ff8080', 'font-size': 11 }, g2).textContent = ['FX', 'FY', 'FZ'][i] + '′=' + fmtS(v) + ' (회전 좌표)'; }
          else { el('circle', { cx: a[0], cy: a[1], r: 10, fill: 'none', stroke: '#ff3b3b', 'stroke-width': 1.5, 'stroke-dasharray': '14 4' }, g2); el('text', { x: a[0] + 12, y: a[1] - 8, fill: '#ff8080', 'font-size': 11 }, g2).textContent = ['MX', 'MY', 'MZ'][i - 3] + '=' + fmtS(v); } } }
      };
      el('path', { d: 'M0,0L10,5L0,10z', fill: '#ff3b3b' }, el('marker', { id: 'apArr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, el('defs', {}, g2)));
      arrows(s.F);
      // kp 하중/구속
      for (k in s.DK) { if (!s.kps[k]) continue; var qd = S2(s.kps[k].x); el('path', { d: 'M' + qd[0] + ',' + qd[1] + 'l-7,12h14z', fill: 'none', stroke: '#00ff7f', 'stroke-width': 1.5 }, g2); }
      for (k in s.FK) { if (!s.kps[k]) continue; var b = S2(s.kps[k].x); for (var ii in s.FK[k]) { ii = +ii; if (ii > 2) continue; var dv = [0, 0, 0]; dv[ii] = s.FK[k][ii] > 0 ? 1 : -1; var bb = S2([s.kps[k].x[0] - dv[0] * size * 0.12, s.kps[k].x[1] - dv[1] * size * 0.12, s.kps[k].x[2] - dv[2] * size * 0.12]); el('line', { x1: bb[0], y1: bb[1], x2: b[0], y2: b[1], stroke: '#ff3b3b', 'stroke-width': 2, 'marker-end': 'url(#apArr)' }, g2); } }
      // 보 분포하중 (요소 가운데 작은 화살표)
      var qmax = 0; for (k in s.SFB) for (var lk0 in s.SFB[k]) qmax = Math.max(qmax, Math.abs(s.SFB[k][lk0].vi), Math.abs(s.SFB[k][lk0].vj));
      for (k in s.SFB) { var E2 = s.elems[k]; if (!E2) continue; var A0 = s.nodes[E2.n[0]].x, A1 = s.nodes[E2.n[1]].x, ax = beamAxes(A0, A1, E2.k);
        for (var lk in s.SFB[k]) { var L2 = s.SFB[k][lk], dir2 = lk === '1' ? ax.z : lk === '2' ? ax.y : null; if (!dir2) continue;
          [0.5].forEach(function (t) { var v = L2.vi + (L2.vj - L2.vi) * t; if (!v) return; var len = size * 0.09 * Math.abs(v) / (qmax || 1), p = [A0[0] + (A1[0] - A0[0]) * t, A0[1] + (A1[1] - A0[1]) * t, A0[2] + (A1[2] - A0[2]) * t], sg = v > 0 ? -1 : 1, tail = [p[0] - dir2[0] * sg * len, p[1] - dir2[1] * sg * len, p[2] - dir2[2] * sg * len], q1 = S2(tail), q2 = S2(p); el('line', { x1: q1[0], y1: q1[1], x2: q2[0], y2: q2[1], stroke: '#ff6060', 'stroke-width': 1.2, 'marker-end': 'url(#apArr)' }, g2); });
        } }
    }
    // 노드
    for (k in s.nodes) { if (!vis(k)) continue; var qn = S2(dsc ? defX(k) : s.nodes[k].x); el('circle', { cx: qn[0], cy: qn[1], r: 2.2, fill: '#fff' }); if ($('apNum').checked) el('text', { x: qn[0] + 5, y: qn[1] + 13, fill: '#e0e0e0', 'font-size': 11 }).textContent = k; }
    // 축 표시
    var ax0 = [26, Hh - 30], Pp = projector(pts), axs = [[1, 0, 0, 'X', '#ff5050'], [0, 1, 0, 'Y', '#50ff50'], [0, 0, 1, 'Z', '#5090ff']];
    axs.forEach(function (a) { var q = Pp([a[0], a[1], a[2]]); if (Math.hypot(q[0], q[1]) < 0.15) return; var e2 = [ax0[0] + q[0] * 22, ax0[1] - q[1] * 22]; el('line', { x1: ax0[0], y1: ax0[1], x2: e2[0], y2: e2[1], stroke: a[4], 'stroke-width': 1.5 }); el('text', { x: e2[0] + 2, y: e2[1] + 4, fill: a[4], 'font-size': 11 }).textContent = a[3]; });
    // 제목·범례
    el('text', { x: 10, y: 18, fill: '#fff', 'font-size': 12 }).textContent = (s.title ? s.title + '  ' : '') + (field ? ' DISPLACEMENT  (배율 ' + (+dsc.toPrecision(3)) + ')' : etab && showDef ? ' ELEMENT TABLE ' + plot.lab : ' ELEMENTS');
    if (field) legend(flab, flo, fhi, W, Hh); else if (etab && showDef) legend(plot.lab, elo, ehi, W, Hh);
  }
  function legend(lab, lo, hi, W, H) {
    if (lab === undefined) return;
    var x = 10, y = H - 18, w = Math.min(46, (W - 160) / 9);
    for (var i = 0; i < 9; i++) { el('rect', { x: 60 + i * w, y: y - 10, width: w, height: 10, fill: SPEC[i] }); }
    el('text', { x: 60, y: y + 12, fill: '#ddd', 'font-size': 10 }).textContent = fmtS(lo);
    el('text', { x: 60 + 9 * w, y: y + 12, fill: '#ddd', 'font-size': 10, 'text-anchor': 'end' }).textContent = fmtS(hi);
    el('text', { x: 60 + 9 * w + 8, y: y - 1, fill: '#fff', 'font-size': 11 }).textContent = lab;
  }
  function fmtS(v) { return Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v) ? v.toExponential(3) : (+v.toPrecision(4)).toString(); }
  function beamAxes(a, b, k) {
    var x = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), y, z;
    if (k) { var v = [k[0] - a[0], k[1] - a[1], k[2] - a[2]], d = v[0] * x[0] + v[1] * x[1] + v[2] * x[2]; z = norm3([v[0] - d * x[0], v[1] - d * x[1], v[2] - d * x[2]]); y = cr(z, x); }
    else { if (Math.abs(x[2]) > 1 - 1e-9) y = [0, 1, 0]; else y = norm3(cr([0, 0, 1], x)); z = cr(x, y); }
    return { x: x, y: y, z: z };
  }
  function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm3(a) { var n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }

  run();
})();

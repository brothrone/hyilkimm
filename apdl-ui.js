/* MAPDL 연습기 화면 — Mechanical APDL Utility Menu 창을 본뜸
 * Utility Menu · 아이콘 막대 + 명령 입력 콤보 · Toolbar · Main Menu(대화상자) · Graphics(+오른쪽 보기 도구) · Status bar · Output Window
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var eng = new window.ApdlEngine(), hist = [], hpos = -1, KEY = 'mapdl-trainer-db';
  var view = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], zoom: 1, panX: 0, panY: 0, rate: 3, dyn: false, box: false, stack: [], noBC: false };
  var out = $('#mwOut'), svg = $('#mwSvg'), input = $('#mwInput'), status = $('#mwStatus'), stAttr = $('#mwAttr'), root = $('#mapdl');

  // ================= 실행 =================
  function run(text, opt) {
    opt = opt || {};
    var n0 = eng.out.length, v0 = JSON.stringify(eng.view || null);
    var r = eng.exec(text, { record: opt.record !== false });
    flushOut(n0);
    if (JSON.stringify(eng.view || null) !== v0 && eng.view) setDir(eng.view);
    if (eng.lastCmd === '/AUTO') { view.zoom = 1; view.panX = view.panY = 0; }
    if (!opt.quiet) {
      var msgs = collect(n0), errs = msgs.filter(function (m) { return m.k === 'e'; }), warns = msgs.filter(function (m) { return m.k === 'w'; });
      if (opt.single) {
        if (errs.length) msgbox('Error', errs.map(function (m) { return m.t; }).join('\n\n'), 'e');
        else if (warns.length) msgbox('Warning', warns.map(function (m) { return m.t; }).join('\n\n'), 'w');
        else if (eng.lastCmd === 'SOLVE' && eng.result) msgbox('Note', 'Solution is done!', 'n');
      } else if (errs.length || warns.length) {
        var t = (errs.length ? errs.length + ' error(s)' : '') + (errs.length && warns.length ? ', ' : '') + (warns.length ? warns.length + ' warning(s)' : '') + ' — 입력 파일을 끝까지 실행했습니다 (오류 난 명령만 무시됨).\n\n';
        t += (errs.length ? errs : warns).slice(0, 3).map(function (m) { return m.t; }).join('\n\n') + ((errs.length ? errs : warns).length > 3 ? '\n\n… 나머지는 Output Window 를 보세요.' : '');
        msgbox(errs.length ? 'Error' : 'Warning', t, errs.length ? 'e' : 'w');
      } else if (eng.lastCmd === 'SOLVE' && eng.result) msgbox('Note', 'Solution is done!', 'n');
    }
    updStatus(); draw();
    return r;
  }
  function collect(from) { // *** ERROR *** / *** WARNING *** 블록 모으기
    var res = [], cur = null;
    eng.out.slice(from).forEach(function (o) {
      if ((o.k === 'e' || o.k === 'w') && /\*\*\* (ERROR|WARNING) \*\*\*/.test(o.t)) { cur = { k: o.k, t: '' }; res.push(cur); return; }
      if (cur && o.k === cur.k) cur.t += (cur.t ? '\n' : '') + o.t.trim(); else cur = null;
    });
    return res;
  }
  function flushOut(from) {
    var frag = document.createDocumentFragment();
    eng.out.slice(from).forEach(function (o) { var d = document.createElement('div'); d.textContent = o.t || ' '; if (o.k) d.className = o.k; frag.appendChild(d); });
    out.appendChild(frag);
    while (out.childNodes.length > 6000) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  }
  function updStatus() {
    var s = eng.status();
    status.textContent = 'Pick a menu item or enter a command (' + s.procName + ')';
    stAttr.innerHTML = '<span>mat=' + s.mat + '</span><span>type=' + s.type + '</span><span>real=' + s.real + '</span><span>csys=' + s.csys + '</span><span>secn=' + s.secn + '</span>';
    document.querySelectorAll('.mw-tree [data-proc]').forEach(function (el) { el.classList.toggle('cur', el.getAttribute('data-proc') === s.proc); });
  }
  function fresh() { out.innerHTML = ''; eng = new window.ApdlEngine(); hist = []; hpos = -1; view.R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; view.zoom = 1; view.panX = view.panY = 0; view.stack = []; }
  function cmd1(c) { hist.push(c); hpos = hist.length; refreshHist(); return run(c, { single: true }); }

  // ================= 명령 입력 콤보 =================
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); var t = input.value.trim(); hideHist(); if (!t) return; input.value = ''; if (t.indexOf('\n') > -1) runMany(t); else cmd1(t); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) { hpos--; input.value = hist[hpos]; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < hist.length - 1) { hpos++; input.value = hist[hpos]; } else { hpos = hist.length; input.value = ''; } }
    else if (e.key === 'Escape') hideHist();
  });
  input.addEventListener('paste', function (e) {
    var t = (e.clipboardData || window.clipboardData).getData('text'); if (t.indexOf('\n') < 0) return;
    e.preventDefault(); runMany(t);
  });
  function runMany(t) { t.split('\n').forEach(function (l) { if (l.trim()) hist.push(l.trim()); }); hpos = hist.length; refreshHist(); run(t); }
  var hl = $('#mwHistList');
  function refreshHist() { hl.innerHTML = ''; var seen = {}; hist.slice().reverse().forEach(function (h) { if (seen[h] || Object.keys(seen).length >= 40) return; seen[h] = 1; var b = document.createElement('button'); b.type = 'button'; b.textContent = h; b.onclick = function () { input.value = h; hideHist(); input.focus(); }; hl.appendChild(b); }); }
  function hideHist() { hl.hidden = true; }
  $('#mwHistBtn').onclick = function (e) { e.stopPropagation(); if (!hl.childNodes.length) { flash('입력한 명령이 아직 없습니다.'); return; } hl.hidden = !hl.hidden; };
  document.addEventListener('click', function (e) { if (!e.target.closest('.mw-combo')) hideHist(); });

  // ================= 대화상자 =================
  var dlg = $('#mwDlg');
  function dialog(spec) {
    var html = '<div class="mw-dlgwin" role="dialog" aria-modal="true" aria-label="' + esc(spec.title) + '"><div class="mw-dlgtitle"><span>' + esc(spec.title) + '</span><button type="button" class="x" data-act="cancel" aria-label="닫기">✕</button></div><div class="mw-dlgbody">';
    (spec.fields || []).forEach(function (fd, i) {
      var id = 'mwf' + i, lab = '<label for="' + id + '"><b>[' + spec.cmd + ']</b> ' + esc(fd.label) + '</label>', ctl;
      if (fd.opts) ctl = '<select id="' + id + '">' + fd.opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === fd.def ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>';
      else if (fd.check) ctl = '<span class="mw-chk"><input type="checkbox" id="' + id + '"' + (fd.def ? ' checked' : '') + '><span>' + (fd.def ? 'On' : 'Off') + '</span></span>';
      else ctl = '<input id="' + id + '" value="' + esc(fd.def === undefined ? '' : fd.def) + '" autocomplete="off">';
      html += '<div class="mw-row">' + lab + ctl + '</div>';
    });
    if (spec.note) html += '<p class="mw-dnote">' + spec.note + '</p>';
    html += '<div class="mw-cmdprev">명령: <code id="mwPrev"></code></div></div><div class="mw-dlgbtns"><button type="button" data-act="ok">OK</button><button type="button" data-act="apply">Apply</button><button type="button" data-act="cancel">Cancel</button><button type="button" data-act="help">Help</button></div></div>';
    dlg.innerHTML = html; dlg.hidden = false;
    var vals = function () { return (spec.fields || []).map(function (fd, i) { var el = $('#mwf' + i); return fd.check ? (el.checked ? 1 : 0) : el.value.trim(); }); };
    var build = function () { return typeof spec.build === 'function' ? spec.build(vals()) : fill(spec.build, vals()); };
    var upd = function () { $('#mwPrev').textContent = build().split('\n').join('  $  '); dlg.querySelectorAll('.mw-chk').forEach(function (c) { c.lastChild.textContent = c.firstChild.checked ? 'On' : 'Off'; }); };
    dlg.querySelectorAll('input,select').forEach(function (el) { el.addEventListener('input', upd); el.addEventListener('change', upd); });
    upd(); var first = dlg.querySelector('input,select'); if (first) first.focus();
    dlg.onclick = function (e) {
      var a = e.target.getAttribute('data-act'); if (!a) return;
      if (a === 'cancel') { dlg.hidden = true; return; }
      if (a === 'help') { window.open('ref.html', '_blank'); return; }
      var c = build(); c.split('\n').forEach(function (l) { hist.push(l); }); hpos = hist.length; refreshHist();
      if (a === 'ok') dlg.hidden = true;
      run(c, { single: true });
    };
    dlg.onkeydown = function (e) { if (e.key === 'Escape') dlg.hidden = true; if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); dlg.querySelector('[data-act=ok]').click(); } };
  }
  function fill(tpl, v) { var s = tpl.replace(/\{(\d+)\}/g, function (m, i) { return v[+i]; }); return s.split('\n').map(function (l) { return l.replace(/,+$/, ''); }).join('\n'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  var ICON = { e: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#d42a1e" stroke="#7a1209"/><path d="M10 10l12 12M22 10L10 22" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>',
    w: '<svg viewBox="0 0 32 32" width="32" height="32"><path d="M16 2L31 29H1z" fill="#ffd21f" stroke="#8a6d00" stroke-linejoin="round"/><path d="M16 11v9" stroke="#000" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="24.5" r="1.8"/></svg>',
    n: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#2a6fd4" stroke="#123f80"/><circle cx="16" cy="9" r="2.2" fill="#fff"/><path d="M16 14v10" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>',
    q: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#2a6fd4" stroke="#123f80"/><text x="16" y="23" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial">?</text></svg>' };
  function msgbox(title, text, kind, buttons, cb) {
    var m = $('#mwMsg'); buttons = buttons || ['Close'];
    m.innerHTML = '<div class="mw-dlgwin small k-' + (kind || 'n') + '" role="alertdialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="mw-dlgtitle"><span>' + esc(title) + '</span></div><div class="mw-dlgbody mw-msg"><span class="mw-ico">' + (ICON[kind] || ICON.n) + '</span><pre>' + esc(text) + '</pre></div><div class="mw-dlgbtns">' + buttons.map(function (b, i) { return '<button type="button" data-i="' + i + '">' + b + '</button>'; }).join('') + '</div></div>';
    m.hidden = false; m.querySelector('button').focus();
    var close = function (i) { m.hidden = true; if (cb) cb(i); };
    m.onclick = function (e) { var i = e.target.getAttribute('data-i'); if (i !== null) close(+i); };
    m.onkeydown = function (e) { if (e.key === 'Escape') close(buttons.length - 1); };
  }
  function flash(t, k) { var f = $('#mwFlash'); f.textContent = t; f.className = 'mw-flash ' + (k || ''); f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { f.hidden = true; }, 3500); }
  function outScope() { msgbox('Note', '이 메뉴는 중간고사 범위(정적 구조 해석) 밖이라 연습기에서는 열리지 않습니다.', 'n'); }
  function prefDlg() {
    var m = $('#mwDlg');
    m.innerHTML = '<div class="mw-dlgwin" role="dialog" aria-modal="true" aria-label="Preferences for GUI Filtering"><div class="mw-dlgtitle"><span>Preferences for GUI Filtering</span><button type="button" class="x" data-act="c">✕</button></div><div class="mw-dlgbody"><p><b>[KEYW][/PMETH]</b> Preferences for GUI Filtering</p><fieldset class="mw-fs"><legend>Individual discipline(s) to show in the GUI</legend><label><input type="checkbox" checked disabled> Structural</label><br><label><input type="checkbox" disabled> Thermal</label><br><label><input type="checkbox" disabled> ANSYS Fluid</label><br><label><input type="checkbox" disabled> Electric</label></fieldset><p class="mw-dnote">연습기는 Structural (정적 구조 해석)만 다룹니다.</p></div><div class="mw-dlgbtns"><button type="button" data-act="c">OK</button><button type="button" data-act="c">Cancel</button></div></div>';
    m.hidden = false; m.onclick = function (e) { if (e.target.getAttribute('data-act') === 'c') m.hidden = true; }; m.onkeydown = null;
  }
  function solveDlg() {
    var nN = Object.keys(eng.nodes).length, nE = Object.keys(eng.elems).length, nD = Object.keys(eng.D).length + Object.keys(eng.DK).length, nF = Object.keys(eng.F).length + Object.keys(eng.FK).length, nS = Object.keys(eng.SFB).length;
    var st = 'SOLUTION OPTIONS\n\n   PROBLEM DIMENSIONALITY. . . . . . . . . . . . .' + (eng.is2D && eng.is2D() ? '2-D' : '3-D') + '\n   ANALYSIS TYPE . . . . . . . . . . . . . . . . .STATIC (STEADY-STATE)\n\nLOAD STEP OPTIONS\n\n   LOAD STEP NUMBER. . . . . . . . . . . . . . . .     1\n   TIME AT END OF THE LOAD STEP. . . . . . . . . .  1.0000\n   NUMBER OF SUBSTEPS. . . . . . . . . . . . . . .     1\n\nMODEL\n   NODES . . . . . . . . . . . . . . . . . . . . .' + pad(nN, 6) + '\n   ELEMENTS. . . . . . . . . . . . . . . . . . . .' + pad(nE, 6) + '\n   CONSTRAINED NODES/KPS . . . . . . . . . . . . .' + pad(nD, 6) + '\n   LOADED NODES/KPS. . . . . . . . . . . . . . . .' + pad(nF, 6) + '\n   ELEMENTS WITH BEAM PRESSURE . . . . . . . . . .' + pad(nS, 6);
    var m = $('#mwDlg');
    m.innerHTML = '<div class="mw-stack"><div class="mw-dlgwin wide" role="dialog" aria-label="/STATUS Command"><div class="mw-dlgtitle"><span>/STATUS Command</span></div><div class="mw-dlgbody"><pre class="mw-stat">' + esc(st) + '</pre></div><div class="mw-dlgbtns"><button type="button" data-act="c">Close</button></div></div>' +
      '<div class="mw-dlgwin" role="dialog" aria-modal="true" aria-label="Solve Current Load Step"><div class="mw-dlgtitle"><span>Solve Current Load Step</span></div><div class="mw-dlgbody"><p><b>[SOLVE]</b> Begin Solution of Current Load Step</p><p class="mw-dnote">Review the summary information in the /STATUS window, then press OK to start the solution.</p></div><div class="mw-dlgbtns"><button type="button" data-act="ok">OK</button><button type="button" data-act="c">Cancel</button><button type="button" data-act="h">Help</button></div></div></div>';
    m.hidden = false; m.querySelector('[data-act=ok]').focus();
    m.onclick = function (e) { var a = e.target.getAttribute('data-act'); if (a === 'c') m.hidden = true; if (a === 'h') window.open('ref.html#solve', '_blank'); if (a === 'ok') { m.hidden = true; if (eng.proc !== 'S') { flash('Solution 처리기로 들어갑니다 (/SOLU)'); cmd1('/SOLU'); } setTimeout(function () { cmd1('SOLVE'); }, 30); } };
    m.onkeydown = function (e) { if (e.key === 'Escape') m.hidden = true; };
  }
  function exitDlg() {
    var m = $('#mwDlg');
    m.innerHTML = '<div class="mw-dlgwin" role="dialog" aria-modal="true" aria-label="Exit"><div class="mw-dlgtitle"><span>Exit</span><button type="button" class="x" data-act="c">✕</button></div><div class="mw-dlgbody"><p>Exit from Mechanical APDL</p><fieldset class="mw-fs"><label><input type="radio" name="mwq" value="geom"> Save Geom+Loads</label><br><label><input type="radio" name="mwq" value="solu"> Save Geo+Ld+Solu</label><br><label><input type="radio" name="mwq" value="all"> Save Everything</label><br><label><input type="radio" name="mwq" value="no" checked> Quit - No Save!</label></fieldset><p class="mw-dnote">연습기에서는 종료하면 처음(BEGIN) 상태로 돌아갑니다. 저장을 고르면 RESUM_DB 로 되살릴 수 있습니다.</p></div><div class="mw-dlgbtns"><button type="button" data-act="ok">OK</button><button type="button" data-act="c">Cancel</button></div></div>';
    m.hidden = false; m.querySelector('[data-act=ok]').focus();
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act'); if (a === 'c') m.hidden = true;
      if (a === 'ok') { var v = m.querySelector('input[name=mwq]:checked').value; m.hidden = true; if (v !== 'no') { run('SAVE', { quiet: true }); try { localStorage.setItem(KEY, eng.saved); } catch (x) { } } fresh(); run('/CLEAR', { record: false, quiet: true }); boot(); }
    };
    m.onkeydown = function (e) { if (e.key === 'Escape') m.hidden = true; };
  }
  function pad(v, n) { v = String(v); while (v.length < n) v = ' ' + v; return v; }

  // ================= 메뉴 대화상자 정의 =================
  var ELS = [['LINK180', 'LINK180 (3-D Spar)'], ['BEAM188', 'BEAM188 (3-D 2-node beam)'], ['PLANE182', 'PLANE182 (2-D 4-node solid)'], ['LINK1', 'LINK1 (2-D spar, 옛 요소)'], ['LINK8', 'LINK8 (3-D spar, 옛 요소)'], ['BEAM3', 'BEAM3 (2-D elastic beam, 옛 요소)'], ['PLANE42', 'PLANE42 (옛 요소)'], ['COMBIN14', 'COMBIN14 (spring)']];
  var DOFL = [['ALL', 'All DOF'], ['UX', 'UX'], ['UY', 'UY'], ['UZ', 'UZ'], ['ROTX', 'ROTX'], ['ROTY', 'ROTY'], ['ROTZ', 'ROTZ']];
  var D = {
    ET: { title: 'Element Types — Add', cmd: 'ET', fields: [{ label: 'Element type reference number', def: '1' }, { label: 'Element type', opts: ELS, def: 'LINK180' }, { label: 'KEYOPT(3)  (BEAM188: 3=cubic, PLANE: 0 응력/2 변형/3 두께)', def: '' }], build: 'ET,{0},{1},,,{2}' },
    R: { title: 'Real Constant Set', cmd: 'R', fields: [{ label: 'Real constant set no.', def: '1' }, { label: 'R1 (AREA / K / THK)', def: '' }, { label: 'R2 (IZZ)', def: '' }, { label: 'R3 (HEIGHT)', def: '' }], build: 'R,{0},{1},{2},{3}', note: '수업 방식은 실상수 대신 SECTYPE/SECDATA 를 씁니다 (옛 요소용).' },
    MP: { title: 'Define Material Model Behavior — Linear Isotropic', cmd: 'MP', fields: [{ label: 'Material number', def: '1' }, { label: 'EX (Young\'s modulus)', def: '' }, { label: 'PRXY (Poisson\'s ratio)', def: '0.3' }], build: function (v) { return 'MP,EX,' + v[0] + ',' + v[1] + (v[2] ? '\nMP,PRXY,' + v[0] + ',' + v[2] : ''); } },
    SECB: { title: 'Beam Tool — Common Sections', cmd: 'SECTYPE', fields: [{ label: 'Section ID', def: '1' }, { label: 'Sub-Type', opts: [['RECT', 'RECT (B, H)'], ['CSOLID', 'CSOLID (R)'], ['CTUBE', 'CTUBE (Ri, Ro)'], ['I', 'I (W1,W2,W3,t1,t2,t3)'], ['CHAN', 'CHAN (W1,W2,W3,t1,t2,t3)'], ['HREC', 'HREC'], ['ASEC', 'ASEC (A,Iyy,Iyz,Izz,Iw,J)']], def: 'I' }, { label: 'SECDATA 값 (쉼표로)', def: '' }, { label: 'Offset (SECOFFSET)', opts: ['CENT', 'SHRC', 'ORIGIN', 'USER'], def: 'CENT' }], build: function (v) { return 'SECTYPE,' + v[0] + ',BEAM,' + v[1] + '\nSECDATA,' + v[2] + (v[3] !== 'CENT' ? '\nSECOFFSET,' + v[3] : ''); } },
    SECL: { title: 'Link Sections — Add', cmd: 'SECTYPE', fields: [{ label: 'Section ID', def: '1' }, { label: 'Link area', def: '' }], build: 'SECTYPE,{0},LINK\nSECDATA,{1}' },
    K: { title: 'Create Keypoints in Active Coordinate System', cmd: 'K', fields: [{ label: 'NPT  Keypoint number', def: '' }, { label: 'X', def: '' }, { label: 'Y', def: '' }, { label: 'Z', def: '' }], build: 'K,{0},{1},{2},{3}' },
    L: { title: 'Straight Line', cmd: 'L', fields: [{ label: 'P1  Keypoint', def: '' }, { label: 'P2  Keypoint', def: '' }], build: 'L,{0},{1}' },
    RECTNG: { title: 'Create Rectangle by Dimensions', cmd: 'RECTNG', fields: [{ label: 'X1, X2  X-coordinates (X1)', def: '' }, { label: '(X2)', def: '' }, { label: 'Y1, Y2  Y-coordinates (Y1)', def: '' }, { label: '(Y2)', def: '' }], build: 'RECTNG,{0},{1},{2},{3}' },
    PCIRC: { title: 'Circular Area by Dimensions', cmd: 'PCIRC', fields: [{ label: 'RAD1  Outer radius', def: '' }, { label: 'RAD2  Optional inner radius', def: '' }, { label: 'THETA1  Starting angle (degrees)', def: '0' }, { label: 'THETA2  Ending angle (degrees)', def: '360' }], build: 'PCIRC,{0},{1},{2},{3}' },
    AADD: { title: 'Add Areas', cmd: 'AADD', fields: [{ label: 'NA1..  Areas (ALL 또는 번호들, 쉼표)', def: 'ALL' }], build: 'AADD,{0}' },
    ASBA: { title: 'Subtract Areas', cmd: 'ASBA', fields: [{ label: 'NA1  Area to be subtracted from', def: '' }, { label: 'NA2  Area to subtract (ALL 가능)', def: '' }], build: 'ASBA,{0},{1}' },
    WPAVE: { title: 'Offset WP to XYZ Locations', cmd: 'WPAVE', fields: [{ label: 'X', def: '0' }, { label: 'Y', def: '0' }, { label: 'Z', def: '0' }], build: 'WPAVE,{0},{1},{2}' },
    LOCAL: { title: 'Create Local CS at Specified Location', cmd: 'LOCAL', fields: [{ label: 'KCN  Ref number of new coord sys', def: '11' }, { label: 'KCS  Type of coordinate system', opts: [['0', 'Cartesian 0'], ['1', 'Cylindrical 1'], ['2', 'Spherical 2']], def: '0' }, { label: 'XC', def: '0' }, { label: 'YC', def: '0' }, { label: 'ZC', def: '0' }, { label: 'THXY  Rotation about local Z', def: '0' }], build: 'LOCAL,{0},{1},{2},{3},{4},{5}' },
    N: { title: 'Create Nodes in Active Coordinate System', cmd: 'N', fields: [{ label: 'NODE  Node number', def: '' }, { label: 'X', def: '' }, { label: 'Y', def: '' }, { label: 'Z', def: '' }, { label: 'THXY  Rotation angles (degrees)', def: '' }], build: 'N,{0},{1},{2},{3},{4}' },
    FILL: { title: 'Create Nodes Between 2 Nodes', cmd: 'FILL', fields: [{ label: 'NODE1', def: '' }, { label: 'NODE2', def: '' }, { label: 'NFILL  Number of nodes to fill', def: '' }], build: 'FILL,{0},{1},{2}' },
    NROTAT: { title: 'Rotate Node CS to Active CS', cmd: 'NROTAT', fields: [{ label: 'NODE1  (ALL 가능)', def: '' }], build: 'NROTAT,{0}' },
    NMODIF: { title: 'Modify Nodes', cmd: 'NMODIF', fields: [{ label: 'NODE', def: '' }, { label: 'X (빈칸=유지)', def: '' }, { label: 'Y', def: '' }, { label: 'Z', def: '' }, { label: 'THXY', def: '' }], build: 'NMODIF,{0},{1},{2},{3},{4}' },
    ATT: { title: 'Element Attributes', cmd: 'TYPE', fields: [{ label: 'TYPE  Element type number', def: '1' }, { label: 'MAT  Material number', def: '1' }, { label: 'REAL  Real constant set number', def: '1' }, { label: 'SECNUM  Section number', def: '1' }], build: 'TYPE,{0}\nMAT,{1}\nREAL,{2}\nSECNUM,{3}' },
    E: { title: 'Elements from Nodes', cmd: 'E', fields: [{ label: 'I  Node', def: '' }, { label: 'J  Node', def: '' }, { label: 'K  Node (BEAM188 방향 노드 / PLANE)', def: '' }, { label: 'L  Node (PLANE)', def: '' }], build: 'E,{0},{1},{2},{3}' },
    NGEN: { title: 'Copy Nodes', cmd: 'NGEN', fields: [{ label: 'ITIME  Total number of copies (원본 포함)', def: '2' }, { label: 'INC  Node number increment', def: '' }, { label: 'NODE1', def: '' }, { label: 'NODE2', def: '' }, { label: 'NINC', def: '1' }, { label: 'DX (원통 CS: dR)', def: '' }, { label: 'DY (원통 CS: dθ)', def: '' }, { label: 'DZ', def: '' }], build: 'NGEN,{0},{1},{2},{3},{4},{5},{6},{7}' },
    EGEN: { title: 'Copy Elements (Automatically Numbered)', cmd: 'EGEN', fields: [{ label: 'ITIME  Total number of copies', def: '2' }, { label: 'NINC  Node number increment', def: '' }, { label: 'IEL1  Element', def: '' }, { label: 'IEL2', def: '' }], build: 'EGEN,{0},{1},{2},{3}' },
    LSYMM: { title: 'Reflect Lines', cmd: 'LSYMM', fields: [{ label: 'Ncomp  Plane of symmetry', opts: [['X', 'Y-Z plane  X'], ['Y', 'X-Z plane  Y'], ['Z', 'X-Y plane  Z']], def: 'X' }, { label: 'NL1  Lines (ALL 가능)', def: 'ALL' }], build: 'LSYMM,{0},{1}' },
    ESIZE: { title: 'Global Element Sizes', cmd: 'ESIZE', fields: [{ label: 'SIZE  Element edge length', def: '' }, { label: 'NDIV  No. of element divisions (SIZE 비우면 사용)', def: '' }], build: 'ESIZE,{0},{1}' },
    LMESH: { title: 'Mesh Lines', cmd: 'LMESH', fields: [{ label: 'NL1  Lines', def: 'ALL' }], build: 'LMESH,{0}' },
    AMESH: { title: 'Mesh Areas (Free)', cmd: 'AMESH', fields: [{ label: 'NA1  Areas', def: 'ALL' }], build: 'AMESH,{0}' },
    D: { title: 'Apply U,ROT on Nodes', cmd: 'D', fields: [{ label: 'NODE  (ALL = 선택된 노드)', def: '' }, { label: 'Lab2  DOFs to be constrained', opts: DOFL, def: 'ALL' }, { label: 'VALUE  Displacement value', def: '0' }, { label: '추가 DOF (Lab2)', opts: [['', '(없음)']].concat(DOFL.slice(1)), def: '' }, { label: '추가 DOF (Lab3)', opts: [['', '(없음)']].concat(DOFL.slice(1)), def: '' }], build: function (v) { var s = 'D,' + v[0] + ',' + v[1] + ',' + v[2]; if (v[3] || v[4]) s += ',,,,' + v[3] + ',' + v[4]; return s.replace(/,+$/, ''); } },
    DK: { title: 'Apply U,ROT on KPs', cmd: 'DK', fields: [{ label: 'KPOI  Keypoint', def: '' }, { label: 'Lab  DOF', opts: DOFL, def: 'ALL' }, { label: 'VALUE', def: '0' }], build: 'DK,{0},{1},{2}' },
    F: { title: 'Apply F/M on Nodes', cmd: 'F', fields: [{ label: 'NODE', def: '' }, { label: 'Lab  Direction of force/mom', opts: ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'], def: 'FY' }, { label: 'VALUE  Force/moment value', def: '' }], build: 'F,{0},{1},{2}' },
    FK: { title: 'Apply F/M on KPs', cmd: 'FK', fields: [{ label: 'KPOI  Keypoint', def: '' }, { label: 'Lab', opts: ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'], def: 'FY' }, { label: 'VALUE', def: '' }], build: 'FK,{0},{1},{2}' },
    SFBEAM: { title: 'Apply PRES on Beams', cmd: 'SFBEAM', fields: [{ label: 'Elem  (ALL = 선택된 요소)', def: 'ALL' }, { label: 'LKEY  Load key (BEAM188: 1=−z, 2=−y)', def: '2' }, { label: 'VALI  Pressure value at node I', def: '' }, { label: 'VALJ  at node J (빈칸=VALI)', def: '' }], build: 'SFBEAM,{0},{1},PRES,{2},{3}' },
    ANTYPE: { title: 'New Analysis', cmd: 'ANTYPE', fields: [{ label: 'Type of analysis', opts: [['STATIC', 'Static']], def: 'STATIC' }], build: 'ANTYPE,{0}' },
    PLDISP: { title: 'Plot Deformed Shape', cmd: 'PLDISP', fields: [{ label: 'KUND  Items to be plotted', opts: [['0', 'Def shape only'], ['1', 'Def + undeformed'], ['2', 'Def + undef edge']], def: '1' }], build: 'PLDISP,{0}' },
    PLNSOL: { title: 'Contour Nodal Solution Data', cmd: 'PLNSOL', fields: [{ label: 'Item', opts: [['U', 'DOF Solution — Displacement'], ['ROT', 'DOF Solution — Rotation'], ['S', 'Stress (2-D solid)']], def: 'U' }, { label: 'Comp', opts: ['SUM', 'X', 'Y', 'Z', 'EQV', '1', '2', 'XY'], def: 'SUM' }], build: 'PLNSOL,{0},{1}' },
    PRNSOL: { title: 'List Nodal Solution', cmd: 'PRNSOL', fields: [{ label: 'Item', opts: [['U', 'Displacement U'], ['ROT', 'Rotation ROT'], ['S', 'Stress S (2-D solid)']], def: 'U' }, { label: 'Comp', opts: ['COMP', 'X', 'Y', 'Z', 'SUM', 'PRIN', 'EQV'], def: 'COMP' }], build: 'PRNSOL,{0},{1}' },
    ETABLE: { title: 'Define Additional Element Table Items', cmd: 'ETABLE', fields: [{ label: 'Lab  User label for item', def: 'AXF' }, { label: 'Item', opts: ['SMISC', 'LS', 'NMISC', 'S'], def: 'SMISC' }, { label: 'Comp  (번호 또는 X/Y/EQV)', def: '1' }], build: 'ETABLE,{0},{1},{2}', note: 'LINK180: SMISC,1 축력 · LS,1 축응력 / BEAM188: SMISC,1·3·4·31~35 …' },
    PRETAB: { title: 'List Element Table Data', cmd: 'PRETAB', fields: [{ label: 'Lab1..  Items (비우면 전부)', def: '' }], build: 'PRETAB,{0}' },
    PLETAB: { title: 'Contour Plot of Elem Table Data', cmd: 'PLETAB', fields: [{ label: 'Itlab  Item to be plotted', def: '' }], build: 'PLETAB,{0}' },
    TITLE: { title: 'Change Title', cmd: '/TITLE', fields: [{ label: 'Title', def: '' }], build: '/TITLE,{0}' },
    PNUM: { title: 'Plot Numbering Controls', cmd: '/PNUM', fields: [{ label: 'KP  Keypoint numbers', check: 1, def: eng.pnum.KP }, { label: 'LINE  Line numbers', check: 1 }, { label: 'AREA  Area numbers', check: 1 }, { label: 'NODE  Node numbers', check: 1 }, { label: 'ELEM  Element numbers', check: 1 }], build: function (v) { return ['KP', 'LINE', 'AREA', 'NODE', 'ELEM'].map(function (k, i) { return '/PNUM,' + k + ',' + v[i]; }).join('\n') + '\n/REPLOT'; } },
    NSEL: { title: 'Select Entities — Nodes by Location', cmd: 'NSEL', fields: [{ label: 'Type', opts: [['S', 'From Full (S)'], ['R', 'Reselect (R)'], ['A', 'Also Select (A)'], ['U', 'Unselect (U)']], def: 'S' }, { label: 'Coordinate', opts: ['X', 'Y', 'Z'], def: 'X' }, { label: 'Min', def: '' }, { label: 'Max (빈칸=Min)', def: '' }], build: 'NSEL,{0},LOC,{1},{2},{3}' },
    PARAM: { title: 'Scalar Parameters', cmd: '*SET', fields: [{ label: 'Name', def: '' }, { label: 'Value (식 가능)', def: '' }], build: '{0}={1}' }
  };
  D.PNUM.fields.forEach(function (f, i) { f.def = !!eng.pnum[['KP', 'LINE', 'AREA', 'NODE', 'ELEM'][i]]; });

  // ================= Main Menu (트리) =================
  var MENU = [
    ['Preferences', { act: prefDlg }],
    ['Preprocessor', { proc: '/PREP7', kids: [
      ['Element Type', { kids: [['Add/Edit/Delete', { dlg: 'ET' }]] }],
      ['Real Constants', { kids: [['Add/Edit/Delete', { dlg: 'R' }]] }],
      ['Material Props', { kids: [['Material Models', { dlg: 'MP' }]] }],
      ['Sections', { kids: [['Beam', { kids: [['Common Sections', { dlg: 'SECB' }]] }], ['Link', { kids: [['Add', { dlg: 'SECL' }]] }], ['List Sections', { cmd: 'SLIST' }]] }],
      ['Modeling', { kids: [
        ['Create', { kids: [
          ['Keypoints', { kids: [['In Active CS', { dlg: 'K' }]] }],
          ['Lines', { kids: [['Lines', { kids: [['Straight Line', { dlg: 'L' }]] }]] }],
          ['Areas', { kids: [['Rectangle', { kids: [['By Dimensions', { dlg: 'RECTNG' }]] }], ['Circle', { kids: [['By Dimensions', { dlg: 'PCIRC' }]] }]] }],
          ['Nodes', { kids: [['In Active CS', { dlg: 'N' }], ['Fill between Nds', { dlg: 'FILL' }], ['Rotate Node CS', { kids: [['To Active CS', { dlg: 'NROTAT' }]] }]] }],
          ['Elements', { kids: [['Elem Attributes', { dlg: 'ATT' }], ['Auto Numbered', { kids: [['Thru Nodes', { dlg: 'E' }]] }]] }]
        ] }],
        ['Operate', { kids: [['Booleans', { kids: [['Add', { kids: [['Areas', { dlg: 'AADD' }]] }], ['Subtract', { kids: [['Areas', { dlg: 'ASBA' }]] }]] }]] }],
        ['Copy', { kids: [['Nodes', { kids: [['Copy', { dlg: 'NGEN' }]] }], ['Elements', { kids: [['Auto Numbered', { dlg: 'EGEN' }]] }]] }],
        ['Reflect', { kids: [['Lines', { dlg: 'LSYMM' }]] }],
        ['Move / Modify', { kids: [['Nodes', { kids: [['Set of Nodes', { dlg: 'NMODIF' }]] }]] }]
      ] }],
      ['Meshing', { kids: [['Size Cntrls', { kids: [['ManualSize', { kids: [['Global', { kids: [['Size', { dlg: 'ESIZE' }]] }]] }]] }], ['Mesh', { kids: [['Lines', { dlg: 'LMESH' }], ['Areas', { kids: [['Free', { dlg: 'AMESH' }]] }]] }]] }],
      ['Loads', { kids: [['Define Loads', { kids: [['Apply', { kids: [['Structural', { kids: [
        ['Displacement', { kids: [['On Nodes', { dlg: 'D' }], ['On Keypoints', { dlg: 'DK' }]] }],
        ['Force/Moment', { kids: [['On Nodes', { dlg: 'F' }], ['On Keypoints', { dlg: 'FK' }]] }],
        ['Pressure', { kids: [['On Beams', { dlg: 'SFBEAM' }]] }]] }]] }]] }]] }]
    ] }],
    ['Solution', { proc: '/SOLU', kids: [
      ['Analysis Type', { kids: [['New Analysis', { dlg: 'ANTYPE' }]] }],
      ['Define Loads', { kids: [['Apply', { kids: [['Structural', { kids: [['Displacement', { kids: [['On Nodes', { dlg: 'D' }]] }], ['Force/Moment', { kids: [['On Nodes', { dlg: 'F' }]] }], ['Pressure', { kids: [['On Beams', { dlg: 'SFBEAM' }]] }]] }]] }]] }],
      ['Solve', { kids: [['Current LS', { act: solveDlg }]] }]
    ] }],
    ['General Postproc', { proc: '/POST1', kids: [
      ['Read Results', { kids: [['Last Set', { cmd: 'SET,LAST' }]] }],
      ['Plot Results', { kids: [['Deformed Shape', { dlg: 'PLDISP' }], ['Contour Plot', { kids: [['Nodal Solu', { dlg: 'PLNSOL' }]] }]] }],
      ['List Results', { kids: [['Nodal Solution', { dlg: 'PRNSOL' }], ['Reaction Solu', { cmd: 'PRRSOL' }]] }],
      ['Element Table', { kids: [['Define Table', { dlg: 'ETABLE' }], ['Plot Elem Table', { dlg: 'PLETAB' }], ['List Elem Table', { dlg: 'PRETAB' }]] }]
    ] }],
    ['TimeHist Postpro', { kids: [['Variable Viewer', { act: outScope }]] }],
    ['Radiation Opt', { kids: [['Radiosity Meth', { act: outScope }]] }],
    ['Session Editor', { act: openSession }],
    ['Finish', { cmd: 'FINISH' }]
  ];

  D.VIEW = { title: 'Viewing Direction', cmd: '/VIEW', fields: [{ label: 'WN  Window number', def: '1' }, { label: 'XV  coords of view point', def: '1' }, { label: 'YV', def: '1' }, { label: 'ZV', def: '1' }], build: '/VIEW,{0},{1},{2},{3}', note: '(XV,YV,ZV) 쪽에서 원점을 바라봅니다. 0,0,1 = Front, 1,1,1 = Iso' };

  function buildTree(items, depth) {
    var ul = document.createElement('ul');
    items.forEach(function (it) {
      var li = document.createElement('li'), o = it[1], b = document.createElement('button'), sub;
      b.type = 'button'; b.className = 'mw-node'; b.style.paddingLeft = (4 + depth * 16) + 'px';
      b.innerHTML = (o.kids ? '<i class="bx">+</i>' : '<i class="dl"></i>') + '<span>' + esc(it[0]) + '</span>';
      if (o.proc) b.setAttribute('data-proc', { '/PREP7': 'P', '/SOLU': 'S', '/POST1': 'O' }[o.proc]);
      li.appendChild(b);
      if (o.kids) { sub = buildTree(o.kids, depth + 1); sub.hidden = true; li.appendChild(sub); }
      b.onclick = function () {
        if (o.kids) { sub.hidden = !sub.hidden; b.querySelector('.bx').textContent = sub.hidden ? '+' : '−'; if (o.proc && !sub.hidden) enterProc(o.proc); return; }
        var top = findProc(b); if (top) enterProc(top);
        if (o.dlg) dialog(D[o.dlg]); else if (o.cmd) cmd1(o.cmd); else if (o.act) o.act();
      };
      ul.appendChild(li);
    });
    return ul;
  }
  function findProc(b) { var li = b.closest('li'); while (li) { var pb = li.querySelector(':scope > button[data-proc]'); if (pb) return { P: '/PREP7', S: '/SOLU', O: '/POST1' }[pb.getAttribute('data-proc')]; li = li.parentElement.closest('li'); } return null; }
  function enterProc(c) { var want = { '/PREP7': 'P', '/SOLU': 'S', '/POST1': 'O' }[c]; if (eng.proc !== want) cmd1(c); }
  $('#mwTree').appendChild(buildTree(MENU, 0));

  // ================= Utility Menu =================
  function toggle(sel) { var e = $(sel); e.hidden = !e.hidden; draw(); }
  var UMENU = [
    ['File', 0, [['Clear & Start New…', function () { msgbox('Clear Database and Start New', 'Clear database and Start new?\n(/CLEAR — 모델·하중·결과가 모두 지워집니다)', 'q', ['OK', 'Cancel'], function (i) { if (i === 0) { fresh(); run('/CLEAR', { quiet: true }); boot(); } }); }], ['Change Jobname…', function () { flash('연습기의 Jobname 은 file 로 고정입니다.'); }], ['Change Title…', function () { dialog(D.TITLE); }], '-', ['Resume Jobname.db…', resumeDb], ['Save as Jobname.db', saveDb], '-', ['Read Input from…', openRead], ['Write DB log file…', function () { download('file.log', eng.hist.join('\n') + '\n'); }], '-', ['Exit…', exitDlg]]],
    ['Select', 0, [['Entities…', function () { dialog(D.NSEL); }], '-', ['Everything', 'ALLSEL']]],
    ['List', 0, [['Keypoints', 'KLIST'], ['Lines', 'LLIST'], ['Areas', 'ALIST'], ['Nodes', 'NLIST'], ['Elements', 'ELIST'], '-', ['Properties › Element Types', 'ETLIST'], ['Properties › Real Constants', 'RLIST'], ['Properties › All Materials', 'MPLIST'], ['Properties › Section Properties', 'SLIST'], '-', ['Loads › DOF Constraints', 'DLIST'], ['Loads › Nodal Loads', 'FLIST'], ['Loads › Surface Loads', 'SFELIST'], '-', ['Other › Parameters', '*STATUS']]],
    ['Plot', 0, [['Replot', '/REPLOT'], '-', ['Keypoints', 'KPLOT'], ['Lines', 'LPLOT'], ['Areas', 'APLOT'], ['Nodes', 'NPLOT'], ['Elements', 'EPLOT'], '-', ['Multi-Plots', 'GPLOT']]],
    ['PlotCtrls', 4, [['Pan Zoom Rotate…', function () { setDyn(!view.dyn); }], ['View Settings › Viewing Direction…', function () { dialog(D.VIEW); }], '-', ['Numbering…', function () { D.PNUM.fields.forEach(function (f, i) { f.def = !!eng.pnum[['KP', 'LINE', 'AREA', 'NODE', 'ELEM'][i]]; }); dialog(D.PNUM); }], ['Symbols… (구속·하중 표시 켜기/끄기)', function () { view.noBC = !view.noBC; draw(); }], '-', ['Capture Image…', capture], ['Reset Plot Ctrls…', function () { setDir([0, 0, 1]); run('/PNUM,KP,0\n/PNUM,LINE,0\n/PNUM,AREA,0\n/PNUM,NODE,0\n/PNUM,ELEM,0', { quiet: true }); }]]],
    ['WorkPlane', 0, [['Display Working Plane', function () { view.wp = !view.wp; draw(); }], ['Offset WP to › XYZ Locations…', function () { dialog(D.WPAVE); }], ['Offset WP to › Global Origin', 'WPAVE,0,0,0'], '-', ['Local Coordinate Systems › Create Local CS…', function () { dialog(D.LOCAL); }], ['Change Active CS to › Global Cartesian', 'CSYS,0'], ['Change Active CS to › Global Cylindrical', 'CSYS,1']]],
    ['Parameters', 1, [['Scalar Parameters…', function () { dialog(D.PARAM); }], ['List Parameters', '*STATUS']]],
    ['Macro', 0, [['Execute Data Block…', openRead], ['Create Macro… (Session Editor)', openSession]]],
    ['MenuCtrls', 2, [['Toolbar 보이기/숨기기', function () { toggle('#mwTb'); }], ['Main Menu 보이기/숨기기', function () { $('#mapdl').classList.toggle('nomm'); draw(); }], ['Output Window 보이기/숨기기', function () { toggle('#mwOutWin'); }], ['메모 보이기/숨기기', function () { root.classList.toggle('nomemo'); draw(); }]]],
    ['Help', 0, [['Help Topics (APDL 명령 참고자료)', function () { window.open('ref.html', '_blank'); }], ['기출 풀이', function () { window.open('exams.html', '_blank'); }], ['연습기 사용법', function () { document.getElementById('howto').scrollIntoView(); }]]]
  ];
  var bar = $('#mwMenubar');
  UMENU.forEach(function (mn) {
    var wrap = document.createElement('div'), b = document.createElement('button'), dd = document.createElement('div'), nm = mn[0], u = mn[1];
    wrap.className = 'mw-mi'; b.type = 'button'; b.innerHTML = esc(nm.slice(0, u)) + '<u>' + esc(nm[u]) + '</u>' + esc(nm.slice(u + 1)); b.setAttribute('data-key', nm[u].toLowerCase());
    dd.className = 'mw-dd'; dd.hidden = true;
    mn[2].forEach(function (it) {
      if (it === '-') { dd.appendChild(document.createElement('hr')); return; }
      var x = document.createElement('button'); x.type = 'button'; x.textContent = it[0];
      x.onclick = function () { closeMenus(); if (typeof it[1] === 'function') it[1](); else cmd1(it[1]); };
      dd.appendChild(x);
    });
    b.onclick = function (e) { e.stopPropagation(); var open = dd.hidden; closeMenus(); dd.hidden = !open; b.classList.toggle('on', open); };
    b.onmouseenter = function () { if (bar.querySelector('.mw-dd:not([hidden])')) { closeMenus(); dd.hidden = false; b.classList.add('on'); } };
    wrap.appendChild(b); wrap.appendChild(dd); bar.appendChild(wrap);
  });
  function closeMenus() { bar.querySelectorAll('.mw-dd').forEach(function (d) { d.hidden = true; }); bar.querySelectorAll('.mw-mi>button').forEach(function (d) { d.classList.remove('on'); }); }
  document.addEventListener('click', closeMenus);
  root.addEventListener('keydown', function (e) { if (e.altKey && !e.ctrlKey && e.key.length === 1) { var b = bar.querySelector('[data-key="' + e.key.toLowerCase() + '"]'); if (b) { e.preventDefault(); b.click(); var f = b.nextSibling.querySelector('button'); if (f) f.focus(); } } });

  // ================= 아이콘 막대 · Toolbar · 창 버튼 =================
  var IC = {
    nw: '<path d="M4 2h7l4 4v11H4z" fill="#fff" stroke="#000"/><path d="M11 2v4h4" fill="none" stroke="#000"/>',
    op: '<path d="M2 6h5l1 1h7v9H2z" fill="#f2c94c" stroke="#7a5b00"/><path d="M4 9h13l-2 7H2z" fill="#ffe08a" stroke="#7a5b00"/>',
    sv: '<rect x="2.5" y="2.5" width="14" height="14" fill="#2b4fa8" stroke="#0e1f4d"/><rect x="5" y="3" width="9" height="5" fill="#fff"/><rect x="5" y="11" width="9" height="5" fill="#ccc"/>',
    pz: '<path d="M4 7l5-3 6 3v7l-6 3-5-3z" fill="#7fb7ff" stroke="#0e3f8f"/><path d="M4 7l5 3 6-3M9 10v7" fill="none" stroke="#0e3f8f"/>',
    pr: '<rect x="5" y="2.5" width="9" height="5" fill="#fff" stroke="#000"/><rect x="2.5" y="7.5" width="14" height="6" fill="#bbb" stroke="#000"/><rect x="5" y="11.5" width="9" height="5" fill="#fff" stroke="#000"/>',
    hp: '<circle cx="9.5" cy="6.5" r="4.2" fill="#ffd21f" stroke="#7a5b00"/><path d="M9.5 10v7" stroke="#7a5b00" stroke-width="2.2"/><circle cx="9.5" cy="6.3" r="1.4" fill="#7a5b00"/>',
    cm: '<rect x="2" y="3" width="15" height="13" fill="#fff" stroke="#000"/><path d="M4 6h11M4 9h11M4 12h7" stroke="#000"/>',
    rh: '<rect x="2" y="2" width="15" height="15" fill="#fff" stroke="#000"/><path d="M5 6h9M5 9h9M5 12h9M9.5 3v13" stroke="#24408f" stroke-width="1.6"/>',
    rp: '<path d="M4 3l9 7-4 1 3 5-2 1-3-5-3 3z" fill="#fff" stroke="#000"/><path d="M13 3h4M15 1v4" stroke="#000"/>',
    ct: '<rect x="2.5" y="2.5" width="14" height="14" fill="#fff" stroke="#000"/><rect x="5" y="5" width="4" height="9" fill="#4caf50"/><rect x="10" y="5" width="4" height="9" fill="#e53935"/>'
  };
  function ic(k) { return '<svg viewBox="0 0 19 19" width="19" height="19" aria-hidden="true">' + IC[k] + '</svg>'; }
  [['icNew', 'nw', 'New Analysis (/CLEAR)'], ['icOpen', 'op', 'Open Ansys File (RESUME)'], ['icSave', 'sv', 'Save Analysis (SAVE)'], ['icPzr', 'pz', 'Pan-Zoom-Rotate (Dynamic Mode)'], ['icPrint', 'pr', 'Image Capture'], ['icHelp', 'hp', 'Help'], ['icRaise', 'rh', 'Raise Hidden (Output Window)'], ['icReset', 'rp', 'Reset Picking'], ['icContact', 'ct', 'Contact Manager']].forEach(function (a) { var b = $('#' + a[0]); b.innerHTML = ic(a[1]); b.title = a[2]; b.setAttribute('aria-label', a[2]); });
  $('#mwCmdIco').innerHTML = ic('cm');
  $('#icNew').onclick = UMENU[0][2][0][1];
  $('#icOpen').onclick = resumeDb; $('#icSave').onclick = saveDb;
  $('#icPzr').onclick = function () { setDyn(!view.dyn); };
  $('#icPrint').onclick = capture; $('#icHelp').onclick = function () { window.open('ref.html', '_blank'); };
  $('#icRaise').onclick = function () { var o = $('#mwOutWin'); o.hidden = false; o.classList.remove('omin'); o.scrollIntoView({ block: 'nearest' }); };
  $('#icReset').onclick = function () { flash('Reset Picking — 연습기에는 마우스 선택(picking)이 없습니다. 번호를 직접 입력하세요.'); };
  $('#icContact').onclick = outScope;
  $('#tbSave').onclick = saveDb; $('#tbResume').onclick = resumeDb; $('#tbQuit').onclick = exitDlg;
  $('#tbPower').onclick = function () { cmd1('/GRAPHICS,POWER'); flash('POWRGRPH: PowerGraphics 는 항상 켜져 있습니다.'); };
  function saveDb() { cmd1('SAVE'); try { localStorage.setItem(KEY, eng.saved); } catch (e) { } }
  function resumeDb() { try { if (!eng.saved) eng.saved = localStorage.getItem(KEY); } catch (e) { } cmd1('RESUME'); }
  root.querySelectorAll('[data-coll]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-coll'); if (k === 'tb') toggle('#mwTb'); else { root.classList.toggle('nomm'); draw(); } b.classList.toggle('flip'); }; });
  root.querySelectorAll('[data-w]').forEach(function (b) {
    b.onclick = function () {
      var w = b.getAttribute('data-w');
      if (w === 'max') { root.classList.toggle('max'); root.classList.remove('min'); document.body.classList.toggle('mw-lock', root.classList.contains('max')); b.innerHTML = root.classList.contains('max') ? '❐' : '☐'; b.title = root.classList.contains('max') ? 'Restore Down' : 'Maximize'; }
      if (w === 'min') root.classList.toggle('min');
      if (w === 'close') exitDlg();
      if (w === 'omin') $('#mwOutWin').classList.toggle('omin');
      setTimeout(draw, 0);
    };
  });

  // ================= Session Editor / Read Input =================
  function openSession() {
    var m = $('#mwSess'); m.hidden = false; var ta = $('#mwSessTa'); ta.value = eng.hist.join('\n'); ta.focus();
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act'); if (!a) return;
      if (a === 'cancel') m.hidden = true;
      if (a === 'save') download('session.txt', ta.value);
      if (a === 'ok') { m.hidden = true; var t = ta.value; fresh(); runMany(t); }
    };
  }
  function openRead() {
    var m = $('#mwRead'), list = $('#mwReadList'); m.hidden = false; list.innerHTML = '';
    (window.APDL_EXAMPLES || []).forEach(function (x, i) { var o = document.createElement('option'); o.value = 'ex' + i; o.textContent = x.name; list.appendChild(o); });
    (window.APDL_FILES || []).forEach(function (x) { var o = document.createElement('option'); o.value = 'f:' + x.path; o.textContent = '수업 파일: ' + x.name; list.appendChild(o); });
    list.selectedIndex = 0; list.focus();
    var go = function (text, name) { m.hidden = true; if ($('#mwReadClear').checked) fresh(); eng.p(' /INPUT,' + name); runMany(text); flash(name + ' 실행 완료'); };
    var dec = function (buf) { var t = new TextDecoder('utf-8').decode(buf); if (t.indexOf('�') > -1) t = new TextDecoder('euc-kr').decode(buf); return t; };
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act'); if (!a) return;
      if (a === 'cancel') { m.hidden = true; return; }
      var v = list.value; if (!v) return;
      if (v.indexOf('ex') === 0) { var x = window.APDL_EXAMPLES[+v.slice(2)]; go(x.code, x.name); }
      else fetch(v.slice(2)).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (buf) { go(dec(buf), list.options[list.selectedIndex].textContent.replace('수업 파일: ', '')); }).catch(function () { msgbox('Error', 'File ' + v.slice(2) + ' could not be opened.', 'e'); });
    };
    list.ondblclick = function () { m.querySelector('[data-act=ok]').click(); };
    $('#mwReadFile').onchange = function (e) {
      var fl = e.target.files[0]; if (!fl) return; var r = new FileReader();
      r.onload = function () { go(dec(r.result), fl.name); }; r.readAsArrayBuffer(fl); e.target.value = '';
    };
  }
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  function capture() {
    var W = svg.clientWidth, H = svg.clientHeight, s = new XMLSerializer().serializeToString(svg).replace('<svg', '<svg width="' + W + '" height="' + H + '"');
    var img = new Image(); img.onload = function () { var c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; var g = c.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0); c.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'file000.png'; a.click(); }); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }

  // ================= 보기 도구 (오른쪽 세로 막대) =================
  var M3 = window.ApdlCore;
  function setDir(d) {
    var z, n = Math.hypot(d[0], d[1], d[2]);
    if (!n) d = [0, 0, 1], n = 1;
    z = [d[0] / n, d[1] / n, d[2] / n];
    var up = Math.abs(z[1]) > 0.999 ? (z[1] > 0 ? [0, 0, -1] : [0, 0, 1]) : [0, 1, 0];
    var x = nrm(cr(up, z)), y = cr(z, x);
    view.R = [x, y, z]; view.zoom = 1; view.panX = view.panY = 0; draw();
  }
  function rotS(ax, deg) { // 화면 축 기준 회전
    var t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), Rs;
    if (ax === 0) Rs = [[1, 0, 0], [0, c, -s], [0, s, c]]; else if (ax === 1) Rs = [[c, 0, s], [0, 1, 0], [-s, 0, c]]; else Rs = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
    var R = view.R; view.R = [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return Rs[i][0] * R[0][j] + Rs[i][1] * R[1][j] + Rs[i][2] * R[2][j]; }); });
  }
  function pushView() { view.stack.push({ R: view.R, zoom: view.zoom, panX: view.panX, panY: view.panY }); if (view.stack.length > 30) view.stack.shift(); }
  function zoomAt(px, py, f, toX, toY) { // (px,py) 의 점을 확대 f 후 (toX,toY) 로
    var T = view.T; if (!T) return; var rx = (px - T.ox) / T.sc, ry = (T.oy - py) / T.sc;
    view.zoom = Math.max(0.02, Math.min(500, view.zoom * f)); var sc2 = T.base * view.zoom;
    view.panX = toX - rx * sc2 - T.W / 2 + T.cx * sc2; view.panY = toY + ry * sc2 - T.Hc - T.cy * sc2;
  }
  function setDyn(on) { view.dyn = on; $('#vtDyn').classList.toggle('on', on); flash(on ? 'Dynamic Mode: 그래픽 창을 드래그하면 회전, 휠 = 확대/축소' : 'Dynamic Mode 끔 (드래그 = 이동, Ctrl+오른쪽 드래그 = 회전)'); }
  function cube(f) {
    var P = { front: '3,7 12,7 12,16 3,16', top: '3,7 7,3 16,3 12,7', right: '12,7 16,3 16,12 12,16', back: '7,3 16,3 16,12 7,12', left: '3,7 7,3 7,12 3,16', bottom: '3,16 7,12 16,12 12,16' };
    var hl = f === 'iso' ? ['front', 'top', 'right'] : f === 'obliq' ? ['top', 'right'] : [f], s = '';
    hl.forEach(function (k) { s += '<polygon points="' + P[k] + '" fill="' + (f === 'iso' || f === 'obliq' ? '#22b8e8' : '#1d5fd6') + '"/>'; });
    if (f === 'obliq') s += '<polygon points="' + P.front + '" fill="#8fdcf5"/>';
    s += '<path d="M7 3v9M7 12l-4 4M7 12h9" stroke="#888" stroke-dasharray="1.5 1.2" fill="none"/><path d="M3 7h9v9H3zM3 7l4-4h9l-4 4M16 3v9l-4 4" fill="none" stroke="#000" stroke-linejoin="round"/>';
    return s;
  }
  function mag(k) {
    var s = '<circle cx="8" cy="8" r="5.3" fill="#e9f6ff" stroke="#000" stroke-width="1.3"/><path d="M12 12l5 5" stroke="#000" stroke-width="2.6" stroke-linecap="round"/>';
    if (k === 'in') s += '<path d="M5.5 8h5M8 5.5v5" stroke="#000" stroke-width="1.4"/>';
    if (k === 'out') s += '<path d="M5.5 8h5" stroke="#000" stroke-width="1.4"/>';
    if (k === 'box') s += '<rect x="5.3" y="5.6" width="5.4" height="4.6" fill="none" stroke="#c00" stroke-dasharray="1.4 1"/>';
    if (k === 'fit') s += '<path d="M5.5 6l1.2 1.2M10.5 6L9.3 7.2M5.5 10l1.2-1.2M10.5 10L9.3 8.8" stroke="#1d5fd6" stroke-width="1.4"/>';
    if (k === 'back') s += '<path d="M10.5 9.5a2.7 2.7 0 1 1-1-3.7" fill="none" stroke="#1d5fd6" stroke-width="1.3"/><path d="M9 4.3l1.5 1.8-2.1.6" fill="none" stroke="#1d5fd6" stroke-width="1.2"/>';
    return s;
  }
  function panI(d) { var a = { l: 'M2 9.5l5-4v8z', r: 'M17 9.5l-5-4v8z', u: 'M9.5 1.5l-4 5h8z', d: 'M9.5 17.5l-4-5h8z' }[d]; return '<rect x="6.5" y="6.5" width="6" height="6" fill="#22b8e8" stroke="#000"/><path d="' + a + '" fill="#000"/>'; }
  function rotI(ax, sg) { return '<path d="M15 9.5a5.5 5.5 0 1 1-2-4.3" fill="none" stroke="#000" stroke-width="1.4"' + (sg < 0 ? ' transform="matrix(-1 0 0 1 19 0)"' : '') + '/><path d="' + (sg < 0 ? 'M6 3.2l-.6 3.4 3.2-.9' : 'M13 3.2l.6 3.4-3.2-.9') + '" fill="none" stroke="#000" stroke-width="1.3"/><text x="9.5" y="12.4" font-size="7.5" font-family="Arial" font-weight="700" text-anchor="middle">' + (sg > 0 ? '+' : '−') + ax + '</text>'; }
  var VT = [
    ['sel'],
    ['iso', cube('iso'), 'Isometric View', function () { viewCmd([1, 1, 1]); }], ['obliq', cube('obliq'), 'Oblique View', function () { viewCmd([1, 2, 3]); }],
    ['front', cube('front'), 'Front View', function () { viewCmd([0, 0, 1]); }], ['back', cube('back'), 'Back View', function () { viewCmd([0, 0, -1]); }],
    ['top', cube('top'), 'Top View', function () { viewCmd([0, 1, 0]); }], ['bottom', cube('bottom'), 'Bottom View', function () { viewCmd([0, -1, 0]); }],
    ['left', cube('left'), 'Left View', function () { viewCmd([-1, 0, 0]); }], ['right', cube('right'), 'Right View', function () { viewCmd([1, 0, 0]); }],
    ['fit', mag('fit'), 'Fit View', function () { pushView(); view.zoom = 1; view.panX = view.panY = 0; run('/AUTO,1\n/REPLOT', { quiet: true }); }],
    ['box', mag('box'), 'Box Zoom', function () { view.box = !view.box; $('#vt_box').classList.toggle('on', view.box); if (view.box) flash('Box Zoom: 그래픽 창에서 확대할 영역을 드래그하세요'); }],
    ['back2', mag('back'), 'Back Up', function () { var p = view.stack.pop(); if (!p) { flash('되돌릴 보기가 없습니다.'); return; } view.R = p.R; view.zoom = p.zoom; view.panX = p.panX; view.panY = p.panY; draw(); }],
    ['zin', mag('in'), 'Zoom In', function () { pushView(); var T = view.T; zoomAt(T.W / 2, T.Hc, 1 + 0.15 * view.rate, T.W / 2, T.Hc); draw(); }],
    ['zout', mag('out'), 'Zoom Out', function () { pushView(); var T = view.T; zoomAt(T.W / 2, T.Hc, 1 / (1 + 0.15 * view.rate), T.W / 2, T.Hc); draw(); }],
    ['pl', panI('l'), 'Pan Left', function () { view.panX -= panStep(); draw(); }], ['pr', panI('r'), 'Pan Right', function () { view.panX += panStep(); draw(); }],
    ['pu', panI('u'), 'Pan Up', function () { view.panY -= panStep(); draw(); }], ['pd', panI('d'), 'Pan Down', function () { view.panY += panStep(); draw(); }],
    ['rxp', rotI('X', 1), 'Rotate +X', function () { rot(0, 1); }], ['rxm', rotI('X', -1), 'Rotate −X', function () { rot(0, -1); }],
    ['ryp', rotI('Y', 1), 'Rotate +Y', function () { rot(1, 1); }], ['rym', rotI('Y', -1), 'Rotate −Y', function () { rot(1, -1); }],
    ['rzp', rotI('Z', 1), 'Rotate +Z', function () { rot(2, 1); }], ['rzm', rotI('Z', -1), 'Rotate −Z', function () { rot(2, -1); }],
    ['rate'],
    ['Dyn', '<rect x="2.5" y="4.5" width="9" height="9" fill="#22b8e8" stroke="#000"/><path d="M12 2.5h4.5V7M16.5 2.5l-4 4M7 17h9.5v-5" fill="none" stroke="#000" stroke-width="1.2"/>', 'Dynamic Mode', function () { setDyn(!view.dyn); }]
  ];
  var RATE = [5, 10, 15, 22.5, 30, 45, 60, 75, 90];
  function panStep() { return (view.T ? Math.min(view.T.W, view.T.H) : 500) * 0.025 * view.rate; }
  function rot(ax, sg) { pushView(); rotS(ax, sg * RATE[view.rate - 1]); draw(); }
  function viewCmd(d) { pushView(); run('/VIEW,1,' + d.join(',') + '\n/REPLOT', { quiet: true }); setDir(d); }
  var vt = $('#mwVtool');
  VT.forEach(function (v) {
    if (v[0] === 'sel' || v[0] === 'rate') {
      var s = document.createElement('select'); s.className = 'mw-vsel'; s.title = v[0] === 'sel' ? 'Window 1' : 'Rate (회전·이동 단위)'; s.setAttribute('aria-label', s.title);
      (v[0] === 'sel' ? ['1', 'All'] : ['1', '2', '3', '4', '5', '6', '7', '8', '9']).forEach(function (x) { var o = document.createElement('option'); o.textContent = x; s.appendChild(o); });
      if (v[0] === 'rate') { s.value = '3'; s.onchange = function () { view.rate = +s.value; }; }
      vt.appendChild(s); return;
    }
    var b = document.createElement('button'); b.type = 'button'; b.id = 'vt' + (v[0] === 'Dyn' ? 'Dyn' : '_' + v[0]); b.title = v[2]; b.setAttribute('aria-label', v[2]);
    b.innerHTML = '<svg viewBox="0 0 19 19" width="19" height="19" aria-hidden="true">' + v[1] + '</svg>'; b.onclick = v[3]; vt.appendChild(b);
  });

  // 마우스: 휠 = 확대, 드래그 = 이동, Ctrl+오른쪽 드래그 또는 Dynamic Mode = 회전, Box Zoom
  var drag = null, boxEl = null;
  svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  svg.addEventListener('pointerdown', function (e) {
    var r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var mode = view.box ? 'box' : (view.dyn && e.button === 0) || (e.ctrlKey && e.button === 2) || (e.button === 2 && view.dyn) ? 'rot' : (e.ctrlKey && e.button === 1) ? 'zoom' : 'pan';
    pushView(); drag = { x: e.clientX, y: e.clientY, x0: x, y0: y, mode: mode }; svg.setPointerCapture(e.pointerId);
    if (mode === 'box') { boxEl = document.createElementNS(NS, 'rect'); boxEl.setAttribute('fill', 'none'); boxEl.setAttribute('stroke', '#fff'); boxEl.setAttribute('stroke-dasharray', '4 3'); svg.appendChild(boxEl); }
  });
  svg.addEventListener('pointermove', function (e) {
    if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (drag.mode === 'pan') { view.panX += dx; view.panY += dy; draw(); }
    else if (drag.mode === 'rot') { rotS(1, dx * 0.5); rotS(0, dy * 0.5); draw(); }
    else if (drag.mode === 'zoom') { var T = view.T; zoomAt(T.W / 2, T.Hc, Math.pow(1.01, -dy), T.W / 2, T.Hc); draw(); }
    else if (boxEl) { var r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; boxEl.setAttribute('x', Math.min(x, drag.x0)); boxEl.setAttribute('y', Math.min(y, drag.y0)); boxEl.setAttribute('width', Math.abs(x - drag.x0)); boxEl.setAttribute('height', Math.abs(y - drag.y0)); }
  });
  svg.addEventListener('pointerup', function (e) {
    if (drag && drag.mode === 'box') {
      var r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, bw = Math.abs(x - drag.x0), bh = Math.abs(y - drag.y0), T = view.T;
      if (bw > 6 && bh > 6 && T) zoomAt((x + drag.x0) / 2, (y + drag.y0) / 2, Math.min((T.W - 2 * T.F) / bw, (T.H - 2 * T.F) / bh), T.W / 2, T.Hc);
      view.box = false; $('#vt_box').classList.remove('on'); boxEl = null; draw();
    }
    drag = null;
  });
  svg.addEventListener('wheel', function (e) { e.preventDefault(); var r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; zoomAt(x, y, e.deltaY < 0 ? 1.12 : 1 / 1.12, x, y); draw(); }, { passive: false });
  window.addEventListener('resize', function () { draw(); });

  // ================= Graphics =================
  var NS = 'http://www.w3.org/2000/svg', MONO = "'Courier New',Courier,monospace";
  function el(tag, at, parent) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); (parent || svg).appendChild(e); return e; }
  function txt(x, y, s, at, parent) { at = at || {}; at.x = x; at.y = y; var t = el('text', at, parent); t.textContent = s; return t; }
  var SPEC = ['#0000ff', '#0080ff', '#00ffff', '#00ff80', '#00ff00', '#80ff00', '#ffff00', '#ff8000', '#ff0000'];
  var MATCOL = ['#00ffff', '#ff00ff', '#ffff00', '#00ff00', '#ff8000', '#8080ff', '#ff4040', '#c0c0c0'];
  var ACOL = ['#ff00ff', '#00ffff', '#ffff00', '#00ff00', '#ff8080', '#8080ff', '#ffa500', '#c0c0c0'];
  function band(v, lo, hi) { if (hi - lo < 1e-30 * Math.max(1, Math.abs(hi))) return 4; return Math.max(0, Math.min(8, Math.floor((v - lo) / (hi - lo) * 9))); }
  function gfmt(v) { return M3.g(v); }
  function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrm(a) { var n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
  function centroid(r) { var x = 0, y = 0; r.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / r.length, y / r.length]; }
  function beamAxes(a, b, k, kind) { var x = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), y, z; if (k && kind === 'beam') { var v = [k[0] - a[0], k[1] - a[1], k[2] - a[2]], d = v[0] * x[0] + v[1] * x[1] + v[2] * x[2]; z = nrm([v[0] - d * x[0], v[1] - d * x[1], v[2] - d * x[2]]); y = cr(z, x); } else { if (Math.abs(x[2]) > 1 - 1e-9) y = [0, 1, 0]; else y = nrm(cr([0, 0, 1], x)); z = cr(x, y); } return { x: x, y: y, z: z }; }

  function draw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = svg.clientWidth || 700, H = svg.clientHeight || 480, sm = W < 560, F = sm ? 6 : 16, fs = sm ? 11 : 14;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000' });
    el('rect', { x: F, y: F, width: W - 2 * F, height: H - 2 * F, fill: 'none', stroke: '#fff', 'stroke-width': 1 });
    var clip = el('clipPath', { id: 'mwClip' }, el('defs', {})); el('rect', { x: F, y: F, width: W - 2 * F, height: H - 2 * F }, clip);
    // 오른쪽 위: 로고·날짜 (ANSYS 그래픽 창 형식)
    var now = new Date(), MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], RX = W - F - 8;
    var ls = sm ? 0.7 : 1;
    txt(RX, F + 30 * ls, 'MAPDL', { fill: '#fff', 'font-size': 29 * ls, 'font-weight': 900, 'font-family': 'Arial Black,Arial,sans-serif', 'text-anchor': 'end', 'font-style': 'italic', 'letter-spacing': -0.5 });
    el('line', { x1: RX - 112 * ls, y1: F + 36 * ls, x2: RX, y2: F + 36 * ls, stroke: '#fff', 'stroke-width': 1.5 });
    txt(RX, F + 52 * ls, '연습기 R1', { fill: '#fff', 'font-size': 15 * ls, 'font-weight': 700, 'font-family': 'Arial,sans-serif', 'text-anchor': 'end' });
    el('line', { x1: RX - 112 * ls, y1: F + 58 * ls, x2: RX, y2: F + 58 * ls, stroke: '#fff', 'stroke-width': 1.5 });
    txt(RX - 8 * ls, F + 76 * ls, 'STUDENT', { fill: '#fff', 'font-size': 16 * ls, 'font-weight': 700, 'font-family': 'Arial,sans-serif', 'text-anchor': 'end' });
    var p2 = function (v) { return (v < 10 ? '0' : '') + v; };
    txt(RX, F + 106 * ls, MON[now.getMonth()] + ' ' + p2(now.getDate()) + ' ' + now.getFullYear(), { fill: '#fff', 'font-size': 17 * ls, 'font-family': MONO, 'text-anchor': 'end' });
    txt(RX - 12 * ls, F + 126 * ls, p2(now.getHours()) + ':' + p2(now.getMinutes()) + ':' + p2(now.getSeconds()), { fill: '#fff', 'font-size': 17 * ls, 'font-family': MONO, 'text-anchor': 'end' });
    txt(F + 10, F + 20, '1', { fill: '#00ffff', 'font-size': fs + 4, 'font-family': MONO });

    var s; try { s = eng.snapshot(); } catch (e) { s = null; }
    var g0 = el('g', { 'clip-path': 'url(#mwClip)' });
    if (!s) return;
    var p = s.plot || { kind: 'auto' }, kind = p.kind;
    var hasE = Object.keys(s.elems).length, hasN = Object.keys(s.nodes).length, hasA = Object.keys(s.areas).length, hasL = Object.keys(s.lines).length, hasK = Object.keys(s.kps).length;
    if (kind === 'auto') kind = hasE ? 'elem' : hasN ? 'node' : hasA ? 'area' : hasL ? 'line' : hasK ? 'kp' : 'none';
    var res = /DISP|NSOL|ESOL|ETAB/.test(kind) && s.solved;
    if (!res && /DISP|NSOL|ESOL|ETAB/.test(kind)) kind = 'elem';
    var used = {}, e, k; for (e in s.elems) s.elems[e].n.forEach(function (n) { used[n] = 1; });
    var showNode = function (n) { return !hasE || used[n] || !s.kOnly[n]; };
    var P3 = [];
    if (/kp|line|area|all/.test(kind)) { for (k in s.kps) P3.push(s.kps[k].x); for (k in s.lines) s.lines[k].pts.forEach(function (q) { P3.push(q); }); for (k in s.areas) s.areas[k].regions.forEach(function (r) { r.forEach(function (q) { P3.push([q[0], q[1], 0]); }); }); }
    if (kind === 'node' || kind === 'elem' || res || kind === 'all') for (k in s.nodes) if (showNode(k)) P3.push(s.nodes[k].x);
    var label = { kp: 'KEYPOINTS', line: 'LINES', area: 'AREAS', node: 'NODES', elem: 'ELEMENTS', all: '', DISP: 'DISPLACEMENT', NSOL: 'NODAL SOLUTION', ESOL: 'ELEMENT SOLUTION', ETAB: 'ELEMENT SOLUTION', none: '' }[kind] || '';
    var tl = [label];
    if (s.pnum.KP && /kp|line|area/.test(kind)) tl.push('KP NUM'); if (s.pnum.LINE && /line|area/.test(kind)) tl.push('LINE NUM'); if (s.pnum.AREA && kind === 'area') tl.push('AREA NUM');
    if (s.pnum.NODE && /node|elem/.test(kind)) tl.push('NODE NUM'); if (s.pnum.ELEM && kind === 'elem') tl.push('ELEM NUM');

    var R = view.R, Pj = function (q) { return [R[0][0] * q[0] + R[0][1] * q[1] + R[0][2] * q[2], R[1][0] * q[0] + R[1][1] * q[1] + R[1][2] * q[2]]; };
    var lo = [1e99, 1e99, 1e99], hi = [-1e99, -1e99, -1e99];
    P3.forEach(function (q) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); } });
    var size = P3.length ? Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1 : 1, umax = 0;
    if (res) for (k in s.nodes) if (s.nodes[k].u && showNode(k)) umax = Math.max(umax, Math.hypot(s.nodes[k].u[0], s.nodes[k].u[1], s.nodes[k].u[2]));
    var dsc = res && umax > 0 ? 0.08 * size / umax : 0;
    var defX = function (n) { var nd = s.nodes[n]; if (!dsc || !nd.u) return nd.x; return [nd.x[0] + nd.u[0] * dsc, nd.x[1] + nd.u[1] * dsc, nd.x[2] + nd.u[2] * dsc]; };
    var all2 = P3.map(Pj); if (dsc) for (k in s.nodes) if (showNode(k)) all2.push(Pj(defX(k)));
    var x0 = 1e99, x1 = -1e99, y0 = 1e99, y1 = -1e99; all2.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    if (!all2.length) { x0 = x1 = y0 = y1 = 0; }
    var top = F + (sm ? 70 : 90), bot = F + (res ? (sm ? 60 : 70) : 30), padx = F + (sm ? 20 : 60);
    var base = Math.min((W - 2 * padx) / ((x1 - x0) || 1e-30), (H - top - bot) / ((y1 - y0) || 1e-30));
    if (!isFinite(base) || base <= 0 || (x1 - x0 < 1e-12 && y1 - y0 < 1e-12)) base = all2.length ? 1 : 1;
    if (x1 - x0 < 1e-12 && y1 - y0 >= 1e-12) base = (H - top - bot) / (y1 - y0); if (y1 - y0 < 1e-12 && x1 - x0 >= 1e-12) base = (W - 2 * padx) / (x1 - x0);
    var sc = base * view.zoom, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, Hc = top + (H - top - bot) / 2;
    var ox = W / 2 - cx * sc + view.panX, oy = Hc + cy * sc + view.panY;
    view.T = { ox: ox, oy: oy, sc: sc, base: base, cx: cx, cy: cy, W: W, H: H, Hc: Hc, F: F };
    var S2 = function (q) { var r = Pj(q); return [ox + r[0] * sc, oy - r[1] * sc]; };

    if (view.wp && s.wp) { var o = s.wp.o, RW = s.wp.R, L = size * 0.25, a1 = S2(o), ax = S2([o[0] + RW[0][0] * L, o[1] + RW[1][0] * L, o[2] + RW[2][0] * L]), ay = S2([o[0] + RW[0][1] * L, o[1] + RW[1][1] * L, o[2] + RW[2][1] * L]); el('line', { x1: a1[0], y1: a1[1], x2: ax[0], y2: ax[1], stroke: '#888', 'stroke-dasharray': '4 3' }, g0); el('line', { x1: a1[0], y1: a1[1], x2: ay[0], y2: ay[1], stroke: '#888', 'stroke-dasharray': '4 3' }, g0); txt(ax[0] + 3, ax[1], 'WX', { fill: '#aaa', 'font-size': 11, 'font-family': MONO }, g0); txt(ay[0] + 3, ay[1], 'WY', { fill: '#aaa', 'font-size': 11, 'font-family': MONO }, g0); }

    // 기하
    if (kind === 'area' || kind === 'all') { Object.keys(s.areas).forEach(function (a) { var A = s.areas[a], d = A.regions.map(function (r) { return 'M' + r.map(function (q) { var z = S2([q[0], q[1], 0]); return z[0].toFixed(1) + ',' + z[1].toFixed(1); }).join('L') + 'Z'; }).join(''); el('path', { d: d, fill: ACOL[(+a - 1) % ACOL.length], stroke: '#000', 'stroke-width': 0.8, 'fill-rule': 'evenodd' }, g0); if (s.pnum.AREA) { var cxy = centroid(A.regions[0]), z = S2([cxy[0], cxy[1], 0]); txt(z[0], z[1], 'A' + a, { fill: '#fff', 'font-size': 13, 'font-family': MONO, 'text-anchor': 'middle' }, g0); } }); }
    if (/kp|line|area|all/.test(kind)) {
      if (kind !== 'kp') for (k in s.lines) { var Ln = s.lines[k]; el('polyline', { points: Ln.pts.map(function (q) { return S2(q).map(function (v) { return v.toFixed(1); }).join(','); }).join(' '), fill: 'none', stroke: kind === 'area' ? '#000' : '#00ffff', 'stroke-width': kind === 'area' ? 1 : 1.5 }, g0); if (s.pnum.LINE) { var mq = S2(Ln.pts[Math.floor(Ln.pts.length / 2)]); txt(mq[0] + 4, mq[1] - 4, 'L' + k, { fill: '#ffff00', 'font-size': 12, 'font-family': MONO }, g0); } }
      for (k in s.kps) { var qk = S2(s.kps[k].x); el('rect', { x: qk[0] - 2, y: qk[1] - 2, width: 4, height: 4, fill: '#fff' }, g0); if (s.pnum.KP) txt(qk[0] + 5, qk[1] - 5, k, { fill: '#fff', 'font-size': 12, 'font-family': MONO }, g0); }
    }

    // 결과 값
    var field = null, flo = 0, fhi = 0, flab = '', fmn = null, fmx = null, efield = null;
    if (res && (kind === 'DISP' || kind === 'NSOL')) {
      var it = p.item || 'U', cmp = p.comp || 'SUM'; if (kind === 'DISP') { it = 'U'; cmp = 'SUM'; }
      field = {};
      for (k in s.nodes) { if (!showNode(k)) continue; var u = s.nodes[k].u; if (it === 'S') { if (!s.nstress || !s.nstress[k]) continue; field[k] = s.nstress[k][{ X: 0, Y: 1, Z: 2, XY: 3, '1': 4, '2': 5, '3': 6, INT: 7, EQV: 8 }[cmp]] || 0; } else { if (!u) continue; var b = it === 'ROT' ? 3 : 0; field[k] = cmp === 'SUM' ? Math.hypot(u[b], u[b + 1], u[b + 2]) : u[b + 'XYZ'.indexOf(cmp)] || 0; } }
      flab = it === 'S' ? 'S' + cmp + ' (AVG)' : (it === 'ROT' ? 'ROT' : 'U') + cmp + ' (AVG)';
      Object.keys(field).forEach(function (q) { if (fmn === null || field[q] < field[fmn]) fmn = q; if (fmx === null || field[q] > field[fmx]) fmx = q; });
      if (fmn !== null) { flo = field[fmn]; fhi = field[fmx]; }
      if (kind === 'DISP') field = null;
    }
    if (res && kind === 'ETAB' && s.etab[p.lab]) { efield = s.etab[p.lab].vals; flab = p.lab; var ev = Object.keys(efield).map(function (q) { return efield[q]; }); flo = Math.min.apply(null, ev); fhi = Math.max.apply(null, ev); }
    if (res && kind === 'ESOL' && s.nstress) { efield = {}; for (e in s.elems) { var ns = s.elems[e].n, acc = 0, c = 0; ns.forEach(function (n) { if (s.nstress[n]) { acc += s.nstress[n][8]; c++; } }); if (c) efield[e] = acc / c; } flab = 'SEQV (NOAVG)'; var ev2 = Object.keys(efield).map(function (q) { return efield[q]; }); if (ev2.length) { flo = Math.min.apply(null, ev2); fhi = Math.max.apply(null, ev2); } }

    // 요소
    if (kind === 'elem' || res || kind === 'all') {
      var XY = function (n) { return S2(defX(n)); }, XY0 = function (n) { return S2(s.nodes[n].x); };
      var faces = [], esh = eng.eshape;
      if (res && (kind === 'DISP' ? p.und !== 0 : p.und)) for (e in s.elems) drawElem(e, XY0, true);
      for (e in s.elems) drawElem(e, res ? XY : XY0, false);
      faces.sort(function (a, b) { return a.d - b.d; }).forEach(function (f) { el('polygon', { points: f.pts.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '), fill: f.c, stroke: f.st, 'stroke-width': 0.5, 'stroke-linejoin': 'round' }, g0); });
    }
    function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')'; }
    function eshapeElem(e, E, col) { // /ESHAPE,1: 보를 단면 모양으로 (SECOFFSET 위치 반영)
      var me = eng.elems[e], sec = me && eng.secs[me.sec]; if (!sec || sec.type === 'LINK') return false;
      var P; try { P = sec.props || M3.secProps(sec); } catch (x) { return false; }
      var off = sec.off || 'CENT', oy = off === 'USER' ? (sec.offyz[0] || 0) : off === 'ORIGIN' ? 0 : P.cy || 0, oz = off === 'USER' ? (sec.offyz[1] || 0) : off === 'ORIGIN' ? 0 : P.cz || 0;
      var loops = [];
      if (P.circ) { [P.circ[1], P.circ[0]].forEach(function (r, i) { if (!r) return; var L = []; for (var q = 0; q < 16; q++) L.push([r * Math.cos(q * Math.PI / 8) - oy, r * Math.sin(q * Math.PI / 8) - oz]); loops.push({ pts: i ? L.reverse() : L, hole: !!i }); }); }
      else if (P.rects) P.rects.forEach(function (r) { loops.push({ pts: [[r.y0 - oy, r.z0 - oz], [r.y1 - oy, r.z0 - oz], [r.y1 - oy, r.z1 - oz], [r.y0 - oy, r.z1 - oz]] }); });
      else return false;
      var A0 = s.nodes[E.n[0]].x, A1 = s.nodes[E.n[1]].x, ax = beamAxes(A0, A1, E.k, E.kind), B0 = res ? defX(E.n[0]) : A0, B1 = res ? defX(E.n[1]) : A1, vz = R[2];
      var at = function (B, c) { return [B[0] + ax.y[0] * c[0] + ax.z[0] * c[1], B[1] + ax.y[1] * c[0] + ax.z[1] * c[1], B[2] + ax.y[2] * c[0] + ax.z[2] * c[1]]; };
      var add = function (P3s, nrm3) { var d = 0, sp = P3s.map(function (q) { d += vz[0] * q[0] + vz[1] * q[1] + vz[2] * q[2]; return S2(q); }), nn = Math.hypot(nrm3[0], nrm3[1], nrm3[2]) || 1, k = 0.35 + 0.65 * Math.abs((vz[0] * nrm3[0] + vz[1] * nrm3[1] + vz[2] * nrm3[2]) / nn); faces.push({ pts: sp, d: d / P3s.length, c: shade(col, k), st: shade(col, 0.3) }); };
      loops.forEach(function (lp) {
        var L = lp.pts;
        for (var i = 0; i < L.length; i++) { var c1 = L[i], c2 = L[(i + 1) % L.length], t = [ax.y[0] * (c2[0] - c1[0]) + ax.z[0] * (c2[1] - c1[1]), ax.y[1] * (c2[0] - c1[0]) + ax.z[1] * (c2[1] - c1[1]), ax.y[2] * (c2[0] - c1[0]) + ax.z[2] * (c2[1] - c1[1])]; add([at(B0, c1), at(B1, c1), at(B1, c2), at(B0, c2)], cr(ax.x, t)); }
        if (!lp.hole) { add(L.map(function (c) { return at(B0, c); }), ax.x); add(L.map(function (c) { return at(B1, c); }), ax.x); }
      });
      return true;
    }
    function drawElem(e, XYf, ghost) {
      var E = s.elems[e], pts = E.n.map(XYf), me = eng.elems[e], col = MATCOL[((me && me.mat) || 1) - 1 & 7] || '#00ffff';
      if (!ghost && efield && efield[e] !== undefined) col = SPEC[band(efield[e], flo, fhi)];
      if (!ghost && esh && E.kind === 'beam') { var fc = col; if (field) { var fa = field[E.n[0]], fb = field[E.n[1]]; if (fa !== undefined && fb !== undefined) fc = SPEC[band((fa + fb) / 2, flo, fhi)]; } if (eshapeElem(e, E, fc)) return; }
      if (E.kind === 'plane') {
        var poly = (E.n[2] === E.n[3] ? pts.slice(0, 3) : pts.slice(0, 4));
        if (!ghost && field) { var av = 0, c = 0; E.n.forEach(function (n) { if (field[n] !== undefined) { av += field[n]; c++; } }); col = SPEC[band(c ? av / c : 0, flo, fhi)]; }
        el('polygon', { points: poly.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '), fill: ghost ? 'none' : col, stroke: ghost ? '#fff' : '#000', 'stroke-width': ghost ? 0.6 : 0.7, 'stroke-dasharray': ghost ? '3 3' : '' }, g0);
      } else {
        var wdt = E.kind === 'beam' || E.kind === 'beam3' ? 2.6 : 2;
        if (!ghost && field) { var f1 = field[E.n[0]], f2 = field[E.n[1]]; if (f1 !== undefined && f2 !== undefined) { for (var i = 0; i < 6; i++) { var t0 = i / 6, t1 = (i + 1) / 6, v = f1 + (f2 - f1) * (t0 + t1) / 2; el('line', { x1: pts[0][0] + (pts[1][0] - pts[0][0]) * t0, y1: pts[0][1] + (pts[1][1] - pts[0][1]) * t0, x2: pts[0][0] + (pts[1][0] - pts[0][0]) * t1, y2: pts[0][1] + (pts[1][1] - pts[0][1]) * t1, stroke: SPEC[band(v, flo, fhi)], 'stroke-width': wdt + 1 }, g0); } return; } }
        el('line', { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1], stroke: ghost ? '#fff' : (E.kind === 'spring' ? '#ffff00' : col), 'stroke-width': ghost ? 0.8 : wdt, 'stroke-dasharray': ghost ? '4 3' : (E.kind === 'spring' ? '3 2' : '') }, g0);
      }
      if (!ghost && s.pnum.ELEM && (kind === 'elem' || res)) { var cxx = 0, cyy = 0, nn = E.kind === 'plane' && E.n[2] === E.n[3] ? 3 : E.n.length; pts.slice(0, nn).forEach(function (q) { cxx += q[0]; cyy += q[1]; }); txt(cxx / nn, cyy / nn - 3, e, { fill: '#fff', 'font-size': 11.5, 'font-family': MONO, 'text-anchor': 'middle' }, g0); }
    }

    // 노드
    if (kind === 'node' || (kind === 'elem' && s.pnum.NODE) || (res && s.pnum.NODE)) for (k in s.nodes) { if (!showNode(k)) continue; var qn = S2(res ? defX(k) : s.nodes[k].x); el('rect', { x: qn[0] - 1.5, y: qn[1] - 1.5, width: 3, height: 3, fill: '#fff' }, g0); if (s.pnum.NODE) txt(qn[0] + 4, qn[1] - 4, k, { fill: '#fff', 'font-size': 11.5, 'font-family': MONO }, g0); }

    // 구속(청록 삼각형)·하중(빨간 화살표)
    if (!view.noBC && /node|elem|DISP|NSOL|kp|line/.test(kind)) {
      var mk = el('marker', { id: 'mwArr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, el('defs', {}, g0)); el('path', { d: 'M0,0L10,5L0,10z', fill: '#ff0000' }, mk);
      var tri = function (x, i, col) { var d = [0, 0, 0]; d[i % 3] = 1; var a = S2(x), b = S2([x[0] - d[0] * size * 0.04, x[1] - d[1] * size * 0.04, x[2] - d[2] * size * 0.04]), vx = b[0] - a[0], vy = b[1] - a[1], L = Math.hypot(vx, vy); if (L < 2) { el('circle', { cx: a[0], cy: a[1], r: 4, fill: 'none', stroke: col }, g0); return; } vx = vx / L * 11; vy = vy / L * 11; var nx = -vy * 0.5, ny = vx * 0.5; el('path', { d: 'M' + a[0] + ',' + a[1] + 'L' + (a[0] + vx + nx) + ',' + (a[1] + vy + ny) + 'L' + (a[0] + vx - nx) + ',' + (a[1] + vy - ny) + 'Z', fill: 'none', stroke: col, 'stroke-width': 1.3 }, g0); };
      var cons = function (dd, x) { var keys = Object.keys(dd).map(Number), nz = keys.some(function (i) { return dd[i]; }), col = nz ? '#ff8000' : '#00ffff'; keys.forEach(function (i) { if (i < 3) tri(x, i, col); }); if (keys.some(function (i) { return i >= 3; })) { var q = S2(x); el('path', { d: 'M' + (q[0] - 5) + ',' + (q[1] + 9) + 'h10', stroke: col, 'stroke-width': 1.3 }, g0); } };
      for (k in s.D) if (s.nodes[k]) cons(s.D[k], s.nodes[k].x);
      for (k in s.DK) if (s.kps[k]) cons(s.DK[k], s.kps[k].x);
      var arrow = function (x, dir, lab) { var L = size * 0.12, a = S2(x), b = S2([x[0] - dir[0] * L, x[1] - dir[1] * L, x[2] - dir[2] * L]); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 8) b = [a[0] - 20, a[1] - 20]; el('line', { x1: b[0], y1: b[1], x2: a[0], y2: a[1], stroke: '#ff0000', 'stroke-width': 1.6, 'marker-end': 'url(#mwArr)' }, g0); txt(b[0] + 3, b[1] - 3, lab, { fill: '#ff6060', 'font-size': 11.5, 'font-family': MONO }, g0); };
      var forces = function (Fm, getX, getT) { for (var n in Fm) { var x = getX(n); if (!x) continue; for (var i in Fm[n]) { var v = Fm[n][i]; if (!v) continue; i = +i; if (i < 3) { var d = [0, 0, 0]; d[i] = v > 0 ? 1 : -1; var T = getT(n); if (T) d = [T[0][i] * d[i], T[1][i] * d[i], T[2][i] * d[i]]; arrow(x, d, gfmt(v)); } else { var q = S2(x); el('path', { d: 'M' + (q[0] + 10) + ',' + q[1] + 'A10,10 0 1,1 ' + q[0] + ',' + (q[1] - 10), fill: 'none', stroke: '#ff0000', 'stroke-width': 1.4, 'marker-end': 'url(#mwArr)' }, g0); txt(q[0] + 11, q[1] - 10, ['MX', 'MY', 'MZ'][i - 3] + '=' + gfmt(v), { fill: '#ff6060', 'font-size': 11.5, 'font-family': MONO }, g0); } } } };
      forces(s.F, function (n) { return s.nodes[n] && s.nodes[n].x; }, function (n) { return s.nodes[n].T; });
      forces(s.FK, function (n) { return s.kps[n] && s.kps[n].x; }, function () { return null; });
      var qmax = 0, lk; for (k in s.SFB) for (lk in s.SFB[k]) qmax = Math.max(qmax, Math.abs(s.SFB[k][lk].vi), Math.abs(s.SFB[k][lk].vj));
      var sfk = Object.keys(s.SFB), sstep = Math.max(1, Math.ceil(sfk.length / 40));
      sfk.forEach(function (k, si) {
        if (si % sstep) return; var E2 = s.elems[k]; if (!E2) return; var A0 = s.nodes[E2.n[0]].x, A1 = s.nodes[E2.n[1]].x, axs = beamAxes(A0, A1, E2.k, E2.kind);
        for (var lk in s.SFB[k]) { var L2 = s.SFB[k][lk], dir = E2.kind === 'beam' ? (lk === '1' ? axs.z : lk === '2' ? axs.y : null) : (lk === '1' ? axs.y : null); if (!dir) continue;
          var v = (L2.vi + L2.vj) / 2; if (!v) continue; var len = size * 0.08 * Math.abs(v) / (qmax || 1), q = [(A0[0] + A1[0]) / 2, (A0[1] + A1[1]) / 2, (A0[2] + A1[2]) / 2], sg = v > 0 ? 1 : -1, a = S2(q), bb = S2([q[0] + dir[0] * sg * len, q[1] + dir[1] * sg * len, q[2] + dir[2] * sg * len]);
          el('line', { x1: bb[0], y1: bb[1], x2: a[0], y2: a[1], stroke: '#ff0000', 'stroke-width': 1.1, 'marker-end': 'url(#mwArr)' }, g0); }
      });
    }
    if (field && fmn !== null) [[fmn, 'MN'], [fmx, 'MX']].forEach(function (m) { var q = S2(defX(m[0])); txt(q[0] + 5, q[1] + (m[1] === 'MN' ? 14 : -6), m[1], { fill: '#fff', 'font-size': 13, 'font-family': MONO }, g0); });

    // 삼각좌표계 (/TRIAD,ORIG: 전체 원점에 표시)
    var tp = S2([0, 0, 0]); if (!all2.length) tp = [W / 2, Hc + 20];
    if (tp[0] < F + 30 || tp[0] > W - F - 30 || tp[1] < F + 30 || tp[1] > H - F - 30) tp = [F + 45, H - F - (res ? 80 : 45)];
    [[1, 0, 0, 'X', '#ffffff'], [0, 1, 0, 'Y', '#a6ff00'], [0, 0, 1, 'Z', '#2f8bff']].forEach(function (a) { var q = Pj([a[0], a[1], a[2]]), Lt = sm ? 26 : 36, e2 = [tp[0] + q[0] * Lt, tp[1] - q[1] * Lt]; el('line', { x1: tp[0], y1: tp[1], x2: e2[0], y2: e2[1], stroke: a[4], 'stroke-width': 1.4 }); if (Math.hypot(q[0], q[1]) < 0.15) { txt(tp[0] + 3, tp[1] - 2, a[3], { fill: a[4], 'font-size': fs + 2, 'font-family': MONO }); return; } txt(e2[0] + (q[0] >= -0.1 ? 4 : -14), e2[1] + (q[1] > 0.5 ? -4 : 6), a[3], { fill: a[4], 'font-size': fs + 2, 'font-family': MONO }); });

    // 제목 블록·범례
    if (res) {
      if (kind === 'DISP' || kind === 'NSOL') tl.push('STEP=1', 'SUB =1', 'TIME=1');
      if (field) tl.push(flab, 'RSYS=0');
      tl.push('DMX =' + gfmt(umax));
      if (field || efield) { tl.push('SMN =' + gfmt(flo), 'SMX =' + gfmt(fhi)); legend(flo, fhi, W, H, F, sm); }
    }
    tl.filter(Boolean).forEach(function (t, i) { txt(F + 30, F + 44 + i * (fs + 4), t, { fill: '#fff', 'font-size': fs + 2, 'font-family': MONO }); });
    if (s.title) txt(W / 2, H - F - 8, s.title, { fill: '#fff', 'font-size': fs, 'font-family': MONO, 'text-anchor': 'middle' });
  }
  function legend(lo, hi, W, H, F, sm) { var w = Math.min(84, (W - 2 * F - 40) / 9), x = (W - w * 9) / 2, y = H - F - (sm ? 46 : 52); for (var i = 0; i < 9; i++) { el('rect', { x: x + i * w, y: y, width: w, height: 13, fill: SPEC[i] }); if (!sm || i % 2 === 0) txt(x + i * w, y + 28 + (i % 2) * (sm ? 0 : 0), gfmt(lo + (hi - lo) * i / 9), { fill: '#fff', 'font-size': sm ? 9 : 11, 'font-family': MONO, 'text-anchor': 'middle' }); } txt(x + 9 * w, y + 28, gfmt(hi), { fill: '#fff', 'font-size': sm ? 9 : 11, 'font-family': MONO, 'text-anchor': 'middle' }); }


  // ================= 메모 (오른쪽) =================
  var MKEY = 'mapdl-trainer-memo', memo = { cur: 0, pages: [{ name: '메모 1', text: '' }] }, mmT = $('#mmText'), mmP = $('#mmPage'), mmTimer;
  try { var mm = JSON.parse(localStorage.getItem(MKEY)); if (mm && mm.pages && mm.pages.length) memo = mm; } catch (e) { }
  function memoSave() { memo.pages[memo.cur].text = mmT.value; try { localStorage.setItem(MKEY, JSON.stringify(memo)); $('#mmStat').textContent = '저장됨 ' + new Date().toTimeString().slice(0, 5); } catch (e) { $('#mmStat').textContent = '이 브라우저에서는 저장 안 됨'; } }
  function memoList() { mmP.innerHTML = ''; memo.pages.forEach(function (pg, i) { var o = document.createElement('option'); o.value = i; o.textContent = pg.name; mmP.appendChild(o); }); mmP.value = memo.cur; mmT.value = memo.pages[memo.cur].text; memoPos(); }
  function memoPos() { var b = mmT.value.slice(0, mmT.selectionStart).split('\n'); $('#mmPos').textContent = '줄 ' + b.length + ', 열 ' + (b[b.length - 1].length + 1); }
  function memoSel() { var a = mmT.selectionStart, b = mmT.selectionEnd, v = mmT.value; if (a === b) { a = v.lastIndexOf('\n', a - 1) + 1; b = v.indexOf('\n', b); if (b < 0) b = v.length; } return v.slice(a, b); }
  mmT.addEventListener('input', function () { $('#mmStat').textContent = '입력 중…'; clearTimeout(mmTimer); mmTimer = setTimeout(memoSave, 400); memoPos(); });
  mmT.addEventListener('keyup', memoPos); mmT.addEventListener('click', memoPos);
  mmT.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#mmRun').click(); } if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });
  mmP.onchange = function () { memoSave(); memo.cur = +mmP.value; memoList(); };
  $('#mmNew').onclick = function () { memoSave(); memo.pages.push({ name: '메모 ' + (memo.pages.length + 1), text: '' }); memo.cur = memo.pages.length - 1; memoList(); memoSave(); mmT.focus(); };
  $('#mmDel').onclick = function () { msgbox('메모 삭제', '"' + memo.pages[memo.cur].name + '" 을(를) 지울까요?', 'q', ['OK', 'Cancel'], function (i) { if (i) return; memo.pages.splice(memo.cur, 1); if (!memo.pages.length) memo.pages.push({ name: '메모 1', text: '' }); memo.cur = Math.max(0, memo.cur - 1); memoList(); memoSave(); }); };
  $('#mmRun').onclick = function () { var t = memoSel().trim(); if (!t) { flash('실행할 줄이 없습니다.'); return; } if (t.indexOf('\n') < 0) cmd1(t); else runMany(t); };
  $('#mmAll').onclick = function () { if (!mmT.value.trim()) { flash('메모가 비어 있습니다.'); return; } runMany(mmT.value); };
  $('#mmHist').onclick = function () { if (!eng.hist.length) { flash('아직 입력한 명령이 없습니다.'); return; } mmT.focus(); document.execCommand('insertText', false, eng.hist.join('\n') + '\n'); memoSave(); };
  $('#mmSave').onclick = function () { memoSave(); download(memo.pages[memo.cur].name.replace(/\s+/g, '_') + '.txt', mmT.value); };
  $('#mmHide').onclick = function () { root.classList.add('nomemo'); draw(); flash('메모는 MenuCtrls › 메모 보이기 로 다시 열 수 있습니다.'); };
  memoList();

  // ================= 시작 =================
  function boot() {
    eng.p(' MAPDL 연습기 — 중간고사 범위 (Mechanical APDL 방식, 정적 구조 해석)');
    eng.p(' 명령 입력 칸에 명령을 입력하고 Enter. 여러 줄은 붙여넣기 / File > Read Input from… / Session Editor.');
    eng.p(''); flushOut(0); updStatus(); draw();
  }
  boot(); refreshHist();
  if (location.hash.indexOf('#code=') === 0) { try { var code = decodeURIComponent(escape(atob(location.hash.slice(6)))); eng.p(' /INPUT  (기출 풀이 페이지에서 불러옴)'); runMany(code); } catch (e) { } }
  window.addEventListener('hashchange', function () { if (location.hash.indexOf('#code=') === 0) location.reload(); });
  window.MAPDL = { run: function (t) { return run(t); }, engine: function () { return eng; }, view: view };
})();

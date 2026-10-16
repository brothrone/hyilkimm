/* MAPDL 연습기 화면 — Mechanical APDL GUI 구성
 * Utility Menu · Toolbar · Input line · Main Menu(대화상자) · Graphics · Output · Status bar · Session Editor
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var eng = new window.ApdlEngine(), view = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0, mode: 'front', auto: true };
  var hist = [], hpos = -1, KEY = 'mapdl-trainer-db';
  var out = $('#mwOut'), svg = $('#mwSvg'), input = $('#mwInput'), status = $('#mwStatus'), stAttr = $('#mwAttr');

  // ================= 실행 =================
  function run(text, opt) {
    opt = opt || {};
    var n0 = eng.out.length, r = eng.exec(text, { record: opt.record !== false });
    flushOut(n0);
    if (opt.single) {
      if (r.errors) { var msg = eng.out.slice(n0).filter(function (o) { return o.k === 'e' && o.t.indexOf('***') < 0; }).map(function (o) { return o.t.trim(); }).join('\n'); msgbox('Error', msg, 'e'); }
      else if (eng.lastCmd === 'SOLVE' && eng.result) msgbox('Note', 'Solution is done!', 'n');
    } else if (r.errors) flash(r.errors + '개 명령에서 오류 — Output 창의 *** ERROR *** 를 확인하세요', 'e');
    else if (eng.lastCmd === 'SOLVE' && eng.result) msgbox('Note', 'Solution is done!', 'n');
    updStatus(); draw(); saveLocal();
    return r;
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
    status.textContent = 'Pick a menu item or enter a MAPDL command (' + s.procName + ')';
    stAttr.innerHTML = '<span>mat=' + s.mat + '</span><span>type=' + s.type + '</span><span>real=' + s.real + '</span><span>csys=' + s.csys + '</span><span>secn=' + s.secn + '</span>';
    document.querySelectorAll('.mw-tree [data-proc]').forEach(function (el) { el.classList.toggle('cur', el.getAttribute('data-proc') === s.proc); });
  }
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify({ hist: eng.hist.slice(-3000) })); } catch (e) { } }

  // ================= 입력 줄 =================
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); var t = input.value.trim(); if (!t) return; hist.push(t); hpos = hist.length; input.value = ''; run(t, { single: true }); refreshHistList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) { hpos--; input.value = hist[hpos]; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < hist.length - 1) { hpos++; input.value = hist[hpos]; } else { hpos = hist.length; input.value = ''; } }
  });
  input.addEventListener('paste', function (e) {
    var t = (e.clipboardData || window.clipboardData).getData('text'); if (t.indexOf('\n') < 0) return;
    e.preventDefault(); t.split('\n').forEach(function (l) { if (l.trim()) hist.push(l.trim()); }); hpos = hist.length; run(t); refreshHistList();
  });
  function refreshHistList() { var dl = $('#mwHist'); dl.innerHTML = ''; hist.slice(-40).reverse().forEach(function (h) { var o = document.createElement('option'); o.value = h; dl.appendChild(o); }); }

  // ================= 대화상자 =================
  var dlg = $('#mwDlg');
  function dialog(spec) {
    var html = '<div class="mw-dlgwin" role="dialog" aria-modal="true" aria-label="' + esc(spec.title) + '"><div class="mw-dlgtitle"><span>' + esc(spec.title) + '</span><button type="button" class="x" data-act="cancel" aria-label="닫기">✕</button></div><div class="mw-dlgbody">';
    (spec.fields || []).forEach(function (fd, i) {
      var id = 'mwf' + i, lab = '<label for="' + id + '"><b>[' + spec.cmd + ']</b> ' + esc(fd.label) + '</label>', ctl;
      if (fd.opts) ctl = '<select id="' + id + '">' + fd.opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === fd.def ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>';
      else if (fd.check) ctl = '<input type="checkbox" id="' + id + '"' + (fd.def ? ' checked' : '') + '>';
      else ctl = '<input id="' + id + '" value="' + esc(fd.def === undefined ? '' : fd.def) + '" autocomplete="off">';
      html += '<div class="mw-row">' + lab + ctl + '</div>';
    });
    if (spec.note) html += '<p class="mw-dnote">' + spec.note + '</p>';
    html += '<div class="mw-cmdprev">명령: <code id="mwPrev"></code></div></div><div class="mw-dlgbtns"><button type="button" data-act="ok">OK</button><button type="button" data-act="apply">Apply</button><button type="button" data-act="cancel">Cancel</button><button type="button" data-act="help">Help</button></div></div>';
    dlg.innerHTML = html; dlg.hidden = false;
    var vals = function () { return (spec.fields || []).map(function (fd, i) { var el = $('#mwf' + i); return fd.check ? (el.checked ? 1 : 0) : el.value.trim(); }); };
    var build = function () { return typeof spec.build === 'function' ? spec.build(vals()) : fill(spec.build, vals()); };
    var upd = function () { $('#mwPrev').textContent = build().split('\n').join('  $  '); };
    dlg.querySelectorAll('input,select').forEach(function (el) { el.addEventListener('input', upd); el.addEventListener('change', upd); });
    upd(); var first = dlg.querySelector('input,select'); if (first) first.focus();
    dlg.onclick = function (e) {
      var a = e.target.getAttribute('data-act'); if (!a) return;
      if (a === 'cancel') { dlg.hidden = true; return; }
      if (a === 'help') { window.open('ref.html', '_blank'); return; }
      var cmd = build(); cmd.split('\n').forEach(function (l) { hist.push(l); }); hpos = hist.length; refreshHistList(); run(cmd, { single: true });
      if (a === 'ok') dlg.hidden = true;
    };
    dlg.onkeydown = function (e) { if (e.key === 'Escape') dlg.hidden = true; if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); dlg.querySelector('[data-act=ok]').click(); } };
  }
  function fill(tpl, v) { var s = tpl.replace(/\{(\d+)\}/g, function (m, i) { return v[+i]; }); return s.split('\n').map(function (l) { return l.replace(/,+$/, ''); }).join('\n'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function msgbox(title, text, kind) {
    var m = $('#mwMsg'); m.innerHTML = '<div class="mw-dlgwin small ' + (kind || '') + '" role="alertdialog" aria-modal="true"><div class="mw-dlgtitle"><span>' + esc(title) + '</span></div><div class="mw-dlgbody"><pre>' + esc(text) + '</pre></div><div class="mw-dlgbtns"><button type="button" data-act="close">Close</button></div></div>';
    m.hidden = false; m.querySelector('button').focus(); m.onclick = function (e) { if (e.target.getAttribute('data-act') === 'close' || e.target === m) m.hidden = true; }; m.onkeydown = function (e) { if (e.key === 'Escape' || e.key === 'Enter') m.hidden = true; };
  }
  function flash(t, k) { var f = $('#mwFlash'); f.textContent = t; f.className = 'mw-flash ' + (k || ''); f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { f.hidden = true; }, 4000); }

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
    ['Preferences', { act: function () { msgbox('Preferences', 'Structural (구조 해석) 으로 설정되어 있습니다.\n이 연습기는 정적 구조 해석만 다룹니다.', 'n'); } }],
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
      ['Solve', { kids: [['Current LS', { cmd: 'SOLVE' }]] }]
    ] }],
    ['General Postproc', { proc: '/POST1', kids: [
      ['Read Results', { kids: [['Last Set', { cmd: 'SET,LAST' }]] }],
      ['Plot Results', { kids: [['Deformed Shape', { dlg: 'PLDISP' }], ['Contour Plot', { kids: [['Nodal Solu', { dlg: 'PLNSOL' }]] }]] }],
      ['List Results', { kids: [['Nodal Solution', { dlg: 'PRNSOL' }], ['Reaction Solu', { cmd: 'PRRSOL' }]] }],
      ['Element Table', { kids: [['Define Table', { dlg: 'ETABLE' }], ['Plot Elem Table', { dlg: 'PLETAB' }], ['List Elem Table', { dlg: 'PRETAB' }]] }]
    ] }],
    ['Session Editor', { act: openSession }],
    ['Finish', { cmd: 'FINISH' }]
  ];
  function buildTree(items, depth) {
    var ul = document.createElement('ul');
    items.forEach(function (it) {
      var li = document.createElement('li'), o = it[1], b = document.createElement('button');
      b.type = 'button'; b.className = 'mw-node' + (o.kids ? ' br' : ' leaf'); b.style.paddingLeft = (6 + depth * 14) + 'px';
      b.innerHTML = (o.kids ? '<i class="tw">⊞</i>' : '<i class="lf">' + (o.dlg ? '▫' : o.cmd ? '▪' : '◇') + '</i>') + esc(it[0]);
      if (o.proc) b.setAttribute('data-proc', { '/PREP7': 'P', '/SOLU': 'S', '/POST1': 'O' }[o.proc]);
      li.appendChild(b);
      if (o.kids) { var sub = buildTree(o.kids, depth + 1); sub.hidden = true; li.appendChild(sub); }
      b.onclick = function () {
        if (o.kids) { sub.hidden = !sub.hidden; b.querySelector('.tw').textContent = sub.hidden ? '⊞' : '⊟'; if (o.proc && !sub.hidden) enterProc(o.proc); return; }
        var top = findProc(b); if (top) enterProc(top);
        if (o.dlg) dialog(D[o.dlg]); else if (o.cmd) { hist.push(o.cmd); run(o.cmd, { single: true }); } else if (o.act) o.act();
      };
      ul.appendChild(li);
    });
    return ul;
  }
  function findProc(b) { var li = b.closest('li'); while (li) { var pb = li.querySelector(':scope > button[data-proc]'); if (pb) return { P: '/PREP7', S: '/SOLU', O: '/POST1' }[pb.getAttribute('data-proc')]; li = li.parentElement.closest('li'); } return null; }
  function enterProc(cmd) { var want = { '/PREP7': 'P', '/SOLU': 'S', '/POST1': 'O' }[cmd]; if (eng.proc !== want) { hist.push(cmd); run(cmd, { single: true }); } }
  $('#mwTree').appendChild(buildTree(MENU, 0));

  // ================= Utility Menu =================
  var UMENU = {
    File: [['Clear & Start New…', function () { if (confirm('데이터베이스를 지우고 새로 시작할까요? (/CLEAR)')) { out.innerHTML = ''; eng = new window.ApdlEngine(); hist = []; run('/CLEAR'); } }], ['Change Title…', function () { dialog(D.TITLE); }], ['Read Input from…', openRead], '-', ['Save as Jobname.db', 'SAVE'], ['Resume Jobname.db', 'RESUME'], '-', ['Write DB log file…', function () { download('file.log', eng.hist.join('\n') + '\n'); }], ['Session Editor', openSession]],
    Select: [['Entities… (Nodes by Location)', function () { dialog(D.NSEL); }], ['Everything', 'ALLSEL']],
    List: [['Keypoints', 'KLIST'], ['Lines', 'LLIST'], ['Areas', 'ALIST'], ['Nodes', 'NLIST'], ['Elements', 'ELIST'], '-', ['Element Types', 'ETLIST'], ['Real Constant Sets', 'RLIST'], ['Materials', 'MPLIST'], ['Section Properties', 'SLIST'], '-', ['DOF Constraints', 'DLIST'], ['Nodal Loads', 'FLIST'], ['Surface Loads', 'SFELIST'], '-', ['Parameters', '*STATUS']],
    Plot: [['Replot', '/REPLOT'], '-', ['Keypoints', 'KPLOT'], ['Lines', 'LPLOT'], ['Areas', 'APLOT'], ['Nodes', 'NPLOT'], ['Elements', 'EPLOT']],
    PlotCtrls: [['Numbering…', function () { D.PNUM.fields.forEach(function (f, i) { f.def = !!eng.pnum[['KP', 'LINE', 'AREA', 'NODE', 'ELEM'][i]]; }); dialog(D.PNUM); }], ['Pan Zoom Rotate…', function () { $('#mwPzr').hidden = !$('#mwPzr').hidden; }], ['Symbols: 구속·하중 표시 켜기/끄기', function () { view.noBC = !view.noBC; draw(); }]],
    WorkPlane: [['Display Working Plane (켜기/끄기)', function () { view.wp = !view.wp; draw(); }], ['Offset WP to › XYZ Locations…', function () { dialog(D.WPAVE); }], ['Offset WP to › Global Origin', 'WPAVE,0,0,0'], '-', ['Local Coordinate Systems › Create Local CS…', function () { dialog(D.LOCAL); }], ['Change Active CS to › Global Cartesian', 'CSYS,0'], ['Change Active CS to › Global Cylindrical', 'CSYS,1']],
    Parameters: [['Scalar Parameters…', function () { dialog(D.PARAM); }], ['List Parameters', '*STATUS']],
    Help: [['APDL 명령 참고자료 (Command Reference)', function () { window.open('ref.html', '_blank'); }], ['기출 풀이', function () { window.open('exams.html', '_blank'); }], ['연습기 사용법', function () { document.getElementById('howto').scrollIntoView(); }]]
  };
  var bar = $('#mwMenubar');
  Object.keys(UMENU).forEach(function (name) {
    var wrap = document.createElement('div'), b = document.createElement('button'), dd = document.createElement('div');
    wrap.className = 'mw-mi'; b.type = 'button'; b.textContent = name; dd.className = 'mw-dd'; dd.hidden = true;
    UMENU[name].forEach(function (it) {
      if (it === '-') { dd.appendChild(document.createElement('hr')); return; }
      var x = document.createElement('button'); x.type = 'button'; x.textContent = it[0];
      x.onclick = function () { closeMenus(); if (typeof it[1] === 'function') it[1](); else { hist.push(it[1]); run(it[1], { single: true }); } };
      dd.appendChild(x);
    });
    b.onclick = function (e) { e.stopPropagation(); var open = dd.hidden; closeMenus(); dd.hidden = !open; };
    b.onmouseenter = function () { if (bar.querySelector('.mw-dd:not([hidden])')) { closeMenus(); dd.hidden = false; } };
    wrap.appendChild(b); wrap.appendChild(dd); bar.appendChild(wrap);
  });
  function closeMenus() { bar.querySelectorAll('.mw-dd').forEach(function (d) { d.hidden = true; }); }
  document.addEventListener('click', closeMenus);

  // 툴바
  $('#tbSave').onclick = function () { hist.push('SAVE'); run('SAVE', { single: true }); try { localStorage.setItem(KEY + '-db', eng.saved); } catch (e) { } };
  $('#tbResume').onclick = function () { try { if (!eng.saved) eng.saved = localStorage.getItem(KEY + '-db'); } catch (e) { } hist.push('RESUME'); run('RESUME', { single: true }); };
  $('#tbQuit').onclick = function () { if (confirm('MAPDL 을 종료하고 처음 상태로 돌아갈까요? (저장하지 않은 내용은 사라짐)')) { out.innerHTML = ''; eng = new window.ApdlEngine(); hist = []; run('/CLEAR', { record: false }); } };
  $('#tbPower').onclick = function () { flash('POWRGRPH: PowerGraphics 는 항상 켜져 있습니다.'); };
  $('#tbExec').onclick = function () { var e = new KeyboardEvent('keydown', { key: 'Enter' }); input.dispatchEvent(e); };

  // ================= Session Editor / Read Input =================
  function openSession() {
    var m = $('#mwSess'); m.hidden = false; var ta = $('#mwSessTa'); ta.value = eng.hist.join('\n'); ta.focus();
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act'); if (!a) return;
      if (a === 'cancel') m.hidden = true;
      if (a === 'save') download('session.txt', ta.value);
      if (a === 'ok') { m.hidden = true; out.innerHTML = ''; eng = new window.ApdlEngine(); hist = ta.value.split('\n').filter(function (l) { return l.trim(); }); run(ta.value); }
    };
  }
  function openRead() {
    var m = $('#mwRead'); m.hidden = false; var list = $('#mwReadList'); list.innerHTML = '';
    (window.APDL_EXAMPLES || []).forEach(function (x, i) { var o = document.createElement('option'); o.value = 'ex' + i; o.textContent = x.name; list.appendChild(o); });
    (window.APDL_FILES || []).forEach(function (x) { var o = document.createElement('option'); o.value = 'f:' + x.path; o.textContent = '수업 파일: ' + x.name; list.appendChild(o); });
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act'); if (!a) return;
      if (a === 'cancel') { m.hidden = true; return; }
      if (a === 'ok') {
        var v = list.value, fresh = $('#mwReadClear').checked;
        var go = function (text, name) { m.hidden = true; if (fresh) { out.innerHTML = ''; eng = new window.ApdlEngine(); hist = []; } eng.p(' /INPUT,' + name); text.split('\n').forEach(function (l) { if (l.trim()) hist.push(l.trim()); }); run(text); flash(name + ' 실행 완료'); };
        if (v.indexOf('ex') === 0) { var x = window.APDL_EXAMPLES[+v.slice(2)]; go(x.code, x.name); }
        else if (v.indexOf('f:') === 0) fetch(v.slice(2)).then(function (r) { return r.arrayBuffer(); }).then(function (buf) { var t = new TextDecoder('utf-8').decode(buf); if (t.indexOf('�') > -1) t = new TextDecoder('euc-kr').decode(buf); go(t, list.options[list.selectedIndex].textContent.replace('수업 파일: ', '')); }).catch(function () { msgbox('Error', '파일을 불러오지 못했습니다.', 'e'); });
      }
    };
    $('#mwReadFile').onchange = function (e) {
      var fl = e.target.files[0]; if (!fl) return; var r = new FileReader();
      r.onload = function () { var buf = r.result, t = new TextDecoder('utf-8').decode(buf); if (t.indexOf('�') > -1) t = new TextDecoder('euc-kr').decode(buf); m.hidden = true; if ($('#mwReadClear').checked) { out.innerHTML = ''; eng = new window.ApdlEngine(); hist = []; } run(t); flash(fl.name + ' 실행 완료'); };
      r.readAsArrayBuffer(fl); e.target.value = '';
    };
  }
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }

  // ================= Pan Zoom Rotate =================
  var VIEWS = { front: [0, 0], top: [0, 90], bot: [0, -90], back: [180, 0], left: [-90, 0], right: [90, 0], iso: [-30, 30], obliq: [-20, 20] };
  $('#mwPzr').addEventListener('click', function (e) {
    var v = e.target.getAttribute('data-v'); if (!v) return;
    if (VIEWS[v]) { view.yaw = VIEWS[v][0]; view.pitch = VIEWS[v][1]; view.auto = false; view.zoom = 1; view.panX = view.panY = 0; }
    if (v === 'fit') { view.zoom = 1; view.panX = view.panY = 0; }
    if (v === 'in') view.zoom *= 1.25; if (v === 'out') view.zoom /= 1.25;
    if (v === 'dyn') { view.auto = false; flash('그래픽 창에서 드래그하면 회전, Shift+드래그 이동, 휠 확대/축소'); }
    draw();
  });
  var drag = null;
  svg.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, px: view.panX, py: view.panY, pan: e.shiftKey || e.button === 1 }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (drag.pan) { view.panX = drag.px + dx; view.panY = drag.py + dy; } else { view.auto = false; view.yaw = drag.yaw + dx * 0.5; view.pitch = Math.max(-90, Math.min(90, drag.pitch + dy * 0.5)); } draw(); });
  svg.addEventListener('pointerup', function () { drag = null; });
  svg.addEventListener('wheel', function (e) { e.preventDefault(); view.zoom *= e.deltaY < 0 ? 1.12 : 1 / 1.12; draw(); }, { passive: false });
  window.addEventListener('resize', function () { draw(); });

  // ================= Graphics =================
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, at, parent) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); (parent || svg).appendChild(e); return e; }
  function txt(x, y, s, at, parent) { at = at || {}; at.x = x; at.y = y; var t = el('text', at, parent); t.textContent = s; return t; }
  var SPEC = ['#0000ff', '#0080ff', '#00ffff', '#00ff80', '#00ff00', '#80ff00', '#ffff00', '#ff8000', '#ff0000'];
  var ACOL = ['#ff00ff', '#00ffff', '#ffff00', '#00ff00', '#ff8080', '#8080ff', '#ffa500', '#c0c0c0'];
  function band(v, lo, hi) { if (hi - lo < 1e-30 * Math.max(1, Math.abs(hi))) return 4; return Math.max(0, Math.min(8, Math.floor((v - lo) / (hi - lo) * 9))); }
  function gfmt(v) { return window.ApdlCore.g(v); }

  function draw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = svg.clientWidth || 700, H = svg.clientHeight || 480; svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var s; try { s = eng.snapshot(); } catch (e) { s = null; }
    var now = new Date(), M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    txt(10, 20, '1', { fill: '#fff', 'font-size': 13, 'font-weight': 'bold' });
    txt(W - 12, 20, M[now.getMonth()] + ' ' + now.getDate() + ' ' + now.getFullYear(), { fill: '#fff', 'font-size': 11, 'text-anchor': 'end' });
    txt(W - 12, 34, now.toTimeString().slice(0, 8), { fill: '#fff', 'font-size': 11, 'text-anchor': 'end' });
    if (!s) return;
    var p = s.plot || { kind: 'auto' }, kind = p.kind;
    var hasE = Object.keys(s.elems).length, hasN = Object.keys(s.nodes).length, hasA = Object.keys(s.areas).length, hasL = Object.keys(s.lines).length, hasK = Object.keys(s.kps).length;
    if (kind === 'auto') kind = hasE ? 'elem' : hasN ? 'node' : hasA ? 'area' : hasL ? 'line' : hasK ? 'kp' : 'none';
    var res = (kind === 'DISP' || kind === 'NSOL' || kind === 'ESOL' || kind === 'ETAB') && s.solved;
    if (!res && /DISP|NSOL|ESOL|ETAB/.test(kind)) kind = 'elem';
    // 보일 점
    var used = {}; for (var e in s.elems) s.elems[e].n.forEach(function (n) { used[n] = 1; });
    var showNode = function (n) { return !hasE || used[n] || !s.kOnly[n]; };
    var P3 = [], k;
    if (kind === 'kp' || kind === 'line' || kind === 'area' || kind === 'all') { for (k in s.kps) P3.push(s.kps[k].x); for (k in s.lines) s.lines[k].pts.forEach(function (q) { P3.push(q); }); for (k in s.areas) s.areas[k].regions.forEach(function (r) { r.forEach(function (q) { P3.push([q[0], q[1], 0]); }); }); }
    if (kind === 'node' || kind === 'elem' || res || kind === 'all') for (k in s.nodes) if (showNode(k)) P3.push(s.nodes[k].x);
    if (!P3.length) { for (k in s.nodes) P3.push(s.nodes[k].x); for (k in s.kps) P3.push(s.kps[k].x); }
    var label = { kp: 'KEYPOINTS', line: 'LINES', area: 'AREAS', node: 'NODES', elem: 'ELEMENTS', all: 'GEOMETRY', DISP: 'DISPLACEMENT', NSOL: 'NODAL SOLUTION', ESOL: 'ELEMENT SOLUTION', ETAB: 'ELEMENT TABLE', none: '' }[kind] || '';
    var tl = [label];
    if (s.pnum.NODE && (kind === 'node' || kind === 'elem')) tl.push('NODE NUM'); if (s.pnum.ELEM && kind === 'elem') tl.push('ELEM NUM'); if (s.pnum.KP && /kp|line|area/.test(kind)) tl.push('KP NUM'); if (s.pnum.LINE && /line|area/.test(kind)) tl.push('LINE NUM'); if (s.pnum.AREA && kind === 'area') tl.push('AREA NUM');
    if (!P3.length) { txt(W / 2, H / 2, '(그릴 항목 없음 — Input 줄에 명령을 입력하거나 Main Menu 를 사용하세요)', { fill: '#7ab', 'font-size': 13, 'text-anchor': 'middle' }); drawTitle(tl, s, W, H); return; }
    // 보기 방향
    var flat = P3.every(function (q) { return Math.abs(q[2]) < 1e-9; });
    if (view.auto) { if (flat) { view.yaw = 0; view.pitch = 0; } else { view.yaw = -30; view.pitch = 30; } }
    var cy = Math.cos(view.yaw * Math.PI / 180), sy = Math.sin(view.yaw * Math.PI / 180), cp = Math.cos(view.pitch * Math.PI / 180), sp = Math.sin(view.pitch * Math.PI / 180);
    var Pj = function (q) { var x = cy * q[0] + sy * q[2], z = -sy * q[0] + cy * q[2]; return [x, cp * q[1] - sp * z]; };
    // 변형
    var umax = 0, lo = [1e99, 1e99, 1e99], hi = [-1e99, -1e99, -1e99];
    P3.forEach(function (q) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); } });
    var size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    if (res) for (k in s.nodes) if (s.nodes[k].u && showNode(k)) umax = Math.max(umax, Math.hypot(s.nodes[k].u[0], s.nodes[k].u[1], s.nodes[k].u[2]));
    var dsc = res && kind !== 'ETAB' && kind !== 'ESOL' && umax > 0 ? 0.08 * size / umax : (res && umax > 0 ? 0.08 * size / umax : 0);
    var defX = function (n) { var nd = s.nodes[n]; if (!dsc || !nd.u) return nd.x; return [nd.x[0] + nd.u[0] * dsc, nd.x[1] + nd.u[1] * dsc, nd.x[2] + nd.u[2] * dsc]; };
    var all2 = P3.map(Pj); if (dsc) for (k in s.nodes) if (showNode(k)) all2.push(Pj(defX(k)));
    var x0 = 1e99, x1 = -1e99, y0 = 1e99, y1 = -1e99; all2.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    var top = 54, bot = res ? 64 : 34, padx = 50, sc = Math.min((W - 2 * padx) / ((x1 - x0) || 1), (H - top - bot) / ((y1 - y0) || 1)) * view.zoom; if (!isFinite(sc) || sc <= 0) sc = 1;
    if (x1 - x0 < 1e-12 && y1 - y0 < 1e-12) sc = 1;
    var ox = W / 2 - (x0 + x1) / 2 * sc + view.panX, oy = top + (H - top - bot) / 2 + (y0 + y1) / 2 * sc + view.panY;
    var S2 = function (q) { var r = Pj(q); return [ox + r[0] * sc, oy - r[1] * sc]; };
    var g0 = el('g', {});

    // 작업평면
    if (view.wp && s.wp) { var o = s.wp.o, R = s.wp.R, L = size * 0.25, a1 = S2(o), ax = S2([o[0] + R[0][0] * L, o[1] + R[1][0] * L, o[2] + R[2][0] * L]), ay = S2([o[0] + R[0][1] * L, o[1] + R[1][1] * L, o[2] + R[2][1] * L]); el('line', { x1: a1[0], y1: a1[1], x2: ax[0], y2: ax[1], stroke: '#888', 'stroke-dasharray': '4 3' }, g0); el('line', { x1: a1[0], y1: a1[1], x2: ay[0], y2: ay[1], stroke: '#888', 'stroke-dasharray': '4 3' }, g0); txt(ax[0] + 3, ax[1], 'WX', { fill: '#aaa', 'font-size': 10 }, g0); txt(ay[0] + 3, ay[1], 'WY', { fill: '#aaa', 'font-size': 10 }, g0); }

    // 기하
    if (kind === 'area' || kind === 'all') { Object.keys(s.areas).forEach(function (a, i) { var A = s.areas[a], d = A.regions.map(function (r) { return 'M' + r.map(function (q) { var z = S2([q[0], q[1], 0]); return z[0].toFixed(1) + ',' + z[1].toFixed(1); }).join('L') + 'Z'; }).join(''); el('path', { d: d, fill: ACOL[(+a - 1) % ACOL.length], 'fill-opacity': 0.85, stroke: '#fff', 'stroke-width': 0.8, 'fill-rule': 'evenodd' }, g0); if (s.pnum.AREA) { var cxy = centroid(A.regions[0]), z = S2([cxy[0], cxy[1], 0]); txt(z[0], z[1], 'A' + a, { fill: '#000', 'font-size': 12, 'font-weight': 'bold', 'text-anchor': 'middle', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, g0); } }); }
    if (kind === 'line' || kind === 'area' || kind === 'kp' || kind === 'all') {
      if (kind !== 'kp') for (k in s.lines) { var Ln = s.lines[k]; el('polyline', { points: Ln.pts.map(function (q) { return S2(q).map(function (v) { return v.toFixed(1); }).join(','); }).join(' '), fill: 'none', stroke: kind === 'area' ? '#ddd' : '#ff00ff', 'stroke-width': 1.6 }, g0); if (s.pnum.LINE) { var mq = S2(Ln.pts[Math.floor(Ln.pts.length / 2)]); txt(mq[0] + 4, mq[1] - 4, 'L' + k, { fill: '#ff99ff', 'font-size': 11 }, g0); } }
      for (k in s.kps) { var qk = S2(s.kps[k].x); el('rect', { x: qk[0] - 2, y: qk[1] - 2, width: 4, height: 4, fill: '#fff' }, g0); if (s.pnum.KP) txt(qk[0] + 5, qk[1] - 5, k, { fill: '#fff', 'font-size': 11 }, g0); }
    }

    // 결과 값
    var field = null, flo = 0, fhi = 0, flab = '', fmn = null, fmx = null, efield = null;
    if (res && (kind === 'DISP' || kind === 'NSOL')) {
      var it = p.item || 'U', cmp = p.comp || 'SUM'; if (kind === 'DISP') { it = 'U'; cmp = 'SUM'; }
      field = {};
      for (k in s.nodes) { if (!showNode(k)) continue; var u = s.nodes[k].u; if (it === 'S') { if (!s.nstress || !s.nstress[k]) continue; field[k] = s.nstress[k][{ X: 0, Y: 1, Z: 2, XY: 3, '1': 4, '2': 5, '3': 6, INT: 7, EQV: 8 }[cmp]] || 0; } else { if (!u) continue; var b = it === 'ROT' ? 3 : 0; field[k] = cmp === 'SUM' ? Math.hypot(u[b], u[b + 1], u[b + 2]) : u[b + 'XYZ'.indexOf(cmp)] || 0; } }
      flab = it === 'S' ? 'S' + (cmp === 'EQV' ? 'EQV' : cmp) + ' (AVG)' : (it === 'ROT' ? 'ROT' : 'U') + cmp + ' (AVG)';
      var ks = Object.keys(field); ks.forEach(function (q) { if (fmn === null || field[q] < field[fmn]) fmn = q; if (fmx === null || field[q] > field[fmx]) fmx = q; });
      if (ks.length) { flo = field[fmn]; fhi = field[fmx]; }
      if (kind === 'DISP') field = null;
    }
    if (res && kind === 'ETAB' && s.etab[p.lab]) { efield = s.etab[p.lab].vals; flab = p.lab; var ev = Object.keys(efield).map(function (q) { return efield[q]; }); flo = Math.min.apply(null, ev); fhi = Math.max.apply(null, ev); }
    if (res && kind === 'ESOL' && s.nstress) { efield = {}; for (e in s.elems) { var ns = s.elems[e].n, acc = 0, c = 0; ns.forEach(function (n) { if (s.nstress[n]) { acc += s.nstress[n][8]; c++; } }); if (c) efield[e] = acc / c; } flab = 'SEQV (NOAVG)'; var ev2 = Object.keys(efield).map(function (q) { return efield[q]; }); flo = Math.min.apply(null, ev2); fhi = Math.max.apply(null, ev2); }

    // 요소
    if (kind === 'elem' || res || kind === 'all') {
      var und = res && (kind === 'DISP' ? p.und : p.und);
      var XY = function (n) { return S2(defX(n)); }, XY0 = function (n) { return S2(s.nodes[n].x); };
      if (res && (und === 1 || und === 2 || kind === 'DISP')) for (e in s.elems) drawElem(e, XY0, 'ghost');
      for (e in s.elems) drawElem(e, res ? XY : XY0, '');
    }
    function drawElem(e, XYf, mode) {
      var E = s.elems[e], pts = E.n.map(XYf), col = '#00e5ff', ghost = mode === 'ghost';
      if (!ghost && efield && efield[e] !== undefined) col = SPEC[band(efield[e], flo, fhi)];
      if (E.kind === 'plane') {
        var poly = (E.n[2] === E.n[3] ? pts.slice(0, 3) : pts.slice(0, 4));
        if (!ghost && field) { var av = 0, c = 0; E.n.forEach(function (n) { if (field[n] !== undefined) { av += field[n]; c++; } }); col = SPEC[band(c ? av / c : 0, flo, fhi)]; }
        el('polygon', { points: poly.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '), fill: ghost ? 'none' : (field || efield ? col : '#00a0c0'), 'fill-opacity': ghost ? 0 : (field || efield ? 1 : 0.55), stroke: ghost ? '#777' : (field || efield ? 'rgba(0,0,0,.35)' : '#9ff'), 'stroke-width': 0.7, 'stroke-dasharray': ghost ? '3 3' : '' }, g0);
      } else {
        if (!ghost && field) { var f1 = field[E.n[0]], f2 = field[E.n[1]]; if (f1 !== undefined && f2 !== undefined) { var nb = 6; for (var i = 0; i < nb; i++) { var t0 = i / nb, t1 = (i + 1) / nb, v = f1 + (f2 - f1) * (t0 + t1) / 2; el('line', { x1: pts[0][0] + (pts[1][0] - pts[0][0]) * t0, y1: pts[0][1] + (pts[1][1] - pts[0][1]) * t0, x2: pts[0][0] + (pts[1][0] - pts[0][0]) * t1, y2: pts[0][1] + (pts[1][1] - pts[0][1]) * t1, stroke: SPEC[band(v, flo, fhi)], 'stroke-width': E.kind === 'beam' || E.kind === 'beam3' ? 4 : 3, 'stroke-linecap': 'round' }, g0); } } }
        else el('line', { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1], stroke: ghost ? '#777' : (E.kind === 'spring' ? '#ffd700' : col), 'stroke-width': ghost ? 1 : (E.kind === 'beam' || E.kind === 'beam3' ? 3 : 2.2), 'stroke-dasharray': ghost ? '4 3' : (E.kind === 'spring' ? '3 2' : ''), 'stroke-linecap': 'round' }, g0);
      }
      if (!ghost && s.pnum.ELEM && (kind === 'elem' || res)) { var cx = 0, cyy = 0, nn = E.kind === 'plane' && E.n[2] === E.n[3] ? 3 : E.n.length; pts.slice(0, nn).forEach(function (q) { cx += q[0]; cyy += q[1]; }); txt(cx / nn, cyy / nn - 3, e, { fill: '#ffeb3b', 'font-size': 10.5, 'text-anchor': 'middle' }, g0); }
    }

    // 노드
    if (kind === 'node' || (kind === 'elem' && (s.pnum.NODE || !hasE)) || (res && s.pnum.NODE)) for (k in s.nodes) { if (!showNode(k)) continue; var qn = S2(res ? defX(k) : s.nodes[k].x); el('circle', { cx: qn[0], cy: qn[1], r: kind === 'node' ? 2.4 : 1.6, fill: kind === 'node' ? '#fff' : '#ddd' }, g0); if (s.pnum.NODE) txt(qn[0] + 4, qn[1] - 4, k, { fill: '#fff', 'font-size': 10.5 }, g0); }

    // 구속·하중 기호 (ANSYS: 구속 = 청록 삼각형, 힘 = 빨간 화살표)
    if (!view.noBC && (kind === 'node' || kind === 'elem' || kind === 'DISP' || kind === 'NSOL' || kind === 'kp' || kind === 'line')) {
      var defs = el('defs', {}, g0), mk = el('marker', { id: 'mwArr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs); el('path', { d: 'M0,0L10,5L0,10z', fill: '#ff2020' }, mk);
      var tri = function (q, col) { el('path', { d: 'M' + q[0] + ',' + q[1] + 'l-6,10h12z', fill: 'none', stroke: col, 'stroke-width': 1.4 }, g0); };
      var place = function (x) { return S2(x); };
      for (k in s.D) if (s.nodes[k]) { var dd = s.D[k], nz = Object.keys(dd).some(function (i) { return dd[i]; }); tri(place(s.nodes[k].x), nz ? '#ff8000' : '#00ffff'); }
      for (k in s.DK) if (s.kps[k]) tri(place(s.kps[k].x), '#00ffff');
      var arrow = function (x, dir, v, lab) { var L = size * 0.12, a = S2(x), b = S2([x[0] - dir[0] * L, x[1] - dir[1] * L, x[2] - dir[2] * L]); el('line', { x1: b[0], y1: b[1], x2: a[0], y2: a[1], stroke: '#ff2020', 'stroke-width': 1.8, 'marker-end': 'url(#mwArr)' }, g0); txt(b[0] + 3, b[1] - 3, lab, { fill: '#ff7070', 'font-size': 10.5 }, g0); };
      var forces = function (F, getX, getT) { for (var n in F) { var x = getX(n); if (!x) continue; for (var i in F[n]) { var v = F[n][i]; if (!v) continue; i = +i; if (i < 3) { var d = [0, 0, 0]; d[i] = v > 0 ? 1 : -1; var T = getT(n); if (T) d = [T[0][i] * d[i], T[1][i] * d[i], T[2][i] * d[i]]; arrow(x, d, v, gfmt(v)); } else { var q = S2(x); el('circle', { cx: q[0], cy: q[1], r: 9, fill: 'none', stroke: '#ff2020', 'stroke-width': 1.4, 'stroke-dasharray': '12 4' }, g0); txt(q[0] + 10, q[1] - 9, ['MX', 'MY', 'MZ'][i - 3] + '=' + gfmt(v), { fill: '#ff7070', 'font-size': 10.5 }, g0); } } } };
      forces(s.F, function (n) { return s.nodes[n] && s.nodes[n].x; }, function (n) { return s.nodes[n].T; });
      forces(s.FK, function (n) { return s.kps[n] && s.kps[n].x; }, function () { return null; });
      var qmax = 0; for (k in s.SFB) for (var lk in s.SFB[k]) qmax = Math.max(qmax, Math.abs(s.SFB[k][lk].vi), Math.abs(s.SFB[k][lk].vj));
      var sfk = Object.keys(s.SFB), sstep = Math.max(1, Math.ceil(sfk.length / 40)); sfk.forEach(function (k, si) { if (si % sstep) return; var E2 = s.elems[k]; if (!E2) return; var A0 = s.nodes[E2.n[0]].x, A1 = s.nodes[E2.n[1]].x, axs = beamAxes(A0, A1, E2.k, E2.kind);
        for (var lk in s.SFB[k]) { var L2 = s.SFB[k][lk], dir = E2.kind === 'beam' ? (lk === '1' ? axs.z : lk === '2' ? axs.y : null) : (lk === '1' ? axs.y : null); if (!dir) continue;
          [0.5].forEach(function (t) { var v = L2.vi + (L2.vj - L2.vi) * t; if (!v) return; var len = size * 0.08 * Math.abs(v) / (qmax || 1), q = [A0[0] + (A1[0] - A0[0]) * t, A0[1] + (A1[1] - A0[1]) * t, A0[2] + (A1[2] - A0[2]) * t], sg = v > 0 ? 1 : -1, a = S2(q), b = S2([q[0] + dir[0] * sg * len, q[1] + dir[1] * sg * len, q[2] + dir[2] * sg * len]); el('line', { x1: b[0], y1: b[1], x2: a[0], y2: a[1], stroke: '#ff4040', 'stroke-width': 1.1, 'marker-end': 'url(#mwArr)' }, g0); });
        } });
    }
    // MN / MX 표시
    if (field && fmn !== null) { [[fmn, 'MN'], [fmx, 'MX']].forEach(function (m) { var q = S2(defX(m[0])); txt(q[0] + 5, q[1] + (m[1] === 'MN' ? 14 : -6), m[1], { fill: '#fff', 'font-size': 11, 'font-weight': 'bold' }, g0); }); }
    // 삼각좌표계
    var tx = 34, ty = H - (res ? 78 : 34);
    [[1, 0, 0, 'X', '#ff4040'], [0, 1, 0, 'Y', '#40ff40'], [0, 0, 1, 'Z', '#4090ff']].forEach(function (a) { var q = Pj([a[0], a[1], a[2]]); if (Math.hypot(q[0], q[1]) < 0.12) { txt(tx - 3, ty + 4, a[3], { fill: a[4], 'font-size': 11 }); return; } var e2 = [tx + q[0] * 22, ty - q[1] * 22]; el('line', { x1: tx, y1: ty, x2: e2[0], y2: e2[1], stroke: a[4], 'stroke-width': 1.6 }); txt(e2[0] + (q[0] >= 0 ? 2 : -9), e2[1] + 4, a[3], { fill: a[4], 'font-size': 11 }); });
    // 제목·범례
    if (res) {
      if (kind === 'DISP' || kind === 'NSOL') tl.push('STEP=1', 'SUB =1', 'TIME=1');
      if (field) tl.push(flab, 'RSYS=0');
      tl.push('DMX =' + gfmt(umax));
      if (field || efield) { tl.push('SMN =' + gfmt(flo), 'SMX =' + gfmt(fhi)); legend(flo, fhi, W, H); }
    }
    drawTitle(tl, s, W, H);
  }
  function drawTitle(tl, s, W, H) { tl.filter(Boolean).forEach(function (t, i) { txt(24, 20 + i * 13.5, t, { fill: '#fff', 'font-size': 11 }); }); if (s.title) txt(W / 2, H - 8, s.title, { fill: '#fff', 'font-size': 12, 'text-anchor': 'middle' }); }
  function legend(lo, hi, W, H) { var w = Math.min(70, (W - 80) / 9), x = (W - w * 9) / 2, y = H - 44; for (var i = 0; i < 9; i++) { el('rect', { x: x + i * w, y: y, width: w, height: 12, fill: SPEC[i] }); var v = lo + (hi - lo) * i / 9; txt(x + i * w, y + 26, gfmt(v), { fill: '#fff', 'font-size': 9.5, 'text-anchor': 'middle' }); } txt(x + 9 * w, y + 26, gfmt(hi), { fill: '#fff', 'font-size': 9.5, 'text-anchor': 'middle' }); }
  function centroid(r) { var x = 0, y = 0; r.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / r.length, y / r.length]; }
  function beamAxes(a, b, k, kind) { var x = n3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), y, z; if (k && kind === 'beam') { var v = [k[0] - a[0], k[1] - a[1], k[2] - a[2]], d = v[0] * x[0] + v[1] * x[1] + v[2] * x[2]; z = n3([v[0] - d * x[0], v[1] - d * x[1], v[2] - d * x[2]]); y = cr(z, x); } else { if (Math.abs(x[2]) > 1 - 1e-9) y = [0, 1, 0]; else y = n3(cr([0, 0, 1], x)); z = cr(x, y); } return { x: x, y: y, z: z }; }
  function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function n3(a) { var n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }

  // ================= 시작 =================
  eng.p(' MAPDL 연습기 — 중간고사 범위 (Mechanical APDL 방식)'); eng.p(' Input 줄에 명령을 입력하고 Enter. 여러 줄 스크립트는 File > Read Input from… 또는 Session Editor.'); eng.p('');
  flushOut(0); updStatus();
  if (location.hash.indexOf('#code=') === 0) { try { var code = decodeURIComponent(escape(atob(location.hash.slice(6)))); code.split('\n').forEach(function (l) { if (l.trim()) hist.push(l.trim()); }); eng.p(' /INPUT  (기출 풀이 페이지에서 불러옴)'); run(code); } catch (e) { } }
  else draw();
  refreshHistList();
  window.addEventListener('hashchange', function () { if (location.hash.indexOf('#code=') === 0) location.reload(); });
  window.MAPDL = { run: function (t) { return run(t); }, engine: function () { return eng; } };
})();

/* MAPDL 연습기 — 명령 해석기 (중간고사 범위)
 * Mechanical APDL 처럼 동작하도록 만든 부분
 *  - 처리기 상태: BEGIN · /PREP7 · /SOLU · /POST1 (FINISH 로 BEGIN 복귀). 처리기에 맞지 않는 명령은
 *    "… is not a recognized PREP7 command" 오류를 내고 무시한 뒤 다음 명령을 계속 실행한다.
 *  - 데이터베이스가 명령 사이에 유지된다 (명령 줄에서 한 줄씩 입력 가능). /CLEAR 로 초기화.
 *  - 명령은 앞 4글자 이상으로 줄여 쓸 수 있다 (pcir → PCIRC, rect → RECTNG).
 *  - 명령마다 ANSYS 출력 창과 비슷한 응답을 출력한다.
 * 실제 ANSYS 와 다른 점은 apdl.html 페이지 아래에 정리.
 */
(function (root) {
  'use strict';
  var C = root.ApdlCore || (typeof require !== 'undefined' ? require('./apdl-core.js') : null);
  var ApdlError = C.ApdlError, g = C.g, pad = C.pad, rpad = C.rpad;
  var add = C.add, sub = C.sub, scl = C.scl, dot = C.dot, cross = C.cross, norm = C.norm, unit = C.unit, mv = C.mv, mm = C.mm, DEG = C.DEG;
  var DOFS = ['UX', 'UY', 'UZ', 'ROTX', 'ROTY', 'ROTZ'], FLAB = { FX: 0, FY: 1, FZ: 2, MX: 3, MY: 4, MZ: 5 }, FNAME = ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'];
  var PROCNAME = { B: 'BEGIN', P: 'PREP7', S: 'SOLUTION', O: 'POST1' };

  var ETYPES = {
    LINK180: { desc: '3-D SPAR', kind: 'link', dofs: [0, 1, 2] },
    LINK8: { desc: '3-D SPAR', kind: 'link', dofs: [0, 1, 2], legacy: 1 },
    LINK1: { desc: '2-D SPAR', kind: 'link', dofs: [0, 1], legacy: 1 },
    BEAM188: { desc: '3-D 2-NODE BEAM', kind: 'beam', dofs: [0, 1, 2, 3, 4, 5] },
    BEAM3: { desc: '2-D ELASTIC BEAM', kind: 'beam3', dofs: [0, 1, 5], legacy: 1 },
    PLANE182: { desc: '2-D 4-NODE SOLID', kind: 'plane', dofs: [0, 1] },
    PLANE42: { desc: '2-D STRUCTURAL SOLID', kind: 'plane', dofs: [0, 1], legacy: 1 },
    PLANE183: { desc: '2-D 8-NODE SOLID', kind: 'plane', dofs: [0, 1] },
    PLANE82: { desc: '2-D 8-NODE STRUCTURAL SOLID', kind: 'plane', dofs: [0, 1], legacy: 1 },
    COMBIN14: { desc: 'SPRING-DAMPER', kind: 'spring', dofs: [0, 1, 2] }
  };
  function etDofs(et) { var t = ETYPES[et.name]; if (t.kind === 'spring') { var k2 = et.kop[2]; if (k2 >= 1 && k2 <= 6) return [k2 - 1]; if (et.kop[3] === 2) return [0, 1]; } return t.dofs; }
  function lowestFree(set) { var i = 1; while (set[i]) i++; return i; }
  function maxKey(set) { var m = 0; for (var k in set) m = Math.max(m, +k); return m; }
  function keysN(set) { return Object.keys(set).map(Number).sort(function (a, b) { return a - b; }); }

  function Engine() { this.hist = []; this.out = []; this.clearDB(); }
  Engine.prototype.clearDB = function () {
    this.nodes = {}; this.elems = {}; this.ets = {}; this.reals = {}; this.secs = {}; this.mats = {};
    this.kps = {}; this.lines = {}; this.areas = {}; this.kpNode = {};
    this.cs = { 0: { type: 0, o: [0, 0, 0], R: C.I3() }, 1: { type: 1, o: [0, 0, 0], R: C.I3() }, 2: { type: 2, o: [0, 0, 0], R: C.I3() } };
    this.acs = 0; this.wp = { o: [0, 0, 0], R: C.I3() };
    this.att = { type: 1, mat: 1, real: 1, sec: 1 }; this.esz = { size: 0, ndiv: 0 };
    this.D = {}; this.F = {}; this.DK = {}; this.FK = {}; this.SFB = {};
    this.params = {}; this.afunDeg = false; this.nsel = null; this.esel = null;
    this.proc = 'B'; this.title = ''; this.result = null; this.etab = {}; this.etabOrder = [];
    this.plot = { kind: 'auto' }; this.eshape = 0; this.dscale = 0; this.anim = null; this.pnum = {}; this.curSec = null; this.lastNodes = []; this.solved = 0; this._once = {};
  };
  Engine.prototype.p = function (s, k) { var self = this; String(s).split('\n').forEach(function (l) { self.out.push({ t: l, k: k || '' }); }); if (this.out.length > 30000) this.out.splice(0, this.out.length - 25000); };
  Engine.prototype.err = function (msg) { this.p(''); this.p(' *** ERROR ***', 'e'); this.p(' ' + msg.replace(/\n/g, '\n '), 'e'); this.nErr = (this.nErr || 0) + 1; if (this.curLine) this.errLines.push(this.curLine); };
  Engine.prototype.warn = function (msg) { this.p(''); this.p(' *** WARNING ***', 'w'); this.p(' ' + msg, 'w'); };
  Engine.prototype.note = function (msg) { this.p(''); this.p(' *** NOTE ***', 'n'); this.p(' ' + msg, 'n'); };
  Engine.prototype.noteOnce = function (m) { if (!this._once[m]) { this._once[m] = 1; this.note(m); } };
  Engine.prototype.warnOnce = function (m) { if (!this._once[m]) { this._once[m] = 1; this.warn(m); } };

  Engine.prototype.param = function (n) { if (n === 'PI') return Math.PI; if (n in this.params) return this.params[n]; throw new ApdlError('Parameter ' + n + ' is undefined (정의되지 않은 파라미터).'); };
  Engine.prototype.func = function (f, a) {
    var self = this, ang = function (x) { return self.afunDeg ? x * DEG : x; }, inv = function (x) { return self.afunDeg ? x / DEG : x; };
    switch (f) {
      case 'SQRT': return Math.sqrt(a[0]); case 'ABS': return Math.abs(a[0]); case 'EXP': return Math.exp(a[0]);
      case 'LOG': return Math.log(a[0]); case 'LOG10': return Math.log10(a[0]); case 'NINT': return Math.round(a[0]);
      case 'SIGN': return Math.abs(a[0]) * (a[1] < 0 ? -1 : 1); case 'MOD': return a[1] === 0 ? 0 : a[0] - Math.round(a[0] / a[1]) * a[1];
      case 'SIN': return Math.sin(ang(a[0])); case 'COS': return Math.cos(ang(a[0])); case 'TAN': return Math.tan(ang(a[0]));
      case 'ASIN': return inv(Math.asin(a[0])); case 'ACOS': return inv(Math.acos(a[0])); case 'ATAN': return inv(Math.atan(a[0]));
      case 'ATAN2': return inv(Math.atan2(a[0], a[1]));
      case 'NX': case 'NY': case 'NZ': return this.inActive(this.nodeXYZ(a[0]))['XYZ'.indexOf(f[1])];
      case 'KX': case 'KY': case 'KZ': return this.inActive(this.kpXYZ(a[0]))['XYZ'.indexOf(f[1])];
      case 'UX': case 'UY': case 'UZ': case 'ROTX': case 'ROTY': case 'ROTZ': return this.nodeU(a[0])[DOFS.indexOf(f)];
      case 'NELEM': var e = this.elems[a[0]]; if (!e) throw new ApdlError('Element ' + a[0] + ' is not defined.'); return e.n[a[1] - 1] || 0;
      case 'DISTND': return norm(sub(this.nodeXYZ(a[0]), this.nodeXYZ(a[1])));
      case 'DISTKP': return norm(sub(this.kpXYZ(a[0]), this.kpXYZ(a[1])));
      case 'NODE': return this.nearest(this.nodes, this.toGlobal(this.acs, a[0] || 0, a[1] || 0, a[2] || 0));
      case 'KP': return this.nearest(this.kps, this.toGlobal(this.acs, a[0] || 0, a[1] || 0, a[2] || 0));
    }
    throw new ApdlError('Function ' + f + '() is not supported in this trainer.');
  };
  Engine.prototype.nearest = function (set, p) { var best = 0, bd = 1e99; for (var k in set) { var d = norm(sub(set[k].x, p)); if (d < bd) { bd = d; best = +k; } } return best; };
  Engine.prototype.num = function (s, def) { if (s === undefined || s === null || String(s).trim() === '') return def === undefined ? 0 : def; return new C.Expr(this).eval(String(s)); };
  Engine.prototype.lab = function (s) { return (s === undefined || s === null ? '' : String(s)).trim().toUpperCase(); };

  Engine.prototype.toGlobal = function (id, a, b, c) {
    var cs = this.cs[id], p;
    if (cs.type === 1) p = [a * Math.cos(b * DEG), a * Math.sin(b * DEG), c];
    else if (cs.type === 2) p = [a * Math.cos(b * DEG) * Math.cos(c * DEG), a * Math.sin(b * DEG) * Math.cos(c * DEG), a * Math.sin(c * DEG)];
    else p = [a, b, c];
    return add(cs.o, mv(cs.R, p));
  };
  Engine.prototype.fromGlobal = function (id, gp) {
    var cs = this.cs[id], p = C.mtv(cs.R, sub(gp, cs.o));
    if (cs.type === 1) return [Math.hypot(p[0], p[1]), Math.atan2(p[1], p[0]) / DEG, p[2]];
    if (cs.type === 2) { var r = norm(p); return [r, Math.atan2(p[1], p[0]) / DEG, r ? Math.asin(p[2] / r) / DEG : 0]; }
    return p;
  };
  Engine.prototype.inActive = function (gp) { return this.fromGlobal(this.acs, gp); };
  Engine.prototype.axesAt = function (id, gp) { var cs = this.cs[id]; if (cs.type === 1) { var t = this.fromGlobal(id, gp)[1] * DEG; return mm(cs.R, [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]]); } return cs.R; };
  Engine.prototype.nodeXYZ = function (n) { var nd = this.nodes[n]; if (!nd) throw new ApdlError('Node ' + n + ' is not defined (노드 없음).'); return nd.x; };
  Engine.prototype.kpXYZ = function (k) { var kp = this.kps[k]; if (!kp) throw new ApdlError('Keypoint ' + k + ' is not defined (키포인트 없음).'); return kp.x; };
  Engine.prototype.wpG = function (x, y) { return add(this.wp.o, mv(this.wp.R, [x, y, 0])); };
  var CSNAME = { 0: 'CARTESIAN', 1: 'CYLINDRICAL', 2: 'SPHERICAL' };

  // ================= 실행 =================
  Engine.prototype.split = function (t) { var out = [], cur = '', d = 0; for (var i = 0; i < t.length; i++) { var c = t[i]; if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; };
  Engine.prototype.exec = function (text, opts) {
    opts = opts || {};
    var raw = String(text).replace(/\r/g, '').split('\n'), P = [];
    raw.forEach(function (l, i) { var s = l, q = s.indexOf('!'); if (q > -1) s = s.slice(0, q); s.split('$').forEach(function (part) { part = part.trim(); if (part) P.push({ t: part, ln: (opts.line0 || 0) + i + 1 }); }); });
    this.prog = P; this.nErr = 0; this.errLines = [];
    var pc = 0, stack = [], guard = 0;
    while (pc < P.length) {
      if (++guard > 300000) { this.err('Too many commands were executed (무한 반복?). Execution stopped.'); break; }
      var L = P[pc], f = this.split(L.t), cmd = this.lab(f[0]);
      this.curLine = L.ln;
      if (opts.record !== false) this.hist.push(L.t);
      try {
        if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(L.t) && f[0].indexOf('=') > -1) { var eq = L.t.indexOf('='), nm = L.t.slice(0, eq).trim().toUpperCase(), v = this.num(L.t.slice(eq + 1)); this.params[nm] = v; if (opts.echo !== false) this.p(' PARAMETER ' + nm + ' = ' + g(v)); pc++; continue; }
        if (cmd === '*DO') {
          var pn = this.lab(f[1]), a = this.num(f[2]), b = this.num(f[3]), inc = f[4] ? this.num(f[4]) : 1, end = this.findEnd(pc, '*DO', '*ENDDO');
          if (opts.echo !== false) { this.p(''); this.p(' *DO LOOP ON PARAMETER= ' + pn + ' FROM ' + g(a) + ' TO ' + g(b) + ' BY ' + g(inc)); }
          if ((inc > 0 && a > b) || (inc < 0 && a < b) || !inc) { pc = end + 1; continue; }
          this.params[pn] = a; stack.push({ pn: pn, b: b, inc: inc, start: pc }); pc++; continue;
        }
        if (cmd === '*ENDDO') {
          var top = stack[stack.length - 1]; if (!top) throw new ApdlError('*ENDDO without a matching *DO.');
          var nv = this.params[top.pn] + top.inc;
          if ((top.inc > 0 && nv <= top.b + 1e-9) || (top.inc < 0 && nv >= top.b - 1e-9)) { this.params[top.pn] = nv; pc = top.start + 1; } else { stack.pop(); pc++; }
          continue;
        }
        if (cmd === '*IF') { pc = this.doIf(pc, f); continue; }
        if (cmd === '*ELSEIF' || cmd === '*ELSE') { pc = this.findEnd(pc, '*IF', '*ENDIF', true) + 1; continue; }
        if (cmd === '*ENDIF') { pc++; continue; }
        if (opts.echo !== false) { this.p(''); this.p(' ' + L.t.toUpperCase().replace(/\s+/g, ' ').slice(0, 120), 'c'); }
        this.run1(cmd, f);
      } catch (e) {
        if (e instanceof ApdlError) this.err(e.message);
        else { this.err('Internal error: ' + e.message + ' (연습기 오류 — 이 명령은 무시됨)'); if (typeof console !== 'undefined') console.error(e); }
      }
      pc++;
    }
    if (stack.length) this.err('*DO loop is not closed with *ENDDO.');
    return { errors: this.nErr, errLines: this.errLines };
  };
  Engine.prototype.findEnd = function (pc, open, close, inside) {
    var depth = 0, P = this.prog;
    for (var i = pc + (inside ? 0 : 1); i < P.length; i++) { var ff = this.split(P[i].t), c = this.lab(ff[0]); if (c === open && !(open === '*IF' && this.lab(ff[4]) !== 'THEN')) depth++; if (c === close) { if (depth === 0) return i; depth--; } }
    throw new ApdlError(open + ' without a matching ' + close + '.');
  };
  Engine.prototype.doIf = function (pc, f) {
    var P = this.prog, self = this;
    function test(ff) { var a = self.num(ff[1]), op = self.lab(ff[2]), b = self.num(ff[3]), t = 1e-10; var r = { EQ: Math.abs(a - b) < t, NE: Math.abs(a - b) >= t, LT: a < b, GT: a > b, LE: a <= b, GE: a >= b, ABLT: Math.abs(a) < Math.abs(b), ABGT: Math.abs(a) > Math.abs(b) }[op]; if (r === undefined) throw new ApdlError('*IF operation ' + op + ' is not valid (EQ NE LT GT LE GE).'); return r; }
    if (this.lab(f[4]) !== 'THEN') throw new ApdlError('Only the *IF,VAL1,Oper,VAL2,THEN form is supported in this trainer.');
    var marks = [], depth = 0;
    for (var i = pc + 1; i < P.length; i++) { var ff = this.split(P[i].t), c = this.lab(ff[0]); if (c === '*IF' && this.lab(ff[4]) === 'THEN') depth++; else if (c === '*ENDIF') { if (!depth) { marks.push({ i: i, c: c }); break; } depth--; } else if (!depth && (c === '*ELSEIF' || c === '*ELSE')) marks.push({ i: i, c: c, f: ff }); }
    if (!marks.length || marks[marks.length - 1].c !== '*ENDIF') throw new ApdlError('*IF without a matching *ENDIF.');
    if (test(f)) return pc + 1;
    for (var k = 0; k < marks.length; k++) { if (marks[k].c === '*ELSEIF' && test(marks[k].f)) return marks[k].i + 1; if (marks[k].c === '*ELSE' || marks[k].c === '*ENDIF') return marks[k].i + 1; }
    return pc + 1;
  };

  var CMD = {}, ORDER = [];
  function reg(names, procs, fn) { names.split(' ').forEach(function (n) { CMD[n] = { p: procs, f: fn }; ORDER.push(n); }); }
  Engine.prototype.resolve = function (cmd) {
    if (CMD[cmd]) return { name: cmd, c: CMD[cmd] };
    if (cmd.length >= 4) for (var i = 0; i < ORDER.length; i++) if (ORDER[i].indexOf(cmd) === 0) return { name: ORDER[i], c: CMD[ORDER[i]] };
    return null;
  };
  Engine.prototype.run1 = function (cmd, f) {
    var r = this.resolve(cmd), pn = PROCNAME[this.proc];
    if (!r) throw new ApdlError(cmd + ' is not a recognized ' + pn + ' command, abbreviation, or macro.  This command will be ignored.' + (/^[*\/]?[A-Z][A-Z0-9]*$/.test(cmd) ? '' : '\n(명령이 아닌 글입니다. 메모는 ! 뒤에 쓰세요.)'));
    if (r.c.p !== 'A' && r.c.p.indexOf(this.proc) < 0) {
      var where = r.c.p.split('').map(function (x) { return x === 'P' ? '/PREP7' : x === 'S' ? '/SOLU' : x === 'O' ? '/POST1' : 'BEGIN'; }).join(', ');
      throw new ApdlError(r.name + ' is not a recognized ' + pn + ' command, abbreviation, or macro.  This command will be ignored.\n(' + r.name + ' 은 ' + where + ' 에서 쓰는 명령입니다.)');
    }
    var self = this;
    r.c.f.call(this, f, function (i, d) { return self.num(f[i], d); }, function (i) { return self.lab(f[i]); }, r.name);
    var ap = AUTOPLOT[r.name]; // ANSYS 즉시 그리기(immediate mode): 만든 것을 바로 보여줌
    if (ap === 'keep') { if (!this.plot || this.plot.kind === 'auto' || this.plot.kind === 'kp' || this.plot.kind === 'line' || this.plot.kind === 'area') this.plot = { kind: keysN(this.elems).length ? 'elem' : 'node' }; }
    else if (ap) this.plot = { kind: ap };
    this.lastCmd = r.name;
  };
  var AUTOPLOT = { N: 'node', FILL: 'node', NGEN: 'node', NMODIF: 'node', NROTAT: 'node', NDELE: 'node', E: 'elem', EN: 'elem', EGEN: 'elem', EDELE: 'elem', EMODIF: 'elem', LMESH: 'elem', AMESH: 'elem', ACLEAR: 'area', K: 'kp', L: 'line', LSYMM: 'line', NUMMRG: 'line', RECTNG: 'area', BLC4: 'area', BLC5: 'area', PCIRC: 'area', CYL4: 'area', AADD: 'area', ASBA: 'area', A: 'area', AL: 'area', ADELE: 'area', D: 'keep', F: 'keep', DK: 'keep', FK: 'keep', SFBEAM: 'keep', SFEDELE: 'keep', DDELE: 'keep', FDELE: 'keep', '/CLEAR': 'auto', RESUME: 'auto' };

  Engine.prototype.selN = function () { var s = this.nsel; return keysN(this.nodes).filter(function (n) { return !s || s[n]; }); };
  Engine.prototype.selE = function () { var s = this.esel; return keysN(this.elems).filter(function (n) { return !s || s[n]; }); };
  Engine.prototype.rng = function (f, i, set, label) {
    var a = this.lab(f[i]);
    if (a === 'ALL' || a === '') return label === 'n' ? this.selN() : label === 'e' ? this.selE() : keysN(set);
    var n1 = this.num(f[i]), n2 = f[i + 1] ? this.num(f[i + 1]) : n1, inc = f[i + 2] ? this.num(f[i + 2]) : 1, out = [];
    if (inc <= 0) inc = 1; for (var n = n1; n <= n2 + 1e-9; n += inc) out.push(Math.round(n));
    return out;
  };

  // ================= 명령 =================
  reg('/PREP7', 'A', function () { this.proc = 'P'; this.p(''); this.p(' *****  MAPDL ANALYSIS DEFINITION (PREP7)  *****'); });
  reg('/SOLU /SOLUTION', 'A', function () { this.proc = 'S'; this.p(''); this.p(' *****  MAPDL SOLUTION ROUTINE  *****'); });
  reg('/POST1', 'A', function () { this.proc = 'O'; this.p(''); this.p(' *****  MAPDL RESULTS INTERPRETATION (POST1)  *****'); if (this.result) this.p(' USE LAST SUBSTEP ON RESULT FILE  FOR LOAD CASE 0'); });
  reg('FINISH', 'A', function () { var was = this.proc; this.proc = 'B'; if (was === 'S') this.p(' FINISH SOLUTION PROCESSING'); if (was === 'O') this.p(' EXIT THE MAPDL POST1 DATABASE PROCESSOR'); this.p(''); this.p(' ***** ROUTINE COMPLETED *****  CP =         0.000'); });
  reg('/CLEAR', 'B', function () { this.clearDB(); this.p(' CLEAR MAPDL DATABASE AND RESTART'); this.p(''); this.p(' ***** MAPDL DATABASE CLEARED *****'); });
  reg('/TITLE', 'A', function (f) { this.title = f.slice(1).join(','); this.p(' TITLE='); this.p('  ' + this.title); });
  reg('/COM', 'A', function (f) { this.p(' ' + f.slice(1).join(',')); });
  reg('/PSYMB /PBC /PSF /ESHAPE /VIEW /REPLOT /AUTO /DIST /FOCUS /ANGLE /UNITS /NOPR /GOPR /SHOW /EOF KEYW /UIS /CONFIG /NERR /GRAPHICS /TRIAD /PLOPTS /RGB /COLOR /EDGE /NUMBER /WINDOW /ZOOM /BATCH /FILNAME /CWD /DEVICE', 'A', function (f, N, S, name) {
    if (name === '/ESHAPE') { this.eshape = N(1) ? 1 : 0; this.p(' ELEMENT SHAPE KEY = ' + this.eshape + (this.eshape ? '  (보·링크를 단면 모양으로 그림)' : '')); } if (name === '/VIEW') this.view = [N(2), N(3), N(4)]; if (name === '/REPLOT' && this.lastPlot) this.plot = this.lastPlot;
    if (name === '/PSYMB' && this.lab(f[1]) === 'NDIR') this.pnum.NDIR = N(2) === 1; if (name === '/PSYMB' && this.lab(f[1]) === 'ESYS') { this.pnum.ESYS = N(2) === 1; this.p(' ELEMENT COORDINATE SYSTEM SYMBOL KEY = ' + (N(2) === 1 ? 1 : 0) + '  (요소 x·y·z 축 표시)'); }
    this.p(' ' + name + (f.length > 1 ? ' ' + f.slice(1).join(',') : '') + '  (그래픽 설정)');
  });
  reg('/PNUM', 'A', function (f, N, S) { var key = S(1); this.pnum[key] = N(2) === 1; this.p(' ' + key + ' NUMBERING KEY = ' + (N(2) === 1 ? 1 : 0)); });
  reg('*AFUN', 'A', function (f, N, S) { this.afunDeg = S(1) === 'DEG'; this.p(' ANGLE UNITS FOR PARAMETRIC FUNCTIONS = ' + (this.afunDeg ? 'DEGREES' : 'RADIANS')); });
  reg('*SET', 'A', function (f, N, S) { var v = N(2); this.params[S(1)] = v; this.p(' PARAMETER ' + S(1) + ' = ' + g(v)); });
  reg('*STATUS', 'A', function (f, N, S) {
    var ks = Object.keys(this.params).sort(), self = this; if (S(1)) ks = ks.filter(function (k) { return k === S(1); });
    this.p(' PARAMETER STATUS- (' + pad(ks.length, 5) + ' PARAMETERS DEFINED)'); this.p('');
    this.p('      NAME                              VALUE                        TYPE');
    ks.forEach(function (k) { self.p(' ' + rpad(k, 33) + rpad(String(+self.params[k].toPrecision(9)), 29) + 'SCALAR'); });
  });
  reg('*GET', 'A', function (f, N, S) {
    var par = S(1), ent = S(2), num = f[3] ? N(3) : 0, it1 = S(4), c1 = S(5), v;
    if (ent === 'NODE' && it1 === 'U') v = c1 === 'SUM' ? norm(this.nodeU(num).slice(0, 3)) : this.nodeU(num)['XYZ'.indexOf(c1)];
    else if (ent === 'NODE' && it1 === 'ROT') v = this.nodeU(num)[3 + 'XYZ'.indexOf(c1)];
    else if (ent === 'NODE' && it1 === 'LOC') v = this.inActive(this.nodeXYZ(num))['XYZ'.indexOf(c1)];
    else if (ent === 'NODE' && it1 === 'RF') { var r = this.reactionN(num); v = r ? r[FLAB[c1]] || 0 : 0; }
    else if (ent === 'NODE' && it1 === 'S') { this.needRes(); var st = this.nodalStress()[num]; v = st ? st[{ X: 0, Y: 1, XY: 3, '1': 4, '2': 5, '3': 6, EQV: 8, INT: 7 }[c1]] : 0; }
    else if (ent === 'NODE' && it1 === 'COUNT') v = this.selN().length;
    else if (ent === 'NODE' && it1 === 'NUM') v = c1 === 'MIN' ? Math.min.apply(null, this.selN()) : Math.max.apply(null, this.selN().concat([0]));
    else if (ent === 'ELEM' && it1 === 'COUNT') v = this.selE().length;
    else if (ent === 'ELEM' && it1 === 'NUM') v = c1 === 'MIN' ? Math.min.apply(null, this.selE()) : Math.max.apply(null, this.selE().concat([0]));
    else if (ent === 'ELEM' && it1 === 'ETAB') { var t = this.etab[c1]; if (!t) throw new ApdlError('Element table ' + c1 + ' is not defined.'); v = t.vals[num] || 0; }
    else if (ent === 'AREA' && it1 === 'NUM') v = c1 === 'MIN' ? Math.min.apply(null, keysN(this.areas)) : maxKey(this.areas);
    else if (ent === 'AREA' && it1 === 'COUNT') v = keysN(this.areas).length;
    else if (ent === 'KP' && it1 === 'NUM') v = maxKey(this.kps);
    else if (ent === 'LINE' && it1 === 'NUM') v = maxKey(this.lines);
    else if (ent === 'ACTIVE' && it1 === 'CSYS') v = this.acs;
    else throw new ApdlError('*GET item ' + [ent, it1, c1].join(',') + ' is not supported in this trainer.');
    if (typeof v !== 'number' || isNaN(v)) throw new ApdlError('*GET could not retrieve the value (해석 결과나 번호를 확인).');
    this.params[par] = v; this.p(' *GET  ' + par + '  FROM  ' + ent + ' ' + (num || '') + '  ITEM=' + it1 + ' ' + c1 + '  VALUE= ' + g(v));
  });
  reg('SAVE', 'A', function (f) { this.saved = this.dbJSON(); var fn = (f[1] || 'file') + '.' + (f[2] || 'db'); this.p(' SAVE ALL MODEL DATA TO FILE ' + fn); this.p(' DATA BASE WRITTEN ONTO FILE ' + fn); });
  reg('RESUME', 'A', function (f) { var fn = (f[1] || 'file') + '.' + (f[2] || 'db'); if (!this.saved) throw new ApdlError('File ' + fn + ' does not exist (먼저 SAVE).'); this.dbLoad(this.saved); this.p(' RESUME ALL MODEL DATA FROM FILE ' + fn); });

  reg('ET', 'P', function (f, N, S) {
    var name = S(2), id = N(1); if (/^\d+$/.test(name)) name = { '180': 'LINK180', '188': 'BEAM188', '182': 'PLANE182', '183': 'PLANE183', '1': 'LINK1', '8': 'LINK8', '3': 'BEAM3', '42': 'PLANE42', '14': 'COMBIN14', '82': 'PLANE82' }[name] || name;
    if (!ETYPES[name]) throw new ApdlError('Element type ' + name + ' is not supported in this trainer (지원: LINK180 BEAM188 PLANE182 / LINK1 LINK8 BEAM3 PLANE42 COMBIN14).');
    var kop = new Array(19).fill(0); for (var i = 1; i <= 6; i++) kop[i] = N(2 + i);
    this.ets[id] = { name: name, kop: kop }; var t = ETYPES[name];
    this.p(''); this.p(' ELEMENT TYPE ' + pad(id, 8) + ' IS ' + rpad(name, 8) + ' ' + t.desc);
    this.p('  KEYOPT( 1- 6)=' + kop.slice(1, 7).map(function (v) { return pad(v, 7); }).join(''));
    this.p('  KEYOPT( 7-12)=' + kop.slice(7, 13).map(function (v) { return pad(v, 7); }).join(''));
    this.p(''); this.p(' CURRENT NODAL DOF SET IS  ' + this.allDofs().map(function (d) { return rpad(DOFS[d], 5); }).join(' '));
    this.p('  ' + (this.is2D() ? 'TWO' : 'THREE') + '-DIMENSIONAL MODEL');
    if (t.legacy) this.warn('Element type ' + name + ' is a legacy (archived) element. 최신 ANSYS 에서는 ' + ({ LINK1: 'LINK180', LINK8: 'LINK180', BEAM3: 'BEAM188', PLANE42: 'PLANE182', PLANE82: 'PLANE183' }[name]) + ' + SECTYPE/SECDATA 를 씁니다.');
    if (name === 'PLANE183' || name === 'PLANE82') this.note('이 연습기는 ' + name + ' 를 4절점(PLANE182 방식)으로 계산합니다.');
  });
  reg('KEYOPT', 'P', function (f, N) { var et = this.ets[N(1)]; if (!et) throw new ApdlError('Element type ' + N(1) + ' is not defined.'); et.kop[N(2)] = N(3); this.p(' ELEMENT TYPE ' + pad(N(1), 8) + ' IS ' + et.name + '  KEYOPT(' + N(2) + ')= ' + N(3)); });
  reg('R', 'P', function (f, N) { var id = N(1), v = []; for (var i = 2; i <= 7; i++) v.push(N(i)); this.reals[id] = v; this.p(' REAL CONSTANT SET ' + pad(id, 10) + '  ITEMS   1 TO   6'); this.p(v.map(function (x) { return pad(g(x), 13); }).join('')); });
  reg('RMORE', 'P', function (f, N) { var id = maxKey(this.reals), v = this.reals[id] || []; for (var i = 1; i <= 6; i++) v.push(N(i)); this.reals[id] = v; this.p(' REAL CONSTANT SET ' + pad(id, 10) + '  (RMORE)'); });
  reg('SECTYPE', 'P', function (f, N, S) {
    var type = S(2), sub = S(3) || (type === 'BEAM' ? 'RECT' : '');
    if (type !== 'BEAM' && type !== 'LINK') throw new ApdlError('Section type ' + type + ' is not supported in this trainer (BEAM, LINK).');
    this.secs[N(1)] = { type: type, sub: sub, data: [], off: 'CENT', name: f[4] || '' }; this.curSec = N(1);
    this.p(''); this.p(' SECTION ID NUMBER= ' + pad(N(1), 10)); this.p(' SECTION TYPE = ' + type); if (type === 'BEAM') this.p(' SECTION SUBTYPE = ' + sub); this.p(' SECTION NAME = ' + (f[4] || ''));
  });
  reg('SECDATA', 'P', function (f, N) {
    var s = this.secs[this.curSec]; if (!s) throw new ApdlError('No section was defined (SECDATA 앞에 SECTYPE 이 필요).');
    s.data = f.slice(1).map(function (x, i) { return x === '' ? 0 : N(i + 1); }); delete s.props;
    if (s.type === 'LINK') { this.p(' SECTION ID ' + pad(this.curSec, 6) + '  LINK   AREA = ' + g(s.data[0])); return; }
    s.props = C.secProps(s); this.secSummary(this.curSec, s);
  });
  Engine.prototype.secSummary = function (id, s) {
    var P = s.props || (s.props = C.secProps(s)), self = this;
    this.p(''); this.p(' SECTION ID NUMBER:  ' + id); this.p(' BEAM SECTION SUBTYPE: ' + s.sub); this.p(' BEAM SECTION DATA SUMMARY:');
    [['Area', P.A], ['Iyy', P.Iyy], ['Iyz', P.Iyz || 0], ['Izz', P.Izz], ['Torsion Constant', P.J], ['Centroid Y', P.cy], ['Centroid Z', P.cz]].forEach(function (r) { self.p('  ' + rpad(r[0], 20) + ' = ' + g(r[1])); });
  };
  reg('SECOFFSET', 'P', function (f, N, S) { var s = this.secs[this.curSec]; if (!s) throw new ApdlError('No section was defined (SECOFFSET 앞에 SECTYPE).'); s.off = S(1) || 'CENT'; s.offyz = [N(2), N(3)]; this.p(' SECTION ' + this.curSec + ' OFFSET LOCATION = ' + s.off + (s.off === 'USER' ? '  OFFSETY= ' + g(N(2)) + '  OFFSETZ= ' + g(N(3)) : '')); if (s.off === 'SHRC') this.noteOnce('SHRC: 연습기는 전단중심을 도심과 같은 위치로 둡니다 (대칭 단면은 정확, C형강은 근사).'); this.result = null; });
  reg('SECNUM', 'P', function (f, N) { this.att.sec = N(1, 1); this.p(' SECTION ID NUMBER =  ' + this.att.sec); });
  reg('TYPE', 'P', function (f, N) { this.att.type = N(1, 1); this.p(' ELEMENT TYPE SET TO ' + pad(this.att.type, 8)); });
  reg('MAT', 'P', function (f, N) { this.att.mat = N(1, 1); this.p(' MATERIAL NUMBER SET TO ' + pad(this.att.mat, 8)); });
  reg('REAL', 'P', function (f, N) { this.att.real = N(1, 1); this.p(' REAL CONSTANT NUMBER= ' + pad(this.att.real, 8)); });
  reg('MP', 'P', function (f, N, S) {
    var lab = S(1), id = N(2), v = N(3), ok = { EX: 1, EY: 1, EZ: 1, PRXY: 1, NUXY: 1, GXY: 1, GYZ: 1, GXZ: 1, DENS: 1, ALPX: 1 };
    if (!ok[lab]) throw new ApdlError('Material label ' + lab + ' is not valid.');
    (this.mats[id] || (this.mats[id] = {}))[lab === 'NUXY' ? 'PRXY' : lab] = v;
    this.p(' MATERIAL ' + pad(id, 10) + '     ' + rpad(lab, 4) + ' = ' + C.e7(v));
  });

  reg('CSYS', 'PSO', function (f, N) { var k = N(1); if (k === 4) this.cs[4] = { type: 0, o: this.wp.o.slice(), R: this.wp.R }; if (!this.cs[k]) throw new ApdlError('Coordinate system ' + k + ' is not defined.'); this.acs = k; this.p(' ACTIVE COORDINATE SYSTEM SET TO ' + pad(k, 4) + '  (' + CSNAME[this.cs[k].type] + ')'); });
  reg('LOCAL', 'PSO', function (f, N) {
    var k = N(1), t = N(2); if (k <= 10) throw new ApdlError('Local coordinate system number must be greater than 10.'); if (t > 2) throw new ApdlError('KCS = ' + t + ' is not supported (0, 1, 2).');
    this.cs[k] = { type: t, o: [N(3), N(4), N(5)], R: C.rot3(N(6), N(7), N(8)) }; this.acs = k;
    this.p(' LOCAL COORDINATE SYSTEM ' + pad(k, 4) + ' ORIGIN(XC,YC,ZC)= ' + [N(3), N(4), N(5)].map(function (v) { return pad(g(v), 12); }).join(' '));
    this.p('                                ANGLES(XY,YZ,ZX)= ' + [N(6), N(7), N(8)].map(function (v) { return pad(g(v), 12); }).join(' '));
    this.p(' ACTIVE COORDINATE SYSTEM SET TO ' + pad(k, 4) + '  (' + CSNAME[t] + ')');
  });
  reg('WPAVE', 'PSO', function (f, N) {
    var pts = [], self = this; [1, 4, 7].forEach(function (i) { if (i === 1 || [f[i], f[i + 1], f[i + 2]].some(function (x) { return x !== undefined && x !== ''; })) pts.push(self.toGlobal(self.acs, N(i), N(i + 1), N(i + 2))); });
    var o = [0, 0, 0]; pts.forEach(function (q) { o = add(o, scl(q, 1 / pts.length)); }); this.wp.o = o;
    this.p(' WORKING PLANE CENTER = ' + o.map(function (v) { return pad(g(v), 12); }).join(''));
  });
  reg('WPOFFS', 'PSO', function (f, N) { this.wp.o = add(this.wp.o, mv(this.wp.R, [N(1), N(2), N(3)])); this.p(' WORKING PLANE CENTER = ' + this.wp.o.map(function (v) { return pad(g(v), 12); }).join('')); });
  reg('WPROTA', 'PSO', function (f, N) { this.wp.R = mm(this.wp.R, C.rot3(N(1), N(2), N(3))); this.p(' WORKING PLANE ROTATED  THXY,THYZ,THZX= ' + [N(1), N(2), N(3)].map(g).join(' ')); });
  reg('WPCSYS', 'PSO', function (f, N) { var k = f[2] === undefined || f[2] === '' ? this.acs : N(2), cs = this.cs[k] || this.cs[0]; this.wp = { o: cs.o.slice(), R: cs.R }; this.p(' WORKING PLANE ALIGNED WITH COORDINATE SYSTEM ' + k); });

  reg('K', 'P', function (f, N) {
    var id = f[1] ? N(1) : lowestFree(this.kps), xyz = this.toGlobal(this.acs, N(2), N(3), N(4)); this.kps[id] = { x: xyz };
    this.p(' KEYPOINT ' + pad(id, 6) + '   X,Y,Z= ' + [N(2), N(3), N(4)].map(function (v) { return pad(g(v), 13); }).join('') + '  IN CSYS= ' + pad(this.acs, 3));
  });
  reg('L', 'P', function (f, N) {
    var k1 = N(1), k2 = N(2), a = this.kpXYZ(k1), b = this.kpXYZ(k2), pts = [], cs = this.acs, la = this.fromGlobal(cs, a), lb = this.fromGlobal(cs, b);
    if (this.cs[cs].type === 1) { var d = lb[1] - la[1]; if (d > 180) lb[1] -= 360; if (d < -180) lb[1] += 360; for (var i = 0; i <= 48; i++) { var t = i / 48; pts.push(this.toGlobal(cs, la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t)); } }
    else pts = [a, b];
    var id = lowestFree(this.lines); this.lines[id] = { k: [k1, k2], pts: pts, ndiv: f[3] ? N(3) : 0 };
    this.p(' LINE CONNECTING KEYPOINTS ' + pad(k1, 6) + pad(k2, 6) + (this.cs[cs].type === 1 ? '   (CSYS ' + cs + ' → 원호)' : ''));
    this.p(' LINE NUMBER = ' + pad(id, 6));
  });
  reg('LSYMM', 'P', function (f, N, S) {
    var comp = 'XYZ'.indexOf(S(1)); if (comp < 0) throw new ApdlError('Ncomp must be X, Y or Z.');
    if (this.cs[this.acs].type !== 0) throw new ApdlError('LSYMM requires a Cartesian active coordinate system (활성 좌표계를 직교로).');
    var ids = this.rng(f, 2, this.lines), self = this, cs = this.acs, made = [];
    var mir = function (gp) { var l = self.fromGlobal(cs, gp); l[comp] = -l[comp]; return self.toGlobal(cs, l[0], l[1], l[2]); };
    ids.forEach(function (id) { var Ln = self.lines[id]; if (!Ln) return; var ks = Ln.k.map(function (k) { var nk = lowestFree(self.kps); self.kps[nk] = { x: mir(self.kps[k].x) }; return nk; }); var nl = lowestFree(self.lines); self.lines[nl] = { k: ks, pts: Ln.pts.map(mir), ndiv: Ln.ndiv, att: Ln.att }; made.push(nl); });
    this.p(' REFLECT LINES ' + ids.join(' ') + '  IN THE ' + S(1) + ' DIRECTION OF CSYS= ' + cs); this.p(' NEW LINES = ' + made.join(' '));
  });
  reg('NUMMRG', 'P', function (f, N, S) {
    var what = S(1) || 'ALL', self = this, merged = 0;
    if (what === 'KP' || what === 'ALL') {
      var ids = keysN(this.kps), map = {};
      ids.forEach(function (k, i) { for (var j = 0; j < i; j++) { var o = ids[j]; if (!map[o] && norm(sub(self.kps[k].x, self.kps[o].x)) < 1e-4) { map[k] = o; merged++; break; } } });
      for (var k in map) delete this.kps[k];
      for (var l in this.lines) this.lines[l].k = this.lines[l].k.map(function (x) { return map[x] || x; });
    }
    if (what === 'NODE' || what === 'ALL') {
      var ns = keysN(this.nodes), nm = {};
      ns.forEach(function (n, i) { for (var j = 0; j < i; j++) { var o = ns[j]; if (!nm[o] && norm(sub(self.nodes[n].x, self.nodes[o].x)) < 1e-4) { nm[n] = o; merged++; break; } } });
      for (var n in nm) delete this.nodes[n];
      for (var e in this.elems) this.elems[e].n = this.elems[e].n.map(function (x) { return nm[x] || x; });
    }
    this.p(' MERGE COINCIDENT ' + what + ' ITEMS.   ' + merged + ' ITEMS MERGED');
  });
  reg('LATT', 'P', function (f, N) { if (f[4] && !f[5]) this.note('LATT 의 4번째 칸은 쓰이지 않는 자리(--)라서 ' + f[4] + ' 은(는) 무시됩니다. 방향 키포인트 KB 는 5번째 칸: latt,,,,,' + f[4] + ' (쉼표 5개)'); var att = { mat: N(1, 1), real: N(2, 1), type: N(3, 1), kb: f[5] ? N(5) : 0, sec: N(7, 1) }; for (var l in this.lines) if (!this.lines[l].meshed) this.lines[l].att = att; this.p(' ASSOCIATE ATTRIBUTES WITH SELECTED LINES:  MAT=' + att.mat + '  REAL=' + att.real + '  TYPE=' + att.type + '  KB=' + att.kb + '  SECNUM=' + att.sec); });
  reg('ESIZE', 'P', function (f, N) { this.esz = { size: N(1), ndiv: N(2) }; if (N(1)) this.p(' DEFAULT ELEMENT SIZE ON LINES= ' + g(N(1))); else this.p(' DEFAULT ELEMENT DIVISIONS PER LINE= ' + pad(N(2), 6)); });
  reg('LESIZE', 'P', function (f, N, S) { var ids = S(1) === 'ALL' ? keysN(this.lines) : [N(1)], self = this; ids.forEach(function (l) { var Ln = self.lines[l]; if (!Ln) throw new ApdlError('Line ' + l + ' is not defined.'); Ln.size = N(2); Ln.ndiv = N(4); }); this.p(' SPECIFIED DIVISIONS FOR LINES ' + ids.join(' ') + ':  SIZE=' + g(N(2)) + '  NDIV=' + N(4)); });
  reg('MSHAPE MSHKEY MOPT SMRTSIZE AESIZE', 'P', function (f, N, S, name) { this.p(' ' + name + ' ' + f.slice(1).join(',') + '   (연습기: 면 메쉬는 삼각형 자유 메쉬로 처리)'); });
  reg('LMESH', 'P', function (f, N, S) {
    var ids = S(1) === 'ALL' ? keysN(this.lines) : this.rng(f, 1, this.lines), self = this, cnt = 0, kset = {};
    // ANSYS 처럼 키포인트 노드를 먼저 (키포인트 번호 순서로) 만들고, 선 안쪽 노드는 그 다음
    ids.forEach(function (id) { var Ln = self.lines[id]; if (Ln && !Ln.meshed) Ln.k.forEach(function (k) { kset[k] = 1; }); });
    keysN(kset).forEach(function (k) { if (!(self.kpNode[k] && self.nodes[self.kpNode[k]])) { var nn = maxKey(self.nodes) + 1; self.addNode(nn, self.kps[k].x.slice()); self.kpNode[k] = nn; } });
    ids.forEach(function (id) {
      var Ln = self.lines[id]; if (!Ln) throw new ApdlError('Line ' + id + ' is not defined.'); if (Ln.meshed) return;
      var len = 0, seg = [0]; for (var i = 1; i < Ln.pts.length; i++) { len += norm(sub(Ln.pts[i], Ln.pts[i - 1])); seg.push(len); }
      var nd = Ln.ndiv || (Ln.size ? Math.max(1, Math.round(len / Ln.size)) : 0) || self.esz.ndiv || (self.esz.size ? Math.max(1, Math.round(len / self.esz.size)) : 0);
      if (!nd) { var turn = 0, P = Ln.pts; for (var q = 1; q < P.length - 1; q++) { var d1 = C.sub(P[q], P[q - 1]), d2 = C.sub(P[q + 1], P[q]), cs = C.dot(d1, d2) / (Math.hypot(d1[0], d1[1], d1[2]) * Math.hypot(d2[0], d2[1], d2[2]) || 1); turn += Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI; } nd = Math.min(15, Math.max(3, Math.ceil(turn / 15 - 1e-9))); self.noteOnce('No element size was specified (ESIZE 없음) — default DESIZE is used: at least 3 elements per line (MINL=3), 15° per element on arcs (ANGL), at most 15 (MXEL).'); }
      var at = function (s) { for (var i = 1; i < seg.length; i++) if (s <= seg[i] + 1e-12) { var t = (s - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1); return add(Ln.pts[i - 1], scl(sub(Ln.pts[i], Ln.pts[i - 1]), t)); } return Ln.pts[Ln.pts.length - 1]; };
      var kn = function (k) { if (self.kpNode[k] && self.nodes[self.kpNode[k]]) return self.kpNode[k]; var nn = maxKey(self.nodes) + 1; self.addNode(nn, self.kps[k].x.slice()); self.kpNode[k] = nn; return nn; };
      var list = [kn(Ln.k[0])]; for (var j = 1; j < nd; j++) { var nn = maxKey(self.nodes) + 1; self.addNode(nn, at(len * j / nd)); list.push(nn); } list.push(kn(Ln.k[1]));
      var a = Ln.att, sv = { type: self.att.type, mat: self.att.mat, real: self.att.real, sec: self.att.sec }; if (a) { self.att.type = a.type; self.att.mat = a.mat; self.att.real = a.real; self.att.sec = a.sec; }
      for (var q = 0; q < nd; q++) self.addElem(maxKey(self.elems) + 1, [list[q], list[q + 1]], a && a.kb ? { k: self.kpXYZ(a.kb).slice() } : null);
      self.att = sv; Ln.meshed = true; cnt++;
    });
    this.p(' GENERATE NODES AND ELEMENTS   IN  ALL  SELECTED LINES'); this.p(''); this.p(' NUMBER OF LINES MESHED   = ' + pad(cnt, 9)); this.p(' MAXIMUM NODE NUMBER      = ' + pad(maxKey(this.nodes), 9)); this.p(' MAXIMUM ELEMENT NUMBER   = ' + pad(maxKey(this.elems), 9));
  });
  reg('LCLEAR', 'P', function () { this.p(' LCLEAR  (연습기: 건너뜀)'); });

  Engine.prototype.PB = function () { var pb = typeof PolyBool !== 'undefined' ? PolyBool : root.PolyBool; if (!pb) throw new ApdlError('Area Boolean library could not be loaded (인터넷 연결 확인).'); return pb; };
  Engine.prototype.newArea = function (regions) { var id = lowestFree(this.areas); this.areas[id] = { regions: regions }; return id; };
  Engine.prototype.wpPoly = function (pts) { var self = this; return pts.map(function (q) { var p3 = self.wpG(q[0], q[1]); return [p3[0], p3[1]]; }); };
  Engine.prototype.areaField = function (fld, except) { var a = this.lab(fld); if (a === 'ALL') return keysN(this.areas).filter(function (n) { return except.indexOf(n) < 0; }); var n = this.num(fld); if (!this.areas[n]) throw new ApdlError('Area ' + n + ' is not defined (APLOT 과 /PNUM,AREA,1 로 면 번호 확인).'); return [n]; };
  reg('RECTNG', 'P', function (f, N) { var x1 = N(1), x2 = N(2), y1 = N(3), y2 = N(4), id = this.newArea([this.wpPoly([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])]); this.p(' CREATE A RECTANGULAR AREA WITH'); this.p('    X-DISTANCES FROM ' + pad(g(x1), 12) + ' TO ' + pad(g(x2), 12)); this.p('    Y-DISTANCES FROM ' + pad(g(y1), 12) + ' TO ' + pad(g(y2), 12)); this.p('    ON THE WORKING PLANE'); this.p(''); this.p(' OUTPUT AREA = ' + pad(id, 9)); });
  reg('BLC4', 'P', function (f, N) { var x = N(1), y = N(2), w = N(3), h = N(4), id = this.newArea([this.wpPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])]); this.p(' CREATE A RECTANGULAR AREA (BLC4)'); this.p(' OUTPUT AREA = ' + pad(id, 9)); });
  reg('BLC5', 'P', function (f, N) { var x = N(1), y = N(2), w = N(3) / 2, h = N(4) / 2, id = this.newArea([this.wpPoly([[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]])]); this.p(' CREATE A RECTANGULAR AREA (BLC5)'); this.p(' OUTPUT AREA = ' + pad(id, 9)); });
  reg('PCIRC', 'P', function (f, N) { var t1 = f[3] ? N(3) : 0, t2 = f[4] ? N(4) : 360, id = this.circ(N(1), N(2), t1, t2); this.p(' CREATE A CIRCULAR AREA WITH'); this.p('    RADIUS1 = ' + g(N(1)) + '   RADIUS2 = ' + g(N(2))); this.p('    THETA1  = ' + g(t1) + '   THETA2  = ' + g(t2)); this.p('    ON THE WORKING PLANE'); this.p(''); this.p(' OUTPUT AREA = ' + pad(id, 9)); });
  reg('CYL4', 'P', function (f, N) { var sv = this.wp.o; this.wp.o = this.wpG(N(1), N(2)); var id = this.circ(N(3), N(5), f[4] ? N(4) : 0, f[6] ? N(6) : 360); this.wp.o = sv; this.p(' CREATE A CIRCULAR AREA (CYL4)'); this.p(' OUTPUT AREA = ' + pad(id, 9)); });
  Engine.prototype.circ = function (r1, r2, t1, t2) {
    r1 = Math.abs(r1); r2 = Math.abs(r2); var ri = Math.min(r1, r2), ro = Math.max(r1, r2); if (!ro) throw new ApdlError('Radius must be greater than zero.'); if (ri === ro) ri = 0;
    var a = Math.min(t1, t2), b = Math.max(t1, t2); if (b - a > 360) b = a + 360;
    var n = Math.max(8, Math.ceil((b - a) / 3)), out = [], inn = [], i;
    for (i = 0; i <= n; i++) { var t = (a + (b - a) * i / n) * DEG; out.push([ro * Math.cos(t), ro * Math.sin(t)]); if (ri) inn.push([ri * Math.cos(t), ri * Math.sin(t)]); }
    var full = Math.abs(b - a - 360) < 1e-9, regions;
    if (full) { out.pop(); inn.pop(); regions = ri ? [this.wpPoly(out), this.wpPoly(inn.reverse())] : [this.wpPoly(out)]; }
    else if (ri) regions = [this.wpPoly(out.concat(inn.reverse()))];
    else { out.push([0, 0]); regions = [this.wpPoly(out)]; }
    return this.newArea(regions);
  };
  reg('AADD', 'P', function (f) {
    var ids = []; for (var k = 1; k < f.length; k++) if (f[k] !== '') ids = ids.concat(this.areaField(f[k], ids)); if (ids.length < 2) throw new ApdlError('At least 2 areas are needed for AADD.');
    var PB = this.PB(), self = this, r = { regions: this.areas[ids[0]].regions, inverted: false };
    for (var i = 1; i < ids.length; i++) r = PB.union(r, { regions: this.areas[ids[i]].regions, inverted: false });
    var id = this.newArea(r.regions); ids.forEach(function (x) { delete self.areas[x]; });
    this.p(' ADD AREAS'); this.p(' ' + ids.map(function (x) { return pad(x, 6); }).join('')); this.p(''); this.p(' OUTPUT AREA = ' + pad(id, 9));
  });
  reg('ASBA', 'P', function (f, N, S) {
    var a1 = this.areaField(f[1], []), a2 = this.areaField(f[2], a1), PB = this.PB(), self = this, cut = null, made = [];
    a2.forEach(function (k) { var p = { regions: self.areas[k].regions, inverted: false }; cut = cut ? PB.union(cut, p) : p; });
    a1.forEach(function (k) { var r = cut ? PB.difference({ regions: self.areas[k].regions, inverted: false }, cut) : { regions: self.areas[k].regions }; if (r.regions.length) { var id = lowestFree(self.areas); self.areas[id] = { regions: r.regions }; made.push(id); } });
    if (S(4) !== 'KEEP') a1.forEach(function (k) { if (made.indexOf(k) < 0) delete self.areas[k]; });
    if (S(5) !== 'KEEP') a2.forEach(function (k) { if (made.indexOf(k) < 0) delete self.areas[k]; });
    this.p(' SUBTRACT AREAS'); this.p(' BASE AREAS   = ' + a1.join(' ')); this.p(' SUBTRACTED   = ' + a2.join(' ')); this.p(''); this.p(' OUTPUT AREA' + (made.length > 1 ? 'S' : '') + ' = ' + made.join(' '));
    if (!made.length) this.warn('The subtraction removed the whole area (면이 모두 사라짐).');
  });
  reg('ADELE', 'P', function (f) { var self = this, ids = this.areaField(f[1], []); ids.forEach(function (k) { delete self.areas[k]; }); this.p(' DELETE AREAS ' + ids.join(' ')); });
  reg('AMESH', 'P', function (f, N, S) {
    var et = this.ets[this.att.type]; if (!et || ETYPES[et.name].kind !== 'plane') throw new ApdlError('AMESH needs a 2-D solid element type as the current TYPE (ET,1,PLANE182).');
    var ids = !f[1] || S(1) === 'ALL' ? keysN(this.areas) : this.areaField(f[1], []), self = this;
    ids.forEach(function (id) {
      var A = self.areas[id]; if (!A) throw new ApdlError('Area ' + id + ' is not defined.'); if (A.meshed) return;
      var xs = [], ys = []; A.regions.forEach(function (r) { r.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
      var size = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
      var h = self.esz.size || (self.esz.ndiv ? size / (self.esz.ndiv * 2) : size / 12);
      if (!self.esz.size) self.noteOnce('No element size was specified (ESIZE 없음). Default size ' + g(h) + ' is used.');
      var M = C.meshArea(A.regions, h), map = [];
      M.pts.forEach(function (q) { var nn = maxKey(self.nodes) + 1; self.addNode(nn, [q[0], q[1], 0]); map.push(nn); });
      M.tris.forEach(function (t) { self.addElem(maxKey(self.elems) + 1, [map[t[0]], map[t[1]], map[t[2]], map[t[2]]]); });
      A.meshed = true;
    });
    this.p(' GENERATE NODES AND ELEMENTS   IN  ALL  SELECTED AREAS'); this.p('    ** AREA MESHING: FREE TRIANGLES (연습기) **'); this.p(''); this.p(' NUMBER OF AREAS MESHED   = ' + pad(ids.length, 9)); this.p(' MAXIMUM NODE NUMBER      = ' + pad(maxKey(this.nodes), 9)); this.p(' MAXIMUM ELEMENT NUMBER   = ' + pad(maxKey(this.elems), 9));
  });
  reg('ACLEAR', 'P', function () { var self = this; Object.keys(this.elems).forEach(function (e) { if (ETYPES[self.ets[self.elems[e].type].name].kind === 'plane') delete self.elems[e]; }); for (var a in this.areas) delete this.areas[a].meshed; this.result = null; this.p(' CLEAR AREA MESH'); });
  reg('A', 'P', function (f, N) {
    var ks = []; for (var i = 1; i < f.length; i++) if (f[i] !== '') ks.push(N(i)); if (ks.length < 3) throw new ApdlError('A needs at least 3 keypoints.');
    var self = this, ring = ks.map(function (k) { var x = self.kpXYZ(k); return [x[0], x[1]]; }), id = this.newArea([ring]);
    this.p(' AREA DEFINED BY KEYPOINTS ' + ks.join(' ')); this.p(' OUTPUT AREA = ' + pad(id, 9));
  });
  reg('AL', 'P', function (f, N, S) {
    var self = this, ids = S(1) === 'ALL' ? keysN(this.lines) : []; if (!ids.length) for (var i = 1; i < f.length; i++) if (f[i] !== '') ids.push(N(i));
    if (ids.length < 2) throw new ApdlError('AL needs a closed loop of lines.');
    var segs = ids.map(function (l) { var L = self.lines[l]; if (!L) throw new ApdlError('Line ' + l + ' is not defined.'); return { k: L.k.slice(), pts: L.pts.map(function (p) { return [p[0], p[1]]; }) }; });
    var ring = segs[0].pts.slice(), endK = segs[0].k[1], startK = segs[0].k[0], used = [0];
    while (used.length < segs.length) {
      var found = -1; for (var j = 0; j < segs.length; j++) if (used.indexOf(j) < 0 && (segs[j].k[0] === endK || segs[j].k[1] === endK)) { found = j; break; }
      if (found < 0) throw new ApdlError('Lines ' + ids.join(',') + ' do not form a closed loop (선이 닫힌 경계를 이루지 않음).');
      var sg = segs[found], pts = sg.k[0] === endK ? sg.pts : sg.pts.slice().reverse(); ring = ring.concat(pts.slice(1)); endK = sg.k[0] === endK ? sg.k[1] : sg.k[0]; used.push(found);
    }
    if (endK !== startK) throw new ApdlError('Lines ' + ids.join(',') + ' do not form a closed loop.');
    ring.pop(); var id = this.newArea([ring]); this.p(' AREA DEFINED BY LINES ' + ids.join(' ')); this.p(' OUTPUT AREA = ' + pad(id, 9));
  });
  reg('AOVLAP AGLUE APTN ARSYM AGEN V BLOCK KGEN LGEN LFILLT DL SFL SFA DA VMESH', 'P', function (f, N, S, name) { throw new ApdlError(name + ' is a valid ANSYS command but is not supported in this trainer (연습기 미지원).'); });

  Engine.prototype.addNode = function (id, x, T) { this.nodes[id] = { x: x, T: T || null }; this.lastNodes.push(id); if (this.lastNodes.length > 2) this.lastNodes.shift(); this.result = null; };
  Engine.prototype.addElem = function (id, ns, extra) {
    var et = this.ets[this.att.type]; if (!et) throw new ApdlError('Element type ' + this.att.type + ' is not defined (ET 먼저, 또는 TYPE 확인).');
    ns.forEach(function (n) { if (!this.nodes[n]) throw new ApdlError('Node ' + n + ' is not defined (요소에 쓰인 노드가 없음).'); }, this);
    var kind = ETYPES[et.name].kind, e = { n: ns, type: this.att.type, mat: this.att.mat, real: this.att.real, sec: this.att.sec, k: null };
    if (kind === 'beam' && ns.length >= 3) { e.k = this.nodes[ns[2]].x.slice(); e.kn = ns[2]; e.n = ns.slice(0, 2); }
    else if (kind !== 'plane' && ns.length > 2) e.n = ns.slice(0, 2);
    if (kind === 'plane' && ns.length < 3) throw new ApdlError('A 2-D solid element needs at least 3 nodes.');
    if (kind !== 'plane' && ns.length < 2) throw new ApdlError('A line element needs 2 nodes (I, J).');
    if (extra) for (var k in extra) e[k] = extra[k];
    this.elems[id] = e; this.result = null; return id;
  };
  reg('N', 'P', function (f, N) {
    var id = f[1] ? N(1) : maxKey(this.nodes) + 1, xyz = this.toGlobal(this.acs, N(2), N(3), N(4)), T = null;
    if (N(5) || N(6) || N(7)) T = mm(this.axesAt(this.acs, xyz), C.rot3(N(5), N(6), N(7)));
    this.addNode(id, xyz, T);
    this.p(' NODE ' + pad(id, 9) + '  KCS= ' + pad(this.acs, 6) + '  X,Y,Z= ' + [N(2), N(3), N(4)].map(function (v) { return pad(g(v), 13); }).join(''));
  });
  reg('E', 'P', function (f, N) { var ns = []; for (var i = 1; i < f.length; i++) if (f[i] !== '') ns.push(N(i)); var id = this.addElem(maxKey(this.elems) + 1, ns); this.p(' ELEMENT ' + pad(id, 9) + ns.map(function (n) { return pad(n, 10); }).join('')); });
  reg('EN', 'P', function (f, N) { var ns = []; for (var i = 2; i < f.length; i++) if (f[i] !== '') ns.push(N(i)); var id = this.addElem(N(1), ns); this.p(' ELEMENT ' + pad(id, 9) + ns.map(function (n) { return pad(n, 10); }).join('')); });
  reg('FILL', 'P', function (f, N) {
    var n1 = f[1] ? N(1) : this.lastNodes[0], n2 = f[2] ? N(2) : this.lastNodes[1];
    if (!this.nodes[n1] || !this.nodes[n2]) throw new ApdlError('FILL: nodes ' + n1 + ' and ' + n2 + ' must be defined.');
    var nf = f[3] ? N(3) : n2 - n1 - 1, ninc = f[5] ? N(5) : (n2 - n1) / (nf + 1), ns = f[4] ? N(4) : n1 + ninc;
    var a = this.inActive(this.nodes[n1].x), b = this.inActive(this.nodes[n2].x);
    if (this.cs[this.acs].type === 1) { var d = b[1] - a[1]; if (d > 180) b[1] -= 360; if (d < -180) b[1] += 360; }
    for (var i = 1; i <= nf; i++) { var t = i / (nf + 1); this.nodes[Math.round(ns + (i - 1) * ninc)] = { x: this.toGlobal(this.acs, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t), T: null }; }
    this.result = null;
    this.p(' FILL ' + pad(nf, 6) + ' POINTS BETWEEN NODE ' + pad(n1, 8) + ' AND NODE ' + pad(n2, 8)); this.p('     START WITH NODE ' + pad(Math.round(ns), 8) + ' AND INCREMENT BY ' + pad(Math.round(ninc), 8));
  });
  reg('NGEN', 'P', function (f, N, S) {
    var it = N(1), inc = N(2), ids = S(3) === 'ALL' ? this.selN() : this.rng(f, 3, this.nodes), d = [N(6), N(7), N(8)], self = this;
    if (it < 2) throw new ApdlError('ITIME must be at least 2 (원본을 포함한 총 개수).');
    ids.forEach(function (n) { var nd = self.nodes[n]; if (!nd) return; var l = self.inActive(nd.x); for (var i = 1; i < it; i++) self.nodes[n + i * inc] = { x: self.toGlobal(self.acs, l[0] + d[0] * i, l[1] + d[1] * i, l[2] + d[2] * i), T: nd.T }; });
    this.result = null;
    this.p(' GENERATE ' + pad(it - 1, 4) + ' ADDITIONAL SETS OF NODES FROM SET BEGINNING WITH NODE ' + ids[0]); this.p(' TO ' + ids[ids.length - 1] + '   NODE NUMBER INCREMENT = ' + inc); this.p(' GEOMETRY INCREMENTS = ' + d.map(function (v) { return pad(g(v), 12); }).join('') + '  IN CSYS= ' + this.acs);
  });
  reg('EGEN', 'P', function (f, N, S) {
    var it = N(1), ninc = N(2), ids = !f[3] ? [maxKey(this.elems)] : S(3) === 'ALL' ? this.selE() : this.rng(f, 3, this.elems), self = this;
    for (var i = 1; i < it; i++) ids.forEach(function (e) {
      var s = self.elems[e]; if (!s) throw new ApdlError('Element ' + e + ' is not defined.');
      var ns = s.n.map(function (n) { return n + i * ninc; }); ns.forEach(function (n) { if (!self.nodes[n]) throw new ApdlError('EGEN: node ' + n + ' is not defined (먼저 NGEN 등으로 노드를 만드세요).'); });
      self.elems[maxKey(self.elems) + 1] = { n: ns, type: s.type + N(7) * i, mat: s.mat + N(6) * i, real: s.real + N(8) * i, sec: s.sec + N(10) * i, k: s.k };
    });
    this.result = null;
    this.p(' GENERATE ' + pad(it, 4) + ' TOTAL SETS OF ELEMENTS WITH NODE INCREMENT OF ' + pad(ninc, 6)); this.p('   SET IS ELEMENTS ' + ids.join(' ')); this.p(''); this.p(' MAXIMUM ELEMENT NUMBER = ' + pad(maxKey(this.elems), 9));
  });
  reg('NMODIF', 'P', function (f, N) {
    var n = N(1), nd = this.nodes[n]; if (!nd) throw new ApdlError('Node ' + n + ' is not defined.');
    var l = this.inActive(nd.x); for (var i = 0; i < 3; i++) if (f[2 + i] !== undefined && f[2 + i] !== '') l[i] = N(2 + i);
    nd.x = this.toGlobal(this.acs, l[0], l[1], l[2]);
    if (f[5] || f[6] || f[7]) nd.T = mm(this.axesAt(this.acs, nd.x), C.rot3(N(5), N(6), N(7)));
    this.result = null;
    this.p(' MODIFY NODE ' + pad(n, 8) + '  KCS= ' + this.acs + '  X,Y,Z= ' + l.map(function (v) { return pad(g(v), 12); }).join('') + (nd.T ? '   THXY,THYZ,THZX= ' + [N(5), N(6), N(7)].map(g).join(' ') : ''));
  });
  reg('NROTAT', 'P', function (f) { var self = this, ids = this.rng(f, 1, this.nodes, 'n'); ids.forEach(function (n) { var nd = self.nodes[n]; if (!nd) throw new ApdlError('Node ' + n + ' is not defined.'); nd.T = self.axesAt(self.acs, nd.x); }); this.result = null; this.p(' ROTATE NODAL COORDINATE SYSTEMS OF NODES ' + ids.join(' ') + '  INTO ACTIVE SYSTEM ' + this.acs); });
  reg('NDELE', 'P', function (f) { var self = this, ids = this.rng(f, 1, this.nodes, 'n'); ids.forEach(function (n) { delete self.nodes[n]; }); this.p(' DELETE NODES ' + ids.join(' ')); });
  reg('EDELE', 'P', function (f) { var self = this, ids = this.rng(f, 1, this.elems, 'e'); ids.forEach(function (n) { delete self.elems[n]; }); this.result = null; this.p(' DELETE ELEMENTS ' + ids.join(' ')); });
  reg('EMODIF', 'P', function (f, N, S) { var self = this, what = S(2), v = N(3), ids = S(1) === 'ALL' ? this.selE() : [N(1)]; ids.forEach(function (e) { var el = self.elems[e]; if (!el) return; if (what === 'MAT') el.mat = v; else if (what === 'TYPE') el.type = v; else if (what === 'SECNUM' || what === 'SEC') el.sec = v; else if (what === 'REAL') el.real = v; }); this.result = null; this.p(' MODIFY ELEMENTS ' + ids.join(' ') + '   ' + what + '= ' + v); });

  reg('NSEL', 'PSO', function (f, N, S) { this.select('n', f, N, S); });
  reg('ESEL', 'PSO', function (f, N, S) { this.select('e', f, N, S); });
  reg('ALLSEL', 'PSO', function () { this.nsel = null; this.esel = null; this.p(' ALL SELECT   FOR ITEM=ALL'); this.p('  ' + keysN(this.nodes).length + ' NODES, ' + keysN(this.elems).length + ' ELEMENTS SELECTED'); });
  Engine.prototype.select = function (w, f, N, S) {
    var set = w === 'n' ? this.nodes : this.elems, cur = w === 'n' ? this.nsel : this.esel, type = S(1), item = S(2), self = this, all = keysN(set);
    var curIds = all.filter(function (k) { return !cur || cur[k]; }), res = {};
    if (type === 'ALL') { if (w === 'n') this.nsel = null; else this.esel = null; this.p(' SELECT ALL ' + (w === 'n' ? 'NODES' : 'ELEMENTS')); return; }
    if (type === 'NONE') { if (w === 'n') this.nsel = {}; else this.esel = {}; this.p(' UNSELECT ALL'); return; }
    var lo = f[4] !== undefined && f[4] !== '' ? N(4) : null, hi = f[5] !== undefined && f[5] !== '' ? N(5) : lo, span = Math.abs(hi - lo), tol = 1e-5 * (span || Math.abs(lo || 1) || 1);
    if (lo === null) throw new ApdlError('VMIN is missing (예: nsel,s,loc,x,0).');
    var val = function (k) {
      if (item === 'NODE' || item === 'ELEM' || item === '') return k;
      if (item === 'LOC') { if (w === 'n') return self.inActive(self.nodes[k].x)['XYZ'.indexOf(S(3))]; var c = [0, 0, 0]; set[k].n.forEach(function (n) { c = add(c, scl(self.nodes[n].x, 1 / set[k].n.length)); }); return self.inActive(c)['XYZ'.indexOf(S(3))]; }
      if (item === 'TYPE') return set[k].type; if (item === 'MAT') return set[k].mat; if (item === 'SEC' || item === 'SECN') return set[k].sec; if (item === 'REAL') return set[k].real;
      throw new ApdlError((w === 'n' ? 'NSEL' : 'ESEL') + ' item ' + item + ' is not supported in this trainer.');
    };
    var test = function (k) { var v = val(k); return v >= lo - tol && v <= hi + tol; };
    if (type === 'S') all.filter(test).forEach(function (k) { res[k] = 1; });
    else if (type === 'R') curIds.filter(test).forEach(function (k) { res[k] = 1; });
    else if (type === 'A') { curIds.forEach(function (k) { res[k] = 1; }); all.filter(test).forEach(function (k) { res[k] = 1; }); }
    else if (type === 'U') curIds.filter(function (k) { return !test(k); }).forEach(function (k) { res[k] = 1; });
    else if (type === 'INVE') all.filter(function (k) { return curIds.indexOf(k) < 0; }).forEach(function (k) { res[k] = 1; });
    else throw new ApdlError('Selection type ' + type + ' is not valid (S R A U ALL NONE INVE).');
    if (w === 'n') this.nsel = res; else this.esel = res;
    this.p(' SELECT FOR ITEM=' + (item || (w === 'n' ? 'NODE' : 'ELEM')) + (S(3) ? ' COMPONENT=' + S(3) : '') + '  BETWEEN ' + g(lo) + ' AND ' + g(hi));
    this.p('  ' + pad(Object.keys(res).length, 9) + (w === 'n' ? ' NODES' : ' ELEMENTS') + ' (OF ' + all.length + ' DEFINED) SELECTED BY ' + (w === 'n' ? 'NSEL' : 'ESEL') + ' COMMAND.');
  };

  function dofIdx(l) { var i = DOFS.indexOf(l); if (i < 0) throw new ApdlError('Label ' + l + ' is not a valid DOF label (UX UY UZ ROTX ROTY ROTZ ALL).'); return i; }
  reg('D', 'PS', function (f, N, S) {
    var self = this, labs = [S(2)].concat([7, 8, 9, 10, 11].map(S).filter(Boolean)), v = N(3);
    if (!labs[0]) throw new ApdlError('DOF label is missing (예: d,1,ux,0).');
    var ids = S(1) === 'ALL' ? this.selN() : f[5] ? this.rng([0, f[1], f[5], f[6]], 1, this.nodes) : [N(1)];
    ids.forEach(function (n) { if (!self.nodes[n]) throw new ApdlError('Node ' + n + ' is not defined.'); var d = self.D[n] || (self.D[n] = {}); labs.forEach(function (l) { if (l === 'ALL') DOFS.forEach(function (x, i) { d[i] = v; }); else d[dofIdx(l)] = v; }); });
    this.result && (this.result.stale = 1);
    this.p(' SPECIFIED CONSTRAINT ' + rpad(labs[0], 5) + ' FOR SELECTED NODES ' + pad(ids[0], 12) + ' TO ' + pad(ids[ids.length - 1], 12) + ' BY ' + pad(ids.length > 1 ? ids[1] - ids[0] : 1, 12));
    this.p(' REAL=  ' + rpad(v.toFixed(8), 16) + ' IMAG=  0.00000000'); if (labs.length > 1) this.p(' ADDITIONAL DOFS=  ' + labs.slice(1).join('  '));
  });
  reg('DDELE', 'PS', function (f, N, S) { var self = this, ids = S(1) === 'ALL' ? keysN(this.D) : [N(1)]; ids.forEach(function (n) { if (S(2) && S(2) !== 'ALL' && self.D[n]) delete self.D[n][dofIdx(S(2))]; else delete self.D[n]; }); this.p(' DELETE SPECIFIED DOF CONSTRAINTS ' + (S(2) || 'ALL') + ' FOR NODES ' + ids.join(' ')); });
  reg('F', 'PS', function (f, N, S) {
    var self = this, l = S(2), i = FLAB[l]; if (i === undefined) throw new ApdlError('Label ' + l + ' is not a valid force label (FX FY FZ MX MY MZ).');
    var ids = S(1) === 'ALL' ? this.selN() : f[5] ? this.rng([0, f[1], f[5], f[6]], 1, this.nodes) : [N(1)], v = N(3);
    ids.forEach(function (n) { if (!self.nodes[n]) throw new ApdlError('Node ' + n + ' is not defined.'); (self.F[n] || (self.F[n] = {}))[i] = v; });
    this.p(' SPECIFIED NODAL LOAD ' + rpad(l, 4) + ' FOR SELECTED NODES ' + pad(ids[0], 12) + ' TO ' + pad(ids[ids.length - 1], 12) + ' BY ' + pad(ids.length > 1 ? ids[1] - ids[0] : 1, 12));
    this.p(' REAL=  ' + rpad(v.toFixed(8), 16) + ' IMAG=  0.00000000');
  });
  reg('FDELE', 'PS', function (f, N, S) { var self = this, ids = S(1) === 'ALL' ? keysN(this.F) : [N(1)]; ids.forEach(function (n) { if (S(2) && S(2) !== 'ALL' && self.F[n]) delete self.F[n][FLAB[S(2)]]; else delete self.F[n]; }); this.p(' DELETE SPECIFIED NODAL LOADS FOR NODES ' + ids.join(' ')); });
  reg('DK', 'PS', function (f, N, S) {
    var k = N(1), labs = [S(2)].concat([6, 7, 8, 9, 10].map(S).filter(Boolean)), v = N(3);
    if (!this.kps[k]) throw new ApdlError('Keypoint ' + k + ' is not defined.'); var d = this.DK[k] || (this.DK[k] = {});
    labs.forEach(function (l) { if (l === 'ALL') DOFS.forEach(function (x, i) { d[i] = v; }); else d[dofIdx(l)] = v; });
    this.p(' SPECIFIED CONSTRAINT ' + rpad(labs[0], 5) + ' FOR SELECTED KEYPOINTS ' + pad(k, 8)); this.p(' REAL=  ' + rpad(v.toFixed(8), 16) + ' IMAG=  0.00000000'); if (labs.length > 1) this.p(' ADDITIONAL DOFS=  ' + labs.slice(1).join('  '));
  });
  reg('FK', 'PS', function (f, N, S) { var k = N(1), i = FLAB[S(2)]; if (i === undefined) throw new ApdlError('Label ' + S(2) + ' is not a valid force label.'); if (!this.kps[k]) throw new ApdlError('Keypoint ' + k + ' is not defined.'); (this.FK[k] || (this.FK[k] = {}))[i] = N(3); this.p(' SPECIFIED KEYPOINT LOAD ' + rpad(S(2), 4) + ' AT KEYPOINT ' + pad(k, 8)); this.p(' REAL=  ' + rpad(N(3).toFixed(8), 16) + ' IMAG=  0.00000000'); });
  reg('SFBEAM', 'PS', function (f, N, S) {
    var self = this, lk = f[2] ? N(2) : 1, ids = S(1) === 'ALL' ? this.selE() : [N(1)];
    if (S(3) && S(3) !== 'PRES') throw new ApdlError('Surface load label must be PRES.');
    var vi = N(4), vj = f[5] === undefined || f[5] === '' ? vi : N(5), io = N(8), jo = f[9] === undefined || f[9] === '' ? 0 : N(9), lr = N(10), n = 0;
    ids.forEach(function (e) { var el = self.elems[e]; if (!el) throw new ApdlError('Element ' + e + ' is not defined.'); var k = ETYPES[self.ets[el.type].name].kind; if (k !== 'beam' && k !== 'beam3') return; (self.SFB[e] || (self.SFB[e] = {}))[lk] = { vi: vi, vj: vj, io: io, jo: jo, lr: lr }; n++; });
    if (!n) this.warn('No beam elements were selected for SFBEAM (보 요소가 아님).');
    this.p(' SPECIFIED SURFACE LOAD PRES FOR ELEMENTS ' + (ids.length > 1 ? ids[0] + ' TO ' + ids[ids.length - 1] : ids[0]) + '   LKEY= ' + lk); this.p(' VALI= ' + g(vi) + '   VALJ= ' + g(vj));
  });
  reg('SFEDELE SFBDELE', 'PS', function (f, N, S) { var self = this, ids = S(1) === 'ALL' ? keysN(this.SFB) : [N(1)]; ids.forEach(function (e) { if (!f[2] || S(2) === 'ALL') delete self.SFB[e]; else if (self.SFB[e]) delete self.SFB[e][N(2)]; }); this.p(' DELETE SURFACE LOADS FOR ELEMENTS ' + ids.join(' ')); });
  reg('ACEL OMEGA', 'PS', function (f, N, S, name) { this.warn(name + ' (inertia load) is not supported in this trainer and was ignored.'); });

  reg('ANTYPE', 'S', function (f, N, S) { var t = S(1) || 'STATIC'; if (t !== 'STATIC' && t !== '0') throw new ApdlError('Only a static analysis (ANTYPE,STATIC) is supported in this trainer.'); this.p(' PERFORM A STATIC ANALYSIS'); this.p('  THIS WILL BE A NEW ANALYSIS'); });
  reg('OUTRES NLGEOM TIME NSUBST AUTOTS KBC EQSLV', 'S', function (f, N, S, name) { this.p(' ' + name + ' ' + f.slice(1).join(',')); });
  reg('SOLVE', 'S', function () { this.solve(); });

  reg('SET', 'O', function () { this.needRes(); this.p(' USE LOAD STEP     1  SUBSTEP     1  FOR LOAD CASE 0'); this.p(''); this.p(' SET COMMAND GOT LOAD STEP=     1  SUBSTEP=     1  CUMULATIVE ITERATION=     1'); this.p('   TIME/FREQUENCY=  1.0000'); this.p(' TITLE= ' + this.title); });
  reg('RSYS', 'O', function (f, N) { if (N(1)) this.noteOnce('이 연습기는 결과를 항상 전역 직교(RSYS,0)로 출력합니다.'); this.p(' ACTIVE RESULTS COORDINATE SYSTEM= 0'); });

  // ================= 해석 =================
  Engine.prototype.allDofs = function () { var s = {}; for (var k in this.ets) etDofs(this.ets[k]).forEach(function (d) { s[d] = 1; }); return Object.keys(s).map(Number).sort(); };
  Engine.prototype.is2D = function () { var d = this.allDofs(); return d.length > 0 && d.indexOf(2) < 0; };
  Engine.prototype.matOf = function (e) { var m = this.mats[e.mat]; if (!m || m.EX === undefined) throw new ApdlError('Material ' + e.mat + ' (EX) is not defined (mp,ex,' + e.mat + ',값).'); var nu = m.PRXY === undefined ? 0.3 : m.PRXY; return { E: m.EX, nu: nu, G: m.GXY || m.EX / (2 * (1 + nu)) }; };
  Engine.prototype.realOf = function (e, what) { var r = this.reals[e.real]; if (!r) throw new ApdlError('Real constant set ' + e.real + ' is not defined (R,' + e.real + ',' + what + ').'); return r; };
  Engine.prototype.secOf = function (e, kind) {
    var s = this.secs[e.sec];
    if (!s) throw new ApdlError('Section ' + e.sec + ' is not defined (SECTYPE, SECDATA 가 필요).');
    if (kind === 'LINK' && s.type !== 'LINK') throw new ApdlError('LINK180 uses section ' + e.sec + ' which is not a LINK section (sectype,' + e.sec + ',link).');
    if (kind === 'BEAM' && s.type !== 'BEAM') throw new ApdlError('BEAM188 uses section ' + e.sec + ' which is not a BEAM section.');
    if (!s.data.length) throw new ApdlError('Section ' + e.sec + ' has no SECDATA.');
    return s.props || (s.props = C.secProps(s));
  };
  Engine.prototype.beamAxes = function (e) {
    var a = this.nodes[e.n[0]].x, b = this.nodes[e.n[1]].x, x = unit(sub(b, a)), z, y;
    if (e.k) { var v = sub(e.k, a); z = sub(v, scl(x, dot(v, x))); if (norm(z) < 1e-12) throw new ApdlError('Orientation node K is on the beam axis (방향 노드가 보 축 위에 있음).'); z = unit(z); y = cross(z, x); }
    else { if (Math.abs(x[2]) > 1 - 1e-9) y = [0, 1, 0]; else y = unit(cross([0, 0, 1], x)); z = cross(x, y); }
    return { x: x, y: y, z: z, L: norm(sub(b, a)) };
  };
  Engine.prototype.elemMatrix = function (eid) {
    var e = this.elems[eid], et = this.ets[e.type]; if (!et) throw new ApdlError('Element type ' + e.type + ' of element ' + eid + ' is not defined.');
    var kind = ETYPES[et.name].kind, dofs = etDofs(et), info = { name: et.name, kind: kind }, full = [], r, c;
    e.n.forEach(function (n) { if (!this.nodes[n]) throw new ApdlError('Node ' + n + ' of element ' + eid + ' is not defined.'); }, this);
    var a = this.nodes[e.n[0]].x, b = e.n[1] ? this.nodes[e.n[1]].x : null;
    if (kind === 'link' || kind === 'spring') {
      var L = norm(sub(b, a)), x = L ? scl(sub(b, a), 1 / L) : [1, 0, 0], kk, A;
      if (kind === 'link') {
        var m = this.matOf(e); if (!L) throw new ApdlError('Element ' + eid + ' has zero length.');
        if (et.name === 'LINK180') { if (this.secs[e.sec]) A = this.secOf(e, 'LINK').A; else if (this.reals[e.real]) { A = this.reals[e.real][0]; this.noteOnce('LINK180 에 단면(SECTYPE)이 없어 실상수 R 값(' + g(A) + ')을 단면적으로 사용했습니다.'); } else this.secOf(e, 'LINK'); }
        else A = this.realOf(e, 'AREA')[0];
        if (!A) throw new ApdlError('Cross-sectional area of element ' + eid + ' is zero.');
        kk = m.E * A / L; info.EA = m.E * A; info.A = A;
        if (et.name === 'LINK1' && Math.abs(x[2]) > 1e-9) throw new ApdlError('LINK1 is a 2-D element: nodes must lie in the X-Y plane.');
      } else {
        kk = this.realOf(e, 'K')[0]; info.k = kk; var k2 = et.kop[2];
        if (k2 >= 1 && k2 <= 6) { info.oneD = k2 - 1; return { ke: [[kk, -kk], [-kk, kk]], fe: null, dofs: [[e.n[0], k2 - 1], [e.n[1], k2 - 1]], info: info }; }
        if (!L) throw new ApdlError('COMBIN14 element ' + eid + ' has zero length (1-D 스프링이면 KEYOPT(2)=1~3).');
      }
      info.x = x; info.L = L;
      var k6 = []; for (r = 0; r < 6; r++) { k6.push([]); for (c = 0; c < 6; c++) k6[r].push((r < 3 === c < 3 ? 1 : -1) * kk * x[r % 3] * x[c % 3]); }
      var idx = []; e.n.slice(0, 2).forEach(function (n, j) { dofs.forEach(function (d) { full.push([n, d]); idx.push(j * 3 + d); }); });
      return { ke: idx.map(function (rr) { return idx.map(function (cc) { return k6[rr][cc]; }); }), fe: null, dofs: full, info: info };
    }
    if (kind === 'beam' || kind === 'beam3') {
      var M = this.matOf(e), ax = this.beamAxes(e), P;
      if (!ax.L) throw new ApdlError('Element ' + eid + ' has zero length.');
      if (kind === 'beam') { P = this.secOf(e, 'BEAM'); if (P.asec && !P.J) this.warnOnce('ASEC section has J = 0 (비틀림 상수 0 → 비틀림 강성 없음).'); }
      else { var rr = this.realOf(e, 'AREA,IZZ,HEIGHT'); P = { A: rr[0], Izz: rr[1], Iyy: rr[1], J: rr[1], H: rr[2], ymin: -(rr[2] || 0) / 2, ymax: (rr[2] || 0) / 2 }; if (!P.A) throw new ApdlError('BEAM3 needs real constant AREA (R,' + e.real + ',A,IZZ,HEIGHT).'); if (!P.Izz) this.warnOnce('BEAM3 real constant set ' + e.real + ' has IZZ = 0 (굽힘 강성 없음 — 축력만 받는 부재로 계산).'); if (Math.abs(ax.x[2]) > 1e-9) throw new ApdlError('BEAM3 is a 2-D element: nodes must lie in the X-Y plane.'); }
      var kl = C.beamK(M.E, M.G, P, ax.L, kind === 'beam'), Lm = [ax.x, ax.y, ax.z], Tb = [];
      for (r = 0; r < 12; r++) Tb.push(new Array(12).fill(0));
      for (var blk = 0; blk < 4; blk++) for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) Tb[blk * 3 + r][blk * 3 + c] = Lm[r][c];
      var sf = this.SFB[eid], loads = [];
      if (sf) for (var lk in sf) { var s = sf[lk], dir = kind === 'beam' ? { 1: 'z-', 2: 'y-', 3: 'x+', 4: 'xI', 5: 'xJ' }[lk] : { 1: 'y-', 2: 'x+', 3: 'xI', 4: 'xJ' }[lk]; if (dir) loads.push({ dir: dir, vi: s.vi, vj: s.vj, io: s.io, jo: s.jo, lr: s.lr }); }
      var fl = C.beamLoad(loads, ax.L), kE = kl, fE = fl, Toff = null;
      if (kind === 'beam') { // SECOFFSET: 노드 ↔ 단면 도심을 강체로 연결 (u_c = u_n − r × θ)
        var sc = this.secs[e.sec], off = sc.off || 'CENT', ry = 0, rz = 0;
        if (off === 'USER') { ry = (P.cy || 0) - (sc.offyz[0] || 0); rz = (P.cz || 0) - (sc.offyz[1] || 0); } else if (off === 'ORIGIN') { ry = P.cy || 0; rz = P.cz || 0; }
        if (Math.abs(ry) + Math.abs(rz) > 1e-12) {
          Toff = []; for (r = 0; r < 12; r++) { Toff.push(new Array(12).fill(0)); Toff[r][r] = 1; }
          [0, 6].forEach(function (o) { Toff[o + 0][o + 4] = rz; Toff[o + 0][o + 5] = -ry; Toff[o + 1][o + 3] = -rz; Toff[o + 2][o + 3] = ry; });
          kE = C.TtKT(Toff, kl); fE = C.Ttv(Toff, fl); info.Toff = Toff; info.off = [ry, rz];
        }
      }
      var K12 = C.TtKT(Tb, kE), F12 = C.Ttv(Tb, fE), id2 = [];
      e.n.slice(0, 2).forEach(function (n, j) { dofs.forEach(function (d) { full.push([n, d]); id2.push(j * 6 + d); }); });
      info.Tb = Tb; info.kl = kl; info.fl = fl; info.P = P; info.ax = ax; info.id2 = id2;
      return { ke: id2.map(function (i1) { return id2.map(function (i2) { return K12[i1][i2]; }); }), fe: id2.map(function (i1) { return F12[i1]; }), dofs: full, info: info };
    }
    if (kind === 'plane') {
      var Mp = this.matOf(e), ns = e.n.slice(0, 4), tri = ns.length === 3 || ns[2] === ns[3];
      if (tri) ns = ns.slice(0, 3);
      var self = this, X = ns.map(function (n) { var p = self.nodes[n].x; if (Math.abs(p[2]) > 1e-9) throw new ApdlError('2-D solid elements must lie in the X-Y plane (Z = 0).'); return [p[0], p[1]]; });
      var k3 = et.kop[3], t = 1; if (k3 === 3) { t = (this.reals[e.real] || [0])[0]; if (!t) throw new ApdlError('Plane stress with thickness (KEYOPT(3)=3) needs THK in real constants (R,' + e.real + ',THK).'); }
      if (k3 === 1) this.warnOnce('Axisymmetric option (KEYOPT(3)=1) is not supported in this trainer; plane stress is used.');
      var D = C.Dmat(Mp.E, Mp.nu, k3 === 2);
      ns.forEach(function (n) { full.push([n, 0]); full.push([n, 1]); });
      info.X = X; info.D = D; info.ns = ns; info.t = t;
      return { ke: C.planeK(X, D, t), fe: null, dofs: full, info: info };
    }
  };
  Engine.prototype.solve = function () {
    var self = this, ids = keysN(this.elems), r, c, i, j, n, k;
    this.p(''); this.p(' *****  MAPDL SOLVE    COMMAND  *****');
    if (!ids.length) throw new ApdlError('There are no elements defined (요소가 없음). The solution cannot proceed.');
    if (!this.title) this.note('There is no title defined for this analysis.');
    var kpN = function (kk) { var nn = self.kpNode[kk]; if (nn && self.nodes[nn]) return nn; var b = self.nearest(self.nodes, self.kps[kk].x); if (b && norm(sub(self.nodes[b].x, self.kps[kk].x)) < 1e-6) return b; throw new ApdlError('Keypoint ' + kk + ' has no node (LMESH 먼저) — DK/FK cannot be transferred.'); };
    var D = JSON.parse(JSON.stringify(this.D)), F = JSON.parse(JSON.stringify(this.F));
    for (k in this.DK) { n = kpN(k); D[n] = D[n] || {}; for (i in this.DK[k]) D[n][i] = this.DK[k][i]; }
    for (k in this.FK) { n = kpN(k); F[n] = F[n] || {}; for (i in this.FK[k]) F[n][i] = (F[n][i] || 0) + this.FK[k][i]; }
    var mats = {}, nd = {};
    ids.forEach(function (eid) { var m = self.elemMatrix(eid); mats[eid] = m; m.dofs.forEach(function (d) { (nd[d[0]] || (nd[d[0]] = {}))[d[1]] = 1; }); });
    var map = {}, ndof = 0;
    keysN(nd).forEach(function (nn) { map[nn] = []; for (var q = 0; q < 6; q++) map[nn][q] = nd[nn][q] ? ndof++ : -1; });
    if (ndof > 4000) throw new ApdlError('The model is too large for this trainer (' + ndof + ' DOFs). Increase the element size.');
    this.p(''); this.p('                      S O L U T I O N   O P T I O N S'); this.p('');
    this.p('   PROBLEM DIMENSIONALITY. . . . . . . . . . . . .' + (this.is2D() ? '2-D' : '3-D')); this.p('   DEGREES OF FREEDOM. . . . . . ' + this.allDofs().map(function (d) { return DOFS[d]; }).join('  '));
    this.p('   ANALYSIS TYPE . . . . . . . . . . . . . . . . .STATIC (STEADY-STATE)'); this.p('   GLOBALLY ASSEMBLED MATRIX . . . . . . . . . . .SYMMETRIC');
    this.p(''); this.p('                      L O A D   S T E P   O P T I O N S'); this.p('');
    this.p('   LOAD STEP NUMBER. . . . . . . . . . . . . . . .     1'); this.p('   TIME AT END OF THE LOAD STEP. . . . . . . . . .  1.0000');
    this.p('   NUMBER OF SUBSTEPS. . . . . . . . . . . . . . .     1'); this.p('   STEP CHANGE BOUNDARY CONDITIONS . . . . . . . .    NO');
    this.p('   PRINT OUTPUT CONTROLS . . . . . . . . . . . . .NO PRINTOUT'); this.p('   DATABASE OUTPUT CONTROLS. . . . . . . . . . . .ALL DATA WRITTEN');
    var K = new Array(ndof), R0 = new Float64Array(ndof); for (i = 0; i < ndof; i++) K[i] = new Float64Array(ndof);
    this.eInfo = {};
    ids.forEach(function (eid) {
      var m = mats[eid], ke = m.ke, fe = m.fe, dofs = m.dofs, ndf = dofs.length;
      if (dofs.some(function (d) { return self.nodes[d[0]].T; })) {
        var Tf = []; for (r = 0; r < ndf; r++) Tf.push(new Array(ndf).fill(0));
        for (r = 0; r < ndf; r++) { var dr = dofs[r], T3 = self.nodes[dr[0]].T; if (!T3) { Tf[r][r] = 1; continue; } for (c = 0; c < ndf; c++) { var dc = dofs[c]; if (dc[0] === dr[0] && (dc[1] < 3) === (dr[1] < 3)) Tf[r][c] = T3[dr[1] % 3][dc[1] % 3]; } }
        ke = C.TtKT(Tf, ke); if (fe) fe = C.Ttv(Tf, fe); m.info.Tf = Tf;
      }
      var gi = dofs.map(function (d) { return map[d[0]][d[1]]; });
      for (r = 0; r < ndf; r++) { if (fe) R0[gi[r]] += fe[r]; for (c = 0; c < ndf; c++) K[gi[r]][gi[c]] += ke[r][c]; }
      m.info.gi = gi; self.eInfo[eid] = m.info;
    });
    var Fa = new Float64Array(ndof); for (i = 0; i < ndof; i++) Fa[i] = R0[i];
    for (n in F) { if (!map[n]) { this.warn('The load on node ' + n + ' is ignored: the node is not attached to any element.'); continue; } for (i in F[n]) { var gg = map[n][i]; if (gg < 0) { this.warn(FNAME[i] + ' on node ' + n + ' is ignored: this DOF is not active on the node.'); continue; } Fa[gg] += F[n][i]; } }
    var fixed = new Int8Array(ndof), uval = new Float64Array(ndof), nfix = 0;
    for (n in D) { if (!map[n]) continue; for (i in D[n]) { gg = map[n][i]; if (gg >= 0) { if (!fixed[gg]) nfix++; fixed[gg] = 1; uval[gg] = D[n][i]; } } }
    if (!nfix) throw new ApdlError('There are no DOF constraints (구속 없음). The model is not supported (rigid body motion).');
    var kmax = 0; for (i = 0; i < ndof; i++) kmax = Math.max(kmax, Math.abs(K[i][i]));
    var zp = []; for (i = 0; i < ndof; i++) if (!fixed[i] && Math.abs(K[i][i]) < kmax * 1e-12) { if (Math.abs(Fa[i]) > 0) throw new ApdlError('A load is applied at the ' + this.dofName(map, i) + ' which has no stiffness (강성이 없는 방향에 하중).'); fixed[i] = 1; uval[i] = 0; zp.push(this.dofName(map, i)); }
    if (zp.length) this.warn('There ' + (zp.length > 1 ? 'are ' + zp.length + ' small equation solver pivot terms' : 'is 1 small equation solver pivot term') + ' (e.g., at the ' + zp[0] + ').\n These DOFs have no stiffness and are held at zero (연습기: 하중이 없어 0 으로 두고 계속 진행).');
    var free = []; for (i = 0; i < ndof; i++) if (!fixed[i]) free.push(i);
    var nf = free.length, A = new Array(nf), bv = new Float64Array(nf);
    for (i = 0; i < nf; i++) { A[i] = new Float64Array(nf); var gr = free[i]; bv[i] = Fa[gr]; for (j = 0; j < ndof; j++) if (fixed[j] && uval[j]) bv[i] -= K[gr][j] * uval[j]; for (j = 0; j < nf; j++) A[i][j] = K[gr][free[j]]; }
    var scale = 0; for (i = 0; i < nf; i++) scale = Math.max(scale, Math.abs(A[i][i]));
    for (var col = 0; col < nf; col++) {
      var piv = col, pv = Math.abs(A[col][col]); for (r = col + 1; r < nf; r++) if (Math.abs(A[r][col]) > pv) { pv = Math.abs(A[r][col]); piv = r; }
      if (pv < scale * 1e-11) throw new ApdlError('There is at least 1 small equation solver pivot term (e.g., at the ' + this.dofName(map, free[col]) + ').\nPlease check for an insufficiently constrained model.\n(구속 부족 / 강체 운동: 해당 자유도를 d 로 구속하세요. 평면 모델을 3-D 요소로 풀면 UZ·ROTX·ROTY 도 구속.)');
      if (piv !== col) { var tA = A[piv]; A[piv] = A[col]; A[col] = tA; var tb = bv[piv]; bv[piv] = bv[col]; bv[col] = tb; }
      for (r = col + 1; r < nf; r++) { var fc = A[r][col] / A[col][col]; if (!fc) continue; for (c = col; c < nf; c++) A[r][c] -= fc * A[col][c]; bv[r] -= fc * bv[col]; }
    }
    var xs = new Float64Array(nf); for (r = nf - 1; r >= 0; r--) { var s = bv[r]; for (c = r + 1; c < nf; c++) s -= A[r][c] * xs[c]; xs[r] = s / A[r][r]; }
    var U = new Float64Array(ndof); for (i = 0; i < ndof; i++) U[i] = uval[i]; for (i = 0; i < nf; i++) U[free[i]] = xs[i];
    var Rf = new Float64Array(ndof); for (i = 0; i < ndof; i++) if (fixed[i]) { var sm = 0; for (j = 0; j < ndof; j++) sm += K[i][j] * U[j]; Rf[i] = sm - Fa[i]; }
    this.result = { map: map, U: U, Rf: Rf, fixed: fixed, nstress: null };
    var cnt = {}; ids.forEach(function (eid) { var nm = self.ets[self.elems[eid].type].name; cnt[nm] = (cnt[nm] || 0) + 1; });
    this.p(''); this.p('    *** ELEMENT MATRIX FORMULATION TIMES'); this.p('      TYPE    NUMBER   ENAME      TOTAL CP  AVE CP');
    Object.keys(cnt).forEach(function (nm) { var tp = keysN(self.ets).filter(function (t) { return self.ets[t].name === nm; })[0]; self.p(pad(tp, 10) + pad(cnt[nm], 10) + '  ' + rpad(nm, 8) + '     0.000   0.000000'); });
    this.p(''); this.p(' SPARSE MATRIX DIRECT SOLVER.'); this.p('  Number of equations = ' + pad(nf, 12) + ',    Maximum wavefront = ' + pad(Math.min(nf, 12), 6));
    this.p(''); this.p(' *** LOAD STEP     1   SUBSTEP     1  COMPLETED.    CUM ITER =      1'); this.p(' *** TIME =   1.00000         TIME INC =   1.00000      NEW TRIANG MATRIX');
    this.note('Solution is done!'); this.solved++;
  };
  Engine.prototype.dofName = function (map, gg) { for (var n in map) for (var i = 0; i < 6; i++) if (map[n][i] === gg) return DOFS[i] + ' degree of freedom of node ' + n; return 'DOF ' + gg; };

  // ================= 결과 =================
  Engine.prototype.needRes = function () { if (!this.result) throw new ApdlError('No results are available (해석 결과 없음 → /SOLU 에서 SOLVE 먼저. 해석 뒤 모델을 고쳤다면 다시 SOLVE).'); };
  Engine.prototype.nodeU = function (n) { this.needRes(); var m = this.result.map[n], U = this.result.U; if (!m) return [0, 0, 0, 0, 0, 0]; var u = m.map(function (gg) { return gg >= 0 ? U[gg] : 0; }), T = this.nodes[n] && this.nodes[n].T; if (T) u = mv(T, u.slice(0, 3)).concat(mv(T, u.slice(3, 6))); return u; };
  Engine.prototype.reactionN = function (n) { this.needRes(); var m = this.result.map[n], self = this; if (!m) return null; var any = false, r = m.map(function (gg) { var f = gg >= 0 && self.result.fixed[gg]; if (f) any = true; return f ? self.result.Rf[gg] : 0; }); if (!any) return null; var T = this.nodes[n].T; if (T) r = mv(T, r.slice(0, 3)).concat(mv(T, r.slice(3, 6))); return r; };
  Engine.prototype.elemRes = function (eid) {
    this.needRes(); var info = this.eInfo[eid]; if (!info) return null; var U = this.result.U;
    var ue = info.gi.map(function (gg) { return U[gg]; }); if (info.Tf) ue = C.Tv(info.Tf, ue);
    if (info.kind === 'link' || info.kind === 'spring') {
      if (info.oneD !== undefined) { var st = ue[1] - ue[0]; return { N: info.k * st, S: 0, stretch: st }; }
      var nd = ue.length / 2, du = [0, 0, 0]; for (var i = 0; i < nd; i++) du[i] = ue[nd + i] - ue[i];
      var stretch = dot(du, info.x), Nf = (info.kind === 'link' ? info.EA / info.L : info.k) * stretch;
      return { N: Nf, S: info.kind === 'link' ? Nf / info.A : 0, stretch: stretch };
    }
    if (info.kind === 'beam' || info.kind === 'beam3') {
      var u12 = new Array(12).fill(0); info.id2.forEach(function (j, q) { u12[j] = ue[q]; });
      var ul = C.Tv(info.Tb, u12); if (info.Toff) ul = C.Tv(info.Toff, ul); var fl = C.Tv(info.kl, ul); for (i = 0; i < 12; i++) fl[i] -= info.fl[i];
      var P = info.P, r = { FXI: -fl[0], SFYI: -fl[1], SFZI: -fl[2], TQI: -fl[3], MYI: -fl[4], MZI: -fl[5], FXJ: fl[6], SFYJ: fl[7], SFZJ: fl[8], TQJ: fl[9], MYJ: fl[10], MZJ: fl[11] };
      ['I', 'J'].forEach(function (s) { var My = r['MY' + s], Mz = r['MZ' + s]; r['SDIR' + s] = r['FX' + s] / P.A; r['SBYT' + s] = P.asec || !P.ymax ? 0 : -Mz * P.ymax / P.Izz; r['SBYB' + s] = P.asec || !P.ymin ? 0 : -Mz * P.ymin / P.Izz; r['SBZT' + s] = P.asec || !P.zmax ? 0 : My * P.zmax / P.Iyy; r['SBZB' + s] = P.asec || !P.zmin ? 0 : My * P.zmin / P.Iyy; });
      return r;
    }
    if (info.kind === 'plane') {
      var Bs = C.planeB(info.X), s3 = [0, 0, 0];
      Bs.forEach(function (gp) { var eps = [0, 0, 0], a, b; for (a = 0; a < 3; a++) for (b = 0; b < ue.length; b++) eps[a] += gp.B[a][b] * ue[b]; for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) s3[a] += info.D[a][b] * eps[b] / Bs.length; });
      return { S: stressSet(s3[0], s3[1], s3[2]) };
    }
    return null;
  };
  function stressSet(sx, sy, sxy) { var c = (sx + sy) / 2, r = Math.sqrt(Math.pow((sx - sy) / 2, 2) + sxy * sxy), pr = [c + r, c - r, 0].sort(function (a, b) { return b - a; }); return [sx, sy, 0, sxy, pr[0], pr[1], pr[2], pr[0] - pr[2], Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * sxy * sxy)]; }
  Engine.prototype.nodalStress = function () {
    if (this.result.nstress) return this.result.nstress;
    var acc = {}, cnt = {}, self = this;
    keysN(this.elems).forEach(function (e) { var inf = self.eInfo[e]; if (!inf || inf.kind !== 'plane') return; var s = self.elemRes(e).S; inf.ns.forEach(function (n) { acc[n] = acc[n] || [0, 0, 0, 0]; cnt[n] = (cnt[n] || 0) + 1; for (var q = 0; q < 4; q++) acc[n][q] += s[q]; }); });
    for (var n in acc) { var a = acc[n].map(function (v) { return v / cnt[n]; }); acc[n] = stressSet(a[0], a[1], a[3]); }
    this.result.nstress = acc; return acc;
  };

  function head(self, what, rsys) { self.p(''); self.p(' PRINT ' + what); self.p(''); self.p('  ***** POST1 ' + (what.indexOf('REACTION') > -1 ? 'TOTAL REACTION SOLUTION' : what.indexOf('ELEMENT TABLE') > -1 ? 'ELEMENT TABLE' : 'NODAL DEGREE OF FREEDOM') + ' LISTING *****'); self.p(''); self.p('  LOAD STEP=     1  SUBSTEP=     1'); self.p('   TIME=    1.0000      LOAD CASE=   0'); if (rsys) { self.p(''); self.p('  THE FOLLOWING ' + rsys + ' ARE IN THE GLOBAL COORDINATE SYSTEM'); } self.p(''); }
  reg('PRNSOL', 'O', function (f, N, S) {
    this.needRes(); var it = S(1) || 'U', cp = S(2) || 'COMP'; if ((it === 'U' || it === 'ROT') && cp === 'SUM') cp = 'COMP'; // 실제 MAPDL: PRNSOL,U,SUM 도 UX UY UZ USUM 을 모두 출력
    var self = this, nodes = keysN(this.result.map).filter(function (n) { return !self.nsel || self.nsel[n]; });
    var mx, mn, mxn, mnn;
    if (it === 'S') {
      var st = this.nodalStress(), labs = cp === 'PRIN' ? ['S1', 'S2', 'S3', 'SINT', 'SEQV'] : cp === 'COMP' ? ['SX', 'SY', 'SZ', 'SXY', 'SYZ', 'SXZ'] : [cp === 'EQV' ? 'SEQV' : cp === 'INT' ? 'SINT' : 'S' + cp];
      var idx = { SX: 0, SY: 1, SZ: 2, SXY: 3, SYZ: -1, SXZ: -1, S1: 4, S2: 5, S3: 6, SINT: 7, SEQV: 8 };
      if (!Object.keys(st).length) throw new ApdlError('No nodal stress results: PRNSOL,S is available for 2-D solid elements in this trainer (선 요소는 ETABLE 사용).');
      this.p(''); this.p(' PRINT S    NODAL SOLUTION PER NODE'); this.p(''); this.p('  ***** POST1 NODAL STRESS LISTING *****'); this.p(''); this.p('  LOAD STEP=     1  SUBSTEP=     1'); this.p('   TIME=    1.0000      LOAD CASE=   0'); this.p(''); this.p('  THE FOLLOWING X,Y,Z VALUES ARE IN GLOBAL COORDINATES'); this.p('');
      this.p('    NODE' + labs.map(function (l) { return pad(l, 13); }).join(''));
      mx = labs.map(function () { return -1e99; }); mn = labs.map(function () { return 1e99; }); mxn = []; mnn = [];
      nodes.filter(function (n) { return st[n]; }).forEach(function (n) { self.p(pad(n, 8) + labs.map(function (l, i) { var v = idx[l] < 0 ? 0 : st[n][idx[l]]; if (v > mx[i]) { mx[i] = v; mxn[i] = n; } if (v < mn[i]) { mn[i] = v; mnn[i] = n; } return pad(g(v), 13); }).join('')); });
      this.p(''); this.p(' MINIMUM VALUES'); this.p(' NODE   ' + mnn.map(function (v) { return pad(v, 13); }).join('')); this.p(' VALUE  ' + mn.map(function (v) { return pad(g(v), 13); }).join(''));
      this.p(''); this.p(' MAXIMUM VALUES'); this.p(' NODE   ' + mxn.map(function (v) { return pad(v, 13); }).join('')); this.p(' VALUE  ' + mx.map(function (v) { return pad(g(v), 13); }).join(''));
      return;
    }
    if (it !== 'U' && it !== 'ROT' && it !== 'DOF') throw new ApdlError('PRNSOL item ' + it + ' is not supported in this trainer (U, ROT, S).');
    var act = this.allDofs(), rot = it === 'ROT', comps = (rot ? [3, 4, 5] : [0, 1, 2]).filter(function (d) { return act.indexOf(d) > -1; });
    if (!comps.length) throw new ApdlError('There are no ' + (rot ? 'rotational' : 'translational') + ' degrees of freedom in this model.');
    var cols;
    if (cp === 'COMP' || it === 'DOF') cols = comps.concat(['SUM']); else if (cp === 'SUM') cols = ['SUM'];
    else { var ci = (rot ? 3 : 0) + 'XYZ'.indexOf(cp); if ('XYZ'.indexOf(cp) < 0) throw new ApdlError('Component ' + cp + ' is not valid (X, Y, Z, SUM, COMP).'); cols = [ci]; }
    var nm = function (c) { return c === 'SUM' ? (rot ? 'RSUM' : 'USUM') : DOFS[c]; };
    head(this, (rot ? 'ROT' : 'U') + '    NODAL SOLUTION PER NODE', 'DEGREE OF FREEDOM RESULTS');
    this.p('    NODE' + cols.map(function (c) { return pad(nm(c), 13); }).join(''));
    mx = cols.map(function () { return 0; }); mxn = cols.map(function () { return 0; });
    nodes.forEach(function (n) { var u = self.nodeU(n), vs = cols.map(function (c) { return c === 'SUM' ? Math.sqrt(comps.reduce(function (s, d) { return s + u[d] * u[d]; }, 0)) : u[c]; }); vs.forEach(function (v, i) { if (Math.abs(v) > Math.abs(mx[i])) { mx[i] = v; mxn[i] = n; } }); self.p(pad(n, 8) + vs.map(function (v) { return pad(g(v), 13); }).join('')); });
    this.p(''); this.p(' MAXIMUM ABSOLUTE VALUES'); this.p(' NODE   ' + mxn.map(function (v) { return pad(v, 13); }).join('')); this.p(' VALUE  ' + mx.map(function (v) { return pad(g(v), 13); }).join(''));
  });
  reg('PRRSOL PRRFOR', 'O', function (f, N, S) {
    this.needRes(); var self = this, act = this.allDofs(), rows = [], used = {};
    keysN(this.result.map).forEach(function (n) { var r = self.reactionN(n); if (!r) return; var m = self.result.map[n], fx = m.map(function (gg) { return gg >= 0 && self.result.fixed[gg]; }); if (self.nodes[n].T) { var t = fx.slice(0, 3).some(Boolean), q = fx.slice(3).some(Boolean); fx = [t, t, t, q, q, q].map(function (v, i) { return v && m[i] >= 0; }); } fx.forEach(function (v, i) { if (v) used[i] = 1; }); rows.push([n, r, fx]); });
    var cols = act.filter(function (d) { return used[d]; }), lab = S(1);
    if (lab && FLAB[lab] !== undefined) cols = [FLAB[lab]]; else if (lab === 'F') cols = cols.filter(function (d) { return d < 3; }); else if (lab === 'M') cols = cols.filter(function (d) { return d > 2; });
    head(this, 'REACTION SOLUTIONS PER NODE', 'X,Y,Z SOLUTIONS');
    this.p('    NODE' + cols.map(function (c) { return pad(FNAME[c], 13); }).join(''));
    var tot = [0, 0, 0, 0, 0, 0];
    rows.forEach(function (rw) { self.p(pad(rw[0], 8) + cols.map(function (c) { return pad(rw[2][c] ? g(rw[1][c]) : '', 13); }).join('')); cols.forEach(function (c) { if (rw[2][c]) tot[c] += rw[1][c]; }); });
    this.p(''); this.p(' TOTAL VALUES'); this.p(' VALUE  ' + cols.map(function (c) { return pad(g(tot[c]), 13); }).join(''));
  });
  reg('FSUM', 'O', function () { this.needRes(); this.note('FSUM: 이 연습기는 FSUM 을 계산하지 않습니다. 반력 합은 PRRSOL 의 TOTAL VALUES 를 보세요.'); });
  var SMISC_B188 = { 1: 'FXI', 2: 'MYI', 3: 'MZI', 4: 'TQI', 5: 'SFZI', 6: 'SFYI', 14: 'FXJ', 15: 'MYJ', 16: 'MZJ', 17: 'TQJ', 18: 'SFZJ', 19: 'SFYJ', 31: 'SDIRI', 32: 'SBYTI', 33: 'SBYBI', 34: 'SBZTI', 35: 'SBZBI', 36: 'SDIRJ', 37: 'SBYTJ', 38: 'SBYBJ', 39: 'SBZTJ', 40: 'SBZBJ' };
  var SMISC_B3 = { 1: 'FXI', 2: 'SFYI', 6: 'MZI', 7: 'FXJ', 8: 'SFYJ', 12: 'MZJ' }, LS_B3 = { 1: 'SDIRI', 2: 'SBYTI', 3: 'SBYBI', 4: 'SDIRJ', 5: 'SBYTJ', 6: 'SBYBJ' };
  reg('ETABLE', 'O', function (f, N, S) {
    var lab = S(1); if (lab === 'REFL') { this.p(' REFILL ALL ELEMENT TABLE ITEMS'); return; } if (lab === 'ERAS') { this.etab = {}; this.etabOrder = []; this.p(' ERASE ELEMENT TABLE'); return; }
    this.needRes(); var it = S(2), cp = S(3), cn = N(3), self = this, vals = {}, miss = 0;
    this.selE().forEach(function (e) {
      var r = self.elemRes(e); if (!r) return; var info = self.eInfo[e], v;
      if (info.kind === 'link' || info.kind === 'spring') { if (it === 'SMISC' && cn === 1) v = r.N; else if (it === 'LS' && (cn === 1 || cn === 2)) v = r.S; else if (it === 'NMISC' && cn === 1) v = r.stretch; else { v = 0; miss++; } }
      else if (info.kind === 'beam') { var key = it === 'SMISC' ? SMISC_B188[cn] : null; if (key) v = r[key]; else { v = 0; miss++; } }
      else if (info.kind === 'beam3') { var k3 = it === 'SMISC' ? SMISC_B3[cn] : it === 'LS' ? LS_B3[cn] : null; if (k3) v = r[k3]; else { v = 0; miss++; } }
      else if (info.kind === 'plane') { var ii = { X: 0, Y: 1, Z: 2, XY: 3, '1': 4, '2': 5, '3': 6, INT: 7, EQV: 8 }[cp]; if (it === 'S' && ii !== undefined) v = r.S[ii]; else { v = 0; miss++; } }
      vals[e] = v;
    });
    if (!this.etab[lab]) this.etabOrder.push(lab); this.etab[lab] = { vals: vals, desc: it + ' ' + (cp || '') };
    this.p(' STORE ' + rpad(lab, 9) + ' FROM ITEM=' + rpad(it, 5) + ' COMP=' + pad(cp, 4) + '   FOR ALL SELECTED ELEMENTS');
    if (miss) this.warn('Item ' + it + ',' + cp + ' is not available for ' + miss + ' element(s) in this trainer (0 으로 저장).');
  });
  reg('PRETAB', 'O', function (f) {
    var self = this, labs = f.slice(1).filter(Boolean).map(function (x) { return self.lab(x); }); if (!labs.length) labs = this.etabOrder.slice();
    if (!labs.length) throw new ApdlError('No element table items are defined (ETABLE 먼저).');
    labs.forEach(function (l) { if (!self.etab[l]) throw new ApdlError('Element table item ' + l + ' is not defined.'); });
    head(this, 'ELEMENT TABLE ITEMS PER ELEMENT');
    this.p('    STAT' + labs.map(function () { return pad('CURRENT', 13); }).join('')); this.p('    ELEM' + labs.map(function (l) { return pad(l, 13); }).join(''));
    var es = this.selE().filter(function (e) { return labs.some(function (l) { return e in self.etab[l].vals; }); }), mn = labs.map(function () { return 1e99; }), mx = labs.map(function () { return -1e99; }), mnE = [], mxE = [];
    es.forEach(function (e) { self.p(pad(e, 8) + labs.map(function (l, i) { var v = self.etab[l].vals[e] || 0; if (v < mn[i]) { mn[i] = v; mnE[i] = e; } if (v > mx[i]) { mx[i] = v; mxE[i] = e; } return pad(g(v), 13); }).join('')); });
    this.p(''); this.p(' MINIMUM VALUES'); this.p(' ELEM   ' + mnE.map(function (v) { return pad(v, 13); }).join('')); this.p(' VALUE  ' + mn.map(function (v) { return pad(g(v), 13); }).join(''));
    this.p(''); this.p(' MAXIMUM VALUES'); this.p(' ELEM   ' + mxE.map(function (v) { return pad(v, 13); }).join('')); this.p(' VALUE  ' + mx.map(function (v) { return pad(g(v), 13); }).join(''));
  });
  reg('ESORT', 'O', function (f, N, S) { this.p(' SORT ON ITEM=' + S(2) + '   (연습기: 정렬 없이 진행)'); });
  reg('PRESOL', 'O', function () { this.noteOnce('PRESOL: 이 연습기에서는 ETABLE + PRETAB 으로 요소 결과를 보세요.'); });

  function plotCmd(kind, extra, msg) { return function (f, N, S) { if (kind === 'DISP' || kind === 'NSOL' || kind === 'ESOL' || kind === 'ETAB') this.needRes(); var p = { kind: kind }; if (extra) extra.call(this, p, f, N, S); this.plot = p; this.lastPlot = p; this.p(' ' + msg + ' IN DSYS=      0'); }; }
  reg('NPLOT', 'A', plotCmd('node', null, 'PRODUCE NODE PLOT')); reg('EPLOT', 'A', plotCmd('elem', null, 'PRODUCE ELEMENT PLOT')); reg('KPLOT', 'A', plotCmd('kp', null, 'PRODUCE KEYPOINT PLOT'));
  reg('LPLOT', 'A', plotCmd('line', null, 'PRODUCE LINE PLOT')); reg('APLOT', 'A', plotCmd('area', null, 'PRODUCE AREA PLOT')); reg('GPLOT', 'A', plotCmd('all', null, 'PRODUCE GEOMETRY PLOT'));
  reg('PLDISP', 'O', plotCmd('DISP', function (p, f, N) { p.und = N(1); }, 'DISPLAY DEFORMED SHAPE'));
  reg('PLNSOL', 'O', plotCmd('NSOL', function (p, f, N, S) { var it = S(1) || 'U', cp = S(2) || (it === 'S' ? 'EQV' : 'SUM'); p.item = it; p.comp = cp; p.und = N(3); if (it === 'S' && !Object.keys(this.nodalStress()).length) throw new ApdlError('No nodal stress results (PLNSOL,S 는 2-D 고체 요소만).'); }, 'PRODUCE NODAL PLOT'));
  reg('PLESOL', 'O', plotCmd('ESOL', function (p, f, N, S) { p.item = S(1) || 'S'; p.comp = S(2) || 'EQV'; }, 'PRODUCE ELEMENT SOLUTION PLOT'));
  reg('PLLS', 'O', plotCmd('PLLS', function (p, f, N, S) { var li = S(1), lj = S(2) || S(1); if (!this.etab[li]) throw new ApdlError('Element table item ' + li + ' is not defined (먼저 ETABLE).'); if (!this.etab[lj]) throw new ApdlError('Element table item ' + lj + ' is not defined (먼저 ETABLE).'); p.li = li; p.lj = lj; p.fact = f[3] ? N(3) : 1; p.kund = N(4); }, 'PLOT LINE ELEMENT RESULTS'));
  reg('ANDSCL ANIM', 'O', function (f, N, S, name) { this.needRes(); this.anim = { nfram: N(1) || 5, delay: f[2] ? N(2) : 0.1, ncycl: N(3) || 5, t: Date.now() }; this.plot = { kind: 'DISP', und: 0 }; this.p(' ANIMATE DEFORMED SHAPE   NFRAM= ' + this.anim.nfram + '  DELAY= ' + this.anim.delay + '  NCYCL= ' + this.anim.ncycl); });
  reg('/DSCALE', 'A', function (f, N, S) { var v = S(2); this.dscale = (!v || v === 'AUTO' || v === '0') ? 0 : N(2); this.p(' DISPLACEMENT SCALING FACTOR = ' + (this.dscale ? g(this.dscale) : 'AUTO')); });
  reg('PLETAB', 'O', plotCmd('ETAB', function (p, f, N, S) { if (!this.etab[S(1)]) throw new ApdlError('Element table item ' + S(1) + ' is not defined.'); p.lab = S(1); }, 'PLOT ELEMENT TABLE ITEM'));

  reg('NLIST', 'A', function () { var self = this; this.p(' LIST ALL SELECTED NODES.   DSYS=      0'); this.p(''); this.p('    NODE        X             Y             Z           THXY     THYZ     THZX'); this.selN().forEach(function (n) { var x = self.nodes[n].x; self.p(pad(n, 8) + x.map(function (v) { return pad(g(v), 14); }).join('') + (self.nodes[n].T ? '      (rotated)' : '         0.00     0.00     0.00')); }); });
  reg('ELIST', 'A', function () { var self = this; this.p(' LIST ALL SELECTED ELEMENTS.  (LIST NODES)'); this.p(''); this.p('    ELEM MAT TYP REL ESY SEC        NODES'); this.p(''); this.selE().forEach(function (e) { var el = self.elems[e]; self.p(pad(e, 8) + pad(el.mat, 4) + pad(el.type, 4) + pad(el.real, 4) + pad(0, 4) + pad(el.sec, 4) + '   ' + el.n.concat(el.kn ? [el.kn] : []).map(function (n) { return pad(n, 6); }).join('')); }); });
  reg('KLIST', 'A', function () { var self = this; this.p(' LIST ALL SELECTED KEYPOINTS.   DSYS=      0'); this.p(''); this.p('   NO.      X,Y,Z LOCATION'); keysN(this.kps).forEach(function (k) { self.p(pad(k, 6) + self.kps[k].x.map(function (v) { return pad(g(v), 14); }).join('')); }); });
  reg('LLIST', 'A', function () { var self = this; this.p(' LIST ALL SELECTED LINES.     DSYS=      0'); this.p(''); this.p('      NUMBER   KEYPOINTS        LENGTH    NDIV'); keysN(this.lines).forEach(function (l) { var L = self.lines[l], len = 0; for (var i = 1; i < L.pts.length; i++) len += norm(sub(L.pts[i], L.pts[i - 1])); self.p(pad(l, 12) + pad(L.k[0], 8) + pad(L.k[1], 6) + pad(g(len), 14) + pad(L.ndiv || '', 8)); }); });
  reg('ALIST', 'A', function () { var self = this; this.p(' LIST ALL SELECTED AREAS.'); this.p(''); this.p('      NUMBER     LOOPS        AREA'); keysN(this.areas).forEach(function (a) { var A = self.areas[a], s = 0; A.regions.forEach(function (r) { for (var i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]) / 2; }); self.p(pad(a, 12) + pad(A.regions.length, 10) + pad(g(Math.abs(s)), 14)); }); });
  reg('ETLIST', 'A', function () { var self = this; this.p(' LIST ELEMENT TYPES FROM      1 TO ' + pad(maxKey(this.ets), 6)); keysN(this.ets).forEach(function (t) { var et = self.ets[t]; self.p(''); self.p(' ELEMENT TYPE ' + pad(t, 8) + ' IS ' + rpad(et.name, 8) + ' ' + ETYPES[et.name].desc); self.p('  KEYOPT( 1- 6)=' + et.kop.slice(1, 7).map(function (v) { return pad(v, 7); }).join('')); }); });
  reg('MPLIST', 'A', function () { var self = this; keysN(this.mats).forEach(function (m) { self.p(''); self.p(' MATERIAL NUMBER ' + pad(m, 8)); for (var l in self.mats[m]) { self.p('      TEMP        ' + l); self.p('              ' + C.e7(self.mats[m][l])); } }); });
  reg('RLIST', 'A', function () { var self = this; keysN(this.reals).forEach(function (r) { self.p(' REAL CONSTANT SET ' + pad(r, 8)); self.p(self.reals[r].map(function (v) { return pad(g(v), 13); }).join('')); }); });
  reg('SLIST', 'A', function () { var self = this; this.p(' LIST SECTION ID SETS     1 TO ' + pad(maxKey(this.secs), 6)); keysN(this.secs).forEach(function (s) { var sc = self.secs[s]; if (sc.type === 'LINK') { self.p(''); self.p(' SECTION ID NUMBER:  ' + s); self.p(' LINK SECTION'); self.p('  Area                 = ' + g(sc.data[0] || 0)); } else if (sc.data.length) self.secSummary(s, sc); }); });
  reg('DLIST', 'A', function () { var self = this; this.p(' LIST CONSTRAINTS FOR SELECTED NODES'); this.p(''); this.p('    NODE  LABEL     REAL           IMAG'); keysN(this.D).forEach(function (n) { for (var i in self.D[n]) self.p(pad(n, 8) + '  ' + rpad(DOFS[i], 6) + pad(self.D[n][i].toFixed(8), 14) + '     0.00000000'); }); });
  reg('FLIST', 'A', function () { var self = this; this.p(' LIST NODAL LOADS FOR SELECTED NODES'); this.p(''); this.p('    NODE  LABEL     REAL           IMAG'); keysN(this.F).forEach(function (n) { for (var i in self.F[n]) self.p(pad(n, 8) + '  ' + rpad(FNAME[i], 6) + pad(self.F[n][i].toFixed(6), 14) + '     0.00000000'); }); });
  reg('SFELIST', 'A', function () { var self = this; this.p(' LIST SURFACE LOADS FOR SELECTED ELEMENTS'); keysN(this.SFB).forEach(function (e) { for (var k in self.SFB[e]) self.p(pad(e, 8) + '  LKEY ' + k + '  PRES  ' + g(self.SFB[e][k].vi) + '  ' + g(self.SFB[e][k].vj)); }); });

  Engine.prototype.dbJSON = function () { var o = {}, self = this; ['nodes', 'elems', 'ets', 'reals', 'secs', 'mats', 'kps', 'lines', 'areas', 'kpNode', 'cs', 'acs', 'wp', 'att', 'esz', 'D', 'F', 'DK', 'FK', 'SFB', 'params', 'afunDeg', 'title', 'pnum'].forEach(function (k) { o[k] = self[k]; }); return JSON.stringify(o); };
  Engine.prototype.dbLoad = function (s) { var o = JSON.parse(s); for (var k in o) this[k] = o[k]; this.result = null; this.etab = {}; this.etabOrder = []; this.nsel = this.esel = null; for (var q in this.secs) delete this.secs[q].props; };
  Engine.prototype.snapshot = function () {
    var res = this.result, nodes = {}, elems = {}, kOnly = {};
    for (var n in this.nodes) nodes[n] = { x: this.nodes[n].x, u: res && res.map[n] ? this.nodeU(+n) : null, T: this.nodes[n].T };
    for (var e in this.elems) { var el = this.elems[e], et = this.ets[el.type]; elems[e] = { n: el.n, name: et ? et.name : '?', kind: et ? ETYPES[et.name].kind : '', k: el.k, sec: el.sec }; if (el.kn) kOnly[el.kn] = 1; }
    var ns = null; if (res) { try { ns = this.nodalStress(); } catch (x) { ns = null; } }
    return { nodes: nodes, elems: elems, kOnly: kOnly, kps: this.kps, lines: this.lines, areas: this.areas, D: this.D, F: this.F, DK: this.DK, FK: this.FK, SFB: this.SFB, etab: this.etab, plot: this.plot, pnum: this.pnum, title: this.title, wp: this.wp, nstress: ns, solved: !!res };
  };
  Engine.prototype.status = function () { return { proc: this.proc, procName: PROCNAME[this.proc], mat: this.att.mat, type: this.att.type, real: this.att.real, csys: this.acs, secn: this.att.sec }; };
  Engine.prototype.run = function (text) { this.clearDB(); this.out = []; this.hist = []; return this.exec(text); };
  Engine.COMMANDS = ORDER;

  root.ApdlEngine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);

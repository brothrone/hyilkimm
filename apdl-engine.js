/* 미니 APDL 엔진 — 전산구조해석 중간고사 범위 연습용
 * 지원: 파라미터·식·*do·*if·*get, 좌표계(csys/local/wp), 키포인트·선·면(Boolean),
 *       노드·요소 직접 생성(n/e/fill/ngen/egen/nmodif/nrotat), LINK180·BEAM188·PLANE182,
 *       sectype/secdata, d/f/dk/fk/sfbeam, 선형 정적 해석, prnsol/prrsol/etable/pretab/*get
 * 실제 ANSYS와 차이: 보는 단면 도심 기준 Timoshenko 보(전단중심·뒴·SECOFFSET 효과 없음),
 *       PLANE182는 2×2 가우스 평면응력, 면 메쉬(amesh)는 미지원.
 */
(function (root) {
  'use strict';
  var DOFS = ['UX', 'UY', 'UZ', 'ROTX', 'ROTY', 'ROTZ'];
  var FLAB = { FX: 0, FY: 1, FZ: 2, MX: 3, MY: 4, MZ: 5 };
  var DEG = Math.PI / 180;

  // ---------- 작은 선형대수 ----------
  function I3() { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }
  function mm(A, B) { var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; return C; }
  function mv(A, v) { return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]]; }
  function mtv(A, v) { return [A[0][0] * v[0] + A[1][0] * v[1] + A[2][0] * v[2], A[0][1] * v[0] + A[1][1] * v[1] + A[2][1] * v[2], A[0][2] * v[0] + A[1][2] * v[1] + A[2][2] * v[2]]; }
  function Rz(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
  function Rx(t) { var c = Math.cos(t), s = Math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function Ry(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function rot3(thxy, thyz, thzx) { return mm(mm(Rz((thxy || 0) * DEG), Rx((thyz || 0) * DEG)), Ry((thzx || 0) * DEG)); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scl(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var n = norm(a); return n ? scl(a, 1 / n) : a; }

  function ApdlError(msg) { this.message = msg; }

  // ---------- 식 계산 ----------
  function Expr(eng) { this.e = eng; }
  Expr.prototype.eval = function (src) {
    this.s = src; this.p = 0; this.toks = this.lex(src); this.i = 0;
    var v = this.cmp(); if (this.i < this.toks.length) throw new ApdlError('식을 해석할 수 없음: ' + src); return v;
  };
  Expr.prototype.lex = function (s) {
    var t = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?/.exec(s.slice(i)))) { t.push({ k: 'n', v: parseFloat(m[0].replace(/[dD]/, 'e')) }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)))) { t.push({ k: 'id', v: m[0].toUpperCase() }); i += m[0].length; continue; }
      if (s.substr(i, 2) === '**') { t.push({ k: 'op', v: '**' }); i += 2; continue; }
      if ('+-*/()<>,'.indexOf(c) > -1) { t.push({ k: 'op', v: c }); i++; continue; }
      throw new ApdlError('식에 알 수 없는 문자 "' + c + '": ' + s);
    }
    return t;
  };
  Expr.prototype.peek = function (v) { var t = this.toks[this.i]; return t && t.k === 'op' && t.v === v; };
  Expr.prototype.cmp = function () { // APDL: (a<b) = 작은 값, (a>b) = 큰 값
    var a = this.addsub();
    while (this.peek('<') || this.peek('>')) { var op = this.toks[this.i++].v, b = this.addsub(); a = op === '<' ? Math.min(a, b) : Math.max(a, b); }
    return a;
  };
  Expr.prototype.addsub = function () {
    var a = this.muldiv();
    while (this.peek('+') || this.peek('-')) { var op = this.toks[this.i++].v, b = this.muldiv(); a = op === '+' ? a + b : a - b; }
    return a;
  };
  Expr.prototype.muldiv = function () {
    var a = this.unary();
    while (this.peek('*') || this.peek('/')) { var op = this.toks[this.i++].v, b = this.unary(); a = op === '*' ? a * b : a / b; }
    return a;
  };
  Expr.prototype.unary = function () {
    if (this.peek('-')) { this.i++; return -this.unary(); }
    if (this.peek('+')) { this.i++; return this.unary(); }
    return this.pow();
  };
  Expr.prototype.pow = function () {
    var a = this.atom();
    if (this.peek('**')) { this.i++; var b = this.unary(); return Math.pow(a, b); }
    return a;
  };
  Expr.prototype.atom = function () {
    var t = this.toks[this.i++];
    if (!t) throw new ApdlError('식이 중간에 끝남: ' + this.s);
    if (t.k === 'n') return t.v;
    if (t.k === 'op' && t.v === '(') { var v = this.cmp(); if (!this.peek(')')) throw new ApdlError('괄호가 닫히지 않음: ' + this.s); this.i++; return v; }
    if (t.k === 'id') {
      if (this.peek('(')) {
        this.i++; var args = [];
        if (!this.peek(')')) { args.push(this.cmp()); while (this.peek(',')) { this.i++; args.push(this.cmp()); } }
        if (!this.peek(')')) throw new ApdlError('함수 괄호가 닫히지 않음: ' + this.s); this.i++;
        return this.e.func(t.v, args);
      }
      return this.e.param(t.v);
    }
    throw new ApdlError('식을 해석할 수 없음: ' + this.s);
  };

  // ---------- 단면 성질 ----------
  function rectsProps(rs, asz, asy) { // rs: [{y0,y1,z0,z1}] (단면 원점 기준)
    var A = 0, Sy = 0, Sz = 0;
    rs.forEach(function (r) { var a = (r.y1 - r.y0) * (r.z1 - r.z0); A += a; Sy += a * (r.y0 + r.y1) / 2; Sz += a * (r.z0 + r.z1) / 2; });
    var cy = Sy / A, cz = Sz / A, Iyy = 0, Izz = 0, ymin = 1e99, ymax = -1e99, zmin = 1e99, zmax = -1e99;
    rs.forEach(function (r) {
      var b = r.y1 - r.y0, h = r.z1 - r.z0, a = b * h, yc = (r.y0 + r.y1) / 2 - cy, zc = (r.z0 + r.z1) / 2 - cz;
      Iyy += b * h * h * h / 12 + a * zc * zc; Izz += h * b * b * b / 12 + a * yc * yc;
      ymin = Math.min(ymin, r.y0 - cy); ymax = Math.max(ymax, r.y1 - cy); zmin = Math.min(zmin, r.z0 - cz); zmax = Math.max(zmax, r.z1 - cz);
    });
    var J = 0; rs.forEach(function (r) { var b = Math.max(r.y1 - r.y0, r.z1 - r.z0), t = Math.min(r.y1 - r.y0, r.z1 - r.z0); J += b * t * t * t / 3 * (1 - 0.63 * t / b * (b > t * 1.0001 ? 1 : 0.5)); });
    return { A: A, Iyy: Iyy, Izz: Izz, J: J, cy: cy, cz: cz, ymin: ymin, ymax: ymax, zmin: zmin, zmax: zmax, Asy: asy || A * 5 / 6, Asz: asz || A * 5 / 6, rects: rs };
  }
  function secProps(sec) {
    var d = sec.data.map(function (x) { return x || 0; }), s = sec.sub, p;
    if (sec.type === 'LINK') return { A: d[0] };
    if (s === 'RECT') { p = rectsProps([{ y0: -d[0] / 2, y1: d[0] / 2, z0: -d[1] / 2, z1: d[1] / 2 }]); var b = Math.max(d[0], d[1]), t = Math.min(d[0], d[1]); p.J = b * t * t * t * (1 / 3 - 0.21 * t / b * (1 - Math.pow(t / b, 4) / 12)); return p; }
    if (s === 'CSOLID') { var R = d[0]; return { A: Math.PI * R * R, Iyy: Math.PI * Math.pow(R, 4) / 4, Izz: Math.PI * Math.pow(R, 4) / 4, J: Math.PI * Math.pow(R, 4) / 2, cy: 0, cz: 0, ymin: -R, ymax: R, zmin: -R, zmax: R, Asy: 0.9 * Math.PI * R * R, Asz: 0.9 * Math.PI * R * R, circ: [0, R] }; }
    if (s === 'CTUBE') { var ri = d[0], ro = d[1], Ip = Math.PI * (Math.pow(ro, 4) - Math.pow(ri, 4)) / 4, At = Math.PI * (ro * ro - ri * ri); return { A: At, Iyy: Ip, Izz: Ip, J: 2 * Ip, cy: 0, cz: 0, ymin: -ro, ymax: ro, zmin: -ro, zmax: ro, Asy: At / 2, Asz: At / 2, circ: [ri, ro] }; }
    if (s === 'I') { // W1 위 플랜지, W2 아래 플랜지, W3 높이, t1 위, t2 아래, t3 웨브 — 원점: 아래 가운데
      var W1 = d[0], W2 = d[1], W3 = d[2], t1 = d[3], t2 = d[4], t3 = d[5];
      return rectsProps([{ y0: -W2 / 2, y1: W2 / 2, z0: 0, z1: t2 }, { y0: -t3 / 2, y1: t3 / 2, z0: t2, z1: W3 - t1 }, { y0: -W1 / 2, y1: W1 / 2, z0: W3 - t1, z1: W3 }], W3 * t3, (W1 * t1 + W2 * t2) * 5 / 6);
    }
    if (s === 'CHAN') { // 웨브 바깥면 y=0, 플랜지는 +y 방향, 원점: 웨브 바깥 아래
      var C1 = d[0], C2 = d[1], C3 = d[2], u1 = d[3], u2 = d[4], u3 = d[5];
      return rectsProps([{ y0: 0, y1: C2, z0: 0, z1: u2 }, { y0: 0, y1: u3, z0: u2, z1: C3 - u1 }, { y0: 0, y1: C1, z0: C3 - u1, z1: C3 }], C3 * u3, (C1 * u1 + C2 * u2) * 5 / 6);
    }
    if (s === 'HREC') { var a1 = d[0], a2 = d[1], q1 = d[2], q2 = d[3], q3 = d[4], q4 = d[5]; return rectsProps([{ y0: -a1 / 2, y1: -a1 / 2 + q1, z0: -a2 / 2, z1: a2 / 2 }, { y0: a1 / 2 - q2, y1: a1 / 2, z0: -a2 / 2, z1: a2 / 2 }, { y0: -a1 / 2 + q1, y1: a1 / 2 - q2, z0: -a2 / 2, z1: -a2 / 2 + q3 }, { y0: -a1 / 2 + q1, y1: a1 / 2 - q2, z0: a2 / 2 - q4, z1: a2 / 2 }]); }
    if (s === 'ASEC') return { A: d[0], Iyy: d[1], Izz: d[3], J: d[5] || 0, cy: 0, cz: 0, ymin: d[11] ? -d[11] / 2 : 0, ymax: d[11] ? d[11] / 2 : 0, zmin: d[10] ? -d[10] / 2 : 0, zmax: d[10] ? d[10] / 2 : 0, Asy: d[0], Asz: d[0], asec: true };
    throw new ApdlError('지원하지 않는 단면 종류: ' + s);
  }

  // ---------- 엔진 ----------
  function Engine() { this.reset(); }
  Engine.prototype.reset = function () {
    this.nodes = {}; this.elems = {}; this.ets = {}; this.secs = {}; this.mats = {}; this.reals = {};
    this.kps = {}; this.lines = {}; this.areas = {};
    this.cs = { 0: { type: 0, o: [0, 0, 0], R: I3() }, 1: { type: 1, o: [0, 0, 0], R: I3() }, 2: { type: 2, o: [0, 0, 0], R: I3() } };
    this.acs = 0; this.wp = { o: [0, 0, 0], R: I3() };
    this.att = { type: 1, mat: 1, real: 1, secnum: 1 };
    this.esizeVal = { size: 0, ndiv: 0 };
    this.D = {}; this.F = {}; this.DK = {}; this.FK = {}; this.SFB = {};
    this.params = {}; this.afunDeg = false;
    this.nsel = null; this.esel = null; // null = 전체 선택
    this.result = null; this.etab = {}; this.out = []; this.plot = null; this.pnum = {}; this.proc = 'BEGIN';
    this.lastNodes = []; this.curSec = null; this.warned = {};
  };
  Engine.prototype.log = function (s) { this.out.push(s); };
  Engine.prototype.warn = function (s) { if (!this.warned[s]) { this.warned[s] = 1; this.out.push(' *** 참고 *** ' + s); } };

  // 파라미터·함수
  Engine.prototype.param = function (n) {
    if (n === 'PI') return Math.PI;
    if (n in this.params) return this.params[n];
    throw new ApdlError('정의되지 않은 파라미터: ' + n);
  };
  Engine.prototype.func = function (f, a) {
    var self = this, ang = function (x) { return self.afunDeg ? x * DEG : x; }, inv = function (x) { return self.afunDeg ? x / DEG : x; };
    switch (f) {
      case 'SQRT': return Math.sqrt(a[0]); case 'ABS': return Math.abs(a[0]); case 'EXP': return Math.exp(a[0]);
      case 'LOG': return Math.log(a[0]); case 'LOG10': return Math.log10(a[0]); case 'NINT': return Math.round(a[0]);
      case 'SIGN': return Math.abs(a[0]) * (a[1] < 0 ? -1 : 1); case 'MOD': return a[1] === 0 ? 0 : a[0] - Math.round(a[0] / a[1]) * a[1];
      case 'SIN': return Math.sin(ang(a[0])); case 'COS': return Math.cos(ang(a[0])); case 'TAN': return Math.tan(ang(a[0]));
      case 'ASIN': return inv(Math.asin(a[0])); case 'ACOS': return inv(Math.acos(a[0])); case 'ATAN': return inv(Math.atan(a[0]));
      case 'ATAN2': return inv(Math.atan2(a[0], a[1])); case 'MIN': return Math.min.apply(null, a); case 'MAX': return Math.max.apply(null, a);
      case 'NX': case 'NY': case 'NZ': return this.inActive(this.nodeXYZ(a[0]))['NXYZ'.indexOf(f[1]) - 1];
      case 'KX': case 'KY': case 'KZ': return this.inActive(this.kpXYZ(a[0]))['KXYZ'.indexOf(f[1]) - 1];
      case 'UX': case 'UY': case 'UZ': case 'ROTX': case 'ROTY': case 'ROTZ': return this.nodeResult(a[0])[DOFS.indexOf(f)];
      case 'NELEM': var e = this.elems[a[0]]; if (!e) throw new ApdlError('요소 ' + a[0] + ' 없음'); return e.n[a[1] - 1] || 0;
      case 'DISTND': return norm(sub(this.nodeXYZ(a[0]), this.nodeXYZ(a[1])));
      case 'DISTKP': return norm(sub(this.kpXYZ(a[0]), this.kpXYZ(a[1])));
      case 'NODE': return this.nearest(this.nodes, this.toGlobal(this.acs, a[0] || 0, a[1] || 0, a[2] || 0));
      case 'KP': return this.nearest(this.kps, this.toGlobal(this.acs, a[0] || 0, a[1] || 0, a[2] || 0));
    }
    throw new ApdlError('지원하지 않는 함수: ' + f + '()');
  };
  Engine.prototype.nearest = function (set, p) { var best = 0, bd = 1e99; for (var k in set) { var d = norm(sub(set[k].x, p)); if (d < bd) { bd = d; best = +k; } } return best; };

  // 좌표계
  Engine.prototype.toGlobal = function (id, a, b, c) {
    var cs = this.cs[id], p;
    if (cs.type === 1) p = [a * Math.cos(b * DEG), a * Math.sin(b * DEG), c];
    else if (cs.type === 2) p = [a * Math.cos(b * DEG) * Math.cos(c * DEG), a * Math.sin(b * DEG) * Math.cos(c * DEG), a * Math.sin(c * DEG)];
    else p = [a, b, c];
    return add(cs.o, mv(cs.R, p));
  };
  Engine.prototype.fromGlobal = function (id, g) {
    var cs = this.cs[id], p = mtv(cs.R, sub(g, cs.o));
    if (cs.type === 1) return [Math.hypot(p[0], p[1]), Math.atan2(p[1], p[0]) / DEG, p[2]];
    if (cs.type === 2) { var r = norm(p); return [r, Math.atan2(p[1], p[0]) / DEG, r ? Math.asin(p[2] / r) / DEG : 0]; }
    return p;
  };
  Engine.prototype.inActive = function (g) { return this.fromGlobal(this.acs, g); };
  Engine.prototype.axesAt = function (id, g) { // 좌표계 id 의 점 g 에서 축 방향 (열 = x, y, z)
    var cs = this.cs[id];
    if (cs.type === 1) { var l = this.fromGlobal(id, g), t = l[1] * DEG; return mm(cs.R, [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]]); }
    return cs.R;
  };
  Engine.prototype.nodeXYZ = function (n) { var nd = this.nodes[n]; if (!nd) throw new ApdlError('노드 ' + n + ' 없음'); return nd.x; };
  Engine.prototype.kpXYZ = function (k) { var kp = this.kps[k]; if (!kp) throw new ApdlError('키포인트 ' + k + ' 없음'); return kp.x; };
  Engine.prototype.wpToGlobal = function (x, y) { return add(this.wp.o, mv(this.wp.R, [x, y, 0])); };

  function lowestFree(set) { var i = 1; while (set[i]) i++; return i; }
  function maxKey(set) { var m = 0; for (var k in set) m = Math.max(m, +k); return m; }

  // ---------- 명령 실행 ----------
  Engine.prototype.run = function (text) {
    this.reset();
    var raw = text.replace(/\r/g, '').split('\n'), lines = [];
    raw.forEach(function (l, i) {
      var s = l, q = s.indexOf('!'); if (q > -1) s = s.slice(0, q);
      s.split('$').forEach(function (part) { part = part.trim(); if (part) lines.push({ t: part, ln: i + 1 }); });
    });
    this.prog = lines; var pc = 0, stack = [], guard = 0;
    try {
      while (pc < lines.length) {
        if (++guard > 200000) throw new ApdlError('명령이 너무 많이 반복됨 (*do 무한 반복?)');
        var L = lines[pc], f = this.split(L.t), cmd = f[0].toUpperCase();
        this.curLine = L.ln;
        if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(L.t) && cmd.indexOf('=') > -1) { var eq = L.t.indexOf('='); this.params[L.t.slice(0, eq).trim().toUpperCase()] = this.num(L.t.slice(eq + 1)); pc++; continue; }
        if (cmd === '*DO') {
          var pn = f[1].toUpperCase(), a = this.num(f[2]), b = this.num(f[3]), inc = f[4] ? this.num(f[4]) : 1;
          var end = this.findEnd(pc, '*DO', '*ENDDO');
          if ((inc > 0 && a > b) || (inc < 0 && a < b)) { pc = end + 1; continue; }
          this.params[pn] = a; stack.push({ pn: pn, b: b, inc: inc, start: pc, end: end }); pc++; continue;
        }
        if (cmd === '*ENDDO') {
          var top = stack[stack.length - 1]; if (!top) throw new ApdlError('*ENDDO 짝이 맞지 않음');
          var v = this.params[top.pn] + top.inc;
          if ((top.inc > 0 && v <= top.b + 1e-9) || (top.inc < 0 && v >= top.b - 1e-9)) { this.params[top.pn] = v; pc = top.start + 1; } else { stack.pop(); pc++; }
          continue;
        }
        if (cmd === '*IF') { pc = this.doIf(pc, f); continue; }
        if (cmd === '*ELSEIF' || cmd === '*ELSE') { pc = this.findEnd(pc, '*IF', '*ENDIF', true) + 1; continue; }
        if (cmd === '*ENDIF') { pc++; continue; }
        this.exec(cmd, f); pc++;
      }
    } catch (err) {
      if (err instanceof ApdlError) { this.log(''); this.log(' *** ERROR ***  ' + (this.curLine ? this.curLine + '번째 줄: ' : '') + err.message); this.errorLine = this.curLine; }
      else { this.log(' *** 내부 오류 *** ' + err.message); this.errorLine = this.curLine; if (typeof console !== 'undefined') console.error(err); }
    }
    return this;
  };
  Engine.prototype.findEnd = function (pc, open, close, fromInside) {
    var depth = 0, P = this.prog;
    for (var i = pc + (fromInside ? 0 : 1); i < P.length; i++) {
      var c = this.split(P[i].t)[0].toUpperCase();
      if (c === open) depth++;
      if (c === close) { if (depth === 0) return i; depth--; }
    }
    throw new ApdlError(open + ' 에 맞는 ' + close + ' 가 없음');
  };
  Engine.prototype.doIf = function (pc, f) {
    var P = this.prog, self = this;
    function test(ff) {
      var a = self.num(ff[1]), op = (ff[2] || '').toUpperCase(), b = self.num(ff[3]), tol = 1e-10;
      return { EQ: Math.abs(a - b) < tol, NE: Math.abs(a - b) >= tol, LT: a < b, GT: a > b, LE: a <= b, GE: a >= b, ABLT: Math.abs(a) < Math.abs(b), ABGT: Math.abs(a) > Math.abs(b) }[op];
    }
    // 같은 단계의 *ELSEIF / *ELSE / *ENDIF 위치 모으기
    var marks = [], depth = 0;
    for (var i = pc + 1; i < P.length; i++) {
      var ff = this.split(P[i].t), c = ff[0].toUpperCase();
      if (c === '*IF' && (ff[4] || '').toUpperCase() === 'THEN') depth++;
      else if (c === '*ENDIF') { if (depth === 0) { marks.push({ i: i, c: c }); break; } depth--; }
      else if (depth === 0 && (c === '*ELSEIF' || c === '*ELSE')) marks.push({ i: i, c: c, f: ff });
    }
    if ((f[4] || '').toUpperCase() !== 'THEN') throw new ApdlError('*IF 는 THEN 형식만 지원 (*if,a,gt,b,then … *endif)');
    if (!marks.length || marks[marks.length - 1].c !== '*ENDIF') throw new ApdlError('*IF 에 맞는 *ENDIF 가 없음');
    if (test(f)) return pc + 1;
    for (var k = 0; k < marks.length; k++) {
      if (marks[k].c === '*ELSEIF' && test(marks[k].f)) return marks[k].i + 1;
      if (marks[k].c === '*ELSE') return marks[k].i + 1;
      if (marks[k].c === '*ENDIF') return marks[k].i + 1;
    }
    return pc + 1;
  };
  Engine.prototype.split = function (t) { // 괄호 안의 쉼표는 나누지 않음
    var out = [], cur = '', d = 0;
    for (var i = 0; i < t.length; i++) { var c = t[i]; if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; }
    out.push(cur.trim()); return out;
  };
  Engine.prototype.num = function (s, def) {
    if (s === undefined || s === null || String(s).trim() === '') return def === undefined ? 0 : def;
    return new Expr(this).eval(String(s));
  };
  Engine.prototype.lab = function (s) { return (s || '').trim().toUpperCase(); };

  Engine.prototype.exec = function (cmd, f) {
    var self = this, N = function (i, d) { return self.num(f[i], d); }, S = function (i) { return self.lab(f[i]); };
    var c4 = cmd.replace(/^\//, '/');
    var h = this.handlers[cmd] || this.handlers[cmd.slice(0, 4)] || this.alias(cmd);
    if (!h) { this.warn(cmd + ' 명령은 이 연습기에서 지원하지 않아 건너뜀'); return; }
    h.call(this, f, N, S);
  };
  Engine.prototype.alias = function (cmd) {
    var full = { SECO: 'SECOFFSET', SECD: 'SECDATA', SECT: 'SECTYPE', SECN: 'SECNUM' };
    return this.handlers[full[cmd.slice(0, 4)]];
  };

  // 선택 집합
  Engine.prototype.selNodes = function () { var self = this; return Object.keys(this.nodes).map(Number).filter(function (n) { return !self.nsel || self.nsel[n]; }).sort(function (a, b) { return a - b; }); };
  Engine.prototype.selElems = function () { var self = this; return Object.keys(this.elems).map(Number).filter(function (n) { return !self.esel || self.esel[n]; }).sort(function (a, b) { return a - b; }); };
  Engine.prototype.range = function (f, i, all) { // NODE, NEND, NINC 형태
    var a = this.lab(f[i]);
    if (a === 'ALL') return all();
    var n1 = this.num(f[i]), n2 = f[i + 1] ? this.num(f[i + 1]) : n1, inc = f[i + 2] ? this.num(f[i + 2]) : 1, out = [];
    for (var n = n1; inc > 0 ? n <= n2 : n >= n2; n += inc) out.push(Math.round(n));
    return out;
  };

  Engine.prototype.addNode = function (id, g, T) { this.nodes[id] = { x: g, T: T || null }; this.lastNodes.push(id); if (this.lastNodes.length > 2) this.lastNodes.shift(); };
  Engine.prototype.addElem = function (id, nodes, extra) {
    var et = this.ets[this.att.type];
    if (!et) throw new ApdlError('요소 타입 ' + this.att.type + ' 이 정의되지 않음 (et 먼저)');
    nodes.forEach(function (n) { if (!this.nodes[n]) throw new ApdlError('요소에 쓰인 노드 ' + n + ' 가 없음'); }, this);
    var e = { n: nodes, type: this.att.type, mat: this.att.mat, real: this.att.real, sec: this.att.secnum, k: null };
    if (et.name === 'BEAM188' && nodes.length >= 3) { e.k = this.nodes[nodes[2]].x.slice(); e.kn = nodes[2]; e.n = nodes.slice(0, 2); }
    if (extra) for (var k in extra) e[k] = extra[k];
    this.elems[id] = e; return id;
  };

  // ---------- 면 (polybool) ----------
  Engine.prototype.PB = function () {
    var pb = (typeof PolyBool !== 'undefined') ? PolyBool : (root && root.PolyBool);
    if (!pb) throw new ApdlError('면 Boolean 라이브러리를 불러오지 못함 (인터넷 연결 확인)');
    return pb;
  };
  Engine.prototype.wpPoly = function (pts) { var self = this; return pts.map(function (p) { var g = self.wpToGlobal(p[0], p[1]); return [g[0], g[1]]; }); };
  Engine.prototype.newArea = function (regions) { var id = lowestFree(this.areas); this.areas[id] = { regions: regions }; return id; };
  Engine.prototype.areaField = function (fld, except) { // 한 칸: 번호 또는 ALL
    var a = this.lab(fld);
    if (a === 'ALL') return Object.keys(this.areas).map(Number).filter(function (n) { return except.indexOf(n) < 0; });
    var n = this.num(fld); if (!this.areas[n]) throw new ApdlError('면 ' + n + ' 없음 (aplot 으로 면 번호 확인)'); return [n];
  };
  Engine.prototype.areaList = function (f, i) { // 여러 칸
    if (this.lab(f[i]) === 'ALL') return this.areaField('ALL', []);
    var ids = []; for (var k = i; k < f.length; k++) if (f[k] !== '' && f[k] !== undefined) ids = ids.concat(this.areaField(f[k], []));
    return ids;
  };

  // ---------- 명령들 ----------
  var H = {};
  Engine.prototype.handlers = H;
  ['/PREP7', '/SOLU', '/POST1', 'FINISH', '/CLEAR'].forEach(function (c) { H[c] = function () { this.proc = c; if (c === '/CLEAR') this.reset(); }; });
  H['/SOLUTION'] = H['/SOLU'];
  H['/TITLE'] = function (f) { this.title = f.slice(1).join(','); };
  ['/COM', '/PSYMB', '/PBC', '/PSF', '/ESHAPE', '/VIEW', '/REPLOT', '/AUTO', '/DIST', '/ANGLE', '/FOCUS', '/UNITS', 'ANTYPE', 'SAVE', 'RESUME', 'SLIST', 'ELIST', 'NLIST', 'KLIST', 'LLIST', 'ALIST', 'DLIST', 'FLIST', 'SFLIST', 'SFELIST', 'WPSTYL', 'OUTRES', 'SET', 'RSYS', 'ESORT', 'BOPTN', 'KEYW', '/SHOW', '/EOF', 'PLLS', 'SECPLOT', 'MSHAPE', 'MSHKEY', '/PREP', 'NUMSTR'].forEach(function (c) { H[c] = function () { }; });
  H['/PNUM'] = function (f, N, S) { this.pnum[S(1)] = N(2) === 1; };
  H['*AFUN'] = function (f, N, S) { this.afunDeg = S(1) === 'DEG'; };
  H['*SET'] = function (f, N) { this.params[this.lab(f[1])] = N(2); };
  H['*STAT'] = function (f) { var self = this, ks = f[1] ? [this.lab(f[1])] : Object.keys(this.params); this.log(''); this.log(' PARAMETER STATUS'); ks.forEach(function (k) { self.log('   ' + k + ' = ' + fmt(self.params[k])); }); };
  H['*GET'] = function (f, N, S) {
    var par = S(1), ent = S(2), num = f[3] ? N(3) : 0, it1 = S(4), c1 = S(5), v;
    if (ent === 'NODE' && it1 === 'U') v = this.nodeResult(num)['XYZ'.indexOf(c1)] ;
    else if (ent === 'NODE' && it1 === 'ROT') v = this.nodeResult(num)[3 + 'XYZ'.indexOf(c1)];
    else if (ent === 'NODE' && it1 === 'LOC') v = this.inActive(this.nodeXYZ(num))['XYZ'.indexOf(c1)];
    else if (ent === 'NODE' && it1 === 'RF') { var r = this.reactionOf(num); v = r ? r[FLAB[c1]] : 0; }
    else if (ent === 'NODE' && it1 === 'COUNT') v = this.selNodes().length;
    else if (ent === 'NODE' && it1 === 'NUM') v = c1 === 'MIN' ? Math.min.apply(null, this.selNodes()) : maxKey(this.nodes);
    else if (ent === 'ELEM' && it1 === 'COUNT') v = this.selElems().length;
    else if (ent === 'ELEM' && it1 === 'NUM') v = maxKey(this.elems);
    else if (ent === 'ELEM' && it1 === 'ETAB') { var t = this.etab[c1]; if (!t) throw new ApdlError('요소 표 ' + c1 + ' 없음'); v = t.vals[num] || 0; }
    else if (ent === 'AREA' && it1 === 'NUM') v = c1 === 'MIN' ? Math.min.apply(null, Object.keys(this.areas).map(Number)) : maxKey(this.areas);
    else if (ent === 'AREA' && it1 === 'COUNT') v = Object.keys(this.areas).length;
    else if (ent === 'KP' && it1 === 'NUM') v = maxKey(this.kps);
    else if (ent === 'LINE' && it1 === 'NUM') v = maxKey(this.lines);
    else if (ent === 'ACTIVE' && it1 === 'CSYS') v = this.acs;
    else throw new ApdlError('*GET 의 이 항목은 지원하지 않음: ' + [ent, it1, c1].join(','));
    if (typeof v !== 'number' || isNaN(v)) throw new ApdlError('*GET 값을 구할 수 없음 (해석 전이거나 잘못된 번호)');
    this.params[par] = v;
  };

  // 요소·단면·재료
  H.ET = function (f, N, S) {
    var name = S(2).replace(/^LINK$/, 'LINK180');
    if (/^\d+$/.test(name)) name = { '180': 'LINK180', '188': 'BEAM188', '182': 'PLANE182' }[name] || name;
    var ok = { LINK180: 1, BEAM188: 1, PLANE182: 1, PLANE183: 1 };
    if ({ LINK1: 1, LINK8: 1, BEAM3: 1, PLANE42: 1, COMBIN14: 1, BEAM4: 1 }[name]) throw new ApdlError(name + ' 은 옛 요소(또는 실상수 R 필요)라 지원하지 않음 → LINK180 / BEAM188 / PLANE182 + sectype, secdata 로 바꿔 쓸 것');
    if (!ok[name]) throw new ApdlError('지원하지 않는 요소: ' + name);
    if (name === 'PLANE183') { this.warn('PLANE183 은 PLANE182 처럼 4절점으로만 다룸'); name = 'PLANE182'; }
    this.ets[N(1)] = { name: name, kop: [0, N(3), N(4), N(5), N(6), N(7), N(8)] };
  };
  H.KEYOPT = function (f, N) { var et = this.ets[N(1)]; if (!et) throw new ApdlError('요소 타입 ' + N(1) + ' 없음'); et.kop[N(2)] = N(3); };
  H.SECTYPE = function (f, N, S) {
    var type = S(2), sub = S(3) || (type === 'LINK' ? '' : 'RECT');
    if (type !== 'BEAM' && type !== 'LINK') throw new ApdlError('sectype 종류는 BEAM, LINK 만 지원');
    this.secs[N(1)] = { type: type, sub: sub, data: [], off: 'CENT' }; this.curSec = N(1);
  };
  H.SECDATA = function (f, N) { var s = this.secs[this.curSec]; if (!s) throw new ApdlError('secdata 앞에 sectype 이 없음'); s.data = f.slice(1).map(function (x, i) { return x === '' ? 0 : N(i + 1); }); };
  H.SECOFFSET = function (f, N, S) { var s = this.secs[this.curSec]; if (!s) throw new ApdlError('secoffset 앞에 sectype 이 없음'); s.off = S(1) || 'CENT'; s.offyz = [N(2), N(3)]; if (s.off !== 'CENT') this.warn('SECOFFSET(' + s.off + ')은 그림에만 쓰고 계산에는 반영하지 않음 (노드는 단면 도심으로 계산)'); };
  H.SECNUM = function (f, N) { this.att.secnum = N(1, 1); };
  H.TYPE = function (f, N) { this.att.type = N(1, 1); };
  H.MAT = function (f, N) { this.att.mat = N(1, 1); };
  H.REAL = function (f, N) { this.att.real = N(1, 1); };
  H.R = function () { throw new ApdlError('실상수 R 은 지원하지 않음 (수업 방식: sectype / secdata 사용)'); };
  H.MP = function (f, N, S) { var m = this.mats[N(2)] || (this.mats[N(2)] = {}), lab = S(1); if (lab === 'NUXY') lab = 'PRXY'; if (lab === 'GXZ' || lab === 'GYZ') lab = lab; m[lab] = N(3); };

  // 좌표계·작업평면
  H.CSYS = function (f, N) { var k = N(1); if (k === 4) { this.cs[4] = { type: 0, o: this.wp.o.slice(), R: this.wp.R }; } if (!this.cs[k]) throw new ApdlError('좌표계 ' + k + ' 없음'); this.acs = k; };
  H.LOCAL = function (f, N) { var k = N(1); if (k <= 10) throw new ApdlError('local 좌표계 번호는 11 이상'); var t = N(2); if (t > 2) throw new ApdlError('local 좌표계 종류는 0(직교), 1(원통), 2(구)만'); this.cs[k] = { type: t, o: [N(3), N(4), N(5)], R: rot3(N(6), N(7), N(8)) }; this.acs = k; };
  H.WPAVE = function (f, N) {
    var pts = [], self = this;
    for (var i = 1; i <= 7; i += 3) { if (i > 1 && f[i] === undefined && f[i + 1] === undefined && f[i + 2] === undefined) continue; if (i > 1 && !f[i] && !f[i + 1] && !f[i + 2]) continue; pts.push(self.toGlobal(self.acs, N(i), N(i + 1), N(i + 2))); }
    var o = [0, 0, 0]; pts.forEach(function (p) { o = add(o, scl(p, 1 / pts.length)); }); this.wp.o = o;
  };
  H.WPOFFS = function (f, N) { this.wp.o = add(this.wp.o, mv(this.wp.R, [N(1), N(2), N(3)])); };
  H.WPROTA = function (f, N) { this.wp.R = mm(this.wp.R, rot3(N(1), N(2), N(3))); };
  H.WPCSYS = function (f, N) { var k = f[2] === undefined || f[2] === '' ? this.acs : N(2); var cs = this.cs[k] || this.cs[0]; this.wp = { o: cs.o.slice(), R: cs.R }; };

  // 키포인트·선
  H.K = function (f, N) { var id = f[1] ? N(1) : lowestFree(this.kps); this.kps[id] = { x: this.toGlobal(this.acs, N(2), N(3), N(4)) }; };
  H.L = function (f, N) {
    var k1 = N(1), k2 = N(2), a = this.kpXYZ(k1), b = this.kpXYZ(k2), pts = [], cs = this.acs, la = this.fromGlobal(cs, a), lb = this.fromGlobal(cs, b);
    if (this.cs[cs].type === 1) { var d = lb[1] - la[1]; if (d > 180) lb[1] -= 360; if (d < -180) lb[1] += 360; for (var i = 0; i <= 48; i++) { var t = i / 48; pts.push(this.toGlobal(cs, la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t)); } }
    else pts = [a, b];
    var id = lowestFree(this.lines); this.lines[id] = { k: [k1, k2], pts: pts, ndiv: f[3] ? N(3) : 0 };
  };
  H.LSYMM = function (f, N, S) {
    var comp = 'XYZ'.indexOf(S(1)); if (comp < 0) throw new ApdlError('lsymm 의 Ncomp 는 X, Y, Z');
    if (this.cs[this.acs].type !== 0) throw new ApdlError('lsymm 은 활성 좌표계가 직교좌표계여야 함');
    var ids = this.lab(f[2]) === 'ALL' ? Object.keys(this.lines).map(Number) : this.range(f, 2, null), self = this, cs = this.acs;
    var mir = function (g) { var l = self.fromGlobal(cs, g); l[comp] = -l[comp]; return self.toGlobal(cs, l[0], l[1], l[2]); };
    ids.forEach(function (id) {
      var Ln = self.lines[id]; if (!Ln) return;
      var ks = Ln.k.map(function (k) { var nk = lowestFree(self.kps); self.kps[nk] = { x: mir(self.kps[k].x) }; return nk; });
      self.lines[lowestFree(self.lines)] = { k: ks, pts: Ln.pts.map(mir), ndiv: Ln.ndiv, att: Ln.att };
    });
  };
  H.NUMMRG = function (f, N, S) {
    var what = S(1); if (what !== 'KP' && what !== 'ALL') { if (what === 'NODE') return this.mergeNodes(); this.warn('nummrg,' + what + ' 는 건너뜀'); return; }
    var ids = Object.keys(this.kps).map(Number).sort(function (a, b) { return a - b; }), map = {}, self = this;
    ids.forEach(function (k, i) { for (var j = 0; j < i; j++) { var o = ids[j]; if (!map[o] && norm(sub(self.kps[k].x, self.kps[o].x)) < 1e-4) { map[k] = o; break; } } });
    for (var k in map) delete this.kps[k];
    for (var l in this.lines) this.lines[l].k = this.lines[l].k.map(function (k) { return map[k] || k; });
    if (what === 'ALL') this.mergeNodes();
  };
  Engine.prototype.mergeNodes = function () {
    var ids = Object.keys(this.nodes).map(Number).sort(function (a, b) { return a - b; }), map = {}, self = this;
    ids.forEach(function (n, i) { for (var j = 0; j < i; j++) { var o = ids[j]; if (!map[o] && norm(sub(self.nodes[n].x, self.nodes[o].x)) < 1e-4) { map[n] = o; break; } } });
    for (var n in map) delete this.nodes[n];
    for (var e in this.elems) this.elems[e].n = this.elems[e].n.map(function (n) { return map[n] || n; });
  };
  H.LATT = function (f, N) { var att = { mat: N(1, 1), real: N(2, 1), type: N(3, 1), kb: f[5] ? N(5) : 0, sec: N(7, 1) }; for (var l in this.lines) this.lines[l].att = att; };
  H.ESIZE = function (f, N) { this.esizeVal = { size: N(1), ndiv: N(2) }; };
  H.LESIZE = function (f, N, S) { var ids = S(1) === 'ALL' ? Object.keys(this.lines) : [N(1)], self = this; ids.forEach(function (l) { var Ln = self.lines[l]; if (!Ln) throw new ApdlError('선 ' + l + ' 없음'); Ln.size = N(2); Ln.ndiv = N(4); }); };
  H.LMESH = function (f, N, S) {
    var ids = S(1) === 'ALL' ? Object.keys(this.lines).map(Number).sort(function (a, b) { return a - b; }) : this.range(f, 1, null), self = this;
    this.kpNode = this.kpNode || {};
    ids.forEach(function (id) {
      var Ln = self.lines[id]; if (!Ln) throw new ApdlError('선 ' + id + ' 없음'); if (Ln.meshed) return;
      var len = 0, seg = [0]; for (var i = 1; i < Ln.pts.length; i++) { len += norm(sub(Ln.pts[i], Ln.pts[i - 1])); seg.push(len); }
      var nd = Ln.ndiv || (Ln.size ? Math.max(1, Math.round(len / Ln.size)) : 0) || self.esizeVal.ndiv || (self.esizeVal.size ? Math.max(1, Math.round(len / self.esizeVal.size)) : 0);
      if (!nd) { nd = 1; self.warn('esize 가 없어 선 하나를 요소 1개로 메쉬함'); }
      var at = function (s) { for (var i = 1; i < seg.length; i++) if (s <= seg[i] + 1e-12) { var t = (s - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1); return add(Ln.pts[i - 1], scl(sub(Ln.pts[i], Ln.pts[i - 1]), t)); } return Ln.pts[Ln.pts.length - 1]; };
      var nodeAtKp = function (k) { if (self.kpNode[k] && self.nodes[self.kpNode[k]]) return self.kpNode[k]; var nn = maxKey(self.nodes) + 1; self.addNode(nn, self.kps[k].x.slice()); self.kpNode[k] = nn; return nn; };
      var n0 = nodeAtKp(Ln.k[0]), nl = nodeAtKp(Ln.k[1]), list = [n0];
      for (var j = 1; j < nd; j++) { var nn = maxKey(self.nodes) + 1; self.addNode(nn, at(len * j / nd)); list.push(nn); }
      list.push(nl);
      var a = Ln.att, sv = { type: self.att.type, mat: self.att.mat, real: self.att.real, secnum: self.att.secnum };
      if (a) { self.att.type = a.type; self.att.mat = a.mat; self.att.real = a.real; self.att.secnum = a.sec; }
      for (var q = 0; q < nd; q++) { var ex = (a && a.kb) ? { k: self.kpXYZ(a.kb).slice() } : null; self.addElem(maxKey(self.elems) + 1, [list[q], list[q + 1]], ex); }
      self.att = sv; Ln.meshed = true;
    });
  };
  H.LCLEAR = function () { this.warn('lclear 는 건너뜀'); };

  // 면 (작업평면 기준)
  H.RECTNG = function (f, N) { var x1 = N(1), x2 = N(2), y1 = N(3), y2 = N(4); this.newArea([this.wpPoly([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])]); };
  H.BLC4 = function (f, N) { var x = N(1), y = N(2), w = N(3), h = N(4); this.newArea([this.wpPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])]); };
  H.BLC5 = function (f, N) { var x = N(1), y = N(2), w = N(3) / 2, h = N(4) / 2; this.newArea([this.wpPoly([[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]])]); };
  H.PCIRC = function (f, N) { this.circ(N(1), N(2), f[3] ? N(3) : 0, f[4] ? N(4) : 360); };
  H.CYL4 = function (f, N) { var sv = this.wp.o; this.wp.o = this.wpToGlobal(N(1), N(2)); this.circ(N(3), N(5), f[4] ? N(4) : 0, f[6] ? N(6) : 360); this.wp.o = sv; };
  Engine.prototype.circ = function (r1, r2, t1, t2) {
    r1 = Math.abs(r1); r2 = Math.abs(r2); var ri = Math.min(r1, r2), ro = Math.max(r1, r2);
    if (!ro) throw new ApdlError('pcirc 반지름이 0'); if (ri === ro) ri = 0;
    var a = Math.min(t1, t2), b = Math.max(t1, t2); if (b - a > 360) b = a + 360;
    var n = Math.max(8, Math.ceil((b - a) / 3)), out = [], inn = [], i;
    for (i = 0; i <= n; i++) { var t = (a + (b - a) * i / n) * DEG; out.push([ro * Math.cos(t), ro * Math.sin(t)]); if (ri) inn.push([ri * Math.cos(t), ri * Math.sin(t)]); }
    var full = Math.abs(b - a - 360) < 1e-9, regions;
    if (full) { out.pop(); inn.pop(); regions = ri ? [this.wpPoly(out), this.wpPoly(inn.reverse())] : [this.wpPoly(out)]; }
    else if (ri) regions = [this.wpPoly(out.concat(inn.reverse()))];
    else { out.push([0, 0]); regions = [this.wpPoly(out)]; }
    this.newArea(regions);
  };
  H.AADD = function (f) {
    var ids = this.areaList(f, 1), PB = this.PB(), self = this; if (ids.length < 2) return;
    var r = { regions: this.areas[ids[0]].regions, inverted: false };
    for (var i = 1; i < ids.length; i++) r = PB.union(r, { regions: this.areas[ids[i]].regions, inverted: false });
    var id = this.newArea(r.regions); ids.forEach(function (k) { delete self.areas[k]; });
  };
  H.ASBA = function (f, N, S) {
    var a1 = this.areaField(f[1], []), a2 = this.areaField(f[2], a1), PB = this.PB(), self = this;
    var keep1 = S(4) === 'KEEP', keep2 = S(5) === 'KEEP', cut = null;
    a2.forEach(function (k) { var p = { regions: self.areas[k].regions, inverted: false }; cut = cut ? PB.union(cut, p) : p; });
    var made = [];
    a1.forEach(function (k) { var r = cut ? PB.difference({ regions: self.areas[k].regions, inverted: false }, cut) : { regions: self.areas[k].regions }; made.push(r.regions); });
    var newIds = made.map(function (rg) { if (!rg.length) return 0; var id = lowestFree(self.areas); self.areas[id] = { regions: rg, pending: true }; return id; });
    if (!keep1) a1.forEach(function (k) { if (newIds.indexOf(k) < 0) delete self.areas[k]; });
    if (!keep2) a2.forEach(function (k) { if (newIds.indexOf(k) < 0) delete self.areas[k]; });
    newIds.forEach(function (id) { if (id) delete self.areas[id].pending; });
  };
  H.ADELE = function (f) { var self = this; this.areaList(f, 1).forEach(function (k) { delete self.areas[k]; }); };
  H.AMESH = function () { this.warn('amesh(면 메쉬)는 아직 지원하지 않음 — 형상(aplot)만 확인 가능. 2025-1 처럼 n / ngen / e / egen 으로 만든 요소는 그릴 수 있음'); };
  ['AOVLAP', 'AGLUE', 'APTN', 'ARSYM', 'AGEN', 'AL', 'A', 'KGEN', 'LGEN'].forEach(function (c) { H[c] = function () { throw new ApdlError(c + ' 은 이 연습기에서 아직 지원하지 않음'); }; });

  // 노드·요소
  H.N = function (f, N) {
    var id = f[1] ? N(1) : maxKey(this.nodes) + 1, g = this.toGlobal(this.acs, N(2), N(3), N(4)), T = null;
    if (N(5) || N(6) || N(7)) T = mm(this.axesAt(this.acs, g), rot3(N(5), N(6), N(7)));
    this.addNode(id, g, T);
  };
  H.E = function (f, N) { var ns = []; for (var i = 1; i < f.length; i++) if (f[i] !== '') ns.push(N(i)); this.addElem(maxKey(this.elems) + 1, ns); };
  H.EN = function (f, N) { var ns = []; for (var i = 2; i < f.length; i++) if (f[i] !== '') ns.push(N(i)); this.addElem(N(1), ns); };
  H.FILL = function (f, N) {
    var n1 = f[1] ? N(1) : this.lastNodes[0], n2 = f[2] ? N(2) : this.lastNodes[1];
    if (!this.nodes[n1] || !this.nodes[n2]) throw new ApdlError('fill: 노드 ' + n1 + ', ' + n2 + ' 가 없음');
    var nf = f[3] ? N(3) : n2 - n1 - 1, ninc = f[5] ? N(5) : (n2 - n1) / (nf + 1), ns = f[4] ? N(4) : n1 + ninc;
    var a = this.inActive(this.nodes[n1].x), b = this.inActive(this.nodes[n2].x);
    if (this.cs[this.acs].type === 1) { var d = b[1] - a[1]; if (d > 180) b[1] -= 360; if (d < -180) b[1] += 360; }
    for (var i = 1; i <= nf; i++) { var t = i / (nf + 1), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; this.nodes[Math.round(ns + (i - 1) * ninc)] = { x: this.toGlobal(this.acs, p[0], p[1], p[2]), T: null }; }
  };
  H.NGEN = function (f, N, S) {
    var it = N(1), inc = N(2), ids = S(3) === 'ALL' ? this.selNodes() : this.range(f, 3, null), d = [N(6), N(7), N(8)], self = this;
    ids.forEach(function (n) {
      var nd = self.nodes[n]; if (!nd) return; var l = self.inActive(nd.x);
      for (var i = 1; i < it; i++) { self.nodes[n + i * inc] = { x: self.toGlobal(self.acs, l[0] + d[0] * i, l[1] + d[1] * i, l[2] + d[2] * i), T: nd.T }; }
    });
  };
  H.EGEN = function (f, N, S) {
    var it = N(1), ninc = N(2), ids = S(3) === 'ALL' ? this.selElems() : this.range(f, 3, null), self = this, made = [];
    if (!f[3]) ids = [maxKey(this.elems)];
    for (var i = 1; i < it; i++) ids.forEach(function (e) {
      var src = self.elems[e]; if (!src) throw new ApdlError('egen: 요소 ' + e + ' 없음');
      var ns = src.n.map(function (n) { return n + i * ninc; });
      ns.forEach(function (n) { if (!self.nodes[n]) throw new ApdlError('egen: 노드 ' + n + ' 가 없음 (먼저 ngen 등으로 노드를 만들어야 함)'); });
      var id = maxKey(self.elems) + 1; self.elems[id] = { n: ns, type: src.type + N(7) * i, mat: src.mat + N(6) * i, real: src.real, sec: src.sec + N(10) * i, k: src.k };
    });
  };
  H.NMODIF = function (f, N) {
    var n = N(1), nd = this.nodes[n]; if (!nd) throw new ApdlError('노드 ' + n + ' 없음');
    var l = this.inActive(nd.x); for (var i = 0; i < 3; i++) if (f[2 + i] !== undefined && f[2 + i] !== '') l[i] = N(2 + i);
    nd.x = this.toGlobal(this.acs, l[0], l[1], l[2]);
    if (f[5] || f[6] || f[7]) nd.T = mm(this.axesAt(this.acs, nd.x), rot3(N(5), N(6), N(7)));
  };
  H.NROTAT = function (f, N, S) { var self = this, ids = S(1) === 'ALL' ? this.selNodes() : this.range(f, 1, null); ids.forEach(function (n) { var nd = self.nodes[n]; if (!nd) throw new ApdlError('노드 ' + n + ' 없음'); nd.T = self.axesAt(self.acs, nd.x); }); };
  H.NDELE = function (f, N, S) { var self = this; (S(1) === 'ALL' ? this.selNodes() : this.range(f, 1, null)).forEach(function (n) { delete self.nodes[n]; }); };
  H.EDELE = function (f, N, S) { var self = this; (S(1) === 'ALL' ? this.selElems() : this.range(f, 1, null)).forEach(function (n) { delete self.elems[n]; }); };
  H.EMODIF = function (f, N, S) { var self = this, what = S(2), v = N(3); (S(1) === 'ALL' ? this.selElems() : [N(1)]).forEach(function (e) { var el = self.elems[e]; if (!el) return; if (what === 'MAT') el.mat = v; else if (what === 'TYPE') el.type = v; else if (what === 'SECNUM' || what === 'SEC') el.sec = v; else if (what === 'REAL') el.real = v; }); };

  // 선택
  H.NSEL = function (f, N, S) { this.select('n', f, N, S); };
  H.ESEL = function (f, N, S) { this.select('e', f, N, S); };
  H.ALLSEL = function () { this.nsel = null; this.esel = null; };
  Engine.prototype.select = function (w, f, N, S) {
    var set = w === 'n' ? this.nodes : this.elems, cur = w === 'n' ? this.nsel : this.esel, type = S(1), item = S(2), self = this;
    var all = Object.keys(set).map(Number), curIds = all.filter(function (k) { return !cur || cur[k]; });
    if (type === 'ALL') { if (w === 'n') this.nsel = null; else this.esel = null; return; }
    if (type === 'NONE') { if (w === 'n') this.nsel = {}; else this.esel = {}; return; }
    var lo = f[4] !== undefined && f[4] !== '' ? N(4) : null, hi = f[5] !== undefined && f[5] !== '' ? N(5) : lo, tol = 1e-6 * (Math.abs(lo || 1) + 1);
    var test = function (k) {
      var v;
      if (item === 'NODE' || item === 'ELEM' || item === '') v = k;
      else if (item === 'LOC') v = self.inActive(self.nodes[k].x)['XYZ'.indexOf(S(3))];
      else if (item === 'TYPE') v = set[k].type; else if (item === 'MAT') v = set[k].mat; else if (item === 'SEC' || item === 'SECN') v = set[k].sec; else if (item === 'REAL') v = set[k].real;
      else throw new ApdlError((w === 'n' ? 'nsel' : 'esel') + ' 의 항목 ' + item + ' 은 지원하지 않음');
      return v >= lo - tol && v <= hi + tol;
    };
    var pick = all.filter(test), res = {};
    if (type === 'S') pick.forEach(function (k) { res[k] = 1; });
    else if (type === 'R') curIds.filter(test).forEach(function (k) { res[k] = 1; });
    else if (type === 'A') { curIds.forEach(function (k) { res[k] = 1; }); pick.forEach(function (k) { res[k] = 1; }); }
    else if (type === 'U') curIds.filter(function (k) { return !test(k); }).forEach(function (k) { res[k] = 1; });
    else if (type === 'INVE') all.filter(function (k) { return curIds.indexOf(k) < 0; }).forEach(function (k) { res[k] = 1; });
    else throw new ApdlError('선택 종류 ' + type + ' 은 지원하지 않음');
    if (w === 'n') this.nsel = res; else this.esel = res;
  };

  // 하중·경계조건
  function dofIdx(l) { var i = DOFS.indexOf(l); if (i < 0) throw new ApdlError('자유도 이름이 잘못됨: ' + l); return i; }
  H.D = function (f, N, S) {
    var self = this, labs = [S(2)].concat([7, 8, 9, 10, 11].map(S).filter(Boolean)), val = N(3);
    var ids = S(1) === 'ALL' ? this.selNodes() : (f[5] ? this.range([0, f[1], f[5], f[6]], 1, null) : [N(1)]);
    ids.forEach(function (n) { if (!self.nodes[n]) throw new ApdlError('d: 노드 ' + n + ' 없음'); var d = self.D[n] || (self.D[n] = {}); labs.forEach(function (l) { if (l === 'ALL') DOFS.forEach(function (x, i) { d[i] = val; }); else d[dofIdx(l)] = val; }); });
  };
  H.DDELE = function (f, N, S) { var self = this; (S(1) === 'ALL' ? Object.keys(this.D) : [N(1)]).forEach(function (n) { if (S(2) && S(2) !== 'ALL' && self.D[n]) delete self.D[n][dofIdx(S(2))]; else delete self.D[n]; }); };
  H.F = function (f, N, S) {
    var self = this, l = S(2), i = FLAB[l]; if (i === undefined) throw new ApdlError('하중 이름이 잘못됨: ' + l + ' (FX FY FZ MX MY MZ)');
    var ids = S(1) === 'ALL' ? this.selNodes() : (f[5] ? this.range([0, f[1], f[5], f[6]], 1, null) : [N(1)]);
    ids.forEach(function (n) { if (!self.nodes[n]) throw new ApdlError('f: 노드 ' + n + ' 없음'); (self.F[n] || (self.F[n] = {}))[i] = N(3); });
  };
  H.FDELE = function (f, N, S) { var self = this; (S(1) === 'ALL' ? Object.keys(this.F) : [N(1)]).forEach(function (n) { delete self.F[n]; }); };
  H.DK = function (f, N, S) { var k = N(1), labs = [S(2)].concat([6, 7, 8, 9, 10].map(S).filter(Boolean)), d = this.DK[k] || (this.DK[k] = {}), v = N(3); if (!this.kps[k]) throw new ApdlError('dk: 키포인트 ' + k + ' 없음'); labs.forEach(function (l) { if (l === 'ALL') DOFS.forEach(function (x, i) { d[i] = v; }); else d[dofIdx(l)] = v; }); };
  H.FK = function (f, N, S) { var k = N(1), i = FLAB[S(2)]; if (i === undefined) throw new ApdlError('하중 이름이 잘못됨: ' + S(2)); if (!this.kps[k]) throw new ApdlError('fk: 키포인트 ' + k + ' 없음'); (this.FK[k] || (this.FK[k] = {}))[i] = N(3); };
  H.SFBEAM = function (f, N, S) {
    var self = this, lk = f[2] ? N(2) : 1, ids = S(1) === 'ALL' ? this.selElems() : [N(1)];
    if (S(3) && S(3) !== 'PRES') throw new ApdlError('sfbeam 하중 이름은 PRES');
    var vi = N(4), vj = f[5] === undefined || f[5] === '' ? vi : N(5), io = N(8), jo = f[9] === undefined || f[9] === '' ? 0 : N(9), lr = N(10);
    ids.forEach(function (e) { var el = self.elems[e]; if (!el) throw new ApdlError('sfbeam: 요소 ' + e + ' 없음'); if (self.ets[el.type].name !== 'BEAM188') return; (self.SFB[e] || (self.SFB[e] = {}))[lk] = { vi: vi, vj: vj, io: io, jo: jo, lr: lr }; });
  };
  H.SFEDELE = function (f, N, S) { var self = this; (S(1) === 'ALL' ? Object.keys(this.SFB) : [N(1)]).forEach(function (e) { if (!f[2] || S(2) === 'ALL') delete self.SFB[e]; else if (self.SFB[e]) delete self.SFB[e][N(2)]; }); };
  H.SFBDELE = H.SFEDELE;
  H.ACEL = function () { this.warn('acel(중력)은 지원하지 않음'); };

  // ---------- 해석 ----------
  H.SOLVE = function () { this.solve(); };
  Engine.prototype.matOf = function (e) {
    var m = this.mats[e.mat]; if (!m || !m.EX) throw new ApdlError('재료 ' + e.mat + ' 의 EX 가 없음 (mp,ex,' + e.mat + ',값)');
    var nu = m.PRXY === undefined ? 0.3 : m.PRXY; return { E: m.EX, nu: nu, G: m.GXY || m.EX / (2 * (1 + nu)) };
  };
  Engine.prototype.secOf = function (e, kind) {
    var s = this.secs[e.sec]; if (!s) throw new ApdlError('요소에 쓰인 단면 ' + e.sec + ' 이 없음 (sectype, secdata)');
    if (kind === 'LINK' && s.type !== 'LINK') throw new ApdlError('LINK180 요소에 BEAM 단면(' + e.sec + ')이 지정됨 → sectype,' + e.sec + ',link');
    if (kind === 'BEAM' && s.type !== 'BEAM') throw new ApdlError('BEAM188 요소에 LINK 단면(' + e.sec + ')이 지정됨 → sectype,' + e.sec + ',beam,…');
    if (!s.data.length) throw new ApdlError('단면 ' + e.sec + ' 에 secdata 가 없음');
    if (!s.props) s.props = secProps(s);
    return s.props;
  };
  Engine.prototype.beamAxes = function (e) {
    var a = this.nodes[e.n[0]].x, b = this.nodes[e.n[1]].x, x = unit(sub(b, a)), z, y;
    if (e.k) { var v = sub(e.k, a); z = sub(v, scl(x, dot(v, x))); if (norm(z) < 1e-12) throw new ApdlError('방향 노드 K 가 보 축 위에 있음'); z = unit(z); y = cross(z, x); }
    else { if (Math.abs(x[2]) > 1 - 1e-9) y = [0, 1, 0]; else y = unit(cross([0, 0, 1], x)); z = cross(x, y); }
    return { x: x, y: y, z: z, L: norm(sub(b, a)) };
  };
  Engine.prototype.solve = function () {
    var self = this, nodeDofs = {}, ids = Object.keys(this.elems).map(Number), r, c;
    if (!ids.length) throw new ApdlError('요소가 없음 — 해석할 모델이 없음');
    // 키포인트 하중·구속을 노드로
    this.kpNode = this.kpNode || {};
    var kpN = function (k) { var n = self.kpNode[k]; if (n && self.nodes[n]) return n; var best = self.nearest(self.nodes, self.kps[k].x); if (best && norm(sub(self.nodes[best].x, self.kps[k].x)) < 1e-6) return best; throw new ApdlError('키포인트 ' + k + ' 에 노드가 없음 (lmesh 먼저)'); };
    var D = JSON.parse(JSON.stringify(this.D)), F = JSON.parse(JSON.stringify(this.F));
    for (var k in this.DK) { var n = kpN(k); D[n] = D[n] || {}; for (var i in this.DK[k]) D[n][i] = this.DK[k][i]; }
    for (k in this.FK) { n = kpN(k); F[n] = F[n] || {}; for (i in this.FK[k]) F[n][i] = (F[n][i] || 0) + this.FK[k][i]; }
    // 자유도 활성화
    ids.forEach(function (eid) {
      var e = self.elems[eid], nm = self.ets[e.type].name;
      e.n.forEach(function (n) { var s = nodeDofs[n] || (nodeDofs[n] = {}); if (nm === 'PLANE182') { s[0] = s[1] = 1; } else { s[0] = s[1] = s[2] = 1; if (nm === 'BEAM188') s[3] = s[4] = s[5] = 1; } });
    });
    var map = {}, ndof = 0, nlist = Object.keys(nodeDofs).map(Number).sort(function (a, b) { return a - b; });
    nlist.forEach(function (n) { map[n] = []; for (var i = 0; i < 6; i++) map[n][i] = nodeDofs[n][i] ? ndof++ : -1; });
    if (ndof > 3000) throw new ApdlError('모델이 너무 큼 (자유도 ' + ndof + '개)');
    var K = new Array(ndof), R = new Float64Array(ndof); for (i = 0; i < ndof; i++) K[i] = new Float64Array(ndof);
    var Tn = function (n) { return self.nodes[n].T; };
    // 요소 조립
    this.eInfo = {};
    ids.forEach(function (eid) {
      var e = self.elems[eid], nm = self.ets[e.type].name, ke, fe, dofs = [], T, info = { name: nm };
      if (nm === 'LINK180') {
        var p = self.secOf(e, 'LINK'), m = self.matOf(e), a = self.nodes[e.n[0]].x, b = self.nodes[e.n[1]].x, L = norm(sub(b, a)); if (!L) throw new ApdlError('요소 ' + eid + ' 의 길이가 0');
        var x = scl(sub(b, a), 1 / L), kk = m.E * p.A / L; ke = []; for (var r = 0; r < 6; r++) { ke.push([]); for (var c = 0; c < 6; c++) ke[r].push((r < 3 === c < 3 ? 1 : -1) * kk * x[r % 3] * x[c % 3]); }
        e.n.forEach(function (n) { for (var q = 0; q < 3; q++) dofs.push([n, q]); }); fe = null; info.x = x; info.L = L; info.EA = m.E * p.A; info.A = p.A;
      } else if (nm === 'BEAM188') {
        if (e.n.length < 2) throw new ApdlError('보 요소 ' + eid + ' 의 노드가 부족');
        var P = self.secOf(e, 'BEAM'), M = self.matOf(e), ax = self.beamAxes(e); if (!ax.L) throw new ApdlError('요소 ' + eid + ' 의 길이가 0');
        if (P.asec && !P.J) self.warn('ASEC 단면에 J(비틀림 상수)가 0 → 비틀림 강성이 없어 해석이 안 될 수 있음');
        var kl = beamK(M.E, M.G, P, ax.L, self.ets[e.type].kop[3]), Lm = [ax.x, ax.y, ax.z]; // 행 = 국부축
        var Tb = []; for (r = 0; r < 12; r++) { Tb.push(new Array(12).fill(0)); } for (var blk = 0; blk < 4; blk++) for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) Tb[blk * 3 + r][blk * 3 + c] = Lm[r][c];
        ke = matTKT(Tb, kl); var fl = beamLoad(self.SFB[eid], ax.L); fe = mtvN(Tb, fl);
        e.n.forEach(function (n) { for (var q = 0; q < 6; q++) dofs.push([n, q]); });
        info.Tb = Tb; info.kl = kl; info.fl = fl; info.P = P; info.ax = ax;
      } else if (nm === 'PLANE182') {
        if (e.n.length < 3) throw new ApdlError('PLANE182 요소 ' + eid + ' 는 노드 4개 (또는 3개) 필요');
        var Mp = self.matOf(e), ns = e.n.length === 3 ? e.n.concat([e.n[2]]) : e.n.slice(0, 4);
        ke = quadK(ns.map(function (n) { return self.nodes[n].x; }), Mp.E, Mp.nu, self.ets[e.type].kop[3]);
        ns.forEach(function (n) { dofs.push([n, 0]); dofs.push([n, 1]); }); fe = null;
      }
      // 노드 좌표계 회전 반영: k' = Λᵀ k Λ (Λ: 노드별 회전)
      var nd = dofs.length, Lam = dofs.some(function (d) { return Tn(d[0]); });
      if (Lam) { // global = T · nodal → k_nodal = Tᵀ k T (노드별 3×3 블록)
        var Tfull = []; for (r = 0; r < nd; r++) Tfull.push(new Array(nd).fill(0));
        for (r = 0; r < nd; r++) {
          var d0 = dofs[r], T3 = Tn(d0[0]);
          if (!T3 || nm === 'PLANE182') { Tfull[r][r] = 1; if (T3 && nm === 'PLANE182') { var b0 = r - d0[1]; Tfull[r][b0] = T3[d0[1]][0]; Tfull[r][b0 + 1] = T3[d0[1]][1]; Tfull[r][r] = T3[d0[1]][d0[1]]; } continue; }
          var bs = r - (d0[1] % 3); for (c = 0; c < 3; c++) Tfull[r][bs + c] = T3[d0[1] % 3][c];
        }
        ke = matTKT(Tfull, ke); if (fe) fe = mtvN(Tfull, fe); info.Tn = Tfull;
      }
      var gi = dofs.map(function (d) { return map[d[0]][d[1]]; });
      for (r = 0; r < nd; r++) { if (gi[r] < 0) continue; if (fe) R[gi[r]] += fe[r]; for (c = 0; c < nd; c++) if (gi[c] >= 0) K[gi[r]][gi[c]] += ke[r][c]; }
      info.dofs = dofs; info.gi = gi; info.ke = ke; info.fe = fe; self.eInfo[eid] = info;
    });
    var Fapp = new Float64Array(ndof); for (i = 0; i < ndof; i++) Fapp[i] = R[i];
    for (n in F) { if (!map[n]) { self.warn('노드 ' + n + ' 의 하중은 요소에 연결되지 않아 무시됨'); continue; } for (i in F[n]) { var g = map[n][i]; if (g < 0) { self.warn('노드 ' + n + ' 에는 ' + ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'][i] + ' 자유도가 없어 하중 무시'); continue; } Fapp[g] += F[n][i]; } }
    var fixed = new Int8Array(ndof), uval = new Float64Array(ndof);
    for (n in D) { if (!map[n]) continue; for (i in D[n]) { g = map[n][i]; if (g >= 0) { fixed[g] = 1; uval[g] = D[n][i]; } } }
    // 풀기 (가우스 소거, 피벗 검사)
    var free = []; for (i = 0; i < ndof; i++) if (!fixed[i]) free.push(i);
    var nf = free.length, A = new Array(nf), bvec = new Float64Array(nf);
    for (i = 0; i < nf; i++) { A[i] = new Float64Array(nf); var gi2 = free[i]; bvec[i] = Fapp[gi2]; for (var j = 0; j < ndof; j++) if (fixed[j] && uval[j]) bvec[i] -= K[gi2][j] * uval[j]; for (j = 0; j < nf; j++) A[i][j] = K[gi2][free[j]]; }
    var scale = 0; for (i = 0; i < nf; i++) scale = Math.max(scale, Math.abs(A[i][i]));
    for (var col = 0; col < nf; col++) {
      var piv = col, pv = Math.abs(A[col][col]); for (r = col + 1; r < nf; r++) if (Math.abs(A[r][col]) > pv) { pv = Math.abs(A[r][col]); piv = r; }
      if (pv < scale * 1e-11) { var who = self.dofName(map, free[col]); throw new ApdlError('해석 실패: 강체 운동 / 구속 부족 — ' + who + ' 에서 피벗이 0 (구속(d)을 더 주거나, 면외 자유도 UZ·ROTX·ROTY 를 구속할 것)'); }
      if (piv !== col) { var tmp = A[piv]; A[piv] = A[col]; A[col] = tmp; var tb = bvec[piv]; bvec[piv] = bvec[col]; bvec[col] = tb; }
      for (r = col + 1; r < nf; r++) { var fct = A[r][col] / A[col][col]; if (!fct) continue; for (c = col; c < nf; c++) A[r][c] -= fct * A[col][c]; bvec[r] -= fct * bvec[col]; }
    }
    var xs = new Float64Array(nf); for (r = nf - 1; r >= 0; r--) { var s = bvec[r]; for (c = r + 1; c < nf; c++) s -= A[r][c] * xs[c]; xs[r] = s / A[r][r]; }
    var U = new Float64Array(ndof); for (i = 0; i < ndof; i++) U[i] = uval[i]; for (i = 0; i < nf; i++) U[free[i]] = xs[i];
    var Rf = new Float64Array(ndof); for (i = 0; i < ndof; i++) if (fixed[i]) { var sm = 0; for (j = 0; j < ndof; j++) sm += K[i][j] * U[j]; Rf[i] = sm - Fapp[i]; }
    this.result = { map: map, U: U, Rf: Rf, fixed: fixed, F: F, Fapp: Fapp };
    this.log(''); this.log(' *** 해석 완료 *** 노드 ' + nlist.length + '개, 요소 ' + ids.length + '개, 자유도 ' + ndof + '개 (구속 ' + (ndof - nf) + '개)');
  };
  Engine.prototype.dofName = function (map, g) { for (var n in map) for (var i = 0; i < 6; i++) if (map[n][i] === g) return '노드 ' + n + ' ' + DOFS[i]; return '자유도 ' + g; };

  function matTKT(T, k) { var n = k.length, KT = [], out = [], i, j, m; for (i = 0; i < n; i++) { KT.push(new Array(n).fill(0)); for (j = 0; j < n; j++) { var s = 0; for (m = 0; m < n; m++) s += k[i][m] * T[m][j]; KT[i][j] = s; } } for (i = 0; i < n; i++) { out.push(new Array(n).fill(0)); for (j = 0; j < n; j++) { s = 0; for (m = 0; m < n; m++) s += T[m][i] * KT[m][j]; out[i][j] = s; } } return out; }
  function mtvN(T, v) { var n = v.length, o = new Array(n).fill(0); for (var i = 0; i < n; i++) for (var m = 0; m < n; m++) o[i] += T[m][i] * v[m]; return o; }
  function mvN(T, v) { var n = v.length, o = new Array(n).fill(0); for (var i = 0; i < n; i++) for (var m = 0; m < n; m++) o[i] += T[i][m] * v[m]; return o; }

  function beamK(E, G, P, L, kop3) { // Timoshenko 보 12×12 (국부 좌표)
    var k = []; for (var i = 0; i < 12; i++) k.push(new Array(12).fill(0));
    var EA = E * P.A / L, GJ = G * P.J / L;
    k[0][0] = k[6][6] = EA; k[0][6] = k[6][0] = -EA; k[3][3] = k[9][9] = GJ; k[3][9] = k[9][3] = -GJ;
    var bend = function (I, As, v1, t1, v2, t2, sg) {
      var phi = 12 * E * I / (G * As * L * L), c = E * I / ((1 + phi) * L * L * L);
      var a = 12 * c, b = 6 * c * L * sg, d = (4 + phi) * c * L * L, e = (2 - phi) * c * L * L;
      var S = [[a, b, -a, b], [b, d, -b, e], [-a, -b, a, -b], [b, e, -b, d]], id = [v1, t1, v2, t2];
      for (var r = 0; r < 4; r++) for (var q = 0; q < 4; q++) k[id[r]][id[q]] += S[r][q];
    };
    bend(P.Izz, P.Asy, 1, 5, 7, 11, 1);  // xy 평면 (v, θz)
    bend(P.Iyy, P.Asz, 2, 4, 8, 10, -1); // xz 평면 (w, θy)
    return k;
  }
  function beamLoad(sf, L) { // 국부 등가 절점하중 (12)
    var f = new Array(12).fill(0); if (!sf) return f;
    var gp = [-0.9061798459, -0.5384693101, 0, 0.5384693101, 0.9061798459], gw = [0.2369268851, 0.4786286705, 0.5688888889, 0.4786286705, 0.2369268851];
    for (var key in sf) {
      var s = sf[key], lk = +key, a = s.lr ? s.io * L : s.io, b, conc = s.jo === -1;
      b = conc ? a : L - (s.lr ? s.jo * L : s.jo);
      var add = function (x, q) {
        var t = x / L, N1 = 1 - 3 * t * t + 2 * t * t * t, N2 = L * (t - 2 * t * t + t * t * t), N3 = 3 * t * t - 2 * t * t * t, N4 = L * (-t * t + t * t * t);
        if (lk === 2) { f[1] -= q * N1; f[5] -= q * N2; f[7] -= q * N3; f[11] -= q * N4; }
        else if (lk === 1) { f[2] -= q * N1; f[4] += q * N2; f[8] -= q * N3; f[10] += q * N4; }
        else if (lk === 3) { f[0] += q * (1 - t); f[6] += q * t; }
        else if (lk === 4) { f[0] += q; } else if (lk === 5) { f[6] -= q; }
      };
      if (lk === 4 || lk === 5) { add(0, s.vi); continue; }
      if (conc) { add(a, s.vi); continue; }
      var len = b - a; if (len <= 0) continue;
      for (var g = 0; g < 5; g++) { var xg = a + (gp[g] + 1) / 2 * len, q = s.vi + (s.vj - s.vi) * (xg - a) / len; add(xg, q * gw[g] * len / 2); }
    }
    return f;
  }
  function quadK(X, E, nu, kop3) { // 2×2 가우스, 평면응력(기본) / 평면변형(KEYOPT3=2), 단위 두께
    var Dm, c;
    if (kop3 === 2) { c = E / ((1 + nu) * (1 - 2 * nu)); Dm = [[c * (1 - nu), c * nu, 0], [c * nu, c * (1 - nu), 0], [0, 0, c * (1 - 2 * nu) / 2]]; }
    else { c = E / (1 - nu * nu); Dm = [[c, c * nu, 0], [c * nu, c, 0], [0, 0, c * (1 - nu) / 2]]; }
    var k = []; for (var i = 0; i < 8; i++) k.push(new Array(8).fill(0));
    var g = 1 / Math.sqrt(3), pts = [[-g, -g], [g, -g], [g, g], [-g, g]], xi = [-1, 1, 1, -1], et = [-1, -1, 1, 1];
    pts.forEach(function (p) {
      var dN = [[], []]; for (var a = 0; a < 4; a++) { dN[0][a] = xi[a] * (1 + et[a] * p[1]) / 4; dN[1][a] = et[a] * (1 + xi[a] * p[0]) / 4; }
      var J = [[0, 0], [0, 0]]; for (a = 0; a < 4; a++) { J[0][0] += dN[0][a] * X[a][0]; J[0][1] += dN[0][a] * X[a][1]; J[1][0] += dN[1][a] * X[a][0]; J[1][1] += dN[1][a] * X[a][1]; }
      var dj = J[0][0] * J[1][1] - J[0][1] * J[1][0]; if (dj <= 0) throw new ApdlError('PLANE182 요소의 노드 순서가 시계 방향이거나 찌그러짐 (반시계 순서로)');
      var Ji = [[J[1][1] / dj, -J[0][1] / dj], [-J[1][0] / dj, J[0][0] / dj]], B = [new Array(8).fill(0), new Array(8).fill(0), new Array(8).fill(0)];
      for (a = 0; a < 4; a++) { var dx = Ji[0][0] * dN[0][a] + Ji[0][1] * dN[1][a], dy = Ji[1][0] * dN[0][a] + Ji[1][1] * dN[1][a]; B[0][2 * a] = dx; B[1][2 * a + 1] = dy; B[2][2 * a] = dy; B[2][2 * a + 1] = dx; }
      for (var r = 0; r < 8; r++) for (var q = 0; q < 8; q++) { var s = 0; for (var m = 0; m < 3; m++) for (var n = 0; n < 3; n++) s += B[m][r] * Dm[m][n] * B[n][q]; k[r][q] += s * dj; }
    });
    return k;
  }

  // ---------- 결과 ----------
  Engine.prototype.needResult = function () { if (!this.result) throw new ApdlError('해석 결과가 없음 (/solu → solve 먼저)'); };
  Engine.prototype.nodeResult = function (n) { // global 기준 [UX..ROTZ]
    this.needResult(); var m = this.result.map[n], U = this.result.U; if (!m) return [0, 0, 0, 0, 0, 0];
    var u = m.map(function (g) { return g >= 0 ? U[g] : 0; }), T = this.nodes[n].T;
    if (T) { var t = mv(T, u.slice(0, 3)), r = mv(T, u.slice(3, 6)); u = t.concat(r); }
    return u;
  };
  Engine.prototype.reactionOf = function (n) { this.needResult(); var m = this.result.map[n]; if (!m) return null; var self = this, any = false, r = m.map(function (g) { if (g >= 0 && self.result.fixed[g]) any = true; return g >= 0 && self.result.fixed[g] ? self.result.Rf[g] : 0; }); return any ? r : null; };
  Engine.prototype.elemForces = function (eid) { // 단면력 (ANSYS SMISC 순서 비슷하게)
    this.needResult(); var info = this.eInfo[eid], U = this.result.U; if (!info) return null;
    var ue = info.gi.map(function (g) { return g >= 0 ? U[g] : 0; });
    if (info.Tn) ue = mvN(info.Tn, ue);
    if (info.name === 'LINK180') { var du = sub(ue.slice(3, 6), ue.slice(0, 3)), Nf = info.EA / info.L * dot(du, info.x); return { N: Nf, S: Nf / info.A }; }
    if (info.name === 'BEAM188') {
      var ul = mvN(info.Tb, ue), fl = mvN(info.kl, ul); for (var i = 0; i < 12; i++) fl[i] -= info.fl[i];
      var P = info.P, r = { FXI: -fl[0], SFYI: -fl[1], SFZI: -fl[2], TQI: -fl[3], MYI: -fl[4], MZI: -fl[5], FXJ: fl[6], SFYJ: fl[7], SFZJ: fl[8], TQJ: fl[9], MYJ: fl[10], MZJ: fl[11] };
      ['I', 'J'].forEach(function (s) { var My = r['MY' + s], Mz = r['MZ' + s]; r['SDIR' + s] = r['FX' + s] / P.A; r['SBYT' + s] = P.asec ? 0 : -Mz * P.ymax / P.Izz; r['SBYB' + s] = P.asec ? 0 : -Mz * P.ymin / P.Izz; r['SBZT' + s] = P.asec ? 0 : My * P.zmax / P.Iyy; r['SBZB' + s] = P.asec ? 0 : My * P.zmin / P.Iyy; });
      return r;
    }
    return null;
  };
  var SMISC = { 1: 'FXI', 2: 'MYI', 3: 'MZI', 4: 'TQI', 5: 'SFZI', 6: 'SFYI', 14: 'FXJ', 15: 'MYJ', 16: 'MZJ', 17: 'TQJ', 18: 'SFZJ', 19: 'SFYJ', 31: 'SDIRI', 32: 'SBYTI', 33: 'SBYBI', 34: 'SBZTI', 35: 'SBZBI', 36: 'SDIRJ', 37: 'SBYTJ', 38: 'SBYBJ', 39: 'SBZTJ', 40: 'SBZBJ' };
  function fmt(v) { if (v === 0) return ' 0.0000    '; var s = v.toExponential(4).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2'); return (v >= 0 ? ' ' : '') + s; }
  function pad(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  Engine.prototype.fmt = fmt;

  H.PRNSOL = function (f, N, S) {
    this.needResult(); var it = S(1), cp = S(2) || 'COMP', self = this, rot = it === 'ROT';
    if (it !== 'U' && it !== 'ROT') { this.warn('prnsol,' + it + ' 은 지원하지 않음 (U, ROT 만)'); return; }
    var nodes = Object.keys(this.result.map).map(Number).filter(function (n) { return !self.nsel || self.nsel[n]; }).sort(function (a, b) { return a - b; });
    var labs = rot ? ['ROTX', 'ROTY', 'ROTZ', 'RSUM'] : ['UX', 'UY', 'UZ', 'USUM'];
    var cols = (cp === 'COMP' || cp === 'SUM' || cp === '') ? [0, 1, 2, 3] : [{ X: 0, Y: 1, Z: 2, SUM: 3 }[cp]];
    if (cp === 'SUM') cols = [3];
    this.log(''); this.log(' PRINT ' + (rot ? 'ROT' : 'U') + '    NODAL SOLUTION PER NODE   (global 직교 기준)'); this.log('');
    this.log('    NODE' + cols.map(function (c) { return pad(labs[c], 14); }).join(''));
    var mx = [0, 0, 0, 0], mxn = [0, 0, 0, 0];
    nodes.forEach(function (n) { var u = self.nodeResult(n), v = rot ? u.slice(3, 6) : u.slice(0, 3); v.push(norm(v)); self.log(pad(n, 8) + cols.map(function (c) { return pad(fmt(v[c]), 14); }).join('')); for (var c = 0; c < 4; c++) if (Math.abs(v[c]) > Math.abs(mx[c])) { mx[c] = v[c]; mxn[c] = n; } });
    this.log(''); this.log(' MAXIMUM ABSOLUTE VALUES'); this.log('    NODE' + cols.map(function (c) { return pad(mxn[c], 14); }).join('')); this.log('   VALUE' + cols.map(function (c) { return pad(fmt(mx[c]), 14); }).join(''));
    if (!this.plot || this.plot.kind !== 'disp') this.plot = { kind: 'disp', comp: 'USUM' };
  };
  H.PRRSOL = function () {
    this.needResult(); var self = this, tot = [0, 0, 0, 0, 0, 0], lab = ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'];
    this.log(''); this.log(' PRINT REACTION SOLUTIONS PER NODE   (global 직교 기준)'); this.log('');
    this.log('    NODE' + lab.map(function (l) { return pad(l, 14); }).join(''));
    Object.keys(this.result.map).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var r = self.reactionOf(n); if (!r) return; var T = self.nodes[n].T, rg = r;
      if (T) rg = mv(T, r.slice(0, 3)).concat(mv(T, r.slice(3, 6)));
      var m = self.result.map[n], fx = m.map(function (g) { return g >= 0 && self.result.fixed[g]; });
      self.log(pad(n, 8) + rg.map(function (v, i) { return pad(fx[i] || (T && i < 3 && fx.slice(0, 3).some(Boolean)) ? fmt(v) : '', 14); }).join(''));
      for (var i = 0; i < 6; i++) tot[i] += rg[i];
    });
    this.log(''); this.log('   TOTAL' + tot.map(function (v) { return pad(fmt(v), 14); }).join(''));
    this.log('   (반력 합 + 가한 하중 = 0 이면 평형 ✓  ※ 모멘트 합은 노드별 값의 단순 합)');
  };
  H.PRRFOR = H.PRRSOL;
  H.FSUM = function () { this.warn('fsum 대신 prrsol 의 TOTAL 줄을 보세요'); };
  H.ETABLE = function (f, N, S) {
    this.needResult(); var lab = S(1), it = S(2), cp = N(3), self = this, vals = {};
    if (lab === 'REFL') return;
    this.selElems().forEach(function (e) {
      var r = self.elemForces(e); if (!r) return;
      if (r.N !== undefined) { if (it === 'SMISC' && cp === 1) vals[e] = r.N; else if (it === 'LS' && (cp === 1 || cp === 2)) vals[e] = r.S; else if (it === 'SMISC' && cp === 2) vals[e] = r.N; else vals[e] = 0; }
      else { var key = it === 'SMISC' ? SMISC[cp] : null; if (!key) { self.warn('etable,' + lab + ',' + it + ',' + cp + ' 항목은 BEAM188 에서 지원하지 않음'); vals[e] = 0; } else vals[e] = r[key]; }
    });
    this.etab[lab] = { vals: vals, desc: it + ' ' + cp };
  };
  H.PRETAB = function (f) {
    var labs = f.slice(1).filter(Boolean).map(this.lab), self = this; if (!labs.length) labs = Object.keys(this.etab);
    labs.forEach(function (l) { if (!self.etab[l]) throw new ApdlError('요소 표 ' + l + ' 이 없음 (etable 먼저)'); });
    this.log(''); this.log(' PRINT ELEMENT TABLE ITEMS PER ELEMENT'); this.log('');
    this.log('    ELEM' + labs.map(function (l) { return pad(l, 14); }).join(''));
    var es = this.selElems(), mx = labs.map(function () { return 0; }), mn = labs.map(function () { return 0; });
    es.forEach(function (e) { if (!labs.some(function (l) { return e in self.etab[l].vals; })) return; self.log(pad(e, 8) + labs.map(function (l, i) { var v = self.etab[l].vals[e] || 0; mx[i] = Math.max(mx[i], v); mn[i] = Math.min(mn[i], v); return pad(fmt(v), 14); }).join('')); });
    this.log(''); this.log('     MAX' + mx.map(function (v) { return pad(fmt(v), 14); }).join('')); this.log('     MIN' + mn.map(function (v) { return pad(fmt(v), 14); }).join(''));
    this.plot = { kind: 'etab', lab: labs[0] };
  };
  H.PLETAB = function (f, N, S) { if (!this.etab[S(1)]) throw new ApdlError('요소 표 ' + S(1) + ' 이 없음'); this.plot = { kind: 'etab', lab: S(1) }; };
  H.PRESOL = function () { this.warn('presol 대신 etable + pretab 을 쓰세요'); };
  H.PLDISP = function (f, N) { this.needResult(); this.plot = { kind: 'disp', comp: 'USUM', und: N(1) }; };
  H.PLNSOL = function (f, N, S) { this.needResult(); var it = S(1), cp = S(2) || 'SUM'; this.plot = { kind: 'disp', comp: (it === 'ROT' ? 'ROT' : 'U') + cp }; };
  H.EPLOT = function () { this.plot = { kind: 'elem' }; };
  H.NPLOT = function () { this.plot = { kind: 'node' }; };
  H.KPLOT = function () { this.plot = { kind: 'geom', what: 'kp' }; };
  H.LPLOT = function () { this.plot = { kind: 'geom', what: 'line' }; };
  H.APLOT = function () { this.plot = { kind: 'geom', what: 'area' }; };
  H.GPLOT = function () { this.plot = { kind: 'geom', what: 'all' }; };

  // 도우미: 그림용 데이터
  Engine.prototype.snapshot = function () {
    var self = this, res = this.result;
    var nodes = {}; for (var n in this.nodes) nodes[n] = { x: this.nodes[n].x, u: res && res.map[n] ? this.nodeResult(+n) : null, T: this.nodes[n].T };
    var elems = {}, kOnly = {}; for (var e in this.elems) { var el = this.elems[e]; elems[e] = { n: el.n, name: (this.ets[el.type] || {}).name, k: el.k, sec: el.sec }; if (el.kn) kOnly[el.kn] = 1; }
    return { nodes: nodes, elems: elems, kOnly: kOnly, kps: this.kps, lines: this.lines, areas: this.areas, D: this.D, F: this.F, DK: this.DK, FK: this.FK, SFB: this.SFB, etab: this.etab, plot: this.plot, pnum: this.pnum, title: this.title, secs: this.secs };
  };

  root.ApdlEngine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);

/* MAPDL 연습기 — 계산 핵심 (수학, 식, 단면, 요소 강성, 면 메쉬)
 * apdl-engine.js 가 이 파일의 ApdlCore 를 사용한다.
 */
(function (root) {
  'use strict';
  var DEG = Math.PI / 180;
  var C = {};

  // ---------- 3×3 / 벡터 ----------
  C.I3 = function () { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; };
  C.mm = function (A, B) { var R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) R[i][j] += A[i][k] * B[k][j]; return R; };
  C.mv = function (A, v) { return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]]; };
  C.mtv = function (A, v) { return [A[0][0] * v[0] + A[1][0] * v[1] + A[2][0] * v[2], A[0][1] * v[0] + A[1][1] * v[1] + A[2][1] * v[2], A[0][2] * v[0] + A[1][2] * v[1] + A[2][2] * v[2]]; };
  function Rz(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
  function Rx(t) { var c = Math.cos(t), s = Math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function Ry(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  C.rot3 = function (thxy, thyz, thzx) { return C.mm(C.mm(Rz((thxy || 0) * DEG), Rx((thyz || 0) * DEG)), Ry((thzx || 0) * DEG)); };
  C.sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  C.add = function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; };
  C.scl = function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; };
  C.dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  C.cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  C.norm = function (a) { return Math.sqrt(C.dot(a, a)); };
  C.unit = function (a) { var n = C.norm(a); return n ? C.scl(a, 1 / n) : a; };
  C.DEG = DEG;

  // ---------- n×n ----------
  C.TtKT = function (T, k) { // Tᵀ k T
    var n = k.length, KT = [], out = [], i, j, m, s;
    for (i = 0; i < n; i++) { KT.push(new Array(n).fill(0)); for (j = 0; j < n; j++) { s = 0; for (m = 0; m < n; m++) if (T[m][j]) s += k[i][m] * T[m][j]; KT[i][j] = s; } }
    for (i = 0; i < n; i++) { out.push(new Array(n).fill(0)); for (j = 0; j < n; j++) { s = 0; for (m = 0; m < n; m++) if (T[m][i]) s += T[m][i] * KT[m][j]; out[i][j] = s; } }
    return out;
  };
  C.Ttv = function (T, v) { var n = v.length, o = new Array(n).fill(0); for (var i = 0; i < n; i++) for (var m = 0; m < n; m++) o[i] += T[m][i] * v[m]; return o; };
  C.Tv = function (T, v) { var n = v.length, o = new Array(n).fill(0); for (var i = 0; i < n; i++) for (var m = 0; m < n; m++) o[i] += T[i][m] * v[m]; return o; };

  // ---------- ANSYS 숫자 형식 ----------
  C.g = function (v) { // 예: 1500.0  -187.50  0.0000  0.35526E-002
    if (v === 0 || !isFinite(v) || Math.abs(v) < 1e-300) return v === 0 || Math.abs(v) < 1e-300 ? '0.0000' : String(v);
    var a = Math.abs(v);
    if (a >= 0.1 && a < 99999.5) { var s = v.toPrecision(5); if (s.indexOf('e') > -1) s = v.toFixed(0); return s; }
    var e = Math.floor(Math.log10(a)) + 1, m = v / Math.pow(10, e);
    if (Math.abs(m) >= 0.999995) { m /= 10; e += 1; }
    var es = Math.abs(e) < 10 ? '00' + Math.abs(e) : Math.abs(e) < 100 ? '0' + Math.abs(e) : '' + Math.abs(e);
    return m.toFixed(5).replace(/^(-?)0\./, '$10.') + 'E' + (e < 0 ? '-' : '+') + es;
  };
  C.e7 = function (v) { var s = v.toExponential(7).toUpperCase(); return s.replace(/E([+-])(\d)$/, 'E$10$2'); };
  C.pad = function (s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; };
  C.rpad = function (s, w) { s = String(s); while (s.length < w) s += ' '; return s; };

  // ---------- 식 (APDL) ----------
  function ApdlError(msg) { this.message = msg; }
  C.ApdlError = ApdlError;
  function Expr(env) { this.env = env; }
  Expr.prototype.eval = function (src) {
    this.s = src; this.toks = this.lex(src); this.i = 0;
    var v = this.cmp(); if (this.i < this.toks.length) throw new ApdlError('Unable to evaluate "' + src + '" (식 오류)'); return v;
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
      throw new ApdlError('Character "' + c + '" is not valid in "' + s + '"');
    }
    return t;
  };
  Expr.prototype.peek = function (v) { var t = this.toks[this.i]; return t && t.k === 'op' && t.v === v; };
  Expr.prototype.cmp = function () { var a = this.as(); while (this.peek('<') || this.peek('>')) { var op = this.toks[this.i++].v, b = this.as(); a = op === '<' ? Math.min(a, b) : Math.max(a, b); } return a; };
  Expr.prototype.as = function () { var a = this.md(); while (this.peek('+') || this.peek('-')) { var op = this.toks[this.i++].v, b = this.md(); a = op === '+' ? a + b : a - b; } return a; };
  Expr.prototype.md = function () { var a = this.un(); while (this.peek('*') || this.peek('/')) { var op = this.toks[this.i++].v, b = this.un(); a = op === '*' ? a * b : a / b; } return a; };
  Expr.prototype.un = function () { if (this.peek('-')) { this.i++; return -this.un(); } if (this.peek('+')) { this.i++; return this.un(); } return this.pw(); };
  Expr.prototype.pw = function () { var a = this.at(); if (this.peek('**')) { this.i++; return Math.pow(a, this.un()); } return a; };
  Expr.prototype.at = function () {
    var t = this.toks[this.i++];
    if (!t) throw new ApdlError('Incomplete expression "' + this.s + '"');
    if (t.k === 'n') return t.v;
    if (t.k === 'op' && t.v === '(') { var v = this.cmp(); if (!this.peek(')')) throw new ApdlError('Missing ) in "' + this.s + '"'); this.i++; return v; }
    if (t.k === 'id') {
      if (this.peek('(')) {
        this.i++; var args = [];
        if (!this.peek(')')) { args.push(this.cmp()); while (this.peek(',')) { this.i++; args.push(this.cmp()); } }
        if (!this.peek(')')) throw new ApdlError('Missing ) in "' + this.s + '"'); this.i++;
        return this.env.func(t.v, args);
      }
      return this.env.param(t.v);
    }
    throw new ApdlError('Unable to evaluate "' + this.s + '"');
  };
  C.Expr = Expr;

  // ---------- 보 단면 성질 ----------
  function rectsProps(rs, asz, asy) {
    var A = 0, Sy = 0, Sz = 0;
    rs.forEach(function (r) { var a = (r.y1 - r.y0) * (r.z1 - r.z0); A += a; Sy += a * (r.y0 + r.y1) / 2; Sz += a * (r.z0 + r.z1) / 2; });
    var cy = Sy / A, cz = Sz / A, Iyy = 0, Izz = 0, Iyz = 0, ymin = 1e99, ymax = -1e99, zmin = 1e99, zmax = -1e99, J = 0;
    rs.forEach(function (r) {
      var b = r.y1 - r.y0, h = r.z1 - r.z0, a = b * h, yc = (r.y0 + r.y1) / 2 - cy, zc = (r.z0 + r.z1) / 2 - cz;
      Iyy += b * h * h * h / 12 + a * zc * zc; Izz += h * b * b * b / 12 + a * yc * yc; Iyz += a * yc * zc;
      ymin = Math.min(ymin, r.y0 - cy); ymax = Math.max(ymax, r.y1 - cy); zmin = Math.min(zmin, r.z0 - cz); zmax = Math.max(zmax, r.z1 - cz);
      var L = Math.max(b, h), t = Math.min(b, h); J += L * t * t * t / 3 * (1 - 0.63 * t / L);
    });
    return { A: A, Iyy: Iyy, Izz: Izz, Iyz: Iyz, J: J, cy: cy, cz: cz, ymin: ymin, ymax: ymax, zmin: zmin, zmax: zmax, Asy: asy || A * 5 / 6, Asz: asz || A * 5 / 6, rects: rs };
  }
  C.secProps = function (sec) {
    var d = sec.data.map(function (x) { return x || 0; }), s = sec.sub, p;
    if (sec.type === 'LINK') return { A: d[0] };
    if (s === 'RECT') { p = rectsProps([{ y0: -d[0] / 2, y1: d[0] / 2, z0: -d[1] / 2, z1: d[1] / 2 }]); var b = Math.max(d[0], d[1]), t = Math.min(d[0], d[1]); p.J = b * t * t * t * (1 / 3 - 0.21 * t / b * (1 - Math.pow(t / b, 4) / 12)); return p; }
    if (s === 'CSOLID') { var R = d[0], I = Math.PI * Math.pow(R, 4) / 4; return { A: Math.PI * R * R, Iyy: I, Izz: I, Iyz: 0, J: 2 * I, cy: 0, cz: 0, ymin: -R, ymax: R, zmin: -R, zmax: R, Asy: 0.9 * Math.PI * R * R, Asz: 0.9 * Math.PI * R * R, circ: [0, R] }; }
    if (s === 'CTUBE') { var ri = d[0], ro = d[1], Ip = Math.PI * (Math.pow(ro, 4) - Math.pow(ri, 4)) / 4, At = Math.PI * (ro * ro - ri * ri); return { A: At, Iyy: Ip, Izz: Ip, Iyz: 0, J: 2 * Ip, cy: 0, cz: 0, ymin: -ro, ymax: ro, zmin: -ro, zmax: ro, Asy: At / 2, Asz: At / 2, circ: [ri, ro] }; }
    if (s === 'I') { var W1 = d[0], W2 = d[1], W3 = d[2], t1 = d[3], t2 = d[4], t3 = d[5]; return rectsProps([{ y0: -W1 / 2, y1: W1 / 2, z0: 0, z1: t1 }, { y0: -t3 / 2, y1: t3 / 2, z0: t1, z1: W3 - t2 }, { y0: -W2 / 2, y1: W2 / 2, z0: W3 - t2, z1: W3 }], W3 * t3, (W1 * t1 + W2 * t2) * 5 / 6); } // Help 그림: 원점 = 아래 플랜지(W1, t1) 밑면 가운데
    if (s === 'CHAN') { var C1 = d[0], C2 = d[1], C3 = d[2], u1 = d[3], u2 = d[4], u3 = d[5]; return rectsProps([{ y0: 0, y1: C1, z0: 0, z1: u1 }, { y0: 0, y1: u3, z0: u1, z1: C3 - u2 }, { y0: 0, y1: C2, z0: C3 - u2, z1: C3 }], C3 * u3, (C1 * u1 + C2 * u2) * 5 / 6); } // 원점 = 웨브 바깥 아래 모서리, W1·t1 = 아래 플랜지
    if (s === 'HREC') { var a1 = d[0], a2 = d[1], q1 = d[2], q2 = d[3], q3 = d[4], q4 = d[5]; return rectsProps([{ y0: 0, y1: q1, z0: 0, z1: a2 }, { y0: a1 - q2, y1: a1, z0: 0, z1: a2 }, { y0: q1, y1: a1 - q2, z0: 0, z1: q3 }, { y0: q1, y1: a1 - q2, z0: a2 - q4, z1: a2 }]); } // 원점 = 왼쪽 아래 모서리 (W1 폭, W2 높이, t1 왼 t2 오 t3 아래 t4 위)
    if (s === 'ASEC') return { A: d[0], Iyy: d[1], Iyz: d[2], Izz: d[3], J: d[5] || 0, cy: 0, cz: 0, ymin: d[11] ? -d[11] / 2 : 0, ymax: d[11] ? d[11] / 2 : 0, zmin: d[10] ? -d[10] / 2 : 0, zmax: d[10] ? d[10] / 2 : 0, Asy: d[0], Asz: d[0], asec: true };
    throw new ApdlError('Section subtype ' + s + ' is not supported in this trainer (연습기 미지원 단면).');
  };

  // ---------- 요소 강성 ----------
  C.beamK = function (E, G, P, L, timo) { // 3D 보 12×12 (국부), timo=true → Timoshenko
    var k = []; for (var i = 0; i < 12; i++) k.push(new Array(12).fill(0));
    var EA = E * P.A / L, GJ = G * P.J / L;
    k[0][0] = k[6][6] = EA; k[0][6] = k[6][0] = -EA; k[3][3] = k[9][9] = GJ; k[3][9] = k[9][3] = -GJ;
    function bend(I, As, v1, t1, v2, t2, sg) {
      var phi = timo && As ? 12 * E * I / (G * As * L * L) : 0, c = E * I / ((1 + phi) * L * L * L);
      var a = 12 * c, b = 6 * c * L * sg, d = (4 + phi) * c * L * L, e = (2 - phi) * c * L * L;
      var S = [[a, b, -a, b], [b, d, -b, e], [-a, -b, a, -b], [b, e, -b, d]], id = [v1, t1, v2, t2];
      for (var r = 0; r < 4; r++) for (var q = 0; q < 4; q++) k[id[r]][id[q]] += S[r][q];
    }
    bend(P.Izz, P.Asy, 1, 5, 7, 11, 1);
    bend(P.Iyy, P.Asz, 2, 4, 8, 10, -1);
    return k;
  };
  // 분포하중 → 국부 등가 절점하중 (12). dirs: 'y-' 'z-' 'x+'
  C.beamLoad = function (loads, L) {
    var f = new Array(12).fill(0);
    var gp = [-0.9061798459, -0.5384693101, 0, 0.5384693101, 0.9061798459], gw = [0.2369268851, 0.4786286705, 0.5688888889, 0.4786286705, 0.2369268851];
    (loads || []).forEach(function (s) {
      var a = s.lr ? s.io * L : s.io, conc = s.jo === -1, b = conc ? a : L - (s.lr ? s.jo * L : s.jo);
      function put(x, q) {
        var t = x / L, N1 = 1 - 3 * t * t + 2 * t * t * t, N2 = L * (t - 2 * t * t + t * t * t), N3 = 3 * t * t - 2 * t * t * t, N4 = L * (-t * t + t * t * t);
        if (s.dir === 'y-') { f[1] -= q * N1; f[5] -= q * N2; f[7] -= q * N3; f[11] -= q * N4; }
        else if (s.dir === 'z-') { f[2] -= q * N1; f[4] += q * N2; f[8] -= q * N3; f[10] += q * N4; }
        else if (s.dir === 'x+') { f[0] += q * (1 - t); f[6] += q * t; }
        else if (s.dir === 'xI') { f[0] += q; } else if (s.dir === 'xJ') { f[6] -= q; }
      }
      if (s.dir === 'xI' || s.dir === 'xJ') { put(0, s.vi); return; }
      if (conc) { put(a, s.vi); return; }
      var len = b - a; if (len <= 0) return;
      for (var g = 0; g < 5; g++) { var xg = a + (gp[g] + 1) / 2 * len, q = s.vi + (s.vj - s.vi) * (xg - a) / len; put(xg, q * gw[g] * len / 2); }
    });
    return f;
  };
  function Dmat(E, nu, strain) {
    var c;
    if (strain) { c = E / ((1 + nu) * (1 - 2 * nu)); return [[c * (1 - nu), c * nu, 0], [c * nu, c * (1 - nu), 0], [0, 0, c * (1 - 2 * nu) / 2]]; }
    c = E / (1 - nu * nu); return [[c, c * nu, 0], [c * nu, c, 0], [0, 0, c * (1 - nu) / 2]];
  }
  C.Dmat = Dmat;
  // 평면 요소 B 행렬들 (점마다). X: [[x,y]...] 3개 또는 4개
  C.planeB = function (X) {
    if (X.length === 3) {
      var x1 = X[0][0], y1 = X[0][1], x2 = X[1][0], y2 = X[1][1], x3 = X[2][0], y3 = X[2][1], A2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
      if (A2 <= 0) throw new ApdlError('Element has a negative or zero area (노드 순서를 반시계로).');
      var b = [y2 - y3, y3 - y1, y1 - y2], c = [x3 - x2, x1 - x3, x2 - x1], B = [new Array(6).fill(0), new Array(6).fill(0), new Array(6).fill(0)];
      for (var i = 0; i < 3; i++) { B[0][2 * i] = b[i] / A2; B[1][2 * i + 1] = c[i] / A2; B[2][2 * i] = c[i] / A2; B[2][2 * i + 1] = b[i] / A2; }
      return [{ B: B, w: A2 / 2 }];
    }
    var g = 1 / Math.sqrt(3), pts = [[-g, -g], [g, -g], [g, g], [-g, g]], xi = [-1, 1, 1, -1], et = [-1, -1, 1, 1], out = [];
    pts.forEach(function (p) {
      var dN = [[], []]; for (var a = 0; a < 4; a++) { dN[0][a] = xi[a] * (1 + et[a] * p[1]) / 4; dN[1][a] = et[a] * (1 + xi[a] * p[0]) / 4; }
      var J = [[0, 0], [0, 0]]; for (a = 0; a < 4; a++) { J[0][0] += dN[0][a] * X[a][0]; J[0][1] += dN[0][a] * X[a][1]; J[1][0] += dN[1][a] * X[a][0]; J[1][1] += dN[1][a] * X[a][1]; }
      var dj = J[0][0] * J[1][1] - J[0][1] * J[1][0]; if (dj <= 0) throw new ApdlError('Element shape is invalid (노드 순서를 반시계로, 찌그러짐 확인).');
      var Ji = [[J[1][1] / dj, -J[0][1] / dj], [-J[1][0] / dj, J[0][0] / dj]], B = [new Array(8).fill(0), new Array(8).fill(0), new Array(8).fill(0)];
      for (a = 0; a < 4; a++) { var dx = Ji[0][0] * dN[0][a] + Ji[0][1] * dN[1][a], dy = Ji[1][0] * dN[0][a] + Ji[1][1] * dN[1][a]; B[0][2 * a] = dx; B[1][2 * a + 1] = dy; B[2][2 * a] = dy; B[2][2 * a + 1] = dx; }
      out.push({ B: B, w: dj });
    });
    return out;
  };
  C.planeK = function (X, D, t) {
    var Bs = C.planeB(X), n = X.length * 2, k = []; for (var i = 0; i < n; i++) k.push(new Array(n).fill(0));
    Bs.forEach(function (g) { var B = g.B; for (var r = 0; r < n; r++) for (var q = 0; q < n; q++) { var s = 0; for (var m = 0; m < 3; m++) for (var p = 0; p < 3; p++) s += B[m][r] * D[m][p] * B[p][q]; k[r][q] += s * g.w * t; } });
    return k;
  };

  // ---------- 면 메쉬 (경계 재분할 + 격자 점 + Delaunay) ----------
  function inside(regs, x, y) { var c = false; regs.forEach(function (r) { for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } }); return c; }
  function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); var x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]; return Math.sqrt(x * x + y * y); }
  C.meshArea = function (regs, h) {
    var pts = [], bnd = [];
    regs.forEach(function (r) {
      var n = r.length, corner = [], i;
      for (i = 0; i < n; i++) { var a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]], ang = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); corner.push(ang > 25 * DEG); }
      var starts = []; for (i = 0; i < n; i++) if (corner[i]) starts.push(i);
      if (!starts.length) starts = [0];
      for (var s = 0; s < starts.length; s++) {
        var i0 = starts[s], i1 = starts[(s + 1) % starts.length], seq = [], k = i0;
        do { seq.push(r[k]); k = (k + 1) % n; } while (k !== i1); seq.push(r[i1]);
        if (starts.length === 1 && i0 === i1) { /* 매끈한 닫힌 곡선 */ }
        var cum = [0]; for (k = 1; k < seq.length; k++) cum.push(cum[k - 1] + Math.hypot(seq[k][0] - seq[k - 1][0], seq[k][1] - seq[k - 1][1]));
        var L = cum[cum.length - 1], m = Math.max(1, Math.round(L / h));
        for (var q = 0; q < m; q++) { var target = L * q / m, j = 1; while (j < cum.length - 1 && cum[j] < target) j++; var t = (target - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1); pts.push([seq[j - 1][0] + (seq[j][0] - seq[j - 1][0]) * t, seq[j - 1][1] + (seq[j][1] - seq[j - 1][1]) * t]); }
      }
      for (i = 0; i < n; i++) bnd.push([r[i], r[(i + 1) % n]]);
    });
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), dy = h * Math.sqrt(3) / 2, row = 0;
    for (var y = y0 + dy / 2; y < y1; y += dy, row++) for (var x = x0 + (row % 2 ? h / 2 : 0); x < x1; x += h) {
      if (!inside(regs, x, y)) continue; var p = [x, y], ok = true;
      for (var b = 0; b < bnd.length && ok; b++) if (segDist(p, bnd[b][0], bnd[b][1]) < 0.55 * h) ok = false;
      if (ok) pts.push(p);
    }
    if (pts.length > 6000) throw new ApdlError('Too many nodes for this trainer (요소 크기를 키우세요: esize).');
    var tris = delaunay(pts).filter(function (t) {
      var a = pts[t[0]], b = pts[t[1]], c = pts[t[2]], ar = ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      if (Math.abs(ar) < 1e-12 * h * h) return false;
      return inside(regs, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
    }).map(function (t) { var a = pts[t[0]], b = pts[t[1]], c = pts[t[2]]; return ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) > 0 ? t : [t[0], t[2], t[1]]; });
    return { pts: pts, tris: tris };
  };
  function delaunay(P) { // Bowyer–Watson
    var n = P.length; if (n < 3) return [];
    var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
    var mx = Math.min.apply(null, xs), Mx = Math.max.apply(null, xs), my = Math.min.apply(null, ys), My = Math.max.apply(null, ys), d = Math.max(Mx - mx, My - my) * 20, cx = (mx + Mx) / 2, cy = (my + My) / 2;
    var pts = P.concat([[cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]]), tris = [mk(n, n + 1, n + 2)];
    function mk(a, b, c) {
      var A = pts[a], B = pts[b], Cc = pts[c], D = 2 * (A[0] * (B[1] - Cc[1]) + B[0] * (Cc[1] - A[1]) + Cc[0] * (A[1] - B[1]));
      var ux = ((A[0] * A[0] + A[1] * A[1]) * (B[1] - Cc[1]) + (B[0] * B[0] + B[1] * B[1]) * (Cc[1] - A[1]) + (Cc[0] * Cc[0] + Cc[1] * Cc[1]) * (A[1] - B[1])) / D;
      var uy = ((A[0] * A[0] + A[1] * A[1]) * (Cc[0] - B[0]) + (B[0] * B[0] + B[1] * B[1]) * (A[0] - Cc[0]) + (Cc[0] * Cc[0] + Cc[1] * Cc[1]) * (B[0] - A[0])) / D;
      return { v: [a, b, c], x: ux, y: uy, r2: (A[0] - ux) * (A[0] - ux) + (A[1] - uy) * (A[1] - uy) };
    }
    for (var i = 0; i < n; i++) {
      var p = pts[i], bad = [], keep = [];
      for (var t = 0; t < tris.length; t++) { var T = tris[t], dx = p[0] - T.x, dy = p[1] - T.y; (dx * dx + dy * dy < T.r2 * (1 + 1e-12) ? bad : keep).push(T); }
      var edges = {};
      bad.forEach(function (T) { for (var e = 0; e < 3; e++) { var a = T.v[e], b = T.v[(e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; edges[k] = edges[k] ? 0 : [a, b]; } });
      tris = keep;
      for (var k in edges) if (edges[k]) tris.push(mk(edges[k][0], edges[k][1], i));
    }
    return tris.filter(function (T) { return T.v[0] < n && T.v[1] < n && T.v[2] < n; }).map(function (T) { return T.v; });
  }

  root.ApdlCore = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);

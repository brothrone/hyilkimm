/* 참고자료 명령어 검색: ANSYS 18.2 Command Reference 색인(data/cmdidx.json)을 브라우저에서 검색.
   API 키를 넣으면 질문(한글 가능)을 Claude 로 해석해 관련 명령을 골라 설명한다. 키는 이 브라우저에만 저장된다. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var box = $('cs'); if (!box) return;
  var BASE = 'https://www.mm.bme.hu/~gyebro/files/ans_help_v182/ans_cmd/';
  var idx = null, byId = {};
  var inp = $('cs-q'), out = $('cs-out'), keyI = $('cs-key'), keep = $('cs-keep'), mdl = $('cs-model'), web = $('cs-web'), st = $('cs-st');

  function store(k, v) { try { var s = keep.checked ? localStorage : sessionStorage; (v == null) ? (localStorage.removeItem(k), sessionStorage.removeItem(k)) : s.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  keyI.value = load('cs.key'); mdl.value = load('cs.model') || mdl.value;
  try { keep.checked = !!localStorage.getItem('cs.key'); } catch (e) {}
  keyI.addEventListener('change', function () { store('cs.key', keyI.value.trim() || null); });
  keep.addEventListener('change', function () { store('cs.key', keyI.value.trim() || null); });
  mdl.addEventListener('change', function () { try { localStorage.setItem('cs.model', mdl.value); } catch (e) {} });

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function status(s) { st.textContent = s || ''; }

  function ensure() {
    if (idx) return Promise.resolve();
    status('색인을 불러오는 중…');
    return fetch('data/cmdidx.json').then(function (r) { if (!r.ok) throw new Error('색인 로드 실패 (' + r.status + ')'); return r.json(); })
      .then(function (d) { idx = d; d.forEach(function (x) { byId[x.id.toUpperCase()] = x; x._h = (x.id + ' ' + x.syn + ' ' + x.p + ' ' + x.cat).toLowerCase(); x._b = x.b.toLowerCase(); }); });
  }

  /* 로컬 점수 검색 */
  function search(q, names, kws, n) {
    var toks = (q + ' ' + (kws || []).join(' ')).toLowerCase().split(/[^a-z0-9_*\/]+/).filter(function (t) { return t.length > 1; });
    var nm = {}; (names || []).forEach(function (s) { nm[String(s).toUpperCase().replace(/^[*\/]/, function (m) { return m; })] = 1; });
    var res = [];
    idx.forEach(function (x) {
      var id = x.id.toUpperCase(), s = 0;
      if (nm[id] || nm[x.id.toUpperCase().replace(/^\//, '')]) s += 100;
      toks.forEach(function (t) {
        var T = t.toUpperCase();
        if (id === T) s += 60; else if (id.indexOf(T) === 0) s += 8;
        if (x._h.indexOf(t) >= 0) s += 6; if (x._b.indexOf(t) >= 0) s += 2;
      });
      if (s > 0) res.push([s, x]);
    });
    res.sort(function (a, b) { return b[0] - a[0] || a[1].id.length - b[1].id.length; });
    return res.slice(0, n).map(function (r) { return r[1]; });
  }

  function call(system, user, schema, max) {
    var key = keyI.value.trim();
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: mdl.value, max_tokens: max, system: system,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
        messages: [{ role: 'user', content: user }]
      })
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) {
        if (j.stop_reason === 'refusal') throw new Error('응답이 거절되었습니다.');
        var t = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
        return JSON.parse(t);
      });
  }

  var S1 = { type: 'object', additionalProperties: false, required: ['commands', 'keywords'],
    properties: { commands: { type: 'array', items: { type: 'string' } }, keywords: { type: 'array', items: { type: 'string' } } } };
  var S2 = { type: 'object', additionalProperties: false, required: ['summary', 'results'],
    properties: { summary: { type: 'string' }, results: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'why', 'example'],
      properties: { id: { type: 'string' }, why: { type: 'string' }, example: { type: 'string' } } } } } };


  /* ANSYS Help 본 사이트: 브라우저에서 직접 못 읽으므로 API 의 웹 검색 도구를 ansyshelp.ansys.com 으로 제한해서 사용 */
  function webHelp(q) {
    var msgs = [{ role: 'user', content: 'ANSYS Mechanical APDL 공식 문서(ansyshelp.ansys.com)에서 다음 질문에 해당하는 내용을 찾아 한국어로 짧게 정리해 줘. 명령 이름, 주요 인수, 주의점 위주로. 질문: ' + q }];
    var sources = {}, text = '', n = 0;
    function step() {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': keyI.value.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: mdl.value, max_tokens: 4000, output_config: { effort: 'low' }, messages: msgs,
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, allowed_domains: ['ansyshelp.ansys.com'] }] })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status)); return j; }); })
        .then(function (j) {
          (j.content || []).forEach(function (b) {
            if (b.type === 'text') text += b.text;
            if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(function (x) { if (x.url) sources[x.url] = x.title || x.url; });
          });
          if (j.stop_reason === 'pause_turn' && ++n < 4) { msgs.push({ role: 'assistant', content: j.content }); return step(); }
          return { text: text.trim(), sources: sources };
        });
    }
    return step();
  }
  function webCard(w) {
    var l = Object.keys(w.sources);
    if (!w.text && !l.length) return '<p class="cssum">ANSYS Help 에서 찾은 내용이 없습니다.</p>';
    return '<article class="cscard csweb"><header><code class="csn">ANSYS Help</code><span class="csm">ansyshelp.ansys.com</span></header>' +
      '<p class="csw">' + esc(w.text).replace(/\n+/g, '<br>') + '</p>' +
      (l.length ? '<footer>' + l.slice(0, 5).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(w.sources[u]) + ' ›</a>'; }).join('<br>') + '</footer>' : '') + '</article>';
  }

  function card(x, why, example) {
    var h = '<article class="cscard"><header><code class="csn">' + esc(x.id) + '</code>' +
      '<span class="csm">' + esc([x.proc, x.cat].filter(Boolean).join(' · ')) + '</span></header>' +
      '<p class="csp">' + esc(x.p) + '</p>' +
      '<p class="css">' + esc(x.syn) + '</p>';
    if (why) h += '<p class="csw">' + esc(why) + '</p>';
    if (example) h += '<pre><code>' + esc(example) + '</code></pre>';
    h += '<footer><a href="' + BASE + x.f + '" target="_blank" rel="noopener">Command Reference 18.2 ›</a></footer></article>';
    return h;
  }
  function show(summary, items) {
    out.innerHTML = (summary ? '<p class="cssum">' + esc(summary) + '</p>' : '') +
      (items.length ? items.join('') : '<p class="cssum">일치하는 명령이 없습니다. 영어 명령 이름이나 키워드로 다시 검색해 보세요.</p>');
  }

  function run() {
    var q = inp.value.trim(); if (!q) return;
    var key = keyI.value.trim();
    out.innerHTML = '';
    ensure().then(function () {
      if (!key) { status(''); var r = search(q, [], [], 12); show('', r.map(function (x) { return card(x); })); return; }
      status('질문을 해석하는 중…');
      return call('You map a user question about ANSYS Mechanical APDL to command names. Return up to 8 likely APDL command names (without arguments) and up to 8 English search keywords.',
        q, S1, 600).then(function (a) {
        var cands = search(q, a.commands, a.keywords, 14);
        status('명령 설명을 정리하는 중…');
        var ctx = cands.map(function (x) { return '## ' + x.id + '\n' + x.syn + '\n' + x.p + '\n' + x.b.slice(0, 600); }).join('\n\n');
        return call('You are a reference assistant for a Korean university course on ANSYS Mechanical APDL (midterm covers LINK180, BEAM188, PLANE182, SECTYPE/SECDATA, SFBEAM, ETABLE, PRNSOL). ' +
          'Using ONLY the command reference excerpts given, pick the commands that answer the question (1-5, best first). Write in Korean. ' +
          '"summary": 1-2 sentence direct answer. For each result: "id" exactly as in the excerpts, "why": 1-2 sentences in Korean on what it does and the key arguments, "example": one or two APDL lines using ANSYS conventions of the course (e.g. mp,nuxy rather than prxy), or "" if not useful. Do not invent commands.',
          '질문: ' + q + '\n\n' + ctx, S2, 3000).then(function (b) {
          var items = [];
          (b.results || []).forEach(function (r) { var x = byId[String(r.id).toUpperCase()]; if (x) items.push(card(x, r.why, r.example)); });
          if (!web.checked) { status(''); show(b.summary, items); return; }
          show(b.summary, items); status('ANSYS Help 검색 중…');
          return webHelp(q).then(function (w) { status(''); out.insertAdjacentHTML('beforeend', webCard(w)); })
            .catch(function (e) { status(''); out.insertAdjacentHTML('beforeend', '<p class="cssum cserr">ANSYS Help 검색 실패: ' + esc(e.message || e) + '</p>'); });
        });
      });
    }).catch(function (e) {
      status(''); out.innerHTML = '<p class="cssum cserr">' + esc(e.message || e) + '</p>';
    });
  }
  $('cs-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
})();

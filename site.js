(function () {
  var body = document.body, mq = matchMedia('(max-width:860px)');

  // 목차 열고 닫기 (데스크톱: 숨김 토글 / 모바일: 슬라이드)
  function toggleSide(force) {
    if (mq.matches) body.classList.toggle('sbopen', force);
    else body.classList.toggle('nosb', force === undefined ? undefined : !force);
  }
  document.getElementById('burger').onclick = function () { toggleSide(); };
  document.getElementById('sbclose').onclick = function () { toggleSide(false); };
  document.addEventListener('click', function (e) {
    if (body.classList.contains('sbopen') && !e.target.closest('.side') && !e.target.closest('#burger')) body.classList.remove('sbopen');
  });
  document.querySelectorAll('.side a').forEach(function (a) {
    a.addEventListener('click', function () { if (mq.matches) body.classList.remove('sbopen'); });
  });

  // 트리 펼치기
  function setOpen(li, open) {
    li.classList.toggle('closed', !open);
    var b = li.querySelector(':scope > .row > .tw:not(.leaf)');
    if (b) b.textContent = open ? '▼' : '▶';
  }
  document.querySelectorAll('.side .tw:not(.leaf)').forEach(function (b) {
    b.onclick = function () { var li = b.closest('li'); setOpen(li, li.classList.contains('closed')); };
  });
  var allOpen = false;
  document.getElementById('ecall').onclick = function () {
    allOpen = !allOpen;
    document.querySelectorAll('.side li').forEach(function (li) { if (li.querySelector(':scope > ul')) setOpen(li, allOpen); });
  };

  // 인쇄
  function pr(e) { e.preventDefault(); window.print(); }
  document.getElementById('printbtn').onclick = pr;
  document.getElementById('printlink').onclick = pr;

  // 현재 보고 있는 절 표시
  var links = {};
  document.querySelectorAll('.side li.cur a[href*="#"]').forEach(function (a) { links[a.hash.slice(1)] = a; });
  var hs = Array.prototype.filter.call(document.querySelectorAll('.content h2[id], .content h3[id]'), function (h) { return links[h.id]; });
  function spy() {
    var top = 130, cur = null;
    hs.forEach(function (h) { if (h.getBoundingClientRect().top < top) cur = h; });
    Object.keys(links).forEach(function (k) { links[k].classList.remove('on'); });
    if (cur) links[cur.id].classList.add('on');
  }
  addEventListener('scroll', spy, { passive: true }); spy();

  // 페이지 안 검색: 일치하는 곳을 노란색으로 표시, Enter 반복하면 다음 결과로
  var main = document.querySelector('.content'), marks = [], idx = -1, last = '';
  function clear() {
    marks.forEach(function (m) { var t = document.createTextNode(m.textContent); m.parentNode.replaceChild(t, m); t.parentNode.normalize(); });
    marks = []; idx = -1;
  }
  function find(q) {
    clear(); if (!q) return;
    var lq = q.toLowerCase(), walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = walker.nextNode())) if (n.nodeValue.toLowerCase().indexOf(lq) > -1 && !n.parentNode.closest('svg')) nodes.push(n);
    nodes.forEach(function (node) {
      var s = node.nodeValue, ls = s.toLowerCase(), i = 0, j, frag = document.createDocumentFragment();
      while ((j = ls.indexOf(lq, i)) > -1) {
        frag.appendChild(document.createTextNode(s.slice(i, j)));
        var m = document.createElement('mark'); m.textContent = s.slice(j, j + q.length); frag.appendChild(m); marks.push(m);
        i = j + q.length;
      }
      frag.appendChild(document.createTextNode(s.slice(i)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  document.getElementById('search').onsubmit = function (e) {
    e.preventDefault();
    var q = document.getElementById('q').value.trim();
    if (q !== last) { find(q); last = q; }
    if (!marks.length) return;
    if (idx > -1) marks[idx].classList.remove('now');
    idx = (idx + 1) % marks.length;
    marks[idx].classList.add('now');
    marks[idx].scrollIntoView({ block: 'center' });
  };
})();

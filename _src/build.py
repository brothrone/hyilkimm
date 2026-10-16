# 페이지 생성: python3 _src/build.py  (본문은 _src/*.body.html, 그림은 svgs.py)
import re, html, os, sys
SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(SRC)  # 저장소 루트
sys.path.insert(0, SRC)
import svgs

PAGES = [  # file, nav label, crumb, desc, deep (h3 in sidebar)
    ('index.html', '홈', 'Home', '전산구조해석(ANSYS APDL) 중간고사 대비 자료', False),
    ('trend.html', '족보 분석', 'Midterm Analysis', '기출 2016~2025 경향 분석, 올해 예상 문제, 공부 계획', False),
    ('exams.html', '기출 풀이', 'Past Exams', '2016~2025 (6개년) 중간고사 APDL 풀이 스크립트와 검증값', True),
    ('ref.html', '참고자료', 'Command Reference', 'ANSYS APDL 명령어 정리와 기출 유형별 스크립트', False),
]
TITLES = {'index.html': '전산구조해석 중간고사', 'trend.html': '족보 분석 · 공부법',
          'exams.html': '기출 풀이 2016~2025', 'ref.html': 'APDL 시험 참고자료'}

def strip(s): return re.sub(r'<[^>]+>', '', s).strip()

def headings(body, deep):
    out = []
    for m in re.finditer(r'<h([23]) id="([^"]+)">(.*?)</h\1>', body, re.S):
        lvl, hid, txt = int(m.group(1)), m.group(2), html.unescape(strip(m.group(3)))
        if lvl == 2: out.append([hid, txt, []])
        elif deep and out: out[-1][2].append((hid, txt))
    return out

LOGO = '''<svg class="mk" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 27 L13 5 h6 L29 27 h-6 l-7-15.5 L9 27z" fill="#ffb71b"/><path d="M11 21 h10 l2 4 H9z" fill="#fff"/></svg>'''
SEARCH_IC = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15 15 L21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>'

bodies = {}
for f, *_ in PAGES:
    b = open(os.path.join(SRC, f.replace('.html', '.body.html'))).read()
    if f == 'ref.html':
        # 그림 넣기
        b = b.replace('<h3 id="secoffs', svgs.SECTIONS + '<h3 id="secoffs', 1) if '<h3 id="secoffs' in b else b
        i = b.index('<h2 id="3-beam188'); j = b.index('</h2>', i) + 5
        b = b[:j] + svgs.BEAM + b[j:]
        i = b.index('<h3 id="삼각-분포하중'); b = b[:i] + svgs.TRI + b[i:]
        i = b.index('<h2 id="5-'); j = b.index('</table>', i) + 8
        b = b[:j] + svgs.PCIRC + b[j:]
        b = b.replace('<div class="tbl">', '').replace('</table></div>', '</table>')
        b = b.replace('<code>sectype</code>의 단면에 적용', '<code>sectype</code>의 단면에 적용')
    if f == 'trend.html':
        b = b.replace('<div class="tbl">', '').replace('</table></div>', '</table>')
    bodies[f] = b

def sidebar(cur):
    items = []
    for f, label, crumb, desc, deep in PAGES:
        hs = headings(bodies[f], deep)
        is_cur = f == cur
        cls = ('cur ' if is_cur else '') + ('' if is_cur else 'closed')
        sub = ''
        if hs:
            lis = []
            for hid, txt, kids in hs:
                kid = ''
                if kids:
                    kid = '<ul>' + ''.join(f'<li><div class="row"><span class="tw leaf">▶</span><a href="{f}#{k}">{html.escape(t)}</a></div></li>' for k, t in kids) + '</ul>'
                tw = '<button class="tw" type="button" aria-label="펼치기">▼</button>' if kids else '<span class="tw leaf">▶</span>'
                lis.append(f'<li class="{"" if (is_cur and kids) else ("closed" if kids else "")}"><div class="row">{tw}<a href="{f}#{hid}">{html.escape(txt)}</a></div>{kid}</li>')
            sub = '<ul>' + ''.join(lis) + '</ul>'
        tw = f'<button class="tw" type="button" aria-label="펼치기">{"▼" if is_cur else "▶"}</button>' if hs else '<span class="tw leaf">▶</span>'
        items.append(f'<li class="{cls.strip()}"><div class="row">{tw}<a href="{f}">{label} — {crumb}</a></div>{sub}</li>')
    return '<ul class="tree">' + ''.join(items) + '</ul>'

for k, (f, label, crumb, desc, deep) in enumerate(PAGES):
    prev = PAGES[k - 1][0] if k > 0 else None
    nxt = PAGES[k + 1][0] if k + 1 < len(PAGES) else None
    nav = ''.join(f'<a href="{p}"' + (' aria-current="page"' if p == f else '') + f'>{l}</a>' for p, l, *_ in PAGES)
    pn = (f'<a href="{prev}" title="이전 페이지" aria-label="이전 페이지">◀</a>' if prev else '<span>◀</span>') + \
         (f'<a href="{nxt}" title="다음 페이지" aria-label="다음 페이지">▶</a>' if nxt else '<span>▶</span>')
    page = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{TITLES[f]}</title>
<meta name="description" content="{desc}">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="hd">
  <a class="logo" href="index.html">{LOGO}<span class="tx"><b>전산구조해석</b><small>MIDTERM REFERENCE</small></span></a>
  <nav class="topnav" aria-label="페이지">{nav}</nav>
  <span class="who">PNU AEROSPACE</span>
</header>
<div class="sb">
  <button class="burger" type="button" id="burger" aria-label="목차 열고 닫기"><span></span><span></span><span></span></button>
  <div class="crumbs"><a href="index.html">Mechanical APDL Midterm 2026</a><span class="sep">|</span><a href="{f}">{crumb}</a><span class="sep">|</span><a href="#" id="printlink">PDF</a></div>
  <form class="search" id="search" role="search">
    <input type="search" id="q" placeholder="이 페이지에서 검색 (예: sfbeam)" aria-label="이 페이지에서 검색">
    <button class="ic" type="submit" aria-label="검색">{SEARCH_IC}</button>
    <span class="pn">{pn}</span>
  </form>
</div>
<div class="layout">
<aside class="side" id="side" aria-label="목차">
  <div class="shd">Contents <span><button class="x" type="button" id="sbclose" aria-label="목차 닫기">✕</button></span></div>
  <button class="ec" type="button" id="ecall">expand/collapse all</button>
  {sidebar(f)}
</aside>
<main class="content">
  <div class="ctop"><a href="{f}">{crumb} |</a><button class="pr" type="button" id="printbtn">Print page</button></div>
{bodies[f]}
</main>
</div>
<footer class="ft"><span>2026 · 전산구조해석 중간고사 대비 (개인 학습용)</span><a href="https://ansyshelp.ansys.com/" rel="noopener">공식 ANSYS Help</a><a href="index.html">원본 자료</a></footer>
<script src="site.js"></script>
</body>
</html>
'''
    open(os.path.join(OUT, f), 'w').write(page)
    print(f, len(page))

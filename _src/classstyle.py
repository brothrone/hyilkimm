# 사이트 코드의 명령을 수업 txt 파일 표기로 바꾼다 (txt 파일 표기가 최우선).
#   python3 _src/classstyle.py   → _src/*.body.html 을 직접 고친다. 여러 번 실행해도 결과 같음.
import re, os, html
SRC = os.path.dirname(os.path.abspath(__file__))
COL = 36
RENAME = {'pcirc': 'pcir', 'rectng': 'rect', 'wpoffs': 'wpoff', 'secnum': 'secn', 'secoffset': 'secoff', 'secoffs': 'secoff', 'prrsol': 'prrfor'}
LABEL = {'axf': 'axforce', 'axs': 'axstress'}

def fix_cmd(c):
    """명령 한 줄(주석 없음)을 수업 표기로."""
    lead = re.match(r'^\s*', c).group(0); body = c.strip()
    if not body or body.startswith('!') or body.startswith('*') or '=' in body.split(',')[0]: return c
    f = body.split(',')
    h = f[0].lower()
    if h in RENAME: f[0] = RENAME[h] if f[0].islower() else RENAME[h].upper()
    h = f[0].lower()
    if h == 'mp' and len(f) > 1 and f[1].lower() == 'prxy': f[1] = 'nuxy'
    if h == 'prnsol':
        it = f[1].lower() if len(f) > 1 else ''
        cp = f[2].lower() if len(f) > 2 else ''
        if it in ('u', 'rot') and cp in ('', 'comp'): f = [f[0], f[1], 'sum'] + f[3:]
    if h in ('etable', 'pretab', 'pletab', 'plls') or h == '*get':
        f = [LABEL.get(x.lower(), x) for x in f]
    return lead + ','.join(f)

def fix_code_block(code):
    out = []
    for line in code.split('\n'):
        m = re.match(r'^(.*?)(\s*)(<span class="c">! ?(.*?)</span>)\s*$', line)
        cmdpart, cm = (m.group(1), m.group(4)) if m else (line, None)
        if cmdpart.strip() == '' or cmdpart.lstrip().startswith('<span'):
            out.append(line); continue
        raw = html.unescape(cmdpart)
        parts = [p for p in re.split(r'\s+\$\s+', raw)]
        if len(parts) > 1:  # 'a $ b' → 한 줄에 한 명령 (수업 파일 방식)
            cms = cm.split(' · ') if cm else []
            if len(cms) != len(parts): cms = [cm] + [None] * (len(parts) - 1) if cm else [None] * len(parts)
            lead = re.match(r'^\s*', parts[0]).group(0)
            for i, (p, c2) in enumerate(zip(parts, cms)):
                p = fix_cmd((lead if i else '') + p.strip() if i else p)
                out.append(render(p, c2))
            continue
        out.append(render(fix_cmd(raw), cm))
    return '\n'.join(out)

def render(cmd, cm):
    e = html.escape(cmd.rstrip(), quote=False)
    if cm is None: return e
    pad = max(COL - len(cmd.rstrip()), 2)
    return e + ' ' * pad + '<span class="c">! ' + cm + '</span>'

def fix_inline(m):
    t = html.unescape(m.group(1))
    if re.match(r'^(mp,prxy|prrsol|pcirc|rectng|wpoffs|secnum|secoffset|secoffs|prnsol,(u|rot)(,comp)?$|etable,ax[fs],|pretab|pletab)', t, re.I):
        return '<code>' + html.escape(fix_cmd(t), quote=False) + '</code>'
    return m.group(0)

for name in ('exams', 'ref', 'trend', 'index', 'apdl'):
    p = os.path.join(SRC, name + '.body.html'); s = open(p).read()
    s = re.sub(r'(<pre><code>)(.*?)(</code></pre>)', lambda m: m.group(1) + fix_code_block(m.group(2)) + m.group(3), s, flags=re.S)
    s = re.sub(r'<code>([^<]*)</code>', fix_inline, s)
    open(p, 'w').write(s)
    print(name)

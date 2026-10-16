# 코드 블록의 주석 없는 명령 줄마다 설명 주석(! ...)을 붙인다.
#   python3 _src/annotate.py   → _src/*.body.html 을 직접 고친다 (이미 주석이 있는 줄은 그대로)
import re, html, os, sys

SRC = os.path.dirname(os.path.abspath(__file__))
COL = 36  # 주석 시작 열

FACE = {'1': 'face 1 = element −z 방향', '2': 'face 2 = element −y 방향', '3': 'face 3 = 접선(+x)'}
ETAB = {('smisc', '1'): '축력', ('ls', '1'): '축응력', ('smisc', '32'): '굽힘응력 SByT', ('smisc', '33'): '굽힘응력 SByB',
        ('smisc', '34'): '굽힘응력 SBzT', ('smisc', '35'): '굽힘응력 SBzB', ('smisc', '3'): '모멘트 MZ', ('smisc', '4'): '비틀림 TQ',
        ('smisc', '14'): 'J끝 축력', ('smisc', '16'): 'J끝 MZ'}
SECDATA = {'link': lambda a: f'단면적 A = {a[0]}',
           'csolid': lambda a: f'반지름 R = {a[0]}' + (f', 원주 분할 {a[1]}' if len(a) > 1 and a[1] else ''),
           'ctube': lambda a: f'안 반지름 {a[0]}, 바깥 반지름 {a[1]}',
           'rect': lambda a: f'폭 B = {a[0]}, 높이 H = {a[1]}',
           'i': lambda a: f'위·아래 플랜지 폭 {a[0]}, {a[1]} / 높이 {a[2]} / 플랜지 두께 {a[3]}, {a[4]} / 웨브 두께 {a[5]}',
           'chan': lambda a: f'플랜지 폭 {a[0]}, {a[1]} / 높이 {a[2]} / 플랜지 두께 {a[3]}, {a[4]} / 웨브 두께 {a[5]}',
           'hrec': lambda a: '바깥 폭, 바깥 높이, 벽 두께 4개',
           'asec': lambda a: 'A, Iyy, Iyz, Izz, Iw, J 순서로 단면 성질 직접 입력'}
SUBNAME = {'link': 'LINK (단면적만)', 'i': '보, I형', 'chan': '보, C형(채널)', 'csolid': '보, 꽉 찬 원형', 'ctube': '보, 원관',
           'rect': '보, 직사각형', 'asec': '보, 임의 단면(성질 직접 입력)', 'hrec': '보, 사각 중공'}
DOF = {'all': '모든 자유도', 'ux': 'UX', 'uy': 'UY', 'uz': 'UZ', 'rotx': 'ROTX', 'roty': 'ROTY', 'rotz': 'ROTZ'}


class Ctx:
    def __init__(s): s.sub = None; s.cyl = False; s.ets = {}


def coord(v, c):
    names = ('R', 'θ', 'Z') if c.cyl else ('x', 'y', 'z')
    parts = [f'{n}={x}' for n, x in zip(names, v) if x]
    return ', '.join(parts) if parts else f'{names[0]}=0'


def lab(x): return DOF.get(x.lower(), x.upper())


def explain(cmd, a, c):
    a = a + [''] * 12
    lo = [x.lower() for x in a]
    g = lambda *xs: ', '.join(x for x in xs if x)
    if '=' in cmd and not cmd.startswith('*'):
        k, v = cmd.split('=', 1)
        return f'파라미터 {k.strip()} = {v.strip()}' + (',' + ','.join(x for x in a if x) if any(a) else '')
    m = cmd.lower()
    if m == '/prep7': return '전처리기(모델링) 시작'
    if m == '/title': return f'제목 지정'
    if m == '/solu': return '솔루션(해석) 처리기 시작'
    if m == 'solve': return '해석 실행 → [K]{u} = {F} 풀기'
    if m == '/post1': return '일반 후처리기 시작'
    if m == 'finish': return '현재 처리기 종료'
    if m == 'set': return f'결과 읽기 ({a[0] or "첫"} 하중 단계)'
    if m == 'et':
        n = lo[1]; c.ets[a[0]] = n
        if n == 'link180': return f'요소 타입 {a[0]} = LINK180 (3D 봉·트러스, 축력만)'
        if n == 'beam188': return f'요소 타입 {a[0]} = BEAM188 (3D 보)' + (', KEYOPT(3)=3 3차 형상함수' if a[4] == '3' else '')
        if n == 'plane182': return f'요소 타입 {a[0]} = PLANE182 (2D 4절점 고체)'
        return f'요소 타입 {a[0]} = {a[1].upper()}'
    if m == 'keyopt': return f'요소 타입 {a[0]}의 KEYOPT({a[1]}) = {a[2]}'
    if m == 'sectype':
        c.sub = lo[2] if lo[1] == 'beam' else lo[1]
        return f'단면 {a[0]} 정의: ' + SUBNAME.get(c.sub, a[1])
    if m == 'secdata':
        if not a[0] or a[0].startswith('VAL') or a[0] == '...': return '단면 치수 (sectype 종류마다 순서가 다름)'
        f = SECDATA.get(c.sub)
        return f(a) if f else '단면 치수'
    if m in ('secoffs', 'secoffset'):
        if lo[0] == 'cent': return '보 노드를 단면 도심에 둔다 (기본값)'
        if lo[0] == 'shrc': return '보 노드를 전단중심에 둔다'
        if lo[0] == 'origin': return '보 노드를 단면 원점에 둔다'
        if lo[0] == 'user': return f'보 노드를 단면 원점에서 (y, z) = ({a[1] or 0}, {a[2] or 0}) 위치에 둔다'
        return '보 노드를 단면의 어디에 둘지 지정'
    if m == 'secnum': return f'이후 만드는 요소의 단면 번호 = {a[0]}'
    if m == 'mat': return f'이후 만드는 요소의 재료 번호 = {a[0]}'
    if m == 'type': return f'이후 만드는 요소의 요소 타입 번호 = {a[0]}'
    if m == 'mp':
        p = {'ex': '탄성계수 E', 'prxy': '포아송비 ν', 'nuxy': '포아송비 ν', 'gxy': '전단탄성계수 G', 'gxz': '전단탄성계수 G', 'dens': '밀도'}
        return f'재료 {a[1]}: {p.get(lo[0], a[0].upper())} = {a[2]}'
    if m == 'n': return f'노드 {a[0]} 생성: ' + coord(a[1:4], c)
    if m in ('e', 'en'):
        nn = [x for x in a if x]
        if m == 'en': nn = nn[1:]
        if len(nn) == 2: return f'요소 생성: 노드 {nn[0]} – {nn[1]}'
        if len(nn) == 3: return f'요소 생성: 노드 {nn[0]} – {nn[1]}, 방향 노드 K = {nn[2]}'
        return f'요소 생성: 노드 {" → ".join(nn)} (반시계 순서)'
    if m == 'k': return f'키포인트 {a[0]} 생성: ' + coord(a[1:4], c)
    if m == 'l': return f'선 생성: 키포인트 {a[0]} – {a[1]}'
    if m in ('d', 'dk'):
        what = '노드' if m == 'd' else '키포인트'
        tgt = '모든 노드' if lo[0] == 'all' else f'{what} {a[0]}'
        if m == 'd' and a[4]: tgt = f'{what} {a[0]}~{a[4]}' + (f' ({a[5]}씩)' if a[5] else '')
        labs = [lab(a[1])] + [lab(x) for x in (a[6:11] if m == 'd' else a[5:10]) if x]
        if lo[1] == 'all': return f'{tgt} 완전 고정 (모든 자유도 = 0)'
        v = a[2] or '0'
        if v in ('0', '0.0') or not a[2]: return f'{tgt}의 {", ".join(labs)} = 0 구속'
        return f'{tgt}에 {", ".join(labs)} = {v} 변위 부여'
    if m in ('f', 'fk'):
        what = '노드' if m == 'f' else '키포인트'
        tgt = f'{what} {a[0]}' + (f'~{a[4]}' if m == 'f' and a[4] else '')
        return f'{tgt}에 집중하중 {a[1].upper()} = {a[2]} (노드 좌표계 기준)'
    if m == 'sfbeam':
        e = '선택된 모든 요소' if lo[0] == 'all' else f'요소 {a[0]}'
        load = f'{a[3]} → {a[4]} (선형 분포)' if a[4] else f'{a[3]} (등분포)'
        return f'{e}, {FACE.get(a[1], "face " + a[1])}에 분포하중 {load}'
    if m == 'sfedele': return '요소 면하중(sfbeam 포함) 삭제'
    if m == 'prnsol':
        it, cp = lo[0], lo[1]
        if it == 'u': return '절점 변위 출력' + (' (UX, UY, UZ, USUM)' if cp in ('comp', 'sum', '') else f' ({cp.upper()} 성분)')
        if it == 'rot': return '절점 회전각 출력 [rad]' + (' (ROTX, ROTY, ROTZ)' if cp in ('comp', 'sum', '') else f' (ROT{cp.upper()})')
        if it == 's': return '절점 응력 출력'
        return '절점 결과 출력'
    if m in ('prrsol', 'prrfor'): return '반력 출력 (평형 검증: 반력 합 = 하중)'
    if m == 'etable': return f'요소 표 "{a[0]}" = {a[1].upper()} {a[2]}' + (f' ({ETAB[(lo[1], a[2])]})' if (lo[1], a[2]) in ETAB else '')
    if m == 'pretab': return '요소 표 값 출력 (요소별)'
    if m == 'pletab': return '요소 표 값을 색으로 그림'
    if m == 'pldisp': return '변형 형상 그림'
    if m == 'plnsol': return '절점 결과 등고선 그림'
    if m == '*do': return f'반복 시작: {a[0]} = {a[1]} ~ {a[2]}' + (f' ({a[3]}씩)' if a[3] else '')
    if m == '*enddo': return '반복 끝'
    if m == '*if': return '조건문 시작'
    if m == '*else': return '그 밖의 경우'
    if m == '*endif': return '조건문 끝'
    if m == '*get':
        if lo[1] == 'node': return f'{a[0]} = 노드 {a[2]}의 {a[3].upper()}{a[4].upper()} 값'
        if lo[1] == 'area' and lo[3] == 'num': return f'{a[0]} = 가장 큰 면 번호'
        if lo[1] == 'elem' and lo[3] == 'count': return f'{a[0]} = 선택된 요소 개수'
        return f'{a[0]} = ANSYS 값 가져오기'
    if m == '*stat': return f'파라미터 {a[0]} 값 출력'
    if m == '*afun': return '삼각함수 각도 단위를 도(degree)로'
    if m == '/pnum': return f'{a[0].upper()} 번호 표시 ' + ('켜기' if a[1] == '1' else '끄기')
    if m == '/psymb': return '기호 표시 설정'
    if m == '/eshape': return '보·봉을 실제 단면 모양으로 표시'
    if m in ('eplot', 'nplot', 'aplot', 'lplot', 'kplot'):
        return {'eplot': '요소', 'nplot': '노드', 'aplot': '면', 'lplot': '선', 'kplot': '키포인트'}[m] + ' 그리기'
    if m == 'csys': return {'0': '활성 좌표계 = 전역 직교 (X, Y, Z)', '1': '활성 좌표계 = 전역 원통 (R, θ, Z)'}.get(a[0], f'활성 좌표계 = {a[0]}')
    if m == 'local':
        kind = {'0': '직교', '1': '원통', '2': '구'}.get(a[1], a[1])
        rot = f', XY 회전 {a[5]}°' if a[5] else ''
        return f'로컬 좌표계 {a[0]}({kind}) 원점 ({g(a[2] or "0", a[3] or "0")}){rot} → 바로 활성화'
    if m == 'wpave':
        return '작업평면 원점을 ' + coord(a[0:3], c) + ' 로 이동'
    if m == 'wpoffs': return f'작업평면을 현재 위치에서 ({g(a[0] or "0", a[1] or "0")})만큼 이동'
    if m == 'wprota': return '작업평면 회전'
    if m == 'pcirc':
        if a[1] or a[2]:
            ang = f', {a[2]}° ~ {a[3]}°' if a[2] else ''
            return f'작업평면 원점 중심 링: 반지름 {a[0]} ~ {a[1] or a[0]}{ang}'
        return f'작업평면 원점 중심 원: 반지름 {a[0]}'
    if m == 'rectng': return f'사각형: x {a[0]} ~ {a[1]}, y {a[2]} ~ {a[3]} (작업평면 기준)'
    if m == 'aadd': return '면 합치기 (원래 면은 삭제, 새 번호)'
    if m == 'asba': return f'면 {a[0]}에서 ' + ('나머지 선택된 모든 면' if lo[1] == 'all' else f'면 {a[1]}') + '을 뺀다'
    if m == 'al': return '선들로 둘러싸인 면 생성'
    if m == 'lsymm':
        tgt = '모든 선' if lo[1] == 'all' else f'선 {a[1]}~{a[2] or a[1]}'
        return f'{tgt}을 대칭 복사 ({a[0].upper()} 좌표 부호 반전, 활성 직교좌표계 기준)'
    if m == 'nummrg': return '같은 위치에 겹친 키포인트 합치기' if lo[0] == 'kp' else '겹친 항목 합치기'
    if m == 'fill': return '두 노드 사이를 등간격 노드로 채우기' + (f' (노드 {a[0]}~{a[1]})' if a[0] else ' (마지막 두 노드 사이)')
    if m == 'ngen': return f'노드 {a[2]}~{a[3]} 복사: 총 {a[0]}세트, 번호 +{a[1]}씩, 증분 ({g(a[5] or "0", a[6] or "0", a[7] or "0")})' + (' = (dR, dθ, dZ)' if c.cyl else '')
    if m == 'egen': return f'요소 {a[2]}' + (f'~{a[3]}' if a[3] else '') + f' 복사: 총 {a[0]}세트, 노드 번호 +{a[1]}씩'
    if m == 'nrotat': return f'노드 {a[0]}의 노드 좌표계를 활성 좌표계 방향으로 회전'
    if m == 'nmodif': return f'노드 {a[0]} 수정: 빈칸은 유지, THXY = {a[4]}° 회전'
    if m == 'esel':
        if lo[1] == 'type': return f'요소 타입 {a[3]}인 요소만 선택'
        if lo[1] == 'elem': return f'요소 {a[3]}~{a[4]}만 선택'
        return '요소 선택'
    if m == 'allsel': return '전체 다시 선택'
    if m == 'esize': return (f'선 하나를 {a[1]}개 요소로' if a[1] and not a[0] else f'요소 크기 = {a[0]}')
    if m == 'lesize': return f'선 {a[0]}의 분할 지정'
    if m == 'lmesh': return '선 메쉬 (LINK/BEAM 요소 생성)'
    if m == 'amesh': return '면 메쉬 (PLANE 요소 생성)'
    if m == 'mshape': return '요소 모양 = 사각형'
    if m == 'mshkey': return '매핑 메쉬'
    if m == 'aclear': return '면 메쉬 지우기'
    if m == 'save': return '데이터베이스 저장'
    if m == 'resume': return '저장한 데이터베이스 불러오기'
    if m == 'latt': return '선 속성 지정 (재료, 실상수, 타입, 방향 KP, 단면)'
    if m == 'kgen': return '키포인트 복사'
    if m == 'lgen': return '선 복사'
    if m == 'emodif': return '요소 속성 수정'
    if m == 'fsum': return '절점력 합'
    if m == 'esort': return '요소 표 정렬'
    if m == 'sflist': return '면하중 목록'
    if m == '/psf': return '면하중 화살표 표시'
    if m == 'antype': return '해석 종류 지정'
    if m == 'cyl4': return '원 (중심 지정)'
    if m in ('blc4', 'blc5'): return '사각형'
    return None


def track(cmd, a, c):
    m = cmd.lower(); a = a + [''] * 4
    if m == 'csys': c.cyl = a[0] == '1'
    if m == 'local': c.cyl = a[1] == '1'


def annotate_block(code, c):
    out = []
    for line in code.split('\n'):
        vis = html.unescape(re.sub(r'<[^>]+>', '', line))
        mm = re.match(r'^(.*?)(\s*)<span class="c">! ?(.*?)</span>\s*$', line)
        if mm and not vis.strip().startswith('!'):
            old = html.unescape(re.sub(r'<[^>]+>', '', mm.group(3))).strip()
            code = html.unescape(re.sub(r'<[^>]+>', '', mm.group(1)))
            if len(old) <= 30 and code.strip():
                exps = []
                for part in code.split('$'):
                    p = [x.strip() for x in part.strip().split(',')]
                    if not p[0]: continue
                    e = explain(p[0], p[1:], c); track(p[0], p[1:], c)
                    if e: exps.append(e)
                if exps:
                    pad = ' ' * max(2, COL - len(code.rstrip()))
                    gen = ' · '.join(exps)
                    norm = lambda t: re.sub(r'[\s()]', '', t)
                    txt = gen if (len(norm(old)) >= 4 and norm(old) in norm(gen)) else gen + ' — ' + old
                    out.append(mm.group(1).rstrip() + pad + '<span class="c">! ' + html.escape(txt, quote=False) + '</span>')
                    continue
        if '<span class="c">' in line or not vis.strip() or vis.strip().startswith('!') or vis.strip() in ('...', '…'):
            # 이미 주석 있음: 상태만 추적
            for part in vis.split('!')[0].split('$'):
                p = [x.strip() for x in part.strip().split(',')]
                if p[0]: track(p[0], p[1:], c)
            if '<span class="c">' in line:
                for part in vis.split('!')[0].split('$'):
                    p = [x.strip() for x in part.strip().split(',')]
                    if p[0].lower() == 'sectype': c.sub = (p[3].lower() if len(p) > 3 and p[2].lower() == 'beam' else (p[2].lower() if len(p) > 2 else None))
                    if p[0].lower() == 'et' and len(p) > 2: c.ets[p[1]] = p[2].lower()
            out.append(line); continue
        exps = []
        for part in vis.split('$'):
            p = [x.strip() for x in part.strip().split(',')]
            if not p[0]: continue
            e = explain(p[0], p[1:], c)
            track(p[0], p[1:], c)
            if e: exps.append(e)
        if not exps:
            print('  (설명 없음)', vis.strip(), file=sys.stderr); out.append(line); continue
        pad = ' ' * max(2, COL - len(vis.rstrip()))
        out.append(line.rstrip() + pad + '<span class="c">! ' + html.escape(' · '.join(exps), quote=False) + '</span>')
    return '\n'.join(out)


def run(path):
    s = open(path).read()
    c = Ctx()
    def rep(m):
        return '<pre><code>' + annotate_block(m.group(1), c) + '</code></pre>'
    s2 = re.sub(r'<pre><code>(.*?)</code></pre>', rep, s, flags=re.S)
    open(path, 'w').write(s2)


if __name__ == '__main__':
    for f in ('exams.body.html', 'ref.body.html', 'trend.body.html'):
        print(f); run(os.path.join(SRC, f))

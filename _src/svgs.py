DEFS = '''<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
<marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c4161c"/></marker>
<marker id="ahb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#0b59a8"/></marker></defs>'''

SECTIONS = '''<figure class="fig svgfig">
<svg viewBox="0 0 640 300" role="img" aria-label="I 단면과 CHAN 단면의 SECDATA 치수 W1, W2, W3, t1, t2, t3와 SECOFFSET 기준점">
''' + DEFS + '''
<g font-family="Arial, sans-serif" font-size="13" fill="#222">
<!-- I section -->
<text x="40" y="22" font-weight="bold">Subtype = I</text>
<rect x="60" y="50" width="160" height="16" fill="#9fc3e6" stroke="#245" />
<rect x="60" y="234" width="160" height="16" fill="#9fc3e6" stroke="#245" />
<rect x="133" y="66" width="14" height="168" fill="#9fc3e6" stroke="#245" />
<line x1="60" y1="38" x2="220" y2="38" stroke="#0b59a8" marker-start="url(#ahb)" marker-end="url(#ahb)"/><text x="125" y="34" fill="#0b59a8">W1</text>
<line x1="60" y1="264" x2="220" y2="264" stroke="#0b59a8" marker-start="url(#ahb)" marker-end="url(#ahb)"/><text x="125" y="282" fill="#0b59a8">W2</text>
<line x1="240" y1="50" x2="240" y2="250" stroke="#0b59a8" marker-start="url(#ahb)" marker-end="url(#ahb)"/><text x="246" y="154" fill="#0b59a8">W3</text>
<text x="226" y="62" fill="#c4161c">t1</text><text x="226" y="247" fill="#c4161c">t2</text><text x="112" y="200" fill="#c4161c">t3</text>
<line x1="140" y1="150" x2="140" y2="96" stroke="#333" marker-end="url(#ah)"/><text x="128" y="92">z</text>
<line x1="140" y1="150" x2="196" y2="150" stroke="#333" marker-end="url(#ah)"/><text x="200" y="154">y</text>
<!-- CHAN section -->
<text x="360" y="22" font-weight="bold">Subtype = CHAN</text>
<rect x="400" y="50" width="90" height="16" fill="#9fc3e6" stroke="#245" />
<rect x="400" y="234" width="90" height="16" fill="#9fc3e6" stroke="#245" />
<rect x="400" y="66" width="16" height="168" fill="#9fc3e6" stroke="#245" />
<line x1="400" y1="38" x2="490" y2="38" stroke="#0b59a8" marker-start="url(#ahb)" marker-end="url(#ahb)"/><text x="436" y="34" fill="#0b59a8">W1</text>
<line x1="400" y1="264" x2="490" y2="264" stroke="#0b59a8" marker-start="url(#ahb)" marker-end="url(#ahb)"/><text x="436" y="282" fill="#0b59a8">W2</text>
<line x1="510" y1="50" x2="510" y2="250" stroke="#0b59a8" marker-start="url(#ahb)" marker-end="url(#ahb)"/><text x="516" y="154" fill="#0b59a8">W3</text>
<text x="496" y="62" fill="#c4161c">t1</text><text x="496" y="247" fill="#c4161c">t2</text><text x="420" y="200" fill="#c4161c">t3</text>
<circle cx="400" cy="250" r="5" fill="#111"/><text x="352" y="270" font-size="12">ORIGIN</text>
<text x="424" y="155" font-size="15" fill="#111">✕</text><text x="440" y="155" font-size="12">CENT</text>
<circle cx="378" cy="150" r="5" fill="none" stroke="#111" stroke-width="1.6"/><text x="340" y="140" font-size="12">SHRC</text>
<circle cx="400" cy="150" r="4" fill="#c4161c"/><text x="560" y="128" font-size="12" fill="#c4161c">USER 예:</text><text x="560" y="144" font-size="12" fill="#c4161c">(0, W3/2)</text>
<line x1="556" y1="140" x2="408" y2="150" stroke="#c4161c" stroke-dasharray="3 3"/>
</g></svg>
<figcaption>I·CHAN 단면 <code>secdata,W1,W2,W3,t1,t2,t3</code> 순서 — W3 = 전체 높이(단면 z방향), t3 = 웨브 두께. CHAN의 SECOFFSET 기준점: ORIGIN(웨브 바깥 아래 모서리), CENT(도심), SHRC(전단중심, 웨브 바깥쪽), USER(OFFSETY, OFFSETZ). 직접 그린 개략도</figcaption>
</figure>
'''

BEAM = '''<figure class="fig svgfig wide">
<svg viewBox="0 0 960 340" role="img" aria-label="BEAM188 방향 세 경우: 보 위에 K를 두면 element z가 위로 서고 I형강 높이가 세로가 되어 face 1 하중이 아래로 작용, K가 없으면 z가 화면 밖으로 나와 단면이 누워 face 2가 아래, 기둥은 K를 옆에 두면 z가 K 쪽 수평이 된다">
''' + DEFS + '''
<defs><marker id="ahg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2e7d32"/></marker></defs>
<g font-family="Arial, sans-serif" font-size="13" fill="#222">
<line x1="320" y1="10" x2="320" y2="330" stroke="#ddd"/><line x1="640" y1="10" x2="640" y2="330" stroke="#ddd"/>
<text x="14" y="26" font-weight="bold" font-size="14">① 보 + K를 위(+Y)에 — 권장</text>
<line x1="36" y1="180" x2="250" y2="180" stroke="#456" stroke-width="7" stroke-linecap="round" opacity=".45"/>
<circle cx="36" cy="180" r="5" fill="#111"/><text x="22" y="202" font-weight="bold">I</text>
<circle cx="250" cy="180" r="5" fill="#111"/><text x="246" y="202" font-weight="bold">J</text>
<line x1="150" y1="174" x2="150" y2="76" stroke="#888" stroke-dasharray="4 4"/>
<circle cx="150" cy="70" r="6" fill="#fff" stroke="#111" stroke-width="2"/><text x="162" y="75" font-weight="bold">K</text>
<line x1="75" y1="128" x2="75" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><line x1="115" y1="128" x2="115" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><line x1="195" y1="128" x2="195" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><line x1="235" y1="128" x2="235" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><text x="60" y="120" fill="#c4161c" font-size="12">sfbeam,…,1,pres,w → 아래</text>
<line x1="40" y1="270" x2="88" y2="270" stroke="#111" stroke-width="2" marker-end="url(#ah)"/><text x="94" y="275" fill="#111" font-weight="bold">x</text><line x1="40" y1="270" x2="40" y2="226" stroke="#0b59a8" stroke-width="2" marker-end="url(#ahb)"/><text x="46" y="220" fill="#0b59a8" font-weight="bold">z</text><circle cx="40" cy="270" r="7" fill="#fff" stroke="#2e7d32" stroke-width="1.6"/><path d="M36,266L44,274M44,266L36,274" stroke="#2e7d32" stroke-width="1.6"/><text x="28" y="292" fill="#2e7d32" font-weight="bold">y</text><g fill="#7cc3e8" stroke="#0b59a8"><rect x="232" y="248" width="36" height="5"/><rect x="248" y="253" width="4" height="30"/><rect x="232" y="283" width="36" height="5"/></g>
<text x="190" y="314" font-size="12">단면 높이(z) = 세로 → <tspan font-weight="bold" fill="#0b59a8">강축</tspan></text><text x="334" y="26" font-weight="bold" font-size="14">② K 없음 (기본값)</text>
<line x1="356" y1="180" x2="570" y2="180" stroke="#456" stroke-width="7" stroke-linecap="round" opacity=".45"/>
<circle cx="356" cy="180" r="5" fill="#111"/><text x="342" y="202" font-weight="bold">I</text>
<circle cx="570" cy="180" r="5" fill="#111"/><text x="566" y="202" font-weight="bold">J</text>
<line x1="395" y1="128" x2="395" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><line x1="445" y1="128" x2="445" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><line x1="500" y1="128" x2="500" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><line x1="550" y1="128" x2="550" y2="170" stroke="#c4161c" stroke-width="1.6" marker-end="url(#ahr)"/><text x="380" y="120" fill="#c4161c" font-size="12">sfbeam,…,2,pres,w → 아래</text>
<line x1="360" y1="270" x2="408" y2="270" stroke="#111" stroke-width="2" marker-end="url(#ah)"/><text x="414" y="275" fill="#111" font-weight="bold">x</text><line x1="360" y1="270" x2="360" y2="226" stroke="#2e7d32" stroke-width="2" marker-end="url(#ahg)"/><text x="366" y="220" fill="#2e7d32" font-weight="bold">y</text><circle cx="360" cy="270" r="7" fill="#fff" stroke="#0b59a8" stroke-width="1.6"/><circle cx="360" cy="270" r="2.2" fill="#0b59a8"/><text x="348" y="292" fill="#0b59a8" font-weight="bold">z</text><g fill="#7cc3e8" stroke="#0b59a8"><rect x="550" y="250" width="5" height="36"/><rect x="555" y="266" width="30" height="4"/><rect x="585" y="250" width="5" height="36"/></g>
<text x="470" y="314" font-size="12">단면 높이(z) = 옆으로 → <tspan font-weight="bold" fill="#c4161c">약축!</tspan></text>
<text x="334" y="60" font-size="12" fill="#555">y = global X-Y 평면 안 (보가 +X면 y = +Y)</text>
<text x="334" y="78" font-size="12" fill="#555">z = 화면 밖(+Z) — I·CHAN·RECT 높이가 누움</text><text x="654" y="26" font-weight="bold" font-size="14">③ 기둥(I 위 → J 아래) + K를 옆에</text>
<line x1="760" y1="60" x2="760" y2="250" stroke="#456" stroke-width="7" stroke-linecap="round" opacity=".45"/>
<circle cx="760" cy="60" r="5" fill="#111"/><text x="740" y="64" font-weight="bold">I</text>
<circle cx="760" cy="250" r="5" fill="#111"/><text x="740" y="262" font-weight="bold">J</text>
<line x1="766" y1="155" x2="864" y2="155" stroke="#888" stroke-dasharray="4 4"/>
<circle cx="870" cy="155" r="6" fill="#fff" stroke="#111" stroke-width="2"/><text x="880" y="160" font-weight="bold">K</text>
<line x1="672" y1="236" x2="672" y2="282" stroke="#111" stroke-width="2" marker-end="url(#ah)"/><text x="678" y="298" fill="#111" font-weight="bold">x</text><line x1="672" y1="236" x2="718" y2="236" stroke="#0b59a8" stroke-width="2" marker-end="url(#ahb)"/><text x="724" y="241" fill="#0b59a8" font-weight="bold">z</text><circle cx="672" cy="236" r="7" fill="#fff" stroke="#2e7d32" stroke-width="1.6"/><path d="M668,232L676,240M676,232L668,240" stroke="#2e7d32" stroke-width="1.6"/><text x="660" y="258" fill="#2e7d32" font-weight="bold">y</text><g fill="#7cc3e8" stroke="#0b59a8"><rect x="875" y="250" width="5" height="36"/><rect x="880" y="266" width="30" height="4"/><rect x="910" y="250" width="5" height="36"/></g>
<text x="790" y="314" font-size="12">높이(z) = X 방향 → <tspan font-weight="bold" fill="#0b59a8">강축</tspan></text>
<text x="654" y="96" font-size="12" fill="#555">x = I→J = 아래(−Y)</text>
<text x="654" y="114" font-size="12" fill="#555">z = 기둥에서 K 쪽 = +X</text>
</g></svg>
<figcaption>BEAM188 방향 세 경우 (화면 = global X-Y 평면, 앞쪽이 +Z). ⊗ = 화면 안쪽, ⊙ = 화면 밖. 오른쪽 아래 작은 그림은 보 축 방향에서 본 단면. <b>z는 언제나 K를 향하고, y = z × x</b>.</figcaption>
</figure>
'''

TRI = '''<figure class="fig svgfig">
<svg viewBox="0 0 640 170" role="img" aria-label="요소마다 VALI, VALJ를 주는 삼각 분포하중">
''' + DEFS + '''
<g font-family="Arial, sans-serif" font-size="13" fill="#222">
<polygon points="60,120 320,30 580,120" fill="#c4161c" opacity=".10"/>
<polyline points="60,120 320,30 580,120" fill="none" stroke="#c4161c" stroke-width="1.5"/>
<g stroke="#c4161c" marker-end="url(#ahr)">
<line x1="125" y1="98" x2="125" y2="128"/><line x1="190" y1="75" x2="190" y2="128"/><line x1="255" y1="53" x2="255" y2="128"/><line x1="320" y1="31" x2="320" y2="128"/><line x1="385" y1="53" x2="385" y2="128"/><line x1="450" y1="75" x2="450" y2="128"/><line x1="515" y1="98" x2="515" y2="128"/></g>
<line x1="60" y1="132" x2="580" y2="132" stroke="#245" stroke-width="6" opacity=".4"/>
<g fill="#111"><circle cx="60" cy="132" r="4"/><circle cx="125" cy="132" r="4"/><circle cx="190" cy="132" r="4"/><circle cx="255" cy="132" r="4"/><circle cx="320" cy="132" r="4"/><circle cx="385" cy="132" r="4"/><circle cx="450" cy="132" r="4"/><circle cx="515" cy="132" r="4"/><circle cx="580" cy="132" r="4"/></g>
<text x="300" y="22" fill="#c4161c" font-weight="bold">w<tspan font-size="10">max</tspan></text>
<text x="140" y="156">요소 i : sfbeam,i,1,pres,w(x<tspan font-size="10">I</tspan>),w(x<tspan font-size="10">J</tspan>)</text>
</g></svg>
<figcaption>삼각 분포하중 = 요소마다 선형(VALI → VALJ). 꼭짓점과 지점에 노드가 오도록 나눈다</figcaption>
</figure>
'''

PCIRC = '''<figure class="fig svgfig">
<svg viewBox="0 -30 640 250" role="img" aria-label="PCIRC 명령: 작업평면 원점을 중심으로 RAD1, RAD2, THETA1, THETA2">
''' + DEFS + '''
<g font-family="Arial, sans-serif" font-size="13" fill="#222">
<path d="M 230 6.79 A 200 200 0 0 1 430 6.79 L 380 93.4 A 100 100 0 0 0 280 93.4 Z" transform="translate(0,0)" fill="#9fc3e6" stroke="#245"/>
<circle cx="330" cy="180" r="4" fill="#111"/><text x="290" y="204">WP 원점</text>
<line x1="330" y1="180" x2="620" y2="180" stroke="#333" marker-end="url(#ah)"/><text x="600" y="200">WX</text>
<line x1="330" y1="180" x2="330" y2="10" stroke="#999" stroke-dasharray="4 4"/>
<line x1="330" y1="180" x2="380" y2="93.4" stroke="#0b59a8" marker-end="url(#ahb)"/><text x="364" y="132" fill="#0b59a8">RAD1</text>
<line x1="330" y1="180" x2="430" y2="6.79" stroke="#0b59a8" stroke-dasharray="5 3"/><text x="420" y="40" fill="#0b59a8">RAD2</text>
<path d="M 400 180 A 70 70 0 0 0 365 119.4" fill="none" stroke="#c4161c" marker-end="url(#ahr)"/><text x="404" y="150" fill="#c4161c">THETA1 = 60°</text>
<path d="M 450 180 A 120 120 0 0 0 270 76.1" fill="none" stroke="#c4161c" stroke-dasharray="4 3" marker-end="url(#ahr)"/><text x="470" y="110" fill="#c4161c">THETA2 = 120°</text>
<text x="20" y="40" font-family="Consolas, monospace">pcirc,1,2,60,120</text>
</g></svg>
<figcaption><code>pcirc,RAD1,RAD2,THETA1,THETA2</code> — 항상 WP 원점이 중심. 위치를 바꾸려면 먼저 <code>wpave</code> / <code>wpoffs</code>. 직접 그린 개략도</figcaption>
</figure>
'''

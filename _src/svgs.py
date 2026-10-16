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

BEAM = '''<figure class="fig svgfig">
<svg viewBox="0 0 640 260" role="img" aria-label="BEAM188 요소 좌표계: I에서 J로 x축, K 노드 쪽으로 z축, SFBEAM face 1은 -z 방향, face 2는 -y 방향">
''' + DEFS + '''
<g font-family="Arial, sans-serif" font-size="13" fill="#222">
<line x1="110" y1="170" x2="470" y2="170" stroke="#245" stroke-width="10" stroke-linecap="round" opacity=".35"/>
<circle cx="110" cy="170" r="6" fill="#111"/><text x="96" y="196" font-weight="bold">I</text>
<circle cx="470" cy="170" r="6" fill="#111"/><text x="466" y="196" font-weight="bold">J</text>
<circle cx="290" cy="40" r="6" fill="#fff" stroke="#111" stroke-width="2"/><text x="302" y="44" font-weight="bold">K (방향 노드)</text>
<line x1="290" y1="160" x2="290" y2="50" stroke="#999" stroke-dasharray="4 4"/>
<line x1="110" y1="170" x2="560" y2="170" stroke="#333" marker-end="url(#ah)"/><text x="566" y="175">x (I→J)</text>
<line x1="110" y1="170" x2="110" y2="80" stroke="#333" marker-end="url(#ah)"/><text x="98" y="72">z (K 쪽)</text>
<line x1="110" y1="170" x2="60" y2="215" stroke="#333" marker-end="url(#ah)"/><text x="36" y="232">y</text>
<g stroke="#c4161c" marker-end="url(#ahr)">
<line x1="170" y1="110" x2="170" y2="158"/><line x1="230" y1="110" x2="230" y2="158"/><line x1="350" y1="110" x2="350" y2="158"/><line x1="410" y1="110" x2="410" y2="158"/>
</g>
<text x="340" y="100" fill="#c4161c" font-weight="bold">LKEY 1 : −z 방향</text>
<g stroke="#0b59a8" marker-end="url(#ahb)">
<line x1="250" y1="230" x2="268" y2="180"/><line x1="390" y1="230" x2="408" y2="180"/>
</g>
<text x="420" y="236" fill="#0b59a8" font-weight="bold">LKEY 2 : −y 방향</text>
</g></svg>
<figcaption>BEAM188 요소 좌표계와 <code>sfbeam</code> LKEY. I–J–K가 element x–z 평면을 만든다. 양(+)의 PRES는 face 1에서 −z, face 2에서 −y로 작용한다. K가 없으면 element y가 global XY 평면에 평행하다. 직접 그린 개략도</figcaption>
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

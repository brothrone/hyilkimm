# Builds data/cmdidx.json from a local mirror of the ANSYS 18.2 Command Reference
# (https://www.mm.bme.hu/~gyebro/files/ans_help_v182/ans_cmd/). usage: python3 mkcmdidx.py <dir with Hlp_C_*.html> <out.json>
import re, json, html, glob, os, sys
src, out = sys.argv[1], sys.argv[2]
def clean(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
res = []
for f in sorted(glob.glob(os.path.join(src, 'Hlp_C_*.html'))):
    fid = os.path.basename(f)[:-5]
    if re.match(r'Hlp_C_(CH\d|CmdTOC|Part|App)', fid): continue
    t = open(f, encoding='latin-1').read()
    m = re.search(r'<div class="refnamediv">(.*?)<b class="refpurpose">(.*?)</b>(.*?)</p></div>(.*)', t, re.S)
    if not m: continue
    syn = re.sub(r'\s+,', ',', clean(m.group(1)))
    purpose = clean(m.group(2))
    proc = re.search(r'<code class="classname">(.*?)</code>', m.group(3))
    cat = re.search(r'<span class="type">(.*?)</span>', m.group(3))
    body = clean(m.group(4))
    body = re.sub(r'Release 18\.2.*$', '', body)
    res.append({'id': fid[6:], 'f': fid + '.html', 'syn': syn[:240], 'p': purpose[:200],
                'proc': clean(proc.group(1)) if proc else '', 'cat': clean(cat.group(1)) if cat else '',
                'b': body[:900]})
json.dump(res, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(res), os.path.getsize(out))

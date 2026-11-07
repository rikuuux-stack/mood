"""Réécrit le bloc <svg> des filtres de index.html (#tone, #erode1 … #erode4) à partir de js/wall.js (TONE, ERODE),
   et leurs jumeaux #toneN, #erode1N … #erode4N pour les fichiers DÉJÀ en négatif (fix-original : seulement la transparence).
   Usage : python3 tools/filters.py .   (puis python3 tools/stamp.py)"""
import re, sys, json
root = sys.argv[1]
w = open(f'{root}/js/wall.js').read()
TONE = json.loads(re.search(r'export const TONE = (\[[^\]]+\])', w).group(1))
found = [dict(t=float(a), k=float(b), g=float(c)) for a, b, c in re.findall(r'\{ t: ([\d.]+), k: ([\d.]+), g: ([\d.]+) \}', w)]
BASE, ERODE = found[0], found[1:5]          # BASE (photo neuve) puis les quatre paliers
fmt = lambda x: ('%g' % round(x, 4))
table = ' '.join(fmt(v) for v in reversed(TONE))     # inversion + courbe en une seule table
funcs = lambda res='': (f'    <feComponentTransfer{res}>\n' + ''.join(f'      <feFunc{c} type="table" tableValues="{table}"/>\n' for c in 'RGB') + '    </feComponentTransfer>\n')
out = ['<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">\n']
for fid, e in [('tone', BASE)] + [(f'erode{i}', e) for i, e in enumerate(ERODE, 1)]:
    c = 1 - e['k'] * e['t']
    out.append(f'  <filter id="{fid}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">\n')
    out.append('    <feColorMatrix type="saturate" values="0"/>\n')
    out.append(funcs(' result="t"'))
    if e['g'] > 0:
        off = 0.5 - e['g'] * 0.5
        out.append('    <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>\n')
        out.append(f'    <feColorMatrix values="{fmt(e["g"])} 0 0 0 {fmt(off)}  {fmt(e["g"])} 0 0 0 {fmt(off)}  {fmt(e["g"])} 0 0 0 {fmt(off)}  0 0 0 0 1"/>\n')
        out.append('    <feBlend mode="overlay" in2="t" result="g"/>\n')
        src = 'g'
    else:
        src = 't'
    out.append(f'    <feColorMatrix in="t" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {fmt(e["k"])} 0 0 0 {fmt(c)}" result="a"/>\n')
    out.append(f'    <feComposite in="{src}" in2="a" operator="in"/>\n')
    out.append('  </filter>\n')
# fichiers déjà en négatif (faits sur le téléphone) : le gris stocké EST le négatif → pas de seconde inversion,
# seulement l'opacité, avec les mêmes seuils et pentes (même rendu que #tone / #erodeN sur un original)
for fid, e in [('toneN', BASE)] + [(f'erode{i}N', e) for i, e in enumerate(ERODE, 1)]:
    c = 1 - e['k'] * e['t']
    out.append(f'  <filter id="{fid}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">\n')
    out.append('    <feColorMatrix type="saturate" values="0" result="t"/>\n')
    out.append(f'    <feColorMatrix in="t" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {fmt(e["k"])} 0 0 0 {fmt(c)}" result="a"/>\n')
    out.append('    <feComposite in="t" in2="a" operator="in"/>\n')
    out.append('  </filter>\n')
out.append('</svg>')
p = f'{root}/index.html'
h = open(p).read()
h2 = re.sub(r'<svg width="0" height="0" style="position:absolute"[\s\S]*?</svg>', ''.join(out), h, count=1)
assert h2 != h or True
open(p, 'w').write(h2)
print('tone', table, 'base', BASE, 'erode', ERODE)

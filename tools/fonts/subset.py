#!/usr/bin/env python3
"""
Polices auto-hébergées : découpe les TTF de tools/fonts/src/ en .woff2 légers
dans assets/fonts/. Garde tous les caractères présents dans le site (textes JS/HTML)
+ latin complet + kana + ponctuation japonaise.
À relancer après avoir ajouté du texte japonais nouveau :
    pip install fonttools brotli
    python3 tools/fonts/subset.py
(Un caractère absent s'affiche quand même, dans la police japonaise du système.)
"""
import pathlib, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC, OUT = ROOT / 'tools/fonts/src', ROOT / 'assets/fonts'
text = set()
for p in list(ROOT.glob('*.html')) + list((ROOT / 'js').rglob('*.js')):
    text |= set(p.read_text(encoding='utf-8'))
extra = ''.join(chr(c) for r in [(0x20, 0x7e), (0xa0, 0x17f), (0x2000, 0x206f), (0x3000, 0x30ff), (0xff01, 0xff5e)] for c in range(r[0], r[1] + 1))
cjk = ''.join(sorted(c for c in text if ord(c) > 0x2e80)) + extra
latin = ''.join(chr(c) for r in [(0x20, 0x7e), (0xa0, 0x17f), (0x2000, 0x206f), (0x2190, 0x21ff), (0x25a0, 0x25ff)] for c in range(r[0], r[1] + 1))
jobs = [('ZenKakuGothicNew-Regular', cjk), ('ZenKakuGothicNew-Medium', cjk),
        ('IBMPlexMono-Regular', latin + ''.join(c for c in text if ord(c) < 0x2e80)),
        ('IBMPlexMono-Medium', latin + ''.join(c for c in text if ord(c) < 0x2e80))]
for name, chars in jobs:
    (ROOT / 'tools/fonts/.chars.txt').write_text(chars, encoding='utf-8')
    subprocess.run([sys.executable, '-m', 'fontTools.subset', str(SRC / f'{name}.ttf'),
                    f'--text-file={ROOT / "tools/fonts/.chars.txt"}', '--flavor=woff2',
                    '--layout-features=*', '--no-hinting', f'--output-file={OUT / (name + ".woff2")}'], check=True)
    print(f'{name}.woff2  {(OUT / (name + ".woff2")).stat().st_size // 1024} Ko')
(ROOT / 'tools/fonts/.chars.txt').unlink()

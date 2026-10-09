#!/usr/bin/env python3
"""
Polices auto-hébergées : découpe les TTF de tools/fonts/src/ en .woff2 légers dans assets/fonts/.
Garde : tous les caractères des textes du site (HTML + JS), le latin étendu, les kana et la
ponctuation japonaise. Les kanji des dépôts des visiteurs qui ne sont pas dans le sous-ensemble
s'affichent dans la police japonaise du système (Hiragino sur iPhone), très proche.

À relancer après avoir modifié des textes japonais du site :
    pip install fonttools brotli
    python3 tools/fonts/subset.py
"""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC, OUT = ROOT / 'tools/fonts/src', ROOT / 'assets/fonts'
OUT.mkdir(parents=True, exist_ok=True)

text = set()
for p in list(ROOT.glob('*.html')) + list(ROOT.glob('admin/*.html')) + list((ROOT / 'js').rglob('*.js')):
    text |= set(p.read_text(encoding='utf-8'))

def ranges(*rs):
    return ''.join(chr(c) for a, b in rs for c in range(a, b + 1))

latin = ranges((0x20, 0x7e), (0xa0, 0x17f), (0x2000, 0x206f), (0x20ac, 0x20ac), (0x2190, 0x2193))
japanese = ranges((0x3000, 0x30ff), (0xff01, 0xff5e)) + ''.join(sorted(c for c in text if ord(c) > 0x2e80))
site = ''.join(sorted(text))

jobs = [
    ('ZenKakuGothicNew-Regular', latin + japanese + site),
    ('ZenKakuGothicNew-Bold', latin + japanese + site),
    ('ZenKakuGothicNew-Black', 'RIKU' + latin),              # uniquement le nom dans le bandeau
    ('IBMPlexMono-Regular', latin + ''.join(c for c in site if ord(c) < 0x2e80)),
]
chars = ROOT / 'tools/fonts/.chars.txt'
for name, s in jobs:
    chars.write_text(s, encoding='utf-8')
    subprocess.run([sys.executable, '-m', 'fontTools.subset', str(SRC / f'{name}.ttf'),
                    f'--text-file={chars}', '--flavor=woff2', '--layout-features=*', '--no-hinting',
                    f'--output-file={OUT / (name + ".woff2")}'], check=True)
    print(f'{name}.woff2  {(OUT / (name + ".woff2")).stat().st_size // 1024} Ko')
chars.unlink()

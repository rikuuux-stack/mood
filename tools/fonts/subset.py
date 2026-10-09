#!/usr/bin/env python3
"""
Polices auto-hébergées (licence SIL OFL) : découpe les TTF de tools/fonts/src/ en .woff2 légers
dans assets/fonts/ et RÉÉCRIT css/fonts.css.

  - IBM Plex Sans JP ExtraLight (200) : tous les textes.
      · un fichier « core » : latin, kana, ponctuation et tous les caractères des textes du site ;
      · des tranches de kanji (unicode-range) : le navigateur ne télécharge que les tranches
        des kanji réellement affichés (dépôts des visiteurs), comme Google Fonts, mais chez nous.
  - IBM Plex Sans JP Thin (100) : le nom « RIKU » (latin seulement).
  - IBM Plex Mono ExtraLight (200) : petites légendes (dates, poids des fichiers).

À relancer après avoir modifié des textes du site :
    pip install fonttools brotli
    python3 tools/fonts/subset.py
"""
import pathlib, subprocess, sys
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC, OUT = ROOT / 'tools/fonts/src', ROOT / 'assets/fonts'
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob('*.woff2'):
    old.unlink()

text = set()
for p in list(ROOT.glob('*.html')) + list(ROOT.glob('admin/*.html')) + list((ROOT / 'js').rglob('*.js')):
    text |= set(p.read_text(encoding='utf-8'))

def chars(*rs):
    return {c for a, b in rs for c in range(a, b + 1)}

def urange(cps):
    """Ensemble de points de code → chaîne unicode-range compacte."""
    cps, out, i = sorted(cps), [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ', '.join(out)

def subset(src, cps, name):
    lst = ROOT / 'tools/fonts/.chars.txt'
    lst.write_text(''.join(chr(c) for c in sorted(cps)), encoding='utf-8')
    subprocess.run([sys.executable, '-m', 'fontTools.subset', str(SRC / src), f'--text-file={lst}',
                    '--flavor=woff2', '--layout-features=*', '--no-hinting',
                    f'--output-file={OUT / name}'], check=True, stderr=subprocess.DEVNULL)
    lst.unlink()
    return (OUT / name).stat().st_size

LATIN = chars((0x20, 0x7E), (0xA0, 0x17F), (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2190, 0x2193), (0x2212, 0x2212))
KANA = chars((0x3000, 0x30FF), (0xFF01, 0xFF5E), (0x30FB, 0x30FC))
KANJI_BLOCK = 0x200

sans = 'IBMPlexSansJP-ExtraLight.ttf'
have = set(TTFont(SRC / sans).getBestCmap())
site = {ord(c) for c in text}
core = (LATIN | KANA | site) & have
kanji = sorted(c for c in have if (0x4E00 <= c <= 0x9FFF or 0xF900 <= c <= 0xFAFF or 0x3400 <= c <= 0x4DBF) and c not in core)

faces, total = [], 0
# tranches d'abord, « core » en dernier : en cas de recouvrement, la dernière déclaration l'emporte
slices = {}
for c in kanji:
    slices.setdefault(c // KANJI_BLOCK, []).append(c)
for k, cps in sorted(slices.items()):
    name = f'PlexSansJP-200-k{k:03x}.woff2'
    total += subset(sans, set(cps), name)
    faces.append(("IBM Plex Sans JP", 200, name, urange(cps)))
size = subset(sans, core, 'PlexSansJP-200-core.woff2')
faces.append(("IBM Plex Sans JP", 200, 'PlexSansJP-200-core.woff2', urange(core)))
print(f'Sans 200 : core {size // 1024} Ko + {len(slices)} tranches de kanji ({total // 1024} Ko au total, chargées à la demande)')

thin = {ord(c) for c in 'RIKUMod'}  # seuls « Mood » (bandeau) et « RIKU » (panneau) utilisent le Thin
thin = thin & set(TTFont(SRC / 'IBMPlexSansJP-Thin.ttf').getBestCmap())
size = subset('IBMPlexSansJP-Thin.ttf', thin, 'PlexSansJP-100-latin.woff2')
faces.append(("IBM Plex Sans JP", 100, 'PlexSansJP-100-latin.woff2', urange(thin)))
print(f'Sans 100 (RIKU) : {size} octets')

mono = (LATIN | {c for c in site if c < 0x2E80}) & set(TTFont(SRC / 'IBMPlexMono-ExtraLight.ttf').getBestCmap())
size = subset('IBMPlexMono-ExtraLight.ttf', mono, 'PlexMono-200-latin.woff2')
faces.append(("IBM Plex Mono", 200, 'PlexMono-200-latin.woff2', urange(mono)))
print(f'Mono 200 : {size // 1024} Ko')

css = ['/* Généré par tools/fonts/subset.py — ne pas modifier à la main.',
       '   IBM Plex Sans JP et IBM Plex Mono, licence SIL OFL (assets/fonts/OFL-*.txt). */']
for fam, w, file, rng in faces:
    css.append(f"@font-face {{ font-family: '{fam}'; font-weight: {w}; font-style: normal; font-display: swap;\n"
               f"  src: url('../assets/fonts/{file}') format('woff2');\n  unicode-range: {rng}; }}")
(ROOT / 'css/fonts.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print('css/fonts.css réécrit')

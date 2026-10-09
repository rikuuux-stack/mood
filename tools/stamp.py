#!/usr/bin/env python3
"""
CACHE-BUSTING — ajoute à chaque adresse de fichier interne une empreinte de son contenu :
    js/main.js  →  js/main.js?v=3f9a1c0b2d

Un navigateur qui a gardé une ancienne version en cache voit une adresse NOUVELLE dès que le
fichier change, et la retélécharge. Un fichier inchangé garde son adresse (et son cache).

Références traitées :
  - index.html (et admin/*.html) : <script src>, <link href> (CSS, préchargement de police) ;
  - js/**/*.js : import … from './x.js', export … from './x.js', import('./x.js') ;
  - css/*.css : url('../assets/…').
L'empreinte d'un fichier dépend de son contenu, y compris des empreintes qu'il cite : si
js/i18n.js change, la ligne d'import de js/main.js change, donc l'empreinte de main.js aussi,
et index.html charge le nouveau main.js. On recalcule jusqu'à stabilité.

À lancer avant chaque mise en ligne (tools/fonts/subset.py le lance aussi) :
    python3 tools/stamp.py           # met à jour les empreintes
    python3 tools/stamp.py --check   # vérifie seulement (code de sortie 1 si une empreinte est périmée)
"""
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

def sources():
    files = [ROOT / 'index.html', *sorted((ROOT / 'admin').glob('*.html'))]
    files += sorted((ROOT / 'css').glob('*.css')) + sorted((ROOT / 'js').rglob('*.js'))
    return [f for f in files if f.exists()]

# (motif, groupe du chemin) — le groupe « v » contient l'éventuelle empreinte existante
PATTERNS = {
    '.html': re.compile(r'''(?P<pre>\b(?:src|href)=")(?P<path>(?!https?:|data:|mailto:|#|/)[^"?#]+\.(?:js|css|woff2|webp|png|jpe?g|svg))(?P<v>\?v=[0-9a-f]*)?(?P<post>")'''),
    '.js':   re.compile(r'''(?P<pre>(?:\bfrom\s*|\bimport\s*\(\s*)(?P<q>['"]))(?P<path>\.{1,2}/[^'"?]+\.js)(?P<v>\?v=[0-9a-f]*)?(?P<post>(?P=q))'''),
    '.css':  re.compile(r'''(?P<pre>url\((?P<q>['"]?))(?P<path>(?:\.{1,2}/)?[\w-][\w./-]*\.(?:woff2|webp|png|jpe?g|svg|css))(?P<v>\?v=[0-9a-f]*)?(?P<post>(?P=q)\))'''),
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]

def stamp_file(f):
    """Réécrit les références de f avec l'empreinte actuelle de leur cible. Retourne le nouveau texte."""
    text = f.read_text(encoding='utf-8')
    pat = PATTERNS[f.suffix]
    def repl(m):
        target = (f.parent / m.group('path')).resolve()
        if not target.is_file():
            raise SystemExit(f'{f.relative_to(ROOT)} : fichier introuvable « {m.group("path")} »')
        return f'{m.group("pre")}{m.group("path")}?v={digest(target)}{m.group("post")}'
    return pat.sub(repl, text)

def run(check=False):
    files = sources()
    stale = set()
    for _ in range(20):                       # point fixe : les empreintes se propagent vers index.html
        changed = False
        for f in files:
            new = stamp_file(f)
            if new != f.read_text(encoding='utf-8'):
                stale.add(f.relative_to(ROOT).as_posix())
                if check:
                    continue
                f.write_text(new, encoding='utf-8')
                changed = True
        if check or not changed:
            break
    if check:
        if stale:
            print('Empreintes périmées dans :', ', '.join(sorted(stale)))
            print('→ lancer : python3 tools/stamp.py')
            sys.exit(1)
        print('Empreintes à jour.')
    else:
        print(f'Empreintes mises à jour : {", ".join(sorted(stale)) or "aucun changement"}')

if __name__ == '__main__':
    run(check='--check' in sys.argv)

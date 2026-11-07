# Mood — un mur qui s'efface

Un mur collectif où chacun peut laisser une image, des mots, ou les deux. Rien n'est publié sans validation.
Ensuite, le temps use le mur : les images se désagrègent, puis tout dépôt passe dans la liste. Voir `docs/note-de-realisation.md`.

Adresse : **https://moodwall.pages.dev** (Cloudflare Pages, branche `main`, sans étape de build, dossier racine ; en-têtes HTTP dans `_headers`).

**État : en ligne, branché sur Supabase.** Dépôts réels, modération sur `/admin/`, captcha Turnstile, alerte e-mail (Resend, facultative).

- Installation (une fois) : `docs/INSTALLATION.md`
- Modération au quotidien : `docs/MODERATION.md`
- Maquette sans serveur : ajouter `?mock` à l'adresse.

## Voir le site en local

```bash
python3 -m http.server 8000      # puis http://localhost:8000
```

Les modules JavaScript ne fonctionnent pas en `file://` : il faut un petit serveur local.

## Où modifier quoi

| Je veux… | Fichier |
|---|---|
| changer un texte de l'interface (FR / JA / EN) | `js/strings.js` |
| changer une limite (poids, taille, nombre de caractères, densité du mur) | `js/config.js` |
| changer les couleurs ou la typographie | `css/site.css` (variables en haut du fichier) |
| comprendre le placement du mur | `js/wall.js` |
| régénérer les polices après avoir changé un texte du site | `python3 tools/fonts/subset.py` |
| **avant chaque mise en ligne** : forcer les visiteurs à recharger les fichiers modifiés | `python3 tools/stamp.py` |

## Tests

```bash
node tests/wall.test.mjs          # règles de lisibilité du mur
node tests/server.test.mjs        # contrôles serveur (formats, métadonnées, budget)
node tests/moderate.test.mjs      # modération : reprise après panne (base et stockage factices)
node tests/e2e.mjs                # contre le vrai Supabase (lancé par GitHub Actions)
python3 tools/stamp.py --check    # empreintes de cache à jour
```

## Archive

L'ancien site (espace 3D three.js) est conservé sur la branche `archive/expo-3d`.

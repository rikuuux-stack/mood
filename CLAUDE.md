# CLAUDE.md — repères pour les sessions suivantes

## Le projet
**Nom du site : Mood.** Site de RIKU (Félix Cardonnel, artiste visuel franco-japonais, futur directeur artistique). Moodboard en ligne participatif : les visiteurs déposent une image ou un texte ; rien n'est visible avant validation de RIKU. Hébergé sur GitHub Pages (dépôt public `rikuuux-stack/riku-portfolio`). Félix n'est pas développeur : expliquer en français, simplement, pas à pas.

## Décisions validées (ne pas remettre en cause sans lui demander)
- **Direction brutaliste, fond noir** (`--bg` #0b0b0b) **avec un grain marqué** (`--noise`, aussi sur le bandeau), texte blanc cassé, fenêtres gris très sombre.
- **Titre « Mood » en haut à gauche, à l'envers** (retourné de 180°, `.id-name`), en Thin ; il ouvre le panneau RIKU. Onglet du navigateur : « Mood — RIKU ».
- **Couleurs : uniquement des gris neutres, du noir au blanc** (demande de Félix). Aucune teinte nulle part (plus de vermillon).
- **Toutes les photos déposées s'affichent en noir et blanc avec du grain et les hautes lumières assombries** (classe `.photo` : filtre SVG `#tone` dans `index.html` = N&B + courbe 0→0, 25→24, 50→47, 75→64, 100→76 % ; grain en `overlay`), partout : mur, liste, agrandissement, aperçu du formulaire. Appliqué à l'affichage, les fichiers restent intacts.
- **Pas d'effet « post-it »** : textes posés à nu sur le fond (pas de cadre, pas de fond), rien n'est incliné, pas d'ombres.
- **Petites lettres, petites images** : 13 px de base ; textes du mur 12 à 16 px (13 à 15 px sur mobile) ; commentaires 12 px ; images du mur ≈ 1/6 de la largeur sur ordinateur, 44–58 % sur mobile. Les champs de formulaire restent à 16 px (sinon l'iPhone zoome).
- **Typographie : traits très fins partout** (demande de Félix). IBM Plex Sans JP ExtraLight (200) pour tous les textes, Thin (100) pour « RIKU », IBM Plex Mono ExtraLight pour les légendes ; bordures et filets à 1 px. Aucun gras. Polices auto-hébergées, découpées par `tools/fonts/subset.py` (qui réécrit `css/fonts.css`) : un fichier « core » + des tranches de kanji chargées à la demande.
- **Pas de « RIKU » géant en fond.**
- **L'essentiel seulement à l'écran** : le mur + un bandeau réduit à « Mood » (à l'envers) et « Déposer ». Tout le reste (rôle, présentation, e-mail, langues, bouton Mur/Liste, légende du tampon, mentions) est dans le panneau qui s'ouvre en touchant « Mood ». Pas de pied de page, pas de texte d'intro, pas de pseudo sur le mur (seulement à l'agrandissement). Langue détectée d'après le navigateur. Ne rien rajouter à l'écran sans demander à Félix.
- **Bouton Déposer** : contour fin clair sur fond noir.
- **Marque de RIKU** : petit carré clair façon tampon, sans texte, sur ses propres dépôts.
- **Un dépôt = une image, des mots, ou les deux** (un seul formulaire, sans onglets). **Pixels contre mots** (`js/budget.js`, règle à reprendre telle quelle côté serveur) : caractères autorisés = 500 × (1 − pixels / 4 000 000), arrondi, minimum 40 ; sans image 500. Pixels = taille publiée (après réduction à 2000 px). Le commentaire s'affiche sous la photo.
- **Mur** : chevauchement des images max 30 % (15 % sur mobile) ; un texte ne chevauche RIEN et garde un espace libre autour de lui (24 px, 28 px sur mobile) ; le commentaire sous une photo n'est jamais recouvert ; toucher = premier plan, 2e toucher = agrandissement ; densité réduite sur mobile. Bouton Mur / Liste (choix mémorisé). Règles testées par `node tests/wall.test.mjs`.
- Pseudo facultatif (≤ 40 car., sans lien) ; masquage auto après 3 signalements ; limites 3 dépôts/heure et 10/jour par visiteur ; 150 derniers affichés puis « voir plus anciens » ; placement automatique stable.
- **Alerte e-mail à chaque dépôt** via Resend → rikuuux@gmail.com.
- **Stack** : site statique sans build + Supabase (offre gratuite) + Cloudflare Turnstile + Resend. Déploiement des migrations/fonctions par GitHub Action (secrets GitHub).

## Contraintes non négociables
1. Modération : rien de visible avant validation ; fichiers en attente dans un bucket **privé** (aucune URL publique).
2. Anti-abus : captcha vérifié côté serveur, limite de fréquence, images ≤ 5 Mo JPEG/PNG/WebP, texte ≤ budget pixels/mots (≤ 500), vérifiés aussi côté serveur.
3. Vie privée : redimensionnement ≤ 2000 px et suppression EXIF/GPS dans le navigateur (`js/image.js`), revérifié côté serveur.
4. Sécurité : dépôt public → **aucune clé secrète dans le code**. Seules l'URL Supabase, la clé `anon` et la site key Turnstile peuvent apparaître (`js/config.js`). RLS strictes.
5. Gratuit uniquement. Trilingue FR/JA/EN (`js/strings.js`). Mobile (iPhone) prioritaire.
6. Textes des visiteurs insérés uniquement via `textContent`, jamais en HTML.

## Organisation
- `index.html`, `css/`, `js/` (pas d'étape de build, modules ES).
- `js/config.js` : `mode: 'live'` (Supabase, projet `ovvdtthnykqvgarrjina`, Mumbai). `?mock` dans l'URL force la maquette (mur vide, aucun envoi) — utile pour tester sans serveur.
- **Le mur démarre vide** (demande de Félix) : plus aucun faux contenu sur le site. Les exemples servant aux tests sont dans `tests/fixtures.mjs` et ne sont jamais affichés.
- `js/data.js` : seul point d'accès aux données. `js/captcha.js` : Turnstile (chargé à l'ouverture d'une fenêtre).

## Serveur (Supabase)
- `supabase/migrations/` : tables `posts`, `reports`, `admins` en RLS **sans aucune politique** + droits retirés à anon/authenticated ; la seule lecture publique est la vue `wall` (dépôts `approved`, sans IP/statut/signalements). Buckets : `pending` privé, `published` public en lecture. 3 signalements → `hidden` (déclencheur). Le compte rikuuux@gmail.com devient admin automatiquement (déclencheur sur auth.users).
- `supabase/functions/` (Deno, `.js`) : `submit` (contrôles gratuits → captcha → limite 3/h 10/j par IP hachée → fichiers dans `pending` → ligne `pending` → e-mail Resend), `report`, `moderate` (admin : liste, approve = déplacement pending→published, reject, remove, restore). RIKU connecté peut déposer via `submit` : publié directement, `is_riku`.
- `supabase/functions/_shared/budget.js` est une COPIE de `js/budget.js` (`tests/server.test.mjs` vérifie l'égalité).
- Déploiement : `.github/workflows/supabase.yml` (push sur main touchant `supabase/`, ou « Run workflow ») puis `tests/e2e.mjs` contre le vrai projet ; chaque lundi, e2e seul (garde le projet actif). Secrets GitHub : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. Secrets Supabase (Edge Functions ▸ Secrets) : `TURNSTILE_SECRET`, `RESEND_API_KEY` (facultatif).
- Les sessions Claude cloud n'atteignent PAS supabase.co ni challenges.cloudflare.com (réseau bloqué) : tester via GitHub Actions et lire les journaux.
- Page de modération : `admin/` (connexion e-mail + mot de passe, FR uniquement, photos en couleur). Guides : `docs/INSTALLATION.md`, `docs/MODERATION.md`.
- Branche de travail : `claude/moodboard`. Archive de l'ancien site : branche `archive/expo-3d` (ne jamais supprimer). Le tag `v1-expo-3d` doit être créé par Félix depuis GitHub (push de tags bloqué dans les sessions cloud).

## Cache-busting (obligatoire avant chaque mise en ligne)
- Toutes les adresses internes portent une empreinte du contenu : `js/main.js?v=…`, imports `./x.js?v=…` (statiques et `import()`), CSS, polices. Un fichier modifié change d'adresse, donc aucun visiteur ne garde une ancienne version en cache (incident réel : l'ancien `js/main.js` de l'expo 3D restait en cache et bloquait Mood).
- **Après toute modification de `index.html`, `css/` ou `js/` : `python3 tools/stamp.py`** (`tools/fonts/subset.py` le lance aussi). Un nouvel import doit être écrit avec un chemin relatif `./…` ; le script ajoute l'empreinte.
- Vérification : `python3 tools/stamp.py --check` (aussi lancée par GitHub Actions, `.github/workflows/checks.yml`).
- Limite : `index.html` lui-même ne peut pas porter d'empreinte ; GitHub Pages le garde jusqu'à 10 min en cache.

## Tester
- `python3 -m http.server 8000` puis Playwright/Chromium (iPhone 12 et SE émulés).
- `node tests/wall.test.mjs`, `node tests/server.test.mjs` et `python3 tools/stamp.py --check`.
- Le Chromium de test ne remplace pas un vrai iPhone : le dire honnêtement.

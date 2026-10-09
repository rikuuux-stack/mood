# CLAUDE.md — repères pour les sessions suivantes

## Le projet
Site de RIKU (Félix Cardonnel, artiste visuel franco-japonais, futur directeur artistique). Moodboard en ligne participatif : les visiteurs déposent une image ou un texte ; rien n'est visible avant validation de RIKU. Hébergé sur GitHub Pages (dépôt public `rikuuux-stack/riku-portfolio`). Félix n'est pas développeur : expliquer en français, simplement, pas à pas.

## Décisions validées (ne pas remettre en cause sans lui demander)
- **Direction brutaliste, fond noir** (`--bg` #0b0b0b), texte blanc cassé, fenêtres gris très sombre.
- **Couleurs : uniquement des gris neutres, du noir au blanc** (demande de Félix). Aucune teinte nulle part (plus de vermillon).
- **Toutes les photos déposées s'affichent en noir et blanc avec du grain** (classe `.photo` : `grayscale` + bruit en `overlay`), partout : mur, liste, agrandissement, aperçu du formulaire. Appliqué à l'affichage, les fichiers restent intacts.
- **Pas d'effet « post-it »** : textes posés à nu sur le fond (pas de cadre, pas de fond), rien n'est incliné, pas d'ombres.
- **Petites lettres** : 14 px de base ; textes du mur 14 à 19 px selon la longueur ; commentaires 13 px. Les champs de formulaire restent à 16 px (sinon l'iPhone zoome).
- **Typographie : traits très fins partout** (demande de Félix). IBM Plex Sans JP ExtraLight (200) pour tous les textes, Thin (100) pour « RIKU », IBM Plex Mono ExtraLight pour les légendes ; bordures et filets à 1 px. Aucun gras. Polices auto-hébergées, découpées par `tools/fonts/subset.py` (qui réécrit `css/fonts.css`) : un fichier « core » + des tranches de kanji chargées à la demande.
- **Pas de « RIKU » géant en fond.**
- **L'essentiel seulement à l'écran** : le mur + un bandeau réduit à « RIKU » et « Déposer ». Tout le reste (rôle, présentation, e-mail, langues, bouton Mur/Liste, légende du tampon, mentions) est dans le panneau qui s'ouvre en touchant « RIKU ». Pas de pied de page, pas de texte d'intro, pas de pseudo sur le mur (seulement à l'agrandissement). Langue détectée d'après le navigateur. Ne rien rajouter à l'écran sans demander à Félix.
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
- `js/config.js` : `mode: 'mock'` (maquette) ou `'live'` (Supabase).
- `js/data.js` : seul point d'accès aux données.
- Branche de travail : `claude/moodboard`. Archive de l'ancien site : branche `archive/expo-3d` (ne jamais supprimer). Le tag `v1-expo-3d` doit être créé par Félix depuis GitHub (push de tags bloqué dans les sessions cloud).

## Tester
- `python3 -m http.server 8000` puis Playwright/Chromium (iPhone 12 et SE émulés).
- Le Chromium de test ne remplace pas un vrai iPhone : le dire honnêtement.

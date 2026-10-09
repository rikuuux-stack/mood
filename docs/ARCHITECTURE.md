# RIKU — architecture et plan

Site statique, HTML/CSS/JS natifs, Three.js r186 chargé par import map, **aucune étape de build**.
Hébergeable tel quel sur Cloudflare Pages, Netlify ou GitHub Pages.

---

## 1. Arborescence

La racine du dépôt (`riku-portfolio/`) est le site : il n'y a pas de sous-dossier `site/`.

```
riku-portfolio/                un seul dossier, déplaçable tel quel
├── README.md                  tableau « je veux… → fichier » et raccourcis clavier
├── .gitignore                 exclut les masters (lightmaps/src, *.src.glb) et _a-mettre-en-ligne/
├── index.html                 structure, import map, HUD, index, fiche, mire de chargement
├── _headers                   cache et types MIME (Cloudflare Pages / Netlify)
├── css/
│   ├── fonts.css              @font-face des polices auto-hébergées
│   ├── tokens.css             palette broadcast (niveaux légaux Rec.709, barres 75 %), typo, grille
│   └── ui.css                 composants : HUD, bandeau, piste V1, index, fiche, mire
├── js/
│   ├── main.js                démarrage : index d'abord, 3D ensuite (import dynamique)
│   ├── config.js              TOUS les réglages (exposition, rythme du parcours, vidéo…)
│   ├── content/
│   │   ├── works.js           ← tes œuvres (trilingue), À propos, contact
│   │   └── strings.js         textes d'interface FR / JA / EN
│   ├── core/
│   │   ├── capabilities.js    niveau de machine (tier 0/1/2), mouvement réduit, économie de données
│   │   ├── i18n.js            langue, traduction [data-i18n]
│   │   ├── renderer.js        WebGLRenderer, AgX, résolution adaptative
│   │   └── util.js            timecode, amortissement, formats
│   ├── scene/
│   │   ├── space.js           charge expo.glb (ou la géométrie provisoire), trouve CAM_* et SCREEN_*
│   │   ├── baked.js           matières → MeshBasicMaterial + lightMap (UV1), manifest des lightmaps
│   │   ├── fallback.js        géométrie provisoire depuis assets/layout.json
│   │   ├── screens.js         écrans vidéo : contain, lecture paresseuse, N décodeurs max
│   │   ├── spill.js           halo de lumière des écrans sur le béton
│   │   └── sign.js            pancarte de contact (plaque au mur, ouvre « À propos »)
│   ├── camera/
│   │   ├── rail.js            caméras Blender → courbe + timeline en secondes
│   │   ├── walker.js          marche libre (souris capturée, collisions, saut)
│   │   └── director.js        défilement = tête de lecture ; sauts, travellings, coupes
│   └── ui/
│       ├── hud.js             timecode, bandeau, piste V1
│       ├── scopes.js          forme d'onde Y′ et vectorscope Rec.709
│       ├── index-panel.js     index plat, traits ∝ durée, défilement image par image
│       ├── sheet.js           fiche œuvre / À propos
│       └── panels.js          modales : focus, Échap, verrou de défilement, panneaux épinglés
├── assets/
│   ├── layout.json            enfilade provisoire (généré)
│   ├── models/expo.glb        ← ton export Blender (compressé)
│   ├── lightmaps/             manifest.json + lightmap.webp (2K, servie) + lightmap.png (master, exclue par publish.sh) ;
│   │                          pas encore de KTX2 ; src/ = masters EXR (ignorés par git)
│   ├── video/<id>.mp4         boucles d'aperçu ≤ 2 Mo
│   ├── posters/<id>.webp      affiches
│   ├── sprites/<id>.webp      planches d'images (index)
│   ├── gallery/<id>-<n>.jpg   images de la fiche œuvre
│   └── fonts/                 woff2 en sous-ensemble + licences OFL
├── vendor/three/              three.js 0.186.1 (copie locale, plus de CDN)
├── _a-mettre-en-ligne/        généré par tools/publish.sh, ignoré par git (ne pas éditer)
├── tools/
│   ├── blender/riku_bake.py   UV de bake → bake Cycles → OIDN → PNG avec headroom → .glb
│   ├── layout/gen_demo_layout.py
│   ├── media/encode.sh        master vidéo → aperçu, affiche, planche
│   ├── media/stills.sh        photos → diaporama en boucle, affiche, planche (œuvre sans vidéo)
│   ├── textures/              textures béton CC0 (Poly Haven) pour Blender, non publiées
│   ├── fonts/                 TTF sources + subset.py
│   ├── publish.sh             copie publique → _a-mettre-en-ligne/
│   └── compress.sh            glb meshopt + WebP/KTX2, lightmap WebP/KTX2
└── docs/
    ├── ARCHITECTURE.md        ce fichier
    └── BLENDER-BAKE.md        le guide pas à pas
```

`vendor/three/` contient `build/` et `examples/` ; l'import map de `index.html` y pointe.

### Contrat Blender ↔ site (le seul point de couplage)

| Dans Blender | Dans le site |
|---|---|
| Caméra `CAM_<nn>_<id>` | Plan tenu devant l'œuvre `<id>` (ordre = `<nn>`) |
| Caméra `CAM_<nn>_via` | Point de passage du travelling (pas d'arrêt) |
| Caméra `CAM_00_intro` | Plan d'ouverture |
| Plan `SCREEN_<id>` | Cadre maximal de l'œuvre `<id>` (l'image y est ajustée) |
| Propriété perso `lightmap` | Nom de la lightmap dans `manifest.json` (défaut : `lightmap`) |
| 2e UV map `UVBake` | Exportée en `TEXCOORD_1`, lue par `lightMap.channel = 1` |

Tu recadres dans Blender, tu réexportes : le site suit, sans toucher au code.

---

## 2. Choix techniques et critiques

Tu as demandé une lecture critique. Voici ce que j'ai gardé, modifié ou écarté, et pourquoi.

### Gardé tel quel
- **Lumière précalculée dans Cycles + `MeshBasicMaterial`.** C'est la bonne base : coût GPU quasi nul et qualité Cycles sur le diffus.
- **Caméra guidée.** Le défilement natif sert de tête de lecture. Clavier, molette, doigt et lecteurs d'écran fonctionnent donc sans code dédié. Les caméras sont de **vraies caméras Blender** : tu cadres dans Blender, avec tes focales.
- **Métaphore de montage.** Timecode, piste V1 (un clip par œuvre, un trait par travelling), ↑/↓ pour sauter d'un point de montage à l'autre, J/K/L et Espace comme dans Premiere et Resolve, `I` pour l'index.

### Modifié
1. **Bake Diffuse *sans* la couleur, pas Combined.** Un bake Combined enferme l'albédo dans la lightmap, à sa résolution (1 à 2 cm par texel) : le béton devient flou. On bake donc la lumière seule sur l'UV1. Le béton reste une texture répétée, nette, sur l'UV0. Le fichier est plus léger et les détails de coffrage restent nets.
2. **Planche d'images au lieu de `ffmpeg -g 1`.** Une vidéo tout-intra pèse 5 à 10 fois plus lourd, et le positionnement (seek) reste lent et capricieux sur iOS. Une planche de 48 images pèse environ 150 Ko et s'affiche instantanément, au doigt comme à la souris.
3. **Les vidéos échappent à AgX** (`toneMapped: false`). Sinon, AgX désature et compresse ton étalonnage. Le béton passe par AgX, l'écran non : c'est d'ailleurs ce qui le fait « émettre ».
4. **Lightmap encodée avec une marge (headroom).** Sous les ouvertures, l'éclairage dépasse 1. On divise par une puissance de 2 et on encode en sRGB (plus de précision dans les ombres), puis le site multiplie par `headroom × π`. Le π vient de la convention du shader three.js : l'oublier assombrit tout d'un facteur 3.
5. **KTX2 : UASTC pour les lightmaps, jamais ETC1S.** ETC1S produit des bandes dans les dégradés lents. ETC1S reste acceptable pour l'albédo.
6. **Traits de l'index en racine carrée.** Avec une échelle linéaire, un spot de 30 s à côté d'un film de 20 min n'occupe que 2,5 % de la largeur : il disparaît. Réglable dans `config.js` (`durationScale`).
7. **Portrait.** Une caméra cadrée en 16:9 coupe l'œuvre sur un téléphone. Le site conserve le champ *horizontal* de ta caméra, jusqu'à 100° de champ vertical.

### Ajouté
- **Spill.** Deux quads additifs par écran (sol et halo mural), teintés par la couleur moyenne de l'image. Le bake ne peut pas contenir cette lumière. C'est ce qui rend l'espace vivant, pour un coût quasi nul.
- **Pause globale** (bouton, Espace, K). Le critère WCAG 2.2.2 l'exige pour tout contenu animé de plus de 5 s. En mouvement réduit, rien ne démarre seul, et un saut devient une coupe au lieu d'un travelling.
- **Coupe au noir** pour les sauts de plus de 2 œuvres. Un travelling de 60 m fait perdre du temps au visiteur, une coupe franche non.
- **Index d'abord.** L'index est en HTML pur et s'affiche avant que Three.js ne soit téléchargé. En économie de données ou sans WebGL2, c'est lui qui s'ouvre : le site reste entièrement utilisable. Deux cas :
  - **Sans 3D (tier 0)** : l'index est la seule vue, donc il est *épinglé* (`pinPanel` dans `js/ui/panels.js`) : Échap l'ignore et le bouton « Entrer dans l'espace » est masqué. Les fiches et « À propos » s'ouvrent par-dessus et se referment normalement.
  - **Économie de données (tier ≥ 1)** : l'index peut être fermé. Tant que la 3D n'est pas lancée, le fermer (Échap) ramène la mire avec les boutons « Entrer dans l'espace » (`#enterBtn`) et « Index » ; le bouton « Entrer dans l'espace » de l'index lance directement la 3D.
- **Liens directs et fiche à l'arrivée.** En 3D, `#work=<id>` fait voyager la caméra (coupe au noir si l'œuvre est loin, saut direct en mouvement réduit) jusqu'à l'œuvre, puis ouvre sa fiche à l'arrivée (`jumpTo(id, onArrive)` dans `director.js` et `walker.js`). Si le visiteur reprend la main pendant le travelling, la fiche ne s'ouvre pas. Sans 3D, le lien ouvre directement la fiche.

### Écarté (pour l'instant)
- **Path tracing automatique à l'arrêt.** L'accumulation repart de zéro à chaque changement de la scène. Or une `VideoTexture` change 25 fois par seconde, donc l'image ne converge jamais devant une vidéo. Le gain serait faible, puisque le diffus est déjà « qualité Cycles », et il faut ajouter la construction de la BVH et la compilation des shaders (plusieurs secondes, plus 200 Ko et plus de JS). → **Phase 5, sous forme de « mode photo »** : un bouton, sur ordinateur seulement, qui fige la vidéo sur une image et affiche la convergence comme une barre de rendu.
- **Normal map et roughness sur `MeshBasicMaterial`** : impossible, ce matériau ignore les normales. → **Fait (« béton vivant », ordinateurs seulement)** : `MeshStandardMaterial` + lightmap, sans aucune lumière temps réel. Trois injections GLSL (`js/scene/baked.js`) : la réflexion capturée de la salle ne sert qu'aux reflets (pas de double éclairage) ; la normal map module la lumière bakée comme sous un éclairage zénithal (relief des banches, pores) ; les reflets s'éteignent là où la lightmap est sombre. Les réflexions sont des captures cube prises à chaque plan au chargement, filtrées par rugosité (PMREM). Sur mobile, on reste en `MeshBasicMaterial`.

---

## 3. Phases

| Phase | Contenu | Critère de fin |
|---|---|---|
| **1. Prototype** *(livré)* | Enfilade démo bakée dans Cycles, caméra guidée, écrans, spill, index, fiche, HUD, scopes, scripts bake/média/compression | Ton `.glb` remplace la démo sans toucher au code |
| **2. Ton espace** | Modélisation de ton propre plan, UV de bake, bake 4K (ordinateur) + 2K (mobile), KTX2, matière `BakedSpec` en test A/B | 60 i/s sur un Mac M1, plus de 30 i/s sur un iPhone 12 ; poids 3D ≤ 3 Mo sur mobile |
| **3. Contenus** | Vrais masters encodés, durées renseignées, lecteur plein écran à la demande (Vimeo ou Mux, chargé au clic), sous-titres | Toutes les œuvres jouables, aucun lecteur tiers chargé au démarrage |
| **4. Finitions** | Polices auto-hébergées en sous-ensemble, balises Open Graph par œuvre, analytics léger (Cloudflare Web Analytics), tests sur appareils réels (iPhone en mode économie d'énergie), budget Lighthouse | Index interactif en moins de 1,5 s en 4G |
| **5. Mode photo** *(optionnel)* | `three-gpu-pathtracer` à la demande, ordinateur seulement, vidéo figée | Convergence visible, retour instantané au baké |

### Et Astro ?
Pas tant que tu n'as pas besoin d'**une page par œuvre** (`/works/entre/`) pour le référencement et le partage (aperçus Open Graph). Ce jour-là, Astro s'impose : le contenu passe dans des fichiers Markdown, la 3D devient un îlot `client:only`, et le reste de ce code se réutilise tel quel. Next.js serait disproportionné pour un site sans serveur.

---

## 4. Budgets de performance

| Élément | Mobile (tier 1) | Ordinateur (tier 2) |
|---|---|---|
| Premier affichage de l'index | < 1 s (≈ 30 Ko de JS) | < 1 s |
| Three.js + chargeurs (compressé, `vendor/three/`) | ≈ 350–440 Ko | ≈ 350–440 Ko |
| `expo.glb` (meshopt) | < 300 Ko | < 300 Ko |
| Lightmap | 2K WebP ≈ 0,5 Mo / KTX2 ≈ 2 Mo | 4K KTX2 UASTC ≈ 6–8 Mo |
| Vidéos | 1 à la fois, ≤ 2 Mo chacune, chargées à ±1 œuvre | 3 à la fois |
| Densité de pixels | ≤ 1,25 | ≤ 2, adaptative |

La mémoire GPU compte plus que le poids du fichier : une lightmap 4K en PNG ou WebP occupe **64 Mo décompressée** en mémoire vidéo. En KTX2, elle en occupe 16. Sur mobile, c'est 2K ou KTX2, sans exception.

---

## 5. Polices

Auto-hébergées dans `assets/fonts/` (woff2, licence SIL OFL, fichiers `OFL-*.txt` à côté). `tools/fonts/subset.py` découpe les TTF complets de `tools/fonts/src/` : il garde tous les caractères présents dans `index.html` et `js/`, plus le latin, les kana et la ponctuation japonaise (≈ 80 Ko par graisse japonaise au lieu de 2,3 Mo). Après avoir ajouté un texte japonais avec de nouveaux kanji :

```bash
pip install fonttools brotli
python3 tools/fonts/subset.py
```

Un kanji oublié s'affiche quand même, dans la police japonaise du système.

---

## 6. Hébergement

- **Cloudflare Pages** (recommandé) : Brotli, HTTP/3 et fichier `_headers`, avec une limite de 25 Mo par fichier. Les requêtes Range sur les MP4 sont gérées.
- **Netlify** : même principe, `_headers` compris.
- **GitHub Pages** : fonctionne, mais sans en-têtes de cache personnalisés (`_headers` est ignoré) et en publiant le dépôt tel quel (voir ci-dessous).
- **À ne pas publier :** `assets/lightmaps/src/`, `assets/models/*.src.glb`, `tools/`, `docs/`. `.gitignore` exclut les masters ; `bash tools/publish.sh` produit `_a-mettre-en-ligne/` sans `tools/`, `docs/`, `README.md`, `lightmaps/src/`, `lightmaps/*.png` ni `*.src.glb`. Publier la racine du dépôt (cas de GitHub Pages) expose donc `tools/` et `docs/`.
- Les **films complets** restent sur Vimeo, Mux ou Cloudflare Stream. Le site ne contient que des aperçus.

## 7. Tester en local

```bash
cd riku-portfolio                  # racine du dépôt
python3 -m http.server 8000        # puis http://localhost:8000 (sans requêtes Range : positionnement vidéo limité)
# forcer un niveau :  ?q=0 (index seul)  ?q=1 (mobile)  ?q=2 (ordinateur)
# lien direct :       #index  #about  #work=entre
# sans WebGL :        ?q=0, ou un navigateur sans WebGL2 (l'index est alors la seule vue)
# économie de données : ?q=1 avec navigator.connection.saveData = true
```

# Mood — direction artistique

Ce document part de la note de réalisation (`docs/note-de-realisation.md`). Il va avec `docs/tokens.css`, chargé avant `css/site.css` par `index.html` et `admin/index.html`. Il décrit le code de la branche `da-v1` tel qu'il est.
Le site est traité comme une œuvre, pas comme une vitrine : c'est la ligne que suit la note.

---

## Tensions avec le cadre imposé (à lire d'abord)

| # | Cadre demandé | Ce que dit la note ou le code | Décision |
|---|---|---|---|
| T1 | Un verre qui déforme le contenu | Cela demande un filtre SVG dans `backdrop-filter` (`url(#…)`). Seul Chromium le gère. **Safari iOS, la plateforme prioritaire, ne le gère pas.** | Aucun filtre SVG dans `backdrop-filter` : c'est un **verre dépoli**. Il floute, éclaircit et porte un reflet de bord. Un effet qui ne marcherait que dans Chrome casserait le principe du « même mur pour tous ». |
| T2 | Liquid Glass = capsules arrondies | Le site actuel est droit et carré, avec des filets de 1 px, « rien d'incliné ». | **Le rond est réservé au verre.** Tout ce qui appartient au mur reste rectangulaire. La forme dit d'un coup d'œil ce qui est l'interface et ce qui est l'œuvre. |
| T3 | Surfaces translucides | `.bar` utilise `mix-blend-mode: difference`, techniquement incompatible avec `backdrop-filter`, car l'élément fusionné devient la racine du fond. | Le verre **remplace** le mode `difference`. Cela répond à la question 4 de la note : « Mood » et « Drop » deviennent noirs sur verre clair et restent lisibles partout. |
| T4 | Transparence omniprésente dans iOS 26 | La note : « le minimum à l'écran », pas de bandeau. | Pas de barre en verre, seulement deux capsules. Sur le blanc, elles disparaissent presque ; elles n'apparaissent qu'au-dessus d'une image, c'est-à-dire seulement quand il faut les lire. |
| T5 | Interface rapide | Le flou coûte cher sur iPhone pendant le défilement. | Deux couches de flou au plus en même temps, jamais à l'intérieur de ce qui défile (voir section 7). |
| T6 | — | ExtraLight 200 est trop fin sur un fond flou et changeant, et Plex Mono 200 trop fine à 10–11 px. | Light 300 en sous-ensemble latin, **seulement pour les mots posés sur le verre** (3,7 Ko), et Plex Mono 300 pour tout le registre (10,1 Ko, remplace la Mono 200). Toujours aucun gras. |

---

## 1. Concept

**Une vitre devant un mur qui s'use : l'interface ne vieillit pas, le mur, lui, continue de s'effacer derrière.**

La note fait du temps le sujet. Les images arrivent en négatif, leurs noirs deviennent transparents, puis elles se désagrègent. La transparence existe donc déjà dans l'œuvre, mais c'est celle du temps : on voit à travers une image parce qu'elle s'use. Le verre apporte une seconde transparence, celle du visiteur, qui regarde le mur sans y toucher, comme à travers une vitrine d'archive. Les deux ne doivent jamais se confondre. Le mur est rectangulaire, gris et sans reflet ; le verre est arrondi, net au bord et ne s'use pas. Cette séparation justifie le verre : il marque l'endroit où le visiteur se tient, c'est-à-dire le présent, devant ce qui passe.

## 2. Couleurs

Uniquement des gris (chroma 0). La note l'impose, et une teinte ferait d'un dépôt un élément distinct des autres.

| Token | Hex | OKLCH | Rôle | Lien avec la note |
|---|---|---|---|---|
| `--bg` | `#ffffff` | `oklch(1 0 0)` | fond | Le blanc vers lequel l'usure ramène tout. |
| `--fg` | `#111111` | `oklch(0.178 0 0)` | texte, capsules | Noir doux : la seule chose qui ne pâlit pas, l'interface. |
| `--muted` | `#555555` | `oklch(0.450 0 0)` | date, mentions ; nom dans la liste | Ce qui identifie quelqu'un reste en retrait (égalité). 7,5:1 sur blanc. |
| `--muted-sheet` | `#505050` | `oklch(0.428 0 0)` | gris secondaire dans les feuilles | Sur une feuille au pire, mesuré : 5,7:1 (`#555` : 5,2:1). |
| `--rule` | `#d9d9d9` | `oklch(0.885 0 0)` | filets de la liste, champs | Une séparation qui se voit à peine. |
| `--panel` | `#fafafa` | `oklch(0.985 0 0)` | verre opaque (repli) | Même rôle que le verre, sans transparence. |
| `--photo-bg` | `#f0f0f0` | `oklch(0.955 0 0)` | image en chargement | Une place grise avant la trace. |
| `--glass-fill` | blanc à 27 % | `oklch(1 0 0 / .27)` | capsule | **4,59:1 mesuré** pour `--fg` au-dessus du gris visible le plus sombre : la limite basse pour garder 4,5:1 (mesures ci-dessous). 48 % puis 30 % étaient trop opaques sur iPhone. |
| `--glass-fill-sheet` | blanc à 45 % | `oklch(1 0 0 / .45)` | feuille | Le mur se voit derrière une fenêtre ouverte (78 % puis 60 % étaient trop opaques sur iPhone). |
| `--glass-rim-light` | blanc à 85 % | `oklch(1 0 0 / .85)` | reflet de bord haut | Le seul « éclat » du site, et il est hors du mur. |
| `--glass-rim-dark` | `#111` à 7 % | `oklch(0.178 0 0 / .07)` | contour sur blanc | La capsule existe encore sur le fond nu. |
| `--veil` | blanc à 60 % | `oklch(1 0 0 / .60)` | `::backdrop` | Le mur recule sans disparaître : il se voit encore derrière une feuille (à 86 %, il devenait invisible). |

Le verre ne contient **pas** de `saturate()` : sur un mur entièrement gris, il ne ferait rien, et un verre teinté à la manière d'iOS trahirait la règle des gris.

**Calcul du contraste sur une capsule** (aussi dans `tokens.css`). Le gris le plus sombre que produit le traitement des images, images empilées, est x = 0,303 (point fixe de x = a·g + (1 − a)·x, avec a = 1 − 6,67 × (0,45 − g) et g le gris du négatif, entre 0 et 0,76). Le flou ne change pas un aplat. Ensuite `brightness(1.1)` puis `contrast(.9)` donnent c = (min(1 ; 1,1 x) − 0,5) × 0,9 + 0,5 = 0,450. Avec un remplissage f, le fond vaut f + (1 − f) × c : à 21 %, ce calcul promettait 4,53:1, mais il est **optimiste** : le navigateur assombrit davantage. Les valeurs retenues sont donc **mesurées** dans Chromium (capsule au-dessus d'un aplat `#4d4d4d`, pixel le plus sombre sous le texte) :

| Remplissage | 20 % | 21 % | 24 % | 26 % | **27 %** | 30 % |
|---|---|---|---|---|---|---|
| `--fg` sur la capsule | 3,81 | 3,93 | 4,22 | 4,46 | **4,59** | 4,91 |

**27 %** est le remplissage le plus bas qui garde le minimum demandé par l'auteur (4,5:1). Sur une feuille (voile 60 % puis feuille **45 %**), mesuré au pire : 13,3:1 pour `--fg`, 5,7:1 pour `--muted-sheet`. Ni le flou, ni `brightness`, ni ombre, ni halo : la lisibilité ne tient qu'au remplissage. À revérifier sur iPhone (Safari) : le rendu peut différer un peu de Chromium.

## 3. Typographie

**IBM Plex Sans JP** et **IBM Plex Mono**, sous licence OFL, déjà auto-hébergées et découpées en sous-ensembles dans `assets/fonts/`.

- **Plex Sans JP.** Le site existe en trois langues et le mur est calé sur Tokyo : il faut une fonte qui dessine le kana et le latin avec la même rigueur. Son côté grotesque un peu mécanique va avec l'idée d'une archive. → *Lien avec la note : le même mur pour tous, quelle que soit la langue.*
- **Plex Mono.** Elle sert à tout ce qui relève du registre : consigne, nom · date, lignes Kawara, ligne Keep. → *Lien : l'archive parle comme un registre, pas comme un titre.*

| Rôle | Fonte | Graisse | Taille | Interlettrage |
|---|---|---|---|---|
| « Mood » | Sans | 100 | 22 px | .3em |
| Textes du mur | Sans | 200 | 12 à 16 px (`sizeFor`, inchangé) | 0 |
| Interface sur blanc, mentions, Keep | Sans | 200 | 13 px | 0 |
| **Texte sur verre** (Drop, ×, Send, S/M/L) | Sans | **300** | 13 px | .1em pour Drop |
| Champs de saisie | Sans | 200 | **16 px** | 0 |
| Date, consigne, Kawara, ligne Keep, compteur | Mono | **300** | 11 px | 0 |
| Repère vidéo | Mono | 300 | 10 px | 0 |

La graisse 300 se limite à un sous-ensemble latin des mots d'interface, qui restent en anglais dans les trois langues (`strings.js`) : lettres, chiffres, ponctuation et ‹ › × ▶, **3,7 Ko** (sans tables de mise en forme). Plex Mono 300 couvre le latin étendu (noms, consignes) : **10,1 Ko**, à la place de la Mono 200 (11,8 Ko), qui n'est plus demandée. Sources : paquets npm officiels d'IBM, licence OFL, découpés par `tools/fonts/subset.py`. Le champ à 16 px est une contrainte d'iPhone : en dessous, Safari zoome la page dès qu'on touche le champ.

## 4. Système Liquid Glass

### Où il s'applique, et seulement là

1. **Capsules « Mood » et « Drop »**, fixées en haut. Elles flottent au-dessus du mur, qui tient dans un seul écran, et au-dessus de la liste qui défile. → *Lien : le visiteur regarde, le mur reste derrière.*
2. **Feuilles** Drop, Mood et Keep. → *Lien : on écrit, on lit les règles ou on garde un dépôt devant le mur, sans le quitter.*

Il n'y a plus d'agrandissement : on ne regarde pas un dépôt en grand. Sur le mur, toucher une photo ou un texte ne fait rien ; toucher une vidéo la lit sur place, sans son, une seule fois, puis elle redevient son image fixe (jamais de lecture automatique). Dans la liste, toucher un dépôt ouvre la feuille Keep, avec le signalement.

### Où il ne s'applique jamais

Sur un dépôt (image, texte, vidéo, y compris une vidéo en cours de lecture), sur le repère ▶ d'une vidéo du mur (rectangulaire, en `mix-blend-mode: difference`), sur la liste ou les lignes Kawara, sur la consigne du mois, sur les boutons à l'intérieur d'une feuille (pas de verre sur du verre), sur l'aperçu Keep.

### CSS

```css
/* capsule : Mood, Drop */
.glass {
  background: var(--glass-fill);
  -webkit-backdrop-filter: blur(var(--glass-blur)) brightness(var(--glass-lift)) contrast(var(--glass-flatten));
          backdrop-filter: blur(var(--glass-blur)) brightness(var(--glass-lift)) contrast(var(--glass-flatten));
  box-shadow: var(--glass-rim);          /* reflet intérieur, aucune ombre portée */
  border-radius: var(--radius-glass);
  color: var(--fg);
  font-weight: var(--w-glass);
  min-height: var(--hit);
  padding: 0 var(--s-4);
  display: inline-flex; align-items: center;
}

/* feuille : Drop, Mood (classe .sheet sur le <dialog>) */
.sheet {
  --muted: var(--muted-sheet);
  background: var(--glass-fill-sheet);
  -webkit-backdrop-filter: blur(var(--glass-blur-sheet)) brightness(var(--glass-lift));
          backdrop-filter: blur(var(--glass-blur-sheet)) brightness(var(--glass-lift));
  box-shadow: var(--glass-rim);
  border: 0; border-radius: var(--radius-sheet);
}
.dlg::backdrop { background: var(--veil); }   /* voile sans flou : une seule couche floue à la fois */

/* fenêtre ouverte : les capsules ne floutent plus ; elles gardent leur remplissage, sans reflet,
   pour que « Mood » ne se mêle pas au texte du mur sous le voile. Vidéo en conversion : aucun flou. */
html.modal .bar .glass, html:has(#convert:not([hidden])) .glass {
  -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: none;
}
html:has(#convert:not([hidden])) .sheet { -webkit-backdrop-filter: none; backdrop-filter: none; background: var(--panel); }
```

### Paramètres

| Paramètre | Capsule | Feuille | Pourquoi |
|---|---|---|---|
| Flou | 12 px (10 px sur mobile) | 20 px (16 px) | Assez pour effacer les formes, pas assez pour faire une tache. |
| `brightness` | 1.1 | 1.1 | Éclaircit sans teinter. |
| `contrast` | .9 | — | Sous une commande, le mur passe au second plan. |
| Remplissage | 27 % (4,59:1 mesuré) | 45 % (voile 60 % dessous ; 13,3:1 mesuré) | Le plus transparent possible au-dessus de 4,5:1 dans le pire cas. |
| Reflet | 1 px en haut + contour à 7 % | idem | Le seul reflet, fixe. |

### Repli

- **Sans `backdrop-filter`** (`@supports not`) : remplissage à 94 %, puis `--panel`. Le verre devient une matière opaque, sans fausse transparence.
- **`prefers-reduced-transparency`** : verre opaque, aucun flou. **Attention** : seul Chromium la prend en charge ; Safari ne la reconnaît pas, donc aucun iPhone ne l'applique, même avec « Réduire la transparence » activé. Sur iPhone, la lisibilité repose sur le calcul de contraste.
- **`prefers-contrast: more`** : fond blanc et contour noir de 1 px.

Tout est déjà dans `tokens.css` : aucune règle de composant n'a besoin d'être dupliquée.

## 5. Grille, espacements, composition

- **Le mur est fixe** (`stack.js`) : un seul écran, sans défilement. Seuls les dépôts les plus récents y sont, 16 sur iPhone et 40 sur ordinateur ; ils s'empilent, le plus récent au-dessus, et les textes passent toujours au-dessus des images pour rester lisibles. Les plus anciens sont enfouis : ils ne vivent plus que dans la liste. Placement déterministe (identifiant du dépôt et mois à Tokyo) : le même mur pour tous, sur un écran de même taille. → *Lien : le mur ne se parcourt pas, il se recouvre.*
- **Les bords se rongent avec l'âge** (`edge.js`) : au dépôt, l'image est presque rectangulaire ; à chaque palier d'usure, de nouvelles morsures apparaissent et les coins partent en premier. Le contour est fait de segments droits et d'angles vifs, jamais arrondi (le rond reste au verre). Il est tiré de l'identifiant du dépôt : le même sur le mur, dans la liste et dans Keep. → *Lien : l'image s'use par le noir, et maintenant aussi par le bord.*
- **Suite d'espacements non uniforme** : 4 · 8 · 12 · 20 · 32 · 52. Aucun écart ne se répète entre deux niveaux. → *Lien : un rythme de strates, pas une grille de cartes.*
- **Marges asymétriques** : 24 px à gauche et 12 px à droite sur ordinateur, 16 px et 8 px sur mobile (à 16/12, l'écart était imperceptible et ressemblait à une erreur). Elles s'appliquent à la ligne « Mood » / « Drop » et aux feuilles ; le mur garde son placement (`wall.js`). La capsule « Mood » s'aligne sur la marge gauche, la consigne s'aligne sur les lettres de « Mood », « Drop » se colle à droite. Rien n'est centré. Variante à marges égales : captures `marges-egales` de la PR.
- **Mois** : l'écran est partagé en bandes horizontales, du mois le plus récent en haut au plus ancien en bas ; les bandes débordent un peu l'une sur l'autre et se fondent, sans filet. Le mot du mois (« OCT.2026 ») est écrit en Mono, petit, en `--muted`, au bord gauche de sa bande. Un seul mois à l'écran : rien n'est écrit.
- **Feuilles** : sur mobile, elles montent du bas sur toute la largeur, avec des coins hauts de 22 px (c'est du verre, donc arrondi). Sur ordinateur, elles forment une colonne de 400 px **ancrée à droite**, à 72 px du haut, jamais au centre de l'écran, coins arrondis de 22 px. → *Lien : aucun moment « hero », la fenêtre se range sur le côté du mur.*
- **Keep** : une feuille, ouverte depuis la liste. Elle montre l'aperçu de l'image à garder : **le dépôt seul**, au centre d'un cadre blanc 4:5 ou 9:16 (≈ 42 % du cadre), avec son usure du jour (négatif, transparence du palier, bords rongés) et ses mots en entier, puis la ligne Mono du bas (« moodwall.pages.dev — date — consigne »). **Aucun nom**. Le signalement (Report) est en dessous, discret.

## 6. Mouvement

**Le mur ne bouge pas, et il ne défile pas.** Son seul mouvement, c'est l'usure (le noir, puis les bords), qui se compte en jours, et l'enfouissement : un nouveau dépôt recouvre les autres, et le plus ancien de l'écran passe dans la liste. Ce qui bouge, c'est la vitre, et seulement quand le visiteur agit.

| Ce qui bouge | Comment | Durée | Courbe | Pourquoi |
|---|---|---|---|---|
| Ouverture d'une feuille | opacité 0→1 et montée de 10 px | 240 ms | `--ease-out` | On pose une vitre, on ne lance pas une animation. |
| Fermeture | opacité 1→0 | 180 ms | `--ease-in` | Partir doit être plus court qu'arriver. |
| Apparition d'une image | opacité | 240 ms | `--ease-out` | Déjà en place (`.photo img`). |
| Toucher d'une vidéo du mur | `scale(.985)` sur `:active` | 120 ms | linéaire | Accuser réception, seulement au doigt ; une photo ou un texte ne réagit pas. |
| Vidéo du mur | lue sur place, une fois, au toucher | sa durée | — | Le seul mouvement du mur, et seulement au geste du visiteur. |

On n'anime **jamais** `backdrop-filter`, car l'iPhone recalculerait le flou à chaque image. On anime l'opacité de la feuille, pas son flou.

**Retirés** : le retournement de « Mood » au chargement et au survol (`@keyframes flip`), seul mouvement du site qui ne répondait ni au temps ni à un geste ; les déplacements `left`/`top` de `.wall.glide` : après une mise à jour, les dépôts prennent leur nouvelle place sans glisser.

Les ouvertures et fermetures utilisent `@starting-style` et `transition-behavior: allow-discrete` (Safari 17.5 et plus, Chrome 117 et plus). Les navigateurs plus anciens ouvrent et ferment sans fondu : même état final.

**`prefers-reduced-motion`** : toutes les durées passent à 0 ms et la montée à 0 px (dans les tokens). L'état final reste le même.

## 7. Performance

| Règle | Valeur |
|---|---|
| Couches `backdrop-filter` visibles en même temps | **2 au plus** : les deux capsules au repos, ou la feuille seule quand une fenêtre est ouverte (`html.modal` coupe les capsules). |
| Flou maximal | 12 px pour une capsule, 20 px pour une feuille ; 10 et 16 px sur mobile. |
| Où | Uniquement sur des éléments fixes ou dans la couche supérieure (`dialog`). Jamais dans le mur ni dans la liste. |
| Surface floutée | Capsules : moins de 5 % de l'écran. Feuilles : jamais plus de 92 dvh. |
| `will-change` | Jamais de façon permanente. |
| Poids ajouté par la DA (mesuré, gzip) | **5,8 Ko** : `tokens.css` 2,8 Ko (dont 1,9 Ko de commentaires), CSS du verre et du mouvement +0,9 Ko, `fonts.css` +0,1 Ko, polices au premier écran +1,9 Ko (Sans 300 : +3,7 Ko ; Mono 300 à la place de la Mono 200 : −1,8 Ko). |
| Polices au premier affichage | 110,6 Ko (Sans 200 « core » 95,0 préchargée, Thin 1,6, Sans 300 3,7, Mono 300 10,3), contre 108,7 Ko avant. Toutes en `font-display: swap`. |
| Réfraction SVG | Aucune (T1). |
| Mobile | Couper le flou des capsules pendant qu'une vidéo se convertit (`#convert` visible), car le processeur est déjà au maximum. |

Le verre est entièrement en CSS : il ne dépend d'aucun JavaScript pour s'afficher.

## 8. Ne jamais

1. **Mettre du verre sur un dépôt**, dans le mur ou dans la liste. Le verre, c'est le présent du visiteur ; le mur, c'est le passé.
2. **Teinter quoi que ce soit**, y compris le verre et ses reflets. Pas de bleu iOS, pas de `saturate()`.
3. **Faire bouger quelque chose sans geste du visiteur** : pas de reflet qui suit le gyroscope, pas de parallaxe, pas d'érosion animée en direct. L'usure se constate d'une visite à l'autre, pas pendant.
4. **Poser du verre sur du verre**, ou arrondir quelque chose qui n'est pas en verre.
5. **Distinguer un dépôt** : agrandi par défaut, épinglé, mis sous verre, encadré, y compris ceux de l'auteur du site.

## 9. Tokens

Voir `docs/tokens.css`, chargé avant `css/site.css` ; le bloc `:root` de `site.css` est supprimé. Les noms existants (`--bg`, `--fg`, `--muted`, `--panel`, `--rule`, `--photo-bg`, `--font`, `--mono`, `--light`, `--line`, `--gutter`, `--safe-t`, `--safe-b`) sont conservés, donc rien d'autre ne casse.

Deux corrections au passage :
- `system-ui` est retiré de la pile de secours : si Plex ne charge pas, Hiragino prend le relais sur iPhone, ce qui est un choix assumé ;
- les champs restent à 16 px (ils l'étaient déjà).

# Mood — direction artistique

Ce document part de la note de réalisation du 7 novembre 2026. Il va avec `tokens.css`, à charger avant `css/site.css`.
Le site est traité comme une œuvre, pas comme une vitrine : c'est la ligne que suit la note.

---

## Tensions avec le cadre imposé (à lire d'abord)

| # | Cadre demandé | Ce que dit la note ou le code | Décision |
|---|---|---|---|
| T1 | Le verre « réfracte » le contenu | La réfraction demande un filtre SVG dans `backdrop-filter` (`url(#…)`). Seul Chromium le gère. **Safari iOS, la plateforme prioritaire, ne le gère pas.** | Pas de vraie réfraction. Le verre floute, éclaircit et porte un reflet de bord. Un effet qui ne marcherait que dans Chrome casserait le principe du « même mur pour tous ». |
| T2 | Liquid Glass = capsules arrondies | Le site actuel est droit et carré, avec des filets de 1 px, « rien d'incliné ». | **Le rond est réservé au verre.** Tout ce qui appartient au mur reste rectangulaire. La forme dit d'un coup d'œil ce qui est l'interface et ce qui est l'œuvre. |
| T3 | Surfaces translucides | `.bar` utilise `mix-blend-mode: difference`, techniquement incompatible avec `backdrop-filter`, car l'élément fusionné devient la racine du fond. | Le verre **remplace** le mode `difference`. Cela répond à la question 4 de la note : « Mood » et « Drop » deviennent noirs sur verre clair et restent lisibles partout. |
| T4 | Transparence omniprésente dans iOS 26 | La note : « le minimum à l'écran », pas de bandeau. | Pas de barre en verre, seulement deux capsules. Sur le blanc, elles disparaissent presque ; elles n'apparaissent qu'au-dessus d'une image, c'est-à-dire seulement quand il faut les lire. |
| T5 | Interface rapide | Le flou coûte cher sur iPhone pendant le défilement. | Deux couches de flou au plus en même temps, jamais à l'intérieur de ce qui défile (voir section 7). |
| T6 | — | ExtraLight 200 est trop fin sur un fond flou et changeant (question 5 de la note). | Une seule graisse ajoutée, Light 300, en sous-ensemble latin, **seulement pour le texte posé sur le verre**. Toujours aucun gras. |

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
| `--muted` | `#555555` | `oklch(0.450 0 0)` | nom · date, mentions | Ce qui identifie quelqu'un reste en retrait (égalité). |
| `--rule` | `#d9d9d9` | `oklch(0.885 0 0)` | filets de strate, champs | Les strates se voient à peine, comme des couches. |
| `--panel` | `#fafafa` | `oklch(0.985 0 0)` | verre opaque (repli) | Même rôle que le verre, sans transparence. |
| `--photo-bg` | `#f0f0f0` | `oklch(0.955 0 0)` | image en chargement | Une place grise avant la trace. |
| `--glass-fill` | blanc à 48 % | `oklch(1 0 0 / .48)` | capsule | ≈ 8:1 pour `--fg`, même sur le gris visible le plus sombre. |
| `--glass-fill-sheet` | blanc à 78 % | `oklch(1 0 0 / .78)` | feuille | Le mur se devine derrière une fenêtre ouverte. |
| `--glass-rim-light` | blanc à 85 % | `oklch(1 0 0 / .85)` | reflet de bord haut | Le seul « éclat » du site, et il est hors du mur. |
| `--glass-rim-dark` | `#111` à 7 % | `oklch(0.178 0 0 / .07)` | contour sur blanc | La capsule existe encore sur le fond nu. |
| `--veil` | blanc à 86 % | `oklch(1 0 0 / .86)` | `::backdrop` | Le mur recule sans disparaître. |

Le verre ne contient **pas** de `saturate()` : sur un mur entièrement gris, il ne ferait rien, et un verre teinté à la manière d'iOS trahirait la règle des gris.

## 3. Typographie

**IBM Plex Sans JP** et **IBM Plex Mono**, sous licence OFL, déjà auto-hébergées et découpées en sous-ensembles dans `assets/fonts/`.

- **Plex Sans JP.** Le site existe en trois langues et le mur est calé sur Tokyo : il faut une fonte qui dessine le kana et le latin avec la même rigueur. Son côté grotesque un peu mécanique va avec l'idée d'une archive. → *Lien avec la note : le même mur pour tous, quelle que soit la langue.*
- **Plex Mono.** Elle sert à tout ce qui relève du registre : consigne, nom · date, lignes Kawara, ligne Keep. → *Lien : l'archive parle comme un registre, pas comme un titre.*

| Rôle | Fonte | Graisse | Taille | Interlettrage |
|---|---|---|---|---|
| « Mood » | Sans | 100 | 22 px | .3em |
| Textes du mur | Sans | 200 | 12 à 16 px (`sizeFor`, inchangé) | 0 |
| Interface sur blanc, mentions | Sans | 200 | 13 px | 0 |
| **Texte sur verre** (Drop, Keep, ‹ › ×, S/M/L) | Sans | **300** | 13 px | .1em pour Drop |
| Champs de saisie | Sans | 200 | **16 px** | 0 |
| Méta, consigne, Kawara, Keep | Mono | 200 | 11 px | 0 |
| Repère vidéo, compteur | Mono | 200 | 10 px | 0 |

La graisse 300 se limite à un sous-ensemble latin des mots d'interface, qui restent en anglais dans les trois langues (`strings.js`) : environ 3 Ko. Le champ à 16 px est une contrainte d'iPhone : en dessous, Safari zoome la page dès qu'on touche le champ.

## 4. Système Liquid Glass

### Où il s'applique, et seulement là

1. **Capsules « Mood » et « Drop »**, fixées en haut. Elles flottent au-dessus des images qui défilent. → *Lien : le visiteur regarde, le mur passe dessous.*
2. **Commandes de l'agrandissement** (‹ › ×), réunies dans une seule capsule au-dessus de l'image. → *Lien : on traverse les dépôts sans en couvrir aucun.*
3. **Feuilles** Drop, Mood et Keep. → *Lien : on écrit ou on lit les règles devant le mur, sans le quitter.*

### Où il ne s'applique jamais

Sur un dépôt (image, texte, vidéo), sur la liste ou les lignes Kawara, sur la consigne du mois, sur les boutons à l'intérieur d'une feuille (pas de verre sur du verre), sur l'aperçu Keep.

### CSS

```css
/* capsule : Mood, Drop, commandes de l'agrandissement */
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

/* feuille : Drop, Mood, Keep */
.dlg {
  background: var(--glass-fill-sheet);
  -webkit-backdrop-filter: blur(var(--glass-blur-sheet)) brightness(var(--glass-lift));
          backdrop-filter: blur(var(--glass-blur-sheet)) brightness(var(--glass-lift));
  box-shadow: var(--glass-rim);
  border: 0;
}
.dlg::backdrop { background: var(--veil); }   /* voile sans flou : une seule couche floue à la fois */

/* intégration dans site.css */
.bar { mix-blend-mode: normal; }                     /* T3 : le mode difference est retiré */
.bar .id, .bar .btn-drop { color: var(--fg); border: 0; }
html.modal .bar .glass {                             /* fenêtre ouverte : les capsules ne floutent plus */
  -webkit-backdrop-filter: none; backdrop-filter: none;
  background: transparent; box-shadow: none;
}
```

### Paramètres

| Paramètre | Capsule | Feuille | Pourquoi |
|---|---|---|---|
| Flou | 12 px (10 px sur mobile) | 20 px (16 px) | Assez pour effacer les formes, pas assez pour faire une tache. |
| `brightness` | 1.1 | 1.1 | Éclaircit sans teinter. |
| `contrast` | .9 | — | Sous une commande, le mur passe au second plan. |
| Remplissage | 48 % | 78 % | Calculé pour la lisibilité, pas pour l'effet. |
| Reflet | 1 px en haut + contour à 7 % | idem | Le seul reflet, fixe. |

### Repli

- **Sans `backdrop-filter`** (`@supports not`) : remplissage à 94 %, puis `--panel`. Le verre devient une matière opaque, sans fausse transparence.
- **`prefers-reduced-transparency`** : verre opaque, aucun flou.
- **`prefers-contrast: more`** : fond blanc et contour noir de 1 px.

Tout est déjà dans `tokens.css` : aucune règle de composant n'a besoin d'être dupliquée.

## 5. Grille, espacements, composition

- **Le mur garde sa composition libre** (`wall.js` : placement déterministe, le plus récent au-dessus, recouvrement limité). → *Lien : le mur est immobile et identique pour tous ; la DA n'y touche pas.*
- **Suite d'espacements non uniforme** : 4 · 8 · 12 · 20 · 32 · 52. Aucun écart ne se répète entre deux niveaux. → *Lien : un rythme de strates, pas une grille de cartes.*
- **Marges asymétriques** : 16 px à gauche et 12 px à droite sur mobile (24/16 sur ordinateur). « Mood » s'aligne sur la marge gauche, la consigne s'aligne sur « Mood », « Drop » se colle à droite. Rien n'est centré.
- **Strates** : 52 px et un filet `--rule` entre deux mois ou deux consignes. C'est le seul grand écart du site.
- **Feuilles** : sur mobile, elles montent du bas sur toute la largeur, avec des coins hauts de 22 px (c'est du verre, donc arrondi). Sur ordinateur, elles forment une colonne de 400 px **ancrée à droite**, à 72 px du haut, jamais au centre de l'écran. → *Lien : aucun moment « hero », la fenêtre se range sur le côté du mur.*
- **Agrandissement** : l'image prend la largeur moins les marges, avec la capsule ‹ › × en haut à droite et le nom · date en mono en bas à gauche, hors du verre.

## 6. Mouvement

**Le mur ne bouge pas.** Son seul mouvement, c'est l'érosion, qui se compte en jours. Ce qui bouge, c'est la vitre, et seulement quand le visiteur agit.

| Ce qui bouge | Comment | Durée | Courbe | Pourquoi |
|---|---|---|---|---|
| Ouverture d'une feuille | opacité 0→1 et montée de 10 px | 240 ms | `--ease-out` | On pose une vitre, on ne lance pas une animation. |
| Fermeture | opacité 1→0 | 180 ms | `--ease-in` | Partir doit être plus court qu'arriver. |
| Dépôt suivant ou précédent | fondu enchaîné | 180 ms | `--ease-out` | On passe d'une trace à l'autre sans glisser. |
| Apparition d'une image | opacité | 240 ms | `--ease-out` | Déjà en place (`.photo img`). |
| Toucher d'un dépôt | `scale(.985)` sur `:active` | 120 ms | linéaire | Accuser réception, seulement au doigt. |

On n'anime **jamais** `backdrop-filter`, car l'iPhone recalculerait le flou à chaque image. On anime l'opacité de la feuille, pas son flou.

**À retirer** : le retournement de « Mood » au chargement et au survol (`@keyframes flip`). C'est le seul mouvement du site qui ne répond ni au temps ni à un geste, et il retarde la première lecture. Il y a aussi les déplacements `left`/`top` de `.wall.glide` : le mur ne doit pas glisser quand on redimensionne la fenêtre.

**`prefers-reduced-motion`** : toutes les durées passent à 0 ms et la montée à 0 px (dans les tokens). L'état final reste le même.

## 7. Performance

| Règle | Valeur |
|---|---|
| Couches `backdrop-filter` visibles en même temps | **2 au plus** : les deux capsules au repos, ou la feuille seule quand une fenêtre est ouverte (`html.modal` coupe les capsules). |
| Flou maximal | 12 px pour une capsule, 20 px pour une feuille ; 10 et 16 px sur mobile. |
| Où | Uniquement sur des éléments fixes ou dans la couche supérieure (`dialog`). Jamais dans le mur ni dans la liste qui défilent. |
| Surface floutée | Capsules : moins de 5 % de l'écran. Feuilles : jamais plus de 92 dvh. |
| `will-change` | Jamais de façon permanente. |
| Poids ajouté par la DA | ≤ 6 Ko : graisse 300 latine (~3 Ko) et CSS du verre (~2 Ko). |
| Polices au premier affichage | Plex Sans JP 200 « core » seulement (préchargée, comme aujourd'hui). Les graisses 100, 300 et Mono passent en `font-display: swap`. |
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

Voir `tokens.css`, à charger avant `css/site.css`, puis supprimer le bloc `:root` de `site.css`. Les noms existants (`--bg`, `--fg`, `--muted`, `--panel`, `--rule`, `--photo-bg`, `--font`, `--mono`, `--light`, `--line`, `--gutter`, `--safe-t`, `--safe-b`) sont conservés, donc rien d'autre ne casse.

Deux corrections au passage :
- `system-ui` est retiré de la pile de secours : si Plex ne charge pas, Hiragino prend le relais sur iPhone, ce qui est un choix assumé ;
- les champs passent à 16 px.

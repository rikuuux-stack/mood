# Guide Blender : de la scène au `.glb` baké

Ce guide est écrit pour **Blender 4.2 LTS à 5.0**. Les différences entre versions sont signalées par ⚠︎.
Le script `tools/blender/riku_bake.py` automatise les étapes 5 à 11. Fais-les **une fois à la main** pour comprendre, puis laisse le script les refaire à chaque modification.

Pour voir un résultat de référence, ouvre la scène démo générée par le script : c'est exactement ce que le site affiche.

```bash
blender -b -P tools/blender/riku_bake.py -- --demo assets/layout.json --out assets --size 2048 --samples 256 --save-blend ~/riku_demo.blend
```

---

## Le principe en une image

```
Blender (Cycles)                                         Navigateur (three.js)
────────────────                                         ─────────────────────
béton : texture répétée ──── UV0 ──────────────────────▶ map        ┐
                                                                      ├─ × ─▶ AgX ─▶ écran
lumière : bake Diffuse ───── UV1 (« UVBake ») ─ EXR ─▶ lightMap × headroom × π ┘
          (direct + indirect, SANS couleur)
```

On ne bake **que la lumière**. Le béton reste une texture nette, répétée sur l'UV0. Le navigateur fait la multiplication, puis applique le même tone mapping (AgX) que ton viewport.

---

## 0. Préparer Blender

1. **Edit ▸ Preferences ▸ System ▸ Cycles Render Devices** : sur Mac Apple Silicon, choisis **Metal** et coche ton GPU.
2. **Propriétés de rendu** (icône d'appareil photo arrière) :
   - Render Engine : **Cycles** ; Device : **GPU Compute**.
   - **Color Management** : View Transform **AgX**, Look **None**, Exposure **0**, Gamma **1**.
     *Pourquoi :* le site reproduit « AgX sans Look ». Si tu changes l'exposition ici, reporte-la dans `js/config.js` (`exposure = 2^EV` : +1 EV → 2.0).
3. **Unités** (propriétés de scène) : Metric, Unit Scale **1.0**. 1 unité = 1 mètre : le site suppose une hauteur d'œil de 1,6 m et un sol à y = 0.

---

## 1. Modéliser : peu d'objets, des murs épais

- **Des volumes pleins, pas des plans.** Les murs doivent avoir une épaisseur réelle (40 à 80 cm, du béton brutaliste). Un mur fait d'un simple plan laisse la lumière de Cycles passer dans les angles : on voit alors des fuites claires au pied des murs.
- **Le sol à Z = 0** dans Blender (qui devient y = 0 dans le site).
- **Les ouvertures zénithales** sont de vrais trous dans la toiture. Tout l'intérêt du bake est de reproduire la lumière qui tombe par ces trous.
- Garde un œil sur **Viewport Overlays ▸ Face Orientation** : les faces vues depuis l'intérieur doivent être **bleues**. Si une face est rouge, sélectionne-la et fais `Alt+N ▸ Flip`.
- Applique les transformations : `Ctrl+A ▸ All Transforms`. Une échelle non appliquée fausse les UV et la densité de texels.

## 2. Fusionner par matériau, supprimer l'invisible

1. Sélectionne tous les objets en béton, puis `Ctrl+J` : **un seul objet par matériau**. Chaque objet supplémentaire, c'est un appel de dessin et un découpage de lightmap en plus.
2. En mode Édition, **supprime toutes les faces que la caméra ne verra jamais** : le dessus du toit, le dessous de la dalle, l'extérieur des murs, les faces collées l'une contre l'autre.
   *Pourquoi :* chaque face occupe de la place dans la lightmap. Supprimer l'extérieur rend souvent **40 % de résolution** à l'intérieur.
3. `M ▸ By Distance` (fusion des sommets) pour souder les volumes adjacents.
4. Mets le béton dans une collection **`BAKE`**. Le script ne bakera qu'elle.

> **Densité de texels à viser :** une lightmap 2K (4,2 millions de texels) pour environ 1 000 m² de surfaces visibles donne ≈ 65 texels/m, soit un texel tous les 1,5 cm. C'est largement assez pour une lumière douce. Au-delà de 2 500 m², passe en 4K ou découpe en une lightmap par salle.

## 3. UV0 : le béton

La texture de coffrage doit être **à l'échelle réelle** et se répéter.

1. En mode Édition, tout sélectionné : `U ▸ Cube Projection`, avec **Cube Size = 1.8** si ta texture représente 1,8 × 1,8 m (deux panneaux de coffrage de 1,8 × 0,9 m).
2. Vérifie dans l'éditeur UV que les trous de banche sont alignés et à la bonne taille.
3. Cette UV map doit rester **la première de la liste** et s'appeler `UVMap` (elle devient `TEXCOORD_0`).

## 4. UV1 : la carte de bake (`UVBake`)

1. **Object Data Properties** (triangle vert) ▸ **UV Maps** ▸ `+` ▸ renomme-la **`UVBake`**.
2. **Clique sur son nom** pour la rendre active en *édition*. Laisse l'**icône d'appareil photo** (UV de rendu) sur `UVMap` : la texture de béton continue à utiliser l'UV0.
3. En mode Édition, tout sélectionné, deux méthodes :
   - **Smart UV Project** (`U ▸ Smart UV Project`) : Angle Limit **66°**, Island Margin **0.005**, Area Weight **1**, Scale to Bounds décoché. Choisis-la pour les **grandes surfaces planes** (murs, sols, plafonds) : elle donne de gros îlots et peu de coutures.
   - **Lightmap Pack** (`U ▸ Lightmap Pack`) : Margin **0.2**. Choisis-la pour **beaucoup de petits morceaux** (escaliers, bancs, mobilier).
4. **UV ▸ Pack Islands** : Shape Method **Concave**, Rotate ✓, Rotation Method **Axis-aligned**, Margin Method **Fraction**, Margin **0.004**, soit 8 px en 2K (0.002 en 4K).
   *Pourquoi axis-aligned :* un îlot tourné à 45° crée un escalier de texels le long de ses bords.
5. **Vérifications** :
   - `UV ▸ Select Overlap` ne doit **rien** sélectionner. Deux îlots superposés reçoivent la même lumière, ce qui donne des taches aberrantes.
   - `UV ▸ Average Islands Scale` avant le pack, pour que chaque m² reçoive le même nombre de texels.

## 5. Matériaux

- **Béton** : utilise une **texture scannée**, pas une texture générée : c'est ce qui enlève le plus l'effet « maquette ». Le projet utilise deux jeux CC0 de Poly Haven, rangés dans `tools/textures/` : *concrete_wall_004* (murs, plafond, poutres) et *concrete_floor_worn_001* (sol). Branche-les dans un Principled BSDF : Base Color = diffuse, Roughness = rough (Non-Color), Normal = nor_gl via un node *Normal Map* (Non-Color). Metallic 0.
  - **Échelle réelle** : *concrete_wall_004* mesure 2 × 2 m. Le script la répète tous les **3,6 m** pour que les banches fassent 1,8 × 0,9 m, les proportions du béton de Tadao Ando. Le sol se répète tous les 3 m.
  - Le script multiplie l'albédo par la carte d'occlusion (les creux s'assombrissent) et le désature un peu vers un gris froid : le béton scanné est souvent trop jaune.
- **Écrans `SCREEN_<id>`** : un plan par œuvre, décollé de **2 cm** du mur, normale tournée vers la salle, à la taille **maximale** du cadre (l'image y est ajustée « contain »). Donne-lui un matériau noir **sans émission** et **ne le mets pas** dans la collection `BAKE`.
  *Pourquoi sans émission :* la lumière de l'écran change à chaque image, elle ne peut pas être cuite. Le site la simule (le « spill »).

## 6. Lumière

- **Soleil** : lampe *Sun*, Strength **8**, Angle **0,53°** (la taille réelle du soleil : ombres nettes, comme dans une vraie salle), couleur ≈ 5 500 K (1.0, 0.93, 0.84), élévation ≈ 58°. Oriente-le pour que les rais tombent **sur les murs et le sol, pas sur les écrans**.
- **Ciel** : World ▸ *Sky Texture* (*Multiple Scattering* dans Blender 5, *Nishita* dans 4.x), **Sun Disc décoché** (le soleil est porté par la lampe), Strength ≈ 2 en 5.0. Ajoute un node *Hue/Saturation* à 0,55 entre le ciel et le Background : sinon le rebond bleu teinte tout l'intérieur, comme une balance des blancs ratée.
- **Exposition** : rends une caméra (F12) et ajuste l'*Exposure* de la gestion couleur jusqu'à ce que l'image te plaise (+1,5 EV pour la démo). Reporte-la dans `js/config.js` : `exposure = 2^EV` (+1,5 EV → 2,8).
- **Portails** : dans chaque ouverture zénithale, ajoute une *Area light* de la taille du trou, orientée vers l'intérieur, et coche **Portal**. Cycles envoie alors ses rayons vers les ouvertures : **2 à 4 fois moins de bruit** à nombre d'échantillons égal. C'est l'astuce qui compte le plus pour un intérieur éclairé par le haut.

## 7. Le bake

1. Crée l'image cible : dans l'éditeur de shaders du béton, `Shift+A ▸ Texture ▸ Image Texture ▸ New` :
   Name `LM`, **2048 × 2048** (ou 4096), Color noir, **Alpha décoché**, **32-bit Float coché**.
   *Pourquoi en float :* la lumière dépasse 1 sous les ouvertures. En 8 bits, elle serait écrêtée.
2. **Ne connecte ce node à rien.** Clique dessus en dernier : c'est le **node actif** qui reçoit le bake. Fais-le dans **chaque** matériau des objets à baker (avec la même image `LM`).
3. Vérifie que **`UVBake` est l'UV active** (surlignée) sur chaque objet : le bake écrit selon l'UV *active*, pas selon l'UV de rendu.
4. **Render Properties ▸ Sampling** : Render Samples **512 à 1024**. Le bake n'utilise ni le débruiteur de Cycles ni l'échantillonnage adaptatif.
   **Light Paths** : Max Bounces 8, Diffuse 6. Les rebonds font la beauté du béton.
5. **Render Properties ▸ Bake** :
   - Bake Type : **Diffuse**
   - Contributions : **Direct ✓ Indirect ✓ Color ✗** ← le point essentiel
   - Output ▸ Target : Image Textures, **Clear Image ✓**
   - Margin : Type **Extend**, Size **16 px**
6. Sélectionne tous les objets de `BAKE`, puis **Bake**. Compte 2 à 10 min en 2K sur un Mac M-series avec 512 échantillons.
7. Dans l'éditeur d'images : `Image ▸ Save As` ▸ **OpenEXR**, Color Depth **Float (Half)**, Codec ZIP → `lightmap_raw.exr`.

## 8. Débruitage OIDN (compositor)

Le bake sort toujours bruité : il faut le débruiter dans le compositor.

1. Espace de travail **Compositing** :
   - ⚠︎ 4.x : coche **Use Nodes**.
   - ⚠︎ 5.0 : clique sur **New** pour créer un groupe de nodes de compositing.
2. Nodes : **Image** (charge `lightmap_raw.exr`) → **Denoise** (Prefilter **Accurate**, **HDR ✓**) → **Viewer**.
3. Dans l'éditeur d'images, choisis l'image **Viewer Node**, puis `Image ▸ Save As` ▸ OpenEXR Float → `lightmap_denoised.exr`.
   *Vérifier :* compare les deux EXR avec un zoom de 400 % dans les coins sombres. Le grain doit avoir disparu, les ombres de contact rester nettes.

## 9. Encodage web

Le PNG ne stocke que des valeurs de 0 à 1, alors que ta lumière monte jusqu'à 2 ou 4. Le script choisit une marge (headroom) en puissance de 2, divise l'image par cette valeur, l'encode en sRGB et écrit le `manifest.json` que lit le site :

```bash
blender -b -P tools/blender/riku_bake.py -- --encode ~/bake/lightmap_denoised.exr --out assets
```

## 10. Caméras : c'est toi qui cadres

- Nomme-les **`CAM_00_intro`**, **`CAM_01_<id>`**, **`CAM_02_via`**…, l'ordre du numéro étant l'ordre du parcours.
  `<id>` = l'identifiant de l'œuvre dans `js/content/works.js` ; `via` = point de passage sans arrêt (placé dans les portes, il évite que le travelling traverse un mur).
- **Output Properties** : 1920 × 1080. Tu cadres pour du 16:9 et le site préserve ton champ horizontal sur les écrans plus étroits.
- Caméra ▸ Sensor Fit **Vertical**. Utilise des focales raisonnables (24 à 35 mm équivalent) : un grand-angle extrême déforme les travellings.
- **Laisse de l'air** en bas à gauche (bandeau du titre) et en bas (timeline) : environ 20 % du cadre.
- Vue caméra (`Numpad 0`), puis `N ▸ View ▸ Lock Camera to View` pour cadrer en naviguant.

## 11. Export glTF

**File ▸ Export ▸ glTF 2.0 (.glb)** :

| Section | Réglage |
|---|---|
| Include | Limit to **Visible Objects** ; Data : **Custom Properties ✓**, **Cameras ✓**, Punctual Lights ✗ |
| Transform | **+Y Up ✓** |
| Data ▸ Mesh | **Apply Modifiers ✓**, UVs ✓, Normals ✓ |
| Data ▸ Material | Materials : Export ; Images : **Automatic** (JPEG pour le béton) |
| Compression | **Draco ✗** (on compresse avec meshopt, plus rapide à décoder) |

Enregistre-le dans `assets/models/expo.glb`.

*Facultatif :* **Object Properties ▸ Custom Properties ▸ New**, type String, nom `lightmap`, valeur `lightmap`. Sans cette propriété, le site utilise la lightmap `lightmap` par défaut. Elle ne sert que si tu fais une lightmap par salle (`salle1`, `salle2`…).

## 12. Compression et test

```bash
tools/compress.sh                  # glb meshopt + WebP ; lightmap WebP (+ KTX2 UASTC si `ktx` est installé)
python3 -m http.server 8000        # http://localhost:8000/?q=2
```

Dans la console du navigateur, tu dois lire `[baked] 1 mesh(es) avec lightmap.`

---

## Comparer avec Blender

Rends ta caméra `CAM_01_…` dans Blender (F12), puis fais une capture du site au même plan. Les deux images doivent être **très proches**.

- **Site plus sombre d'environ ×3** : le facteur π manque. Vérifie que `manifest.json` contient bien `headroom` et que tu n'as pas modifié `baked.js`.
- **Site plus contrasté ou plus saturé** : un *Look* est actif dans Blender. Remets-le sur None.
- **Petites différences dans les hautes lumières** : l'AgX de three.js est une très bonne approximation de celui de Blender, pas une copie exacte. Ajuste `exposure` par pas de 0,1.
- **Reflets absents** : c'est normal, un bake diffus n'en contient pas (voir ARCHITECTURE § Écarté).

## Dépannage

| Symptôme | Cause probable | Remède |
|---|---|---|
| Taches noires ou éclaboussures | Îlots UV qui se chevauchent | `Select Overlap`, puis refaire le pack |
| Liseré clair ou sombre le long des arêtes | Marge trop faible, ou mipmaps qui mélangent les îlots | Margin 16 px Extend, marge de pack 8 px ; mipmaps désactivés dans `baked.js` |
| Lumière qui fuit dans les angles | Murs sans épaisseur, géométrie non fermée | Murs pleins, sommets fusionnés |
| Coutures visibles au milieu d'un mur | Îlot découpé en deux | Smart UV avec un angle plus grand, ou couture déplacée dans un coin |
| Bruit résiduel après débruitage | Trop peu d'échantillons, pas de portails | Portails + 1024 échantillons |
| Lightmap floue | Densité de texels insuffisante | Supprimer les faces invisibles, passer en 4K, une lightmap par salle |
| Lumière décalée par rapport à la géométrie | Bake fait sur la mauvaise UV active, ou UV0 et UV1 inversées | `UVMap` en premier, `UVBake` active pendant le bake |
| Tout est plat dans le site | L'objet n'a pas d'UV1 ou le manifest est introuvable | Voir l'avertissement `[baked]` dans la console |
| Bandes dans les dégradés | Lightmap compressée en ETC1S | UASTC (voir `compress.sh`) |

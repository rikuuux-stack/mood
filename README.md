# RIKU — espace d'exposition

Portfolio de Félix Cardonnel (RIKU) : un espace brutaliste en béton, éclairé dans Cycles puis précalculé, et parcouru comme une séquence montée.

```bash
python3 -m http.server 8000     # → http://localhost:8000   (?q=0|1|2 pour forcer un niveau)
```

| Je veux… | Fichier |
|---|---|
| modifier mes œuvres, textes, liens | `js/content/works.js` |
| régler l'exposition, le rythme, la vidéo | `js/config.js` |
| encoder une œuvre vidéo (aperçu, affiche, planche) | `tools/media/encode.sh master.mov id [début] [durée]` |
| encoder une œuvre en photos (diaporama) | `tools/media/stills.sh id 16:9 image1.jpg image2.jpg …` |
| baker et exporter mon espace | `docs/BLENDER-BAKE.md`, puis `tools/blender/riku_bake.py` |
| compresser pour le web | `tools/compress.sh` |
| préparer la mise en ligne | `bash tools/publish.sh` → dossier `_a-mettre-en-ligne/` |
| regénérer les polices (nouveau texte japonais) | `python3 tools/fonts/subset.py` |
| comprendre l'ensemble | `docs/ARCHITECTURE.md` |

## Un seul dossier, transportable

Tout le site est dans ce dossier : three.js 0.186.1 est copié dans `vendor/three/`, les polices (licence OFL) dans `assets/fonts/`. Aucun chemin absolu, aucun serveur extérieur requis — seuls les liens YouTube / Instagram / e-mail pointent vers l'extérieur. On peut le déplacer, le renommer, le zipper ou le mettre sur une clé USB. Pour l'ouvrir, il faut simplement un petit serveur local (VS Code « Live Server », ou la commande ci-dessus) : les navigateurs refusent les modules JavaScript en `file://`.

Clavier : ↑/↓ ou J/L = œuvre précédente/suivante · Espace ou K = pause · I = index · Entrée = fiche · Échap = fermer.

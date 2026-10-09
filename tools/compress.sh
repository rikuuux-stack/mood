#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# compress.sh — prépare les fichiers 3D pour le web, après riku_bake.py.
#
#   1. expo.glb   : géométrie compressée meshopt + textures d'albédo en WebP
#                   (gltf-transform ; KTX2/ETC1S si l'outil `ktx` est installé)
#   2. lightmap   : PNG → WebP (qualité haute, léger) et, si `ktx` est présent,
#                   KTX2 UASTC + zstd (reste compressé EN MÉMOIRE GPU : indispensable en 4K)
#   3. manifest   : mis à jour pour que le site choisisse le meilleur format
#
# Prérequis : Node 18+ (npx), ffmpeg. Optionnel : KTX-Software 4.3+ (commande `ktx`).
#   macOS : brew install node ffmpeg ktx-software   (ou l'installeur .pkg de KTX-Software)
#
# ⚠ Ne JAMAIS compresser une lightmap en ETC1S : bandes visibles dans les dégradés.
#   UASTC pour la lumière, ETC1S acceptable pour l'albédo du béton.
# ------------------------------------------------------------------------------
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A="$ROOT/assets"
GT="npx --yes @gltf-transform/cli@4"

echo "▶ glb : meshopt + textures"
# l'original reste à côté (non publié) ; on repart toujours de lui
if grep -q "EXT_meshopt_compression" "$A/models/expo.glb"; then
  echo "  expo.glb déjà compressé : on repart de expo.src.glb"
else
  cp "$A/models/expo.glb" "$A/models/expo.src.glb"      # nouvel export Blender
fi
TMP="$A/models/.tmp.glb"
if command -v ktx >/dev/null 2>&1; then
  $GT etc1s "$A/models/expo.src.glb" "$TMP" --slots "baseColorTexture" --quality 192
else
  $GT webp "$A/models/expo.src.glb" "$TMP" --quality 88
fi
# meshopt EN DERNIER : une commande qui relit le fichier après coup peut retirer la compression
$GT meshopt "$TMP" "$A/models/expo.glb" --level medium
rm -f "$TMP"

echo "▶ lightmaps"
LM="$A/lightmaps"
python3 - "$LM" <<'PY'   # python3 : présent sur macOS
import json, sys, os, subprocess, shutil
lm = sys.argv[1]
man_path = os.path.join(lm, "manifest.json")
man = json.load(open(man_path))
for name, m in man.items():
    png = os.path.join(lm, m.get("png", m["file"]))
    m["png"] = os.path.basename(png)
    webp = os.path.join(lm, name + ".webp")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", png,
                    "-c:v", "libwebp", "-quality", "94", "-compression_level", "6", webp], check=True)
    m["file"] = os.path.basename(webp)
    if shutil.which("ktx"):
        ktx2 = os.path.join(lm, name + ".ktx2")
        subprocess.run(["ktx", "create", "--format", "R8G8B8_SRGB", "--assign-tf", "srgb",
                        "--encode", "uastc", "--uastc-quality", "2", "--zstd", "18",
                        png, ktx2], check=True)   # sans mipmaps : voir js/scene/baked.js
        m["ktx2"] = os.path.basename(ktx2)
    print(f"  {name}: {os.path.getsize(png)//1024} Ko PNG → {os.path.getsize(webp)//1024} Ko WebP"
          + (f", {os.path.getsize(os.path.join(lm, m['ktx2']))//1024} Ko KTX2" if "ktx2" in m else ""))
json.dump(man, open(man_path, "w"), ensure_ascii=False, indent=2)
PY

ls -la "$A/models" "$A/lightmaps"
echo "✔ terminé. À ne pas publier : assets/models/expo.src.glb, assets/lightmaps/src/, *.png des lightmaps."

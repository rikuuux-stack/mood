#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# encode.sh — produit, à partir d'un master, les trois fichiers web d'une œuvre :
#
#   assets/video/<id>.mp4      boucle d'aperçu H.264, 8 s, 1280 px, < 2 Mo, sans son
#   assets/posters/<id>.webp   affiche (première image de la boucle)
#   assets/sprites/<id>.webp   planche de 48 vignettes réparties sur TOUT le film
#                              → défilement image par image au survol dans l'index
#
# Pourquoi une planche plutôt qu'une vidéo tout-intra (-g 1) : une vidéo où chaque
# image est une image clé pèse 5 à 10 fois plus lourd, et le positionnement (seek)
# reste lent et capricieux sur iOS. La planche fait ~150 Ko, s'affiche instantanément
# et fonctionne au doigt comme à la souris.
#
# Usage : tools/media/encode.sh <master> <id> [début de la boucle en s] [durée de la boucle en s]
#   ex. : tools/media/encode.sh ~/Masters/entre_ici_et_la_2K.mov entre 42 8
#
# Couleur : on marque explicitement BT.709 / plage limitée (tv) pour que les
# navigateurs n'interprètent pas la vidéo en BT.601 (décalage de teinte visible).
# ------------------------------------------------------------------------------
set -euo pipefail

SRC="${1:?master manquant}"; ID="${2:?id manquant}"
START="${3:-0}"; LEN="${4:-8}"
FRAMES=48; COLS=8; THUMB_W=240
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/assets"
mkdir -p "$OUT/video" "$OUT/posters" "$OUT/sprites"

COLOR=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)

echo "▶ boucle d'aperçu"
ffmpeg -hide_banner -loglevel error -y -ss "$START" -t "$LEN" -i "$SRC" \
  -vf "scale=1280:-2:flags=lanczos,fps=25,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -crf 24 -maxrate 1800k -bufsize 3600k \
  -g 50 -keyint_min 25 -sc_threshold 0 "${COLOR[@]}" \
  -an -movflags +faststart "$OUT/video/$ID.mp4"

SIZE=$(stat -c%s "$OUT/video/$ID.mp4" 2>/dev/null || stat -f%z "$OUT/video/$ID.mp4")
if [ "$SIZE" -gt 2000000 ]; then
  echo "  … $((SIZE/1024)) Ko > 2 Mo : second passage plus compressé"
  ffmpeg -hide_banner -loglevel error -y -ss "$START" -t "$LEN" -i "$SRC" \
    -vf "scale=960:-2:flags=lanczos,fps=25,format=yuv420p" \
    -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 1400k -bufsize 2800k \
    -g 50 "${COLOR[@]}" -an -movflags +faststart "$OUT/video/$ID.mp4"
fi

echo "▶ affiche"
ffmpeg -hide_banner -loglevel error -y -i "$OUT/video/$ID.mp4" -frames:v 1 \
  -vf "scale=1280:-2" -c:v libwebp -quality 82 "$OUT/posters/$ID.webp"

echo "▶ planche de $FRAMES images"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
RATE=$(awk -v d="$DUR" -v n="$FRAMES" 'BEGIN{printf "%.6f", n/d}')
ROWS=$(( (FRAMES + COLS - 1) / COLS ))
# -skip_frame nokey : ne décode que les images clés → 10× plus rapide sur un long master
ffmpeg -hide_banner -loglevel error -y -skip_frame nokey -i "$SRC" \
  -vf "fps=$RATE,scale=$THUMB_W:-2:flags=lanczos,tile=${COLS}x${ROWS}" \
  -frames:v 1 -c:v libwebp -quality 72 "$OUT/sprites/$ID.webp"

printf '✔ %s : aperçu %s Ko · affiche %s Ko · planche %s Ko\n' "$ID" \
  $(( $(stat -c%s "$OUT/video/$ID.mp4" 2>/dev/null || stat -f%z "$OUT/video/$ID.mp4") / 1024 )) \
  $(( $(stat -c%s "$OUT/posters/$ID.webp" 2>/dev/null || stat -f%z "$OUT/posters/$ID.webp") / 1024 )) \
  $(( $(stat -c%s "$OUT/sprites/$ID.webp" 2>/dev/null || stat -f%z "$OUT/sprites/$ID.webp") / 1024 ))
echo "  durée du master : ${DUR}s → runtime: $(printf '%.0f' "$DUR") dans js/content/works.js"

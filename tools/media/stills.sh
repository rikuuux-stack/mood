#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# stills.sh — pour une œuvre SANS vidéo (photos de plateau, photogrammes) :
#
#   assets/video/<id>.mp4      diaporama en fondu enchaîné, en boucle parfaite, sans son
#   assets/posters/<id>.webp   affiche (première image)
#   assets/sprites/<id>.webp   planche d'une ligne (une vignette par image) pour l'index
#
# Usage : tools/media/stills.sh <id> <format> image1 image2 …
#   ex. : tools/media/stills.sh entre 2.39:1 "Entre ici et là/Image.jpg" "Entre ici et là/Image 2.jpg"
#   → dans works.js :  media: media('entre', <nombre d'images>, <nombre d'images>)
# ------------------------------------------------------------------------------
set -euo pipefail
ID="${1:?id manquant}"; AR="${2:?format manquant (16:9, 2.39:1…)}"; shift 2
[ "$#" -ge 2 ] || { echo "au moins deux images"; exit 1; }
HOLD=3; FADE=0.8; W=1280; TW=240
H=$(awk -v ar="$AR" 'BEGIN{split(ar,a,":"); h=1280/(a[1]/a[2]); printf "%d", int(h/2)*2}')
TH=$(awk -v h="$H" 'BEGIN{printf "%d", int(h*240/1280/2)*2}')
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; OUT="$ROOT/assets"
mkdir -p "$OUT/video" "$OUT/posters" "$OUT/sprites"
N=$#
FIT="scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,setsar=1"

echo "▶ diaporama ($N images, ${HOLD}s chacune)"
ARGS=(); FILTER=""
for img in "$@" "$1"; do ARGS+=(-loop 1 -t "$(awk -v a=$HOLD -v b=$FADE 'BEGIN{print a+b}')" -i "$img"); done
for i in $(seq 0 "$N"); do FILTER+="[$i:v]$FIT,fps=25,format=yuv420p[v$i];"; done
PREV="v0"
for k in $(seq 1 "$N"); do
  FILTER+="[$PREV][v$k]xfade=transition=fade:duration=$FADE:offset=$((k * HOLD))[x$k];"; PREV="x$k"
done
TOTAL=$(awk -v n="$N" -v h=$HOLD -v f=$FADE 'BEGIN{print n*h+f}')
FILTER+="[$PREV]format=yuv420p[out]"
ffmpeg -hide_banner -loglevel error -y "${ARGS[@]}" -filter_complex "$FILTER" -map "[out]" -t "$TOTAL" \
  -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 1500k -bufsize 3600k -g 50 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -an -movflags +faststart \
  "$OUT/video/$ID.mp4"

echo "▶ affiche"
ffmpeg -hide_banner -loglevel error -y -i "$1" -vf "$FIT" -frames:v 1 -c:v libwebp -quality 82 "$OUT/posters/$ID.webp"

echo "▶ planche"
ARGS=(); FILTER=""; i=0
for img in "$@"; do ARGS+=(-i "$img"); FILTER+="[$i:v]scale=$TW:$TH:force_original_aspect_ratio=increase,crop=$TW:$TH,setsar=1[t$i];"; i=$((i+1)); done
for j in $(seq 0 $((N - 1))); do FILTER+="[t$j]"; done
FILTER+="hstack=inputs=$N[s]"
ffmpeg -hide_banner -loglevel error -y "${ARGS[@]}" -filter_complex "$FILTER" -map "[s]" -frames:v 1 -c:v libwebp -quality 75 "$OUT/sprites/$ID.webp"

echo "✔ $ID : media('$ID', $N, $N) dans works.js"

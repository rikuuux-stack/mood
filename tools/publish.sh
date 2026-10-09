#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# publish.sh — prépare, À L'INTÉRIEUR du dossier site, la version à mettre en ligne :
#
#   site/                      ← le seul dossier du projet (outils, docs, sources…)
#   site/_a-mettre-en-ligne/   ← uniquement ce que le public reçoit (régénéré à chaque fois)
#
# Ensuite : Cloudflare Pages ▸ ton projet ▸ Create deployment ▸ glisser _a-mettre-en-ligne.
# À relancer après chaque modification.   Usage : bash tools/publish.sh
# Le dossier site se déplace, se copie ou se zippe tel quel : aucun chemin absolu,
# aucune dépendance extérieure (three.js dans vendor/, polices dans assets/fonts/).
# ------------------------------------------------------------------------------
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="_a-mettre-en-ligne"
DIST="$ROOT/$OUT"
mkdir -p "$DIST"
rsync -a --delete \
  --exclude "/$OUT/" \
  --exclude '/tools/' --exclude '/docs/' --exclude '/README.md' \
  --exclude '.*' \
  --exclude 'assets/lightmaps/src/' --exclude 'assets/lightmaps/*.png' \
  --exclude 'assets/models/*.src.glb' \
  "$ROOT/" "$DIST/"
echo "✔ $OUT/  ($(du -sh "$DIST" | cut -f1), $(find "$DIST" -type f | wc -l | tr -d ' ') fichiers)"

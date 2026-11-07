#!/usr/bin/env bash
# Expiration à 180 jours, lancée chaque nuit par le workflow « Supabase » (job archive), après l'archive.
# Appelle la fonction « moderate » (action expiry-run) avec la clé service_role lue pour la nuit (SERVICE_KEY,
# masquée, jamais écrite). C'est la SEULE action que la fonction accepte avec cette clé.
#
#   - expiration désactivée (par défaut) : la fonction répond 403 « disabled » → rien n'est supprimé, l'étape réussit ;
#   - activée par l'auteur (docs/MODERATION.md) : 200 { done: N } → N dépôts ont perdu leur image, leurs mots restent ;
#   - toute autre réponse : l'étape échoue (et l'alerte e-mail du job part).
#
# Variables : SERVICE_KEY (obligatoire), PROJECT_REF (projet Supabase), EXPIRE_URL (facultatif, pour les tests).
set -euo pipefail
: "${SERVICE_KEY:?clé service_role absente}"
url="${EXPIRE_URL:-https://${PROJECT_REF:?projet absent}.supabase.co/functions/v1/moderate}"
out=$(mktemp)
code=$(curl -sS -o "$out" -w '%{http_code}' --max-time 120 -X POST "$url" \
  -H "Authorization: Bearer $SERVICE_KEY" -H 'Content-Type: application/json' \
  --data '{"action":"expiry-run"}') || code=000
body=$(cat "$out"); rm -f "$out"
if [ "$code" = 403 ] && grep -q '"disabled"' <<<"$body"; then
  echo "Expiration : désactivée (simulation), rien n'a été supprimé."
elif [ "$code" = 200 ]; then
  echo "Expiration : $(grep -o '"done":[0-9]*' <<<"$body" | cut -d: -f2) dépôt(s) expiré(s) cette nuit (images supprimées, mots gardés)."
else
  echo "::error::Expiration : réponse inattendue ($code) $body"
  exit 1
fi

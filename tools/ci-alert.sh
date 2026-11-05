#!/usr/bin/env bash
# Alerte e-mail quand une vérification GitHub Actions échoue (dernière étape de chaque job, « if: failure() »).
#
# Envoi par Resend (un simple appel HTTP), au destinataire déjà utilisé par les fonctions serveur :
# ADMIN_EMAIL dans supabase/functions/_shared/http.js (lu ici, jamais recopié).
# Clé : secret GitHub RESEND_API_KEY. SANS ce secret, ce script ne fait rien et ne fait JAMAIS échouer le job
# (le job est déjà en échec : l'alerte ne doit pas ajouter de bruit). Il sort toujours avec le code 0.
#
# Variables : RESEND_API_KEY, WORKFLOW, JOB, BRANCH, RUN_URL (posées par le workflow) ;
#             RESEND_URL (tests seulement : adresse de l'API, par défaut https://api.resend.com/emails).
set -u

if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "::notice::Alerte e-mail non envoyée : le secret GitHub RESEND_API_KEY n'est pas configuré."
  exit 0
fi

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TO="$(sed -n "s/^export const ADMIN_EMAIL = '\([^']*\)'.*/\1/p" "$HERE/supabase/functions/_shared/http.js")"
if [ -z "$TO" ]; then
  echo "::warning::Alerte e-mail non envoyée : destinataire (ADMIN_EMAIL) introuvable."
  exit 0
fi

WORKFLOW="${WORKFLOW:-?}"; JOB="${JOB:-?}"; BRANCH="${BRANCH:-?}"; RUN_URL="${RUN_URL:-?}"
SUBJECT="Mood — échec GitHub Actions : ${WORKFLOW} (${BRANCH})"
TEXT="Une vérification automatique de Mood a échoué.

Workflow : ${WORKFLOW}
Tâche : ${JOB}
Branche : ${BRANCH}
Détails : ${RUN_URL}"

BODY="$(jq -n --arg to "$TO" --arg subject "$SUBJECT" --arg text "$TEXT" \
  '{from: "Mood <onboarding@resend.dev>", to: [$to], subject: $subject, text: $text}')"

OUT="$(mktemp)"
CODE="$(curl -sS -o "$OUT" -w '%{http_code}' --max-time 20 -X POST "${RESEND_URL:-https://api.resend.com/emails}" \
  -H "Authorization: Bearer ${RESEND_API_KEY}" -H 'Content-Type: application/json' --data "$BODY")" || CODE="000"

if [ "$CODE" -ge 200 ] 2>/dev/null && [ "$CODE" -lt 300 ]; then
  echo "Alerte e-mail envoyée (HTTP ${CODE})."
else
  echo "::warning::Alerte e-mail NON envoyée : Resend a répondu HTTP ${CODE} — $(head -c 300 "$OUT")"
fi
rm -f "$OUT"
exit 0

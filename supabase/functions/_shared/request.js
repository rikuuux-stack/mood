/**
 * Lecture prudente d'une requête entrante. Module pur (aucune dépendance, aucun accès réseau) :
 * testé dans Node par tests/server.test.mjs.
 *
 * - clientIpFrom : l'adresse du visiteur. `cf-connecting-ip` est posée par Cloudflare (devant supabase.co)
 *   et remplace toute valeur envoyée par le client. Sans elle, repli sur `x-forwarded-for` : on prend le
 *   DERNIER élément, ajouté par le relais, pas le premier (un client peut écrire ce qu'il veut en tête
 *   de cet en-tête, et un relais ne fait qu'ajouter le sien à la fin).
 * - bodyTooLarge : refuser un corps trop gros AVANT de le lire. Sans ça, `req.formData()` charge tout en
 *   mémoire (50 Mo pour un dépôt de 5 Mo max : du temps de calcul gratuit gaspillé, et un moyen de
 *   saturer la fonction). Sans `content-length` (envoi par morceaux), on ne peut rien dire : false.
 */

export function clientIpFrom(cfConnectingIp, xForwardedFor) {
  const cf = (cfConnectingIp || '').trim();
  if (cf) return cf;
  const parts = (xForwardedFor || '').split(',').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export function bodyTooLarge(contentLength, max) {
  const n = Number(contentLength);
  return Number.isFinite(n) && n > max;
}

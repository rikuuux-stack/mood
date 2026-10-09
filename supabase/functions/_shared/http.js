/**
 * Outils communs aux fonctions serveur (Deno, Supabase Edge Functions).
 *
 * Secrets lus dans l'environnement (Supabase ▸ Edge Functions ▸ Secrets) — jamais dans le dépôt :
 *   TURNSTILE_SECRET           clé secrète Cloudflare Turnstile (obligatoire)
 *   RESEND_API_KEY             clé Resend pour l'alerte e-mail (facultative : sans elle, pas d'alerte)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   fournis automatiquement par Supabase
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

export const ADMIN_EMAIL = 'rikuuux@gmail.com';
export const SITE_URL = 'https://rikuuux-stack.github.io/riku-portfolio/';

// Origines autorisées à appeler les fonctions : le site, et un serveur local pour tester.
const ORIGINS = [/^https:\/\/rikuuux-stack\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export function cors(req) {
  const origin = req.headers.get('origin') || '';
  const ok = ORIGINS.some(r => r.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://rikuuux-stack.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export const json = (req, status, body) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

/** Réponse d'erreur : un code court que le site traduit (js/strings.js). */
export const fail = (req, status, code) => json(req, status, { error: code });

export const service = () =>
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/** Adresse IP du visiteur (jamais stockée telle quelle). */
export const clientIp = req =>
  (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();

/** Empreinte non réversible de l'IP, salée avec la clé de service (qui n'est jamais publique). */
export async function ipHash(req) {
  const data = new TextEncoder().encode(clientIp(req) + '|' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Vérifie le jeton Turnstile auprès de Cloudflare. */
export async function verifyCaptcha(req, token) {
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (!secret || !token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  const ip = clientIp(req);
  if (ip) body.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const out = await r.json();
    return out.success === true;
  } catch {
    return false;
  }
}

/** L'appelant est-il RIKU (connecté, et inscrit dans la table admins) ? Retourne l'id ou null. */
export async function adminId(req, db) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: row } = await db.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return row ? data.user.id : null;
}

/** Alerte e-mail (Resend). Silencieuse si la clé n'est pas configurée ; ne bloque jamais un dépôt. */
export async function notify(subject, text) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Mood <onboarding@resend.dev>', to: [ADMIN_EMAIL], subject, text }),
    });
  } catch { /* l'alerte est un confort, pas une condition */ }
}

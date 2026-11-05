/**
 * POST /functions/v1/report — signale un dépôt publié. JSON : { post_id, reason, captcha }.
 * Une personne ne compte qu'une fois par dépôt ; 3 signalements masquent le dépôt
 * (déclencheur dans la base) en attendant la décision de l'administrateur. Limite : 10 signalements par jour.
 * Quand le dépôt vient d'être masqué, l'administrateur reçoit une alerte e-mail (Resend, comme pour un nouveau
 * dépôt) : son fichier reste dans le bucket public jusqu'à sa décision, il ne doit pas l'apprendre des jours plus tard.
 */
import { cors, json, fail, service, ipHash, verifyCaptcha, notify, tooLarge, SITE_URL } from '../_shared/http.js';

const REASONS = ['rights', 'offensive', 'personal', 'spam', 'other'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 16 * 1024;                              // un identifiant, une raison, un jeton captcha : largement assez

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fail(req, 405, 'method');
  if (tooLarge(req, MAX_BODY)) return fail(req, 413, 'bad');
  let body;
  try { body = await req.json(); } catch { return fail(req, 400, 'bad'); }
  const { post_id, reason, captcha } = body || {};
  if (!UUID.test(post_id || '') || !REASONS.includes(reason)) return fail(req, 400, 'bad');
  if (!(await verifyCaptcha(req, captcha))) return fail(req, 403, 'captcha');

  const db = service();
  const hash = await ipHash(req);
  const { count } = await db.from('reports').select('id', { count: 'exact', head: true })
    .eq('ip_hash', hash).gte('created_at', new Date(Date.now() - 24 * 3600e3).toISOString());
  if ((count ?? 0) >= 10) return fail(req, 429, 'rate');

  const { data: post } = await db.from('posts').select('id').eq('id', post_id).eq('status', 'approved').maybeSingle();
  if (!post) return fail(req, 404, 'gone');
  const { error } = await db.from('reports').insert({ post_id, reason, ip_hash: hash });
  if (error && error.code !== '23505') { console.error('[report] enregistrement impossible :', error.code, error.message); return fail(req, 500, 'db'); }   // 23505 : déjà signalé par cette personne

  // ce signalement vient-il de masquer le dépôt ? (le déclencheur a changé le statut) → alerte
  if (!error) {
    const { data: after } = await db.from('posts').select('status, report_count').eq('id', post_id).maybeSingle();
    if (after?.status === 'hidden') {
      await notify('Mood — dépôt masqué après 3 signalements',
        `Un dépôt publié vient d'être masqué (${after.report_count} signalements, dernier motif : ${reason}).\n` +
        `Il n'apparaît plus sur le mur, mais son fichier (s'il en a un) reste accessible par son adresse tant que tu n'as pas décidé : ` +
        `Restore ou Delete dans l'onglet Reported.\n\n${SITE_URL}admin/`);
    }
  }
  return json(req, 201, { ok: true });
});

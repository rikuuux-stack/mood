/**
 * /functions/v1/moderate — modération, réservée à l'administrateur (compte connecté inscrit dans « admins »).
 *
 *   GET                                  → { pending, hidden, published, storage } (fichiers en attente : liens signés 1 h ;
 *                                          storage = place occupée, plafond 900 Mo, avertissement dès 700 Mo)
 *   POST { action: 'approve', id }       → fichiers déplacés du bucket privé vers le public, dépôt visible
 *   POST { action: 'reject',  id }       → dépôt en attente supprimé (fichiers + ligne)
 *   POST { action: 'remove',  id }       → dépôt publié ou masqué supprimé (demande de retrait, etc.)
 *   POST { action: 'restore', id }       → dépôt masqué par signalements remis en ligne (signalements effacés)
 *   POST { action: 'resize', id, size }  → taille d'affichage changée (s / m / l), quel que soit le statut
 *   POST { action: 'prompt', text }      → consigne du mois (texte anglais, 60 caractères au plus ; vide = aucune)
 *   GET ?health                          → PUBLIC, sans données : les fonctions ont-elles accès à la base ?
 *                                          (utilisé par tests/e2e.mjs pour détecter un problème de droits)
 */
import { cors, json, fail, service, caller, CACHE } from '../_shared/http.js';

const COLS = 'id, kind, text, name, image_path, thumb_path, width, height, size, duration, is_author, status, report_count, created_at, approved_at, prompt';
const SIZES = ['s', 'm', 'l'];
const MB = 1024 * 1024, STORAGE = { cap: 900 * MB, warn: 700 * MB };    // offre gratuite : 1 Go (même plafond que submit)

async function withUrls(db, rows, bucket) {
  const paths = rows.flatMap(r => (r.image_path ? [r.image_path, r.thumb_path] : []));
  const signed = {};
  if (bucket === 'pending' && paths.length) {
    const { data } = await db.storage.from('pending').createSignedUrls(paths, 3600);
    for (const s of data || []) signed[s.path] = s.signedUrl;
  }
  const pub = p => db.storage.from('published').getPublicUrl(p).data.publicUrl;
  return rows.map(r => ({
    ...r,
    image_url: r.image_path ? (bucket === 'pending' ? signed[r.image_path] : pub(r.image_path)) : null,
    thumb_url: r.thumb_path ? (bucket === 'pending' ? signed[r.thumb_path] : pub(r.thumb_path)) : null,
  }));
}

async function moveFiles(db, row, from, to) {
  for (const p of [row.image_path, row.thumb_path]) {
    const { data, error } = await db.storage.from(from).download(p);
    if (error) throw error;
    const up = await db.storage.from(to).upload(p, data, { contentType: data.type, upsert: true, cacheControl: CACHE });
    if (up.error) throw up.error;
  }
  await db.storage.from(from).remove([row.image_path, row.thumb_path]);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const db = service();
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    const checks = await Promise.all(['posts', 'reports', 'admins'].map(async t => {
      const { error } = await db.from(t).select('*', { count: 'exact', head: true });
      if (error) console.error(`[health] « ${t} » illisible :`, error.code, error.message);
      return [t, !error];
    }));
    const tables = Object.fromEntries(checks);
    const ok = Object.values(tables).every(Boolean);
    return json(req, ok ? 200 : 500, { ok, tables });
  }
  const who = await caller(req, db);
  if (who.status === 'none' || who.status === 'auth') return fail(req, 401, 'auth');   // se (re)connecter
  if (who.status === 'notAdmin') return fail(req, 403, 'admin');                      // connecté, pas admin
  if (who.status !== 'admin') return fail(req, 500, 'server');                         // panne : voir les journaux

  if (req.method === 'GET') {
    const q = s => db.from('posts').select(COLS).eq('status', s);
    const [p, h, a] = await Promise.all([
      q('pending').order('created_at', { ascending: true }),
      q('hidden').order('created_at', { ascending: false }),
      q('approved').order('approved_at', { ascending: false }).limit(300),
    ]);
    const pr = await db.from('prompt').select('text').eq('id', 1).maybeSingle();
    const used = await db.rpc('storage_used');
    if (used.error) console.error('[moderate] stockage utilisé illisible :', used.error.message);
    return json(req, 200, {
      prompt: pr.data?.text || '',
      storage: { used: Number(used.data) || 0, ...STORAGE },
      pending: await withUrls(db, p.data || [], 'pending'),
      hidden: await withUrls(db, h.data || [], 'published'),
      published: await withUrls(db, a.data || [], 'published'),
    });
  }
  if (req.method !== 'POST') return fail(req, 405, 'method');

  let body;
  try { body = await req.json(); } catch { return fail(req, 400, 'bad'); }
  const { action, id, size } = body || {};
  if (action === 'prompt') {                               // consigne du mois : pas de dépôt concerné
    const text = String(body.text ?? '').trim();
    if ([...text].length > 60) return fail(req, 400, 'tooLong');
    const { error } = await db.from('prompt').upsert({ id: 1, text, updated_at: new Date().toISOString() });
    if (error) { console.error('[moderate] consigne impossible :', error.code, error.message); return fail(req, 500, 'db'); }
    return json(req, 200, { ok: true, prompt: text });
  }
  const { data: row } = await db.from('posts').select(COLS).eq('id', id || '').maybeSingle();
  if (!row) return fail(req, 404, 'gone');

  try {
    if (action === 'approve' && row.status === 'pending') {
      if (row.image_path) await moveFiles(db, row, 'pending', 'published');
      await db.from('posts').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id);
    } else if (action === 'reject' && row.status === 'pending') {
      if (row.image_path) await db.storage.from('pending').remove([row.image_path, row.thumb_path]);
      await db.from('posts').delete().eq('id', id);
    } else if (action === 'remove' && row.status !== 'pending') {
      if (row.image_path) await db.storage.from('published').remove([row.image_path, row.thumb_path]);
      await db.from('posts').delete().eq('id', id);
    } else if (action === 'resize' && SIZES.includes(size)) {
      const { error } = await db.from('posts').update({ size }).eq('id', id);
      if (error) throw error;
    } else if (action === 'restore' && row.status === 'hidden') {
      await db.from('reports').delete().eq('post_id', id);
      await db.from('posts').update({ status: 'approved', report_count: 0 }).eq('id', id);
    } else {
      return fail(req, 400, 'action');
    }
  } catch (e) {
    console.error(`[moderate] action « ${action} » impossible :`, e?.message || e);
    return fail(req, 500, 'storage');
  }
  return json(req, 200, { ok: true });
});

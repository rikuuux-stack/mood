/**
 * Fonction « moderate » (supabase/functions/moderate) exécutée dans Node avec une base et un stockage
 * FACTICES en mémoire : on vérifie l'enchaînement des étapes et surtout ce qui se passe en cas de panne.
 *
 *   node tests/moderate.test.mjs
 *
 * Pourquoi : chaque action écrit dans le stockage puis dans la base. Une erreur avalée ferait dire « Done »
 * à /admin/ alors que rien (ou la moitié) n'a été fait — et un Approve interrompu après le déplacement des
 * fichiers laissait un dépôt impossible à valider. Ici : toute panne → 500, et un second essai termine.
 * Aucun réseau, aucune donnée réelle (contenus inventés, pas d'image).
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

/* ------------------------------------------------------------------ base et stockage factices */
const state = { posts: new Map(), reports: [], admins: new Set(['u1']), buckets: { pending: new Map(), published: new Map() }, failNext: null, expiry: { id: 1, enabled: false, days: 180 } };
const failing = step => { if (state.failNext === step) { state.failNext = null; return { message: `panne ${step}` }; } return null; };

function table(name) {
  const rows = () => (name === 'posts' ? [...state.posts.values()] : name === 'reports' ? state.reports : name === 'admins' ? [...state.admins].map(user_id => ({ user_id })) : name === 'expiry_settings' ? [state.expiry] : []);
  const q = { filters: [], op: 'select' };
  const match = r => q.filters.every(([k, v]) => r[k] === v);
  const run = () => {
    if (q.op === 'select') return { data: rows().filter(match), error: null };
    const err = failing('db');                             // la panne simulée frappe une ÉCRITURE
    if (err) return { data: null, error: err };
    if (q.op === 'update') { for (const r of rows().filter(match)) Object.assign(r, q.patch); return { data: null, error: null }; }
    if (q.op === 'delete') {
      if (name === 'posts') for (const r of rows().filter(match)) state.posts.delete(r.id);
      if (name === 'reports') state.reports = state.reports.filter(r => !match(r));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  const b = {
    select() { return b; }, eq(k, v) { q.filters.push([k, v]); return b; },
    update(p) { q.op = 'update'; q.patch = p; return b; }, delete() { q.op = 'delete'; return b; },
    order() { return b; }, limit() { return b; },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
function bucket(name) {
  const files = state.buckets[name];
  return {
    download: async p => { const err = failing('storage'); if (err) return { data: null, error: err }; return files.has(p) ? { data: new Blob([files.get(p)], { type: 'image/webp' }), error: null } : { data: null, error: { message: 'Object not found' } }; },
    upload: async (p, data) => { const err = failing('storage'); if (err) return { error: err }; files.set(p, data instanceof Blob ? await data.text() : String(data)); return { data: { path: p }, error: null }; },
    remove: async paths => { const err = failing('storage'); if (err) return { data: null, error: err }; paths.forEach(p => files.delete(p)); return { data: [], error: null }; },
    list: async (_dir, { search }) => ({ data: [...files.keys()].filter(k => k.includes(search)).map(name => ({ name })), error: null }),
    createSignedUrls: async paths => ({ data: paths.map(path => ({ path, signedUrl: `signed:${path}` })) }),
    getPublicUrl: p => ({ data: { publicUrl: `public:${p}` } }),
  };
}
// expiry_candidates : dépôts publiés, avec fichiers, validés depuis plus de `days` jours (comme la fonction SQL)
const rpc = async (fn, args) => fn === 'expiry_candidates'
  ? { data: [...state.posts.values()].filter(p => p.status === 'approved' && p.image_path && !p.expired_at && p.approved_at && Date.parse(p.approved_at) < Date.now() - args.days * 864e5).map(p => ({ id: p.id, kind: p.kind, bytes: 3 })), error: null }
  : { data: 0, error: null };
const fakeClient = () => ({ from: table, storage: { from: bucket }, rpc, auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } });

// le module « jsr:@supabase/supabase-js@2 » est remplacé par le client factice (chargeur Node)
const loader = `
  export function resolve(spec, ctx, next) { return spec.startsWith('jsr:') ? { url: 'fake:supabase', shortCircuit: true } : next(spec, ctx); }
  export function load(url, ctx, next) {
    if (url !== 'fake:supabase') return next(url, ctx);
    return { format: 'module', shortCircuit: true, source: 'export const createClient = globalThis.__fakeClient;' };
  }`;
register(`data:text/javascript,${encodeURIComponent(loader)}`, pathToFileURL('./'));
globalThis.__fakeClient = fakeClient;
let handler = null;
globalThis.Deno = { serve: fn => { handler = fn; }, env: { get: () => 'x' } };
await import('../supabase/functions/moderate/index.js');

/* ------------------------------------------------------------------ outils */
const jwt = 'x.' + Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url') + '.x';
const call = async body => {
  const r = await handler(new Request('https://x/moderate', { method: 'POST', headers: { authorization: `Bearer ${jwt}`, origin: 'https://moodwall.pages.dev' }, body: JSON.stringify(body) }));
  return { status: r.status, ...(await r.json()) };
};
let fail = 0, n = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want); n++;
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${label}${ok ? '' : ` → ${JSON.stringify(got)} (attendu ${JSON.stringify(want)})`}`);
};
const post = (id, status, withFiles = true) => {
  state.posts.set(id, { id, kind: withFiles ? 'image' : 'text', text: 'trace', name: '', status, report_count: status === 'hidden' ? 3 : 0, size: 'm',
    image_path: withFiles ? `${id}.webp` : null, thumb_path: withFiles ? `${id}-thumb.webp` : null, created_at: '2026-10-01T00:00:00Z' });
  if (withFiles) { const b = status === 'pending' ? 'pending' : 'published'; state.buckets[b].set(`${id}.webp`, 'IMG'); state.buckets[b].set(`${id}-thumb.webp`, 'THUMB'); }
};
const where = p => Object.entries(state.buckets).filter(([, f]) => f.has(p)).map(([b]) => b);
const silence = () => { const e = console.error; console.error = () => {}; return () => { console.error = e; }; };

/* ------------------------------------------------------------------ approve : cas normal */
post('a', 'pending');
check('approve : fichiers déplacés, ligne validée', [await call({ action: 'approve', id: 'a' }), where('a.webp'), where('a-thumb.webp'), state.posts.get('a').status],
  [{ status: 200, ok: true }, ['published'], ['published'], 'approved']);

/* ------------------------------------------------------------------ approve : panne de stockage → rien ne bouge, 500 */
post('b', 'pending');
{ const back = silence(); state.failNext = 'storage';
  check('approve : panne du stockage → 500 « storage », ligne toujours en attente, fichiers toujours privés',
    [await call({ action: 'approve', id: 'b' }), state.posts.get('b').status, where('b.webp')], [{ status: 500, error: 'storage' }, 'pending', ['pending']]);
  back(); }
check('approve : second essai réussit', [await call({ action: 'approve', id: 'b' }), state.posts.get('b').status, where('b.webp')], [{ status: 200, ok: true }, 'approved', ['published']]);

/* ------------------------------------------------------------------ approve : panne de la base APRÈS les fichiers → 500, puis reprise */
post('c', 'pending');
{ const back = silence(); state.failNext = 'db';
  check('approve : panne de la base après le déplacement → 500 « db » (pas « Done »)',
    [await call({ action: 'approve', id: 'c' }), state.posts.get('c').status, where('c.webp')], [{ status: 500, error: 'db' }, 'pending', ['published']]);
  back(); }
check('approve : reprise — fichiers déjà publiés acceptés, ligne validée', [await call({ action: 'approve', id: 'c' }), state.posts.get('c').status, where('c.webp'), where('c-thumb.webp')],
  [{ status: 200, ok: true }, 'approved', ['published'], ['published']]);

/* ------------------------------------------------------------------ remove : demande de retrait */
post('d', 'approved');
{ const back = silence(); state.failNext = 'storage';
  check('remove : fichier impossible à supprimer → 500, la ligne reste (le fichier n’est pas oublié)',
    [await call({ action: 'remove', id: 'd' }), state.posts.has('d'), where('d.webp')], [{ status: 500, error: 'storage' }, true, ['published']]);
  back(); }
check('remove : second essai — fichier et ligne supprimés', [await call({ action: 'remove', id: 'd' }), state.posts.has('d'), where('d.webp')], [{ status: 200, ok: true }, false, []]);

/* ------------------------------------------------------------------ reject, restore, resize, texte seul */
post('e', 'pending');
{ const back = silence(); state.failNext = 'db';
  check('reject : panne de la base → 500 « db »', (await call({ action: 'reject', id: 'e' })).error, 'db'); back(); }
check('reject : second essai — ligne supprimée, bucket privé vidé', [(await call({ action: 'reject', id: 'e' })).status, state.posts.has('e'), where('e.webp')], [200, false, []]);
post('f', 'hidden'); state.reports.push({ post_id: 'f' }, { post_id: 'f' }, { post_id: 'f' });
check('restore : signalements effacés, dépôt revenu', [(await call({ action: 'restore', id: 'f' })).status, state.posts.get('f').status, state.posts.get('f').report_count, state.reports.length], [200, 'approved', 0, 0]);
post('g', 'approved', false);
check('texte seul : remove sans fichier', [(await call({ action: 'remove', id: 'g' })).status, state.posts.has('g')], [200, false]);
check('resize : taille inconnue refusée', (await call({ action: 'resize', id: 'f', size: 'xl' })).error, 'action');
check('dépôt inconnu : 404 « gone »', (await call({ action: 'approve', id: 'zzz' })).error, 'gone');

/* ------------------------------------------------------------------ expiration (option A : l'image s'en va, les mots restent) */
post('x', 'approved'); Object.assign(state.posts.get('x'), { text: 'les mots restent', name: 'pseudo', approved_at: new Date(Date.now() - 200 * 864e5).toISOString() });
post('y', 'approved'); Object.assign(state.posts.get('y'), { approved_at: new Date(Date.now() - 20 * 864e5).toISOString() });
check('expiration désactivée (par défaut) : 403 « disabled », rien n’est supprimé', [(await call({ action: 'expiry-run' })).error, where('x.webp')], ['disabled', ['published']]);
state.expiry.enabled = true;
{ const back = silence(); const log = console.log; console.log = () => {};
  const out = await call({ action: 'expiry-run' }); console.log = log; back();
  const x = state.posts.get('x');
  check('expiration : l’image et l’image fixe sont supprimées, les MOTS restent, le pseudo est retiré, le dépôt récent est intact',
    [out.done, where('x.webp'), where('x-thumb.webp'), x.image_path, x.text, x.name, !!x.expired_at, where('y.webp')],
    [1, [], [], null, 'les mots restent', '', true, ['published']]); }
state.expiry.enabled = false;

/* ------------------------------------------------------------------ tâche de nuit : la clé service_role, pour expiry-run SEULEMENT */
// ici Deno.env.get() renvoie « x » pour tout : la « clé service_role » factice vaut donc « x »
const nightly = async (body, key = 'x') => {
  const r = await handler(new Request('https://x/moderate', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(body) }));
  return { status: r.status, ...(await r.json()) };
};
post('z', 'approved'); Object.assign(state.posts.get('z'), { text: 'encore des mots', approved_at: new Date(Date.now() - 300 * 864e5).toISOString() });
check('nuit, expiration désactivée : 403 « disabled », rien n’est supprimé', [await nightly({ action: 'expiry-run' }), where('z.webp')], [{ status: 403, error: 'disabled' }, ['published']]);
check('nuit : toute autre action est refusée avec cette clé', [(await nightly({ action: 'remove', id: 'z' })).status, state.posts.has('z')], [403, true]);
{ const back = silence(); check('nuit : une autre clé ne passe pas (traitée comme une session invalide)', (await nightly({ action: 'expiry-run' }, 'y')).status, 401); back(); }
state.expiry.enabled = true;
{ const log = console.log; console.log = () => {};
  const out = await nightly({ action: 'expiry-run' }); console.log = log;
  check('nuit, expiration activée : l’image s’en va, les mots restent', [out.status, out.done, where('z.webp'), state.posts.get('z').text], [200, 1, [], 'encore des mots']); }
state.expiry.enabled = false;

console.log(`\n${n - fail} / ${n} tests passés.`);
process.exit(fail ? 1 : 0);

// Tests de bout en bout CONTRE LE VRAI SUPABASE, avec la seule clé publique (« anon ») :
// on vérifie ce qu'un visiteur — ou un malveillant — peut et ne peut pas faire.
// Lancés par GitHub Actions (.github/workflows/supabase.yml) ; en local : node tests/e2e.mjs
// Aucun de ces tests n'enregistre de dépôt : tous les envois sont refusés avant l'enregistrement.
import { readFileSync } from 'fs';

const cfg = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const URL_ = cfg.match(/supabaseUrl: '([^']+)'/)[1];
const KEY = cfg.match(/supabaseAnonKey: '([^']+)'/)[1];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const ORIGIN = 'https://moodwall.pages.dev';
const fx = n => new Blob([readFileSync(new URL(`./fixtures-img/${n}`, import.meta.url))], { type: n.endsWith('.webp') ? 'image/webp' : n.endsWith('.png') ? 'image/png' : 'image/jpeg' });

let failed = 0;
async function t(label, fn) {
  try { const r = await fn(); if (r !== true) throw new Error(r); console.log(`OK     ${label}`); }
  catch (e) { failed++; console.log(`ÉCHEC  ${label} — ${e.message}`); }
}
const status = (r, ...ok) => ok.includes(r.status) || `HTTP ${r.status} : ${r.bodyText?.slice(0, 160)}`;
async function req(path, init = {}) {
  const r = await fetch(URL_ + path, { ...init, headers: { ...H, Origin: ORIGIN, ...(init.headers || {}) } });
  r.bodyText = await r.text();
  try { r.body_ = JSON.parse(r.bodyText); } catch { r.body_ = null; }
  return r;
}
function submitForm(fields = {}, files = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ text: '', name: '', lang: 'fr', consent: '1', captcha: '', ...fields })) f.append(k, v);
  for (const [k, v] of Object.entries(files)) f.append(k, v, `${k}.bin`);
  return req('/functions/v1/submit', { method: 'POST', body: f });
}
const code = (r, c) => (r.body_?.error === c) || `réponse ${r.status} ${r.bodyText.slice(0, 160)} (attendu « ${c} »)`;

console.log(`Projet : ${URL_}\n`);

// --- lecture publique : uniquement la vue des dépôts validés
await t('le mur public (vue « wall ») est lisible', async () => {
  const r = await req('/rest/v1/wall?select=id,kind,text&limit=5');
  return r.status === 200 && Array.isArray(r.body_) ? true : status(r, 200);
});
for (const table of ['posts', 'reports', 'admins']) {
  await t(`la table « ${table} » est fermée au public`, async () => {
    const r = await req(`/rest/v1/${table}?select=*&limit=1`);
    // refusé (401/403/404), ou au pire aucune ligne visible
    return r.status !== 200 || (Array.isArray(r.body_) && r.body_.length === 0) || `lisible : ${r.bodyText.slice(0, 120)}`;
  });
}
await t('impossible d’écrire directement dans « posts »', async () => {
  const r = await req('/rest/v1/posts', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ kind: 'text', text: 'intrus', status: 'approved' }) });
  return r.status >= 400 || `écriture acceptée (${r.status})`;
});
await t('la vue « wall » donne la taille d’affichage (s / m / l)', async () => {
  const r = await req('/rest/v1/wall?select=id,size&limit=5');
  return (r.status === 200 && (r.body_ || []).every(p => ['s', 'm', 'l'].includes(p.size))) || `HTTP ${r.status} ${r.bodyText.slice(0, 120)}`;
});
await t('la consigne du mois est lisible publiquement (vue current_prompt)', async () => {
  const r = await req('/rest/v1/current_prompt?select=text');
  return (r.status === 200 && Array.isArray(r.body_) && r.body_.length <= 1) || `HTTP ${r.status} ${r.bodyText.slice(0, 120)}`;
});
await t('la table « prompt » est fermée au public (lecture et écriture)', async () => {
  const a = await req('/rest/v1/prompt?select=*');
  const b = await req('/rest/v1/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1, text: 'pirate' }) });
  return (a.status >= 400 && b.status >= 400) || `lecture ${a.status}, écriture ${b.status}`;
});
await t('la vue « wall » donne la consigne de chaque dépôt (strates)', async () => {
  const r = await req('/rest/v1/wall?select=id,prompt&limit=5');
  return r.status === 200 || `HTTP ${r.status} ${r.bodyText.slice(0, 120)}`;
});
await t('la vue « wall » ne montre aucune donnée privée', async () => {
  const r = await req('/rest/v1/wall?select=ip_hash,status,report_count&limit=1');
  return r.status >= 400 || 'colonnes privées accessibles';
});

// --- les fonctions serveur, elles, ont bien accès à la base (sinon : aucun dépôt ni connexion admin possible)
await t('les fonctions serveur peuvent lire posts / reports / admins', async () => {
  const r = await req('/functions/v1/moderate?health');
  return (r.status === 200 && r.body_?.ok === true) || `HTTP ${r.status} ${r.bodyText.slice(0, 160)}`;
});

// --- fichiers : le bucket des dépôts en attente est privé
await t('le bucket « pending » ne se liste pas', async () => {
  const r = await req('/storage/v1/object/list/pending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 10 }) });
  return r.status >= 400 || (Array.isArray(r.body_) && r.body_.length === 0) || `liste visible : ${r.bodyText.slice(0, 120)}`;
});
for (const bucket of ['pending', 'published']) {
  await t(`impossible de déposer un fichier dans « ${bucket} » sans passer par le serveur`, async () => {
    const r = await req(`/storage/v1/object/${bucket}/intrus.webp`, { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: fx('lossy.webp') });
    return r.status >= 400 || `envoi accepté (${r.status})`;
  });
}

// --- images publiées : en-têtes CORS (sinon « Keep » ne pourrait pas les dessiner dans un canvas,
//     et le mur, qui les charge avec crossOrigin, ne les afficherait pas)
await t('images publiées servies avec CORS (Access-Control-Allow-Origin), pour le canvas de « Keep »', async () => {
  const w = await req('/rest/v1/wall?select=thumb_path&thumb_path=not.is.null&limit=1');
  const path = w.body_?.[0]?.thumb_path || 'absent-cors-check.jpg';   // mur sans image : l'en-tête est aussi sur une réponse 404
  const r = await fetch(`${URL_}/storage/v1/object/public/published/${encodeURIComponent(path)}`, { headers: { Origin: ORIGIN } });
  const got = r.headers.get('access-control-allow-origin');
  return (got === '*' || got === ORIGIN) || `HTTP ${r.status}, allow-origin = ${got} (${w.body_?.[0] ? 'image réelle' : 'aucune image sur le mur'})`;
});

// --- fonction submit : refus avant tout enregistrement
const preflight = origin => fetch(`${URL_}/functions/v1/submit`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })
  .then(r => r.headers.get('access-control-allow-origin'));
await t(`CORS : ${ORIGIN} est autorisé à appeler les fonctions`, async () => {
  const got = await preflight(ORIGIN);
  return got === ORIGIN || `allow-origin = ${got}`;
});
for (const other of ['https://rikuuux-stack.github.io', 'https://moodwall.pages.dev.evil.example']) {
  await t(`CORS : ${other} n’est pas autorisé`, async () => {
    const got = await preflight(other);
    return got !== other || `allow-origin = ${got}`;
  });
}
await t('dépôt sans case « droits » refusé', async () => code(await submitForm({ text: 'test', consent: '0' }), 'rights'));
await t('dépôt vide refusé', async () => code(await submitForm({}), 'empty'));
await t('taille d’affichage inconnue refusée (s / m / l seulement)', async () => code(await submitForm({ text: 'test', size: 'xl' }), 'display'));
await t('pseudo avec lien refusé', async () => code(await submitForm({ text: 'test', name: 'www.spam.com' }), 'name'));
await t('texte au-delà de 500 caractères refusé', async () => code(await submitForm({ text: 'x'.repeat(501) }), 'tooLong'));
await t('image > 5 Mo refusée', async () => {
  const big = new Uint8Array(5 * 1024 * 1024 + 10); big.set([0xff, 0xd8, 0xff]);
  return code(await submitForm({}, { image: new Blob([big], { type: 'image/jpeg' }), thumb: fx('lossy.webp') }), 'tooBig');
});
await t('GIF refusé (format lu dans le fichier)', async () =>
  code(await submitForm({}, { image: new Blob([new TextEncoder().encode('GIF89a' + '\0'.repeat(64))], { type: 'image/jpeg' }), thumb: fx('lossy.webp') }), 'type'));
await t('photo avec EXIF / GPS refusée', async () => code(await submitForm({}, { image: fx('exif.jpg'), thumb: fx('lossy.webp') }), 'meta'));
await t('image de plus de 2000 px refusée', async () => code(await submitForm({}, { image: fx('toowide.png'), thumb: fx('lossy.webp') }), 'size'));
await t('pixels contre mots : 200 caractères avec une image 1500 × 2000 refusés (max 125)', async () =>
  code(await submitForm({ text: 'm'.repeat(200) }, { image: fx('tall.webp'), thumb: fx('lossy.webp') }), 'tooLong'));
await t('dépôt valide SANS captcha refusé', async () => code(await submitForm({ text: 'bonjour' }), 'captcha'));
await t('dépôt valide avec un FAUX captcha refusé', async () => code(await submitForm({ text: 'bonjour', captcha: 'faux-jeton' }), 'captcha'));
await t('image valide avec un faux captcha refusée', async () =>
  code(await submitForm({ text: 'court' }, { image: fx('tall.webp'), thumb: fx('lossy.webp'), }), 'captcha'));

// --- signalement et modération
await t('signalement sans captcha refusé', async () => code(await req('/functions/v1/report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ post_id: '00000000-0000-4000-8000-000000000000', reason: 'spam', captcha: '' }) }), 'captcha'));
await t('modération refusée sans être connecté (401 « auth »)', async () => code(await req('/functions/v1/moderate'), 'auth'));

console.log(failed ? `\n${failed} test(s) en échec.` : '\nTous les tests passent.');
process.exit(failed ? 1 : 0);

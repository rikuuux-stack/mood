/**
 * Photos DÉJÀ déposées → converties en NÉGATIF sur le serveur (fix-original). PRÉPARÉ, À NE LANCER QUE SUR DÉCISION
 * DE L'AUTEUR (irréversible : les fichiers en couleur sont supprimés après conversion).
 *
 *   Essai à blanc (par défaut) : lit, convertit en mémoire, vérifie, compte ; n'écrit RIEN.
 *       SERVICE_KEY=… node tools/negate-existing.mjs
 *   Pour de bon :
 *       SERVICE_KEY=… node tools/negate-existing.mjs --apply
 *   (GitHub ▸ Actions ▸ Supabase ▸ Run workflow ▸ task = negate-dry, puis negate ; la clé service_role est lue
 *    pour l'occasion avec le secret SUPABASE_ACCESS_TOKEN, jamais écrite.)
 *
 * Pour chaque dépôt qui a encore un fichier d'origine (photo + miniature ; pour une vidéo : son image fixe, la vidéo
 * étant déjà en négatif), dans son bucket (« pending » s'il attend la validation, sinon « published ») :
 *   1. téléchargement ; 2. négatif calculé par le MÊME code que le site (js/image.js : toNegative, dans Chromium),
 *   JPEG sans métadonnées, mêmes dimensions ; 3. vérification par le MÊME contrôle que le serveur
 *   (_shared/negative.js) ; 4. envoi sous un NOUVEAU nom « .neg.jpg » (les anciens noms sont gardés un an en cache) ;
 *   5. la ligne du dépôt pointe vers les nouveaux fichiers ; 6. seulement alors, les fichiers d'origine sont supprimés.
 * Une étape qui échoue arrête ce dépôt sans rien casser (on peut relancer : ce qui est déjà « .neg. » est sauté).
 * Ne touche ni aux textes, ni aux dates, ni à l'archive de nuit (captures du mur déjà en négatif).
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { negativeError } from '../supabase/functions/_shared/negative.js';
import { hasMetadata, dimensions } from '../supabase/functions/_shared/image.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
const SUPABASE = process.env.SUPABASE_URL || cfg.match(/supabaseUrl: '([^']+)'/)[1];
const SERVICE = process.env.SERVICE_KEY || '';
const APPLY = process.argv.includes('--apply');
const isNeg = p => /\.neg\.(jpg|jpeg)$/.test(p || '');
const CACHE = '31536000';                                  // comme les fichiers publiés (noms uniques)
if (!SERVICE) { console.error('SERVICE_KEY manquante'); process.exit(2); }
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const req = createRequire(import.meta.url);
let playwright;
try { playwright = req('playwright'); } catch { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }

async function api(url, init = {}) {
  const r = await fetch(`${SUPABASE}${url}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${url.split('?')[0]} : HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r;
}

/* ------------------------------------------------------------------ le code du site, servi en local à Chromium */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  if (p === '/') { rs.writeHead(200, { 'Content-Type': 'text/html' }); return rs.end('<!doctype html><title>negate</title>'); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(path.join(ROOT, 'js')) || !fs.existsSync(f)) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);

/** Fichier d'origine → négatif JPEG sans métadonnées (code du site), mêmes dimensions. */
async function toNegativeJpeg(bytes) {
  const b64 = await page.evaluate(async b64in => {
    const { toNegative, stripMetadata } = await import('/js/image.js');
    const raw = Uint8Array.from(atob(b64in), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([raw]));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    toNegative(g, c.width, c.height);
    let out = null;
    for (const q of [0.88, 0.77, 0.64]) { out = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (out.size <= 5 * 1024 * 1024) break; }
    out = await stripMetadata(out);
    const u = new Uint8Array(await out.arrayBuffer()); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  }, Buffer.from(bytes).toString('base64'));
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/* ------------------------------------------------------------------ les dépôts concernés */
const posts = await (await api('/rest/v1/posts?select=id,kind,status,image_path,thumb_path,expired_at&image_path=not.is.null&order=created_at.asc')).json();
const todo = posts.filter(p => !p.expired_at && (p.kind === 'video' ? !isNeg(p.thumb_path) : (!isNeg(p.image_path) || !isNeg(p.thumb_path))));
console.log(`${APPLY ? 'CONVERSION' : 'ESSAI À BLANC (rien n’est écrit)'} : ${posts.length} dépôt(s) avec fichiers, ${todo.length} à convertir`);

const stats = { posts: 0, files: 0, before: 0, after: 0, failed: 0 };
const removed = [];                                        // [bucket, ancien chemin] : vérifiés absents à la fin
for (const p of todo) {
  const bucket = p.status === 'pending' ? 'pending' : 'published';
  const short = p.id.slice(0, 8);
  // fichiers à convertir : [ancien chemin, nouveau chemin, colonne]
  const jobs = [];
  if (p.kind !== 'video' && !isNeg(p.image_path)) jobs.push([p.image_path, `${p.id}.neg.jpg`, 'image_path']);
  if (!isNeg(p.thumb_path)) jobs.push([p.thumb_path, `${p.id}-${p.kind === 'video' ? 'poster' : 'thumb'}.neg.jpg`, 'thumb_path']);
  try {
    const done = [];
    for (const [from, to, col] of jobs) {
      const orig = new Uint8Array(await (await api(`/storage/v1/object/${bucket}/${encodeURIComponent(from)}`)).arrayBuffer());
      const neg = await toNegativeJpeg(orig);
      const a = dimensions(orig), b = dimensions(neg), err = negativeError(neg);
      if (err) throw new Error(`négatif refusé par le contrôle du serveur (${err})`);
      if (hasMetadata(neg)) throw new Error('métadonnées dans le négatif');
      if (!a || !b || a.width !== b.width || a.height !== b.height) throw new Error('dimensions changées');
      stats.before += orig.length; stats.after += neg.length; stats.files++;
      done.push({ from, to, col, neg });
    }
    if (APPLY) {
      for (const d of done) await api(`/storage/v1/object/${bucket}/${encodeURIComponent(d.to)}`, {
        method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': `max-age=${CACHE}` }, body: d.neg,
      });
      const patch = Object.fromEntries(done.map(d => [d.col, d.to]));
      try {
        await api(`/rest/v1/posts?id=eq.${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      } catch (e) {                                          // la ligne n'a pas bougé : on retire les nouveaux fichiers, rien n'est perdu
        await api(`/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: done.map(d => d.to) }) }).catch(() => {});
        throw e;
      }
      await api(`/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: done.map(d => d.from) }) });
      for (const d of done) removed.push([bucket, d.from]);
    }
    stats.posts++;
    console.log(`  ${short} (${p.kind}, ${p.status}) : ${done.length} fichier(s) ${APPLY ? 'converti(s), originaux supprimés' : 'convertible(s)'}`);
  } catch (e) {
    stats.failed++;
    console.log(`  ${short} : ÉCHEC, rien n’a changé pour ce dépôt — ${e.message}`);
  }
}
// Vérification finale (--apply) : plus AUCUN dépôt ne pointe vers une ancienne adresse, et les anciens fichiers n'existent plus
if (APPLY) {
  const after = await (await api('/rest/v1/posts?select=id,kind,image_path,thumb_path,expired_at&image_path=not.is.null')).json();
  const still = after.filter(p => !p.expired_at && (p.kind === 'video' ? !isNeg(p.thumb_path) : (!isNeg(p.image_path) || !isNeg(p.thumb_path))));
  let present = 0;
  for (const [b, name] of removed) {
    const r = await fetch(`${SUPABASE}/storage/v1/object/${b}/${encodeURIComponent(name)}`, { headers: H });
    if (r.ok) present++;
  }
  console.log(`Vérification : ${still.length} dépôt(s) pointant encore vers un fichier d'origine ; ${present} ancien(s) fichier(s) encore présent(s) sur ${removed.length} supprimé(s).`);
  if (still.length || present) stats.failed++;
}
console.log(`Bilan : ${stats.posts} dépôt(s), ${stats.files} fichier(s) ; ${(stats.before / 1024).toFixed(0)} Ko d’origine → ${(stats.after / 1024).toFixed(0)} Ko en négatif ; ${stats.failed} échec(s).`);
await browser.close(); server.close();
process.exit(stats.failed ? 1 : 0);

/**
 * Conversion des photos déjà déposées (tools/negate-existing.mjs) — testée contre un FAUX Supabase local (base et
 * stockage en mémoire, fausses images générées). Aucun réseau réel.
 *
 *   node tests/negate-existing.test.mjs
 *
 * Vérifie : l'essai à blanc n'écrit rien ; --apply remplace chaque fichier d'origine par un négatif reconnu par le
 * contrôle du serveur, met la ligne à jour, supprime l'original ; la vidéo garde son fichier (seule l'image fixe
 * change) ; un dépôt en attente est traité dans le bucket privé ; un second passage n'a plus rien à faire.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { negativeError } from '../supabase/functions/_shared/negative.js';

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };
const fx = n => new Uint8Array(readFileSync(new URL(`./fixtures-img/${n}`, import.meta.url)));

const posts = [
  { id: 'aaaaaaaa-1', kind: 'image', status: 'approved', image_path: 'aaaaaaaa-1.jpg', thumb_path: 'aaaaaaaa-1-thumb.webp', expired_at: null },
  { id: 'bbbbbbbb-2', kind: 'video', status: 'approved', image_path: 'bbbbbbbb-2.mp4', thumb_path: 'bbbbbbbb-2-poster.jpg', expired_at: null },
  { id: 'cccccccc-3', kind: 'image', status: 'pending', image_path: 'cccccccc-3.jpg', thumb_path: 'cccccccc-3-thumb.jpg', expired_at: null },
  { id: 'dddddddd-4', kind: 'image', status: 'approved', image_path: 'dddddddd-4.neg.jpg', thumb_path: 'dddddddd-4-thumb.neg.jpg', expired_at: null },
];
const store = { published: new Map([['aaaaaaaa-1.jpg', fx('clean.jpg')], ['aaaaaaaa-1-thumb.webp', fx('lossy.webp')], ['bbbbbbbb-2.mp4', fx('v-ok.mp4')], ['bbbbbbbb-2-poster.jpg', fx('clean.jpg')], ['dddddddd-4.neg.jpg', fx('neg.jpg')], ['dddddddd-4-thumb.neg.jpg', fx('neg-thumb.jpg')]]),
  pending: new Map([['cccccccc-3.jpg', fx('clean.png')], ['cccccccc-3-thumb.jpg', fx('clean.jpg')]]) };
const writes = [];
const server = http.createServer((rq, rs) => {
  const chunks = []; rq.on('data', c => chunks.push(c));
  rq.on('end', () => {
    const u = new URL(rq.url, 'http://x'), body = Buffer.concat(chunks);
    const send = (code, data, type = 'application/json') => { rs.writeHead(code, { 'Content-Type': type }); rs.end(data); };
    if (rq.headers.authorization !== 'Bearer cle-factice') return send(401, '{}');
    if (u.pathname === '/rest/v1/posts' && rq.method === 'GET') return send(200, JSON.stringify(posts.filter(p => p.image_path)));
    if (u.pathname === '/rest/v1/posts' && rq.method === 'PATCH') {
      writes.push('patch'); const id = u.searchParams.get('id').replace('eq.', '');
      Object.assign(posts.find(p => p.id === id), JSON.parse(body)); return send(204, '');
    }
    const m = u.pathname.match(/^\/storage\/v1\/object\/(published|pending)(?:\/(.+))?$/);
    if (m) {
      const b = store[m[1]], name = m[2] && decodeURIComponent(m[2]);
      if (rq.method === 'GET') return b.has(name) ? send(200, Buffer.from(b.get(name)), 'application/octet-stream') : send(404, '{}');
      if (rq.method === 'POST') { writes.push('upload'); b.set(name, new Uint8Array(body)); return send(200, '{}'); }
      if (rq.method === 'DELETE') { writes.push('delete'); for (const p of JSON.parse(body).prefixes) b.delete(p); return send(200, '[]'); }
    }
    send(404, '{}');
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const run = (...args) => new Promise(res => {
  const c = spawn(process.execPath, [new URL('../tools/negate-existing.mjs', import.meta.url).pathname, ...args],
    { env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SERVICE_KEY: 'cle-factice' } });
  let out = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
  c.on('close', code => res({ code, out }));
});

let r = await run();
ok(r.code === 0 && /3 à convertir/.test(r.out) && /5 fichier\(s\)/.test(r.out), 'essai à blanc : 3 dépôts, 5 fichiers convertibles (le dépôt déjà en négatif est sauté)', r.out);
ok(writes.length === 0 && store.published.has('aaaaaaaa-1.jpg'), 'essai à blanc : RIEN n’est écrit ni supprimé', writes.join());

r = await run('--apply');
const a = posts[0], v = posts[1], c = posts[2];
ok(r.code === 0, '--apply : terminé sans échec', r.out);
ok(a.image_path === 'aaaaaaaa-1.neg.jpg' && a.thumb_path === 'aaaaaaaa-1-thumb.neg.jpg' && negativeError(store.published.get(a.image_path)) === null && negativeError(store.published.get(a.thumb_path)) === null,
  'photo publiée : nouveaux fichiers « .neg.jpg », reconnus comme négatifs', JSON.stringify(a));
ok(!store.published.has('aaaaaaaa-1.jpg') && !store.published.has('aaaaaaaa-1-thumb.webp'), 'photo publiée : fichiers d’origine supprimés');
ok(v.image_path === 'bbbbbbbb-2.mp4' && store.published.has('bbbbbbbb-2.mp4') && v.thumb_path === 'bbbbbbbb-2-poster.neg.jpg' && !store.published.has('bbbbbbbb-2-poster.jpg'),
  'vidéo : le fichier vidéo (déjà en négatif) ne bouge pas, seule l’image fixe est convertie', JSON.stringify(v));
ok(c.image_path === 'cccccccc-3.neg.jpg' && store.pending.has('cccccccc-3.neg.jpg') && !store.pending.has('cccccccc-3.jpg') && !store.published.has('cccccccc-3.neg.jpg'),
  'dépôt en attente : converti dans le bucket privé, rien de public', JSON.stringify(c));
const n = writes.length;
r = await run('--apply');
ok(r.code === 0 && /0 à convertir/.test(r.out) && writes.length === n, 'second passage : plus rien à convertir, rien n’est écrit', r.out);

server.close();
console.log(failed ? `\n${failed} test(s) en échec.` : '\nTous les tests de la conversion des photos existantes passent.');
process.exit(failed ? 1 : 0);

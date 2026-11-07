/**
 * Expiration de nuit (tools/expire-nightly.sh) — testée contre un FAUX serveur local (aucun réseau réel).
 *
 *   node tests/expire-nightly.test.mjs
 *
 * Vérifie : un seul appel POST { action: 'expiry-run' } avec la clé dans « Authorization: Bearer » ;
 * 403 « disabled » (expiration non activée) → réussite, rien de plus ; 200 → réussite, nombre de dépôts expirés ;
 * toute autre réponse (500, 401) → échec (l'alerte e-mail du job part) ; clé absente → échec sans aucun appel.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };

const hits = [];
let reply = [403, '{"error":"disabled"}'];
const server = http.createServer((rq, rs) => {
  let body = '';
  rq.on('data', c => { body += c; });
  rq.on('end', () => { hits.push({ method: rq.method, auth: rq.headers.authorization, body }); rs.writeHead(reply[0], { 'Content-Type': 'application/json' }); rs.end(reply[1]); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const EXPIRE_URL = `http://127.0.0.1:${server.address().port}/functions/v1/moderate`;
const run = env => new Promise(res => {
  const c = spawn('bash', [new URL('../tools/expire-nightly.sh', import.meta.url).pathname], { env: { PATH: process.env.PATH, EXPIRE_URL, ...env } });
  let out = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
  c.on('close', code => res({ code, out }));
});

let r = await run({ SERVICE_KEY: 'cle-factice' });
ok(r.code === 0 && /désactivée/.test(r.out), 'désactivée (403 « disabled ») : réussite, rien n’est supprimé', r.out);
ok(hits.length === 1 && hits[0].method === 'POST' && hits[0].auth === 'Bearer cle-factice' && JSON.parse(hits[0].body).action === 'expiry-run',
  'un seul appel POST expiry-run, clé dans Authorization: Bearer', JSON.stringify(hits));
reply = [200, '{"ok":true,"done":3}'];
r = await run({ SERVICE_KEY: 'cle-factice' });
ok(r.code === 0 && /3 dépôt/.test(r.out), 'activée (200) : réussite, nombre de dépôts expirés affiché', r.out);
for (const bad of [[500, '{"error":"storage"}'], [401, '{"error":"auth"}'], [403, '{"error":"admin"}']]) {
  reply = bad; r = await run({ SERVICE_KEY: 'cle-factice' });
  ok(r.code !== 0, `réponse ${bad[0]} ${bad[1]} : l’étape échoue (alerte e-mail)`, r.out);
}
const before = hits.length;
r = await run({});
ok(r.code !== 0 && hits.length === before, 'clé absente : échec, aucun appel', r.out);

server.close();
console.log(failed ? `\n${failed} test(s) en échec.` : '\nTous les tests de l’expiration de nuit passent.');
process.exit(failed ? 1 : 0);

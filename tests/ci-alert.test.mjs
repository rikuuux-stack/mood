/**
 * Alerte e-mail quand GitHub Actions échoue (tools/ci-alert.sh) — testée contre un FAUX serveur Resend local.
 *
 *   node tests/ci-alert.test.mjs
 *
 * Vérifie : sans le secret RESEND_API_KEY, rien n'est envoyé et le script ne fait pas échouer le job ;
 * avec, un seul appel à l'API Resend : bon destinataire (ADMIN_EMAIL de _shared/http.js), nom du workflow,
 * branche et lien du run ; si Resend refuse, un simple avertissement (toujours le code 0). Aucun réseau réel.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };

const hits = [];
let reply = 200;
const server = http.createServer((rq, rs) => {
  let body = '';
  rq.on('data', c => { body += c; });
  rq.on('end', () => { hits.push({ auth: rq.headers.authorization, type: rq.headers['content-type'], body }); rs.writeHead(reply, { 'Content-Type': 'application/json' }); rs.end(reply === 200 ? '{"id":"faux"}' : '{"message":"refusé"}'); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/emails`;
const to = readFileSync(new URL('../supabase/functions/_shared/http.js', import.meta.url), 'utf8').match(/ADMIN_EMAIL = '([^']+)'/)[1];
const env = { PATH: process.env.PATH, RESEND_URL: URL_, WORKFLOW: 'Vérifications', JOB: 'checks', BRANCH: 'claude/essai', RUN_URL: 'https://github.com/rikuuux-stack/mood/actions/runs/123' };
// lancé SANS bloquer Node (sinon le faux serveur ne pourrait pas répondre à curl)
const run = extra => new Promise(res => {
  const c = spawn('bash', [new URL('../tools/ci-alert.sh', import.meta.url).pathname], { env: { ...env, ...extra } });
  let stdout = '';
  c.stdout.on('data', d => { stdout += d; });
  c.on('close', status => res({ status, stdout }));
});

// 1. sans le secret : rien n'est envoyé, le job n'échoue pas à cause de l'alerte
let r = await run({});
ok(r.status === 0 && !hits.length, 'sans RESEND_API_KEY : rien n’est envoyé, code 0', JSON.stringify({ status: r.status, hits: hits.length }));
ok(/RESEND_API_KEY n'est pas configuré/.test(r.stdout), 'sans RESEND_API_KEY : une note claire dans le journal du job', r.stdout);

// 2. avec le secret : un seul appel, bon contenu
r = await run({ RESEND_API_KEY: 're_faux' });
const mail = hits[0] && JSON.parse(hits[0].body);
ok(r.status === 0 && hits.length === 1 && hits[0].auth === 'Bearer re_faux' && /json/.test(hits[0].type), 'avec RESEND_API_KEY : un appel à Resend, clé dans l’en-tête', JSON.stringify({ status: r.status, hits: hits.length }));
ok(mail?.to?.[0] === to && mail.to.length === 1, `destinataire : ADMIN_EMAIL de _shared/http.js`, JSON.stringify(mail?.to));
ok(/Vérifications/.test(mail?.subject) && /claude\/essai/.test(mail?.subject), `objet : workflow et branche (« ${mail?.subject} »)`);
ok(/Workflow : Vérifications/.test(mail?.text) && /Branche : claude\/essai/.test(mail?.text) && /actions\/runs\/123/.test(mail?.text), 'texte : workflow, branche, lien du run', mail?.text);
ok(/Alerte e-mail envoyée/.test(r.stdout), 'journal du job : « Alerte e-mail envoyée »', r.stdout);

// 3. Resend refuse : un avertissement, jamais d'échec en plus
reply = 422;
r = await run({ RESEND_API_KEY: 're_faux' });
ok(r.status === 0 && /NON envoyée : Resend a répondu HTTP 422/.test(r.stdout), 'Resend refuse : avertissement lisible, code 0', r.stdout);

// 4. Resend injoignable : pareil
r = await run({ RESEND_API_KEY: 're_faux', RESEND_URL: 'http://127.0.0.1:1/emails' });
ok(r.status === 0 && /NON envoyée : Resend a répondu HTTP 000/.test(r.stdout), 'Resend injoignable : avertissement lisible, code 0', r.stdout);

server.close();
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests de l’alerte e-mail passent.');

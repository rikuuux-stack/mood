/**
 * /admin/ ▸ Pending : « Approve all » et « Reject all », dans un vrai navigateur (Chromium, iPhone 12 émulé),
 * sans serveur réel (fausses réponses de la fonction « moderate », fausses données sans image).
 *
 *   node tests/admin-bulk.test.mjs
 *
 * Vérifie : boutons seulement dans Pending ; 1ᵉʳ toucher = « Sure? … N » sans rien envoyer ; 2ᵉ toucher = l'action
 * existante dépôt par dépôt, dans l'ordre ; un dépôt arrivé APRÈS l'affichage n'est jamais traité ; arrêt au premier
 * échec en disant lequel ; liste relue à la fin ; pas de défilement horizontal sur iPhone.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let playwright;
try { playwright = req('playwright'); } catch { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { chromium, devices } = playwright;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };

const post = (id, text) => ({ id, kind: 'text', text, name: '', size: 'm', status: 'pending', created_at: '2026-11-01T03:00:00Z', prompt: '' });
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});

/** Une page /admin/ avec un faux serveur ; failOn : identifiant dont l'action échoue (500). */
async function open({ failOn = null } = {}) {
  const st = { pending: [post('p-1', 'premier faux dépôt'), post('p-2', 'deuxième faux dépôt'), post('p-3', 'troisième faux dépôt')], posts: [], gets: 0 };
  const ctx = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('mood-admin-session', JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: Date.now() + 3600e3 })));
  await ctx.route(/supabase\.co\//, async route => {
    const rq = route.request(), u = new URL(rq.url());
    if (!u.pathname.endsWith('/functions/v1/moderate')) return route.fulfill({ status: 404, json: {} });
    if (rq.method() === 'GET') { st.gets++; return route.fulfill({ json: { prompt: '', storage: { used: 0, cap: 900 * 1048576, warn: 700 * 1048576 }, pending: st.pending, hidden: [], published: [] } }); }
    const body = JSON.parse(rq.postData() || '{}'); st.posts.push(body);
    if (body.id === failOn) return route.fulfill({ status: 500, json: { error: 'storage' } });
    st.pending = st.pending.filter(p => p.id !== body.id);
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}admin/`);
  await page.waitForSelector('.adm-card');
  return { ctx, page, st, errors };
}
const label = (page, k) => page.textContent(`[data-bulk="${k}"]`);
const msg = page => page.textContent('#dashMsg');

// 1. Approve all : confirmation avec le nombre, puis l'action dépôt par dépôt, dans l'ordre
{
  const { ctx, page, st, errors } = await open();
  ok(await page.isVisible('#bulk') && await label(page, 'approve') === 'Approve all' && await label(page, 'reject') === 'Reject all', 'Pending : boutons « Approve all » et « Reject all »');
  await page.click('[data-tab="published"]');
  ok(!(await page.isVisible('#bulk')), 'autres onglets : pas de boutons « … all »');
  await page.click('[data-tab="pending"]');
  await page.click('[data-bulk="approve"]');
  ok(!st.posts.length && await label(page, 'approve') === 'Sure? Approve 3', `1ᵉʳ toucher : rien d’envoyé, « ${await label(page, 'approve')} »`);
  // un nouveau dépôt arrive APRÈS l'affichage : il ne doit pas être validé sans avoir été vu
  st.pending.push(post('p-new', 'arrivé après l’affichage'));
  const getsBefore = st.gets;
  await page.click('[data-bulk="approve"]');
  await page.waitForFunction(() => /^Done:/.test(document.querySelector('#dashMsg').textContent));
  ok(JSON.stringify(st.posts.map(p => [p.action, p.id])) === JSON.stringify([['approve', 'p-1'], ['approve', 'p-2'], ['approve', 'p-3']]), '2ᵉ toucher : l’action existante, dépôt par dépôt, dans l’ordre', JSON.stringify(st.posts));
  ok(!st.posts.some(p => p.id === 'p-new'), 'un dépôt arrivé après l’affichage n’est PAS traité');
  ok(st.gets > getsBefore && await msg(page) === 'Done: 3 / 3', `liste relue à la fin, « ${await msg(page)} »`);
  ok(await page.locator('.adm-card').count() === 1 && /arrivé après/.test(await page.textContent('.adm-card')), 'il reste le dépôt arrivé après (à regarder)');
  ok(await label(page, 'approve') === 'Approve all', 'boutons remis à zéro après la relecture');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(width <= 390, `iPhone : pas de défilement horizontal (${width} px)`);
  ok(!errors.length, 'aucune erreur JavaScript', errors.join(' ; '));
  await ctx.close();
}
// 2. Reject all : s'arrête au premier échec, en disant lequel
{
  const { ctx, page, st, errors } = await open({ failOn: 'p-2' });
  await page.click('[data-bulk="reject"]');
  ok(await label(page, 'reject') === 'Sure? Reject 3' && !st.posts.length, `Reject all : 1ᵉʳ toucher « ${await label(page, 'reject')} », rien d’envoyé`);
  await page.click('[data-bulk="reject"]');
  await page.waitForFunction(() => /^Stopped:/.test(document.querySelector('#dashMsg').textContent));
  ok(JSON.stringify(st.posts.map(p => p.id)) === JSON.stringify(['p-1', 'p-2']) && st.posts.every(p => p.action === 'reject'), 'arrêt au premier échec : p-3 n’est pas touché', JSON.stringify(st.posts));
  const m = await msg(page);
  ok(/^Stopped: 1 \/ 3 done\. Failed on #2 \(text · .* · “deuxième faux dépôt”\) — retry$/.test(m), `message : « ${m} »`);
  ok(await page.locator('.adm-card').count() === 2, 'liste relue : les deux dépôts non traités restent affichés');
  ok(!errors.length, 'aucune erreur JavaScript', errors.join(' ; '));
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests « Approve all / Reject all » passent.');

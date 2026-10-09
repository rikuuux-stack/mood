/**
 * /admin/ ▸ Expiry dans un vrai navigateur (Chromium, iPhone 12 émulé), sans serveur réel (fausses réponses de « moderate ») :
 * en SIMULATION (par défaut), le rapport s'affiche et AUCUN bouton ne peut supprimer quoi que ce soit ;
 * une fois le réglage activé par l'auteur (dans Supabase), le bouton « Run » apparaît et demande confirmation.
 *
 *   node tests/admin-expiry.test.mjs
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

const MB = 1048576;
const report = enabled => ({ enabled, days: 180, simulation: !enabled,
  now: { count: 2, bytes: 3 * MB, posts: [{ id: 'a', kind: 'image', approved_at: '2026-03-01T00:00:00Z', prompt: 'trace', bytes: 0.5 * MB }, { id: 'b', kind: 'video', approved_at: '2026-03-05T00:00:00Z', prompt: '', bytes: 2.5 * MB }] },
  next30: { count: 1, bytes: 0.4 * MB } });
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
for (const enabled of [false, true]) {
  const posts = [];
  const ctx = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('mood-admin-session', JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: Date.now() + 3600e3 })));
  await ctx.route(/supabase\.co\//, async route => {
    const rq = route.request(), u = new URL(rq.url());
    if (!u.pathname.endsWith('/functions/v1/moderate')) return route.fulfill({ status: 404, json: {} });
    if (rq.method() === 'GET' && u.searchParams.has('expiry')) return route.fulfill({ json: report(enabled) });
    if (rq.method() === 'GET') return route.fulfill({ json: { prompt: '', storage: { used: 0, cap: 900 * MB, warn: 700 * MB }, pending: [], hidden: [], published: [] } });
    const body = JSON.parse(rq.postData() || '{}'); posts.push(body);
    return route.fulfill(enabled ? { json: { ok: true, done: 2 } } : { status: 403, json: { error: 'disabled' } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}admin/`);
  await page.waitForSelector('#dash:not([hidden])');
  await page.click('[data-tab="expiry"]');
  await page.waitForSelector('.adm-expiry p');
  const text = await page.textContent('#expiry');
  const tag = enabled ? 'activé par l’auteur' : 'simulation (défaut)';
  ok(/2 post\(s\) · 3\.0 MB would be freed/.test(text) && /Next 30 days: 1 more · 0\.4 MB/.test(text), `${tag} : rapport (maintenant, 30 prochains jours, place libérée)`, text);
  ok(/Mar 2026 · image · trace · 0\.5 MB/.test(text), `${tag} : liste de ce qui serait supprimé (date, type, consigne, poids)`, text);
  if (!enabled) {
    ok(/Simulation — OFF: nothing is deleted/.test(text), 'simulation : « nothing is deleted » affiché');
    ok(!(await page.$$eval('#expiry button', b => b.length)), 'simulation : AUCUN bouton (rien ne peut être supprimé depuis /admin/)');
    ok(!posts.length, 'simulation : aucune demande de suppression envoyée');
  } else {
    const run = page.locator('#expiry button');
    await run.click();
    ok(!posts.length && /Sure/.test(await run.textContent()), 'activé : « Run » demande confirmation (2ᵉ toucher)');
    await run.click();
    await page.waitForFunction(() => /expired/.test(document.querySelector('#dashMsg').textContent));
    ok(posts.length === 1 && posts[0].action === 'expiry-run', 'activé : le 2ᵉ toucher lance l’expiration');
  }
  ok(!errors.length, `${tag} : aucune erreur JavaScript`, errors.join(' ; '));
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests de l’expiration (admin) passent.');

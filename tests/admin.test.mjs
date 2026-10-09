/**
 * Page /admin/ dans un vrai navigateur (Chromium, iPhone 12 émulé) — sans serveur réel : la fonction
 * « moderate » et le stockage sont interceptés et remplacés par de fausses réponses.
 *
 *   node tests/admin.test.mjs
 *
 * Vérifie l'onglet « Archive » : liste des nuits, aperçu et liens demandés seulement à l'ouverture d'une nuit,
 * suppression d'une nuit avec confirmation (second toucher), liste relue après la suppression.
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

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
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
const JPG = fs.readFileSync(path.join(ROOT, 'tests/fixtures-img/clean.jpg'));

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };

// fausses données : deux nuits d'archive
let nights = [
  { date: '2026-10-10', files: [{ name: 'desktop.jpg', size: 280000 }, { name: 'iphone.jpg', size: 370000 }, { name: 'state.json', size: 5000 }] },
  { date: '2026-10-09', files: [{ name: 'desktop.jpg', size: 270000 }, { name: 'iphone.jpg', size: 360000 }, { name: 'state.json', size: 4900 }] },
];
const posts = [], storageHits = [];
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const ctx = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => localStorage.setItem('mood-admin-session', JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: Date.now() + 3600e3 })));
await ctx.route(/supabase\.co\//, async route => {
  const rq = route.request(), u = new URL(rq.url());
  if (u.pathname.endsWith('/functions/v1/moderate')) {
    if (rq.method() === 'GET' && u.searchParams.has('archive')) {
      return route.fulfill({ json: { nights, total: nights.reduce((s, n) => s + n.files.reduce((a, f) => a + f.size, 0), 0) } });
    }
    if (rq.method() === 'GET') return route.fulfill({ json: { prompt: '', storage: { used: 0, cap: 900 * 1048576, warn: 700 * 1048576 }, pending: [], hidden: [], published: [] } });
    const body = JSON.parse(rq.postData() || '{}'); posts.push(body);
    if (body.action === 'archive-urls') {
      const url = n => `https://x.supabase.co/storage/v1/object/sign/archive/${body.date}/${n}?token=t`;
      return route.fulfill({ json: { files: ['desktop.jpg', 'iphone.jpg', 'state.json'].map(n => ({ name: n, url: url(n), download: `${url(n)}&download=mood-${body.date}-${n}` })) } });
    }
    if (body.action === 'archive-delete') { nights = nights.filter(n => n.date !== body.date); return route.fulfill({ json: { ok: true, removed: 3 } }); }
    return route.fulfill({ status: 400, json: { error: 'action' } });
  }
  if (u.pathname.includes('/storage/v1/object/sign/archive/')) { storageHits.push(u.pathname); return route.fulfill({ body: JPG, contentType: 'image/jpeg' }); }
  return route.fulfill({ status: 404, json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}admin/`);
await page.waitForSelector('#dash:not([hidden])');
await page.click('[data-tab="archive"]');
await page.waitForSelector('.adm-night');
ok(await page.locator('.adm-night').count() === 2, 'onglet Archive : les deux nuits sont listées');
ok(/2 night\(s\)/.test(await page.textContent('#archiveInfo')), 'total de l’archive affiché', await page.textContent('#archiveInfo'));
ok(!posts.some(p => p.action === 'archive-urls') && !storageHits.length, 'aucun lien ni aperçu demandé avant l’ouverture d’une nuit');
await page.click('.adm-night >> nth=0 >> summary');
await page.waitForSelector('.adm-shots img');
await page.waitForFunction(() => [...document.querySelectorAll('.adm-shots img')].every(i => i.complete && i.naturalWidth));
ok(await page.locator('.adm-shots img').count() === 2, 'ouverture d’une nuit : aperçu des deux captures');
const links = await page.$$eval('.adm-night-body a', as => as.map(a => a.href));
ok(links.length === 3 && links.every(h => h.includes('download=')), 'trois liens de téléchargement (captures + état)', JSON.stringify(links));
ok(posts.filter(p => p.action === 'archive-urls').length === 1 && posts[0].date === '2026-10-10', 'liens demandés pour la bonne nuit, une seule fois');
const del = page.locator('.adm-night-body button').first();
await del.click();
ok(!posts.some(p => p.action === 'archive-delete') && /Sure/.test(await del.textContent()), 'suppression : un premier toucher demande confirmation');
await del.click();
await page.waitForFunction(() => document.querySelectorAll('.adm-night').length === 1);
ok(posts.some(p => p.action === 'archive-delete' && p.date === '2026-10-10'), 'second toucher : nuit supprimée (la bonne)');
ok(/1 night\(s\)/.test(await page.textContent('#archiveInfo')), 'liste relue après la suppression');
const width = await page.evaluate(() => document.documentElement.scrollWidth);
ok(width <= 390, `iPhone : pas de défilement horizontal (${width} px)`);
ok(!errors.length, 'aucune erreur JavaScript', errors.join(' ; '));
await browser.close(); server.close();
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests de /admin/ passent.');

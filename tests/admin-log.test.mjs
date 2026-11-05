/**
 * /admin/ dans un vrai navigateur (Chromium, iPhone 12 émulé), sans serveur réel (fausses réponses de « moderate ») :
 * refus avec une raison en un mot, et onglet « Stats » (journal de modération résumé).
 *
 *   node tests/admin-log.test.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { summarize } from '../supabase/functions/_shared/stats.js';

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

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };

const now = new Date().toISOString();
let pending = [{ id: 'p-1', kind: 'text', text: 'faux dépôt', name: '', size: 'm', status: 'pending', created_at: now, prompt: 'trace' }];
const log = [
  { at: '2026-09-12T03:00:00Z', decision: 'approved', reason: null, prompt: 'trace' },
  { at: '2026-10-02T03:00:00Z', decision: 'rejected', reason: 'spam', prompt: 'light' },
  { at: '2026-10-03T03:00:00Z', decision: 'removed', reason: null, prompt: 'trace' },
];
const posts = [];
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const ctx = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => localStorage.setItem('mood-admin-session', JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: Date.now() + 3600e3 })));
await ctx.route(/supabase\.co\//, async route => {
  const rq = route.request(), u = new URL(rq.url());
  if (!u.pathname.endsWith('/functions/v1/moderate')) return route.fulfill({ status: 404, json: {} });
  if (rq.method() === 'GET' && u.searchParams.has('stats')) return route.fulfill({ json: summarize(log) });
  if (rq.method() === 'GET') return route.fulfill({ json: { prompt: '', storage: { used: 0, cap: 900 * 1048576, warn: 700 * 1048576 }, pending, hidden: [], published: [] } });
  const body = JSON.parse(rq.postData() || '{}'); posts.push(body);
  if (body.action === 'reject') { pending = []; log.push({ at: now, decision: 'rejected', reason: body.reason, prompt: 'trace' }); }
  return route.fulfill({ json: { ok: true } });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}admin/`);
await page.waitForSelector('.adm-card');

// refus : un premier toucher propose la raison (rien n'est envoyé), un toucher sur la raison envoie le refus
await page.click('.adm-actions .btn >> text=Reject');
const reasons = await page.$$eval('.adm-reasons button', bs => bs.map(b => b.textContent));
ok(JSON.stringify(reasons) === JSON.stringify(['rights', 'offensive', 'private', 'spam', 'test', 'other']), 'Reject propose la raison en un mot (6 choix)', JSON.stringify(reasons));
ok(!posts.length, 'rien n’est envoyé avant le choix de la raison');
await page.click('.adm-reasons button[data-reason="spam"]');
await page.waitForFunction(() => !document.querySelector('.adm-card'));
ok(posts.length === 1 && posts[0].action === 'reject' && posts[0].id === 'p-1' && posts[0].reason === 'spam', 'refus envoyé avec sa raison', JSON.stringify(posts));

// Stats : par mois (heure de Tokyo) et par consigne
await page.click('[data-tab="stats"]');
await page.waitForSelector('.adm-table');
const tables = await page.$$eval('.adm-table', ts => ts.map(t => [...t.querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => c.textContent))));
ok(tables.length === 2, 'Stats : deux tableaux (par mois, par consigne)');
ok(tables[0].some(r => r[0] === '2026-09' && r[1] === '1') && tables[0].some(r => /spam/.test(r[3])), 'par mois : acceptés, refusés et raisons', JSON.stringify(tables[0]));
ok(tables[1].some(r => r[0] === 'light' && r[3] === '1') && tables[1].some(r => r[0] === 'trace'), 'par consigne : dépôts acceptés / refusés', JSON.stringify(tables[1]));
const width = await page.evaluate(() => document.documentElement.scrollWidth);
ok(width <= 390, `iPhone : pas de défilement horizontal de la page (${width} px)`);
ok(!errors.length, 'aucune erreur JavaScript', errors.join(' ; '));
await browser.close(); server.close();
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests du journal de modération passent.');


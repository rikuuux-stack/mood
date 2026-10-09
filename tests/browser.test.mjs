/**
 * Test dans un vrai navigateur (Chromium, iPhone 12 émulé) — Mood / Drop flottants, fond, érosion, chargement.
 *
 *   node tests/browser.test.mjs
 *
 * Aucun serveur réel : le site est servi en local et les appels à Supabase sont interceptés et
 * remplacés par des données factices (tests/fixtures.mjs, image tests/fixtures-img/clean.jpg).
 *
 * Vérifie :
 *   - plus de bandeau : « Mood » et « Drop » flottent sans fond (mix-blend-mode: difference) ;
 *   - au défilement (bas puis haut), vue Wall et vue List, avec la barre d'adresse simulée
 *     (hauteur 844 → 750 → 844) : Mood et Drop restent à leur place et AUCUNE image ne passe dessus ;
 *   - le fond et son grain sont une couche fixe (ne défile pas) ;
 *   - érosion : les vieilles images ont un palier (age-1 … age-4 → filtre #erodeN : les clairs deviennent
 *     transparents), aucune opacité, rien ne change au survol, l'agrandissement montre l'image neuve ;
 *     textes lisibles à tout âge (≥ 7:1) ;
 *   - tout le mur sans « More » : paquets lus en arrière-plan, images chargées à l'approche de l'écran,
 *     libérées au-delà de 3 écrans puis rechargées au retour, sans que la composition bouge.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SAMPLE_POSTS } from './fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let playwright;
try { playwright = req('playwright'); } catch { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { chromium, devices } = playwright;

/* ------------------------------------------------------------------ site servi en local */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

/* ------------------------------------------------------------------ données factices */
const DAY = 86400e3, now = Date.now();
const PROMPTS = ['trace', 'light', '', 'window', 'hands', 'dust', ''];
// 520 dépôts (donc deux paquets de lecture) : les 60 premiers de 0 à 200 jours, les autres plus vieux (liste seulement)
const rows = Array.from({ length: 520 }, (_, i) => {
  const p = SAMPLE_POSTS[i % SAMPLE_POSTS.length];
  const days = i < 60 ? (i / 59) * 200 : 200 + i;
  const approved = new Date(now - days * DAY), created = new Date(approved - 3600e3);
  const monthsAgo = (new Date(now).getFullYear() - created.getFullYear()) * 12 + new Date(now).getMonth() - created.getMonth();
  return {
    id: `f-${i}`, kind: p.kind, text: p.text || '', name: '', size: ['s', 'm', 'l'][i % 3], prompt: PROMPTS[monthsAgo] ?? '',
    image_path: p.image ? `f-${i}.jpg` : null, thumb_path: p.image ? `f-${i}-t.jpg` : null,
    width: p.image?.w ?? null, height: p.image?.h ?? null,
    created_at: created.toISOString(), approved_at: approved.toISOString(),
  };
});
const JPG = fs.readFileSync(path.join(ROOT, 'tests/fixtures-img/clean.jpg'));

const offsets = [], thumbs = new Set();
async function fakeServer(ctx) {
  await ctx.route(/supabase\.co\//, route => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/rest/v1/wall')) {
      offsets.push(+u.searchParams.get('offset') || 0);
      const off = +u.searchParams.get('offset') || 0, lim = +u.searchParams.get('limit') || 30;
      return route.fulfill({ json: rows.slice(off, off + lim) });
    }
    if (u.pathname.endsWith('/rest/v1/current_prompt')) return route.fulfill({ json: [{ text: 'trace' }] });
    if (u.pathname.includes('/storage/v1/object/public/')) thumbs.add(u.pathname.split('/').pop());
    if (u.pathname.includes('/storage/v1/object/public/')) return route.fulfill({ body: JPG, contentType: 'image/jpeg' });
    return route.fulfill({ status: 404, json: {} });
  });
  await ctx.route(/challenges\.cloudflare\.com/, r => r.fulfill({ body: '' }));
}

/* ------------------------------------------------------------------ tests */
let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };
const onWallRows = rows.filter(r => now - Date.parse(r.approved_at) < 180 * DAY).length;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
await fakeServer(ctx);
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
await pg.goto(BASE);
await pg.waitForSelector('#wall .item');
await pg.waitForFunction(n => document.querySelectorAll('#wall .item').length === n
  && [...document.querySelectorAll('#wall .item')].every(li => li.style.top), onWallRows, { timeout: 20000 }).catch(() => {});

/* chargement : tout le mur, sans bouton, images à l'approche de l'écran */
const load = await pg.evaluate(() => ({
  more: !!document.querySelector('#more'), items: document.querySelectorAll('#wall .item').length,
  imgs: document.querySelectorAll('#wall .photo img').length,
  waiting: document.querySelectorAll('#wall .photo img[data-src]').length,
  placeholders: [...document.querySelectorAll('#wall .photo')].every(ph => ph.offsetHeight > 0),
}));
ok(!load.more, 'plus de bouton « More »');
ok(offsets.join() === '0,500', `liste lue par paquets en arrière-plan (offsets ${offsets.join(', ')})`);
ok(load.items === onWallRows, `le mur contient tous les dépôts de moins de 180 jours (${load.items} / ${onWallRows})`);
ok(load.waiting > 0 && load.waiting < load.imgs, `images loin de l'écran pas encore téléchargées (${load.waiting} / ${load.imgs} en attente)`);
ok(load.placeholders, 'chaque image en attente garde sa place (cadre à la bonne hauteur)');

// mémoire : loin de l'écran (au-delà de 3 écrans), les images sont libérées, puis reviennent ; rien ne bouge
const layoutOf = () => pg.evaluate(() => [...document.querySelectorAll('#wall .item')].map(li => `${li.style.top}|${li.style.left}|${li.offsetHeight}`).join());
const before = await layoutOf();
const H = await pg.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= H; y += 400) { await pg.evaluate(y => scrollTo(0, y), y); await pg.waitForTimeout(30); }
await pg.waitForTimeout(400);
const freed = await pg.evaluate(() => {
  const imgs = [...document.querySelectorAll('#wall .photo img')], far = innerHeight * 3;
  const top = imgs.filter(img => img.getBoundingClientRect().bottom < -far - 50);
  return { top: top.length, freed: top.filter(img => !img.getAttribute('src') && img.dataset.src).length, loaded: imgs.filter(img => img.getAttribute('src')).length, total: imgs.length };
});
ok(freed.top > 0 && freed.freed === freed.top, `images à plus de 3 écrans libérées (${freed.freed} / ${freed.top}) ; en mémoire : ${freed.loaded} / ${freed.total}`);
await pg.evaluate(() => scrollTo(0, 0)); await pg.waitForTimeout(600);
const back = await pg.evaluate(() => [...document.querySelectorAll('#wall .photo')]
  .filter(ph => { const r = ph.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })
  .every(ph => ph.classList.contains('is-loaded') && ph.querySelector('img').getAttribute('src')));
ok(back, 'en revenant, les images libérées sont rechargées');
ok(before === await layoutOf(), 'libérer / recharger ne déplace rien (composition identique)');

/* Mood et Drop : flottants, sans fond, au-dessus de tout */
const bar = await pg.evaluate(() => {
  const b = getComputedStyle(document.querySelector('.bar'));
  return { pos: b.position, bg: b.backgroundColor, img: b.backgroundImage, blend: b.mixBlendMode, z: +b.zIndex };
});
ok(bar.pos === 'fixed' && bar.bg === 'rgba(0, 0, 0, 0)' && bar.img === 'none',
  'plus de bandeau : Mood et Drop flottent, sans aucun fond', JSON.stringify(bar));
ok(bar.blend === 'difference', 'Mood et Drop lisibles sur le clair comme sur le sombre (mix-blend-mode: difference)', bar.blend);

// chaque point de « Mood » et de « Drop » doit leur appartenir (aucune image par-dessus)
const probe = () => pg.evaluate(() => {
  const bad = [], tops = [];
  for (const el of document.querySelectorAll('.bar .id, .bar .btn-drop')) {
    const r = el.getBoundingClientRect(); tops.push(Math.round(r.top));
    for (let x = r.left + 2; x < r.right - 1; x += 6) for (let y = r.top + 2; y < r.bottom - 1; y += 4) {
      const hit = document.elementFromPoint(x, y);
      if (hit && !el.contains(hit)) bad.push(`${Math.round(x)},${Math.round(y)} ${hit.tagName}.${hit.className}`);
    }
  }
  return { tops, bad };
});
const first = (await probe()).tops.join();
for (const view of ['wall', 'list']) {
  if (view === 'list') { await pg.evaluate(() => document.querySelector('#viewBtn').click()); await pg.waitForTimeout(400); }
  const problems = [];
  for (const h of [844, 750, 844]) {                 // barre d'adresse : visible, repliée, de nouveau visible
    await pg.setViewportSize({ width: 390, height: h });
    for (const y of [0, 300, 900, 2000, 1200, 400, 0]) {   // vers le bas, puis vers le haut
      await pg.evaluate(y => scrollTo(0, y), y);
      await pg.waitForTimeout(60);
      const r = await probe();
      if (r.tops.join() !== first || r.bad.length) problems.push(`h=${h} y=${y} tops=${r.tops} ${r.bad.slice(0, 2).join(' | ')}`);
    }
  }
  ok(!problems.length, `vue ${view} : Mood et Drop restent en place et au-dessus de toutes les images (défilement + barre d'adresse)`, problems.slice(0, 3).join(' ; '));
}
await pg.evaluate(() => document.querySelector('#viewBtn').click());
await pg.waitForTimeout(400);

const bg = await pg.evaluate(() => {
  const s = getComputedStyle(document.body, '::before'), b = getComputedStyle(document.body);
  return { pos: s.position, img: s.backgroundImage !== 'none', bodyImg: b.backgroundImage };
});
ok(bg.pos === 'fixed' && bg.img && bg.bodyImg === 'none', 'fond + grain : couche fixe (ne défile pas avec la page)', JSON.stringify(bg));

/* érosion */
const ages = await pg.evaluate(() => [...document.querySelectorAll('#wall .item:not(.is-pending)')].map(li => {
  const v = +li.style.getPropertyValue('--v'), img = li.querySelector('.photo img'), tx = li.querySelector('.sticker, .caption');
  return { v, stage: +(li.className.match(/age-(\d)/)?.[1] || 0), opacity: +getComputedStyle(li).opacity,
    filter: img ? getComputedStyle(img).filter : null, color: tx ? getComputedStyle(tx).color : null };
}));
// « rgb(232, 232, 232) » ou « color(srgb 0.9 0.9 0.9) » (couleur issue de color-mix)
const lum = c => { const k = c.startsWith('color(') ? 1 : 255; const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / k).map(x => (x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)); return .2126 * r + .7152 * g + .0722 * b; };
const bgL = lum('rgb(11, 11, 11)');
const photos = ages.filter(a => a.filter);
ok(new Set(ages.map(a => a.stage)).size === 5, `les cinq paliers d'âge sont présents (0 à 4)`, [...new Set(ages.map(a => a.stage))].join());
ok(photos.every(a => a.filter.includes(a.stage ? `#erode${a.stage}` : '#tone')), 'chaque image porte le filtre de son palier (#tone neuve, #erode1 … #erode4)',
  photos.filter(a => !a.filter.includes(a.stage ? `#erode${a.stage}` : '#tone')).slice(0, 2).map(a => `${a.stage} ${a.filter}`).join(' ; '));
ok(ages.every(a => a.opacity === 1), 'aucun dépôt ne s\'efface par opacité : seuls les clairs deviennent transparents');
const worst = Math.min(...ages.filter(a => a.color).map(a => (lum(a.color) + .05) / (bgL + .05)));
ok(worst >= 7, `textes et commentaires lisibles à tout âge (contraste mini ${worst.toFixed(1)}:1 ≥ 7:1)`);
const filters = await pg.evaluate(() => [1, 2, 3, 4].every(i => document.getElementById(`erode${i}`)));
ok(filters, 'quatre filtres partagés #erode1 … #erode4 dans la page');

/* ordinateur : le survol ne rend pas l'image neuve ; l'agrandissement, si */
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await fakeServer(desk);
const dp = await desk.newPage();
await dp.goto(BASE); await dp.waitForSelector('#wall .item');
await dp.waitForFunction(() => document.querySelector('#wall .age-4 .photo'), null, { timeout: 20000 });
const target = dp.locator('#wall .item.age-4').filter({ has: dp.locator('.photo') }).first();
await target.scrollIntoViewIfNeeded(); await target.hover(); await dp.waitForTimeout(300);
const hov = await target.evaluate(li => getComputedStyle(li.querySelector('.photo img')).filter);
ok(hov.includes('#erode4'), 'survol : l\'image garde son âge (pas de retour à neuf)', hov);
await target.click(); await dp.waitForSelector('#viewer[open] .photo img');
const big = await dp.evaluate(() => getComputedStyle(document.querySelector('#viewer .photo img')).filter);
ok(big.includes('#tone') && !big.includes('erode'), 'agrandissement : l\'image est neuve', big);

ok(!errors.length, 'aucune erreur JavaScript', errors.join(' ; '));
await browser.close(); server.close();
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests navigateur passent.');

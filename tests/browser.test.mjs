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
 *   - Keep : un fragment du mur aux bonnes dimensions (1080 × 1350, 1080 × 1920), canvas non « tainted »,
 *     sans métadonnées, ligne du bas présente ; partage natif sur iPhone, téléchargement sur ordinateur ;
 *   - fuseaux : le mur (strates) est le même pour tous, à l'heure de Tokyo (visiteurs à Tokyo, Paris,
 *     Los Angeles) ; la date du fragment suit le téléphone (Paris, 30.09 à 17 h 30 → « 30.09.2026 ») ;
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
const MP4 = fs.readFileSync(path.join(ROOT, 'tests/fixtures-img/v-ok.mp4'));   // fausse vidéo générée (480 × 270, 2 s)
const mp4Requests = [];

const offsets = [], thumbs = new Set();
async function fakeServer(ctx, data = rows, current = 'trace') {
  await ctx.route(/supabase\.co\//, route => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/rest/v1/wall')) {
      offsets.push(+u.searchParams.get('offset') || 0);
      const off = +u.searchParams.get('offset') || 0, lim = +u.searchParams.get('limit') || 30;
      return route.fulfill({ json: data.slice(off, off + lim) });
    }
    if (u.pathname.endsWith('/rest/v1/current_prompt')) return route.fulfill({ json: current ? [{ text: current }] : [] });
    if (u.pathname.includes('/storage/v1/object/public/')) thumbs.add(u.pathname.split('/').pop());
    // comme Supabase Storage : en-tête CORS, sans quoi un canvas qui dessine l'image serait « tainted »
    if (u.pathname.includes('/storage/v1/object/public/') && u.pathname.endsWith('.mp4')) {
      mp4Requests.push(u.pathname);
      return route.fulfill({ body: MP4, contentType: 'video/mp4', headers: { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'none' } });
    }
    if (u.pathname.includes('/storage/v1/object/public/')) return route.fulfill({ body: JPG, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } });
    return route.fulfill({ status: 404, json: {} });
  });
  await ctx.route(/challenges\.cloudflare\.com/, r => r.fulfill({ body: '' }));
}

/* ------------------------------------------------------------------ tests */
let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };
const onWallRows = rows.filter(r => now - Date.parse(r.approved_at) < 180 * DAY).length;

// PW_CHANNEL=chrome : Google Chrome (lit le H.264, comme un iPhone) ; sinon le Chromium de test
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
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
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await fakeServer(desk);
const dp = await desk.newPage();
dp.on('pageerror', e => errors.push(e.message));
await dp.goto(BASE); await dp.waitForSelector('#wall .item');
await dp.waitForFunction(() => document.querySelector('#wall .age-4 .photo'), null, { timeout: 20000 });
const target = dp.locator('#wall .item.age-4').filter({ has: dp.locator('.photo') }).first();
await target.scrollIntoViewIfNeeded(); await target.hover(); await dp.waitForTimeout(300);
const hov = await target.evaluate(li => getComputedStyle(li.querySelector('.photo img')).filter);
ok(hov.includes('#erode4'), 'survol : l\'image garde son âge (pas de retour à neuf)', hov);
await target.click(); await dp.waitForSelector('#viewer[open] .photo img');
const big = await dp.evaluate(() => getComputedStyle(document.querySelector('#viewer .photo img')).filter);
ok(big.includes('#tone') && !big.includes('erode'), 'agrandissement : l\'image est neuve', big);

/* Keep : fragment du mur (ordinateur : téléchargement) */
const imageInfo = (page, bytes) => page.evaluate(async arr => {
  const blob = new Blob([new Uint8Array(arr)], { type: 'image/jpeg' });
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
  // ligne du bas : des pixels clairs (texte) dans la bande du bas, à gauche ; le fond seul reste très sombre
  const band = ctx.getImageData(40, c.height - 70, 700, 50).data;
  let bright = 0; for (let i = 0; i < band.length; i += 4) if (band[i] > 120) bright++;
  const { hasMetadata } = await import('/js/image.js');
  return { w: bmp.width, h: bmp.height, bright, meta: await hasMetadata(blob), jpeg: arr[0] === 0xff && arr[1] === 0xd8 };
}, [...bytes]);

await dp.keyboard.press('Escape'); await dp.waitForSelector('#viewer:not([open])', { state: 'attached' });
const center = dp.locator('#wall .item.item--image:not(.is-pending)').first();
await center.scrollIntoViewIfNeeded(); await center.click();
await dp.waitForSelector('#viewer[open]');
ok(await dp.isVisible('#keepBtn'), 'Keep : bouton présent dans l\'agrandissement d\'un dépôt du mur');
await dp.click('#keepBtn');
await dp.waitForSelector('#keepGo:not([disabled])', { timeout: 10000 });
for (const [format, H] of [['4:5', 1350], ['9:16', 1920]]) {
  if (format !== '4:5') { await dp.click(`[data-format="${format}"]`); await dp.waitForSelector('#keepGo:not([disabled])', { timeout: 10000 }); }
  const t0 = Date.now();
  const [dl] = await Promise.all([dp.waitForEvent('download'), dp.click('#keepGo')]);
  const bytes = fs.readFileSync(await dl.path());
  const info = await imageInfo(dp, bytes);
  ok(info.jpeg && info.w === 1080 && info.h === H, `Keep ${format} : fichier JPEG ${info.w} × ${info.h} (téléchargé : ${dl.suggestedFilename()})`, JSON.stringify(info));
  ok(!info.meta, `Keep ${format} : aucune métadonnée (EXIF…)`);
  ok(info.bright > 150, `Keep ${format} : ligne du bas présente (${info.bright} pixels de texte)`);
  void t0;
}
const footer = await dp.evaluate(async () => {
  const { today } = await import('/js/fragment.js');
  return today(new Date(2026, 9, 10));
});
ok(footer === '10.10.2026', 'date de la ligne du bas au format JJ.MM.AAAA', footer);
const tainted = await dp.evaluate(async () => {
  // le fragment se fabrique avec toBlob : un canvas « tainted » lèverait une SecurityError
  const { makeFragment } = await import('/js/fragment.js');
  const li = document.querySelector('#wall .item.item--image:not(.is-pending)');
  try { const out = await makeFragment({ li, wallEl: document.querySelector('#wall'), format: '4:5', prompt: 'trace' }); return out; }
  catch (e) { return { footer: `ERREUR ${e.name}: ${e.message}`, photos: {} }; }
});
ok(/^moodwall\.pages\.dev — \d\d\.\d\d\.\d{4} — trace$/.test(tainted.footer), 'canvas lisible (pas « tainted ») ; ligne du bas : adresse — date — consigne', tainted.footer);
ok(tainted.photos.drawn > 0 && tainted.photos.missing === 0, `toutes les photos du fragment sont dessinées (${tainted.photos.drawn}, aucune manquante : images chargées avec CORS)`, JSON.stringify(tainted.photos));
await dp.keyboard.press('Escape');

/* Keep sur iPhone : menu de partage natif avec le fichier */
const phone = await browser.newContext({ ...devices['iPhone 12'] });
await fakeServer(phone);
await phone.addInitScript(() => {
  navigator.canShare = d => !!d?.files?.length;
  navigator.share = async d => { window.__shared = d.files.map(f => ({ name: f.name, type: f.type, size: f.size })); };
});
const pp = await phone.newPage();
pp.on('pageerror', e => errors.push(e.message));
await pp.goto(BASE); await pp.waitForSelector('#wall .item.item--text');
await pp.waitForTimeout(500);
const txt = pp.locator('#wall .item.item--text').first();
await txt.scrollIntoViewIfNeeded(); await txt.tap(); await pp.waitForSelector('#viewer[open]');
await pp.tap('#keepBtn');
await pp.waitForSelector('#keepGo:not([disabled])', { timeout: 10000 });
ok(await pp.textContent('#keepGo') === 'Share', 'iPhone : le bouton propose « Share »');
await pp.tap('#keepGo'); await pp.waitForTimeout(300);
const shared = await pp.evaluate(() => window.__shared);
ok(shared?.length === 1 && shared[0].type === 'image/jpeg' && shared[0].size > 10000, 'iPhone : menu de partage natif ouvert avec le fichier', JSON.stringify(shared));

/* Images de toute taille et tout format : converties sur l'appareil aux normes du site (≤ 2000 px, ≤ 5 Mo,
   WebP ou JPEG, sans métadonnées) ; refus seulement si illisible ou énorme (> 60 Mo, > 100 mégapixels).
   Fausses images fabriquées ici : une « photo » 6000 × 8000 de plus de 15 Mo, une image de 110 mégapixels. */
{
  // PNG en niveaux de gris de 11 000 × 10 000 (110 Mpx), uni : quelques centaines de Ko une fois compressé
  const zlib = await import('node:zlib');
  const crc = (() => { const t = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
    return b => { let c = -1; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const W = 11000, Hh = 10000, ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4); ihdr[8] = 8; ihdr[9] = 0;
  const row = Buffer.alloc(W + 1, 128); row[0] = 0;
  const def = zlib.createDeflate({ level: 9 }), parts = []; def.on('data', d => parts.push(d));
  const done = new Promise(r => def.on('end', r));
  for (let y = 0; y < Hh; y++) def.write(row); def.end(); await done;
  const huge = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.concat(parts)), chunk('IEND', Buffer.alloc(0))]);
  const ic = await browser.newContext(devices['iPhone 12']);
  await fakeServer(ic);
  const ip = await ic.newPage();
  ip.on('pageerror', e => errors.push(e.message));
  await ip.goto(BASE);
  const res = await ip.evaluate(async hugeBytes => {
    const { decodeImage, renderImage, hasMetadata } = await import('/js/image.js');
    const run = async file => {
      try { const out = await renderImage(await decodeImage(file)); return { w: out.width, h: out.height, full: out.full.size, type: out.full.type, meta: await hasMetadata(out.full) || await hasMetadata(out.thumb) }; }
      catch (e) { return { code: e.code }; }
    };
    // « photo » 6000 × 8000 : dégradés + bruit fin, JPEG très peu compressé (> 15 Mo)
    const c = document.createElement('canvas'); c.width = 6000; c.height = 8000;
    const g = c.getContext('2d'), band = g.createImageData(6000, 400);
    for (let y0 = 0; y0 < 8000; y0 += 400) {
      for (let i = 0; i < band.data.length; i += 4) { const v = 60 + (y0 / 8000) * 150 + Math.random() * 60; band.data[i] = v; band.data[i + 1] = v * 0.9; band.data[i + 2] = v * 0.8; band.data[i + 3] = 255; }
      g.putImageData(band, 0, y0);
    }
    const big = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.98)); c.width = c.height = 0;
    return {
      bigIn: big.size,
      big: await run(new File([big], 'photo.jpg', { type: 'image/jpeg' })),
      typeless: await run(new File([big], 'IMG_0001', { type: '' })),                          // type non annoncé (cas iPhone)
      huge: await run(new File([new Uint8Array(hugeBytes)], 'huge.png', { type: 'image/png' })),
      heavy: await run(new File([new Uint8Array(61 * 1024 * 1024)], 'heavy.jpg', { type: 'image/jpeg' })),
      broken: await run(new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], 'broken.jpg', { type: 'image/jpeg' })),
    };
  }, [...huge]);
  ok(res.bigIn > 15 * 1048576, `fausse photo 6000 × 8000 générée : ${(res.bigIn / 1048576).toFixed(1)} Mo`);
  ok(res.big.w === 1500 && res.big.h === 2000 && res.big.full <= 5 * 1048576 && !res.big.meta,
    `photo 6000 × 8000 de ${(res.bigIn / 1048576).toFixed(0)} Mo convertie : ${res.big.w} × ${res.big.h}, ${Math.round(res.big.full / 1024)} Ko ${res.big.type}, sans métadonnées`, JSON.stringify(res.big));
  ok(res.typeless.w === 1500, 'image sans type annoncé : lue quand même', JSON.stringify(res.typeless));
  ok(res.huge.code === 'eHuge', 'image de 110 mégapixels refusée avec un message clair (eHuge)', JSON.stringify(res.huge));
  ok(res.heavy.code === 'eHuge', 'fichier de plus de 60 Mo refusé avec un message clair (eHuge)', JSON.stringify(res.heavy));
  ok(res.broken.code === 'eDecode', 'fichier illisible refusé avec un message clair (eDecode)', JSON.stringify(res.broken));
  await ic.close();
}

/* Vidéos : l'image fixe sur le mur (aucun téléchargement de la vidéo), lecture à l'ouverture, libération à la fermeture */
{
  const vrow = (id, days) => ({
    id, kind: 'video', text: '', name: '', size: 'm', prompt: '', duration: 2,
    image_path: `${id}.mp4`, thumb_path: `${id}-poster.jpg`, width: 480, height: 270,
    created_at: new Date(now - days * DAY).toISOString(), approved_at: new Date(now - days * DAY).toISOString(),
  });
  const vrows = [vrow('vid-new', 0), ...rows.slice(1, 8), vrow('vid-old', 120)];
  for (const reduce of [false, true]) {
    const vc = await browser.newContext({ ...devices['iPhone 12'], reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await fakeServer(vc, vrows);
    const vp = await vc.newPage();
    vp.on('pageerror', e => errors.push(e.message));
    mp4Requests.length = 0;
    await vp.goto(BASE);
    await vp.waitForFunction(() => document.querySelectorAll('#wall .item--video').length === 2 && [...document.querySelectorAll('#wall .item')].every(li => li.style.top));
    await vp.waitForTimeout(400);
    if (!reduce) {
      const wall = await vp.evaluate(() => [...document.querySelectorAll('#wall .item--video')].map(li => ({
        img: li.querySelector('.photo img')?.dataset.src || li.querySelector('.photo img')?.getAttribute('src') || '',
        mark: !!li.querySelector('.vmark'), video: !!li.querySelector('video'), age: (li.className.match(/age-(\d)/) || [])[1] || '0',
        filter: getComputedStyle(li.querySelector('.photo img')).filter,
      })));
      ok(wall.every(w => w.img.endsWith('-poster.jpg') && w.mark && !w.video), 'mur : une vidéo s’affiche comme son image fixe, avec un petit ▶', JSON.stringify(wall));
      ok(wall[1].age === '4' && wall[1].filter.includes('#erode4'), 'mur : l’image fixe d’une vieille vidéo suit les paliers d’érosion des photos', JSON.stringify(wall[1]));
      ok(mp4Requests.length === 0, `mur : aucune vidéo téléchargée tant qu’on ne l’ouvre pas (${mp4Requests.length})`);
      await vp.evaluate(() => document.querySelector('#viewBtn').click()); await vp.waitForTimeout(400);
      const list = await vp.evaluate(() => [...document.querySelectorAll('#list .row--video')].map(r => ({ mark: !!r.querySelector('.vmark'), video: !!r.querySelector('video') })));
      ok(list.length === 2 && list.every(r => r.mark && !r.video) && mp4Requests.length === 0, 'liste : image fixe + ▶, aucune vidéo téléchargée', JSON.stringify(list));
      await vp.evaluate(() => document.querySelector('#viewBtn').click()); await vp.waitForTimeout(400);
    }
    await vp.locator('#wall .item--video').first().tap();
    await vp.waitForSelector('#viewer[open] video');
    await vp.waitForTimeout(800);
    const open = await vp.evaluate(() => {
      const v = document.querySelector('#viewer video');
      return { src: v.getAttribute('src') || '', muted: v.muted, loop: v.loop, inline: v.playsInline, autoplay: v.autoplay, paused: v.paused,
        button: !!document.querySelector('#viewer .vplay'), filter: getComputedStyle(v).filter, canPlay: v.canPlayType('video/mp4; codecs="avc1.42E01E"') };
    });
    ok(open.src.endsWith('vid-new.mp4') && mp4Requests.length > 0, `${reduce ? '« Réduire les animations » : ' : ''}ouverture : la vidéo est téléchargée à ce moment-là`, JSON.stringify(open));
    ok(open.muted && open.loop && open.inline && open.filter === 'none', 'agrandissement : vidéo muette, en boucle, neuve (aucun filtre d’érosion)', JSON.stringify(open));
    if (reduce) ok(!open.autoplay && open.paused && open.button, '« Réduire les animations » : pas de lecture automatique, un bouton ▶', JSON.stringify(open));
    else ok(open.autoplay && !open.button, 'lecture automatique (muette) à l’ouverture', JSON.stringify(open));
    if (open.canPlay && !reduce) {
      const played = await vp.waitForFunction(() => document.querySelector('#viewer video').currentTime > 0.2, null, { timeout: 8000 }).then(() => true, () => false);
      ok(played, 'la vidéo joue vraiment (navigateur avec H.264)');
    } else if (!open.canPlay) console.log('SAUTÉ  lecture réelle : ce Chromium de test ne lit pas le H.264 (vérifiée dans GitHub avec Google Chrome, puis sur iPhone)');
    await vp.keyboard.press('Escape');
    await vp.waitForSelector('#viewer:not([open])', { state: 'attached' });
    // l'événement « close » (qui libère la vidéo) arrive juste APRÈS la fermeture : on l'attend (2 s au plus)
    await vp.waitForFunction(() => !document.querySelector('#viewerBody').childElementCount, null, { timeout: 2000 }).catch(() => {});
    const closed = await vp.evaluate(() => ({ videos: document.querySelectorAll('video').length, body: document.querySelector('#viewerBody').childElementCount }));
    ok(closed.videos === 0 && closed.body === 0, 'fermeture : la vidéo est arrêtée et libérée de la mémoire', JSON.stringify(closed));
    // Keep : le fragment utilise l'image fixe érodée
    if (!reduce) {
      const frag = await vp.evaluate(async () => {
        const { makeFragment } = await import('/js/fragment.js');
        const li = document.querySelectorAll('#wall .item--video')[1];
        const out = await makeFragment({ li, wallEl: document.querySelector('#wall') });
        return out.photos;
      });
      ok(frag.drawn > 0 && frag.missing === 0, 'Keep : la vidéo apparaît dans le fragment par son image fixe', JSON.stringify(frag));
    }
    await vc.close();
  }
}

/* Fuseaux : le MUR suit le fuseau de référence Asia/Tokyo pour tout le monde ; la DATE du fragment suit le téléphone */
{
  const row = (id, created, prompt, kind = 'image') => ({
    id, kind, text: kind === 'text' ? 'mot' : '', name: '', size: 'm', prompt,
    image_path: kind === 'image' ? `${id}.jpg` : null, thumb_path: kind === 'image' ? `${id}-t.jpg` : null,
    width: kind === 'image' ? 37 : null, height: kind === 'image' ? 23 : null, created_at: created, approved_at: created,
  });
  // heure de Tokyo — a : 10 oct. 0 h 10 ; c : 1er oct. 0 h 20 (encore le 30 sept. à Paris, LA et en UTC) ; b : 30 sept. 23 h 50
  // (dans l'ordre du serveur : du plus récent au plus ancien)
  const tz = [row('tz-a', '2026-10-09T15:10:00Z', 'light'), row('tz-c', '2026-09-30T15:20:00Z', 'light', 'text'), row('tz-b', '2026-09-30T14:50:00Z', 'light')];
  const cases = [
    { zone: 'Asia/Tokyo', now: '2026-10-09T15:30:00Z', footer: '10.10.2026' },           // 10 oct. 0 h 30 à Tokyo
    { zone: 'Europe/Paris', now: '2026-09-30T15:30:00Z', footer: '30.09.2026' },         // 30 sept. 17 h 30 à Paris (= 1er oct. 0 h 30 à Tokyo)
    { zone: 'America/Los_Angeles', now: '2026-10-09T15:30:00Z', footer: '09.10.2026' },  // 9 oct. 8 h 30 à Los Angeles
  ];
  for (const { zone, now: at, footer } of cases) {
    const tk = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: zone, acceptDownloads: true });
    await fakeServer(tk, tz, 'light');
    const tp = await tk.newPage();
    tp.on('pageerror', e => errors.push(e.message));
    await tp.clock.setFixedTime(Date.parse(at));       // l'heure du téléphone (les minuteries restent réelles)
    await tp.goto(BASE);
    await tp.waitForFunction(() => document.querySelectorAll('#wall .item').length === 3 && [...document.querySelectorAll('#wall .item')].every(li => li.style.top));
    const real = await tp.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    // a et c en octobre (heure de Tokyo, strate en cours : pas de filet au-dessus), b en septembre → un seul filet, entre c et b
    const st = await tp.evaluate(() => {
      const items = [...document.querySelectorAll('#wall .item')];
      const img = id => items.find(li => (li.querySelector('img')?.dataset.src || li.querySelector('img')?.src || '').includes(id))?.offsetTop;
      return { rules: [...document.querySelectorAll('#wall .stratum')].map(s => s.offsetTop), a: img('tz-a'), b: img('tz-b'), c: items.find(li => li.classList.contains('item--text'))?.offsetTop };
    });
    ok(real === zone && st.rules.length === 1 && st.rules[0] > Math.max(st.a, st.c) && st.rules[0] < st.b,
      `${zone} : le mur est le même partout (mois à l'heure de Tokyo : 1er oct. 0 h 20 en octobre, un seul filet)`, JSON.stringify({ real, ...st }));
    await tp.locator('#wall .item.item--image').first().click(); await tp.waitForSelector('#viewer[open]');
    await tp.click('#keepBtn'); await tp.waitForSelector('#keepGo:not([disabled])', { timeout: 10000 });
    const foot = await tp.evaluate(async () => {
      const { makeFragment } = await import('/js/fragment.js');
      return (await makeFragment({ li: document.querySelector('#wall .item.item--image'), wallEl: document.querySelector('#wall'), prompt: 'light' })).footer;
    });
    ok(foot === `moodwall.pages.dev — ${footer} — light`, `${zone} : la ligne du bas suit la date du téléphone (${at}) : « ${foot} »`);
    const [dl] = await Promise.all([tp.waitForEvent('download'), tp.click('#keepGo')]);
    ok(dl.suggestedFilename().includes(footer.replaceAll('.', '-')), `${zone} : nom du fichier à la date du téléphone : ${dl.suggestedFilename()}`);
    await tk.close();
  }
}

// dépôts EXPIRÉS (à 180 jours, quand l'auteur l'active) : dans la vue List, une ligne de texte façon On Kawara,
// rien à ouvrir ; les autres dépôts s'ouvrent toujours (démonstration ?mock=expired, fausses données)
{
  const ec = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
  await ec.addInitScript(() => localStorage.setItem('view', 'list'));
  const ep = await ec.newPage();
  await ep.goto(`${BASE}?mock=expired`);
  await ep.waitForSelector('.kawara');
  const line = await ep.$eval('.kawara', l => [...l.children].map(x => x.textContent));
  ok(/^[A-Z]{3,5}\.\d{1,2},\d{4}$/.test(line[0]) && ['image', 'video'].includes(line[1]) && line[2] === '180 days', `dépôt expiré : « ${line.join('  ')} » (date, type, durée de vie, consigne)`, JSON.stringify(line));
  ok(!(await ep.$$eval('.row--expired img, .row--expired video, .row--expired button', x => x.length)), 'dépôt expiré : ni image, ni vidéo, ni bouton');
  await ep.click('.row--expired'); await ep.waitForTimeout(200);
  ok(!(await ep.evaluate(() => document.querySelector('#viewer').open)), 'dépôt expiré : un toucher n’ouvre rien');
  await ep.click('.row:not(.row--expired) .item-hit'); await ep.waitForSelector('#viewer[open]');
  ok(/\S/.test(await ep.textContent('#viewerBody')), 'les autres dépôts de la liste s’ouvrent toujours (le bon : un texte)');
  await ec.close();
}

// langue : libellés d'interface en anglais pour tous (FR / JA / EN), seuls les messages, mentions et libellés des
// lecteurs d'écran suivent la langue (du navigateur, ou choisie dans le panneau Mood)
for (const [locale, mention] of [['fr-FR', /modérés/], ['ja-JP', /確認後に掲載/], ['en-GB', /moderated|review/i]]) {
  const lc = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 }, locale });
  await fakeServer(lc);
  const lp = await lc.newPage();
  await lp.goto(BASE);
  await lp.waitForSelector('.item');
  const seen = await lp.evaluate(() => ({
    lang: document.documentElement.lang, drop: document.querySelector('.btn-drop').textContent, report: document.querySelector('#report summary').textContent,
    send: document.querySelector('#send')?.textContent, mail: document.querySelector('[data-contact]').getAttribute('href'),
    mentions: document.querySelector('[data-i18n="mentions"]').textContent, skip: document.querySelector('.skip').textContent,
  }));
  ok(seen.drop === 'Drop' && seen.report === 'Report', `${locale} : libellés en anglais (Drop, Report)`, JSON.stringify(seen));
  ok(seen.lang === locale.slice(0, 2) && mention.test(seen.mentions), `${locale} : mentions et lecteurs d'écran dans la langue du navigateur (« ${seen.skip} »)`, JSON.stringify(seen));
  ok(seen.mail === 'mailto:rikuuux@gmail.com', `${locale} : adresse de contact posée depuis la config`, seen.mail);
  await lc.close();
}

ok(!errors.length, 'aucune erreur JavaScript', errors.join(' ; '));
await browser.close(); server.close();
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests navigateur passent.');

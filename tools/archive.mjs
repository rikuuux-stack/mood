/**
 * Archive nocturne du mur — la preuve de l'érosion dans le temps.
 *
 *   node tools/archive.mjs                      captures de https://moodwall.pages.dev, envoyées dans le bucket PRIVÉ « archive »
 *   node tools/archive.mjs --out dossier        captures gardées en local, rien n'est envoyé (essai)
 *   node tools/archive.mjs --fake --out dossier site local + fausses données (tests/fixtures.mjs), pour essayer sans réseau
 *
 * Chaque nuit (GitHub Actions, 03:00 heure de Tokyo, .github/workflows/supabase.yml) :
 *   archive/AAAA-MM-JJ/iphone.jpg    le mur entier, vue iPhone (390 px de large, pleine page)
 *   archive/AAAA-MM-JJ/desktop.jpg   le mur entier, vue ordinateur (1440 px de large, pleine page)
 *   archive/AAAA-MM-JJ/state.json    date, dépôts visibles (id, dates, âge, palier d'érosion, strate), consigne du mois
 *
 * Même cadrage chaque nuit (même largeur, même échelle, depuis le haut) : un time-lapse est possible.
 * Une seule visite du site par vue ; rien n'est déposé ni modifié sur le mur ; « Réduire les animations »
 * est simulé (aucune animation au moment de la capture). Envoi : clé service_role lue par le workflow avec
 * le jeton Supabase déjà présent dans les secrets GitHub (SERVICE_KEY, jamais écrite dans le dépôt).
 * Budget : l'archive ne dépasse pas ARCHIVE_MAX (200 Mo) ; au-delà, la nuit n'est pas envoyée (message d'erreur).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { visibility, stageOf, ageDays, onWall, strataKey } from '../js/wall.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
const SUPABASE = cfg.match(/supabaseUrl: '([^']+)'/)[1];
const ANON = cfg.match(/supabaseAnonKey: '([^']+)'/)[1];
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const FAKE = args.includes('--fake');
const SITE = process.env.SITE_URL || 'https://moodwall.pages.dev/';
const SERVICE = process.env.SERVICE_KEY || '';
const BUCKET = 'archive';
const ARCHIVE_MAX = 200 * 1024 * 1024;           // garde-fou : 200 Mo pour toute l'archive (offre gratuite : 1 Go en tout)
const TARGET = 400 * 1024;                       // poids visé par capture (JPEG) : ≤ 400 Ko
const QUALITIES = [70, 60, 50, 42, 35, 28];      // qualité JPEG essayée, de la meilleure à la plus légère
const MAX_H = 30000;                             // hauteur maximale capturée (px CSS) : au-delà, le haut du mur seulement

const req = createRequire(import.meta.url);
let playwright;
try { playwright = req('playwright'); } catch { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { chromium } = playwright;

/** Date du jour à Tokyo (fuseau de référence du mur) : AAAA-MM-JJ. */
const tokyoDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ données du mur (lecture publique, comme le site) */
async function readWall() {
  const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  const rows = [];
  for (let off = 0; ; off += 500) {
    const q = new URLSearchParams({ select: 'id,kind,size,prompt,created_at,approved_at', order: 'approved_at.desc', offset: String(off), limit: '500' });
    const r = await fetch(`${SUPABASE}/rest/v1/wall?${q}`, { headers: H });
    if (!r.ok) throw new Error(`mur illisible : HTTP ${r.status}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 500) break;
  }
  const pr = await fetch(`${SUPABASE}/rest/v1/current_prompt?select=text`, { headers: H });
  const prompt = pr.ok ? ((await pr.json())[0]?.text || '') : '';
  return { rows, prompt };
}

/** État du mur au moment de la capture : les mêmes règles que le site (js/wall.js). */
function wallState(rows, prompt, now = Date.now()) {
  const posts = rows.map(p => {
    const approvedAt = p.approved_at || p.created_at, days = ageDays(approvedAt, now);
    return {
      id: p.id, kind: p.kind, size: p.size || 'm', created: p.created_at, approved: approvedAt,
      age_days: Math.round(days * 10) / 10, stage: stageOf(visibility(days)),
      stratum: strataKey({ createdAt: p.created_at, prompt: p.prompt }), on_wall: onWall(days),
    };
  });
  return {
    date: tokyoDate(new Date(now)), captured_at: new Date(now).toISOString(), site: SITE, prompt,
    wall: posts.filter(p => p.on_wall).map(({ on_wall, ...p }) => p),
    list_only: posts.filter(p => !p.on_wall).length,
  };
}

/* ------------------------------------------------------------------ capture */
async function capture(browser, { width, height, mobile, scale }, url, route) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile,
    reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  if (route) await route(ctx);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);                       // paquets suivants du mur, placement progressif
  // toute la hauteur du mur dans la fenêtre : chaque image est « à l'approche de l'écran » (chargée) et
  // aucune n'est « au-delà de 3 écrans » (libérée) ; la largeur, seule, décide de la composition
  const full = async () => Math.min(MAX_H, await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight)));
  let h = await full();
  await page.setViewportSize({ width, height: h });
  await page.waitForTimeout(500);
  h = await full();
  await page.setViewportSize({ width, height: h });
  // toutes les images chargées (ou en échec) avant la capture, 60 s au plus
  await page.waitForFunction(() => [...document.querySelectorAll('.item img')].every(im => !im.dataset.src && im.complete), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);                        // fondu d'apparition des images (220 ms)
  const images = await page.evaluate(() => { const im = [...document.querySelectorAll('.item img')]; return { total: im.length, broken: im.filter(i => !i.complete || !i.naturalWidth).length }; });
  let shot, quality;
  for (quality of QUALITIES) {
    shot = await page.screenshot({ type: 'jpeg', quality, fullPage: false, clip: { x: 0, y: 0, width, height: h } });
    if (shot.length <= TARGET) break;
  }
  await ctx.close();
  return { jpeg: shot, meta: { width, height: h, scale, quality, bytes: shot.length, images: images.total, broken: images.broken, cut: h >= MAX_H } };
}

/* ------------------------------------------------------------------ envoi (bucket privé « archive ») */
const S = () => ({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}` });
async function ensureBucket() {
  const r = await fetch(`${SUPABASE}/storage/v1/bucket/${BUCKET}`, { headers: S() });
  if (r.ok) { const b = await r.json(); if (b.public) throw new Error('le bucket « archive » est PUBLIC : envoi annulé'); return; }
  const c = await fetch(`${SUPABASE}/storage/v1/bucket`, {
    method: 'POST', headers: { ...S(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ['image/jpeg', 'application/json'] }),
  });
  if (!c.ok) throw new Error(`création du bucket « archive » impossible : HTTP ${c.status} ${await c.text()}`);
  console.log('bucket privé « archive » créé');
}
async function list(prefix) {
  const r = await fetch(`${SUPABASE}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST', headers: { ...S(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!r.ok) throw new Error(`liste de l'archive illisible : HTTP ${r.status}`);
  return r.json();
}
async function archiveSize(except) {
  let total = 0;
  for (const d of await list('')) {
    if (d.id || d.name === except) continue;             // d.id nul : un dossier (une nuit)
    for (const f of await list(`${d.name}/`)) total += f.metadata?.size || 0;
  }
  return total;
}
async function upload(name, body, type) {
  const r = await fetch(`${SUPABASE}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST', headers: { ...S(), 'Content-Type': type, 'x-upsert': 'true', 'cache-control': 'max-age=3600' }, body,
  });
  if (!r.ok) throw new Error(`envoi de ${name} impossible : HTTP ${r.status} ${await r.text()}`);
}

/* ------------------------------------------------------------------ site local + fausses données (--fake) */
async function fakeSite() {
  const { SAMPLE_POSTS } = await import('../tests/fixtures.mjs');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const server = http.createServer((rq, rs) => {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rs);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const DAY = 86400e3, now = Date.now();
  const rows = SAMPLE_POSTS.slice(0, 24).map((p, i) => {
    const approved = new Date(now - (i / 23) * 170 * DAY);
    return { id: `f-${i}`, kind: p.kind, text: p.text || '', name: '', size: ['s', 'm', 'l'][i % 3], prompt: ['trace', 'light', ''][Math.floor(i / 8)],
      image_path: p.image ? `f-${i}.jpg` : null, thumb_path: p.image ? `f-${i}-t.jpg` : null, width: p.image?.w ?? null, height: p.image?.h ?? null,
      created_at: new Date(approved - 3600e3).toISOString(), approved_at: approved.toISOString() };
  });
  const JPG = fs.readFileSync(path.join(ROOT, 'tests/fixtures-img/clean.jpg'));
  const route = async ctx => ctx.route(/supabase\.co\//, r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/rest/v1/wall')) { const o = +u.searchParams.get('offset') || 0; return r.fulfill({ json: rows.slice(o, o + (+u.searchParams.get('limit') || 30)) }); }
    if (u.pathname.endsWith('/rest/v1/current_prompt')) return r.fulfill({ json: [{ text: 'trace' }] });
    if (u.pathname.includes('/storage/v1/object/public/')) return r.fulfill({ body: JPG, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } });
    return r.fulfill({ status: 404, json: {} });
  });
  return { url: `http://127.0.0.1:${server.address().port}/`, rows, route, close: () => server.close() };
}

/* ------------------------------------------------------------------ nuit */
const VIEWS = { iphone: { width: 390, height: 844, mobile: true, scale: 2 }, desktop: { width: 1440, height: 900, mobile: false, scale: 1 } };

let site = null, state;
if (FAKE) site = await fakeSite();
const url = FAKE ? site.url : SITE;
if (FAKE) state = wallState(site.rows, 'trace');
else { const { rows, prompt } = await readWall(); state = wallState(rows, prompt); }
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const shots = {};
for (const [name, view] of Object.entries(VIEWS)) {
  shots[name] = await capture(browser, view, url, site?.route);
  console.log(`${name} : ${shots[name].meta.width} × ${shots[name].meta.height} px (× ${view.scale}), JPEG q${shots[name].meta.quality}, ${Math.round(shots[name].meta.bytes / 1024)} Ko, ${shots[name].meta.images} images${shots[name].meta.broken ? `, ${shots[name].meta.broken} NON chargées` : ''}${shots[name].meta.cut ? ', COUPÉE en bas' : ''}`);
}
await browser.close();
site?.close();
state.captures = Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.meta]));
const json = Buffer.from(JSON.stringify(state, null, 1));
const night = Object.values(shots).reduce((s, v) => s + v.jpeg.length, 0) + json.length;
console.log(`nuit ${state.date} : ${state.wall.length} dépôt(s) sur le mur, ${state.list_only} dans la liste seulement ; ${Math.round(night / 1024)} Ko en tout`);

if (OUT) {
  const dir = path.join(OUT, state.date);
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries(shots)) fs.writeFileSync(path.join(dir, `${k}.jpg`), v.jpeg);
  fs.writeFileSync(path.join(dir, 'state.json'), json);
  console.log(`gardé en local : ${dir}`);
} else {
  if (!SERVICE) throw new Error('SERVICE_KEY absente : rien envoyé (voir le workflow)');
  await ensureBucket();
  const used = await archiveSize(state.date);
  console.log(`archive avant cette nuit : ${(used / 1048576).toFixed(1)} Mo`);
  if (used + night > ARCHIVE_MAX) throw new Error(`archive pleine (${(used / 1048576).toFixed(1)} Mo + cette nuit > ${ARCHIVE_MAX / 1048576} Mo) : nuit NON envoyée — supprimer de vieilles nuits dans /admin/ ▸ Archive`);
  for (const [k, v] of Object.entries(shots)) await upload(`${state.date}/${k}.jpg`, v.jpeg, 'image/jpeg');
  await upload(`${state.date}/state.json`, json, 'application/json');
  console.log(`envoyé : ${BUCKET}/${state.date}/ (iphone.jpg, desktop.jpg, state.json)`);
}

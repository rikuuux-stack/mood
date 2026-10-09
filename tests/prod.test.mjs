/**
 * Contrôle de la PRODUCTION (https://moodwall.pages.dev, ou PROD_URL) dans un vrai navigateur :
 * aucune requête en erreur (≥ 400) au chargement, et chaque image du premier écran s'affiche.
 *
 *   PW_CHANNEL=chrome node tests/prod.test.mjs
 *
 * Lancé par GitHub Actions après les tests de bout en bout (.github/workflows/supabase.yml) : les sessions
 * Claude n'atteignent ni le site ni Supabase. Ne dépose rien, ne lit que ce qu'un visiteur voit.
 * Deux visites par appareil : la première (rien en mémoire), puis un rechargement (mur gardé sur l'appareil).
 */
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
let playwright;
try { playwright = req('playwright'); } catch { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { chromium, webkit, devices } = playwright;
const URL_ = process.env.PROD_URL || 'https://moodwall.pages.dev/';

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `\n        ${extra}`}`); if (!cond) failed++; };

// Chrome (comme dans les autres tests) ET le moteur de Safari (WebKit), sur iPhone simulé et sur ordinateur
const engines = [['Chrome', () => chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})], ['Safari (WebKit)', () => webkit.launch()]];
for (const [engine, launch] of engines) {
let browser;
try { browser = await launch(); } catch (e) { console.log(`(${engine} indisponible : ${e.message.split('\n')[0]})`); continue; }
for (const [device, opts] of [['iPhone 12', { ...devices['iPhone 12'] }], ['ordinateur', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  for (const visit of ['première visite', 'rechargement', 'avec mes dépôts en attente (copies locales image, vidéo, texte)']) {
    const bad = [], consoleErrors = [];
    const onResponse = async r => {
      if (r.status() < 400) return;
      let body = '';
      try { body = (await r.text()).slice(0, 200).replace(/\s+/g, ' '); } catch {}
      const rq = r.request();
      bad.push(`${r.status()} ${rq.method()} ${rq.resourceType()} ${r.url()}\n          en-têtes : ${JSON.stringify(Object.fromEntries(Object.entries(rq.headers()).filter(([k]) => /range|origin|accept$|sec-fetch-mode/.test(k))))}\n          réponse : ${body}`);
    };
    const onFailed = rq => bad.push(`échec réseau ${rq.method()} ${rq.resourceType()} ${rq.url()} : ${rq.failure()?.errorText}`);
    const onConsole = m => { if (m.type() === 'error') consoleErrors.push(m.text()); };
    page.on('response', onResponse); page.on('requestfailed', onFailed); page.on('console', onConsole);
    if (visit.startsWith('avec')) {
      // comme après un dépôt : la copie gardée par le navigateur (js/data.js, mood-pending-v1), image de 40 × 30 générée
      await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 40; c.height = 30;
        const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, 40, 30);
        const d = c.toDataURL('image/jpeg', 0.7), now = new Date().toISOString(), base = { name: '', size: 'm', prompt: '', createdAt: now, approvedAt: now };
        localStorage.setItem('mood-pending-v1', JSON.stringify([
          { ...base, id: '00000000-0000-4000-8000-000000000001', kind: 'video', text: '', image: { src: d, thumb: d, w: 40, h: 30 } },
          { ...base, id: '00000000-0000-4000-8000-000000000002', kind: 'image', text: 'x', image: { src: d, thumb: d, w: 40, h: 30 } },
          { ...base, id: '00000000-0000-4000-8000-000000000003', kind: 'text', text: 'trace', image: null }]));
      });
    }
    if (visit === 'première visite') await page.goto(URL_, { waitUntil: 'networkidle' }); else await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // images du premier écran : affichées (naturalWidth > 0) ?
    const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].filter(im => {
      const b = im.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.width > 0;
    }).map(im => ({ src: im.currentSrc || im.src || '(vide)', ok: im.complete && im.naturalWidth > 0, item: im.closest('[data-id]')?.dataset.id || '', cls: im.closest('.item, .row')?.className || '' })));
    const broken = imgs.filter(i => !i.ok);
    console.log(`\n${engine}, ${device}, ${visit} : ${imgs.length} image(s) au premier écran`);
    ok(!bad.length, 'aucune requête en erreur', bad.join('\n        '));
    ok(!broken.length, 'chaque image du premier écran s’affiche', broken.map(b => `${b.item} [${b.cls}] ${b.src}`).join('\n        '));
    if (consoleErrors.length) console.log(`        console : ${consoleErrors.join(' | ')}`);
    page.off('response', onResponse); page.off('requestfailed', onFailed); page.off('console', onConsole);
  }
  await ctx.close();
}
await browser.close();
}
if (failed) { console.log(`\n${failed} contrôle(s) en échec.`); process.exit(1); }
console.log('\nProduction : aucun appel en erreur, toutes les images du premier écran s’affichent.');

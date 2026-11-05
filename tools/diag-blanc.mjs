// DIAGNOSTIC JETABLE (branche claude/diag-blanc, jamais fusionnée) :
// 1. nombre de dépôts du mur public par type (aucune donnée personnelle affichée) ;
// 2. la transparence des filtres #tone / #erode4 est-elle appliquée par WebKit (moteur de Safari) et Chromium ?
// 3. la page d'aperçu réelle (claude-blanc) en WebKit iPhone : part de pixels noirs dans les images.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { chromium, webkit, devices } = req('playwright');
const cfg = fs.readFileSync('js/config.js', 'utf8');
const URL_ = cfg.match(/supabaseUrl: '([^']+)'/)[1], KEY = cfg.match(/supabaseAnonKey: '([^']+)'/)[1];
const r = await fetch(`${URL_}/rest/v1/wall?select=kind`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const rows = await r.json();
const by = {}; for (const x of rows) by[x.kind] = (by[x.kind] || 0) + 1;
console.log('MUR PUBLIC :', rows.length, 'dépôts ;', JSON.stringify(by));

const svg = fs.readFileSync('index.html', 'utf8').match(/<svg width="0"[\s\S]*?<\/svg>/)[0];
// image d'essai : bande blanche (→ noir en négatif), bande gris moyen, bande noire (→ clair en négatif)
const page = `<!doctype html><html><body style="margin:0;background:rgb(255,0,0)">${svg}
<canvas id="c" width="300" height="100" style="display:none"></canvas>
<img id="a" style="display:block;filter:url(#tone)"><img id="b" style="display:block;filter:url(#erode4)">
<script>
const c=document.getElementById('c'),g=c.getContext('2d');
g.fillStyle='#fff';g.fillRect(0,0,100,100);g.fillStyle='#888';g.fillRect(100,0,100,100);g.fillStyle='#000';g.fillRect(200,0,100,100);
const u=c.toDataURL();document.getElementById('a').src=u;document.getElementById('b').src=u;
</script></body></html>`;
for (const [name, bt] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await bt.launch(); const p = await b.newPage({ viewport: { width: 300, height: 200 } });
  await p.setContent(page); await p.waitForTimeout(800);
  const shot = await p.screenshot({ clip: { x: 0, y: 0, width: 300, height: 200 } });
  fs.writeFileSync(`diag-${name}.png`, shot);
  const px = await p.evaluate(async b64 => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
    return { tone_blanc: at(50, 50), tone_gris: at(150, 50), tone_noir: at(250, 50), erode4_blanc: at(50, 150), erode4_gris: at(150, 150), erode4_noir: at(250, 150) };
  }, shot.toString('base64'));
  console.log(`FILTRES ${name} (fond ROUGE : rouge = transparent) :`, JSON.stringify(px));
  await b.close();
}
// attendre que l'aperçu porte le nouveau réglage (seuil 0,45)
for (let i = 0; i < 30; i++) { const h = await (await fetch('https://claude-blanc.moodwall.pages.dev/?' + Date.now())).text(); if (h.includes('6.6667')) { console.log('aperçu à jour'); break; } await new Promise(r => setTimeout(r, 10000)); }
// page réelle en WebKit iPhone
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 12'] });
const p = await ctx.newPage();
await p.goto('https://claude-blanc.moodwall.pages.dev/', { waitUntil: 'networkidle' }).catch(e => console.log('goto', e.message));
await p.waitForTimeout(4000);
const info = await p.evaluate(() => [...document.querySelectorAll('#wall .photo img')].slice(0, 12).map(i => ({ f: getComputedStyle(i).filter, loaded: i.complete && i.naturalWidth > 0 })));
console.log('APERÇU claude-blanc (WebKit iPhone) : images', info.length, JSON.stringify(info.slice(0, 3)));
// pour chaque photo du mur : répartition des gris du NÉGATIF (avant transparence), et ce qu'on voit à l'écran
const stats = await p.evaluate(async () => {
  const out = [];
  for (const img of [...document.querySelectorAll('#wall .photo img')]) {
    const c = document.createElement('canvas'), w = 64, h = Math.max(1, Math.round(64 * img.naturalHeight / img.naturalWidth));
    c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, TONE = [0, 0.24, 0.47, 0.64, 0.76];
    const neg = l => { const q = Math.min(3.999, (1 - l) * 4), i = q | 0; return TONE[i] + (TONE[i + 1] - TONE[i]) * (q - i); };
    const bins = [0, 0, 0, 0, 0, 0, 0, 0];                // négatif : 0-0.1, 0.1-0.2, … 0.7-0.8
    for (let k = 0; k < d.length; k += 4) { const v = neg((0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255); bins[Math.min(7, Math.floor(v * 10))]++; }
    const n = d.length / 4;
    out.push({ stage: img.closest('.item')?.className.match(/age-(\d)/)?.[1] || '0', neg: bins.map(b => Math.round(100 * b / n)) });
  }
  return out;
});
for (const x of stats) console.log('PHOTO palier', x.stage, '— négatif, % de pixels par tranche 0-0.1 … 0.7-0.8 :', x.neg.join(' '));
const sh = await p.screenshot({ fullPage: true });
const rects = await p.evaluate(() => [...document.querySelectorAll('#wall .photo img')].map(i => { const r = i.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.width, r.height].map(Math.round); }));
const seen = await p.evaluate(async ({ b64, rects }) => {
  const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const k = im.width / innerWidth;
  return rects.map(([x, y, w, h]) => { const d = g.getImageData(x * k, y * k, Math.max(1, w * k), Math.max(1, h * k)).data; let white = 0, dark = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v >= 245) white++; else if (v < 90) dark++; } return [Math.round(100 * white / n), Math.round(100 * dark / n)]; });
}, { b64: sh.toString('base64'), rects });
console.log('À L\'ÉCRAN (WebKit iPhone), par photo [% blanc (transparent ou presque), % sombre (< 90/255)] :', JSON.stringify(seen));
await b.close();

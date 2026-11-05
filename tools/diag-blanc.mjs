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
// page réelle en WebKit iPhone
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 12'] });
const p = await ctx.newPage();
await p.goto('https://claude-blanc.moodwall.pages.dev/', { waitUntil: 'networkidle' }).catch(e => console.log('goto', e.message));
await p.waitForTimeout(4000);
const info = await p.evaluate(() => [...document.querySelectorAll('#wall .photo img')].slice(0, 12).map(i => ({ f: getComputedStyle(i).filter, loaded: i.complete && i.naturalWidth > 0 })));
console.log('APERÇU claude-blanc (WebKit iPhone) : images', info.length, JSON.stringify(info.slice(0, 3)));
await p.screenshot({ path: 'diag-apercu-webkit.png' });
await b.close();

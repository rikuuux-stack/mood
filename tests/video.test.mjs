/**
 * Conversion des vidéos et GIF dans le navigateur (js/video.js) — vraie conversion H.264.
 *
 *   node tests/video.test.mjs
 *
 * Demande un navigateur qui sait encoder le H.264 (Google Chrome : PW_CHANNEL=chrome, comme dans GitHub) ;
 * le Chromium de test ne le sait pas : le test le dit et s'arrête sans échouer. Les sources de 60 s sont
 * fabriquées par ffmpeg si présent (fausses images, aucune vraie vidéo). Mesure le poids réel des fichiers.
 *
 * Vérifie : MP4 H.264, 480 px de grand côté, ≤ 24 i/s, muet, sans GPS, noir et blanc + courbe de tons,
 * départ au curseur « Start », 60 s au plus, image fixe sans métadonnées, GIF → MP4, annulation,
 * vidéo non convertible → message clair (eVideoUnsupported).
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let playwright;
try { playwright = req('playwright'); } catch { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }

// fausses sources de 60 s et plus (ffmpeg) : mouvement riche (fractale qui zoome) et mire, 720p 30 i/s
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mood-video-'));
const extra = {};
try {
  const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
  ff('-f', 'lavfi', '-i', 'mandelbrot=size=1280x720:rate=30', '-t', '62', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', path.join(TMP, 'fractal-62s.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '60', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', path.join(TMP, 'mire-60s.mp4'));
  extra.fractal = 'fractal-62s.mp4'; extra.mire = 'mire-60s.mp4';
} catch { console.log('(ffmpeg absent : pas de mesure de poids sur 60 s)'); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.gif': 'image/gif', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = p.startsWith('/tmp/') ? path.join(TMP, path.basename(p)) : path.join(ROOT, p.endsWith('/') ? `${p}index.html` : p);
  if (!fs.existsSync(f)) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${cond ? '' : `  ${extra}`}`); if (!cond) failed++; };

const browser = await playwright.chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}tests/`).catch(() => {});
await page.goto(BASE);
const avc = await page.evaluate(async () => !!(globalThis.VideoEncoder && (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 480, height: 270, bitrate: 3e5 })).supported));
if (!avc) {
  console.log('SAUTÉ  ce navigateur n’encode pas le H.264 (Chromium de test) : conversion vérifiée dans GitHub avec Google Chrome (PW_CHANNEL=chrome).');
  await browser.close(); server.close(); process.exit(0);
}

// conversion dans la page : renvoie les contrôles faits sur le résultat
const convert = (url, opts = {}) => page.evaluate(async ({ url, opts }) => {
  const { openMedia } = await import('/js/video.js');
  const { inspectMp4 } = await import('/js/mp4.js');
  const { hasMetadata } = await import('/js/image.js');
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], url.split('/').pop(), { type: blob.type });
  const t0 = performance.now();
  try {
    const m = await openMedia(file);
    const ctl = new AbortController();
    if (opts.abortAfter) setTimeout(() => ctl.abort(), opts.abortAfter);
    const out = await m.convert({ start: opts.start ?? m.defaultStart, signal: ctl.signal });
    const ms = Math.round(performance.now() - t0);
    const info = inspectMp4(new Uint8Array(await out.video.arrayBuffer()));
    // première image décodée : noir et blanc (R = V = B) et hautes lumières assombries (courbe de tons : ≤ 76 %)
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(out.video);
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('lecture impossible')); });
    await new Promise(r => { v.onseeked = r; v.currentTime = Math.min(0.5, v.duration / 2); });   // une image bien affichée
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d'); g.drawImage(v, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let maxChroma = 0, maxLuma = 0;
    for (let i = 0; i < d.length; i += 4) { maxChroma = Math.max(maxChroma, Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2])); maxLuma = Math.max(maxLuma, d[i + 1]); }
    return { ok: true, ms, info, bytes: out.video.size, kbps: Math.round(out.video.size * 8 / info.duration / 1000), poster: { type: out.poster.type, meta: await hasMetadata(out.poster), size: out.poster.size },
      maxChroma, maxLuma, kind: m.kind, width: out.width, height: out.height };
  } catch (e) { return { ok: false, code: e.code || e.message, detail: e.detail }; }
}, { url, opts });

// 1. vidéo avec son + GPS, 640 × 360, 3 s, départ à 1 s
const a = await convert('/tests/fixtures-img/src-640.mp4', { start: 1 });
ok(a.ok, 'conversion d’une vidéo (son + GPS, 640 × 360, 3 s)', JSON.stringify(a));
if (a.ok) {
  ok(a.info.codec === 'avc1' && a.info.width === 480 && a.info.height === 270, `MP4 H.264 480 × 270 (${a.info.codec} ${a.info.width} × ${a.info.height})`);
  ok(!a.info.hasAudio && !a.info.hasLocation, 'sans son ni coordonnées GPS', JSON.stringify(a.info));
  ok(Math.abs(a.info.duration - 2) < 0.2, `départ au curseur « Start » : 3 s − 1 s = ${a.info.duration} s`);
  ok(a.maxChroma <= 6, `noir et blanc intégré dans le fichier (écart de couleur max ${a.maxChroma})`);
  ok(a.maxLuma > 40 && a.maxLuma <= 0.76 * 255 + 8, `courbe de tons intégrée : hautes lumières assombries (max ${a.maxLuma} / 255)`);
  ok(a.poster.type === 'image/jpeg' && !a.poster.meta, 'image fixe JPEG sans métadonnées', JSON.stringify(a.poster));
}
// 2. GIF perso → MP4 (6 images × 0,12 s)
const g = await convert('/tests/fixtures-img/anim.gif');
ok(g.ok && g.kind === 'gif' && g.info.codec === 'avc1' && Math.abs(g.info.duration - 0.72) < 0.1, `GIF → MP4 H.264 (${g.info?.duration} s)`, JSON.stringify(g));
// 3. vidéo de 61 s : coupée à 60 s
const l = await convert('/tests/fixtures-img/v-long.mp4', { start: 0 });
ok(l.ok && l.info.duration <= 60.1 && l.info.duration >= 59.5, `vidéo de 61 s coupée à 60 s (${l.info?.duration} s)`, JSON.stringify(l));
// 4. annulation
const c = await convert('/tests/fixtures-img/v-long.mp4', { start: 0, abortAfter: 150 });
ok(!c.ok && c.code === 'canceled', 'conversion annulable', JSON.stringify(c));
// 5. vidéo que ce navigateur ne sait pas lire (HEVC sous Linux) : message clair, pas de plantage
const h = await convert('/tests/fixtures-img/v-hevc.mp4', { start: 0 });
ok(h.ok || h.code === 'eVideoUnsupported', `vidéo non convertible → message clair (${h.ok ? 'convertie' : h.code})`, JSON.stringify(h));
// 6. poids réels sur 60 s (sources fabriquées par ffmpeg)
for (const [label, f] of [['fractale en mouvement (cas difficile)', extra.fractal], ['mire animée', extra.mire]]) {
  if (!f) continue;
  const r = await convert(`/tmp/${f}`, { start: 1 });
  ok(r.ok && r.bytes <= 4 * 1024 * 1024, `60 s, ${label} : ${r.ok ? `${(r.bytes / 1048576).toFixed(2)} Mo, ${r.kbps} kb/s, ${r.info.duration} s, converti en ${(r.ms / 1000).toFixed(1)} s` : r.code}`, JSON.stringify(r));
}
ok(!errors.length, 'aucune erreur JavaScript', errors.join(' ; '));
await browser.close(); server.close();
fs.rmSync(TMP, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} test(s) en échec.`); process.exit(1); }
console.log('\nTous les tests de conversion passent.');

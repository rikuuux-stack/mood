// Contrôles côté serveur (supabase/functions/_shared) : node tests/server.test.mjs → code 0 si tout va bien.
import { readFileSync } from 'fs';
import { sniffType, dimensions, hasMetadata, looksLikeLink } from '../supabase/functions/_shared/image.js';
import { textBudget as serverBudget } from '../supabase/functions/_shared/budget.js';
import { textBudget as siteBudget } from '../js/budget.js';
import { stripMetadata } from '../js/image.js';
import { inspectMp4, checkVideo } from '../supabase/functions/_shared/mp4.js';

let fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${label} → ${JSON.stringify(got)}${ok ? '' : ` (attendu ${JSON.stringify(want)})`}`);
};
const f = n => new Uint8Array(readFileSync(new URL(`./fixtures-img/${n}`, import.meta.url)));

// formats, dimensions, métadonnées
for (const [n, type, meta] of [['clean.jpg', 'image/jpeg', false], ['exif.jpg', 'image/jpeg', true],
  ['clean.png', 'image/png', false], ['text.png', 'image/png', true], ['lossy.webp', 'image/webp', false],
  ['lossless.webp', 'image/webp', false], ['exif.webp', 'image/webp', true]]) {
  check(`${n} : format`, sniffType(f(n)), type);
  check(`${n} : dimensions`, dimensions(f(n)), { width: 37, height: 23 });
  check(`${n} : métadonnées`, hasMetadata(f(n)), meta);
}
check('toowide.png : dimensions', dimensions(f('toowide.png')), { width: 2001, height: 10 });
check('faux fichier (GIF) refusé', sniffType(new TextEncoder().encode('GIF89a......')), null);

// budget : le serveur applique exactement la même règle que le site
let diff = 0;
for (let w = 0; w <= 2000; w += 7) for (let h = 0; h <= 2000; h += 13) if (serverBudget(w, h) !== siteBudget(w, h)) diff++;
check('budget serveur = budget site (≈ 44 000 tailles)', diff, 0);
check('budget sans image / 2000×1500 / 2000×2000', [serverBudget(), serverBudget(2000, 1500), serverBudget(2000, 2000)], [500, 125, 40]);

// le site retire lui-même les métadonnées (ex. bloc Exif ajouté par Safari à ses JPEG) : le serveur doit ensuite accepter
for (const n of ['exif.jpg', 'text.png', 'exif.webp', 'clean.jpg', 'lossy.webp']) {
  const out = new Uint8Array(await (await stripMetadata(new Blob([f(n)]))).arrayBuffer());
  check(`${n} nettoyé : sans métadonnées, même format et mêmes dimensions`,
    [hasMetadata(out), sniffType(out), dimensions(out)], [false, sniffType(f(n)), { width: 37, height: 23 }]);
}

// vidéos : lues de l'intérieur (format réel, son, GPS, taille, durée), MP4 « fragmentés » compris
const FULL = { maxSide: 1280, maxShort: 720, maxDuration: 10.5 };
for (const [n, want, extra] of [
  ['h264.mp4', '', { codec: 'avc1', width: 320, height: 180, duration: 2 }],
  ['h264-frag.mp4', '', { codec: 'avc1', duration: 2 }],                 // comme l'enregistreur des navigateurs
  ['h264-audio.mp4', 'audio', { hasAudio: true }],
  ['h264-gps.mov', 'location', { hasLocation: true }],
  ['h264-long.mp4', 'duration', { duration: 12 }],
  ['hevc.mp4', 'video', { codec: 'hvc1' }],
  ['vp9.mp4', 'video', { codec: 'vp09' }],
  ['h264-1080.mp4', 'size', { width: 1920, height: 1080 }],
  ['clean.jpg', 'video', null],
]) {
  const info = inspectMp4(f(n));
  const got = extra ? Object.fromEntries(Object.keys(extra).map(k => [k, info?.[k]])) : info;
  check(`${n} : lecture ${JSON.stringify(extra)} → contrôle « ${want || 'OK'} »`, [got, checkVideo(info, FULL)], [extra, want]);
}
check('js/mp4.js est une copie exacte de _shared/mp4.js',
  readFileSync(new URL('../js/mp4.js', import.meta.url), 'utf8') === readFileSync(new URL('../supabase/functions/_shared/mp4.js', import.meta.url), 'utf8'), true);

// pseudos
check('pseudo sans lien accepté', looksLikeLink('Léa K.'), false);
check('pseudo avec lien refusé', ['http://x', 'www.spam', 'buy.com', '@insta'].map(looksLikeLink), [true, true, true, true]);
process.exit(fail ? 1 : 0);

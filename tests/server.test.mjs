// Contrôles côté serveur (supabase/functions/_shared) : node tests/server.test.mjs → code 0 si tout va bien.
import { readFileSync } from 'fs';
import { sniffType, dimensions, hasMetadata, looksLikeLink } from '../supabase/functions/_shared/image.js';
import { textBudget as serverBudget } from '../supabase/functions/_shared/budget.js';
import { textBudget as siteBudget } from '../js/budget.js';
import { stripMetadata } from '../js/image.js';
import { inspectMp4, checkVideo } from '../supabase/functions/_shared/mp4.js';
import { serverError, videoError, WHY } from '../js/errors.js';
import { STRINGS } from '../js/strings.js';

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

// vidéos : type réel lu dans le fichier (pas l'extension), son, GPS, taille, durée (limites de submit)
const VIDEO = { maxSide: 480, maxShort: 480, maxDuration: 60.5 };
for (const [n, want] of [['v-ok.mp4', ''], ['v-long.mp4', 'duration'], ['v-audio.mp4', 'audio'], ['v-720.mp4', 'size'],
  ['v-gps.mov', 'location'], ['v-hevc.mp4', 'video'], ['clean.jpg', 'video']]) {
  check(`${n} : contrôle vidéo`, checkVideo(inspectMp4(f(n)), VIDEO), want);
}
check('v-ok.mp4 : 480 × 270, 2 s, H.264, muet', (({ codec, width, height, duration, hasAudio }) => ({ codec, width, height, duration, hasAudio }))(inspectMp4(f('v-ok.mp4'))),
  { codec: 'avc1', width: 480, height: 270, duration: 2, hasAudio: false });
check('js/mp4.js est une copie exacte de supabase/functions/_shared/mp4.js',
  readFileSync(new URL('../js/mp4.js', import.meta.url), 'utf8') === readFileSync(new URL('../supabase/functions/_shared/mp4.js', import.meta.url), 'utf8'), true);

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

// messages d'erreur vidéo : toujours la RAISON (plus jamais un simple « Format refusé »)
check('image fixe avec Exif refusée → « Vidéo refusée : l’image fixe contient encore des métadonnées »', serverError('thumb', 'meta', true), { key: 'eVideoRejected', why: 'poster_meta' });
check('vidéo refusée (format) → raison « format »', serverError('video', undefined, true), { key: 'eVideoRejected', why: 'video' });
check('vidéo refusée (taille / son / GPS / durée / poids) → raison précise',
  ['size', 'audio', 'location', 'duration', 'tooBig'].map(c => serverError(c, undefined, true).why), ['size', 'audio', 'location', 'duration', 'tooBig']);
check('photo refusée : messages inchangés', [serverError('type'), serverError('meta'), serverError('captcha', undefined, true)], [{ key: 'eType' }, { key: 'eMeta' }, { key: 'eCaptcha' }]);
check('conversion : erreurs du navigateur gardent leur raison', [videoError({ code: 'eVideoStalled' }), videoError({ code: 'eVideoOutput', why: 'audio' }), videoError({ code: 'decode' })],
  [{ key: 'eVideoStalled', why: 'video' }, { key: 'eVideoOutput', why: 'audio' }, { key: 'eVideoUnsupported', why: 'video' }]);
const keys = ['eVideoUnsupported', 'eVideoStalled', 'eVideoEncode', 'eVideoOutput', 'eVideoRejected', 'eTooBigVideo', 'eVideoBrowser', ...WHY.map(w => `why_${w}`)];
check('messages vidéo présents en FR / JA / EN', ['fr', 'ja', 'en'].map(l => keys.filter(k => !STRINGS[l][k])), [[], [], []]);
check('messages avec raison : {why} présent en FR / JA / EN', ['fr', 'ja', 'en'].map(l => ['eVideoOutput', 'eVideoRejected'].every(k => STRINGS[l][k].includes('{why}'))), [true, true, true]);

// page d'accueil : libellés en anglais même AVANT le JavaScript (aperçus de lien, traduction automatique, chargement lent)
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  check('index.html : langue par défaut anglaise (lang="en")', /<html lang="en">/.test(html), true);
  check('index.html : aucun libellé français en dur (Déposer, Signaler, Aller au contenu)', /Déposer|Signaler|Aller au contenu/.test(html), false);
  check('index.html : description neutre, sans « moodboard »', [/moodboard|participatif/i.test(html), /<meta name="description" content="Images and words, left by anyone.">/.test(html), /og:description/.test(html)], [false, true, true]);
  check('index.html : adresse de contact jamais en dur (CONFIG.contactEmail)', /@gmail\.com/.test(html), false);
}

// pseudos
check('pseudo sans lien accepté', looksLikeLink('Léa K.'), false);
check('pseudo avec lien refusé', ['http://x', 'www.spam', 'buy.com', '@insta'].map(looksLikeLink), [true, true, true, true]);
process.exit(fail ? 1 : 0);

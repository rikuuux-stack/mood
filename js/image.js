/**
 * Préparation d'une image AVANT l'envoi, entièrement sur l'appareil du visiteur :
 *   1. contrôle du format (JPEG / PNG / WebP) et du poids (≤ 5 Mo) ;
 *   2. redessin dans un canvas, réduit à 2000 px de côté maximum (+ miniature 800 px), avec le grain
 *      choisi par le visiteur (0 = aucun) ;
 *   3. ré-encodage (WebP, ou JPEG si le navigateur ne sait pas produire de WebP) :
 *      un canvas ne recopie AUCUNE métadonnée → EXIF, GPS, XMP, profil appareil disparaissent ;
 *   4. vérification du résultat : si une métadonnée subsistait malgré tout, on bloque l'envoi.
 */
import { CONFIG } from './config.js?v=1f46695844';

export class ImageError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ImageError('eDecode')); };
    img.src = url;           // l'orientation EXIF est appliquée par le navigateur au dessin
  });
}

const toBlob = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));

/* ------------------------------------------------------------------ grain (choisi au dépôt)
 * Bruit gris (identique sur R, V, B : aucune teinte), ajouté aux pixels de l'image AVANT l'envoi :
 * l'administrateur voit l'image finale. `amount` de 0 à 100 ; la taille d'un grain suit la taille
 * de l'image (≈ 1/800 du grand côté) pour rester visible une fois l'image réduite sur le mur.
 */
export const GRAIN_MAX = 64;        // écart maximal (sur 255) à 100 %
function addGrain(g, w, h, amount, cell) {
  if (!(amount > 0)) return;
  const amp = Math.min(100, amount) / 100 * GRAIN_MAX;
  const im = g.getImageData(0, 0, w, h), d = im.data;
  const row = new Float32Array(Math.ceil(w / cell));
  for (let y = 0; y < h; y++) {
    if (y % cell === 0) for (let i = 0; i < row.length; i++) row[i] = (Math.random() + Math.random() - 1) * amp;
    for (let x = 0, o = y * w * 4; x < w; x++, o += 4) { const n = row[(x / cell) | 0]; d[o] += n; d[o + 1] += n; d[o + 2] += n; }
  }
  g.putImageData(im, 0, 0);
}

function canvasOf(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  return { c, g };
}
const fit = (w, h, side) => { const s = Math.min(1, side / Math.max(w, h)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; };

/** WebP (ou JPEG pour Safari), métadonnées retirées ; qualité baissée si le fichier dépasse la limite. */
async function encode(c) {
  let blob = null;
  for (const q of [0.86, 0.75, 0.62]) {
    blob = await toBlob(c, 'image/webp', q);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(c, 'image/jpeg', q + 0.02);   // Safari : pas de WebP
    if (!blob || !blob.size) throw new ImageError('eDecode');
    if (blob.size <= CONFIG.upload.maxBytes) break;            // le grain alourdit le fichier
  }
  // Safari (iPhone) ajoute un bloc Exif technique à ses JPEG (espace colorimétrique, dimensions) :
  // on retire tout bloc de métadonnées nous-mêmes, sinon le contrôle ci-dessous bloquerait l'envoi.
  return stripMetadata(blob);
}

/** Type réel d'après les premiers octets (l'iPhone annonce parfois un type vide). */
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/** 1. Lecture : contrôle du format et du poids, décodage. → { img, width, height } (taille publiée). */
export async function decodeImage(file) {
  const U = CONFIG.upload;
  if (!U.types.includes(file.type) && !U.types.includes(await sniff(file))) throw new ImageError('eType');
  if (file.size > U.maxBytes) throw new ImageError('eTooBig', file.size);
  const img = await load(file);
  const [width, height] = fit(img.naturalWidth, img.naturalHeight, U.maxSide);
  return { img, width, height };
}

/** Aperçu en direct (petit, rapide) : dessine l'image et son grain dans `canvas`. */
const previewCache = new WeakMap();
export function drawPreview(canvas, src, grain, side = 800) {
  const [w, h] = fit(src.width, src.height, side);
  let base = previewCache.get(src);
  if (!base || base.width !== w) {                     // pixels sans grain, gardés pour redessiner vite
    const { c, g } = canvasOf(src.img, w, h);
    base = g.getImageData(0, 0, w, h); c.width = c.height = 0;
    previewCache.set(src, base);
  }
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.putImageData(base, 0, 0);
  addGrain(g, w, h, grain, Math.max(1, Math.round(Math.max(w, h) / 800)));
}

/** 2. Image finale : grande (≤ 2000 px) avec son grain, miniature tirée de la grande (même grain). */
export async function renderImage(src, { grain = 0 } = {}) {
  const U = CONFIG.upload;
  const full = canvasOf(src.img, src.width, src.height);
  addGrain(full.g, src.width, src.height, grain, Math.max(1, Math.round(Math.max(src.width, src.height) / 800)));
  const [tw, th] = fit(src.width, src.height, U.thumbSide);
  const thumb = canvasOf(full.c, tw, th);
  const [fullBlob, thumbBlob] = [await encode(full.c), await encode(thumb.c)];
  full.c.width = full.c.height = thumb.c.width = thumb.c.height = 0;       // libère la mémoire (iOS)
  if (fullBlob.size > U.maxBytes) throw new ImageError('eTooBig', fullBlob.size);
  if (await hasMetadata(fullBlob) || await hasMetadata(thumbBlob)) throw new ImageError('eMeta');
  return { full: fullBlob, thumb: thumbBlob, width: src.width, height: src.height };
}

/** Raccourci : lecture + image finale. */
export async function prepareImage(file, opts) { return renderImage(await decodeImage(file), opts); }

/**
 * Retire les blocs de métadonnées d'un JPEG (APP1 Exif/XMP, APP13 IPTC), d'un PNG (eXIf, tEXt, iTXt, zTXt)
 * ou d'un WebP (EXIF, XMP). L'image elle-même n'est pas touchée.
 */
export async function stripMetadata(blob) {
  const b = new Uint8Array(await blob.arrayBuffer());
  const str = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  const keep = [];
  if (b[0] === 0xff && b[1] === 0xd8) {                              // JPEG
    keep.push(b.subarray(0, 2));
    let o = 2;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const m = b[o + 1], len = (b[o + 2] << 8) | b[o + 3];
      if (m === 0xda) break;
      if (m !== 0xe1 && m !== 0xed) keep.push(b.subarray(o, o + 2 + len));
      o += 2 + len;
    }
    keep.push(b.subarray(o));
  } else if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {       // WebP
    for (let o = 12; o + 8 <= b.length;) {
      const id = str(o, 4), len = b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24);
      const end = Math.min(b.length, o + 8 + len + (len & 1));
      if (id === 'VP8X') { const c = b.slice(o, end); c[8] &= ~0x0c; keep.push(c); }   // drapeaux EXIF / XMP retirés
      else if (id !== 'EXIF' && id !== 'XMP ') keep.push(b.subarray(o, end));
      o = end;
    }
    const size = 4 + keep.reduce((n, k) => n + k.length, 0), head = b.slice(0, 12);
    head[4] = size & 255; head[5] = (size >> 8) & 255; head[6] = (size >> 16) & 255; head[7] = (size >>> 24) & 255;
    keep.unshift(head);
  } else if (b[0] === 0x89 && str(1, 3) === 'PNG') {                // PNG
    keep.push(b.subarray(0, 8));
    for (let o = 8; o + 8 <= b.length;) {
      const len = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0, id = str(o + 4, 4);
      if (!['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(id)) keep.push(b.subarray(o, o + 12 + len));
      o += 12 + len;
      if (id === 'IEND') break;
    }
  } else {
    return blob;
  }
  return new Blob(keep, { type: blob.type });
}

/**
 * Cherche des métadonnées dans un JPEG (segments APP1 Exif/XMP), un PNG (eXIf, tEXt, iTXt, zTXt)
 * ou un WebP (chunks EXIF / XMP). Utilisé ici et côté serveur (même logique).
 */
export async function hasMetadata(blob) {
  const b = new Uint8Array(await blob.arrayBuffer());
  const str = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (b[0] === 0xff && b[1] === 0xd8) {                              // JPEG
    let o = 2;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const m = b[o + 1], len = (b[o + 2] << 8) | b[o + 3];
      if (m === 0xda) break;                                         // début de l'image : fin des en-têtes
      if (m === 0xe1) return true;                                   // APP1 = Exif ou XMP
      o += 2 + len;
    }
    return false;
  }
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {               // WebP
    for (let o = 12; o + 8 <= b.length;) {
      const id = str(o, 4), len = b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24);
      if (id === 'EXIF' || id === 'XMP ') return true;
      o += 8 + len + (len & 1);
    }
    return false;
  }
  if (b[0] === 0x89 && str(1, 3) === 'PNG') {                        // PNG
    for (let o = 8; o + 8 <= b.length;) {
      const len = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0, id = str(o + 4, 4);
      if (['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(id)) return true;
      if (id === 'IEND') break;
      o += 12 + len;
    }
    return false;
  }
  return true;                                                       // format inconnu : on refuse
}

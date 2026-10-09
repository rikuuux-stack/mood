/**
 * Préparation d'une image AVANT l'envoi, entièrement sur l'appareil du visiteur :
 *   1. contrôle du format (JPEG / PNG / WebP) et du poids (≤ 5 Mo) ;
 *   2. redessin dans un canvas, réduit à 2000 px de côté maximum (+ miniature 800 px) ;
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

async function encode(img, side) {
  const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  let blob = await toBlob(c, 'image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(c, 'image/jpeg', 0.88);   // Safari : pas de WebP
  c.width = c.height = 0;                                                              // libère la mémoire (iOS)
  if (!blob || !blob.size) throw new ImageError('eDecode');
  // Safari (iPhone) ajoute un bloc Exif technique à ses JPEG (espace colorimétrique, dimensions) :
  // on retire tout bloc de métadonnées nous-mêmes, sinon le contrôle ci-dessous bloquerait l'envoi.
  return { blob: await stripMetadata(blob), w, h };
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

export async function prepareImage(file) {
  const U = CONFIG.upload;
  if (!U.types.includes(file.type) && !U.types.includes(await sniff(file))) throw new ImageError('eType');
  if (file.size > U.maxBytes) throw new ImageError('eTooBig', file.size);
  const img = await load(file);
  const full = await encode(img, U.maxSide);
  const thumb = await encode(img, U.thumbSide);
  if (full.blob.size > U.maxBytes) throw new ImageError('eTooBig', full.blob.size);
  if (await hasMetadata(full.blob) || await hasMetadata(thumb.blob)) throw new ImageError('eMeta');
  return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h };
}

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

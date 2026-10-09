/**
 * Contrôles d'image côté serveur — on ne fait JAMAIS confiance à ce que le navigateur annonce :
 *   - le format est lu dans les premiers octets du fichier (pas dans son nom ni son type déclaré) ;
 *   - les dimensions sont lues dans l'en-tête de l'image (elles servent au budget de texte) ;
 *   - toute métadonnée (EXIF, GPS, XMP, textes PNG) fait refuser le fichier.
 * Module pur (aucune dépendance) : testé dans Node par tests/server.test.mjs.
 */

const str = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u24le = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** 'image/jpeg' | 'image/png' | 'image/webp' | null */
export function sniffType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && str(b, 1, 3) === 'PNG') return 'image/png';
  if (b.length >= 12 && str(b, 0, 4) === 'RIFF' && str(b, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/** { width, height } lus dans l'en-tête, ou null si illisible. */
export function dimensions(b) {
  const type = sniffType(b);
  if (type === 'image/png') return b.length >= 24 ? { width: u32be(b, 16), height: u32be(b, 20) } : null;
  if (type === 'image/jpeg') {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const m = b[o + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
      const len = u16be(b, o + 2);
      // SOF0..SOF15 sauf DHT (C4), JPG (C8), DAC (CC)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { width: u16be(b, o + 7), height: u16be(b, o + 5) };
      }
      o += 2 + len;
    }
    return null;
  }
  if (type === 'image/webp') {
    const chunk = str(b, 12, 4);
    if (chunk === 'VP8X' && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    if (chunk === 'VP8 ' && b.length >= 30) return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === 'VP8L' && b.length >= 25) {
      const bits = u32le(b, 21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/** true si le fichier contient des métadonnées (même logique que js/image.js dans le navigateur). */
export function hasMetadata(b) {
  const type = sniffType(b);
  if (type === 'image/jpeg') {
    let o = 2;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const m = b[o + 1], len = u16be(b, o + 2);
      if (m === 0xda) break;                 // début de l'image : fin des en-têtes
      if (m === 0xe1) return true;           // APP1 = Exif ou XMP
      o += 2 + len;
    }
    return false;
  }
  if (type === 'image/webp') {
    for (let o = 12; o + 8 <= b.length;) {
      const id = str(b, o, 4), len = u32le(b, o + 4);
      if (id === 'EXIF' || id === 'XMP ') return true;
      o += 8 + len + (len & 1);
    }
    return false;
  }
  if (type === 'image/png') {
    for (let o = 8; o + 8 <= b.length;) {
      const len = u32be(b, o), id = str(b, o + 4, 4);
      if (['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(id)) return true;
      if (id === 'IEND') break;
      o += 12 + len;
    }
    return false;
  }
  return true;                               // format inconnu : refusé
}

/** Pseudo : pas de lien (anti-spam). */
export const looksLikeLink = s => /(https?:|www\.|\.(com|net|org|io|jp|fr|ru|xyz|info|ly)\b|@\w)/i.test(s);

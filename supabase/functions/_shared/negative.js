/**
 * Le fichier reçu est-il bien un NÉGATIF noir et blanc fait par le site (fix-original) ?
 *
 * Depuis la correction « fix-original », le téléphone envoie la photo DÉJÀ en négatif (js/image.js, toNegative) :
 * l'original en couleur ne doit jamais arriver au serveur. On le revérifie ici, sur les pixels :
 *   - JPEG seulement (le seul format que le site envoie pour une photo ou une image fixe) ;
 *   - monochrome : sur un échantillon de points, rouge, vert et bleu égaux (à la compression JPEG près) ;
 *   - le plus clair s'arrête à 76 % (courbe du négatif, TONE de js/wall.js) : une photo ordinaire passée en gris,
 *     avec ses vrais blancs, est refusée.
 * Coût : un décodage JPEG (≈ 0,2 à 0,6 s pour 2000 px) ; on échantillonne ≈ 40 000 points.
 * Module pur : testé dans Node par tests/server.test.mjs.
 */
import { decode } from './vendor/jpeg-decode.js';

export const NEG = { maxGray: 0.76, chroma: 10, lightTolerance: 14, tooLight: 0.002, notGray: 0.003 };

/** → null si c'est bien un négatif ; sinon la raison : 'type' | 'decode' | 'color' | 'light'. */
export function negativeError(bytes) {
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return 'type';
  let im;
  try { im = decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 8, maxMemoryUsageInMB: 64 }); }
  catch { return 'decode'; }
  const { width: w, height: h, data: d } = im;
  if (!w || !h) return 'decode';
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
  const light = NEG.maxGray * 255 + NEG.lightTolerance;
  let n = 0, colored = 0, tooLight = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const o = (y * w + x) * 4, r = d[o], g = d[o + 1], b = d[o + 2];
    if (Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) > NEG.chroma) colored++;
    if (Math.max(r, g, b) > light) tooLight++;
    n++;
  }
  if (colored / n > NEG.notGray) return 'color';
  if (tooLight / n > NEG.tooLight) return 'light';
  return null;
}

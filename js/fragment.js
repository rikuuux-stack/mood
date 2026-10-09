/**
 * « Keep » — un FRAGMENT DU MUR, prélevé à cet instant, comme un morceau d'affiches arraché.
 *
 * Le dépôt au centre, ses voisins tels qu'ils sont placés et superposés sur le mur (positions, ordre,
 * tailles), coupés par le bord du cadre ; le fond et son grain ; l'érosion RÉELLE de chaque élément
 * (même le dépôt central, qui paraît neuf dans l'agrandissement) ; les textes avec la même typo ;
 * en bas, une seule petite ligne : « moodwall.pages.dev — JJ.MM.AAAA — consigne ». Aucun nom.
 *
 * Tout se fait sur l'appareil, sans serveur, à partir des images déjà chargées (chargées avec
 * crossOrigin : le canvas reste lisible). Les filtres CSS / SVG ne passent pas dans un canvas : le
 * traitement des photos (gris + courbe, grain, transparence des clairs) est refait ici en pixels,
 * avec les mêmes valeurs (TONE, ERODE dans js/wall.js).
 * Le fichier produit (JPEG) ne contient aucune métadonnée.
 */
import { TONE, ERODE } from './wall.js?v=8906cf420f';
import { stripMetadata } from './image.js?v=a3f88b470d';

export const FORMATS = { '4:5': [1080, 1350], '9:16': [1080, 1920] };
const BG = [11, 11, 11];
const BAND = 92;                 // bande du bas (px de l'image), pour la ligne de légende
const RULE = '#3a3a3a';          // filets des strates (--rule)

/* ------------------------------------------------------------------ bruit
 * Bruit « fractal » simplifié : une valeur par pixel CSS (comme le grain du site, qui suit les pixels
 * CSS), concentrée autour de 0,5, lissée à l'agrandissement. */
function noiseGrid(w, h) {
  const n = new Float32Array(w * h);
  for (let i = 0; i < n.length; i++) n[i] = (Math.random() + Math.random() + Math.random()) / 3;
  return { w, h, n };
}
function sample(g, x, y) {                     // bilinéaire, x / y en cellules
  const x0 = Math.min(g.w - 1, x | 0), y0 = Math.min(g.h - 1, y | 0);
  const x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const a = g.n[y0 * g.w + x0], b = g.n[y0 * g.w + x1], c = g.n[y1 * g.w + x0], d = g.n[y1 * g.w + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Courbe de tons (TONE) : interpolation linéaire entre 5 points. */
function tone(v) {
  const p = Math.min(3.999, v * 4), i = p | 0;
  return TONE[i] + (TONE[i + 1] - TONE[i]) * (p - i);
}
const overlay = (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s));

/**
 * Photo traitée comme à l'écran, à la taille voulue (px de l'image) :
 *   palier 0 : gris + courbe, grain habituel (overlay ≈ 30 %) ;
 *   palier N : gris + courbe, grain plus fort, les clairs deviennent transparents.
 */
function processPhoto(source, dw, dh, stage, scale) {
  const c = document.createElement('canvas');
  c.width = dw; c.height = dh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, dw, dh);
  const img = ctx.getImageData(0, 0, dw, dh), d = img.data;
  const g = noiseGrid(Math.ceil(dw / scale) + 1, Math.ceil(dh / scale) + 1);
  const e = stage ? ERODE[stage - 1] : null;
  for (let y = 0, i = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++, i += 4) {
      const t = tone((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
      const n = sample(g, x / scale, y / scale);
      let v, a = 1;
      if (e) {
        v = overlay(t, e.g * n + 0.5 - e.g * 0.5);
        a = Math.max(0, Math.min(1, 1 + e.k * e.t - e.k * t));
      } else {
        v = t + (overlay(t, n) - t) * 0.3;
      }
      d[i] = d[i + 1] = d[i + 2] = v * 255;
      d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** L'image d'une photo du mur : celle déjà chargée, sinon redemandée (cache du navigateur). */
function sourceOf(imgEl) {
  if (imgEl.getAttribute('src') && imgEl.complete && imgEl.naturalWidth) return Promise.resolve(imgEl);
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.src = imgEl.dataset.src || imgEl.getAttribute('src');
  return im.decode().then(() => im);
}

/* ------------------------------------------------------------------ textes */
// « color(srgb r g b) » (couleur issue de color-mix) → rgb(), compris partout par le canvas
function cssColor(c) {
  const m = c.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  return m ? `rgb(${m.slice(1, 4).map(v => Math.round(v * 255)).join(',')})` : c;
}
const CJK = /[　-ヿ㐀-鿿豈-﫿＀-￯]/;
/** Coupe un texte en lignes (largeur max en px), comme le navigateur : par mots, ou par caractère en japonais. */
function wrap(ctx, text, max) {
  const lines = [];
  for (const para of text.split('\n')) {
    const tokens = para.match(/[　-ヿ㐀-鿿豈-﫿＀-￯]|[^\s　-ヿ㐀-鿿豈-﫿＀-￯]+|\s+/g) || [''];
    let line = '';
    for (const tk of tokens) {
      const next = line + tk;
      if (line && !/^\s+$/.test(tk) && ctx.measureText(next.trimEnd()).width > max) {
        lines.push(line.trimEnd());
        line = /^\s+$/.test(tk) ? '' : tk;
        while (ctx.measureText(line).width > max && line.length > 1 && !CJK.test(line)) {   // mot plus long que la ligne
          let k = line.length - 1;
          while (k > 1 && ctx.measureText(line.slice(0, k)).width > max) k--;
          lines.push(line.slice(0, k)); line = line.slice(k);
        }
      } else line = next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
async function drawText(ctx, el, x, y, w, scale, clamp) {
  const cs = getComputedStyle(el), size = parseFloat(cs.fontSize) * scale;
  const lh = (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5) * scale;
  const font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const text = el.textContent;
  try { await document.fonts.load(font, text); } catch {}
  ctx.font = font;
  ctx.fillStyle = cssColor(cs.color);
  ctx.textBaseline = 'middle';
  let lines = wrap(ctx, text, w + 0.5);
  if (lines.length > clamp) { lines = lines.slice(0, clamp); lines[clamp - 1] = `${lines[clamp - 1].replace(/\s*\S?$/, '')}…`; }
  lines.forEach((l, i) => ctx.fillText(l, x, y + lh * i + lh / 2));
}

/* ------------------------------------------------------------------ le fragment */
const rectIn = (el, li) => {
  const a = el.getBoundingClientRect(), b = li.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
};
const pad2 = n => String(n).padStart(2, '0');
/** Date du jour sur l'APPAREIL du visiteur (son fuseau horaire, ni l'UTC ni le fuseau du mur) : JJ.MM.AAAA. */
export const today = (d = new Date()) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;

/**
 * @param li      l'élément du mur au centre (li.item, placé)
 * @param wallEl  le mur (ul#wall)
 * @param format  '4:5' | '9:16'
 * @param prompt  consigne de la strate du dépôt ('' = aucune)
 * @returns {Promise<{ blob: Blob, width: number, height: number, footer: string, photos: { drawn, missing } }>}
 */
export async function makeFragment({ li, wallEl, format = '4:5', prompt = '', date = new Date(), url = true }) {
  const [W, H] = FORMATS[format] || FORMATS['4:5'];
  const RH = H - BAND;                                           // hauteur réservée au mur
  const box = { x: li.offsetLeft, y: li.offsetTop, w: li.offsetWidth, h: li.offsetHeight };
  // le dépôt occupe ≈ 42 % du cadre ; ses voisins débordent autour
  const scale = Math.min(W * 0.42 / box.w, RH * 0.42 / box.h, 4);
  const cw = W / scale, ch = RH / scale;
  const x0 = box.x + box.w / 2 - cw / 2, y0 = box.y + box.h / 2 - ch / 2;
  const X = v => (v - x0) * scale, Y = v => (v - y0) * scale;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // fond : noir + grain clair (comme --noise : blanc, jusqu'à 16 %), qui suit les pixels CSS
  ctx.fillStyle = `rgb(${BG})`; ctx.fillRect(0, 0, W, H);
  {
    const gw = Math.ceil(W / scale) + 1, gh = Math.ceil(H / scale) + 1, g = noiseGrid(gw, gh);
    const nc = document.createElement('canvas'); nc.width = gw; nc.height = gh;
    const nctx = nc.getContext('2d'), im = nctx.createImageData(gw, gh);
    for (let i = 0; i < g.n.length; i++) { const k = i * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = 0.16 * 255 * g.n[i]; }
    nctx.putImageData(im, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(nc, 0, 0, gw * scale, gh * scale);
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, RH); ctx.clip();
  // filets des strates (sans leur mot : aucun autre texte que les dépôts)
  ctx.fillStyle = RULE;
  for (const s of wallEl.querySelectorAll('.stratum')) {
    const y = s.offsetTop;
    if (y < y0 || y > y0 + ch) continue;
    ctx.fillRect(X(s.offsetLeft), Math.round(Y(y)), s.offsetWidth * scale, Math.max(1, scale));
  }
  // les éléments qui touchent le cadre, du plus ancien (dessous) au plus récent (dessus) ;
  // les dépôts « en attente » (visibles chez leur auteur seulement) ne font pas partie du mur
  const items = [...wallEl.querySelectorAll('.item:not(.is-pending):not(.is-out)')]
    .filter(el => el.offsetLeft < x0 + cw && el.offsetLeft + el.offsetWidth > x0 && el.offsetTop < y0 + ch && el.offsetTop + el.offsetHeight > y0)
    .sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));
  // images d'abord (en parallèle), puis dessin dans l'ordre
  const sources = await Promise.all(items.map(el => {
    const img = el.querySelector('.photo img');
    return img ? sourceOf(img).catch(() => null) : null;
  }));
  let drawn = 0, missing = 0;
  for (const [i, el] of items.entries()) {
    const bx = el.offsetLeft, by = el.offsetTop;
    const stage = +(el.className.match(/\bage-(\d)\b/)?.[1] || 0);
    const ph = el.querySelector('.photo');
    if (ph) {
      const r = rectIn(ph, el), dw = Math.max(1, Math.round(r.w * scale)), dh = Math.max(1, Math.round(r.h * scale));
      if (sources[i]) { ctx.drawImage(processPhoto(sources[i], dw, dh, stage, scale), Math.round(X(bx + r.x)), Math.round(Y(by + r.y))); drawn++; }
      else { ctx.fillStyle = '#1d1d1d'; ctx.fillRect(X(bx + r.x), Y(by + r.y), dw, dh); missing++; }   // image introuvable : son cadre
    }
    const tx = el.querySelector('.caption-text, .sticker-text');
    if (tx && tx.textContent) {
      const r = rectIn(tx, el);
      await drawText(ctx, tx, X(bx + r.x), Y(by + r.y), r.w * scale, scale, tx.classList.contains('caption-text') ? 4 : 10);
    }
  }
  ctx.restore();

  // la ligne du bas : adresse, date du jour, consigne de la strate (rien d'autre)
  // url = false (?keepurl=0, variante à comparer) : la date et la consigne seulement
  const footer = [url ? 'moodwall.pages.dev' : '', today(date), prompt].filter(Boolean).join(' — ');
  const font = '200 24px "IBM Plex Mono"';
  try { await document.fonts.load(font, footer); } catch {}
  ctx.font = font; ctx.fillStyle = '#bdbdbd'; ctx.textBaseline = 'middle';
  ctx.fillText(footer, 48, H - BAND / 2);

  const raw = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.92));
  c.width = c.height = 0;                                        // libère la mémoire (iOS)
  return { blob: await stripMetadata(raw), width: W, height: H, footer, photos: { drawn, missing } };
}

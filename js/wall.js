/**
 * MUR — composition libre, mais lisible.
 *
 * Règles :
 *   - les textes sont posés à nu sur le fond : ils ne chevauchent RIEN (ni image, ni texte) ;
 *   - un texte garde un espace libre autour de lui (`gap`) : on ne doit pas le prendre pour le
 *     commentaire d'une photo voisine, ni le lire à la suite d'un autre texte ;
 *   - le commentaire sous une photo (bande `capH` en bas de la boîte) n'est jamais recouvert,
 *     et ne recouvre rien non plus ;
 *   - pas d'inclinaison : tout est droit (direction brutaliste) ;
 *   - une image n'est jamais recouverte à plus de `limit` (30 % sur ordinateur, 15 % sur mobile) :
 *     on additionne la surface que lui prennent tous les éléments posés au-dessus d'elle ;
 *   - le plus récent est toujours au-dessus ;
 *   - le mur est immobile : c'est le temps qui le transforme (érosion, strates : voir plus bas) ;
 *   - placement stable : tout dépend de l'identifiant du dépôt (graine) et de la largeur du mur ;
 *   - les plus récents en haut ; on remplit de haut en bas en cherchant la place la plus haute
 *     qui respecte la règle de recouvrement (d'où des chevauchements naturels, jamais excessifs).
 *
 * Ce module est pur (pas de DOM) : il se teste dans Node.
 */

/** Générateur pseudo-aléatoire déterministe à partir d'une chaîne. */
export function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Tailles choisies au dépôt (S / M / L, M par défaut). */
export const SIZES = ['s', 'm', 'l'];
const IMG_SCALE = { s: 0.75, m: 1, l: 1.35 };                 // ordinateur : M ≈ 1/6 de la largeur
const IMG_MOBILE = { s: 0.35, m: 0.5, l: 0.7 };               // iPhone : part de la largeur
const FONT = { s: 12, m: 14, l: 16 }, FONT_MOBILE = { s: 13, m: 14, l: 15 };
const sizeOf = post => (SIZES.includes(post.size) ? post.size : 'm');

/** Largeur d'un élément (px) et taille de texte pour les textes. */
export function sizeFor(post, W, mobile) {
  const r = rng(post.id + ':size');
  const k = sizeOf(post), jitter = 0.92 + r() * 0.16;          // ±8 % : un mur vivant, mais la taille choisie domine
  if (post.kind === 'text') {
    const n = [...post.text].length;
    const font = (mobile ? FONT_MOBILE : FONT)[k];              // petites lettres, traits fins
    const f = font / 14;
    const base = mobile ? W * (n <= 60 ? 0.52 : 0.68) : (n <= 60 ? 200 : n <= 200 ? 230 : 260);
    return { w: Math.round(clamp(base * f * jitter, Math.min(150, W), W)), font };
  }
  const ar = post.image.w / post.image.h;
  if (mobile) {
    const w = W * IMG_MOBILE[k] * (ar < 1 ? 0.88 : 1.12) * jitter;
    return { w: Math.round(clamp(w, Math.min(110, W), W)) };
  }
  const base = clamp(W / 6, 150, 260);
  const w = base * IMG_SCALE[k] * (ar < 1 ? 0.85 : 1) * jitter;
  return { w: Math.round(clamp(w, Math.min(120, W), W * 0.6)) };
}

/* ------------------------------------------------------------------ le temps
 * Le mur est immobile : c'est le TEMPS qui le transforme.
 *
 * Érosion (courbe « Saison », 90 jours) : chaque dépôt s'estompe avec le temps passé sur le mur (depuis
 * sa validation) — intact 7 jours, puis de plus en plus pâle, de plus en plus lentement, sans jamais
 * descendre sous 30 % : ≈ 70 % à 30 jours, ≈ 39 % à 90 jours, ≈ 31 % à 180 jours.
 * Au-delà de 180 jours, il quitte le mur et ne vit plus que dans la vue List (toujours à 100 %).
 * Images : affichées en NÉGATIF noir et blanc sur fond blanc, le NOIR TRANSPARENT dès le dépôt ; avec l'âge,
 * la transparence gagne les gris de plus en plus clairs (l'image se désagrège), par paliers fixes (stageOf → classes .age-1 … .age-4,
 * filtres SVG #erode1 … #erode4 dans index.html) : quatre filtres partagés par toutes les images, rien de
 * calculé image par image. Il finit par ne rester que les parties claires. L'image ne redevient neuve
 * qu'à l'ouverture en grand. Textes : à peine adoucis, toujours lisibles (css/site.css).
 */
export const TIME = { fresh: 7, floor: 0.3, k: 41, wallDays: 180 };
const DAY = 86400e3;
export const ageDays = (iso, now = Date.now()) => Math.max(0, (now - Date.parse(iso)) / DAY);
/** Visibilité (0,3 … 1) d'un dépôt selon son âge en jours. */
export function visibility(days) {
  if (!(days > TIME.fresh)) return 1;
  return TIME.floor + (1 - TIME.floor) * Math.exp(-(days - TIME.fresh) / TIME.k);
}
/**
 * Palier d'érosion d'une image (0 = neuve … 4 = il ne reste que les parties claires), selon sa visibilité.
 * Usure w = (1 − v) / 0,7 : palier 1 dès w ≥ 0,08 (≈ 10 j), 2 dès 0,3 (≈ 22 j), 3 dès 0,55 (≈ 40 j), 4 dès 0,8 (≈ 73 j).
 */
export const STAGES = [0.08, 0.3, 0.55, 0.8];
/*
 * Traitement des images, partagé par l'écran (filtres SVG de index.html : #tone, #erode1 … #erode4), par
 * l'export d'un fragment (js/fragment.js, en pixels) et par la conversion des vidéos (js/video.js, intégré au
 * fichier). tests/wall.test.mjs vérifie que index.html porte exactement ces valeurs.
 *   NÉGATIF : gris (luminance), puis inversé (1 − gris), puis la courbe TONE ;
 *   TONE  : courbe de tons du négatif (0 → 0 · 25 % → 24 % · … · 100 % → 76 %) : le plus clair du négatif
 *           s'arrête à 76 % de blanc, l'image ne se confond jamais avec le fond blanc. Dans index.html,
 *           inversion + courbe tiennent dans une seule table : TONE à l'envers (« 0.76 0.64 0.47 0.24 0 ») ;
 *   BASE  : NOIR TRANSPARENT DÈS LE DÉPÔT (décision de l'auteur) : alpha = 1 − k × (t − gris) ; tout le sombre du
 *           négatif (sous 30 % de gris) est transparent (on voit le fond blanc et les images du dessous), opaque
 *           dès 45 % ; aussi pendant la lecture d'une vidéo (js/main.js, image par image) ;
 *   ERODE : par palier, même formule avec un seuil qui MONTE : l'image se désagrège avec le temps, des
 *           sombres vers les clairs, jusqu'à ne laisser que les parties claires ; force g du grain dans le
 *           filtre (0 : pas de grain). Paliers et dates inchangés (stageOf) ;
 *   GRAIN : grain des photos neuves (0 : aucun) — même valeur que l'écran (css/site.css, .photo::after) ;
 *   PAGE_GRAIN : grain du fond de page (0 : aucun).
 */
export const TONE = [0, 0.24, 0.47, 0.64, 0.76];
/** Négatif d'une luminance (0 … 1) : inversion puis courbe TONE. */
export function negative(lum) {
  const p = Math.min(3.999, (1 - lum) * 4), i = p | 0;
  return TONE[i] + (TONE[i + 1] - TONE[i]) * (p - i);
}
/* Seuils mesurés sur les vraies photos du mur (diagnostic du 5 novembre 2026 : leurs gris, en négatif, sont
   surtout entre 20 et 60 %) : sous 30 %, transparent ; fondu jusqu'à 45 %. Chaque palier repousse ce fondu de
   7 points vers les clairs ; au palier 4, il ne reste que ce qui dépasse ≈ 58 %. */
export const BASE = { t: 0.45, k: 6.6667, g: 0 };
export const ERODE = [
  { t: 0.52, k: 6.6667, g: 0 },
  { t: 0.59, k: 6.6667, g: 0 },
  { t: 0.66, k: 6.6667, g: 0 },
  { t: 0.73, k: 6.6667, g: 0 },
];
/** Opacité d'un pixel (gris du négatif, 0 … 0,76) selon le traitement (BASE ou un palier d'ERODE). */
export const alphaOf = (gray, e) => Math.max(0, Math.min(1, 1 - e.k * (e.t - gray)));
export const GRAIN = 0;
/** Grain du fond de page (0 : aucun) — même valeur que l'écran (css/site.css, body::before). */
export const PAGE_GRAIN = 0;
export function stageOf(v) {
  const w = (1 - v) / (1 - TIME.floor);
  return STAGES.filter(s => w >= s - 1e-9).length;
}
/** Un dépôt reste sur le mur pendant 180 jours ; ensuite, seulement dans la vue List. */
export const onWall = days => days < TIME.wallDays;

/**
 * Strates : le mur se lit de haut en bas comme des couches de temps. Une strate = les dépôts d'un même
 * mois ET d'une même consigne (gardée sur chaque dépôt). Un mois sans consigne forme une strate sans mot.
 */
// Fuseau de référence du mur : Asia/Tokyo, le MÊME pour tous les visiteurs (le mur est identique partout).
// Le mois d'un dépôt (strates, filets, strate en cours) se calcule à l'heure de Tokyo, jamais à celle du
// téléphone ni en UTC : un dépôt du 1er octobre à 0 h 30 (Tokyo) est en octobre à Tokyo, Paris et Los Angeles.
// Le Japon n'a pas d'heure d'été : Tokyo = UTC + 9 h toute l'année.
const TOKYO = 9 * 3600e3;
export const wallMonth = iso => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + TOKYO);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const strataKey = p => `${wallMonth(p.createdAt)}|${p.prompt || ''}`;

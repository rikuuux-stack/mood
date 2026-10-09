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
 * Images : les pixels CLAIRS deviennent transparents avec l'âge (on voit à travers), par paliers fixes
 * (stageOf → classes .age-1 … .age-4, filtres SVG #erode1 … #erode4 dans index.html) : quatre filtres
 * partagés par toutes les images, rien de calculé image par image. L'image ne redevient neuve
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
 * Palier d'érosion d'une image (0 = neuve … 4 = il ne reste que les parties sombres), selon sa visibilité.
 * Usure w = (1 − v) / 0,7 : palier 1 dès w ≥ 0,08 (≈ 10 j), 2 dès 0,3 (≈ 22 j), 3 dès 0,55 (≈ 40 j), 4 dès 0,8 (≈ 73 j).
 */
export const STAGES = [0.08, 0.3, 0.55, 0.8];
/*
 * Traitement des images, partagé par l'écran (filtres SVG de index.html : #tone, #erode1 … #erode4) et
 * par l'export d'un fragment (js/fragment.js, en pixels). tests/wall.test.mjs vérifie que index.html
 * porte exactement ces valeurs.
 *   TONE  : courbe de tons après passage en gris (0 → 0 · 25 % → 24 % · … · 100 % → 76 %) ;
 *   ERODE : par palier, seuil t et pente k de la transparence (alpha = 1 − k × (gris − t)),
 *           force g du grain (bruit gris en « overlay »).
 */
export const TONE = [0, 0.24, 0.47, 0.64, 0.76];
export const ERODE = [
  { t: 0.6, k: 1.6, g: 0.30 },
  { t: 0.5, k: 2.2, g: 0.36 },
  { t: 0.4, k: 2.8, g: 0.42 },
  { t: 0.3, k: 3.4, g: 0.48 },
];
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
export const strataKey = p => `${(p.createdAt || '').slice(0, 7)}|${p.prompt || ''}`;

/** Bande du commentaire, en bas d'une boîte. */
const strip = (r, capH) => ({ x: r.x, y: r.y + r.h - (capH || 0), w: r.w, h: capH || 0 });

const grow = (r, g) => ({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g });

const inter = (a, b) => {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return x > 0 && y > 0 ? x * y : 0;
};

/** Ordre d'empilement : le plus récent (indice 0) toujours au-dessus. */
export const zOf = (i, n) => n - i;

/**
 * boxes : [{ id, kind, w, h, capH }] dans l'ordre d'affichage (le plus récent d'abord).
 * drift : marge réservée autour de chaque élément (px) — 0 depuis que le mur est immobile.
 * Le plus récent est au-dessus : un élément n'est recouvert que par ceux posés avant lui.
 * Retourne { rects: [{ x, y, w, h, z }], height, overlaps: [[i, j], …] }.
 */
export function layout(boxes, W, opts = {}) {
  const L = createLayout(W, boxes.length, opts);
  const rects = boxes.map(b => L.add(b));
  return { rects, height: L.height(), overlaps: L.overlaps };
}

/**
 * Placement PROGRESSIF : la place d'un élément ne dépend que des éléments plus récents (posés
 * avant lui). On peut donc placer le premier écran tout de suite, puis le reste par morceaux.
 * n : nombre total d'éléments (pour l'ordre d'empilement). add(box) → rect ; height() ; overlaps.
 * top / first : pour une strate qui commence plus bas (décalage vertical, indice de son premier élément).
 */
export function createLayout(W, n, { limit = 0.3, pad = 24, mobile = false, drift: A = 0, top = 0, first = 0 } = {}) {
  const inner = W - 2 * pad;
  const placed = [];            // boîtes agrandies : { x, y, w, h, kind, capH }
  const overlaps = [];
  const tries = mobile ? 6 : 14;
  const gap = mobile ? 28 : 24;          // espace libre autour d'un texte

  let idx = 0;
  function add(b0) {
    const r = rng(b0.id + ':pos');
    const w0 = Math.min(b0.w, inner - 2 * A);
    const b = { kind: b0.kind, w: w0 + 2 * A, h: b0.h + 2 * A, capH: b0.capH ? b0.capH + 2 * A : 0 };
    const w = b.w, h = b.h, area = w0 * b0.h, capH = b.capH;
    const xs = new Set();
    for (let k = 0; k < tries; k++) xs.add(Math.round(r() * Math.max(0, inner - w)));
    for (const p of placed.slice(-6)) {                  // s'aligner (en décalé) sur les voisins récents
      xs.add(clamp(Math.round(p.x + p.w * 0.72), 0, Math.max(0, inner - w)));
      xs.add(clamp(Math.round(p.x - w * 0.72), 0, Math.max(0, inner - w)));
      xs.add(clamp(Math.round(p.x + p.w + gap), 0, Math.max(0, inner - w)));
      xs.add(clamp(Math.round(p.x - w - gap), 0, Math.max(0, inner - w)));
    }
    let best = null;
    for (const x of xs) {
      const cols = placed.filter(p => p.x - gap < x + w && p.x + p.w + gap > x).sort((a, b) => a.y - b.y);
      const maxH = cols.reduce((m, p) => Math.max(m, p.h), 0);
      const ys = new Set([0]);
      for (const p of cols) { ys.add(Math.round(p.y + p.h)); ys.add(Math.round(p.y + p.h + gap)); ys.add(Math.round(p.y + p.h - h * limit)); ys.add(Math.round(p.y + p.h * (1 - limit))); }
      const sorted = [...ys].filter(y => y >= 0).sort((a, b) => a - b);
      for (const y of sorted) {
        if (best && y >= best.score) break;
        const cand = { x, y, w, h };
        let mine = 0, ok = true;
        // seuls les voisins verticaux comptent : recherche dichotomique du premier candidat
        let lo = 0, hi = cols.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cols[m].y < y - gap - maxH) lo = m + 1; else hi = m; }
        for (let c = lo; c < cols.length && cols[c].y < y + h + gap; c++) {
          const p = cols[c];
          if ((b.kind === 'text' || p.kind === 'text') && inter(grow(cand, gap), p)) { ok = false; break; }   // espace autour des textes
          const a = inter(cand, p);
          if (!a) continue;
          if (b.kind === 'text' || p.kind === 'text') { ok = false; break; }   // un texte ne touche rien
          if (inter(strip(cand, capH), p) || inter(strip(p, p.capH), cand)) { ok = false; break; }   // ni un commentaire
          // les éléments déjà posés sont plus récents, donc au-dessus : c'est le nouveau qui est recouvert
          mine += a; if (mine > area * limit) { ok = false; break; }
        }
        if (ok) { const score = y + r() * (mobile ? 8 : 24); if (!best || score < best.score) best = { x, y, score }; break; }
      }
    }
    const rect = { x: best.x, y: best.y, w, h, kind: b.kind, capH };
    placed.forEach((p, j) => { if (inter(rect, p)) overlaps.push([j, idx]); });
    placed.push(rect);
    bottom = Math.max(bottom, rect.y + rect.h);
    return { x: rect.x + A + pad, y: rect.y + A + pad + top, w: rect.w - 2 * A, h: rect.h - 2 * A, z: zOf(first + idx++, n) };
  }
  let bottom = 0;
  // height : bas de la strate (top compris) ; overlaps : indices locaux à cette strate
  return { add, overlaps, height: () => Math.ceil(top + bottom + 2 * pad), get count() { return idx; } };
}

/** Pour les tests : part de chaque élément recouverte par ceux qui sont au-dessus de lui (selon z). */
export function coverage(rects) {
  return rects.map(a => rects.reduce((s, b) => (b.z > a.z ? s + inter(a, b) : s), 0) / (a.w * a.h));
}

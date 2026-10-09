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
 *   - les éléments dérivent lentement (`drift`) : toutes ces règles valent à chaque instant ;
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

/* ------------------------------------------------------------------ dérive (mouvement lent)
 * Chaque élément bouge doucement autour de sa place ; le décalage ne dépasse JAMAIS `A` px sur
 * chaque axe (la marge réservée par le placement). Tout dépend de l'identifiant (stable).
 * Styles (choisis par l'auteur, essai avec ?motion=a|b|c ; sans paramètre : « calme ») :
 *   calme       ±12 / ±8 px, ≤ 3 px/s, courbe de Lissajous, un tour en 40 à 70 s ;
 *   a  souffle  ±16 / ±12 px, ≤ 5 px/s, un tour en ≈ 25 s ;
 *   b  flottement ±24 / ±16 px, ≤ 8 px/s, deux rythmes mélangés (moins régulier) ;
 *   c  houle    ±16 / ±12 px, ≈ 6 px/s, les voisins bougent ensemble : une vague traverse le mur en ≈ 20 s.
 */
export const MOTIONS = {
  calm: { A: { desktop: 12, mobile: 8 }, vmax: 3 },
  a: { A: { desktop: 16, mobile: 12 }, vmax: 5 },
  b: { A: { desktop: 24, mobile: 16 }, vmax: 8 },
  c: { A: { desktop: 16, mobile: 12 }, vmax: 6 },
};
export const DRIFT = MOTIONS.calm.A;               // compatibilité
export const motionStyle = s => (s in MOTIONS ? s : 'calm');

/**
 * Paramètres de mouvement d'un élément. style : calm | a | b | c ; pos : { x, y, W } (houle : la
 * phase dépend de la position, pour que la vague traverse le mur).
 * Chaque axe = somme de sinusoïdes dont les amplitudes totalisent au plus A ; vitesse ≤ vmax.
 */
export function drift(id, A, style = 'calm', pos = { x: 0, y: 0, W: 1000 }) {
  const r = rng(id + ':drift');
  const st = motionStyle(style), vmax = MOTIONS[st].vmax;
  const axis = () => r() * 6.283;
  if (st === 'c') {                                   // houle : orbite elliptique, phase selon la position
    const ax = A * (0.85 + 0.15 * r()), ay = ax * 0.6;
    const w = vmax / ax * 0.95;                       // vitesse ≤ ω·ax ≤ vmax
    const k = w / (pos.W / 20);                       // la vague traverse la largeur en ≈ 20 s
    const ph = -(k * pos.x + 0.6 * k * pos.y) + (r() - 0.5) * 0.6;
    return { terms: [[ax, w, ph, 0, 0, 0], [0, 0, 0, ay, w, ph + Math.PI / 2]] };
  }
  if (st === 'b') {                                   // flottement : deux rythmes par axe
    const one = () => { const a1 = A * (0.55 + 0.1 * r()), a2 = A - a1 - 0.5;
      // vitesse par axe ≤ a1·w1 + a2·w2 ≤ vmax / √2
      const w1 = (0.5 + 0.5 * r()) * vmax / Math.SQRT2 / (a1 + 1.5 * a2), w2 = w1 * 1.5; return [a1, w1, axis(), a2, w2, axis()]; };
    const x = one(), y = one();
    return { terms: [[x[0], x[1], x[2], 0, 0, 0], [x[3], x[4], x[5], 0, 0, 0], [0, 0, 0, y[0], y[1], y[2]], [0, 0, 0, y[3], y[4], y[5]]] };
  }
  const ax = A * (0.6 + 0.4 * r()), ay = A * (0.6 + 0.4 * r());
  const wmax = vmax / (A * Math.SQRT2);              // vitesse ≤ √((ax·wx)² + (ay·wy)²) ≤ vmax
  const wmin = st === 'calm' ? wmax * 0.53 : wmax * 0.6;
  const wx = wmin + (wmax - wmin) * r(), wy = wmin + (wmax - wmin) * r();
  return { terms: [[ax, wx, axis(), 0, 0, 0], [0, 0, 0, ay, wy, axis()]] };
}
/** Décalage (px) à l'instant t (secondes). |dx|, |dy| ≤ A. */
export function offsetAt(d, t) {
  let x = 0, y = 0;
  for (const [ax, wx, px, ay, wy, py] of d.terms) { if (ax) x += ax * Math.sin(wx * t + px); if (ay) y += ay * Math.sin(wy * t + py); }
  return { x, y };
}

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
 * drift : amplitude maximale du mouvement (px). Le placement se fait sur des boîtes AGRANDIES de
 * `drift` de chaque côté (toute la zone que l'élément peut balayer) : les règles (recouvrement,
 * espace autour des textes, commentaires) sont donc respectées à CHAQUE instant, même quand deux
 * voisins se rapprochent au maximum. Le recouvrement est compté par rapport à la surface réelle.
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
 */
export function createLayout(W, n, { limit = 0.3, pad = 24, mobile = false, drift: A = 0 } = {}) {
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
    return { x: rect.x + A + pad, y: rect.y + A + pad, w: rect.w - 2 * A, h: rect.h - 2 * A, z: zOf(idx++, n) };
  }
  let bottom = 0;
  return { add, overlaps, height: () => Math.ceil(bottom + 2 * pad), get count() { return idx; } };
}

/** Pour les tests : part de chaque élément recouverte par ceux qui sont au-dessus de lui (selon z). */
export function coverage(rects) {
  return rects.map(a => rects.reduce((s, b) => (b.z > a.z ? s + inter(a, b) : s), 0) / (a.w * a.h));
}

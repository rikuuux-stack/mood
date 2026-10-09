/**
 * MUR — composition libre, mais lisible.
 *
 * Règles :
 *   - les textes sont posés à nu sur le béton : ils ne chevauchent RIEN (ni image, ni texte) ;
 *   - pas d'inclinaison : tout est droit (direction brutaliste) ;
 *   - une image n'est jamais recouverte à plus de `limit` (30 % sur ordinateur, 15 % sur mobile) :
 *     on additionne la surface que lui prennent tous les éléments posés au-dessus d'elle ;
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

/** Largeur d'un élément (px) et taille de texte pour les stickers. */
export function sizeFor(post, W, mobile) {
  const r = rng(post.id + ':size');
  if (post.kind === 'text') {
    const n = [...post.text].length;
    const font = mobile ? (n <= 60 ? 23 : n <= 200 ? 19 : 17) : (n <= 60 ? 27 : n <= 200 ? 21 : 18);   // traits fins : un cran au-dessus du minimum de 16 px
    const base = mobile ? W * (n <= 60 ? 0.62 : 0.8) : (n <= 60 ? 260 : n <= 200 ? 320 : 360);
    return { w: Math.round(clamp(base * (0.92 + r() * 0.16), 200, W)), font };
  }
  const ar = post.image.w / post.image.h;
  if (mobile) {
    const w = W * (ar < 1 ? 0.56 : 0.72) * (0.92 + r() * 0.22);
    return { w: Math.round(clamp(w, 160, W)) };
  }
  const base = clamp(W / 4.6, 200, 340);
  const scale = [0.8, 1, 1.15, 1.4][Math.floor(r() * 4)] * (ar < 1 ? 0.85 : 1);
  return { w: Math.round(clamp(base * scale, 160, W * 0.6)) };
}

const inter = (a, b) => {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return x > 0 && y > 0 ? x * y : 0;
};

/** Ordre d'empilement : les textes au-dessus des images, puis l'ordre de pose. */
export const zOf = (box, i, n) => i + 1 + (box.kind === 'text' ? n : 0);

/**
 * boxes : [{ id, kind, w, h }] dans l'ordre d'affichage (le plus récent d'abord).
 * Retourne { rects: [{ x, y, w, h, z }], height, overlaps: [[i, j], …] }.
 */
export function layout(boxes, W, { limit = 0.3, pad = 24, mobile = false } = {}) {
  const inner = W - 2 * pad;
  const placed = [];            // { x, y, w, h, kind, covered }
  const n = boxes.length;
  const overlaps = [];
  const tries = mobile ? 6 : 14;

  boxes.forEach((b, idx) => {
    const r = rng(b.id + ':pos');
    const w = Math.min(b.w, inner), h = b.h, area = w * h;
    const xs = new Set();
    for (let k = 0; k < tries; k++) xs.add(Math.round(r() * Math.max(0, inner - w)));
    for (const p of placed.slice(-12)) {                 // s'aligner (en décalé) sur les voisins récents
      xs.add(clamp(Math.round(p.x + p.w * 0.72), 0, Math.max(0, inner - w)));
      xs.add(clamp(Math.round(p.x - w * 0.72), 0, Math.max(0, inner - w)));
    }
    let best = null;
    for (const x of xs) {
      const cols = placed.filter(p => p.x < x + w && p.x + p.w > x);
      const ys = new Set([0]);
      for (const p of cols) { ys.add(Math.round(p.y + p.h)); ys.add(Math.round(p.y + p.h - h * limit)); ys.add(Math.round(p.y + p.h * (1 - limit))); }
      const sorted = [...ys].filter(y => y >= 0).sort((a, b) => a - b);
      for (const y of sorted) {
        if (best && y >= best.score) break;
        const cand = { x, y, w, h };
        let mine = 0, ok = true;
        for (const p of cols) {
          const a = inter(cand, p);
          if (!a) continue;
          if (b.kind === 'text' || p.kind === 'text') { ok = false; break; }   // un texte ne touche rien
          // l'élément du dessous est l'image (un texte est toujours au-dessus) ; entre images, l'ancienne
          const meBelow = b.kind === 'image' && p.kind === 'text';
          if (meBelow) { mine += a; if (mine > area * limit) { ok = false; break; } }
          else if (p.covered + a > p.w * p.h * limit) { ok = false; break; }
        }
        if (ok) { const score = y + r() * (mobile ? 8 : 24); if (!best || score < best.score) best = { x, y, score }; break; }
      }
    }
    const rect = { x: best.x, y: best.y, w, h, kind: b.kind, covered: 0 };
    placed.forEach((p, j) => {
      const a = inter(rect, p);
      if (!a) return;
      if (b.kind === 'image' && p.kind === 'text') rect.covered += a; else p.covered += a;
      overlaps.push([j, idx]);
    });
    placed.push(rect);
  });

  const rects = placed.map((p, i) => ({ x: p.x + pad, y: p.y + pad, w: p.w, h: p.h, z: zOf(boxes[i], i, n) }));
  const height = Math.ceil(Math.max(0, ...placed.map(p => p.y + p.h)) + 2 * pad);
  return { rects, height, overlaps };
}

/** Pour les tests : part de chaque élément recouverte par ceux qui sont au-dessus de lui (selon z). */
export function coverage(rects) {
  return rects.map(a => rects.reduce((s, b) => (b.z > a.z ? s + inter(a, b) : s), 0) / (a.w * a.h));
}

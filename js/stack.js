/**
 * PROTOTYPE (?wall=stack) — un mur FIXE, sans défilement : un seul écran, les dépôts superposés.
 *
 *   - seuls les N dépôts les plus récents sont sur le mur (N = 16 sur iPhone, 40 sur ordinateur) ;
 *     les autres ne sont visibles que dans la liste ;
 *   - le plus récent au-dessus ; les TEXTES passent toujours au-dessus des images, pour rester lisibles,
 *     et s'évitent entre eux autant que possible ;
 *   - placement déterministe : graine = identifiant du dépôt + son mois à Tokyo (wallMonth) ; les positions
 *     sont des parts de l'écran, donc identiques sur tous les écrans de même taille ;
 *   - les mois : l'écran est partagé en bandes horizontales, du mois le plus récent (en haut) au plus ancien
 *     (en bas) ; les dépôts d'un mois restent dans leur bande (qui déborde un peu sur la suivante), et le mot
 *     du mois est écrit en petit, en gris, au bord gauche de sa bande. Pas de filet : les bandes se fondent.
 */
import { rng, wallMonth } from './wall.js?v=10fdf5c535';

export const STACK_N = { mobile: 16, desktop: 40 };
const SPILL = 0.35;                                    // une bande déborde de 35 % sur sa voisine

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
export const monthLabel = key => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]}.${y}`; };

/**
 * @param nodes  [{ p, w, h }] du plus récent au plus ancien (w, h : taille mesurée de l'élément)
 * @returns { places: [{ x, y, z }], bands: [{ key, label, y }] }
 */
export function stackLayout(nodes, W, H, { top, pad, now = Date.now() }) {
  const keyOf = n => (n.p.pending ? wallMonth(new Date(now).toISOString()) : wallMonth(n.p.approvedAt || n.p.createdAt));
  const keys = [...new Set(nodes.map(keyOf))];         // du plus récent au plus ancien
  const avail = Math.max(1, H - top - pad), bh = avail / Math.max(1, keys.length);
  const bands = keys.map((key, k) => ({ key, label: monthLabel(key), y: Math.round(top + k * bh) }));
  const texts = [];                                    // rectangles des textes déjà placés
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const places = nodes.map((n, i) => {
    const k = keys.indexOf(keyOf(n)), r = rng(`${n.p.id}:${keys[k]}:stack`);
    const y0 = top + k * bh - (k ? SPILL * bh : 0), y1 = top + (k + 1) * bh + (k < keys.length - 1 ? SPILL * bh : 0);
    const pick = () => ({
      x: Math.round(pad + r() * Math.max(0, W - 2 * pad - n.w)),
      y: Math.round(Math.min(Math.max(top, y0 + r() * Math.max(0, y1 - y0 - n.h)), Math.max(top, H - pad - n.h))),
      w: n.w, h: n.h,
    });
    let best = pick();
    if (n.p.kind === 'text') {                         // un texte : jusqu'à 16 essais pour ne pas couvrir un autre texte
      let cost = texts.reduce((s, t) => s + overlap(best, t), 0);
      for (let tries = 0; tries < 15 && cost > 0; tries++) {
        const c = pick(), cc = texts.reduce((s, t) => s + overlap(c, t), 0);
        if (cc < cost) { best = c; cost = cc; }
      }
      texts.push(best);
    }
    // le plus récent au-dessus ; tous les textes au-dessus de toutes les images
    return { x: best.x, y: best.y, z: (n.p.kind === 'text' ? 2000 : 1000) - i };
  });
  return { places, bands };
}

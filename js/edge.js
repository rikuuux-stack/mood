/**
 * Bords rongés — les BORDS d'une image s'effritent avec l'âge.
 *
 * Au dépôt, l'image est presque rectangulaire (un bord à peine irrégulier). À chaque palier d'usure
 * (stageOf de js/wall.js : 0 à 4), de nouvelles morsures apparaissent et les anciennes se creusent :
 * le contour est déchiré, en segments droits et en angles vifs, jamais arrondi (le rond est réservé au verre).
 *
 * Le contour est calculé à partir de l'IDENTIFIANT du dépôt (graine) et de son palier : tout le monde voit le
 * même, sur le mur, dans la liste et dans Keep (js/fragment.js relit le même polygone).
 * Il s'applique en clip-path: polygon(…) sur .photo (l'image, ou le canvas d'une vidéo agrandie).
 */
import { rng } from './wall.js?v=e2142ccd51';

const PER_EDGE = 40;                                  // points par côté (segments droits : bord déchiré)
const JITTER = [0.004, 0.008, 0.012, 0.016, 0.02];    // irrégularité fine, en part du petit côté, par palier
const BITE = [0, 0.03, 0.055, 0.08, 0.11];            // profondeur maximale d'une morsure, par palier
const CORNER = [0, 0.04, 0.07, 0.1, 0.14];            // les coins partent en premier

/** Le contour : liste de points [x, y] entre 0 et 1, dans le sens des aiguilles d'une montre. */
export function wornPolygon(id, stage, ratio = 1) {
  const r = rng(`${id}:edge`);
  const sx = Math.min(1, 1 / ratio), sy = Math.min(1, ratio);         // profondeur en part du PETIT côté
  // morsures : chacune a un côté, une position, une largeur, une profondeur et le palier où elle apparaît
  const bites = Array.from({ length: 9 }, () => ({ side: (r() * 4) | 0, at: r(), width: 0.06 + r() * 0.22, depth: 0.35 + r() * 0.65, from: 1 + ((r() * 4) | 0) }));
  const corners = [0, 1, 2, 3].map(() => ({ depth: 0.3 + r() * 0.7, from: 1 + ((r() * 3) | 0), size: 0.08 + r() * 0.12 }));
  const fine = Array.from({ length: PER_EDGE * 4 }, () => r());       // le même grain fin à chaque palier
  const pts = [];
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < PER_EDGE; k++) {
      const t = k / PER_EDGE, i = side * PER_EDGE + k;
      let d = fine[i] * JITTER[stage];
      for (const b of bites) if (b.side === side && stage >= b.from) {
        const u = Math.abs(t - b.at) / b.width;
        // dents en dents de scie : chaque point de la morsure tire sa propre profondeur (bord arraché, jamais lisse)
        if (u < 1) d += b.depth * BITE[stage] * Math.sqrt(1 - u) * (0.25 + 0.75 * fine[(i * 7 + 3) % fine.length]);
      }
      // coin en début de côté (et le précédent en fin de côté, par le côté suivant)
      const c = corners[side];
      if (stage >= c.from && t < c.size) d += c.depth * CORNER[stage] * (1 - t / c.size);
      const c2 = corners[(side + 1) % 4];
      if (stage >= c2.from && t > 1 - c2.size) d += c2.depth * CORNER[stage] * ((t - (1 - c2.size)) / c2.size);
      // position sur le côté, puis rentrée vers l'intérieur
      const [x, y] = side === 0 ? [t, d * sy] : side === 1 ? [1 - d * sx, t] : side === 2 ? [1 - t, 1 - d * sy] : [d * sx, 1 - t];
      pts.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
    }
  }
  return pts;
}

const pct = v => `${(v * 100).toFixed(2)}%`;
export const clipPathOf = pts => `polygon(${pts.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(',')})`;

/** Pose (ou met à jour) le contour usé sur chaque .photo de `el`. */
export function wear(el, p, stage) {
  if (!p.image) return;
  const ratio = p.image.w / p.image.h, path = clipPathOf(wornPolygon(p.id, stage, ratio));
  el.querySelectorAll('.photo').forEach(ph => { ph.style.clipPath = path; ph.style.webkitClipPath = path; });
}

/** Keep : relit le polygone posé sur .photo et le trace dans le canvas (même contour qu'à l'écran). */
export function clipCanvas(ctx, ph, x, y, w, h) {
  const m = (ph.style.clipPath || '').match(/^polygon\((.*)\)$/);
  if (!m) return false;
  ctx.beginPath();
  m[1].split(',').forEach((pair, i) => {
    const [a, b] = pair.trim().split(/\s+/).map(s => parseFloat(s) / 100);
    if (i) ctx.lineTo(x + a * w, y + b * h); else ctx.moveTo(x + a * w, y + b * h);
  });
  ctx.closePath(); ctx.clip();
  return true;
}

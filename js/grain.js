/**
 * Grain des VIDÉOS, appliqué à l'affichage (le fichier reste léger).
 *
 * Il reproduit le grain incrusté dans les images (js/image.js → addGrain) :
 *   - même texture : bruit gris (sans teinte), loi « triangle » (somme de deux tirages), même écart
 *     maximal (GRAIN_MAX sur 255) à 100 % ;
 *   - même finesse : un grain ≈ 1/800 du grand côté de l'élément affiché (jamais moins d'un pixel de l'écran) ;
 *   - même calcul : une image reçoit pixel + bruit. Ici, deux couches posées sur la vidéo font exactement
 *     cette addition : la partie positive du bruit est AJOUTÉE (plus-lighter), la partie négative est
 *     RETIRÉE (difference). L'opacité (valeur / 100) règle l'écart, comme pour une image ;
 *   - au même moment : le grain est ajouté AVANT le traitement N&B (le filtre est posé sur l'ensemble
 *     vidéo + grain), comme pour une image dont le grain est dans les pixels.
 *   - grain de pellicule vivant : les couches se décalent par à-coups (immobile avec « Réduire les animations »).
 */
import { GRAIN_MAX } from './image.js?v=ae95eb3c3c';

let tiles = null;
function tileUrls() {
  if (tiles) return tiles;
  const n = 256, mk = () => { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); return [c, g, g.createImageData(n, n)]; };
  const [pc, pg, pi] = mk(), [mc, mg, mi] = mk();
  for (let o = 0; o < pi.data.length; o += 4) {
    const v = (Math.random() + Math.random() - 1) * GRAIN_MAX;       // même loi que addGrain
    const p = Math.max(0, v), m = Math.max(0, -v);
    pi.data[o] = pi.data[o + 1] = pi.data[o + 2] = p; pi.data[o + 3] = 255;
    mi.data[o] = mi.data[o + 1] = mi.data[o + 2] = m; mi.data[o + 3] = 255;
  }
  pg.putImageData(pi, 0, 0); mg.putImageData(mi, 0, 0);
  return (tiles = { plus: pc.toDataURL('image/png'), minus: mc.toDataURL('image/png') });
}

/**
 * Pose (ou met à jour) le grain dans `box` (la boîte qui contient la vidéo, filtrée en N&B).
 * long : grand côté affiché, en px CSS (pour la finesse du grain).
 */
export function setGrain(box, grain, long) {
  let layers = [...box.querySelectorAll(':scope > .vgrain')];
  if (!(grain > 0)) { layers.forEach(l => l.remove()); return; }
  if (!layers.length) {
    const t = tileUrls();
    layers = ['plus', 'minus'].map(k => {
      const l = document.createElement('span');
      l.className = `vgrain vgrain--${k}`; l.setAttribute('aria-hidden', 'true');
      l.style.backgroundImage = `url(${t[k]})`;
      box.append(l);
      return l;
    });
  }
  const cell = Math.max((long || box.getBoundingClientRect().width || 300) / 800, 1 / (devicePixelRatio || 1));
  for (const l of layers) { l.style.backgroundSize = `${(256 * cell).toFixed(2)}px`; l.style.opacity = String(Math.min(100, grain) / 100); }
}

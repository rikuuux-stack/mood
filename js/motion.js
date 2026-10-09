/**
 * Dérive lente des éléments du mur (quelques px/s, trajectoires douces : js/wall.js → drift / offsetAt).
 *
 *   - uniquement `transform` (calculé par la carte graphique) : la mise en page ne bouge jamais ;
 *   - seuls les éléments visibles à l'écran sont animés (IntersectionObserver) ;
 *   - ~30 images/s suffisent à cette vitesse (moins de batterie) ;
 *   - pause : onglet caché, vue Liste, fenêtre ouverte (`isActive`) ;
 *   - « Réduire les animations » (prefers-reduced-motion) : tout reste immobile.
 * Le temps de l'animation n'avance que pendant qu'elle tourne : aucun saut à la reprise.
 */
import { drift, offsetAt } from './wall.js?v=adc98a8050';

export function createMotion(isActive) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const items = new Map();          // élément → paramètres de dérive
  const visible = new Set();
  let clock = 0, last = 0, painted = 0, raf = 0;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
  }, { rootMargin: '120px 0px' });

  const place = el => {
    const o = offsetAt(items.get(el), clock);
    el.style.transform = `translate3d(${o.x.toFixed(2)}px, ${o.y.toFixed(2)}px, 0)`;
  };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (last) clock += Math.min(0.1, (now - last) / 1000);
    last = now;
    if (now - painted < 32) return;
    painted = now;
    for (const el of visible) place(el);
  }

  function update() {
    const run = !reduce.matches && !document.hidden && isActive() && items.size > 0;
    if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (reduce.matches) for (const el of items.keys()) el.style.transform = '';
  }

  /** Nouveaux éléments à animer : [{ el, id }] ; A = amplitude maximale (px). */
  function set(list, A) {
    io.disconnect(); items.clear(); visible.clear();
    for (const { el, id } of list) { items.set(el, drift(id, A)); io.observe(el); }
    if (!reduce.matches) for (const el of items.keys()) place(el);     // position de départ, même avant d'être visible
    update();
  }

  document.addEventListener('visibilitychange', update);
  reduce.addEventListener?.('change', update);
  return { set, update };
}

/**
 * Dérive lente des éléments du mur (quelques px/s, trajectoires douces : js/wall.js → drift / offsetAt ;
 * style choisi dans js/main.js, essai avec ?motion=a|b|c).
 *
 *   - uniquement `transform` (calculé par la carte graphique) : la mise en page ne bouge jamais ;
 *   - seuls les éléments visibles à l'écran sont animés (IntersectionObserver) ;
 *   - ~30 images/s suffisent à cette vitesse (moins de batterie) ;
 *   - pause : onglet caché, vue Liste, fenêtre ouverte (`isActive`) ;
 *   - « Réduire les animations » (prefers-reduced-motion) : tout reste immobile.
 * Le temps de l'animation n'avance que pendant qu'elle tourne : aucun saut à la reprise.
 */
import { drift, offsetAt } from './wall.js?v=1e57f5bf56';

const clamp = (v, m) => Math.max(-m, Math.min(m, v));
const ease = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

/*
 * En plus de la dérive, deux réactions subtiles (désactivées avec « Réduire les animations ») :
 *   - écartement : les éléments proches du curseur ou du doigt s'écartent doucement (au plus `R` px),
 *     puis reviennent en ≈ 0,6 s quand le doigt se lève ou que le curseur s'éloigne ;
 *   - inclinaison (iPhone, activée par l'icône du bandeau) : parallaxe, les éléments S bougent peu,
 *     les L davantage (au plus `T` px).
 * Écartement + inclinaison sont plafonnés ensemble à `E` px par axe ; le placement réserve A + E
 * autour de chaque élément : la règle des 30 % reste vraie à chaque instant.
 */
const DEPTH = { s: 0.4, m: 0.7, l: 1 };

export function createMotion(isActive) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const items = new Map();          // élément → { d (dérive), x, y, w, h, depth }
  const extra = new WeakMap();      // élément → { x, y } : écartement en cours (lissé)
  const visible = new Set();
  let clock = 0, last = 0, painted = 0, raf = 0;
  let opts = { E: 0, R: 0, T: 0, radius: 140 };
  let pointer = null;               // { x, y } dans le repère du mur, ou null
  let tilt = { on: false, x: 0, y: 0, tx: 0, ty: 0 };
  let wallEl = null;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
  }, { rootMargin: '120px 0px' });

  function place(el, dt) {
    const it = items.get(el), o = offsetAt(it.d, clock);
    let ex = extra.get(el);
    if (!ex) extra.set(el, ex = { x: 0, y: 0 });
    if (dt) {
      let tx = 0, ty = 0;
      if (pointer && opts.R) {                          // s'écarter du curseur / du doigt
        const cx = it.x + it.w / 2 + o.x, cy = it.y + it.h / 2 + o.y;
        const dx = cx - pointer.x, dy = cy - pointer.y;
        // distance au bord de l'élément (pas à son centre) : un grand élément réagit aussi
        const gx = Math.max(0, Math.abs(dx) - it.w / 2), gy = Math.max(0, Math.abs(dy) - it.h / 2);
        const dist = Math.hypot(gx, gy);
        if (dist < opts.radius) {
          const f = opts.R * (1 - dist / opts.radius) ** 2, n = Math.hypot(dx, dy) || 1;
          tx = f * dx / n; ty = f * dy / n;
        }
      }
      const away = tx || ty;
      ex.x = ease(ex.x, tx, dt, away ? 0.12 : 0.2);   // vite pour s'écarter, plus doux pour revenir
      ex.y = ease(ex.y, ty, dt, away ? 0.12 : 0.2);
    }
    const px = tilt.on ? -tilt.x * opts.T * it.depth : 0, py = tilt.on ? -tilt.y * opts.T * it.depth : 0;
    const x = o.x + clamp(ex.x + px, opts.E), y = o.y + clamp(ex.y + py, opts.E);
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  }

  const busy = () => pointer || tilt.on || [...visible].some(el => { const e = extra.get(el); return e && (Math.abs(e.x) > 0.05 || Math.abs(e.y) > 0.05); });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    if (last) clock += dt;
    last = now;
    // ~30 images/s pour la dérive seule ; pleine cadence quand le doigt, le curseur ou l'inclinaison agissent
    if (!busy() && now - painted < 32) return;
    const step = painted ? Math.min(0.1, (now - painted) / 1000) : dt;
    painted = now;
    if (tilt.on) { tilt.x = ease(tilt.x, tilt.tx, step, 0.15); tilt.y = ease(tilt.y, tilt.ty, step, 0.15); }
    for (const el of visible) place(el, step);
  }

  function update() {
    const run = !reduce.matches && !document.hidden && isActive() && items.size > 0;
    if (run && !raf) { last = 0; painted = 0; raf = requestAnimationFrame(frame); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (reduce.matches) for (const el of items.keys()) el.style.transform = '';
  }

  /**
   * Éléments à animer : [{ el, id, x, y, w, h, size }] ; A = amplitude de la dérive (px) ; style : calm | a | b | c ;
   * W = largeur du mur ; o = { E, R, T, radius } : plafond, écartement max, inclinaison max, rayon d'action.
   */
  function set(list, A, style, W, o = {}) {
    opts = { ...opts, ...o };
    io.disconnect(); items.clear(); visible.clear();
    for (const { el, id, x, y, w, h, size } of list) {
      items.set(el, { d: drift(id, A, style, { x, y, W }), x, y, w, h, depth: DEPTH[size] || DEPTH.m });
      io.observe(el);
    }
    if (!reduce.matches) for (const el of items.keys()) place(el, 0);     // position de départ, même avant d'être visible
    update();
  }

  /* ---------------------------------------------------------------- curseur et doigt */
  // Le toucher passe par les événements « touch » (passifs) : ils continuent pendant le défilement,
  // contrairement aux événements « pointer », et ne bloquent jamais la page.
  function attach(el) {
    wallEl = el;
    const at = (cx, cy) => { const r = wallEl.getBoundingClientRect(); pointer = { x: cx - r.left, y: cy - r.top, cx, cy }; };
    addEventListener('pointermove', e => { if (e.pointerType === 'mouse') at(e.clientX, e.clientY); }, { passive: true });
    document.addEventListener('mouseleave', () => { pointer = null; });
    addEventListener('blur', () => { pointer = null; });
    const touch = e => { const t = e.touches[0]; if (t) at(t.clientX, t.clientY); else pointer = null; };
    addEventListener('touchstart', touch, { passive: true });
    addEventListener('touchmove', touch, { passive: true });
    addEventListener('touchend', touch, { passive: true });
    addEventListener('touchcancel', () => { pointer = null; }, { passive: true });
    // pendant le défilement, le doigt reste au même endroit de l'écran mais le mur bouge sous lui
    addEventListener('scroll', () => { if (pointer) at(pointer.cx, pointer.cy); }, { passive: true });
  }

  /* ---------------------------------------------------------------- inclinaison (iPhone) */
  let neutral = null;
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!neutral) neutral = { b: e.beta, g: e.gamma };          // la position de départ sert de repère
    tilt.tx = Math.max(-1, Math.min(1, (e.gamma - neutral.g) / 20));
    tilt.ty = Math.max(-1, Math.min(1, (e.beta - neutral.b) / 20));
    tilt.alive = true;
  }
  function setTilt(on) {
    removeEventListener('deviceorientation', onOrient);
    tilt = { on, x: 0, y: 0, tx: 0, ty: 0 };
    neutral = null;
    if (on) addEventListener('deviceorientation', onOrient);
    for (const el of visible) place(el, 0);
  }

  document.addEventListener('visibilitychange', update);
  reduce.addEventListener?.('change', update);
  return { set, update, attach, setTilt, get tiltAlive() { return !!tilt.alive; } };
}

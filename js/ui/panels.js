/**
 * Gestion des panneaux modaux (index, fiche) : ouverture, fermeture, focus,
 * touche Échap, verrouillage du défilement de la page (qui pilote la caméra).
 */
const stack = [];
const pinned = new Set();       // panneaux qu'on ne ferme pas : ils sont la seule vue disponible
let returnFocus = null;
const listeners = new Set();

export const isAnyOpen = () => stack.length > 0;
export const onPanelsChange = fn => listeners.add(fn);
const notify = () => listeners.forEach(fn => fn(stack.map(p => p.id)));

export function openPanel(el) {
  if (!stack.includes(el)) {
    if (!stack.length) returnFocus = document.activeElement;
    stack.push(el);
  }
  el.hidden = false;
  document.documentElement.classList.add('panel-open');
  requestAnimationFrame(() => (el.querySelector('[data-close]') || el).focus({ preventScroll: true }));
  notify();
}

/** Un panneau épinglé ignore Échap et [data-close] (sans 3D, l'index est tout le site). */
export const pinPanel = (el, on = true) => { on ? pinned.add(el) : pinned.delete(el); };

export function closePanel(el) {
  const i = stack.indexOf(el);
  if (i < 0 || pinned.has(el)) return;
  stack.splice(i, 1);
  el.hidden = true;
  if (!stack.length) {
    document.documentElement.classList.remove('panel-open');
    returnFocus?.focus?.({ preventScroll: true });
  } else {
    stack[stack.length - 1].querySelector('[data-close]')?.focus({ preventScroll: true });
  }
  notify();
}

export const closeTop = () => stack.length && closePanel(stack[stack.length - 1]);
export const closeAll = () => { while (stack.length) closePanel(stack[stack.length - 1]); };

addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) { e.preventDefault(); closeTop(); } });

/** Tout bouton [data-close] ferme le panneau qui le contient. */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-close]');
  const panel = b?.closest('.panel');
  if (panel) closePanel(panel);
});

/** Piège à focus minimal : Tab reste dans le panneau du dessus. */
addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !stack.length) return;
  const top = stack[stack.length - 1];
  const f = [...top.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(n => !n.closest('[hidden]'));
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

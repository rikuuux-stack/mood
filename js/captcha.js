/**
 * Vérification anti-robot (Cloudflare Turnstile), chargée seulement quand une fenêtre en a besoin.
 * Le jeton obtenu est vérifié par le serveur (supabase/functions/*) : sans lui, rien n'est accepté.
 * En mode maquette : une simple case à cocher, rien n'est vérifié.
 */
import { CONFIG } from './config.js?v=05f59e2af5';
import { mode } from './data.js?v=032a0e14b4';

const widgets = new Map();            // élément → { id, token }
let loading = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error('captcha')); };
    document.head.append(s);
  });
  return loading;
}

/** Affiche la vérification dans `el` (une seule fois par élément). */
export async function mount(el, { lang, mockLabel }) {
  if (mode === 'mock') {
    if (!el.firstChild) {
      el.innerHTML = '<label class="check captcha-mock"><input type="checkbox"> <span></span></label>';
      el.querySelector('span').textContent = mockLabel;
    }
    return;
  }
  if (widgets.has(el)) return;
  const state = { id: null, token: '' };
  widgets.set(el, state);
  try {
    await loadScript();
    state.id = window.turnstile.render(el, {
      sitekey: CONFIG.turnstileSiteKey,
      theme: 'dark', size: 'flexible', language: lang,
      callback: t => { state.token = t; },
      'expired-callback': () => { state.token = ''; },
      'error-callback': () => { state.token = ''; },
    });
  } catch {
    widgets.delete(el);
  }
}

/** Jeton prêt à être envoyé, ou '' si la vérification n'est pas faite. */
export function token(el) {
  if (mode === 'mock') return el.querySelector('input')?.checked ? 'mock' : '';
  return widgets.get(el)?.token || '';
}

/** Un jeton ne sert qu'une fois : on en redemande un après chaque envoi. */
export function reset(el) {
  if (mode === 'mock') return;
  const w = widgets.get(el);
  if (w?.id != null && window.turnstile) { w.token = ''; window.turnstile.reset(w.id); }
}

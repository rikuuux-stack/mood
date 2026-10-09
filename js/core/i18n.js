/**
 * Langue courante, traduction des éléments [data-i18n] et abonnement aux changements.
 */
import { STRINGS } from '../content/strings.js';

const LANGS = ['fr', 'ja', 'en'];
const listeners = new Set();
let lang = detect();

function detect() {
  try {
    const saved = localStorage.getItem('riku-lang');
    if (LANGS.includes(saved)) return saved;
  } catch { /* stockage indisponible : on continue */ }
  const nav = (navigator.language || 'fr').slice(0, 2);
  return LANGS.includes(nav) ? nav : 'fr';
}

export const getLang = () => lang;

/** t('clé') ou t('clé', arg) si la valeur est une fonction. */
export function t(key, ...args) {
  const v = STRINGS[lang][key] ?? STRINGS.fr[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

/** Champ trilingue d'un contenu : { fr, ja, en } → chaîne. */
export const pick = obj => (obj ? obj[lang] ?? obj.fr ?? '' : '');

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem('riku-lang', lang); } catch { /* ignore */ }
  apply();
  listeners.forEach(fn => fn(lang));
}

export const onLangChange = fn => listeners.add(fn);

/** Met à jour les textes statiques du document. */
export function apply(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}

/** Délégation : n'importe quel bouton [data-lang] change la langue. */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang]');
  if (b) setLang(b.dataset.lang);
});

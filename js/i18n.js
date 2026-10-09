/**
 * Langue : choix mémorisé, sinon langue du navigateur (ja → japonais, fr → français, sinon anglais).
 * Les éléments [data-i18n="clé"] reçoivent leur texte ; [data-i18n-label="clé"] leur aria-label.
 */
import { STRINGS } from './strings.js?v=3250d2eb31';
import { CONFIG } from './config.js?v=dddb743260';

const LANGS = ['fr', 'ja', 'en'];
const listeners = new Set();

function initial() {
  try { const s = localStorage.getItem('lang'); if (LANGS.includes(s)) return s; } catch {}
  for (const l of navigator.languages || [navigator.language || '']) {
    const p = (l || '').slice(0, 2).toLowerCase();
    if (LANGS.includes(p)) return p;
  }
  return 'en';
}

export let lang = initial();

export function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k === 'email' ? CONFIG.contactEmail : vars[k] ?? ''));
}

export function apply(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = el.ariaLabel = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  lang = l;
  try { localStorage.setItem('lang', l); } catch {}
  apply();
  listeners.forEach(fn => fn(l));
}

export const onLangChange = fn => listeners.add(fn);

/** Date courte dans la langue courante. */
// date d'un dépôt : au jour, dans le fuseau de référence du mur (Asia/Tokyo), la même pour tous les visiteurs
export const formatDate = iso => new Intl.DateTimeFormat(lang === 'ja' ? 'ja-JP' : lang === 'fr' ? 'fr-FR' : 'en-GB',
  { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(new Date(iso));

export function formatBytes(n) {
  const loc = lang === 'ja' ? 'ja-JP' : lang === 'fr' ? 'fr-FR' : 'en-GB';
  const [v, u] = n < 1024 * 1024 ? [Math.round(n / 1024), lang === 'fr' ? 'Ko' : 'KB'] : [n / 1024 / 1024, lang === 'fr' ? 'Mo' : 'MB'];
  return `${new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(v)} ${u}`;
}

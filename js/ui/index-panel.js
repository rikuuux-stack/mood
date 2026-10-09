/**
 * INDEX PLAT — la timeline des projets, pour les recruteurs qui ont 30 secondes.
 * Construit en HTML pur dès le démarrage, avant même le téléchargement de Three.js.
 *
 * - longueur du trait ∝ durée du film (échelle configurable : 'sqrt' par défaut)
 * - vignette : planche d'images (sprite) parcourue au survol, ou au glissé du doigt
 */
import { WORKS } from '../content/works.js';
import { CONFIG } from '../config.js';
import { t, pick, onLangChange } from '../core/i18n.js';
import { $, esc, runtimeLabel } from '../core/util.js';
import { openPanel, closePanel } from './panels.js';

const panel = $('#index');
const list = $('#indexList');
let onOpenWork = () => {};
let tcById = {};

export function initIndex({ openWork }) {
  onOpenWork = openWork;
  render();
  onLangChange(render);
  list.addEventListener('click', e => {
    const row = e.target.closest('[data-work]');
    if (row) onOpenWork(row.dataset.work);
  });
}

export const openIndex = () => openPanel(panel);
export const closeIndex = () => closePanel(panel);

/** Le directeur de parcours fournit le timecode d'entrée de chaque œuvre. */
export function setTimecodes(map) { tcById = map; render(); }

function barWidth(runtime, max) {
  if (!runtime) return null;
  return CONFIG.durationScale === 'sqrt' ? Math.sqrt(runtime / max) : runtime / max;
}

function render() {
  const real = WORKS.filter(w => !w.placeholder);
  $('#indexCount').textContent = t('works', real.length);
  const max = Math.max(1, ...WORKS.map(w => w.runtime || 0));
  list.innerHTML = WORKS.map(w => {
    const bw = barWidth(w.runtime, max);
    const kind = [pick(w.kind), w.year].filter(Boolean).join(' · ');
    const sprite = w.media?.sprite;
    return `<li class="${w.placeholder ? 'is-placeholder' : ''}">
      <button type="button" class="index-row" data-work="${esc(w.id)}">
        <span class="ix-tc">${esc(tcById[w.id] || '--:--:--:--')}</span>
        <span class="ix-thumb ${sprite || w.media?.poster ? '' : 'is-slate'}" ${sprite ? `data-sprite="${esc(sprite.src)}" data-frames="${sprite.frames}" data-cols="${sprite.cols}"` : ''} ${w.media?.poster ? `style="background-image:url('${esc(w.media.poster)}')" data-poster="${esc(w.media.poster)}"` : ''} aria-hidden="true"><span class="ix-frame"></span></span>
        <span class="ix-main"><span class="ix-title">${esc(pick(w.title))}</span><span class="ix-kind">${esc(kind)}</span></span>
        <span class="ix-format">${esc(w.format)}</span>
        <span class="ix-dur">
          <span class="ix-bar ${bw === null ? 'unknown' : ''}" style="--w:${bw ?? 0}"></span>
          <span class="ix-dur-label">${w.runtime ? runtimeLabel(w.runtime) : esc(w.durationNote ? pick(w.durationNote) : t('unknownDuration'))}</span>
        </span>
      </button></li>`;
  }).join('');
  list.querySelectorAll('.ix-thumb[data-sprite]').forEach(setupScrub);
}

/* ------------------------------------------------------------ défilement image par image */
const lazy = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { loadSprite(e.target); lazy.unobserve(e.target); }
}, { root: panel, rootMargin: '200px' }) : null;

function loadSprite(el) {
  if (el.dataset.loaded) return;
  el.dataset.loaded = '1';
  const img = new Image();
  img.onload = () => { el.dataset.ready = '1'; if (el.classList.contains('scrubbing')) useSprite(el); };
  img.onerror = () => { if (!el.dataset.poster) el.classList.add('is-slate'); };   // pas de planche : mire
  img.src = el.dataset.sprite;
}

/* Au repos : l'affiche (choisie avec soin). Pendant le défilement : la planche. */
function useSprite(el) {
  if (!el.dataset.ready) return;
  const cols = +el.dataset.cols, rows = Math.ceil(+el.dataset.frames / cols);
  el.style.backgroundImage = `url("${el.dataset.sprite}")`;
  el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
}
function usePoster(el) {
  if (!el.dataset.poster) return;
  el.style.backgroundImage = `url("${el.dataset.poster}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
}

function showFrame(el, i) {
  if (!el.classList.contains('scrubbing') && el.dataset.poster) return;
  const n = +el.dataset.frames, cols = +el.dataset.cols, rows = Math.ceil(n / cols);
  const col = i % cols, row = Math.floor(i / cols);
  el.style.backgroundPosition = `${cols > 1 ? col / (cols - 1) * 100 : 0}% ${rows > 1 ? row / (rows - 1) * 100 : 0}%`;
  el.querySelector('.ix-frame').textContent = `${String(i + 1).padStart(2, '0')}/${n}`;
}

function setupScrub(el) {
  lazy ? lazy.observe(el) : loadSprite(el);
  const n = () => +el.dataset.frames;
  const at = e => {
    const r = el.getBoundingClientRect();
    const x = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width));
    el.style.setProperty('--scrub', `${x * 100}%`);
    showFrame(el, Math.floor(x * n()));
  };
  // souris : survol ; tactile/stylet : glissé horizontal (touch-action: pan-y laisse le défilement vertical)
  const start = e => { loadSprite(el); el.classList.add('scrubbing'); useSprite(el); at(e); };
  el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') start(e); else loadSprite(el); });
  el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') start(e); });
  el.addEventListener('pointermove', e => { if (el.classList.contains('scrubbing')) { useSprite(el); at(e); } });
  const end = () => { el.classList.remove('scrubbing'); if (el.dataset.poster) usePoster(el); else showFrame(el, 0); };
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
  // un glissé ne doit pas ouvrir la fiche : on n'annule que si le doigt a bougé
  let sx = 0;
  el.addEventListener('pointerdown', e => { sx = e.clientX; });
  el.addEventListener('click', e => { if (Math.abs(e.clientX - sx) > 10) { e.stopPropagation(); e.preventDefault(); } }, true);
}

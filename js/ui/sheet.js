/**
 * FICHE — détail d'une œuvre ou « À propos ».
 * Le film complet n'est qu'un lien sortant (Vimeo / Mux / Cloudflare Stream) :
 * aucun lecteur tiers n'est chargé tant que le visiteur ne le demande pas.
 */
import { WORKS, ABOUT, SITE } from '../content/works.js';
import { t, pick, onLangChange } from '../core/i18n.js';
import { $, esc, runtimeLabel } from '../core/util.js';
import { openPanel, closePanel } from './panels.js';

const sheet = $('#sheet');
const content = sheet.querySelector('.sheet-content');
let current = null;
let seeInSpace = null;   // fourni par main.js quand la 3D est disponible

const dl = rows => rows?.length ? `<dl>${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>` : '';

export function initSheet({ onSeeInSpace } = {}) {
  seeInSpace = onSeeInSpace || null;
  onLangChange(() => current && render(current));
  content.addEventListener('click', e => {
    const b = e.target.closest('[data-see]');
    if (b && seeInSpace) seeInSpace(b.dataset.see);
  });
}
export const setSeeInSpace = fn => { seeInSpace = fn; if (current) render(current); };

export function openSheet(id) {
  current = id;
  render(id);
  openPanel(sheet);
  content.scrollTop = 0;
}
export const closeSheet = () => closePanel(sheet);

function render(id) {
  let html = '';
  if (id === 'about') {
    sheet.querySelector('.sheet-slug').textContent = t('about');
    html += `<h2 id="sheetTitle">RIKU</h2><p class="sheet-meta">Félix Cardonnel</p>`;
    html += `<div class="sheet-body"><p>${esc(pick(ABOUT.body))}</p></div>`;
    html += `<h3>${esc(t('path'))}</h3>${dl(pick(ABOUT.timeline))}`;
    html += `<h3>&nbsp;</h3>${dl(pick(ABOUT.facts))}`;
    const c = [];
    if (SITE.email) c.push(['Email', `<a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a>`]);
    if (SITE.instagram) c.push(['Instagram', `<a href="${esc(SITE.instagram)}" target="_blank" rel="noopener">@${esc(SITE.instagram.replace(/\/+$/, '').split('/').pop())}</a>`]);
    if (c.length) html += `<h3>${esc(t('contact'))}</h3><dl>${c.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
  } else {
    const w = WORKS.find(x => x.id === id);
    if (!w) return;
    sheet.querySelector('.sheet-slug').textContent = w.placeholder ? t('placeholderNote') : pick(w.kind);
    html += `<h2 id="sheetTitle">${esc(pick(w.title))}</h2>`;
    html += `<p class="sheet-meta">${esc([pick(w.kind), w.year, w.format, w.runtime && runtimeLabel(w.runtime)].filter(Boolean).join(' · '))}</p>`;
    if (w.media?.preview) {
      // aperçu local, déjà en cache si le visiteur vient de l'espace 3D
      html += `<video class="sheet-media" src="${esc(w.media.preview)}" poster="${esc(w.media.poster || '')}" muted loop playsinline controls preload="none"></video>`;
    }
    html += `<div class="sheet-body"><p>${esc(pick(w.body))}</p></div>`;
    html += dl(pick(w.facts));
    if (w.gallery?.length) {
      html += `<div class="sheet-gallery">${w.gallery.map(src =>
        `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`).join('')}</div>`;
    }
    const actions = [];
    if (w.link) actions.push(`<a class="btn btn-strong" href="${esc(w.link)}" target="_blank" rel="noopener">${esc(w.linkLabel ? pick(w.linkLabel) : t('watch'))} ↗</a>`);
    if (seeInSpace) actions.push(`<button type="button" class="btn" data-see="${esc(w.id)}">${esc(t('seeInSpace'))}</button>`);
    if (actions.length) html += `<div class="sheet-actions">${actions.join('')}</div>`;
  }
  content.innerHTML = html;
}

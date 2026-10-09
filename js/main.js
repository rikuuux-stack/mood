/**
 * RIKU — moodboard ouvert. Point d'entrée.
 *   - charge les dépôts validés (maquette : faux contenus) ;
 *   - deux vues : MUR (composition libre, js/wall.js) et LISTE (colonne simple) ;
 *   - toucher / survol : l'élément passe au premier plan ; second toucher : agrandissement ;
 *   - fenêtres natives <dialog> : agrandissement + signalement, dépôt, à propos.
 *
 * Les textes des visiteurs ne sont JAMAIS insérés en HTML : uniquement via textContent.
 */
import { CONFIG } from './config.js';
import { apply as applyI18n, t, setLang, onLangChange, formatDate, formatBytes } from './i18n.js';
import { layout, sizeFor } from './wall.js';
import { prepareImage, ImageError } from './image.js';
import { fetchPosts, submitPost, reportPost } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const wallEl = $('#wall'), listEl = $('#list');
let posts = [], shown = CONFIG.wall.pageSize, view = 'wall';

applyI18n();
if (CONFIG.mode === 'mock') $('#mockBanner').hidden = false;

/* ------------------------------------------------------------------ vue mémorisée */
try { if (localStorage.getItem('view') === 'list') view = 'list'; } catch {}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(v) {
  view = v;
  try { localStorage.setItem('view', v); } catch {}
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  wallEl.hidden = v !== 'wall'; listEl.hidden = v !== 'list';
  render();
}

document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
onLangChange(() => { render(); refreshDropTexts(); });

/* ------------------------------------------------------------------ éléments */
const label = p => p.isRiku ? t('byRiku') : t(p.kind === 'image' ? 'imageBy' : 'textBy', { name: p.name || t('anon') });

function stamp(inline = false) { const s = document.createElement('span'); s.className = inline ? 'stamp stamp--inline' : 'stamp'; s.setAttribute('aria-hidden', 'true'); return s; }

function content(p, { full = false, font } = {}) {
  if (p.kind === 'image') {
    const img = document.createElement('img');
    img.src = full ? p.image.src : p.image.thumb;
    img.width = p.image.w; img.height = p.image.h;
    img.alt = full ? label(p) : '';
    img.decoding = 'async';
    if (!full) img.loading = 'lazy';
    return img;
  }
  const s = document.createElement('span');
  s.className = `sticker ${dark(p) ? 'sticker--dark' : ''}`;
  if (font) s.style.setProperty('--fs', `${font}px`);
  const tx = document.createElement('span'); tx.className = 'sticker-text'; tx.textContent = p.text;
  s.append(tx);
  if (p.name && !p.isRiku) { const by = document.createElement('span'); by.className = 'sticker-by'; by.textContent = `— ${p.name}`; s.append(by); }
  return s;
}
const dark = p => (parseInt(p.id.replace(/\D/g, '').slice(-3) || '0', 10) % 3) === 1;

/* ------------------------------------------------------------------ rendu */
let lastW = 0;
function render() {
  const items = posts.slice(0, shown);
  $('#empty').hidden = items.length > 0;
  $('#more').hidden = posts.length <= shown;
  if (view === 'wall') renderWall(items); else renderList(items);
}

function renderWall(items) {
  const W = wallEl.clientWidth || document.documentElement.clientWidth;
  lastW = W;
  const mobile = W < CONFIG.wall.mobileBelow;
  const pad = mobile ? 12 : 24;
  wallEl.replaceChildren();
  wallEl.style.height = '';
  // 1. créer chaque élément à sa largeur, pour mesurer la hauteur des stickers
  const nodes = items.map((p, i) => {
    const { w, font } = sizeFor(p, W - 2 * pad, mobile);
    const li = document.createElement('li');
    li.className = `item item--${p.kind}`;
    li.style.width = `${w}px`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'item-hit';
    b.setAttribute('aria-label', p.kind === 'text' ? `${label(p)} : ${p.text.slice(0, 120)}` : label(p));
    b.append(content(p, { font }));
    li.append(b);
    if (p.isRiku) li.append(stamp());
    li.dataset.i = i;
    return { li, w, p };
  });
  wallEl.append(...nodes.map(n => n.li));
  const boxes = nodes.map(n => ({ id: n.p.id, kind: n.p.kind, w: n.w,
    h: n.p.kind === 'image' ? Math.round(n.w * n.p.image.h / n.p.image.w) : n.li.offsetHeight }));
  // 2. placer
  const L = layout(boxes, W, { limit: mobile ? CONFIG.wall.overlapMobile : CONFIG.wall.overlap, pad, mobile });
  nodes.forEach((n, i) => {
    const r = L.rects[i];
    Object.assign(n.li.style, { left: `${r.x}px`, top: `${r.y}px`, height: `${r.h}px`, zIndex: String(r.z) });
    n.li.style.setProperty('--rot', `${r.rot}deg`);
  });
  wallEl.style.height = `${L.height}px`;
  neighbours = Array.from(nodes, () => []);
  for (const [a, b] of L.overlaps) { neighbours[a].push(b); neighbours[b].push(a); }
  top = 2 * nodes.length;
}

function renderList(items) {
  listEl.replaceChildren(...items.map((p, i) => {
    const li = document.createElement('li');
    li.className = `row row--${p.kind}`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'item-hit';
    b.setAttribute('aria-label', p.kind === 'text' ? `${label(p)} : ${p.text.slice(0, 120)}` : label(p));
    b.append(content(p));
    const meta = document.createElement('p');
    meta.className = 'row-meta';
    meta.textContent = `${p.isRiku ? 'RIKU' : (p.name || t('anon'))} · ${formatDate(p.createdAt)}`;
    if (p.isRiku) meta.prepend(stamp(true), ' ');
    li.append(b, meta);
    li.dataset.i = i;
    return li;
  }));
}

/* ------------------------------------------------------------------ premier plan au toucher */
let neighbours = [], top = 0, lastPointer = 'mouse';
addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, { capture: true, passive: true });
const isOnTop = li => neighbours[+li.dataset.i]?.every(j => +wallEl.children[j].style.zIndex < +li.style.zIndex) ?? true;
const raise = li => { if (!isOnTop(li)) li.style.zIndex = String(++top); };

wallEl.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') { const li = e.target.closest('.item'); if (li) raise(li); } });
// clavier seulement : au toucher, le focus arrive avant le clic et l'élément s'ouvrirait aussitôt
wallEl.addEventListener('focusin', e => { const li = e.target.closest('.item'); if (li && e.target.matches(':focus-visible')) raise(li); });
wallEl.addEventListener('click', e => {
  const li = e.target.closest('.item');
  if (!li) return;
  // tactile : un élément partiellement recouvert passe d'abord au premier plan ; on l'ouvre au toucher suivant
  if (lastPointer !== 'mouse' && e.detail !== 0 && !isOnTop(li)) { raise(li); return; }
  openViewer(posts[+li.dataset.i]);
});
listEl.addEventListener('click', e => { const li = e.target.closest('.row'); if (li) openViewer(posts[+li.dataset.i]); });

addEventListener('resize', () => {
  if (view !== 'wall') return;
  clearTimeout(render.tm);
  render.tm = setTimeout(() => { if (Math.abs((wallEl.clientWidth || 0) - lastW) > 1) render(); }, 150);
});
$('#more').addEventListener('click', () => { shown += CONFIG.wall.pageSize; render(); });

/* ------------------------------------------------------------------ fenêtres */
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
  const d = $(`#${b.dataset.open}`);
  if (b.dataset.open === 'drop') resetDrop();
  d.showModal();
}));
document.querySelectorAll('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });   // clic sur le fond
  d.addEventListener('close', () => document.documentElement.classList.toggle('modal', !!$('dialog[open]')));
  new MutationObserver(() => document.documentElement.classList.toggle('modal', !!$('dialog[open]'))).observe(d, { attributes: true, attributeFilter: ['open'] });
});

let current = null;
function openViewer(p) {
  current = p;
  const meta = $('#viewerMeta');
  meta.replaceChildren();
  if (p.isRiku) meta.append(stamp(true), ' ');
  meta.append(`${p.isRiku ? 'RIKU' : (p.name || t('anon'))} · ${formatDate(p.createdAt)}`);
  $('#viewerBody').replaceChildren(content(p, { full: true }));
  const r = $('#report'); r.open = false;
  $('#reportForm').reset(); $('#reportForm .form-msg').textContent = '';
  $('#reportForm button[type=submit]').disabled = false;
  $('#viewer').showModal();
}

$('#reportForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget, msg = $('.form-msg', f);
  const reason = new FormData(f).get('reason');
  if (!reason) return;
  if (!captchaOk(f)) { msg.textContent = t('eCaptcha'); return; }
  $('button[type=submit]', f).disabled = true;
  try { await reportPost(current.id, reason, captchaToken(f)); msg.textContent = t('reportThanks'); }
  catch (err) { msg.textContent = err.message; $('button[type=submit]', f).disabled = false; }
});

/* ------------------------------------------------------------------ captcha (maquette : case simulée) */
function mountCaptchas() {
  document.querySelectorAll('[data-captcha]').forEach(el => {
    if (CONFIG.mode === 'mock') {
      el.innerHTML = '<label class="check captcha-mock"><input type="checkbox"> <span data-i18n="captchaMock"></span></label>';
      applyI18n(el);
    }
  });
}
const captchaOk = form => CONFIG.mode !== 'mock' || $('[data-captcha] input', form)?.checked;
const captchaToken = () => 'mock';

/* ------------------------------------------------------------------ dépôt */
const form = $('#dropForm'), fileIn = $('#file'), textIn = $('#text'), msgEl = $('#dropMsg');
let prepared = null;
const kind = () => new FormData(form).get('kind');

form.addEventListener('change', e => {
  if (e.target.name === 'kind') form.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== kind(); });
});
textIn.addEventListener('input', refreshDropTexts);
function refreshDropTexts() {
  $('#count').textContent = t('count', { n: [...textIn.value].length, max: CONFIG.upload.maxText });
  $('#fileLabel').textContent = t(prepared ? 'changeImage' : 'chooseImage');
  if (prepared) $('#previewInfo').textContent = t('processed', { w: prepared.width, h: prepared.height, size: formatBytes(prepared.full.size) });
}

fileIn.addEventListener('change', async () => {
  const file = fileIn.files[0];
  prepared = null; $('#preview').hidden = true; msgEl.textContent = '';
  if (!file) return refreshDropTexts();
  msgEl.textContent = t('processing');
  try {
    prepared = await prepareImage(file);
    const img = $('#preview img');
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.src = img.dataset.url = URL.createObjectURL(prepared.full);
    $('#preview').hidden = false;
    msgEl.textContent = '';
  } catch (err) {
    fileIn.value = '';
    msgEl.textContent = err instanceof ImageError ? t(err.code, { size: formatBytes(err.detail || 0) }) : t('eDecode');
  }
  refreshDropTexts();
});

function resetDrop() {
  form.reset(); prepared = null;
  $('#preview').hidden = true; msgEl.textContent = '';
  form.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== 'image'; });
  $('#send').disabled = false;
  refreshDropTexts();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const k = kind();
  const text = textIn.value.trim();
  if (k === 'image' && !prepared) { msgEl.textContent = t('eNoImage'); return; }
  if (k === 'text' && (!text || [...text].length > CONFIG.upload.maxText)) { msgEl.textContent = t('eNoText'); return; }
  if (!$('#rights').checked) { msgEl.textContent = t('eRights'); return; }
  if (!captchaOk(form)) { msgEl.textContent = t('eCaptcha'); return; }
  const send = $('#send');
  send.disabled = true; msgEl.textContent = t('sending');
  try {
    await submitPost({ kind: k, text, name: $('#name').value.trim().slice(0, CONFIG.upload.maxName), image: prepared, captcha: captchaToken(form) });
    msgEl.textContent = t(CONFIG.mode === 'mock' ? 'thanksMock' : 'thanks');
  } catch (err) {
    msgEl.textContent = err.message; send.disabled = false;
  }
});

/* ------------------------------------------------------------------ démarrage */
mountCaptchas();
refreshDropTexts();
posts = await fetchPosts();
// la hauteur des stickers dépend de la police : on attend qu'elle soit chargée avant de composer le mur
await Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1500))]);
setView(view);
document.fonts?.addEventListener?.('loadingdone', () => { if (view === 'wall') render(); });

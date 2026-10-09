/**
 * RIKU — moodboard ouvert. Point d'entrée.
 *   - charge les dépôts validés (maquette : faux contenus) ;
 *   - deux vues : MUR (composition libre, js/wall.js) et LISTE (colonne simple) ;
 *   - toucher / survol : l'élément passe au premier plan ; second toucher : agrandissement ;
 *   - fenêtres natives <dialog> : agrandissement + signalement, dépôt, à propos ;
 *   - un dépôt = une image, des mots, ou les deux ; plus l'image a de pixels, moins de mots (js/budget.js).
 *
 * Les textes des visiteurs ne sont JAMAIS insérés en HTML : uniquement via textContent.
 */
import { CONFIG } from './config.js';
import { apply as applyI18n, t, setLang, onLangChange, formatDate, formatBytes } from './i18n.js';
import { layout, sizeFor } from './wall.js';
import { prepareImage, ImageError } from './image.js';
import { fetchPosts, submitPost, reportPost } from './data.js';
import { textBudget, textLength } from './budget.js';

const $ = (s, r = document) => r.querySelector(s);
const wallEl = $('#wall'), listEl = $('#list');
let posts = [], shown = CONFIG.wall.pageSize, view = 'wall';

applyI18n();

/* ------------------------------------------------------------------ vue mémorisée */
try { if (localStorage.getItem('view') === 'list') view = 'list'; } catch {}
// un seul bouton, dans le panneau RIKU : il affiche le nom de l'autre vue (« Liste » sur le mur, « Mur » sur la liste)
const viewBtn = $('#viewBtn');
viewBtn.addEventListener('click', () => { setView(view === 'wall' ? 'list' : 'wall'); $('#about').close(); scrollTo(0, 0); });
const viewLabel = () => { viewBtn.textContent = t(view === 'wall' ? 'viewList' : 'viewWall'); };
function setView(v) {
  view = v;
  try { localStorage.setItem('view', v); } catch {}
  viewLabel();
  wallEl.hidden = v !== 'wall'; listEl.hidden = v !== 'list';
  render();
}

document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
onLangChange(() => { viewLabel(); render(); refreshDropTexts(); });

/* ------------------------------------------------------------------ éléments */
const label = p => p.isRiku ? t('byRiku') : t(p.kind === 'image' ? 'imageBy' : 'textBy', { name: p.name || t('anon') });
const ariaOf = p => p.text ? `${label(p)} : ${p.text.slice(0, 120)}` : label(p);

function stamp(inline = false) { const s = document.createElement('span'); s.className = inline ? 'stamp stamp--inline' : 'stamp'; s.setAttribute('aria-hidden', 'true'); return s; }

function content(p, { full = false, font, byline = false } = {}) {
  if (p.kind === 'image') {
    const img = document.createElement('img');
    img.src = full ? p.image.src : p.image.thumb;
    img.width = p.image.w; img.height = p.image.h;
    img.alt = full ? label(p) : '';
    img.decoding = 'async';
    if (!full) img.loading = 'lazy';
    // noir et blanc + grain : appliqué par .photo (css/site.css) à toutes les photos déposées
    const ph = document.createElement('span'); ph.className = 'photo'; ph.append(img);
    const fig = document.createElement('span'); fig.className = 'fig'; fig.append(ph);
    if (p.text) {                       // commentaire de la photo, sous l'image
      const cap = document.createElement('span'); cap.className = 'caption';
      const tx = document.createElement('span'); tx.className = 'caption-text'; tx.textContent = p.text;
      cap.append(tx); fig.append(cap);
    }
    return fig;
  }
  const s = document.createElement('span');
  s.className = 'sticker';
  if (font) s.style.setProperty('--fs', `${font}px`);
  const tx = document.createElement('span'); tx.className = 'sticker-text'; tx.textContent = p.text;
  s.append(tx);
  if (byline && p.name && !p.isRiku) { const by = document.createElement('span'); by.className = 'sticker-by'; by.textContent = `— ${p.name}`; s.append(by); }
  return s;
}

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
  const pad = mobile ? 16 : 24;
  wallEl.replaceChildren();
  wallEl.style.height = '';
  // 1. créer chaque élément à sa largeur, pour mesurer la hauteur des stickers
  const nodes = items.map((p, i) => {
    const { w, font } = sizeFor(p, W - 2 * pad, mobile);
    const li = document.createElement('li');
    li.className = `item item--${p.kind}${p.isRiku ? ' is-riku' : ''}`;
    li.style.width = `${w}px`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'item-hit';
    b.setAttribute('aria-label', ariaOf(p));
    b.append(content(p, { font }));
    li.append(b);
    if (p.isRiku) li.append(stamp());
    li.dataset.i = i;
    const photoH = p.kind === 'image' ? Math.round(w * p.image.h / p.image.w) : 0;
    if (photoH) li.querySelector('.photo').style.height = `${photoH}px`;
    return { li, w, p, photoH };
  });
  wallEl.append(...nodes.map(n => n.li));
  // hauteur réelle (image + commentaire éventuel) ; capH = bande du commentaire, que rien ne doit recouvrir
  const boxes = nodes.map(n => {
    const h = n.li.offsetHeight;
    return { id: n.p.id, kind: n.p.kind, w: n.w, h, capH: n.photoH ? h - n.photoH : 0 };
  });
  // 2. placer
  const L = layout(boxes, W, { limit: mobile ? CONFIG.wall.overlapMobile : CONFIG.wall.overlap, pad, mobile });
  nodes.forEach((n, i) => {
    const r = L.rects[i];
    Object.assign(n.li.style, { left: `${r.x}px`, top: `${r.y}px`, height: `${r.h}px`, zIndex: String(r.z) });
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
    b.setAttribute('aria-label', ariaOf(p));
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
// Un seul formulaire : une image, des mots, ou les deux. Le nombre de caractères autorisés
// dépend des pixels de l'image (js/budget.js) : sans image 500, avec une grande image 40.
const form = $('#dropForm'), fileIn = $('#file'), textIn = $('#text'), msgEl = $('#dropMsg');
let prepared = null;
const budget = () => prepared ? textBudget(prepared.width, prepared.height) : textBudget();

textIn.addEventListener('input', refreshDropTexts);
function refreshDropTexts() {
  const max = budget(), n = textLength(textIn.value);
  $('#budgetNote').textContent = t(prepared ? 'budgetImage' : 'budgetNone', { max });
  $('#countN').textContent = `${n} / ${max}`;
  $('#count').classList.toggle('over', n > max);
  $('#fileLabel').textContent = t(prepared ? 'changeImage' : 'chooseImage');
  $('#removeImage').hidden = !prepared;
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
$('#removeImage').addEventListener('click', () => {
  prepared = null; fileIn.value = ''; $('#preview').hidden = true; msgEl.textContent = '';
  refreshDropTexts();
});

function resetDrop() {
  form.reset(); prepared = null;
  $('#preview').hidden = true; msgEl.textContent = '';
  $('#send').disabled = false;
  refreshDropTexts();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = textIn.value.trim(), max = budget();
  if (!prepared && !text) { msgEl.textContent = t('eEmpty'); return; }
  if (textLength(text) > max) { msgEl.textContent = t('eTooLong', { max }); return; }
  if (!$('#rights').checked) { msgEl.textContent = t('eRights'); return; }
  if (!captchaOk(form)) { msgEl.textContent = t('eCaptcha'); return; }
  const send = $('#send');
  send.disabled = true; msgEl.textContent = t('sending');
  try {
    await submitPost({ kind: prepared ? 'image' : 'text', text, name: $('#name').value.trim().slice(0, CONFIG.upload.maxName), image: prepared, captcha: captchaToken(form) });
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

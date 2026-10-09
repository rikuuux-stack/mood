/**
 * Mood — moodboard ouvert. Point d'entrée.
 *   - charge les dépôts validés (js/data.js : Supabase, ou maquette avec ?mock) ;
 *   - deux vues : MUR (composition libre, js/wall.js) et LISTE (colonne simple) ;
 *   - le plus récent est au-dessus ; toucher / survol : l'élément passe au premier plan jusqu'au toucher
 *     suivant ; second toucher : agrandissement ;
 *   - les éléments du mur dérivent lentement (js/motion.js), immobiles si « Réduire les animations » ;
 *   - fenêtres natives <dialog> : agrandissement + signalement, dépôt, à propos ;
 *   - un dépôt = une image, des mots, ou les deux ; plus l'image a de pixels, moins de mots (js/budget.js).
 *
 * Les textes des visiteurs ne sont JAMAIS insérés en HTML : uniquement via textContent.
 */
import { CONFIG } from './config.js?v=1f46695844';
import { apply as applyI18n, t, lang, setLang, onLangChange, formatDate } from './i18n.js?v=81b3c75cac';
import { createLayout, sizeFor, MOTIONS, motionStyle } from './wall.js?v=14d76741cd';
import { decodeImage, renderImage, drawPreview, ImageError } from './image.js?v=6375903f29';
import { fetchPosts, cachedPosts, submitPost, reportPost, mode, ServerError } from './data.js?v=78561e8d4f';
import * as captcha from './captcha.js?v=a66a75c1dc';
import { createMotion } from './motion.js?v=2f8d05385e';
import { textBudget, textLength } from './budget.js?v=0d99de1d5b';

const $ = (s, r = document) => r.querySelector(s);
const wallEl = $('#wall'), listEl = $('#list');
let posts = [], hasMore = false, view = 'wall';
// le mur ne bouge que s'il est affiché et qu'aucune fenêtre n'est ouverte
const motion = createMotion(() => view === 'wall' && !document.querySelector('dialog[open]'));

applyI18n();

/* ------------------------------------------------------------------ vue mémorisée */
try { if (localStorage.getItem('view') === 'list') view = 'list'; } catch {}
// un seul bouton, dans le panneau « à propos » : il affiche le nom de l'autre vue (« Liste » sur le mur, « Mur » sur la liste)
const viewBtn = $('#viewBtn');
viewBtn.addEventListener('click', () => { setView(view === 'wall' ? 'list' : 'wall'); $('#about').close(); scrollTo(0, 0); });
const viewLabel = () => { viewBtn.textContent = t(view === 'wall' ? 'viewList' : 'viewWall'); };
function setView(v) {
  view = v;
  try { localStorage.setItem('view', v); } catch {}
  viewLabel();
  wallEl.hidden = v !== 'wall'; listEl.hidden = v !== 'list';
  render();
  motion.update();
}

document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
onLangChange(() => { viewLabel(); render(); refreshDropTexts(); });

/* ------------------------------------------------------------------ éléments */
const label = p => p.isAuthor ? t('byAuthor') : t(p.kind === 'image' ? 'imageBy' : 'textBy', { name: p.name || t('anon') });
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
  if (byline && p.name && !p.isAuthor) { const by = document.createElement('span'); by.className = 'sticker-by'; by.textContent = `— ${p.name}`; s.append(by); }
  return s;
}

/* ------------------------------------------------------------------ rendu */
let lastW = 0;
function render() {
  const items = posts;
  $('#empty').hidden = items.length > 0;
  $('#more').hidden = !hasMore;
  if (view === 'wall') renderWall(items); else renderList(items);
}

/*
 * Mur : les éléments déjà créés sont RÉUTILISÉS d'un rendu à l'autre (images déjà chargées, pas de
 * clignotement) ; le placement est PROGRESSIF (le premier écran tout de suite, le reste par morceaux,
 * sans bloquer la page) ; chaque élément apparaît en fondu quand son image est prête.
 * `glide` : après une mise à jour en arrière-plan, les éléments glissent vers leur nouvelle place.
 */
const nodeCache = new Map();          // identifiant → { li, key, p, w, photoH }
let wallNodes = [], renderToken = 0;
const motionName = motionStyle(new URLSearchParams(location.search).get('motion'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function nodeFor(p, w, font) {
  const key = `${w}|${font || 0}|${p.text}|${p.size}`;
  const old = nodeCache.get(p.id);
  if (old && old.key === key) { old.p = p; return old; }
  const li = document.createElement('li');
  li.className = `item item--${p.kind}${p.isAuthor ? ' is-author' : ''}`;
  li.style.width = `${w}px`;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'item-hit';
  b.setAttribute('aria-label', ariaOf(p));
  b.append(content(p, { font }));
  li.append(b);
  if (p.isAuthor) li.append(stamp());
  const photoH = p.kind === 'image' ? Math.round(w * p.image.h / p.image.w) : 0;
  if (photoH) li.querySelector('.photo').style.height = `${photoH}px`;
  if (old) { old.li.replaceWith(li); if (old.li.classList.contains('is-in')) li.classList.add('is-in', 'no-fade'); }
  const n = { li, key, p, w, photoH };
  nodeCache.set(p.id, n);
  return n;
}

/** Fondu d'apparition : dès que l'image est décodée (tout de suite pour un texte). */
function reveal(n, delay) {
  if (n.li.classList.contains('is-in')) return;
  const show = () => {
    n.li.style.transitionDelay = `${delay}ms`; n.li.classList.add('is-in');
    setTimeout(() => { n.li.style.transitionDelay = ''; }, delay + 450);   // le délai ne vaut que pour l'apparition
  };
  const img = n.li.querySelector('img');
  if (!img || img.complete) return show();
  img.addEventListener('load', show, { once: true });
  img.addEventListener('error', show, { once: true });
}

function renderWall(items, { glide = false } = {}) {
  const token = ++renderToken;
  const W = wallEl.clientWidth || document.documentElement.clientWidth;
  lastW = W;
  const mobile = W < CONFIG.wall.mobileBelow;
  const pad = mobile ? 16 : 24;
  const A = MOTIONS[motionName].A[mobile ? 'mobile' : 'desktop'];   // amplitude du mouvement : réservée autour de chaque élément
  raised = null;                                          // l'élément touché est retrouvé par son identifiant (raisedId)
  // 1. créer (ou reprendre) chaque élément à sa largeur, pour mesurer la hauteur des textes
  const ids = new Set(items.map(p => p.id));
  for (const [id, n] of nodeCache) if (!ids.has(id)) {          // retirés : s'effacent
    nodeCache.delete(id); n.li.classList.remove('is-in'); n.li.classList.add('is-out');
    setTimeout(() => n.li.remove(), reducedMotion.matches ? 0 : 450);
  }
  wallNodes = items.map((p, i) => {
    const { w, font } = sizeFor(p, W - 2 * pad - 2 * A, mobile);
    const n = nodeFor(p, w, font);
    n.li.dataset.i = i;
    if (!n.li.isConnected) wallEl.append(n.li);
    return n;
  });
  wallEl.classList.toggle('glide', glide && !reducedMotion.matches);
  if (glide) setTimeout(() => wallEl.classList.remove('glide'), 900);
  // hauteur réelle (image + commentaire éventuel) ; capH = bande du commentaire, que rien ne doit recouvrir
  const boxes = wallNodes.map(n => {
    const h = n.li.offsetHeight;
    return { id: n.p.id, kind: n.p.kind, w: n.w, h, capH: n.photoH ? h - n.photoH : 0 };
  });
  // 2. placer : d'abord ce qui est à l'écran (et un écran de plus), puis le reste par morceaux
  const L = createLayout(W, boxes.length, { limit: mobile ? CONFIG.wall.overlapMobile : CONFIG.wall.overlap, pad, mobile, drift: A });
  neighbours = wallNodes.map(() => []);
  top = 2 * wallNodes.length;
  const moving = [];
  const screen = scrollY + innerHeight * 2 - (wallEl.getBoundingClientRect().top + scrollY);
  let i = 0;
  const placeUntil = stop => {
    for (; i < wallNodes.length && !stop(); i++) {
      const n = wallNodes[i], r = L.add(boxes[i]);
      n.li.dataset.z = r.z;                              // le plus récent au-dessus
      Object.assign(n.li.style, { left: `${r.x}px`, top: `${r.y}px`, height: `${r.h}px`, zIndex: String(r.z) });
      moving.push({ el: n.li, id: n.p.id, x: r.x, y: r.y });
      reveal(n, Math.min(i * 30, 300));
    }
    for (const [a, b] of L.overlaps.splice(0)) { neighbours[a].push(b); neighbours[b].push(a); }
    wallEl.style.height = `${L.height()}px`;
    motion.set(moving, A, motionName, W);
    // le mur peut être recomposé (police chargée, largeur changée) : l'élément touché reste au premier plan
    const k = raisedId ? items.findIndex(p => p.id === raisedId) : -1;
    if (k >= 0 && k < i) { raised = wallNodes[k].li; raised.style.zIndex = String(++top); }
  };
  placeUntil(() => i >= 8 && boxes[i - 1] && L.height() > screen);
  const more = () => {
    if (token !== renderToken) return;                   // un rendu plus récent a pris le relais
    const end = i + 25;
    placeUntil(() => i >= end);
    if (i < wallNodes.length) setTimeout(more, 0);
    else if (raisedId && !items.some(p => p.id === raisedId)) raisedId = null;
  };
  if (i < wallNodes.length) setTimeout(more, 0);
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
    meta.textContent = p.isAuthor ? formatDate(p.createdAt) : `${p.name || t('anon')} · ${formatDate(p.createdAt)}`;
    if (p.isAuthor) meta.prepend(stamp(true), ' ');
    li.append(b, meta);
    li.dataset.i = i;
    return li;
  }));
}

/* ------------------------------------------------------------------ premier plan au toucher
 * Ordre normal : le plus récent au-dessus. Un élément touché (ou survolé à la souris) passe au premier
 * plan et y reste jusqu'au toucher suivant (sur un autre élément ou sur le fond) : il reprend alors sa place.
 */
let neighbours = [], top = 0, lastPointer = 'mouse', raised = null, raisedId = null;
const lower = () => { if (raised) { raised.style.zIndex = raised.dataset.z; raised = null; } raisedId = null; };
addEventListener('pointerdown', e => {
  lastPointer = e.pointerType;
  if (raised && e.target.closest?.('.item') !== raised && !e.target.closest?.('dialog')) lower();
}, { capture: true, passive: true });
const isOnTop = li => neighbours[+li.dataset.i]?.every(j => +wallNodes[j].li.style.zIndex < +li.style.zIndex) ?? true;
const raise = li => { if (raised !== li) lower(); if (!isOnTop(li)) { li.style.zIndex = String(++top); raised = li; raisedId = posts[+li.dataset.i]?.id ?? null; } };

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
// « voir plus anciens » : page suivante (150 par 150)
$('#more').addEventListener('click', async () => {
  const more = $('#more'); more.disabled = true;
  try { await loadPage(); render(); } catch { /* réessayer plus tard */ }
  more.disabled = false;
});
async function loadPage() {
  const page = await fetchPosts({ offset: posts.length });
  posts = posts.concat(page);
  hasMore = page.length === CONFIG.wall.pageSize;
}

/* ------------------------------------------------------------------ fenêtres */
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
  const d = $(`#${b.dataset.open}`);
  if (b.dataset.open === 'drop') { resetDrop(); mountCaptcha(form); }
  d.showModal();
}));
document.querySelectorAll('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });   // clic sur le fond
  const sync = () => { document.documentElement.classList.toggle('modal', !!$('dialog[open]')); motion.update(); };
  d.addEventListener('close', sync);
  new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ['open'] });
});

let current = null;
function openViewer(p) {
  current = p;
  const meta = $('#viewerMeta');
  meta.replaceChildren();
  if (p.isAuthor) meta.append(stamp(true), ' ');
  meta.append(p.isAuthor ? formatDate(p.createdAt) : `${p.name || t('anon')} · ${formatDate(p.createdAt)}`);
  $('#viewerBody').replaceChildren(content(p, { full: true }));
  const r = $('#report'); r.open = false;
  captcha.reset($('[data-captcha]', $('#reportForm')));
  $('#reportForm').reset(); $('#reportForm .form-msg').textContent = '';
  $('#reportForm button[type=submit]').disabled = false;
  $('#viewer').showModal();
}

$('#reportForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget, msg = $('.form-msg', f);
  const reason = new FormData(f).get('reason');
  if (!reason) return;
  const tok = captcha.token($('[data-captcha]', f));
  if (!tok) { msg.textContent = t('eCaptcha'); return; }
  $('button[type=submit]', f).disabled = true;
  try { await reportPost(current.id, reason, tok); msg.textContent = t('reportThanks'); }
  catch (err) { msg.textContent = errorText(err); $('button[type=submit]', f).disabled = false; captcha.reset($('[data-captcha]', f)); }
});
// la vérification du signalement ne se charge que si on ouvre « Signaler »
$('#report').addEventListener('toggle', e => { if (e.currentTarget.open) mountCaptcha($('#reportForm')); });

/* ------------------------------------------------------------------ captcha et erreurs */
const mountCaptcha = f => captcha.mount($('[data-captcha]', f), { lang, mockLabel: t('captchaMock') });

/** Message lisible pour une erreur du serveur ou du réseau (codes : supabase/functions/*). */
function errorText(err) {
  if (!(err instanceof ServerError)) return t('eServer');
  const map = { captcha: 'eCaptcha', rate: 'eRate', tooBig: 'eTooBigSrv', type: 'eType', thumb: 'eType', size: 'eType',
    meta: 'eMeta', tooLong: 'eTooLong', empty: 'eEmpty', rights: 'eRights', name: 'eName', gone: 'eGone', network: 'eNetwork' };
  return t(map[err.code] || 'eServer', { max: budget() });
}

/* ------------------------------------------------------------------ dépôt */
// Un seul formulaire : une image, des mots, ou les deux. Le nombre de caractères autorisés
// dépend des pixels de l'image (js/budget.js) : sans image 500, avec une grande image 40.
// Le visiteur choisit la taille d'affichage (S / M / L) et le grain (0 à 100) : le grain est ajouté
// à l'image dans le navigateur, au moment de l'envoi ; l'aperçu le montre en direct.
const form = $('#dropForm'), fileIn = $('#file'), textIn = $('#text'), msgEl = $('#dropMsg');
const grainIn = $('#grain'), canvas = $('#preview canvas');
let src = null, preparing = null, imageError = '';   // src : image lue ; imageError : image refusée, bloque l'envoi
const budget = () => src ? textBudget(src.width, src.height) : textBudget();
const chosenSize = () => new FormData(form).get('size') || 'm';

textIn.addEventListener('input', refreshDropTexts);
function refreshDropTexts() {
  const max = budget(), n = textLength(textIn.value);
  $('#countN').textContent = `${n} / ${max}`;
  $('#count').classList.toggle('over', n > max);
  $('#fileLabel').textContent = t(src ? 'changeImage' : 'chooseImage');
  $('#removeImage').hidden = !src && !imageError;
  $('#grainRow').hidden = !src;
  if (src) $('#previewInfo').textContent = t('processed', { w: src.width, h: src.height });
}

// aperçu du grain en direct (une fois par image affichée, pas à chaque mouvement du doigt)
let drawing = 0;
grainIn.addEventListener('input', () => {
  $('#grainOut').textContent = grainIn.value;
  if (!src || drawing) return;
  drawing = requestAnimationFrame(() => { drawing = 0; if (src) drawPreview(canvas, src, +grainIn.value); });
});

fileIn.addEventListener('change', async () => {
  const file = fileIn.files[0];
  src = null; imageError = ''; $('#preview').hidden = true; msgEl.textContent = '';
  if (!file) { preparing = null; $('#send').disabled = false; return refreshDropTexts(); }
  msgEl.textContent = t('processing');
  const job = preparing = decodeImage(file);
  $('#send').disabled = true;                          // pas d'envoi tant que l'image n'est pas lue
  try {
    const d = await job;
    if (job !== preparing) return;                     // une autre image a été choisie entre-temps
    src = d;
    drawPreview(canvas, src, +grainIn.value);
    $('#preview').hidden = false;
    msgEl.textContent = '';
  } catch (err) {
    if (job !== preparing) return;
    fileIn.value = '';                                 // image refusée : retirée, avec un message clair
    msgEl.textContent = imageError = err instanceof ImageError ? t(err.code) : t('eDecode');
  }
  preparing = null; $('#send').disabled = false;
  refreshDropTexts();
});
$('#removeImage').addEventListener('click', () => {
  src = null; preparing = null; imageError = ''; $('#send').disabled = false; fileIn.value = ''; $('#preview').hidden = true; msgEl.textContent = '';
  refreshDropTexts();
});

function resetDrop() {
  form.reset(); src = null; preparing = null; imageError = '';
  $('#grainOut').textContent = grainIn.value;
  $('#preview').hidden = true; msgEl.textContent = '';
  $('#send').disabled = false;
  refreshDropTexts();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (preparing || $('#send').disabled) return;        // image en préparation ou envoi en cours : pas de double dépôt
  if (imageError) { msgEl.textContent = imageError; return; }                        // jamais de texte seul « à la place » de l'image
  if (fileIn.files.length && !src) { msgEl.textContent = t('eDecode'); return; }
  const text = textIn.value.trim(), max = budget();
  if (!src && !text) { msgEl.textContent = t('eEmpty'); return; }
  if (textLength(text) > max) { msgEl.textContent = t('eTooLong', { max }); return; }
  if (!$('#rights').checked) { msgEl.textContent = t('eRights'); return; }
  const tok = captcha.token($('[data-captcha]', form));
  if (!tok) { msgEl.textContent = t('eCaptcha'); return; }
  const send = $('#send');
  send.disabled = true; msgEl.textContent = t('sending');
  let image = null;
  if (src) {
    try { image = await renderImage(src, { grain: +grainIn.value }); }      // image finale : grain + métadonnées retirées
    catch (err) { msgEl.textContent = err instanceof ImageError ? t(err.code) : t('eDecode'); send.disabled = false; return; }
  }
  try {
    const out = await submitPost({ text, lang, name: $('#name').value.trim().slice(0, CONFIG.upload.maxName), size: chosenSize(), image, captcha: tok });
    if (image && out.kind === 'text') console.error('[submit] image non reçue par le serveur');
    msgEl.textContent = t(mode === 'mock' ? 'thanksMock' : 'thanks');
  } catch (err) {
    msgEl.textContent = errorText(err); send.disabled = false;
  }
  captcha.reset($('[data-captcha]', form));          // un jeton ne sert qu'une fois
});

/* ------------------------------------------------------------------ démarrage
 * 1. le mur gardé sur l'appareil (moins de 24 h) s'affiche tout de suite ;
 * 2. la version à jour arrive en arrière-plan : si elle diffère, les éléments glissent vers leur
 *    nouvelle place, les nouveaux apparaissent en fondu, les retirés s'effacent.
 * Les miniatures du premier écran sont demandées dès que la liste est connue.
 */
const preload = list => list.slice(0, 14).forEach(p => {
  if (!p.image) return;
  const im = new Image(); im.fetchPriority = 'high'; im.decoding = 'async'; im.src = p.image.thumb;
});
const sameWall = (a, b) => a.length === b.length && a.every((p, i) => p.id === b[i].id && p.size === b[i].size && p.text === b[i].text);
// la hauteur des textes dépend de la police : on l'attend (brièvement) avant de composer le mur
const fontsReady = () => Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1500))]);

refreshDropTexts();
const fresh = fetchPosts({ offset: 0 });
const cached = cachedPosts();
if (cached) {
  posts = cached; hasMore = cached.length === CONFIG.wall.pageSize;
  preload(posts);
  await fontsReady();
  setView(view);
  try {
    const page = await fresh;
    if (!sameWall(posts, page)) {
      posts = page; hasMore = page.length === CONFIG.wall.pageSize;
      preload(posts);
      $('#empty').hidden = posts.length > 0; $('#more').hidden = !hasMore;
      if (view === 'wall') renderWall(posts, { glide: true }); else renderList(posts);
    }
  } catch { /* serveur injoignable : on garde le mur de l'appareil */ }
} else {
  try { posts = await fresh; hasMore = posts.length === CONFIG.wall.pageSize; preload(posts); }
  catch { posts = []; hasMore = false; }             // serveur injoignable : mur vide plutôt qu'une page cassée
  await fontsReady();
  setView(view);
}
document.fonts?.addEventListener?.('loadingdone', () => { if (view === 'wall') render(); });

/**
 * Mood — mur modéré d'images et de mots. Point d'entrée.
 *   - charge les dépôts validés et la consigne du mois (js/data.js : Supabase, ou maquette avec ?mock) ;
 *   - deux vues : MUR (composition libre, js/wall.js) et LISTE (archive complète, toujours lisible à 100 %) ;
 *   - le mur est IMMOBILE : c'est le temps qui le transforme — érosion (chaque dépôt pâlit avec son âge,
 *     quitte le mur après 180 jours) et strates (mois / consigne), voir js/wall.js ;
 *   - le plus récent est au-dessus ; un toucher ou un clic ouvre directement l'agrandissement
 *     (précédent / suivant : boutons, balayage, flèches du clavier) ;
 *   - égalité : aucun dépôt n'est distingué des autres ;
 *   - le dépôt d'un visiteur s'affiche chez lui seul, « Under review », jusqu'à sa validation ;
 *   - un dépôt = une image, des mots, ou les deux ; plus l'image a de pixels, moins de mots (js/budget.js).
 *
 * Les textes des visiteurs (et la consigne) ne sont JAMAIS insérés en HTML : uniquement via textContent.
 */
import { CONFIG } from './config.js?v=887f663b99';
import { apply as applyI18n, t, lang, setLang, onLangChange, formatDate } from './i18n.js?v=b9bb643d7f';
import { createLayout, sizeFor, visibility, ageDays, onWall, strataKey } from './wall.js?v=4722e283c5';
import { decodeImage, renderImage, drawPreview, ImageError } from './image.js?v=63243cc491';
import { fetchPosts, cachedPosts, fetchPrompt, pendingPosts, addPending, settlePending, submitPost, reportPost, mode, ServerError } from './data.js?v=44106a34a4';
import * as captcha from './captcha.js?v=476277c2da';
import { textBudget, textLength } from './budget.js?v=0d99de1d5b';

const $ = (s, r = document) => r.querySelector(s);
const wallEl = $('#wall'), listEl = $('#list');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let posts = [], pending = pendingPosts(), prompt = '', hasMore = false, view = 'wall';

applyI18n();

/* ------------------------------------------------------------------ vue mémorisée */
try { if (localStorage.getItem('view') === 'list') view = 'list'; } catch {}
// un seul bouton, dans le panneau « à propos » : il affiche le nom de l'autre vue (« List » sur le mur, « Wall » sur la liste)
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
onLangChange(() => { viewLabel(); showPrompt(); render(); refreshDropTexts(); });

/* ------------------------------------------------------------------ ce qui s'affiche
 * Mur : mes dépôts en attente (chez moi seulement) + les dépôts de moins de 180 jours.
 * Liste : tout, à 100 %.
 */
const asPending = p => ({ ...p, pending: true });
const wallItems = () => [...pending.map(asPending), ...posts.filter(p => onWall(ageDays(p.approvedAt)))];
const listItems = () => [...pending.map(asPending), ...posts];
const items = () => (view === 'wall' ? wallItems() : listItems());
// « More » sur le mur : seulement si la page suivante peut encore contenir des dépôts de moins de 180 jours
const moreOK = () => hasMore && (view === 'list' || (posts.length > 0 && onWall(ageDays(posts.at(-1).approvedAt))));

/* ------------------------------------------------------------------ consigne du mois */
function showPrompt() {
  for (const el of [$('#prompt'), $('#dropPrompt')]) {
    el.textContent = prompt ? t('thisMonth', { prompt }) : '';
    el.hidden = !prompt;
  }
}

/* ------------------------------------------------------------------ éléments */
const label = p => t(p.kind === 'image' ? 'imageBy' : 'textBy', { name: p.name || t('anon') });
const ariaOf = p => (p.pending ? `${t('pending')} — ` : '') + (p.text ? `${label(p)} : ${p.text.slice(0, 120)}` : label(p));
const metaOf = p => (p.pending ? t('pending') : `${p.name || t('anon')} · ${formatDate(p.createdAt)}`);

/** Photo : cadre aux bonnes proportions tout de suite, image en fondu (≈ 220 ms) dès qu'elle est prête. */
function photo(p, full) {
  const img = document.createElement('img');
  img.width = p.image.w; img.height = p.image.h;
  img.alt = full ? label(p) : '';
  img.decoding = 'async';
  if (!full) img.loading = 'lazy';
  // noir et blanc + grain : appliqué par .photo (css/site.css) à toutes les photos déposées
  const ph = document.createElement('span'); ph.className = 'photo'; ph.append(img);
  const done = () => ph.classList.add('is-loaded');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
  img.src = full ? p.image.src : p.image.thumb;
  if (img.complete && img.naturalWidth) done();
  return ph;
}

function content(p, { full = false, font, byline = false } = {}) {
  if (p.kind === 'image') {
    const fig = document.createElement('span'); fig.className = 'fig'; fig.append(photo(p, full));
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
  if (byline && p.name) { const by = document.createElement('span'); by.className = 'sticker-by'; by.textContent = `— ${p.name}`; s.append(by); }
  return s;
}

/* ------------------------------------------------------------------ rendu */
let lastW = 0;
function render() {
  const list = items();
  $('#empty').hidden = list.length > 0 || posts.length > 0;
  $('#more').hidden = !moreOK();
  if (view === 'wall') renderWall(list); else renderList(list);
}

/*
 * Mur : les éléments déjà créés sont RÉUTILISÉS d'un rendu à l'autre (images déjà chargées, pas de
 * clignotement) ; le placement est PROGRESSIF (le premier écran tout de suite, le reste par morceaux,
 * sans bloquer la page) ; chaque strate (mois / consigne) est placée sous la précédente, séparée par
 * un filet et le mot de sa consigne. `glide` : après une mise à jour en arrière-plan, les éléments
 * glissent vers leur nouvelle place.
 */
const nodeCache = new Map();          // identifiant → { li, key, p, w, photoH }
let wallNodes = [], renderToken = 0;
const STRATUM = 64;                   // hauteur d'un séparateur de strates (px)

function nodeFor(p, w, font) {
  const key = `${w}|${font || 0}|${p.text}|${p.size}|${p.pending ? 1 : 0}`;
  const old = nodeCache.get(p.id);
  if (old && old.key === key) { old.p = p; return old; }
  const li = document.createElement('li');
  li.className = `item item--${p.kind}${p.pending ? ' is-pending' : ''}`;
  li.style.width = `${w}px`;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'item-hit';
  b.setAttribute('aria-label', ariaOf(p));
  b.append(content(p, { font }));
  li.append(b);
  if (p.pending) { const tag = document.createElement('span'); tag.className = 'pending-tag'; tag.textContent = t('pending'); li.append(tag); }
  const photoH = p.kind === 'image' ? Math.round(w * p.image.h / p.image.w) : 0;
  if (photoH) li.querySelector('.photo').style.height = `${photoH}px`;
  if (old) old.li.replaceWith(li);
  const n = { li, key, p, w, photoH };
  nodeCache.set(p.id, n);
  return n;
}

function divider(p, y, pad) {
  const li = document.createElement('li');
  li.className = 'stratum'; li.setAttribute('role', 'separator');
  li.style.top = `${y}px`; li.style.left = li.style.right = `${pad}px`;
  if (p.prompt) { const s = document.createElement('span'); s.textContent = p.prompt; li.append(s); }   // un mois sans consigne : le filet seul
  return li;
}

function renderWall(list, { glide = false } = {}) {
  const token = ++renderToken;
  const W = wallEl.clientWidth || document.documentElement.clientWidth;
  lastW = W;
  const mobile = W < CONFIG.wall.mobileBelow;
  const pad = mobile ? 16 : 24;
  const limit = mobile ? CONFIG.wall.overlapMobile : CONFIG.wall.overlap;
  // 1. créer (ou reprendre) chaque élément à sa largeur, pour mesurer la hauteur des textes
  const ids = new Set(list.map(p => p.id));
  for (const [id, n] of nodeCache) if (!ids.has(id)) {          // retirés (ou partis dans la liste) : s'effacent
    nodeCache.delete(id); n.li.classList.add('is-out');
    setTimeout(() => n.li.remove(), reducedMotion.matches ? 0 : 450);
  }
  wallEl.querySelectorAll('.stratum').forEach(d => d.remove());
  const now = Date.now();
  wallNodes = list.map((p, i) => {
    const { w, font } = sizeFor(p, W - 2 * pad, mobile);
    const n = nodeFor(p, w, font);
    n.li.dataset.i = i;
    // érosion : visibilité selon le temps passé sur le mur (un dépôt en attente garde son propre aspect)
    n.li.style.setProperty('--v', p.pending ? '1' : visibility(ageDays(p.approvedAt, now)).toFixed(3));
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
  // la strate en cours : celle du mois et de la consigne d'aujourd'hui (pas de séparateur au-dessus)
  const currentKey = strataKey({ createdAt: new Date(now).toISOString(), prompt });
  const keyOf = p => (p.pending ? currentKey : strataKey(p));
  // 2. placer : strate par strate ; d'abord ce qui est à l'écran (et un écran de plus), puis le reste par morceaux
  const screen = scrollY + innerHeight * 2 - (wallEl.getBoundingClientRect().top + scrollY);
  let i = 0, L = null, key = null, bottom = 0;
  const placeUntil = stop => {
    for (; i < wallNodes.length && !stop(); i++) {
      const n = wallNodes[i], k = keyOf(n.p);
      if (k !== key) {                                   // nouvelle strate : filet + mot de sa consigne, puis ses dépôts
        let top = L ? L.height() - pad : 0;
        if (L || k !== currentKey) { wallEl.append(divider(n.p, top + pad, pad)); top += STRATUM; }
        key = k;
        L = createLayout(W, wallNodes.length, { limit, pad, mobile, top, first: i });
      }
      const r = L.add(boxes[i]);
      Object.assign(n.li.style, { left: `${r.x}px`, top: `${r.y}px`, height: `${r.h}px`, zIndex: String(r.z) });   // le plus récent au-dessus
      bottom = Math.max(bottom, L.height());
    }
    wallEl.style.height = `${bottom}px`;
  };
  placeUntil(() => i >= 8 && bottom > screen);
  const more = () => {
    if (token !== renderToken) return;                   // un rendu plus récent a pris le relais
    const end = i + 25;
    placeUntil(() => i >= end);
    if (i < wallNodes.length) setTimeout(more, 0);
  };
  if (i < wallNodes.length) setTimeout(more, 0);
}

function renderList(list) {
  listEl.replaceChildren(...list.map((p, i) => {
    const li = document.createElement('li');
    li.className = `row row--${p.kind}${p.pending ? ' is-pending' : ''}`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'item-hit';
    b.setAttribute('aria-label', ariaOf(p));
    b.append(content(p));
    const meta = document.createElement('p');
    meta.className = 'row-meta';
    meta.textContent = metaOf(p);
    li.append(b, meta);
    li.dataset.i = i;
    return li;
  }));
}

/* ------------------------------------------------------------------ interaction
 * Un toucher ou un clic ouvre directement l'agrandissement. Au toucher, un léger retour (css : :active,
 * scale .985) reste visible ≈ 80 ms avant l'ouverture. Survol / focus : css (l'élément passe au-dessus,
 * monte de 6 px, retrouve toute sa visibilité).
 */
let lastPointer = 'mouse';
addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, { capture: true, passive: true });
function openFrom(e, sel) {
  const el = e.target.closest(sel);
  if (!el) return;
  const i = +el.dataset.i, list = items();
  const go = () => openViewer(list, i);
  if (lastPointer === 'touch' && !reducedMotion.matches && e.detail !== 0) setTimeout(go, 80); else go();
}
wallEl.addEventListener('click', e => openFrom(e, '.item'));
listEl.addEventListener('click', e => openFrom(e, '.row'));

addEventListener('resize', () => {
  if (view !== 'wall') return;
  clearTimeout(render.tm);
  render.tm = setTimeout(() => { if (Math.abs((wallEl.clientWidth || 0) - lastW) > 1) render(); }, 150);
});
// « More » : lot suivant (30 par 30)
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
  const sync = () => document.documentElement.classList.toggle('modal', !!$('dialog[open]'));
  d.addEventListener('close', sync);
  new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ['open'] });
});

/* ------------------------------------------------------------------ agrandissement : précédent / suivant */
let seq = [], at = 0;
const current = () => seq[at];
function openViewer(list, i) {
  seq = list; at = i;
  showViewer();
  if (!$('#viewer').open) $('#viewer').showModal();
}
function showViewer() {
  const p = current();
  $('#viewerMeta').textContent = metaOf(p);
  $('#viewerBody').replaceChildren(content(p, { full: true, byline: true }));
  $('#prev').disabled = at <= 0; $('#next').disabled = at >= seq.length - 1;
  const r = $('#report'); r.open = false; r.hidden = !!p.pending;          // un dépôt en attente ne se signale pas
  captcha.reset($('[data-captcha]', $('#reportForm')));
  $('#reportForm').reset(); $('#reportForm .form-msg').textContent = '';
  $('#reportForm button[type=submit]').disabled = false;
}
const step = d => { const j = at + d; if (j >= 0 && j < seq.length) { at = j; showViewer(); } };
$('#prev').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));
$('#viewer').addEventListener('keydown', e => {
  if (e.target.closest('form')) return;                // flèches libres dans le formulaire de signalement
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
});
// balayage horizontal (passif : ne bloque jamais le défilement)
let sx = 0, sy = 0;
$('#viewerBody').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
$('#viewerBody').addEventListener('touchend', e => {
  const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
}, { passive: true });

$('#reportForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget, msg = $('.form-msg', f);
  const reason = new FormData(f).get('reason');
  if (!reason) return;
  const tok = captcha.token($('[data-captcha]', f));
  if (!tok) { msg.textContent = t('eCaptcha'); return; }
  $('button[type=submit]', f).disabled = true;
  try { await reportPost(current().id, reason, tok); msg.textContent = t('reportThanks'); }
  catch (err) { msg.textContent = errorText(err); $('button[type=submit]', f).disabled = false; captcha.reset($('[data-captcha]', f)); }
});
// la vérification du signalement ne se charge que si on ouvre « Report »
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
// Le visiteur choisit la taille d'affichage (S / M / L). Le grain est une règle globale du site.
const form = $('#dropForm'), fileIn = $('#file'), textIn = $('#text'), msgEl = $('#dropMsg');
const canvas = $('#preview canvas');
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
  if (src) $('#previewInfo').textContent = t('processed', { w: src.width, h: src.height });
}

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
    drawPreview(canvas, src, 0);
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
  $('#preview').hidden = true; msgEl.textContent = '';
  $('#send').disabled = false;
  refreshDropTexts();
}

/** Petite copie de l'image (≈ 400 px, JPEG) pour montrer au visiteur son dépôt en attente. */
async function smallCopy(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return null; }
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
    try { image = await renderImage(src); }            // image finale : réduite, métadonnées retirées
    catch (err) { msgEl.textContent = err instanceof ImageError ? t(err.code) : t('eDecode'); send.disabled = false; return; }
  }
  const name = $('#name').value.trim().slice(0, CONFIG.upload.maxName), size = chosenSize();
  try {
    const out = await submitPost({ text, lang, name, size, image, captcha: tok });
    if (image && out.kind === 'text') console.error('[submit] image non reçue par le serveur');
    msgEl.textContent = t(mode === 'mock' ? 'thanksMock' : 'thanks');
    // mon dépôt, chez moi seulement, jusqu'à sa validation
    if (out.id && out.status === 'pending') {
      const copy = image ? await smallCopy(image.thumb) : null;
      if (!image || copy) {
        const nowIso = new Date().toISOString();
        addPending({ id: out.id, kind: image ? 'image' : 'text', text, name, size, prompt, createdAt: nowIso, approvedAt: nowIso,
          image: image ? { src: copy, thumb: copy, w: image.width, h: image.height } : null });
        pending = pendingPosts();
        render();
      }
    }
  } catch (err) {
    msgEl.textContent = errorText(err); send.disabled = false;
  }
  captcha.reset($('[data-captcha]', form));          // un jeton ne sert qu'une fois
});

/* ------------------------------------------------------------------ démarrage
 * 1. le mur gardé sur l'appareil (moins de 24 h) s'affiche tout de suite ;
 * 2. la version à jour (dépôts + consigne) arrive en arrière-plan : si elle diffère, les éléments
 *    glissent vers leur nouvelle place, les nouveaux apparaissent, les retirés s'effacent ;
 *    mes dépôts en attente désormais publiés sont retirés de ma copie locale.
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
const freshPrompt = fetchPrompt().catch(() => null);
const cached = cachedPosts();
function applyFresh(page, pr) {
  const before = pending.length;
  posts = page; hasMore = page.length === CONFIG.wall.pageSize;
  pending = settlePending(page.map(p => p.id));
  if (pr !== null && pr !== undefined) prompt = pr;
  showPrompt();
  return before !== pending.length;
}
if (cached) {
  posts = cached.posts; prompt = cached.prompt; hasMore = posts.length === CONFIG.wall.pageSize;
  showPrompt();
  preload(posts);
  await fontsReady();
  setView(view);
  try {
    const [page, pr] = await Promise.all([fresh, freshPrompt]);
    const was = posts, oldPrompt = prompt;
    const pendingChanged = applyFresh(page, pr);
    if (!sameWall(was, page) || pendingChanged || prompt !== oldPrompt) {
      preload(posts);
      $('#empty').hidden = items().length > 0 || posts.length > 0; $('#more').hidden = !moreOK();
      if (view === 'wall') renderWall(items(), { glide: true }); else renderList(items());
    }
  } catch { /* serveur injoignable : on garde le mur de l'appareil */ }
} else {
  try { applyFresh(await fresh, await freshPrompt); preload(posts); }
  catch { posts = []; hasMore = false; }             // serveur injoignable : mur vide plutôt qu'une page cassée
  await fontsReady();
  setView(view);
}
document.fonts?.addEventListener?.('loadingdone', () => { if (view === 'wall') render(); });

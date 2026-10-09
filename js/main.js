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
import { CONFIG } from './config.js?v=dddb743260';
import { apply as applyI18n, t, lang, setLang, onLangChange, formatDate } from './i18n.js?v=123647c65c';
import { createLayout, sizeFor, visibility, stageOf, ageDays, onWall, strataKey } from './wall.js?v=8906cf420f';
import { decodeImage, renderImage, drawPreview, ImageError } from './image.js?v=a3f88b470d';
import { fetchPosts, cachedPosts, fetchPrompt, pendingPosts, addPending, settlePending, submitPost, reportPost, mode, ServerError } from './data.js?v=7bb3934f8a';
import * as captcha from './captcha.js?v=94658e943e';
import { textBudget, textLength } from './budget.js?v=0d99de1d5b';
import { serverError, videoError } from './errors.js?v=d67ec3ce38';

/* VARIANTES À COMPARER (PR de comparaison, ne pas merger) — paramètres d'URL combinables :
 *   ?bg=black    fond noir pur, grain fin et discret (css/site.css)
 *   ?restore=0   un dépôt ouvert en grand garde son érosion (images et vidéos)
 *   ?keepurl=0   le fragment Keep ne porte que la date et la consigne (sans l'adresse du site) */
const VARIANT = (q => ({ black: q.get('bg') === 'black', restore: q.get('restore') !== '0', keepUrl: q.get('keepurl') !== '0' }))(new URLSearchParams(location.search));
if (VARIANT.black) document.documentElement.dataset.bg = 'black';
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

/* ------------------------------------------------------------------ consigne du mois */
function showPrompt() {
  for (const el of [$('#prompt'), $('#dropPrompt')]) {
    el.textContent = prompt ? t('thisMonth', { prompt }) : '';
    el.hidden = !prompt;
  }
}

/* ------------------------------------------------------------------ éléments */
// une vidéo (ou un GIF converti) se comporte comme une photo partout, sauf dans l'agrandissement où elle joue
const visual = p => p.kind === 'image' || p.kind === 'video';
const label = p => t(p.kind === 'video' ? 'videoBy' : p.kind === 'image' ? 'imageBy' : 'textBy', { name: p.name || t('anon') });
const ariaOf = p => (p.pending ? `${t('pending')} — ` : '') + (p.text ? `${label(p)} : ${p.text.slice(0, 120)}` : label(p));
const metaOf = p => (p.pending ? t('pending') : `${p.name || t('anon')} · ${formatDate(p.createdAt)}`);

/*
 * Images du mur et de la liste : téléchargées seulement à l'approche de l'écran (un écran de marge,
 * au-dessus comme au-dessous), et LIBÉRÉES quand elles s'en éloignent (au-delà de 3 écrans) : la mémoire
 * ne dépend plus de la taille du mur, seulement de ce qui est autour de l'écran. Revenir vers une image
 * libérée la redemande au cache du navigateur (pas de nouveau téléchargement). Le cadre garde toujours
 * sa taille : la composition ne bouge pas.
 */
const IO = 'IntersectionObserver' in window;
const load = img => { img.src = img.dataset.src; delete img.dataset.src; if (far) far.observe(img); };
const near = IO ? new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting && e.target.dataset.src) { near.unobserve(e.target); load(e.target); }
}), { rootMargin: '100% 0px' }) : null;
const far = IO ? new IntersectionObserver(entries => entries.forEach(e => {
  const img = e.target;
  if (e.isIntersecting || !img.getAttribute('src')) return;
  far.unobserve(img);
  img.dataset.src = img.getAttribute('src'); img.removeAttribute('src');    // l'image décodée est libérée
  img.parentElement?.classList.remove('is-loaded');
  near.observe(img);
}), { rootMargin: '300% 0px' }) : null;
/** Surveille les images pas encore chargées sous `root` (appelé une fois l'élément à sa place). */
function watch(root) {
  root.querySelectorAll('img[data-src]').forEach(img => { if (near) near.observe(img); else load(img); });
}

/** Photo : cadre aux bonnes proportions tout de suite, image en fondu (≈ 220 ms) dès qu'elle est prête. */
function photo(p, full) {
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';                       // pixels lisibles par un canvas (Keep, js/fragment.js) ; avant src
  img.width = p.image.w; img.height = p.image.h;
  img.alt = full ? label(p) : '';
  img.decoding = 'async';
  // noir et blanc + grain : appliqué par .photo (css/site.css) à toutes les photos déposées
  const ph = document.createElement('span'); ph.className = 'photo'; ph.append(img);
  const done = () => ph.classList.add('is-loaded');
  img.addEventListener('load', done);                  // à chaque (re)chargement : l'image peut être libérée puis revenir
  img.addEventListener('error', done);
  if (!full) img.style.aspectRatio = `${p.image.w} / ${p.image.h}`;   // cadre à la bonne forme, même image libérée (liste)
  if (full) img.src = p.image.src; else img.dataset.src = p.image.thumb;   // miniature : à l'approche de l'écran (watch)
  if (img.complete && img.naturalWidth) done();
  return ph;
}

/*
 * Vidéo dans l'agrandissement : téléchargée seulement à l'ouverture, jouée muette, en boucle, neuve (noir et blanc
 * déjà dans le fichier, aucune érosion). Avec « Réduire les animations » : pas de lecture automatique, un bouton ▶.
 * Arrêtée et libérée de la mémoire à la fermeture ou au passage à un autre dépôt (freeVideos).
 */
function player(p) {
  const ph = document.createElement('span'); ph.className = 'photo is-video';
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.width = p.image.w; v.height = p.image.h;
  v.poster = p.image.thumb;
  v.setAttribute('aria-label', label(p));
  v.addEventListener('loadeddata', () => ph.classList.add('is-loaded'), { once: true });
  ph.append(v);
  v.src = p.image.video;
  if (reducedMotion.matches) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vplay'; b.textContent = t('play'); b.setAttribute('aria-label', t('playVideo'));
    b.addEventListener('click', () => { b.remove(); v.play().catch(() => {}); });
    ph.append(b);
  } else {
    v.autoplay = true;
    v.play().catch(() => {});                          // lecture muette : permise sans geste
  }
  return ph;
}
/** Arrête et libère les vidéos sous `root` (l'image décodée et le fichier ne restent pas en mémoire). */
function freeVideos(root) {
  root.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
}

function content(p, { full = false, font, byline = false } = {}) {
  if (visual(p)) {
    const media = full && p.kind === 'video' && p.image.video ? player(p) : photo(p, full);
    const fig = document.createElement('span'); fig.className = 'fig'; fig.append(media);
    if (!full && p.kind === 'video') {                 // sur le mur et dans la liste : l'image fixe + un petit ▶
      const m = document.createElement('span'); m.className = 'vmark'; m.textContent = '▶'; m.setAttribute('aria-hidden', 'true');
      media.append(m);
    }
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
  li.className = `item item--${p.kind === 'video' ? 'image item--video' : p.kind}${p.pending ? ' is-pending' : ''}`;
  li.style.width = `${w}px`;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'item-hit';
  b.setAttribute('aria-label', ariaOf(p));
  b.append(content(p, { font }));
  li.append(b);
  if (p.pending) { const tag = document.createElement('span'); tag.className = 'pending-tag'; tag.textContent = t('pending'); li.append(tag); }
  const photoH = visual(p) ? Math.round(w * p.image.h / p.image.w) : 0;
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
    // érosion : selon le temps passé sur le mur (un dépôt en attente garde son propre aspect) ;
    // images : palier fixe (classe age-N → filtre partagé), textes : --v
    const v = p.pending ? 1 : visibility(ageDays(p.approvedAt, now)), stage = stageOf(v);
    n.li.style.setProperty('--v', v.toFixed(3));
    if (n.stage !== stage) { if (n.stage) n.li.classList.remove(`age-${n.stage}`); if (stage) n.li.classList.add(`age-${stage}`); n.stage = stage; }
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
      watch(n.li);                                       // à sa place : son image peut arriver quand l'écran approche
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
    li.className = `row row--${p.kind === 'video' ? 'image row--video' : p.kind}${p.pending ? ' is-pending' : ''}`;
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
  watch(listEl);
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
/* Tout le mur, sans bouton : les paquets suivants (500 par 500) sont lus en arrière-plan, et le mur
   se complète à chaque paquet (les éléments déjà placés ne bougent pas : les nouveaux sont plus anciens). */
async function loadRest() {
  while (hasMore) {
    let page;
    try { page = await fetchPosts({ offset: posts.length }); } catch { return; }   // réessayé à la prochaine visite
    const known = new Set(posts.map(p => p.id));
    posts = posts.concat(page.filter(p => !known.has(p.id)));
    hasMore = page.length === CONFIG.wall.batch;
    render();
  }
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
  freeVideos($('#viewerBody'));
  $('#viewerBody').replaceChildren(content(p, { full: true, byline: true }));
  // ?restore=0 : l'agrandissement garde le palier d'érosion du dépôt (sinon : neuf, comme en production)
  const vb = $('#viewerBody'), stage = !VARIANT.restore && !p.pending ? stageOf(visibility(ageDays(p.approvedAt))) : 0;
  vb.classList.remove('age-1', 'age-2', 'age-3', 'age-4');
  if (stage) vb.classList.add(`age-${stage}`);
  $('#prev').disabled = at <= 0; $('#next').disabled = at >= seq.length - 1;
  const r = $('#report'); r.open = false; r.hidden = !!p.pending;          // un dépôt en attente ne se signale pas
  captcha.reset($('[data-captcha]', $('#reportForm')));
  $('#reportForm').reset(); $('#reportForm .form-msg').textContent = '';
  $('#reportForm button[type=submit]').disabled = false;
  resetKeep();
}
/* ------------------------------------------------------------------ Keep : un fragment du mur
 * Dans l'agrandissement d'un dépôt du mur : « Keep » ouvre le choix du format (4:5 par défaut, ou 9:16) et
 * fabrique aussitôt l'image sur l'appareil (js/fragment.js, chargé seulement à ce moment-là). Un second
 * toucher la partage (menu natif : Enregistrer l'image, Instagram, LINE…) ou, sur ordinateur, la télécharge.
 * Deux temps : le menu de partage exige un geste récent du visiteur, que la fabrication pourrait dépasser.
 */
const keepEl = $('#keep'), keepPanel = $('#keepPanel'), keepGo = $('#keepGo'), keepMsg = $('#keepMsg'), keepPreview = $('#keepPreview');
const coarse = matchMedia('(pointer: coarse)');
let keepFormat = '4:5', kept = null, keepJob = 0;
/** Le dépôt est-il placé sur le mur (le fragment se prélève sur le mur tel qu'il est) ? */
function keepNode(p) {
  if (!p || p.pending || view !== 'wall') return null;
  const n = nodeCache.get(p.id);
  return n && n.li.isConnected && n.li.style.top ? n : null;
}
function dropKept() { if (kept?.url) URL.revokeObjectURL(kept.url); kept = null; }
function resetKeep() {
  keepJob++; dropKept();
  keepPanel.hidden = true; $('#keepBtn').setAttribute('aria-expanded', 'false');
  keepPreview.hidden = true; keepPreview.removeAttribute('src'); keepMsg.textContent = '';
  keepEl.hidden = !keepNode(current());
}
const canShare = () => coarse.matches && !!kept && !!navigator.canShare?.({ files: [kept.file] });
async function makeKeep() {
  const job = ++keepJob, p = current(), n = keepNode(p);
  if (!n) return;
  dropKept(); keepGo.disabled = true; keepPreview.hidden = true;
  keepMsg.textContent = t('making');
  try {
    const { makeFragment, today } = await import('./fragment.js?v=08987fd814');
    const out = await makeFragment({ li: n.li, wallEl, format: keepFormat, prompt: p.prompt || '', url: VARIANT.keepUrl });
    if (job !== keepJob) return;                       // un autre format ou un autre dépôt entre-temps
    const name = `mood-${today().replaceAll('.', '-')}-${keepFormat.replace(':', 'x')}.jpg`;
    kept = { ...out, url: URL.createObjectURL(out.blob), file: new File([out.blob], name, { type: 'image/jpeg' }) };
    keepPreview.src = kept.url; keepPreview.hidden = false;
    keepGo.textContent = t(canShare() ? 'share' : 'save');
    keepGo.disabled = false; keepMsg.textContent = '';
  } catch (err) {
    console.error('[keep]', err);
    if (job === keepJob) keepMsg.textContent = t('eKeep');
  }
}
function download() {
  const a = document.createElement('a');
  a.href = kept.url; a.download = kept.file.name;
  document.body.append(a); a.click(); a.remove();
}
$('#keepBtn').addEventListener('click', () => {
  const open = keepPanel.hidden;
  keepPanel.hidden = !open; $('#keepBtn').setAttribute('aria-expanded', String(open));
  if (open && !kept) makeKeep();
});
keepPanel.querySelectorAll('[data-format]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.format === keepFormat && kept) return;
  keepFormat = b.dataset.format;
  keepPanel.querySelectorAll('[data-format]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  makeKeep();
}));
keepGo.addEventListener('click', () => {
  if (!kept) return;
  if (canShare()) navigator.share({ files: [kept.file] }).catch(e => { if (e.name !== 'AbortError') download(); });
  else download();
});
$('#viewer').addEventListener('close', () => { keepJob++; dropKept(); freeVideos($('#viewerBody')); $('#viewerBody').replaceChildren(); });

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
  // vidéo refusée par le serveur : le message dit POURQUOI (format, taille, son, GPS, image fixe…)
  const { key, why } = serverError(err.code, err.reason, !!media);
  return t(key, { max: budget(), why: why && t(`why_${why}`) });
}

/* ------------------------------------------------------------------ dépôt */
// Un seul formulaire : une image, des mots, ou les deux. Le nombre de caractères autorisés
// dépend des pixels de l'image (js/budget.js) : sans image 500, avec une grande image 40.
// Le visiteur choisit la taille d'affichage (S / M / L). Le grain est une règle globale du site.
const form = $('#dropForm'), fileIn = $('#file'), textIn = $('#text'), msgEl = $('#dropMsg');
const canvas = $('#preview canvas');
let src = null, preparing = null, imageError = '';   // src : image lue ; imageError : image refusée, bloque l'envoi
let media = null, converting = null;                  // media : vidéo ou GIF ouvert (js/video.js) ; converting : AbortController
const budget = () => (media ? textBudget(media.width, media.height) : src ? textBudget(src.width, src.height) : textBudget());
// js/video.js (et ses bibliothèques) n'est chargé qu'au choix d'une vidéo ou d'un GIF
const videoLib = () => import('./video.js?v=a62762daa0');
/** Message d'une erreur de lecture ou de conversion vidéo (js/video.js), avec la raison quand elle est connue. */
const videoErrorText = err => { const { key, why } = videoError(err); return t(key, { why: t(`why_${why}`) }); };
const isMediaFile = f => /^video\//.test(f.type) || f.type === 'image/gif' || /\.(gif|mov|mp4|m4v|webm)$/i.test(f.name || '');
const clock = s => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const chosenSize = () => new FormData(form).get('size') || 'm';

textIn.addEventListener('input', refreshDropTexts);
function refreshDropTexts() {
  const max = budget(), n = textLength(textIn.value);
  $('#countN').textContent = `${n} / ${max}`;
  $('#count').classList.toggle('over', n > max);
  $('#fileLabel').textContent = t(src || media ? 'changeImage' : 'chooseImage');
  $('#removeImage').hidden = !src && !media && !imageError;
  if (src) $('#previewInfo').textContent = t('processed', { w: src.width, h: src.height });
  if (media) {
    const start = media.kind === 'video' ? +$('#start').value : 0;
    const len = Math.min(60, media.duration - start);
    $('#previewInfo').textContent = `${t('processed', { w: media.width, h: media.height })} · ${clock(len)}`;
    $('#startTime').textContent = clock(start);
  }
}
function dropMedia() {
  converting?.abort(); converting = null;
  media?.close(); media = null;
  $('#startRow').hidden = true; $('#convert').hidden = true;
}
/** Aperçu de l'image sous le curseur « Start » (elle deviendra l'image fixe, et la vidéo commencera là). */
let previewJob = 0;
async function showMediaPreview() {
  if (!media) return;
  const job = ++previewJob, s = Math.min(1, 480 / Math.max(media.width, media.height));
  canvas.width = Math.round(media.width * s); canvas.height = Math.round(media.height * s);
  try { await media.preview(canvas, +$('#start').value); } catch { /* image suivante */ }
  if (job === previewJob) $('#preview').hidden = false;
}
$('#start').addEventListener('input', () => { refreshDropTexts(); clearTimeout(showMediaPreview.tm); showMediaPreview.tm = setTimeout(showMediaPreview, 60); });
$('#convCancel').addEventListener('click', () => converting?.abort());

fileIn.addEventListener('change', async () => {
  const file = fileIn.files[0];
  src = null; imageError = ''; $('#preview').hidden = true; msgEl.textContent = '';
  dropMedia();
  if (!file) { preparing = null; $('#send').disabled = false; return refreshDropTexts(); }
  msgEl.textContent = t('processing');
  // vidéo ou GIF animé : ouvert ici, converti à l'envoi (un GIF d'une seule image est traité comme une photo)
  const animated = isMediaFile(file) && !(file.type === 'image/gif' && !(await videoLib().then(v => v.openMedia(file)).then(m => m.frames > 1, () => true)));
  if (animated) {
    const job = preparing = videoLib().then(v => v.openMedia(file));
    $('#send').disabled = true;
    try {
      const m = await job;
      if (job !== preparing) { m.close(); return; }
      media = m;
      const r = $('#start');
      r.max = String(Math.max(0, media.duration - 0.5)); r.value = String(media.defaultStart);
      $('#startRow').hidden = media.kind !== 'video';
      await showMediaPreview();
      msgEl.textContent = '';
    } catch (err) {
      if (job !== preparing) return;
      fileIn.value = '';
      if (err?.detail) console.warn('[video]', err.code, err.detail);
      msgEl.textContent = imageError = videoErrorText(err);
    }
    preparing = null; $('#send').disabled = false;
    return refreshDropTexts();
  }
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
  dropMedia();
  src = null; preparing = null; imageError = ''; $('#send').disabled = false; fileIn.value = ''; $('#preview').hidden = true; msgEl.textContent = '';
  refreshDropTexts();
});

function resetDrop() {
  dropMedia();
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
  if (fileIn.files.length && !src && !media) { msgEl.textContent = t('eDecode'); return; }
  const text = textIn.value.trim(), max = budget();
  if (!src && !media && !text) { msgEl.textContent = t('eEmpty'); return; }
  if (textLength(text) > max) { msgEl.textContent = t('eTooLong', { max }); return; }
  if (!$('#rights').checked) { msgEl.textContent = t('eRights'); return; }
  const tok = captcha.token($('[data-captcha]', form));
  if (!tok) { msgEl.textContent = t('eCaptcha'); return; }
  const send = $('#send');
  send.disabled = true; msgEl.textContent = t('sending');
  let image = null, video = null;
  if (src) {
    try { image = await renderImage(src); }            // image finale : réduite, métadonnées retirées
    catch (err) { msgEl.textContent = err instanceof ImageError ? t(err.code) : t('eDecode'); send.disabled = false; return; }
  }
  if (media) {                                         // conversion sur l'appareil (jusqu'à ≈ 60 s) : progression, annulable
    const ctl = converting = new AbortController();
    const bar = $('#convProgress'); bar.value = 0;
    $('#convert').hidden = false; $('#startRow').hidden = true; msgEl.textContent = '';
    $('#convert').scrollIntoView({ block: 'nearest' });
    try {
      video = await media.convert({ start: media.kind === 'video' ? +$('#start').value : 0, signal: ctl.signal, onProgress: p => { bar.value = p; } });
    } catch (err) {
      $('#convert').hidden = true; $('#startRow').hidden = media?.kind !== 'video';
      msgEl.textContent = err?.code === 'canceled' ? '' : videoErrorText(err);
      if (err?.detail) console.warn('[video]', err.code, err.detail);
      converting = null; send.disabled = false; return;
    }
    converting = null; $('#convert').hidden = true;
    msgEl.textContent = t('sending');
    image = { width: video.width, height: video.height, thumb: video.poster };   // pour la copie « en attente »
  }
  const name = $('#name').value.trim().slice(0, CONFIG.upload.maxName), size = chosenSize();
  try {
    const out = await submitPost({ text, lang, name, size, image: video ? null : image, video, captcha: tok });
    if (image && out.kind === 'text') console.error('[submit] fichier non reçu par le serveur');
    msgEl.textContent = t(mode === 'mock' ? 'thanksMock' : 'thanks');
    // mon dépôt, chez moi seulement, jusqu'à sa validation
    if (out.id && out.status === 'pending') {
      const copy = image ? await smallCopy(image.thumb) : null;
      if (!image || copy) {
        const nowIso = new Date().toISOString();
        addPending({ id: out.id, kind: video ? 'video' : image ? 'image' : 'text', text, name, size, prompt, createdAt: nowIso, approvedAt: nowIso,
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
  const im = new Image(); im.crossOrigin = 'anonymous'; im.fetchPriority = 'high'; im.decoding = 'async'; im.src = p.image.thumb;
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
  posts = page; hasMore = page.length === CONFIG.wall.batch;
  pending = settlePending(page.map(p => p.id));
  if (pr !== null && pr !== undefined) prompt = pr;
  showPrompt();
  return before !== pending.length;
}
if (cached) {
  posts = cached.posts; prompt = cached.prompt; hasMore = posts.length === CONFIG.wall.batch;
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
      $('#empty').hidden = items().length > 0 || posts.length > 0;
      if (view === 'wall') renderWall(items(), { glide: true }); else renderList(items());
    }
  } catch { /* serveur injoignable : on garde le mur de l'appareil */ }
} else {
  try { applyFresh(await fresh, await freshPrompt); preload(posts); }
  catch { posts = []; hasMore = false; }             // serveur injoignable : mur vide plutôt qu'une page cassée
  await fontsReady();
  setView(view);
}
loadRest();                                           // les paquets suivants, en arrière-plan
document.fonts?.addEventListener?.('loadingdone', () => { if (view === 'wall') render(); });

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
import { apply as applyI18n, t, lang, setLang, onLangChange, formatDate } from './i18n.js?v=cc65742d49';
import { createLayout, sizeFor, MOTIONS, REACT, motionStyle } from './wall.js?v=1e57f5bf56';
import { isVideoFile, openVideo, renderVideo, previewLoop, clipLength, VIDEO } from './video.js?v=9df6de50ca';
import { decodeImage, renderImage, drawPreview, ImageError } from './image.js?v=ae95eb3c3c';
import { fetchPosts, cachedPosts, submitPost, reportPost, mode, ServerError } from './data.js?v=373c366bb6';
import * as captcha from './captcha.js?v=73646eb155';
import { setGrain } from './grain.js?v=22d290e48d';
import { createMotion } from './motion.js?v=7e9f18c40a';
import { textBudget, textLength } from './budget.js?v=0d99de1d5b';

const $ = (s, r = document) => r.querySelector(s);
const wallEl = $('#wall'), listEl = $('#list');
let posts = [], hasMore = false, view = 'wall';
// le mur ne bouge que s'il est affiché et qu'aucune fenêtre n'est ouverte
const motion = createMotion(() => view === 'wall' && !document.querySelector('dialog[open]'));
motion.attach(wallEl);

/* ------------------------------------------------------------------ inclinaison (iPhone)
 * Petite icône du bandeau, visible seulement là où iOS demande une autorisation (iPhone, iPad) et si
 * « Réduire les animations » est désactivé. L'autorisation n'est demandée qu'au toucher de l'icône.
 * Choix mémorisé : au retour, l'effet reprend si iOS a gardé l'autorisation, sinon l'icône reste éteinte.
 */
const tiltBtn = $('#tiltBtn');
let tiltOn = false;
const canTilt = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'
  && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function setTilt(on) {
  if (on === tiltOn) return;
  tiltOn = on;
  tiltBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('tilt', on ? '1' : '0'); } catch {}
  motion.setTilt(on);
  if (view === 'wall' && posts.length) renderWall(posts, { glide: true });   // la marge réservée change
}
tiltBtn.hidden = !canTilt();
tiltBtn.addEventListener('click', async () => {
  if (tiltOn) return setTilt(false);
  try { if (await DeviceOrientationEvent.requestPermission() === 'granted') setTilt(true); } catch { /* refusé : l'icône reste éteinte */ }
});
try {
  if (canTilt() && localStorage.getItem('tilt') === '1') {
    motion.setTilt(true);                                   // essai silencieux : iOS a peut-être gardé l'autorisation
    setTimeout(() => { if (motion.tiltAlive) { tiltOn = true; tiltBtn.setAttribute('aria-pressed', 'true'); if (posts.length && view === 'wall') renderWall(posts, { glide: true }); } else motion.setTilt(false); }, 1200);
  }
} catch {}

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
const label = p => p.isAuthor ? t('byAuthor') : t({ image: 'imageBy', video: 'videoBy' }[p.kind] || 'textBy', { name: p.name || t('anon') });
const ariaOf = p => p.text ? `${label(p)} : ${p.text.slice(0, 120)}` : label(p);

function stamp(inline = false) { const s = document.createElement('span'); s.className = inline ? 'stamp stamp--inline' : 'stamp'; s.setAttribute('aria-hidden', 'true'); return s; }

function content(p, { full = false, font, byline = false, long } = {}) {
  if (p.kind === 'image' || p.kind === 'video') {
    const img = document.createElement('img');
    img.src = full ? p.image.src : p.image.thumb;
    img.width = p.image.w; img.height = p.image.h;
    img.alt = full ? label(p) : '';
    img.decoding = 'async';
    if (!full) img.loading = 'lazy';
    // noir et blanc + grain : appliqué par .photo (css/site.css) à toutes les photos déposées
    const ph = document.createElement('span'); ph.className = 'photo'; ph.append(img);
    if (p.video) {
      // vidéo : l'image fixe s'affiche d'abord ; la vidéo (version légère sur le mur, 720p à l'agrandissement)
      // ne se charge et ne joue que si elle est visible (js/main.js : videoWatch). Grain appliqué à l'affichage.
      ph.classList.add('is-video');
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.disablePictureInPicture = true;
      v.dataset.src = full ? p.video.src : p.video.loop;
      v.setAttribute('aria-hidden', 'true');
      v.addEventListener('playing', () => ph.classList.add('is-playing'));
      const vbox = document.createElement('span'); vbox.className = 'vbox'; vbox.append(v);
      ph.append(vbox);
      setGrain(vbox, p.grain, long);
      videoWatch(v, { full });
    }
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

/* ------------------------------------------------------------------ lecture des vidéos
 * Seules les vidéos visibles (à moitié au moins) jouent, au plus 2 à la fois sur iPhone et 4 sur
 * ordinateur ; le fichier n'est demandé qu'à ce moment-là. Pas de lecture automatique en mode
 * économie de données ni avec « Réduire les animations » (l'image fixe reste ; l'agrandissement
 * propose alors les commandes de lecture). Tout s'arrête quand l'onglet est caché ou qu'une fenêtre s'ouvre
 * (sauf la vidéo de l'agrandissement).
 */
const autoplayOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.connection?.saveData;
const maxPlaying = () => (matchMedia('(pointer: coarse)').matches || innerWidth < CONFIG.wall.mobileBelow ? 2 : 4);
const seen = new Set(), playing = new Set();
const vio = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting) seen.add(e.target); else { seen.delete(e.target); stopVideo(e.target); }
  }
  syncVideos();
}, { threshold: 0.5 });
function stopVideo(v) { if (!v.paused) v.pause(); playing.delete(v); }
function startVideo(v) {
  if (!v.getAttribute('src')) v.src = v.dataset.src;
  playing.add(v);
  v.play().catch(() => playing.delete(v));
}
function syncVideos() {
  const wallActive = !document.hidden && !document.querySelector('dialog[open]');
  for (const v of [...playing]) if (!v.isConnected || !seen.has(v) || !wallActive) stopVideo(v);
  if (!wallActive || !autoplayOK()) return;
  for (const v of seen) { if (playing.size >= maxPlaying()) break; if (!playing.has(v) && v.isConnected) startVideo(v); }
}
function videoWatch(v, { full }) {
  if (!full) return vio.observe(v);
  // agrandissement : la 720p joue en boucle ; sans lecture automatique, commandes de lecture
  if (autoplayOK()) { v.src = v.dataset.src; v.autoplay = true; } else { v.src = v.dataset.src; v.preload = 'none'; v.controls = true; v.removeAttribute('aria-hidden'); }
}
document.addEventListener('visibilitychange', syncVideos);

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
  li.className = `item item--${p.kind === 'video' ? 'image item--video' : p.kind}${p.isAuthor ? ' is-author' : ''}`;
  li.style.width = `${w}px`;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'item-hit';
  b.setAttribute('aria-label', ariaOf(p));
  b.append(content(p, { font, long: p.image ? Math.max(w, w * p.image.h / p.image.w) : 0 }));
  li.append(b);
  if (p.isAuthor) li.append(stamp());
  const photoH = p.image ? Math.round(w * p.image.h / p.image.w) : 0;
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
  const A = MOTIONS[motionName].A[mobile ? 'mobile' : 'desktop'];   // amplitude de la dérive
  // écartement (doigt / curseur) et inclinaison s'ajoutent : le placement réserve le tout autour de chaque élément
  const R = REACT.R[mobile ? 'mobile' : 'desktop'], T = tiltOn ? REACT.T : 0, E = R + T;
  raised = null;                                          // l'élément touché est retrouvé par son identifiant (raisedId)
  // 1. créer (ou reprendre) chaque élément à sa largeur, pour mesurer la hauteur des textes
  const ids = new Set(items.map(p => p.id));
  for (const [id, n] of nodeCache) if (!ids.has(id)) {          // retirés : s'effacent
    nodeCache.delete(id); n.li.classList.remove('is-in'); n.li.classList.add('is-out');
    setTimeout(() => n.li.remove(), reducedMotion.matches ? 0 : 450);
  }
  wallNodes = items.map((p, i) => {
    const { w, font } = sizeFor(p, W - 2 * pad - 2 * (A + E), mobile);
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
    return { id: n.p.id, kind: n.p.kind === 'text' ? 'text' : 'image', w: n.w, h, capH: n.photoH ? h - n.photoH : 0 };
  });
  // 2. placer : d'abord ce qui est à l'écran (et un écran de plus), puis le reste par morceaux
  const L = createLayout(W, boxes.length, { limit: mobile ? CONFIG.wall.overlapMobile : CONFIG.wall.overlap, pad, mobile, drift: A + E });
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
      moving.push({ el: n.li, id: n.p.id, x: r.x, y: r.y, w: r.w, h: r.h, size: n.p.size });
      reveal(n, Math.min(i * 30, 300));
    }
    for (const [a, b] of L.overlaps.splice(0)) { neighbours[a].push(b); neighbours[b].push(a); }
    wallEl.style.height = `${L.height()}px`;
    motion.set(moving, A, motionName, W, { E, R, T, radius: matchMedia('(pointer: coarse)').matches ? 110 : 140 });
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
    li.className = `row row--${p.kind === 'video' ? 'image row--video' : p.kind}`;
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
  const sync = () => {
    document.documentElement.classList.toggle('modal', !!$('dialog[open]')); motion.update(); syncVideos();
    if (!$('#viewer').open) $('#viewerBody video')?.pause();     // la vidéo de l'agrandissement s'arrête à la fermeture
  };
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
  const vb = $('#viewerBody .vbox');                         // finesse du grain selon la taille réelle de l'agrandissement
  if (vb) { const r = vb.getBoundingClientRect(); setGrain(vb, p.grain, Math.max(r.width, r.height)); }
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
function errorText(err, isVideo = false) {
  if (!(err instanceof ServerError)) return t('eServer');
  if (err.code === 'full') return t('eFull');
  if (isVideo && ['video', 'audio', 'location', 'duration', 'size', 'loop', 'thumb', 'grain'].includes(err.code)) return t('eVideo');
  if (isVideo && err.code === 'tooBig') return t('eVideoTooBig');
  const map = { captcha: 'eCaptcha', rate: 'eRate', tooBig: 'eTooBigSrv', type: 'eType', thumb: 'eType', size: 'eType',
    meta: 'eMeta', tooLong: 'eTooLong', empty: 'eEmpty', rights: 'eRights', name: 'eName', gone: 'eGone', network: 'eNetwork' };
  return t(map[err.code] || 'eServer', { max: budget() });
}

/* ------------------------------------------------------------------ dépôt */
// Un seul formulaire : une image OU une vidéo, des mots, ou les deux. Le nombre de caractères autorisés
// dépend des pixels de l'image (js/budget.js) : sans image 500, avec une grande image 40.
// Le visiteur choisit la taille d'affichage (S / M / L) et le grain (0 à 100) :
//   - image : le grain est ajouté aux pixels au moment de l'envoi (aperçu en direct) ;
//   - vidéo : le grain est appliqué à l'affichage (même texture) ; extrait de 10 s choisi avec « Start » ;
//     réencodage en temps réel au moment de l'envoi (js/video.js).
const form = $('#dropForm'), fileIn = $('#file'), textIn = $('#text'), msgEl = $('#dropMsg');
const grainIn = $('#grain'), startIn = $('#start'), canvas = $('#preview canvas'), pvVideo = $('#pvVideo');
const pvBox = document.createElement('span'); pvBox.className = 'vbox'; pvVideo.append(pvBox);   // vidéo + grain, filtrés en N&B
let src = null, preparing = null, imageError = '', stopPreview = null;   // src : image ou vidéo lue ; imageError : refusée, bloque l'envoi
const budget = () => src ? textBudget(src.width, src.height) : textBudget();
const chosenSize = () => new FormData(form).get('size') || 'm';
const isVid = () => !!src?.isVideo;

textIn.addEventListener('input', refreshDropTexts);
function refreshDropTexts() {
  const max = budget(), n = textLength(textIn.value);
  $('#countN').textContent = `${n} / ${max}`;
  $('#count').classList.toggle('over', n > max);
  $('#fileLabel').textContent = t(src ? 'changeImage' : 'chooseImage');
  $('#removeImage').hidden = !src && !imageError;
  $('#grainRow').hidden = !src;
  $('#startRow').hidden = !isVid() || src.duration <= VIDEO.maxDuration + 0.05;
  if (src) $('#previewInfo').textContent = t('processed', { w: src.width, h: src.height }) + (isVid() ? ` · ${clipLength(src, +startIn.value).toFixed(1)} s` : '');
}
const pvLong = () => { const r = pvBox.getBoundingClientRect(); return Math.max(r.width, r.height); };

// aperçu du grain en direct (une fois par image affichée, pas à chaque mouvement du doigt)
let drawing = 0;
grainIn.addEventListener('input', () => {
  $('#grainOut').textContent = grainIn.value;
  if (!src) return;
  if (isVid()) return setGrain(pvBox, +grainIn.value, pvLong());
  if (drawing) return;
  drawing = requestAnimationFrame(() => { drawing = 0; if (src && !isVid()) drawPreview(canvas, src, +grainIn.value); });
});
startIn.addEventListener('input', () => {
  $('#startOut').textContent = `${(+startIn.value).toFixed(1)} s`;
  if (isVid()) src.el.currentTime = +startIn.value;
  refreshDropTexts();
});

function dropSource() {                                // libère la vidéo précédente (mémoire de l'iPhone)
  stopPreview?.(); stopPreview = null;
  if (src?.isVideo) { src.el.pause(); src.el.removeAttribute('src'); src.el.load(); URL.revokeObjectURL(src.url); }
  pvBox.replaceChildren(); src = null;
}

fileIn.addEventListener('change', async () => {
  const file = fileIn.files[0];
  dropSource(); imageError = ''; $('#preview').hidden = true; msgEl.textContent = '';
  if (!file) { preparing = null; $('#send').disabled = false; return refreshDropTexts(); }
  msgEl.textContent = t('processing');
  const job = preparing = isVideoFile(file) ? openVideo(file).then(v => ({ ...v, isVideo: true })) : decodeImage(file);
  $('#send').disabled = true;                          // pas d'envoi tant que le fichier n'est pas lu
  try {
    const d = await job;
    if (job !== preparing) { if (d.isVideo) URL.revokeObjectURL(d.url); return; }   // un autre fichier a été choisi entre-temps
    src = d;
    $('#pvImage').hidden = isVid(); pvVideo.hidden = !isVid();
    $('#preview').hidden = false;
    if (isVid()) {
      startIn.max = String(Math.max(0, src.duration - VIDEO.maxDuration).toFixed(1)); startIn.value = '0'; $('#startOut').textContent = '0.0 s';
      pvBox.append(src.el);
      stopPreview = previewLoop(src, () => +startIn.value);
      setGrain(pvBox, +grainIn.value, pvLong());
    } else drawPreview(canvas, src, +grainIn.value);
    msgEl.textContent = '';
  } catch (err) {
    if (job !== preparing) return;
    fileIn.value = '';                                 // fichier refusé : retiré, avec un message clair
    msgEl.textContent = imageError = err instanceof ImageError ? t(err.code) : t('eDecode');
  }
  preparing = null; $('#send').disabled = false;
  refreshDropTexts();
});
$('#removeImage').addEventListener('click', () => {
  dropSource(); preparing = null; imageError = ''; $('#send').disabled = false; fileIn.value = ''; $('#preview').hidden = true; msgEl.textContent = '';
  refreshDropTexts();
});

function resetDrop() {
  dropSource();
  form.reset(); preparing = null; imageError = '';
  $('#grainOut').textContent = grainIn.value;
  $('#preview').hidden = true; msgEl.textContent = '';
  $('#send').disabled = false;
  refreshDropTexts();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (preparing || $('#send').disabled) return;        // fichier en préparation ou envoi en cours : pas de double dépôt
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
  let image = null, video = null;
  try {
    if (isVid()) {                                     // réencodage en temps réel (≈ durée de l'extrait)
      stopPreview?.(); stopPreview = null;
      video = await renderVideo(src, { start: +startIn.value, onProgress: f => { msgEl.textContent = `… ${Math.round(f * 100)} %`; } });
      msgEl.textContent = t('sending');
    } else if (src) image = await renderImage(src, { grain: +grainIn.value });     // image finale : grain + métadonnées retirées
  } catch (err) {
    msgEl.textContent = err instanceof ImageError ? t(err.code) : t(isVid() ? 'eVideoDecode' : 'eDecode'); send.disabled = false;
    if (isVid()) stopPreview = previewLoop(src, () => +startIn.value);
    return;
  }
  try {
    const out = await submitPost({ text, lang, name: $('#name').value.trim().slice(0, CONFIG.upload.maxName), size: chosenSize(),
      image, video, grain: video ? +grainIn.value : 0, captcha: tok });
    if ((image || video) && out.kind === 'text') console.error('[submit] fichier non reçu par le serveur');
    msgEl.textContent = t(mode === 'mock' ? 'thanksMock' : 'thanks');
  } catch (err) {
    msgEl.textContent = errorText(err, !!video); send.disabled = false;
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

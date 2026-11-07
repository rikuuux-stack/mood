/**
 * Mood — mur modéré d'images et de mots. Point d'entrée.
 *   - charge les dépôts validés et la consigne du mois (js/data.js : Supabase, ou maquette avec ?mock) ;
 *   - deux vues : MUR (fixe, un seul écran, js/stack.js) et LISTE (archive complète, toujours lisible) ;
 *   - le mur est IMMOBILE : c'est le temps qui le transforme — érosion et bords rongés (js/wall.js, js/edge.js),
 *     enfouissement par les dépôts plus récents, sortie du mur après 180 jours au plus tard ;
 *   - le plus récent est au-dessus ; plus d'agrandissement : sur le mur, toucher une vidéo la lit sur place
 *     (une fois) ; dans la liste, toucher un dépôt ouvre la feuille Keep (le dépôt seul) et Report ;
 *   - égalité : aucun dépôt n'est distingué des autres ;
 *   - le dépôt d'un visiteur s'affiche chez lui seul, « Under review », jusqu'à sa validation ;
 *   - un dépôt = une image, des mots, ou les deux ; plus l'image a de pixels, moins de mots (js/budget.js).
 *
 * Les textes des visiteurs (et la consigne) ne sont JAMAIS insérés en HTML : uniquement via textContent.
 */
import { CONFIG } from './config.js?v=b90e1cccbc';
import { apply as applyI18n, t, lang, setLang, onLangChange, formatDate } from './i18n.js?v=201219e6cb';
import { sizeFor, visibility, stageOf, ageDays, onWall, TIME, BASE, ERODE, alphaOf } from './wall.js?v=e2142ccd51';
import { decodeImage, renderImage, drawPreview, ImageError } from './image.js?v=6870828c6e';
import { fetchPosts, cachedPosts, fetchPrompt, pendingPosts, addPending, settlePending, submitPost, reportPost, mode, ServerError } from './data.js?v=08b14cca51';
import * as captcha from './captcha.js?v=83c39d113e';
import { textBudget, textLength } from './budget.js?v=0d99de1d5b';
import { serverError, videoError } from './errors.js?v=51450bce30';

import * as EDGE from './edge.js?v=2ead68abf7';       // bords rongés selon l'âge (contour tiré de l'identifiant du dépôt)
import * as STACK from './stack.js?v=083ef4cbab';     // mur fixe : un seul écran, les N dépôts les plus récents empilés

/* ?future=N : le mur tel qu'il sera dans N jours (usure, bords, placement, mois). AFFICHAGE SEULEMENT : aucune écriture,
 * aucune expiration ; les dépôts qui dépasseraient 180 jours restent sur le mur, à leur dernier palier, pour l'essai.
 * Sans le paramètre : FUTURE = null, l'heure réelle, rien d'autre ne change. (?demo=1 : voir js/data.js.) */
const PARAMS = new URLSearchParams(location.search);
const FUTURE = PARAMS.has('future') ? Math.max(0, Math.min(3650, Math.round(+PARAMS.get('future') || 0))) : null;
const wallNow = () => Date.now() + (FUTURE || 0) * 86400e3;

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
  stopVideo();
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
const wallItems = () => [...pending.map(asPending), ...posts.filter(p => !p.expired && (FUTURE !== null || onWall(ageDays(p.approvedAt))))];
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
// une vidéo (ou un GIF converti) se comporte comme une photo partout ; sur le mur, un toucher la lit sur place
const visual = p => p.kind === 'image' || p.kind === 'video';
// Le nom de la personne qui dépose n'apparaît QUE dans la vue List (décision de l'auteur) : ni sur le mur
// (pas même pour les lecteurs d'écran), ni dans Keep.
const label = (p, named) => named
  ? t(p.kind === 'video' ? 'videoBy' : p.kind === 'image' ? 'imageBy' : 'textBy', { name: p.name || t('anon') })
  : t(p.kind === 'video' ? 'videoItem' : p.kind === 'image' ? 'imageItem' : 'textItem');
const ariaOf = (p, named = false) => (p.pending ? `${t('pending')} — ` : '') + (p.text ? `${label(p, named)} : ${p.text.slice(0, 120)}` : label(p, named));
const metaOf = (p, named = false) => (p.pending ? t('pending') : named ? `${p.name || t('anon')} · ${formatDate(p.createdAt)}` : formatDate(p.createdAt));

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
function photo(p) {
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';                       // pixels lisibles par un canvas (Keep, js/fragment.js) ; avant src
  img.width = p.image.w; img.height = p.image.h;
  img.alt = '';                                        // le libellé est sur le dépôt (aria-label)
  img.decoding = 'async';
  // noir et blanc + grain : appliqué par .photo (css/site.css) à toutes les photos déposées
  img.draggable = false;                               // ni glisser-déposer, ni « Enregistrer l'image » (voir plus bas)
  // fichier déjà en négatif (.is-neg) : seuls la transparence et l'usure sont appliquées (#toneN, #erode1N …)
  const ph = document.createElement('span'); ph.className = p.image.neg ? 'photo is-neg' : 'photo'; ph.append(img);
  const done = () => ph.classList.add('is-loaded');
  img.addEventListener('load', done);                  // à chaque (re)chargement : l'image peut être libérée puis revenir
  img.addEventListener('error', done);
  img.style.aspectRatio = `${p.image.w} / ${p.image.h}`;   // cadre à la bonne forme, même image libérée (liste)
  img.dataset.src = p.image.thumb;                     // miniature : à l'approche de l'écran (watch)
  if (img.complete && img.naturalWidth) done();
  return ph;
}

/* Photos et vidéos : ni clic droit (« Enregistrer l'image sous… »), ni glisser-déposer vers le bureau, partout
 * (mur, liste, aperçu de Drop). L'appui long de l'iPhone est coupé en CSS (-webkit-touch-callout).
 * Une capture d'écran reste possible (voulu) ; Keep garde son image à partager. Le fichier stocké, lui, n'est plus
 * l'original (négatif fait sur le téléphone) : c'est ce qui protège vraiment, ceci n'est qu'un frein. */
const guarded = e => e.target instanceof Element && e.target.closest('.photo, .vcanvas, .preview');
document.addEventListener('contextmenu', e => { if (guarded(e)) e.preventDefault(); });
document.addEventListener('dragstart', e => { if (guarded(e)) e.preventDefault(); });

/*
 * Vidéo sur le mur : un toucher la lit SUR PLACE, muette, UNE seule fois, puis elle revient à son image fixe.
 * Jamais de lecture automatique (pas même sans « Réduire les animations ») : seulement au geste du visiteur.
 * Le fichier n'est téléchargé qu'à ce moment-là ; une seule vidéo joue à la fois ; elle est libérée à la fin.
 * Noir transparent et usure du palier comme les photos : un MP4 ne porte pas de transparence, donc chaque image
 * est redessinée dans un canvas (≤ 480 px) où les sombres deviennent transparents (ALPHAS, mêmes valeurs que
 * #tone / #erode1 … #erode4). La <video> reste dessous, invisible (elle décode et donne les images). Les bords
 * rongés suivent : le clip-path est posé sur .photo.
 */
// une table d'opacité par palier (0 = neuf : BASE ; 1 … 4 : ERODE), mêmes valeurs que les filtres #tone / #erode1 … #erode4
const ALPHAS = [BASE, ...ERODE].map(e => new Uint8ClampedArray(256).map((_, v) => Math.round(alphaOf(v / 255, e) * 255)));
/** Âge affiché d'un dépôt, partout (mur, liste, Keep) : rien ne rajeunit. */
const ageOf = (p, now = wallNow()) => { const v = p.pending ? 1 : visibility(ageDays(p.approvedAt, now)); return { v, stage: stageOf(v) }; };
function setAge(el, p, now) {
  const { v, stage } = ageOf(p, now);
  el.style.setProperty('--v', v.toFixed(3));
  for (let s = 1; s <= ERODE.length; s++) el.classList.toggle(`age-${s}`, s === stage);
  EDGE.wear(el, p, stage);                              // bords rongés selon le même palier
  return stage;
}
function paintFrames(v, c, ALPHA) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const draw = () => {
    if (!v.videoWidth || !c.isConnected) return;
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    g.drawImage(v, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let o = 0; o < d.length; o += 4) d[o + 3] = ALPHA[d[o + 1]];      // image déjà en gris : R = V = B
    g.putImageData(im, 0, 0);
  };
  const loop = () => { draw(); if (!v.paused && c.isConnected) next(); };
  const next = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(loop) : requestAnimationFrame(loop));
  v.addEventListener('play', next);
  v.addEventListener('loadeddata', draw);
  v.addEventListener('seeked', draw);
}
let playing = null;                                   // .photo de la vidéo en cours de lecture
function playInPlace(li, p) {
  const ph = li.querySelector('.photo');
  if (!ph || !p.image?.video || ph.querySelector('video')) return;   // déjà en lecture : rien
  stopVideo();
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true; v.loop = false; v.playsInline = true; v.preload = 'auto';
  v.disablePictureInPicture = true; v.setAttribute('controlslist', 'nodownload noplaybackrate');
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  const c = document.createElement('canvas'); c.className = 'vcanvas'; c.width = p.image.w; c.height = p.image.h;
  c.setAttribute('aria-hidden', 'true');
  ph.classList.add('is-video'); ph.append(v, c);
  paintFrames(v, c, ALPHAS[ageOf(p).stage]);           // noir transparent ET usure du palier, image par image
  v.addEventListener('playing', () => ph.classList.add('is-playing'), { once: true });   // l'image fixe s'efface alors
  v.addEventListener('ended', stopVideo, { once: true });                                 // une seule fois
  v.addEventListener('error', stopVideo, { once: true });
  playing = ph;
  v.src = p.image.video;
  v.play().catch(stopVideo);                           // muette, au geste du visiteur
}
/** Arrête la vidéo en cours : elle est libérée et l'image fixe revient. */
function stopVideo() {
  if (!playing) return;
  const ph = playing; playing = null;
  freeVideos(ph);
  ph.querySelectorAll('video, canvas.vcanvas').forEach(e => e.remove());
  ph.classList.remove('is-video', 'is-playing');
}
/** Arrête et libère les vidéos sous `root` (l'image décodée et le fichier ne restent pas en mémoire). */
function freeVideos(root) {
  root.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
  root.querySelectorAll('canvas.vcanvas').forEach(c => { c.width = c.height = 0; });   // libère l'image du canvas
}

function content(p, { font } = {}) {
  if (visual(p)) {
    const media = photo(p);
    const fig = document.createElement('span'); fig.className = 'fig'; fig.append(media);
    if (p.kind === 'video') {                          // sur le mur et dans la liste : l'image fixe + un petit ▶
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
  return s;
}

/* ------------------------------------------------------------------ rendu */
let lastW = 0;
function render() {
  document.documentElement.classList.toggle('stack', view === 'wall');   // mur fixe : la page ne défile pas (la liste, si)
  const list = items();
  $('#empty').hidden = list.length > 0 || posts.length > 0;
  if (view === 'wall') renderWall(list); else renderList(list);
}

/*
 * Mur FIXE : un seul écran, sans défilement. Seuls les N dépôts les plus récents y sont (16 sur iPhone, 40 sur
 * ordinateur, js/stack.js), empilés, le plus récent au-dessus, les textes toujours au-dessus des images ; les plus
 * anciens sont enfouis : ils ne vivent plus que dans la liste. Placement déterministe (identifiant + mois à Tokyo),
 * identique sur tous les écrans de même taille. Les mois : des bandes horizontales, leur mot en petit au bord gauche.
 * Les éléments déjà créés sont RÉUTILISÉS d'un rendu à l'autre (images déjà chargées, pas de clignotement).
 */
const nodeCache = new Map();          // identifiant → { li, key, p, w, photoH }
let wallNodes = [], renderToken = 0;

function nodeFor(p, w, font) {
  const key = `${w}|${font || 0}|${p.text}|${p.size}|${p.pending ? 1 : 0}`;
  const old = nodeCache.get(p.id);
  if (old && old.key === key) { old.p = p; return old; }
  const li = document.createElement('li');
  li.className = `item item--${p.kind === 'video' ? 'image item--video' : p.kind}${p.pending ? ' is-pending' : ''}`;
  li.style.width = `${w}px`;
  // sur le mur, seule une vidéo réagit au toucher (lecture sur place) ; une photo ou un texte ne fait rien
  const playable = p.kind === 'video' && !p.pending && !!p.image?.video;
  const b = document.createElement(playable ? 'button' : 'div');
  b.className = 'item-hit';
  if (playable) { b.type = 'button'; b.setAttribute('aria-label', `${t('playVideo')} — ${ariaOf(p)}`); }
  else { b.setAttribute('role', 'group'); b.setAttribute('aria-label', ariaOf(p)); }
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

function renderWall(all) {
  ++renderToken;
  const W = wallEl.clientWidth || document.documentElement.clientWidth;
  lastW = W;
  const mobile = W < CONFIG.wall.mobileBelow, pad = mobile ? 16 : 24;
  const list = all.slice(0, mobile ? STACK.STACK_N.mobile : STACK.STACK_N.desktop);
  const ids = new Set(list.map(p => p.id));
  for (const [id, n] of nodeCache) if (!ids.has(id)) { nodeCache.delete(id); n.li.remove(); }
  if (playing && !playing.isConnected) stopVideo();
  wallEl.querySelectorAll('.stack-month').forEach(d => d.remove());
  const now = wallNow();
  wallNodes = list.map((p, i) => {
    const { w, font } = sizeFor(p, W - 2 * pad, mobile);
    const n = nodeFor(p, w, font);
    n.li.dataset.i = i;
    n.stage = setAge(n.li, p, now);
    if (!n.li.isConnected) wallEl.append(n.li);
    return n;
  });
  // le mur occupe l'écran sous la consigne ; aucune page à faire défiler
  const top = 0, H = Math.max(200, document.documentElement.clientHeight - wallEl.getBoundingClientRect().top);
  wallEl.style.height = `${H}px`;
  const { places, bands } = STACK.stackLayout(wallNodes.map(n => ({ p: n.p, w: n.w, h: n.li.offsetHeight })), W, H, { top, pad, now });
  wallNodes.forEach((n, i) => {
    const r = places[i];
    Object.assign(n.li.style, { left: `${r.x}px`, top: `${r.y}px`, zIndex: String(r.z) });
    n.li.dataset.month = r.month;                       // mois du dépôt à Tokyo (sa bande)
    watch(n.li);
  });
  if (bands.length > 1) for (const b of bands) {          // un seul mois : rien à dire
    const li = document.createElement('li'); li.className = 'stack-month'; li.setAttribute('aria-hidden', 'true');
    li.textContent = b.label; li.style.top = `${b.y}px`; li.style.left = `${pad}px`;
    wallEl.append(li);
  }
}

/*
 * Dépôt EXPIRÉ (à 180 jours, quand l'auteur l'active) : ses fichiers sont supprimés, il ne reste qu'une ligne de
 * texte, façon On Kawara : la date du dépôt, le type, sa durée de vie sur le mur, la consigne du mois.
 * « OCT.9,2026  image  180 days  trace ». Rien à ouvrir.
 */
const kawara = iso => {
  const d = new Date(Date.parse(iso) + 9 * 3600e3);                  // jour du dépôt à Tokyo (fuseau du mur)
  return `${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()]}.${d.getUTCDate()},${d.getUTCFullYear()}`;
};
function kawaraLine(p) {
  const line = document.createElement('p'); line.className = 'kawara';
  for (const [cls, txt] of [['k-date', kawara(p.createdAt)], ['k-kind', p.kind], ['k-life', `${TIME.wallDays} days`], ['k-prompt', p.prompt || '']]) {
    const s = document.createElement('span'); s.className = cls; s.textContent = txt; line.append(s);
  }
  if (!p.text) return line;
  // l'image s'en est allée, les mots déposés avec elle restent, lisibles, sous la ligne (textContent seulement)
  const box = document.createElement('div'); box.className = 'kawara-entry';
  const words = document.createElement('p'); words.className = 'kawara-words'; words.textContent = p.text;
  box.append(line, words);
  return box;
}
function renderList(list) {
  const now = wallNow();
  let open = 0, register = null;                      // index parmi les dépôts qui s'ouvrent ; bloc de lignes expirées en cours
  listEl.replaceChildren(...list.map(p => {
    // dépôts expirés qui se suivent : un seul bloc, une ligne chacun (registre serré)
    if (p.expired) {
      if (register) { register.append(kawaraLine(p)); return null; }
      register = document.createElement('li'); register.className = 'row row--expired';
      register.append(kawaraLine(p));
      return register;
    }
    register = null;
    const i = open++;
    const li = document.createElement('li');
    li.className = `row row--${p.kind === 'video' ? 'image row--video' : p.kind}${p.pending ? ' is-pending' : ''}`;
    const b = document.createElement(p.pending ? 'div' : 'button');   // un dépôt en attente : rien à garder ni signaler
    b.className = 'item-hit';
    if (!p.pending) b.type = 'button';
    b.setAttribute('aria-label', ariaOf(p, true));
    b.append(content(p));
    const meta = document.createElement('p');
    meta.className = 'row-meta';
    meta.textContent = metaOf(p, true);
    li.append(b, meta);
    li.dataset.i = i;
    setAge(li, p, now);                                 // la liste montre l'usure atteinte, jamais l'image neuve
    return li;
  }).filter(Boolean));
  watch(listEl);
}

/* ------------------------------------------------------------------ interaction
 * Il n'y a plus d'agrandissement. Sur le mur : toucher une vidéo la lit sur place ; une photo ou un texte, rien.
 * Dans la liste : toucher un dépôt ouvre la feuille Keep (le dépôt seul, avec son usure du jour), où l'on peut
 * aussi le signaler. Survol / focus sur ordinateur : css (l'élément passe au-dessus, monte de 6 px).
 */
wallEl.addEventListener('click', e => {
  const li = e.target.closest('.item--video');
  if (!li) return;
  for (const n of nodeCache.values()) if (n.li === li) { if (!n.p.pending) playInPlace(li, n.p); return; }
});
listEl.addEventListener('click', e => {
  const li = e.target.closest('.row');
  if (!li || !li.dataset.i || li.classList.contains('is-pending')) return;   // expiré : une ligne ; en attente : rien
  const p = items().filter(q => !q.expired)[+li.dataset.i];
  if (p) openKeep(li, p);
});

addEventListener('resize', () => {
  if (view !== 'wall') return;
  clearTimeout(render.tm);
  render.tm = setTimeout(render, 150);                 // mur fixe : sa place dépend de la largeur ET de la hauteur de l'écran
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

/* ------------------------------------------------------------------ Keep : le dépôt seul
 * Depuis la liste : toucher un dépôt ouvre la feuille Keep et fabrique aussitôt l'image sur l'appareil
 * (js/fragment.js, chargé seulement à ce moment-là) au format 4:5 (ou 9:16) : le dépôt seul, au centre, avec son
 * usure du jour. Un second toucher la partage (menu natif : Enregistrer l'image, Instagram, LINE…) ou, sur
 * ordinateur, la télécharge. Deux temps : le menu de partage exige un geste récent du visiteur, que la fabrication
 * pourrait dépasser. Le signalement (Report) est dans la même feuille.
 */
const keepSheet = $('#keepSheet'), keepPanel = $('#keepPanel'), keepGo = $('#keepGo'), keepMsg = $('#keepMsg'), keepPreview = $('#keepPreview');
const coarse = matchMedia('(pointer: coarse)');
let keepFormat = '4:5', kept = null, keepJob = 0, keepPost = null, keepRow = null;
const current = () => keepPost;
function openKeep(li, p) {
  stopVideo();
  keepPost = p; keepRow = li;
  const r = $('#report'); r.open = false;
  captcha.reset($('[data-captcha]', $('#reportForm')));
  $('#reportForm').reset(); $('#reportForm .form-msg').textContent = '';
  $('#reportForm button[type=submit]').disabled = false;
  keepJob++; dropKept();
  keepPreview.hidden = true; keepPreview.removeAttribute('src'); keepMsg.textContent = '';
  if (!keepSheet.open) keepSheet.showModal();
  makeKeep();
}
function dropKept() { if (kept?.url) URL.revokeObjectURL(kept.url); kept = null; }
const canShare = () => coarse.matches && !!kept && !!navigator.canShare?.({ files: [kept.file] });
async function makeKeep() {
  const job = ++keepJob, p = current(), li = keepRow;
  if (!p || !li) return;
  dropKept(); keepGo.disabled = true; keepPreview.hidden = true;
  keepMsg.textContent = t('making');
  try {
    const { makeFragment, today } = await import('./fragment.js?v=46de538ba0');
    const out = await makeFragment({ li, format: keepFormat, prompt: p.prompt || '' });
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
keepSheet.addEventListener('close', () => { keepJob++; dropKept(); keepPreview.removeAttribute('src'); });

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
let src = null, rendered = null, preparing = null, imageError = '';   // src : image lue ; imageError : image refusée, bloque l'envoi
let media = null, converting = null;                  // media : vidéo ou GIF ouvert (js/video.js) ; converting : AbortController
const budget = () => (media ? textBudget(media.width, media.height) : src ? textBudget(src.width, src.height) : textBudget());
// js/video.js (et ses bibliothèques) n'est chargé qu'au choix d'une vidéo ou d'un GIF
const videoLib = () => import('./video.js?v=a1506d5008');
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
  src = null; rendered = null; imageError = ''; $('#preview').hidden = true; msgEl.textContent = '';
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
    // l'image finale (réduite, sans métadonnées) est préparée tout de suite, pendant que le visiteur écrit :
    // « Send » n'attend plus ce calcul (plusieurs secondes pour une grande photo d'iPhone)
    rendered = renderImage(d); rendered.catch(() => {});
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
  src = null; rendered = null; preparing = null; imageError = ''; $('#send').disabled = false; fileIn.value = ''; $('#preview').hidden = true; msgEl.textContent = '';
  refreshDropTexts();
});

function resetDrop() {
  dropMedia();
  form.reset(); src = null; rendered = null; preparing = null; imageError = '';
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
    try { image = await (rendered || (rendered = renderImage(src))); }   // image finale (préparée au choix de l'image)
    catch (err) { rendered = null; msgEl.textContent = err instanceof ImageError ? t(err.code) : t('eDecode'); send.disabled = false; return; }
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
          image: image ? { src: copy, thumb: copy, w: image.width, h: image.height, neg: true } : null });
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
      if (view === 'wall') renderWall(items()); else renderList(items());
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

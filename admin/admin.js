/**
 * Mood — page de modération (administrateur seulement).
 *
 * Connexion : e-mail + mot de passe du compte créé dans Supabase (les inscriptions sont fermées).
 * Toutes les actions passent par la fonction serveur « moderate », qui revérifie que le compte
 * connecté est bien administrateur. Les textes des dépôts sont insérés via textContent uniquement.
 */
import { CONFIG } from '../js/config.js?v=1f46695844';
import { isVideoFile, openVideo, renderVideo, previewLoop, clipLength, VIDEO } from '../js/video.js?v=9df6de50ca';
import { setGrain } from '../js/grain.js?v=22d290e48d';
import { decodeImage, renderImage, drawPreview, ImageError } from '../js/image.js?v=ae95eb3c3c';
import { textBudget, textLength } from '../js/budget.js?v=0d99de1d5b';

const $ = s => document.querySelector(s);
const API = CONFIG.supabaseUrl, KEY = CONFIG.supabaseAnonKey;
const STORE = 'mood-admin-session';
let session = null, data = { pending: [], hidden: [], published: [] }, tab = 'pending';

/* ------------------------------------------------------------------ session */
function save(s) {
  session = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in - 60) * 1000 } : null;
  try { s ? localStorage.setItem(STORE, JSON.stringify(session)) : localStorage.removeItem(STORE); } catch {}
}
async function auth(grant, body) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('auth');
  save(await r.json());
}
async function token() {
  if (session && Date.now() > session.expires_at) {
    try { await auth('refresh_token', { refresh_token: session.refresh_token }); } catch { save(null); }
  }
  if (!session) throw new Error('auth');
  return session.access_token;
}
async function moderate(method, body) {
  const r = await fetch(`${API}/functions/v1/moderate`, {
    method, headers: { apikey: KEY, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  // 401 « auth » : session expirée ou invalide → retour à l'écran de connexion.
  // 403 « admin » (compte non administrateur) ou 500 : on reste connecté et on affiche le message.
  if (r.status === 401 && out.error === 'auth') { save(null); show(); $('#loginMsg').textContent = 'Log in again'; throw new Error('auth'); }
  if (!r.ok) throw new Error(out.error || 'server');
  return out;
}

/* ------------------------------------------------------------------ écrans */
function show() {
  $('#login').hidden = !!session;
  $('#dash').hidden = !session;
  $('#logout').hidden = !session;
  if (session) refresh();
}
$('#login').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginMsg').textContent = '…';
  try {
    await auth('password', { email: $('#email').value.trim(), password: $('#password').value });
    $('#password').value = ''; $('#loginMsg').textContent = '';
    show();
  } catch {
    $('#loginMsg').textContent = 'Wrong login';
  }
});
$('#logout').addEventListener('click', () => { save(null); show(); });

async function refresh() {
  $('#dashMsg').textContent = '…';
  try {
    data = await moderate('GET');
    $('#dashMsg').textContent = '';
  } catch (e) {
    if (e.message === 'auth') return;                       // déjà renvoyé à l'écran de connexion
    $('#dashMsg').textContent = e.message === 'admin' ? 'Not admin' : 'Server error — retry';
  }
  for (const k of ['pending', 'hidden', 'published']) $(`[data-n="${k}"]`).textContent = `(${data[k].length})`;
  // jauge de stockage : au-delà de 800 Mo, le serveur refuse les nouvelles vidéos (offre gratuite : 1 Go)
  const st = data.storage;
  if (st) $('#storage').textContent = `Storage ${Math.round(st.used / 1048576)} / ${Math.round(st.cap / 1048576)} MB`;
  render();
}

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  render();
}));

const fmt = iso => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const ACTIONS = {
  pending: [['approve', 'Approve', false], ['reject', 'Reject', true]],
  hidden: [['restore', 'Restore', false], ['remove', 'Delete', true]],
  published: [['remove', 'Remove', true]],
};
const SIZES = ['s', 'm', 'l'];

/** Taille d'affichage S / M / L d'un dépôt : un toucher la change (en attente comme publié). */
function sizePicker(r) {
  const box = document.createElement('div'); box.className = 'adm-sizes'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Size');
  const paint = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === (r.size || 'm'))));
  for (const k of SIZES) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.size = k; b.textContent = k.toUpperCase();
    b.addEventListener('click', async () => {
      if ((r.size || 'm') === k) return;
      box.querySelectorAll('button').forEach(x => { x.disabled = true; });
      try { await moderate('POST', { action: 'resize', id: r.id, size: k }); r.size = k; $('#dashMsg').textContent = 'Done'; }
      catch (e) { if (e.message !== 'auth') $('#dashMsg').textContent = 'Failed — retry'; }
      box.querySelectorAll('button').forEach(x => { x.disabled = false; });
      paint();
    });
    box.append(b);
  }
  paint();
  return box;
}

function render() {
  $('#mine').hidden = tab !== 'mine';
  const list = $('#cards');
  list.hidden = tab === 'mine';
  if (tab === 'mine') return;
  const rows = data[tab] || [];
  if (!rows.length) {
    const p = document.createElement('li'); p.className = 'adm-empty';
    p.textContent = 'Empty';
    list.replaceChildren(p);
    return;
  }
  list.replaceChildren(...rows.map(r => {
    const li = document.createElement('li'); li.className = 'adm-card';
    if (r.kind === 'video' && r.image_url) {
      // vidéo : lue ici en couleur, avec ses commandes, et avec le grain tel qu'il s'affichera sur le mur
      const box = document.createElement('span'); box.className = 'adm-video';
      const vb = document.createElement('span'); vb.className = 'vbox';
      const v = document.createElement('video');
      v.src = r.image_url; v.poster = r.thumb_url || ''; v.controls = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
      vb.append(v); box.append(vb); li.append(box);
      requestAnimationFrame(() => setGrain(vb, r.grain, Math.max(vb.offsetWidth, vb.offsetHeight)));
    } else if (r.image_url) { const img = document.createElement('img'); img.src = r.image_url; img.alt = ''; img.loading = 'lazy'; li.append(img); }
    if (r.text) { const t = document.createElement('p'); t.className = 'adm-text'; t.textContent = r.text; li.append(t); }
    const meta = document.createElement('p'); meta.className = 'adm-meta';
    meta.textContent = [r.is_riku ? 'me' : (r.name || 'anon'), fmt(r.created_at),
      r.width ? `${r.width}×${r.height}` : null, r.kind === 'video' ? `video ${Number(r.duration).toFixed(1)} s` : null,
      r.kind === 'video' && r.grain ? `grain ${r.grain}` : null, r.report_count ? `${r.report_count} reports` : null].filter(Boolean).join(' · ');
    li.append(meta, sizePicker(r));
    const bar = document.createElement('div'); bar.className = 'adm-actions';
    for (const [action, label, risky] of ACTIONS[tab]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label;
      b.addEventListener('click', async () => {
        // action irréversible : un second toucher pour confirmer
        if (risky && !b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Sure?'; return; }
        bar.querySelectorAll('button').forEach(x => { x.disabled = true; });
        try { await moderate('POST', { action, id: r.id }); $('#dashMsg').textContent = 'Done'; await refresh(); }
        catch { $('#dashMsg').textContent = 'Failed — retry'; bar.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
      });
      bar.append(b);
    }
    li.append(bar);
    return li;
  }));
}

/* ------------------------------------------------------------------ dépôt de l'auteur du site (publié directement, avec la marque) */
// Même formulaire que le site : image ou vidéo, taille S / M / L, grain (incrusté pour une image,
// appliqué à l'affichage pour une vidéo), extrait de 10 s choisi avec « Start ».
let src = null, preparing = null, imageError = '', sending = false, stopPreview = null;
const isVid = () => !!src?.isVideo;
const budget = () => src ? textBudget(src.width, src.height) : textBudget();
const IMAGE_ERRORS = {
  eType: 'Image refused: format', eTooBig: 'Image refused: too heavy', eMeta: 'Image refused: metadata', eDecode: 'Image refused: unreadable',
  eVideoUnsupported: 'Video not possible in this browser', eVideoDecode: 'Video refused: unreadable', eVideoTooBig: 'Video refused: too heavy',
};
const SERVER_ERRORS = {
  type: 'Image refused by the server: format', size: 'Refused by the server: too large', thumb: 'Thumbnail refused',
  meta: 'Image refused by the server: metadata', tooBig: 'Refused by the server: too heavy', tooLong: 'Too long for this image',
  empty: 'Add an image, a video or words', storage: 'Storage error', display: 'Unknown size',
  video: 'Video refused by the server: format', audio: 'Video refused: sound track', location: 'Video refused: location data',
  duration: 'Video refused: over 10 s', loop: 'Wall video refused', full: 'Storage full (800 MB)', grain: 'Grain refused',
};
const imageErrorText = e => IMAGE_ERRORS[e instanceof ImageError ? e.code : 'eDecode'] || IMAGE_ERRORS.eDecode;
const submitBtn = $('#mine button[type=submit]'), mineGrain = $('#mineGrain'), mineStart = $('#mineStart');
const mineCanvas = $('#minePreview canvas'), mineVideo = $('#mineVideo');
const mineBox = document.createElement('span'); mineBox.className = 'vbox'; mineVideo.append(mineBox);
function refreshMine() {
  const n = textLength($('#mineText').value), max = budget();
  $('#mineCount').textContent = `${n} / ${max}`;
  $('#mineFileLabel').textContent = src ? 'Change' : 'Image / video';
  $('#mineRemove').hidden = !src && !imageError;
  $('#mineGrainRow').hidden = !src;
  $('#mineStartRow').hidden = !isVid() || src.duration <= VIDEO.maxDuration + 0.05;
  if (src) $('#mineInfo').textContent = `${src.width} × ${src.height}` + (isVid() ? ` · ${clipLength(src, +mineStart.value).toFixed(1)} s` : '');
  submitBtn.disabled = sending || !!preparing;
  if (!sending) submitBtn.textContent = preparing ? '…' : 'Drop';
}
$('#mineText').addEventListener('input', refreshMine);
let drawing = 0;
mineGrain.addEventListener('input', () => {
  $('#mineGrainOut').textContent = mineGrain.value;
  if (!src) return;
  if (isVid()) return setGrain(mineBox, +mineGrain.value, mineBox.offsetWidth);
  if (drawing) return;
  drawing = requestAnimationFrame(() => { drawing = 0; if (src && !isVid()) drawPreview(mineCanvas, src, +mineGrain.value); });
});
mineStart.addEventListener('input', () => {
  $('#mineStartOut').textContent = `${(+mineStart.value).toFixed(1)} s`;
  if (isVid()) src.el.currentTime = +mineStart.value;
  refreshMine();
});
function dropSource() {
  stopPreview?.(); stopPreview = null;
  if (src?.isVideo) { src.el.pause(); src.el.removeAttribute('src'); src.el.load(); URL.revokeObjectURL(src.url); }
  mineBox.replaceChildren(); src = null;
}
$('#mineFile').addEventListener('change', async () => {
  const f = $('#mineFile').files[0];
  dropSource(); imageError = ''; $('#minePreview').hidden = true; $('#mineMsg').textContent = '';
  if (!f) { preparing = null; return refreshMine(); }
  const job = preparing = isVideoFile(f) ? openVideo(f).then(v => ({ ...v, isVideo: true })) : decodeImage(f);
  refreshMine();
  try {
    const d = await job;
    if (job !== preparing) { if (d.isVideo) URL.revokeObjectURL(d.url); return; }   // un autre fichier a été choisi entre-temps
    src = d;
    mineCanvas.hidden = isVid(); mineVideo.hidden = !isVid();
    $('#minePreview').hidden = false;
    if (isVid()) {
      mineStart.max = String(Math.max(0, src.duration - VIDEO.maxDuration).toFixed(1)); mineStart.value = '0'; $('#mineStartOut').textContent = '0.0 s';
      mineBox.append(src.el);
      stopPreview = previewLoop(src, () => +mineStart.value);
      setGrain(mineBox, +mineGrain.value, mineBox.offsetWidth);
    } else drawPreview(mineCanvas, src, +mineGrain.value);
  } catch (e) {
    if (job !== preparing) return;
    console.error('[admin] lecture du fichier impossible :', e);
    $('#mineMsg').textContent = imageError = imageErrorText(e);
  }
  preparing = null;
  refreshMine();
});
$('#mineRemove').addEventListener('click', () => {
  dropSource(); imageError = ''; preparing = null; $('#mineFile').value = ''; $('#minePreview').hidden = true; $('#mineMsg').textContent = '';
  refreshMine();
});
$('#mine').addEventListener('submit', async e => {
  e.preventDefault();
  if (sending || preparing) return;                     // pas de double dépôt, pas d'envoi sans le fichier en cours de lecture
  const text = $('#mineText').value.trim();
  // un fichier choisi mais refusé : on n'envoie PAS le texte seul en silence
  if (imageError || ($('#mineFile').files.length && !src)) { $('#mineMsg').textContent = imageError || 'Not ready'; return; }
  if (!src && !text) { $('#mineMsg').textContent = 'Add an image, a video or words'; return; }
  if (textLength(text) > budget()) { $('#mineMsg').textContent = `${budget()} max`; return; }
  sending = true; submitBtn.textContent = '…'; refreshMine(); $('#mineMsg').textContent = '…';
  try {
    const form = new FormData();
    form.append('text', text); form.append('name', ''); form.append('lang', 'fr'); form.append('consent', '1');
    form.append('size', new FormData($('#mine')).get('size') || 'm');
    let sentFile = false;
    if (isVid()) {
      stopPreview?.(); stopPreview = null;
      let out;
      try { out = await renderVideo(src, { start: +mineStart.value, onProgress: f => { $('#mineMsg').textContent = `… ${Math.round(f * 100)} %`; } }); }
      catch (err) { throw new Error(`image:${imageErrorText(err)}`); }
      form.append('video', out.full, 'video.mp4'); form.append('loop', out.loop, 'loop.mp4');
      form.append('poster', out.poster, `poster.${out.poster.type === 'image/webp' ? 'webp' : 'jpg'}`);
      form.append('grain', String(+mineGrain.value));
      sentFile = true;
    } else if (src) {
      let img;
      try { img = await renderImage(src, { grain: +mineGrain.value }); }
      catch (err) { throw new Error(`image:${imageErrorText(err)}`); }
      const ext = t => (t === 'image/webp' ? 'webp' : t === 'image/png' ? 'png' : 'jpg');
      form.append('image', img.full, `image.${ext(img.full.type)}`);
      form.append('thumb', img.thumb, `thumb.${ext(img.thumb.type)}`);
      sentFile = true;
    }
    $('#mineMsg').textContent = '…';
    const r = await fetch(`${API}/functions/v1/submit`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${await token()}` }, body: form });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || 'server');
    dropSource();
    $('#mine').reset(); $('#minePreview').hidden = true; $('#mineGrainOut').textContent = '0';
    $('#mineMsg').textContent = sentFile && out.kind === 'text' ? 'Text live, file NOT received — delete it (Live) and retry' : 'Live';
    refresh();
  } catch (err) {
    console.error('[admin] publication refusée :', err.message);
    $('#mineMsg').textContent = err.message.startsWith('image:') ? err.message.slice(6) : (SERVER_ERRORS[err.message] || `Error: ${err.message}`);
    if (isVid() && !stopPreview) stopPreview = previewLoop(src, () => +mineStart.value);
  } finally {
    sending = false; refreshMine();
  }
});

/* ------------------------------------------------------------------ démarrage */
try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
refreshMine();
show();

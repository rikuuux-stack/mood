/**
 * Mood — page de modération (administrateur seulement).
 *
 * Connexion : e-mail + mot de passe du compte créé dans Supabase (les inscriptions sont fermées).
 * Toutes les actions passent par la fonction serveur « moderate », qui revérifie que le compte
 * connecté est bien administrateur. Les textes des dépôts sont insérés via textContent uniquement.
 */
import { CONFIG } from '../js/config.js?v=05f59e2af5';
import { decodeImage, renderImage, drawPreview, ImageError } from '../js/image.js?v=0bde9bbfaf';
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
async function moderate(method, body, query = '') {
  const r = await fetch(`${API}/functions/v1/moderate${query}`, {
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
  if (typeof data.prompt === 'string' && document.activeElement !== $('#promptText')) $('#promptText').value = data.prompt;
  showStorage(data.storage);
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

/** Stockage : « 712 MB / 1 GB », en évidence dès 700 Mo (les nouvelles vidéos sont refusées à 900 Mo). */
function showStorage(st) {
  const el = $('#storage');
  if (!st) { el.hidden = true; return; }
  const mb = n => Math.round(n / 1048576);
  el.hidden = false;
  el.classList.toggle('warn', st.used >= st.warn);
  el.textContent = `Storage ${mb(st.used)} MB / 1 GB` + (st.used >= st.cap ? ' — FULL: new videos refused' : st.used >= st.warn ? ` — warning: videos refused from ${mb(st.cap)} MB` : '');
}
const sizeOf = async url => {                         // poids réel du fichier (vidéos)
  try { const r = await fetch(url, { method: 'HEAD' }); const n = +r.headers.get('content-length'); return n ? `${(n / 1048576).toFixed(2)} MB` : null; }
  catch { return null; }
};

function render() {
  $('#mine').hidden = tab !== 'mine';
  $('#expiry').hidden = tab !== 'expiry';
  const list = $('#cards');
  list.hidden = tab === 'mine' || tab === 'expiry';
  if (tab === 'expiry') return renderExpiry();
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
    if (r.kind === 'video' && r.image_url) {          // vidéo : visible et jouable avant de valider (chargée à la demande)
      const v = document.createElement('video');
      v.controls = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
      v.poster = r.thumb_url || ''; v.src = r.image_url;
      li.append(v);
    } else if (r.image_url) { const img = document.createElement('img'); img.src = r.image_url; img.alt = ''; img.loading = 'lazy'; li.append(img); }
    if (r.text) { const t = document.createElement('p'); t.className = 'adm-text'; t.textContent = r.text; li.append(t); }
    const meta = document.createElement('p'); meta.className = 'adm-meta';
    meta.textContent = [r.is_author ? 'me' : (r.name || 'anon'), fmt(r.created_at),
      r.width ? `${r.width}×${r.height}` : null, r.kind === 'video' ? `video ${Number(r.duration).toFixed(1)} s` : null, r.prompt ? `prompt: ${r.prompt}` : null, r.report_count ? `${r.report_count} reports` : null].filter(Boolean).join(' · ');
    li.append(meta, sizePicker(r));
    if (r.kind === 'video' && r.image_url) sizeOf(r.image_url).then(w => { if (w) meta.textContent += ` · ${w}`; });
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

/* ------------------------------------------------------------------ expiration à 180 jours (rapport)
 * Par défaut : SIMULATION. Rien n'est supprimé ; la liste dit ce qui le serait, et la place libérée.
 * Le réglage ne s'active que dans Supabase (éditeur SQL, voir docs/MODERATION.md) : aucun bouton ici ne le peut.
 * Une fois activé par l'auteur, un bouton « Run » apparaît (2ᵉ toucher pour confirmer).
 */
const mb = n => `${(n / 1048576).toFixed(1)} MB`;
async function renderExpiry() {
  const box = $('#expiry');
  box.textContent = '…';
  let r;
  try { r = await moderate('GET', null, '?expiry'); }
  catch (e) { if (e.message !== 'auth') box.textContent = 'Report unreadable — retry'; return; }
  if (tab !== 'expiry') return;
  const p = (t, cls) => { const x = document.createElement('p'); if (cls) x.className = cls; x.textContent = t; return x; };
  const parts = [
    p(r.enabled ? `ON — files of posts older than ${r.days} days are deleted when you press Run.` : `Simulation — OFF: nothing is deleted. Posts older than ${r.days} days would lose their files and keep only their line in the List.`, r.enabled ? 'adm-storage warn' : 'adm-storage'),
    p(`Now: ${r.now.count} post(s) · ${mb(r.now.bytes)} would be freed`),
    p(`Next 30 days: ${r.next30.count} more · ${mb(r.next30.bytes)}`),
  ];
  if (r.now.posts.length) {
    const fmtDay = iso => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }).format(new Date(iso));
    const ol = document.createElement('ol'); ol.className = 'adm-expiry-list';
    for (const x of r.now.posts) ol.append(p(`${fmtDay(x.approved_at)} · ${x.kind} · ${x.prompt || '—'} · ${mb(x.bytes)}`));
    parts.push(ol);
  }
  if (r.enabled) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Run';
    b.addEventListener('click', async () => {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Sure? Files are deleted'; return; }
      b.disabled = true;
      try { const out = await moderate('POST', { action: 'expiry-run' }); $('#dashMsg').textContent = `${out.done} post(s) expired`; renderExpiry(); }
      catch (e) { if (e.message !== 'auth') { $('#dashMsg').textContent = e.message === 'disabled' ? 'Expiry is OFF' : 'Failed — retry'; b.disabled = false; } }
    });
    parts.push(b);
  }
  box.replaceChildren(...parts);
}

/* ------------------------------------------------------------------ consigne du mois
 * Un court texte anglais (60 caractères au plus) : « This month: … » sur le mur et dans Drop, et gardé
 * sur chaque nouveau dépôt (strates du mur). Vide = pas de consigne ce mois-ci.
 */
async function savePrompt(text) {
  const btns = $('#promptForm').querySelectorAll('button'); btns.forEach(b => { b.disabled = true; });
  try { const out = await moderate('POST', { action: 'prompt', text }); $('#promptText').value = out.prompt; $('#dashMsg').textContent = out.prompt ? 'Prompt saved' : 'No prompt'; }
  catch (e) { if (e.message !== 'auth') $('#dashMsg').textContent = e.message === 'tooLong' ? '60 max' : 'Failed — retry'; }
  btns.forEach(b => { b.disabled = false; });
}
$('#promptForm').addEventListener('submit', e => { e.preventDefault(); savePrompt($('#promptText').value.trim()); });
$('#promptClear').addEventListener('click', () => { $('#promptText').value = ''; savePrompt(''); });

/* ------------------------------------------------------------------ dépôt de l'auteur du site (publié directement, avec la marque) */
// Même formulaire que le site : taille S / M / L. Pas de grain réglable : le grain est une règle globale du site.
let src = null, preparing = null, imageError = '', sending = false;
const budget = () => src ? textBudget(src.width, src.height) : textBudget();
const IMAGE_ERRORS = { eType: 'Image refused: format', eTooBig: 'Image refused: too heavy', eMeta: 'Image refused: metadata', eDecode: 'Image refused: unreadable' };
const SERVER_ERRORS = {
  type: 'Image refused by the server: format', size: 'Image refused by the server: over 2000 px', thumb: 'Thumbnail refused',
  meta: 'Image refused by the server: metadata', tooBig: 'Image refused by the server: too heavy', tooLong: 'Too long for this image',
  empty: 'Add an image or words', storage: 'Storage error', display: 'Unknown size',
};
const imageErrorText = e => IMAGE_ERRORS[e instanceof ImageError ? e.code : 'eDecode'] || IMAGE_ERRORS.eDecode;
const submitBtn = $('#mine button[type=submit]'), mineCanvas = $('#minePreview canvas');
function refreshMine() {
  const n = textLength($('#mineText').value), max = budget();
  $('#mineCount').textContent = `${n} / ${max}`;
  $('#mineFileLabel').textContent = src ? 'Change' : 'Image';
  $('#mineRemove').hidden = !src && !imageError;
  submitBtn.disabled = sending || !!preparing;
  submitBtn.textContent = sending || preparing ? '…' : 'Drop';
}
$('#mineText').addEventListener('input', refreshMine);
$('#mineFile').addEventListener('change', async () => {
  const f = $('#mineFile').files[0];
  src = null; imageError = ''; $('#minePreview').hidden = true; $('#mineMsg').textContent = '';
  if (!f) { preparing = null; return refreshMine(); }
  const job = preparing = decodeImage(f);
  refreshMine();
  try {
    const d = await job;
    if (job !== preparing) return;                      // une autre image a été choisie entre-temps
    src = d;
    drawPreview(mineCanvas, src, 0);
    $('#mineInfo').textContent = `${d.width} × ${d.height}`;
    $('#minePreview').hidden = false;
  } catch (e) {
    if (job !== preparing) return;
    console.error('[admin] lecture de l’image impossible :', e);
    $('#mineMsg').textContent = imageError = imageErrorText(e);
  }
  preparing = null;
  refreshMine();
});
$('#mineRemove').addEventListener('click', () => {
  src = null; imageError = ''; preparing = null; $('#mineFile').value = ''; $('#minePreview').hidden = true; $('#mineMsg').textContent = '';
  refreshMine();
});
$('#mine').addEventListener('submit', async e => {
  e.preventDefault();
  if (sending || preparing) return;                     // pas de double dépôt, pas d'envoi sans l'image en cours de lecture
  const text = $('#mineText').value.trim();
  // une image choisie mais refusée : on n'envoie PAS le texte seul en silence
  if (imageError || ($('#mineFile').files.length && !src)) { $('#mineMsg').textContent = imageError || 'Image not ready'; return; }
  if (!src && !text) { $('#mineMsg').textContent = 'Add an image or words'; return; }
  if (textLength(text) > budget()) { $('#mineMsg').textContent = `${budget()} max`; return; }
  sending = true; refreshMine(); $('#mineMsg').textContent = '…';
  try {
    const form = new FormData();
    form.append('text', text); form.append('name', ''); form.append('lang', 'fr'); form.append('consent', '1');
    form.append('size', new FormData($('#mine')).get('size') || 'm');
    let sentImage = false;
    if (src) {
      let img;
      try { img = await renderImage(src); }
      catch (err) { throw new Error(`image:${imageErrorText(err)}`); }
      const ext = t => (t === 'image/webp' ? 'webp' : t === 'image/png' ? 'png' : 'jpg');
      form.append('image', img.full, `image.${ext(img.full.type)}`);
      form.append('thumb', img.thumb, `thumb.${ext(img.thumb.type)}`);
      sentImage = true;
    }
    const r = await fetch(`${API}/functions/v1/submit`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${await token()}` }, body: form });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || 'server');
    $('#mine').reset(); src = null; $('#minePreview').hidden = true;
    $('#mineMsg').textContent = sentImage && out.kind === 'text' ? 'Text live, image NOT received — delete it (Live) and retry' : 'Live';
    refresh();
  } catch (err) {
    console.error('[admin] publication refusée :', err.message);
    $('#mineMsg').textContent = err.message.startsWith('image:') ? err.message.slice(6) : (SERVER_ERRORS[err.message] || `Error: ${err.message}`);
  } finally {
    sending = false; refreshMine();
  }
});

/* ------------------------------------------------------------------ démarrage */
try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
refreshMine();
show();

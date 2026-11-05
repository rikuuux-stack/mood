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

async function refresh(quiet = false) {           // quiet : relecture en arrière-plan, le message en cours reste
  if (!quiet) $('#dashMsg').textContent = '…';
  try {
    data = await moderate('GET');
    if (!quiet) $('#dashMsg').textContent = '';
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
// raison d'un refus, en un mot (gardée dans le journal de modération, sans aucune donnée personnelle)
const REASONS = ['rights', 'offensive', 'private', 'spam', 'test', 'other'];

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
  $('#archive').hidden = tab !== 'archive';
  $('#stats').hidden = tab !== 'stats';
  $('#expiry').hidden = tab !== 'expiry';
  const list = $('#cards');
  list.hidden = tab === 'mine' || tab === 'archive' || tab === 'stats' || tab === 'expiry';
  renderBulk();
  if (tab === 'archive') return renderArchive();
  if (tab === 'stats') return renderStats();
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
    } else if (r.image_url) {
      // la miniature (≈ 800 px, ~100 Ko) plutôt que l'image entière (jusqu'à 5 Mo) ; toucher : l'image entière
      const a = document.createElement('a'); a.href = r.image_url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', 'Full image');
      const img = document.createElement('img'); img.src = r.thumb_url || r.image_url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      a.append(img); li.append(a);
    }
    if (r.text) { const t = document.createElement('p'); t.className = 'adm-text'; t.textContent = r.text; li.append(t); }
    const meta = document.createElement('p'); meta.className = 'adm-meta';
    meta.textContent = [r.is_author ? 'me' : (r.name || 'anon'), fmt(r.created_at),
      r.width ? `${r.width}×${r.height}` : null, r.kind === 'video' ? `video ${Number(r.duration).toFixed(1)} s` : null, r.prompt ? `prompt: ${r.prompt}` : null, r.report_count ? `${r.report_count} reports` : null].filter(Boolean).join(' · ');
    li.append(meta, sizePicker(r));
    if (r.kind === 'video' && r.image_url) sizeOf(r.image_url).then(w => { if (w) meta.textContent += ` · ${w}`; });
    const bar = document.createElement('div'); bar.className = 'adm-actions';
    for (const [action, label, risky] of ACTIONS[tab]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label;
      const send = async extra => {
        bar.querySelectorAll('button').forEach(x => { x.disabled = true; });
        try {
          await moderate('POST', { action, id: r.id, ...extra });
          // la carte part tout de suite ; la liste complète est relue ensuite, sans faire attendre
          for (const k of ['pending', 'hidden', 'published']) data[k] = (data[k] || []).filter(x => x.id !== r.id);
          li.remove();
          $('#dashMsg').textContent = 'Done';
          refresh(true);
        }
        catch { $('#dashMsg').textContent = 'Failed — retry'; bar.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
      };
      b.addEventListener('click', () => {
        // Reject : la raison en un mot sert de confirmation (un toucher sur la raison = refus envoyé)
        if (action === 'reject') {
          if (bar.querySelector('.adm-reasons')) return;
          const box = document.createElement('div'); box.className = 'adm-reasons'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Reject: reason');
          for (const reason of REASONS) {
            const x = document.createElement('button'); x.type = 'button'; x.className = 'btn'; x.textContent = reason; x.dataset.reason = reason;
            x.addEventListener('click', () => send({ reason }));
            box.append(x);
          }
          b.classList.add('confirm'); b.textContent = 'Why?';
          bar.append(box);
          return;
        }
        // autre action irréversible : un second toucher pour confirmer
        if (risky && !b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Sure?'; return; }
        send({});
      });
      bar.append(b);
    }
    li.append(bar);
    return li;
  }));
}

/* ------------------------------------------------------------------ Pending : tout valider / tout refuser
 * Même action serveur que les boutons de chaque carte, dépôt par dépôt (aucune nouvelle route). Garde-fous :
 *   - second toucher obligatoire, qui affiche le NOMBRE de dépôts concernés (« Sure? Reject 7 ») ;
 *   - le lot est figé au moment où la liste est AFFICHÉE : un dépôt arrivé depuis (pas encore vu) n'est jamais traité ;
 *   - arrêt au premier échec, en disant lequel ; la liste est relue à la fin (réussite ou échec).
 * Reject all est irréversible (fichiers et ligne supprimés), comme Reject.
 */
let batch = [], bulkBusy = false;
function renderBulk() {
  const box = $('#bulk'), rows = tab === 'pending' ? data.pending || [] : [];
  box.hidden = !rows.length;
  if (bulkBusy) return;
  batch = rows.map(r => r.id);                         // ce qui est affiché, et seulement ça
  box.querySelectorAll('button').forEach(b => {
    b.disabled = false; b.classList.remove('confirm');
    b.textContent = b.dataset.bulk === 'approve' ? 'Approve all' : 'Reject all';
  });
}
const short = r => [r.kind, fmt(r.created_at), r.text ? `“${r.text.slice(0, 30)}${r.text.length > 30 ? '…' : ''}”` : null].filter(Boolean).join(' · ');
document.querySelectorAll('[data-bulk]').forEach(b => b.addEventListener('click', async () => {
  const action = b.dataset.bulk, ids = batch.slice(), verb = action === 'approve' ? 'Approve' : 'Reject';
  if (!ids.length || bulkBusy) return;
  if (!b.classList.contains('confirm')) {               // 1ᵉʳ toucher : confirmation avec le nombre
    $('#bulk').querySelectorAll('button').forEach(x => { x.classList.remove('confirm'); x.textContent = x.dataset.bulk === 'approve' ? 'Approve all' : 'Reject all'; });
    b.classList.add('confirm'); b.textContent = `Sure? ${verb} ${ids.length}`;
    return;
  }
  bulkBusy = true;
  $('#bulk').querySelectorAll('button').forEach(x => { x.disabled = true; });
  $('#cards').querySelectorAll('.adm-actions button').forEach(x => { x.disabled = true; });
  const byId = new Map((data.pending || []).map(r => [r.id, r]));
  let done = 0, failedAt = null;
  for (const id of ids) {
    $('#dashMsg').textContent = `${verb} ${done + 1} / ${ids.length}…`;
    try { await moderate('POST', { action, id }); done++; }
    catch (e) { failedAt = { id, error: e.message }; break; }
  }
  bulkBusy = false;
  if (failedAt?.error === 'auth') return;               // déjà renvoyé à l'écran de connexion
  const r = byId.get(failedAt?.id);
  $('#dashMsg').textContent = failedAt
    ? `Stopped: ${done} / ${ids.length} done. Failed on #${done + 1}${r ? ` (${short(r)})` : ''} — retry`
    : `Done: ${done} / ${ids.length}`;
  const msg = $('#dashMsg').textContent;
  await refresh();
  $('#dashMsg').textContent = msg;                      // le résultat reste affiché après la relecture
}));

/* ------------------------------------------------------------------ archive nocturne du mur
 * Une nuit = un dossier du bucket privé « archive » (tools/archive.mjs, 03:00 heure de Tokyo) : capture iPhone,
 * capture ordinateur, état en JSON. Les liens (aperçu, téléchargement) sont signés pour 1 h et demandés
 * seulement à l'ouverture d'une nuit. Suppression d'une nuit : pour une demande de retrait de contenu.
 */
const kb = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
async function renderArchive() {
  const box = $('#nights'), info = $('#archiveInfo');
  info.textContent = '…'; box.replaceChildren();
  let out;
  try { out = await moderate('GET', null, '?archive'); }
  catch (e) { if (e.message !== 'auth') info.textContent = 'Archive unreadable — retry'; return; }
  if (tab !== 'archive') return;
  info.textContent = out.nights.length ? `${out.nights.length} night(s) · ${kb(out.total)} (archive limit 200 MB)` : 'No night archived yet (every night at 03:00, Tokyo time).';
  box.replaceChildren(...out.nights.map(n => {
    const li = document.createElement('li'); li.className = 'adm-night';
    const d = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = `${n.date} · ${n.files.map(f => f.name.replace(/\.\w+$/, '')).join(', ')} · ${kb(n.files.reduce((s, f) => s + f.size, 0))}`;
    const body = document.createElement('div'); body.className = 'adm-night-body';
    d.append(sum, body);
    d.addEventListener('toggle', async () => {
      if (!d.open || body.dataset.loaded) return;
      body.textContent = '…';
      try {
        const { files } = await moderate('POST', { action: 'archive-urls', date: n.date });
        body.dataset.loaded = '1';
        const links = document.createElement('p'); links.className = 'adm-actions';
        const shots = document.createElement('div'); shots.className = 'adm-shots';
        for (const f of files) {
          if (f.name.endsWith('.jpg')) {
            const img = document.createElement('img'); img.src = f.url; img.alt = `${n.date} ${f.name}`; img.loading = 'lazy';
            shots.append(img);
          }
          const a = document.createElement('a'); a.className = 'btn'; a.href = f.download; a.textContent = f.name; a.setAttribute('download', '');
          links.append(a);
        }
        const del = document.createElement('button'); del.type = 'button'; del.className = 'btn'; del.textContent = 'Delete night';
        del.addEventListener('click', async () => {
          // irréversible : un second toucher pour confirmer
          if (!del.classList.contains('confirm')) { del.classList.add('confirm'); del.textContent = 'Sure?'; return; }
          del.disabled = true;
          try { await moderate('POST', { action: 'archive-delete', date: n.date }); $('#dashMsg').textContent = `Night ${n.date} deleted`; renderArchive(); }
          catch (e) { if (e.message !== 'auth') { $('#dashMsg').textContent = 'Failed — retry'; del.disabled = false; } }
        });
        links.append(del);
        body.replaceChildren(shots, links);
      } catch (e) { if (e.message !== 'auth') body.textContent = 'Links unavailable — retry'; }
    });
    li.append(d);
    return li;
  }));
}

/* ------------------------------------------------------------------ journal de modération (Stats)
 * Par mois (heure de Tokyo) : acceptés, refusés (et par raison), retirés. Par consigne : dépôts acceptés / refusés.
 * Aucune donnée personnelle : le journal ne garde que l'heure (arrondie), la décision, la raison et la consigne.
 */
function table(head, rows) {
  const t = document.createElement('table'); t.className = 'adm-table';
  const tr = (cells, tag) => { const r = document.createElement('tr'); for (const c of cells) { const x = document.createElement(tag); x.textContent = c; r.append(x); } return r; };
  const th = document.createElement('thead'); th.append(tr(head, 'th'));
  const tb = document.createElement('tbody'); rows.forEach(r => tb.append(tr(r, 'td')));
  t.append(th, tb);
  const wrap = document.createElement('div'); wrap.className = 'adm-table-wrap'; wrap.append(t);
  return wrap;
}
async function renderStats() {
  const box = $('#stats');
  box.textContent = '…';
  let s;
  try { s = await moderate('GET', null, '?stats'); }
  catch (e) { if (e.message !== 'auth') box.textContent = 'Stats unreadable — retry'; return; }
  if (tab !== 'stats') return;
  if (!s.total) { box.textContent = 'No decision logged yet.'; return; }
  const why = o => REASONS.filter(r => o.reasons[r]).map(r => `${r} ${o.reasons[r]}`).join(' · ') || '—';
  const h = t => { const x = document.createElement('h2'); x.className = 'adm-h'; x.textContent = t; return x; };
  box.replaceChildren(
    h('By month (Tokyo time)'),
    table(['Month', 'Approved', 'Rejected', 'Why', 'Removed'], s.months.map(m => [m.month, m.approved, m.rejected, why(m), m.removed])),
    h('By prompt'),
    table(['Prompt', 'Posts', 'Approved', 'Rejected'], s.prompts.map(p => [p.prompt || '(none)', p.approved + p.rejected, p.approved, p.rejected])),
  );
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

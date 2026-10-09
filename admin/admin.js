/**
 * Mood — page de modération (RIKU seulement).
 *
 * Connexion : e-mail + mot de passe du compte créé dans Supabase (les inscriptions sont fermées).
 * Toutes les actions passent par la fonction serveur « moderate », qui revérifie que le compte
 * connecté est bien administrateur. Les textes des dépôts sont insérés via textContent uniquement.
 */
import { CONFIG } from '../js/config.js?v=1f46695844';
import { prepareImage, ImageError } from '../js/image.js?v=4809b3f77f';
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
  if (r.status === 401 && out.error === 'auth') { save(null); show(); $('#loginMsg').textContent = 'Session expirée ou refusée : reconnecte-toi.'; throw new Error('auth'); }
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
  $('#loginMsg').textContent = 'Connexion…';
  try {
    await auth('password', { email: $('#email').value.trim(), password: $('#password').value });
    $('#password').value = ''; $('#loginMsg').textContent = '';
    show();
  } catch {
    $('#loginMsg').textContent = 'E-mail ou mot de passe incorrect.';
  }
});
$('#logout').addEventListener('click', () => { save(null); show(); });

async function refresh() {
  $('#dashMsg').textContent = 'Chargement…';
  try {
    data = await moderate('GET');
    $('#dashMsg').textContent = '';
  } catch (e) {
    if (e.message === 'auth') return;                       // déjà renvoyé à l'écran de connexion
    $('#dashMsg').textContent = e.message === 'admin' ? 'Ce compte n’est pas administrateur.'
      : 'Impossible de charger les dépôts (erreur du serveur). Réessaie dans un instant.';
  }
  for (const k of ['pending', 'hidden', 'published']) $(`[data-n="${k}"]`).textContent = `(${data[k].length})`;
  render();
}

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  render();
}));

const fmt = iso => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const ACTIONS = {
  pending: [['approve', 'Valider', false], ['reject', 'Refuser', true]],
  hidden: [['restore', 'Remettre en ligne', false], ['remove', 'Supprimer', true]],
  published: [['remove', 'Retirer du mur', true]],
};
const DONE = { approve: 'Validé : il est sur le mur.', reject: 'Refusé et supprimé.', remove: 'Supprimé.', restore: 'Remis en ligne.' };

function render() {
  $('#mine').hidden = tab !== 'mine';
  const list = $('#cards');
  list.hidden = tab === 'mine';
  if (tab === 'mine') return;
  const rows = data[tab] || [];
  if (!rows.length) {
    const p = document.createElement('li'); p.className = 'adm-empty';
    p.textContent = { pending: 'Rien en attente.', hidden: 'Aucun dépôt masqué par des signalements.', published: 'Le mur est vide.' }[tab];
    list.replaceChildren(p);
    return;
  }
  list.replaceChildren(...rows.map(r => {
    const li = document.createElement('li'); li.className = 'adm-card';
    if (r.image_url) { const img = document.createElement('img'); img.src = r.image_url; img.alt = ''; img.loading = 'lazy'; li.append(img); }
    if (r.text) { const t = document.createElement('p'); t.className = 'adm-text'; t.textContent = r.text; li.append(t); }
    const meta = document.createElement('p'); meta.className = 'adm-meta';
    meta.textContent = [r.is_riku ? 'RIKU' : (r.name || 'anonyme'), fmt(r.created_at),
      r.width ? `${r.width} × ${r.height} px` : null, r.report_count ? `${r.report_count} signalement(s)` : null].filter(Boolean).join(' · ');
    li.append(meta);
    const bar = document.createElement('div'); bar.className = 'adm-actions';
    for (const [action, label, risky] of ACTIONS[tab]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label;
      b.addEventListener('click', async () => {
        // action irréversible : un second toucher pour confirmer
        if (risky && !b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = `${label} — confirmer`; return; }
        bar.querySelectorAll('button').forEach(x => { x.disabled = true; });
        try { await moderate('POST', { action, id: r.id }); $('#dashMsg').textContent = DONE[action]; await refresh(); }
        catch { $('#dashMsg').textContent = 'L’action a échoué. Réessaie.'; bar.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
      });
      bar.append(b);
    }
    li.append(bar);
    return li;
  }));
}

/* ------------------------------------------------------------------ dépôt de RIKU (publié directement, avec la marque) */
let prepared = null;
const budget = () => prepared ? textBudget(prepared.width, prepared.height) : textBudget();
function refreshMine() {
  const n = textLength($('#mineText').value), max = budget();
  $('#mineBudget').textContent = prepared ? `Cette image laisse ${max} caractères` : `Sans image : ${max} caractères`;
  $('#mineCount').textContent = `${n} / ${max}`;
  $('#mineFileLabel').textContent = prepared ? 'Changer d’image' : 'Choisir une image';
  $('#mineRemove').hidden = !prepared;
}
$('#mineText').addEventListener('input', refreshMine);
$('#mineFile').addEventListener('change', async () => {
  const f = $('#mineFile').files[0];
  prepared = null; $('#minePreview').hidden = true; $('#mineMsg').textContent = '';
  if (f) {
    try {
      prepared = await prepareImage(f);
      $('#minePreview img').src = URL.createObjectURL(prepared.full);
      $('#mineInfo').textContent = `${prepared.width} × ${prepared.height} px · métadonnées retirées`;
      $('#minePreview').hidden = false;
    } catch (e) {
      $('#mineMsg').textContent = e instanceof ImageError && e.code === 'eTooBig' ? 'Fichier trop lourd (5 Mo max).' : 'Image refusée (JPEG, PNG ou WebP).';
    }
  }
  refreshMine();
});
$('#mineRemove').addEventListener('click', () => { prepared = null; $('#mineFile').value = ''; $('#minePreview').hidden = true; refreshMine(); });
$('#mine').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#mineText').value.trim();
  if (!prepared && !text) { $('#mineMsg').textContent = 'Ajoute une image, des mots, ou les deux.'; return; }
  if (textLength(text) > budget()) { $('#mineMsg').textContent = `Trop long : ${budget()} caractères au maximum.`; return; }
  const form = new FormData();
  form.append('text', text); form.append('name', ''); form.append('lang', 'fr'); form.append('consent', '1');
  if (prepared) {
    const ext = t => (t === 'image/webp' ? 'webp' : t === 'image/png' ? 'png' : 'jpg');
    form.append('image', prepared.full, `image.${ext(prepared.full.type)}`);
    form.append('thumb', prepared.thumb, `thumb.${ext(prepared.thumb.type)}`);
  }
  $('#mineMsg').textContent = 'Publication…';
  try {
    const r = await fetch(`${API}/functions/v1/submit`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${await token()}` }, body: form });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || 'server');
    $('#mine').reset(); prepared = null; $('#minePreview').hidden = true; refreshMine();
    $('#mineMsg').textContent = out.status === 'approved' ? 'Publié sur le mur, avec ta marque.' : 'Envoyé.';
    refresh();
  } catch (err) {
    $('#mineMsg').textContent = `Échec de la publication (${err.message}).`;
  }
});

/* ------------------------------------------------------------------ démarrage */
try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
refreshMine();
show();

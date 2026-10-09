/**
 * Accès aux données — le seul fichier qui parle au serveur.
 *
 *   mode 'live' : Supabase. Lecture : vue publique « wall » (dépôts validés uniquement).
 *                 Écriture : fonctions serveur submit / report (captcha, limites et formats
 *                 revérifiés là-bas). La clé utilisée ici est la clé publique « anon ».
 *   mode 'mock' : tout est simulé dans le navigateur (mur vide, aucun envoi). Forcé par ?mock dans l'URL.
 */
import { CONFIG } from './config.js?v=05f59e2af5';

const wait = ms => new Promise(r => setTimeout(r, ms));
export const mode = new URLSearchParams(location.search).has('mock') ? 'mock' : CONFIG.mode;

const headers = () => ({ apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` });
const publicUrl = path => `${CONFIG.supabaseUrl}/storage/v1/object/public/published/${encodeURIComponent(path)}`;

/** Erreur serveur → code traduisible (js/strings.js : e<Code>). */
export class ServerError extends Error {
  constructor(code, status, reason) { super(code); this.code = code; this.status = status; this.reason = reason; }
}

/* ------------------------------------------------------------------ mur gardé sur l'appareil
 * La première page du mur est rangée dans localStorage : au retour, le mur s'affiche aussitôt,
 * puis se met à jour en arrière-plan. Ignorée au-delà de 24 h (un dépôt retiré ne réapparaît pas).
 */
const CACHE_KEY = 'mood-wall-v2', CACHE_MAX = 24 * 3600e3;   // v2 : avec la consigne de chaque dépôt
export function cachedPosts() {
  if (mode === 'mock') return null;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && Array.isArray(c.posts) && Date.now() - c.t < CACHE_MAX) return { posts: c.posts, prompt: c.prompt || '' };
  } catch {}
  return null;
}
function save(patch) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {};
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, ...patch, t: Date.now() }));
  } catch {}
}

/* ------------------------------------------------------------------ consigne du mois
 * Un court texte anglais réglé depuis /admin/ (table prompt) ; vide = pas de consigne ce mois-ci.
 */
export async function fetchPrompt() {
  if (mode === 'mock') return '';
  const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/current_prompt?select=text`, { headers: headers() });
  if (!r.ok) throw new ServerError('server', r.status);
  const prompt = (await r.json())[0]?.text || '';
  save({ prompt });
  return prompt;
}

/* ------------------------------------------------------------------ mes dépôts en attente
 * Après l'envoi, le navigateur du visiteur garde une petite copie de SON dépôt (texte + miniature
 * d'≈ 40 Ko) et la montre sur SON mur, marquée « Under review », jusqu'à la validation. Personne
 * d'autre ne la voit. Effacée dès que le dépôt apparaît sur le mur, ou au bout de 14 jours (refusé).
 */
const PENDING_KEY = 'mood-pending-v1', PENDING_MAX = 14 * 86400e3;
export function pendingPosts() {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(list) ? list.filter(p => Date.now() - Date.parse(p.createdAt) < PENDING_MAX) : [];
  } catch { return []; }
}
function savePending(list) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch {} }
export function addPending(p) { savePending([p, ...pendingPosts().filter(x => x.id !== p.id)].slice(0, 10)); }
/** Retire les copies dont le dépôt est désormais publié (ids reçus du serveur). */
export function settlePending(publishedIds) {
  const ids = new Set(publishedIds), keep = pendingPosts().filter(p => !ids.has(p.id));
  savePending(keep);                                    // retire aussi les copies de plus de 14 jours
  return keep;
}

/** Dépôts validés, du plus récent au plus ancien. */
export async function fetchPosts({ offset = 0, limit = CONFIG.wall.batch } = {}) {
  if (mode === 'mock') {
    const { MOCK_POSTS } = await import('./mock.js?v=f62979d0a7');
    return MOCK_POSTS.slice(offset, offset + limit);
  }
  const q = new URLSearchParams({
    select: 'id,kind,text,name,image_path,thumb_path,width,height,size,prompt,created_at,approved_at',
    order: 'approved_at.desc', offset: String(offset), limit: String(limit),
  });
  const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/wall?${q}`, { headers: headers() });
  if (!r.ok) throw new ServerError('server', r.status);
  const posts = (await r.json()).map(p => ({
    id: p.id, kind: p.kind, text: p.text || '', name: p.name || '', size: p.size || 'm', prompt: p.prompt || '',
    createdAt: p.created_at, approvedAt: p.approved_at || p.created_at,
    // vidéo : image fixe (thumb_path) partout ; le fichier vidéo (image_path) seulement à l'ouverture
    image: !p.image_path ? null : p.kind === 'video'
      ? { src: publicUrl(p.thumb_path), thumb: publicUrl(p.thumb_path), video: publicUrl(p.image_path), w: p.width, h: p.height }
      : { src: publicUrl(p.image_path), thumb: publicUrl(p.thumb_path), w: p.width, h: p.height },
  }));
  if (offset === 0) save({ posts });
  return posts;
}

async function call(fn, init) {
  let r;
  try { r = await fetch(`${CONFIG.supabaseUrl}/functions/v1/${fn}`, init); }
  catch { throw new ServerError('network', 0); }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new ServerError(out.error || 'server', r.status, out.reason);
  return out;
}

/** Envoie un dépôt : { text, name, lang, size: 's'|'m'|'l', image: { full, thumb } | null, video: { video, poster } | null, captcha }. */
export async function submitPost({ text, name, lang, size = 'm', image, video, captcha }) {
  if (mode === 'mock') { await wait(600); return { ok: true }; }
  const form = new FormData();
  form.append('text', text);
  form.append('name', name);
  form.append('lang', lang);
  form.append('size', size);
  form.append('consent', '1');
  form.append('captcha', captcha);
  if (video) {                                          // vidéo / GIF converti : MP4 + image fixe
    form.append('video', video.video, 'video.mp4');
    form.append('poster', video.poster, 'poster.jpg');
  }
  if (image) {
    const ext = t => (t === 'image/webp' ? 'webp' : t === 'image/png' ? 'png' : 'jpg');
    form.append('image', image.full, `image.${ext(image.full.type)}`);
    form.append('thumb', image.thumb, `thumb.${ext(image.thumb.type)}`);
  }
  return call('submit', { method: 'POST', headers: headers(), body: form });
}

export async function reportPost(id, reason, captcha) {
  if (mode === 'mock') { await wait(400); return { ok: true }; }
  return call('report', {
    method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_id: id, reason, captcha }),
  });
}

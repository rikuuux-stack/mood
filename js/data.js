/**
 * Accès aux données — le seul fichier qui parle au serveur.
 *
 *   mode 'live' : Supabase. Lecture : vue publique « wall » (dépôts validés uniquement).
 *                 Écriture : fonctions serveur submit / report (captcha, limites et formats
 *                 revérifiés là-bas). La clé utilisée ici est la clé publique « anon ».
 *   mode 'mock' : tout est simulé dans le navigateur (mur vide, aucun envoi). Forcé par ?mock dans l'URL.
 */
import { CONFIG } from './config.js?v=1f46695844';

const wait = ms => new Promise(r => setTimeout(r, ms));
export const mode = new URLSearchParams(location.search).has('mock') ? 'mock' : CONFIG.mode;

const headers = () => ({ apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` });
const publicUrl = path => `${CONFIG.supabaseUrl}/storage/v1/object/public/published/${encodeURIComponent(path)}`;

/** Erreur serveur → code traduisible (js/strings.js : e<Code>). */
export class ServerError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

/** Dépôts validés, du plus récent au plus ancien. */
export async function fetchPosts({ offset = 0, limit = CONFIG.wall.pageSize } = {}) {
  if (mode === 'mock') {
    const { MOCK_POSTS } = await import('./mock.js?v=75d61f5f8f');
    return MOCK_POSTS.slice(offset, offset + limit);
  }
  const q = new URLSearchParams({
    select: 'id,kind,text,name,image_path,thumb_path,width,height,is_riku,created_at,approved_at',
    order: 'approved_at.desc', offset: String(offset), limit: String(limit),
  });
  const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/wall?${q}`, { headers: headers() });
  if (!r.ok) throw new ServerError('server', r.status);
  return (await r.json()).map(p => ({
    id: p.id, kind: p.kind, text: p.text || '', name: p.name || '', isRiku: p.is_riku,
    createdAt: p.created_at,
    image: p.image_path ? { src: publicUrl(p.image_path), thumb: publicUrl(p.thumb_path), w: p.width, h: p.height } : null,
  }));
}

async function call(fn, init) {
  let r;
  try { r = await fetch(`${CONFIG.supabaseUrl}/functions/v1/${fn}`, init); }
  catch { throw new ServerError('network', 0); }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new ServerError(out.error || 'server', r.status);
  return out;
}

/** Envoie un dépôt : { text, name, lang, image: { full, thumb } | null, captcha }. */
export async function submitPost({ text, name, lang, image, captcha }) {
  if (mode === 'mock') { await wait(600); return { ok: true }; }
  const form = new FormData();
  form.append('text', text);
  form.append('name', name);
  form.append('lang', lang);
  form.append('consent', '1');
  form.append('captcha', captcha);
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

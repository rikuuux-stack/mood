/**
 * POST /functions/v1/submit — reçoit un dépôt (multipart/form-data).
 *
 * Champs : text, name, lang, consent=1, captcha (jeton Turnstile), image (grande), thumb (miniature).
 * Ordre des contrôles : d'abord ce qui ne coûte rien (formats, tailles, budget), puis le captcha,
 * puis la limite de fréquence. Rien n'est visible publiquement : le dépôt part en « pending »,
 * fichiers dans le bucket privé. Exception : si l'appelant est RIKU (connecté), son dépôt est publié
 * directement avec sa marque, sans captcha ni limite.
 */
import { cors, json, fail, service, ipHash, verifyCaptcha, adminId, notify, SITE_URL } from '../_shared/http.js';
import { sniffType, dimensions, hasMetadata, looksLikeLink } from '../_shared/image.js';
import { textBudget, textLength } from '../_shared/budget.js';

const MAX_BYTES = 5 * 1024 * 1024, MAX_THUMB = 1024 * 1024, MAX_SIDE = 2000, THUMB_SIDE = 800;
const PER_HOUR = 3, PER_DAY = 10;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function readImage(file, maxBytes, maxSide) {
  if (!(file instanceof File)) return { error: 'type' };
  if (file.size > maxBytes) return { error: 'tooBig' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) return { error: 'type' };
  if (hasMetadata(bytes)) return { error: 'meta' };
  const dim = dimensions(bytes);
  if (!dim || dim.width < 1 || dim.height < 1 || Math.max(dim.width, dim.height) > maxSide) return { error: 'size' };
  return { bytes, type, ...dim };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fail(req, 405, 'method');

  let form;
  try { form = await req.formData(); } catch { return fail(req, 400, 'bad'); }
  const text = String(form.get('text') || '').trim();
  const name = String(form.get('name') || '').trim();
  const lang = ['fr', 'ja', 'en'].includes(form.get('lang')) ? form.get('lang') : null;
  const imageFile = form.get('image'), thumbFile = form.get('thumb');
  const hasImage = imageFile instanceof File && imageFile.size > 0;

  // 1. contrôles gratuits
  if (form.get('consent') !== '1') return fail(req, 400, 'rights');
  if (textLength(name) > 40 || looksLikeLink(name)) return fail(req, 400, 'name');
  let full = null, thumb = null;
  if (hasImage) {
    full = await readImage(imageFile, MAX_BYTES, MAX_SIDE);
    if (full.error) return fail(req, full.error === 'tooBig' ? 413 : 415, full.error);
    thumb = await readImage(thumbFile, MAX_THUMB, THUMB_SIDE);
    if (thumb.error) return fail(req, 415, 'thumb');
  } else if (!text) {
    return fail(req, 400, 'empty');
  }
  const budget = hasImage ? textBudget(full.width, full.height) : textBudget();
  if (textLength(text) > budget) return fail(req, 400, 'tooLong');

  const db = service();
  const isRiku = !!(await adminId(req, db));

  // 2. captcha et 3. limite de fréquence (pas pour RIKU)
  let hash = null;
  if (!isRiku) {
    if (!(await verifyCaptcha(req, form.get('captcha')))) return fail(req, 403, 'captcha');
    hash = await ipHash(req);
    const since = h => new Date(Date.now() - h * 3600e3).toISOString();
    const count = async h => (await db.from('posts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', hash).gte('created_at', since(h))).count ?? 0;
    if ((await count(1)) >= PER_HOUR || (await count(24)) >= PER_DAY) return fail(req, 429, 'rate');
  }

  // 4. fichiers : bucket privé « pending » (ou « published » pour RIKU)
  const id = crypto.randomUUID();
  const bucket = isRiku ? 'published' : 'pending';
  let image_path = null, thumb_path = null;
  if (hasImage) {
    image_path = `${id}.${EXT[full.type]}`;
    thumb_path = `${id}-thumb.${EXT[thumb.type]}`;
    for (const [path, f] of [[image_path, full], [thumb_path, thumb]]) {
      const { error } = await db.storage.from(bucket).upload(path, f.bytes, { contentType: f.type, upsert: false });
      if (error) return fail(req, 500, 'storage');
    }
  }

  // 5. enregistrement
  const { error } = await db.from('posts').insert({
    id, kind: hasImage ? 'image' : 'text', text, name: isRiku ? '' : name, lang,
    image_path, thumb_path, width: full?.width ?? null, height: full?.height ?? null,
    is_riku: isRiku, status: isRiku ? 'approved' : 'pending', approved_at: isRiku ? new Date().toISOString() : null,
    ip_hash: hash,
  });
  if (error) {
    if (hasImage) await db.storage.from(bucket).remove([image_path, thumb_path]);
    return fail(req, 500, 'db');
  }

  // 6. alerte e-mail à RIKU (pas pour ses propres dépôts)
  if (!isRiku) {
    await notify('Mood — nouveau dépôt à valider',
      `${hasImage ? `Image ${full.width} × ${full.height} px` : 'Texte'}${name ? ` de « ${name} »` : ''}.\n\n` +
      `${text ? `« ${text.slice(0, 300)} »\n\n` : ''}Valider ou refuser : ${SITE_URL}admin/`);
  }
  return json(req, 201, { ok: true, status: isRiku ? 'approved' : 'pending' });
});

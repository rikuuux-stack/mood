/**
 * POST /functions/v1/submit — reçoit un dépôt (multipart/form-data).
 *
 * Champs : text, name, lang, size (s / m / l), consent=1, captcha (jeton Turnstile), et au choix :
 *   - image (grande, grain déjà appliqué par le navigateur) + thumb (miniature) ;
 *   - video (MP4 H.264 ≤ 720p, muet, ≤ 10 s) + loop (version légère 360p pour le mur) + poster (image
 *     fixe) + grain (0–100, appliqué à l'affichage). La vidéo est lue de l'intérieur (_shared/mp4.js) :
 *     format réel, piste son, coordonnées GPS, taille, durée. Limites propres : 1 vidéo par heure et
 *     3 par jour par visiteur ; refus quand le stockage dépasse 800 Mo (offre gratuite : 1 Go).
 * Ordre des contrôles : d'abord ce qui ne coûte rien (formats, tailles, budget), puis le captcha,
 * puis la limite de fréquence. Rien n'est visible publiquement : le dépôt part en « pending »,
 * fichiers dans le bucket privé. Exception : si l'appelant est l'administrateur (connecté), son dépôt est publié
 * directement avec sa marque, sans captcha ni limite.
 */
import { cors, json, fail, service, ipHash, verifyCaptcha, caller, notify, SITE_URL, CACHE } from '../_shared/http.js';
import { sniffType, dimensions, hasMetadata, looksLikeLink } from '../_shared/image.js';
import { textBudget, textLength } from '../_shared/budget.js';
import { inspectMp4, checkVideo } from '../_shared/mp4.js';

const MAX_BYTES = 5 * 1024 * 1024, MAX_THUMB = 1024 * 1024, MAX_SIDE = 2000, THUMB_SIDE = 800;
const PER_HOUR = 3, PER_DAY = 10;
const VIDEO_MAX = 3 * 1024 * 1024, LOOP_MAX = 1024 * 1024, VIDEO_PER_HOUR = 1, VIDEO_PER_DAY = 3;
const STORAGE_CAP = 800 * 1024 * 1024;
const FULL = { maxSide: 1280, maxShort: 720, maxDuration: 10.5 }, LOOP = { maxSide: 640, maxShort: 360, maxDuration: 10.5 };
const SIZES = ['s', 'm', 'l'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Un fichier reçu : File ou Blob selon l'environnement (on ne se fie pas à instanceof File).
const isFile = v => v != null && typeof v === 'object' && typeof v.arrayBuffer === 'function';

async function readVideo(file, maxBytes, limits) {
  if (!isFile(file) || !file.size) return { error: 'video' };
  if (file.size > maxBytes) return { error: 'tooBig' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectMp4(bytes);
  const error = checkVideo(info, limits);
  return error ? { error, info } : { bytes, type: 'video/mp4', ...info };
}

async function readImage(file, maxBytes, maxSide) {
  if (!isFile(file) || !file.size) return { error: 'type' };
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
  const size = form.get('size') ?? 'm';                  // taille d'affichage S / M / L (M si absente)
  const imageFile = form.get('image'), thumbFile = form.get('thumb');
  const hasImage = form.has('image'), hasVideo = form.has('video');
  if (hasImage && hasVideo) return fail(req, 400, 'bad');
  const grain = hasVideo ? Number(form.get('grain') ?? 0) : 0;
  // Une image annoncée mais illisible ou vide est REFUSÉE (jamais ignorée en silence : ce serait
  // publier un texte seul alors que la personne pensait envoyer une photo).
  if (hasImage && (!isFile(imageFile) || !imageFile.size)) {
    console.warn('[submit] champ « image » vide ou illisible :', typeof imageFile, imageFile?.constructor?.name, imageFile?.size);
    return fail(req, 415, 'type');
  }

  // 1. contrôles gratuits
  if (form.get('consent') !== '1') return fail(req, 400, 'rights');
  if (textLength(name) > 40 || looksLikeLink(name)) return fail(req, 400, 'name');
  if (!SIZES.includes(size)) return fail(req, 400, 'display');
  let full = null, thumb = null, loop = null;
  if (hasVideo) {
    if (!Number.isInteger(grain) || grain < 0 || grain > 100) return fail(req, 400, 'grain');
    full = await readVideo(form.get('video'), VIDEO_MAX, FULL);
    if (full.error) { console.warn('[submit] vidéo refusée :', full.error, JSON.stringify(full.info || {})); return fail(req, full.error === 'tooBig' ? 413 : 415, full.error); }
    loop = await readVideo(form.get('loop'), LOOP_MAX, LOOP);
    if (loop.error) { console.warn('[submit] vidéo du mur refusée :', loop.error); return fail(req, 415, 'loop'); }
    thumb = await readImage(form.get('poster'), MAX_THUMB, FULL.maxSide);
    if (thumb.error) { console.warn('[submit] image fixe refusée :', thumb.error); return fail(req, 415, 'thumb'); }
  } else if (hasImage) {
    full = await readImage(imageFile, MAX_BYTES, MAX_SIDE);
    if (full.error) { console.warn('[submit] image refusée :', full.error); return fail(req, full.error === 'tooBig' ? 413 : 415, full.error); }
    thumb = await readImage(thumbFile, MAX_THUMB, THUMB_SIDE);
    if (thumb.error) { console.warn('[submit] miniature refusée :', thumb.error); return fail(req, 415, 'thumb'); }
  } else if (!text) {
    return fail(req, 400, 'empty');
  }
  const budget = full ? textBudget(full.width, full.height) : textBudget();
  if (textLength(text) > budget) return fail(req, 400, 'tooLong');

  const db = service();
  const who = await caller(req, db);
  if (who.status === 'error') return fail(req, 500, 'server');
  const isRiku = who.status === 'admin';

  // 2. captcha et 3. limite de fréquence (pas pour l'administrateur)
  let hash = null;
  if (!isRiku) {
    if (!(await verifyCaptcha(req, form.get('captcha')))) return fail(req, 403, 'captcha');
    hash = await ipHash(req);
    const since = h => new Date(Date.now() - h * 3600e3).toISOString();
    const count = async h => (await db.from('posts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', hash).gte('created_at', since(h))).count ?? 0;
    if ((await count(1)) >= PER_HOUR || (await count(24)) >= PER_DAY) return fail(req, 429, 'rate');
    if (hasVideo) {
      const videos = async h => (await db.from('posts').select('id', { count: 'exact', head: true })
        .eq('ip_hash', hash).eq('kind', 'video').gte('created_at', since(h))).count ?? 0;
      if ((await videos(1)) >= VIDEO_PER_HOUR || (await videos(24)) >= VIDEO_PER_DAY) return fail(req, 429, 'rate');
    }
  }
  // plafond de stockage (offre gratuite : 1 Go) : au-delà de 800 Mo, plus de nouvelles vidéos
  if (hasVideo) {
    const { data: used, error } = await db.rpc('storage_used');
    if (error) { console.error('[submit] stockage utilisé illisible :', error.message); return fail(req, 500, 'server'); }
    if (Number(used) + full.bytes.length + loop.bytes.length + thumb.bytes.length > STORAGE_CAP) return fail(req, 507, 'full');
  }

  // 4. fichiers : bucket privé « pending » (ou « published » pour l'administrateur)
  const id = crypto.randomUUID();
  const kind = hasVideo ? 'video' : hasImage ? 'image' : 'text';
  const bucket = isRiku ? 'published' : 'pending';
  let image_path = null, thumb_path = null, loop_path = null;
  const files = [];
  if (hasVideo) {
    image_path = `${id}.mp4`; loop_path = `${id}-loop.mp4`; thumb_path = `${id}-poster.${EXT[thumb.type]}`;
    files.push([image_path, full], [loop_path, loop], [thumb_path, thumb]);
  } else if (hasImage) {
    image_path = `${id}.${EXT[full.type]}`;
    thumb_path = `${id}-thumb.${EXT[thumb.type]}`;
    files.push([image_path, full], [thumb_path, thumb]);
  }
  for (const [path, f] of files) {
    const { error } = await db.storage.from(bucket).upload(path, f.bytes, { contentType: f.type, upsert: false, cacheControl: CACHE });
    if (error) { console.error('[submit] stockage impossible :', error.message); return fail(req, 500, 'storage'); }
  }

  // 5. enregistrement
  const { error } = await db.from('posts').insert({
    id, kind, text, name: isRiku ? '' : name, lang, size,
    image_path, thumb_path, loop_path, width: full?.width ?? null, height: full?.height ?? null,
    duration: hasVideo ? full.duration : null, grain,
    is_riku: isRiku, status: isRiku ? 'approved' : 'pending', approved_at: isRiku ? new Date().toISOString() : null,
    ip_hash: hash,
  });
  if (error) {
    console.error('[submit] enregistrement impossible :', error.code, error.message);
    if (files.length) await db.storage.from(bucket).remove(files.map(f => f[0]));
    return fail(req, 500, 'db');
  }

  // 6. alerte e-mail à l'administrateur (pas pour ses propres dépôts)
  if (!isRiku) {
    await notify('Mood — nouveau dépôt à valider',
      `${hasVideo ? `Vidéo ${full.width} × ${full.height} px, ${full.duration.toFixed(1)} s` : hasImage ? `Image ${full.width} × ${full.height} px` : 'Texte'}${name ? ` de « ${name} »` : ''}.\n\n` +
      `${text ? `« ${text.slice(0, 300)} »\n\n` : ''}Valider ou refuser : ${SITE_URL}admin/`);
  }
  return json(req, 201, { ok: true, status: isRiku ? 'approved' : 'pending', kind });
});

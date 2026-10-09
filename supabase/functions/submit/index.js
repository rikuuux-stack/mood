/**
 * POST /functions/v1/submit — reçoit un dépôt (multipart/form-data).
 *
 * Champs : text, name, lang, size (s / m / l), consent=1, captcha (jeton Turnstile), et au choix :
 *   - image (grande) + thumb (miniature) ;
 *   - video (MP4 H.264, converti dans le navigateur : 480 px de grand côté, muet, noir et blanc, ≤ 60 s,
 *     ≤ 4 Mo) + poster (image fixe, affichée sur le mur). La vidéo est lue de l'intérieur (_shared/mp4.js) :
 *     format réel, piste son, coordonnées GPS, dimensions, durée. Un GIF arrive déjà converti en vidéo.
 *     Refus « full » quand le stockage dépasserait 900 Mo (offre gratuite : 1 Go).
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
const VIDEO_MAX = 4 * 1024 * 1024, POSTER_SIDE = 800, STORAGE_CAP = 900 * 1024 * 1024;
const VIDEO = { maxSide: 480, maxShort: 480, maxDuration: 60.5 };
const SIZES = ['s', 'm', 'l'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Un fichier reçu : File ou Blob selon l'environnement (on ne se fie pas à instanceof File).
const isFile = v => v != null && typeof v === 'object' && typeof v.arrayBuffer === 'function';

async function readVideo(file) {
  if (!isFile(file) || !file.size) return { error: 'video' };
  if (file.size > VIDEO_MAX) return { error: 'tooBig' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectMp4(bytes);                       // le type réel, lu dans le fichier (pas l'extension)
  const error = checkVideo(info, VIDEO);
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
  let full = null, thumb = null;
  if (hasVideo) {
    full = await readVideo(form.get('video'));
    if (full.error) { console.warn('[submit] vidéo refusée :', full.error, JSON.stringify(full.info || {})); return fail(req, full.error === 'tooBig' ? 413 : 415, full.error); }
    thumb = await readImage(form.get('poster'), MAX_THUMB, POSTER_SIDE);
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
  const isAuthor = who.status === 'admin';

  // 2. captcha et 3. limite de fréquence (pas pour l'administrateur)
  let hash = null;
  if (!isAuthor) {
    if (!(await verifyCaptcha(req, form.get('captcha')))) return fail(req, 403, 'captcha');
    hash = await ipHash(req);
    const since = h => new Date(Date.now() - h * 3600e3).toISOString();
    const count = async h => (await db.from('posts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', hash).gte('created_at', since(h))).count ?? 0;
    if ((await count(1)) >= PER_HOUR || (await count(24)) >= PER_DAY) return fail(req, 429, 'rate');
  }

  // plafond de stockage (offre gratuite : 1 Go) : au-delà de 900 Mo, plus de nouvelles vidéos
  if (hasVideo) {
    const { data: used, error } = await db.rpc('storage_used');
    if (error) { console.error('[submit] stockage utilisé illisible :', error.message); return fail(req, 500, 'server'); }
    if (Number(used) + full.bytes.length + thumb.bytes.length > STORAGE_CAP) return fail(req, 507, 'full');
  }

  // 4. fichiers : bucket privé « pending » (ou « published » pour l'administrateur)
  const id = crypto.randomUUID();
  const kind = hasVideo ? 'video' : hasImage ? 'image' : 'text';
  const bucket = isAuthor ? 'published' : 'pending';
  let image_path = null, thumb_path = null;
  if (full) {
    image_path = `${id}.${hasVideo ? 'mp4' : EXT[full.type]}`;
    thumb_path = `${id}-${hasVideo ? 'poster' : 'thumb'}.${EXT[thumb.type]}`;
    for (const [path, f] of [[image_path, full], [thumb_path, thumb]]) {
      const { error } = await db.storage.from(bucket).upload(path, f.bytes, { contentType: f.type, upsert: false, cacheControl: CACHE });
      if (error) { console.error('[submit] stockage impossible :', error.message); return fail(req, 500, 'storage'); }
    }
  }

  // 5. enregistrement, avec la consigne du mois en vigueur (strates du mur)
  const { data: current } = await db.from('prompt').select('text').eq('id', 1).maybeSingle();
  const { error } = await db.from('posts').insert({
    id, kind, text, name: isAuthor ? '' : name, lang, size, prompt: current?.text || '',
    image_path, thumb_path, width: full?.width ?? null, height: full?.height ?? null,
    duration: hasVideo ? full.duration : null,
    is_author: isAuthor, status: isAuthor ? 'approved' : 'pending', approved_at: isAuthor ? new Date().toISOString() : null,
    ip_hash: hash,
  });
  if (error) {
    console.error('[submit] enregistrement impossible :', error.code, error.message);
    if (full) await db.storage.from(bucket).remove([image_path, thumb_path]);
    return fail(req, 500, 'db');
  }

  // 6. alerte e-mail à l'administrateur (pas pour ses propres dépôts)
  if (!isAuthor) {
    await notify('Mood — nouveau dépôt à valider',
      `${hasVideo ? `Vidéo ${full.width} × ${full.height} px, ${full.duration.toFixed(1)} s, ${(full.bytes.length / 1048576).toFixed(2)} Mo` : hasImage ? `Image ${full.width} × ${full.height} px` : 'Texte'}${name ? ` de « ${name} »` : ''}.\n\n` +
      `${text ? `« ${text.slice(0, 300)} »\n\n` : ''}Valider ou refuser : ${SITE_URL}admin/`);
  }
  // id : le navigateur du visiteur garde une copie « en attente » de son dépôt, qu'il retire dès qu'il est validé
  return json(req, 201, { ok: true, id, status: isAuthor ? 'approved' : 'pending', kind });
});

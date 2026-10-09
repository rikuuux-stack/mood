/**
 * Vidéos déposées : préparation ENTIÈREMENT dans le navigateur, avant l'envoi.
 *
 *   1. ouverture : .mov (HEVC de l'iPhone) ou .mp4, lus par le navigateur lui-même ;
 *   2. extrait de 10 s au plus (curseur « Start » si la vidéo est plus longue) ;
 *   3. réencodage en temps réel (≈ 10 s pour 10 s) : chaque image est redessinée dans un canvas puis
 *      enregistrée en MP4 H.264, muet — deux versions : 720p (agrandissement) et 360p (mur) ;
 *      un canvas ne recopie ni le son, ni les métadonnées (GPS, appareil) ;
 *   4. image fixe (poster) tirée de la première image ;
 *   5. contrôle du résultat avec le même lecteur que le serveur (js/mp4.js) : si le navigateur n'a
 *      pas produit du H.264 (Firefox, certains Chromium), on refuse avec un message clair.
 * Le grain n'est PAS incrusté : il est appliqué à l'affichage (js/grain.js).
 */
import { ImageError, encode, hasMetadata } from './image.js?v=ae95eb3c3c';
import { inspectMp4, checkVideo } from './mp4.js?v=53a1dd24ca';

export const VIDEO = {
  maxInput: 300 * 1024 * 1024,                       // fichier choisi (avant réencodage)
  maxDuration: 10,
  full: { side: 1280, short: 720, bitrate: 1_200_000, maxBytes: 3 * 1024 * 1024 },
  loop: { side: 640, short: 360, bitrate: 350_000, maxBytes: 1024 * 1024 },
  posterSide: 800,
};
const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1.4D401E', 'video/mp4;codecs=avc1', 'video/mp4;codecs=avc3', 'video/mp4'];

export const isVideoFile = f => /^video\//.test(f.type) || /\.(mov|mp4|m4v)$/i.test(f.name || '');

/** Type d'enregistrement MP4 possible ici, ou null (Firefox : pas de MP4). */
export function recorderMime() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  return MIMES.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || null;
}

const even = n => Math.max(2, Math.round(n / 2) * 2);
function fit(w, h, side, short) {
  const s = Math.min(1, side / Math.max(w, h), short / Math.min(w, h));
  return [even(w * s), even(h * s)];
}
const once = (el, ok, bad, ms = 20000) => new Promise((res, rej) => {
  const t = setTimeout(() => { done(); rej(new ImageError('eVideoDecode')); }, ms);
  const y = () => { done(); res(); }, n = () => { done(); rej(new ImageError('eVideoDecode')); };
  const done = () => { clearTimeout(t); el.removeEventListener(ok, y); if (bad) el.removeEventListener(bad, n); };
  el.addEventListener(ok, y); if (bad) el.addEventListener(bad, n);
});

/**
 * Ce navigateur enregistre-t-il vraiment du H.264 ? Certains annoncent « video/mp4 » mais y mettent
 * un autre format (Chromium sans codecs propriétaires). Essai de 0,4 s, une seule fois par visite :
 * le visiteur est prévenu dès le choix du fichier, pas après 10 s d'enregistrement.
 */
let probe = null;
export function canRecordH264() {
  return probe ||= (async () => {
    const mime = recorderMime();
    if (!mime) return false;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime }), parts = [];
      rec.ondataavailable = e => { if (e.data?.size) parts.push(e.data); };
      const done = new Promise(r => { rec.onstop = r; });
      rec.start();
      for (let i = 0; i < 12; i++) { g.fillStyle = `rgb(${i * 20},0,0)`; g.fillRect(0, 0, 64, 64); await new Promise(r => setTimeout(r, 33)); }
      rec.stop(); await done; stream.getTracks().forEach(t => t.stop());
      const info = inspectMp4(new Uint8Array(await new Blob(parts).arrayBuffer()));
      return info?.codec === 'avc1' || info?.codec === 'avc3';
    } catch { return false; }
  })();
}

/** 1. Ouverture → { el, url, width, height (taille publiée 720p), duration (de la source) }. */
export async function openVideo(file) {
  if (!(await canRecordH264())) throw new ImageError('eVideoUnsupported');
  if (file.size > VIDEO.maxInput) throw new ImageError('eVideoTooBig');
  const el = document.createElement('video');
  el.muted = true; el.playsInline = true; el.preload = 'auto';
  el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
  const url = URL.createObjectURL(file);
  el.src = url;
  try { await once(el, 'loadeddata', 'error'); }          // une image décodée : le navigateur sait lire ce format
  catch (e) { URL.revokeObjectURL(url); throw e; }
  if (!el.videoWidth || !el.videoHeight || !(el.duration > 0)) { URL.revokeObjectURL(url); throw new ImageError('eVideoDecode'); }
  const [width, height] = fit(el.videoWidth, el.videoHeight, VIDEO.full.side, VIDEO.full.short);
  return { el, url, width, height, duration: el.duration };
}

export const clipLength = (src, start = 0) => Math.min(VIDEO.maxDuration, src.duration - start);

/**
 * 3. Réencodage de l'extrait [start, start + 10 s] → { full, loop, poster, width, height, duration }.
 * onProgress(0…1) pendant l'enregistrement (temps réel).
 */
export async function renderVideo(src, { start = 0, onProgress } = {}) {
  const mime = recorderMime();
  if (!mime) throw new ImageError('eVideoUnsupported');
  const v = src.el, len = clipLength(src, start);
  const [fw, fh] = [src.width, src.height];
  const [lw, lh] = fit(v.videoWidth, v.videoHeight, VIDEO.loop.side, VIDEO.loop.short);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const [fc, fg] = mk(fw, fh), [lc, lg] = mk(lw, lh);
  const draw = () => { fg.drawImage(v, 0, 0, fw, fh); lg.drawImage(v, 0, 0, lw, lh); };

  v.pause(); v.loop = false; v.currentTime = start;
  await once(v, 'seeked');
  draw();
  // image fixe (poster) : la première image, métadonnées retirées
  const [pw, ph] = fit(fw, fh, VIDEO.posterSide, VIDEO.posterSide);
  const [pc, pg] = mk(pw, ph); pg.drawImage(fc, 0, 0, pw, ph);
  const poster = await encode(pc);

  const record = (c, bitrate) => {
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    const parts = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(parts, { type: 'video/mp4' })); }; });
    rec.start();
    return { rec, done };
  };
  const a = record(fc, VIDEO.full.bitrate), b = record(lc, VIDEO.loop.bitrate);
  // la dernière image d'une vidéo arrive un peu avant sa durée annoncée : tolérance de 0,15 s
  const end = Math.min(start + len, v.duration - 0.15);
  await v.play().catch(() => { throw new ImageError('eVideoDecode'); });
  // un minuteur (≈ 30 images/s) plutôt que le rythme d'affichage : l'enregistrement continue même si
  // l'aperçu n'est pas à l'écran ; si la lecture n'avance plus pendant 4 s, on abandonne avec un message
  await new Promise((res, rej) => {
    let lastT = -1, still = 0;
    const tick = () => {
      draw();
      onProgress?.(Math.min(1, (v.currentTime - start) / len));
      if (v.currentTime >= end || v.ended) return res();
      still = v.currentTime === lastT ? still + 1 : 0; lastT = v.currentTime;
      if (still > 120) return rej(new ImageError('eVideoDecode'));
      setTimeout(tick, 33);
    };
    tick();
  }).catch(e => { a.rec.stop(); b.rec.stop(); v.pause(); throw e; });
  v.pause();
  a.rec.stop(); b.rec.stop();
  const [full, loop] = await Promise.all([a.done, b.done]);
  fc.width = fc.height = lc.width = lc.height = 0;          // libère la mémoire (iOS)

  // 5. contrôle : vraiment du H.264, muet, sans GPS, à la bonne taille et durée
  const check = async (blob, lim) => {
    const info = inspectMp4(new Uint8Array(await blob.arrayBuffer()));
    if (!info || (info.codec !== 'avc1' && info.codec !== 'avc3')) throw new ImageError('eVideoUnsupported');
    if (checkVideo(info, { maxSide: lim.side, maxShort: lim.short, maxDuration: VIDEO.maxDuration + 0.5 })) throw new ImageError('eVideoDecode');
    if (blob.size > lim.maxBytes) throw new ImageError('eVideoTooBig');
    return info;
  };
  const info = await check(full, VIDEO.full);
  await check(loop, VIDEO.loop);
  if (await hasMetadata(poster)) throw new ImageError('eMeta');
  return { full, loop, poster, width: info.width, height: info.height, duration: info.duration };
}

/** Aperçu : la vidéo choisie joue en boucle sur l'extrait [start, start + 10 s]. */
export function previewLoop(src, getStart) {
  const v = src.el;
  v.loop = false; v.muted = true;
  const onTime = () => { const s = getStart(); if (v.currentTime >= s + clipLength(src, s) - 0.05 || v.currentTime < s - 0.3) v.currentTime = s; };
  const onEnd = () => { v.currentTime = getStart(); v.play().catch(() => {}); };
  v.addEventListener('timeupdate', onTime);
  v.addEventListener('ended', onEnd);
  v.currentTime = getStart();
  v.play().catch(() => {});
  return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('ended', onEnd); };
}

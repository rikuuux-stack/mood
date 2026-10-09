/**
 * Vidéos et GIF : préparation AVANT l'envoi, entièrement sur l'appareil du visiteur.
 *
 * Résultat, quelle que soit la source (vidéo de la galerie ou de la caméra, GIF perso) :
 *   - un MP4 H.264 de 480 px de grand côté, 24 images/s au plus, ≈ 300 kb/s (≈ 2,2 Mo pour 60 s) ;
 *   - noir et blanc ET courbe de tons du site intégrés dans le fichier (aucun filtre à la lecture) ;
 *   - sans son, sans aucune métadonnée (GPS, date, appareil) : chaque image est redessinée ;
 *   - 60 s au plus, à partir du point choisi avec le curseur « Start » ;
 *   - une image fixe (poster) prise au point de départ, 800 px, sans métadonnées, traitée à l'affichage
 *     exactement comme une photo (noir et blanc, érosion, grain du site).
 *
 * Trois chemins, du plus rapide au plus lent (choisis automatiquement) :
 *   A. décodage + encodage par WebCodecs (Mediabunny), débit constant : plus rapide que la lecture ;
 *   B. si la vidéo ne se décode pas ainsi (certaines HEVC / HDR d'iPhone) : lecture dans une balise
 *      <video>, chaque image redessinée et encodée par WebCodecs → aussi long que la vidéo ;
 *   C. si WebCodecs n'encode pas le H.264 (iOS < 16.4) : même lecture, enregistrée par MediaRecorder
 *      en MP4 (Safari). Sinon : refus clair (eVideoBrowser).
 * GIF : décodé image par image par omggif (Safari ne sait pas le faire seul), puis encodé comme en A ou C.
 *
 * js/vendor/mediabunny.js et js/vendor/omggif.js ne sont chargés qu'au choix d'une vidéo ou d'un GIF.
 */
import { TONE } from './wall.js?v=8906cf420f';
import { inspectMp4, checkVideo } from './mp4.js?v=53a1dd24ca';

export const VIDEO = { side: 480, fps: 24, bitrate: 300_000, maxDuration: 60, maxBytes: 4 * 1024 * 1024, posterSide: 800 };
export class VideoError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}
const lib = () => import('./vendor/mediabunny.js?v=d7b3a90e82');
export const isGif = file => file.type === 'image/gif' || /\.gif$/i.test(file.name || '');
export const isVideo = file => file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name || '');

/* ------------------------------------------------------------------ noir et blanc + courbe de tons
 * Même courbe que les photos à l'écran (TONE, js/wall.js) : gris (luminance), puis 0→0, 25→24, … 100→76 %. */
const LUT = new Uint8ClampedArray(256);
for (let v = 0; v < 256; v++) {
  const p = Math.min(3.999, (v / 255) * 4), i = p | 0;
  LUT[v] = Math.round((TONE[i] + (TONE[i + 1] - TONE[i]) * (p - i)) * 255);
}
function toneCanvas(g, w, h) {
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let o = 0; o < d.length; o += 4) {
    const v = LUT[(54 * d[o] + 183 * d[o + 1] + 19 * d[o + 2]) >> 8];   // ≈ 0,2126 R + 0,7152 V + 0,0722 B
    d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}

const even = n => Math.max(2, Math.round(n / 2) * 2);                   // le H.264 veut des dimensions paires
export function outSize(w, h) {
  const s = Math.min(1, VIDEO.side / Math.max(w, h));
  return [even(w * s), even(h * s)];
}
const posterSize = (w, h) => { const s = Math.min(1, VIDEO.posterSide / Math.max(w, h)); return [Math.round(w * s), Math.round(h * s)]; };
const canvas = (w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
};
const jpeg = c => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new VideoError('eVideoUnsupported'))), 'image/jpeg', 0.85));
const aborted = signal => { if (signal?.aborted) throw new VideoError('canceled'); };

/* ------------------------------------------------------------------ encodeur (WebCodecs, sinon MediaRecorder) */
let canAvc = null;
async function webcodecsAvc(w, h) {
  if (canAvc !== null) return canAvc;
  try { const { canEncodeVideo } = await lib(); canAvc = await canEncodeVideo('avc', { width: w, height: h, bitrate: VIDEO.bitrate }); }
  catch { canAvc = false; }
  return canAvc;
}
const recorderType = () => (typeof MediaRecorder !== 'undefined'
  ? ['video/mp4;codecs=avc1', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) : null);

/* Débit CONSTANT si l'encodeur le sait (le poids ne dépend plus du contenu : une vidéo de nuit très
 * granuleuse ne dépasse pas 4 Mo), sinon variable ; et si le fichier dépasse quand même 4 Mo, une seconde
 * passe à débit réduit (retry, chemins A et GIF). */
let cbr = null;
async function constantRate(w, h) {
  if (cbr !== null) return cbr;
  try { cbr = !!(await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: w, height: h, bitrate: VIDEO.bitrate, bitrateMode: 'constant' })).supported; }
  catch { cbr = false; }
  return cbr;
}
const PASSES = [1, 0.5, 1 / 3];                         // part des images gardées : 24, 12 puis 8 i/s
async function retry(run) {
  let bitrate = VIDEO.bitrate, sizes = [];
  for (let pass = 0; pass < PASSES.length; pass++) {
    const blob = await run(bitrate, PASSES[pass]);
    sizes.push(blob.size);
    if (blob.size <= VIDEO.maxBytes) return blob;
    bitrate = Math.max(60_000, Math.floor(bitrate * 0.85 * VIDEO.maxBytes / blob.size));
  }
  throw new VideoError('eTooBig', `passes ${sizes.join(' / ')} octets, débit constant ${cbr}`);
}

/** Encodeur image par image : add(t, durée) encode le canvas tel qu'il est, puis finish() → Blob MP4. */
async function webcodecsEncoder(c, bitrate = VIDEO.bitrate, fps = VIDEO.fps) {
  const MB = await lib();
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
  const src = new MB.CanvasSource(c, { codec: 'avc', bitrate, bitrateMode: (await constantRate(c.width, c.height)) ? 'constant' : 'variable', keyFrameInterval: 2 });
  output.addVideoTrack(src, { frameRate: fps });
  await output.start();
  return {
    realtime: false,
    add: (t, d) => src.add(t, d),
    finish: async () => { await output.finalize(); return new Blob([output.target.buffer], { type: 'video/mp4' }); },
    cancel: () => output.cancel().catch(() => {}),
  };
}
/** Enregistreur en temps réel (iOS anciens) : l'image du canvas est captée telle qu'elle est affichée. */
function recorderEncoder(c, type, bitrate = VIDEO.bitrate) {
  const stream = c.captureStream(VIDEO.fps);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitrate });
  const parts = [];
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  rec.start(1000);
  return {
    realtime: true,
    add: async () => {},                                 // le canvas est filmé en continu
    finish: () => new Promise(res => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(parts, { type: 'video/mp4' })); }; rec.stop(); }),
    cancel: () => { try { rec.stop(); } catch {} stream.getTracks().forEach(t => t.stop()); },
  };
}
async function encoderFor(c, bitrate) {
  if (await webcodecsAvc(c.width, c.height)) return webcodecsEncoder(c, bitrate);
  const type = recorderType();
  if (type && c.captureStream) return recorderEncoder(c, type, bitrate);
  throw new VideoError('eVideoBrowser');
}

/* ------------------------------------------------------------------ ouvrir un fichier
 * open(file) → { kind: 'video' | 'gif', duration, width, height (sortie), defaultStart,
 *                preview(canvasCible, t) → dessine l'image à t, close() }
 */
export async function openMedia(file) {
  return isGif(file) ? openGif(file) : openVideo(file);
}

async function openVideo(file) {
  let MB, input, track = null, decodable = false;
  try {
    MB = await lib();
    input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
    track = await input.getPrimaryVideoTrack();
    decodable = !!track && await track.canDecode();
  } catch { track = null; }
  if (decodable) return openDecodable(MB, input, track, file);
  return openPlayable(file);                             // chemin B / C : lecture par le navigateur
}

/** Chemin A : la vidéo se décode par WebCodecs (rapide). */
async function openDecodable(MB, input, track, file) {
  const turned = track.rotation === 90 || track.rotation === 270;
  const w0 = turned ? track.squarePixelHeight : track.squarePixelWidth, h0 = turned ? track.squarePixelWidth : track.squarePixelHeight;
  const duration = await input.computeDuration();
  const [width, height] = outSize(w0, h0);
  let sink = null;
  return {
    kind: 'video', duration, width, height, file,
    defaultStart: duration > 2 ? 1 : 0,
    async preview(target, t) {
      sink ||= new MB.CanvasSink(track, { width: target.width, height: target.height, fit: 'fill' });
      const fr = await sink.getCanvas(Math.max(0, Math.min(t, duration - 0.05)));
      if (fr) target.getContext('2d').drawImage(fr.canvas, 0, 0, target.width, target.height);
    },
    async convert({ start = 0, onProgress, signal } = {}) {
      const len = Math.min(VIDEO.maxDuration, duration - start);
      // poster : l'image au point de départ, en couleur (traitée à l'affichage comme une photo)
      const [pw, ph] = posterSize(w0, h0);
      const ps = new MB.CanvasSink(track, { width: pw, height: ph, fit: 'fill' });
      const pf = await ps.getCanvas(start);
      if (!pf) throw new VideoError('eVideoUnsupported');
      const pc = canvas(pw, ph); pc.g.drawImage(pf.canvas, 0, 0);
      const poster = await jpeg(pc.c);
      aborted(signal);
      if (!(await webcodecsAvc(width, height))) return playbackConvert(file, { start, len, width, height, poster, onProgress, signal });
      const work = canvas(width, height);
      let fps = VIDEO.fps;
      try { const st = await track.computePacketStats(120); if (st.averagePacketRate > 0) fps = Math.min(VIDEO.fps, Math.round(st.averagePacketRate)); } catch {}
      // chaque image décodée (dans le bon sens), redessinée en noir et blanc + courbe, encodée ; ≤ 24 i/s
      const pass = async (bitrate, keep) => {
        const rate = Math.max(1, Math.round(fps * keep)), step = 1 / rate;
        const enc = await webcodecsEncoder(work.c, bitrate, rate);
        const frames = new MB.CanvasSink(track, { width, height, fit: 'fill', poolSize: 2 });
        let next = 0, n = 0;
        try {
          for await (const { canvas: fc, timestamp } of frames.canvases(start, start + len)) {
            aborted(signal);
            const t = Math.max(0, timestamp - start);
            if (t >= len) break;
            if (t + 1e-3 < next) continue;                        // image en trop (source à 30 ou 60 i/s)
            work.g.drawImage(fc, 0, 0, width, height);
            toneCanvas(work.g, width, height);
            await enc.add(next, step); n++;
            next += step; while (next <= t) next += step;
            onProgress?.(Math.min(1, t / len));
          }
          if (!n) throw new VideoError('decode');
          return await enc.finish();
        } catch (e) {
          enc.cancel();
          if (signal?.aborted) throw new VideoError('canceled');
          throw e instanceof VideoError ? e : new VideoError(n ? 'eVideoUnsupported' : 'decode', e?.message);
        }
      };
      try { return finish(await retry(pass), poster, width, height); }
      catch (e) {                                       // aucune image décodée : on essaie par la lecture (chemin B)
        if (e.code !== 'decode') throw e;
        console.warn('[video] décodage direct impossible :', e.detail || '');
        return playbackConvert(file, { start, len, width, height, poster, onProgress, signal });
      }
    },
    close() {},
  };
}

/* ------------------------------------------------------------------ chemins B / C : lecture par le navigateur */
function loadVideo(url) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.onloadeddata = () => res(v);
    v.onerror = () => rej(new VideoError('eVideoUnsupported'));
    v.src = url;
    v.load();
  });
}
const seek = (v, t) => new Promise(res => {
  if (Math.abs(v.currentTime - t) < 0.01 && v.readyState >= 2) return res();
  v.onseeked = () => { v.onseeked = null; res(); };
  v.currentTime = t;
});

async function openPlayable(file) {
  const url = URL.createObjectURL(file);
  let v;
  try { v = await loadVideo(url); } catch (e) { URL.revokeObjectURL(url); throw e; }
  if (!v.videoWidth || !Number.isFinite(v.duration)) { URL.revokeObjectURL(url); throw new VideoError('eVideoUnsupported'); }
  const duration = v.duration, [width, height] = outSize(v.videoWidth, v.videoHeight);
  return {
    kind: 'video', duration, width, height, file,
    defaultStart: duration > 2 ? 1 : 0,
    async preview(target, t) { await seek(v, Math.max(0, Math.min(t, duration - 0.05))); target.getContext('2d').drawImage(v, 0, 0, target.width, target.height); },
    async convert({ start = 0, onProgress, signal } = {}) {
      const len = Math.min(VIDEO.maxDuration, duration - start);
      await seek(v, start);
      const [pw, ph] = posterSize(v.videoWidth, v.videoHeight);
      const pc = canvas(pw, ph); pc.g.drawImage(v, 0, 0, pw, ph);
      const poster = await jpeg(pc.c);
      return playbackConvert(file, { start, len, width, height, poster, onProgress, signal, video: v });
    },
    close() { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); },
  };
}

/** Lecture de la vidéo, chaque image redessinée (noir et blanc + courbe) et encodée. Dure autant que l'extrait. */
async function playbackConvert(file, { start, len, width, height, poster, onProgress, signal, video }) {
  let url = null, v = video;
  if (!v) { url = URL.createObjectURL(file); v = await loadVideo(url); }
  const work = canvas(width, height);
  const enc = await encoderFor(work.c);
  try {
    await seek(v, start);
    const step = 1 / VIDEO.fps;
    let next = 0, queue = Promise.resolve(), frames = 0, stalled = 0, last = -1;
    const grab = t => {                                 // t : temps dans l'extrait
      work.g.drawImage(v, 0, 0, width, height);
      toneCanvas(work.g, width, height);
      frames++;
      if (!enc.realtime) queue = queue.then(() => enc.add(t, step));
    };
    await v.play();
    await new Promise((res, rej) => {
      const onAbort = () => rej(new VideoError('canceled'));
      signal?.addEventListener('abort', onAbort, { once: true });
      const tick = () => {
        if (signal?.aborted) return;
        const t = v.currentTime - start;
        if (t !== last) { last = t; stalled = 0; } else if (++stalled > 120) return rej(new VideoError('eVideoUnsupported'));   // ≈ 4 s sans image
        if (t >= next) { grab(next); next += step; while (next <= t) next += step; }
        onProgress?.(Math.min(1, t / len));
        if (t >= len || v.ended) return res();
        setTimeout(tick, 1000 / 30 / 2);                // ≈ 60 fois par seconde : aucune image manquée à 24 i/s
      };
      tick();
    });
    v.pause();
    await queue;
    if (!frames) throw new VideoError('eVideoUnsupported');
    return finish(await enc.finish(), poster, width, height);
  } catch (e) {
    v.pause(); enc.cancel();
    throw e instanceof VideoError ? e : new VideoError('eVideoUnsupported', e?.message);
  } finally {
    if (url) { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
  }
}

/* ------------------------------------------------------------------ GIF perso (omggif) */
async function openGif(file) {
  let reader;
  try {
    const { GifReader } = await import('./vendor/omggif.js?v=1b434b840c');
    reader = new GifReader(new Uint8Array(await file.arrayBuffer()));
  } catch { throw new VideoError('eGif'); }
  const W = reader.width, H = reader.height, n = reader.numFrames();
  if (!n || !W || !H) throw new VideoError('eGif');
  const delays = Array.from({ length: n }, (_, i) => { const d = reader.frameInfo(i).delay / 100; return d < 0.02 ? 0.1 : d; });   // comme les navigateurs
  const total = delays.reduce((a, b) => a + b, 0);
  const [width, height] = outSize(W, H);
  // images complètes, une à la fois (gestion de la « disposition » de chaque image)
  function* frames() {
    const px = new Uint8ClampedArray(W * H * 4);
    let saved = null;
    for (let i = 0; i < n; i++) {
      const f = reader.frameInfo(i);
      if (f.disposal === 3) saved = px.slice();
      reader.decodeAndBlitFrameRGBA(i, px);
      yield { i, px };
      if (f.disposal === 2) for (let y = f.y; y < f.y + f.height; y++) px.fill(0, (y * W + f.x) * 4, (y * W + f.x + f.width) * 4);
      else if (f.disposal === 3 && saved) px.set(saved);
    }
  }
  const full = canvas(W, H);
  const paint = px => { full.g.putImageData(new ImageData(px, W, H), 0, 0); };
  return {
    kind: 'gif', frames: n, duration: Math.min(total, VIDEO.maxDuration), width, height, file, defaultStart: 0,
    async preview(target) { const { value } = frames().next(); paint(value.px); target.getContext('2d').drawImage(full.c, 0, 0, target.width, target.height); },
    async convert({ onProgress, signal } = {}) {
      const [pw, ph] = posterSize(W, H);
      const pc = canvas(pw, ph);
      pc.g.fillStyle = '#0b0b0b'; pc.g.fillRect(0, 0, pw, ph);
      const work = canvas(width, height);
      let poster = null;
      const pass = async bitrate => {
        const enc = await encoderFor(work.c, bitrate);
        let t = 0;
        try {
          for (const { i, px } of frames()) {
            aborted(signal);
            if (t >= VIDEO.maxDuration) break;
            paint(px);
            if (i === 0 && !poster) { pc.g.drawImage(full.c, 0, 0, pw, ph); poster = await jpeg(pc.c); }   // poster : la première image
            const d = Math.min(delays[i], VIDEO.maxDuration - t);
            work.g.fillStyle = '#0b0b0b'; work.g.fillRect(0, 0, width, height);   // transparence → fond du site
            work.g.drawImage(full.c, 0, 0, width, height);
            toneCanvas(work.g, width, height);
            if (enc.realtime) await new Promise(r => setTimeout(r, d * 1000)); else await enc.add(t, d);
            t += d;
            onProgress?.(t / Math.min(total, VIDEO.maxDuration));
          }
          return await enc.finish();
        } catch (e) {
          enc.cancel();
          throw e instanceof VideoError ? e : new VideoError('eGif', e?.message);
        }
      };
      return finish(await retry(pass), poster, width, height);
    },
    close() {},
  };
}

/* ------------------------------------------------------------------ contrôle du résultat (comme le serveur) */
async function finish(blob, poster, width, height) {
  if (blob.size > VIDEO.maxBytes) throw new VideoError('eTooBig');
  const info = inspectMp4(new Uint8Array(await blob.arrayBuffer()));
  const err = checkVideo(info, { maxSide: VIDEO.side, maxShort: VIDEO.side, maxDuration: VIDEO.maxDuration + 0.5 });
  if (err) throw new VideoError('eVideoUnsupported', `${err} ${JSON.stringify(info)}`);
  return { video: blob, poster, width, height, duration: info.duration, bytes: blob.size };
}

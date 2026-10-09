/**
 * Lecture de l'intérieur d'un fichier MP4 / MOV — sans rien décoder, et sans faire confiance à ce
 * que le navigateur annonce. Sert au serveur (contrôle des vidéos déposées) ET au navigateur (contrôle
 * de la vidéo qu'il vient de produire) : js/mp4.js en est une COPIE (tests/server.test.mjs vérifie
 * l'égalité). Module pur, testé dans Node.
 *
 * inspectMp4(bytes) → null (pas un MP4) ou {
 *   brand, codec ('avc1', 'hvc1', 'vp09'…), width, height, duration (s),
 *   hasAudio, hasLocation (coordonnées GPS : ©xyz, loci, ISO6709), tracks
 * }
 * Gère les MP4 « fragmentés » (produits par l'enregistreur des navigateurs), dont la durée n'est
 * écrite que fragment par fragment.
 */
const str = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => u32(b, o) * 4294967296 + u32(b, o + 4);

/** Boîtes contenues entre start et end : [{ type, start (contenu), end }]. */
function boxes(b, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o), head = 8;
    const type = str(b, o + 4, 4);
    if (size === 1) { if (o + 16 > end) break; size = u64(b, o + 8); head = 16; }
    else if (size === 0) size = end - o;
    if (size < head || o + size > end) break;
    out.push({ type, start: o + head, end: o + size });
    o += size;
  }
  return out;
}
const child = (b, box, type) => boxes(b, box.start, box.end).find(x => x.type === type);
const path = (b, box, ...types) => types.reduce((x, t) => x && child(b, x, t), box);

export function inspectMp4(b) {
  if (!(b instanceof Uint8Array) || b.length < 16) return null;
  const top = boxes(b, 0, b.length);
  const ftyp = top.find(x => x.type === 'ftyp');
  const moov = top.find(x => x.type === 'moov');
  if (!ftyp || !moov) return null;
  const info = { brand: str(b, ftyp.start, 4), codec: null, width: 0, height: 0, duration: 0, hasAudio: false, hasLocation: false, tracks: 0 };

  // coordonnées GPS : on ne cherche que dans les métadonnées (moov), jamais dans les images (mdat)
  const meta = b.subarray(moov.start, moov.end);
  const has = s => { const k = [...s].map(c => c.charCodeAt(0)); outer: for (let i = 0; i + k.length <= meta.length; i++) { for (let j = 0; j < k.length; j++) if (meta[i + j] !== k[j]) continue outer; return true; } return false; };
  info.hasLocation = has('©xyz') || has('loci') || has('ISO6709');

  const mvhd = child(b, moov, 'mvhd');
  let movieScale = 0, movieDur = 0;
  if (mvhd) { const v = b[mvhd.start]; movieScale = u32(b, mvhd.start + (v ? 20 : 12)); movieDur = v ? u64(b, mvhd.start + 24) : u32(b, mvhd.start + 16); }
  const defaults = {};                                  // track_ID → durée d'échantillon par défaut (trex)
  const mvex = child(b, moov, 'mvex');
  let fragDur = 0;
  if (mvex) {
    for (const t of boxes(b, mvex.start, mvex.end)) {
      if (t.type === 'trex') defaults[u32(b, t.start + 4)] = u32(b, t.start + 12);
      if (t.type === 'mehd') fragDur = b[t.start] ? u64(b, t.start + 4) : u32(b, t.start + 4);
    }
  }
  let video = null;
  for (const trak of boxes(b, moov.start, moov.end).filter(x => x.type === 'trak')) {
    info.tracks++;
    const tkhd = child(b, trak, 'tkhd'), mdhd = path(b, trak, 'mdia', 'mdhd'), hdlr = path(b, trak, 'mdia', 'hdlr');
    const handler = hdlr ? str(b, hdlr.start + 8, 4) : '';
    if (handler === 'soun') info.hasAudio = true;
    if (handler !== 'vide' || video) continue;
    const v = tkhd ? b[tkhd.start] : 0;
    const id = tkhd ? u32(b, tkhd.start + (v ? 20 : 12)) : 0;
    const wOff = tkhd ? tkhd.start + (v ? 88 : 76) : 0;
    const mv = mdhd ? b[mdhd.start] : 0;
    video = {
      id, width: tkhd ? u16(b, wOff) : 0, height: tkhd ? u16(b, wOff + 4) : 0,
      scale: mdhd ? u32(b, mdhd.start + (mv ? 20 : 12)) : 0,
      dur: mdhd ? (mv ? u64(b, mdhd.start + 24) : u32(b, mdhd.start + 16)) : 0,
    };
    const stsd = path(b, trak, 'mdia', 'minf', 'stbl', 'stsd');
    if (stsd && u32(b, stsd.start + 4) > 0) {
      info.codec = str(b, stsd.start + 12, 4);
      // dimensions codées dans la description de l'échantillon (plus fiables que tkhd)
      const w = u16(b, stsd.start + 8 + 32), h = u16(b, stsd.start + 8 + 34);
      if (w && h) { video.width = w; video.height = h; }
    }
  }
  if (!video) return info;
  info.width = video.width; info.height = video.height;

  // durée : piste vidéo, sinon somme des fragments (moof), sinon film entier
  let dur = video.scale && video.dur ? video.dur / video.scale : 0;
  if (!dur && video.scale) {
    let total = 0;
    for (const moof of top.filter(x => x.type === 'moof')) {
      for (const traf of boxes(b, moof.start, moof.end).filter(x => x.type === 'traf')) {
        const tfhd = child(b, traf, 'tfhd');
        if (!tfhd || u32(b, tfhd.start + 4) !== video.id) continue;
        const f = u32(b, tfhd.start) & 0xffffff;
        let o = tfhd.start + 8, def = defaults[video.id] || 0;
        if (f & 0x01) o += 8; if (f & 0x02) o += 4; if (f & 0x08) def = u32(b, o);
        for (const trun of boxes(b, traf.start, traf.end).filter(x => x.type === 'trun')) {
          const tf = u32(b, trun.start) & 0xffffff, n = u32(b, trun.start + 4);
          let p = trun.start + 8;
          if (tf & 0x01) p += 4; if (tf & 0x04) p += 4;
          const per = ((tf & 0x100) ? 4 : 0) + ((tf & 0x200) ? 4 : 0) + ((tf & 0x400) ? 4 : 0) + ((tf & 0x800) ? 4 : 0);
          if (!(tf & 0x100)) { total += n * def; continue; }
          for (let i = 0; i < n && p + per <= trun.end; i++, p += per) total += u32(b, p);
        }
      }
    }
    dur = total / video.scale;
  }
  if (!dur && movieScale) dur = (movieDur || fragDur) / movieScale;
  info.duration = Math.round(dur * 1000) / 1000;
  return info;
}

/** Contrôle d'une vidéo déposée : '' si tout va bien, sinon le code d'erreur. */
export function checkVideo(info, { maxSide, maxShort, maxDuration }) {
  if (!info) return 'video';
  if (info.codec !== 'avc1' && info.codec !== 'avc3') return 'video';          // H.264 seulement
  if (info.hasAudio) return 'audio';
  if (info.hasLocation) return 'location';
  if (!info.width || !info.height || Math.max(info.width, info.height) > maxSide || Math.min(info.width, info.height) > maxShort) return 'size';
  if (!(info.duration > 0.2) || info.duration > maxDuration) return 'duration';
  return '';
}

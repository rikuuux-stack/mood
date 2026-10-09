/**
 * Quel message afficher pour une erreur, et avec quelle raison (« why ») : sans dépendance, testé par
 * tests/server.test.mjs. Les textes eux-mêmes sont dans js/strings.js (FR / JA / EN).
 */

// codes renvoyés par supabase/functions/submit pour une vidéo → raison affichée (clé why_…)
const VIDEO_SERVER = { video: 'video', type: 'video', meta: 'video', size: 'size', audio: 'audio', location: 'location', duration: 'duration', tooBig: 'tooBig' };
const SERVER = { captcha: 'eCaptcha', rate: 'eRate', tooBig: 'eTooBigSrv', type: 'eType', thumb: 'eType', size: 'eType', full: 'eFull',
  meta: 'eMeta', tooLong: 'eTooLong', empty: 'eEmpty', rights: 'eRights', name: 'eName', gone: 'eGone', network: 'eNetwork' };

/** Erreur du serveur → { key, why } ; isVideo : le dépôt était une vidéo ou un GIF. */
export function serverError(code, reason, isVideo) {
  if (isVideo && code === 'thumb') return { key: 'eVideoRejected', why: reason === 'meta' ? 'poster_meta' : 'poster' };
  if (isVideo && VIDEO_SERVER[code]) return { key: 'eVideoRejected', why: VIDEO_SERVER[code] };
  return { key: SERVER[code] || 'eServer' };
}

/** Erreur de lecture ou de conversion (js/video.js) → { key, why }. */
export function videoError(err) {
  const code = err?.code && err.code !== 'canceled' && err.code !== 'decode' ? err.code : 'eVideoUnsupported';
  return { key: code, why: err?.why || 'video' };
}

export const WHY = ['video', 'size', 'audio', 'location', 'duration', 'tooBig', 'poster_meta', 'poster'];

/** Petits outils partagés. */
export const $ = (s, r = document) => r.querySelector(s);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = t => t * t * (3 - 2 * t);
/** Amortissement indépendant de la cadence d'affichage. */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Secondes → timecode HH:MM:SS:FF (non-drop). */
export function timecode(seconds, fps = 25) {
  const f = Math.max(0, Math.floor(seconds * fps + 1e-6));
  const ff = f % fps, s = Math.floor(f / fps);
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`;
}

/** Durée lisible : 180 → 3′00″ */
export const runtimeLabel = s => `${Math.floor(s / 60)}′${String(Math.round(s % 60)).padStart(2, '0')}″`;

/** Rapport largeur/hauteur d'un format '16:9', '2.39:1'… */
export function aspectOf(format) {
  const [a, b] = String(format).split(':').map(Number);
  return a && b ? a / b : 16 / 9;
}

/**
 * Détection des capacités de l'appareil → « tier » :
 *   0  pas de 3D : index seul (pas de WebGL2, rendu logiciel, ou ?q=0)
 *   1  mobile / machine modeste : résolution réduite, 1 vidéo à la fois, pas de scopes
 *   2  ordinateur : tout
 *   (3 réservé au futur mode photo en path tracing — voir docs/ARCHITECTURE.md, phase 5)
 *
 * Forçable pour tester : ?q=0 | ?q=1 | ?q=2
 */
export function detectCapabilities() {
  const mq = q => matchMedia(q).matches;
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  const coarse = mq('(pointer: coarse)');
  const conn = navigator.connection || {};
  const saveData = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
  const memory = navigator.deviceMemory || 4;           // Go, arrondi par le navigateur (Chrome seulement)

  let webgl2 = false, gpu = '', software = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (gl) {
      webgl2 = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* pas de WebGL */ }

  let tier = !webgl2 || software ? 0 : (coarse || memory <= 4) ? 1 : 2;
  if (saveData) tier = Math.min(tier, 1);

  const forced = new URLSearchParams(location.search).get('q');
  if (forced !== null && /^[0-2]$/.test(forced)) tier = Number(forced);

  return { tier, reduceMotion, coarse, saveData, memory, webgl2, gpu, software,
    indexFirst: tier === 0 || saveData };
}

/**
 * Moteur de rendu : WebGL2, sortie sRGB, tone mapping AgX (comme le viewport Blender),
 * résolution adaptative, rendu à la demande (rien n'est recalculé quand rien ne bouge).
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createRenderer(container, caps) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,             // MSAA : quasi gratuit sur les GPU mobiles (rendu par tuiles)
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = CONFIG.toneMapping === 'AgX' ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;
  renderer.setClearColor(0x000000, 1);
  container.appendChild(renderer.domElement);

  const maxDpr = Math.min(devicePixelRatio || 1, CONFIG.maxPixelRatio[caps.tier] ?? 1.5);
  let dpr = maxDpr;
  // Taille réelle de la fenêtre. Si la page démarre cachée (onglet en arrière-plan,
  // aperçu replié), la fenêtre peut mesurer 0 × 0 : le canevas tombait alors à 1 pixel
  // et l'écran restait blanc. On ne redimensionne que sur une taille valide, et
  // ensureSize() rattrape à chaque image un redimensionnement manqué.
  let sizedW = 0, sizedH = 0;
  const resize = () => {
    const w = innerWidth || document.documentElement.clientWidth;
    const h = innerHeight || document.documentElement.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    sizedW = w; sizedH = h;
  };
  resize();
  const ensureSize = () => {
    const w = innerWidth, h = innerHeight;
    if (w && h && (w !== sizedW || h !== sizedH)) { resize(); return true; }
    return false;
  };

  /* Résolution adaptative : moyenne glissante du temps de rendu, hystérésis de 2 s. */
  let acc = 0, n = 0, lastChange = 0;
  function sample(dtMs, now) {
    if (!CONFIG.adaptiveResolution) return;
    acc += dtMs; n++;
    if (n < 45 || now - lastChange < 2000) return;
    const avg = acc / n; acc = 0; n = 0;
    if (avg > 24 && dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.25); lastChange = now; resize(); }
    else if (avg < 13 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.25); lastChange = now; resize(); }
  }

  return { renderer, resize, ensureSize, sample, get dpr() { return dpr; } };
}

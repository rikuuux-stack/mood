/**
 * ÉCRANS — les œuvres vidéo affichées sur les surfaces SCREEN_<id>.
 *
 * - l'image est ajustée « contain » dans le cadre défini dans Blender (formats mixtes)
 * - toneMapped:false : l'étalonnage n'est pas altéré par AgX (sinon AgX désature tes vidéos)
 * - chargement paresseux : seules les œuvres proches sont téléchargées
 * - lecture limitée à N décodeurs simultanés (iOS), le reste montre l'affiche
 * - chaque écran calcule sa couleur moyenne → halo sur le béton (spill.js) et scopes
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { aspectOf } from '../core/util.js';
import { makeSpill } from './spill.js';

const _v = new THREE.Vector3();

export class Screens {
  constructor({ scene, entries, works, caps, stationPos }) {
    this.caps = caps;
    this.maxPlaying = CONFIG.maxPlayingVideos[caps.tier] ?? 1;
    this.paused = caps.reduceMotion;          // mouvement réduit : pas de lecture automatique
    this.items = [];
    this.pickables = [];
    this.tick = 0;
    this.avgCanvas = Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
    this.avgCtx = this.avgCanvas.getContext('2d', { willReadFrequently: true });

    for (const { work: id, mesh } of entries) {
      const work = works.find(w => w.id === id);
      if (!work) { console.warn(`[screens] SCREEN_${id} : aucune œuvre « ${id} » dans works.js`); continue; }
      const item = this.#createScreen(scene, mesh, work, stationPos?.[id]);
      this.items.push(item);
      this.pickables.push(item.plane);
    }
    // iOS en mode économie d'énergie refuse l'autoplay : on réessaie au premier geste
    const retry = () => { this.items.forEach(i => i.wantPlay && i.video?.paused && this.#play(i)); };
    addEventListener('pointerdown', retry, { passive: true });
  }

  #createScreen(scene, mesh, work, stationCamPos) {
    mesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const nAttr = mesh.geometry.attributes.normal;
    const normal = nAttr ? _v.fromBufferAttribute(nAttr, 0).transformDirection(mesh.matrixWorld).clone() : new THREE.Vector3(0, 0, 1);
    normal.y = 0; normal.normalize();
    // si le plan a été modélisé « à l'envers », on le retourne vers la caméra de son œuvre
    if (stationCamPos && normal.dot(stationCamPos.clone().sub(center)) < 0) normal.negate();
    const frame = { w: Math.max(size.x, size.z), h: size.y };
    mesh.visible = false;

    const group = new THREE.Group();
    group.position.copy(center);
    group.lookAt(center.clone().add(normal));
    scene.add(group);

    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    plane.userData.work = work.id;
    group.add(plane);

    const item = { work, group, plane, mat, frame, center, normal, aspect: aspectOf(work.format),
      video: null, videoTex: null, state: 'idle', wantPlay: false, avg: new THREE.Color(0.2, 0.2, 0.2), source: null };
    this.#fit(item);

    // affiche (poster) ou mire si absente
    const slate = () => { const c = makeSlate(work, item.aspect); this.#setImage(item, new THREE.CanvasTexture(c), c); };
    if (work.media?.poster) {
      new THREE.TextureLoader().load(work.media.poster, tex => this.#setImage(item, tex, tex.image), undefined, slate);
    } else slate();

    if (CONFIG.spill && this.caps.tier >= 1) item.spill = makeSpill(scene, item);
    return item;
  }

  #fit(item) {
    const { w: fw, h: fh } = item.frame, a = item.aspect;
    const [w, h] = a > fw / fh ? [fw, fw / a] : [fh * a, fh];
    item.plane.scale.set(w, h, 1);
    item.size = { w, h };
    item.spill?.resize(item);
  }

  #setImage(item, tex, img) {
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!item.videoTex || item.state !== 'playing') { item.mat.map = tex; item.mat.needsUpdate = true; }
    item.posterTex = tex;
    item.source = img;
    this.#sampleAverage(item, img);
  }

  #ensureVideo(item) {
    if (item.video || !item.work.media?.preview) return;
    const v = document.createElement('video');
    Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.src = item.work.media.preview;
    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth) { item.aspect = v.videoWidth / v.videoHeight; this.#fit(item); }
    });
    v.addEventListener('playing', () => {
      if (!item.videoTex) { item.videoTex = new THREE.VideoTexture(v); item.videoTex.colorSpace = THREE.SRGBColorSpace; }
      item.mat.map = item.videoTex; item.mat.needsUpdate = true;
      item.state = 'playing'; item.source = v;
    });
    v.addEventListener('pause', () => { item.state = 'paused'; });
    v.addEventListener('error', () => { item.state = 'error'; console.warn('[screens] vidéo introuvable :', v.src); });
    item.video = v;
  }

  #play(item) {
    const p = item.video?.play();
    p?.catch(() => { /* autoplay refusé : l'affiche reste, on réessaiera au prochain geste */ });
  }

  /**
   * Appelé à chaque image.
   * @param {(item) => number} distOf  distance normalisée de chaque écran (≤ 1 : proche)
   *        mode guidé : écart en nombre d'œuvres ; mode libre : mètres / videoRange
   * @returns {boolean} true si une vidéo joue (il faut donc redessiner)
   */
  update(distOf) {
    this.tick++;
    const ranked = this.items
      .map(i => ({ i, d: distOf(i) }))
      .sort((a, b) => a.d - b.d);
    let slots = this.paused ? 0 : this.maxPlaying;
    let playing = false;
    for (const { i, d } of ranked) {
      if (d <= CONFIG.preloadRadius + 0.5) this.#ensureVideo(i);
      i.wantPlay = !!i.video && slots > 0 && d < 1.25;
      if (i.wantPlay) { slots--; if (i.video.paused) this.#play(i); }
      else if (i.video && !i.video.paused) i.video.pause();
      if (i.state === 'playing' && !i.video.paused) {
        playing = true;
        if ((this.tick + i.plane.id) % 8 === 0) this.#sampleAverage(i, i.video);
      }
      i.spill?.update(i, d);
    }
    return playing;
  }

  setPaused(p) {
    this.paused = p;
    if (p) this.items.forEach(i => i.video && !i.video.paused && i.video.pause());
  }

  /** Source (vidéo, image ou canvas) de l'œuvre pour les scopes. */
  sourceOf(id) {
    const i = this.items.find(x => x.work.id === id);
    return i?.source || null;
  }

  #sampleAverage(item, src) {
    try {
      if (src instanceof HTMLVideoElement && src.readyState < 2) return;
      this.avgCtx.drawImage(src, 0, 0, 4, 4);
      const d = this.avgCtx.getImageData(0, 0, 4, 4).data;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < d.length; k += 4) { r += d[k]; g += d[k + 1]; b += d[k + 2]; }
      const n = d.length / 4 * 255;
      item.avg.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
    } catch { /* source non prête ou d'une autre origine sans CORS */ }
  }
}

/** Mire d'emplacement : barres 75 % + format. Aussi utilisée tant que l'affiche manque. */
function makeSlate(work, aspect) {
  const W = 512, H = Math.round(W / aspect);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  const bars = ['#bfbfbf', '#bfbf00', '#00bfbf', '#00bf00', '#bf00bf', '#bf0000', '#0000bf'];
  const bh = H * (work.placeholder ? 0.62 : 0.2);
  bars.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * W / 7, 0, W / 7 + 1, bh); });
  g.fillStyle = '#101010'; g.fillRect(0, bh, W, H - bh);
  g.fillStyle = '#ebebeb'; g.textAlign = 'center';
  const fs = Math.max(16, Math.min(W, H) * 0.075);
  g.font = `500 ${fs}px "IBM Plex Mono", monospace`;
  g.fillText(work.placeholder ? 'SLOT' : work.id.toUpperCase(), W / 2, bh + (H - bh) * 0.45);
  g.fillStyle = '#a3a3a3'; g.font = `400 ${fs * 0.6}px "IBM Plex Mono", monospace`;
  g.fillText(work.format, W / 2, bh + (H - bh) * 0.45 + fs * 1.1);
  return c;
}

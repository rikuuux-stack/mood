/**
 * Chargement de l'espace : ton .glb baké s'il existe, sinon la géométrie provisoire.
 * Extrait ensuite, par convention de nommage :
 *   CAM_<nn>_<id|via>  → les plans du parcours (dans l'ordre de <nn>)
 *   SCREEN_<id>        → les surfaces qui recevront les vidéos
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CONFIG } from '../config.js';
import { loadLightmaps, applyBakedMaterials } from './baked.js';
import { buildFallback } from './fallback.js';

export async function loadSpace({ renderer, tier = 2, onProgress = () => {} }) {
  const ktx2 = new KTX2Loader().setTranscoderPath(CONFIG.decoders.basis).detectSupport(renderer);
  let root, source, live = [];

  const exists = await fetch(CONFIG.modelUrl, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
  if (exists) {
    const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    const [gltf, lightmaps] = await Promise.all([
      loader.loadAsync(CONFIG.modelUrl, e => e.total && onProgress(0.1 + 0.6 * e.loaded / e.total, 'loadingModel')),
      loadLightmaps(renderer, ktx2),
    ]);
    onProgress(0.8, 'loadingLight');
    root = gltf.scene;
    live = applyBakedMaterials(root, lightmaps, tier);
    source = 'glb';
  } else {
    console.info('[space] pas de .glb : géométrie provisoire depuis', CONFIG.layoutUrl);
    root = await buildFallback(CONFIG.layoutUrl);
    source = 'fallback';
  }
  root.updateMatrixWorld(true);

  // ------------------------------------------------------------ plans (caméras)
  const keys = [];
  root.traverse(o => {
    const m = o.isCamera && /^CAM_(\d+)_(.+)$/.exec(o.name);
    if (!m) return;
    keys.push({
      order: Number(m[1]),
      name: o.name,
      work: m[2] === 'via' ? null : m[2].replace(/_\d+$/, ''),   // « _1 » = suffixe de doublon glTF
      position: o.getWorldPosition(new THREE.Vector3()),
      quaternion: o.getWorldQuaternion(new THREE.Quaternion()),
      vfov: o.fov,
    });
  });
  keys.sort((a, b) => a.order - b.order);
  if (keys.length < 2) throw new Error('Il faut au moins deux caméras CAM_<nn>_… dans la scène.');

  // ------------------------------------------------------------ écrans
  const screens = [];
  root.traverse(o => {
    const m = o.isMesh && /^SCREEN_(.+)$/.exec(o.name);
    if (m) screens.push({ work: m[1], mesh: o });
  });

  onProgress(0.9, 'loadingLight');
  return { root, keys, screens, source, live };
}

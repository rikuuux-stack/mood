/**
 * Conversion des matières du .glb en matières « bakées » :
 *   MeshBasicMaterial = aucun calcul d'éclairage en temps réel.
 *   couleur finale = albédo (UV0, texture de béton répétée, nette)
 *                  × lightmap (UV1, éclairage Cycles précalculé, doux)
 *
 * La lightmap est une image séparée, décrite par assets/lightmaps/manifest.json
 * (écrit par tools/blender/riku_bake.py). Un objet la désigne par sa propriété
 * personnalisée Blender « lightmap » (→ userData.lightmap), sinon 'lightmap'.
 *
 * Intensité : le shader three.js calcule  albédo × lightmap × lightMapIntensity / π.
 * Le PNG a été divisé par « headroom » pour tenir dans 0→1. On compense donc par
 * headroom × π. C'est la source d'erreur n° 1 quand « le rendu est trop sombre ».
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export async function loadLightmaps(renderer, ktx2Loader) {
  const dir = CONFIG.lightmapDir;
  let manifest;
  try {
    const r = await fetch(dir + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    manifest = await r.json();
  } catch (e) {
    console.warn('[baked] pas de manifest de lightmap :', e.message);
    return {};
  }
  const out = {};
  const texLoader = new THREE.TextureLoader();
  await Promise.all(Object.entries(manifest).map(async ([name, m]) => {
    // KTX2 si disponible (compressé GPU), sinon PNG
    const useKtx = m.ktx2 && ktx2Loader;
    const url = dir + (useKtx ? m.ktx2 : m.file);
    const tex = await (useKtx ? ktx2Loader : texLoader).loadAsync(url);
    tex.channel = m.uv ?? 1;                    // lit la 2e UV map (TEXCOORD_1)
    tex.flipY = false;                          // convention glTF
    // log2 : valeurs brutes (décodées dans le shader) ; ancien format : sRGB ÷ headroom
    const log = m.encoding === 'log2';
    tex.colorSpace = log ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    // Pas de mipmaps : aux niveaux réduits, les îlots UV voisins se mélangent et dessinent
    // des liserés clairs le long des arêtes lointaines. Une lightmap est assez douce pour s'en passer.
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    out[name] = {
      texture: tex,
      decode: log ? { min: m.min, stops: m.stops } : null,
      intensity: (log ? 1 : (m.headroom ?? 1)) * Math.PI * CONFIG.lightmapGain,
    };
  }));
  return out;
}

/**
 * Remplace les matières des meshes (sauf écrans).
 *   tier 1 (mobile) : MeshBasicMaterial + lightMap — le plus léger possible.
 *   tier 2          : « béton vivant » = la même lumière bakée, plus ce que le bake ne
 *                     peut pas contenir parce que ça dépend du point de vue :
 *                       – reflets (rugosité scannée, réflexion de la salle capturée sur place),
 *                         éteints dans les zones sombres de la lightmap (pas de reflet dans l'ombre) ;
 *                       – relief : la normal map module la lumière bakée, éclairée par le haut
 *                         comme sous une ouverture zénithale (joints, pores, trous de banche).
 * Retourne la liste des matières « vivantes » (pour y brancher la réflexion plus tard).
 */
export function applyBakedMaterials(root, lightmaps, tier = 2) {
  const cache = new Map();
  const live = [];
  let withLm = 0, without = 0;
  root.traverse(o => {
    if (!o.isMesh || o.name.startsWith('SCREEN_')) return;
    const name = o.userData.lightmap || 'lightmap';
    const lm = o.geometry.attributes.uv1 ? lightmaps[name] : null;
    const src = o.material;
    const key = `${src.uuid}|${lm ? name : '-'}`;
    if (!cache.has(key)) {
      let m;
      if (tier >= 2 && src.isMeshStandardMaterial && lm) {
        m = src.clone();
        m.metalness = 0; m.metalnessMap = null;
        m.lightMap = lm.texture; m.lightMapIntensity = lm.intensity;
        m.envMapIntensity = CONFIG.surface.envIntensity;
        patchLiveConcrete(m, lm.decode);
        live.push(m);
      } else {
        m = new THREE.MeshBasicMaterial({
          name: src.name, map: src.map || null,
          color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
          lightMap: lm?.texture || null, lightMapIntensity: lm?.intensity ?? 1, side: src.side,
        });
        if (lm?.decode) {
          m.onBeforeCompile = sh => injectDecode(sh, lm.decode);
          m.customProgramCacheKey = () => 'baked-basic-log';
        }
      }
      m.dithering = true;                        // casse les bandes dans les dégradés sombres
      cache.set(key, m);
      src.dispose();
    }
    o.material = cache.get(key);
    lm ? withLm++ : without++;
  });
  if (without) console.warn(`[baked] ${without} mesh(es) sans lightmap (pas d'UV1 ou pas de manifest) : rendus en aplat.`);
  console.info(`[baked] ${withLm} mesh(es) avec lightmap, ${live.length} matière(s) « vivante(s) ».`);
  return live;
}

/** Injection GLSL dans MeshStandardMaterial (voir le commentaire ci-dessus). */
const LM_SAMPLE = 'vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );';

/** Décodage log2 de la lightmap, commun aux deux matières. */
function injectDecode(shader, dec) {
  shader.uniforms.uLmMin = { value: dec.min };
  shader.uniforms.uLmStops = { value: dec.stops };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uLmMin;\nuniform float uLmStops;')
    .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps)
    .replace(LM_SAMPLE, 'vec4 lightMapTexel = vec4( uLmMin * exp2( texture2D( lightMap, vLightMapUv ).rgb * uLmStops ), 1.0 );');
}

function patchLiveConcrete(m, dec) {
  const S = CONFIG.surface;
  m.onBeforeCompile = shader => {
    shader.uniforms.uDetail = { value: S.detail };
    shader.uniforms.uSpecOcc = { value: S.specOcclusion };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDetail;\nuniform float uSpecOcc;')
      // 1) la réflexion capturée ne sert QU'AUX reflets : la lumière diffuse vient déjà du bake
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps
        .replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '')
        // 2) relief : écart entre normale texturée et normale géométrique, vu d'une lumière zénithale
        .replace('irradiance += lightMapIrradiance;', `
          vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
          float relief = dot( normal, upV ) - dot( nonPerturbedNormal, upV );
          irradiance += lightMapIrradiance * clamp( 1.0 + uDetail * relief, 0.55, 1.45 );`))
      // 3) pas de reflet là où la salle est sombre (occlusion spéculaire tirée de la lightmap)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        #if defined( USE_LIGHTMAP ) && defined( USE_ENVMAP )
          float lmLum = dot( lightMapTexel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          reflectedLight.indirectSpecular *= smoothstep( 0.0, uSpecOcc, lmLum );
        #endif`);
    if (dec) injectDecode(shader, dec);
  };
  m.customProgramCacheKey = () => 'live-concrete';
}

/**
 * Réflexions : une capture panoramique (cube) de la salle à chaque station, filtrée
 * par rugosité (PMREM). La caméra utilise la capture la plus proche.
 */
export function captureReflections(renderer, scene, points, size = 128) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.05, 200, rt);
  scene.add(cam);
  const out = points.map(p => {
    cam.position.set(p.x, p.y, p.z);
    cam.update(renderer, scene);
    return { pos: p.clone(), env: pmrem.fromCubemap(rt.texture).texture };
  });
  scene.remove(cam); rt.dispose(); pmrem.dispose();
  return out;
}

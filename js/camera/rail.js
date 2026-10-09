/**
 * RAIL — le parcours de caméra, pensé comme une séquence montée.
 *
 * Chaque caméra CAM_<nn> est un « plan ». Devant une œuvre, le plan est tenu
 * (dwellSeconds) ; entre deux plans, un travelling dont la durée dépend de la
 * distance. Le tout forme une timeline en secondes, affichée en timecode.
 *
 *   secondes ──uAt()──▶ u (indice flottant de caméra) ──poseAt()──▶ position, rotation, focale
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, smoothstep } from '../core/util.js';

export class Rail {
  constructor(keys) {
    this.keys = keys;
    this.curve = new THREE.CatmullRomCurve3(keys.map(k => k.position), false, 'centripetal', 0.5);
    let t = 0;
    keys.forEach((k, i) => {
      k.isStation = !!k.work;
      k.tIn = t;
      t += k.isStation ? CONFIG.dwellSeconds : 0;
      k.tOut = t;
      if (i < keys.length - 1) {
        const d = k.position.distanceTo(keys[i + 1].position);
        t += Math.max(CONFIG.minTravelSeconds, d / CONFIG.travelSpeed);
      }
    });
    this.duration = t;
    this.stations = keys.filter(k => k.isStation);
    this.stations.forEach((k, i) => { k.ordinal = i; k.tMid = (k.tIn + k.tOut) / 2; });
    this._q = new THREE.Quaternion();
  }

  /** secondes → u. Les travellings accélèrent en quittant un plan et freinent en arrivant. */
  uAt(s) {
    const K = this.keys;
    s = clamp(s, 0, this.duration);
    for (let i = 0; i < K.length; i++) {
      const a = K[i];
      if (s <= a.tOut) return i;
      const b = K[i + 1];
      if (b && s < b.tIn) {
        let f = (s - a.tOut) / (b.tIn - a.tOut);
        if (a.isStation && b.isStation) f = smoothstep(f);
        else if (a.isStation) f = f * f;                 // départ en douceur, sortie à vitesse
        else if (b.isStation) f = 1 - (1 - f) * (1 - f); // arrivée freinée
        return i + f;
      }
    }
    return K.length - 1;
  }

  /** Position dans l'ordre des œuvres (0, 1, 2… ; fractions pendant les travellings). */
  stationPosAt(s) {
    const S = this.stations;
    if (s <= S[0].tMid) return 0;
    for (let i = 0; i < S.length - 1; i++) {
      if (s <= S[i + 1].tMid) return i + (s - S[i].tMid) / (S[i + 1].tMid - S[i].tMid);
    }
    return S.length - 1;
  }

  /** Pose caméra au paramètre u. vfov adapté à l'écran : champ horizontal préservé en portrait. */
  poseAt(u, camera, aspect) {
    const K = this.keys, n = K.length - 1;
    const i = Math.min(n - 1, Math.floor(u)), f = u - i;
    this.curve.getPoint(n ? u / n : 0, camera.position);
    camera.quaternion.slerpQuaternions(K[i].quaternion, K[Math.min(n, i + 1)].quaternion, smoothstep(clamp(f, 0, 1)));
    const vRef = THREE.MathUtils.lerp(K[i].vfov, K[Math.min(n, i + 1)].vfov, f);
    camera.fov = adaptFov(vRef, aspect);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
}

/** Champ vertical effectif : si l'écran est plus étroit que le format de cadrage,
 *  on élargit pour garder le même champ horizontal (sinon l'œuvre sort du cadre en portrait). */
export function adaptFov(vfovRef, aspect) {
  if (aspect >= CONFIG.referenceAspect) return vfovRef;
  const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfovRef) / 2) * CONFIG.referenceAspect);
  const v = 2 * Math.atan(Math.tan(h / 2) / aspect);
  return Math.min(CONFIG.maxVerticalFov, THREE.MathUtils.radToDeg(v));
}

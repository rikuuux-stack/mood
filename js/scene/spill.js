/**
 * SPILL — la lumière de l'écran qui déborde sur le béton.
 * Le bake ne peut pas la contenir (la vidéo change à chaque image). On la simule
 * à coût quasi nul : deux quads additifs (sol + halo mural) teintés par la couleur
 * moyenne de l'image courante. C'est ce qui fait « vivre » l'espace, bien plus
 * qu'un path tracer.
 */
import * as THREE from 'three';

const texCache = {};
function falloffTexture(kind) {
  if (texCache[kind]) return texCache[kind];
  const N = 128, c = Object.assign(document.createElement('canvas'), { width: N, height: N });
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const ss = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N;
    let a;
    if (kind === 'halo') {          // rectangle aux bords doux, creux au centre (caché par l'écran)
      const dx = Math.max(0, Math.abs(u - 0.5) - 0.26) / 0.24, dy = Math.max(0, Math.abs(v - 0.5) - 0.26) / 0.24;
      a = (1 - ss(dx)) * (1 - ss(dy));
    } else {                        // sol : fort au pied du mur (v = 0), s'éteint vers la salle
      const lateral = 1 - ss(Math.abs(u - 0.5) * 2);
      a = lateral * Math.pow(1 - v, 2.2);
    }
    const k = (y * N + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (texCache[kind] = tex);
}

export function makeSpill(scene, item) {
  const mk = kind => new THREE.MeshBasicMaterial({
    map: falloffTexture(kind), color: 0x000000, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mk('floor'));
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mk('halo'));
  floor.rotation.x = -Math.PI / 2;
  halo.position.z = -0.012;                          // entre l'écran et le mur
  floor.renderOrder = halo.renderOrder = 1;
  item.group.add(floor, halo);
  const tmp = new THREE.Color();

  return {
    resize({ size, center }) {
      const depth = 3.2;
      floor.scale.set(size.w * 1.4, depth, 1);
      // origine du groupe = centre de l'écran : on redescend au sol (y ≈ 0)
      floor.position.set(0, -center.y + 0.012, depth / 2);
      halo.scale.set(size.w * 1.9, size.h * 1.9, 1);
    },
    update(it, distance) {
      // luminance de l'image × proximité ; les écrans lointains restent faiblement allumés
      const near = Math.min(1, Math.max(0.35, 1.5 - distance));
      tmp.copy(it.avg).multiplyScalar(0.22 * near);   // calé pour l’exposition 2,8
      floor.material.color.lerp(tmp, 0.15);
      halo.material.color.lerp(tmp.multiplyScalar(0.6), 0.15);
    },
  };
}

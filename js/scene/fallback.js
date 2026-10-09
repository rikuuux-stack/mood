/**
 * Géométrie PROVISOIRE, construite depuis assets/layout.json quand aucun .glb n'est présent.
 * Éclairage temps réel bon marché (Lambert + hémisphère) : ce n'est qu'un échafaudage
 * pour travailler le parcours et l'interface en attendant le bake.
 * Produit les mêmes objets nommés que le .glb (SCREEN_*, CAM_*), donc le reste du site
 * ne fait aucune différence entre les deux.
 */
import * as THREE from 'three';

export async function buildFallback(url) {
  const layout = await (await fetch(url)).json();
  const root = new THREE.Group();
  root.name = 'fallback';

  const concrete = new THREE.MeshLambertMaterial({ color: 0xb9b6b0 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of layout.boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const m = new THREE.Mesh(geo, concrete);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m);
  }
  // lumière : ciel + un « soleil » zénithal + une lumière d'appoint par ouverture
  root.add(new THREE.HemisphereLight(0xdfe6ee, 0x3b3833, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.2);
  sun.position.set(6, 30, 8); root.add(sun);
  for (const [x0, x1, z0, z1] of layout.skylights) {
    const p = new THREE.PointLight(0xf4f1ea, 25, 14, 1.6);
    p.position.set((x0 + x1) / 2, layout.room.height - 0.3, (z0 + z1) / 2);
    root.add(p);
  }

  for (const s of layout.screens) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    m.name = s.name;
    m.position.fromArray(s.center);
    m.lookAt(new THREE.Vector3().fromArray(s.center).add(new THREE.Vector3().fromArray(s.normal)));
    root.add(m);
  }
  for (const c of layout.cameras) {
    const cam = new THREE.PerspectiveCamera(c.vfov, 16 / 9, 0.05, 200);
    cam.name = c.name;
    cam.position.fromArray(c.pos);
    cam.lookAt(new THREE.Vector3().fromArray(c.target));
    root.add(cam);
  }
  root.updateMatrixWorld(true);
  return root;
}

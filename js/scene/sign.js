/**
 * PANCARTE — contact, fixée au mur de l'entrée comme un cartel de musée.
 * Plaque sombre, texte blanc net (non affecté par le tone mapping, comme les écrans).
 * Viser la pancarte puis cliquer (ou E) ouvre « À propos » avec les liens.
 * Position réglable dans js/config.js (sign).
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SITE } from '../content/works.js';

export function makeSign(scene) {
  const S = CONFIG.sign;
  const W = 1024, H = Math.round(W * S.size[1] / S.size[0]);
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const draw = () => {
    const g = canvas.getContext('2d');
    g.fillStyle = '#161616'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(235,235,235,.18)'; g.lineWidth = 2; g.strokeRect(28, 28, W - 56, H - 56);
    const mono = '"IBM Plex Mono", Menlo, monospace';
    g.fillStyle = '#ebebeb'; g.textBaseline = 'alphabetic';
    g.font = `500 ${H * 0.2}px ${mono}`;
    g.letterSpacing = `${H * 0.05}px`;
    g.fillText('RIKU', 80, H * 0.34);
    g.letterSpacing = '0px';
    g.fillStyle = '#a3a3a3'; g.font = `400 ${H * 0.07}px ${mono}`;
    g.fillText('Félix Cardonnel', 84, H * 0.47);
    g.fillStyle = '#bfbf00'; g.fillRect(84, H * 0.56, 60, 3);           // filet jaune « barre 75 % »
    g.fillStyle = '#ebebeb'; g.font = `400 ${H * 0.085}px ${mono}`;
    g.fillText(`Instagram  ${S.instagramHandle}`, 84, H * 0.72);
    g.fillText(SITE.email, 84, H * 0.86);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);                                  // redessine avec la bonne police

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(S.size[0], S.size[1]),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  plate.userData.work = 'about';
  const pos = new THREE.Vector3().fromArray(S.position);
  plate.position.copy(pos);
  plate.lookAt(pos.clone().add(new THREE.Vector3().fromArray(S.normal)));
  // épaisseur : une fine tranche derrière la plaque (lecture de l'objet en rasant)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(S.size[0], S.size[1], 0.02),
    new THREE.MeshBasicMaterial({ color: 0x0b0b0b, toneMapped: false }));
  edge.position.z = -0.011;
  plate.add(edge);
  scene.add(plate);
  return plate;
}

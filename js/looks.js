/**
 * Rendus des photos à COMPARER (aperçu seulement) — chargé uniquement avec `?look=…` dans l'adresse,
 * ou par la page de comparaison tools/looks/. Sans ce paramètre, le site garde les filtres statiques de
 * index.html (rendu publié actuel) et ce fichier n'est jamais téléchargé.
 *
 * Trois rendus, tous en noir et blanc, tous avec les mêmes identifiants de filtres que le site
 * (#tone pour une image neuve, #erode1 … #erode4 pour les paliers du temps) :
 *   current : le rendu publié (négatif, noir transparent, désagrégation) — valeurs de js/wall.js ;
 *   soft    : négatif plus doux — sombres relevés, milieux étalés, transparence réservée au noir profond :
 *             les formes et les détails restent lisibles, la désagrégation est plus progressive ;
 *   copy    : photocopie / trame imprimée — négatif très contrasté, puis tramé en trois tons par un bruit
 *             FIXE (feTurbulence avec une graine constante : le même grain à chaque affichage, aucun
 *             scintillement) ; le temps ronge l'image tache par tache.
 *
 * Tout se fait à l'affichage : les fichiers ne changent pas. Limites de l'aperçu : Keep (js/fragment.js) et la
 * lecture d'une vidéo (canvas de js/main.js) gardent le rendu actuel, quel que soit le rendu choisi.
 */
import { TONE, BASE, ERODE } from './wall.js?v=10fdf5c535';

const f4 = x => String(+x.toFixed(4));
const table = vals => ['R', 'G', 'B'].map(c => `<feFunc${c} type="table" tableValues="${vals}"/>`).join('');
const alphaRow = e => `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${f4(e.k)} 0 0 0 ${f4(1 - e.k * e.t)}`;   // alpha = 1 − k × (t − gris)

export const LOOKS = {
  current: {
    label: 'Actuel',
    note: 'Négatif, noir transparent dès le dépôt, désagrégation par paliers (rendu publié).',
    curve: [...TONE].reverse(),                         // inversion + courbe en une table
    base: BASE, stages: ERODE,
  },
  soft: {
    label: 'Négatif doux',
    note: 'Sombres relevés et milieux étalés : formes et détails préservés ; seul le noir profond devient transparent.',
    curve: [0.84, 0.7, 0.54, 0.36, 0.16],
    base: { t: 0.26, k: 5 },
    stages: [{ t: 0.34, k: 5 }, { t: 0.42, k: 5 }, { t: 0.5, k: 5 }, { t: 0.58, k: 5 }],
  },
  copy: {
    label: 'Photocopie',
    note: 'Négatif contrasté tramé en trois tons par un grain fixe (sans scintillement) ; le temps ronge par taches.',
    curve: [0.8, 0.72, 0.5, 0.18, 0],
    screen: { seed: 7, freq: 0.9, amount: 0.38, levels: '0 0 0.6 0.78 0.78' },
    base: { t: 0.3, k: 12 },
    stages: [{ t: 0.38, k: 12 }, { t: 0.46, k: 12 }, { t: 0.54, k: 12 }, { t: 0.62, k: 12 }],
  },
};

/** Un filtre SVG (chaîne) pour un rendu et un réglage de transparence. */
function filter(id, look, e) {
  const L = LOOKS[look];
  let body = `<feColorMatrix type="saturate" values="0"/><feComponentTransfer result="t">${table(L.curve.join(' '))}</feComponentTransfer>`;
  let src = 't', alphaIn = 't';
  if (L.screen) {
    const s = L.screen, a = s.amount;
    // bruit fixe (graine constante) en gris, ajouté au négatif, puis ramené à trois tons : la trame
    body += `<feTurbulence type="fractalNoise" baseFrequency="${s.freq}" numOctaves="2" seed="${s.seed}" stitchTiles="stitch" result="n0"/>`
      + `<feColorMatrix in="n0" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="n"/>`
      + `<feComposite in="t" in2="n" operator="arithmetic" k1="0" k2="1" k3="${f4(a)}" k4="${f4(-a / 2)}" result="tn"/>`
      + `<feComponentTransfer in="tn" result="p">${['R', 'G', 'B'].map(c => `<feFunc${c} type="discrete" tableValues="${s.levels}"/>`).join('')}</feComponentTransfer>`;
    src = 'p'; alphaIn = 'tn';                          // couleur tramée ; transparence selon le négatif bruité (bords en taches)
  }
  body += `<feColorMatrix in="${alphaIn}" values="${alphaRow(e)}" result="a"/><feComposite in="${src}" in2="a" operator="in"/>`;
  return `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">${body}</filter>`;
}

/** Les cinq filtres d'un rendu (#tone, #erode1 … #erode4), avec un suffixe d'identifiant facultatif. */
export function filtersMarkup(look, suffix = '') {
  const L = LOOKS[look];
  return filter(`tone${suffix}`, look, L.base) + L.stages.map((e, i) => filter(`erode${i + 1}${suffix}`, look, e)).join('');
}

/** Remplace les filtres de la page par ceux du rendu choisi (mêmes identifiants : le CSS ne change pas). */
export function applyLook(look) {
  if (!LOOKS[look] || look === 'current') return false;
  const svg = document.querySelector('svg[aria-hidden="true"][width="0"]');
  if (!svg) return false;
  svg.innerHTML = filtersMarkup(look);                 // chaîne fixe construite ici, aucune donnée de visiteur
  document.documentElement.dataset.look = look;
  return true;
}

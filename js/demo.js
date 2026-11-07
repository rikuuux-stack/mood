/**
 * DÉMONSTRATION (?demo=1) — remplace le vrai mur par 70 FAUX dépôts étalés sur 5 mois, pour voir
 * l'usure, les bords rongés et l'empilement sur un mur rempli. Rien n'est lu ni envoyé au serveur
 * (mode maquette, js/data.js) ; sans le paramètre, ce fichier n'est jamais téléchargé.
 * Images : des scènes dessinées ici (aucune vraie photo), mêmes images à chaque ouverture.
 */
const TEXTS = [
  'Le béton garde la mémoire du coffrage. Chaque planche y laisse sa trace.',
  '光は、壁に触れてはじめて見える。',
  'Less, but louder.',
  'Une couleur seule, posée au bon endroit, vaut mieux qu’une palette entière. Le vermillon des torii, le jaune d’un ticket de métro, le bleu d’une bâche sur un chantier à Osaka : on ne les remarque que parce que tout le reste se tait autour.',
  'What if the grid was only a suggestion?',
  '余白は空っぽではない。',
  'Monter, c’est choisir ce qu’on ne montre pas. La coupe dit autant que le plan : elle décide du rythme, du souffle, de la place laissée au spectateur.',
  'Grain > pixels.',
  '雨の日の駅のホーム、蛍光灯の緑がかった白。あの色をずっと探している。',
  'Typography is what language looks like.',
  'Rouge Tokyo, gris Paris.',
  'On ne regarde jamais assez longtemps un mur vide. Ensuite on le remplit trop vite.',
];
const CAPTIONS = ['', 'Lumière de 17 h, Kamogawa.', '', '撮影の前の静けさ。', '', 'Repérage. Le cadre est déjà là avant la caméra.', ''];
const PROMPTS = ['trace', 'light', 'window', 'hands', 'dust'];       // une consigne par mois (du plus récent au plus ancien)

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** Une scène d'essai dessinée (portrait, architecture, paysage, papier, objets), en JPEG, sous forme d'adresse blob:. */
async function scene(kind, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(kind * 97 + 13), s = Math.min(W, H) / 900;
  if (kind === 0) {                                     // portrait
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#e8e2d6'); bg.addColorStop(1, '#5a5f69');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a1e18'; g.beginPath(); g.ellipse(W / 2, H * 0.42, 230 * s, 270 * s, 0, 0, 7); g.fill();
    const sk = g.createRadialGradient(W / 2 - 40 * s, H * 0.45, 30 * s, W / 2, H * 0.48, 230 * s); sk.addColorStop(0, '#f2cfb3'); sk.addColorStop(1, '#8a5f4c');
    g.fillStyle = sk; g.beginPath(); g.ellipse(W / 2, H * 0.49, 170 * s, 215 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#141c28'; g.fillRect(W / 2 - 220 * s, H * 0.72, 440 * s, H * 0.3);
  } else if (kind === 1) {                              // architecture
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#9fc3e6'); sky.addColorStop(1, '#f4f1ea');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const x = i * W / 7, h = H * (0.35 + r() * 0.5), shade = 40 + i * 22;
      g.fillStyle = `rgb(${shade},${shade - 8},${shade - 16})`; g.fillRect(x, H - h, W / 7 - 12 * s, h);
      g.fillStyle = 'rgba(255,255,230,.85)';
      for (let y = H - h + 20 * s; y < H - 30 * s; y += 46 * s) for (let k = 0; k < 3; k++) if (r() > .4) g.fillRect(x + 14 * s + k * 38 * s, y, 22 * s, 28 * s);
    }
  } else if (kind === 2) {                              // paysage à contre-jour
    const sky = g.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, '#203050'); sky.addColorStop(1, '#f0b070');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(W * 0.68, H * 0.33, 70 * s, 0, 7); g.fill();
    for (const [y, col] of [[0.58, '#3c4a5c'], [0.69, '#26303c'], [0.81, '#14181e']]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 40 * s) g.lineTo(x, H * y - Math.sin(x / (140 * s) + y * 10) * 60 * s - r() * 40 * s);
      g.lineTo(W, H); g.fill();
    }
  } else if (kind === 3) {                              // papier imprimé
    g.fillStyle = '#efe9dc'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#151515'; g.font = `700 ${150 * s}px Georgia, serif`; g.fillText('TRACE', 80 * s, H * 0.36);
    g.font = `400 ${50 * s}px Georgia, serif`; g.fillText('left by anyone', 80 * s, H * 0.48);
    g.fillStyle = '#b8352a'; g.fillRect(80 * s, H * 0.55, W * 0.45, 24 * s);
    g.fillStyle = '#555'; for (let y = H * 0.63; y < H * 0.95; y += 34 * s) g.fillRect(80 * s, y, W * (0.5 + r() * 0.35), 10 * s);
  } else {                                              // objets
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#2b2b2b'); bg.addColorStop(1, '#d8d8d8');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f2f2f2'; g.beginPath(); g.ellipse(W * 0.3, H * 0.45, W * 0.12, H * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = '#7a7a7a'; g.beginPath(); g.ellipse(W * 0.68, H * 0.5, W * 0.13, H * 0.33, 0, 0, 7); g.fill();
    g.fillStyle = '#4a4a4a'; g.fillRect(W * 0.45, H * 0.55, W * 0.12, H * 0.38);
  }
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
  return URL.createObjectURL(blob);
}

const SIZES = [[800, 600], [800, 450], [600, 800], [800, 330], [700, 700]];
let cache = null;
/** Les 70 faux dépôts, du plus récent (aujourd'hui) au plus ancien (≈ 150 jours). */
export async function demoPosts(now = Date.now()) {
  if (cache) return cache;
  const urls = await Promise.all(SIZES.map(([w, h], k) => scene(k, w, h)));
  const DAY = 86400e3, N = 70;
  let img = 0, txt = 0;
  cache = Array.from({ length: N }, (_, i) => {
    const days = (i / (N - 1)) * 150, approved = new Date(now - days * DAY), created = new Date(approved - 3600e3);
    const isImage = i % 2 === 0, k = img % 5, [w, h] = SIZES[k];
    const p = {
      id: `demo-${i}`, kind: isImage ? 'image' : 'text', name: '', size: ['m', 's', 'l'][i % 3],
      prompt: PROMPTS[Math.min(PROMPTS.length - 1, Math.floor(days / 30))],
      createdAt: created.toISOString(), approvedAt: approved.toISOString(), expired: false,
      text: isImage ? CAPTIONS[img % CAPTIONS.length] : TEXTS[txt % TEXTS.length],
      image: isImage ? { src: urls[k], thumb: urls[k], w, h } : null,
    };
    if (isImage) img++; else txt++;
    return p;
  });
  return cache;
}

// Page de comparaison des rendus (tools/looks/index.html). Aucune donnée envoyée, aucune vraie image incluse :
// les scènes d'essai sont dessinées ici, de façon déterministe (mêmes images à chaque ouverture).
import { LOOKS, filtersMarkup } from '../../js/looks.js';

const $ = s => document.querySelector(s);
const NAMES = Object.keys(LOOKS);                       // current, soft, copy
const STAGES = ['Neuve', '≈ 10 j', '≈ 22 j', '≈ 40 j', '≈ 73 j'];
const BGS = [['white', 'Blanc'], ['checker', 'Damier (transparence)'], ['stack', 'Superposé (mur)']];

// filtres des trois rendus, chacun avec son suffixe (#tone-soft, #erode3-copy…)
$('#filters').innerHTML = NAMES.map(n => filtersMarkup(n, `-${n}`)).join('');

// en-têtes
$('#heads').replaceChildren(...NAMES.map(n => {
  const d = document.createElement('div'), h = document.createElement('h2'), p = document.createElement('p');
  h.textContent = LOOKS[n].label; p.textContent = LOOKS[n].note; d.append(h, p); return d;
}));

// réglages
const chips = (box, name, items, checked) => {
  for (const [value, text] of items) {
    const l = document.createElement('label'); l.className = 'chip';
    const i = document.createElement('input'); i.type = 'radio'; i.name = name; i.value = value; i.checked = value === checked;
    const s = document.createElement('span'); s.textContent = text;
    l.append(i, s); box.append(l);
  }
};
chips($('#stage'), 'stage', STAGES.map((s, i) => [String(i), s]), '0');
chips($('#bg'), 'bg', BGS, 'white');

/* ------------------------------------------------------------------ scènes d'essai (déterministes) */
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function scene(kind) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
  const g = c.getContext('2d'), r = rng(kind.length * 97 + 13), W = c.width, H = c.height;
  if (kind === 'portrait') {
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#e8e2d6'); bg.addColorStop(1, '#8a8f99');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a2a22'; g.beginPath(); g.ellipse(600, 380, 230, 270, 0, 0, 7); g.fill();          // cheveux
    const sk = g.createRadialGradient(560, 400, 30, 600, 430, 230); sk.addColorStop(0, '#f2cfb3'); sk.addColorStop(1, '#a8775c');
    g.fillStyle = sk; g.beginPath(); g.ellipse(600, 440, 170, 215, 0, 0, 7); g.fill();               // visage
    g.fillStyle = '#2b2b2b'; for (const x of [535, 665]) { g.beginPath(); g.ellipse(x, 410, 22, 11, 0, 0, 7); g.fill(); }
    g.strokeStyle = '#7a3f35'; g.lineWidth = 9; g.beginPath(); g.arc(600, 520, 55, .2, Math.PI - .2); g.stroke();
    g.fillStyle = '#1f2a3a'; g.fillRect(380, 650, 440, 260);                                          // vêtement
    g.fillStyle = '#f7f7f2'; g.fillRect(560, 650, 80, 260);
  } else if (kind === 'architecture') {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#9fc3e6'); sky.addColorStop(1, '#f4f1ea');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 190, h = 300 + r() * 380, shade = 90 + i * 25;
      g.fillStyle = `rgb(${shade},${shade - 10},${shade - 20})`; g.fillRect(x, H - h, 170, h);
      g.fillStyle = 'rgba(255,255,230,.85)';
      for (let y = H - h + 20; y < H - 30; y += 46) for (let k = 0; k < 4; k++) if (r() > .35) g.fillRect(x + 14 + k * 38, y, 22, 28);
    }
    g.strokeStyle = '#222'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, H - 40); g.lineTo(W, H - 90); g.stroke();
  } else if (kind === 'paysage') {
    const sky = g.createLinearGradient(0, 0, 0, H * .6); sky.addColorStop(0, '#203050'); sky.addColorStop(1, '#f0b070');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(820, 300, 70, 0, 7); g.fill();
    for (const [y, col] of [[520, '#3c4a5c'], [620, '#26303c'], [730, '#14181e']]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, y - Math.sin(x / 140 + y) * 60 - r() * 40);
      g.lineTo(W, H); g.fill();
    }
  } else {                                                // texte et matière : affiche, papier, encre
    g.fillStyle = '#efe9dc'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) { const v = 200 + r() * 40; g.fillStyle = `rgba(${v},${v - 6},${v - 18},.35)`; g.fillRect(r() * W, r() * H, 3, 3); }
    g.fillStyle = '#151515'; g.font = '700 150px Georgia, serif'; g.fillText('TRACE', 120, 330);
    g.font = '400 54px Georgia, serif'; g.fillText('images and words, left by anyone', 120, 430);
    g.fillStyle = '#b8352a'; g.fillRect(120, 500, 520, 26);
    g.fillStyle = '#555'; for (let y = 580; y < 860; y += 34) g.fillRect(120, y, 700 + r() * 260, 10);
  }
  return c.toDataURL('image/jpeg', 0.9);
}
const SCENES = [['portrait', 'Portrait'], ['architecture', 'Architecture'], ['paysage', 'Paysage à contre-jour'], ['papier', 'Texte imprimé']]
  .map(([k, name]) => ({ name, src: scene(k) }));
const under = scene('architecture');

/* ------------------------------------------------------------------ grille */
function render() {
  const stage = +document.querySelector('input[name="stage"]:checked').value;
  const id = n => (stage ? `erode${stage}-${n}` : `tone-${n}`);
  const all = [...SCENES, ...(mine ? [{ name: 'Ta photo', src: mine }] : [])];
  $('#rows').replaceChildren(...all.flatMap(s => {
    const name = document.createElement('p'); name.className = 'scene-name'; name.textContent = s.name;
    const row = document.createElement('div'); row.className = 'row';
    row.append(...NAMES.map(n => {
      const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.label = LOOKS[n].label;
      const u = new Image(); u.className = 'under'; u.src = under; u.alt = ''; u.style.filter = `url(#${id(n)})`;
      const m = new Image(); m.className = 'main'; m.src = s.src; m.alt = `${s.name} — ${LOOKS[n].label}`; m.style.filter = `url(#${id(n)})`;
      cell.append(u, m); return cell;
    }));
    return [name, row];
  }));
}
let mine = null;
$('#mine').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  if (mine) URL.revokeObjectURL(mine);
  mine = URL.createObjectURL(f); render();               // lu sur l'appareil, jamais envoyé
});
document.addEventListener('change', e => {
  if (e.target.name === 'bg') document.body.dataset.bg = e.target.value;
  if (e.target.name === 'stage') render();
});
render();

// Règles du mur (lisibilité) : node tests/wall.test.mjs  → code de sortie 0 si tout est respecté.
// Les éléments dérivent lentement : on vérifie les règles au repos ET à des centaines d'instants
// du mouvement (plus le pire cas : deux voisins rapprochés au maximum).
import { layout, coverage, sizeFor, drift, offsetAt, DRIFT, SIZES } from '../js/wall.js';
import { SAMPLE_POSTS } from './fixtures.mjs';
const inter = (a, b) => { const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return x > 0 && y > 0 ? x * y : 0; };
const strip = (r, c) => ({ x: r.x, y: r.y + r.h - c, w: r.w, h: c });
let fail = 0;

for (const [W, mobile, limit] of [[1366,false,.3],[1920,false,.3],[1024,false,.3],[390,true,.15],[320,true,.15]]) {
  const A = mobile ? DRIFT.mobile : DRIFT.desktop, pad = mobile ? 16 : 24, g = mobile ? 28 : 24;
  const posts = Array.from({length:150},(_,i)=>({...SAMPLE_POSTS[i%SAMPLE_POSTS.length], id:'p'+i, size: SIZES[(i*7)%3]}));
  const boxes = posts.map(p=>{const s=sizeFor(p,W-2*pad-2*A,mobile);const h=p.kind==='text'?Math.round(s.font*1.45*Math.min(9,Math.ceil([...p.text].length*s.font*0.55/(s.w-32)))+60):Math.round(s.w*p.image.h/p.image.w);const capH=p.kind==='image'&&p.text?40:0;return {id:p.id,kind:p.kind,w:s.w,h:h+capH,capH};});
  const t0=performance.now(); const L = layout(boxes, W, {limit, pad, mobile, drift: A}); const ms=performance.now()-t0;
  const motions = boxes.map(b => drift(b.id, A));

  // 1. vitesse : quelques px/s au plus
  const vmax = Math.max(...motions.map(d => Math.hypot(d.ax * d.wx, d.ay * d.wy)));

  // 2. le plus récent toujours au-dessus
  const zWrong = L.overlaps.filter(([a, b]) => !(L.rects[Math.min(a, b)].z > L.rects[Math.max(a, b)].z)).length;

  // 3. règles à chaque instant (0 à 10 min, 600 instants) + pire cas (boîtes agrandies de A)
  const worst = { img: 0, textTouch: 0, textClose: 0, caption: 0, outside: 0 };
  const check = rects => {
    const cov = coverage(rects);
    cov.forEach((c, i) => { if (boxes[i].kind === 'image') worst.img = Math.max(worst.img, c); else if (c > 0) worst.textTouch++; });
    rects.forEach((a, i) => {
      if (a.x < pad - A - 0.01 || a.x + a.w > W - pad + A + 0.01) worst.outside++;
      if (boxes[i].kind === 'text') rects.forEach((b, j) => { if (i !== j && inter({ x: a.x - g, y: a.y - g, w: a.w + 2 * g, h: a.h + 2 * g }, b)) worst.textClose++; });
      if (boxes[i].capH) rects.forEach((b, j) => { if (i !== j && inter(strip(a, boxes[i].capH), b)) worst.caption++; });
    });
  };
  // seuls les voisins proches peuvent se toucher : on vérifie tout, mais sur un échantillon d'instants
  for (let k = 0; k <= 600; k += 1) {
    const t = k;            // secondes
    check(L.rects.map((r, i) => { const o = offsetAt(motions[i], t); return { ...r, x: r.x + o.x, y: r.y + o.y }; }));
  }
  // pire cas pour chaque paire de voisins : l'un pousse au maximum vers l'autre
  let worstPair = 0;
  for (const [a, b] of L.overlaps) {
    const [hi, lo] = L.rects[a].z > L.rects[b].z ? [L.rects[a], L.rects[b]] : [L.rects[b], L.rects[a]];
    const G = r => ({ x: r.x - A, y: r.y - A, w: r.w + 2 * A, h: r.h + 2 * A });
    worstPair = Math.max(worstPair, inter(G(hi), G(lo)) / (lo.w * lo.h));
  }
  const imageCoveredWorst = Math.max(...boxes.map((b, i) => b.kind !== 'image' ? 0 :
    L.overlaps.filter(([x, y]) => x === i || y === i).reduce((s, [x, y]) => { const j = x === i ? y : x; if (L.rects[j].z < L.rects[i].z) return s;
      const G = r => ({ x: r.x - A, y: r.y - A, w: r.w + 2 * A, h: r.h + 2 * A }); return s + inter(G(L.rects[i]), G(L.rects[j])); }, 0) / (L.rects[i].w * L.rects[i].h)));

  const ok = vmax <= 3.1 && zWrong === 0 && worst.img <= limit + 1e-9 && worst.textTouch === 0 && worst.textClose === 0 && worst.caption === 0 && worst.outside === 0 && imageCoveredWorst <= limit + 1e-9;
  if (!ok) fail++;
  console.log(ok ? 'OK ' : 'ÉCHEC', { W, ms: Math.round(ms), vitesseMaxPxS: vmax.toFixed(2), ordreFaux: zWrong, maxImageCouverteEnMouvement: worst.img.toFixed(3),
    pireCasImage: imageCoveredWorst.toFixed(3), textesTouchés: worst.textTouch, textesTropProches: worst.textClose, commentairesRecouverts: worst.caption, horsCadre: worst.outside,
    imagesChevauchées: L.overlaps.length, parÉcran: (150 / (L.height / (mobile ? 700 : 800))).toFixed(1) });
}
process.exit(fail);

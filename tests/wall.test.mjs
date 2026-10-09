// Règles du mur (lisibilité) : node tests/wall.test.mjs  → code de sortie 0 si tout est respecté.
// Les éléments dérivent lentement : on vérifie les règles au repos ET à des centaines d'instants
// du mouvement (plus le pire cas : deux voisins rapprochés au maximum).
import { layout, createLayout, coverage, sizeFor, drift, offsetAt, MOTIONS, REACT, SIZES } from '../js/wall.js';
import { SAMPLE_POSTS } from './fixtures.mjs';
const inter = (a, b) => { const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return x > 0 && y > 0 ? x * y : 0; };
const strip = (r, c) => ({ x: r.x, y: r.y + r.h - c, w: r.w, h: c });
let fail = 0;

for (const style of Object.keys(MOTIONS))
for (const [W, mobile, limit] of [[1366,false,.3],[1920,false,.3],[1024,false,.3],[390,true,.15],[320,true,.15]]) {
  // marge réservée : dérive A + écartement R (+ inclinaison T sur iPhone) ; on teste le cas le plus large
  const Ad = MOTIONS[style].A[mobile ? 'mobile' : 'desktop'], E = mobile ? REACT.R.mobile + REACT.T : REACT.R.desktop, A = Ad + E;
  const pad = mobile ? 16 : 24, g = mobile ? 28 : 24;
  const posts = Array.from({length:150},(_,i)=>({...SAMPLE_POSTS[i%SAMPLE_POSTS.length], id:'p'+i, size: SIZES[(i*7)%3]}));
  const boxes = posts.map(p=>{const s=sizeFor(p,W-2*pad-2*A,mobile);const h=p.kind==='text'?Math.round(s.font*1.45*Math.min(9,Math.ceil([...p.text].length*s.font*0.55/(s.w-32)))+60):Math.round(s.w*p.image.h/p.image.w);const capH=p.kind==='image'&&p.text?40:0;return {id:p.id,kind:p.kind,w:s.w,h:h+capH,capH};});
  const t0=performance.now(); const L = layout(boxes, W, {limit, pad, mobile, drift: A}); const ms=performance.now()-t0;
  const motions = boxes.map((b, i) => drift(b.id, Ad, style, { x: L.rects[i].x, y: L.rects[i].y, W }));
  // écartement + inclinaison : au pire, poussés au maximum (±E) dans des sens changeants
  const react = (i, t) => ({ x: E * Math.sign(Math.sin(1.7 * t + i)), y: E * Math.sign(Math.cos(1.1 * t + 2 * i)) });

  // 0. placement progressif (par morceaux) = placement d'un coup
  const P = createLayout(W, boxes.length, { limit, pad, mobile, drift: A });
  const chunked = [...boxes.slice(0, 7).map(b => P.add(b)), ...boxes.slice(7).map(b => P.add(b))];
  const sameAsWhole = JSON.stringify(chunked) === JSON.stringify(L.rects) && P.height() === L.height;

  // 1. vitesse (mesurée) et amplitude : jamais plus que le style ne le permet
  let vmax = 0, amp = 0;
  motions.forEach(d => { for (let t = 0; t < 120; t += 0.37) { const a = offsetAt(d, t), b = offsetAt(d, t + 0.01);
    vmax = Math.max(vmax, Math.hypot(b.x - a.x, b.y - a.y) / 0.01); amp = Math.max(amp, Math.abs(a.x) + E, Math.abs(a.y) + E); } });

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
    check(L.rects.map((r, i) => { const o = offsetAt(motions[i], t), e = react(i, t); return { ...r, x: r.x + o.x + e.x, y: r.y + o.y + e.y }; }));
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

  const ok = sameAsWhole && vmax <= MOTIONS[style].vmax + 0.05 && amp <= A + 1e-9 && zWrong === 0 && worst.img <= limit + 1e-9 && worst.textTouch === 0 && worst.textClose === 0 && worst.caption === 0 && worst.outside === 0 && imageCoveredWorst <= limit + 1e-9;
  if (!ok) fail++;
  console.log(ok ? 'OK ' : 'ÉCHEC', { style, W, ms: Math.round(ms), progressifIdentique: sameAsWhole, amplitudeMax: amp.toFixed(1), vitesseMaxPxS: vmax.toFixed(2), ordreFaux: zWrong, maxImageCouverteEnMouvement: worst.img.toFixed(3),
    pireCasImage: imageCoveredWorst.toFixed(3), textesTouchés: worst.textTouch, textesTropProches: worst.textClose, commentairesRecouverts: worst.caption, horsCadre: worst.outside,
    imagesChevauchées: L.overlaps.length, parÉcran: (150 / (L.height / (mobile ? 700 : 800))).toFixed(1) });
}
process.exit(fail);

// Règles du mur (lisibilité) : node tests/wall.test.mjs  → code de sortie 0 si tout est respecté.
import { layout, coverage, sizeFor } from '../js/wall.js';
import { SAMPLE_POSTS } from './fixtures.mjs';
const inter = (a, b) => { const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return x > 0 && y > 0 ? x * y : 0; };
let fail = 0;
for (const [W, mobile, limit] of [[1366,false,.3],[1920,false,.3],[1024,false,.3],[390,true,.15],[320,true,.15]]) {
  const posts = Array.from({length:150},(_,i)=>({...SAMPLE_POSTS[i%SAMPLE_POSTS.length], id:'p'+i}));
  const boxes = posts.map(p=>{const s=sizeFor(p,W-2*(mobile?16:24),mobile);const h=p.kind==='text'?Math.round(s.font*1.45*Math.min(9,Math.ceil([...p.text].length*s.font*0.55/(s.w-32)))+60):Math.round(s.w*p.image.h/p.image.w);const capH=p.kind==='image'&&p.text?40:0;return {id:p.id,kind:p.kind,w:s.w,h:h+capH,capH};});
  const t0=performance.now(); const L = layout(boxes, W, {limit, pad: mobile?16:24, mobile}); const ms=performance.now()-t0;
  const cov = coverage(L.rects);
  const textCovered = cov.filter((c,i)=>boxes[i].kind==='text' && c>0).length;
  const textText = L.overlaps.filter(([a,b])=>boxes[a].kind==='text'||boxes[b].kind==='text').length;   // un texte ne touche rien
  const maxImg = Math.max(...cov.filter((c,i)=>boxes[i].kind==='image'));
  const outside = L.rects.filter(r=>r.x<0||r.x+r.w>W).length;
  const strip = (r, c) => ({ x: r.x, y: r.y + r.h - c, w: r.w, h: c });
  const g = mobile ? 28 : 24, grow = r => ({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g });
  let textTooClose = 0;
  L.rects.forEach((a, i) => { if (boxes[i].kind !== 'text') return; L.rects.forEach((b, j) => { if (i !== j && inter(grow(a), b)) textTooClose++; }); });
  let captionsCovered = 0;
  L.rects.forEach((a, i) => { if (!boxes[i].capH) return; L.rects.forEach((b, j) => { if (i !== j && inter(strip(a, boxes[i].capH), b)) captionsCovered++; }); });
  const ok = textTooClose===0 && captionsCovered===0 && textCovered===0 && textText===0 && maxImg<=limit+1e-9 && outside===0;
  if (!ok) fail++;
  console.log(ok?'OK ':'ÉCHEC', {W, ms:Math.round(ms), commentairesRecouverts:captionsCovered, textesTropProches:textTooClose, maxImageCouverte:maxImg.toFixed(3), textesRecouverts:textCovered, chevauchementsAvecTexte:textText, imagesChevauchées: cov.filter((c,i)=>boxes[i].kind==='image'&&c>0.01).length, parÉcran:(150/(L.height/(mobile?700:800))).toFixed(1)});
}
process.exit(fail);

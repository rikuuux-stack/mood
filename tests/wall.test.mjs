// Règles du mur (lisibilité) : node tests/wall.test.mjs  → code de sortie 0 si tout est respecté.
import { layout, coverage, sizeFor } from '../js/wall.js';
import { MOCK_POSTS } from '../js/mock.js';
const inter = (a, b) => { const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return x > 0 && y > 0 ? x * y : 0; };
let fail = 0;
for (const [W, mobile, limit] of [[1366,false,.3],[1920,false,.3],[1024,false,.3],[390,true,.15],[320,true,.15]]) {
  const posts = Array.from({length:150},(_,i)=>({...MOCK_POSTS[i%MOCK_POSTS.length], id:'p'+i}));
  const boxes = posts.map(p=>{const s=sizeFor(p,W-2*(mobile?16:24),mobile);const h=p.kind==='text'?Math.round(s.font*1.45*Math.min(9,Math.ceil([...p.text].length*s.font*0.55/(s.w-32)))+60):Math.round(s.w*p.image.h/p.image.w);return {id:p.id,kind:p.kind,w:s.w,h};});
  const t0=performance.now(); const L = layout(boxes, W, {limit, pad: mobile?16:24, mobile}); const ms=performance.now()-t0;
  const cov = coverage(L.rects);
  const textCovered = cov.filter((c,i)=>boxes[i].kind==='text' && c>0).length;
  const textText = L.overlaps.filter(([a,b])=>boxes[a].kind==='text'&&boxes[b].kind==='text').length;
  const maxImg = Math.max(...cov.filter((c,i)=>boxes[i].kind==='image'));
  const outside = L.rects.filter(r=>r.x<0||r.x+r.w>W).length;
  const ok = textCovered===0 && textText===0 && maxImg<=limit+1e-9 && outside===0;
  if (!ok) fail++;
  console.log(ok?'OK ':'ÉCHEC', {W, ms:Math.round(ms), maxImageCouverte:maxImg.toFixed(3), textesRecouverts:textCovered, texteSurTexte:textText, imagesChevauchées: cov.filter((c,i)=>boxes[i].kind==='image'&&c>0.01).length, parÉcran:(150/(L.height/(mobile?700:800))).toFixed(1)});
}
process.exit(fail);

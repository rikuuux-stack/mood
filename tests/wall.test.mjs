// Règles du mur : node tests/wall.test.mjs  → code de sortie 0 si tout est respecté.
// Le mur est immobile ; c'est le temps qui le transforme (érosion, strates).
import { layout, createLayout, coverage, sizeFor, SIZES, visibility, onWall, strataKey, TIME } from '../js/wall.js';
import { CONFIG } from '../js/config.js';
import { SAMPLE_POSTS } from './fixtures.mjs';
const inter = (a, b) => { const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return x > 0 && y > 0 ? x * y : 0; };
const strip = (r, c) => ({ x: r.x, y: r.y + r.h - c, w: r.w, h: c });
let fail = 0;
const check = (label, ok, info = '') => { if (!ok) fail++; console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${label}${info ? ' → ' + info : ''}`); };

// 1. placement : recouvrement réduit (18 % ordinateur, 8 % iPhone), aucun texte ne touche rien
check('recouvrement maximal : 18 % ordinateur, 8 % iPhone', CONFIG.wall.overlap === 0.18 && CONFIG.wall.overlapMobile === 0.08);
for (const [W, mobile] of [[1366, false], [1920, false], [1024, false], [390, true], [320, true]]) {
  const limit = mobile ? CONFIG.wall.overlapMobile : CONFIG.wall.overlap, pad = mobile ? 16 : 24, g = mobile ? 28 : 24;
  const posts = Array.from({ length: 150 }, (_, i) => ({ ...SAMPLE_POSTS[i % SAMPLE_POSTS.length], id: 'p' + i, size: SIZES[(i * 7) % 3] }));
  const boxes = posts.map(p => { const s = sizeFor(p, W - 2 * pad, mobile); const h = p.kind === 'text' ? Math.round(s.font * 1.45 * Math.min(9, Math.ceil([...p.text].length * s.font * 0.55 / (s.w - 32))) + 60) : Math.round(s.w * p.image.h / p.image.w); const capH = p.kind === 'image' && p.text ? 40 : 0; return { id: p.id, kind: p.kind, w: s.w, h: h + capH, capH }; });
  const t0 = performance.now(); const L = layout(boxes, W, { limit, pad, mobile }); const ms = performance.now() - t0;
  // par morceaux (placement progressif) = d'un coup
  const P = createLayout(W, boxes.length, { limit, pad, mobile });
  const same = JSON.stringify([...boxes.slice(0, 7).map(b => P.add(b)), ...boxes.slice(7).map(b => P.add(b))]) === JSON.stringify(L.rects);
  const cov = coverage(L.rects);
  const maxImg = Math.max(...cov.filter((c, i) => boxes[i].kind === 'image'));
  const textTouched = cov.filter((c, i) => boxes[i].kind === 'text' && c > 0).length;
  let textClose = 0, captions = 0, outside = 0, zWrong = 0;
  L.rects.forEach((a, i) => {
    if (a.x < pad - 0.01 || a.x + a.w > W - pad + 0.01) outside++;
    if (boxes[i].kind === 'text') L.rects.forEach((b, j) => { if (i !== j && inter({ x: a.x - g, y: a.y - g, w: a.w + 2 * g, h: a.h + 2 * g }, b)) textClose++; });
    if (boxes[i].capH) L.rects.forEach((b, j) => { if (i !== j && inter(strip(a, boxes[i].capH), b)) captions++; });
  });
  for (const [a, b] of L.overlaps) if (!(L.rects[Math.min(a, b)].z > L.rects[Math.max(a, b)].z)) zWrong++;
  const ok = same && maxImg <= limit + 1e-9 && !textTouched && !textClose && !captions && !outside && !zWrong;
  check(`mur ${W} px`, ok, JSON.stringify({ ms: Math.round(ms), progressifIdentique: same, maxImageCouverte: +maxImg.toFixed(3), textesTouchés: textTouched, textesTropProches: textClose,
    commentairesRecouverts: captions, horsCadre: outside, ordreFaux: zWrong, parÉcran: +(150 / (L.height / (mobile ? 700 : 800))).toFixed(1) }));
}

// 2. strate décalée : une deuxième strate commence sous la première
{
  const A = createLayout(1366, 4, { top: 0 }), B = createLayout(1366, 4, { top: 500, first: 2 });
  const a = A.add({ id: 'a', kind: 'image', w: 200, h: 150 }), b = B.add({ id: 'b', kind: 'image', w: 200, h: 150 });
  check('strates : la suivante commence plus bas, ordre d’empilement continu', b.y >= 500 && a.z === 4 && b.z === 2, `y ${a.y} / ${b.y}, z ${a.z} / ${b.z}`);
}

// 3. érosion (courbe « Saison », 90 jours) : intacte 7 jours, puis de plus en plus pâle, jamais sous 30 %
const v = d => +visibility(d).toFixed(2);
check('érosion : 100 % jusqu’à 7 jours', v(0) === 1 && v(7) === 1);
check('érosion : ≈ 70 % à 30 jours, ≈ 39 % à 90 jours, ≈ 31 % à 180 jours', Math.abs(v(30) - 0.7) <= 0.02 && Math.abs(v(90) - 0.39) <= 0.02 && Math.abs(v(180) - 0.31) <= 0.02, `${v(30)} / ${v(90)} / ${v(180)}`);
let mono = true, floor = true;
for (let d = 0; d < 2000; d += 0.5) { if (visibility(d + 0.5) > visibility(d) + 1e-12) mono = false; if (visibility(d) < TIME.floor) floor = false; }
check('érosion : jamais de remontée, jamais sous 30 %, aucune disparition brutale', mono && floor);
check('fin de vie : sur le mur jusqu’à 180 jours, ensuite seulement dans la liste', onWall(0) && onWall(179.9) && !onWall(180) && !onWall(400));

// 4. strates : un mois et une consigne ; un mois sans consigne forme sa propre strate
check('strates : même mois + même consigne = même strate', strataKey({ createdAt: '2026-10-02T10:00:00Z', prompt: 'trace.' }) === strataKey({ createdAt: '2026-10-28T10:00:00Z', prompt: 'trace.' }));
check('strates : nouvelle consigne ou nouveau mois = nouvelle strate',
  strataKey({ createdAt: '2026-10-02T10:00:00Z', prompt: 'trace.' }) !== strataKey({ createdAt: '2026-10-03T10:00:00Z', prompt: 'light.' })
  && strataKey({ createdAt: '2026-10-02T10:00:00Z', prompt: '' }) !== strataKey({ createdAt: '2026-11-02T10:00:00Z', prompt: '' }));
process.exit(fail ? 1 : 0);

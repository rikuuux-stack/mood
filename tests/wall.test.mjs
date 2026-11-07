// Règles du mur : node tests/wall.test.mjs  → code de sortie 0 si tout est respecté.
// Le mur est fixe et immobile ; c'est le temps qui le transforme (érosion, bords rongés, enfouissement).
import { sizeFor, SIZES, visibility, stageOf, onWall, strataKey, TIME, TONE, BASE, ERODE, GRAIN, PAGE_GRAIN, negative, alphaOf } from '../js/wall.js';
import { readFileSync } from 'node:fs';
import { stackLayout, STACK_N } from '../js/stack.js';
import { wornPolygon } from '../js/edge.js';
import { SAMPLE_POSTS } from './fixtures.mjs';
let fail = 0;
const check = (label, ok, info = '') => { if (!ok) fail++; console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${label}${info ? ' → ' + info : ''}`); };

// 1. mur fixe (js/stack.js) : N dépôts au plus, tout dans l'écran, le plus récent au-dessus, textes au-dessus des images,
//    placement identique d'un rendu à l'autre
check('mur fixe : 16 dépôts sur iPhone, 40 sur ordinateur', STACK_N.mobile === 16 && STACK_N.desktop === 40);
for (const [W, H, mobile] of [[1366, 700, false], [1920, 950, false], [390, 700, true], [320, 520, true]]) {
  const pad = mobile ? 16 : 24, n = mobile ? STACK_N.mobile : STACK_N.desktop, now = Date.parse('2026-11-07T00:00:00Z');
  const posts = Array.from({ length: n }, (_, i) => ({ ...SAMPLE_POSTS[i % SAMPLE_POSTS.length], id: 'p' + i, size: SIZES[(i * 7) % 3],
    approvedAt: new Date(now - i * 6 * 86400e3).toISOString() }));
  const nodes = posts.map(p => { const s = sizeFor(p, W - 2 * pad, mobile); const h = p.kind === 'text' ? 90 : Math.round(s.w * p.image.h / p.image.w); return { p, w: s.w, h }; });
  const A = stackLayout(nodes, W, H, { top: 0, pad, now }), B = stackLayout(nodes, W, H, { top: 0, pad, now });
  let outside = 0, zWrong = 0, textUnder = 0;
  A.places.forEach((r, i) => {
    if (r.x < pad - 0.5 || r.x + nodes[i].w > W - pad + 0.5 || r.y < -0.5 || r.y + Math.min(nodes[i].h, H - pad) > H + 0.5) outside++;
    A.places.forEach((q, j) => {
      const ti = nodes[i].p.kind === 'text', tj = nodes[j].p.kind === 'text';
      if (i < j && ti === tj && !(r.z > q.z)) zWrong++;           // à type égal, le plus récent au-dessus
      if (ti && !tj && !(r.z > q.z)) textUnder++;                   // un texte passe toujours au-dessus d'une image
    });
  });
  const months = new Set(posts.map(p => p.approvedAt.slice(0, 7))).size;
  check(`mur fixe ${W}×${H}`, !outside && !zWrong && !textUnder && JSON.stringify(A) === JSON.stringify(B) && A.bands.length === months,
    JSON.stringify({ horsÉcran: outside, ordreFaux: zWrong, texteSousImage: textUnder, bandes: A.bands.map(b => b.label).join(' ') }));
}

// 2. bords rongés (js/edge.js) : même contour pour un même dépôt, presque droit au dépôt, de plus en plus mordu
{
  const area = pts => Math.abs(pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0) / 2);
  const same = JSON.stringify(wornPolygon('abc', 3, 1.5)) === JSON.stringify(wornPolygon('abc', 3, 1.5));
  const areas = [0, 1, 2, 3, 4].map(s => area(wornPolygon('abc', s, 1.5)));
  const inside = [0, 1, 2, 3, 4].every(s => wornPolygon('abc', s, 0.7).every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  check('bords : même contour pour un même dépôt, presque entier au dépôt, rongé palier après palier, jamais hors de l’image',
    same && areas[0] > 0.98 && areas.every((a, i) => !i || a <= areas[i - 1] + 1e-9) && areas[4] < areas[0] - 0.05 && inside,
    areas.map(a => a.toFixed(3)).join(' → '));
  check('bords : deux dépôts différents, deux contours différents', JSON.stringify(wornPolygon('abc', 4)) !== JSON.stringify(wornPolygon('abd', 4)));
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
{
  const st = d => stageOf(visibility(d));
  const days = Array.from({ length: 181 }, (_, d) => st(d));
  check('érosion par paliers : neuve jusqu’à 10 j, 4 paliers fixes, palier 4 dès ≈ 73 j',
    st(0) === 0 && st(10) === 0 && st(11) === 1 && st(23) === 2 && st(41) === 3 && st(74) === 4 && st(179) === 4);
  check('paliers : jamais de retour en arrière avec l’âge', days.every((s, i) => i === 0 || s >= days[i - 1]));
  check('paliers : seulement 0 à 4 (cinq classes CSS, quatre filtres)', new Set(days).size === 5 && Math.max(...days) === 4);
}
{
  // l'écran (filtres SVG de index.html) et l'export « Keep » (js/fragment.js, en pixels) utilisent les mêmes valeurs
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const filter = id => html.match(new RegExp(`<filter id="${id}"[\\s\\S]*?</filter>`))?.[0] || '';
  const neg = [...TONE].reverse().join(' ');            // inversion + courbe dans une seule table
  check('négatif identique : écran (#tone, #erode1…4 : table « TONE à l’envers ») et export / vidéo (negative)', ['tone', 'erode1', 'erode2', 'erode3', 'erode4']
    .every(id => (filter(id).match(/tableValues="([^"]+)"/g) || []).length === 3 && filter(id).includes(`tableValues="${neg}"`))
    && [0, 0.25, 0.5, 0.75, 1].every((x, i) => Math.abs(negative(x) - TONE[4 - i]) < 0.002));
  check('négatif : le plus clair s’arrête à 76 % (jamais confondu avec le fond blanc), le noir du négatif vaut 0 (puis transparent : BASE)',
    Math.abs(negative(0) - 0.76) < 0.002 && negative(1) === 0 && Array.from({ length: 101 }, (_, i) => negative(i / 100)).every((v, i, a) => i === 0 || v <= a[i - 1] + 1e-9));
  const fmt = x => String(+x.toFixed(4));
  const alphaRow = e => `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${fmt(e.k)} 0 0 0 ${fmt(1 - e.k * e.t)}"`;   // alpha = k × gris + (1 − k × t)
  check('noir transparent dès le dépôt (sous 30 % de gris, fondu jusqu’à 45 %) : écran (#tone) et export (BASE) identiques', filter('tone').includes(alphaRow(BASE))
    && alphaOf(0, BASE) === 0 && alphaOf(0.3, BASE) < 0.01 && alphaOf(0.45, BASE) === 1 && alphaOf(0.76, BASE) === 1);
  check('paliers d’érosion identiques : écran (#erode1…4) et export (ERODE)', ERODE.every((e, i) => {
    const f = filter(`erode${i + 1}`);
    const grain = e.g ? f.includes(`values="${fmt(e.g)} 0 0 0 ${fmt(0.5 - e.g * 0.5)}`) && f.includes('feTurbulence') : !f.includes('feTurbulence');
    return f.includes(alphaRow(e)) && grain;
  }));
  check('l’image se désagrège avec le temps : à chaque palier, plus de gris deviennent transparents ; le plus clair (76 %) reste',
    [BASE, ...ERODE].every((e, i, all) => alphaOf(0.76, e) === 1
      && (i === 0 || [0.1, 0.2, 0.3, 0.4, 0.5].every(g => alphaOf(g, e) <= alphaOf(g, all[i - 1]))) && (i === 0 || alphaOf(0.3, e) < alphaOf(0.3, all[i - 1]) || alphaOf(0.3, all[i - 1]) === 0)));
  // grain : aucun dans la direction « blanc » (ni fond de page ni photos) — même valeur à l'écran et à l'export
  const css = readFileSync(new URL('../css/site.css', import.meta.url), 'utf8');
  check('grain : même réglage à l’écran (css/site.css) et à l’export (GRAIN, PAGE_GRAIN)',
    (GRAIN === 0) === !/\.photo::after\s*\{/.test(css) && (PAGE_GRAIN === 0) === !/body::before\s*\{/.test(css));
}
{
  // strates : fuseau de référence du mur = Asia/Tokyo, quel que soit le fuseau du visiteur.
  // 2026-09-30T15:30Z = 1er octobre 0 h 30 à Tokyo (30 septembre à Paris, à Los Angeles et en UTC).
  const was = process.env.TZ, iso = '2026-09-30T15:30:00Z', before = '2026-09-30T14:50:00Z';   // before : 30 sept. 23 h 50 à Tokyo
  const seen = {};
  for (const tz of ['Asia/Tokyo', 'Europe/Paris', 'America/Los_Angeles', 'UTC']) {
    process.env.TZ = tz;
    seen[tz] = [strataKey({ createdAt: iso, prompt: 'x' }), strataKey({ createdAt: before, prompt: 'x' })].join(' / ');
  }
  if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
  check('strates : 1er oct. 0 h 30 (Tokyo) en octobre, 30 sept. 23 h 50 (Tokyo) en septembre, pour un visiteur à Tokyo, Paris, Los Angeles ou en UTC',
    Object.values(seen).every(v => v === '2026-10|x / 2026-09|x'), JSON.stringify(seen));
}
process.exit(fail ? 1 : 0);

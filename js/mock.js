/**
 * Faux contenus pour la maquette (mode 'mock'). Même forme que ce que renverra Supabase :
 *   { id, kind: 'image'|'text', text, image: { src, thumb, w, h }, name, isRiku, createdAt }
 */
const img = (n, w, h) => ({ src: `assets/mock/m${n}.webp`, thumb: `assets/mock/m${n}-thumb.webp`, w, h });

const raw = [
  { kind: 'image', image: img('01', 1400, 1050), isRiku: true },
  { kind: 'text', text: 'Le béton garde la mémoire du coffrage. Chaque planche y laisse sa trace.', name: 'Mina' },
  { kind: 'image', image: img('02', 1400, 788), name: 'kenji_t', text: 'Lumière de 17 h, Kamogawa.' },
  { kind: 'text', text: '光は、壁に触れてはじめて見える。', name: 'あお' },
  { kind: 'image', image: img('04', 787, 1050), name: 'Léa' },
  { kind: 'text', text: 'Less, but louder.', isRiku: true },
  { kind: 'image', image: img('03', 1400, 577) },
  { kind: 'text', text: 'Une couleur seule, posée au bon endroit, vaut mieux qu’une palette entière. Le vermillon des torii, le jaune d’un ticket de métro, le bleu d’une bâche sur un chantier à Osaka : on ne les remarque que parce que tout le reste se tait autour.', name: 'Camille R.' },
  { kind: 'image', image: img('05', 1400, 1050), name: 'studio hiru', text: '撮影の前の静けさ。' },
  { kind: 'text', text: 'What if the grid was only a suggestion?', name: 'J. Park' },
  { kind: 'image', image: img('09', 1050, 1050), isRiku: true },
  { kind: 'text', text: '余白は空っぽではない。' },
  { kind: 'image', image: img('06', 1400, 788), name: 'Noam' },
  { kind: 'text', text: 'Monter, c’est choisir ce qu’on ne montre pas. La coupe dit autant que le plan : elle décide du rythme, du souffle, de la place laissée au spectateur. Je garde toujours une seconde de trop au début d’un plan, puis je la retire au dernier moment.', isRiku: true },
  { kind: 'image', image: img('07', 1400, 788), name: 'yuki' },
  { kind: 'text', text: 'Grain > pixels.', name: 'tom' },
  { kind: 'image', image: img('11', 840, 1050), name: 'Inès' },
  { kind: 'text', text: '雨の日の駅のホーム、蛍光灯の緑がかった白。あの色をずっと探している。', name: 'みさき' },
  { kind: 'image', image: img('08', 1280, 960), text: 'Small file, many words: this one is only 1280 px wide, so it leaves room for a longer note about the light in the corridor and the way the fluorescent tubes hum.' },
  { kind: 'text', text: 'Typography is what language looks like.', name: 'E. Lupton (cité par Sam)' },
  { kind: 'image', image: img('10', 1400, 577), isRiku: true, text: 'Repérage. Le cadre est déjà là avant la caméra.' },
  { kind: 'text', text: 'Rouge Tokyo, gris Paris.', name: 'Hugo' },
  { kind: 'image', image: img('12', 1400, 788), name: 'mai' },
  { kind: 'text', text: 'On ne regarde jamais assez longtemps un mur vide. Ensuite on le remplit trop vite. Ce texte fait exprès presque cinq cents caractères pour vérifier comment un long dépôt se comporte sur le mur : il doit rester lisible, à fort contraste, et ne jamais descendre sous la taille minimale, même sur un petit téléphone. S’il est trop long pour la vignette, il est coupé proprement et on le lit en entier en touchant le sticker. Voilà, c’est à peu près la limite.', name: 'test long' },
];

const start = Date.parse('2026-10-08T12:00:00Z');
export const MOCK_POSTS = raw.map((p, i) => ({
  id: `mock-${String(i + 1).padStart(3, '0')}`,
  text: '', image: null, name: '', isRiku: false,
  createdAt: new Date(start - i * 7.3 * 3600e3).toISOString(),
  ...p,
}));

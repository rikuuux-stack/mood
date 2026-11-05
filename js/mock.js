/**
 * Mode maquette (CONFIG.mode = 'mock') : le mur est vide.
 * Les vrais dépôts viendront de Supabase, une fois validés.
 * Forme d'un dépôt : { id, kind: 'image'|'text', text, image: { src, thumb, w, h }, name, size, prompt, createdAt, approvedAt }
 */
export const MOCK_POSTS = [];

/**
 * ?mock=expired — démonstration de la vue List avec des dépôts EXPIRÉS (au-delà de 180 jours, fichiers supprimés,
 * seule la ligne reste) et quelques textes. Fausses données générées : aucune image, aucun nom. Jamais affichées
 * sans ce paramètre ; rien ne peut être envoyé en mode maquette.
 */
export function expiredDemo(now = Date.now()) {
  const DAY = 86400e3, prompts = ['trace', 'light', 'window', 'hands', '', 'dust', 'rain'];
  const words = ['Less, but louder.', 'Grain > pixels.', 'What if the grid was only a suggestion?', '余白は空っぽではない。'];
  return Array.from({ length: 24 }, (_, i) => {
    const days = 186 + i * 9, at = new Date(now - days * DAY).toISOString();
    const kind = ['image', 'image', 'video', 'text', 'image', 'video'][i % 6];
    return { id: `demo-${i}`, kind, text: kind === 'text' ? words[i % words.length] : '', name: '', size: 'm',
      prompt: prompts[Math.floor(days / 30) % prompts.length], createdAt: at, approvedAt: at, image: null, expired: kind !== 'text' };
  });
}

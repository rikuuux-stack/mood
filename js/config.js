/**
 * Réglages du site. Tout ce qui est ici est PUBLIC (le dépôt est public) :
 * n'y mets jamais de clé secrète. Seules la clé « anon » de Supabase et la
 * clé publique (site key) de Turnstile ont le droit d'y figurer.
 */
export const CONFIG = {
  // 'mock' : maquette, faux contenus, aucun envoi. 'live' : branché sur Supabase.
  mode: 'mock',

  supabaseUrl: '',          // ex. https://xxxx.supabase.co
  supabaseAnonKey: '',      // clé « anon » (publique)
  turnstileSiteKey: '',     // clé publique Turnstile

  contactEmail: 'rikuuux@gmail.com',

  upload: {
    maxBytes: 5 * 1024 * 1024,                         // 5 Mo
    types: ['image/jpeg', 'image/png', 'image/webp'],
    maxSide: 2000,                                     // px, grande image
    thumbSide: 800,                                    // px, miniature du mur
    maxText: 500,
    maxName: 40,
  },

  wall: {
    pageSize: 150,          // éléments affichés avant « voir plus anciens »
    overlap: 0.30,          // part maximale d'un élément recouverte (ordinateur)
    overlapMobile: 0.15,    // idem sur mobile : densité réduite
    mobileBelow: 640,       // largeur (px) sous laquelle on passe en mise en page mobile
  },
};

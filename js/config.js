/**
 * Réglages du site. Tout ce qui est ici est PUBLIC (le dépôt est public) :
 * n'y mets jamais de clé secrète. Seules la clé « anon » de Supabase et la
 * clé publique (site key) de Turnstile ont le droit d'y figurer.
 */
export const CONFIG = {
  // 'live' : branché sur Supabase. 'mock' : maquette (mur vide, aucun envoi) — aussi avec ?mock dans l'URL.
  mode: 'live',

  supabaseUrl: 'https://ovvdtthnykqvgarrjina.supabase.co',
  // clé « anon » : PUBLIQUE par nature, protégée par les règles RLS (seule la vue « wall » est lisible)
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92dmR0dGhueWtxdmdhcnJqaW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MzI4MTYsImV4cCI6MjEwNzEwODgxNn0.OV-yWqBOF0vs47Mm6994ExYS--XvitjiyNEJ9tzr1pM',
  turnstileSiteKey: '0x4AAAAAAFSIN7Gn9I0x45WP',   // clé publique (site key) Turnstile

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

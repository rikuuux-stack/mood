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

  // adresse de contact affichée sur le site (panneau Mood, mentions « demande de retrait ») : LA SEULE à changer
  // le jour où une adresse neutre la remplace. (Distincte du compte administrateur et des alertes e-mail : voir CLAUDE.md.)
  contactEmail: 'rikuuux@gmail.com',

  upload: {
    maxBytes: 5 * 1024 * 1024,                         // 5 Mo : fichier ENVOYÉ (après conversion sur l'appareil)
    // à l'entrée, toute image que l'appareil sait lire (JPEG, PNG, WebP, HEIC / HEIF d'iPhone, GIF fixe…) est
    // acceptée puis convertie ; refus seulement au-delà de ce que la mémoire d'un iPhone supporte sans risque :
    maxInputBytes: 60 * 1024 * 1024,                   // 60 Mo
    maxInputPixels: 100e6,                             // 100 mégapixels (ex. 10 000 × 10 000)
    maxSide: 2000,                                     // px, grande image
    thumbSide: 800,                                    // px, miniature du mur
    maxText: 500,
    maxName: 40,
  },

  wall: {
    batch: 500,            // dépôts lus par paquet (seulement les informations : textes, tailles, dates) ;
                           // tous les paquets sont lus en arrière-plan, les images arrivent à l'approche de l'écran
    overlap: 0.18,          // part maximale d'un élément recouverte (ordinateur)
    overlapMobile: 0.08,    // idem sur mobile : densité réduite
    mobileBelow: 640,       // largeur (px) sous laquelle on passe en mise en page mobile
  },
};

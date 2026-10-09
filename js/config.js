/**
 * Réglages centraux. Tout ce qui se « règle à l'œil » est ici.
 */
export const CONFIG = {
  /* ------------------------------------------------ fichiers */
  modelUrl: 'assets/models/expo.glb',        // ton .glb baké (sinon : géométrie provisoire)
  layoutUrl: 'assets/layout.json',           // géométrie provisoire / secours
  lightmapDir: 'assets/lightmaps/',          // manifest.json + lightmap.(ktx2|png)
  decoders: {                                // chargés seulement si le .glb en a besoin
    basis: 'vendor/three/examples/jsm/libs/basis/',
  },

  /* ------------------------------------------------ rendu */
  toneMapping: 'AgX',                        // équivalent du « View Transform: AgX » de Blender
  exposure: 2.1,                             // = Exposure de la gestion couleur Blender : 2^EV (≈ +1 EV)
  skyColor: '#f4f7fa',                       // ciel vu par les ouvertures : surexposé, comme en photo d'intérieur
  surface: {                                 // « béton vivant » (ordinateurs) : ce que le bake ne contient pas
    envIntensity: 0.55,                      // force des reflets (réflexion capturée de la salle)
    specOcclusion: 0.35,                     // en dessous de ce niveau de lumière bakée, les reflets s'éteignent
    detail: 0.9,                             // relief de la normal map sur la lumière bakée (0 = plat)
  },
  filmGrain: true,                           // grain et vignettage légers : casse l'aspect « image de synthèse »
  lightmapGain: 1.0,                         // correction fine de l'intensité de la lightmap
  maxPixelRatio: { 1: 1.25, 2: 2 },          // par niveau de machine (tier)
  adaptiveResolution: true,                  // baisse la résolution si les images/s chutent

  /* ------------------------------------------------ pancarte de contact (mur du fond de l'entrée, à gauche du passage) */
  sign: {
    position: [-2.9, 1.55, -10.98],          // centre de la plaque (m, repère three.js)
    normal: [0, 0, 1],                       // direction vers laquelle elle regarde (vers l'entrée)
    size: [1.1, 0.68],                       // largeur × hauteur (m)
    instagramHandle: '@felixcardonnel',
  },

  /* ------------------------------------------------ navigation */
  navigation: 'free',                        // 'free' (marche libre) | 'guided' (défilement = travelling) ; ?nav=guided pour tester
  walk: {
    eyeHeight: 1.65,                         // m
    radius: 0.35,                            // « épaisseur » du corps pour les collisions
    walkSpeed: 2.0,                          // m/s (marche réelle ≈ 1,4 ; un peu plus pour ne pas s'ennuyer)
    runSpeed: 4.8,                           // m/s avec Maj
    sensitivity: 0.0021,                     // souris (radians par pixel)
    fov: 62, fovMobile: 72,                  // champ vertical de base
    runFovKick: 6,                           // le champ s'ouvre en courant (degrés)
    jumpSpeed: 3.3,                          // m/s → saut d'environ 55 cm
    aimDistance: 9,                          // distance max pour viser une œuvre
    videoRange: 6,                           // les vidéos jouent à moins de ~7 m
  },

  /* ------------------------------------------------ caméra et parcours (mode guidé) */
  referenceAspect: 16 / 9,                   // format pour lequel tu cadres tes caméras Blender
  maxVerticalFov: 100,                       // en portrait, on préserve le champ horizontal jusqu'à cette limite
  dwellSeconds: 6,                           // durée d'un « plan » fixe devant une œuvre (timecode)
  travelSpeed: 1.4,                          // m/s pendant les travellings (timecode)
  minTravelSeconds: 1.6,
  scrollVhPerSecond: 11,                     // longueur de défilement par seconde de séquence (en % de hauteur d'écran)
  damping: 3.2,                              // inertie de la caméra (plus haut = plus sec)
  cutThreshold: 2,                           // au-delà de N œuvres d'écart, un saut devient une coupe (fondu au noir)
  fps: 25,                                   // base du timecode (PAL/Japon broadcast : 25 ; 29.97 non-drop si tu préfères)

  /* ------------------------------------------------ vidéo */
  maxPlayingVideos: { 1: 1, 2: 3 },          // décodeurs simultanés (iOS n'aime pas plus d'un ou deux)
  preloadRadius: 1,                          // on charge les vidéos à ±N œuvres de la position courante
  spill: true,                               // halo de lumière des écrans sur le béton

  /* ------------------------------------------------ index */
  durationScale: 'sqrt',                     // 'linear' | 'sqrt' — voir docs/ARCHITECTURE.md
};

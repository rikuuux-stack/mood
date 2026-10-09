/**
 * PIXELS CONTRE MOTS — plus la photo a de pixels, moins il reste de place pour le texte.
 *
 *   caractères autorisés = 500 × (1 − pixels / 4 000 000), arrondi, jamais moins de 40.
 *
 *   sans image            → 500 caractères
 *   640 × 480 (0,3 Mpx)   → 462
 *   1000 × 750 (0,75 Mpx) → 406
 *   1600 × 1200 (1,9 Mpx) → 260
 *   2000 × 1500 (3 Mpx)   → 125
 *   2000 × 2000 (4 Mpx)   → 40  (minimum)
 *
 * « pixels » = la taille de l'image telle qu'elle est publiée (après réduction à 2000 px).
 * Ce module est pur : le serveur appliquera exactement la même règle.
 */
export const BUDGET = { max: 500, min: 40, fullPixels: 4_000_000 };

export function textBudget(width = 0, height = 0) {
  const px = Math.max(0, width) * Math.max(0, height);
  if (!px) return BUDGET.max;
  return Math.max(BUDGET.min, Math.round(BUDGET.max * (1 - px / BUDGET.fullPixels)));
}

/** Longueur d'un texte comptée en caractères visibles (un emoji ou un kanji = 1). */
export const textLength = s => [...(s || '')].length;

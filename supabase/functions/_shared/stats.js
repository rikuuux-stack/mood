/**
 * Journal de modération → chiffres simples pour /admin/ (sans aucune donnée personnelle).
 * rows : [{ at, decision: 'approved'|'rejected'|'removed', reason, prompt }] ; mois à l'heure de Tokyo (UTC + 9 h).
 * Testé par tests/server.test.mjs.
 */
export const REASONS = ['rights', 'offensive', 'private', 'spam', 'test', 'other'];
export const tokyoMonth = iso => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 7);

export function summarize(rows) {
  const blank = () => ({ approved: 0, rejected: 0, removed: 0, reasons: Object.fromEntries(REASONS.map(r => [r, 0])) });
  const add = (o, r) => { o[r.decision]++; if (r.decision === 'rejected') o.reasons[REASONS.includes(r.reason) ? r.reason : 'other']++; };
  const months = new Map(), prompts = new Map();
  for (const r of rows || []) {
    const m = tokyoMonth(r.at);
    if (!months.has(m)) months.set(m, blank());
    add(months.get(m), r);
    if (r.decision !== 'removed') {                     // dépôts par consigne : décisions à l'arrivée (validé / refusé)
      const p = r.prompt || '';
      if (!prompts.has(p)) prompts.set(p, blank());
      add(prompts.get(p), r);
    }
  }
  return {
    total: (rows || []).length,
    months: [...months].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({ month, ...v })),
    prompts: [...prompts].map(([prompt, v]) => ({ prompt, ...v })).sort((a, b) => (b.approved + b.rejected) - (a.approved + a.rejected)),
  };
}

-- =============================================================================
-- Journal de modération : une ligne par décision, pour des chiffres simples dans /admin/ (acceptés / refusés
-- par mois et par raison, dépôts par consigne). AUCUNE donnée personnelle : ni dépôt, ni texte, ni fichier,
-- ni IP, ni pseudo, ni identifiant de dépôt ; l'heure est arrondie à l'heure pleine.
--   decision : approved | rejected | removed
--   reason   : raison d'un refus, en un mot (rights, offensive, private, spam, test, other) ; vide sinon
--   prompt   : la consigne du mois gardée sur le dépôt (déjà publique sur le mur)
-- Fermée au public (RLS sans politique) ; seule la fonction « moderate » (service_role) y écrit et la lit.
-- Ajout pur : rien de ce que lit le site ne change (compatible avec le site en ligne).
-- Rappel : sur ce projet, une nouvelle table n'a AUCUN droit par défaut, même pour service_role.
-- =============================================================================
create table public.moderation_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default date_trunc('hour', now()),
  decision text not null check (decision in ('approved', 'rejected', 'removed')),
  reason   text check (reason in ('rights', 'offensive', 'private', 'spam', 'test', 'other')),
  prompt   text not null default '' check (char_length(prompt) <= 60),
  check (reason is null or decision <> 'approved')
);
alter table public.moderation_log enable row level security;      -- aucune politique : fermée au public
revoke all on public.moderation_log from anon, authenticated;
grant select, insert on public.moderation_log to service_role;

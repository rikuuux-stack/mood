-- =============================================================================
-- Droits du rôle « service_role » (clé de service, utilisée UNIQUEMENT par les fonctions serveur).
--
-- Incident : sur ce projet, l'option « Automatically expose new tables » est désactivée. Les
-- nouvelles tables du schéma public ne reçoivent alors AUCUN droit par défaut — pas même pour
-- service_role. Conséquence : les fonctions ne pouvaient ni lire « admins » (connexion admin
-- refusée), ni écrire dans « posts » / « reports ». On accorde donc explicitement ces droits.
-- anon et authenticated restent sans aucun droit sur ces tables (cf. 20261009120000_mood_init.sql).
-- =============================================================================
grant usage on schema public to service_role;
grant select, insert, update, delete on public.posts, public.reports, public.admins to service_role;
grant usage, select on sequence public.reports_id_seq to service_role;
grant select on public.wall to service_role;
grant execute on function public.text_budget(integer, integer) to service_role;

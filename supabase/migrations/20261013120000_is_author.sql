-- Égalité totale : la marque « dépôt de l'administrateur » s'appelle désormais is_author, et elle
-- n'apparaît plus du tout dans la vue publique « wall ». Aucun visiteur ne peut savoir quels dépôts
-- viennent de l'administrateur.
--
-- ÉTAPE 1 SUR 2 — compatible avec le site ET les fonctions actuellement en ligne (zéro coupure) :
--   - nouvelle colonne is_author, recopiée depuis l'ancienne colonne ;
--   - tant que les deux colonnes existent, un déclencheur les garde identiques : une fonction encore
--     ancienne (qui écrit l'ancienne colonne) et une fonction nouvelle (qui écrit is_author) donnent
--     le même résultat ;
--   - vue « wall » recréée SANS la marque ; created_at n'y est plus donné qu'au JOUR (midi, heure de Tokyo,
--     fuseau de référence du mur) : à la seconde près, l'écart entre création et validation trahissait
--     les dépôts de l'administrateur (publiés à l'instant). Le site public ne lit pas la marque, et la
--     date du jour lui suffit (strates au mois, date affichée au jour).
-- ÉTAPE 2 (migration suivante, après la fusion) : suppression de l'ancienne colonne et du déclencheur.

alter table public.posts add column is_author boolean not null default false;
update public.posts set is_author = is_riku;

create or replace function public.posts_author_sync() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.is_author := coalesce(new.is_author, false) or coalesce(new.is_riku, false);
    new.is_riku := new.is_author;
  elsif new.is_author is distinct from old.is_author then
    new.is_riku := new.is_author;
  elsif new.is_riku is distinct from old.is_riku then
    new.is_author := new.is_riku;
  end if;
  return new;
end $$;
revoke execute on function public.posts_author_sync() from public, anon, authenticated;
create trigger posts_author_sync before insert or update on public.posts
  for each row execute function public.posts_author_sync();

-- une vue ne peut pas perdre une colonne avec « create or replace » : on la recrée
drop view public.wall;
create view public.wall as
  select id, kind, text,
         case when is_author then '' else name end as name,
         image_path, thumb_path, width, height,
         (date_trunc('day', created_at at time zone 'Asia/Tokyo') + interval '12 hours') at time zone 'Asia/Tokyo' as created_at,
         approved_at, size, loop_path, duration, grain, prompt
    from public.posts
   where status = 'approved';
grant select on public.wall to anon, authenticated, service_role;

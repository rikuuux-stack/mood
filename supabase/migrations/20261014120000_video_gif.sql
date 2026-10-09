-- =============================================================================
-- Vidéos et GIF perso (remplace le plan de la #12) : un dépôt vidéo = 2 fichiers, dans le même bucket
-- qu'une image (« pending » privé tant qu'il n'est pas validé) :
--   image_path → la vidéo MP4 H.264 (480 px de grand côté, ≤ 24 i/s, muette, noir et blanc, ≤ 60 s, ≤ 4 Mo),
--   thumb_path → l'image fixe (poster), affichée sur le mur.
-- Un GIF est converti en vidéo identique (lu en boucle, comme toutes les vidéos).
-- Plus de « version légère » (loop_path) : la colonne reste, vide, pour compatibilité.
-- Compatible avec le site et les fonctions en ligne : on ne fait qu'assouplir des contraintes.
-- =============================================================================
-- toutes les contraintes qui parlent de la durée (limite de 10 s de la #12, quel que soit leur nom), puis les nouvelles
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%duration%'
  loop
    execute format('alter table public.posts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.posts add constraint image_has_files check (
  (kind in ('image', 'video')) = (image_path is not null and thumb_path is not null)
  and (kind = 'video') = (duration is not null));
alter table public.posts add constraint posts_duration_check check (duration > 0 and duration <= 60.5);

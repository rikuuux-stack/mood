-- =============================================================================
-- Vidéos : clips de 10 s maximum, muets, MP4 H.264 (réencodés dans le navigateur, revérifiés par la
-- fonction submit). Un dépôt vidéo = 3 fichiers, dans le même bucket qu'une image (« pending » privé
-- tant qu'il n'est pas validé) :
--   image_path → la vidéo 720p (agrandissement), loop_path → la version légère 360p (mur),
--   thumb_path → l'image fixe (poster).
-- Le grain d'une vidéo n'est PAS incrusté (fichier plus léger) : sa valeur est gardée ici et
-- appliquée à l'affichage, avec la même texture que le grain des images.
-- =============================================================================
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('image', 'text', 'video'));

alter table public.posts
  add column loop_path text,
  add column duration  real check (duration > 0 and duration <= 10.5),
  add column grain     smallint not null default 0 check (grain between 0 and 100);

alter table public.posts drop constraint if exists image_has_files;
alter table public.posts add constraint image_has_files check (
  (kind in ('image', 'video')) = (image_path is not null and thumb_path is not null)
  and (kind = 'video') = (loop_path is not null)
  and (kind = 'video') = (duration is not null));

-- une vidéo, comme une image, peut se passer de mots
alter table public.posts drop constraint if exists text_not_empty;
alter table public.posts add constraint text_not_empty check (kind in ('image', 'video') or char_length(text) > 0);

-- buckets : la vidéo (MP4) en plus des images ; 5 Mo par fichier (une vidéo fait ≈ 1,5 Mo, 3 Mo au plus)
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
 where id in ('pending', 'published');

-- place occupée par TOUS les fichiers (images et vidéos), pour le plafond de 800 Mo et la jauge de l'admin
create or replace function public.storage_used()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)
    from storage.objects
   where bucket_id in ('pending', 'published');
$$;
revoke all on function public.storage_used() from public, anon, authenticated;
grant execute on function public.storage_used() to service_role;

-- même vue qu'avant, plus les champs vidéo (ajoutés à la fin)
create or replace view public.wall as
  select id, kind, text,
         case when is_riku then '' else name end as name,
         image_path, thumb_path, width, height, is_riku, created_at, approved_at,
         size, loop_path, duration, grain
    from public.posts
   where status = 'approved';
grant select on public.wall to anon, authenticated, service_role;

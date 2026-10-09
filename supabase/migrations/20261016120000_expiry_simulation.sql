-- =============================================================================
-- Expiration à 180 jours — MODE SIMULATION. Rien n'est supprimé par cette migration, ni par la suite tant que
-- l'auteur du site n'a pas activé le réglage lui-même (éditeur SQL de Supabase, voir docs/MODERATION.md).
--
--   public.expiry_settings : UNE ligne (id = 1). enabled = false par défaut. Les fonctions serveur (service_role)
--     peuvent seulement la LIRE : aucune action de /admin/ ni aucun programme du dépôt ne peut l'activer.
--   posts.expired_at : date à laquelle les fichiers d'un dépôt ont été supprimés (vide = jamais).
--     Un dépôt expiré garde sa ligne (date, consigne, type, taille) : il reste dans la vue List, en texte seul.
--   public.expiry_candidates(days) : ce qui SERAIT supprimé (dépôts publiés depuis plus de `days` jours qui ont
--     encore leurs fichiers), avec le poids réel des fichiers. Lecture seule.
-- Ajouts seulement : rien de ce que lit le site ne change (compatible avec le site en ligne).
-- Rappel : sur ce projet, une nouvelle table n'a AUCUN droit par défaut, même pour service_role.
-- =============================================================================
create table public.expiry_settings (
  id         smallint primary key default 1 check (id = 1),
  enabled    boolean not null default false,
  days       integer not null default 180 check (days >= 180),
  updated_at timestamptz not null default now()
);
insert into public.expiry_settings (id) values (1) on conflict (id) do nothing;
alter table public.expiry_settings enable row level security;    -- aucune politique : fermée au public
revoke all on public.expiry_settings from anon, authenticated;
grant select on public.expiry_settings to service_role;          -- LECTURE seule : seul l'auteur peut l'activer

alter table public.posts add column expired_at timestamptz;

-- un dépôt expiré n'a plus de fichiers (image_path, thumb_path vides) : la règle « un dépôt image ou vidéo a ses
-- fichiers » s'applique désormais aux dépôts NON expirés (la règle vidéo ⇔ durée reste la même)
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.posts'::regclass and conname = 'image_has_files' loop
    execute format('alter table public.posts drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.posts add constraint image_has_files check (
  (expired_at is not null and image_path is null and thumb_path is null)
  or (kind in ('image', 'video')) = (image_path is not null and thumb_path is not null)
) not valid;
alter table public.posts validate constraint image_has_files;
alter table public.posts add constraint video_has_duration check ((kind = 'video') = (duration is not null)) not valid;
alter table public.posts validate constraint video_has_duration;

create or replace function public.expiry_candidates(days integer default 180)
returns table (id uuid, kind text, approved_at timestamptz, prompt text, bytes bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.approved_at, p.prompt,
         coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o
                    where o.bucket_id = 'published' and o.name in (p.image_path, p.thumb_path)), 0)::bigint
    from public.posts p
   where p.status = 'approved' and p.image_path is not null and p.expired_at is null
     and p.approved_at < now() - make_interval(days => greatest(days, 1))
   order by p.approved_at;
$$;
revoke all on function public.expiry_candidates(integer) from public, anon, authenticated;
grant execute on function public.expiry_candidates(integer) to service_role;

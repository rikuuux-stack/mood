-- =============================================================================
-- Mood — base de données (Supabase / Postgres)
--
-- Principe de sécurité : les visiteurs (rôle « anon ») ne peuvent RIEN écrire et ne
-- peuvent lire QUE la vue public.wall (dépôts validés, colonnes sans données privées).
-- Toutes les écritures passent par les fonctions serveur (supabase/functions/*), qui
-- utilisent la clé de service et vérifient captcha, limites, formats et budget.
-- Les fichiers en attente sont dans le bucket PRIVÉ « pending » (aucune URL publique) ;
-- ils ne passent dans le bucket public « published » qu'après validation par l'administrateur.
-- =============================================================================

-- ------------------------------------------------------------------ pixels contre mots
-- Même règle que js/budget.js : 500 × (1 − pixels / 4 000 000), arrondi, minimum 40 ; sans image 500.
create or replace function public.text_budget(w integer, h integer)
returns integer language sql immutable as $$
  select case
    when coalesce(w, 0) * coalesce(h, 0) = 0 then 500
    else greatest(40, round(500 * (1 - (w::numeric * h) / 4000000))::integer)
  end
$$;

-- ------------------------------------------------------------------ dépôts
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('image', 'text')),
  text         text not null default '' check (char_length(text) <= 500),
  name         text not null default '' check (char_length(name) <= 40),
  image_path   text,                         -- chemin dans le bucket (pending/ ou published/ selon le statut)
  thumb_path   text,
  width        integer check (width  between 1 and 2000),
  height       integer check (height between 1 and 2000),
  lang         text check (lang in ('fr', 'ja', 'en')),
  is_riku      boolean not null default false,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  report_count integer not null default 0,
  ip_hash      text,                         -- empreinte de l'adresse IP (jamais l'IP en clair), pour les limites
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  constraint image_has_files check ((kind = 'image') = (image_path is not null and thumb_path is not null)),
  constraint image_has_size  check (kind = 'text' or (width is not null and height is not null)),
  constraint text_not_empty  check (kind = 'image' or char_length(text) > 0),
  constraint text_in_budget  check (char_length(text) <= public.text_budget(width, height))
);
create index posts_wall_idx on public.posts (status, approved_at desc);
create index posts_ip_idx   on public.posts (ip_hash, created_at desc);

-- ------------------------------------------------------------------ signalements
create table public.reports (
  id         bigint generated always as identity primary key,
  post_id    uuid not null references public.posts (id) on delete cascade,
  reason     text not null check (reason in ('rights', 'offensive', 'personal', 'spam', 'other')),
  ip_hash    text not null,
  created_at timestamptz not null default now(),
  unique (post_id, ip_hash)                 -- une même personne ne compte qu'une fois par dépôt
);
create index reports_ip_idx on public.reports (ip_hash, created_at desc);

-- 3 signalements → le dépôt est masqué en attendant la décision de l'administrateur
create or replace function public.on_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.posts
     set report_count = report_count + 1,
         status = case when report_count + 1 >= 3 and status = 'approved' then 'hidden' else status end
   where id = new.post_id;
  return new;
end $$;
create trigger reports_count after insert on public.reports
  for each row execute function public.on_report();

-- ------------------------------------------------------------------ administrateur
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
-- Le compte rikuuux@gmail.com devient administrateur dès sa création (ou tout de suite s'il existe déjà).
create or replace function public.grant_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'rikuuux@gmail.com' then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_admin after insert or update of email on auth.users
  for each row execute function public.grant_admin();
insert into public.admins (user_id)
  select id from auth.users where lower(email) = 'rikuuux@gmail.com'
  on conflict do nothing;

-- ------------------------------------------------------------------ verrouillage
alter table public.posts   enable row level security;
alter table public.reports enable row level security;
alter table public.admins  enable row level security;
-- aucune politique RLS : ni « anon » ni « authenticated » ne peuvent lire ou écrire ces tables.
revoke all on public.posts, public.reports, public.admins from anon, authenticated;
revoke all on sequence public.reports_id_seq from anon, authenticated;
revoke execute on function public.on_report(), public.grant_admin() from public, anon, authenticated;

-- ------------------------------------------------------------------ la seule chose lisible publiquement
-- Vue des dépôts VALIDÉS, sans l'IP, le statut ni les signalements. Elle s'exécute avec les droits de
-- son propriétaire (pas ceux du visiteur) : c'est voulu, la table reste fermée au public.
create view public.wall as
  select id, kind, text,
         case when is_riku then '' else name end as name,
         image_path, thumb_path, width, height, is_riku, created_at, approved_at
    from public.posts
   where status = 'approved';
grant select on public.wall to anon, authenticated;

-- ------------------------------------------------------------------ fichiers
-- « pending » : privé, aucune politique → seule la clé de service (fonctions serveur) y accède.
-- « published » : lecture publique des fichiers validés ; écriture réservée à la clé de service.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pending',   'pending',   false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
       ('published', 'published', true,  5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

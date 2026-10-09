-- =============================================================================
-- Le temps : consigne du mois et strates.
--   - public.prompt : UNE consigne courante (une seule ligne, id = 1), réglée depuis /admin/ ;
--     texte anglais, 60 caractères au plus ; vide = pas de consigne ce mois-ci.
--   - public.current_prompt : la seule lecture publique de la consigne (vide → aucune ligne).
--   - posts.prompt : la consigne en vigueur au moment du dépôt, gardée sur le dépôt (strates du mur).
-- Rappel : sur ce projet, une nouvelle table n'a AUCUN droit par défaut, même pour service_role.
-- =============================================================================
create table public.prompt (
  id         smallint primary key default 1 check (id = 1),
  text       text not null default '' check (char_length(text) <= 60),
  updated_at timestamptz not null default now()
);
insert into public.prompt (id) values (1) on conflict (id) do nothing;
alter table public.prompt enable row level security;              -- aucune politique : fermée au public
revoke all on public.prompt from anon, authenticated;
grant select, insert, update on public.prompt to service_role;

create view public.current_prompt as
  select text from public.prompt where id = 1 and text <> '';
grant select on public.current_prompt to anon, authenticated, service_role;

alter table public.posts add column prompt text not null default '' check (char_length(prompt) <= 60);

-- même vue qu'avant, plus la consigne de chaque dépôt (ajoutée à la fin).
-- is_riku reste dans la vue pour ne pas casser une ancienne page encore en cache, mais le site
-- ne la lit plus : aucune distinction visible des dépôts de l'auteur.
create or replace view public.wall as
  select id, kind, text,
         case when is_riku then '' else name end as name,
         image_path, thumb_path, width, height, is_riku, created_at, approved_at,
         size, loop_path, duration, grain, prompt
    from public.posts
   where status = 'approved';
grant select on public.wall to anon, authenticated, service_role;

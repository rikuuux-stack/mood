-- =============================================================================
-- Taille d'affichage choisie au dépôt : S / M / L (M par défaut). Revérifiée par la fonction submit,
-- modifiable par l'administrateur (fonction moderate, action « resize »). Visible dans la vue publique.
-- =============================================================================
alter table public.posts
  add column size text not null default 'm' check (size in ('s', 'm', 'l'));

-- même vue qu'avant, plus la taille (colonne ajoutée à la fin : « create or replace » le permet)
create or replace view public.wall as
  select id, kind, text,
         case when is_riku then '' else name end as name,
         image_path, thumb_path, width, height, is_riku, created_at, approved_at,
         size
    from public.posts
   where status = 'approved';
grant select on public.wall to anon, authenticated, service_role;

-- Égalité totale, ÉTAPE 2 SUR 2 : plus rien n'utilise l'ancienne colonne (site, fonctions et admin
-- écrivent et lisent is_author depuis l'étape 1). On retire le déclencheur de transition et l'ancienne colonne.
drop trigger if exists posts_author_sync on public.posts;
drop function if exists public.posts_author_sync();
alter table public.posts drop column if exists is_riku;

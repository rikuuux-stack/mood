# Mood — installation (à faire une seule fois)

Ce guide décrit ce que **toi seul** peux faire : tout ce qui touche à des clés secrètes ou à ton compte.
Le reste (base de données, fonctions serveur, tests) s'installe tout seul par GitHub Actions.

Projet Supabase : `ovvdtthnykqvgarrjina` (région Mumbai).
Clés **publiques** déjà dans le code (`js/config.js`) : URL Supabase, clé « anon », site key Turnstile.
Les clés **secrètes** ne vont jamais dans le code ni dans une conversation : uniquement dans les réglages ci-dessous.

---

## Étape 1 — La clé secrète Turnstile, dans Supabase

1. Cloudflare ▸ **Turnstile** ▸ ton widget ▸ **Settings**.
   - Vérifie que **Hostnames** contient `rikuuux-stack.github.io`.
   - Copie la **Secret Key**.
2. Supabase ▸ ton projet ▸ menu de gauche **Edge Functions** ▸ onglet **Secrets**.
3. **Add new secret** :
   - Name : `TURNSTILE_SECRET`
   - Value : colle la Secret Key
4. **Save**.

Sans cette clé, tous les dépôts sont refusés (« Validez la vérification anti-robot »).

## Étape 2 — Les secrets GitHub (installation automatique)

Il en faut deux.

**a. Jeton Supabase**
1. supabase.com ▸ ton avatar ▸ **Account preferences** ▸ **Access Tokens**
   (ou directement `supabase.com/dashboard/account/tokens`).
2. **Generate new token**, nom : `github-mood`. Copie-le (il ne s'affiche qu'une fois).

**b. Mot de passe de la base**
- C'est celui choisi à la création du projet.
- Oublié ? Supabase ▸ **Project Settings** ▸ **Database** ▸ **Reset database password**.

**Dans GitHub**
1. Dépôt `riku-portfolio` ▸ **Settings** ▸ **Secrets and variables** ▸ **Actions** ▸ **New repository secret**.
2. Crée :
   - `SUPABASE_ACCESS_TOKEN` = le jeton (a)
   - `SUPABASE_DB_PASSWORD` = le mot de passe (b)
3. Lance l'installation : onglet **Actions** ▸ **Supabase** ▸ **Run workflow** ▸ branche `main` ▸ **Run workflow**.
   Au bout de 2–3 minutes, les deux étapes doivent être vertes (« deploy » puis « e2e »).

## Étape 3 — Ton compte administrateur

1. Supabase ▸ **Authentication** ▸ **Users** ▸ **Add user** ▸ **Create new user**.
   - Email : `rikuuux@gmail.com`
   - Password : un mot de passe solide (garde-le dans ton gestionnaire de mots de passe)
   - coche **Auto Confirm User**
2. **Fermer les inscriptions** : Supabase ▸ **Authentication** ▸ **Sign In / Providers**
   ▸ décoche **Allow new users to sign up** ▸ **Save**.
   Plus personne ne peut se créer de compte ; le tien est le seul.

Le compte `rikuuux@gmail.com` devient administrateur automatiquement (règle dans la base).
Connexion : `https://rikuuux-stack.github.io/riku-portfolio/admin/`.

## Étape 4 (facultative) — L'alerte e-mail à chaque dépôt

1. Crée un compte gratuit sur resend.com **avec l'adresse rikuuux@gmail.com**
   (sans nom de domaine, Resend n'envoie qu'à l'adresse du compte : c'est exactement ce qu'il faut).
2. Resend ▸ **API Keys** ▸ **Create API Key** (permission « Sending access »). Copie-la.
3. Supabase ▸ **Edge Functions** ▸ **Secrets** ▸ **Add new secret** :
   - Name : `RESEND_API_KEY`
   - Value : la clé
   - **Save**.

Sans cette clé, tout fonctionne, simplement sans e-mail.

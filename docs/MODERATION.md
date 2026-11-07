# Mood — guide de modération

Rien de ce que déposent les visiteurs n'est visible avant que tu l'aies validé.

## Se connecter

1. Ouvre `https://moodwall.pages.dev/admin/` (ajoute-la à l'écran d'accueil de ton iPhone).
2. E-mail `rikuuux@gmail.com` + ton mot de passe ▸ **Log in**.
   La connexion reste active sur cet appareil ; **Log out** en haut à droite.

La page est en anglais, avec des mots très courts (choix validé).

## Les onglets

| Onglet | Ce qu'il contient | Boutons |
|---|---|---|
| **Pending** (en attente) | les nouveaux dépôts, du plus ancien au plus récent | **Approve** : il apparaît sur le mur. **Reject** : choisis la raison en un mot (rights, offensive, private, spam, test, other) ; le toucher sur la raison supprime le dépôt définitivement. |

**Tout valider / tout refuser** (onglet Pending, au-dessus des cartes) : **Approve all** et **Reject all**.
1. Premier toucher : le bouton affiche le nombre de dépôts concernés, par exemple « Sure? Reject 7 ». Rien n'est encore fait.
2. Second toucher : chaque dépôt affiché est traité, un par un, exactement comme avec son propre bouton.
   - Seuls les dépôts **affichés au moment du toucher** sont traités : un dépôt arrivé entre-temps, que tu n'as pas
     encore vu, reste en attente.
   - Au premier échec, tout s'arrête et le message dit lequel (« Stopped: 2 / 7 done. Failed on #3 (…) — retry ») ;
     la liste est relue. Retoucher le bouton reprend avec ce qui reste.
   - **Reject all est définitif** (fichiers et texte supprimés). Regarde la liste avant ; en cas de doute, refuse un par un.
     Reject all ne demande pas de raison : le journal (Stats) la note « other ».
| **Reported** (signalés) | les dépôts masqués automatiquement après 3 signalements | **Restore** (les signalements sont effacés) ou **Delete** |
| **Live** (publiés) | ce qui est sur le mur | **Remove** (suppression définitive) |
| **Stats** | le journal de modération résumé : par mois (heure de Tokyo) acceptés / refusés (par raison) / retirés, et dépôts par consigne. **Aucune donnée personnelle** : le journal ne garde que l'heure (arrondie), la décision, la raison et la consigne. | — |
| **Expiry** | expiration à 180 jours, **en simulation** : ce qui serait supprimé maintenant et dans les 30 jours, et la place libérée. **Rien n'est supprimé.** | aucun bouton tant que l'expiration n'est pas activée (voir plus bas) |
| **Drop** (déposer) | ton propre dépôt : image et/ou mots, taille S / M / L | publié tout de suite, comme n'importe quel dépôt (aucune marque visible ; « me » ici seulement) |
| **Archive** | une ligne par nuit : le mur (fixe, un écran) capturé chaque nuit à 03:00 (heure de Tokyo), vue iPhone + vue ordinateur + état (dépôts, paliers, strates, consigne) | toucher une nuit : aperçu et téléchargement ; **Delete night** (2ᵉ toucher) pour une demande de retrait |

**Consigne du mois** : en haut, champ **Prompt** (un court texte anglais, 60 caractères au plus, ex. « trace. ») ▸ **Save**. Elle s'affiche « This month: trace. » sur le mur et dans Drop, et elle est gardée sur chaque nouveau dépôt : le mur se lit ainsi par strates (un mois, une consigne). **Clear** = pas de consigne ce mois-ci.

**Taille d'affichage** : sous chaque dépôt, trois cases **S / M / L** (la taille choisie par le visiteur est pleine).
Un toucher la change aussitôt, avant ou après validation.

Les photos s'affichent ici **telles qu'elles sont stockées**. Depuis la correction « fix-original », le téléphone du visiteur
envoie la photo **déjà en négatif noir et blanc** : l'original en couleur ne quitte jamais son téléphone, ni le serveur ni toi
ne le voyez. Sur le mur, s'y ajoutent la transparence et l'usure. Les photos déposées avant cette correction sont encore en
couleur ici, tant que la conversion ci-dessous n'a pas été lancée.

### Photos déposées avant « fix-original » : conversion en négatif (à décider)

Prête, jamais lancée sans toi. GitHub ▸ **Actions** ▸ **Supabase** ▸ **Run workflow** ▸ task :
- **negate-dry** : essai à blanc. Lit chaque fichier en couleur, le convertit en mémoire, vérifie, et affiche le bilan. **N'écrit rien.**
- **negate** : pour de bon. Chaque photo (et sa miniature, et l'image fixe d'une vidéo) est remplacée par son négatif, puis
  le fichier en couleur est **supprimé, définitivement**. Les textes, dates, tailles et l'usure ne changent pas.

**Vidéos et GIF** : une vidéo apparaît avec un lecteur (▶) et son image fixe ; touche-la pour la voir **avant de valider**.
Elle est déjà en négatif noir et blanc (convertie sur le téléphone du visiteur), muette, 60 s au plus. Sous la carte : sa durée et son poids réel.
Un refus supprime la vidéo et son image fixe ; la validation les publie toutes les deux.

**Stockage** : en haut, « Storage … MB / 1 GB ». Dès 700 Mo, la ligne est soulignée (avertissement) ; à 900 Mo,
les nouvelles vidéos sont refusées (« Wall full — come back later. »). Pour libérer de la place : **Remove** sur de vieux dépôts.

## Ce qui est déjà filtré avant d'arriver chez toi

- vérification anti-robot (Turnstile), 3 dépôts par heure et 10 par jour par connexion ;
- toute image est convertie sur le téléphone du visiteur : stockée en 2000 px maximum, 5 Mo maximum, **aucune métadonnée** (GPS, appareil) ;
- vidéos et GIF convertis sur le téléphone : MP4 en négatif noir et blanc, 480 px, muet, 60 s et 4 Mo maximum, sans métadonnées ;
- texte limité par la règle « pixels contre mots » ; pseudo sans lien ;
- un visiteur a coché qu'il détient les droits et accepte la modération.

## Demande de retrait

Quelqu'un écrit à rikuuux@gmail.com pour retirer un contenu : onglet **Live** ▸ **Remove** (2ᵉ toucher pour confirmer).
Le fichier et le texte sont supprimés du serveur (pas seulement cachés).
Le contenu reste visible dans les **captures d'archive** des nuits où il était sur le mur : onglet **Archive** ▸
touche chaque nuit concernée ▸ **Delete night** (les captures sont privées : personne d'autre ne les voit, mais
une demande de retrait concerne aussi elles).

## Expiration à 180 jours (désactivée)

Par défaut, l'expiration est une **simulation** : l'onglet **Expiry** dit ce qui serait supprimé, rien ne l'est.
Une tâche tourne **chaque nuit à 03:00 (heure de Tokyo)**, juste après l'archive du mur (workflow « Supabase » sur
GitHub, `tools/expire-nightly.sh`). Tant que l'expiration est désactivée, elle ne fait **rien** (son journal dit
« désactivée (simulation) »). Personne d'autre que toi ne peut l'activer : aucun bouton ni programme du site ne le peut.

Ce qu'elle fait une fois activée : pour chaque dépôt publié depuis plus de 180 jours, elle supprime les fichiers
(image, vidéo, image fixe) et le pseudo. Il reste sa ligne dans la vue List (date, type, « 180 days », consigne) et,
s'il y en avait, **les mots** déposés avec l'image : l'image s'en va, les mots restent. Les textes seuls ne sont jamais
touchés. Une suppression faite est **définitive**.

### L'essayer d'abord sur un faux dépôt

Aujourd'hui, aucun vrai dépôt n'a 180 jours : l'essai ne touche que le faux dépôt. Vérifie-le quand même à l'étape 3.

1. /admin/ ▸ **Drop** : dépose une image d'essai avec quelques mots (par exemple « essai expiration »). Elle est publiée
   tout de suite.
2. supabase.com ▸ projet ▸ **SQL Editor** : vieillis-la de 181 jours, puis **Run** :
   ```sql
   update public.posts set approved_at = now() - interval '181 days'
    where text = 'essai expiration' and is_author;
   ```
3. /admin/ ▸ **Expiry** : la ligne « now » doit compter **1** dépôt, le tien, et aucun autre.
4. Active l'expiration (SQL Editor ▸ **Run**) :
   ```sql
   update public.expiry_settings set enabled = true where id = 1;
   ```
5. Lance la tâche sans attendre la nuit : GitHub ▸ **Actions** ▸ **Supabase** ▸ **Run workflow** ▸ task = **archive**.
   Dans le journal, l'étape « Expiration à 180 jours » doit dire « 1 dépôt(s) expiré(s) ». (Ou bien /admin/ ▸ Expiry ▸
   **Run**, deux touchers.)
6. Sur le site, vue **List** : à la place de l'image, une ligne (date du dépôt, `image`, `180 days`, consigne), puis
   tes mots.
7. Pour revenir en simulation : même requête qu'à l'étape 4 avec `enabled = false`. Pour effacer la ligne d'essai :
   /admin/ ▸ **Live** ▸ **Remove**.

### L'activer pour de bon

Une seule ligne, dans supabase.com ▸ SQL Editor ▸ **Run** :
```sql
update public.expiry_settings set enabled = true where id = 1;
```
À partir de là, chaque nuit à 03:00 (Tokyo), les dépôts qui ont passé 180 jours perdent leur image. Pour arrêter :
la même ligne avec `enabled = false`.

## Alerte e-mail

Si l'étape 4 de `docs/INSTALLATION.md` est faite, tu reçois un e-mail « Mood — nouveau dépôt à valider »
avec le texte et un lien vers cette page, et un e-mail « Mood — dépôt masqué après 3 signalements » quand un dépôt
publié vient d'être masqué : il n'est plus sur le mur, mais son fichier reste accessible par son adresse jusqu'à
ta décision (**Reported** ▸ **Restore** ou **Delete**).

## Si quelque chose ne marche pas

- « Failed — retry » après Approve, Reject, Remove ou Restore : l'action n'est pas terminée (panne passagère de la
  base ou du stockage). Rien n'est perdu : touche à nouveau le bouton, le second essai reprend là où ça s'est arrêté.

- « Ce compte n'est pas administrateur » : le compte n'est pas `rikuuux@gmail.com`.
- « Impossible de charger les dépôts » : le projet Supabase est peut-être en pause (offre gratuite, après
  7 jours sans activité ; une vérification hebdomadaire automatique l'évite normalement).
  Supabase ▸ ton projet ▸ **Restore project**.

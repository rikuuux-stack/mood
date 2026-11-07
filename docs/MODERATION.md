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
| **Archive** | une ligne par nuit : le mur entier capturé chaque nuit à 03:00 (heure de Tokyo), vue iPhone + vue ordinateur + état (dépôts, paliers, strates, consigne) | toucher une nuit : aperçu et téléchargement ; **Delete night** (2ᵉ toucher) pour une demande de retrait |

**Consigne du mois** : en haut, champ **Prompt** (un court texte anglais, 60 caractères au plus, ex. « trace. ») ▸ **Save**. Elle s'affiche « This month: trace. » sur le mur et dans Drop, et elle est gardée sur chaque nouveau dépôt : le mur se lit ainsi par strates (un mois, une consigne). **Clear** = pas de consigne ce mois-ci.

**Taille d'affichage** : sous chaque dépôt, trois cases **S / M / L** (la taille choisie par le visiteur est pleine).
Un toucher la change aussitôt, avant ou après validation.

Les photos s'affichent ici **en couleur et telles qu'envoyées**, pour que tu juges le vrai contenu.
Sur le mur, elles s'affichent en négatif noir et blanc (le même pour tous), puis pâlissent lentement avec le temps. Ici, dans /admin/, tu vois le vrai fichier, en couleur.

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
Si un jour tu décides de l'activer (à toi seul : aucun bouton ni programme du site ne peut le faire) :

1. supabase.com ▸ projet ▸ **SQL Editor** ▸ colle `update public.expiry_settings set enabled = true where id = 1;` ▸ **Run** ;
2. /admin/ ▸ **Expiry** : un bouton **Run** apparaît (2ᵉ toucher pour confirmer). Il supprime les fichiers (image, vidéo,
   image fixe) des dépôts publiés depuis plus de 180 jours, ainsi que leur pseudo ; il reste leur ligne dans la vue
   List (date, type, « 180 days », consigne) et, s'il y en avait, **les mots** déposés avec l'image : l'image s'en va,
   les mots restent. Les textes seuls ne sont jamais touchés.

Pour revenir en simulation : même chose avec `enabled = false`. Une suppression faite est **définitive**.

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

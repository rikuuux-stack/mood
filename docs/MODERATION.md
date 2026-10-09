# Mood — guide de modération

Rien de ce que déposent les visiteurs n'est visible avant que tu l'aies validé.

## Se connecter

1. Ouvre `https://moodwall.pages.dev/admin/` (ajoute-la à l'écran d'accueil de ton iPhone).
2. E-mail `rikuuux@gmail.com` + ton mot de passe ▸ **Log in**.
   La connexion reste active sur cet appareil ; **Log out** en haut à droite.

La page est en anglais, avec des mots très courts (choix validé).

## Les quatre onglets

| Onglet | Ce qu'il contient | Boutons |
|---|---|---|
| **Pending** (en attente) | les nouveaux dépôts, du plus ancien au plus récent | **Approve** : il apparaît sur le mur. **Reject** : il est supprimé définitivement (2ᵉ toucher, « Sure? », pour confirmer). |
| **Reported** (signalés) | les dépôts masqués automatiquement après 3 signalements | **Restore** (les signalements sont effacés) ou **Delete** |
| **Live** (publiés) | ce qui est sur le mur | **Remove** (suppression définitive) |
| **Drop** (déposer) | ton propre dépôt : image et/ou mots, taille S / M / L | publié tout de suite, comme n'importe quel dépôt (aucune marque visible ; « me » ici seulement) |

**Consigne du mois** : en haut, champ **Prompt** (un court texte anglais, 60 caractères au plus, ex. « trace. ») ▸ **Save**. Elle s'affiche « This month: trace. » sur le mur et dans Drop, et elle est gardée sur chaque nouveau dépôt : le mur se lit ainsi par strates (un mois, une consigne). **Clear** = pas de consigne ce mois-ci.

**Taille d'affichage** : sous chaque dépôt, trois cases **S / M / L** (la taille choisie par le visiteur est pleine).
Un toucher la change aussitôt, avant ou après validation.

Les photos s'affichent ici **en couleur et telles qu'envoyées**, pour que tu juges le vrai contenu.
Sur le mur, elles passent en noir et blanc avec du grain (le même pour tous), puis pâlissent lentement avec le temps.

**Vidéos et GIF** : une vidéo apparaît avec un lecteur (▶) et son image fixe ; touche-la pour la voir **avant de valider**.
Elle est déjà en noir et blanc (convertie sur le téléphone du visiteur), muette, 60 s au plus. Sous la carte : sa durée et son poids réel.
Un refus supprime la vidéo et son image fixe ; la validation les publie toutes les deux.

**Stockage** : en haut, « Storage … MB / 1 GB ». Dès 700 Mo, la ligne est soulignée (avertissement) ; à 900 Mo,
les nouvelles vidéos sont refusées (« Wall full — come back later. »). Pour libérer de la place : **Remove** sur de vieux dépôts.

## Ce qui est déjà filtré avant d'arriver chez toi

- vérification anti-robot (Turnstile), 3 dépôts par heure et 10 par jour par connexion ;
- toute image est convertie sur le téléphone du visiteur : stockée en 2000 px maximum, 5 Mo maximum, **aucune métadonnée** (GPS, appareil) ;
- vidéos et GIF convertis sur le téléphone : MP4 noir et blanc, 480 px, muet, 60 s et 4 Mo maximum, sans métadonnées ;
- texte limité par la règle « pixels contre mots » ; pseudo sans lien ;
- un visiteur a coché qu'il détient les droits et accepte la modération.

## Demande de retrait

Quelqu'un écrit à rikuuux@gmail.com pour retirer un contenu : onglet **Live** ▸ **Remove** (2ᵉ toucher pour confirmer).
Le fichier et le texte sont supprimés du serveur (pas seulement cachés).

## Alerte e-mail

Si l'étape 4 de `docs/INSTALLATION.md` est faite, tu reçois un e-mail « Mood — nouveau dépôt à valider »
avec le texte et un lien vers cette page.

## Si quelque chose ne marche pas

- « Ce compte n'est pas administrateur » : le compte n'est pas `rikuuux@gmail.com`.
- « Impossible de charger les dépôts » : le projet Supabase est peut-être en pause (offre gratuite, après
  7 jours sans activité ; une vérification hebdomadaire automatique l'évite normalement).
  Supabase ▸ ton projet ▸ **Restore project**.

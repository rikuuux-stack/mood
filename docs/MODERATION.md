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
| **Drop** (déposer) | ton propre dépôt : image et/ou mots, taille S / M / L, grain | publié tout de suite, avec ton petit carré clair |

**Taille d'affichage** : sous chaque dépôt, trois cases **S / M / L** (la taille choisie par le visiteur est pleine).
Un toucher la change aussitôt, avant ou après validation.

**Vidéos** : elles se lisent directement dans la carte (bouton lecture), en couleur, avec le grain tel qu'il s'affichera sur le mur ; la ligne grise indique leur durée et leur grain.
**Stockage** : en haut, `Storage … / 800 MB`. Au-delà de 800 Mo (l'offre gratuite en permet 1 Go), le site refuse automatiquement les nouvelles vidéos ; supprimer d'anciens dépôts libère de la place.

Les photos s'affichent ici **en couleur et telles qu'envoyées**, pour que tu juges le vrai contenu.
Sur le mur, elles passent en noir et blanc avec du grain.
Le **grain choisi par le visiteur** (curseur au dépôt) est déjà dans l'image : tu vois l'image finale.

## Ce qui est déjà filtré avant d'arriver chez toi

- vérification anti-robot (Turnstile), 3 dépôts par heure et 10 par jour par connexion ;
- images JPEG, PNG ou WebP uniquement, 5 Mo et 2000 px maximum, **aucune métadonnée** (GPS, appareil) ;
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

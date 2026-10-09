# Mood — guide de modération

Rien de ce que déposent les visiteurs n'est visible avant que tu l'aies validé.

## Se connecter

1. Ouvre `https://rikuuux-stack.github.io/riku-portfolio/admin/` (ajoute-la à l'écran d'accueil de ton iPhone).
2. E-mail `rikuuux@gmail.com` + ton mot de passe ▸ **Se connecter**.
   La connexion reste active sur cet appareil ; **Se déconnecter** en haut à droite.

## Les quatre onglets

| Onglet | Ce qu'il contient | Boutons |
|---|---|---|
| **En attente** | les nouveaux dépôts, du plus ancien au plus récent | **Valider** : il apparaît sur le mur. **Refuser** : il est supprimé définitivement (2ᵉ toucher pour confirmer). |
| **Signalés** | les dépôts masqués automatiquement après 3 signalements | **Remettre en ligne** (les signalements sont effacés) ou **Supprimer** |
| **Publiés** | ce qui est sur le mur | **Retirer du mur** (suppression définitive) |
| **Déposer** | ton propre dépôt | publié tout de suite, avec ton petit carré clair |

Les photos s'affichent ici **en couleur et telles qu'envoyées**, pour que tu juges le vrai contenu.
Sur le mur, elles passent en noir et blanc avec du grain.

## Ce qui est déjà filtré avant d'arriver chez toi

- vérification anti-robot (Turnstile), 3 dépôts par heure et 10 par jour par connexion ;
- images JPEG, PNG ou WebP uniquement, 5 Mo et 2000 px maximum, **aucune métadonnée** (GPS, appareil) ;
- texte limité par la règle « pixels contre mots » ; pseudo sans lien ;
- un visiteur a coché qu'il détient les droits et accepte la modération.

## Demande de retrait

Quelqu'un écrit à rikuuux@gmail.com pour retirer un contenu : onglet **Publiés** ▸ **Retirer du mur**.
Le fichier et le texte sont supprimés du serveur (pas seulement cachés).

## Alerte e-mail

Si l'étape 4 de `docs/INSTALLATION.md` est faite, tu reçois un e-mail « Mood — nouveau dépôt à valider »
avec le texte et un lien vers cette page.

## Si quelque chose ne marche pas

- « Ce compte n'est pas administrateur » : le compte n'est pas `rikuuux@gmail.com`.
- « Impossible de charger les dépôts » : le projet Supabase est peut-être en pause (offre gratuite, après
  7 jours sans activité ; une vérification hebdomadaire automatique l'évite normalement).
  Supabase ▸ ton projet ▸ **Restore project**.

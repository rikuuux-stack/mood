# RIKU — moodboard ouvert

Site de RIKU (Félix Cardonnel) : un mur de moodboard où chacun peut déposer une image ou un court texte. Rien n'est publié sans validation de RIKU.

**État actuel : maquette statique.** Les contenus sont fictifs (`js/mock.js`) et aucun envoi n'a lieu. Le branchement à Supabase (dépôts réels, modération, captcha, alerte e-mail) est l'étape suivante.

## Voir le site en local

```bash
python3 -m http.server 8000      # puis http://localhost:8000
```

Les modules JavaScript ne fonctionnent pas en `file://` : il faut un petit serveur local.

## Où modifier quoi

| Je veux… | Fichier |
|---|---|
| changer un texte de l'interface (FR / JA / EN) | `js/strings.js` |
| changer une limite (poids, taille, nombre de caractères, densité du mur) | `js/config.js` |
| changer les couleurs ou la typographie | `css/site.css` (variables en haut du fichier) |
| comprendre le placement du mur | `js/wall.js` |
| régénérer les polices après un nouveau texte japonais | `python3 tools/fonts/subset.py` |

## Tests

```bash
node tests/wall.test.mjs          # règles de lisibilité du mur
```

## Archive

L'ancien portfolio (espace 3D three.js) est conservé sur la branche `archive/expo-3d`.

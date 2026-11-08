# Guide associé — modifier MakomSpace sans rien casser

Ce guide est autonome : il suffit d'un navigateur et d'un compte GitHub.

## Principe

Le code vit sur GitHub. Personne n'écrit directement dans la version en ligne : on propose un changement (une « PR »), il est vérifié automatiquement, relu, puis mis en ligne. Tu ne peux donc rien casser par erreur.

## Modifier un fichier (5 étapes)

1. Ouvre le dépôt sur GitHub et appuie sur la touche `.` (point) : un éditeur s'ouvre dans le navigateur.
2. Ouvre le fichier à modifier (voir « Où trouver quoi » plus bas) et change le texte entre guillemets, sans toucher au reste.
3. Clique sur l'icône « Source Control » à gauche (la branche), écris une phrase qui décrit le changement, puis choisis « Create new branch » et donne-lui un nom (ex. `texte-faq`).
4. GitHub propose « Create Pull Request » : valide.
5. Préviens ton associé. Il relit, la vérification automatique passe au vert, il fusionne : le changement part en test (staging), puis en production.

## Où trouver quoi

| Je veux changer | Fichier |
|---|---|
| Les questions/réponses de l'aide | `src/app/(marketing)/faq/faq-content.ts` |
| Les mentions légales, CGU, CGV, confidentialité, cookies | `src/app/(marketing)/<nom de la page>/page.tsx` |
| La page « À propos », « Comment ça marche », « Contact » | `src/app/(marketing)/<nom de la page>/page.tsx` |
| Slogan et description du site | `src/lib/site.ts` |

Les informations de la société (raison sociale, capital, RCS, TVA, adresse, e-mails, médiateur…) ne se modifient pas dans le code : donne-les simplement à ton associé, qui les renseigne sur le serveur.

## Règles simples

- Ne modifie que du texte. Si une ligne contient des accolades `{ }`, `${ }` ou des balises `< >`, laisse-les telles quelles.
- Ne colle jamais de mot de passe, de clé ou de secret dans un fichier.
- Un doute ? Ne valide pas : écris ton idée à ton associé, il s'en occupe.
- Tu peux annuler à tout moment : tant que la PR n'est pas fusionnée, rien n'est en ligne.

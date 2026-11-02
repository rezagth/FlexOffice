# Tests : règles du dépôt

Principe : **une fonctionnalité = au moins un test**, écrit dans le même commit que la fonctionnalité.
Un écran modifié = ses tests e2e mis à jour dans le même commit.

## Quel test pour quoi

| Ce qu'on change | Test à ajouter ou mettre à jour |
| --- | --- |
| Règle métier, calcul, validation | Unitaire (`tests/unit`) |
| Base de données, droits (RLS), paiements, facturation | Intégration (`tests/integration`) |
| Écran ou parcours utilisateur | e2e Playwright (`tests/e2e`) |
| Route API | Garde d'accès (`api-route-guards`, `api-route-wrong-role`) |

## Sélecteurs e2e : toujours `data-testid`

Les tests e2e ne cherchent **jamais** un élément par son texte visible (libellé, titre, bouton),
parce qu'un changement de wording ou de design les casserait sans qu'aucune fonctionnalité ne soit cassée.
On utilise `page.getByTestId("...")`.

- Nom : `<écran>-<élément>` en minuscules avec tirets : `login-email`, `login-submit`, `signup-next`.
- Pour une liste de choix : `<écran>-<champ>-<valeur>` : `signup-need-search`, `signup-holder-company`.
- Un message d'erreur de formulaire : `<écran>-error`.
- Un conteneur d'étape : `<écran>-step-<nom>`.
- Un `data-testid` est un contrat : on ne le renomme pas sans mettre à jour les tests.
- On l'ajoute en même temps que l'élément, pas après un échec de CI.

Exemple : `FormMessage` accepte `testId` ; `PasswordInput` et `Input` transmettent `data-testid` à l'`<input>`.

## Tests de fumée

Les tests dont le titre se termine par `@smoke` forment le lot rapide (connexion, inscription, recherche).

```
pnpm build
pnpm test:e2e:smoke
```

À lancer avant de pousser quand on a touché à un écran. Un nouveau parcours critique reçoit aussi `@smoke`.

## Avant de merger

La CI doit être verte : lint, typecheck, tests unitaires, tests d'intégration, e2e, sécurité.
Un test rouge n'est jamais supprimé ni mis en `skip` pour faire passer la CI : on le corrige.

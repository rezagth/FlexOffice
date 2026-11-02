## Ce que fait cette PR

<!-- Une ou deux phrases. -->

## Tests (voir docs/testing.md)

- [ ] La fonctionnalité a son test (unitaire, intégration ou e2e selon le cas)
- [ ] Les écrans modifiés ont leurs tests e2e à jour, avec des `data-testid` (pas de sélecteur par texte)
- [ ] `pnpm lint`, `pnpm typecheck` et `pnpm test` passent en local
- [ ] Si un écran a changé : `pnpm test:e2e:smoke` passe en local

## Sécurité

- [ ] Aucun secret ni fichier `.env` ajouté
- [ ] Si la PR touche paiement, authentification, webhook ou droits : relecture manuelle faite

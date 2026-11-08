<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Tests (règle du dépôt)

Toute fonctionnalité ou modification d'écran vient avec ses tests **dans le même commit** : unitaire pour la logique, intégration pour base/droits/paiements, e2e pour les parcours. Les tests e2e sélectionnent les éléments avec `getByTestId` et des `data-testid` ajoutés en même temps que l'élément, jamais par texte visible. Détails et conventions de nommage : `docs/testing.md`. Ne jamais supprimer ni mettre en `skip` un test rouge pour faire passer la CI.

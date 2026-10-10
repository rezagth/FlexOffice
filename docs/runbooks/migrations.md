# Migrations

- Écrites à la main dans `prisma/migrations/<horodatage>_<nom>/migration.sql` (Prisma ne sait pas exprimer RLS, CHECK, EXCLUDE, triggers). `schema.prisma` doit rester strictement cohérent.
- **Toute nouvelle table** : `ENABLE ROW LEVEL SECURITY` et `REVOKE ALL ... FROM anon, authenticated` dans la même migration. La CI échoue sinon.
- Une nouvelle valeur d'enum ne s'utilise pas dans la migration qui l'ajoute (Prisma exécute chaque fichier dans une transaction) : deux migrations.
- **Expand-only** : ajouter d'abord, retirer dans une version suivante (voir [rollback.md](rollback.md)).
- Appliquées par le job `migrate` de `deploy.yml` (`pnpm db:deploy` = `prisma migrate deploy`), avec `DIRECT_URL` (connexion directe, rôle `postgres`, pas le pooler), **avant** le redéploiement.
- En local / test : `tests/sql/auth-schema-shim.sql` puis `pnpm db:deploy` sur une base vide.

Avant une migration risquée en prod : sauvegarde à la demande (`pg_dump`, voir fiche suivante).

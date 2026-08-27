// Config for the Prisma CLI (migrate, studio, db seed) — NOT used by the
// runtime client, which is configured separately in src/server/db/prisma.ts
// via a driver adapter. See README.md "Base de données" for why DATABASE_URL
// and DIRECT_URL are two different Supabase connection strings.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Direct (non-pooled) connection: required for the advisory locks and
    // DDL that `prisma migrate` runs — Supabase's pgbouncer pooler (used by
    // DATABASE_URL) does not support these in transaction mode.
    //
    // Read directly from process.env (not the throwing `env()` helper from
    // "prisma/config"): `prisma generate` — run on every `pnpm install`,
    // including CI/deploy installs — only needs the schema, not a live
    // connection, and must not fail just because DIRECT_URL isn't set yet
    // at that point. `prisma migrate`/`db seed` still fail with Prisma's
    // own clear error if this is genuinely missing when they actually need it.
    url: process.env.DIRECT_URL,
  },
});

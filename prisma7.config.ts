// Config for the Prisma CLI (migrate, studio, db seed) — NOT used by the
// runtime client, which is configured separately in src/server/db/prisma.ts
// via a driver adapter. See README.md "Base de données" for why DATABASE_URL
// and DIRECT_URL are two different Supabase connection strings.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

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
    url: env("DIRECT_URL"),
  },
});

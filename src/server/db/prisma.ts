import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Next.js reloads modules on every request in dev; a module-scoped global
// keeps a single pool/client across those reloads instead of leaking
// connections (the standard Prisma-on-serverless pattern).
declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Pooled (pgbouncer) connection string — safe for the request-scoped
  // usage of a Next.js app. Migrations use DIRECT_URL instead, configured
  // separately in prisma7.config.ts.
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

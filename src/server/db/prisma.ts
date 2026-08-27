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

function getPrismaClient(): PrismaClient {
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
  }
  return globalThis.__prisma;
}

// Lazy by design: Next.js imports every route module during `next build`'s
// "Collecting page data" step just to analyze it, with no request and no
// runtime env vars guaranteed yet. A client created eagerly at module load
// (`export const prisma = new PrismaClient(...)`) would throw the moment
// this file is imported — failing the build even for routes that never
// actually query the database during that step. A Proxy defers the throw
// (and the real connection) to the first actual property access, i.e. the
// first real query at request time.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver);
  },
});

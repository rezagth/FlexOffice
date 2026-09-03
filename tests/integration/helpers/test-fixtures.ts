import { prisma } from "@/server/db/prisma";

/**
 * Fixtures for the database-level integration suites.
 *
 * Test users are created by INSERTing into `auth.users` with raw SQL rather
 * than through the Supabase admin API. Two reasons, both deliberate:
 *
 *   1. It removes the Supabase dependency from suites that are really testing
 *      the schema, so they can run in CI against an ephemeral PostgreSQL
 *      (with tests/sql/auth-schema-shim.sql providing `auth.users`).
 *   2. It exercises the real `handle_new_user` trigger, which is what
 *      actually creates the `profiles` row — including its role whitelist.
 *      Going through the admin API would test Supabase; this tests our
 *      trigger.
 *
 * Everything is suffixed with a unique token so parallel runs and repeated
 * runs against a persistent database never collide.
 */

export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 14 digits, as `organizations_siret_format_check` requires. */
export function uniqueSiret(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return digits.slice(-14).padStart(14, "1");
}

export type TestUser = { id: string; email: string };

/**
 * Creates an auth user and lets the `handle_new_user` trigger create the
 * matching profile. `metadata` is passed through as `raw_user_meta_data` —
 * i.e. exactly the client-controlled payload the trigger has to treat as
 * hostile.
 */
export async function createTestUser(
  metadata: Record<string, string> = { role: "CLIENT", name: "Test User" }
): Promise<TestUser> {
  const email = `test-${uniqueSuffix()}@test.officeflex.local`;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO auth.users (id, email, raw_user_meta_data)
     VALUES (gen_random_uuid(), $1, $2::jsonb)
     RETURNING id`,
    email,
    JSON.stringify(metadata)
  );

  const id = rows[0]?.id;
  if (!id) throw new Error("failed to create test auth user");
  return { id, email };
}

/**
 * Removes an auth user. The cascade to `profiles` does the rest — which is
 * itself worth exercising, since a blocked cascade was the original bug
 * (see migration 20260903103000_account_deletion_strategy).
 */
export async function deleteTestUser(userId: string) {
  await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = $1`, userId);
}

export async function createTestOrganization(options: { name?: string; city?: string } = {}) {
  const suffix = uniqueSuffix();
  return prisma.organization.create({
    data: {
      name: options.name ?? `Test Org ${suffix}`,
      siret: uniqueSiret(),
      email: `org-${suffix}@test.local`,
      address: "1 rue de Test",
      city: options.city ?? "Paris",
      postalCode: "75001",
    },
  });
}

export async function createTestSpace(
  organizationId: string,
  overrides: Partial<{
    capacity: number;
    status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
    city: string;
  }> = {}
) {
  const suffix = uniqueSuffix();
  return prisma.space.create({
    data: {
      organizationId,
      slug: `space-${suffix}`,
      name: `Test Space ${suffix}`,
      type: "MEETING_ROOM",
      description: "Fixture space",
      address: "1 rue de Test",
      city: overrides.city ?? "Paris",
      postalCode: "75001",
      capacity: overrides.capacity ?? 8,
      amenities: [],
      photos: [],
      halfDayPriceCents: 12000,
      dayPriceCents: 20000,
      status: overrides.status ?? "PUBLISHED",
    },
  });
}

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
 *
 * Always carries a `phone`, merged under whatever the caller passes: R22-R24
 * requires one on file before `createBooking()` accepts a request, and most
 * callers of this fixture don't care about phone at all — without a default
 * here every one of them would need to add one just to keep booking tests
 * passing. A caller that does care (e.g. GDPR erasure, asserting it gets
 * wiped) overrides it explicitly, same as any other field.
 *
 * Also backfills `account_need`/`holder_type` (R15) to a plain complete
 * individual tenant — `handle_new_user` doesn't read either from metadata
 * (it never needed to, they didn't exist until migration 20261018143000), so
 * this can't be done the same way as `phone` above; a direct update after
 * the trigger runs is the only way. A test that needs something else
 * (a company, a different need) overrides it with its own
 * `prisma.profile.update()` afterwards, same as it already does for other
 * profile fields.
 */
export async function createTestUser(
  metadata: Record<string, string> = { role: "CLIENT", name: "Test User" }
): Promise<TestUser> {
  const email = `test-${uniqueSuffix()}@test.officeflex.local`;
  const merged = { phone: "0600000000", ...metadata };

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO auth.users (id, email, raw_user_meta_data)
     VALUES (gen_random_uuid(), $1, $2::jsonb)
     RETURNING id`,
    email,
    JSON.stringify(merged)
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("failed to create test auth user");
  await prisma.profile.update({
    where: { id },
    data: { accountNeed: "SEARCH", holderType: "INDIVIDUAL" },
  });
  return { id, email };
}

/**
 * Removes an auth user. The cascade to `profiles` does the rest — which is
 * itself worth exercising, since a blocked cascade was the original bug
 * (see migration 20260903103000_account_deletion_strategy).
 *
 * `landlord_verifications.requested_by_profile_id` is ON DELETE RESTRICT by
 * design (see migration 20260905100000_landlord_verification) — a review
 * decision must not silently lose who asked for it. The application's own
 * deletion path (`domains/users/gdpr.ts`) accounts for that by anonymizing
 * rather than hard-deleting an account with verification history; this raw
 * helper is test cleanup, not that path, so it clears the dossier directly
 * first. Documents cascade automatically from the verification.
 */
export async function deleteTestUser(userId: string) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM landlord_verifications WHERE requested_by_profile_id = $1`,
    userId
  );
  // Same RESTRICT-FK reason as landlord_verifications above, added in
  // Phase 4: properties.created_by_profile_id, and the profile-held rows on
  // the three property_* join tables. Owner/operator/manager rows cascade
  // away with their property; a profile that only appears as a holder (not
  // a creator) needs its own rows cleared directly.
  await prisma.$executeRawUnsafe(`DELETE FROM properties WHERE created_by_profile_id = $1`, userId);
  await prisma.$executeRawUnsafe(`DELETE FROM property_owners WHERE profile_id = $1`, userId);
  await prisma.$executeRawUnsafe(`DELETE FROM property_operators WHERE profile_id = $1`, userId);
  await prisma.$executeRawUnsafe(`DELETE FROM property_managers WHERE profile_id = $1`, userId);
  await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = $1`, userId);
}

/** `holderType` defaults to COMPANY (schema default) — `legalName` is set
 * to match (R22/R24: a COMPANY org missing its legal name fails
 * isCompanyInfoComplete, which a booking by one of its members now checks). */
export async function createTestOrganization(options: { name?: string; city?: string } = {}) {
  const suffix = uniqueSuffix();
  const name = options.name ?? `Test Org ${suffix}`;
  return prisma.organization.create({
    data: {
      name,
      legalName: name,
      siret: uniqueSiret(),
      email: `org-${suffix}@test.local`,
      address: "1 rue de Test",
      city: options.city ?? "Paris",
      postalCode: "75001",
    },
  });
}

/** A Property owned and operated by `organizationId` — every Space fixture
 * needs one now (Phase 4: `spaces.property_id` is NOT NULL). `profileId`
 * is a real profile (RESTRICT FK on `created_by_profile_id`): any test
 * profile works as the "creator", including one otherwise unrelated to
 * this organization, since nothing here asserts who created a property. */
export async function createTestProperty(
  organizationId: string,
  createdByProfileId: string,
  overrides: Partial<{ city: string }> = {}
) {
  const suffix = uniqueSuffix();
  return prisma.property.create({
    data: {
      label: `Test Property ${suffix}`,
      propertyType: "OFFICE",
      addressLine1: "1 rue de Test",
      city: overrides.city ?? "Paris",
      postalCode: "75001",
      createdByProfileId,
      owners: { create: { organizationId, ownershipShareBasisPoints: 10000 } },
      operators: { create: { organizationId } },
    },
  });
}

export async function createTestSpace(
  organizationId: string,
  propertyId: string,
  overrides: Partial<{
    capacity: number;
    status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
    city: string;
  }> = {}
) {
  const suffix = uniqueSuffix();
  return prisma.space.create({
    data: {
      propertyId,
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

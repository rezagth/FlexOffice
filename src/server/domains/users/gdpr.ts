import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";

/** Everything the platform holds about one account, for the GDPR right of
 * access. Only the requesting user's own data — every query is scoped by
 * their session-derived id, never a client-supplied one. */
export async function exportProfileData(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!profile) throw new NotFoundError("Profile not found");

  const [bookings, favorites] = await Promise.all([
    prisma.booking.findMany({
      where: { clientUserId: userId },
      include: { space: { select: { name: true, address: true, city: true } }, payment: true },
      orderBy: { startsAt: "desc" },
    }),
    prisma.favorite.findMany({
      where: { userId },
      include: { space: { select: { name: true, slug: true } } },
    }),
  ]);

  await recordAudit({ event: "gdpr.data_exported", actorUserId: userId });

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      phone: profile.phone,
      role: profile.role,
      createdAt: profile.createdAt,
      organization: profile.organization
        ? { name: profile.organization.name, siret: profile.organization.siret }
        : null,
    },
    bookings,
    favorites,
  };
}

/**
 * GDPR right to erasure. A profile with bookings cannot be removed from
 * the database — bookings.client_user_id_fkey is ON DELETE RESTRICT, and
 * the booking/payment records themselves must be retained for accounting
 * and proof-of-transaction (art. 17§3(e)). Such accounts are anonymized
 * in place and their auth user is banned instead; accounts with no
 * booking history are deleted outright.
 *
 * Phase 3 widened "has history" beyond bookings. A landlord's
 * OrganizationMember row and any LandlordVerification they requested are
 * also ON DELETE RESTRICT (an organization or a review decision must not
 * silently lose who it belongs to, or who asked for it) — so an account
 * that opened a letting activity but has zero bookings would otherwise
 * attempt a hard delete, cascade from auth.users into profiles, and then
 * fail with a raw foreign-key error instead of the clean GDPR flow. Both
 * are checked here for exactly the same reason bookings are.
 *
 * Phase 4 adds the same shape again: `properties.created_by_profile_id`
 * and the profile-held rows on `property_owners`/`property_operators`/
 * `property_managers` are all ON DELETE RESTRICT too — a property, or a
 * legal ownership record, must not silently lose who it names.
 */
export async function deleteOrAnonymizeProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profile) throw new NotFoundError("Profile not found");

  const [
    bookingCount,
    membershipCount,
    verificationCount,
    propertyCreatedCount,
    propertyHolderCount,
  ] = await Promise.all([
    prisma.booking.count({ where: { clientUserId: userId } }),
    prisma.organizationMember.count({ where: { profileId: userId } }),
    prisma.landlordVerification.count({ where: { requestedByProfileId: userId } }),
    prisma.property.count({ where: { createdByProfileId: userId } }),
    Promise.all([
      prisma.propertyOwner.count({ where: { profileId: userId } }),
      prisma.propertyOperator.count({ where: { profileId: userId } }),
      prisma.propertyManager.count({ where: { profileId: userId } }),
    ]).then((counts) => counts.reduce((a, b) => a + b, 0)),
  ]);
  const hasHistory =
    bookingCount > 0 ||
    membershipCount > 0 ||
    verificationCount > 0 ||
    propertyCreatedCount > 0 ||
    propertyHolderCount > 0;
  const admin = createSupabaseAdminClient();

  await prisma.favorite.deleteMany({ where: { userId } });

  if (!hasHistory) {
    // Deleting the auth user cascades to profiles via profiles_id_fkey.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    await recordAudit({ event: "gdpr.account_deleted", metadata: { userId, mode: "hard_delete" } });
    return { mode: "hard_delete" as const };
  }

  // The tombstone address is also written to auth.users below, so it has to
  // be computed once. Its shape is pinned by
  // `profiles_anonymized_has_no_pii_check` (migration
  // 20260903110100_business_integrity_constraints), which rejects a row
  // carrying `deleted_at` while still holding an email or a phone number —
  // so a half-done anonymization cannot be committed. Keep the two in step.
  const tombstoneEmail = `deleted-${crypto.randomUUID()}@officeflex.invalid`;

  await prisma.profile.update({
    where: { id: userId },
    data: {
      name: "Compte supprimé",
      email: tombstoneEmail,
      phone: null,
      deletedAt: new Date(),
    },
  });

  // Banning alone left the real address, and any phone number, sitting in
  // auth.users indefinitely — erasure has to cover both sides, not just the
  // copy this app owns. user_metadata is emptied too: it holds the name and
  // phone supplied at signup.
  //
  // ~100 years for the ban: Supabase has no permanent-ban flag, and the auth
  // user cannot be deleted while bookings reference the profile.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: tombstoneEmail,
    phone: undefined,
    user_metadata: {},
    ban_duration: "876000h",
  });
  if (error) throw error;

  await recordAudit({
    event: "gdpr.account_deleted",
    metadata: {
      userId,
      mode: "anonymized",
      retainedBookings: bookingCount,
      retainedMemberships: membershipCount,
      retainedVerifications: verificationCount,
      retainedPropertiesCreated: propertyCreatedCount,
      retainedPropertyHolderRows: propertyHolderCount,
    },
  });
  return { mode: "anonymized" as const };
}

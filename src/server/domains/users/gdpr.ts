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
 */
export async function deleteOrAnonymizeProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profile) throw new NotFoundError("Profile not found");

  const bookingCount = await prisma.booking.count({ where: { clientUserId: userId } });
  const admin = createSupabaseAdminClient();

  await prisma.favorite.deleteMany({ where: { userId } });

  if (bookingCount === 0) {
    // Deleting the auth user cascades to profiles via profiles_id_fkey.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    await recordAudit({ event: "gdpr.account_deleted", metadata: { userId, mode: "hard_delete" } });
    return { mode: "hard_delete" as const };
  }

  await prisma.profile.update({
    where: { id: userId },
    data: {
      name: "Compte supprimé",
      email: `deleted-${crypto.randomUUID()}@officeflex.invalid`,
      phone: null,
      deletedAt: new Date(),
    },
  });

  // ~100 years: Supabase has no permanent-ban flag, and the auth user
  // cannot be deleted while bookings reference the profile.
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (error) throw error;

  await recordAudit({
    event: "gdpr.account_deleted",
    metadata: { userId, mode: "anonymized", retainedBookings: bookingCount },
  });
  return { mode: "anonymized" as const };
}

import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { assertCurrentPassword } from "./reauth";
import { purgeVerificationDocuments } from "./retention";

/** Body written over erased free text that has to keep its row. */
export const ERASED_TEXT = "[Contenu supprimé à la demande de l'utilisateur]";

/** Bookings that still commit someone to something: a card hold, a request
 * waiting for the landlord, or a confirmed slot. */
const ACTIVE_BOOKING_STATUSES = ["AWAITING_PAYMENT", "PENDING", "CONFIRMED"] as const;

/**
 * Everything the platform holds about one account, for the GDPR right of
 * access (art. 15) and portability (art. 20). Only the requesting user's own
 * data — every query is scoped by their session-derived id, never a
 * client-supplied one.
 *
 * Deliberately left out: other people's identities (a landlord's messages
 * appear, flagged as not sent by the user, without the sender's id), Storage
 * paths of KYC files (internal keys — the files themselves are not part of
 * a JSON export), and payment-provider secrets.
 */
export async function exportProfileData(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!profile) throw new NotFoundError("Profile not found");

  const [bookings, favorites, messages, supportTickets, disputes, verifications, memberships] =
    await Promise.all([
      prisma.booking.findMany({
        where: { clientUserId: userId },
        include: { space: { select: { name: true, address: true, city: true } }, payment: true },
        orderBy: { startsAt: "desc" },
      }),
      prisma.favorite.findMany({
        where: { userId },
        include: { space: { select: { name: true, slug: true } } },
      }),
      // The user's own messages anywhere, plus the whole thread of the
      // conversations attached to their own bookings.
      prisma.message.findMany({
        where: {
          OR: [{ senderUserId: userId }, { conversation: { booking: { clientUserId: userId } } }],
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
          senderUserId: true,
          conversation: { select: { bookingId: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.supportTicket.findMany({
        where: {
          OR: [{ userId }, { email: { equals: profile.email, mode: "insensitive" } }],
        },
        select: { id: true, email: true, subject: true, message: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.dispute.findMany({
        where: { raisedByUserId: userId },
        select: {
          id: true,
          bookingId: true,
          status: true,
          description: true,
          resolutionNotes: true,
          createdAt: true,
          events: { select: { status: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.landlordVerification.findMany({
        where: { requestedByProfileId: userId },
        select: {
          id: true,
          organizationId: true,
          activityType: true,
          status: true,
          isRealEstateProfessional: true,
          submittedAt: true,
          reviewedAt: true,
          rejectionReason: true,
          expiresAt: true,
          createdAt: true,
          documents: {
            select: {
              type: true,
              originalFilename: true,
              mimeType: true,
              sizeBytes: true,
              status: true,
              uploadedAt: true,
              purgedAt: true,
            },
          },
        },
      }),
      prisma.organizationMember.findMany({
        where: { profileId: userId },
        select: {
          orgRole: true,
          status: true,
          joinedAt: true,
          organization: {
            select: {
              id: true,
              name: true,
              holderType: true,
              legalName: true,
              siret: true,
              siren: true,
              vatNumber: true,
              legalRepresentativeName: true,
              status: true,
              email: true,
              address: true,
              city: true,
              postalCode: true,
              createdAt: true,
            },
          },
        },
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
      termsAcceptedAt: profile.termsAcceptedAt,
      termsVersion: profile.termsVersion,
      organization: profile.organization
        ? { name: profile.organization.name, siret: profile.organization.siret }
        : null,
    },
    bookings,
    favorites,
    messages: messages.map((message) => ({
      id: message.id,
      bookingId: message.conversation.bookingId,
      sentByYou: message.senderUserId === userId,
      body: message.body,
      createdAt: message.createdAt,
    })),
    supportTickets,
    disputes,
    verifications,
    memberships,
  };
}

/**
 * Refuses erasure while the account is still party to a live booking
 * (FCT-19): a pending request or a confirmed slot has a landlord waiting on
 * it and money held or taken. Erasing the client mid-way would leave both
 * without a counterpart. Cancel first, then delete.
 */
export async function assertNoActiveClientBookings(userId: string, now: Date = new Date()) {
  const active = await prisma.booking.count({
    where: {
      clientUserId: userId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      endsAt: { gt: now },
    },
  });
  if (active > 0) {
    throw new ConflictError(
      active === 1
        ? "Vous avez une réservation en cours ou à venir. Annulez-la ou attendez qu'elle soit terminée avant de supprimer votre compte."
        : `Vous avez ${active} réservations en cours ou à venir. Annulez-les ou attendez qu'elles soient terminées avant de supprimer votre compte.`
    );
  }
}

/**
 * Self-service erasure (POST /api/client/gdpr/delete): re-authentication
 * with the current password, then the live-booking check, then erasure.
 * The password is checked first so a stolen session cookie alone can
 * neither erase the account nor probe it.
 */
export async function deleteOwnAccount(params: { userId: string; email: string; password: string }) {
  await assertCurrentPassword(params.email, params.password);
  await assertNoActiveClientBookings(params.userId);
  return deleteOrAnonymizeProfile(params.userId);
}

/**
 * GDPR right to erasure. A profile with history cannot be removed from the
 * database — bookings, memberships, verification requests, properties,
 * messages and disputes all reference it ON DELETE RESTRICT, and booking
 * and payment records must be retained for accounting and proof of
 * transaction (art. 17§3(b) and (e)). Such accounts are anonymized in place
 * and their auth user is banned; accounts with no history are deleted.
 *
 * What erasure covers, in both branches:
 *   - favorites: deleted;
 *   - support tickets (by user id OR by the account's address — "Nous
 *     contacter" works signed out): address, subject and message erased.
 *     Their user_id FK is ON DELETE SET NULL, so a hard delete alone would
 *     have orphaned them with the e-mail and text intact;
 * and in the anonymized branch, additionally:
 *   - profile: name, e-mail (tombstone), phone (NULL);
 *   - auth.users: e-mail (same tombstone), every metadata key (name and
 *     phone included) removed, ban;
 *   - messages sent: body erased (the row stays so the thread's other
 *     side keeps its structure);
 *   - KYC files of every organization where this account is the only
 *     member left: deleted from the private bucket, rows marked purged.
 *
 * Kept on purpose, as accounting / legal records: bookings (incl. purpose),
 * payments, disputes and their descriptions, organizations (a company's
 * registration data is not the person's), audit logs.
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
    messageCount,
    disputeCount,
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
    prisma.message.count({ where: { senderUserId: userId } }),
    prisma.dispute.count({ where: { raisedByUserId: userId } }),
  ]);
  const hasHistory =
    bookingCount > 0 ||
    membershipCount > 0 ||
    verificationCount > 0 ||
    propertyCreatedCount > 0 ||
    propertyHolderCount > 0 ||
    messageCount > 0 ||
    disputeCount > 0;
  const admin = createSupabaseAdminClient();

  // Before anything irreversible: if Storage is down, the request fails and
  // can be retried, rather than leaving an anonymized account whose identity
  // documents are still in the bucket.
  const soleMemberOrganizationIds = await organizationsWhereSoleMember(userId);
  const kycDocumentsPurged =
    soleMemberOrganizationIds.length > 0
      ? await purgeVerificationDocuments({
          verification: { organizationId: { in: soleMemberOrganizationIds } },
        })
      : 0;

  const ticketScope = {
    OR: [{ userId }, { email: { equals: profile.email, mode: "insensitive" as const } }],
  };

  if (!hasHistory) {
    await prisma.$transaction([
      prisma.favorite.deleteMany({ where: { userId } }),
      prisma.supportTicket.updateMany({
        where: ticketScope,
        data: { email: "deleted@officeflex.invalid", subject: ERASED_TEXT, message: ERASED_TEXT },
      }),
    ]);
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

  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId } }),
    prisma.supportTicket.updateMany({
      where: ticketScope,
      data: { email: tombstoneEmail, subject: ERASED_TEXT, message: ERASED_TEXT },
    }),
    prisma.message.updateMany({ where: { senderUserId: userId }, data: { body: ERASED_TEXT } }),
    prisma.profile.update({
      where: { id: userId },
      data: {
        name: "Compte supprimé",
        email: tombstoneEmail,
        phone: null,
        deletedAt: new Date(),
      },
    }),
  ]);

  // Erasure has to cover auth.users too, not just the copy this app owns.
  //
  // SEC-10: the previous call sent `phone: undefined` and `user_metadata: {}`
  // and erased neither. supabase-js drops `undefined` from the JSON body, and
  // GoTrue MERGES user_metadata — `{}` changes nothing. The phone given at
  // signup lives in user_metadata.phone (signUp never sets auth.users.phone),
  // so every metadata key is now sent explicitly as null, which GoTrue
  // treats as "remove this key". The known signup keys are always included,
  // in case the read below fails.
  //
  // ~100 years for the ban: Supabase has no permanent-ban flag, and the auth
  // user cannot be deleted while bookings reference the profile.
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: tombstoneEmail,
    user_metadata: clearedMetadata(authUser?.user?.user_metadata),
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
      erasedMessages: messageCount,
      kycDocumentsPurged,
    },
  });
  return { mode: "anonymized" as const };
}

/** Keys written into user_metadata at signup (users/register.ts). */
const SIGNUP_METADATA_KEYS = [
  "role",
  "name",
  "phone",
  "organization_name",
  "organization_siret",
  "organization_address",
  "organization_city",
  "organization_postal_code",
  "organization_email",
];

/** A user_metadata patch that removes every key: GoTrue merges metadata and
 * deletes a key only when it is sent as null. */
export function clearedMetadata(current: Record<string, unknown> | null | undefined): Record<string, null> {
  const keys = new Set([...SIGNUP_METADATA_KEYS, ...Object.keys(current ?? {})]);
  return Object.fromEntries([...keys].map((key) => [key, null]));
}

/**
 * Organizations this profile belongs to with no OTHER active or invited
 * member — i.e. nobody left who could still need the verification files.
 */
async function organizationsWhereSoleMember(userId: string): Promise<string[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { profileId: userId },
    select: { organizationId: true },
  });
  if (memberships.length === 0) return [];

  const ids = memberships.map((m) => m.organizationId);
  const shared = await prisma.organizationMember.findMany({
    where: {
      organizationId: { in: ids },
      profileId: { not: userId },
      status: { in: ["ACTIVE", "INVITED"] },
    },
    select: { organizationId: true },
    distinct: ["organizationId"],
  });
  const sharedIds = new Set(shared.map((m) => m.organizationId));
  return ids.filter((id) => !sharedIds.has(id));
}

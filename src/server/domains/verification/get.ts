import { prisma } from "@/server/db/prisma";

/**
 * The document fields safe to hand to a client without a signed URL.
 * `storagePath` never leaves the server — see `createSignedDocumentUrl()`
 * in storage.ts for the only sanctioned way a caller learns how to reach the
 * actual bytes, generated on demand and expiring in minutes.
 */
const DOCUMENT_SELECT = {
  id: true,
  type: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  uploadedAt: true,
} as const;

/** The caller's own dossier, with its documents. Null if they hold no
 * landlord organization at all. */
export async function getOwnVerification(profileId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { profileId, status: "ACTIVE" },
    select: { organizationId: true },
  });
  if (!membership) return null;

  const verification = await prisma.landlordVerification.findFirst({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      documents: { select: DOCUMENT_SELECT, orderBy: { uploadedAt: "asc" } },
      organization: { select: { id: true, name: true, holderType: true, status: true } },
    },
  });

  return verification;
}

/** For the admin review screen: the dossier plus everything a reviewer
 * needs to see, regardless of which organization it belongs to. */
export async function getVerificationForAdmin(verificationId: string) {
  return prisma.landlordVerification.findUnique({
    where: { id: verificationId },
    include: {
      documents: { select: DOCUMENT_SELECT, orderBy: { uploadedAt: "asc" } },
      organization: { select: { id: true, name: true, holderType: true, status: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });
}

export type VerificationListFilter = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "ALL";

/** The admin queue, grouped the way the review screen presents it — "à
 * vérifier" bundles DRAFT-adjacent PENDING_REVIEW dossiers, since a DRAFT
 * one has not been submitted and has nothing for an admin to look at yet. */
export async function listVerificationsForAdmin(filter: VerificationListFilter = "ALL") {
  const statusFilter =
    filter === "PENDING"
      ? (["PENDING_REVIEW"] as const)
      : filter === "IN_REVIEW"
        ? (["IN_REVIEW"] as const)
        : filter === "APPROVED"
          ? (["APPROVED"] as const)
          : filter === "REJECTED"
            ? (["REJECTED"] as const)
            : undefined;

  return prisma.landlordVerification.findMany({
    where: statusFilter ? { status: { in: [...statusFilter] } } : undefined,
    include: {
      organization: { select: { id: true, name: true, holderType: true, status: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      _count: { select: { documents: true } },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
  });
}

import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";

/**
 * Grants or revokes the platform ADMIN role (audit B-26: there was no way to
 * create the first administrator on a production database — the seed
 * refuses non-local databases and creates demo accounts).
 *
 * Only ever run by an operator, from scripts/promote-admin.ts, against the
 * database of the environment they mean. The person must already have an
 * account (signed up normally, e-mail confirmed): this never creates one,
 * and never derives anything from signup metadata.
 */
export async function setPlatformAdmin(params: { email: string; admin: boolean; operator: string }) {
  const email = params.email.trim().toLowerCase();
  const profile = await prisma.profile.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
    select: { id: true, email: true, platformRole: true },
  });
  if (!profile) {
    throw new Error(`No active account with the e-mail ${email}. Sign up normally first, then promote.`);
  }

  const target = params.admin ? "ADMIN" : "USER";
  if (profile.platformRole === target) {
    return { profileId: profile.id, changed: false, platformRole: target };
  }

  await prisma.profile.update({ where: { id: profile.id }, data: { platformRole: target } });
  await recordAudit({
    event: params.admin ? "admin.promoted" : "admin.demoted",
    actorUserId: null,
    metadata: { profileId: profile.id, operator: params.operator, via: "scripts/promote-admin.ts" },
  });
  return { profileId: profile.id, changed: true, platformRole: target };
}

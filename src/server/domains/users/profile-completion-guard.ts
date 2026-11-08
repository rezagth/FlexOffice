import { prisma } from "@/server/db/prisma";
import { ForbiddenError, ProfileIncompleteError } from "@/server/lib/errors";
import { isCompanyInfoComplete, missingProfileItems } from "./profile-completion";

/**
 * PRD V1.1, R62 — "réservation et publication bloquées tant que [le profil]
 * n'est pas [complété]." `action` only changes the message: the rule itself
 * (phone + declared need + holder type all answered) is the same wherever
 * it's checked, so a future gate gains it by calling this, not by
 * reimplementing it.
 */
export async function assertProfileIsComplete(
  userId: string,
  action: "réserver un espace" | "publier un espace"
): Promise<void> {
  const missing = await getMissingProfileItems(userId);
  if (missing.length > 0) {
    throw new ProfileIncompleteError(
      `Pour ${action}, il vous reste à : ${missing.join(" ; ")}.`
    );
  }
}

/** What the account still has to do before it can book or publish (empty =
 * complete). Used by pages to explain a disabled action up front, and by
 * `assertProfileIsComplete` for the server-side refusal. */
export async function getMissingProfileItems(userId: string): Promise<string[]> {
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    select: { phone: true, phoneVerifiedAt: true, accountNeed: true, holderType: true },
  });
  return missingProfileItems(profile);
}

/**
 * PRD V1.1, R22/R24 — scoped to booking only (not publishing): a company
 * missing its legal identity cannot book. See profile-completion.ts for why
 * this is checked directly on the organization rather than assumed.
 */
export async function assertCompanyInfoIsComplete(userId: string): Promise<void> {
  if (!(await isCompanyInfoComplete(userId))) {
    throw new ForbiddenError(
      "Complétez les informations de votre société (raison sociale, SIRET) avant de réserver un espace."
    );
  }
}

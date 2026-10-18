import { prisma } from "@/server/db/prisma";
import { logEvent } from "@/server/lib/logger";

/** PUBLISHED -> EXPIRED once endsAt passes. No notification: expiry is the
 * promotion's own clock running out, not a moderation decision — R48-R52's
 * "notify on every decision" is about admin approve/reject, not this. */
export async function expirePublishedPromotions() {
  const result = await prisma.promotion.updateMany({
    where: { status: "PUBLISHED", endsAt: { not: null, lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  if (result.count > 0) {
    logEvent({ event: "promotion.expired_sweep", count: result.count });
  }
  return { expired: result.count };
}

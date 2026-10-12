import { prisma } from "@/server/db/prisma";
import { nextBoundary } from "./schedule";

/** What a landlord sees on the payouts page: what is owed to them, when the
 * next payout goes out, and the payouts already made, line by line. */
export async function getLandlordPayoutOverview(organizationId: string, now: Date = new Date()) {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { payoutFrequency: true, stripeAccountId: true },
  });

  const [openLines, payouts] = await Promise.all([
    prisma.payoutLine.findMany({
      where: { organizationId, payoutId: null },
      include: { booking: { select: { startsAt: true, endsAt: true, space: { select: { name: true } } } } },
      orderBy: { eligibleAt: "asc" },
    }),
    prisma.payout.findMany({
      where: { organizationId },
      include: {
        lines: {
          include: { booking: { select: { startsAt: true, endsAt: true, space: { select: { name: true } } } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { scheduledFor: "desc" },
      take: 24,
    }),
  ]);

  const sum = (lines: { amountCents: number }[]) => lines.reduce((total, line) => total + line.amountCents, 0);
  const payableLines = openLines.filter((line) => line.eligibleAt <= now);
  return {
    frequency: organization.payoutFrequency,
    nextPayoutAt: nextBoundary(organization.payoutFrequency, now),
    /** Earned and past the dispute window: goes out at the next payout. */
    payableCents: sum(payableLines),
    /** Earned on stays that are not over yet (or still inside the dispute window). */
    upcomingCents: sum(openLines.filter((line) => line.eligibleAt > now)),
    openLines,
    payouts,
  };
}

/** The admin view: what each landlord is owed right now and the latest payouts. */
export async function getAdminPayoutOverview() {
  const [owed, payouts] = await Promise.all([
    prisma.payoutLine.groupBy({
      by: ["organizationId"],
      where: { payoutId: null },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.payout.findMany({
      include: { organization: { select: { name: true, stripeAccountId: true } } },
      orderBy: { scheduledFor: "desc" },
      take: 100,
    }),
  ]);
  const organizations = await prisma.organization.findMany({
    where: { id: { in: owed.map((row) => row.organizationId) } },
    select: { id: true, name: true, payoutFrequency: true, stripeAccountId: true },
  });
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));
  return {
    owed: owed.map((row) => ({
      organization: byId.get(row.organizationId),
      amountCents: row._sum.amountCents ?? 0,
      lineCount: row._count,
    })),
    payouts,
  };
}

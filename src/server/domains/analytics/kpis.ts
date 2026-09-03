import { prisma } from "@/server/db/prisma";
import { summarizeMonth } from "@/server/domains/bookings/availability";

/**
 * KPI instrumentation for the admin dashboard — the six indicators from the
 * cahier des charges (§13). Simple queries against the transactional
 * tables, not a separate analytics pipeline: at this dataset's scale that
 * is the right call (saas-engineering:product-analytics §33) — revisit if
 * the admin dashboard itself becomes a slow query, not before.
 *
 * "Satisfaction client" is deliberately absent: nothing in this codebase
 * collects a client rating today. Showing a number here would mean
 * fabricating one — the dashboard says so explicitly instead (see
 * admin/dashboard/page.tsx), the same "never fake success" rule the rest
 * of this repo follows for unimplemented features.
 */

function startOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function getActiveSpacesCount(): Promise<number> {
  return prisma.space.count({ where: { status: "PUBLISHED" } });
}

export async function getMonthlyBookingsCount(): Promise<number> {
  return prisma.booking.count({ where: { createdAt: { gte: startOfMonth() } } });
}

/**
 * Bookings created this month ÷ searches performed this month.
 *
 * An approximation, not a true per-visitor funnel: `SearchEvent` is
 * anonymous (no session id — see its own schema comment), so a search and
 * a booking cannot be tied to the same visitor. This is the ratio the
 * cahier des charges actually asks for ("conversion recherche →
 * réservation"), read as a platform-wide rate over the period rather than
 * a per-session conversion. Returns `null` when there is no search data
 * yet, rather than a misleading 0 %.
 */
export async function getSearchToBookingConversionRate(): Promise<number | null> {
  const since = startOfMonth();
  const [searches, bookings] = await Promise.all([
    prisma.searchEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.booking.count({ where: { createdAt: { gte: since } } }),
  ]);
  if (searches === 0) return null;
  return bookings / searches;
}

/**
 * Average, across every PUBLISHED space, of (booked or partially booked
 * days ÷ open days) for the current calendar month — reusing
 * `summarizeMonth()` rather than a second slot-enumeration engine. A day
 * the space is CLOSED that weekday is excluded from both sides: it was
 * never bookable, so it should not count against occupancy.
 *
 * O(spaces × days-in-month) calls into `summarizeMonth()`, itself
 * O(days-in-month) queries per space — the same N+1 already accepted there
 * for MVP scale (a handful of spaces, an admin-only page). Revisit
 * together if either becomes a real dashboard, not separately.
 */
export async function getAverageOccupancyRate(): Promise<number | null> {
  const spaces = await prisma.space.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true },
  });
  if (spaces.length === 0) return null;

  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const rates: number[] = [];
  for (const space of spaces) {
    const days = await summarizeMonth(space.id, yearMonth);
    const statuses = Object.values(days);
    const openDays = statuses.filter((s) => s !== "CLOSED");
    if (openDays.length === 0) continue;
    const occupiedDays = openDays.filter((s) => s === "BOOKED" || s === "PARTIAL");
    rates.push(occupiedDays.length / openDays.length);
  }

  if (rates.length === 0) return null;
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

/**
 * Average hours between a booking request being created and the
 * organization accepting or rejecting it. `updatedAt` is a reliable proxy
 * for "the moment it was answered" because exactly one write ever moves a
 * booking off PENDING (`applyPaymentOutcome()`'s `finalize()`) — confirmed
 * by reading that code path, not assumed. A dedicated `respondedAt` column
 * would be more explicit; this reuses what already exists rather than
 * adding one for a single read.
 */
export async function getAverageResponseTimeHours(): Promise<number | null> {
  const answered = await prisma.booking.findMany({
    where: { status: { in: ["CONFIRMED", "REJECTED"] } },
    select: { createdAt: true, updatedAt: true },
  });
  if (answered.length === 0) return null;

  const totalHours = answered.reduce((sum, b) => {
    const hours = (b.updatedAt.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60);
    return sum + Math.max(hours, 0);
  }, 0);

  return totalHours / answered.length;
}

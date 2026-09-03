import { prisma } from "@/server/db/prisma";
import { logError } from "@/server/lib/logger";

/**
 * Records that a search was performed — the one event this KPI
 * instrumentation needs (saas-engineering:product-analytics: "track less,
 * but track better"). Anonymous by design: `/search` needs no account, so
 * there is no user identity to attach this to without inventing a session
 * purely to track it.
 *
 * Never throws: an analytics write must not break the page it is measuring
 * (product-analytics §23, same reasoning as geocodeAddress()). Awaited
 * rather than fire-and-forget so the event is not lost to a serverless
 * function returning before an unawaited promise settles — the insert
 * itself is a single indexed row, not a meaningful latency cost.
 */
export async function recordSearchEvent(params: {
  city?: string;
  hasGeo: boolean;
  resultsCount: number;
}) {
  try {
    await prisma.searchEvent.create({
      data: {
        city: params.city ?? null,
        hasGeo: params.hasGeo,
        resultsCount: params.resultsCount,
      },
    });
  } catch (error) {
    logError({ event: "search_event.record_failed", error });
  }
}

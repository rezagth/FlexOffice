import { permanentRedirect } from "next/navigation";

/**
 * Phase 2 compatibility redirect.
 *
 * `/client` and `/partner` were two spaces because `Profile.role` made a
 * renter and a lister two kinds of account. They are one account with two
 * modes now, served by `/app`, so this URL has one job left: not breaking
 * for anyone who bookmarked it.
 *
 * No guard here on purpose — the destination guards itself, and an
 * unauthenticated visitor should reach the login redirect from `/app`
 * rather than from a path that no longer means anything.
 *
 * 308 rather than 307: the move is permanent, and letting caches and search
 * engines learn it is the point. Removed once the old paths have been out of
 * circulation long enough — see the Phase 2 report.
 */
export default function LegacyRedirectPage() {
  permanentRedirect("/app/favorites");
}

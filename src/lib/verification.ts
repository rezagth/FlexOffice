/**
 * Whether a partner organization's KYC verification has actually completed
 * — the single source of truth for showing the public "Entreprise
 * vérifiée" badge (SpaceCard, space detail page). Deliberately narrow:
 * anything other than the exact VERIFIED status (including PENDING_
 * VERIFICATION, SUSPENDED, missing, or an unrecognized value) hides the
 * badge rather than showing a misleading or alarming variant.
 */
export function isOrganizationVerified(status: string | null | undefined): boolean {
  return status === "VERIFIED";
}

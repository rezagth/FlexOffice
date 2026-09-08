import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Trust signal for a partner organization whose KYC verification
 * (Organization.status) has actually completed — see admin/verifications.
 * Shown only when VERIFIED: no "en attente" variant, since telling a
 * visitor a listing's host isn't verified yet would create doubt the
 * product doesn't otherwise raise (see officeflex-context §7.1's
 * "Confiance" section — this is the same signal, per-listing).
 */
export function VerifiedBadge() {
  return (
    <Badge variant="accent">
      <BadgeCheck aria-hidden="true" />
      Entreprise vérifiée
    </Badge>
  );
}

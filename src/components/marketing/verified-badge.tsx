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
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
        <path
          d="M10 1.5 12.4 4l3.35-.4.4 3.35L18.5 9l-2.35 2.4.4 3.35-3.35-.4L10 17l-2.4-2.65-3.35.4.4-3.35L2.5 9l2.35-2.65-.4-3.35 3.35.4L10 1.5Z"
          fill="currentColor"
          fillOpacity={0.15}
        />
        <path
          d="m7 10 2 2 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Entreprise vérifiée
    </span>
  );
}

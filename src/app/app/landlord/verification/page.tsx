import { redirect } from "next/navigation";
import { requirePageAuth } from "@/server/auth/page-guards";
import { getOwnVerification } from "@/server/domains/verification/get";
import {
  requiredDocumentTypes,
  VERIFICATION_DOCUMENT_TYPE_LABELS,
} from "@/server/domains/verification/requirements";
import { Card } from "@/components/ui/card";
import { VerificationDossier } from "@/components/dashboard/verification-dossier";
import { StripeConnectButton } from "@/components/dashboard/stripe-connect-button";
import { getAccountStatus } from "@/server/domains/payments/stripe-connect";
import {
  HOLDER_TYPE_LABELS,
  LANDLORD_ACTIVITY_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
  formatDateTime,
} from "@/lib/format";

export const metadata = { title: "Vérification — OfficeFlex" };
export const dynamic = "force-dynamic";

const EDITABLE_STATUSES = new Set(["DRAFT", "REJECTED"]);

/**
 * The onboarding dossier: document upload while editable, a plain status
 * screen otherwise. One page for every state rather than one per status —
 * the states are a lifecycle, not different destinations.
 *
 * `requiredDocumentTypes()` runs here, server-side, from the SAME function
 * `submitVerification()` uses to decide completeness — the client component
 * only renders whatever list this page hands it, so the two can never
 * disagree about what the dossier needs.
 */
export default async function VerificationPage() {
  const ctx = await requirePageAuth({ redirectTo: "/app/landlord/verification" });

  if (!ctx.isLandlord) {
    redirect("/app/become-landlord");
  }

  const verification = await getOwnVerification(ctx.userId);
  if (!verification) {
    // Should not happen — becomeLandlord() always creates a dossier — but a
    // pre-Phase-3 account the migration's backfill somehow missed has
    // nowhere else useful to land.
    redirect("/app/become-landlord");
  }

  const required = requiredDocumentTypes(
    verification.organization.holderType,
    verification.activityType,
    verification.isRealEstateProfessional
  );
  const requiredLabels = Object.fromEntries(
    required.map((type) => [type, VERIFICATION_DOCUMENT_TYPE_LABELS[type]])
  ) as Record<string, string>;

  // Only shown once the platform actually runs on real Stripe — a "Connecter
  // Stripe" button while PAYMENT_PROVIDER=mock would promise something no
  // booking on the platform currently honours (the provider is chosen
  // globally, not per organization).
  const showStripeConnect =
    process.env.PAYMENT_PROVIDER === "stripe" &&
    ctx.capabilities.has("landlord:manage_organization") &&
    ctx.activeOrgId;
  const connectStatus = showStripeConnect ? await getAccountStatus(ctx.activeOrgId!) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Vérification de votre dossier
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {verification.organization.name} ·{" "}
          {HOLDER_TYPE_LABELS[verification.organization.holderType]} ·{" "}
          {LANDLORD_ACTIVITY_TYPE_LABELS[verification.activityType]}
          {verification.isRealEstateProfessional && " · Professionnel de l'immobilier"}
        </p>
      </div>

      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
          <p className="text-sm font-medium text-foreground">
            {VERIFICATION_STATUS_LABELS[verification.status] ?? verification.status}
          </p>
        </div>
        {verification.submittedAt && (
          <p className="text-xs text-muted-foreground">
            Soumis le {formatDateTime(verification.submittedAt)}
          </p>
        )}
      </Card>

      {EDITABLE_STATUSES.has(verification.status) && (
        <VerificationDossier
          verificationId={verification.id}
          requiredTypes={[...required]}
          requiredTypeLabels={requiredLabels}
          initialDocuments={verification.documents.map((d) => ({
            id: d.id,
            type: d.type,
            originalFilename: d.originalFilename,
            sizeBytes: d.sizeBytes,
            uploadedAt: d.uploadedAt.toISOString(),
          }))}
          rejectionReason={verification.rejectionReason}
        />
      )}

      {(verification.status === "PENDING_REVIEW" || verification.status === "IN_REVIEW") && (
        <Card className="p-5">
          <p className="text-sm font-medium text-foreground">
            Votre dossier est en cours de vérification.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vous pouvez continuer à utiliser OfficeFlex en tant que locataire
            pendant ce temps. La publication de vos espaces sera possible une
            fois votre dossier vérifié.
          </p>
        </Card>
      )}

      {verification.status === "APPROVED" && (
        <Card className="border-primary/40 p-5">
          <p className="text-sm font-medium text-primary">
            Votre compte bailleur est vérifié.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vous pouvez désormais publier vos espaces. Le mode bailleur reste
            disponible à tout moment depuis le menu.
          </p>
        </Card>
      )}

      {verification.status === "EXPIRED" && (
        <Card className="p-5">
          <p className="text-sm font-medium text-foreground">Ce dossier a expiré.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Contactez le support pour ouvrir un nouveau dossier de vérification.
          </p>
        </Card>
      )}

      {connectStatus && (
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="text-lg font-medium">Paiement</h2>
          {connectStatus.connected && connectStatus.chargesEnabled && connectStatus.payoutsEnabled ? (
            <p className="text-sm text-primary">
              Compte Stripe connecté — vous recevez vos reversements normalement.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {connectStatus.connected
                  ? "Compte Stripe créé, mais l'inscription n'est pas terminée : vos réservations ne peuvent pas encore être reversées."
                  : "Connectez un compte Stripe pour recevoir le reversement de vos réservations."}
              </p>
              <StripeConnectButton
                label={connectStatus.connected ? "Terminer l'inscription Stripe" : "Connecter Stripe"}
              />
            </>
          )}
        </Card>
      )}
    </div>
  );
}

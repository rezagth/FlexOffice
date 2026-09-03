import { notFound } from "next/navigation";
import { requirePageAdmin } from "@/server/auth/page-guards";
import { getVerificationForAdmin } from "@/server/domains/verification/get";
import { VERIFICATION_DOCUMENT_TYPE_LABELS } from "@/server/domains/verification/requirements";
import { Card } from "@/components/ui/card";
import { VerificationDocumentViewer } from "@/components/dashboard/verification-document-viewer";
import { VerificationReviewActions } from "@/components/dashboard/verification-review-actions";
import {
  HOLDER_TYPE_LABELS,
  LANDLORD_ACTIVITY_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
  formatDateTime,
} from "@/lib/format";

export const metadata = { title: "Dossier de vérification — Admin OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * Dossier detail for an admin reviewer: organization, requester, every
 * submitted document (viewed via a signed URL, never a stored one — see
 * VerificationDocumentViewer), and the review actions. Read-only on the
 * documents themselves — reviewing is a decision, not an edit.
 */
export default async function AdminVerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAdmin();
  const { id } = await params;

  const verification = await getVerificationForAdmin(id);
  if (!verification) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{verification.organization.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {HOLDER_TYPE_LABELS[verification.organization.holderType]} ·{" "}
          {LANDLORD_ACTIVITY_TYPE_LABELS[verification.activityType]}
          {verification.isRealEstateProfessional && " · Professionnel de l'immobilier"}
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Demandeur</p>
            <p className="text-foreground">{verification.requestedBy.name}</p>
            <p className="text-xs text-muted-foreground">{verification.requestedBy.email}</p>
          </div>
          {verification.reviewedBy && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Examiné par
              </p>
              <p className="text-foreground">{verification.reviewedBy.name}</p>
              {verification.reviewedAt && (
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(verification.reviewedAt)}
                </p>
              )}
            </div>
          )}
        </div>

        {verification.rejectionReason && (
          <div className="rounded-lg border border-danger/40 bg-danger/5 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-danger">
              Motif du refus
            </p>
            <p className="mt-1 text-sm text-foreground">{verification.rejectionReason}</p>
          </div>
        )}

        <VerificationReviewActions verificationId={verification.id} status={verification.status} />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          Documents{verification.documents.length > 0 ? ` (${verification.documents.length})` : ""}
        </h2>
        {verification.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun document envoyé.</p>
        ) : (
          verification.documents.map((document) => (
            <Card
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {VERIFICATION_DOCUMENT_TYPE_LABELS[document.type] ?? document.type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {document.originalFilename} · {formatDateTime(document.uploadedAt)}
                </p>
              </div>
              <VerificationDocumentViewer
                verificationId={verification.id}
                documentId={document.id}
              />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

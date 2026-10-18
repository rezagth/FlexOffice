import { requirePageAdmin } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { DomiciliationOfferToggle } from "@/components/dashboard/domiciliation-offer-toggle";
import { DomiciliationReviewActions } from "@/components/dashboard/domiciliation-review-actions";
import { DomiciliationAttestationViewer } from "@/components/dashboard/domiciliation-attestation-viewer";
import { formatDateTime } from "@/lib/format";
import {
  isDomiciliationOfferEnabled,
  listDomiciliationRequestsForAdmin,
} from "@/server/domains/organizations/domiciliation";

export const metadata = { title: "Domiciliations — Admin MakomSpace" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  MAKOMSPACE: "Chez MakomSpace",
  THIRD_PARTY: "Déjà domicilié ailleurs",
};

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Demande envoyée",
  IN_PROGRESS: "En cours de traitement",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
};

/**
 * PRD V1.1, 2B, R53-R58, S11 — one screen: the offer switch (with its
 * regulatory warning) and every domiciliation request, newest first, each
 * with an inline status change. No separate detail page — the data per
 * request is small enough that a list row says everything there is to
 * review.
 */
export default async function AdminDomiciliationsPage() {
  await requirePageAdmin();
  const [offerEnabled, requests] = await Promise.all([
    isDomiciliationOfferEnabled(),
    listDomiciliationRequestsForAdmin(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Domiciliations</h1>

      <Card className="max-w-2xl p-5">
        <DomiciliationOfferToggle initialEnabled={offerEnabled} />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Demandes ({requests.length})</h2>
        {requests.length === 0 ? (
          <EmptyState
            title="Aucune demande"
            description="Les demandes de domiciliation des sociétés apparaîtront ici."
          />
        ) : (
          requests.map((request) => (
            <Card key={request.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{request.organization.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {KIND_LABELS[request.kind]} · {formatDateTime(request.createdAt)}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABELS[request.status]}
                </p>
              </div>

              {request.kind === "THIRD_PARTY" && (
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Domiciliataire</dt>
                    <dd className="truncate font-medium">{request.domiciliataireName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Adresse</dt>
                    <dd className="truncate font-medium">
                      {request.address}, {request.postalCode} {request.city}
                    </dd>
                  </div>
                </dl>
              )}

              {request.attestationStoragePath && <DomiciliationAttestationViewer requestId={request.id} />}

              <DomiciliationReviewActions
                requestId={request.id}
                initialStatus={request.status}
                initialNotes={request.adminNotes ?? ""}
              />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

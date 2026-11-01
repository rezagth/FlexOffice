import { prisma } from "@/server/db/prisma";
import type { AuthContext } from "@/server/auth/rbac";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { ButtonLink } from "@/components/ui/button";
import { BOOKING_STATUS_LABELS, formatCents, formatDateTime } from "@/lib/format";
import { sumKeptAmounts } from "@/server/domains/payments/settled-amounts";
import { getLandlordOnboarding } from "@/server/domains/organizations/onboarding";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { BookingRequestActions } from "@/components/dashboard/booking-request-actions";
import Link from "next/link";

/**
 * Landlord home, rendered by `/app` when the active mode is LANDLORD.
 *
 * Extracted from the old `/partner/dashboard` page. Every query is scoped by
 * `activeOrgId`, which `getAuthContext()` resolved from an ACTIVE membership
 * on this request — not from the stored column on its own.
 *
 * Figures are shown according to capability rather than mode: an ACCOUNTANT
 * and a MANAGER are both in landlord mode and must not see the same tiles.
 */
export async function LandlordHome({
  ctx,
}: {
  ctx: AuthContext & { activeOrgId: string };
}) {
  const canSeeRevenue = ctx.capabilities.has("landlord:view_revenue");
  const canManageSpaces = ctx.capabilities.has("landlord:manage_spaces");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  // The checklist sends to pages that need these capabilities; a member who
  // cannot act on them (an accountant) does not get a list of dead ends.
  const showOnboarding =
    canManageSpaces && ctx.capabilities.has("landlord:manage_verification");

  const canManageBookings = ctx.capabilities.has("landlord:manage_bookings");

  const [monthRevenue, yearRevenue, bookingsCount, spacesCount, onboarding, pendingRequests, upcomingBookings, rejectedSpaces] = await Promise.all([
    canSeeRevenue
      ? sumKeptAmounts({ organizationId: ctx.activeOrgId, createdAt: { gte: startOfMonth } })
      : Promise.resolve(null),
    canSeeRevenue
      ? sumKeptAmounts({ organizationId: ctx.activeOrgId, createdAt: { gte: startOfYear } })
      : Promise.resolve(null),
    prisma.booking.count({
      where: { organizationId: ctx.activeOrgId, createdAt: { gte: startOfMonth } },
    }),
    prisma.space.count({ where: { organizationId: ctx.activeOrgId } }),
    showOnboarding ? getLandlordOnboarding(ctx.activeOrgId, ctx.userId) : Promise.resolve(null),
    // What needs the landlord's attention is on the home itself: a request
    // waiting for an answer must not be hidden behind another menu.
    canManageBookings
      ? prisma.booking.findMany({
          where: { organizationId: ctx.activeOrgId, status: "PENDING" },
          include: { space: { select: { name: true } }, clientUser: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
          take: 10,
        })
      : Promise.resolve([]),
    canManageBookings
      ? prisma.booking.findMany({
          where: { organizationId: ctx.activeOrgId, status: "CONFIRMED", startsAt: { gte: new Date() } },
          include: { space: { select: { name: true } }, clientUser: { select: { name: true } } },
          orderBy: { startsAt: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
    canManageSpaces
      ? prisma.space.findMany({
          where: { organizationId: ctx.activeOrgId, status: "REJECTED" },
          select: { id: true, name: true, propertyId: true },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  // Can this account already publish? Profile complete AND organization
  // verified — the two steps that gate "Soumettre pour validation". Then the
  // checklist is folded by default (one click brings it back); otherwise it
  // stays open because it is what tells the landlord what is blocking them.
  const canPublishAlready =
    onboarding !== null &&
    onboarding.steps.find((s) => s.id === "profile")?.state === "done" &&
    onboarding.steps.find((s) => s.id === "verification")?.state === "done";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Bonjour {ctx.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;activité de votre organisation ce mois-ci.
        </p>
      </div>

      {(pendingRequests.length > 0 || rejectedSpaces.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-foreground">À traiter</h2>
          {pendingRequests.map((booking) => (
            <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3 border-accent/40 p-4">
              <div>
                <Link href={`/app/landlord/bookings/${booking.id}`} className="font-medium underline-offset-2 hover:underline">
                  Demande de {booking.clientUser.name} — {booking.space.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(booking.startsAt)} → {formatDateTime(booking.endsAt)} · {booking.participantsCount} pers. ·{" "}
                  {formatCents(booking.priceAmountCents)}
                </p>
                {booking.purpose && <p className="mt-1 text-sm text-muted-foreground">{booking.purpose}</p>}
              </div>
              <BookingRequestActions bookingId={booking.id} />
            </Card>
          ))}
          {rejectedSpaces.map((space) => (
            <Card key={space.id} className="flex flex-wrap items-center justify-between gap-3 border-danger/40 p-4">
              <div>
                <p className="font-medium">Espace refusé : {space.name}</p>
                <p className="text-sm text-muted-foreground">Corrigez-le puis soumettez-le de nouveau.</p>
              </div>
              <ButtonLink href={`/app/landlord/properties/${space.propertyId}/spaces/${space.id}`} variant="outline" size="sm">
                Ouvrir
              </ButtonLink>
            </Card>
          ))}
        </section>
      )}

      {upcomingBookings.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-foreground">Prochaines réservations</h2>
            <Link href="/app/landlord/requests" className="text-sm underline underline-offset-2">
              Toutes les réservations
            </Link>
          </div>
          {upcomingBookings.map((booking) => (
            <Link key={booking.id} href={`/app/landlord/bookings/${booking.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                <div>
                  <p className="font-medium">
                    {booking.clientUser.name} — {booking.space.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(booking.startsAt)} → {formatDateTime(booking.endsAt)} · {formatCents(booking.priceAmountCents)}
                  </p>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                </span>
              </Card>
            </Link>
          ))}
        </section>
      )}

      {onboarding && !onboarding.complete && (
        <CollapsibleSection
          title="Premiers pas"
          summary={`${onboarding.doneCount} étape${onboarding.doneCount > 1 ? "s" : ""} sur ${onboarding.steps.length} terminée${onboarding.doneCount > 1 ? "s" : ""}. Vous pouvez déjà publier.`}
          defaultOpen={!canPublishAlready}
        >
          <OnboardingChecklist onboarding={onboarding} />
        </CollapsibleSection>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {monthRevenue && (
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Revenus du mois
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatCents(monthRevenue.netCents)}
            </p>
          </Card>
        )}
        {yearRevenue && (
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Revenus de l&apos;année
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatCents(yearRevenue.netCents)}
            </p>
          </Card>
        )}
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Réservations ce mois-ci
          </p>
          <p className="mt-2 text-2xl font-semibold">{bookingsCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Espaces
          </p>
          <p className="mt-2 text-2xl font-semibold">{spacesCount}</p>
        </Card>
      </div>

      {spacesCount === 0 && canManageSpaces && !(onboarding && !onboarding.complete) && (
        <EmptyState
          title="Aucun espace pour l'instant"
          description="Créez votre premier espace pour commencer à recevoir des demandes de réservation."
          action={
            <ButtonLink href="/app/landlord/spaces/new" size="sm">
              Créer un espace
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}

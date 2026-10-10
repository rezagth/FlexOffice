import { prisma } from "@/server/db/prisma";
import { logError } from "@/server/lib/logger";
import { getAccountStatus } from "@/server/domains/payments/stripe-connect";

/**
 * The landlord's "premiers pas" checklist: what stands between a new
 * organization and its first booking, in the order it has to be done.
 *
 * Every step is derived from the data on each request — nothing is stored,
 * so the checklist can never claim a step is done when it is not (a space
 * unpublished by moderation shows the step open again).
 *
 * Scoped by the organizationId of the verified session.
 */

export type OnboardingStepId = "verification" | "payouts" | "property" | "space" | "photos" | "publish";

/** done: finished. todo: the landlord has something to do. waiting: on us
 * (moderation or Stripe review), nothing to do but wait. */
export type OnboardingStepState = "done" | "todo" | "waiting";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  state: OnboardingStepState;
  /** Where to go to do it; absent when there is nothing to click. */
  href?: string;
  cta?: string;
};

export type LandlordOnboarding = {
  steps: OnboardingStep[];
  doneCount: number;
  complete: boolean;
};

/** Below this, a listing looks empty next to the others. Advice, not a rule. */
export const RECOMMENDED_PHOTO_COUNT = 3;

export async function getLandlordOnboarding(
  organizationId: string,
  options: { stripeEnabled?: boolean } = {}
): Promise<LandlordOnboarding> {
  const stripeEnabled = options.stripeEnabled ?? process.env.PAYMENT_PROVIDER === "stripe";

  const [organization, verification, propertyCount, spaces] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { status: true } }),
    prisma.landlordVerification.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    prisma.property.count({
      where: {
        OR: [
          { owners: { some: { organizationId, endsAt: null } } },
          { operators: { some: { organizationId, endsAt: null } } },
        ],
      },
    }),
    prisma.space.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      select: { id: true, propertyId: true, status: true, _count: { select: { spacePhotos: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const steps: OnboardingStep[] = [];

  // 1. Verification of the organization — publishing requires VERIFIED.
  const verified = organization.status === "VERIFIED" || verification?.status === "APPROVED";
  const inReview = verification?.status === "PENDING_REVIEW" || verification?.status === "IN_REVIEW";
  steps.push({
    id: "verification",
    title: "Faire vérifier votre organisation",
    description: verified
      ? "Votre organisation est vérifiée."
      : inReview
        ? "Votre dossier est en cours d'examen par l'équipe MakomSpace : vous recevrez un e-mail dès qu'il est validé."
        : verification?.status === "REJECTED"
          ? "Votre dossier a été refusé : consultez le motif et corrigez les pièces demandées."
          : "Déposez les pièces justificatives : sans vérification, vos espaces ne peuvent pas être publiés.",
    state: verified ? "done" : inReview ? "waiting" : "todo",
    href: verified ? undefined : "/app/landlord/verification",
    cta: verified || inReview ? undefined : verification?.status === "REJECTED" ? "Corriger le dossier" : "Compléter le dossier",
  });

  // 2. Payouts — only when the platform takes real payments.
  if (stripeEnabled) {
    let state: OnboardingStepState = "todo";
    let description = "Renseignez vos coordonnées bancaires auprès de Stripe pour être payé de vos réservations.";
    try {
      const status = await getAccountStatus(organizationId);
      if (status.connected && status.chargesEnabled && status.payoutsEnabled) {
        state = "done";
        description = "Vos versements sont activés.";
      } else if (status.connected && status.detailsSubmitted) {
        state = "waiting";
        description = "Stripe vérifie vos informations : vous n'avez rien à faire pour l'instant.";
      }
    } catch (error) {
      // Stripe unreachable: the step stays open, the page still renders.
      logError({ event: "onboarding.stripe_status_failed", error, organization_id: organizationId });
    }
    steps.push({
      id: "payouts",
      title: "Activer vos versements",
      description,
      state,
      href: state === "done" ? undefined : "/app/landlord/verification",
      cta: state === "todo" ? "Configurer les versements" : undefined,
    });
  }

  // 3. A property (the building), 4. a space in it.
  steps.push({
    id: "property",
    title: "Ajouter votre bien",
    description:
      propertyCount > 0
        ? "Votre bien est enregistré."
        : "L'immeuble ou le local : adresse et type. Vous y rattacherez ensuite vos salles et bureaux.",
    state: propertyCount > 0 ? "done" : "todo",
    href: propertyCount > 0 ? undefined : "/app/landlord/properties/new",
    cta: propertyCount > 0 ? undefined : "Ajouter un bien",
  });

  steps.push({
    id: "space",
    title: "Créer votre premier espace",
    description:
      spaces.length > 0
        ? "Votre espace est créé."
        : "Salle de réunion, bureau ou salle de formation : capacité, équipements, tarifs et horaires.",
    state: spaces.length > 0 ? "done" : "todo",
    href: spaces.length > 0 ? undefined : propertyCount > 0 ? "/app/landlord/spaces/new" : undefined,
    cta: spaces.length > 0 || propertyCount === 0 ? undefined : "Créer un espace",
  });

  // 5. Photos — the first thing a client looks at.
  const wellIllustrated = spaces.some((s) => s._count.spacePhotos >= RECOMMENDED_PHOTO_COUNT);
  const needsPhotos = spaces.find((s) => s._count.spacePhotos < RECOMMENDED_PHOTO_COUNT);
  steps.push({
    id: "photos",
    title: `Ajouter au moins ${RECOMMENDED_PHOTO_COUNT} photos`,
    description: wellIllustrated
      ? "Vos photos sont en ligne."
      : "Lumineuses, prises à l'horizontale, montrant la salle entière puis les détails (écran, table, accueil).",
    state: wellIllustrated ? "done" : "todo",
    href: wellIllustrated || !needsPhotos ? undefined : `/app/landlord/spaces/${needsPhotos.id}/edit`,
    cta: wellIllustrated || !needsPhotos ? undefined : "Ajouter des photos",
  });

  // 6. Publication — submitted, then moderated.
  const published = spaces.some((s) => s.status === "PUBLISHED");
  const pending = spaces.some((s) => s.status === "PENDING_REVIEW");
  const toSubmit = spaces.find((s) => s.status === "DRAFT" || s.status === "REJECTED");
  steps.push({
    id: "publish",
    title: "Publier votre annonce",
    description: published
      ? "Votre annonce est en ligne et réservable."
      : pending
        ? "Votre annonce est en cours de relecture par l'équipe MakomSpace : vous recevrez un e-mail à la décision."
        : "Soumettez votre espace : il est relu par l'équipe MakomSpace avant sa mise en ligne.",
    state: published ? "done" : pending ? "waiting" : "todo",
    href:
      published || pending || !toSubmit
        ? undefined
        : `/app/landlord/properties/${toSubmit.propertyId}/spaces/${toSubmit.id}`,
    cta: published || pending || !toSubmit ? undefined : "Soumettre mon annonce",
  });

  const doneCount = steps.filter((s) => s.state === "done").length;
  return { steps, doneCount, complete: doneCount === steps.length };
}

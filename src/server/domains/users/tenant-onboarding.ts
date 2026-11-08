import { prisma } from "@/server/db/prisma";
import { isPhoneVerificationRequired } from "@/server/auth/runtime-config";
import { canOrganizationPublish } from "@/server/domains/organizations/publication-guard";
import type { OnboardingStep } from "@/server/domains/organizations/onboarding";

/**
 * The tenant's "premiers pas": everything that stands between a new account
 * and its first booking, in the order it has to be done, each with where to
 * go. Derived from the data on every request (nothing stored), and built
 * from the SAME facts the server enforces at booking time
 * (profile-completion.ts, company-verification-guard.ts), so the list can
 * never say "ready" for an account the booking would refuse — nor the
 * reverse.
 *
 * `waiting` = on us (an admin has to validate the company): nothing to click.
 */
export type TenantOnboarding = {
  steps: OnboardingStep[];
  doneCount: number;
  /** Every step done — the account may book. */
  readyToBook: boolean;
};

export async function getTenantOnboarding(userId: string): Promise<TenantOnboarding> {
  const [profile, membership] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true, phoneVerifiedAt: true, accountNeed: true, holderType: true },
    }),
    prisma.organizationMember.findFirst({
      where: { profileId: userId, status: "ACTIVE" },
      select: { organization: { select: { name: true, status: true, holderType: true, legalName: true, siret: true } } },
    }),
  ]);

  const steps: OnboardingStep[] = [];

  const answered = profile.accountNeed !== null && profile.holderType !== null;
  steps.push({
    id: "profile",
    title: "Dites-nous qui vous êtes",
    description: answered
      ? "C'est fait."
      : "Indiquez si vous cherchez ou publiez un espace, et si vous agissez en tant que particulier ou société.",
    state: answered ? "done" : "todo",
    href: answered ? undefined : "/app/complete-profile#profil",
    cta: answered ? undefined : "Répondre",
  });

  const phoneRequired = isPhoneVerificationRequired();
  const phoneFilled = Boolean(profile.phone?.trim());
  const phoneOk = phoneRequired ? profile.phoneVerifiedAt !== null : phoneFilled;
  steps.push({
    id: "phone" as OnboardingStep["id"],
    title: phoneRequired ? "Vérifier votre numéro de téléphone" : "Renseigner votre numéro de téléphone",
    description: phoneOk
      ? "C'est fait."
      : phoneRequired
        ? "Un code vous est envoyé par SMS. Il est obligatoire pour réserver ou publier."
        : "Il est obligatoire pour réserver ou publier.",
    state: phoneOk ? "done" : "todo",
    href: phoneOk ? undefined : "/app/complete-profile#telephone",
    cta: phoneOk ? undefined : phoneRequired ? "Vérifier mon numéro" : "Ajouter mon numéro",
  });

  const organization = membership?.organization;
  if (organization?.holderType === "COMPANY") {
    const infoOk = Boolean(organization.legalName?.trim()) && Boolean(organization.siret?.trim());
    steps.push({
      id: "company_info" as OnboardingStep["id"],
      title: "Renseigner votre société",
      description: infoOk ? "Raison sociale et SIRET enregistrés." : "La raison sociale et le SIRET sont obligatoires pour réserver.",
      state: infoOk ? "done" : "todo",
      href: infoOk ? undefined : "/app/account",
      cta: infoOk ? undefined : "Compléter ma société",
    });
  }

  if (organization) {
    const verified = canOrganizationPublish(organization.status);
    steps.push({
      id: "company_verified" as OnboardingStep["id"],
      title: "Faire valider votre société",
      description: verified
        ? `${organization.name} est vérifiée.`
        : `${organization.name} doit être validée par notre équipe avant votre première réservation. Rien à faire de votre côté pour l'instant.`,
      state: verified ? "done" : "waiting",
    });
  }

  const doneCount = steps.filter((s) => s.state === "done").length;
  return { steps, doneCount, readyToBook: doneCount === steps.length };
}

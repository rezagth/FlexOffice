import type { SignupNeed, SignupHolderType, SignupWizardInput } from "@/lib/validation/signup-wizard";
import { TERMS_VERSION } from "@/lib/legal-versions";
import { prisma } from "@/server/db/prisma";
import { accountKey } from "@/server/auth/rate-limit";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { logError, logEvent } from "@/server/lib/logger";
import { createOrganizationWithVerification } from "@/server/domains/organizations/create-organization-with-verification";

/**
 * PRD V1.1, R15-R21 — the paged signup wizard's submission, replacing the
 * single "je cherche / je publie" toggle for new signups
 * (users/register.ts, still used by anything not yet migrated to the
 * wizard).
 *
 * WHY THIS ALWAYS SENDS role: "CLIENT" TO SUPABASE, NEVER "PARTNER"
 * `handle_new_user` (migration 20260904100100) creates an Organization
 * directly from `raw_user_meta_data` for a PARTNER signup — necessary
 * defense-in-depth against a direct `/auth/v1/signup` call bypassing this
 * app entirely, but it has no notion of a tenant-only company dossier
 * (`activityType: null`, R71-R74) and modifying that trigger is exactly the
 * kind of security-reviewed code this lot does not touch. So the wizard
 * takes the other safe path instead: every wizard signup is a plain CLIENT
 * at the trigger level, and an organization — tenant-only or landlord,
 * individual or company — is created explicitly afterwards by THIS code,
 * through the same createOrganizationWithVerification() commit-1's
 * "devenir bailleur" flow uses. One circuit, used from two entry points,
 * same as R71-R74 asks.
 *
 * A direct `/auth/v1/signup` with `role: "PARTNER"` metadata still works
 * exactly as before (unaffected by this file) — this changes a UI path's
 * choice of request, not the trigger's own guarantees.
 *
 * ORPHANED ACCOUNT ON A DUPLICATE SIRET
 * If `createOrganizationWithVerification()` fails (most likely: someone
 * already registered this SIRET), the Supabase account already exists —
 * rolling it back would need the service-role admin client, which must
 * never be reached from a route handler serving end-user requests
 * (supabase-admin.ts's own warning). So the account is kept: the caller
 * gets ACCOUNT_CREATED_COMPANY_FAILED and can add the company afterwards
 * from "Mon compte" or "Devenir bailleur" — the same path an account that
 * started as a plain tenant already uses (R19).
 */
export type RegisterWizardOutcome =
  | { status: "CONFIRMATION_REQUIRED" }
  | { status: "SIGNED_IN" }
  | { status: "ACCOUNT_CREATED_COMPANY_FAILED"; reason: string };

type SignUpError = { code?: string; status?: number; message?: string };

function isExistingAccountError(error: SignUpError): boolean {
  if (error.code === "user_already_exists" || error.code === "email_exists") return true;
  return error.status === 422 && /already registered/i.test(error.message ?? "");
}

/** Also used by complete-profile.ts for an existing account answering the
 * same question later (R15/R62) — one rule, two entry points. */
export function needsOrganization(input: { need: SignupNeed; holderType: SignupHolderType }): boolean {
  return input.need === "PUBLISH" || input.holderType === "COMPANY";
}

export async function registerFromWizard(
  input: SignupWizardInput,
  options: { appBaseUrl: string }
): Promise<RegisterWizardOutcome> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      // Always CLIENT — see the doc comment above.
      data: { role: "CLIENT", name: input.name, ...(input.phone ? { phone: input.phone } : {}) },
      emailRedirectTo: `${options.appBaseUrl}/auth/confirm?next=/post-login`,
    },
  });

  if (error) {
    if (isExistingAccountError(error)) {
      // SEC-15: identical answer to a brand-new address.
      logEvent({ event: "auth.register_existing_address", account_scope: await accountKey(input.email) });
      return { status: "CONFIRMATION_REQUIRED" };
    }
    if (error.code === "weak_password") {
      throw new ValidationError("Ce mot de passe est trop faible. Choisissez-en un plus long ou moins courant.");
    }
    logEvent({ event: "auth.register_failed", reason: error.code ?? String(error.status ?? "unknown") });
    throw new ValidationError("L'inscription a échoué. Vérifiez vos informations et réessayez.");
  }

  const user = data.user;
  if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
    logEvent({ event: "auth.register_existing_address", account_scope: await accountKey(input.email) });
    return { status: "CONFIRMATION_REQUIRED" };
  }

  const accepted = await prisma.profile.updateMany({
    where: { id: user.id, termsAcceptedAt: null },
    data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
  });
  // R15: recorded unconditionally (unlike termsAcceptedAt above, this isn't
  // a once-only fact) — the wizard is the only place a brand-new account
  // answers this, so there's never a prior value to protect here.
  await prisma.profile.update({
    where: { id: user.id },
    data: { accountNeed: input.need, holderType: input.holderType },
  });
  await recordAudit({
    event: "user.registered",
    actorUserId: user.id,
    organizationId: null,
    metadata: { need: input.need, holderType: input.holderType, termsVersion: TERMS_VERSION, termsRecorded: accepted.count === 1 },
  });

  if (needsOrganization(input)) {
    try {
      const identity =
        input.holderType === "COMPANY"
          ? {
              holderType: "COMPANY" as const,
              legalName: input.legalName!,
              siret: input.siret!,
              siren: input.siren,
              vatNumber: input.vatNumber,
              legalRepresentativeName: input.legalRepresentativeName!,
              address: input.address!,
              city: input.city!,
              postalCode: input.postalCode!,
              contactEmail: input.email,
            }
          : {
              holderType: "INDIVIDUAL" as const,
              displayName: input.name,
              contactEmail: input.email,
              address: input.address!,
              city: input.city!,
              postalCode: input.postalCode!,
            };

      const organization = await createOrganizationWithVerification({
        actorUserId: user.id,
        actorEmail: user.email ?? input.email,
        actorName: input.name,
        identity,
        activityType: input.need === "PUBLISH" ? (input.activityType ?? null) : null,
        isRealEstateProfessional: input.isRealEstateProfessional,
        grantLandlordCapability: input.need === "PUBLISH",
      });

      await recordAudit({
        event: "organization.created",
        actorUserId: user.id,
        organizationId: organization.id,
        metadata: { name: organization.name, source: "signup_wizard" },
      });
    } catch (orgError) {
      if (orgError instanceof ConflictError) {
        logEvent({
          event: "auth.register_wizard_company_conflict",
          account_scope: await accountKey(input.email),
        });
        return { status: "ACCOUNT_CREATED_COMPANY_FAILED", reason: orgError.message };
      }
      logError({ event: "auth.register_wizard_company_failed", error: orgError, user_id: user.id });
      return {
        status: "ACCOUNT_CREATED_COMPANY_FAILED",
        reason: "Votre compte a été créé, mais vos informations d'entreprise n'ont pas pu être enregistrées.",
      };
    }
  }

  return data.session ? { status: "SIGNED_IN" } : { status: "CONFIRMATION_REQUIRED" };
}

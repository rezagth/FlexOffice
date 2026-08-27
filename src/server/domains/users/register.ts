import type { RegisterInput } from "@/lib/validation/auth";
import { prisma } from "@/server/db/prisma";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ValidationError } from "@/server/lib/errors";

/**
 * Creates a Supabase Auth user with role/organization metadata. The
 * `handle_new_user` Postgres trigger (prisma/migrations/..._auth_profiles_sync)
 * creates the matching `profiles` row (and, for a PARTNER, the owning
 * `organizations` row) atomically as part of the same auth.users insert —
 * this function does not create either row itself, only supplies the
 * metadata the trigger reads.
 */
export async function registerUser(input: RegisterInput) {
  const supabase = await createSupabaseServerClient();

  const metadata: Record<string, string> = {
    role: input.role,
    name: input.name,
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.role === "PARTNER"
      ? {
          organization_name: input.organizationName,
          organization_siret: input.organizationSiret,
          organization_address: input.organizationAddress,
          organization_city: input.organizationCity,
          organization_postal_code: input.organizationPostalCode,
          ...(input.organizationEmail
            ? { organization_email: input.organizationEmail }
            : {}),
        }
      : {}),
  };

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: metadata },
  });

  if (error) {
    // Supabase's own message can be enumerating ("user already registered");
    // map to a safe, generic one instead of passing it through verbatim.
    if (error.status === 422 || error.code === "user_already_exists") {
      throw new ConflictError("Un compte existe déjà avec cet email.");
    }
    throw new ValidationError(error.message);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new ValidationError("La création du compte a échoué.");
  }

  const profile = await prisma.profile.findUnique({ where: { id: userId } });

  await recordAudit({
    event: "user.registered",
    actorUserId: userId,
    organizationId: profile?.organizationId ?? null,
    metadata: { role: input.role },
  });
  if (input.role === "PARTNER" && profile?.organizationId) {
    await recordAudit({
      event: "organization.created",
      actorUserId: userId,
      organizationId: profile.organizationId,
      metadata: { name: input.organizationName },
    });
  }

  return { userId, emailConfirmationRequired: !data.session };
}

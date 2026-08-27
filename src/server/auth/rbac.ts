import { prisma } from "@/server/db/prisma";
import type { Role } from "@/generated/prisma/client";
import { ForbiddenError, UnauthorizedError } from "@/server/lib/errors";
import { createSupabaseServerClient } from "./supabase-server";

export type AuthContext = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string | null;
};

/**
 * Resolves the current authenticated user, or null. Always revalidates the
 * JWT against Supabase via `getUser()` (never trusts a decoded cookie
 * value) before trusting anything from it. Returns null on any failure —
 * callers decide whether that's an error (`requireAuth`) or just "signed
 * out" (public pages).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
  });
  // Defensive: the `handle_new_user` trigger always creates a profile
  // alongside the auth user, so this should never happen in practice.
  if (!profile) {
    return null;
  }

  return {
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    organizationId: profile.organizationId,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new UnauthorizedError();
  }
  return ctx;
}

/** Throws 403 if the caller isn't one of the given roles. Server-side only
 * — this is the actual authorization boundary, never the frontend. */
export async function requireRole(role: Role | Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(ctx.role)) {
    throw new ForbiddenError(`Requires role: ${allowed.join(" or ")}`);
  }
  return ctx;
}

/** Requires a PARTNER whose profile is linked to an organization — the
 * `organizationId` used to scope every tenant-sensitive query. */
export async function requireOrg(): Promise<
  AuthContext & { organizationId: string }
> {
  const ctx = await requireRole("PARTNER");
  if (!ctx.organizationId) {
    throw new ForbiddenError("This account is not linked to an organization");
  }
  return ctx as AuthContext & { organizationId: string };
}

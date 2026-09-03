import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/rbac";
import { dashboardPathFor } from "@/server/auth/redirect-for-role";

/**
 * Landing spot right after sign-in when the caller did not already know where
 * to go (signed in from the homepage rather than via a redirected page).
 *
 * Phase 2 made this almost trivial, which is the point: there used to be
 * three destinations chosen from `Profile.role`, so signing in decided what
 * kind of user you were. There is one account space now, and the only real
 * fork left is platform administration — a different job, not a different
 * mode.
 *
 * The active mode is deliberately NOT part of the decision. It changes what
 * `/app` shows; sending a landlord to a different URL is what made the modes
 * look like account types in the first place.
 */
export default async function PostLoginPage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login");
  }
  redirect(dashboardPathFor(ctx));
}

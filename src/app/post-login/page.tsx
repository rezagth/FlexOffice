import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/rbac";
import { dashboardPathForRole } from "@/server/auth/redirect-for-role";

// Landing spot right after sign-in when the caller didn't already know
// which dashboard to send the user to (e.g. logged in from the homepage
// rather than via a redirected protected page).
export default async function PostLoginPage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login");
  }
  redirect(dashboardPathForRole(ctx.role));
}

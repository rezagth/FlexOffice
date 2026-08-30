import { requireAuth } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { exportProfileData } from "@/server/domains/users/gdpr";

// GET /api/client/gdpr/export — GDPR right of access. Always the caller's
// own data (scoped by session id), served as a downloadable JSON file.
export const GET = withErrorHandling(async () => {
  const ctx = await requireAuth();
  const data = await exportProfileData(ctx.userId);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="officeflex-donnees-${ctx.userId}.json"`,
    },
  });
});

import { NextResponse } from "next/server";
import { adminUserSearchSchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { listUsers } from "@/server/domains/admin/users";
import { withErrorHandling } from "@/server/lib/http";
import { ADMIN_PAGE_SIZE, totalPageCount } from "@/lib/pagination";

// GET /api/admin/users?q=&page= — accounts, searchable by e-mail or name,
// 20 per page. Auth: platform administration.
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const { q, page } = adminUserSearchSchema.parse({
    q: params.get("q") ?? undefined,
    page: params.get("page") ?? undefined,
  });
  const { users, totalCount } = await listUsers({ query: q, page: page ?? 1 });
  return NextResponse.json({
    users,
    page: page ?? 1,
    pageSize: ADMIN_PAGE_SIZE,
    totalCount,
    totalPages: totalPageCount(totalCount),
  });
});

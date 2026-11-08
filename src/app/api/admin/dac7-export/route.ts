import { z } from "zod";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { buildDac7Csv } from "@/server/domains/organizations/dac7-export";

const yearSchema = z.coerce.number().int().min(2024).max(2100);

// GET /api/admin/dac7-export?year=2026 — yearly DAC7 working file (CSV) for
// the accountant. Auth: platform administration. Defaults to the current year.
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  const raw = new URL(request.url).searchParams.get("year");
  const year = raw ? yearSchema.parse(raw) : new Date().getUTCFullYear();
  const csv = await buildDac7Csv(year);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dac7-${year}.csv"`,
      "cache-control": "no-store",
    },
  });
});

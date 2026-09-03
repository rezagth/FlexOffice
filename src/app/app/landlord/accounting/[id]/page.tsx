import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { InvoiceDocument } from "@/components/dashboard/invoice-document";

export const metadata = { title: "Facture — OfficeFlex" };
export const dynamic = "force-dynamic";

export default async function LandlordInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePageLandlordOrg("landlord:manage_accounting");
  const { id } = await params;

  const payment = await prisma.payment.findFirst({
    where: { id, organizationId: ctx.activeOrgId },
    include: {
      organization: true,
      booking: { include: { space: true, clientUser: true } },
    },
  });
  if (!payment) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/landlord/revenue" className="text-xs text-muted-foreground hover:underline">
        ← Comptabilité
      </Link>
      <InvoiceDocument payment={payment} />
    </div>
  );
}

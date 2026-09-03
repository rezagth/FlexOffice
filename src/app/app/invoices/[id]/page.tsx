import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { InvoiceDocument } from "@/components/dashboard/invoice-document";

export const metadata = { title: "Facture — OfficeFlex" };
export const dynamic = "force-dynamic";

export default async function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePageAuth();
  const { id } = await params;

  // Scoped by the booking's clientUserId, not by an id the caller merely
  // supplies — the same rule every other resource-by-id route follows.
  const payment = await prisma.payment.findFirst({
    where: { id, booking: { clientUserId: ctx.userId } },
    include: {
      organization: true,
      booking: { include: { space: true, clientUser: true } },
    },
  });
  if (!payment) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/invoices" className="text-xs text-muted-foreground hover:underline">
        ← Factures
      </Link>
      <InvoiceDocument payment={payment} />
    </div>
  );
}

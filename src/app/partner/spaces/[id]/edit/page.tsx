import { permanentRedirect } from "next/navigation";

/**
 * Phase 2 compatibility redirect — see the sibling pages under `/partner`.
 * Forwards the space id so a bookmarked edit URL lands on the same space.
 */
export default async function LegacyEditSpaceRedirectPage({
  params,
}: PageProps<"/partner/spaces/[id]/edit">) {
  const { id } = await params;
  permanentRedirect(`/app/landlord/spaces/${id}/edit`);
}

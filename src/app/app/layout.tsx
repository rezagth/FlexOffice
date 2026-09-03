import { listActiveMemberships } from "@/server/auth/active-context";
import { requirePageAuth } from "@/server/auth/page-guards";
import { AppShell } from "@/components/dashboard/app-shell";

/**
 * The unified account space.
 *
 * One layout for both modes, because it is one account. Replaces the
 * `/client` and `/partner` layouts, which each guarded a role and thereby
 * made the mode look like an identity.
 *
 * The guard here is only "is someone signed in". What each page requires
 * beyond that — a capability, a landlord organization — is asserted by the
 * page itself: a layout protects the pages Next.js currently renders beneath
 * it and nothing else, so relying on it alone means the protection moves when
 * a file does.
 *
 * The membership list is loaded once here for the organization picker. It is
 * the same query the context resolution uses, and it is the authority for
 * what the picker may offer — the browser never supplies that list.
 */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const ctx = await requirePageAuth();
  const organizations = ctx.isLandlord
    ? await listActiveMemberships(ctx.userId)
    : [];

  return (
    <AppShell ctx={ctx} organizations={organizations}>
      {children}
    </AppShell>
  );
}

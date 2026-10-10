import { isValidElement, type ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Card } from "@/components/ui/card";

/** Date the legal texts were last edited. Update it whenever any of them
 * changes: users must be able to tell which version they agreed to. */
export const LEGAL_LAST_UPDATED = "7 octobre 2026";

/**
 * Whether a legal text still contains a <ToFill> placeholder anywhere in its
 * tree. Walks the React elements as written in the page (Section, Sub and
 * plain tags all pass their content through `children`), so the review
 * notice below appears exactly as long as one company fact is missing —
 * nobody has to remember to remove it, and nobody can remove it early.
 */
export function containsToFill(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === "boolean") return false;
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return false;
  if (Array.isArray(node)) return node.some(containsToFill);
  if (isValidElement(node)) {
    if (node.type === ToFill) return true;
    return containsToFill((node.props as { children?: ReactNode }).children);
  }
  return false;
}

/**
 * Shell shared by every legal page, so they read as one coherent set and
 * carry the same review notice while facts are missing. The texts are
 * thorough drafts built on the applicable French and EU rules; the notice
 * stays until every company fact (legal form, registration, mediator…) is
 * filled in — after which the texts still need a lawyer's review before
 * the notice is dropped for good.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const hasPlaceholders = containsToFill(children);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenu" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour : {LEGAL_LAST_UPDATED}
          </p>
          <p className="text-sm text-foreground">{intro}</p>
        </div>

        {hasPlaceholders && (
          <Card role="note" className="border-danger p-4">
            <p className="text-sm font-medium text-danger">
              Version de travail — à faire valider par un conseil juridique
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ce document a été rédigé à partir des règles applicables (LCEN, Code de
              commerce, Code général des impôts, Code de la consommation, RGPD, règlement
              Platform-to-Business 2019/1150, règlement sur les services numériques). Il
              n&apos;a pas été relu par un avocat et les mentions signalées en surbrillance
              doivent être complétées avant toute mise en ligne publique.
            </p>
          </Card>
        )}

        <article className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A fact only the company can supply (legal form, capital, insurer…).
 * Rendered visibly so it cannot be published unnoticed. */
export function ToFill({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-[color-mix(in_srgb,#A5680A_18%,transparent)] px-1 py-0.5 text-foreground">
      [{children}]
    </mark>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

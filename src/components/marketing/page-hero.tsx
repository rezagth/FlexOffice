import type { ReactNode } from "react";

/** The dark band at the top of the marketing pages (same look as
 * /proposer-un-espace), so the help pages read as one set. */
export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="surface-dark bg-foreground">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-6 py-16 text-center sm:py-20">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-background sm:text-5xl">{title}</h1>
        {children}
      </div>
    </section>
  );
}

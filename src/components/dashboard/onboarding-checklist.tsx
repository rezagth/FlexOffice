import { Check, Clock } from "lucide-react";
import type { LandlordOnboarding } from "@/server/domains/organizations/onboarding";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Premiers pas" on the landlord home, until every step is done. The next
 * step to do is the only one with a primary button, so the page always says
 * what to do now.
 */
export function OnboardingChecklist({ onboarding }: { onboarding: LandlordOnboarding }) {
  const { steps, doneCount } = onboarding;
  const nextId = steps.find((s) => s.state === "todo" && s.href)?.id;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Premiers pas</h2>
          <p className="text-sm text-muted-foreground">
            Quelques étapes pour mettre votre premier espace en ligne et recevoir vos premières réservations.
          </p>
        </div>
        <p className="text-sm font-medium text-foreground">
          {doneCount} sur {steps.length}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Progression des premiers pas"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ol className="flex flex-col divide-y divide-border">
        {steps.map((step, index) => (
          <li key={step.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                step.state === "done" && "bg-primary text-primary-foreground",
                step.state === "waiting" && "bg-accent/20 text-foreground",
                step.state === "todo" && "border border-input text-muted-foreground"
              )}
            >
              {step.state === "done" ? (
                <Check className="size-4" />
              ) : step.state === "waiting" ? (
                <Clock className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "done" ? "text-muted-foreground line-through" : "text-foreground"
                )}
              >
                {step.title}
                <span className="sr-only">
                  {step.state === "done" ? " — terminé" : step.state === "waiting" ? " — en attente" : " — à faire"}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
            {step.href && step.cta && (
              <ButtonLink
                href={step.href}
                size="sm"
                variant={step.id === nextId ? "primary" : "outline"}
                className="shrink-0"
              >
                {step.cta}
              </ButtonLink>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

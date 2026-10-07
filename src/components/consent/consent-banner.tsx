"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ConsentChoice } from "./consent-store";
import type { AnalyticsConfig } from "./types";

type Decision = { audience: boolean; analytics: boolean };

/**
 * Consent banner, CNIL-compliant first layer:
 *   - "Tout accepter", "Tout refuser" and "Personnaliser" side by side, same
 *     size and same style — refusing is exactly as easy as accepting;
 *   - closing without choosing is not consent: there is no close button
 *     that would count as one, and nothing non-exempt runs meanwhile;
 *   - the details layer lists each purpose with its own switch.
 */
export function ConsentBanner({
  config,
  current,
  initialDetails,
  onDecide,
  onDismiss,
}: {
  config: AnalyticsConfig;
  current: ConsentChoice | null;
  initialDetails: boolean;
  onDecide: (decision: Decision) => void;
  /** Only offered when a choice already exists (reopened from the footer). */
  onDismiss?: () => void;
}) {
  const titleId = useId();
  const [details, setDetails] = useState(initialDetails);
  const [audience, setAudience] = useState(current ? current.audience : true);
  const [analytics, setAnalytics] = useState(current ? current.analytics : false);

  const all = { audience: true, analytics: true };
  const none = { audience: false, analytics: false };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-lg sm:rounded-2xl sm:border"
    >
      <h2 id={titleId} className="text-base font-semibold">
        Vos choix sur les traceurs
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        OfficeFlex utilise les cookies nécessaires au fonctionnement du site. Avec votre accord, nous
        mesurons aussi l&apos;utilisation du service pour l&apos;améliorer. Vous pouvez changer
        d&apos;avis à tout moment via « Gérer les cookies » en bas de page.{" "}
        <Link href="/cookies" className="underline">
          En savoir plus
        </Link>
      </p>

      {details && (
        <fieldset className="mt-4 flex flex-col gap-3">
          <legend className="sr-only">Finalités</legend>
          <div className="flex items-start gap-3 text-sm">
            <Checkbox id="consent-necessary" checked disabled aria-describedby="consent-necessary-desc" />
            <div>
              <label htmlFor="consent-necessary" className="font-medium">
                Nécessaires
              </label>
              <p id="consent-necessary-desc" className="text-muted-foreground">
                Session de connexion et sécurité. Toujours actifs.
              </p>
            </div>
          </div>
          {config.umami && (
            <div className="flex items-start gap-3 text-sm">
              <Checkbox
                id="consent-audience"
                checked={audience}
                onCheckedChange={(value) => setAudience(value === true)}
                aria-describedby="consent-audience-desc"
              />
              <div>
                <label htmlFor="consent-audience" className="font-medium">
                  Mesure d&apos;audience anonyme
                </label>
                <p id="consent-audience-desc" className="text-muted-foreground">
                  Statistiques de fréquentation agrégées, sans cookie, hébergées par OfficeFlex.
                </p>
              </div>
            </div>
          )}
          {config.posthog && (
            <div className="flex items-start gap-3 text-sm">
              <Checkbox
                id="consent-analytics"
                checked={analytics}
                onCheckedChange={(value) => setAnalytics(value === true)}
                aria-describedby="consent-analytics-desc"
              />
              <div>
                <label htmlFor="consent-analytics" className="font-medium">
                  Analyse d&apos;utilisation
                </label>
                <p id="consent-analytics-desc" className="text-muted-foreground">
                  Parcours sur le site pour améliorer le produit (PostHog, hébergé dans l&apos;Union
                  européenne). Dépose des cookies.
                </p>
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button variant="outline" size="sm" onClick={() => onDecide(all)}>
          Tout accepter
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDecide(none)}>
          Tout refuser
        </Button>
        {details ? (
          <Button variant="outline" size="sm" onClick={() => onDecide({ audience, analytics })}>
            Enregistrer mes choix
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setDetails(true)}>
            Personnaliser
          </Button>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="mt-3 text-xs text-muted-foreground underline">
          Fermer sans modifier
        </button>
      )}
    </div>
  );
}

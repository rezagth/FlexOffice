"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnalyticsLoader } from "./analytics-loader";
import { ConsentBanner } from "./consent-banner";
import { CONSENT_OPEN_EVENT, readConsent, saveConsent, subscribeConsent } from "./consent-store";
import type { AnalyticsConfig } from "./types";

const noopSubscribe = () => () => {};

export function ConsentManager({ config, nonce }: { config: AnalyticsConfig; nonce?: string }) {
  // The choice lives in localStorage, which the server cannot see: render
  // nothing until mounted, so a returning visitor never sees the banner flash.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const choice = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  if (!mounted) return null;

  // Only PostHog needs prior consent; with Umami alone (exempt) the banner
  // is not imposed on visitors, but the panel still opens from the footer.
  const mustAsk = config.posthog !== null && choice === null;
  const showBanner = mustAsk || reopened;

  return (
    <>
      <AnalyticsLoader config={config} choice={choice} nonce={nonce} />
      {showBanner && (
        <ConsentBanner
          config={config}
          current={choice}
          initialDetails={reopened}
          onDecide={(decision) => {
            saveConsent(decision);
            setReopened(false);
          }}
          onDismiss={choice ? () => setReopened(false) : undefined}
        />
      )}
    </>
  );
}

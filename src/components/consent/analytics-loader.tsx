"use client";

import Script from "next/script";
import { useEffect } from "react";
import type { ConsentChoice } from "./consent-store";
import type { AnalyticsConfig } from "./types";

type PostHogClient = typeof import("posthog-js").default;
let posthogClient: PostHogClient | null = null;

/**
 * Loads PostHog only once `analytics` consent is true, and shuts it down
 * (opt-out + wipe of its storage) when that consent is withdrawn. The SDK is
 * a dynamic import, so the bundle is not even fetched before consent.
 */
async function applyPosthog(enabled: boolean, config: AnalyticsConfig["posthog"]) {
  if (!config) return;
  if (enabled) {
    if (!posthogClient) {
      const { default: posthog } = await import("posthog-js");
      posthog.init(config.key, {
        api_host: config.host,
        person_profiles: "identified_only",
        capture_pageview: "history_change",
        disable_session_recording: true,
        disable_surveys: true,
        respect_dnt: true,
      });
      posthogClient = posthog;
    } else {
      posthogClient.opt_in_capturing();
    }
    return;
  }
  if (posthogClient) {
    posthogClient.opt_out_capturing();
    posthogClient.reset();
  }
  // Remove whatever an earlier consent left behind.
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("ph_") || key.startsWith("__ph")) window.localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name?.startsWith("ph_")) {
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}

/** Umami's own opt-out switch, honoured by its tracker script. */
function applyUmamiOptOut(audience: boolean) {
  try {
    if (audience) window.localStorage.removeItem("umami.disabled");
    else window.localStorage.setItem("umami.disabled", "1");
  } catch {
    // storage unavailable
  }
}

export function AnalyticsLoader({
  config,
  choice,
  nonce,
}: {
  config: AnalyticsConfig;
  /** null = the visitor has not decided yet. */
  choice: ConsentChoice | null;
  nonce?: string;
}) {
  // No consent recorded = no consent. Never default to true.
  const analytics = choice?.analytics === true;
  // Exempt audience measurement runs until the visitor objects.
  const audience = choice ? choice.audience : true;

  useEffect(() => {
    void applyPosthog(analytics, config.posthog);
  }, [analytics, config.posthog]);

  useEffect(() => {
    applyUmamiOptOut(audience);
  }, [audience]);

  if (!config.umami || !audience) return null;
  return (
    <Script
      id="umami"
      src={config.umami.src}
      data-website-id={config.umami.websiteId}
      data-do-not-track="true"
      strategy="afterInteractive"
      nonce={nonce}
    />
  );
}

/** Test-only: forget the initialised PostHog client. */
export function resetAnalyticsForTests() {
  posthogClient = null;
}

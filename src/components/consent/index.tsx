import { headers } from "next/headers";
import { DEFAULT_POSTHOG_HOST, NONCE_HEADER } from "@/server/config/csp";
import { ConsentManager } from "./consent-manager";
import type { AnalyticsConfig } from "./types";

export function analyticsConfigFromEnv(env: Record<string, string | undefined> = process.env): AnalyticsConfig {
  const umamiSrc = env.NEXT_PUBLIC_UMAMI_SRC || undefined;
  const umamiId = env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || undefined;
  const posthogKey = env.NEXT_PUBLIC_POSTHOG_KEY || undefined;
  return {
    umami: umamiSrc && umamiId ? { src: umamiSrc, websiteId: umamiId } : null,
    posthog: posthogKey ? { key: posthogKey, host: env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST } : null,
  };
}

/**
 * Consent banner + analytics, rendered once by the root layout.
 *
 * Reads the per-request CSP nonce set by src/proxy.ts for the Umami <Script>.
 * Reading request headers makes every page dynamically rendered — which a
 * nonce-based CSP requires anyway: a page prerendered at build time carries
 * no nonce, and its scripts would be blocked once the policy is enforced
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 */
export async function ConsentAndAnalytics() {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return <ConsentManager config={analyticsConfigFromEnv()} nonce={nonce} />;
}

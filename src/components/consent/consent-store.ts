/**
 * Visitor's analytics choices (CNIL "cookies et autres traceurs" guidelines).
 *
 * Two purposes, deliberately separate:
 *   audience   Umami — self-hosted, cookieless, aggregate page counts. Eligible
 *              for the CNIL consent exemption, so it runs until the visitor
 *              objects ("Tout refuser" or unticking it).
 *   analytics  PostHog — product analytics with an identifier. Requires prior
 *              consent: NOTHING is loaded and no request leaves before
 *              "Tout accepter" or an explicit tick.
 *
 * The choice is kept 6 months (CNIL recommendation), in localStorage: it is
 * read by the browser only and never sent to our server. Withdrawing is as
 * easy as giving: `openConsentPreferences()` reopens the panel from anywhere
 * (the footer's "Gérer les cookies" link).
 *
 * No React here; components subscribe through useSyncExternalStore.
 */

export const CONSENT_STORAGE_KEY = "officeflex.consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182; // ~6 months

/** Fired on `window` to reopen the preferences panel. */
export const CONSENT_OPEN_EVENT = "officeflex:consent:open";
const CONSENT_CHANGE_EVENT = "officeflex:consent:change";

export type ConsentChoice = {
  version: number;
  audience: boolean;
  analytics: boolean;
  decidedAt: string;
};

export function isValidChoice(value: unknown, now: number = Date.now()): value is ConsentChoice {
  if (!value || typeof value !== "object") return false;
  const choice = value as Partial<ConsentChoice>;
  if (choice.version !== CONSENT_VERSION) return false;
  if (typeof choice.audience !== "boolean" || typeof choice.analytics !== "boolean") return false;
  const decided = Date.parse(String(choice.decidedAt));
  if (!Number.isFinite(decided)) return false;
  return now - decided < CONSENT_MAX_AGE_MS && decided <= now + 60_000;
}

let cachedRaw: string | null | undefined;
let cachedChoice: ConsentChoice | null = null;

/** The stored choice, or null when none is stored or it has expired. */
export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null; // storage disabled: ask again, never assume consent
  }
  // Same string -> same object, as useSyncExternalStore requires.
  if (raw === cachedRaw) return cachedChoice;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cachedChoice = isValidChoice(parsed) ? parsed : null;
  } catch {
    cachedChoice = null;
  }
  return cachedChoice;
}

export function saveConsent(choice: { audience: boolean; analytics: boolean }): ConsentChoice {
  const stored: ConsentChoice = {
    version: CONSENT_VERSION,
    audience: choice.audience,
    analytics: choice.analytics,
    decidedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Not persisted: the choice still applies to this page view.
  }
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  return stored;
}

export function subscribeConsent(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_STORAGE_KEY) onChange();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reopens the preferences panel. Safe to call from any client component. */
export function openConsentPreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

/** Test-only. */
export function resetConsentCacheForTests() {
  cachedRaw = undefined;
  cachedChoice = null;
}

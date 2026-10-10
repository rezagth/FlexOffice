// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CNIL consent: PostHog (non-exempt) must not load — not even its bundle —
 * before an explicit "accept", refusing must be as easy as accepting, the
 * choice is kept 6 months, and it can be withdrawn from the footer.
 */

const posthogInit = vi.fn();
const posthogOptOut = vi.fn();
const posthogImported = vi.fn();

vi.mock("posthog-js", () => {
  posthogImported();
  return {
    default: {
      init: (...args: unknown[]) => posthogInit(...args),
      opt_out_capturing: () => posthogOptOut(),
      opt_in_capturing: vi.fn(),
      reset: vi.fn(),
    },
  };
});

// next/script injects through the head manager; render a plain marker instead.
vi.mock("next/script", () => ({
  default: (props: { src: string; nonce?: string; id?: string }) => (
    <script data-testid={`script-${props.id}`} data-src={props.src} data-nonce={props.nonce} />
  ),
}));

const { ConsentManager } = await import("@/components/consent/consent-manager");
const { ManageCookiesButton } = await import("@/components/consent/manage-cookies-button");
const store = await import("@/components/consent/consent-store");
const { resetAnalyticsForTests } = await import("@/components/consent/analytics-loader");
const { analyticsConfigFromEnv } = await import("@/components/consent/index");

const POSTHOG = { key: "phc_test", host: "https://eu.i.posthog.com" };
const UMAMI = { src: "https://stats.example.fr/script.js", websiteId: "site-1" };

beforeEach(() => {
  window.localStorage.clear();
  store.resetConsentCacheForTests();
  resetAnalyticsForTests();
  posthogInit.mockReset();
  posthogOptOut.mockReset();
  posthogImported.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("before any choice", () => {
  it("shows the banner with accept, refuse and customise equally prominent", () => {
    render(<ConsentManager config={{ umami: null, posthog: POSTHOG }} nonce="n1" />);

    const banner = screen.getByTestId("consent-banner");
    const buttons = ["Tout accepter", "Tout refuser", "Personnaliser"].map((name) =>
      screen.getByRole("button", { name })
    );
    expect(banner).toBeTruthy();
    expect(new Set(buttons.map((b) => b.className)).size).toBe(1);
  });

  it("loads no PostHog code and makes no third-party request", async () => {
    render(<ConsentManager config={{ umami: null, posthog: POSTHOG }} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(posthogImported).not.toHaveBeenCalled();
    expect(posthogInit).not.toHaveBeenCalled();
    expect(document.querySelectorAll("script").length).toBe(0);
  });

  it("does not show a banner when nothing needs consent (no PostHog)", () => {
    render(<ConsentManager config={{ umami: UMAMI, posthog: null }} nonce="n1" />);
    expect(screen.queryByTestId("consent-banner")).toBeNull();
    // Exempt, cookieless audience measurement, loaded with the CSP nonce.
    const script = screen.getByTestId("script-umami");
    expect(script.getAttribute("data-src")).toBe(UMAMI.src);
    expect(script.getAttribute("data-nonce")).toBe("n1");
  });
});

describe("decisions", () => {
  it("'Tout refuser' records the refusal, keeps PostHog off and stops Umami", async () => {
    render(<ConsentManager config={{ umami: UMAMI, posthog: POSTHOG }} />);
    fireEvent.click(screen.getByRole("button", { name: "Tout refuser" }));

    await waitFor(() => expect(screen.queryByTestId("consent-banner")).toBeNull());
    expect(store.readConsent()).toMatchObject({ audience: false, analytics: false });
    expect(posthogInit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("script-umami")).toBeNull();
    expect(window.localStorage.getItem("umami.disabled")).toBe("1");
  });

  it("'Tout accepter' starts PostHog on the EU host", async () => {
    render(<ConsentManager config={{ umami: null, posthog: POSTHOG }} />);
    fireEvent.click(screen.getByRole("button", { name: "Tout accepter" }));

    await waitFor(() => expect(posthogInit).toHaveBeenCalledOnce());
    expect(posthogInit.mock.calls[0][0]).toBe("phc_test");
    expect(posthogInit.mock.calls[0][1]).toMatchObject({ api_host: "https://eu.i.posthog.com" });
  });

  it("'Personnaliser' lets each purpose be chosen, PostHog unticked by default", async () => {
    render(<ConsentManager config={{ umami: UMAMI, posthog: POSTHOG }} />);
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));

    expect(screen.getByRole("checkbox", { name: "Analyse d'utilisation" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes choix" }));

    await waitFor(() => expect(store.readConsent()).toMatchObject({ audience: true, analytics: false }));
    expect(posthogInit).not.toHaveBeenCalled();
  });
});

describe("persistence and withdrawal", () => {
  it("does not ask again within 6 months, and asks again after", () => {
    store.saveConsent({ audience: true, analytics: false });
    const { unmount } = render(<ConsentManager config={{ umami: null, posthog: POSTHOG }} />);
    expect(screen.queryByTestId("consent-banner")).toBeNull();
    unmount();

    const old = { version: 1, audience: true, analytics: true, decidedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 190).toISOString() };
    window.localStorage.setItem(store.CONSENT_STORAGE_KEY, JSON.stringify(old));
    render(<ConsentManager config={{ umami: null, posthog: POSTHOG }} />);
    expect(screen.getByTestId("consent-banner")).toBeTruthy();
    expect(posthogInit).not.toHaveBeenCalled();
  });

  it("'Gérer les cookies' reopens the panel and withdrawing stops PostHog", async () => {
    store.saveConsent({ audience: true, analytics: true });
    render(
      <>
        <ConsentManager config={{ umami: null, posthog: POSTHOG }} />
        <ManageCookiesButton />
      </>
    );
    await waitFor(() => expect(posthogInit).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Gérer les cookies" }));
    expect(screen.getByTestId("consent-banner")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tout refuser" }));

    await waitFor(() => expect(posthogOptOut).toHaveBeenCalled());
    expect(store.readConsent()).toMatchObject({ analytics: false });
  });

  it("rejects malformed or future-dated stored choices", () => {
    expect(store.isValidChoice({ version: 1, audience: true, analytics: true, decidedAt: "nope" })).toBe(false);
    expect(store.isValidChoice({ version: 2, audience: true, analytics: true, decidedAt: new Date().toISOString() })).toBe(false);
    expect(
      store.isValidChoice({ version: 1, audience: true, analytics: true, decidedAt: new Date(Date.now() + 86_400_000).toISOString() })
    ).toBe(false);
  });
});

describe("analyticsConfigFromEnv", () => {
  it("defaults PostHog to the EU host and ignores half-configured Umami", () => {
    expect(analyticsConfigFromEnv({ NEXT_PUBLIC_POSTHOG_KEY: "k", NEXT_PUBLIC_UMAMI_SRC: "https://s/x.js" })).toEqual({
      umami: null,
      posthog: { key: "k", host: "https://eu.i.posthog.com" },
    });
    expect(analyticsConfigFromEnv({})).toEqual({ umami: null, posthog: null });
  });
});

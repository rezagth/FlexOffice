import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  analyticsOrigins,
  buildContentSecurityPolicy,
  cspHeaderName,
  generateNonce,
  posthogAssetsOrigin,
} from "@/server/config/csp";

/**
 * SEC-08: nonce-based CSP. These tests pin the directives that carry the
 * protection (nonce + strict-dynamic, no unsafe-inline for scripts,
 * frame-ancestors 'none') so a later "quick fix" cannot silently drop them.
 */

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    })
  );
}

describe("generateNonce", () => {
  it("is unique per call and carries 128 bits", () => {
    const nonces = new Set(Array.from({ length: 50 }, generateNonce));
    expect(nonces.size).toBe(50);
    expect(Buffer.from(generateNonce(), "base64")).toHaveLength(16);
  });
});

describe("buildContentSecurityPolicy", () => {
  const base = { NODE_ENV: "production" };

  it("locks scripts to the nonce with strict-dynamic, and never allows inline or eval in production", () => {
    const d = directives(buildContentSecurityPolicy("abc123", base));

    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["script-src"]).toEqual(expect.arrayContaining(["'self'", "'nonce-abc123'", "'strict-dynamic'", "https://js.stripe.com"]));
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["frame-src"]).toEqual(expect.arrayContaining(["https://js.stripe.com", "https://hooks.stripe.com"]));
    expect(d["connect-src"]).toEqual(expect.arrayContaining(["'self'", "https://api.stripe.com"]));
    expect(d["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "blob:"]));
  });

  it("adds the Supabase origin to connect-src and img-src", () => {
    const d = directives(
      buildContentSecurityPolicy("n", { ...base, NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.fr/" })
    );
    expect(d["connect-src"]).toContain("https://supabase.example.fr");
    expect(d["img-src"]).toContain("https://supabase.example.fr");
  });

  it("allows the configured analytics hosts only when they are configured", () => {
    const none = buildContentSecurityPolicy("n", base);
    expect(none).not.toContain("posthog");
    expect(none).not.toContain("umami");

    const d = directives(
      buildContentSecurityPolicy("n", {
        ...base,
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
        NEXT_PUBLIC_UMAMI_SRC: "https://stats.example.fr/script.js",
        NEXT_PUBLIC_UMAMI_WEBSITE_ID: "site",
      })
    );
    expect(d["connect-src"]).toEqual(
      expect.arrayContaining(["https://eu.i.posthog.com", "https://eu-assets.i.posthog.com", "https://stats.example.fr"])
    );
    expect(d["script-src"]).toContain("https://stats.example.fr");
  });

  it("allows unsafe-eval and the HMR websocket in development only", () => {
    const d = directives(buildContentSecurityPolicy("n", { NODE_ENV: "development" }));
    expect(d["script-src"]).toContain("'unsafe-eval'");
    expect(d["connect-src"]).toContain("ws:");
  });

  it("upgrades insecure requests only when enforced, and reports when asked", () => {
    expect(buildContentSecurityPolicy("n", base)).not.toContain("upgrade-insecure-requests");
    const enforced = buildContentSecurityPolicy("n", { ...base, CSP_ENFORCE: "true", CSP_REPORT_URI: "https://r.example/csp" });
    expect(enforced).toContain("upgrade-insecure-requests");
    expect(enforced).toContain("report-uri https://r.example/csp");
  });
});

describe("cspHeaderName", () => {
  it("is report-only unless CSP_ENFORCE=true", () => {
    expect(cspHeaderName({})).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName({ CSP_ENFORCE: "1" })).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName({ CSP_ENFORCE: "true" })).toBe("Content-Security-Policy");
  });
});

describe("analytics origins", () => {
  it("defaults PostHog to the EU region and derives its assets host", () => {
    expect(analyticsOrigins({ NEXT_PUBLIC_POSTHOG_KEY: "k" }).posthog).toEqual([
      "https://eu.i.posthog.com",
      "https://eu-assets.i.posthog.com",
    ]);
    expect(posthogAssetsOrigin("https://posthog.example.fr")).toBeNull();
  });

  it("ignores Umami without a website id", () => {
    expect(analyticsOrigins({ NEXT_PUBLIC_UMAMI_SRC: "https://stats.example.fr/script.js" }).umami).toBeNull();
  });
});

describe("proxy", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Demo mode: no Supabase, the proxy skips the session refresh.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function run(path: string, headers: Record<string, string> = {}) {
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(`http://test.local${path}`, { headers }));
  }

  it("sends a report-only policy with a fresh nonce on pages by default", async () => {
    const first = await run("/");
    const second = await run("/");
    const policy = first.headers.get("content-security-policy-report-only");

    expect(policy).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(first.headers.get("content-security-policy")).toBeNull();
    expect(second.headers.get("content-security-policy-report-only")).not.toBe(policy);
    // Forwarded to the render so Next.js can stamp its scripts.
    expect(first.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(policy);
    const nonce = /'nonce-([^']+)'/.exec(policy!)![1];
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("enforces the policy when CSP_ENFORCE=true", async () => {
    vi.stubEnv("CSP_ENFORCE", "true");
    const res = await run("/search");
    expect(res.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("does not attach a policy to API responses", async () => {
    const res = await run("/api/spaces");
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("tags every request with a server-generated id, ignoring the client's", async () => {
    const res = await run("/api/spaces", { "x-request-id": "attacker-chosen" });
    const id = res.headers.get("x-request-id");

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(id);
  });
});

import { describe, expect, it } from "vitest";
import {
  baseSentryOptions,
  envelopeEndpoint,
  FILTERED,
  parseDsn,
  parseSampleRate,
  scrubBreadcrumb,
  scrubEvent,
} from "@/sentry.shared";

/**
 * Nothing personal may reach GlitchTip: no e-mail, IP, cookie, auth header
 * or request body. These tests fail if beforeSend stops scrubbing any of them.
 */

describe("scrubEvent (beforeSend)", () => {
  it("keeps only the opaque user id", () => {
    const event = scrubEvent({
      user: { id: "user-1", email: "jane@acme.fr", ip_address: "203.0.113.4", username: "jane" },
    });
    expect(event.user).toEqual({ id: "user-1" });
  });

  it("drops cookies, body and every header but a harmless allowlist", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.example.fr/auth/confirm?token=abc&next=/app",
        cookies: { "sb-access-token": "jwt" },
        data: { password: "hunter2" },
        headers: {
          Authorization: "Bearer xyz",
          Cookie: "sb=1",
          "User-Agent": "Mozilla/5.0",
          "x-request-id": "req-1",
          "cf-connecting-ip": "203.0.113.4",
        },
        query_string: "token=abc&page=2",
      },
    });

    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.headers).toEqual({ "User-Agent": "Mozilla/5.0", "x-request-id": "req-1" });
    expect(event.request?.url).not.toContain("abc");
    expect(event.request?.url).toContain("next=%2Fapp");
    expect(event.request?.query_string).toBe(`token=${encodeURIComponent(FILTERED)}&page=2`);
  });

  it("removes e-mail addresses and tokens from messages and exception values", () => {
    const event = scrubEvent({
      message: "Login failed for jane.doe@acme.fr",
      exception: {
        values: [
          { value: "Invalid key sk_live_1234567890abcdef for bob@example.com" },
          { value: "Header was Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop" },
        ],
      },
    });

    expect(event.message).toBe(`Login failed for ${FILTERED}`);
    expect(event.exception?.values?.[0].value).toBe(`Invalid key ${FILTERED} for ${FILTERED}`);
    expect(event.exception?.values?.[1].value).not.toContain("eyJ");
  });

  it("scrubs sensitive keys in extra and contexts, deeply", () => {
    const event = scrubEvent({
      extra: { booking: { id: "b1", contact: { email: "x@y.fr" } }, apiKey: "k" },
      contexts: { auth: { token: "t" } },
    });
    expect(event.extra).toEqual({ booking: { id: "b1", contact: { email: FILTERED } }, apiKey: FILTERED });
    expect(event.contexts).toEqual({ auth: { token: FILTERED } });
  });

  it("scrubs breadcrumbs (fetch URLs, navigation, console messages)", () => {
    const crumb = scrubBreadcrumb({
      message: "sent to jane@acme.fr",
      data: { url: "/api/auth/callback?code=secret-code&x=1", method: "GET" },
    });
    expect(crumb.message).toBe(`sent to ${FILTERED}`);
    expect(String(crumb.data?.url)).not.toContain("secret-code");
    expect(crumb.data?.method).toBe("GET");
  });
});

describe("baseSentryOptions", () => {
  it("never sends default PII and does not trace unless asked", () => {
    const options = baseSentryOptions({ dsn: "https://k@glitchtip.example.fr/1" });
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendTransaction).toBe(scrubEvent);
  });

  it("parses the sample rate defensively", () => {
    expect(parseSampleRate(undefined)).toBe(0);
    expect(parseSampleRate("abc")).toBe(0);
    expect(parseSampleRate("-1")).toBe(0);
    expect(parseSampleRate("0.2")).toBe(0.2);
    expect(parseSampleRate("5")).toBe(1);
  });
});

describe("parseDsn", () => {
  it("builds the GlitchTip envelope endpoint", () => {
    const dsn = parseDsn("https://abc123@glitchtip.example.fr/7");
    expect(dsn).toEqual({ origin: "https://glitchtip.example.fr", pathPrefix: "", projectId: "7", publicKey: "abc123" });
    expect(envelopeEndpoint(dsn!)).toBe("https://glitchtip.example.fr/api/7/envelope/");
  });

  it("rejects malformed DSNs", () => {
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://glitchtip.example.fr/7")).toBeNull();
    expect(parseDsn("https://k@glitchtip.example.fr/project")).toBeNull();
  });
});

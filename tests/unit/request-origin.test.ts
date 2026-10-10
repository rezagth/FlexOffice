import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/lib/http";

/** CSRF guard on state-changing API routes (audit 06/10/2026, SEC-07). */

const handler = withErrorHandling(async () => NextResponse.json({ ok: true }));

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new Request(`http://app.internal:3000${path}`, {
    method: init.method ?? "POST",
    // A string body defaults to text/plain, which the guard refuses — so
    // default to JSON like every real client in this app does.
    headers: { "content-type": "application/json", ...init.headers },
    body: init.method === "GET" ? undefined : "{}",
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("state-changing API requests", () => {
  it("are refused from another site's Origin", async () => {
    const res = await handler(
      req("/api/bookings", { headers: { origin: "https://evil.example", "content-type": "application/json" } })
    );
    expect(res.status).toBe(403);
  });

  it("are refused with Origin: null", async () => {
    const res = await handler(req("/api/bookings", { headers: { origin: "null" } }));
    expect(res.status).toBe(403);
  });

  it("are refused when the browser flags them cross-site or same-site", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const res = await handler(req("/api/favorites", { headers: { "sec-fetch-site": site } }));
      expect(res.status).toBe(403);
    }
  });

  it("refuse the text/plain form encoding used to forge a JSON login", async () => {
    const res = await handler(req("/api/auth/login", { headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(400);
  });

  it("refuse urlencoded form bodies", async () => {
    const res = await handler(
      req("/api/auth/login", { headers: { "content-type": "application/x-www-form-urlencoded" } })
    );
    expect(res.status).toBe(400);
  });

  it("are accepted from APP_URL even when the request host is internal", async () => {
    vi.stubEnv("APP_URL", "https://makomspace.example");
    const res = await handler(
      req("/api/bookings", {
        headers: { origin: "https://makomspace.example", "content-type": "application/json", "sec-fetch-site": "same-origin" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("are accepted from the host the browser addressed (behind a proxy)", async () => {
    const res = await handler(
      req("/api/bookings", {
        headers: { origin: "https://makomspace.example", "x-forwarded-host": "makomspace.example" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("accept multipart uploads and requests without Origin (non-browser clients)", async () => {
    expect((await handler(req("/api/properties/x/photos", { headers: { "content-type": "multipart/form-data; boundary=x" } }))).status).toBe(200);
    expect((await handler(req("/api/bookings"))).status).toBe(200);
  });

  it("leave webhooks and internal jobs alone", async () => {
    for (const path of ["/api/webhooks/stripe", "/api/internal/expire-bookings"]) {
      const res = await handler(req(path, { headers: { origin: "https://hooks.stripe.example", "content-type": "text/plain" } }));
      expect(res.status).toBe(200);
    }
  });

  it("leave safe methods alone", async () => {
    const res = await handler(req("/api/spaces", { method: "GET", headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(200);
  });
});

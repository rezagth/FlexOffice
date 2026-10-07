import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * onRequestError: every uncaught server error is logged with the proxy's
 * request id, and only reaches the Sentry SDK when a DSN is configured
 * (no DSN = no-op, the demo-mode contract).
 */

const logErrorMock = vi.fn();
const captureRequestErrorMock = vi.fn();

vi.mock("@/server/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/lib/logger")>();
  return { ...actual, logError: (...args: unknown[]) => logErrorMock(...args), logEvent: vi.fn() };
});
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureRequestError: (...args: unknown[]) => captureRequestErrorMock(...args),
  withScope: (callback: (scope: { setTag: () => void }) => void) => callback({ setTag: vi.fn() }),
}));

const request = {
  path: "/app/bookings?token=secret",
  method: "GET",
  headers: { "x-request-id": "req-42", cookie: "sb=1" },
};
const context = {
  routerKind: "App Router",
  routePath: "/app/bookings",
  routeType: "render",
  renderSource: "react-server-components",
  revalidateReason: undefined,
  renderType: "dynamic",
} as const;

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("SENTRY_DSN", "");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
  logErrorMock.mockReset();
  captureRequestErrorMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("onRequestError", () => {
  it("logs the error with the request id, without the query string", async () => {
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error("boom"), request, context);

    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "request.unhandled_error", request_id: "req-42", path: "/app/bookings" })
    );
    expect(captureRequestErrorMock).not.toHaveBeenCalled();
  });

  it("reports to GlitchTip when a DSN is configured", async () => {
    vi.stubEnv("SENTRY_DSN", "https://k@glitchtip.example.fr/1");
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error("boom"), request, context);

    expect(captureRequestErrorMock).toHaveBeenCalledOnce();
  });
});

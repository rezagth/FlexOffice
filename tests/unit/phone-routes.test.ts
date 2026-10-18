import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/server/lib/errors";

const requireAuthMock = vi.fn();
const requestPhoneVerificationCodeMock = vi.fn();
const confirmPhoneVerificationCodeMock = vi.fn();

vi.mock("@/server/auth/rbac", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/server/domains/users/phone-verification", () => ({
  requestPhoneVerificationCode: requestPhoneVerificationCodeMock,
  confirmPhoneVerificationCode: confirmPhoneVerificationCodeMock,
}));

const { POST: requestCode } = await import("@/app/api/account/phone/request-code/route");
const { POST: confirmCode } = await import("@/app/api/account/phone/confirm/route");
const { resetRateLimitStoreForTests } = await import("@/server/auth/rate-limit");

function request(url: string, body: unknown) {
  return new Request(`http://test.local${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimitStoreForTests();
  requireAuthMock.mockReset().mockResolvedValue({ userId: "user-a" });
  requestPhoneVerificationCodeMock.mockReset();
  confirmPhoneVerificationCodeMock.mockReset();
});

describe("POST /api/account/phone/request-code", () => {
  it("normalizes the phone and scopes the request to the session's own profile", async () => {
    requestPhoneVerificationCodeMock.mockResolvedValue({ purpose: "INITIAL_VERIFICATION", sentToMasked: "***78" });
    const res = await requestCode(
      request("/api/account/phone/request-code", { newPhone: "06 12 34 56 78", id: "someone-else" })
    );
    expect(res.status).toBe(200);
    expect(requestPhoneVerificationCodeMock).toHaveBeenCalledWith("user-a", "0612345678");
  });

  it("rejects an obviously invalid phone before reaching the domain layer", async () => {
    const res = await requestCode(request("/api/account/phone/request-code", { newPhone: "not a phone" }));
    expect(res.status).toBe(400);
    expect(requestPhoneVerificationCodeMock).not.toHaveBeenCalled();
  });

  it("401s when not authenticated", async () => {
    const { UnauthorizedError } = await import("@/server/lib/errors");
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await requestCode(request("/api/account/phone/request-code", { newPhone: "0612345678" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/account/phone/confirm", () => {
  it("passes the code straight through to the domain layer for the session's own profile", async () => {
    confirmPhoneVerificationCodeMock.mockResolvedValue({ phone: "0612345678" });
    const res = await confirmCode(request("/api/account/phone/confirm", { code: "123456" }));
    expect(res.status).toBe(200);
    expect(confirmPhoneVerificationCodeMock).toHaveBeenCalledWith("user-a", "123456");
  });

  it("rejects a code that isn't exactly 6 digits before reaching the domain layer", async () => {
    const res = await confirmCode(request("/api/account/phone/confirm", { code: "12" }));
    expect(res.status).toBe(400);
    expect(confirmPhoneVerificationCodeMock).not.toHaveBeenCalled();
  });

  it("surfaces a domain-level validation error (wrong/expired code) as 400", async () => {
    confirmPhoneVerificationCodeMock.mockRejectedValue(new ValidationError("Code incorrect."));
    const res = await confirmCode(request("/api/account/phone/confirm", { code: "000000" }));
    expect(res.status).toBe(400);
  });
});

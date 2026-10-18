import { afterEach, describe, expect, it, vi } from "vitest";
import { MockSmsProvider } from "@/server/domains/sms/mock-provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MockSmsProvider", () => {
  it("refuses to be constructed in a real production deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OFFICEFLEX_DEMO_MODE", "");
    expect(() => new MockSmsProvider()).toThrow(/production/i);
  });

  it("can be constructed in development, test, and declared demo-mode production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => new MockSmsProvider()).not.toThrow();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OFFICEFLEX_DEMO_MODE", "true");
    expect(() => new MockSmsProvider()).not.toThrow();
  });

  it("never throws from sendVerificationCode itself once constructed", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const provider = new MockSmsProvider();
    await expect(provider.sendVerificationCode({ phone: "0600000000", code: "123456" })).resolves.toBeUndefined();
  });
});

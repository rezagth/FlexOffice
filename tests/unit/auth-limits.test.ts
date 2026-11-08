import { describe, expect, it } from "vitest";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";

describe("ACCOUNT_RATE_LIMITS", () => {
  it("chaque limite est un couple (limite, fenêtre) strictement positif", () => {
    for (const [name, cfg] of Object.entries(ACCOUNT_RATE_LIMITS)) {
      expect(cfg.limit, name).toBeGreaterThan(0);
      expect(cfg.windowSeconds, name).toBeGreaterThan(0);
      expect(Number.isInteger(cfg.limit), name).toBe(true);
    }
  });

  it("valeurs promises dans les spécifications", () => {
    expect(ACCOUNT_RATE_LIMITS.phoneCodeRequest).toEqual({ limit: 3, windowSeconds: 3600 });
    expect(ACCOUNT_RATE_LIMITS.passwordForgotPerAccount).toEqual({ limit: 3, windowSeconds: 3600 });
    expect(ACCOUNT_RATE_LIMITS.passwordUpdate.limit).toBeLessThanOrEqual(5);
  });

  it("le mot de passe oublié est plus strict par compte que par IP (anti mail-bombing)", () => {
    const perIpRate = ACCOUNT_RATE_LIMITS.passwordForgotPerIp.limit / ACCOUNT_RATE_LIMITS.passwordForgotPerIp.windowSeconds;
    const perAccountRate =
      ACCOUNT_RATE_LIMITS.passwordForgotPerAccount.limit / ACCOUNT_RATE_LIMITS.passwordForgotPerAccount.windowSeconds;
    expect(perAccountRate).toBeLessThan(perIpRate);
  });
});

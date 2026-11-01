import { describe, expect, it } from "vitest";
import { dashboardPathFor, dashboardPathForRole } from "@/server/auth/redirect-for-role";
import type { AuthContext } from "@/server/auth/rbac";

const ctx = (platformRole: "USER" | "ADMIN") => ({ platformRole }) as unknown as AuthContext;

describe("dashboardPathFor", () => {
  it("un administrateur va au back-office", () => {
    expect(dashboardPathFor(ctx("ADMIN"))).toBe("/admin/dashboard");
  });
  it("un utilisateur ordinaire (locataire ou bailleur) va à /app", () => {
    expect(dashboardPathFor(ctx("USER"))).toBe("/app");
  });
});

describe("dashboardPathForRole (héritage)", () => {
  it("ADMIN → back-office", () => expect(dashboardPathForRole("ADMIN")).toBe("/admin/dashboard"));
  it.each(["CLIENT", "PARTNER"] as const)("%s → /app", (role) => expect(dashboardPathForRole(role)).toBe("/app"));
});

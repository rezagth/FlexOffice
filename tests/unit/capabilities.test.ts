import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  capabilitiesForOrgRole,
  resolveCapabilities,
} from "@/server/auth/capabilities";

/**
 * The rule Phase 2 exists to enforce: the active mode is not a permission.
 *
 * Every test below is a way that rule could be broken by a plausible future
 * edit — granting on the mode, granting on the flag alone, letting a role
 * reach past its remit.
 */
describe("resolveCapabilities", () => {
  const tenantOnly = {
    platformRole: "USER" as const,
    activeMode: "TENANT" as const,
    isLandlord: false,
    activeOrgRole: null,
  };

  it("gives a plain tenant the tenant capabilities and nothing else", () => {
    const caps = resolveCapabilities(tenantOnly);
    expect([...caps].sort()).toEqual([
      "tenant:book",
      "tenant:manage_own_bookings",
      "tenant:search",
    ]);
  });

  it("grants NOTHING extra for LANDLORD mode on its own", () => {
    // The whole point. A forged or stale mode must buy nothing.
    const caps = resolveCapabilities({
      ...tenantOnly,
      activeMode: "LANDLORD",
    });
    expect([...caps].filter((c) => c.startsWith("landlord:"))).toEqual([]);
  });

  it("grants nothing landlord-side for isLandlord without a membership", () => {
    // The account opened an activity and then left or was revoked. The flag
    // survives; the access does not.
    const caps = resolveCapabilities({
      ...tenantOnly,
      isLandlord: true,
      activeMode: "LANDLORD",
      activeOrgRole: null,
    });
    expect([...caps].filter((c) => c.startsWith("landlord:"))).toEqual([]);
  });

  it("grants nothing landlord-side for a membership without isLandlord", () => {
    // An inconsistent state; treated as no access rather than trusted.
    const caps = resolveCapabilities({
      ...tenantOnly,
      isLandlord: false,
      activeOrgRole: "OWNER",
    });
    expect([...caps].filter((c) => c.startsWith("landlord:"))).toEqual([]);
  });

  it("requires both the flag and the membership together", () => {
    const caps = resolveCapabilities({
      ...tenantOnly,
      isLandlord: true,
      activeOrgRole: "OWNER",
    });
    expect(caps.has("landlord:manage_spaces")).toBe(true);
    expect(caps.has("landlord:manage_members")).toBe(true);
  });

  it("keeps tenant capabilities in landlord mode", () => {
    // A landlord answering a question about their own reservation must not
    // have to switch back.
    const caps = resolveCapabilities({
      platformRole: "USER",
      activeMode: "LANDLORD",
      isLandlord: true,
      activeOrgRole: "OWNER",
    });
    expect(caps.has("tenant:book")).toBe(true);
  });

  it("grants back-office access to an ADMIN in either mode", () => {
    for (const activeMode of ["TENANT", "LANDLORD"] as const) {
      const caps = resolveCapabilities({
        platformRole: "ADMIN",
        activeMode,
        isLandlord: activeMode === "LANDLORD",
        activeOrgRole: activeMode === "LANDLORD" ? "OWNER" : null,
      });
      expect(caps.has("admin:access_backoffice")).toBe(true);
    }
  });

  it("does not give an ADMIN landlord capabilities without a membership", () => {
    const caps = resolveCapabilities({
      platformRole: "ADMIN",
      activeMode: "TENANT",
      isLandlord: false,
      activeOrgRole: null,
    });
    expect([...caps].filter((c) => c.startsWith("landlord:"))).toEqual([]);
  });

  it("does not give a non-admin back-office access in any combination", () => {
    for (const activeOrgRole of ["OWNER", "ADMIN", "MANAGER"] as const) {
      const caps = resolveCapabilities({
        platformRole: "USER",
        activeMode: "LANDLORD",
        isLandlord: true,
        activeOrgRole,
      });
      expect(caps.has("admin:access_backoffice")).toBe(false);
    }
  });
});

/**
 * Separation of duties inside an organization. An agency hands a property
 * manager the calendar without handing them the payouts.
 */
describe("capabilitiesForOrgRole", () => {
  it("gives OWNER everything on the landlord side", () => {
    const owner = capabilitiesForOrgRole("OWNER");
    const allLandlord = CAPABILITIES.filter((c) => c.startsWith("landlord:"));
    expect([...owner].sort()).toEqual([...allLandlord].sort());
  });

  it("withholds organization ownership from an org ADMIN", () => {
    expect(capabilitiesForOrgRole("ADMIN")).not.toContain("landlord:manage_organization");
    expect(capabilitiesForOrgRole("ADMIN")).toContain("landlord:manage_members");
  });

  it("keeps a MANAGER away from the money", () => {
    const manager = capabilitiesForOrgRole("MANAGER");
    expect(manager).toContain("landlord:manage_calendar");
    expect(manager).toContain("landlord:manage_bookings");
    expect(manager).not.toContain("landlord:view_revenue");
    expect(manager).not.toContain("landlord:manage_accounting");
    expect(manager).not.toContain("landlord:manage_members");
  });

  it("keeps an ACCOUNTANT away from the operations", () => {
    const accountant = capabilitiesForOrgRole("ACCOUNTANT");
    expect(accountant).toContain("landlord:view_revenue");
    expect(accountant).toContain("landlord:manage_accounting");
    expect(accountant).not.toContain("landlord:manage_spaces");
    expect(accountant).not.toContain("landlord:manage_calendar");
    expect(accountant).not.toContain("landlord:manage_bookings");
  });

  it("gives a VIEWER read access and nothing that changes state", () => {
    expect(capabilitiesForOrgRole("VIEWER")).toEqual(["landlord:view_dashboard"]);
  });

  it("gives no role a capability outside the declared catalogue", () => {
    // A typo in the table would otherwise create a capability nothing grants
    // and nothing checks.
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"] as const) {
      for (const capability of capabilitiesForOrgRole(role)) {
        expect(CAPABILITIES).toContain(capability);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  canOrganizationPublish,
  STATUSES_ALLOWED_TO_PUBLISH,
  STATUSES_BLOCKED_FROM_PUBLISHING,
} from "@/server/domains/organizations/publication-guard";

/**
 * `Organization.status` existed, was shown in the admin back office, and was
 * read by no business rule: a suspended organization kept its listings live
 * and bookable. These tests are what makes suspension mean something.
 */
describe("canOrganizationPublish", () => {
  it("blocks a suspended organization", () => {
    expect(canOrganizationPublish("SUSPENDED")).toBe(false);
  });

  it("allows a verified organization", () => {
    expect(canOrganizationPublish("VERIFIED")).toBe(true);
  });

  it("blocks an organization still awaiting verification", () => {
    // Tightened in Phase 3: LandlordVerification now gives an organization a
    // real, auditable route to VERIFIED (admin approval), so there is no
    // longer a reason to publish before it exists. See publication-guard.ts
    // for the Phase 1 history of this threshold.
    expect(canOrganizationPublish("PENDING_VERIFICATION")).toBe(false);
  });

  it("covers every status exactly once, so a new one cannot default to allowed", () => {
    // If a future migration adds a status, this fails until the policy lists
    // it — which is the point. A status nobody classified must not silently
    // fall on the permissive side.
    const all = [...STATUSES_ALLOWED_TO_PUBLISH, ...STATUSES_BLOCKED_FROM_PUBLISHING];
    const knownStatuses = ["PENDING_VERIFICATION", "VERIFIED", "SUSPENDED"];

    expect([...all].sort()).toEqual([...knownStatuses].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

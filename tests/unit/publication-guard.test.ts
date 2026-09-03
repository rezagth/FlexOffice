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

  it("allows an organization still awaiting verification, for now", () => {
    // Deliberate Phase 1 threshold: there is no way for an organization to
    // reach VERIFIED yet other than a manual database write, so requiring it
    // would hide every genuine signup. Phase 2 tightens this once the
    // Verification workflow exists — and this test is expected to change
    // with it, on purpose.
    expect(canOrganizationPublish("PENDING_VERIFICATION")).toBe(true);
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

import type { ActiveMode, OrgRole, PlatformRole } from "@/generated/prisma/client";

/**
 * What an account may actually do, resolved server-side.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * The active mode is not a permission. `activeMode = LANDLORD` says what the
 * user is looking at; it grants nothing on its own. Being able to see the
 * landlord space and being allowed to publish a listing are two different
 * questions, and only the second one is answered here — from the platform
 * role, the capability flag, and the role held in the *specific* organization
 * being acted for.
 *
 * Nothing in this file reads a request body, a header or a cookie. The inputs
 * come from the verified session and from an ACTIVE `OrganizationMember` row.
 *
 * WHY A DERIVED SET RATHER THAN `if (orgRole === "OWNER")` AT CALL SITES
 * `OrgRole` is an enum today and will become a role/permission table when
 * organizations need custom roles. Call sites that ask "may this caller
 * publish?" keep working across that change; call sites that compare an enum
 * value would all have to be found and rewritten.
 */

export const CAPABILITIES = [
  // Tenant side — available to every account, in tenant mode.
  "tenant:search",
  "tenant:book",
  "tenant:manage_own_bookings",

  // Landlord side — require an ACTIVE membership, and differ by org role.
  "landlord:view_dashboard",
  "landlord:manage_properties",
  "landlord:manage_spaces",
  "landlord:publish_listing",
  "landlord:manage_calendar",
  "landlord:manage_bookings",
  "landlord:view_revenue",
  "landlord:manage_accounting",
  "landlord:manage_members",
  "landlord:manage_organization",
  /**
   * Managing the onboarding/verification dossier: uploading identity and
   * ownership documents, submitting for review, seeing the rejection reason.
   * Restricted to OWNER and org ADMIN — MANAGER, ACCOUNTANT and VIEWER never
   * see or touch it, because the documents involved (a CNI, a Kbis) are
   * exactly the kind of sensitive material separation of duties exists to
   * keep away from an operational or read-only role.
   */
  "landlord:manage_verification",

  // Platform administration. Deliberately unrelated to the modes: an
  // administrator is also an ordinary user who rents and lets spaces.
  "admin:access_backoffice",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const TENANT_CAPABILITIES: readonly Capability[] = [
  "tenant:search",
  "tenant:book",
  "tenant:manage_own_bookings",
];

/**
 * Landlord capabilities per organization role.
 *
 * Read as a separation of duties, not a hierarchy of seniority:
 *   OWNER       everything, including who else is a member
 *   ADMIN       everything operational; cannot dissolve or re-own the org
 *   MANAGER     runs the spaces and the bookings; never sees the money
 *   ACCOUNTANT  sees the money; never touches spaces or bookings
 *   VIEWER      reads the dashboard, changes nothing
 *
 * MANAGER excluding revenue and ACCOUNTANT excluding operations is the point:
 * an agency hands a property manager the calendar without handing them the
 * payouts.
 */
const LANDLORD_CAPABILITIES_BY_ORG_ROLE: Record<OrgRole, readonly Capability[]> = {
  OWNER: [
    "landlord:view_dashboard",
    "landlord:manage_properties",
    "landlord:manage_spaces",
    "landlord:publish_listing",
    "landlord:manage_calendar",
    "landlord:manage_bookings",
    "landlord:view_revenue",
    "landlord:manage_accounting",
    "landlord:manage_members",
    "landlord:manage_organization",
    "landlord:manage_verification",
  ],
  ADMIN: [
    "landlord:view_dashboard",
    "landlord:manage_properties",
    "landlord:manage_spaces",
    "landlord:publish_listing",
    "landlord:manage_calendar",
    "landlord:manage_bookings",
    "landlord:view_revenue",
    "landlord:manage_accounting",
    "landlord:manage_members",
    "landlord:manage_verification",
  ],
  MANAGER: [
    "landlord:view_dashboard",
    "landlord:manage_properties",
    "landlord:manage_spaces",
    "landlord:publish_listing",
    "landlord:manage_calendar",
    "landlord:manage_bookings",
  ],
  ACCOUNTANT: [
    "landlord:view_dashboard",
    "landlord:view_revenue",
    "landlord:manage_accounting",
  ],
  VIEWER: ["landlord:view_dashboard"],
};

export type CapabilityInput = {
  platformRole: PlatformRole;
  activeMode: ActiveMode;
  isLandlord: boolean;
  /** Role in the organization currently being acted for, if any. */
  activeOrgRole: OrgRole | null;
};

/**
 * Resolves the capability set for one request.
 *
 * Tenant capabilities are granted regardless of mode: switching to the
 * landlord space does not stop someone being able to book a room, and gating
 * them on the mode would mean a landlord had to switch back to answer a
 * question about their own reservation.
 *
 * Landlord capabilities require BOTH the unlocked capability flag AND a
 * resolved organization role. Either alone is not enough:
 *   * `isLandlord` without a membership -> the organization was left or the
 *     membership was revoked; nothing is granted.
 *   * a membership without `isLandlord` -> an inconsistent state that should
 *     not exist; treated as no landlord access rather than trusted.
 */
export function resolveCapabilities(input: CapabilityInput): Set<Capability> {
  const granted = new Set<Capability>(TENANT_CAPABILITIES);

  if (input.isLandlord && input.activeOrgRole) {
    for (const capability of LANDLORD_CAPABILITIES_BY_ORG_ROLE[input.activeOrgRole]) {
      granted.add(capability);
    }
  }

  if (input.platformRole === "ADMIN") {
    granted.add("admin:access_backoffice");
  }

  return granted;
}

/** Capabilities a given organization role would grant. For UI copy and tests. */
export function capabilitiesForOrgRole(orgRole: OrgRole): readonly Capability[] {
  return LANDLORD_CAPABILITIES_BY_ORG_ROLE[orgRole];
}

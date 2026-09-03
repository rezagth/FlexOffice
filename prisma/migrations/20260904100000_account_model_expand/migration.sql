-- Phase 2 — single account, tenant and landlord modes. EXPAND step.
--
-- WHAT CHANGES CONCEPTUALLY
-- `Profile.role = CLIENT | PARTNER | ADMIN` treated "renter" and "lister" as
-- two kinds of person. They are two things one person does, often both. The
-- replacement splits that single column into three independent facts:
--
--   platform_role   USER | ADMIN        who you are to the platform
--   is_landlord     boolean             a capability you have unlocked
--   active_mode     TENANT | LANDLORD   what you are doing right now
--
-- and moves "which organization do you act for" out of a single column on
-- the profile into `organization_members`, so one person can belong to
-- several organizations and one organization can have several people. That
-- table is what makes agencies, property managers and accountants possible
-- later without touching the account model again.
--
-- EXPAND ONLY. `profiles.role` and `profiles.organization_id` are kept and
-- still written by the signup trigger. Nothing reads them for authorization
-- after this phase, but dropping them is a separate, later migration — see
-- the Phase 2 report, DETTE TECHNIQUE RESTANTE.
--
-- WHY active_mode LIVES IN THE DATABASE AND NOT IN A COOKIE
-- A cookie would need signing, a key to manage and rotate, and a decision
-- about what happens when the signature is stale. A column cannot be forged
-- at all, which removes the entire class of problem — and `getAuthContext()`
-- already loads the profile, so reading it costs nothing.
-- `active_organization_id` is stored the same way but is STILL revalidated
-- against `organization_members` on every request: a stored id goes stale
-- when a membership is revoked, so being unforgeable is not the same as
-- being currently valid. See src/server/auth/active-context.ts.
--
-- RISK / ROLLBACK
-- Additive except for `organizations.siret`, which is relaxed from NOT NULL
-- to nullable — a widening, so no existing row can fail. The backfill only
-- writes columns created by this migration and inserts into a table created
-- by it. Rollback: drop `organization_members`, drop the added columns and
-- the added CHECKs, restore `siret` to NOT NULL (safe only while no
-- INDIVIDUAL organization exists), drop the enums.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

-- Deliberately NOT reusing the existing `Role` enum. That enum conflates the
-- platform dimension (ADMIN) with the usage dimension (CLIENT/PARTNER), and
-- keeping them in one type is what made a person unable to be both.
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');

CREATE TYPE "ActiveMode" AS ENUM ('TENANT', 'LANDLORD');

-- INDIVIDUAL: a natural person letting their own space. Their identity is
-- already on the Profile, so the organization carries only the activity.
-- COMPANY: a legal entity, with the registration fields below.
CREATE TYPE "HolderType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- Five roles now, granular permissions later. The point of an enum here is
-- that Phase 2 needs a working answer today; the point of resolving
-- capabilities in code (src/server/auth/capabilities.ts) rather than reading
-- this value directly at call sites is that replacing it with a
-- role/permission table stays a local change.
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'VIEWER');

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'REVOKED');

-- ---------------------------------------------------------------------------
-- 2. Profile — the three new facts
-- ---------------------------------------------------------------------------
ALTER TABLE "profiles"
  ADD COLUMN "platform_role" "PlatformRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "is_landlord" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "active_mode" "ActiveMode" NOT NULL DEFAULT 'TENANT',
  ADD COLUMN "active_organization_id" UUID;

COMMENT ON COLUMN "profiles"."is_landlord" IS
  'The landlord capability has been unlocked (see "Devenir bailleur"). A '
  'capability, NOT an authorization: every landlord action is still checked '
  'against organization_members and the resolved capability set.';

COMMENT ON COLUMN "profiles"."active_mode" IS
  'What the user is currently doing, not who they are. Never an '
  'authorization on its own: LANDLORD mode does not grant any permission '
  'that organization_members does not already carry.';

COMMENT ON COLUMN "profiles"."active_organization_id" IS
  'Last selected organization. A convenience, never a grant — always '
  'revalidated against an ACTIVE organization_members row before use.';

-- SET NULL, not CASCADE: losing an organization must never delete a person.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_active_organization_id_fkey"
  FOREIGN KEY ("active_organization_id") REFERENCES "organizations" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "profiles_active_organization_id_idx"
  ON "profiles" ("active_organization_id");

-- A tenant-only account must not be able to sit in LANDLORD mode. The mode
-- switch is guarded in the service layer too, but this makes the invalid
-- combination unrepresentable — including for a direct SQL write.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_landlord_mode_requires_capability_check"
  CHECK ("active_mode" <> 'LANDLORD' OR "is_landlord" = true);

-- ---------------------------------------------------------------------------
-- 3. Organization — individual or company holder
-- ---------------------------------------------------------------------------
ALTER TABLE "organizations"
  ADD COLUMN "holder_type" "HolderType" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "legal_name" TEXT,
  ADD COLUMN "siren" TEXT,
  ADD COLUMN "vat_number" TEXT,
  ADD COLUMN "legal_representative_name" TEXT;

-- Every organization existing today came from a PARTNER signup, which always
-- required a SIRET — so COMPANY is the correct default for the backfill and
-- no existing row is misclassified.

-- An individual holder has no SIRET, so the column has to allow NULL. The
-- existing UNIQUE index keeps working: PostgreSQL treats NULLs as distinct,
-- so any number of individuals can coexist while two companies still cannot
-- share a SIRET.
ALTER TABLE "organizations" ALTER COLUMN "siret" DROP NOT NULL;

-- The old format check assumed NOT NULL.
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_siret_format_check";

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_siret_format_check"
    CHECK ("siret" IS NULL OR "siret" ~ '^[0-9]{14}$'),
  -- Keeps exactly today's guarantee and extends it to the new case: a
  -- company has a SIRET, an individual does not.
  --
  -- KNOWN FUTURE RELAXATION: a foreign company has no SIRET. When the
  -- platform expands beyond France this becomes
  --   CHECK (holder_type <> 'INDIVIDUAL' OR siret IS NULL)
  -- plus a country column. Written strict now on purpose: relaxing a
  -- constraint later never breaks stored data, tightening one does.
  ADD CONSTRAINT "organizations_holder_type_siret_check"
    CHECK (
      ("holder_type" = 'COMPANY' AND "siret" IS NOT NULL)
      OR ("holder_type" = 'INDIVIDUAL' AND "siret" IS NULL)
    ),
  ADD CONSTRAINT "organizations_siren_format_check"
    CHECK ("siren" IS NULL OR "siren" ~ '^[0-9]{9}$'),
  -- Intra-community VAT: two letters then 2–13 alphanumerics. Loose on
  -- purpose — the exact shape differs per member state, and rejecting a
  -- valid foreign number would be worse than accepting a malformed one that
  -- the verification phase will check properly anyway.
  ADD CONSTRAINT "organizations_vat_number_format_check"
    CHECK ("vat_number" IS NULL OR "vat_number" ~ '^[A-Z]{2}[0-9A-Z]{2,13}$');

-- ---------------------------------------------------------------------------
-- 4. organization_members — the table that unblocks everything else
-- ---------------------------------------------------------------------------
CREATE TABLE "organization_members" (
    "organization_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "org_role" "OrgRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by_profile_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    -- Composite primary key: one membership per (organization, person), so a
    -- duplicate is impossible rather than merely unlikely. It is also the
    -- lookup key every authorization check uses.
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "profile_id")
);

-- Both sides must exist: no membership of a phantom organization, none for a
-- phantom profile.
ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organization_members_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- SET NULL: who invited someone is useful history, but it must not keep a
  -- profile alive, and losing the inviter must not lose the membership.
  ADD CONSTRAINT "organization_members_invited_by_profile_id_fkey"
    FOREIGN KEY ("invited_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "organization_members_profile_id_idx"
  ON "organization_members" ("profile_id");
CREATE INDEX "organization_members_organization_id_status_idx"
  ON "organization_members" ("organization_id", "status");

-- NOT constrained here, deliberately: "an organization always has at least
-- one ACTIVE OWNER". A CHECK cannot see other rows, and a trigger would fire
-- on every membership write. Multiple OWNERs must stay legal — an agency
-- with two partners is the normal case, so a unique index would be wrong.
-- Enforced in the service layer instead, with a test.
-- See src/server/domains/organizations/membership.ts.

-- S-02 block, required for every new table — see
-- 20260830140000_enable_rls_revoke_public_grants and
-- tests/unit/rls-coverage.test.ts, which fails if a new table skips it.
-- RLS with no policy denies every role that is subject to it; the
-- application reaches Postgres through Prisma as the table owner, which is
-- exempt unless FORCE is set (it deliberately is not).
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;

-- Guarded: the roles exist on Supabase but not on a bare PostgreSQL, where
-- an unguarded REVOKE raises `role "anon" does not exist` and fails the
-- whole deploy.
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.organization_members FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Backfill — every existing account keeps working, and keeps its access
-- ---------------------------------------------------------------------------

-- ADMIN was a platform role wearing a usage role's clothes. It becomes one.
UPDATE "profiles" SET "platform_role" = 'ADMIN' WHERE "role" = 'ADMIN';

-- A PARTNER with an organization has, by definition, already done what
-- "Devenir bailleur" now does. Unlock the capability.
UPDATE "profiles"
   SET "is_landlord" = true
 WHERE "role" = 'PARTNER' AND "organization_id" IS NOT NULL;

-- Turn the old one-column link into a real membership. OWNER because these
-- accounts created their organization at signup and are its only member.
-- `created_at` as joined_at: the profile's creation is when the link
-- actually began, and inventing now() would falsify the history.
INSERT INTO "organization_members"
  ("organization_id", "profile_id", "org_role", "status", "joined_at", "updated_at")
SELECT "organization_id", "id", 'OWNER', 'ACTIVE', "created_at", now()
  FROM "profiles"
 WHERE "organization_id" IS NOT NULL
ON CONFLICT ("organization_id", "profile_id") DO NOTHING;

-- Preselect the organization they already had, so nothing asks them to
-- choose on first login.
UPDATE "profiles"
   SET "active_organization_id" = "organization_id"
 WHERE "organization_id" IS NOT NULL;

-- Existing PARTNERs start in LANDLORD mode.
--
-- New signups default to TENANT (the column default), which is the product
-- rule. But an existing partner's entire use of the product is landlord
-- work: dropping them into the tenant space on their next login would be a
-- silent regression of their experience, not a migration. They can switch to
-- TENANT at any time — that is the whole point of the mode.
--
-- Runs after the is_landlord update above, so
-- profiles_landlord_mode_requires_capability_check is satisfied.
UPDATE "profiles"
   SET "active_mode" = 'LANDLORD'
 WHERE "is_landlord" = true;

-- A PARTNER with no organization is a data anomaly (the signup trigger
-- always created one). Deliberately left as a tenant: there is no
-- organization to be OWNER of, and inventing one would be worse than
-- leaving the account able to use the product as a tenant and re-run
-- "Devenir bailleur". Surfaced by
-- tests/integration/account-model-backfill.test.ts.

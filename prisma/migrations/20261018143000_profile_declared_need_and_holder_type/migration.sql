-- PRD V1.1, R15 — persist the account's declared need (SEARCH/PUBLISH) and
-- holder type (INDIVIDUAL/COMPANY) on the profile itself, not only on an
-- Organization that may not exist yet (a plain individual tenant never
-- creates one). Both columns are nullable and additive: every profile that
-- predates this migration gets NULL, and is completed later via
-- /app/complete-profile (src/server/domains/users/profile-completion.ts
-- treats NULL the same as "not yet answered", never as a default value).
--
-- "HolderType" already exists (Organization.holder_type) and is reused as-is
-- for profiles.holder_type — same two values, same concept, one per account.

CREATE TYPE "AccountNeed" AS ENUM ('SEARCH', 'PUBLISH');

ALTER TABLE "profiles" ADD COLUMN "account_need" "AccountNeed";
ALTER TABLE "profiles" ADD COLUMN "holder_type" "HolderType";

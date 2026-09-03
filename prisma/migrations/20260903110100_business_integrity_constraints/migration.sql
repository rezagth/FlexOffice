-- Business integrity constraints.
--
-- Before this migration the schema carried primary keys, foreign keys, unique
-- indexes and one EXCLUDE constraint — and not a single CHECK. Nothing
-- prevented a space with capacity 0, a negative price, a booking ending
-- before it starts, or a payment whose parts did not add up to its total. All
-- of that coherence was left to application code which, for the booking and
-- payment paths, is not written yet.
--
-- Prisma cannot express CHECK constraints, so this migration is hand-written.
-- Prisma also ignores CHECK constraints when diffing, so these do not show up
-- as schema drift. The two composite UNIQUE constraints DO show up, and are
-- therefore mirrored in prisma/schema.prisma with `@@unique`.
--
-- WHAT IS DELIBERATELY *NOT* CONSTRAINED HERE
-- Two rules from the brief cannot be expressed as a CHECK, because a CHECK
-- may only reference columns of the row being written:
--
--   1. participants_count <= spaces.capacity   (cross-table)
--   2. SUM(refunds.amount_cents) <= payments.amount_cents   (cross-row)
--
-- Enforcing these with triggers would put a SELECT on the write path of every
-- booking and refund, and a trigger is exactly as easy to forget as a service
-- check while being much harder to read. Both are therefore enforced in the
-- server domain layer with a regression test each:
--   * src/server/domains/bookings/booking-invariants.ts
--   * tests/integration/business-constraints.test.ts
-- This is a documented trade-off, not an omission.
--
-- Postal code format is also deliberately left unconstrained: a 5-digit rule
-- would be correct for France today and would block the multi-city / wider
-- expansion the brief plans, for no security benefit.
--
-- RISK
-- Every constraint below is ADDed and therefore validated against existing
-- rows. On a database whose data already violates one of them the migration
-- fails loudly and rolls back — which is the wanted behaviour: it surfaces
-- the bad data instead of silently accepting it. Verified against the demo
-- seed (prisma/seed.ts) and every fixture in tests/integration.
--
-- ROLLBACK
-- `ALTER TABLE <t> DROP CONSTRAINT <name>;` for each, in any order. No data is
-- modified by this migration, so rollback is lossless.

-- ---------------------------------------------------------------------------
-- spaces
-- ---------------------------------------------------------------------------
ALTER TABLE "spaces"
  ADD CONSTRAINT "spaces_capacity_positive_check"
    CHECK ("capacity" > 0),
  ADD CONSTRAINT "spaces_half_day_price_non_negative_check"
    CHECK ("half_day_price_cents" >= 0),
  ADD CONSTRAINT "spaces_day_price_non_negative_check"
    CHECK ("day_price_cents" >= 0);

-- ---------------------------------------------------------------------------
-- space_opening_hours
-- `opens_at` / `closes_at` are TEXT "HH:MM" (see prisma/schema.prisma). The
-- format check is what makes the ordering check meaningful: on zero-padded
-- 24-hour values, lexicographic comparison is chronological comparison.
-- ---------------------------------------------------------------------------
ALTER TABLE "space_opening_hours"
  ADD CONSTRAINT "space_opening_hours_weekday_range_check"
    CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "space_opening_hours_opens_at_format_check"
    CHECK ("opens_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "space_opening_hours_closes_at_format_check"
    CHECK ("closes_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "space_opening_hours_closes_after_opens_check"
    CHECK ("closes_at" > "opens_at");

-- ---------------------------------------------------------------------------
-- space_closures
-- ---------------------------------------------------------------------------
ALTER TABLE "space_closures"
  ADD CONSTRAINT "space_closures_ends_after_starts_check"
    CHECK ("ends_at" > "starts_at");

-- ---------------------------------------------------------------------------
-- bookings
-- `ends_at > starts_at` also protects the EXCLUDE constraint: tstzrange()
-- raises on an inverted range, and an empty range never overlaps anything, so
-- without this a degenerate booking could slip past double-booking detection.
-- ---------------------------------------------------------------------------
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_ends_after_starts_check"
    CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "bookings_participants_positive_check"
    CHECK ("participants_count" > 0),
  ADD CONSTRAINT "bookings_price_non_negative_check"
    CHECK ("price_amount_cents" >= 0),
  ADD CONSTRAINT "bookings_commission_non_negative_check"
    CHECK ("commission_amount_cents" >= 0),
  -- A commission larger than the amount charged is not a rounding artefact,
  -- it is a bug. Kept as <= (not <) so a 100 % commission stays expressible.
  ADD CONSTRAINT "bookings_commission_within_price_check"
    CHECK ("commission_amount_cents" <= "price_amount_cents");

-- ---------------------------------------------------------------------------
-- payments
-- The three-way identity is exact, never approximate: all amounts are integer
-- cents (never floats), and the split is computed as
-- commission = round(amount * rate); net = amount - commission.
-- Refunds and adjustments live in their own table and do not mutate these
-- columns, so this identity does not constrain a future refund model.
-- ---------------------------------------------------------------------------
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative_check"
    CHECK ("amount_cents" >= 0),
  ADD CONSTRAINT "payments_commission_non_negative_check"
    CHECK ("commission_amount_cents" >= 0),
  ADD CONSTRAINT "payments_net_non_negative_check"
    CHECK ("net_amount_cents" >= 0),
  ADD CONSTRAINT "payments_amount_splits_exactly_check"
    CHECK ("amount_cents" = "commission_amount_cents" + "net_amount_cents");

-- ---------------------------------------------------------------------------
-- refunds
-- Strictly positive: a zero-amount refund carries no meaning and is a sign
-- the caller computed something wrong.
-- ---------------------------------------------------------------------------
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive_check"
    CHECK ("amount_cents" > 0);

-- ---------------------------------------------------------------------------
-- organizations
-- The signup trigger already validates SIRET, but only on the
-- auth.users insert path. Anything writing through Prisma (the seed, tests, a
-- future admin route) bypasses the trigger entirely, so the rule belongs in
-- the table as well.
-- ---------------------------------------------------------------------------
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_siret_format_check"
    CHECK ("siret" ~ '^[0-9]{14}$');

-- ---------------------------------------------------------------------------
-- Tenant coherence, enforced declaratively.
--
-- `bookings.organization_id` is denormalised from `spaces.organization_id`,
-- and `payments.organization_id` from `bookings.organization_id`, with
-- nothing until now guaranteeing they agreed. A drift there is not cosmetic:
-- partner revenue and admin figures aggregate on those columns, and the
-- partner dashboard scopes its queries by them — a mismatched row is both a
-- wrong number and a cross-tenant leak.
--
-- Rather than a trigger, the invariant is expressed as a composite foreign
-- key: it is checked by PostgreSQL on every insert and update, costs nothing
-- to read, and cannot be forgotten. Each needs a matching UNIQUE on the
-- referenced side, which is what the two UNIQUE constraints below are for
-- (redundant with the primary keys by design — a composite FK requires a
-- unique constraint covering exactly its referenced columns).
-- ---------------------------------------------------------------------------
ALTER TABLE "spaces"
  ADD CONSTRAINT "spaces_id_organization_id_key" UNIQUE ("id", "organization_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_id_organization_id_key" UNIQUE ("id", "organization_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_space_id_organization_id_fkey"
  FOREIGN KEY ("space_id", "organization_id")
  REFERENCES "spaces" ("id", "organization_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_booking_id_organization_id_fkey"
  FOREIGN KEY ("booking_id", "organization_id")
  REFERENCES "bookings" ("id", "organization_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- GDPR erasure: make "marked as deleted but personal data still present"
-- unrepresentable.
--
-- `deleteOrAnonymizeProfile()` (src/server/domains/users/gdpr.ts) overwrites
-- name, email and phone and stamps `deleted_at` in a single UPDATE. Nothing
-- in the database required all four to move together, so a service bug, a
-- partial write or a future caller could leave an account looking erased
-- while still holding an email and a phone number — and nothing would ever
-- surface it.
--
-- The pattern below matches what the service writes:
--   `deleted-<uuid>@officeflex.invalid`
-- `.invalid` is reserved by RFC 2606, so a tombstone address can never reach
-- a real mailbox. Keep this regex and that template in step.
--
-- `name` is checked by the service rather than here: it is replaced by
-- user-facing copy ("Compte supprimé"), and pinning UI wording in a database
-- constraint would make the copy impossible to change.
-- ---------------------------------------------------------------------------
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_anonymized_has_no_pii_check"
  CHECK (
    "deleted_at" IS NULL
    OR (
      "email" ~ '^deleted-[0-9a-f-]{36}@officeflex\.invalid$'
      AND "phone" IS NULL
    )
  );

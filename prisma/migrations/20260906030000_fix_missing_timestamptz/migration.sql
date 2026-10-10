-- Fixes a pre-existing mismatch: schema.prisma already declares
-- @db.Timestamptz(3) on these five columns, but their originating
-- migrations (20260905150000_messaging, 20260905160000_support_tickets,
-- 20260905170000_search_events) created them as plain TIMESTAMP(3), with no
-- time zone. Caught by tests/integration/timestamptz.test.ts. Existing
-- values are assumed stored as UTC instants (consistent with how the app
-- writes every other timestamp), so the conversion is a straight
-- reinterpretation, not a value change.

ALTER TABLE "conversations" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "messages" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "search_events" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

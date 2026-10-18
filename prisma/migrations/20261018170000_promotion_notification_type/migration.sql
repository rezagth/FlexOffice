-- PRD V1.1, lot 3, commit 2 — promotions (R34-R39, R48-R52).
--
-- Split from the main promotions migration on purpose: PostgreSQL will not
-- let a value just added by ALTER TYPE ... ADD VALUE be used by a statement
-- in the SAME transaction (the backfill below needs to INSERT a
-- PROMOTION_STATUS_CHANGED notification). Each migration.sql file is its
-- own transaction, so committing this one first makes the value usable by
-- the next.
ALTER TYPE "NotificationType" ADD VALUE 'PROMOTION_STATUS_CHANGED';

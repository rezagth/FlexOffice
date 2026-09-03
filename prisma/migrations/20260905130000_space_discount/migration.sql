-- Optional discount, applied server-side (computeDaySlots()) on top of
-- half_day_price_cents / day_price_cents. Bounded in the database, not just
-- in Zod, for the same reason every other money-adjacent column here is:
-- a value out of range must be unrepresentable, not merely rejected by one
-- caller.

ALTER TABLE "spaces" ADD COLUMN "discount_percent" INTEGER;

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_discount_percent_range_check"
  CHECK ("discount_percent" IS NULL OR ("discount_percent" BETWEEN 0 AND 100));

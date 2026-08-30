-- Access instructions (door code, reception, floor) shown to the client
-- only after their booking is confirmed. Optional.
ALTER TABLE "spaces" ADD COLUMN "access_instructions" TEXT;

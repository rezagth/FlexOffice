-- Lot C (audit 06/10/2026): account suspension, day-before reminders,
-- support replies, listing price guard rails.

-- FCT-16 — an administrator can suspend an account. A suspended profile is
-- treated exactly like a deleted one by getAuthContext() (no valid session
-- anywhere in the app) until it is reactivated (column back to NULL).
ALTER TABLE "profiles" ADD COLUMN "suspended_at" TIMESTAMPTZ(3);

-- FCT-12 — the J-1 reminder is sent at most once per booking: the row is
-- claimed by setting this column before the e-mail goes out.
ALTER TABLE "bookings" ADD COLUMN "reminder_sent_at" TIMESTAMPTZ(3);

-- FCT-22 / SEC-18 — a discount above 90 % is refused. NOT VALID: enforced on
-- every new write without failing the migration on a legacy row; Zod and the
-- service layer refuse it too.
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_discount_percent_max_check"
  CHECK ("discount_percent" IS NULL OR "discount_percent" <= 90) NOT VALID;

-- FCT-16 — the history of what the platform answered on a support ticket.
CREATE TABLE "support_ticket_replies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "author_profile_id" UUID,
    "body" TEXT NOT NULL,
    "emailed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_replies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_ticket_replies_body_check" CHECK (length(btrim("body")) > 0)
);

CREATE INDEX "support_ticket_replies_ticket_id_created_at_idx"
  ON "support_ticket_replies"("ticket_id", "created_at");

ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL: the reply must survive its author's account being deleted.
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_author_profile_id_fkey"
  FOREIGN KEY ("author_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_ticket_replies" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.support_ticket_replies FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

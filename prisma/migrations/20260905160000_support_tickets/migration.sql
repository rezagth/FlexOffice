-- "Nous contacter" — reachable without an account (user_id nullable), so a
-- visitor blocked before signing up still has a channel. RLS + revoked
-- anon/authenticated grants in this same migration, same as every other new
-- table (officeflex-security-guardrails §3): the public route that inserts
-- here goes through Prisma with the app's own role, not through PostgREST.

CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.support_tickets FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

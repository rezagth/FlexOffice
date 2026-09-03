-- KPI instrumentation: anonymous search events, used only to compute the
-- recherche → réservation conversion rate. No user_id, no IP — nothing here
-- identifies a visitor. RLS + revoke in this same migration, same as every
-- other new table (officeflex-security-guardrails §3).

CREATE TABLE "search_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" TEXT,
    "has_geo" BOOLEAN NOT NULL DEFAULT false,
    "results_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "search_events_created_at_idx" ON "search_events"("created_at");

ALTER TABLE "search_events" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.search_events FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

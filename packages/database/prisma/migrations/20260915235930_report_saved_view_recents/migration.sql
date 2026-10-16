ALTER TABLE "report_saved_views"
  ADD COLUMN IF NOT EXISTS "last_opened_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "report_saved_views_owner_last_opened_idx"
  ON "report_saved_views" ("tenant_id", "company_id", "owner_id", "last_opened_at" DESC);
